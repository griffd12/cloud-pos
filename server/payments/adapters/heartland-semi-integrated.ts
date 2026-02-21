import type {
  SemiIntegratedTerminal,
  TerminalConnectionConfig,
  TerminalSaleRequest,
  TerminalTransactionResponse,
  TerminalVoidRequest,
  TerminalRefundRequest,
  TerminalAuthRequest,
  TerminalTipAdjustRequest,
  TerminalBatchCloseResponse,
  TerminalStatusResponse,
  TerminalEmvData,
  TerminalCardData,
} from "../semi-integrated-types";

const HEARTLAND_DEFAULT_PORT = 12000;
const HEARTLAND_DEFAULT_TIMEOUT_MS = 60000;

interface HeartlandPayAppMessage {
  SaleType?: string;
  EcrReferenceNumber?: string;
  TransactionAmount?: string;
  TipAmount?: string;
  CashBackAmount?: string;
  AllowPartialAuth?: string;
  TransactionId?: string;
  GatewayTransactionId?: string;
}

interface HeartlandPayAppResponse {
  ResponseId?: string;
  DeviceResponseCode?: string;
  DeviceResponseMessage?: string;
  Status?: string;
  TransactionId?: string;
  GatewayTransactionId?: string;
  AuthorizationCode?: string;
  ApprovedAmount?: string;
  TransactionAmount?: string;
  TipAmount?: string;
  CashBackAmount?: string;
  BalanceDueAmount?: string;
  MaskedCardNumber?: string;
  CardHolderName?: string;
  EntryMethod?: string;
  CardType?: string;
  ApplicationLabel?: string;
  ApplicationIdentifier?: string;
  ApplicationCryptogramType?: string;
  ApplicationCryptogram?: string;
  TerminalVerificationResults?: string;
  TransactionStatusInformation?: string;
  ResponseCode?: string;
  ResponseText?: string;
  HostReferenceNumber?: string;
  BatchId?: string;
  BatchSeqNbr?: string;
  BatchTxnCnt?: string;
  BatchTxnAmt?: string;
  SignatureData?: string;
}

function parseEntryMode(entry?: string): TerminalCardData["entryMode"] {
  if (!entry) return undefined;
  const lower = entry.toLowerCase();
  if (lower.includes("chip")) return "chip";
  if (lower.includes("contactless") || lower.includes("tap") || lower.includes("nfc")) return "contactless";
  if (lower.includes("swipe") || lower.includes("msr")) return "swipe";
  if (lower.includes("manual") || lower.includes("keyed")) return "manual";
  if (lower.includes("fallback")) return "fallback";
  return undefined;
}

