/**
 * North Payments - Ingenico Semi-Integrated Payment Gateway Adapter
 * 
 * Implements the PaymentGatewayAdapter interface for North's Ingenico SI API.
 * Supports both LAN-based (direct HTTP) and Cloud WebSocket communication.
 * 
 * Transaction Types:
 *   CCR0 - Account Verification
 *   CCR1 - Sale (Auth + Capture)
 *   CCR2 - Auth Only
 *   CCR4 - Capture Only (post-auth)
 *   CCRX - Void
 *   CCR7 - Reversal
 *   CCR9 - Refund
 *   DB00 - PIN Debit Sale
 *   DB01 - PIN Debit Return
 * 
 * API Documentation: https://developer.north.com/products/in-person/semi-integrated/ingenico-si-api
 * Cloud API: https://developer.north.com/products/in-person/semi-integrated/ingenico-si-cloud-api
 */

import type {
  PaymentGatewayAdapter,
  GatewayCredentials,
  GatewaySettings,
  AuthorizationRequest,
  AuthorizationResponse,
  CaptureRequest,
  CaptureResponse,
  VoidRequest,
  VoidResponse,
  RefundRequest,
  RefundResponse,
  TipAdjustRequest,
  TipAdjustResponse,
  BatchCloseRequest,
  BatchCloseResponse,
  TransactionStatusRequest,
  TransactionStatusResponse,
  TerminalPaymentRequest,
  TerminalPaymentResponse,
  TerminalPaymentStatusResponse,
} from '../types';
import { registerPaymentAdapter } from '../registry';

const CLOUD_SANDBOX_URL = 'wss://epxpay-stg.nabancard.io/staging/';
const CLOUD_PRODUCTION_URL = 'wss://epxpay.nabancard.io/production/';

const DEFAULT_LAN_PORT = 12000;
const TERMINAL_TIMEOUT_MS = 120000;

interface NorthSettings extends GatewaySettings {
  terminalIp?: string;
  terminalPort?: number;
  connectionMode?: 'lan' | 'cloud';
  fourPartKey?: string;
  macTic?: string;
}

interface NorthXmlResponse {
  AUTH_RESP?: string;
  AUTH_RESP_TEXT?: string;
  AUTH_CODE?: string;
  AUTH_GUID?: string;
  AUTH_AMOUNT?: string;
  AUTH_AMOUNT_REQUESTED?: string;
  AUTH_MASKED_ACCOUNT_NBR?: string;
  AUTH_CARD_TYPE?: string;
  CARD_ENT_METH?: string;
  FIRST_NAME?: string;
  LAST_NAME?: string;
  TRAN_TYPE?: string;
  TRAN_NBR?: string;
  BATCH_ID?: string;
  ROUTING?: string;
  CURRENCY_CODE?: string;
  SI_SIGNATURE_REQUIRED?: string;
  SI_QUICK_SERVICE?: string;
  AUTH_TRAN_DATE_GMT?: string;
  CUST_NBR?: string;
  MERCH_NBR?: string;
  DBA_NBR?: string;
  TERMINAL_NBR?: string;
  TIP_AMT?: string;
  INVOICE_NBR?: string;
  ERROR_TEXT?: string;
}

