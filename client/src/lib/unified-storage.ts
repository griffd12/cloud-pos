/**
 * Unified Storage Layer for Cloud POS
 * 
 * Auto-detects platform and uses:
 * - SQLite for native Android (via Capacitor)
 * - IndexedDB for web browsers and Electron
 * 
 * This provides a single API for offline storage across all platforms
 * while maintaining full compatibility with the existing IndexedDB system.
 */

import { offlineStorage, type SyncQueueItem, type CachedConfig, type OfflineCheck } from './offline-storage';
import { getNativeStorage, isNativePlatform, getPlatformType, type SQLiteStorageInterface } from './native-storage';

type StorageBackend = 'sqlite' | 'indexeddb';

interface StorageStats {
  backend: StorageBackend;
  platform: 'capacitor' | 'electron' | 'web';
  configCount: number;
  checksCount: number;
  syncQueueCount: number;
  printQueueCount: number;
}

class UnifiedStorage {
  private nativeStorage: SQLiteStorageInterface | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private backend: StorageBackend = 'indexeddb';

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Try native SQLite first on native platforms
      if (isNativePlatform()) {
        this.nativeStorage = await getNativeStorage();
        if (this.nativeStorage) {
          this.backend = 'sqlite';
          console.log('[UnifiedStorage] Using SQLite backend for native platform');
          this.initialized = true;
          return;
        }
      }

