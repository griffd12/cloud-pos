/**
 * Transaction Sync Worker
 * 
 * Uploads local transactions to cloud:
 * - Closed checks
 * - Payments
 * - Time entries
 */

import { Database } from '../db/database.js';
import { CloudConnection } from './cloud-connection.js';

export class TransactionSync {
  private db: Database;
  private cloud: CloudConnection;
  private workerTimer: NodeJS.Timeout | null = null;
  private syncInterval: number = 5000; // 5 seconds
  
  constructor(db: Database, cloud: CloudConnection) {
    this.db = db;
    this.cloud = cloud;
  }
  
  startWorker(): void {
    console.log('Starting transaction sync worker...');
    this.processQueue();
    
    this.workerTimer = setInterval(() => {
      this.processQueue();
    }, this.syncInterval);
  }
  
  stopWorker(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }
  
  private async processQueue(): Promise<void> {
    if (!this.cloud.isConnected()) return;
    
    const items = this.db.getPendingSyncItems(10);
    
    for (const item of items) {
      try {
        await this.syncItem(item);
        this.db.removeSyncItem(item.id);
      } catch (e) {
        console.error(`Sync failed for ${item.entity_type}/${item.entity_id}:`, (e as Error).message);
        this.db.markSyncAttempt(item.id, (e as Error).message);
      }
    }
  }
  
  private async syncItem(item: SyncQueueItem): Promise<void> {
    const payload = JSON.parse(item.payload);
    
    switch (item.entity_type) {
      case 'check':
        await this.syncCheck(item.entity_id, item.action, payload);
        break;
        
      case 'payment':
        await this.syncPayment(item.entity_id, item.action, payload);
        break;
        
      case 'time_entry':
        await this.syncTimeEntry(item.entity_id, item.action, payload);
        break;
        
      default:
        console.warn(`Unknown entity type: ${item.entity_type}`);
    }
  }
  
  private async syncCheck(entityId: string, action: string, payload: any): Promise<void> {
    if (action === 'create' || action === 'update') {
      const result = await this.cloud.post<{ id: string }>('/api/sync/transactions', {
        type: 'check',
        action,
        data: payload,
      });
      
      // Update local check with cloud ID
      if (result.id) {
        this.db.run(
          'UPDATE checks SET cloud_synced = 1, cloud_id = ? WHERE id = ?',
          [result.id, entityId]
        );
      }
    }
  }
  
  private async syncPayment(entityId: string, action: string, payload: any): Promise<void> {
    if (action === 'create') {
      await this.cloud.post('/api/sync/transactions', {
        type: 'payment',
        action,
        data: payload,
      });
      
      this.db.run(
        'UPDATE payments SET cloud_synced = 1 WHERE id = ?',
        [entityId]
      );
    }
  }
  
  private async syncTimeEntry(entityId: string, action: string, payload: any): Promise<void> {
    await this.cloud.post('/api/sync/transactions', {
      type: 'time_entry',
      action,
      data: payload,
    });
    
    this.db.run(
      'UPDATE time_entries SET cloud_synced = 1 WHERE id = ?',
      [entityId]
    );
  }
  
  // Queue a transaction for sync
  queueCheck(checkId: string, action: 'create' | 'update', data: any): void {
    this.db.addToSyncQueue('check', checkId, action, data);
  }
  
  queuePayment(paymentId: string, data: any): void {
    this.db.addToSyncQueue('payment', paymentId, 'create', data);
  }
  
  queueTimeEntry(entryId: string, action: 'create' | 'update', data: any): void {
    this.db.addToSyncQueue('time_entry', entryId, action, data);
  }
}

interface SyncQueueItem {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: string;
  attempts: number;
  last_attempt: string | null;
  error: string | null;
}