const EPX_RESPONSE_CODES: Record<string, { display: string; description: string; declined?: boolean }> = {
  '00': { display: 'APPROVAL', description: 'Approved' },
  '01': { display: 'CALL', description: 'Refer to card issuer' },
  '02': { display: 'CALL', description: 'Refer to card issuer, special condition' },
  '03': { display: 'TERM ID ERROR', description: 'Invalid merchant or service provider' },
  '04': { display: 'HOLD-CALL', description: 'Pick up card (no fraud)', declined: true },
  '05': { display: 'DECLINE', description: 'Do not honor', declined: true },
  '06': { display: 'ERROR', description: 'Error' },
  '07': { display: 'HOLD-CALL', description: 'Pick up card, special condition', declined: true },
  '10': { display: 'PARTIAL APPROVED', description: 'Approved partial' },
  '12': { display: 'INVALID TRANS', description: 'Invalid transaction' },
  '13': { display: 'AMOUNT ERROR', description: 'Invalid amount' },
  '14': { display: 'CARD NO. ERROR', description: 'Invalid account number', declined: true },
  '15': { display: 'NO SUCH ISSUER', description: 'No such issuer' },
  '19': { display: 'RE ENTER', description: 'Re-enter transaction' },
  '25': { display: 'UNABLE TO LOCATE', description: 'Unable to locate record in file' },
  '28': { display: 'NO REPLY', description: 'File is temporarily unavailable' },
  '30': { display: 'FORMAT ERROR', description: 'Format error' },
  '41': { display: 'HOLD-CALL', description: 'Lost card, pick up card', declined: true },
  '43': { display: 'HOLD-CALL', description: 'Stolen card, pick up', declined: true },
  '51': { display: 'INSUFF FUNDS', description: 'Insufficient funds', declined: true },
  '54': { display: 'EXPIRED CARD', description: 'Expired card', declined: true },
  '55': { display: 'WRONG PIN', description: 'Incorrect PIN', declined: true },
  '57': { display: 'SERV NOT ALLOWED', description: 'Transaction not permitted to cardholder', declined: true },
  '58': { display: 'SERV NOT ALLOWED', description: 'Transaction not permitted to terminal', declined: true },
  '61': { display: 'DECLINE', description: 'Exceeds approval amount limit', declined: true },
  '62': { display: 'DECLINE', description: 'Restricted card', declined: true },
  '63': { display: 'SEC VIOLATION', description: 'Security violation', declined: true },
  '65': { display: 'DECLINE', description: 'Activity count limit exceeded', declined: true },
  '75': { display: 'PIN EXCEEDED', description: 'Allowable PIN entry tries exceeded', declined: true },
  '82': { display: 'CVV ERROR', description: 'Incorrect CVV', declined: true },
  '85': { display: 'NOT DECLINED', description: 'Issuer has no reason to decline' },
  '91': { display: 'NO REPLY', description: 'Issuer unavailable or switch inoperative' },
  '96': { display: 'SYSTEM ERROR', description: 'System malfunction' },
  'N7': { display: 'CVV2 MISMATCH', description: 'Decline for CVV2 failure', declined: true },
  'RR': { display: 'ERROR', description: 'Invalid data supplied in request' },
  'S5': { display: 'UNABLE TO LOCATE', description: 'Unable to locate matching original purchase' },
  'S7': { display: 'INVALID RETURN', description: 'Unable to locate matching original purchase' },
  'S8': { display: 'NO AUTHORIZATION', description: 'Unable to locate matching authorization' },
};

const CARD_TYPE_MAP: Record<string, string> = {
  'V': 'visa',
  'M': 'mastercard',
  'X': 'amex',
  'D': 'discover',
  'J': 'jcb',
  'C': 'diners',
  'P': 'debit',
};

const ENTRY_METHOD_MAP: Record<string, string> = {
  'G': 'chip',
  'C': 'contactless',
  'S': 'swipe',
  'M': 'manual',
  'F': 'fallback_swipe',
};

function buildXmlPayload(fields: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`<${key}>${value}</${key}>`);
    }
  }
  return `<DETAIL>${parts.join('')}</DETAIL>`;
}

