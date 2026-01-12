/**
 * CAPS - Check And Posting Service
 * 
 * Core service for order management:
 * - Create/modify checks
 * - Add items with modifiers
 * - Send to kitchen (rounds)
 * - Apply payments
 * - Close checks
 */

import { Database } from '../db/database.js';
import { TransactionSync } from '../sync/transaction-sync.js';
import { randomUUID } from 'crypto';

export class CapsService {
  private db: Database;
  private transactionSync: TransactionSync;
  private checkNumberSequence: number = 1;
  
  constructor(db: Database, transactionSync: TransactionSync) {
    this.db = db;
    this.transactionSync = transactionSync;
    
    // Initialize check number from last used
    const lastCheck = this.db.get<{ check_number: number }>(
      'SELECT MAX(check_number) as check_number FROM checks'
    );
    if (lastCheck?.check_number) {
      this.checkNumberSequence = lastCheck.check_number + 1;
    }
  }
  
  // Create a new check
  createCheck(params: CreateCheckParams): Check {
    const id = randomUUID();
    const checkNumber = this.checkNumberSequence++;
    
    this.db.run(
      `INSERT INTO checks (id, check_number, rvc_id, employee_id, order_type, table_number, guest_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
      [id, checkNumber, params.rvcId, params.employeeId, params.orderType || 'dine_in', params.tableNumber, params.guestCount || 1]
    );
    
    const check = this.getCheck(id)!;
    
    // Queue for cloud sync
    this.transactionSync.queueCheck(id, 'create', check);
    
    return check;
  }
  
  // Get check by ID
  getCheck(id: string): Check | null {
    const row = this.db.get<CheckRow>(
      'SELECT * FROM checks WHERE id = ?',
      [id]
    );
    
    if (!row) return null;
    
    const items = this.getCheckItems(id);
    const payments = this.getCheckPayments(id);
    
    return {
      id: row.id,
      checkNumber: row.check_number,
      rvcId: row.rvc_id,
      employeeId: row.employee_id,
      orderType: row.order_type,
      tableNumber: row.table_number || undefined,
      guestCount: row.guest_count,
      status: row.status as 'open' | 'closed' | 'voided',
      subtotal: row.subtotal,
      tax: row.tax,
      total: row.total,
      currentRound: row.current_round,
      items,
      payments,
      createdAt: row.created_at,
      closedAt: row.closed_at || undefined,
    };
  }
  
  // List open checks
  getOpenChecks(rvcId?: string): Check[] {
    let sql = 'SELECT id FROM checks WHERE status = ?';
    const params: any[] = ['open'];
    
    if (rvcId) {
      sql += ' AND rvc_id = ?';
      params.push(rvcId);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const rows = this.db.all<{ id: string }>(sql, params);
    return rows.map(r => this.getCheck(r.id)!);
  }
  
  // Add items to check
  addItems(checkId: string, items: AddItemParams[]): CheckItem[] {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    if (check.status !== 'open') throw new Error('Check is not open');
    
    const addedItems: CheckItem[] = [];
    
    for (const item of items) {
      const id = randomUUID();
      const menuItem = this.db.getMenuItem(item.menuItemId);
      
      if (!menuItem) {
        console.warn(`Menu item not found: ${item.menuItemId}`);
        continue;
      }
      
      const unitPrice = item.priceOverride || menuItem.price;
      
      this.db.run(
        `INSERT INTO check_items (id, check_id, round_number, menu_item_id, name, quantity, unit_price, modifiers, seat_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          checkId,
          check.currentRound,
          item.menuItemId,
          menuItem.name,
          item.quantity || 1,
          unitPrice,
          JSON.stringify(item.modifiers || []),
          item.seatNumber,
        ]
      );
      
      addedItems.push({
        id,
        checkId,
        roundNumber: check.currentRound,
        menuItemId: item.menuItemId,
        name: menuItem.name,
        quantity: item.quantity || 1,
        unitPrice,
        modifiers: item.modifiers || [],
        seatNumber: item.seatNumber,
        sentToKitchen: false,
        voided: false,
      });
    }
    
