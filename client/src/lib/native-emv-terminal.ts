/**
 * Native EMV Terminal Service
 * 
 * Platform-agnostic EMV card reader integration:
 * - On native Android: Supports Bluetooth EMV terminals (e.g., BBPOS, PAX)
 * - On web/Electron: Falls back to server-side gateway integration
 * 
 * This is OPTIONAL - existing payment gateway integrations (Stripe, Elavon, Heartland)
 * remain fully functional.
 */

import { Capacitor } from '@capacitor/core';

export interface CardData {
  maskedPan: string; // e.g., "************1234"
  last4: string;
  cardBrand: string; // VISA, MASTERCARD, AMEX, DISCOVER
  expiryMonth?: string;
  expiryYear?: string;
  cardholderName?: string;
  emvData?: string; // Encrypted EMV data for gateway processing
}

export interface TerminalInfo {
  id: string;
  name: string;
  model: string;
  address: string; // Bluetooth MAC or IP
  type: 'bluetooth' | 'usb' | 'network';
  batteryLevel?: number;
  connected: boolean;
}

export interface TransactionRequest {
  amount: number; // In cents
  tip?: number;
  transactionType: 'sale' | 'auth' | 'refund' | 'void';
  referenceId: string;
  allowManualEntry?: boolean;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  cardData?: CardData;
  error?: string;
  responseCode?: string;
  responseMessage?: string;
  offline?: boolean; // Store-and-forward transaction
}

class NativeEMVTerminalService {
  private isNative: boolean;
  private terminalPlugin: any = null;
  private connectedTerminal: TerminalInfo | null = null;
  private discoveredTerminals: TerminalInfo[] = [];
  
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }
  
  /**
   * Initialize the EMV terminal service
   */
  async initialize(): Promise<void> {
    if (!this.isNative) {
      console.log('[NativeEMV] Running on web - using gateway fallback');
      return;
    }
    
    // Note: In production, you would integrate a specific EMV SDK here
    // Common options: BBPOS SDK, PAX SDK, Square Reader SDK
    // For this implementation, we provide the interface and fallback behavior
    
    console.log('[NativeEMV] Native platform detected - terminal support available');
  }
  
  /**
   * Check if native EMV terminal is available
   */
  isNativeTerminalAvailable(): boolean {
    return this.isNative && this.terminalPlugin !== null;
  }
  
  /**
   * Discover available Bluetooth terminals
   */
  async discoverTerminals(): Promise<TerminalInfo[]> {
    if (!this.isNative) {
      console.log('[NativeEMV] Terminal discovery not available on web');
      return [];
    }
    
    // In production, this would use the specific EMV SDK's discovery
    // For now, return empty array (terminals configured via EMC)
    console.log('[NativeEMV] Scanning for Bluetooth terminals...');
    return this.discoveredTerminals;
  }
  
  /**
   * Connect to a terminal
   */
  async connectTerminal(terminalAddress: string): Promise<boolean> {
    if (!this.isNative) {
      console.log('[NativeEMV] Cannot connect to terminal on web');
      return false;
    }
    
    try {
      // In production, this would use the EMV SDK's connect method
      console.log(`[NativeEMV] Connecting to terminal at ${terminalAddress}...`);
      
      this.connectedTerminal = {
        id: terminalAddress,
        name: 'EMV Terminal',
        model: 'Generic',
        address: terminalAddress,
        type: 'bluetooth',
        connected: true,
      };
      
      return true;
    } catch (error) {
      console.error('[NativeEMV] Connection failed:', error);
      return false;
    }
  }
  
  /**
   * Disconnect from terminal
   */
  async disconnectTerminal(): Promise<void> {
    this.connectedTerminal = null;
    console.log('[NativeEMV] Terminal disconnected');
  }
  
  /**
   * Process a card transaction
   * Uses native terminal if connected, otherwise falls back to gateway API
   */
  async processTransaction(request: TransactionRequest): Promise<TransactionResult> {
    // Try native terminal first
    if (this.connectedTerminal && this.terminalPlugin) {
      return this.processViaTerminal(request);
    }
    
    // Fall back to server-side gateway processing
    return this.processViaGateway(request);
  }
  
  /**
   * Process transaction via connected Bluetooth terminal
   * 
   * STUB: This is a placeholder for vendor SDK integration.
   * To enable native terminal processing:
   * 1. Install vendor's Capacitor plugin (BBPOS, PAX, Square, etc.)
   * 2. Update initialize() to load the plugin
   * 3. Implement this method with vendor-specific SDK calls
   * 
   * The plugin would typically:
   * - Display amount on terminal screen
   * - Wait for card tap/insert/swipe
   * - Perform EMV kernel processing
   * - Return encrypted card data or online auth result
   */
  private async processViaTerminal(request: TransactionRequest): Promise<TransactionResult> {
    console.log(`[NativeEMV] Processing $${(request.amount / 100).toFixed(2)} via terminal`);
    
    // Since no terminal plugin is loaded, this path should not be reached
    // (isNativeTerminalAvailable() returns false when terminalPlugin is null)
    // This explicit error helps with debugging if somehow invoked
    return {
      success: false,
      error: 'Native terminal SDK not integrated. Use gateway processing instead.',
    };
  }
  
  /**
   * Fallback when no Bluetooth EMV terminal is connected
   * 
   * IMPORTANT: This returns a signal to use existing payment infrastructure.
   * The POS should use its existing payment flow components (CheckPayment, etc.)
   * which properly manage the payment lifecycle with Stripe/Elavon/Heartland gateways.
   * 
   * This native EMV service is specifically for Bluetooth terminal integration.
   * When Bluetooth terminal is unavailable, the caller should fall back to their
   * existing payment service rather than relying on this generic fallback.
   */
  private async processViaGateway(request: TransactionRequest): Promise<TransactionResult> {
    console.log(`[NativeEMV] No Bluetooth terminal connected, deferring to gateway processing`);
    
    // Return a special result indicating gateway fallback is needed
    // The calling code should detect this and use existing payment infrastructure
    return {
      success: false,
      error: 'NO_BLUETOOTH_TERMINAL',
      referenceId: request.referenceId,
    };
  }
  
  /**
   * Request card data without processing payment
   * (For card-on-file, tokenization, etc.)
   */
  async readCard(): Promise<{ success: boolean; cardData?: CardData; error?: string }> {
    if (!this.connectedTerminal) {
      return { success: false, error: 'No terminal connected' };
    }
    
    // In production, this would trigger a "read card" operation on the terminal
    console.log('[NativeEMV] Waiting for card...');
    
    return { success: false, error: 'Native card read requires SDK integration' };
  }
  
  /**
   * Cancel current terminal operation
   */
  async cancelOperation(): Promise<void> {
    if (!this.connectedTerminal) return;
    
    console.log('[NativeEMV] Cancelling current operation');
    // In production, send cancel command to terminal
  }
  
  /**
   * Get connected terminal info
   */
  getConnectedTerminal(): TerminalInfo | null {
    return this.connectedTerminal;
  }
  
  /**
   * Check terminal battery level
   */
  async getBatteryLevel(): Promise<number | null> {
    if (!this.connectedTerminal) return null;
    return this.connectedTerminal.batteryLevel || null;
  }
}

// Export singleton instance
export const nativeEMVTerminal = new NativeEMVTerminalService();

// Export for direct instantiation if needed
export { NativeEMVTerminalService };