function parseLast4(masked?: string): string | undefined {
  if (!masked) return undefined;
  const digits = masked.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

function parseCardBrand(cardType?: string): string | undefined {
  if (!cardType) return undefined;
  const lower = cardType.toLowerCase();
  if (lower.includes("visa")) return "visa";
  if (lower.includes("master")) return "mastercard";
  if (lower.includes("amex") || lower.includes("american")) return "amex";
  if (lower.includes("discover")) return "discover";
  if (lower.includes("diners")) return "diners";
  if (lower.includes("jcb")) return "jcb";
  return cardType;
}

function buildCardData(resp: HeartlandPayAppResponse): TerminalCardData {
  return {
    cardBrand: parseCardBrand(resp.CardType),
    cardLast4: parseLast4(resp.MaskedCardNumber),
    maskedPan: resp.MaskedCardNumber,
    cardholderName: resp.CardHolderName,
    entryMode: parseEntryMode(resp.EntryMethod),
  };
}

function buildEmvData(resp: HeartlandPayAppResponse): TerminalEmvData {
  return {
    aid: resp.ApplicationIdentifier,
    applicationLabel: resp.ApplicationLabel,
    cryptogramType: resp.ApplicationCryptogramType,
    cryptogram: resp.ApplicationCryptogram,
    tvr: resp.TerminalVerificationResults,
    tsi: resp.TransactionStatusInformation,
  };
}

function parseCentsFromDollars(dollarStr?: string): number {
  if (!dollarStr) return 0;
  const val = parseFloat(dollarStr);
  return isNaN(val) ? 0 : Math.round(val * 100);
}

function buildTransactionResponse(resp: HeartlandPayAppResponse, requestedAmount: number): TerminalTransactionResponse {
  const deviceCode = resp.DeviceResponseCode || "";
  const approved = deviceCode === "00" || (resp.Status || "").toLowerCase() === "approved";
  const approvedAmount = parseCentsFromDollars(resp.ApprovedAmount);
  const tipAmount = parseCentsFromDollars(resp.TipAmount);
  const cashbackAmount = parseCentsFromDollars(resp.CashBackAmount);
  const balanceDue = parseCentsFromDollars(resp.BalanceDueAmount);

  return {
    success: approved,
    approved,
    transactionId: resp.GatewayTransactionId || resp.TransactionId || "",
    authCode: resp.AuthorizationCode,
    referenceNumber: resp.HostReferenceNumber,
    approvedAmount,
    requestedAmount,
    tipAmount: tipAmount || undefined,
    cashbackAmount: cashbackAmount || undefined,
    totalAmount: approvedAmount + (tipAmount || 0) + (cashbackAmount || 0),
    responseCode: resp.ResponseCode || deviceCode,
    responseMessage: resp.ResponseText || resp.DeviceResponseMessage,
    card: buildCardData(resp),
    emv: buildEmvData(resp),
    signatureRequired: !!resp.SignatureData,
    signatureData: resp.SignatureData,
    hostReferenceNumber: resp.HostReferenceNumber,
    batchNumber: resp.BatchSeqNbr,
    partialApproval: approved && approvedAmount < requestedAmount && approvedAmount > 0,
    balanceDue: balanceDue || (approved && approvedAmount < requestedAmount ? requestedAmount - approvedAmount : undefined),
    errorCode: approved ? undefined : (resp.ResponseCode || deviceCode),
    errorMessage: approved ? undefined : (resp.ResponseText || resp.DeviceResponseMessage),
  };
}

export class HeartlandSemiIntegratedTerminal implements SemiIntegratedTerminal {
  readonly gatewayType = "heartland";
  readonly integrationModel = "semi_integrated" as const;

  private config: TerminalConnectionConfig | null = null;
  private connected = false;
  private requestCounter = 0;

  async connect(config: TerminalConnectionConfig): Promise<{ success: boolean; errorMessage?: string }> {
    this.config = {
      ...config,
      port: config.port || HEARTLAND_DEFAULT_PORT,
      timeoutMs: config.timeoutMs || HEARTLAND_DEFAULT_TIMEOUT_MS,
    };

    try {
      const status = await this.getTerminalStatus();
      if (status?.connected) {
        this.connected = true;
        return { success: true };
      }
      this.connected = true;
      return { success: true };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "Failed to connect to Heartland terminal",
      };
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = null;
  }

  private getNextEcrRef(): string {
    this.requestCounter++;
    return `ECR${Date.now()}-${this.requestCounter}`;
  }

  private async sendToTerminal(message: HeartlandPayAppMessage): Promise<HeartlandPayAppResponse> {
    if (!this.config) {
      throw new Error("Terminal not connected. Call connect() first.");
    }

    const url = `http://${this.config.ipAddress}:${this.config.port}/api/v1/pos`;
    const timeoutMs = this.config.timeoutMs || HEARTLAND_DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Terminal HTTP ${response.status}: ${text}`);
      }

      return await response.json() as HeartlandPayAppResponse;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Terminal request timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  async sale(request: TerminalSaleRequest): Promise<TerminalTransactionResponse> {
    const amountDollars = (request.amount / 100).toFixed(2);
    const message: HeartlandPayAppMessage = {
      SaleType: "Sale",
      EcrReferenceNumber: this.getNextEcrRef(),
      TransactionAmount: amountDollars,
      AllowPartialAuth: request.allowPartialApproval ? "1" : "0",
    };

    if (request.requestTip) {
      message.TipAmount = "0.00";
    }
    if (request.requestCashback && request.cashbackAmount) {
      message.CashBackAmount = (request.cashbackAmount / 100).toFixed(2);
    }

    try {
      const resp = await this.sendToTerminal(message);
      return buildTransactionResponse(resp, request.amount);
    } catch (err) {
      return {
        success: false,
        approved: false,
        transactionId: "",
        approvedAmount: 0,
        requestedAmount: request.amount,
        errorCode: "TERMINAL_ERROR",
        errorMessage: err instanceof Error ? err.message : "Sale failed",
      };
    }
  }

  async void(request: TerminalVoidRequest): Promise<TerminalTransactionResponse> {
    const message: HeartlandPayAppMessage = {
      SaleType: "Void",
      EcrReferenceNumber: this.getNextEcrRef(),
      GatewayTransactionId: request.transactionId,
    };

    try {
      const resp = await this.sendToTerminal(message);
      return buildTransactionResponse(resp, 0);
    } catch (err) {
      return {
        success: false,
        approved: false,
        transactionId: request.transactionId,
        approvedAmount: 0,
        requestedAmount: 0,
        errorCode: "TERMINAL_ERROR",
        errorMessage: err instanceof Error ? err.message : "Void failed",
      };
    }
  }

  async refund(request: TerminalRefundRequest): Promise<TerminalTransactionResponse> {
    const amountDollars = (request.amount / 100).toFixed(2);
    const message: HeartlandPayAppMessage = {
      SaleType: "Return",
      EcrReferenceNumber: this.getNextEcrRef(),
      TransactionAmount: amountDollars,
      GatewayTransactionId: request.transactionId,
    };

    try {
      const resp = await this.sendToTerminal(message);
      return buildTransactionResponse(resp, request.amount);
    } catch (err) {
      return {
        success: false,
        approved: false,
        transactionId: request.transactionId,
        approvedAmount: 0,
        requestedAmount: request.amount,
        errorCode: "TERMINAL_ERROR",
        errorMessage: err instanceof Error ? err.message : "Refund failed",
      };
    }
  }

  async authOnly(request: TerminalAuthRequest): Promise<TerminalTransactionResponse> {
    const amountDollars = (request.amount / 100).toFixed(2);
    const message: HeartlandPayAppMessage = {
      SaleType: "Auth",
      EcrReferenceNumber: this.getNextEcrRef(),
      TransactionAmount: amountDollars,
      AllowPartialAuth: request.allowPartialApproval ? "1" : "0",
    };

    try {
      const resp = await this.sendToTerminal(message);
      return buildTransactionResponse(resp, request.amount);
    } catch (err) {
      return {
        success: false,
        approved: false,
        transactionId: "",
        approvedAmount: 0,
        requestedAmount: request.amount,
        errorCode: "TERMINAL_ERROR",
        errorMessage: err instanceof Error ? err.message : "Auth failed",
      };
    }
  }

  async tipAdjust(request: TerminalTipAdjustRequest): Promise<TerminalTransactionResponse> {
    const tipDollars = (request.tipAmount / 100).toFixed(2);
    const message: HeartlandPayAppMessage = {
      SaleType: "TipAdjust",
      EcrReferenceNumber: this.getNextEcrRef(),
      GatewayTransactionId: request.transactionId,
      TipAmount: tipDollars,
    };

    try {
      const resp = await this.sendToTerminal(message);
      return buildTransactionResponse(resp, 0);
    } catch (err) {
      return {
        success: false,
        approved: false,
        transactionId: request.transactionId,
        approvedAmount: 0,
        requestedAmount: 0,
        errorCode: "TERMINAL_ERROR",
        errorMessage: err instanceof Error ? err.message : "Tip adjust failed",
      };
    }
  }

  async batchClose(): Promise<TerminalBatchCloseResponse> {
    const message: HeartlandPayAppMessage = {
      SaleType: "BatchClose",
      EcrReferenceNumber: this.getNextEcrRef(),
    };

    try {
      const resp = await this.sendToTerminal(message);
      const deviceCode = resp.DeviceResponseCode || "";
      const success = deviceCode === "00" || (resp.Status || "").toLowerCase().includes("success");

      return {
        success,
        batchId: resp.BatchId,
        batchNumber: resp.BatchSeqNbr,
        transactionCount: parseInt(resp.BatchTxnCnt || "0", 10),
        netTotal: parseCentsFromDollars(resp.BatchTxnAmt),
        responseCode: resp.ResponseCode || deviceCode,
        responseMessage: resp.ResponseText || resp.DeviceResponseMessage,
        errorCode: success ? undefined : (resp.ResponseCode || deviceCode),
        errorMessage: success ? undefined : (resp.ResponseText || resp.DeviceResponseMessage),
      };
    } catch (err) {
      return {
        success: false,
        transactionCount: 0,
        netTotal: 0,
        errorCode: "TERMINAL_ERROR",
        errorMessage: err instanceof Error ? err.message : "Batch close failed",
      };
    }
  }

  async cancelCurrentTransaction(): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const message: HeartlandPayAppMessage = {
        SaleType: "Cancel",
        EcrReferenceNumber: this.getNextEcrRef(),
      };
      await this.sendToTerminal(message);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "Cancel failed",
      };
    }
  }

  async getTerminalStatus(): Promise<TerminalStatusResponse> {
    if (!this.config) {
      return { connected: false, errorMessage: "Not configured" };
    }

    try {
      const url = `http://${this.config.ipAddress}:${this.config.port}/api/v1/status`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return { connected: true };
      }
      return { connected: false, errorMessage: `HTTP ${response.status}` };
    } catch (err) {
      return {
        connected: false,
        errorMessage: err instanceof Error ? err.message : "Status check failed",
      };
    }
  }

  async resetTerminal(): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const message: HeartlandPayAppMessage = {
        SaleType: "Reset",
        EcrReferenceNumber: this.getNextEcrRef(),
      };
      await this.sendToTerminal(message);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "Reset failed",
      };
    }
  }
}

export function createHeartlandSemiIntegratedTerminal(): HeartlandSemiIntegratedTerminal {
  return new HeartlandSemiIntegratedTerminal();
}