    // Recalculate totals
    this.recalculateTotals(checkId);
    
    // Queue for sync
    const updatedCheck = this.getCheck(checkId)!;
    this.transactionSync.queueCheck(checkId, 'update', updatedCheck);
    
    return addedItems;
  }
  
  // Send items to kitchen (fire current round)
  sendToKitchen(checkId: string): { roundNumber: number; itemsSent: number } {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    
    // Mark unsent items as sent
    const result = this.db.run(
      `UPDATE check_items SET sent_to_kitchen = 1 WHERE check_id = ? AND sent_to_kitchen = 0 AND voided = 0`,
      [checkId]
    );
    
    // Increment round number
    const newRound = check.currentRound + 1;
    this.db.run(
      'UPDATE checks SET current_round = ? WHERE id = ?',
      [newRound, checkId]
    );
    
    return {
      roundNumber: check.currentRound,
      itemsSent: result.changes,
    };
  }
  
  // Void an item
  voidItem(checkId: string, itemId: string, reason?: string): void {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    if (check.status !== 'open') throw new Error('Check is not open');
    
    this.db.run(
      'UPDATE check_items SET voided = 1, void_reason = ? WHERE id = ? AND check_id = ?',
      [reason, itemId, checkId]
    );
    
    this.recalculateTotals(checkId);
  }
  
  // Add payment to check
  addPayment(checkId: string, params: AddPaymentParams): Payment {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    if (check.status !== 'open') throw new Error('Check is not open');
    
    const id = randomUUID();
    
    this.db.run(
      `INSERT INTO payments (id, check_id, tender_id, tender_type, amount, tip, reference, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'authorized')`,
      [id, checkId, params.tenderId, params.tenderType, params.amount, params.tip || 0, params.reference]
    );
    
    const payment: Payment = {
      id,
      checkId,
      tenderId: params.tenderId,
      tenderType: params.tenderType,
      amount: params.amount,
      tip: params.tip || 0,
      reference: params.reference,
      status: 'authorized',
    };
    
    // Queue payment for sync
    this.transactionSync.queuePayment(id, payment);
    
    // Check if fully paid
    const totalPayments = this.getTotalPayments(checkId);
    if (totalPayments >= check.total) {
      this.closeCheck(checkId);
    }
    
    return payment;
  }
  
  // Close check
  closeCheck(checkId: string): void {
    this.db.run(
      `UPDATE checks SET status = 'closed', closed_at = datetime('now') WHERE id = ?`,
      [checkId]
    );
    
    const check = this.getCheck(checkId)!;
    this.transactionSync.queueCheck(checkId, 'update', check);
  }
  
  // Void entire check
  voidCheck(checkId: string, reason?: string): void {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    
    this.db.run(
      `UPDATE checks SET status = 'voided', closed_at = datetime('now') WHERE id = ?`,
      [checkId]
    );
    
    // Void all items
    this.db.run(
      'UPDATE check_items SET voided = 1, void_reason = ? WHERE check_id = ?',
      [reason || 'Check voided', checkId]
    );
    
    const updatedCheck = this.getCheck(checkId)!;
    this.transactionSync.queueCheck(checkId, 'update', updatedCheck);
  }
  
  // Private helpers
  private getCheckItems(checkId: string): CheckItem[] {
    const rows = this.db.all<CheckItemRow>(
      'SELECT * FROM check_items WHERE check_id = ? ORDER BY created_at',
      [checkId]
    );
    
    return rows.map(row => ({
      id: row.id,
      checkId: row.check_id,
      roundNumber: row.round_number,
      menuItemId: row.menu_item_id,
      name: row.name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      modifiers: JSON.parse(row.modifiers || '[]'),
      seatNumber: row.seat_number || undefined,
      sentToKitchen: !!row.sent_to_kitchen,
      voided: !!row.voided,
      voidReason: row.void_reason || undefined,
    }));
  }
  
  private getCheckPayments(checkId: string): Payment[] {
    const rows = this.db.all<PaymentRow>(
      'SELECT * FROM payments WHERE check_id = ? ORDER BY created_at',
      [checkId]
    );
    
    return rows.map(row => ({
      id: row.id,
      checkId: row.check_id,
      tenderId: row.tender_id,
      tenderType: row.tender_type,
      amount: row.amount,
      tip: row.tip,
      reference: row.reference || undefined,
      status: row.status as 'authorized' | 'captured' | 'voided',
    }));
  }
  
  private getTotalPayments(checkId: string): number {
    const result = this.db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount + tip), 0) as total FROM payments WHERE check_id = ? AND status != 'voided'`,
      [checkId]
    );
    return result?.total || 0;
  }
  
  private recalculateTotals(checkId: string): void {
    // Calculate subtotal from non-voided items
    const subtotalResult = this.db.get<{ subtotal: number }>(
      `SELECT COALESCE(SUM(quantity * unit_price), 0) as subtotal 
       FROM check_items WHERE check_id = ? AND voided = 0`,
      [checkId]
    );
    
    const subtotal = subtotalResult?.subtotal || 0;
    
    // For now, assume 8% tax (in production, would use tax groups)
    const taxRate = 0.08;
    const tax = Math.round(subtotal * taxRate);
    const total = subtotal + tax;
    
    this.db.run(
      'UPDATE checks SET subtotal = ?, tax = ?, total = ? WHERE id = ?',
      [subtotal, tax, total, checkId]
    );
  }
}

// Types
interface CreateCheckParams {
  rvcId: string;
  employeeId: string;
  orderType?: string;
  tableNumber?: string;
  guestCount?: number;
}

interface AddItemParams {
  menuItemId: string;
  quantity?: number;
  modifiers?: any[];
  seatNumber?: number;
  priceOverride?: number;
}

interface AddPaymentParams {
  tenderId: string;
  tenderType: 'cash' | 'credit' | 'debit' | 'gift';
  amount: number;
  tip?: number;
  reference?: string;
}

interface Check {
  id: string;
  checkNumber: number;
  rvcId: string;
  employeeId: string;
  orderType: string;
  tableNumber?: string;
  guestCount: number;
  status: 'open' | 'closed' | 'voided';
  subtotal: number;
  tax: number;
  total: number;
  currentRound: number;
  items: CheckItem[];
  payments: Payment[];
  createdAt: string;
  closedAt?: string;
}

interface CheckItem {
  id: string;
  checkId: string;
  roundNumber: number;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: any[];
  seatNumber?: number;
  sentToKitchen: boolean;
  voided: boolean;
  voidReason?: string;
}

interface Payment {
  id: string;
  checkId: string;
  tenderId: string;
  tenderType: string;
  amount: number;
  tip: number;
  reference?: string;
  status: 'authorized' | 'captured' | 'voided';
}

interface CheckRow {
  id: string;
  check_number: number;
  rvc_id: string;
  employee_id: string;
  order_type: string;
  table_number: string | null;
  guest_count: number;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  current_round: number;
  created_at: string;
  closed_at: string | null;
}

interface CheckItemRow {
  id: string;
  check_id: string;
  round_number: number;
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  modifiers: string;
  seat_number: number | null;
  sent_to_kitchen: number;
  voided: number;
  void_reason: string | null;
}

interface PaymentRow {
  id: string;
  check_id: string;
  tender_id: string;
  tender_type: string;
  amount: number;
  tip: number;
  reference: string | null;
  status: string;
}

export type { Check, CheckItem, Payment, CreateCheckParams, AddItemParams, AddPaymentParams };