function parseXmlResponse(xml: string): NorthXmlResponse {
  const result: Record<string, string> = {};
  const tagPattern = /<([A-Z_]+)>([^<]*)<\/\1>/g;
  let match;
  while ((match = tagPattern.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result as NorthXmlResponse;
}

function extractLast4(maskedNumber?: string): string | undefined {
  if (!maskedNumber) return undefined;
  const cleaned = maskedNumber.replace(/[^0-9]/g, '');
  return cleaned.length >= 4 ? cleaned.slice(-4) : undefined;
}

function mapCardBrand(cardType?: string): string | undefined {
  if (!cardType) return undefined;
  return CARD_TYPE_MAP[cardType] || cardType.toLowerCase();
}

function mapEntryMode(entryMethod?: string): string | undefined {
  if (!entryMethod) return undefined;
  return ENTRY_METHOD_MAP[entryMethod] || entryMethod;
}

function isApproved(authResp?: string): boolean {
  return authResp === '00' || authResp === '85' || authResp === '10';
}

function getResponseInfo(authResp?: string): { display: string; description: string; declined: boolean } {
  if (!authResp) return { display: 'NO RESPONSE', description: 'No response received', declined: false };
  const info = EPX_RESPONSE_CODES[authResp];
  if (info) return { ...info, declined: info.declined || false };
  return { display: 'UNKNOWN', description: `Unknown response code: ${authResp}`, declined: true };
}

class NorthIngenicoAdapter implements PaymentGatewayAdapter {
  readonly gatewayType = 'north_ingenico';
  private fourPartKey: string;
  private macTic: string;
  private terminalIp?: string;
  private terminalPort: number;
  private connectionMode: 'lan' | 'cloud';
  private environment: 'sandbox' | 'production';
  private cloudUrl: string;
  private tranCounter: number = 0;

  constructor(
    credentials: GatewayCredentials,
    settings: GatewaySettings,
    environment: 'sandbox' | 'production'
  ) {
    const northSettings = settings as NorthSettings;

    this.fourPartKey = credentials.FOUR_PART_KEY || northSettings.fourPartKey || '';
    this.macTic = credentials.MAC_TIC || northSettings.macTic || '';

    if (!this.fourPartKey) {
      throw new Error('North FOUR_PART_KEY is required (format: CUST_NBR-MERCH_NBR-DBA_NBR-TERMINAL_NBR)');
    }
    if (!this.macTic) {
      throw new Error('North MAC_TIC is required');
    }

    this.terminalIp = northSettings.terminalIp;
    this.terminalPort = northSettings.terminalPort || DEFAULT_LAN_PORT;
    this.connectionMode = northSettings.connectionMode || 'cloud';
    this.environment = environment;
    this.cloudUrl = environment === 'production' ? CLOUD_PRODUCTION_URL : CLOUD_SANDBOX_URL;
  }

  private nextTranNbr(): number {
    this.tranCounter++;
    return this.tranCounter;
  }

  private getBatchId(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  private async sendViaCloudWebSocket(xmlPayload: string): Promise<NorthXmlResponse> {
    return new Promise((resolve, reject) => {
      const merchantId = `${this.fourPartKey}-${this.macTic}`;
      const wsUrl = `${this.cloudUrl}?merchantId=${merchantId}`;

      let resolved = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      try {
        const WebSocketImpl = typeof WebSocket !== 'undefined'
          ? WebSocket
          : require('ws');

        const ws = new WebSocketImpl(wsUrl);

        timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try { ws.close(); } catch (_e) { /* ignore */ }
            reject(new Error('Terminal response timeout'));
          }
        }, TERMINAL_TIMEOUT_MS);

        ws.onopen = () => {
          const message = JSON.stringify({
            action: 'sendMessage',
            message: xmlPayload,
          });
          ws.send(message);
        };

        ws.onmessage = (event: any) => {
          const data = typeof event.data === 'string' ? event.data : String(event.data);

          if (data.includes('<AUTH_RESP>') || data.includes('<ERROR_TEXT>') || data.includes('<RESPONSE>')) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              try { ws.close(); } catch (_e) { /* ignore */ }
              resolve(parseXmlResponse(data));
            }
          }
        };

        ws.onerror = (error: any) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            reject(new Error(`WebSocket error: ${error.message || 'Connection failed'}`));
          }
        };

        ws.onclose = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            reject(new Error('WebSocket connection closed before response'));
          }
        };
      } catch (error) {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Failed to create WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    });
  }

  private async sendViaLan(xmlPayload: string): Promise<NorthXmlResponse> {
    if (!this.terminalIp) {
      throw new Error('Terminal IP address required for LAN connection mode');
    }

    const url = `http://${this.terminalIp}:${this.terminalPort}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TERMINAL_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
        },
        body: xmlPayload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      return parseXmlResponse(responseText);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Terminal response timeout (LAN)');
      }
      throw error;
    }
  }

  private async sendTransaction(xmlPayload: string): Promise<NorthXmlResponse> {
    if (this.connectionMode === 'lan') {
      return this.sendViaLan(xmlPayload);
    }
    return this.sendViaCloudWebSocket(xmlPayload);
  }

  private buildAuthResponse(parsed: NorthXmlResponse, tranType: string): AuthorizationResponse {
    const approved = isApproved(parsed.AUTH_RESP);
    const responseInfo = getResponseInfo(parsed.AUTH_RESP);

    return {
      success: approved,
      transactionId: parsed.AUTH_GUID || '',
      authCode: parsed.AUTH_CODE,
      referenceNumber: parsed.AUTH_GUID,
      cardBrand: mapCardBrand(parsed.AUTH_CARD_TYPE),
      cardLast4: extractLast4(parsed.AUTH_MASKED_ACCOUNT_NBR),
      entryMode: mapEntryMode(parsed.CARD_ENT_METH),
      responseCode: parsed.AUTH_RESP,
      responseMessage: parsed.AUTH_RESP_TEXT || responseInfo.display,
      errorCode: approved ? undefined : parsed.AUTH_RESP,
      errorMessage: approved ? undefined : (parsed.AUTH_RESP_TEXT || responseInfo.description),
      declined: responseInfo.declined,
      declineReason: responseInfo.declined ? (parsed.AUTH_RESP_TEXT || responseInfo.description) : undefined,
    };
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      const xml = buildXmlPayload({
        TRAN_TYPE: 'CCR2',
        AMOUNT: (request.amount / 100).toFixed(2),
        TRAN_NBR: String(this.nextTranNbr()),
        BATCH_ID: this.getBatchId(),
        INVOICE_NBR: request.orderId,
        CLERK_ID: request.employeeId,
      });

      const parsed = await this.sendTransaction(xml);
      return this.buildAuthResponse(parsed, 'CCR2');
    } catch (error) {
      return {
        success: false,
        transactionId: '',
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Authorization failed',
      };
    }
  }

  async sale(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      const xml = buildXmlPayload({
        TRAN_TYPE: 'CCR1',
        AMOUNT: (request.amount / 100).toFixed(2),
        TRAN_NBR: String(this.nextTranNbr()),
        BATCH_ID: this.getBatchId(),
        INVOICE_NBR: request.orderId,
        CLERK_ID: request.employeeId,
      });

      const parsed = await this.sendTransaction(xml);
      return this.buildAuthResponse(parsed, 'CCR1');
    } catch (error) {
      return {
        success: false,
        transactionId: '',
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Sale failed',
      };
    }
  }

  async capture(request: CaptureRequest): Promise<CaptureResponse> {
    try {
      const fields: Record<string, string | number | undefined> = {
        TRAN_TYPE: 'CCR4',
        AUTH_GUID: request.transactionId,
        AMOUNT: (request.amount / 100).toFixed(2),
        TRAN_NBR: String(this.nextTranNbr()),
        BATCH_ID: this.getBatchId(),
      };

      if (request.tipAmount && request.tipAmount > 0) {
        fields.TIP_AMT = (request.tipAmount / 100).toFixed(2);
      }

      const xml = buildXmlPayload(fields);
      const parsed = await this.sendTransaction(xml);
      const approved = isApproved(parsed.AUTH_RESP);

      return {
        success: approved,
        transactionId: parsed.AUTH_GUID || request.transactionId,
        capturedAmount: approved ? request.amount : 0,
        responseCode: parsed.AUTH_RESP,
        responseMessage: parsed.AUTH_RESP_TEXT,
        errorCode: approved ? undefined : parsed.AUTH_RESP,
        errorMessage: approved ? undefined : parsed.AUTH_RESP_TEXT,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        capturedAmount: 0,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Capture failed',
      };
    }
  }

  async void(request: VoidRequest): Promise<VoidResponse> {
    try {
      const xml = buildXmlPayload({
        TRAN_TYPE: 'CCRX',
        AUTH_GUID: request.transactionId,
      });

      const parsed = await this.sendTransaction(xml);
      const approved = isApproved(parsed.AUTH_RESP);

      return {
        success: approved,
        transactionId: parsed.AUTH_GUID || request.transactionId,
        responseCode: parsed.AUTH_RESP,
        responseMessage: parsed.AUTH_RESP_TEXT,
        errorCode: approved ? undefined : parsed.AUTH_RESP,
        errorMessage: approved ? undefined : parsed.AUTH_RESP_TEXT,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Void failed',
      };
    }
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    try {
      const fields: Record<string, string | number | undefined> = {
        TRAN_TYPE: 'CCR9',
        AMOUNT: (request.amount / 100).toFixed(2),
        TRAN_NBR: String(this.nextTranNbr()),
        BATCH_ID: this.getBatchId(),
      };

      if (request.transactionId) {
        fields.AUTH_GUID = request.transactionId;
      }

      const xml = buildXmlPayload(fields);
      const parsed = await this.sendTransaction(xml);
      const approved = isApproved(parsed.AUTH_RESP);

      return {
        success: approved,
        transactionId: parsed.AUTH_GUID || request.transactionId,
        refundedAmount: approved ? request.amount : 0,
        responseCode: parsed.AUTH_RESP,
        responseMessage: parsed.AUTH_RESP_TEXT,
        errorCode: approved ? undefined : parsed.AUTH_RESP,
        errorMessage: approved ? undefined : parsed.AUTH_RESP_TEXT,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        refundedAmount: 0,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }

  async tipAdjust(request: TipAdjustRequest): Promise<TipAdjustResponse> {
    try {
      const xml = buildXmlPayload({
        TRAN_TYPE: 'CCR4',
        AUTH_GUID: request.transactionId,
        TIP_AMT: (request.tipAmount / 100).toFixed(2),
        TRAN_NBR: String(this.nextTranNbr()),
        BATCH_ID: this.getBatchId(),
      });

      const parsed = await this.sendTransaction(xml);
      const approved = isApproved(parsed.AUTH_RESP);
      const totalAmount = parsed.AUTH_AMOUNT ? Math.round(parseFloat(parsed.AUTH_AMOUNT) * 100) : 0;

      return {
        success: approved,
        transactionId: parsed.AUTH_GUID || request.transactionId,
        newTotalAmount: totalAmount,
        tipAmount: request.tipAmount,
        responseCode: parsed.AUTH_RESP,
        responseMessage: parsed.AUTH_RESP_TEXT,
        errorCode: approved ? undefined : parsed.AUTH_RESP,
        errorMessage: approved ? undefined : parsed.AUTH_RESP_TEXT,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        newTotalAmount: 0,
        tipAmount: 0,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Tip adjust failed',
      };
    }
  }

  async batchClose(_request: BatchCloseRequest): Promise<BatchCloseResponse> {
    return {
      success: false,
      batchId: this.getBatchId(),
      transactionCount: 0,
      totalAmount: 0,
      errorCode: 'NOT_SUPPORTED',
      errorMessage: 'Batch close is managed automatically by North/EPX. Use Payments Hub for manual batch operations.',
    };
  }

  async getTransactionStatus(_request: TransactionStatusRequest): Promise<TransactionStatusResponse> {
    return {
      success: false,
      transactionId: _request.transactionId,
      status: 'unknown',
      amount: 0,
    };
  }

  async initiateTerminalPayment(request: TerminalPaymentRequest): Promise<TerminalPaymentResponse> {
    try {
      const xml = buildXmlPayload({
        TRAN_TYPE: 'CCR1',
        AMOUNT: (request.amount / 100).toFixed(2),
        TRAN_NBR: String(this.nextTranNbr()),
        BATCH_ID: this.getBatchId(),
        INVOICE_NBR: request.metadata?.orderId,
        CLERK_ID: request.metadata?.employeeId,
      });

      const parsed = await this.sendTransaction(xml);
      const approved = isApproved(parsed.AUTH_RESP);

      if (approved) {
        return {
          success: true,
          processorReference: parsed.AUTH_GUID,
        };
      }

      const responseInfo = getResponseInfo(parsed.AUTH_RESP);
      return {
        success: false,
        errorMessage: parsed.AUTH_RESP_TEXT || responseInfo.description,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Terminal payment failed',
      };
    }
  }

  async checkTerminalPaymentStatus(processorReference: string): Promise<TerminalPaymentStatusResponse> {
    return {
      status: 'succeeded',
      cardBrand: undefined,
      cardLast4: undefined,
      authCode: undefined,
    };
  }

  async cancelTerminalPayment(_processorReference: string): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'Cancel must be performed on the terminal device directly',
    };
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const xml = buildXmlPayload({
        TRAN_TYPE: 'CCR0',
        TRAN_NBR: String(this.nextTranNbr()),
        BATCH_ID: this.getBatchId(),
      });

      const parsed = await this.sendTransaction(xml);
      const approved = isApproved(parsed.AUTH_RESP);

      if (approved) {
        return {
          success: true,
          message: `North Ingenico connection successful (${this.environment}, ${this.connectionMode}). Response: ${parsed.AUTH_RESP_TEXT || 'OK'}`,
        };
      }

      return {
        success: false,
        message: `North Ingenico test failed: ${parsed.AUTH_RESP_TEXT || parsed.ERROR_TEXT || 'Unknown error'} (code: ${parsed.AUTH_RESP})`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }
}

function createNorthIngenicoAdapter(
  credentials: GatewayCredentials,
  settings: GatewaySettings,
  environment: 'sandbox' | 'production'
): PaymentGatewayAdapter {
  return new NorthIngenicoAdapter(credentials, settings, environment);
}

registerPaymentAdapter('north_ingenico', createNorthIngenicoAdapter);

export { NorthIngenicoAdapter, createNorthIngenicoAdapter };
export {
  buildXmlPayload,
  parseXmlResponse,
  isApproved,
  getResponseInfo,
  EPX_RESPONSE_CODES,
  CARD_TYPE_MAP,
  ENTRY_METHOD_MAP,
  CLOUD_SANDBOX_URL,
  CLOUD_PRODUCTION_URL,
};
export type { NorthXmlResponse, NorthSettings };
