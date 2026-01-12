/**
 * SQLite Database for Service Host
 * 
 * Provides local storage for:
 * - Configuration cache (synced from cloud)
 * - Active checks and transactions
 * - Print queue
 * - Sync queue (pending uploads to cloud)
 */

// Note: better-sqlite3 types will be available after npm install in service-host folder
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BetterSqlite3 = require('better-sqlite3');

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export class Database {
  private db: any;
  private dbPath: string;
  
  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
  }
  
  async initialize(): Promise<void> {
    this.createSchema();
  }
  
  private createSchema(): void {
    this.db.exec(`
      -- Configuration cache from cloud
      CREATE TABLE IF NOT EXISTS config_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      
      -- Menu items cache
      CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        slu_id TEXT,
        tax_group_id TEXT,
        print_class_id TEXT,
        modifiers TEXT, -- JSON array of modifier group IDs
        active INTEGER DEFAULT 1,
        data TEXT -- Full JSON from cloud
      );
      
      -- Employees cache
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        employee_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        role_id TEXT,
        active INTEGER DEFAULT 1,
        data TEXT -- Full JSON from cloud
      );
      
      -- Printers cache
      CREATE TABLE IF NOT EXISTS printers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ip_address TEXT,
        port INTEGER DEFAULT 9100,
        printer_type TEXT,
        active INTEGER DEFAULT 1,
        data TEXT
      );
      
      -- Active checks (local state)
      CREATE TABLE IF NOT EXISTS checks (
        id TEXT PRIMARY KEY,
        check_number INTEGER NOT NULL,
        rvc_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        order_type TEXT DEFAULT 'dine_in',
        table_number TEXT,
        guest_count INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'open', -- open, closed, voided
        subtotal INTEGER DEFAULT 0,
        tax INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0,
        current_round INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        closed_at TEXT,
        cloud_synced INTEGER DEFAULT 0,
        cloud_id TEXT -- ID assigned by cloud after sync
      );
      
      -- Check items (order details)
      CREATE TABLE IF NOT EXISTS check_items (
        id TEXT PRIMARY KEY,
        check_id TEXT NOT NULL REFERENCES checks(id),
        round_number INTEGER NOT NULL,
        menu_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL,
        modifiers TEXT, -- JSON array
        seat_number INTEGER,
        sent_to_kitchen INTEGER DEFAULT 0,
        voided INTEGER DEFAULT 0,
        void_reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      -- Payments
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        check_id TEXT NOT NULL REFERENCES checks(id),
        tender_id TEXT NOT NULL,
        tender_type TEXT NOT NULL, -- cash, credit, debit, gift
        amount INTEGER NOT NULL,
        tip INTEGER DEFAULT 0,
        reference TEXT, -- Card last 4, auth code, etc.
        status TEXT NOT NULL DEFAULT 'authorized', -- authorized, captured, voided
        cloud_synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      -- Print queue
      CREATE TABLE IF NOT EXISTS print_queue (
        id TEXT PRIMARY KEY,
        printer_id TEXT NOT NULL,
        printer_ip TEXT,
        printer_port INTEGER DEFAULT 9100,
        job_type TEXT NOT NULL, -- receipt, kitchen, report
        content BLOB NOT NULL, -- ESC/POS commands
        status TEXT NOT NULL DEFAULT 'pending', -- pending, printing, completed, failed
        attempts INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      -- KDS tickets
      CREATE TABLE IF NOT EXISTS kds_tickets (
        id TEXT PRIMARY KEY,
        check_id TEXT NOT NULL,
        check_number INTEGER NOT NULL,
        order_type TEXT,
        items TEXT NOT NULL, -- JSON array of items
        station_id TEXT,
        status TEXT NOT NULL DEFAULT 'active', -- active, bumped, recalled
        priority INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        bumped_at TEXT
      );
      
      -- Sync queue (pending transactions to upload to cloud)
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL, -- check, payment, timecard
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL, -- create, update, delete
        payload TEXT NOT NULL, -- JSON
        attempts INTEGER DEFAULT 0,
        last_attempt TEXT,
        error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      -- Time entries (clock in/out)
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        clock_in TEXT NOT NULL,
        clock_out TEXT,
        job_id TEXT,
        break_minutes INTEGER DEFAULT 0,
        cloud_synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      -- Check locks (for multi-workstation concurrency)
      CREATE TABLE IF NOT EXISTS check_locks (
        check_id TEXT PRIMARY KEY REFERENCES checks(id),
        workstation_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        locked_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
      
      -- Workstation check number ranges (for offline operation)
      CREATE TABLE IF NOT EXISTS workstation_config (
        workstation_id TEXT PRIMARY KEY,
        check_number_start INTEGER NOT NULL,
        check_number_end INTEGER NOT NULL,
        current_check_number INTEGER NOT NULL,
        last_seen TEXT DEFAULT (datetime('now'))
      );
      
      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);
      CREATE INDEX IF NOT EXISTS idx_checks_employee ON checks(employee_id);
      CREATE INDEX IF NOT EXISTS idx_check_items_check ON check_items(check_id);
      CREATE INDEX IF NOT EXISTS idx_payments_check ON payments(check_id);
      CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
      CREATE INDEX IF NOT EXISTS idx_kds_tickets_status ON kds_tickets(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_attempts ON sync_queue(attempts);
      CREATE INDEX IF NOT EXISTS idx_check_locks_expires ON check_locks(expires_at);
    `);
  }
  
  // Generic query methods
  run(sql: string, params: any[] = []): RunResult {
    return this.db.prepare(sql).run(...params);
  }
  
  get<T = any>(sql: string, params: any[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  
  all<T = any>(sql: string, params: any[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  
  // Config cache methods
  setConfig(key: string, value: any): void {
    const json = JSON.stringify(value);
    this.run(
      `INSERT OR REPLACE INTO config_cache (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, json]
    );
  }
  
  getConfig<T = any>(key: string): T | null {
    const row = this.get<{ value: string }>('SELECT value FROM config_cache WHERE key = ?', [key]);
    return row ? JSON.parse(row.value) : null;
  }
  
  // Menu items
  upsertMenuItem(item: any): void {
    this.run(
      `INSERT OR REPLACE INTO menu_items (id, name, price, slu_id, tax_group_id, print_class_id, modifiers, active, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.name,
        item.price,
        item.sluId,
        item.taxGroupId,
        item.printClassId,
        JSON.stringify(item.modifierGroupIds || []),
        item.active ? 1 : 0,
        JSON.stringify(item),
      ]
    );
  }
  
  getMenuItem(id: string): any | null {
    const row = this.get<{ data: string }>('SELECT data FROM menu_items WHERE id = ? AND active = 1', [id]);
    return row ? JSON.parse(row.data) : null;
  }
  
  getAllMenuItems(): any[] {
    const rows = this.all<{ data: string }>('SELECT data FROM menu_items WHERE active = 1');
    return rows.map(r => JSON.parse(r.data));
  }
  
  // Employees
  upsertEmployee(emp: any): void {
    this.run(
      `INSERT OR REPLACE INTO employees (id, employee_number, first_name, last_name, pin_hash, role_id, active, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emp.id,
        emp.employeeNumber,
        emp.firstName,
        emp.lastName,
        emp.pinHash,
        emp.roleId,
        emp.active ? 1 : 0,
        JSON.stringify(emp),
      ]
    );
  }
  
  getEmployeeByNumber(empNumber: string): any | null {
    const row = this.get<{ data: string }>(
      'SELECT data FROM employees WHERE employee_number = ? AND active = 1',
      [empNumber]
    );
    return row ? JSON.parse(row.data) : null;
  }
  
  // Printers
  upsertPrinter(printer: any): void {
    this.run(
      `INSERT OR REPLACE INTO printers (id, name, ip_address, port, printer_type, active, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        printer.id,
        printer.name,
        printer.ipAddress,
        printer.port || 9100,
        printer.printerType,
        printer.active ? 1 : 0,
        JSON.stringify(printer),
      ]
    );
  }
  
  getPrinter(id: string): any | null {
    const row = this.get<{ data: string }>('SELECT data FROM printers WHERE id = ?', [id]);
    return row ? JSON.parse(row.data) : null;
  }
  
  // Sync queue
  addToSyncQueue(entityType: string, entityId: string, action: string, payload: any): void {
    this.run(
      `INSERT INTO sync_queue (entity_type, entity_id, action, payload) VALUES (?, ?, ?, ?)`,
      [entityType, entityId, action, JSON.stringify(payload)]
    );
  }
  
  getPendingSyncItems(limit: number = 100): any[] {
    return this.all(
      `SELECT * FROM sync_queue WHERE attempts < 10 ORDER BY created_at ASC LIMIT ?`,
      [limit]
    );
  }
  
  markSyncAttempt(id: number, error?: string): void {
    this.run(
      `UPDATE sync_queue SET attempts = attempts + 1, last_attempt = datetime('now'), error = ? WHERE id = ?`,
      [error || null, id]
    );
  }
  
  removeSyncItem(id: number): void {
    this.run('DELETE FROM sync_queue WHERE id = ?', [id]);
  }
  
  // Check locking methods
  acquireLock(checkId: string, workstationId: string, employeeId: string, durationSeconds: number = 300): boolean {
    // Clean up expired locks first
    this.run(
      `DELETE FROM check_locks WHERE expires_at < datetime('now')`
    );
    
    // Check if already locked by another workstation
    const existing = this.get<{ workstation_id: string }>(
      'SELECT workstation_id FROM check_locks WHERE check_id = ?',
      [checkId]
    );
    
    if (existing && existing.workstation_id !== workstationId) {
      return false; // Locked by another workstation
    }
    
    // Acquire or refresh the lock
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    this.run(
      `INSERT OR REPLACE INTO check_locks (check_id, workstation_id, employee_id, locked_at, expires_at)
       VALUES (?, ?, ?, datetime('now'), ?)`,
      [checkId, workstationId, employeeId, expiresAt]
    );
    
    return true;
  }
  
  releaseLock(checkId: string, workstationId: string): void {
    this.run(
      'DELETE FROM check_locks WHERE check_id = ? AND workstation_id = ?',
      [checkId, workstationId]
    );
  }
  
  getLock(checkId: string): { workstationId: string; employeeId: string; expiresAt: string } | null {
    const row = this.get<{ workstation_id: string; employee_id: string; expires_at: string }>(
      `SELECT workstation_id, employee_id, expires_at FROM check_locks 
       WHERE check_id = ? AND expires_at > datetime('now')`,
      [checkId]
    );
    
    if (!row) return null;
    
    return {
      workstationId: row.workstation_id,
      employeeId: row.employee_id,
      expiresAt: row.expires_at,
    };
  }
  
  releaseAllLocks(workstationId: string): void {
    this.run('DELETE FROM check_locks WHERE workstation_id = ?', [workstationId]);
  }
  
  // Workstation check number range methods
  getWorkstationConfig(workstationId: string): { checkNumberStart: number; checkNumberEnd: number; currentCheckNumber: number } | null {
    const row = this.get<{ check_number_start: number; check_number_end: number; current_check_number: number }>(
      'SELECT check_number_start, check_number_end, current_check_number FROM workstation_config WHERE workstation_id = ?',
      [workstationId]
    );
    
    if (!row) return null;
    
    return {
      checkNumberStart: row.check_number_start,
      checkNumberEnd: row.check_number_end,
      currentCheckNumber: row.current_check_number,
    };
  }
  
  setWorkstationConfig(workstationId: string, start: number, end: number, current?: number): void {
    this.run(
      `INSERT OR REPLACE INTO workstation_config (workstation_id, check_number_start, check_number_end, current_check_number, last_seen)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [workstationId, start, end, current || start]
    );
  }
  
  getNextCheckNumber(workstationId: string): number | null {
    const config = this.getWorkstationConfig(workstationId);
    if (!config) return null;
    
    if (config.currentCheckNumber > config.checkNumberEnd) {
      return null; // Range exhausted
    }
    
    const checkNumber = config.currentCheckNumber;
    
    this.run(
      'UPDATE workstation_config SET current_check_number = current_check_number + 1, last_seen = datetime(\'now\') WHERE workstation_id = ?',
      [workstationId]
    );
    
    return checkNumber;
  }
  
  close(): void {
    this.db.close();
  }
}
