/**
 * API Client with Automatic Failover
 * 
 * Handles seamless switching between:
 * - GREEN mode: Cloud API (primary)
 * - YELLOW mode: Service Host API (offline fallback)
 * - ORANGE mode: Local agents only
 * - RED mode: Browser IndexedDB only
 * 
 * The client automatically detects connectivity and routes requests appropriately.
 */

// Cross-browser compatible timeout signal
function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';

interface ApiClientConfig {
  cloudUrl: string;
  serviceHostUrl: string;
  localPrintAgentUrl: string;
  localPaymentAppUrl: string;
}

interface ModeStatus {
  mode: ConnectionMode;
  cloudReachable: boolean;
  serviceHostReachable: boolean;
  printAgentAvailable: boolean;
  paymentAppAvailable: boolean;
  lastChecked: Date;
}

class ApiClient {
  private config: ApiClientConfig;
  private currentMode: ConnectionMode = 'green';
  private modeListeners: ((mode: ConnectionMode) => void)[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastStatus: ModeStatus | null = null;
  
  constructor() {
    // Default configuration
    this.config = {
      cloudUrl: '', // Current origin for cloud
      serviceHostUrl: localStorage.getItem('serviceHostUrl') || 'http://service-host.local:3001',
      localPrintAgentUrl: 'http://localhost:3003',
      localPaymentAppUrl: 'http://localhost:3004',
    };
    
    // Start health checks
    this.startHealthChecks();
  }
  
  // Configure the client
  configure(config: Partial<ApiClientConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.serviceHostUrl) {
      localStorage.setItem('serviceHostUrl', config.serviceHostUrl);
    }
  }
  
  // Get current mode
  getMode(): ConnectionMode {
    return this.currentMode;
  }
  
  // Get detailed status
  getStatus(): ModeStatus | null {
    return this.lastStatus;
  }
  
  // Subscribe to mode changes
  onModeChange(callback: (mode: ConnectionMode) => void): () => void {
    this.modeListeners.push(callback);
    return () => {
      this.modeListeners = this.modeListeners.filter(cb => cb !== callback);
    };
  }
  
