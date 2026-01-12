/**
 * KDS Controller
 * 
 * Manages Kitchen Display System:
 * - Receives orders from CAPS
 * - Routes to appropriate KDS stations
 * - Handles bump/recall operations
 * - Real-time updates via WebSocket
 */

import { Database } from '../db/database.js';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

export class KdsController {
  private db: Database;
  private clients: Map<WebSocket, string> = new Map(); // ws -> deviceId
  private deviceClients: Map<string, Set<WebSocket>> = new Map(); // deviceId -> clients
  
  constructor(db: Database) {
    this.db = db;
  }
  
  // Register a KDS client
  addClient(ws: WebSocket, deviceId: string): void {
    this.clients.set(ws, deviceId);
    
    if (!this.deviceClients.has(deviceId)) {
      this.deviceClients.set(deviceId, new Set());
    }
    this.deviceClients.get(deviceId)!.add(ws);
    
    console.log(`KDS client connected: ${deviceId}`);
    
    // Send current tickets
    const tickets = this.getActiveTickets(deviceId);
    this.sendToClient(ws, {
      type: 'kds_tickets',
      tickets,
    });
  }
  
  // Remove a KDS client
  removeClient(ws: WebSocket): void {
    const deviceId = this.clients.get(ws);
    if (deviceId) {
      this.deviceClients.get(deviceId)?.delete(ws);
      this.clients.delete(ws);
      console.log(`KDS client disconnected: ${deviceId}`);
    }
  }
  
  // Create a new KDS ticket from kitchen items
  createTicket(params: CreateTicketParams): KdsTicket {
    const id = randomUUID();
    
    this.db.run(
      `INSERT INTO kds_tickets (id, check_id, check_number, order_type, items, station_id, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        id,
        params.checkId,
        params.checkNumber,
        params.orderType,
        JSON.stringify(params.items),
        params.stationId,
        params.priority || 0,
      ]
    );
    
    const ticket: KdsTicket = {
      id,
      checkId: params.checkId,
      checkNumber: params.checkNumber,
      orderType: params.orderType,
      items: params.items,
      stationId: params.stationId,
      status: 'active',
      priority: params.priority || 0,
      createdAt: new Date().toISOString(),
    };
    
    // Broadcast to relevant KDS clients
    this.broadcastToStation(params.stationId || null, {
      type: 'kds_ticket_new',
      ticket,
    });
    
    return ticket;
  }
  
  // Get active tickets for a station
  getActiveTickets(stationId?: string): KdsTicket[] {
    let sql = `SELECT * FROM kds_tickets WHERE status = 'active'`;
    const params: any[] = [];
    
    if (stationId) {
      sql += ' AND (station_id = ? OR station_id IS NULL)';
      params.push(stationId);
    }
    
    sql += ' ORDER BY priority DESC, created_at ASC';
    
    const rows = this.db.all<KdsTicketRow>(sql, params);
    
    return rows.map(row => ({
      id: row.id,
      checkId: row.check_id,
      checkNumber: row.check_number,
      orderType: row.order_type || undefined,
      items: JSON.parse(row.items),
      stationId: row.station_id || undefined,
      status: row.status as 'active' | 'bumped' | 'recalled',
      priority: row.priority,
      createdAt: row.created_at,
      bumpedAt: row.bumped_at || undefined,
    }));
  }
  
  // Bump a ticket (mark as complete)
  bumpTicket(ticketId: string, stationId?: string): void {
    this.db.run(
      `UPDATE kds_tickets SET status = 'bumped', bumped_at = datetime('now') WHERE id = ?`,
      [ticketId]
    );
    
    // Broadcast bump
    this.broadcastToAll({
      type: 'kds_ticket_bumped',
      ticketId,
      stationId,
    });
    
    console.log(`Ticket ${ticketId} bumped`);
  }
  
  // Recall a bumped ticket
  recallTicket(ticketId: string): void {
    this.db.run(
      `UPDATE kds_tickets SET status = 'active', bumped_at = NULL WHERE id = ?`,
      [ticketId]
    );
    
    const ticket = this.getTicket(ticketId);
    if (ticket) {
      // Broadcast recall
      this.broadcastToAll({
        type: 'kds_ticket_recalled',
        ticket,
      });
    }
    
    console.log(`Ticket ${ticketId} recalled`);
  }
  
  // Get a specific ticket
  getTicket(ticketId: string): KdsTicket | null {
    const row = this.db.get<KdsTicketRow>(
      'SELECT * FROM kds_tickets WHERE id = ?',
      [ticketId]
    );
    
    if (!row) return null;
    
    return {
      id: row.id,
      checkId: row.check_id,
      checkNumber: row.check_number,
      orderType: row.order_type || undefined,
      items: JSON.parse(row.items),
      stationId: row.station_id || undefined,
      status: row.status as 'active' | 'bumped' | 'recalled',
      priority: row.priority,
      createdAt: row.created_at,
      bumpedAt: row.bumped_at || undefined,
    };
  }
  
  // Get recently bumped tickets (for recall list)
  getBumpedTickets(limit: number = 10): KdsTicket[] {
    const rows = this.db.all<KdsTicketRow>(
      `SELECT * FROM kds_tickets WHERE status = 'bumped' ORDER BY bumped_at DESC LIMIT ?`,
      [limit]
    );
    
    return rows.map(row => ({
      id: row.id,
      checkId: row.check_id,
      checkNumber: row.check_number,
      orderType: row.order_type || undefined,
      items: JSON.parse(row.items),
      stationId: row.station_id || undefined,
      status: row.status as 'active' | 'bumped' | 'recalled',
      priority: row.priority,
      createdAt: row.created_at,
      bumpedAt: row.bumped_at || undefined,
    }));
  }
  
  // Priority bump - increase ticket priority
  priorityBump(ticketId: string): void {
    this.db.run(
      `UPDATE kds_tickets SET priority = priority + 1 WHERE id = ?`,
      [ticketId]
    );
    
    const ticket = this.getTicket(ticketId);
    if (ticket) {
      this.broadcastToAll({
        type: 'kds_ticket_priority',
        ticket,
      });
    }
  }
  
  // WebSocket helpers
  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  
  private broadcastToStation(stationId: string | null, message: any): void {
    const data = JSON.stringify(message);
    
    if (stationId && this.deviceClients.has(stationId)) {
      for (const ws of this.deviceClients.get(stationId)!) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      }
    }
    
    // Also send to clients without station filter
    if (this.deviceClients.has('*')) {
      for (const ws of this.deviceClients.get('*')!) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      }
    }
  }
  
  private broadcastToAll(message: any): void {
    const data = JSON.stringify(message);
    
    for (const ws of this.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}

interface CreateTicketParams {
  checkId: string;
  checkNumber: number;
  orderType?: string;
  items: KdsItem[];
  stationId?: string;
  priority?: number;
}

interface KdsItem {
  name: string;
  quantity: number;
  modifiers?: string[];
  seatNumber?: number;
}

interface KdsTicket {
  id: string;
  checkId: string;
  checkNumber: number;
  orderType?: string;
  items: KdsItem[];
  stationId?: string;
  status: 'active' | 'bumped' | 'recalled';
  priority: number;
  createdAt: string;
  bumpedAt?: string;
}

interface KdsTicketRow {
  id: string;
  check_id: string;
  check_number: number;
  order_type: string | null;
  items: string;
  station_id: string | null;
  status: string;
  priority: number;
  created_at: string;
  bumped_at: string | null;
}

export type { KdsTicket, KdsItem, CreateTicketParams };
