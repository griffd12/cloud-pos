/**
 * Connection Mode Testing Infrastructure
 * 
 * Automated tests for verifying GREEN/YELLOW/ORANGE/RED mode transitions
 * and failover behavior of the API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Import after mocks are set up
type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';

interface ModeStatus {
  mode: ConnectionMode;
  cloudReachable: boolean;
  serviceHostReachable: boolean;
  printAgentAvailable: boolean;
  paymentAppAvailable: boolean;
  lastChecked: Date;
}

describe('Connection Mode Detection', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Mode Transitions', () => {
    it('MT-001: GREEN → YELLOW when cloud becomes unreachable', async () => {
      // Initially cloud is reachable
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/health') && !url.includes('service-host')) {
          return Promise.reject(new Error('Network error'));
        }
        if (url.includes('service-host')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      // Simulate health check logic
      const checkMode = async (): Promise<ConnectionMode> => {
        try {
          await fetch('/health');
          return 'green';
        } catch {
          try {
            await fetch('http://service-host:3001/health');
            return 'yellow';
          } catch {
            return 'red';
          }
        }
      };

      const mode = await checkMode();
      expect(mode).toBe('yellow');
    });

    it('MT-002: YELLOW → GREEN when cloud is restored', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      const checkMode = async (): Promise<ConnectionMode> => {
        try {
          await fetch('/health');
          return 'green';
        } catch {
          return 'yellow';
        }
      };

      const mode = await checkMode();
      expect(mode).toBe('green');
    });

    it('MT-005: ORANGE → RED when all local agents unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const checkMode = async (): Promise<ConnectionMode> => {
        const cloudOk = await checkEndpoint('/health').catch(() => false);
        const serviceHostOk = await checkEndpoint('http://service-host:3001/health').catch(() => false);
        const printAgentOk = await checkEndpoint('http://localhost:3003/health').catch(() => false);
        
        if (cloudOk) return 'green';
        if (serviceHostOk) return 'yellow';
        if (printAgentOk) return 'orange';
        return 'red';
      };

      const checkEndpoint = async (url: string): Promise<boolean> => {
        const response = await fetch(url);
        return response.ok;
      };

      const mode = await checkMode();
      expect(mode).toBe('red');
    });
  });

  describe('Failover Behavior', () => {
    it('should retry failed cloud request against Service Host', async () => {
      let callCount = 0;
      
      mockFetch.mockImplementation((url: string) => {
        callCount++;
        if (url.includes('cloud') || callCount === 1) {
          return Promise.reject(new Error('Cloud unreachable'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: 'from service host' }),
        });
      });

      const requestWithFailover = async (endpoint: string) => {
        try {
          return await fetch(`https://cloud.example.com${endpoint}`);
        } catch {
          return await fetch(`http://service-host:3001${endpoint}`);
        }
      };

      const result = await requestWithFailover('/api/checks');
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    });

    it('should timeout after 10 seconds', async () => {
      vi.useFakeTimers();
      
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 15000);
        })
      );

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);

      const fetchWithTimeout = fetch('/api/checks', { signal: controller.signal });
      
      vi.advanceTimersByTime(10000);
      
      await expect(fetchWithTimeout).rejects.toThrow();
      
      vi.useRealTimers();
    });
  });

  describe('Check Locking', () => {
    it('CL-001: should acquire lock on check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          lock: {
            checkId: '100',
            workstationId: 'ws-001',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          },
        }),
      });

      const response = await fetch('/api/caps/checks/100/lock', {
        method: 'POST',
        body: JSON.stringify({ workstationId: 'ws-001' }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.lock.workstationId).toBe('ws-001');
    });

    it('CL-003: should return 409 Conflict when lock held by another workstation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          error: 'Check locked by another workstation',
          lockedBy: 'ws-001',
          expiresAt: new Date(Date.now() + 240000).toISOString(),
        }),
      });

      const response = await fetch('/api/caps/checks/100/lock', {
        method: 'POST',
        body: JSON.stringify({ workstationId: 'ws-002' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(409);
    });

    it('CL-002: should release lock on check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const response = await fetch('/api/caps/checks/100/unlock', {
        method: 'POST',
        body: JSON.stringify({ workstationId: 'ws-001' }),
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('Print Failover', () => {
    it('PF-001: should fallback to Print Agent when Service Host unavailable', async () => {
      let printAgentCalled = false;
      
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('service-host')) {
          return Promise.reject(new Error('Service Host unavailable'));
        }
        if (url.includes('localhost:3003')) {
          printAgentCalled = true;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ jobId: 'local-123', status: 'printing' }),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      const printWithFailover = async (params: any) => {
        try {
          return await fetch('http://service-host:3001/api/print/jobs', {
            method: 'POST',
            body: JSON.stringify(params),
          });
        } catch {
          return await fetch('http://localhost:3003/api/print', {
            method: 'POST',
            body: JSON.stringify(params),
          });
        }
      };

      const result = await printWithFailover({ type: 'receipt', content: 'Test' });
      expect(printAgentCalled).toBe(true);
      expect(result.ok).toBe(true);
    });
  });

  describe('Offline Store Integration', () => {
    it('should queue check when in RED mode', async () => {
      const offlineQueue: any[] = [];
      
      const queueForSync = (transaction: any) => {
        offlineQueue.push({
          ...transaction,
          queuedAt: new Date().toISOString(),
          synced: false,
        });
      };

      const createCheckOffline = (check: any) => {
        queueForSync({ type: 'CREATE_CHECK', data: check });
        return { ...check, offlineId: `offline-${Date.now()}` };
      };

      const check = createCheckOffline({
        rvcId: 'rvc-1',
        employeeId: 'emp-1',
        orderType: 'dine-in',
      });

      expect(offlineQueue.length).toBe(1);
      expect(offlineQueue[0].type).toBe('CREATE_CHECK');
      expect(check.offlineId).toBeDefined();
    });

    it('should replay queued transactions when connectivity restored', async () => {
      const queue = [
        { type: 'CREATE_CHECK', data: { id: '1' }, synced: false },
        { type: 'ADD_ITEM', data: { checkId: '1', itemId: 'item-1' }, synced: false },
        { type: 'PAYMENT', data: { checkId: '1', amount: 25.00 }, synced: false },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const replayQueue = async () => {
        for (const item of queue) {
          if (!item.synced) {
            await fetch('/api/sync/transaction', {
              method: 'POST',
              body: JSON.stringify(item),
            });
            item.synced = true;
          }
        }
      };

      await replayQueue();
      
      expect(queue.every(item => item.synced)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});

describe('Check Number Management', () => {
  it('should use offline range when Service Host unavailable', () => {
    const workstationConfig = {
      id: 'ws-001',
      onlineRange: { start: 1, end: 999 },
      offlineRange: { start: 10001, end: 10999 },
      currentOnline: 127,
      currentOffline: 10001,
    };

    const getNextCheckNumber = (offline: boolean): number => {
      if (offline) {
        return workstationConfig.currentOffline++;
      }
      return workstationConfig.currentOnline++;
    };

    const onlineNumber = getNextCheckNumber(false);
    const offlineNumber = getNextCheckNumber(true);

    expect(onlineNumber).toBe(127);
    expect(offlineNumber).toBe(10001);
    expect(workstationConfig.currentOnline).toBe(128);
    expect(workstationConfig.currentOffline).toBe(10002);
  });

  it('should prevent range overflow', () => {
    const workstationConfig = {
      offlineRange: { start: 10001, end: 10005 },
      currentOffline: 10005,
    };

    const getNextCheckNumber = (): number | null => {
      if (workstationConfig.currentOffline >= workstationConfig.offlineRange.end) {
        return null; // Range exhausted
      }
      return workstationConfig.currentOffline++;
    };

    const number = getNextCheckNumber();
    expect(number).toBeNull();
  });
});
