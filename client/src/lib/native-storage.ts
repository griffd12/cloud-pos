/**
 * Native SQLite Storage for Cloud POS
 * 
 * Provides SQLite-backed storage for native Android apps via Capacitor.
 * 
 * Platform Storage Strategy:
 * - Android (Capacitor): SQLite via @capacitor-community/sqlite
 * - Windows (Electron): IndexedDB (reliable cross-platform, no native dependencies)
 * - Web Browsers: IndexedDB (existing behavior preserved)
 * 
 * The unified storage layer auto-selects the appropriate backend.
 */

import { Capacitor } from '@capacitor/core';

// Platform detection
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export function isCapacitor(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getPlatformType(): 'capacitor' | 'electron' | 'web' {
  if (isCapacitor()) return 'capacitor';
  if (isElectron()) return 'electron';
  return 'web';
}

// SQLite interface - matches existing IndexedDB storage methods
interface SQLiteStorageInterface {
  initialize(): Promise<void>;
  isAvailable(): Promise<boolean>;
  
  // Config cache
  cacheConfig(key: string, data: any, ttlMs?: number): Promise<void>;
  getConfig<T>(key: string): Promise<T | null>;
  getAllConfigKeys(): Promise<string[]>;
  deleteConfig(key: string): Promise<void>;
  clearExpiredConfig(): Promise<number>;
  
  // Checks
  saveCheck(check: any): Promise<void>;
  getCheck(id: string): Promise<any | null>;
  getOpenChecks(rvcId: string): Promise<any[]>;
  getUnsyncedChecks(): Promise<any[]>;
  markCheckSynced(id: string): Promise<void>;
  deleteCheck(id: string): Promise<void>;
  
  // Sync queue
  addToSyncQueue(item: any): Promise<string>;
  getSyncQueue(): Promise<any[]>;
  updateSyncQueueItem(id: string, updates: any): Promise<void>;
  removeSyncQueueItem(id: string): Promise<void>;
  getSyncQueueCount(): Promise<number>;
  
  // Print queue
  addPrintJob(job: any): Promise<string>;
  getPendingPrintJobs(): Promise<any[]>;
  updatePrintJob(id: string, updates: any): Promise<void>;
  removePrintJob(id: string): Promise<void>;
  
  // Session
  setSession(key: string, value: any): Promise<void>;
  getSession<T>(key: string): Promise<T | null>;
  getAllSessionKeys(): Promise<string[]>;
  clearSession(): Promise<void>;
  
  // Utility
  getStorageStats(): Promise<any>;
  clearAllData(): Promise<void>;
}

// Capacitor SQLite storage implementation using SQLiteConnection instance
class CapacitorSQLiteStorage implements SQLiteStorageInterface {
  private sqlite: any = null;
  private connection: any = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private dbName = 'CloudPOS_SQLite';

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Dynamic import of Capacitor SQLite plugin
      const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
      this.sqlite = CapacitorSQLite;
      
      // Check connection consistency (v8 pattern)
      const retCC = await this.sqlite.checkConnectionsConsistency({ dbNames: [], openModes: [] });
      const isConsistent = retCC.result;
      
      if (isConsistent) {
        // Check if connection already exists
        const retIsConn = await this.sqlite.isConnection({ database: this.dbName, readonly: false });
        if (retIsConn.result) {
          // Retrieve existing connection
          const ret = await this.sqlite.retrieveConnection({ database: this.dbName, readonly: false });
          this.connection = ret;
        }
      }
      
      if (!this.connection) {
        // Create new connection (returns void in v8, connection is managed internally)
        await this.sqlite.createConnection({
          database: this.dbName,
          version: 1,
          encrypted: false,
          mode: 'no-encryption',
          readonly: false,
        });
      }
      
      // Open the database
      await this.sqlite.open({ database: this.dbName, readonly: false });
      
      // Create tables
      await this.createTables();
      
      this.isInitialized = true;
      console.log('[NativeStorage] Capacitor SQLite initialized successfully');
    } catch (error) {
      console.error('[NativeStorage] Failed to initialize Capacitor SQLite:', error);
      this.initPromise = null;
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async createTables(): Promise<void> {
    const statements = [
      `CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        expires_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS checks (
        id TEXT PRIMARY KEY,
        check_number INTEGER NOT NULL,
        rvc_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        status TEXT NOT NULL,
        items TEXT NOT NULL,
        payments TEXT NOT NULL,
        subtotal TEXT NOT NULL,
        tax_total TEXT NOT NULL,
        total TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_to_cloud INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_checks_rvc ON checks(rvc_id)`,
      `CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status)`,
      `CREATE INDEX IF NOT EXISTS idx_checks_synced ON checks(synced_to_cloud)`,
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt TEXT,
        error TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sync_created ON sync_queue(created_at)`,
      `CREATE TABLE IF NOT EXISTS print_queue (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        printer TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_print_status ON print_queue(status)`,
      `CREATE TABLE IF NOT EXISTS session (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ];

    for (const sql of statements) {
      await this.sqlite.execute({ database: this.dbName, statements: sql });
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch {
      return false;
    }
  }

  // Config cache implementation
  async cacheConfig(key: string, data: any, ttlMs?: number): Promise<void> {
    await this.ensureInitialized();
    
    const cachedAt = new Date().toISOString();
    const expiresAt = ttlMs ? new Date(Date.now() + ttlMs).toISOString() : null;
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `INSERT OR REPLACE INTO config (key, data, cached_at, expires_at) VALUES (?, ?, ?, ?)`,
      values: [key, JSON.stringify(data), cachedAt, expiresAt],
    });
  }

  async getConfig<T>(key: string): Promise<T | null> {
    await this.ensureInitialized();
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT data, expires_at FROM config WHERE key = ?`,
      values: [key],
    });

    if (!result.values || result.values.length === 0) return null;
    
    const row = result.values[0];
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      await this.deleteConfig(key);
      return null;
    }
    
    return JSON.parse(row.data) as T;
  }

  async deleteConfig(key: string): Promise<void> {
    await this.ensureInitialized();
    
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `DELETE FROM config WHERE key = ?`,
      values: [key],
    });
  }

  async clearExpiredConfig(): Promise<number> {
    await this.ensureInitialized();
    
    const now = new Date().toISOString();
    const result = await this.sqlite.run({
      database: this.dbName,
      statement: `DELETE FROM config WHERE expires_at IS NOT NULL AND expires_at < ?`,
      values: [now],
    });
    
    return result.changes?.changes || 0;
  }

  async getAllConfigKeys(): Promise<string[]> {
    await this.ensureInitialized();
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT key FROM config`,
      values: [],
    });

    return (result.values || []).map((r: any) => r.key);
  }

  // Checks implementation
  async saveCheck(check: any): Promise<void> {
    await this.ensureInitialized();
    
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `INSERT OR REPLACE INTO checks 
        (id, check_number, rvc_id, employee_id, status, items, payments, subtotal, tax_total, total, created_at, updated_at, synced_to_cloud)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        check.id,
        check.checkNumber,
        check.rvcId,
        check.employeeId,
        check.status,
        JSON.stringify(check.items),
        JSON.stringify(check.payments),
        check.subtotal,
        check.taxTotal,
        check.total,
        check.createdAt,
        check.updatedAt,
        check.syncedToCloud ? 1 : 0,
      ],
    });
  }

  async getCheck(id: string): Promise<any | null> {
    await this.ensureInitialized();
    
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT * FROM checks WHERE id = ?`,
      values: [id],
    });

    if (!result.values || result.values.length === 0) return null;
    return this.rowToCheck(result.values[0]);
  }

  async getOpenChecks(rvcId: string): Promise<any[]> {
    await this.ensureInitialized();
    
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT * FROM checks WHERE rvc_id = ? AND status = 'open'`,
      values: [rvcId],
    });

    return (result.values || []).map((r: any) => this.rowToCheck(r));
  }

  async getUnsyncedChecks(): Promise<any[]> {
    await this.ensureInitialized();
    
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT * FROM checks WHERE synced_to_cloud = 0`,
      values: [],
    });

    return (result.values || []).map((r: any) => this.rowToCheck(r));
  }

  async markCheckSynced(id: string): Promise<void> {
    await this.ensureInitialized();
    
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `UPDATE checks SET synced_to_cloud = 1 WHERE id = ?`,
      values: [id],
    });
  }

  async deleteCheck(id: string): Promise<void> {
    await this.ensureInitialized();
    
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `DELETE FROM checks WHERE id = ?`,
      values: [id],
    });
  }

  private rowToCheck(row: any): any {
    return {
      id: row.id,
      checkNumber: row.check_number,
      rvcId: row.rvc_id,
      employeeId: row.employee_id,
      status: row.status,
      items: JSON.parse(row.items),
      payments: JSON.parse(row.payments),
      subtotal: row.subtotal,
      taxTotal: row.tax_total,
      total: row.total,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncedToCloud: row.synced_to_cloud === 1,
    };
  }

  // Sync queue implementation
  async addToSyncQueue(item: any): Promise<string> {
    await this.ensureInitialized();
    
    
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `INSERT INTO sync_queue (id, type, data, created_at, attempts) VALUES (?, ?, ?, ?, 0)`,
      values: [id, item.type, JSON.stringify(item.data), new Date().toISOString()],
    });
    
    return id;
  }

  async getSyncQueue(): Promise<any[]> {
    await this.ensureInitialized();
    
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT * FROM sync_queue ORDER BY created_at`,
      values: [],
    });

    return (result.values || []).map((r: any) => ({
      id: r.id,
      type: r.type,
      data: JSON.parse(r.data),
      createdAt: r.created_at,
      attempts: r.attempts,
      lastAttempt: r.last_attempt,
      error: r.error,
    }));
  }

  async updateSyncQueueItem(id: string, updates: any): Promise<void> {
    await this.ensureInitialized();
    
    
    const sets: string[] = [];
    const values: any[] = [];
    
    if (updates.attempts !== undefined) {
      sets.push('attempts = ?');
      values.push(updates.attempts);
    }
    if (updates.lastAttempt !== undefined) {
      sets.push('last_attempt = ?');
      values.push(updates.lastAttempt);
    }
    if (updates.error !== undefined) {
      sets.push('error = ?');
      values.push(updates.error);
    }
    
    if (sets.length === 0) return;
    
    values.push(id);
    await this.sqlite.run({
      database: this.dbName,
      statement: `UPDATE sync_queue SET ${sets.join(', ')} WHERE id = ?`,
      values,
    });
  }

  async removeSyncQueueItem(id: string): Promise<void> {
    await this.ensureInitialized();
    
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `DELETE FROM sync_queue WHERE id = ?`,
      values: [id],
    });
  }

  async getSyncQueueCount(): Promise<number> {
    await this.ensureInitialized();
    
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT COUNT(*) as count FROM sync_queue`,
      values: [],
    });

    return result.values?.[0]?.count || 0;
  }

  // Print queue implementation
  async addPrintJob(job: any): Promise<string> {
    await this.ensureInitialized();
    
    
    const id = `print_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `INSERT INTO print_queue (id, type, data, printer, status, created_at, attempts) VALUES (?, ?, ?, ?, 'pending', ?, 0)`,
      values: [id, job.type, JSON.stringify(job.data), job.printer || null, new Date().toISOString()],
    });
    
    return id;
  }

  async getPendingPrintJobs(): Promise<any[]> {
    await this.ensureInitialized();
    
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT * FROM print_queue WHERE status = 'pending' ORDER BY created_at`,
      values: [],
    });

    return (result.values || []).map((r: any) => ({
      id: r.id,
      type: r.type,
      data: JSON.parse(r.data),
      printer: r.printer,
      status: r.status,
      createdAt: r.created_at,
      attempts: r.attempts,
    }));
  }

  async updatePrintJob(id: string, updates: any): Promise<void> {
    await this.ensureInitialized();
    
    
    const sets: string[] = [];
    const values: any[] = [];
    
    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);
    }
    if (updates.attempts !== undefined) {
      sets.push('attempts = ?');
      values.push(updates.attempts);
    }
    
    if (sets.length === 0) return;
    
    values.push(id);
    await this.sqlite.run({
      database: this.dbName,
      statement: `UPDATE print_queue SET ${sets.join(', ')} WHERE id = ?`,
      values,
    });
  }

  async removePrintJob(id: string): Promise<void> {
    await this.ensureInitialized();
    
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `DELETE FROM print_queue WHERE id = ?`,
      values: [id],
    });
  }

  // Session implementation
  async setSession(key: string, value: any): Promise<void> {
    await this.ensureInitialized();
    
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `INSERT OR REPLACE INTO session (key, value) VALUES (?, ?)`,
      values: [key, JSON.stringify(value)],
    });
  }

  async getSession<T>(key: string): Promise<T | null> {
    await this.ensureInitialized();
    
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT value FROM session WHERE key = ?`,
      values: [key],
    });

    if (!result.values || result.values.length === 0) return null;
    return JSON.parse(result.values[0].value) as T;
  }

  async getAllSessionKeys(): Promise<string[]> {
    await this.ensureInitialized();
    
    const result = await this.sqlite.query({
      database: this.dbName,
      statement: `SELECT key FROM session`,
      values: [],
    });

    return (result.values || []).map((r: any) => r.key);
  }

  async clearSession(): Promise<void> {
    await this.ensureInitialized();
    
    await this.sqlite.run({
      database: this.dbName,
      statement: `DELETE FROM session`,
      values: [],
    });
  }

  // Utility methods
  async getStorageStats(): Promise<any> {
    await this.ensureInitialized();
    
    const [config, checks, syncQueue, printQueue] = await Promise.all([
      this.sqlite.query({ database: this.dbName, statement: 'SELECT COUNT(*) as count FROM config', values: [] }),
      this.sqlite.query({ database: this.dbName, statement: 'SELECT COUNT(*) as count FROM checks', values: [] }),
      this.sqlite.query({ database: this.dbName, statement: 'SELECT COUNT(*) as count FROM sync_queue', values: [] }),
      this.sqlite.query({ database: this.dbName, statement: 'SELECT COUNT(*) as count FROM print_queue', values: [] }),
    ]);

    return {
      configCount: config.values?.[0]?.count || 0,
      checksCount: checks.values?.[0]?.count || 0,
      syncQueueCount: syncQueue.values?.[0]?.count || 0,
      printQueueCount: printQueue.values?.[0]?.count || 0,
    };
  }

  async clearAllData(): Promise<void> {
    await this.ensureInitialized();
    
    
    const tables = ['config', 'checks', 'sync_queue', 'print_queue', 'session'];
    for (const table of tables) {
      await this.sqlite.run({
        database: this.dbName,
        statement: `DELETE FROM ${table}`,
        values: [],
      });
    }
  }
}

// Export singleton instance
let nativeStorageInstance: SQLiteStorageInterface | null = null;

export async function getNativeStorage(): Promise<SQLiteStorageInterface | null> {
  if (nativeStorageInstance) return nativeStorageInstance;
  
  if (isCapacitor()) {
    nativeStorageInstance = new CapacitorSQLiteStorage();
    await nativeStorageInstance.initialize();
    return nativeStorageInstance;
  }
  
  // For Electron and web, return null - they'll use IndexedDB
  return null;
}

export type { SQLiteStorageInterface };
