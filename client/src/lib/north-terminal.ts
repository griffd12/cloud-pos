/**
 * North Ingenico SI Cloud API - Client-Side Terminal Service
 * 
 * WebSocket-based communication with Ingenico terminals via North's Cloud API.
 * Works from both web browsers and Electron - no LAN restrictions.
 * 
 * Connection: wss://epxpay-stg.nabancard.io/staging/?merchantId={fourPartKey}-{macTic}
 * 
 * Transaction flow:
 *   1. Open WebSocket connection with merchant credentials
 *   2. Send JSON { action: "sendMessage", message: "<DETAIL>...</DETAIL>" }
 *   3. Receive XML response with AUTH_RESP, AUTH_GUID, etc.
 *   4. Close connection after transaction completes
 */

const CLOUD_SANDBOX_URL = 'wss://epxpay-stg.nabancard.io/staging/';
const CLOUD_PRODUCTION_URL = 'wss://epxpay.nabancard.io/production/';
const TERMINAL_TIMEOUT_MS = 120000;

export type NorthTransactionType =
  | 'CCR0'  // Account Verification
  | 'CCR1'  // Sale (Auth + Capture)
  | 'CCR2'  // Auth Only
  | 'CCR4'  // Capture Only
  | 'CCRX'  // Void
  | 'CCR7'  // Reversal
  | 'CCR9'  // Refund
  | 'DB00'  // PIN Debit Sale
  | 'DB01'  // PIN Debit Return
  | 'DB0V'  // PIN Debit Reversal
  | 'EB00'  // Food Stamp Purchase
  | 'EB01'  // EBT Return
  | 'EB02'  // Food Stamp Balance Inquiry
  | 'EB05'; // EBT Cash Benefits Purchase

export interface NorthTransactionRequest {
  tranType: NorthTransactionType;
  amount?: number;
  tipAmount?: number;
  taxAmount?: number;
  invoiceNumber?: string;
  clerkId?: string;
  authGuid?: string;
  batchId?: string;
  tranNbr?: number;
}

export interface NorthTransactionResponse {
  success: boolean;
  authResp?: string;
  authRespText?: string;
  authCode?: string;
  authGuid?: string;
  authAmount?: string;
  maskedAccountNbr?: string;
  cardType?: string;
  cardEntryMethod?: string;
  firstName?: string;
  lastName?: string;
  tranType?: string;
  batchId?: string;
  tranNbr?: string;
  signatureRequired?: boolean;
  errorText?: string;
  rawXml?: string;
}

export type NorthConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'sending'
  | 'waiting_for_card'
  | 'processing'
  | 'completed'
  | 'error'
  | 'timeout';

export type NorthStatusCallback = (status: NorthConnectionStatus, message?: string) => void;

const CARD_TYPE_LABELS: Record<string, string> = {
  'V': 'Visa',
  'M': 'Mastercard',
  'X': 'American Express',
  'D': 'Discover',
  'J': 'JCB',
  'C': 'Diners Club',
  'P': 'Debit',
};

