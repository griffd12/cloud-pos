/**
 * SQLite Database for Service Host
 * 
 * Provides local storage for:
 * - Configuration cache (synced from cloud)
 * - Active checks and transactions
 * - Print queue
 * - Sync queue (pending uploads to cloud)
 */

import { CREATE_SCHEMA_SQL, SCHEMA_VERSION } from './schema';

const BetterSqlite3 = require('better-sqlite3');

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SyncQueueItem {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface CheckLock {
  checkId: string;
  workstationId: string;
  employeeId: string;
  lockType: string;
  lockedAt: string;
  expiresAt: string;
}

export interface WorkstationConfig {
  workstationId: string;
  checkNumberStart: number;
  checkNumberEnd: number;
  currentCheckNumber: number;
  offlineModeEnabled: boolean;
  lastSyncAt: string | null;
  lastSeenAt: string;
}

export class Database {
  private db: any;
  private dbPath: string;
  
  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }
  
  async initialize(): Promise<void> {
    this.createSchema();
    this.checkSchemaVersion();
  }
  
  private createSchema(): void {
    this.db.exec(CREATE_SCHEMA_SQL);
  }
  
  private checkSchemaVersion(): void {
    const row = this.get<{ version: number }>('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
    
    if (!row) {
      this.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION]);
    } else if (row.version < SCHEMA_VERSION) {
      console.log(`[DB] Schema migration needed: ${row.version} → ${SCHEMA_VERSION}`);
      this.migrateSchema(row.version, SCHEMA_VERSION);
    }
  }
  
  private migrateSchema(fromVersion: number, toVersion: number): void {
    console.log(`[DB] Migrating schema from v${fromVersion} to v${toVersion}`);
    this.run('INSERT INTO schema_version (version) VALUES (?)', [toVersion]);
  }
  
  // ==========================================================================
  // Generic query methods
  // ==========================================================================
  
  run(sql: string, params: any[] = []): RunResult {
    return this.db.prepare(sql).run(...params);
  }
  
  get<T = any>(sql: string, params: any[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  
  all<T = any>(sql: string, params: any[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
  
  // ==========================================================================
  // Currency Helpers (avoid floating point issues)
  // ==========================================================================
  
  toCents(amount: any): number {
    if (amount === null || amount === undefined) return 0;
    if (typeof amount === 'number') {
      return Math.round(amount * 100);
    }
    if (typeof amount === 'string') {
      const parsed = parseFloat(amount);
      return isNaN(parsed) ? 0 : Math.round(parsed * 100);
    }
    return 0;
  }
  
  fromCents(cents: number): string {
    return (cents / 100).toFixed(2);
  }
  
  // ==========================================================================
  // Sync Metadata
  // ==========================================================================
  
  getSyncMetadata(key: string): string | null {
    const row = this.get<{ value: string }>('SELECT value FROM sync_metadata WHERE key = ?', [key]);
    return row?.value ?? null;
  }
  
  setSyncMetadata(key: string, value: string): void {
    this.run(
      `INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, value]
    );
  }
  
  // ==========================================================================
  // Config Cache
  // ==========================================================================
  
  setConfig(key: string, value: any, entityType?: string, entityId?: string): void {
    const json = JSON.stringify(value);
    this.run(
      `INSERT OR REPLACE INTO config_cache (key, value, entity_type, entity_id, updated_at) 
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [key, json, entityType || null, entityId || null]
    );
  }
  
  getConfig<T = any>(key: string): T | null {
    const row = this.get<{ value: string }>('SELECT value FROM config_cache WHERE key = ?', [key]);
    return row ? JSON.parse(row.value) : null;
  }
  
  deleteConfig(key: string): void {
    this.run('DELETE FROM config_cache WHERE key = ?', [key]);
  }
  
  clearConfigByType(entityType: string): void {
    this.run('DELETE FROM config_cache WHERE entity_type = ?', [entityType]);
  }
  
  // ==========================================================================
  // Enterprise Hierarchy
  // ==========================================================================
  
  upsertEnterprise(enterprise: any): void {
    this.run(
      `INSERT OR REPLACE INTO enterprises (id, name, code, active, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [enterprise.id, enterprise.name, enterprise.code, enterprise.active ? 1 : 0]
    );
  }
  
  getEnterprise(id: string): any | null {
    return this.get('SELECT * FROM enterprises WHERE id = ?', [id]);
  }
  
  upsertProperty(property: any): void {
    this.run(
      `INSERT OR REPLACE INTO properties (
        id, enterprise_id, name, code, address, timezone,
        business_date_rollover_time, business_date_mode, current_business_date,
        sign_in_logo_url, auto_clock_out_enabled, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        property.id, property.enterpriseId, property.name, property.code,
        property.address, property.timezone || 'America/New_York',
        property.businessDateRolloverTime || '04:00',
        property.businessDateMode || 'auto',
        property.currentBusinessDate,
        property.signInLogoUrl,
        property.autoClockOutEnabled ? 1 : 0,
        property.active !== false ? 1 : 0,
      ]
    );
  }
  
  getProperty(id: string): any | null {
    return this.get('SELECT * FROM properties WHERE id = ?', [id]);
  }
  
  upsertRvc(rvc: any): void {
    this.run(
      `INSERT OR REPLACE INTO rvcs (
        id, property_id, name, code, fast_transaction_default,
        default_order_type, order_type_default, dynamic_order_mode, dom_send_mode,
        active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        rvc.id, rvc.propertyId, rvc.name, rvc.code,
        rvc.fastTransactionDefault ? 1 : 0,
        rvc.defaultOrderType || 'dine_in',
        rvc.orderTypeDefault || 'dine_in',
        rvc.dynamicOrderMode ? 1 : 0,
        rvc.domSendMode || 'fire_on_fly',
        rvc.active !== false ? 1 : 0,
      ]
    );
  }
  
  getRvc(id: string): any | null {
    return this.get('SELECT * FROM rvcs WHERE id = ?', [id]);
  }
  
  getRvcsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM rvcs WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Employees
  // ==========================================================================
  
  upsertEmployee(emp: any): void {
    this.run(
      `INSERT OR REPLACE INTO employees (
        id, enterprise_id, property_id, employee_number, first_name, last_name,
        pin_hash, role_id, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        emp.id, emp.enterpriseId, emp.propertyId, emp.employeeNumber,
        emp.firstName, emp.lastName, emp.pinHash, emp.roleId,
        emp.active !== false ? 1 : 0,
      ]
    );
  }
  
  getEmployee(id: string): any | null {
    return this.get('SELECT * FROM employees WHERE id = ?', [id]);
  }
  
  getEmployeeByNumber(empNumber: string): any | null {
    return this.get('SELECT * FROM employees WHERE employee_number = ? AND active = 1', [empNumber]);
  }
  
  getEmployeesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM employees WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Roles & Privileges
  // ==========================================================================
  
  upsertRole(role: any): void {
    this.run(
      `INSERT OR REPLACE INTO roles (
        id, enterprise_id, property_id, rvc_id, name, code, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        role.id, role.enterpriseId, role.propertyId, role.rvcId,
        role.name, role.code, role.active !== false ? 1 : 0,
      ]
    );
  }
  
  getRole(id: string): any | null {
    return this.get('SELECT * FROM roles WHERE id = ?', [id]);
  }
  
  upsertPrivilege(priv: any): void {
    this.run(
      `INSERT OR REPLACE INTO privileges (id, code, name, domain, description, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [priv.id, priv.code, priv.name, priv.domain, priv.description]
    );
  }
  
  upsertRolePrivilege(rp: any): void {
    this.run(
      `INSERT OR REPLACE INTO role_privileges (id, role_id, privilege_code, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [rp.id, rp.roleId, rp.privilegeCode]
    );
  }
  
  getRolePrivileges(roleId: string): string[] {
    const rows = this.all<{ privilege_code: string }>(
      'SELECT privilege_code FROM role_privileges WHERE role_id = ?',
      [roleId]
    );
    return rows.map(r => r.privilege_code);
  }
  
  // ==========================================================================
  // Menu Items
  // ==========================================================================
  
  upsertMenuItem(item: any): void {
    const priceInCents = this.toCents(item.price);
    this.run(
      `INSERT OR REPLACE INTO menu_items (
        id, enterprise_id, property_id, rvc_id, name, short_name, price,
        tax_group_id, print_class_id, major_group_id, family_group_id, color, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        item.id, item.enterpriseId, item.propertyId, item.rvcId,
        item.name, item.shortName, priceInCents,
        item.taxGroupId, item.printClassId, item.majorGroupId, item.familyGroupId,
        item.color || '#3B82F6', item.active !== false ? 1 : 0,
      ]
    );
  }
  
  getMenuItem(id: string): any | null {
    return this.get('SELECT * FROM menu_items WHERE id = ? AND active = 1', [id]);
  }
  
  getMenuItemsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM menu_items WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  getMenuItemsBySlu(sluId: string): any[] {
    return this.all(
      `SELECT mi.* FROM menu_items mi
       JOIN menu_item_slus mis ON mi.id = mis.menu_item_id
       WHERE mis.slu_id = ? AND mi.active = 1
       ORDER BY mis.display_order`,
      [sluId]
    );
  }
  
  // ==========================================================================
  // SLUs (Screen Lookup Units)
  // ==========================================================================
  
  upsertSlu(slu: any): void {
    this.run(
      `INSERT OR REPLACE INTO slus (
        id, enterprise_id, property_id, rvc_id, name, button_label,
        display_order, color, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        slu.id, slu.enterpriseId, slu.propertyId, slu.rvcId,
        slu.name, slu.buttonLabel, slu.displayOrder || 0,
        slu.color || '#3B82F6', slu.active !== false ? 1 : 0,
      ]
    );
  }
  
  getSlusByRvc(rvcId: string): any[] {
    return this.all(
      'SELECT * FROM slus WHERE rvc_id = ? AND active = 1 ORDER BY display_order',
      [rvcId]
    );
  }
  
  getSlusByProperty(propertyId: string): any[] {
    return this.all(
      'SELECT * FROM slus WHERE property_id = ? AND active = 1 ORDER BY display_order',
      [propertyId]
    );
  }
  
  // ==========================================================================
  // Menu Item SLU Links
  // ==========================================================================
  
  upsertMenuItemSlu(link: any): void {
    this.run(
      `INSERT OR REPLACE INTO menu_item_slus (id, menu_item_id, slu_id, display_order, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [link.id, link.menuItemId, link.sluId, link.displayOrder || 0]
    );
  }
  
  // ==========================================================================
  // Modifier Groups
  // ==========================================================================
  
  upsertModifierGroup(mg: any): void {
    this.run(
      `INSERT OR REPLACE INTO modifier_groups (
        id, enterprise_id, property_id, name, code, selection_type,
        min_selections, max_selections, display_order, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        mg.id, mg.enterpriseId, mg.propertyId, mg.name, mg.code,
        mg.selectionType || 'optional', mg.minSelections || 0, mg.maxSelections,
        mg.displayOrder || 0, mg.active !== false ? 1 : 0
      ]
    );
  }
  
  getModifierGroup(id: string): any | null {
    return this.get('SELECT * FROM modifier_groups WHERE id = ?', [id]);
  }
  
  getModifierGroupsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM modifier_groups WHERE property_id = ? AND active = 1 ORDER BY display_order', [propertyId]);
  }
  
  // ==========================================================================
  // Modifiers
  // ==========================================================================
  
  upsertModifier(mod: any): void {
    this.run(
      `INSERT OR REPLACE INTO modifiers (
        id, enterprise_id, property_id, name, code, price_delta, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        mod.id, mod.enterpriseId, mod.propertyId, mod.name, mod.code,
        mod.priceDelta || 0, mod.active !== false ? 1 : 0
      ]
    );
  }
  
  getModifier(id: string): any | null {
    return this.get('SELECT * FROM modifiers WHERE id = ?', [id]);
  }
  
  getModifiersByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM modifiers WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Modifier Group Modifiers (which modifiers belong to which groups)
  // ==========================================================================
  
  upsertModifierGroupModifier(link: any): void {
    this.run(
      `INSERT OR REPLACE INTO modifier_group_modifiers (
        id, modifier_group_id, modifier_id, is_default, display_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [link.id, link.modifierGroupId, link.modifierId, link.isDefault ? 1 : 0, link.displayOrder || 0]
    );
  }
  
  getModifiersForGroup(modifierGroupId: string): any[] {
    return this.all(
      `SELECT m.*, mgm.is_default, mgm.display_order 
       FROM modifiers m
       JOIN modifier_group_modifiers mgm ON m.id = mgm.modifier_id
       WHERE mgm.modifier_group_id = ? AND m.active = 1
       ORDER BY mgm.display_order`,
      [modifierGroupId]
    );
  }
  
  // ==========================================================================
  // Menu Item Modifier Groups (which modifier groups are assigned to which items)
  // ==========================================================================
  
  upsertMenuItemModifierGroup(link: any): void {
    this.run(
      `INSERT OR REPLACE INTO menu_item_modifier_groups (
        id, menu_item_id, modifier_group_id, display_order, updated_at
      ) VALUES (?, ?, ?, ?, datetime('now'))`,
      [link.id, link.menuItemId, link.modifierGroupId, link.displayOrder || 0]
    );
  }
  
  getModifierGroupsForMenuItem(menuItemId: string): any[] {
    return this.all(
      `SELECT mg.*, mimg.display_order as assignment_order
       FROM modifier_groups mg
       JOIN menu_item_modifier_groups mimg ON mg.id = mimg.modifier_group_id
       WHERE mimg.menu_item_id = ? AND mg.active = 1
       ORDER BY mimg.display_order`,
      [menuItemId]
    );
  }
  
  getFullMenuItemWithModifiers(menuItemId: string): any | null {
    const item = this.get('SELECT * FROM menu_items WHERE id = ?', [menuItemId]);
    if (!item) return null;
    
    const modifierGroups = this.getModifierGroupsForMenuItem(menuItemId);
    for (const group of modifierGroups) {
      group.modifiers = this.getModifiersForGroup(group.id);
    }
    
    return { ...item, modifierGroups };
  }
  
  // ==========================================================================
  // Tax Groups
  // ==========================================================================
  
  upsertTaxGroup(tg: any): void {
    const rateStr = String(tg.rate || '0');
    this.run(
      `INSERT OR REPLACE INTO tax_groups (
        id, enterprise_id, property_id, rvc_id, name, rate, tax_mode, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        tg.id, tg.enterpriseId, tg.propertyId, tg.rvcId,
        tg.name, rateStr, tg.taxMode || 'add_on',
        tg.active !== false ? 1 : 0,
      ]
    );
  }
  
  getTaxGroup(id: string): any | null {
    return this.get('SELECT * FROM tax_groups WHERE id = ?', [id]);
  }
  
  // ==========================================================================
  // Tenders
  // ==========================================================================
  
  upsertTender(tender: any): void {
    this.run(
      `INSERT OR REPLACE INTO tenders (
        id, enterprise_id, property_id, rvc_id, name, code, type,
        payment_processor_id, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        tender.id, tender.enterpriseId, tender.propertyId, tender.rvcId,
        tender.name, tender.code, tender.type, tender.paymentProcessorId,
        tender.active !== false ? 1 : 0,
      ]
    );
  }
  
  getTender(id: string): any | null {
    return this.get('SELECT * FROM tenders WHERE id = ?', [id]);
  }
  
  getTendersByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM tenders WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Discounts
  // ==========================================================================
  
  upsertDiscount(discount: any): void {
    const amountStr = String(discount.amount || '0');
    this.run(
      `INSERT OR REPLACE INTO discounts (
        id, enterprise_id, property_id, rvc_id, name, code,
        discount_type, amount, requires_manager_approval, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        discount.id, discount.enterpriseId, discount.propertyId, discount.rvcId,
        discount.name, discount.code, discount.discountType || 'percent',
        amountStr, discount.requiresManagerApproval ? 1 : 0,
        discount.active !== false ? 1 : 0,
      ]
    );
  }
  
  getDiscount(id: string): any | null {
    return this.get('SELECT * FROM discounts WHERE id = ?', [id]);
  }
  
  getDiscountsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM discounts WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Device Configuration
  // ==========================================================================
  
  upsertWorkstation(ws: any): void {
    this.run(
      `INSERT OR REPLACE INTO workstations (
        id, property_id, rvc_id, name, device_type, default_order_type,
        fast_transaction_enabled, require_begin_check, allow_pickup_check,
        allow_reopen_closed_checks, allow_offline_operation, allowed_role_ids,
        manager_approval_device, clock_in_allowed,
        default_receipt_printer_id, backup_receipt_printer_id,
        report_printer_id, backup_report_printer_id,
        void_printer_id, backup_void_printer_id,
        default_order_device_id, default_kds_expo_id,
        ip_address, hostname, is_online, last_seen_at,
        auto_logout_minutes, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        ws.id, ws.propertyId, ws.rvcId, ws.name,
        ws.deviceType || 'pos_terminal', ws.defaultOrderType || 'dine_in',
        ws.fastTransactionEnabled ? 1 : 0, ws.requireBeginCheck !== false ? 1 : 0,
        ws.allowPickupCheck !== false ? 1 : 0, ws.allowReopenClosedChecks ? 1 : 0,
        ws.allowOfflineOperation ? 1 : 0,
        ws.allowedRoleIds ? JSON.stringify(ws.allowedRoleIds) : null,
        ws.managerApprovalDevice ? 1 : 0, ws.clockInAllowed !== false ? 1 : 0,
        ws.defaultReceiptPrinterId, ws.backupReceiptPrinterId,
        ws.reportPrinterId, ws.backupReportPrinterId,
        ws.voidPrinterId, ws.backupVoidPrinterId,
        ws.defaultOrderDeviceId, ws.defaultKdsExpoId,
        ws.ipAddress, ws.hostname, ws.isOnline ? 1 : 0, ws.lastSeenAt,
        ws.autoLogoutMinutes, ws.active !== false ? 1 : 0,
      ]
    );
  }
  
  getWorkstation(id: string): any | null {
    return this.get('SELECT * FROM workstations WHERE id = ?', [id]);
  }
  
  getWorkstationsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM workstations WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  upsertPrinter(printer: any): void {
    this.run(
      `INSERT OR REPLACE INTO printers (
        id, property_id, name, printer_type, connection_type,
        ip_address, subnet_mask, port, driver_protocol, model, character_width,
        auto_cut, print_logo, print_order_header, print_order_footer,
        print_voids, print_reprints, retry_attempts, failure_handling_mode,
        is_online, last_seen_at, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        printer.id, printer.propertyId, printer.name,
        printer.printerType || 'kitchen', printer.connectionType || 'network',
        printer.ipAddress, printer.subnetMask || '255.255.255.0',
        printer.port || 9100, printer.driverProtocol || 'epson',
        printer.model, printer.characterWidth || 42,
        printer.autoCut !== false ? 1 : 0, printer.printLogo ? 1 : 0,
        printer.printOrderHeader !== false ? 1 : 0, printer.printOrderFooter !== false ? 1 : 0,
        printer.printVoids !== false ? 1 : 0, printer.printReprints !== false ? 1 : 0,
        printer.retryAttempts || 3, printer.failureHandlingMode || 'alert_cashier',
        printer.isOnline ? 1 : 0, printer.lastSeenAt,
        printer.active !== false ? 1 : 0,
      ]
    );
  }
  
  getPrinter(id: string): any | null {
    return this.get('SELECT * FROM printers WHERE id = ?', [id]);
  }
  
  getPrintersByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM printers WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  upsertKdsDevice(kds: any): void {
    this.run(
      `INSERT OR REPLACE INTO kds_devices (
        id, property_id, name, station_type,
        show_draft_items, show_sent_items_only, group_by, show_timers, auto_sort_by,
        allow_bump, allow_recall, allow_void_display, expo_mode,
        new_order_sound, new_order_blink_seconds,
        color_alert_1_enabled, color_alert_1_seconds, color_alert_1_color,
        color_alert_2_enabled, color_alert_2_seconds, color_alert_2_color,
        color_alert_3_enabled, color_alert_3_seconds, color_alert_3_color,
        ws_channel, ip_address, is_online, last_seen_at, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        kds.id, kds.propertyId, kds.name, kds.stationType || 'hot',
        kds.showDraftItems ? 1 : 0, kds.showSentItemsOnly !== false ? 1 : 0,
        kds.groupBy || 'order', kds.showTimers !== false ? 1 : 0, kds.autoSortBy || 'time',
        kds.allowBump !== false ? 1 : 0, kds.allowRecall !== false ? 1 : 0,
        kds.allowVoidDisplay !== false ? 1 : 0, kds.expoMode ? 1 : 0,
        kds.newOrderSound !== false ? 1 : 0, kds.newOrderBlinkSeconds ?? 5,
        kds.colorAlert1Enabled !== false ? 1 : 0, kds.colorAlert1Seconds ?? 60, kds.colorAlert1Color || 'yellow',
        kds.colorAlert2Enabled !== false ? 1 : 0, kds.colorAlert2Seconds ?? 180, kds.colorAlert2Color || 'orange',
        kds.colorAlert3Enabled !== false ? 1 : 0, kds.colorAlert3Seconds ?? 300, kds.colorAlert3Color || 'red',
        kds.wsChannel, kds.ipAddress, kds.isOnline ? 1 : 0, kds.lastSeenAt,
        kds.active !== false ? 1 : 0,
      ]
    );
  }
  
  getKdsDevice(id: string): any | null {
    return this.get('SELECT * FROM kds_devices WHERE id = ?', [id]);
  }
  
  getKdsDevicesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM kds_devices WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Order Devices & Routing
  // ==========================================================================
  
  upsertOrderDevice(od: any): void {
    this.run(
      `INSERT OR REPLACE INTO order_devices (
        id, property_id, name, code, kds_device_id, send_on, send_voids, send_reprints, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        od.id, od.propertyId, od.name, od.code, od.kdsDeviceId,
        od.sendOn || 'send_button', od.sendVoids !== false ? 1 : 0, od.sendReprints !== false ? 1 : 0,
        od.active !== false ? 1 : 0,
      ]
    );
  }
  
  getOrderDevice(id: string): any | null {
    return this.get('SELECT * FROM order_devices WHERE id = ?', [id]);
  }
  
  getOrderDevicesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM order_devices WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  upsertPrintClassRouting(pcr: any): void {
    this.run(
      `INSERT OR REPLACE INTO print_class_routing (id, print_class_id, order_device_id, property_id, rvc_id, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [pcr.id, pcr.printClassId, pcr.orderDeviceId, pcr.propertyId, pcr.rvcId]
    );
  }
  
  getOrderDevicesForPrintClass(printClassId: string, propertyId?: string, rvcId?: string): any[] {
    let sql = `
      SELECT od.* FROM order_devices od
      JOIN print_class_routing pcr ON od.id = pcr.order_device_id
      WHERE pcr.print_class_id = ? AND od.active = 1
    `;
    const params: any[] = [printClassId];
    
    if (rvcId) {
      sql += ' AND (pcr.rvc_id = ? OR pcr.rvc_id IS NULL)';
      params.push(rvcId);
    }
    if (propertyId) {
      sql += ' AND (pcr.property_id = ? OR pcr.property_id IS NULL)';
      params.push(propertyId);
    }
    
    return this.all(sql, params);
  }
  
  // ==========================================================================
  // Sync Queue
  // ==========================================================================
  
  addToSyncQueue(entityType: string, entityId: string, action: string, payload: any, priority: number = 0): void {
    this.run(
      `INSERT INTO sync_queue (entity_type, entity_id, action, payload, priority, next_attempt_at) 
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [entityType, entityId, action, JSON.stringify(payload), priority]
    );
  }
  
  getPendingSyncItems(limit: number = 100): SyncQueueItem[] {
    return this.all<SyncQueueItem>(
      `SELECT * FROM sync_queue 
       WHERE attempts < max_attempts 
         AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
       ORDER BY priority DESC, created_at ASC 
       LIMIT ?`,
      [limit]
    );
  }
  
  markSyncAttempt(id: number, error?: string): void {
    const backoffSeconds = 60; // Simple backoff
    this.run(
      `UPDATE sync_queue 
       SET attempts = attempts + 1, 
           last_attempt_at = datetime('now'), 
           next_attempt_at = datetime('now', '+' || (attempts * ?) || ' seconds'),
           error_message = ? 
       WHERE id = ?`,
      [backoffSeconds, error || null, id]
    );
  }
  
  removeSyncItem(id: number): void {
    this.run('DELETE FROM sync_queue WHERE id = ?', [id]);
  }
  
  getSyncQueueCount(): number {
    const row = this.get<{ count: number }>('SELECT COUNT(*) as count FROM sync_queue WHERE attempts < max_attempts');
    return row?.count ?? 0;
  }
  
  // ==========================================================================
  // Check Locking
  // ==========================================================================
  
  acquireLock(checkId: string, workstationId: string, employeeId: string, durationSeconds: number = 300): boolean {
    this.run(`DELETE FROM check_locks WHERE expires_at < datetime('now')`);
    
    const existing = this.get<{ workstation_id: string }>(
      'SELECT workstation_id FROM check_locks WHERE check_id = ?',
      [checkId]
    );
    
    if (existing && existing.workstation_id !== workstationId) {
      return false;
    }
    
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    this.run(
      `INSERT OR REPLACE INTO check_locks (check_id, workstation_id, employee_id, lock_type, locked_at, expires_at)
       VALUES (?, ?, ?, 'active', datetime('now'), ?)`,
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
  
  getLock(checkId: string): CheckLock | null {
    const row = this.get<any>(
      `SELECT check_id, workstation_id, employee_id, lock_type, locked_at, expires_at 
       FROM check_locks WHERE check_id = ? AND expires_at > datetime('now')`,
      [checkId]
    );
    
    if (!row) return null;
    
    return {
      checkId: row.check_id,
      workstationId: row.workstation_id,
      employeeId: row.employee_id,
      lockType: row.lock_type,
      lockedAt: row.locked_at,
      expiresAt: row.expires_at,
    };
  }
  
  releaseAllLocks(workstationId: string): void {
    this.run('DELETE FROM check_locks WHERE workstation_id = ?', [workstationId]);
  }
  
  // ==========================================================================
  // Workstation Config (Check Number Ranges)
  // ==========================================================================
  
  getWorkstationConfig(workstationId: string): WorkstationConfig | null {
    const row = this.get<any>(
      'SELECT * FROM workstation_config WHERE workstation_id = ?',
      [workstationId]
    );
    
    if (!row) return null;
    
    return {
      workstationId: row.workstation_id,
      checkNumberStart: row.check_number_start,
      checkNumberEnd: row.check_number_end,
      currentCheckNumber: row.current_check_number,
      offlineModeEnabled: row.offline_mode_enabled === 1,
      lastSyncAt: row.last_sync_at,
      lastSeenAt: row.last_seen_at,
    };
  }
  
  setWorkstationConfig(workstationId: string, start: number, end: number, current?: number): void {
    this.run(
      `INSERT OR REPLACE INTO workstation_config 
       (workstation_id, check_number_start, check_number_end, current_check_number, last_seen_at)
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
      `UPDATE workstation_config 
       SET current_check_number = current_check_number + 1, last_seen_at = datetime('now') 
       WHERE workstation_id = ?`,
      [workstationId]
    );
    
    return checkNumber;
  }
  
  // ==========================================================================
  // Print Queue
  // ==========================================================================
  
  addPrintJob(printerId: string, printerIp: string, printerPort: number, jobType: string, content: Buffer, priority: number = 0): string {
    const id = crypto.randomUUID();
    this.run(
      `INSERT INTO print_queue (id, printer_id, printer_ip, printer_port, job_type, content, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, printerId, printerIp, printerPort, jobType, content, priority]
    );
    return id;
  }
  
  getPendingPrintJobs(limit: number = 10): any[] {
    return this.all(
      `SELECT * FROM print_queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT ?`,
      [limit]
    );
  }
  
  updatePrintJobStatus(id: string, status: string, error?: string): void {
    this.run(
      `UPDATE print_queue SET status = ?, error_message = ?, 
       completed_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE completed_at END,
       attempts = CASE WHEN ? = 'failed' THEN attempts + 1 ELSE attempts END
       WHERE id = ?`,
      [status, error || null, status, status, id]
    );
  }
  
  retryPrintJob(id: string): void {
    this.run(
      `UPDATE print_queue SET status = 'pending', error_message = NULL WHERE id = ? AND attempts < 5`,
      [id]
    );
  }
  
  // ==========================================================================
  // Payment Processors
  // ==========================================================================
  
  upsertPaymentProcessor(proc: any): void {
    const configStr = proc.config ? JSON.stringify(proc.config) : null;
    const credentialsStr = proc.credentials ? JSON.stringify(proc.credentials) : null;
    this.run(
      `INSERT OR REPLACE INTO payment_processors (
        id, property_id, name, processor_type, is_primary, config, config_version,
        credentials, settlement_cutoff_time, supports_tip_adjust, supports_void, supports_refund,
        gateway_mode, max_retry_attempts, timeout_seconds, created_by, updated_by,
        active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM payment_processors WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        proc.id, proc.propertyId, proc.name, proc.processorType,
        proc.isPrimary ? 1 : 0, configStr, proc.configVersion || 1,
        credentialsStr, proc.settlementCutoffTime,
        proc.supportsTipAdjust !== false ? 1 : 0,
        proc.supportsVoid !== false ? 1 : 0,
        proc.supportsRefund !== false ? 1 : 0,
        proc.gatewayMode || 'production', proc.maxRetryAttempts || 3, proc.timeoutSeconds || 30,
        proc.createdBy, proc.updatedBy,
        proc.active !== false ? 1 : 0, proc.id
      ]
    );
  }
  
  getPaymentProcessor(id: string): any | null {
    return this.get('SELECT * FROM payment_processors WHERE id = ?', [id]);
  }
  
  getPaymentProcessorsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM payment_processors WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Loyalty Programs
  // ==========================================================================
  
  upsertLoyaltyProgram(prog: any): void {
    this.run(
      `INSERT OR REPLACE INTO loyalty_programs (
        id, enterprise_id, property_id, name, program_type,
        points_per_dollar, minimum_redeem_points, points_value,
        visit_threshold, spend_threshold, tier_thresholds,
        active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM loyalty_programs WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        prog.id, prog.enterpriseId, prog.propertyId, prog.name,
        prog.programType || 'points',
        String(prog.pointsPerDollar || '1'),
        prog.minimumRedeemPoints || 100,
        String(prog.pointsValue || '0.01'),
        prog.visitThreshold, String(prog.spendThreshold || ''),
        prog.tierThresholds ? JSON.stringify(prog.tierThresholds) : null,
        prog.active !== false ? 1 : 0, prog.id
      ]
    );
  }
  
  getLoyaltyProgram(id: string): any | null {
    return this.get('SELECT * FROM loyalty_programs WHERE id = ?', [id]);
  }
  
  getLoyaltyProgramsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM loyalty_programs WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  upsertLoyaltyMember(member: any): void {
    this.run(
      `INSERT OR REPLACE INTO loyalty_members (
        id, enterprise_id, property_id, phone, email, first_name, last_name, external_id,
        birthday, notes, sms_opt_in, email_opt_in, marketing_opt_in, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM loyalty_members WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        member.id, member.enterpriseId, member.propertyId, member.phone, member.email,
        member.firstName, member.lastName, member.externalId,
        member.birthday, member.notes, member.smsOptIn ? 1 : 0,
        member.emailOptIn ? 1 : 0, member.marketingOptIn ? 1 : 0, member.id
      ]
    );
  }
  
  getLoyaltyMemberByPhone(phone: string): any | null {
    return this.get('SELECT * FROM loyalty_members WHERE phone = ?', [phone]);
  }
  
  getLoyaltyMemberByEmail(email: string): any | null {
    return this.get('SELECT * FROM loyalty_members WHERE email = ?', [email]);
  }
  
  upsertLoyaltyMemberEnrollment(enrollment: any): void {
    this.run(
      `INSERT OR REPLACE INTO loyalty_member_enrollments (
        id, member_id, program_id, points_balance, lifetime_points,
        visit_count, total_spend, current_tier, enrolled_at, last_activity_at, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT enrolled_at FROM loyalty_member_enrollments WHERE id = ?), datetime('now')), ?, ?)`,
      [
        enrollment.id, enrollment.memberId, enrollment.programId,
        enrollment.pointsBalance || 0, enrollment.lifetimePoints || 0,
        enrollment.visitCount || 0, String(enrollment.totalSpend || '0'),
        enrollment.currentTier, enrollment.id, enrollment.lastActivityAt,
        enrollment.active !== false ? 1 : 0
      ]
    );
  }
  
  getMemberEnrollments(memberId: string): any[] {
    return this.all('SELECT * FROM loyalty_member_enrollments WHERE member_id = ? AND active = 1', [memberId]);
  }
  
  upsertLoyaltyReward(reward: any): void {
    this.run(
      `INSERT OR REPLACE INTO loyalty_rewards (
        id, program_id, name, description, reward_type, points_required,
        menu_item_id, discount_id, fixed_value, percent_off, max_uses,
        valid_from, valid_until, min_check_amount, max_discount_amount, usage_limit_per_member,
        active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM loyalty_rewards WHERE id = ?), datetime('now')))`,
      [
        reward.id, reward.programId, reward.name, reward.description,
        reward.rewardType, reward.pointsRequired,
        reward.menuItemId, reward.discountId,
        reward.fixedValue ? String(reward.fixedValue) : null,
        reward.percentOff ? String(reward.percentOff) : null,
        reward.maxUses, reward.validFrom, reward.validUntil,
        reward.minCheckAmount ? String(reward.minCheckAmount) : null,
        reward.maxDiscountAmount ? String(reward.maxDiscountAmount) : null,
        reward.usageLimitPerMember, reward.active !== false ? 1 : 0, reward.id
      ]
    );
  }
  
  getLoyaltyRewardsByProgram(programId: string): any[] {
    return this.all('SELECT * FROM loyalty_rewards WHERE program_id = ? AND active = 1', [programId]);
  }
  
  // ==========================================================================
  // Loyalty Transactions & Redemptions
  // ==========================================================================
  
  insertLoyaltyTransaction(tx: any): void {
    this.run(
      `INSERT INTO loyalty_transactions (
        id, member_id, program_id, enrollment_id, property_id, transaction_type,
        points, points_before, points_after, visit_increment, visits_before, visits_after,
        check_id, check_total, employee_id, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        tx.id, tx.memberId, tx.programId, tx.enrollmentId, tx.propertyId,
        tx.transactionType, tx.points || 0, tx.pointsBefore || 0, tx.pointsAfter || 0,
        tx.visitIncrement || 0, tx.visitsBefore || 0, tx.visitsAfter || 0,
        tx.checkId, tx.checkTotal ? String(tx.checkTotal) : null,
        tx.employeeId, tx.reason
      ]
    );
  }
  
  getLoyaltyTransactionsByMember(memberId: string, limit: number = 50): any[] {
    return this.all(
      'SELECT * FROM loyalty_transactions WHERE member_id = ? ORDER BY created_at DESC LIMIT ?',
      [memberId, limit]
    );
  }
  
  getLoyaltyTransactionsByCheck(checkId: string): any[] {
    return this.all('SELECT * FROM loyalty_transactions WHERE check_id = ?', [checkId]);
  }
  
  insertLoyaltyRedemption(redemption: any): void {
    this.run(
      `INSERT INTO loyalty_redemptions (
        id, member_id, reward_id, check_id, points_used, redeemed_at, employee_id
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
      [
        redemption.id, redemption.memberId, redemption.rewardId,
        redemption.checkId, redemption.pointsUsed, redemption.employeeId
      ]
    );
  }
  
  getRedemptionsByCheck(checkId: string): any[] {
    return this.all('SELECT * FROM loyalty_redemptions WHERE check_id = ?', [checkId]);
  }
  
  getRedemptionsByMember(memberId: string, limit: number = 50): any[] {
    return this.all(
      'SELECT * FROM loyalty_redemptions WHERE member_id = ? ORDER BY redeemed_at DESC LIMIT ?',
      [memberId, limit]
    );
  }
  
  // ==========================================================================
  // Item Availability
  // ==========================================================================
  
  upsertItemAvailability(avail: any): void {
    this.run(
      `INSERT OR REPLACE INTO item_availability (
        id, property_id, rvc_id, menu_item_id, is_available,
        available_quantity, unavailable_reason, unavailable_until,
        updated_at, updated_by_employee_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
      [
        avail.id, avail.propertyId, avail.rvcId, avail.menuItemId,
        avail.isAvailable !== false ? 1 : 0, avail.availableQuantity,
        avail.unavailableReason, avail.unavailableUntil, avail.updatedByEmployeeId
      ]
    );
  }
  
  getItemAvailability(menuItemId: string, propertyId: string, rvcId?: string): any | null {
    if (rvcId) {
      return this.get(
        'SELECT * FROM item_availability WHERE menu_item_id = ? AND property_id = ? AND rvc_id = ?',
        [menuItemId, propertyId, rvcId]
      );
    }
    return this.get(
      'SELECT * FROM item_availability WHERE menu_item_id = ? AND property_id = ? AND rvc_id IS NULL',
      [menuItemId, propertyId]
    );
  }
  
  getUnavailableItems(propertyId: string, rvcId?: string): any[] {
    if (rvcId) {
      return this.all(
        'SELECT * FROM item_availability WHERE property_id = ? AND (rvc_id = ? OR rvc_id IS NULL) AND is_available = 0',
        [propertyId, rvcId]
      );
    }
    return this.all('SELECT * FROM item_availability WHERE property_id = ? AND is_available = 0', [propertyId]);
  }
  
  // ==========================================================================
  // POS Layouts
  // ==========================================================================
  
  upsertPosLayout(layout: any): void {
    this.run(
      `INSERT OR REPLACE INTO pos_layouts (
        id, name, description, layout_type, rows, columns, cell_width, cell_height, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM pos_layouts WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        layout.id, layout.name, layout.description, layout.layoutType || 'menu',
        layout.rows || 5, layout.columns || 8, layout.cellWidth || 100, layout.cellHeight || 80,
        layout.active !== false ? 1 : 0, layout.id
      ]
    );
  }
  
  upsertPosLayoutCell(cell: any): void {
    this.run(
      `INSERT OR REPLACE INTO pos_layout_cells (
        id, layout_id, row_index, col_index, cell_type, menu_item_id, slu_id,
        label, color, icon, action, action_data, span_rows, span_cols
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cell.id, cell.layoutId, cell.rowIndex, cell.colIndex,
        cell.cellType || 'menu_item', cell.menuItemId, cell.sluId,
        cell.label, cell.color, cell.icon, cell.action, cell.actionData,
        cell.spanRows || 1, cell.spanCols || 1
      ]
    );
  }
  
  upsertPosLayoutRvcAssignment(assign: any): void {
    this.run(
      `INSERT OR REPLACE INTO pos_layout_rvc_assignments (
        id, layout_id, property_id, rvc_id, is_default, order_type, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [assign.id, assign.layoutId, assign.propertyId, assign.rvcId, assign.isDefault ? 1 : 0, assign.orderType]
    );
  }
  
  getPosLayout(id: string): any | null {
    return this.get('SELECT * FROM pos_layouts WHERE id = ?', [id]);
  }
  
  getPosLayoutForRvc(propertyId: string, rvcId: string, orderType?: string): any | null {
    let sql = `
      SELECT pl.* FROM pos_layouts pl
      JOIN pos_layout_rvc_assignments pla ON pl.id = pla.layout_id
      WHERE pla.property_id = ? AND (pla.rvc_id = ? OR pla.rvc_id IS NULL) AND pl.active = 1
    `;
    const params: any[] = [propertyId, rvcId];
    if (orderType) {
      sql += ' AND (pla.order_type = ? OR pla.order_type IS NULL)';
      params.push(orderType);
    }
    sql += ' ORDER BY pla.rvc_id DESC, pla.is_default DESC LIMIT 1';
    return this.get(sql, params);
  }
  
  getPosLayoutCells(layoutId: string): any[] {
    return this.all('SELECT * FROM pos_layout_cells WHERE layout_id = ? ORDER BY row_index, col_index', [layoutId]);
  }
  
  // ==========================================================================
  // Gift Cards
  // ==========================================================================
  
  upsertGiftCard(card: any): void {
    this.run(
      `INSERT OR REPLACE INTO gift_cards (
        id, property_id, card_number, pin, balance, initial_balance, status,
        activated_at, activated_by_employee_id, expires_at, last_used_at,
        customer_name, customer_phone, customer_email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM gift_cards WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        card.id, card.propertyId, card.cardNumber, card.pin,
        card.balance || 0, card.initialBalance || card.balance || 0,
        card.status || 'active', card.activatedAt, card.activatedByEmployeeId,
        card.expiresAt, card.lastUsedAt, card.customerName, card.customerPhone, card.customerEmail, card.id
      ]
    );
  }
  
  getGiftCardByNumber(cardNumber: string): any | null {
    return this.get('SELECT * FROM gift_cards WHERE card_number = ?', [cardNumber]);
  }
  
  getGiftCard(id: string): any | null {
    return this.get('SELECT * FROM gift_cards WHERE id = ?', [id]);
  }
  
  insertGiftCardTransaction(tx: any): void {
    this.run(
      `INSERT INTO gift_card_transactions (
        id, gift_card_id, check_id, transaction_type, amount, balance_before, balance_after,
        employee_id, workstation_id, notes, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        tx.id, tx.giftCardId, tx.checkId, tx.transactionType,
        tx.amount, tx.balanceBefore, tx.balanceAfter,
        tx.employeeId, tx.workstationId, tx.notes
      ]
    );
  }
  
  getGiftCardTransactions(giftCardId: string): any[] {
    return this.all('SELECT * FROM gift_card_transactions WHERE gift_card_id = ? ORDER BY created_at DESC', [giftCardId]);
  }
  
  // ==========================================================================
  // Audit Logs
  // ==========================================================================
  
  insertAuditLog(log: any): void {
    this.run(
      `INSERT INTO audit_logs (
        id, entity_type, entity_id, action, previous_value, new_value,
        employee_id, workstation_id, ip_address, reason, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        log.id, log.entityType, log.entityId, log.action,
        log.previousValue ? JSON.stringify(log.previousValue) : null,
        log.newValue ? JSON.stringify(log.newValue) : null,
        log.employeeId, log.workstationId, log.ipAddress, log.reason
      ]
    );
  }
  
  getAuditLogsForEntity(entityType: string, entityId: string): any[] {
    return this.all(
      'SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
      [entityType, entityId]
    );
  }
  
  // ==========================================================================
  // Refunds
  // ==========================================================================
  
  insertRefund(refund: any): void {
    this.run(
      `INSERT INTO refunds (
        id, original_check_id, rvc_id, refund_number, employee_id, manager_employee_id,
        workstation_id, refund_type, subtotal, tax, total, reason, status, business_date,
        cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        refund.id, refund.originalCheckId, refund.rvcId, refund.refundNumber,
        refund.employeeId, refund.managerEmployeeId, refund.workstationId,
        refund.refundType || 'full', refund.subtotal || 0, refund.tax || 0, refund.total || 0,
        refund.reason, refund.status || 'pending', refund.businessDate
      ]
    );
  }
  
  getRefund(id: string): any | null {
    return this.get('SELECT * FROM refunds WHERE id = ?', [id]);
  }
  
  getRefundsByCheck(originalCheckId: string): any[] {
    return this.all('SELECT * FROM refunds WHERE original_check_id = ?', [originalCheckId]);
  }
  
  insertRefundItem(item: any): void {
    this.run(
      `INSERT INTO refund_items (
        id, refund_id, original_item_id, menu_item_id, name, quantity, unit_price, total_price, tax_amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        item.id, item.refundId, item.originalItemId, item.menuItemId,
        item.name, item.quantity || 1, item.unitPrice, item.totalPrice, item.taxAmount || 0
      ]
    );
  }
  
  insertRefundPayment(payment: any): void {
    this.run(
      `INSERT INTO refund_payments (
        id, refund_id, original_payment_id, tender_id, amount, refund_method, reference_number, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        payment.id, payment.refundId, payment.originalPaymentId, payment.tenderId,
        payment.amount, payment.refundMethod, payment.referenceNumber, payment.status || 'pending'
      ]
    );
  }
  
  // ==========================================================================
  // Bulk Operations
  // ==========================================================================
  
  clearTable(tableName: string): void {
    const allowedTables = [
      'employees', 'menu_items', 'slus', 'menu_item_slus', 'tax_groups',
      'tenders', 'discounts', 'workstations', 'printers', 'kds_devices',
      'order_devices', 'print_class_routing', 'modifier_groups', 'modifiers',
      'modifier_group_modifiers', 'menu_item_modifier_groups', 'roles',
      'privileges', 'role_privileges', 'print_classes', 'major_groups', 'family_groups',
      'payment_processors', 'loyalty_programs', 'loyalty_members', 'loyalty_member_enrollments',
      'loyalty_transactions', 'loyalty_rewards', 'loyalty_redemptions', 'item_availability',
      'pos_layouts', 'pos_layout_cells', 'pos_layout_rvc_assignments',
      'gift_cards', 'gift_card_transactions', 'audit_logs', 'refunds', 'refund_items', 'refund_payments',
    ];
    
    if (!allowedTables.includes(tableName)) {
      throw new Error(`Cannot clear table: ${tableName}`);
    }
    
    this.run(`DELETE FROM ${tableName}`);
  }
  
  getTableRowCount(tableName: string): number {
    const row = this.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`);
    return row?.count ?? 0;
  }
  
  // ==========================================================================
  // Database Management
  // ==========================================================================
  
  vacuum(): void {
    this.db.exec('VACUUM');
  }
  
  checkpoint(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)');
  }
  
  close(): void {
    this.db.close();
  }
}
