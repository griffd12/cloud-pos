/**
 * Offline Sync Service for Cloud POS
 * 
 * Coordinates between IndexedDB storage and cloud/service-host endpoints.
 * Handles:
 * - Configuration pre-caching for offline operation
 * - Sync queue processing when connectivity restored
 * - Connection mode detection and switching
 * - Automatic retry with exponential backoff
 */

import { offlineStorage, type SyncQueueItem, type OfflineCheck } from './offline-storage';
import { queryClient } from './queryClient';

type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';

interface SyncStatus {
  mode: ConnectionMode;
  cloudConnected: boolean;
  serviceHostConnected: boolean;
  pendingSyncItems: number;
  pendingPrintJobs: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface SyncConfig {
  cloudUrl: string;
  serviceHostUrl?: string;
  rvcId: string;
  propertyId: string;
  workstationId: string;
}

class OfflineSyncService {
  private config: SyncConfig | null = null;
  private status: SyncStatus = {
    mode: 'green',
    cloudConnected: true,
    serviceHostConnected: false,
    pendingSyncItems: 0,
    pendingPrintJobs: 0,
    lastSyncAt: null,
    lastError: null,
  };
  
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessingQueue = false;
  private listeners: ((status: SyncStatus) => void)[] = [];

  async initialize(config: SyncConfig): Promise<void> {
    this.config = config;
    
    // Initialize IndexedDB
    await offlineStorage.initialize();
    
    // Load cached status
    const cachedMode = await offlineStorage.getSession<ConnectionMode>('connectionMode');
    if (cachedMode) {
      this.status.mode = cachedMode;
    }
    
    // Update pending counts
    this.status.pendingSyncItems = await offlineStorage.getSyncQueueCount();
    const printJobs = await offlineStorage.getPendingPrintJobs();
    this.status.pendingPrintJobs = printJobs.length;
    
    // Start health check
    this.startHealthCheck();
    
    // Start sync processor
    this.startSyncProcessor();
    
    console.log('[OfflineSync] Initialized with mode:', this.status.mode);
  }

  // ============================================================================
  // CONFIGURATION CACHING
  // ============================================================================

  async cacheConfigurationForOffline(): Promise<void> {
    if (!this.config) {
      throw new Error('Sync service not initialized');
    }

    const { rvcId, propertyId } = this.config;
    const cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

    try {
      console.log('[OfflineSync] Caching configuration for offline use...');

      // Fetch and cache essential data in parallel
      const cacheOperations = [
        this.fetchAndCache(`/api/rvcs/${rvcId}/menu-items`, `menuItems_${rvcId}`, cacheTTL),
        this.fetchAndCache(`/api/rvcs/${rvcId}/slus`, `slus_${rvcId}`, cacheTTL),
        this.fetchAndCache(`/api/rvcs/${rvcId}/modifier-groups`, `modifierGroups_${rvcId}`, cacheTTL),
        this.fetchAndCache(`/api/properties/${propertyId}/employees`, `employees_${propertyId}`, cacheTTL),
        this.fetchAndCache(`/api/properties/${propertyId}/roles`, `roles_${propertyId}`, cacheTTL),
        this.fetchAndCache(`/api/tax-groups`, `taxGroups`, cacheTTL),
        this.fetchAndCache(`/api/tenders`, `tenders`, cacheTTL),
        this.fetchAndCache(`/api/discounts`, `discounts`, cacheTTL),
        this.fetchAndCache(`/api/service-charges`, `serviceCharges`, cacheTTL),
        this.fetchAndCache(`/api/rvcs/${rvcId}/pos-layout`, `posLayout_${rvcId}`, cacheTTL),
      ];

      await Promise.allSettled(cacheOperations);
      
      await offlineStorage.setSession('lastConfigCache', new Date().toISOString());
      console.log('[OfflineSync] Configuration cached successfully');
    } catch (error) {
      console.error('[OfflineSync] Failed to cache configuration:', error);
    }
  }

