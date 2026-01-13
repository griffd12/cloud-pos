/**
 * Payment Gateway Adapter Types
 * 
 * This module defines the interfaces for gateway-agnostic payment processing.
 * All payment processors (Stripe, Elavon, etc.) must implement these interfaces.
 */

// Request/Response types for payment operations

export interface AuthorizationRequest {
  amount: number; // Amount in cents
  currency?: string; // Default: USD
  orderId?: string; // POS check ID for reference
  terminalId?: string; // Physical terminal identifier
  employeeId?: string;
  workstationId?: string;
  // Card data is NEVER passed here - the terminal handles it
}

export interface AuthorizationResponse {
  success: boolean;
  transactionId: string; // Gateway's transaction identifier
  authCode?: string; // Authorization code
  referenceNumber?: string;
  // Safe card info for display/receipts only
  cardBrand?: string; // 'visa', 'mastercard', etc.
  cardLast4?: string; // Last 4 digits
  cardExpiryMonth?: number;
  cardExpiryYear?: number;
  entryMode?: string; // 'chip', 'contactless', 'swipe', 'manual'
  // Response details
  responseCode?: string;
  responseMessage?: string;
  avsResult?: string;
  cvvResult?: string;
  // Error info if failed
  errorCode?: string;
  errorMessage?: string;
  declined?: boolean;
  declineReason?: string;
}

export interface CaptureRequest {
  transactionId: string; // Original auth transaction ID
  amount: number; // Amount to capture in cents (may differ from auth for tips)
  tipAmount?: number; // Tip amount in cents
}

export interface CaptureResponse {
  success: boolean;
  transactionId: string;
  capturedAmount: number;
  responseCode?: string;
  responseMessage?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface VoidRequest {
  transactionId: string; // Transaction to void
  reason?: string;
}

export interface VoidResponse {
  success: boolean;
  transactionId: string;
  responseCode?: string;
  responseMessage?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface RefundRequest {
  transactionId: string; // Original transaction to refund
  amount: number; // Refund amount in cents (can be partial)
  reason?: string;
}

export interface RefundResponse {
  success: boolean;
  transactionId: string; // New refund transaction ID
  refundedAmount: number;
  responseCode?: string;
  responseMessage?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface TipAdjustRequest {
  transactionId: string; // Original auth transaction ID
  tipAmount: number; // New tip amount in cents
}

export interface TipAdjustResponse {
  success: boolean;
  transactionId: string;
  newTotalAmount: number;
  tipAmount: number;
  responseCode?: string;
  responseMessage?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface BatchCloseRequest {
  batchId?: string; // Optional batch ID, processor may auto-generate
}

export interface BatchCloseResponse {
  success: boolean;
  batchId: string;
  transactionCount: number;
  totalAmount: number;
  responseCode?: string;
  responseMessage?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface TransactionStatusRequest {
  transactionId: string;
}

export interface TransactionStatusResponse {
  success: boolean;
  transactionId: string;
  status: 'authorized' | 'captured' | 'voided' | 'refunded' | 'settled' | 'pending' | 'declined' | 'unknown';
  amount: number;
  capturedAmount?: number;
  refundedAmount?: number;
  authCode?: string;
  cardBrand?: string;
  cardLast4?: string;
}

/**
 * Payment Gateway Adapter Interface
 * 
 * All payment processors must implement this interface.
 * The adapter handles communication with the specific gateway API.
 */
export interface PaymentGatewayAdapter {
  // Gateway identification
  readonly gatewayType: string;
  
  // Core payment operations
  authorize(request: AuthorizationRequest): Promise<AuthorizationResponse>;
  capture(request: CaptureRequest): Promise<CaptureResponse>;
  void(request: VoidRequest): Promise<VoidResponse>;
  refund(request: RefundRequest): Promise<RefundResponse>;
  
  // Optional operations (check capabilities before calling)
  tipAdjust?(request: TipAdjustRequest): Promise<TipAdjustResponse>;
  batchClose?(request: BatchCloseRequest): Promise<BatchCloseResponse>;
  getTransactionStatus?(request: TransactionStatusRequest): Promise<TransactionStatusResponse>;
  
  // Sale = auth + capture in one step (for fast transactions)
  sale?(request: AuthorizationRequest): Promise<AuthorizationResponse>;
  
  // Health check
  testConnection?(): Promise<{ success: boolean; message?: string }>;
  
  // Terminal-specific operations (for EMV/card-present)
  initiateTerminalPayment?(request: TerminalPaymentRequest): Promise<TerminalPaymentResponse>;
  checkTerminalPaymentStatus?(processorReference: string): Promise<TerminalPaymentStatusResponse>;
  cancelTerminalPayment?(processorReference: string): Promise<{ success: boolean; errorMessage?: string }>;
}

// Terminal payment types
export interface TerminalPaymentRequest {
  readerId: string; // The processor's reader/terminal ID (e.g., Stripe reader ID)
  amount: number; // Amount in cents
  currency?: string;
  metadata?: Record<string, string>;
}

export interface TerminalPaymentResponse {
  success: boolean;
  processorReference?: string; // The processor's transaction/intent ID
  errorMessage?: string;
}

export interface TerminalPaymentStatusResponse {
  status: 'pending' | 'processing' | 'succeeded' | 'declined' | 'cancelled' | 'error';
  errorMessage?: string;
  cardBrand?: string;
  cardLast4?: string;
  authCode?: string;
}

/**
 * Gateway credentials - resolved from environment secrets at runtime
 */
export interface GatewayCredentials {
  [key: string]: string | undefined;
}

/**
 * Gateway settings from database config
 */
export interface GatewaySettings {
  apiEndpoint?: string;
  merchantId?: string;
  terminalId?: string;
  [key: string]: unknown;
}

/**
 * Factory function type for creating adapters
 */
export type PaymentAdapterFactory = (
  credentials: GatewayCredentials,
  settings: GatewaySettings,
  environment: 'sandbox' | 'production'
) => PaymentGatewayAdapter;
