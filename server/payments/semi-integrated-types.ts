export type TerminalConnectionType = "tcp" | "usb" | "serial" | "bluetooth" | "cloud_websocket";

export interface TerminalConnectionConfig {
  ipAddress: string;
  port: number;
  connectionType: TerminalConnectionType;
  timeoutMs?: number;
  merchantId?: string;
  terminalId?: string;
  deviceId?: string;
}

export interface TerminalSaleRequest {
  amount: number;
  orderId?: string;
  employeeId?: string;
  workstationId?: string;
  allowPartialApproval?: boolean;
  requestCashback?: boolean;
  cashbackAmount?: number;
  requestTip?: boolean;
}

export interface TerminalEmvData {
  aid?: string;
  tvr?: string;
  tsi?: string;
  applicationLabel?: string;
  applicationPreferredName?: string;
  cryptogramType?: string;
  cryptogram?: string;
}

export interface TerminalCardData {
  cardBrand?: string;
  cardLast4?: string;
  maskedPan?: string;
  cardholderName?: string;
  entryMode?: "chip" | "contactless" | "swipe" | "manual" | "fallback";
  cardExpiryMonth?: number;
  cardExpiryYear?: number;
}

export interface TerminalTransactionResponse {
  success: boolean;
  approved: boolean;
  transactionId: string;
  authCode?: string;
  referenceNumber?: string;
  approvedAmount: number;
  requestedAmount: number;
  tipAmount?: number;
  cashbackAmount?: number;
  totalAmount?: number;
  responseCode?: string;
  responseMessage?: string;
  card?: TerminalCardData;
  emv?: TerminalEmvData;
  signatureRequired?: boolean;
  signatureData?: string;
  hostReferenceNumber?: string;
  batchNumber?: string;
  partialApproval?: boolean;
  balanceDue?: number;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: string;
}

export interface TerminalVoidRequest {
  transactionId: string;
  reason?: string;
}

export interface TerminalRefundRequest {
  transactionId: string;
  amount: number;
  reason?: string;
}

export interface TerminalAuthRequest {
  amount: number;
  orderId?: string;
  employeeId?: string;
  workstationId?: string;
  allowPartialApproval?: boolean;
}

export interface TerminalTipAdjustRequest {
  transactionId: string;
  tipAmount: number;
}

export interface TerminalBatchCloseResponse {
  success: boolean;
  batchId?: string;
  batchNumber?: string;
  transactionCount: number;
  creditSaleCount?: number;
  creditSaleTotal?: number;
  creditRefundCount?: number;
  creditRefundTotal?: number;
  debitSaleCount?: number;
  debitSaleTotal?: number;
  netTotal: number;
  responseCode?: string;
  responseMessage?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: string;
}

export interface TerminalStatusResponse {
  connected: boolean;
  terminalModel?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  batteryLevel?: number;
  paperStatus?: "ok" | "low" | "out";
  errorMessage?: string;
}

export interface SemiIntegratedTerminal {
  readonly gatewayType: string;
  readonly integrationModel: "semi_integrated";

  connect(config: TerminalConnectionConfig): Promise<{ success: boolean; errorMessage?: string }>;
  disconnect(): Promise<void>;

  sale(request: TerminalSaleRequest): Promise<TerminalTransactionResponse>;
  void(request: TerminalVoidRequest): Promise<TerminalTransactionResponse>;
  refund(request: TerminalRefundRequest): Promise<TerminalTransactionResponse>;
  authOnly(request: TerminalAuthRequest): Promise<TerminalTransactionResponse>;
  tipAdjust(request: TerminalTipAdjustRequest): Promise<TerminalTransactionResponse>;
  batchClose(): Promise<TerminalBatchCloseResponse>;

  cancelCurrentTransaction?(): Promise<{ success: boolean; errorMessage?: string }>;
  getTerminalStatus?(): Promise<TerminalStatusResponse>;
  resetTerminal?(): Promise<{ success: boolean; errorMessage?: string }>;
}

export type SemiIntegratedTerminalFactory = (
  config: TerminalConnectionConfig,
  environment: "sandbox" | "production"
) => SemiIntegratedTerminal;
