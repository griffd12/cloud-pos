/**
 * Square Payment Gateway Adapter
 * 
 * Implements the PaymentGatewayAdapter interface for Square.
 * Uses Square's Payments API and Terminal API for card-present transactions.
 * 
 * API Documentation: https://developer.squareup.com/docs/payments-api/overview
 */

import { SquareClient, SquareError } from 'square';
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
  TransactionStatusRequest,
  TransactionStatusResponse,
} from '../types';
import { registerPaymentAdapter } from '../registry';
import crypto from 'crypto';

interface SquareSettings extends GatewaySettings {
  locationId?: string;
}

class SquarePaymentAdapter implements PaymentGatewayAdapter {
  readonly gatewayType = 'square';
  private client: SquareClient;
  private locationId: string;
  private environment: 'sandbox' | 'production';

  constructor(
    credentials: GatewayCredentials,
    settings: SquareSettings,
    environment: 'sandbox' | 'production'
  ) {
    const accessToken = credentials.ACCESS_TOKEN;
    
    if (!accessToken) {
      throw new Error('Square ACCESS_TOKEN is required');
    }
    
    this.locationId = settings.locationId || credentials.LOCATION_ID || '';
    this.environment = environment;
    
    this.client = new SquareClient({
      token: accessToken,
      environment: environment === 'sandbox' ? 'sandbox' : 'production',
    });
  }

