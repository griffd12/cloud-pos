/**
 * Offline Store - IndexedDB-backed local data storage for RED mode
 * 
 * Stores checks, menu items, and other data needed for offline operation.
 * This allows the POS to continue working even when all network is lost.
 */

const DB_NAME = 'cloud-pos-data';
const DB_VERSION = 1;

const STORES = {
  checks: 'checks',
  checkItems: 'check-items',
  menuItems: 'menu-items',
  employees: 'employees',
  config: 'config',
} as const;

export interface OfflineCheck {
  id: string;
  checkNumber: number;
  status: 'open' | 'closed' | 'voided';
  rvcId: string;
  employeeId: string;
  orderType?: string;
  tableNumber?: string;
  guestCount?: number;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  closedAt?: string;
  synced: boolean;
}

export interface OfflineCheckItem {
  id: string;
  checkId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: string[];
  voided: boolean;
  sentToKitchen: boolean;
  createdAt: string;
}

export interface OfflineMenuItem {
  id: string;
  name: string;
  price: number;
  sluId: string;
  isActive: boolean;
}

export interface OfflineEmployee {
  id: string;
  firstName: string;
  lastName: string;
  pinHash: string;
  roleId: string;
}

class OfflineStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  
  constructor() {
    this.initPromise = this.initialize();
  }
  
  private async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('Failed to open offline store database');
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORES.checks)) {
          const checksStore = db.createObjectStore(STORES.checks, { keyPath: 'id' });
          checksStore.createIndex('status', 'status', { unique: false });
          checksStore.createIndex('synced', 'synced', { unique: false });
          checksStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(STORES.checkItems)) {
          const itemsStore = db.createObjectStore(STORES.checkItems, { keyPath: 'id' });
          itemsStore.createIndex('checkId', 'checkId', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(STORES.menuItems)) {
          db.createObjectStore(STORES.menuItems, { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains(STORES.employees)) {
          db.createObjectStore(STORES.employees, { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains(STORES.config)) {
          db.createObjectStore(STORES.config, { keyPath: 'key' });
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
  
  // ============================================================================
  // CHECKS
  // ============================================================================
  
  async createCheck(check: OfflineCheck): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.checks, 'readwrite');
      const store = tx.objectStore(STORES.checks);
      const request = store.add(check);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async updateCheck(check: OfflineCheck): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.checks, 'readwrite');
      const store = tx.objectStore(STORES.checks);
      const request = store.put(check);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getCheck(id: string): Promise<OfflineCheck | null> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.checks, 'readonly');
      const store = tx.objectStore(STORES.checks);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getOpenChecks(): Promise<OfflineCheck[]> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.checks, 'readonly');
      const store = tx.objectStore(STORES.checks);
      const index = store.index('status');
      const request = index.getAll('open');
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getUnsyncedChecks(): Promise<OfflineCheck[]> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.checks, 'readonly');
      const store = tx.objectStore(STORES.checks);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const all = request.result as OfflineCheck[];
        resolve(all.filter(c => !c.synced));
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async markCheckSynced(id: string): Promise<void> {
    const check = await this.getCheck(id);
    if (check) {
      check.synced = true;
      await this.updateCheck(check);
    }
  }
  
  // ============================================================================
  // CHECK ITEMS
  // ============================================================================
  
  async addCheckItem(item: OfflineCheckItem): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.checkItems, 'readwrite');
      const store = tx.objectStore(STORES.checkItems);
      const request = store.add(item);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getCheckItems(checkId: string): Promise<OfflineCheckItem[]> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.checkItems, 'readonly');
      const store = tx.objectStore(STORES.checkItems);
      const index = store.index('checkId');
      const request = index.getAll(checkId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async updateCheckItem(item: OfflineCheckItem): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.checkItems, 'readwrite');
      const store = tx.objectStore(STORES.checkItems);
      const request = store.put(item);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  // ============================================================================
  // MENU ITEMS (cached for offline access)
  // ============================================================================
  
  async cacheMenuItems(items: OfflineMenuItem[]): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.menuItems, 'readwrite');
      const store = tx.objectStore(STORES.menuItems);
      
      store.clear();
      
      for (const item of items) {
        store.add(item);
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  
  async getMenuItems(): Promise<OfflineMenuItem[]> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.menuItems, 'readonly');
      const store = tx.objectStore(STORES.menuItems);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  // ============================================================================
  // EMPLOYEES (cached for PIN authentication)
  // ============================================================================
  
  async cacheEmployees(employees: OfflineEmployee[]): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.employees, 'readwrite');
      const store = tx.objectStore(STORES.employees);
      
      store.clear();
      
      for (const emp of employees) {
        store.add(emp);
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  
  async getEmployees(): Promise<OfflineEmployee[]> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.employees, 'readonly');
      const store = tx.objectStore(STORES.employees);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async authenticateByPin(pin: string): Promise<OfflineEmployee | null> {
    const employees = await this.getEmployees();
    const match = employees.find(emp => emp.pinHash === pin);
    return match || null;
  }
  
  async syncEmployeesFromCloud(enterpriseId?: string): Promise<number> {
    try {
      const url = enterpriseId 
        ? `/api/auth/offline-employees?enterpriseId=${enterpriseId}`
        : '/api/auth/offline-employees';
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('pos_device_token');
      if (token) {
        headers['x-device-token'] = token;
      }
      const response = await fetch(url, { credentials: 'include', headers });
      if (!response.ok) return 0;
      
      const employees: OfflineEmployee[] = await response.json();
      if (employees.length > 0) {
        await this.cacheEmployees(employees);
      }
      return employees.length;
    } catch {
      return 0;
    }
  }
  
  // ============================================================================
  // CONFIG (property settings, tax rates, etc.)
  // ============================================================================
  
  async setConfig(key: string, value: any): Promise<void> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.config, 'readwrite');
      const store = tx.objectStore(STORES.config);
      const request = store.put({ key, value });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getConfig<T = any>(key: string): Promise<T | null> {
    const db = await this.ensureDb();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.config, 'readonly');
      const store = tx.objectStore(STORES.config);
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  async getNextCheckNumber(): Promise<number> {
    const current = await this.getConfig<number>('nextCheckNumber') || 90000;
    await this.setConfig('nextCheckNumber', current + 1);
    return current;
  }
  
  async clearAllData(): Promise<void> {
    const db = await this.ensureDb();
    
    const storeNames = Object.values(STORES);
    const tx = db.transaction(storeNames, 'readwrite');
    
    for (const storeName of storeNames) {
      tx.objectStore(storeName).clear();
    }
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  
  async getStats(): Promise<{
    openChecks: number;
    unsyncedChecks: number;
    menuItems: number;
    employees: number;
  }> {
    const [openChecks, unsyncedChecks, menuItems, employees] = await Promise.all([
      this.getOpenChecks(),
      this.getUnsyncedChecks(),
      this.getMenuItems(),
      this.getEmployees(),
    ]);
    
    return {
      openChecks: openChecks.length,
      unsyncedChecks: unsyncedChecks.length,
      menuItems: menuItems.length,
      employees: employees.length,
    };
  }
}

export const offlineStore = new OfflineStore();
