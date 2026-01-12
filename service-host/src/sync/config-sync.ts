/**
 * Configuration Sync
 * 
 * Synchronizes configuration from cloud to local SQLite:
 * - Menu items, modifiers, prices
 * - Employees, roles
 * - Printers, KDS devices
 * - Tax groups, tenders, discounts
 */

import { Database } from '../db/database.js';
import { CloudConnection } from './cloud-connection.js';

export class ConfigSync {
  private db: Database;
  private cloud: CloudConnection;
  private currentVersion: number = 0;
  
  constructor(db: Database, cloud: CloudConnection) {
    this.db = db;
    this.cloud = cloud;
    
    // Listen for config updates from cloud
    this.cloud.onMessage('CONFIG_UPDATE', (data) => {
      this.applyDeltaUpdate(data);
    });
  }
  
  async syncFull(): Promise<void> {
    if (!this.cloud.isConnected()) {
      console.log('Cloud not connected, skipping full sync');
      return;
    }
    
    try {
      console.log('Starting full configuration sync...');
      
      const config = await this.cloud.get<FullConfigResponse>('/api/sync/config/full');
      
      // Store menu items
      if (config.menuItems) {
        console.log(`Syncing ${config.menuItems.length} menu items...`);
        for (const item of config.menuItems) {
          this.db.upsertMenuItem(item);
        }
      }
      
      // Store employees
      if (config.employees) {
        console.log(`Syncing ${config.employees.length} employees...`);
        for (const emp of config.employees) {
          this.db.upsertEmployee(emp);
        }
      }
      
      // Store printers
      if (config.printers) {
        console.log(`Syncing ${config.printers.length} printers...`);
        for (const printer of config.printers) {
          this.db.upsertPrinter(printer);
        }
      }
      
      // Store other config items
      if (config.slus) this.db.setConfig('slus', config.slus);
      if (config.taxGroups) this.db.setConfig('taxGroups', config.taxGroups);
      if (config.tenders) this.db.setConfig('tenders', config.tenders);
      if (config.discounts) this.db.setConfig('discounts', config.discounts);
      if (config.modifierGroups) this.db.setConfig('modifierGroups', config.modifierGroups);
      if (config.printClasses) this.db.setConfig('printClasses', config.printClasses);
      if (config.orderDevices) this.db.setConfig('orderDevices', config.orderDevices);
      if (config.kdsDevices) this.db.setConfig('kdsDevices', config.kdsDevices);
      if (config.roles) this.db.setConfig('roles', config.roles);
      if (config.privileges) this.db.setConfig('privileges', config.privileges);
      
      // Update version
      this.currentVersion = config.version || 1;
      this.db.setConfig('configVersion', this.currentVersion);
      
      console.log(`Full sync complete, version: ${this.currentVersion}`);
    } catch (e) {
      console.error('Full sync failed:', (e as Error).message);
      throw e;
    }
  }
  
  async syncDelta(): Promise<void> {
    if (!this.cloud.isConnected()) return;
    
    try {
      const delta = await this.cloud.get<DeltaConfigResponse>(
        `/api/sync/config/delta?since=${this.currentVersion}`
      );
      
      if (delta.changes && delta.changes.length > 0) {
        console.log(`Applying ${delta.changes.length} config changes...`);
        
        for (const change of delta.changes) {
          this.applyChange(change);
        }
        
        this.currentVersion = delta.version;
        this.db.setConfig('configVersion', this.currentVersion);
      }
    } catch (e) {
      console.error('Delta sync failed:', (e as Error).message);
    }
  }
  
  private applyDeltaUpdate(data: any): void {
    if (data.changes) {
      for (const change of data.changes) {
        this.applyChange(change);
      }
      if (data.version) {
        this.currentVersion = data.version;
        this.db.setConfig('configVersion', this.currentVersion);
      }
    }
  }
  
  private applyChange(change: ConfigChange): void {
    switch (change.entityType) {
      case 'menuItem':
        if (change.action === 'delete') {
          this.db.run('UPDATE menu_items SET active = 0 WHERE id = ?', [change.entityId]);
        } else {
          this.db.upsertMenuItem(change.data);
        }
        break;
        
      case 'employee':
        if (change.action === 'delete') {
          this.db.run('UPDATE employees SET active = 0 WHERE id = ?', [change.entityId]);
        } else {
          this.db.upsertEmployee(change.data);
        }
        break;
        
      case 'printer':
        if (change.action === 'delete') {
          this.db.run('UPDATE printers SET active = 0 WHERE id = ?', [change.entityId]);
        } else {
          this.db.upsertPrinter(change.data);
        }
        break;
        
      default:
        console.log(`Unknown config change type: ${change.entityType}`);
    }
  }
  
  // Get cached config for local use
  getMenuItems(): any[] {
    return this.db.getAllMenuItems();
  }
  
  getMenuItem(id: string): any | null {
    return this.db.getMenuItem(id);
  }
  
  getSlus(): any[] {
    return this.db.getConfig('slus') || [];
  }
  
  getTaxGroups(): any[] {
    return this.db.getConfig('taxGroups') || [];
  }
  
  getTenders(): any[] {
    return this.db.getConfig('tenders') || [];
  }
  
  getDiscounts(): any[] {
    return this.db.getConfig('discounts') || [];
  }
  
  getPrintClasses(): any[] {
    return this.db.getConfig('printClasses') || [];
  }
  
  getOrderDevices(): any[] {
    return this.db.getConfig('orderDevices') || [];
  }
}

interface FullConfigResponse {
  version: number;
  menuItems?: any[];
  employees?: any[];
  printers?: any[];
  slus?: any[];
  taxGroups?: any[];
  tenders?: any[];
  discounts?: any[];
  modifierGroups?: any[];
  printClasses?: any[];
  orderDevices?: any[];
  kdsDevices?: any[];
  roles?: any[];
  privileges?: any[];
}

interface DeltaConfigResponse {
  version: number;
  changes: ConfigChange[];
}

interface ConfigChange {
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data?: any;
}
