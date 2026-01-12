/**
 * Offline Queue - IndexedDB-backed queue for RED mode operations
 * 
 * When the browser loses all network connectivity (RED mode), 
 * operations are queued locally and synced when connectivity returns.
 */

const DB_NAME = 'cloud-pos-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-operations';

interface QueuedOperation {
  id: string;
  endpoint: string;
  method: string;
  body?: any;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

class OfflineQueue {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  
  constructor() {
    this.initPromise = this.initialize();
  }
  
  private async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('Failed to open offline queue database');
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }
  
  private async ensureDb(): Promise<IDBDatabase> {
    await this.initPromise;
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }
  
  async enqueue(endpoint: string, method: string, body?: any): Promise<string> {
    const db = await this.ensureDb();
    
    const operation: QueuedOperation = {
      id: crypto.randomUUID(),
      endpoint,
      method,
      body,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(operation);
      
      request.onsuccess = () => resolve(operation.id);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAll(): Promise<QueuedOperation[]> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('createdAt');
      const request = index.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async remove(id: string): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async updateAttempt(id: string, error?: string): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const op = getRequest.result as QueuedOperation;
        if (op) {
          op.attempts++;
          op.lastError = error;
          store.put(op);
        }
        resolve();
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }
  
  async getPendingCount(): Promise<number> {
    const operations = await this.getAll();
    return operations.length;
  }
  
  async processQueue(sendFn: (op: QueuedOperation) => Promise<boolean>): Promise<{
    processed: number;
    failed: number;
  }> {
    const operations = await this.getAll();
    let processed = 0;
    let failed = 0;
    
    for (const op of operations) {
      try {
        const success = await sendFn(op);
        if (success) {
          await this.remove(op.id);
          processed++;
        } else {
          await this.updateAttempt(op.id);
          failed++;
        }
      } catch (error) {
        await this.updateAttempt(op.id, (error as Error).message);
        failed++;
      }
    }
    
    return { processed, failed };
  }
  
  async clear(): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineQueue = new OfflineQueue();