      // Fall back to IndexedDB
      await offlineStorage.initialize();
      this.backend = 'indexeddb';
      console.log('[UnifiedStorage] Using IndexedDB backend');
      this.initialized = true;
    } catch (error) {
      console.error('[UnifiedStorage] Initialization failed:', error);
      // Still try IndexedDB as final fallback
      try {
        await offlineStorage.initialize();
        this.backend = 'indexeddb';
        this.initialized = true;
      } catch {
        throw new Error('No storage backend available');
      }
    }
  }

  private get storage() {
    if (this.nativeStorage && this.backend === 'sqlite') {
      return this.nativeStorage;
    }
    return offlineStorage;
  }

  getBackend(): StorageBackend {
    return this.backend;
  }

  // ============================================================================
  // CONFIG CACHE - Delegates to active backend
  // ============================================================================

  async cacheConfig(key: string, data: any, ttlMs?: number): Promise<void> {
    await this.initialize();
    return this.storage.cacheConfig(key, data, ttlMs);
  }

  async getConfig<T>(key: string): Promise<T | null> {
    await this.initialize();
    return this.storage.getConfig<T>(key);
  }

  async deleteConfig(key: string): Promise<void> {
    await this.initialize();
    return this.storage.deleteConfig(key);
  }

  async clearExpiredConfig(): Promise<number> {
    await this.initialize();
    return this.storage.clearExpiredConfig();
  }

  async getAllConfigKeys(): Promise<string[]> {
    await this.initialize();
    return this.storage.getAllConfigKeys();
  }

  // ============================================================================
  // OFFLINE CHECKS
  // ============================================================================

  async saveCheck(check: OfflineCheck): Promise<void> {
    await this.initialize();
    return this.storage.saveCheck(check);
  }

  async getCheck(id: string): Promise<OfflineCheck | null> {
    await this.initialize();
    return this.storage.getCheck(id);
  }

  async getOpenChecks(rvcId: string): Promise<OfflineCheck[]> {
    await this.initialize();
    return this.storage.getOpenChecks(rvcId);
  }

  async getUnsyncedChecks(): Promise<OfflineCheck[]> {
    await this.initialize();
    return this.storage.getUnsyncedChecks();
  }

  async markCheckSynced(id: string): Promise<void> {
    await this.initialize();
    return this.storage.markCheckSynced(id);
  }

  async deleteCheck(id: string): Promise<void> {
    await this.initialize();
    return this.storage.deleteCheck(id);
  }

  // ============================================================================
  // SYNC QUEUE
  // ============================================================================

  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
    await this.initialize();
    return this.storage.addToSyncQueue(item);
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    await this.initialize();
    return this.storage.getSyncQueue();
  }

  async updateSyncQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    await this.initialize();
    return this.storage.updateSyncQueueItem(id, updates);
  }

  async removeSyncQueueItem(id: string): Promise<void> {
    await this.initialize();
    return this.storage.removeSyncQueueItem(id);
  }

  async getSyncQueueCount(): Promise<number> {
    await this.initialize();
    return this.storage.getSyncQueueCount();
  }

  // ============================================================================
  // PRINT QUEUE
  // ============================================================================

  async addPrintJob(job: { type: string; data: any; printer?: string }): Promise<string> {
    await this.initialize();
    return this.storage.addPrintJob(job);
  }

  async getPendingPrintJobs(): Promise<any[]> {
    await this.initialize();
    return this.storage.getPendingPrintJobs();
  }

  async updatePrintJob(id: string, updates: Partial<any>): Promise<void> {
    await this.initialize();
    return this.storage.updatePrintJob(id, updates);
  }

  async removePrintJob(id: string): Promise<void> {
    await this.initialize();
    return this.storage.removePrintJob(id);
  }

  // ============================================================================
  // SESSION DATA
  // ============================================================================

  async setSession(key: string, value: any): Promise<void> {
    await this.initialize();
    return this.storage.setSession(key, value);
  }

  async getSession<T>(key: string): Promise<T | null> {
    await this.initialize();
    return this.storage.getSession<T>(key);
  }

  async clearSession(): Promise<void> {
    await this.initialize();
    return this.storage.clearSession();
  }

  async getAllSessionKeys(): Promise<string[]> {
    await this.initialize();
    return this.storage.getAllSessionKeys();
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async getStorageStats(): Promise<StorageStats> {
    await this.initialize();
    const stats = await this.storage.getStorageStats();
    return {
      ...stats,
      backend: this.backend,
      platform: getPlatformType(),
    };
  }

  async clearAllData(): Promise<void> {
    await this.initialize();
    return this.storage.clearAllData();
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // DATA MIGRATION (IndexedDB <-> SQLite)
  // ============================================================================

  /**
   * Migrate data from IndexedDB to SQLite (for transitioning to native app)
   * This preserves any existing offline data when the user switches platforms
   */
  async migrateFromIndexedDB(): Promise<{ migrated: number; errors: number }> {
    if (this.backend !== 'sqlite' || !this.nativeStorage) {
      return { migrated: 0, errors: 0 };
    }

    let migrated = 0;
    let errors = 0;

    try {
      // Migrate unsynced checks
      const checks = await offlineStorage.getUnsyncedChecks();
      for (const check of checks) {
        try {
          await this.nativeStorage.saveCheck(check);
          migrated++;
        } catch {
          errors++;
        }
      }

      // Migrate sync queue
      const syncQueue = await offlineStorage.getSyncQueue();
      for (const item of syncQueue) {
        try {
          await this.nativeStorage.addToSyncQueue(item);
          migrated++;
        } catch {
          errors++;
        }
      }

      // Migrate print queue
      const printJobs = await offlineStorage.getPendingPrintJobs();
      for (const job of printJobs) {
        try {
          await this.nativeStorage.addPrintJob(job);
          migrated++;
        } catch {
          errors++;
        }
      }

      // Migrate ALL config cache data (menu items, employees, tax groups, etc.)
      const configKeys = await offlineStorage.getAllConfigKeys();
      for (const key of configKeys) {
        try {
          const data = await offlineStorage.getConfig(key);
          if (data !== null) {
            await this.nativeStorage.cacheConfig(key, data);
            migrated++;
          }
        } catch {
          errors++;
        }
      }

      // Migrate ALL session data (employee login state, connection mode, etc.)
      const sessionKeys = await offlineStorage.getAllSessionKeys();
      for (const key of sessionKeys) {
        try {
          const value = await offlineStorage.getSession(key);
          if (value !== null) {
            await this.nativeStorage.setSession(key, value);
            migrated++;
          }
        } catch {
          errors++;
        }
      }

      console.log(`[UnifiedStorage] Migration complete: ${migrated} items migrated, ${errors} errors`);
    } catch (error) {
      console.error('[UnifiedStorage] Migration failed:', error);
    }

    return { migrated, errors };
  }

  /**
   * Export all data for backup purposes
   */
  async exportData(): Promise<{
    checks: OfflineCheck[];
    syncQueue: SyncQueueItem[];
    printJobs: any[];
    exportedAt: string;
    backend: StorageBackend;
  }> {
    await this.initialize();

    const [checks, syncQueue, printJobs] = await Promise.all([
      this.getUnsyncedChecks(),
      this.getSyncQueue(),
      this.getPendingPrintJobs(),
    ]);

    return {
      checks,
      syncQueue,
      printJobs,
      exportedAt: new Date().toISOString(),
      backend: this.backend,
    };
  }

  /**
   * Import data from a backup
   */
  async importData(data: {
    checks?: OfflineCheck[];
    syncQueue?: SyncQueueItem[];
    printJobs?: any[];
  }): Promise<{ imported: number; errors: number }> {
    await this.initialize();

    let imported = 0;
    let errors = 0;

    if (data.checks) {
      for (const check of data.checks) {
        try {
          await this.saveCheck(check);
          imported++;
        } catch {
          errors++;
        }
      }
    }

    if (data.syncQueue) {
      for (const item of data.syncQueue) {
        try {
          await this.addToSyncQueue(item);
          imported++;
        } catch {
          errors++;
        }
      }
    }

    if (data.printJobs) {
      for (const job of data.printJobs) {
        try {
          await this.addPrintJob(job);
          imported++;
        } catch {
          errors++;
        }
      }
    }

    return { imported, errors };
  }
}

// Export singleton
export const unifiedStorage = new UnifiedStorage();
export type { StorageStats, StorageBackend };
