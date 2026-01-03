/**
 * Payment Processing Module
 * 
 * Gateway-agnostic payment processing for the POS system.
 * Supports multiple payment processors through a common adapter interface.
 */

// Export types
export * from './types';

// Export registry functions
export {
  registerPaymentAdapter,
  getRegisteredGatewayTypes,
  isGatewayTypeSupported,
  createPaymentAdapter,
  resolveCredentials,
  getRequiredCredentialKeys,
} from './registry';

// Import adapters to register them
import './adapters/stripe';
import './adapters/elavon';
