/**
 * Elavon Converge Payment Gateway Adapter
 * 
 * Implements the PaymentGatewayAdapter interface for Elavon Converge.
 * Uses the Converge REST API for payment processing.
 * 
 * API Documentation: https://developer.elavon.com/docs/converge
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
  TransactionStatusRequest,
  TransactionStatusResponse,
} from '../types';
import { registerPaymentAdapter } from '../registry';

interface ElavonSettings extends GatewaySettings {
  apiEndpoint?: string;
}

interface ElavonResponse {
  ssl_result?: string; // 0 = approved
  ssl_result_message?: string;
  ssl_txn_id?: string;
  ssl_approval_code?: string;
  ssl_card_type?: string;
  ssl_card_number?: string; // Masked, last 4 visible
  ssl_exp_date?: string;
  ssl_amount?: string;
  ssl_avs_response?: string;
  ssl_cvv2_response?: string;
  ssl_token?: string;
  ssl_entry_mode?: string;
  errorCode?: string;
  errorMessage?: string;
}

class ElavonConvergeAdapter implements PaymentGatewayAdapter {
  readonly gatewayType = 'elavon_converge';
  private merchantId: string;
  private userId: string;
  private pin: string;
  private apiEndpoint: string;
  private environment: 'sandbox' | 'production';

  constructor(
    credentials: GatewayCredentials,
    settings: ElavonSettings,
    environment: 'sandbox' | 'production'
  ) {
    this.merchantId = credentials.MERCHANT_ID || '';
    this.userId = credentials.USER_ID || '';
    this.pin = credentials.PIN || '';
    this.environment = environment;
    
    // Set API endpoint based on environment
    if (settings.apiEndpoint) {
      this.apiEndpoint = settings.apiEndpoint;
    } else if (environment === 'sandbox') {
      this.apiEndpoint = 'https://api.demo.convergepay.com/VirtualMerchantDemo';
    } else {
      this.apiEndpoint = 'https://api.convergepay.com/VirtualMerchant';
    }
    
    if (!this.merchantId || !this.userId || !this.pin) {
      throw new Error('Elavon credentials (MERCHANT_ID, USER_ID, PIN) are required');
    }
  }

  private async makeRequest(transactionType: string, params: Record<string, string>): Promise<ElavonResponse> {
    const requestBody = new URLSearchParams({
      ssl_merchant_id: this.merchantId,
      ssl_user_id: this.userId,
      ssl_pin: this.pin,
      ssl_transaction_type: transactionType,
      ssl_show_form: 'false',
      ssl_result_format: 'JSON',
      ...params,
    });

    try {
      const response = await fetch(`${this.apiEndpoint}/processjson.do`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody.toString(),
      });

      if (!response.ok) {
        return {
          ssl_result: '1',
          errorCode: 'HTTP_ERROR',
          errorMessage: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json() as ElavonResponse;
      return data;
    } catch (error) {
      return {
        ssl_result: '1',
        errorCode: 'NETWORK_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  private formatAmount(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  private parseCardBrand(cardType?: string): string {
    const brandMap: Record<string, string> = {
      'VISA': 'visa',
      'MASTERCARD': 'mastercard',
      'MC': 'mastercard',
      'AMEX': 'amex',
      'AMERICAN EXPRESS': 'amex',
      'DISCOVER': 'discover',
      'DINERS': 'diners',
    };
    return brandMap[cardType?.toUpperCase() || ''] || cardType?.toLowerCase() || 'unknown';
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    // For terminal-based transactions, you would use the Commerce SDK
    // This implementation is for direct API auth (card-not-present or tokenized)
    
    const params: Record<string, string> = {
      ssl_amount: this.formatAmount(request.amount),
    };

    if (request.orderId) {
      params.ssl_invoice_number = request.orderId;
    }

    const response = await this.makeRequest('ccauthonly', params);
    const isApproved = response.ssl_result === '0';

    return {
      success: isApproved,
      transactionId: response.ssl_txn_id || '',
      authCode: response.ssl_approval_code,
      referenceNumber: response.ssl_txn_id,
      cardBrand: this.parseCardBrand(response.ssl_card_type),
      cardLast4: response.ssl_card_number?.slice(-4),
      responseCode: response.ssl_result,
      responseMessage: response.ssl_result_message,
      avsResult: response.ssl_avs_response,
      cvvResult: response.ssl_cvv2_response,
      errorCode: isApproved ? undefined : response.errorCode || response.ssl_result,
      errorMessage: isApproved ? undefined : response.errorMessage || response.ssl_result_message,
      declined: !isApproved && response.ssl_result !== undefined,
      declineReason: isApproved ? undefined : response.ssl_result_message,
      entryMode: response.ssl_entry_mode,
    };
  }

  async capture(request: CaptureRequest): Promise<CaptureResponse> {
    const captureAmount = request.amount + (request.tipAmount || 0);
    
    const params: Record<string, string> = {
      ssl_txn_id: request.transactionId,
      ssl_amount: this.formatAmount(captureAmount),
    };

    if (request.tipAmount) {
      params.ssl_tip_amount = this.formatAmount(request.tipAmount);
    }

    const response = await this.makeRequest('cccomplete', params);
    const isApproved = response.ssl_result === '0';

    return {
      success: isApproved,
      transactionId: response.ssl_txn_id || request.transactionId,
      capturedAmount: isApproved ? captureAmount : 0,
      responseCode: response.ssl_result,
      responseMessage: response.ssl_result_message,
      errorCode: isApproved ? undefined : response.errorCode || response.ssl_result,
      errorMessage: isApproved ? undefined : response.errorMessage || response.ssl_result_message,
    };
  }

  async void(request: VoidRequest): Promise<VoidResponse> {
    const response = await this.makeRequest('ccvoid', {
      ssl_txn_id: request.transactionId,
    });

    const isApproved = response.ssl_result === '0';

    return {
      success: isApproved,
      transactionId: response.ssl_txn_id || request.transactionId,
      responseCode: response.ssl_result,
      responseMessage: response.ssl_result_message,
      errorCode: isApproved ? undefined : response.errorCode || response.ssl_result,
      errorMessage: isApproved ? undefined : response.errorMessage || response.ssl_result_message,
    };
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const response = await this.makeRequest('ccreturn', {
      ssl_txn_id: request.transactionId,
      ssl_amount: this.formatAmount(request.amount),
    });

    const isApproved = response.ssl_result === '0';

    return {
      success: isApproved,
      transactionId: response.ssl_txn_id || '',
      refundedAmount: isApproved ? request.amount : 0,
      responseCode: response.ssl_result,
      responseMessage: response.ssl_result_message,
      errorCode: isApproved ? undefined : response.errorCode || response.ssl_result,
      errorMessage: isApproved ? undefined : response.errorMessage || response.ssl_result_message,
    };
  }

  async tipAdjust(request: TipAdjustRequest): Promise<TipAdjustResponse> {
    // Elavon supports tip adjustment via ccupdatetip transaction
    const response = await this.makeRequest('ccupdatetip', {
      ssl_txn_id: request.transactionId,
      ssl_tip_amount: this.formatAmount(request.tipAmount),
    });

    const isApproved = response.ssl_result === '0';
    const newTotal = response.ssl_amount ? Math.round(parseFloat(response.ssl_amount) * 100) : 0;

    return {
      success: isApproved,
      transactionId: response.ssl_txn_id || request.transactionId,
      newTotalAmount: newTotal,
      tipAmount: request.tipAmount,
      responseCode: response.ssl_result,
      responseMessage: response.ssl_result_message,
      errorCode: isApproved ? undefined : response.errorCode || response.ssl_result,
      errorMessage: isApproved ? undefined : response.errorMessage || response.ssl_result_message,
    };
  }

  async getTransactionStatus(request: TransactionStatusRequest): Promise<TransactionStatusResponse> {
    // Query transaction details using txnquery
    const response = await this.makeRequest('txnquery', {
      ssl_txn_id: request.transactionId,
    });

    const isApproved = response.ssl_result === '0';
    const amount = response.ssl_amount ? Math.round(parseFloat(response.ssl_amount) * 100) : 0;

    // Map Elavon status to our standard
    let status: TransactionStatusResponse['status'] = 'unknown';
    // Note: Elavon doesn't directly expose status in query, would need to track locally

    return {
      success: isApproved,
      transactionId: request.transactionId,
      status,
      amount,
      authCode: response.ssl_approval_code,
      cardBrand: this.parseCardBrand(response.ssl_card_type),
      cardLast4: response.ssl_card_number?.slice(-4),
    };
  }

  async sale(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    // Sale = auth + capture in one step
    const params: Record<string, string> = {
      ssl_amount: this.formatAmount(request.amount),
    };

    if (request.orderId) {
      params.ssl_invoice_number = request.orderId;
    }

    const response = await this.makeRequest('ccsale', params);
    const isApproved = response.ssl_result === '0';

    return {
      success: isApproved,
      transactionId: response.ssl_txn_id || '',
      authCode: response.ssl_approval_code,
      referenceNumber: response.ssl_txn_id,
      cardBrand: this.parseCardBrand(response.ssl_card_type),
      cardLast4: response.ssl_card_number?.slice(-4),
      responseCode: response.ssl_result,
      responseMessage: response.ssl_result_message,
      avsResult: response.ssl_avs_response,
      cvvResult: response.ssl_cvv2_response,
      errorCode: isApproved ? undefined : response.errorCode || response.ssl_result,
      errorMessage: isApproved ? undefined : response.errorMessage || response.ssl_result_message,
      declined: !isApproved,
      declineReason: isApproved ? undefined : response.ssl_result_message,
      entryMode: response.ssl_entry_mode,
    };
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      // Perform a small auth to test credentials (some gateways support a $0 auth)
      // For Elavon, we'll try to query a non-existent transaction which should return a valid error
      const response = await this.makeRequest('txnquery', {
        ssl_txn_id: 'TEST_CONNECTION_000000',
      });

      // If we get any response without a network error, connection is working
      if (response.errorCode === 'NETWORK_ERROR') {
        return {
          success: false,
          message: response.errorMessage || 'Network connection failed',
        };
      }

      return {
        success: true,
        message: `Elavon Converge connection successful (${this.environment})`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }
}

// Factory function
function createElavonAdapter(
  credentials: GatewayCredentials,
  settings: GatewaySettings,
  environment: 'sandbox' | 'production'
): PaymentGatewayAdapter {
  return new ElavonConvergeAdapter(credentials, settings as ElavonSettings, environment);
}

// Register the adapter
registerPaymentAdapter('elavon_converge', createElavonAdapter);

export { ElavonConvergeAdapter, createElavonAdapter };