  private generateIdempotencyKey(): string {
    return crypto.randomUUID();
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      const response = await this.client.payments.create({
        idempotencyKey: this.generateIdempotencyKey(),
        sourceId: 'EXTERNAL',
        amountMoney: {
          amount: BigInt(request.amount),
          currency: 'USD',
        },
        locationId: this.locationId,
        referenceId: request.orderId || undefined,
        autocomplete: false,
        note: `Terminal: ${request.terminalId || 'N/A'}`,
      });

      const payment = response.payment;
      
      if (payment && (payment.status === 'APPROVED' || payment.status === 'PENDING')) {
        return {
          success: true,
          transactionId: payment.id || '',
          authCode: payment.id?.slice(-6).toUpperCase(),
          referenceNumber: payment.receiptNumber || payment.id,
          cardBrand: payment.cardDetails?.card?.cardBrand?.toLowerCase(),
          cardLast4: payment.cardDetails?.card?.last4,
          entryMode: payment.cardDetails?.entryMethod?.toLowerCase(),
          responseCode: payment.status,
          responseMessage: 'Authorization successful',
        };
      }

      return {
        success: false,
        transactionId: payment?.id || '',
        responseCode: payment?.status || 'FAILED',
        responseMessage: 'Authorization not approved',
        declined: true,
      };
    } catch (error) {
      if (error instanceof SquareError) {
        const firstError = error.errors?.[0];
        return {
          success: false,
          transactionId: '',
          errorCode: firstError?.code || 'SQUARE_ERROR',
          errorMessage: firstError?.detail || error.message || 'Authorization failed',
          declined: true,
        };
      }
      return {
        success: false,
        transactionId: '',
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Authorization failed',
      };
    }
  }

  async sale(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      const response = await this.client.payments.create({
        idempotencyKey: this.generateIdempotencyKey(),
        sourceId: 'EXTERNAL',
        amountMoney: {
          amount: BigInt(request.amount),
          currency: 'USD',
        },
        locationId: this.locationId,
        referenceId: request.orderId || undefined,
        autocomplete: true,
        note: `Terminal: ${request.terminalId || 'N/A'}`,
      });

      const payment = response.payment;
      
      if (payment && payment.status === 'COMPLETED') {
        return {
          success: true,
          transactionId: payment.id || '',
          authCode: payment.id?.slice(-6).toUpperCase(),
          referenceNumber: payment.receiptNumber || payment.id,
          cardBrand: payment.cardDetails?.card?.cardBrand?.toLowerCase(),
          cardLast4: payment.cardDetails?.card?.last4,
          entryMode: payment.cardDetails?.entryMethod?.toLowerCase(),
          responseCode: payment.status,
          responseMessage: 'Payment completed',
        };
      }

      return {
        success: false,
        transactionId: payment?.id || '',
        responseCode: payment?.status || 'FAILED',
        responseMessage: 'Payment not completed',
        declined: true,
      };
    } catch (error) {
      if (error instanceof SquareError) {
        const firstError = error.errors?.[0];
        return {
          success: false,
          transactionId: '',
          errorCode: firstError?.code || 'SQUARE_ERROR',
          errorMessage: firstError?.detail || error.message || 'Payment failed',
          declined: true,
        };
      }
      return {
        success: false,
        transactionId: '',
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Payment failed',
      };
    }
  }

  async capture(request: CaptureRequest): Promise<CaptureResponse> {
    try {
      const response = await this.client.payments.complete({
        paymentId: request.transactionId,
      });

      const payment = response.payment;
      const capturedAmount = payment?.amountMoney?.amount 
        ? Number(payment.amountMoney.amount) 
        : request.amount;

      if (payment && payment.status === 'COMPLETED') {
        return {
          success: true,
          transactionId: payment.id || request.transactionId,
          capturedAmount,
          responseCode: payment.status,
          responseMessage: 'Capture successful',
        };
      }

      return {
        success: false,
        transactionId: request.transactionId,
        capturedAmount: 0,
        errorCode: payment?.status || 'CAPTURE_FAILED',
        errorMessage: 'Capture not completed',
      };
    } catch (error) {
      if (error instanceof SquareError) {
        const firstError = error.errors?.[0];
        return {
          success: false,
          transactionId: request.transactionId,
          capturedAmount: 0,
          errorCode: firstError?.code || 'SQUARE_ERROR',
          errorMessage: firstError?.detail || error.message || 'Capture failed',
        };
      }
      return {
        success: false,
        transactionId: request.transactionId,
        capturedAmount: 0,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Capture failed',
      };
    }
  }

  async void(request: VoidRequest): Promise<VoidResponse> {
    try {
      const response = await this.client.payments.cancel({
        paymentId: request.transactionId,
      });

      const payment = response.payment;

      if (payment && payment.status === 'CANCELED') {
        return {
          success: true,
          transactionId: payment.id || request.transactionId,
          responseCode: payment.status,
          responseMessage: 'Void successful',
        };
      }

      return {
        success: false,
        transactionId: request.transactionId,
        errorCode: payment?.status || 'VOID_FAILED',
        errorMessage: 'Void not completed',
      };
    } catch (error) {
      if (error instanceof SquareError) {
        const firstError = error.errors?.[0];
        return {
          success: false,
          transactionId: request.transactionId,
          errorCode: firstError?.code || 'SQUARE_ERROR',
          errorMessage: firstError?.detail || error.message || 'Void failed',
        };
      }
      return {
        success: false,
        transactionId: request.transactionId,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Void failed',
      };
    }
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    try {
      const response = await this.client.refunds.refundPayment({
        idempotencyKey: this.generateIdempotencyKey(),
        paymentId: request.transactionId,
        amountMoney: {
          amount: BigInt(request.amount),
          currency: 'USD',
        },
        reason: request.reason || 'Customer requested refund',
      });

      const refund = response.refund;

      if (refund && (refund.status === 'COMPLETED' || refund.status === 'PENDING')) {
        const refundedAmount = refund.amountMoney?.amount 
          ? Number(refund.amountMoney.amount) 
          : request.amount;

        return {
          success: true,
          transactionId: refund.id || '',
          refundedAmount,
          responseCode: refund.status,
          responseMessage: 'Refund processed',
        };
      }

      return {
        success: false,
        transactionId: '',
        refundedAmount: 0,
        errorCode: refund?.status || 'REFUND_FAILED',
        errorMessage: 'Refund not completed',
      };
    } catch (error) {
      if (error instanceof SquareError) {
        const firstError = error.errors?.[0];
        return {
          success: false,
          transactionId: '',
          refundedAmount: 0,
          errorCode: firstError?.code || 'SQUARE_ERROR',
          errorMessage: firstError?.detail || error.message || 'Refund failed',
        };
      }
      return {
        success: false,
        transactionId: '',
        refundedAmount: 0,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }

  async getTransactionStatus(request: TransactionStatusRequest): Promise<TransactionStatusResponse> {
    try {
      const response = await this.client.payments.get({
        paymentId: request.transactionId,
      });

      const payment = response.payment;
      
      if (!payment) {
        return {
          success: false,
          transactionId: request.transactionId,
          status: 'unknown',
          amount: 0,
        };
      }

      let status: TransactionStatusResponse['status'] = 'unknown';
      switch (payment.status) {
        case 'APPROVED':
          status = 'authorized';
          break;
        case 'COMPLETED':
          status = 'captured';
          break;
        case 'CANCELED':
          status = 'voided';
          break;
        case 'PENDING':
          status = 'pending';
          break;
        case 'FAILED':
          status = 'declined';
          break;
        default:
          status = 'unknown';
      }

      const amount = payment.amountMoney?.amount 
        ? Number(payment.amountMoney.amount) 
        : 0;

      return {
        success: true,
        transactionId: payment.id || request.transactionId,
        status,
        amount,
        authCode: payment.id?.slice(-6).toUpperCase(),
        cardBrand: payment.cardDetails?.card?.cardBrand?.toLowerCase(),
        cardLast4: payment.cardDetails?.card?.last4,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        status: 'unknown',
        amount: 0,
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await this.client.locations.list();
      
      if (response.locations && response.locations.length > 0) {
        const locationNames = response.locations
          .map(l => l.name || 'Unnamed')
          .join(', ');
        return {
          success: true,
          message: `Connected to Square. Locations: ${locationNames}`,
        };
      }
      
      return {
        success: false,
        message: 'No locations found for this Square account',
      };
    } catch (error) {
      if (error instanceof SquareError) {
        const firstError = error.errors?.[0];
        return {
          success: false,
          message: firstError?.detail || error.message || 'Connection failed',
        };
      }
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }
}

registerPaymentAdapter('square', (credentials, settings, environment) => {
  return new SquarePaymentAdapter(credentials, settings as SquareSettings, environment);
});

export { SquarePaymentAdapter };