  // Main request method with automatic failover
  async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = this.getBaseUrl();
    
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: createTimeoutSignal(10000), // 10 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      return this.handleFailure<T>(endpoint, options, error as Error);
    }
  }
  
  // GET request
  async get<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }
  
  // POST request
  async post<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  // PUT request
  async put<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  
  // PATCH request
  async patch<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  
  // DELETE request
  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
  
  // Print request with failover to local agent
  async print(params: PrintParams): Promise<PrintResult> {
    // Try Service Host first (if in GREEN or YELLOW mode)
    if (this.currentMode === 'green' || this.currentMode === 'yellow') {
      try {
        return await this.request('/api/print/jobs', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      } catch (error) {
        console.warn('Service Host print failed, trying local agent');
      }
    }
    
    // Try local Print Agent (ORANGE mode or fallback)
    try {
      const response = await fetch(`${this.config.localPrintAgentUrl}/api/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: createTimeoutSignal(5000),
      });
      
      if (!response.ok) {
        throw new Error('Local print agent failed');
      }
      
      return response.json();
    } catch (error) {
      throw new Error('Printing unavailable - no print service reachable');
    }
  }
  
  // Payment request with failover to local app
  async authorizePayment(params: PaymentParams): Promise<PaymentResult> {
    // Try Service Host first
    if (this.currentMode === 'green' || this.currentMode === 'yellow') {
      try {
        return await this.request('/api/payment/authorize', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      } catch (error) {
        console.warn('Service Host payment failed, trying local app');
      }
    }
    
    // Try local Payment App (ORANGE mode or fallback)
    if (this.lastStatus?.paymentAppAvailable) {
      try {
        const response = await fetch(`${this.config.localPaymentAppUrl}/api/payment/authorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: createTimeoutSignal(30000), // 30 second timeout for payments
        });
        
        if (!response.ok) {
          throw new Error('Local payment app failed');
        }
        
        return response.json();
      } catch (error) {
        throw new Error('Payment processing unavailable');
      }
    }
    
    throw new Error('No payment service available - cash only');
  }
  
  // Get base URL based on current mode
  private getBaseUrl(): string {
    switch (this.currentMode) {
      case 'green':
        return this.config.cloudUrl || '';
      case 'yellow':
      case 'orange':
        return this.config.serviceHostUrl;
      case 'red':
        // In RED mode, we'll queue operations - return empty to signal offline
        return '';
    }
  }
  
  // Queue operation for later sync (RED mode)
  async queueForSync(endpoint: string, method: string, body?: any): Promise<string> {
    const { offlineQueue } = await import('./offline-queue');
    return offlineQueue.enqueue(endpoint, method, body);
  }
  
  // Process queued operations when connectivity returns
  async syncQueuedOperations(): Promise<{ processed: number; failed: number }> {
    if (this.currentMode === 'red') {
      return { processed: 0, failed: 0 };
    }
    
    const { offlineQueue } = await import('./offline-queue');
    return offlineQueue.processQueue(async (op) => {
      try {
        const response = await fetch(`${this.getBaseUrl()}${op.endpoint}`, {
          method: op.method,
          headers: { 'Content-Type': 'application/json' },
          body: op.body ? JSON.stringify(op.body) : undefined,
          signal: createTimeoutSignal(10000),
        });
        return response.ok;
      } catch {
        return false;
      }
    });
  }
  
  // Get count of pending offline operations
  async getPendingOperationsCount(): Promise<number> {
    const { offlineQueue } = await import('./offline-queue');
    return offlineQueue.getPendingCount();
  }
  
  // Handle request failure with mode switching
  private async handleFailure<T>(endpoint: string, options: RequestInit, error: Error): Promise<T> {
    console.warn(`Request failed in ${this.currentMode} mode:`, error.message);
    
    if (this.currentMode === 'green') {
      // Try Service Host
      const oldMode = this.currentMode;
      this.setMode('yellow');
      
      try {
        const response = await fetch(`${this.config.serviceHostUrl}${endpoint}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          signal: createTimeoutSignal(10000),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        return response.json();
      } catch (e) {
        // Service Host also failed
        this.setMode('orange');
        throw new Error('Both cloud and Service Host unavailable');
      }
    } else if (this.currentMode === 'yellow') {
      // Service Host failed, try to go back to cloud
      try {
        const cloudCheck = await fetch(`${this.config.cloudUrl}/health`, {
          signal: createTimeoutSignal(3000),
        });
        if (cloudCheck.ok) {
          this.setMode('green');
          return this.request<T>(endpoint, options);
        }
      } catch {
        // Cloud still down
      }
      
      this.setMode('orange');
      throw error;
    }
    
    throw error;
  }
  
  // Set mode and notify listeners
  private setMode(mode: ConnectionMode): void {
    if (mode !== this.currentMode) {
      console.log(`Connection mode changed: ${this.currentMode} → ${mode}`);
      this.currentMode = mode;
      this.modeListeners.forEach(cb => cb(mode));
    }
  }
  
  // Start periodic health checks
  private startHealthChecks(): void {
    this.checkHealth();
    this.healthCheckInterval = setInterval(() => this.checkHealth(), 30000); // Every 30 seconds
  }
  
  // Stop health checks
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
  
  // Check connectivity to all services
  private async checkHealth(): Promise<void> {
    const status: ModeStatus = {
      mode: this.currentMode,
      cloudReachable: false,
      serviceHostReachable: false,
      printAgentAvailable: false,
      paymentAppAvailable: false,
      lastChecked: new Date(),
    };
    
    // Check cloud
    try {
      const cloudUrl = this.config.cloudUrl || window.location.origin;
      const response = await fetch(`${cloudUrl}/health`, {
        signal: createTimeoutSignal(3000),
      });
      status.cloudReachable = response.ok;
    } catch {
      status.cloudReachable = false;
    }
    
    // Check Service Host
    try {
      const response = await fetch(`${this.config.serviceHostUrl}/health`, {
        signal: createTimeoutSignal(3000),
      });
      status.serviceHostReachable = response.ok;
    } catch {
      status.serviceHostReachable = false;
    }
    
    // Check Print Agent
    try {
      const response = await fetch(`${this.config.localPrintAgentUrl}/health`, {
        signal: createTimeoutSignal(1000),
      });
      status.printAgentAvailable = response.ok;
    } catch {
      status.printAgentAvailable = false;
    }
    
    // Check Payment App
    try {
      const response = await fetch(`${this.config.localPaymentAppUrl}/health`, {
        signal: createTimeoutSignal(1000),
      });
      status.paymentAppAvailable = response.ok;
    } catch {
      status.paymentAppAvailable = false;
    }
    
    // Determine mode
    let newMode: ConnectionMode;
    if (status.cloudReachable) {
      newMode = 'green';
    } else if (status.serviceHostReachable) {
      newMode = 'yellow';
    } else if (status.printAgentAvailable || status.paymentAppAvailable) {
      newMode = 'orange';
    } else {
      newMode = 'red';
    }
    
    status.mode = newMode;
    this.lastStatus = status;
    this.setMode(newMode);
  }
  
  // Force a health check
  async forceHealthCheck(): Promise<ModeStatus> {
    await this.checkHealth();
    return this.lastStatus!;
  }
}

// Types
interface PrintParams {
  printerId: string;
  printerIp?: string;
  printerPort?: number;
  jobType: 'receipt' | 'kitchen' | 'report';
  content: any;
}

interface PrintResult {
  id: string;
  status: string;
  error?: string;
}

interface PaymentParams {
  checkId: string;
  amount: number;
  tip?: number;
  tenderId?: string;
  tenderType?: 'credit' | 'debit';
}

interface PaymentResult {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  cardLast4?: string;
  error?: string;
}

// Singleton instance
export const apiClient = new ApiClient();

// React hook for connection mode
export function useConnectionMode(): { 
  mode: ConnectionMode; 
  status: ModeStatus | null;
  forceCheck: () => Promise<ModeStatus>;
} {
  const [mode, setMode] = useState<ConnectionMode>(apiClient.getMode());
  const [status, setStatus] = useState<ModeStatus | null>(apiClient.getStatus());
  
  useEffect(() => {
    const unsubscribe = apiClient.onModeChange((newMode) => {
      setMode(newMode);
      setStatus(apiClient.getStatus());
    });
    
    return unsubscribe;
  }, []);
  
  const forceCheck = async () => {
    const newStatus = await apiClient.forceHealthCheck();
    setStatus(newStatus);
    setMode(newStatus.mode);
    return newStatus;
  };
  
  return { mode, status, forceCheck };
}

// Need to import for the hook
import { useState, useEffect } from 'react';