const ENTRY_METHOD_LABELS: Record<string, string> = {
  'G': 'Chip',
  'C': 'Contactless',
  'S': 'Swipe',
  'M': 'Manual',
  'F': 'Fallback Swipe',
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

function parseXmlResponse(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const tagPattern = /<([A-Z_]+)>([^<]*)<\/\1>/g;
  let match;
  while ((match = tagPattern.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

export function getCardTypeLabel(code?: string): string {
  if (!code) return 'Unknown';
  return CARD_TYPE_LABELS[code] || code;
}

export function getEntryMethodLabel(code?: string): string {
  if (!code) return 'Unknown';
  return ENTRY_METHOD_LABELS[code] || code;
}

export function extractLast4(maskedNumber?: string): string | undefined {
  if (!maskedNumber) return undefined;
  const cleaned = maskedNumber.replace(/[^0-9]/g, '');
  return cleaned.length >= 4 ? cleaned.slice(-4) : undefined;
}

export function isApproved(authResp?: string): boolean {
  return authResp === '00' || authResp === '85' || authResp === '10';
}

class NorthTerminalService {
  private environment: 'sandbox' | 'production' = 'sandbox';
  private fourPartKey: string = '';
  private macTic: string = '';
  private tranCounter: number = 0;
  private ws: WebSocket | null = null;
  private statusCallback: NorthStatusCallback | null = null;

  configure(config: {
    environment: 'sandbox' | 'production';
    fourPartKey: string;
    macTic: string;
  }): void {
    this.environment = config.environment;
    this.fourPartKey = config.fourPartKey;
    this.macTic = config.macTic;
  }

  isConfigured(): boolean {
    return !!this.fourPartKey && !!this.macTic;
  }

  onStatusChange(callback: NorthStatusCallback): void {
    this.statusCallback = callback;
  }

  private updateStatus(status: NorthConnectionStatus, message?: string): void {
    if (this.statusCallback) {
      this.statusCallback(status, message);
    }
  }

  private getCloudUrl(): string {
    return this.environment === 'production' ? CLOUD_PRODUCTION_URL : CLOUD_SANDBOX_URL;
  }

  private getMerchantId(): string {
    return `${this.fourPartKey}-${this.macTic}`;
  }

  private nextTranNbr(): number {
    this.tranCounter++;
    return this.tranCounter;
  }

  private getBatchId(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  buildTransactionXml(request: NorthTransactionRequest): string {
    const fields: Record<string, string | number | undefined> = {
      TRAN_TYPE: request.tranType,
    };

    if (request.amount !== undefined) {
      fields.AMOUNT = (request.amount / 100).toFixed(2);
    }
    if (request.tipAmount !== undefined && request.tipAmount > 0) {
      fields.TIP_AMT = (request.tipAmount / 100).toFixed(2);
    }
    if (request.taxAmount !== undefined && request.taxAmount > 0) {
      fields.TAX_AMT = (request.taxAmount / 100).toFixed(2);
    }
    if (request.authGuid) {
      fields.AUTH_GUID = request.authGuid;
    }
    if (request.invoiceNumber) {
      fields.INVOICE_NBR = request.invoiceNumber;
    }
    if (request.clerkId) {
      fields.CLERK_ID = request.clerkId;
    }

    fields.TRAN_NBR = String(request.tranNbr ?? this.nextTranNbr());
    fields.BATCH_ID = request.batchId || this.getBatchId();

    return buildXmlPayload(fields);
  }

  async sendTransaction(request: NorthTransactionRequest): Promise<NorthTransactionResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        errorText: 'North terminal not configured. Set four-part key and MAC/TIC.',
      };
    }

    const xmlPayload = this.buildTransactionXml(request);

    return new Promise((resolve) => {
      let resolved = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const finish = (response: NorthTransactionResponse) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        if (this.ws) {
          try { this.ws.close(); } catch (_e) { /* ignore */ }
          this.ws = null;
        }
        resolve(response);
      };

      this.updateStatus('connecting', 'Connecting to terminal...');

      try {
        const wsUrl = `${this.getCloudUrl()}?merchantId=${this.getMerchantId()}`;
        this.ws = new WebSocket(wsUrl);

        timeoutId = setTimeout(() => {
          this.updateStatus('timeout', 'Terminal response timeout');
          finish({
            success: false,
            errorText: 'Terminal response timeout. Please try again.',
          });
        }, TERMINAL_TIMEOUT_MS);

        this.ws.onopen = () => {
          this.updateStatus('sending', 'Sending transaction to terminal...');
          const message = JSON.stringify({
            action: 'sendMessage',
            message: xmlPayload,
          });
          this.ws!.send(message);
          this.updateStatus('waiting_for_card', 'Present card on terminal...');
        };

        this.ws.onmessage = (event: MessageEvent) => {
          const data = typeof event.data === 'string' ? event.data : String(event.data);

          if (data.includes('<AUTH_RESP>') || data.includes('<ERROR_TEXT>') || data.includes('<RESPONSE>')) {
            this.updateStatus('processing', 'Processing response...');
            const parsed = parseXmlResponse(data);
            const approved = isApproved(parsed.AUTH_RESP);

            const response: NorthTransactionResponse = {
              success: approved,
              authResp: parsed.AUTH_RESP,
              authRespText: parsed.AUTH_RESP_TEXT,
              authCode: parsed.AUTH_CODE,
              authGuid: parsed.AUTH_GUID,
              authAmount: parsed.AUTH_AMOUNT,
              maskedAccountNbr: parsed.AUTH_MASKED_ACCOUNT_NBR,
              cardType: parsed.AUTH_CARD_TYPE,
              cardEntryMethod: parsed.CARD_ENT_METH,
              firstName: parsed.FIRST_NAME,
              lastName: parsed.LAST_NAME,
              tranType: parsed.TRAN_TYPE,
              batchId: parsed.BATCH_ID,
              tranNbr: parsed.TRAN_NBR,
              signatureRequired: parsed.SI_SIGNATURE_REQUIRED === 'Y',
              errorText: approved ? undefined : (parsed.AUTH_RESP_TEXT || parsed.ERROR_TEXT),
              rawXml: data,
            };

            this.updateStatus('completed', approved ? 'Approved' : `Declined: ${response.errorText}`);
            finish(response);
          }
        };

        this.ws.onerror = () => {
          this.updateStatus('error', 'Connection error');
          finish({
            success: false,
            errorText: 'WebSocket connection error. Check network and terminal status.',
          });
        };

        this.ws.onclose = () => {
          if (!resolved) {
            this.updateStatus('error', 'Connection closed unexpectedly');
            finish({
              success: false,
              errorText: 'Connection closed before receiving terminal response.',
            });
          }
        };
      } catch (error) {
        this.updateStatus('error', 'Failed to connect');
        finish({
          success: false,
          errorText: error instanceof Error ? error.message : 'Failed to create WebSocket connection',
        });
      }
    });
  }

  async sale(amount: number, options?: {
    tipAmount?: number;
    taxAmount?: number;
    invoiceNumber?: string;
    clerkId?: string;
  }): Promise<NorthTransactionResponse> {
    return this.sendTransaction({
      tranType: 'CCR1',
      amount,
      ...options,
    });
  }

  async authorize(amount: number, options?: {
    invoiceNumber?: string;
    clerkId?: string;
  }): Promise<NorthTransactionResponse> {
    return this.sendTransaction({
      tranType: 'CCR2',
      amount,
      ...options,
    });
  }

  async capture(authGuid: string, amount: number, tipAmount?: number): Promise<NorthTransactionResponse> {
    return this.sendTransaction({
      tranType: 'CCR4',
      amount,
      tipAmount,
      authGuid,
    });
  }

  async voidTransaction(authGuid: string): Promise<NorthTransactionResponse> {
    return this.sendTransaction({
      tranType: 'CCRX',
      authGuid,
    });
  }

  async refund(amount: number, authGuid?: string): Promise<NorthTransactionResponse> {
    return this.sendTransaction({
      tranType: 'CCR9',
      amount,
      authGuid,
    });
  }

  async reversal(authGuid: string): Promise<NorthTransactionResponse> {
    return this.sendTransaction({
      tranType: 'CCR7',
      authGuid,
    });
  }

  async verify(): Promise<NorthTransactionResponse> {
    return this.sendTransaction({
      tranType: 'CCR0',
    });
  }

  cancelPending(): void {
    if (this.ws) {
      try { this.ws.close(); } catch (_e) { /* ignore */ }
      this.ws = null;
    }
    this.updateStatus('disconnected', 'Transaction cancelled');
  }

  disconnect(): void {
    this.cancelPending();
  }
}

export const northTerminal = new NorthTerminalService();
export { NorthTerminalService };