  private async fetchAndCache(url: string, cacheKey: string, ttlMs: number): Promise<void> {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        await offlineStorage.cacheConfig(cacheKey, data, ttlMs);
      }
    } catch (error) {
      console.warn(`[OfflineSync] Failed to cache ${cacheKey}:`, error);
    }
  }

  async getCachedConfig<T>(key: string): Promise<T | null> {
    return offlineStorage.getConfig<T>(key);
  }

  // ============================================================================
  // CHECK OPERATIONS (OFFLINE MODE)
  // ============================================================================

  async createOfflineCheck(data: {
    rvcId: string;
    employeeId: string;
    orderType: string;
    tableNumber?: string;
  }): Promise<OfflineCheck> {
    const checkNumber = await this.generateOfflineCheckNumber(data.rvcId);
    
    const check: OfflineCheck = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      checkNumber,
      rvcId: data.rvcId,
      employeeId: data.employeeId,
      status: 'open',
      items: [],
      payments: [],
      subtotal: '0.00',
      taxTotal: '0.00',
      total: '0.00',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncedToCloud: false,
    };

    await offlineStorage.saveCheck(check);
    
    // Queue for sync
    await offlineStorage.addToSyncQueue({
      type: 'check',
      data: { action: 'create', check },
    });
    
    this.status.pendingSyncItems++;
    this.notifyListeners();
    
    return check;
  }

  async addItemToOfflineCheck(
    checkId: string,
    item: {
      menuItemId: string;
      menuItemName: string;
      unitPrice: string;
      quantity: number;
      modifiers?: any[];
      taxAmount: string;
      taxableAmount: string;
    }
  ): Promise<OfflineCheck> {
    const check = await offlineStorage.getCheck(checkId);
    if (!check) {
      throw new Error('Check not found');
    }

    const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newItem = {
      id: itemId,
      ...item,
      createdAt: new Date().toISOString(),
    };

    check.items.push(newItem);
    check.updatedAt = new Date().toISOString();
    
    // Recalculate totals
    this.recalculateCheckTotals(check);
    
    await offlineStorage.saveCheck(check);
    
    // Queue for sync
    await offlineStorage.addToSyncQueue({
      type: 'check',
      data: { action: 'add_item', checkId, item: newItem },
    });
    
    this.status.pendingSyncItems++;
    this.notifyListeners();
    
    return check;
  }

  async addPaymentToOfflineCheck(
    checkId: string,
    payment: {
      tenderId: string;
      tenderName: string;
      amount: string;
    }
  ): Promise<OfflineCheck> {
    const check = await offlineStorage.getCheck(checkId);
    if (!check) {
      throw new Error('Check not found');
    }

    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPayment = {
      id: paymentId,
      ...payment,
      createdAt: new Date().toISOString(),
    };

    check.payments.push(newPayment);
    check.updatedAt = new Date().toISOString();
    
    // Check if fully paid
    const totalPaid = check.payments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0
    );
    if (totalPaid >= parseFloat(check.total)) {
      check.status = 'closed';
    }
    
    await offlineStorage.saveCheck(check);
    
    // Queue for sync
    await offlineStorage.addToSyncQueue({
      type: 'payment',
      data: { checkId, payment: newPayment },
    });
    
    this.status.pendingSyncItems++;
    this.notifyListeners();
    
    return check;
  }

  async getOpenOfflineChecks(rvcId: string): Promise<OfflineCheck[]> {
    return offlineStorage.getOpenChecks(rvcId);
  }

  async getOfflineCheck(id: string): Promise<OfflineCheck | null> {
    return offlineStorage.getCheck(id);
  }

  private recalculateCheckTotals(check: OfflineCheck): void {
    let subtotal = 0;
    let taxTotal = 0;

    for (const item of check.items) {
      const itemTotal = parseFloat(item.unitPrice) * (item.quantity || 1);
      subtotal += itemTotal;
      taxTotal += parseFloat(item.taxAmount || '0');
    }

    check.subtotal = subtotal.toFixed(2);
    check.taxTotal = taxTotal.toFixed(2);
    check.total = (subtotal + taxTotal).toFixed(2);
  }

  private async generateOfflineCheckNumber(rvcId: string): Promise<number> {
    const key = `checkNumber_${rvcId}`;
    let lastNumber = await offlineStorage.getSession<number>(key) || 90000;
    lastNumber++;
    await offlineStorage.setSession(key, lastNumber);
    return lastNumber;
  }

  // ============================================================================
  // SYNC QUEUE PROCESSING
  // ============================================================================

  private startSyncProcessor(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.processSyncQueue();
    }, 30000); // Every 30 seconds
  }

  async processSyncQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    
    // Don't process in ORANGE/RED modes - no endpoint available
    // Queue items will be preserved and synced when connectivity returns
    if (this.status.mode === 'orange' || this.status.mode === 'red') {
      return;
    }
    
    this.isProcessingQueue = true;

    try {
      const queue = await offlineStorage.getSyncQueue();
      let successCount = 0;
      
      for (const item of queue) {
        // Skip items that have failed too many times in THIS session
        // (retry counter resets when mode changes back to green/yellow)
        if (item.attempts >= 5) {
          console.warn('[OfflineSync] Max retries reached for:', item.id);
          continue;
        }

        try {
          await this.processSyncItem(item);
          await offlineStorage.removeSyncQueueItem(item.id);
          successCount++;
        } catch (error) {
          await offlineStorage.updateSyncQueueItem(item.id, {
            attempts: item.attempts + 1,
            lastAttempt: new Date().toISOString(),
            error: (error as Error).message,
          });
        }
      }

      if (successCount > 0) {
        this.status.lastSyncAt = new Date().toISOString();
        console.log(`[OfflineSync] Synced ${successCount} items`);
      }
    } catch (error) {
      console.error('[OfflineSync] Queue processing error:', error);
    } finally {
      this.isProcessingQueue = false;
      // Recompute count from storage to ensure accuracy
      this.status.pendingSyncItems = await offlineStorage.getSyncQueueCount();
      this.notifyListeners();
    }
  }

  /**
   * Reset retry counters for all queued items.
   * Called when connectivity is restored to give items another chance.
   */
  private async resetRetryCounters(): Promise<void> {
    const queue = await offlineStorage.getSyncQueue();
    for (const item of queue) {
      if (item.attempts > 0) {
        await offlineStorage.updateSyncQueueItem(item.id, {
          attempts: 0,
          error: undefined,
        });
      }
    }
  }

  private async processSyncItem(item: SyncQueueItem): Promise<void> {
    const baseUrl = this.getActiveEndpoint();
    if (!baseUrl) {
      throw new Error('No active endpoint available');
    }

    switch (item.type) {
      case 'check':
        await this.syncCheck(baseUrl, item.data);
        break;
      case 'payment':
        await this.syncPayment(baseUrl, item.data);
        break;
      case 'time_punch':
        await this.syncTimePunch(baseUrl, item.data);
        break;
      case 'cash_transaction':
        await this.syncCashTransaction(baseUrl, item.data);
        break;
    }
  }

  private async syncCheck(baseUrl: string, data: any): Promise<void> {
    const response = await fetch(`${baseUrl}/api/sync/offline-checks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    // If cloud returned a real check ID, update local
    const result = await response.json();
    if (result.cloudCheckId && data.check?.id) {
      await offlineStorage.markCheckSynced(data.check.id);
    }
  }

  private async syncPayment(baseUrl: string, data: any): Promise<void> {
    const response = await fetch(`${baseUrl}/api/sync/offline-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Payment sync failed: ${response.status}`);
    }
  }

  private async syncTimePunch(baseUrl: string, data: any): Promise<void> {
    const response = await fetch(`${baseUrl}/api/sync/time-punches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Time punch sync failed: ${response.status}`);
    }
  }

  private async syncCashTransaction(baseUrl: string, data: any): Promise<void> {
    const response = await fetch(`${baseUrl}/api/sync/cash-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Cash transaction sync failed: ${response.status}`);
    }
  }

  private getActiveEndpoint(): string | null {
    if (!this.config) return null;

    switch (this.status.mode) {
      case 'green':
        return this.config.cloudUrl;
      case 'yellow':
        return this.config.serviceHostUrl || this.config.cloudUrl;
      case 'orange':
        return null; // Browser only
      case 'red':
        return null;
      default:
        return this.config.cloudUrl;
    }
  }

  // ============================================================================
  // HEALTH CHECK / MODE DETECTION
  // ============================================================================

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check immediately
    this.checkConnectivity();

    this.healthCheckInterval = setInterval(() => {
      this.checkConnectivity();
    }, 15000); // Every 15 seconds
  }

  async checkConnectivity(): Promise<ConnectionMode> {
    if (!this.config) {
      return 'red';
    }

    const cloudOk = await this.pingEndpoint(this.config.cloudUrl);
    const serviceHostOk = this.config.serviceHostUrl 
      ? await this.pingEndpoint(this.config.serviceHostUrl)
      : false;

    this.status.cloudConnected = cloudOk;
    this.status.serviceHostConnected = serviceHostOk;

    let newMode: ConnectionMode;
    if (cloudOk) {
      newMode = 'green';
    } else if (serviceHostOk) {
      newMode = 'yellow';
    } else if (await offlineStorage.isAvailable()) {
      newMode = 'orange';
    } else {
      newMode = 'red';
    }

    if (newMode !== this.status.mode) {
      const previousMode = this.status.mode;
      console.log(`[OfflineSync] Mode changed: ${previousMode} -> ${newMode}`);
      this.status.mode = newMode;
      await offlineStorage.setSession('connectionMode', newMode);
      
      // If transitioning from offline to online, reset retry counters and trigger sync
      const wasOffline = previousMode === 'orange' || previousMode === 'red';
      const isNowOnline = newMode === 'green' || newMode === 'yellow';
      
      if (wasOffline && isNowOnline) {
        console.log('[OfflineSync] Connectivity restored - resetting retry counters');
        await this.resetRetryCounters();
        this.processSyncQueue();
      } else if (isNowOnline) {
        this.processSyncQueue();
      }
    }

    this.notifyListeners();
    return newMode;
  }

  private async pingEndpoint(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${url}/api/health`, {
        method: 'GET',
        signal: controller.signal,
        credentials: 'include',
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // STATUS & LISTENERS
  // ============================================================================

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  getMode(): ConnectionMode {
    return this.status.mode;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener({ ...this.status });
    }
  }

  async forceSync(): Promise<void> {
    await this.checkConnectivity();
    await this.processSyncQueue();
    
    // Invalidate React Query cache to refetch
    queryClient.invalidateQueries();
  }

  dispose(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.listeners = [];
  }
}

export const offlineSyncService = new OfflineSyncService();
export type { ConnectionMode, SyncStatus, SyncConfig };
