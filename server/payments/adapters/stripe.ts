/**
 * Stripe Payment Gateway Adapter
 * 
 * Implements the PaymentGatewayAdapter interface for Stripe.
 * Uses Stripe's Payment Intents API for card-present transactions.
 */

import Stripe from 'stripe';
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

class StripePaymentAdapter implements PaymentGatewayAdapter {
  readonly gatewayType = 'stripe';
  private stripe: Stripe;
  private environment: 'sandbox' | 'production';

  constructor(
    credentials: GatewayCredentials,
    _settings: GatewaySettings,
    environment: 'sandbox' | 'production'
  ) {
    const secretKey = credentials.SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('Stripe SECRET_KEY is required');
    }
    
    this.stripe = new Stripe(secretKey);
    this.environment = environment;
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      // Create a PaymentIntent with manual capture
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: request.amount,
        currency: request.currency || 'usd',
        capture_method: 'manual', // Auth only, capture later
        metadata: {
          orderId: request.orderId || '',
          terminalId: request.terminalId || '',
          employeeId: request.employeeId || '',
          workstationId: request.workstationId || '',
          environment: this.environment,
        },
      });

      // For terminal-based payments, you would use Stripe Terminal SDK
      // This is a simplified version for API-based auth
      // requires_capture = auth successful, ready for capture
      // requires_payment_method = still needs payment method, not yet authorized
      const isAuthorized = paymentIntent.status === 'requires_capture';
      
      return {
        success: isAuthorized,
        transactionId: paymentIntent.id,
        authCode: isAuthorized ? paymentIntent.id.slice(-6).toUpperCase() : undefined,
        referenceNumber: paymentIntent.id,
        responseCode: paymentIntent.status,
        responseMessage: isAuthorized 
          ? 'Authorization successful, ready for capture' 
          : `Payment intent status: ${paymentIntent.status}`,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      const isCardError = stripeError.type === 'StripeCardError';
      return {
        success: false,
        transactionId: '',
        errorCode: stripeError.code || 'unknown_error',
        errorMessage: stripeError.message || 'Authorization failed',
        declined: isCardError,
        declineReason: isCardError ? (stripeError as Stripe.errors.StripeCardError).decline_code : undefined,
      };
    }
  }

  async capture(request: CaptureRequest): Promise<CaptureResponse> {
    try {
      // Capture the specified amount (which should already include tip if applicable)
      // The caller is responsible for summing amount + tip before calling capture
      const captureAmount = request.amount;
      
      const paymentIntent = await this.stripe.paymentIntents.capture(
        request.transactionId,
        {
          amount_to_capture: captureAmount,
        }
      );

      return {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        capturedAmount: paymentIntent.amount_received || captureAmount,
        responseCode: paymentIntent.status,
        responseMessage: 'Capture successful',
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        transactionId: request.transactionId,
        capturedAmount: 0,
        errorCode: stripeError.code || 'capture_failed',
        errorMessage: stripeError.message || 'Capture failed',
      };
    }
  }

  async void(request: VoidRequest): Promise<VoidResponse> {
    try {
      // Cancel the payment intent (void before capture)
      const paymentIntent = await this.stripe.paymentIntents.cancel(
        request.transactionId,
        {
          cancellation_reason: 'requested_by_customer',
        }
      );

      return {
        success: paymentIntent.status === 'canceled',
        transactionId: paymentIntent.id,
        responseCode: paymentIntent.status,
        responseMessage: 'Void successful',
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        transactionId: request.transactionId,
        errorCode: stripeError.code || 'void_failed',
        errorMessage: stripeError.message || 'Void failed',
      };
    }
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: request.transactionId,
        amount: request.amount, // Partial or full refund
        reason: 'requested_by_customer',
        metadata: {
          reason: request.reason || 'Customer requested refund',
        },
      });

      return {
        success: refund.status === 'succeeded' || refund.status === 'pending',
        transactionId: refund.id,
        refundedAmount: refund.amount,
        responseCode: refund.status || 'success',
        responseMessage: 'Refund processed',
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        transactionId: '',
        refundedAmount: 0,
        errorCode: stripeError.code || 'refund_failed',
        errorMessage: stripeError.message || 'Refund failed',
      };
    }
  }

  async tipAdjust(request: TipAdjustRequest): Promise<TipAdjustResponse> {
    try {
      // Get the current payment intent
      const paymentIntent = await this.stripe.paymentIntents.retrieve(request.transactionId);
      
      if (paymentIntent.status !== 'requires_capture') {
        return {
          success: false,
          transactionId: request.transactionId,
          newTotalAmount: 0,
          tipAmount: 0,
          errorCode: 'invalid_state',
          errorMessage: 'Payment must be in authorized state to adjust tip',
        };
      }

      // Update the payment intent with new amount including tip
      const newTotal = paymentIntent.amount + request.tipAmount;
      
      const updated = await this.stripe.paymentIntents.update(
        request.transactionId,
        {
          amount: newTotal,
          metadata: {
            ...paymentIntent.metadata,
            tipAmount: request.tipAmount.toString(),
          },
        }
      );

      return {
        success: true,
        transactionId: updated.id,
        newTotalAmount: updated.amount,
        tipAmount: request.tipAmount,
        responseCode: 'success',
        responseMessage: 'Tip adjusted successfully',
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        transactionId: request.transactionId,
        newTotalAmount: 0,
        tipAmount: 0,
        errorCode: stripeError.code || 'tip_adjust_failed',
        errorMessage: stripeError.message || 'Tip adjustment failed',
      };
    }
  }

  async getTransactionStatus(request: TransactionStatusRequest): Promise<TransactionStatusResponse> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(request.transactionId);
      
      // Map Stripe status to our standard status
      let status: TransactionStatusResponse['status'] = 'unknown';
      switch (paymentIntent.status) {
        case 'requires_capture':
          status = 'authorized';
          break;
        case 'succeeded':
          status = 'captured';
          break;
        case 'canceled':
          status = 'voided';
          break;
        case 'requires_payment_method':
        case 'requires_confirmation':
        case 'processing':
          status = 'pending';
          break;
        default:
          status = 'unknown';
      }

      // Get card details if available
      let cardBrand: string | undefined;
      let cardLast4: string | undefined;
      
      if (paymentIntent.payment_method && typeof paymentIntent.payment_method === 'string') {
        try {
          const pm = await this.stripe.paymentMethods.retrieve(paymentIntent.payment_method);
          if (pm.card) {
            cardBrand = pm.card.brand;
            cardLast4 = pm.card.last4;
          }
        } catch {
          // Payment method may not be available
        }
      }

      return {
        success: true,
        transactionId: paymentIntent.id,
        status,
        amount: paymentIntent.amount,
        capturedAmount: paymentIntent.amount_received || undefined,
        authCode: paymentIntent.id.slice(-6).toUpperCase(),
        cardBrand,
        cardLast4,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        transactionId: request.transactionId,
        status: 'unknown',
        amount: 0,
      };
    }
  }

  async sale(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      // Create and immediately capture (sale = auth + capture)
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: request.amount,
        currency: request.currency || 'usd',
        capture_method: 'automatic', // Immediate capture
        confirm: true,
        metadata: {
          orderId: request.orderId || '',
          terminalId: request.terminalId || '',
          employeeId: request.employeeId || '',
          workstationId: request.workstationId || '',
          environment: this.environment,
        },
      });

      return {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        authCode: paymentIntent.id.slice(-6).toUpperCase(),
        referenceNumber: paymentIntent.id,
        responseCode: paymentIntent.status,
        responseMessage: paymentIntent.status === 'succeeded' ? 'Sale successful' : 'Sale pending',
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      const isCardError = stripeError.type === 'StripeCardError';
      return {
        success: false,
        transactionId: '',
        errorCode: stripeError.code || 'unknown_error',
        errorMessage: stripeError.message || 'Sale failed',
        declined: isCardError,
        declineReason: isCardError ? (stripeError as Stripe.errors.StripeCardError).decline_code : undefined,
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      // Try to list recent payment intents to test connection
      await this.stripe.paymentIntents.list({ limit: 1 });
      return {
        success: true,
        message: `Stripe connection successful (${this.environment})`,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        message: stripeError.message || 'Connection failed',
      };
    }
  }

  /**
   * Initiate a terminal payment by creating a PaymentIntent and sending it to the reader
   */
  async initiateTerminalPayment(params: {
    readerId: string;
    amount: number;
    currency?: string;
    metadata?: Record<string, string>;
  }): Promise<{ 
    success: boolean; 
    paymentIntentId?: string; 
    readerActionId?: string;
    errorMessage?: string;
  }> {
    try {
      // Create a PaymentIntent for the terminal
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: params.amount,
        currency: params.currency || 'usd',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        metadata: params.metadata || {},
      });

      // Send the PaymentIntent to the reader for processing
      const reader = await this.stripe.terminal.readers.processPaymentIntent(
        params.readerId,
        {
          payment_intent: paymentIntent.id,
        }
      );

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        readerActionId: reader.action?.process_payment_intent?.payment_intent as string,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      console.error('Stripe Terminal payment initiation error:', stripeError);
      return {
        success: false,
        errorMessage: stripeError.message || 'Failed to initiate terminal payment',
      };
    }
  }

  /**
   * Cancel an ongoing reader action
   */
  async cancelReaderAction(readerId: string): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      await this.stripe.terminal.readers.cancelAction(readerId);
      return { success: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorMessage: stripeError.message || 'Failed to cancel reader action',
      };
    }
  }

  /**
   * Get reader status from Stripe
   */
  async getReaderStatus(readerId: string): Promise<{
    status: string;
    action?: { type: string; status: string };
  } | null> {
    try {
      const reader = await this.stripe.terminal.readers.retrieve(readerId);
      return {
        status: reader.status || 'unknown',
        action: reader.action ? {
          type: reader.action.type || 'unknown',
          status: reader.action.status || 'unknown',
        } : undefined,
      };
    } catch (error) {
      console.error('Failed to get reader status:', error);
      return null;
    }
  }
}

// Factory function
function createStripeAdapter(
  credentials: GatewayCredentials,
  settings: GatewaySettings,
  environment: 'sandbox' | 'production'
): PaymentGatewayAdapter {
  return new StripePaymentAdapter(credentials, settings, environment);
}

// Register the adapter
registerPaymentAdapter('stripe', createStripeAdapter);

export { StripePaymentAdapter, createStripeAdapter };
