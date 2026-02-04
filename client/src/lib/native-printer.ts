/**
 * Native Printer Service
 * 
 * Platform-agnostic printer service that:
 * - On native Android: Uses Bluetooth/USB printers via Capacitor plugin
 * - On web/Electron: Falls back to network TCP/IP printing via Print Agent
 * 
 * This is OPTIONAL - existing Print Agent and network printing remain fully functional.
 */

import { Capacitor } from '@capacitor/core';

// Bluetooth plugin interface (only available on native platforms)
interface BluetoothSerialPlugin {
  list(): Promise<{ devices: Array<{ address: string; name: string }> }>;
  connect(options: { address: string }): Promise<void>;
  disconnect(): Promise<void>;
  write(options: { data: string }): Promise<void>;
}

export interface PrintJob {
  id: string;
  type: 'receipt' | 'kitchen' | 'report';
  data: string; // Base64 ESC/POS data
  printerAddress?: string; // Bluetooth MAC or IP:port
  printerType?: 'bluetooth' | 'usb' | 'network';
}

export interface PrinterInfo {
  id: string;
  name: string;
  address: string;
  type: 'bluetooth' | 'usb' | 'network';
  connected: boolean;
}

export interface PrintResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

class NativePrinterService {
  private isNative: boolean;
  private bluetoothPlugin: any = null;
  private connectedPrinter: PrinterInfo | null = null;
  private discoveredPrinters: PrinterInfo[] = [];
  
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }
  
  /**
   * Initialize the native printer service
   * On native platforms, this loads the Bluetooth printer plugin
   */
  async initialize(): Promise<void> {
    if (!this.isNative) {
      console.log('[NativePrinter] Running on web - using network/agent fallback');
      return;
    }
    
    try {
      // Dynamic import of Bluetooth Serial plugin for native platforms
      // Uses @nichesoft/capacitor-bluetooth-serial or similar when installed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const module = await import('@nichesoft/capacitor-bluetooth-serial' as any);
      this.bluetoothPlugin = module.BluetoothSerial as BluetoothSerialPlugin;
      console.log('[NativePrinter] Bluetooth printer plugin initialized');
    } catch (error) {
      console.log('[NativePrinter] Bluetooth plugin not available, using network fallback');
    }
  }
  
  /**
   * Check if native printing is available
   */
  isNativePrintingAvailable(): boolean {
    return this.isNative && this.bluetoothPlugin !== null;
  }
  
  /**
   * Discover available Bluetooth printers
   */
  async discoverBluetoothPrinters(): Promise<PrinterInfo[]> {
    if (!this.bluetoothPlugin) {
      return [];
    }
    
    try {
      // Scan for paired Bluetooth devices
      const result = await this.bluetoothPlugin.list();
      const devices = result.devices || [];
      
      this.discoveredPrinters = devices.map((device: any) => ({
        id: device.address,
        name: device.name || 'Unknown Printer',
        address: device.address,
        type: 'bluetooth' as const,
        connected: false,
      }));
      
      console.log(`[NativePrinter] Found ${this.discoveredPrinters.length} Bluetooth devices`);
      return this.discoveredPrinters;
    } catch (error) {
      console.error('[NativePrinter] Failed to discover printers:', error);
      return [];
    }
  }
  
  /**
   * Connect to a Bluetooth printer
   */
  async connectPrinter(printerAddress: string): Promise<boolean> {
    if (!this.bluetoothPlugin) {
      console.error('[NativePrinter] Bluetooth not available');
      return false;
    }
    
    try {
      await this.bluetoothPlugin.connect({ address: printerAddress });
      
      const printer = this.discoveredPrinters.find(p => p.address === printerAddress);
      this.connectedPrinter = printer ? { ...printer, connected: true } : {
        id: printerAddress,
        name: 'Bluetooth Printer',
        address: printerAddress,
        type: 'bluetooth',
        connected: true,
      };
      
      console.log(`[NativePrinter] Connected to ${this.connectedPrinter.name}`);
      return true;
    } catch (error) {
      console.error('[NativePrinter] Connection failed:', error);
      return false;
    }
  }
  
  /**
   * Disconnect from current printer
   */
  async disconnectPrinter(): Promise<void> {
    if (!this.bluetoothPlugin || !this.connectedPrinter) {
      return;
    }
    
    try {
      await this.bluetoothPlugin.disconnect();
      this.connectedPrinter = null;
      console.log('[NativePrinter] Disconnected from printer');
    } catch (error) {
      console.error('[NativePrinter] Disconnect failed:', error);
    }
  }
  
  /**
   * Print a job using the best available method
   * Priority: Connected Bluetooth > Network via API
   */
  async print(job: PrintJob): Promise<PrintResult> {
    // Try native Bluetooth first if connected
    if (this.connectedPrinter && this.bluetoothPlugin) {
      return this.printViaBluetooth(job);
    }
    
    // Fall back to network printing via API
    return this.printViaNetwork(job);
  }
  
  /**
   * Print directly via Bluetooth
   */
  private async printViaBluetooth(job: PrintJob): Promise<PrintResult> {
    if (!this.bluetoothPlugin) {
      return { success: false, error: 'Bluetooth not available' };
    }
    
    try {
      // Decode base64 ESC/POS data
      const data = atob(job.data);
      
      // Write to Bluetooth printer
      await this.bluetoothPlugin.write({ data });
      
      console.log(`[NativePrinter] Printed job ${job.id} via Bluetooth`);
      return { success: true, jobId: job.id };
    } catch (error) {
      console.error('[NativePrinter] Bluetooth print failed:', error);
      
      // Fallback to network
      return this.printViaNetwork(job);
    }
  }
  
  /**
   * Fallback when no Bluetooth printer is connected
   * 
   * IMPORTANT: This returns a signal to use existing print infrastructure.
   * The POS should use its existing PrintService for receipts (/api/print/check/:checkId)
   * and KDS should use its existing flow (/api/print/kitchen-ticket).
   * 
   * This native printer service is specifically for Bluetooth printing on Android.
   * When Bluetooth is unavailable, the caller should fall back to their existing
   * print service rather than relying on this generic fallback.
   */
  private async printViaNetwork(job: PrintJob): Promise<PrintResult> {
    console.log(`[NativePrinter] No Bluetooth printer connected, deferring job ${job.id} to network printing`);
    
    // Return a special result indicating network fallback is needed
    // The calling code should detect this and use existing print infrastructure
    return { 
      success: false, 
      error: 'NO_BLUETOOTH_PRINTER',
      jobId: job.id,
    };
  }
  
  /**
   * Get connected printer info
   */
  getConnectedPrinter(): PrinterInfo | null {
    return this.connectedPrinter;
  }
  
  /**
   * Get list of discovered printers
   */
  getDiscoveredPrinters(): PrinterInfo[] {
    return this.discoveredPrinters;
  }
  
  /**
   * Open cash drawer via printer
   */
  async openCashDrawer(): Promise<boolean> {
    // ESC/POS cash drawer command
    const cashDrawerCommand = btoa(String.fromCharCode(0x1B, 0x70, 0x00, 0x19, 0xFA));
    
    const result = await this.print({
      id: `drawer-${Date.now()}`,
      type: 'receipt',
      data: cashDrawerCommand,
    });
    
    return result.success;
  }
}

// Export singleton instance
export const nativePrinter = new NativePrinterService();

// Export for direct instantiation if needed
export { NativePrinterService };
