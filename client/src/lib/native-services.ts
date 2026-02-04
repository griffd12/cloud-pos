/**
 * Native Services Initialization
 * 
 * Coordinates initialization of all native platform services:
 * - Unified Storage (SQLite on Android, IndexedDB on web)
 * - Native Printer (Bluetooth on native, network fallback)
 * - Native EMV Terminal (Bluetooth on native, gateway fallback)
 * 
 * All services are OPTIONAL enhancements - the app works fully without them.
 */

import { Capacitor } from '@capacitor/core';
import { unifiedStorage } from './unified-storage';
import { nativePrinter } from './native-printer';
import { nativeEMVTerminal } from './native-emv-terminal';

export interface NativeServicesStatus {
  platform: 'web' | 'android' | 'ios' | 'electron';
  storage: {
    initialized: boolean;
    backend: 'sqlite' | 'indexeddb';
  };
  printer: {
    initialized: boolean;
    nativeAvailable: boolean;
    connectedPrinter: string | null;
  };
  emvTerminal: {
    initialized: boolean;
    nativeAvailable: boolean;
    connectedTerminal: string | null;
  };
}

class NativeServicesManager {
  private initialized = false;
  private storageInitialized = false;
  private printerInitialized = false;
  private emvTerminalInitialized = false;
  private initPromise: Promise<void> | null = null;
  
  /**
   * Initialize all native services
   * Safe to call multiple times - will only initialize once
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }
  
  private async _doInitialize(): Promise<void> {
    const platform = Capacitor.getPlatform();
    console.log(`[NativeServices] Initializing on platform: ${platform}`);
    
    // Initialize services in parallel for faster startup
    const results = await Promise.allSettled([
      this.initStorage(),
      this.initPrinter(),
      this.initEMVTerminal(),
    ]);
    
    // Log any initialization failures (non-critical)
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const serviceName = ['Storage', 'Printer', 'EMV Terminal'][index];
        console.warn(`[NativeServices] ${serviceName} init failed:`, result.reason);
      }
    });
    
    this.initialized = true;
    console.log('[NativeServices] All services initialized');
  }
  
  private async initStorage(): Promise<void> {
    await unifiedStorage.initialize();
    this.storageInitialized = true;
    console.log(`[NativeServices] Storage initialized (${unifiedStorage.getBackend()})`);
  }
  
  private async initPrinter(): Promise<void> {
    await nativePrinter.initialize();
    this.printerInitialized = true;
    console.log('[NativeServices] Printer service initialized');
  }
  
  private async initEMVTerminal(): Promise<void> {
    await nativeEMVTerminal.initialize();
    this.emvTerminalInitialized = true;
    console.log('[NativeServices] EMV Terminal service initialized');
  }
  
  /**
   * Get status of all native services
   * Reports per-service initialization state for accurate status reporting
   */
  getStatus(): NativeServicesStatus {
    const platform = Capacitor.getPlatform();
    const connectedPrinter = nativePrinter.getConnectedPrinter();
    const connectedTerminal = nativeEMVTerminal.getConnectedTerminal();
    
    return {
      platform: platform as NativeServicesStatus['platform'],
      storage: {
        initialized: this.storageInitialized,
        backend: unifiedStorage.getBackend(),
      },
      printer: {
        initialized: this.printerInitialized,
        nativeAvailable: nativePrinter.isNativePrintingAvailable(),
        connectedPrinter: connectedPrinter?.name || null,
      },
      emvTerminal: {
        initialized: this.emvTerminalInitialized,
        nativeAvailable: nativeEMVTerminal.isNativeTerminalAvailable(),
        connectedTerminal: connectedTerminal?.name || null,
      },
    };
  }
  
  /**
   * Check if running on native platform
   */
  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }
  
  /**
   * Get current platform
   */
  getPlatform(): string {
    return Capacitor.getPlatform();
  }
}

// Export singleton instance
export const nativeServices = new NativeServicesManager();

// Re-export individual services for convenience
export { unifiedStorage } from './unified-storage';
export { nativePrinter } from './native-printer';
export { nativeEMVTerminal } from './native-emv-terminal';
