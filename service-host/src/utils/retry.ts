/**
 * Exponential Backoff Retry Utility
 * 
 * Features:
 * - Configurable base delay, max delay, and max attempts
 * - Jitter to prevent thundering herd
 * - Conditional retry based on error type
 * - Circuit breaker pattern support
 */

import { getLogger } from './logger.js';

const logger = getLogger('Retry');

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitterFactor: 0.3,
};

export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(cappedDelay + jitter));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === fullConfig.maxAttempts) {
        logger.error(`Operation failed after ${attempt} attempts`, lastError);
        throw lastError;
      }

      if (fullConfig.shouldRetry && !fullConfig.shouldRetry(lastError, attempt)) {
        logger.warn('Retry aborted by shouldRetry callback', { attempt, error: lastError.message });
        throw lastError;
      }

      const delayMs = calculateBackoffDelay(attempt, fullConfig);
      
      logger.debug(`Retry attempt ${attempt}/${fullConfig.maxAttempts}`, {
        delay: delayMs,
        error: lastError.message,
      });

      if (fullConfig.onRetry) {
        fullConfig.onRetry(lastError, attempt, delayMs);
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Retry failed with no error');
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeMs: number;
  halfOpenMaxAttempts: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenAttempts: number = 0;
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeMs: config.recoveryTimeMs ?? 30000,
      halfOpenMaxAttempts: config.halfOpenMaxAttempts ?? 3,
    };
  }

  getState(): CircuitState {
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.recoveryTimeMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        logger.info(`Circuit ${this.name} entering HALF_OPEN state`);
      }
    }
    return this.state;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      const waitTime = this.config.recoveryTimeMs - (Date.now() - this.lastFailureTime);
      throw new Error(`Circuit ${this.name} is OPEN (retry in ${Math.max(0, Math.ceil(waitTime / 1000))}s)`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  isOpen(): boolean {
    return this.getState() === 'OPEN';
  }

  getTimeUntilHalfOpen(): number {
    if (this.state !== 'OPEN') return 0;
    return Math.max(0, this.config.recoveryTimeMs - (Date.now() - this.lastFailureTime));
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
        logger.info(`Circuit ${this.name} CLOSED after successful recovery`);
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.halfOpenAttempts = 0;
      logger.warn(`Circuit ${this.name} OPEN (failed during HALF_OPEN)`);
    } else if (this.state === 'CLOSED' && this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit ${this.name} OPEN (threshold reached: ${this.failureCount})`);
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    logger.info(`Circuit ${this.name} manually reset`);
  }

  getStats(): { state: CircuitState; failureCount: number; lastFailureTime: number } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config));
  }
  return circuitBreakers.get(name)!;
}
