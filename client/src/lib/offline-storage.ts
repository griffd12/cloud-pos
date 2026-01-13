/**
 * IndexedDB-based Offline Storage for Cloud POS
 * 
 * Provides client-side data persistence for ORANGE and RED connection modes
 * when the Service Host is unavailable. Enables:
 * - Configuration caching (menu items, employees, tax groups)
 * - Offline transaction queue
 * - Pending sync tracking
 * 
 * Storage Hierarchy:
 * - GREEN: Cloud is primary, Service Host optional
 * - YELLOW: Service Host is primary, Cloud backup
 * - ORANGE: Browser IndexedDB with local printing
 * - RED: Browser IndexedDB, all printing queued
 */

const DB_NAME = 'CloudPOS_OfflineDB';
const DB_VERSION = 1;

interface SyncQueueItem {
  id: string;
  type: 'check' | 'payment' | 'time_punch' | 'cash_transaction';
  data: any;
  createdAt: string;
  attempts: number;
  lastAttempt?: string;
  error?: string;
}

interface CachedConfig {
  key: string;
  data: any;
  cachedAt: string;
  expiresAt?: string;
}

interface OfflineCheck {
  id: string;
  checkNumber: number;
  rvcId: string;
  employeeId: string;
  status: 'open' | 'closed';
  items: any[];
  payments: any[];
  subtotal: string;
  taxTotal: string;
  total: string;
  createdAt: string;
  updatedAt: string;
  syncedToCloud: boolean;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('IndexedDB initialized for offline storage');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Configuration cache store
        if (!db.objectStoreNames.contains('config')) {
          const configStore = db.createObjectStore('config', { keyPath: 'key' });
          configStore.createIndex('cachedAt', 'cachedAt');
        }

        // Offline checks store
        if (!db.objectStoreNames.contains('checks')) {
          const checkStore = db.createObjectStore('checks', { keyPath: 'id' });
          checkStore.createIndex('rvcId', 'rvcId');
          checkStore.createIndex('status', 'status');
          checkStore.createIndex('syncedToCloud', 'syncedToCloud');
        }

        // Sync queue for pending uploads
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('type', 'type');
          syncStore.createIndex('createdAt', 'createdAt');
        }

        // Print queue for offline printing
        if (!db.objectStoreNames.contains('printQueue')) {
          const printStore = db.createObjectStore('printQueue', { keyPath: 'id' });
          printStore.createIndex('createdAt', 'createdAt');
          printStore.createIndex('status', 'status');
        }

        // Session data (current employee, workstation)
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'key' });
        }

        console.log('IndexedDB schema created/upgraded');
      };
    });

    return this.initPromise;
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // ============================================================================
  // CONFIGURATION CACHE
  // ============================================================================

  async cacheConfig(key: string, data: any, ttlMs?: number): Promise<void> {
    await this.initialize();
    
    const item: CachedConfig = {
      key,
      data,
      cachedAt: new Date().toISOString(),
      expiresAt: ttlMs ? new Date(Date.now() + ttlMs).toISOString() : undefined,
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore('config', 'readwrite');
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getConfig<T>(key: string): Promise<T | null> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('config');
      const request = store.get(key);
      
      request.onsuccess = () => {
        const item = request.result as CachedConfig | undefined;
        if (!item) {
          resolve(null);
          return;
        }

        // Check expiration
        if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
          this.deleteConfig(key);
          resolve(null);
          return;
        }

        resolve(item.data as T);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteConfig(key: string): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('config', 'readwrite');
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearExpiredConfig(): Promise<number> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const store = this.getStore('config', 'readwrite');
      const request = store.openCursor();
      let deleted = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const item = cursor.value as CachedConfig;
          if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        } else {
          resolve(deleted);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // OFFLINE CHECKS
  // ============================================================================

  async saveCheck(check: OfflineCheck): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('checks', 'readwrite');
      const request = store.put(check);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCheck(id: string): Promise<OfflineCheck | null> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('checks');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getOpenChecks(rvcId: string): Promise<OfflineCheck[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('checks');
      const index = store.index('rvcId');
      const request = index.getAll(rvcId);

      request.onsuccess = () => {
        const checks = request.result as OfflineCheck[];
        resolve(checks.filter(c => c.status === 'open'));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedChecks(): Promise<OfflineCheck[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('checks');
      const index = store.index('syncedToCloud');
      const request = index.getAll(IDBKeyRange.only(false));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async markCheckSynced(id: string): Promise<void> {
    const check = await this.getCheck(id);
    if (check) {
      check.syncedToCloud = true;
      await this.saveCheck(check);
    }
  }

  async deleteCheck(id: string): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('checks', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // SYNC QUEUE
  // ============================================================================

  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
    await this.initialize();

    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueItem: SyncQueueItem = {
      ...item,
      id,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue', 'readwrite');
      const request = store.put(queueItem);
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue');
      const index = store.index('createdAt');
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async updateSyncQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue', 'readwrite');
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        if (!getRequest.result) {
          resolve();
          return;
        }
        
        const item = { ...getRequest.result, ...updates };
        const putRequest = store.put(item);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async removeSyncQueueItem(id: string): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueueCount(): Promise<number> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue');
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // PRINT QUEUE
  // ============================================================================

  async addPrintJob(job: { type: string; data: any; printer?: string }): Promise<string> {
    await this.initialize();

    const id = `print_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const printJob = {
      id,
      ...job,
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore('printQueue', 'readwrite');
      const request = store.put(printJob);
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingPrintJobs(): Promise<any[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('printQueue');
      const index = store.index('status');
      const request = index.getAll(IDBKeyRange.only('pending'));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async updatePrintJob(id: string, updates: Partial<any>): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('printQueue', 'readwrite');
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        if (!getRequest.result) {
          resolve();
          return;
        }
        
        const job = { ...getRequest.result, ...updates };
        const putRequest = store.put(job);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async removePrintJob(id: string): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('printQueue', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // SESSION DATA
  // ============================================================================

  async setSession(key: string, value: any): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('session', 'readwrite');
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSession<T>(key: string): Promise<T | null> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('session');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }

  async clearSession(): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const store = this.getStore('session', 'readwrite');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async getStorageStats(): Promise<{
    configCount: number;
    checksCount: number;
    syncQueueCount: number;
    printQueueCount: number;
  }> {
    await this.initialize();

    const counts = await Promise.all([
      this.getStoreCount('config'),
      this.getStoreCount('checks'),
      this.getStoreCount('syncQueue'),
      this.getStoreCount('printQueue'),
    ]);

    return {
      configCount: counts[0],
      checksCount: counts[1],
      syncQueueCount: counts[2],
      printQueueCount: counts[3],
    };
  }

  private async getStoreCount(storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllData(): Promise<void> {
    await this.initialize();

    const stores = ['config', 'checks', 'syncQueue', 'printQueue', 'session'];
    
    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const store = this.getStore(storeName, 'readwrite');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch {
      return false;
    }
  }
}

export const offlineStorage = new OfflineStorage();
export type { SyncQueueItem, CachedConfig, OfflineCheck };
