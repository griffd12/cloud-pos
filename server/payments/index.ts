/**
 * Payment Processing Module
 * 
 * Gateway-agnostic payment processing for the POS system.
 * Supports multiple payment processors through a common adapter interface.
 */

// Export types
export * from './types';
export * from './semi-integrated-types';

// Export registry functions
export {
  registerPaymentAdapter,
  getRegisteredGatewayTypes,
  isGatewayTypeSupported,
  createPaymentAdapter,
  resolveCredentials,
  getRequiredCredentialKeys,
} from './registry';

// Export semi-integrated adapters
export { HeartlandSemiIntegratedTerminal, createHeartlandSemiIntegratedTerminal } from './adapters/heartland-semi-integrated';

// Import adapters to register them
import './adapters/stripe';
import './adapters/elavon';
import './adapters/square';
import './adapters/heartland';
import './adapters/north';
