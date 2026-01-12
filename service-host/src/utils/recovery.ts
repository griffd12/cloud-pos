/**
 * Self-Healing Recovery System for Service Host
 * 
 * Features:
 * - Automatic recovery from transient errors
 * - Service restart with backoff
 * - Graceful degradation
 * - Recovery event logging
 */

import { getLogger } from './logger.js';
import { CircuitBreaker } from './retry.js';

const logger = getLogger('Recovery');

export type ServiceState = 'starting' | 'running' | 'degraded' | 'failed' | 'stopped';

export interface RecoverableService {
  name: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  healthCheck: () => Promise<boolean>;
}

export interface ServiceRecord {
  service: RecoverableService;
  state: ServiceState;
  lastError?: Error;
  lastRecoveryAttempt?: Date;
  recoveryAttempts: number;
  circuitBreaker: CircuitBreaker;
}

export interface RecoveryConfig {
  maxRecoveryAttempts: number;
  recoveryBackoffMs: number;
  healthCheckIntervalMs: number;
  autoRecoveryEnabled: boolean;
}

const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRecoveryAttempts: 3,
  recoveryBackoffMs: 5000,
  healthCheckIntervalMs: 30000,
  autoRecoveryEnabled: true,
};

export class RecoveryManager {
  private services = new Map<string, ServiceRecord>();
  private config: RecoveryConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private onRecoveryEvent?: (event: RecoveryEvent) => void;

  constructor(config: Partial<RecoveryConfig> = {}) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  registerService(service: RecoverableService): void {
    const record: ServiceRecord = {
      service,
      state: 'stopped',
      recoveryAttempts: 0,
      circuitBreaker: new CircuitBreaker(`service:${service.name}`, {
        failureThreshold: 3,
        recoveryTimeMs: 30000,
        halfOpenMaxAttempts: 2,
      }),
    };
    this.services.set(service.name, record);
    logger.info(`Registered recoverable service: ${service.name}`);
  }

  setRecoveryEventHandler(handler: (event: RecoveryEvent) => void): void {
    this.onRecoveryEvent = handler;
  }

  async startService(name: string): Promise<void> {
    const record = this.services.get(name);
    if (!record) {
      throw new Error(`Service not found: ${name}`);
    }

    record.state = 'starting';
    this.emitEvent({ type: 'starting', serviceName: name });

    try {
      await record.circuitBreaker.execute(() => record.service.start());
      record.state = 'running';
      record.recoveryAttempts = 0;
      record.lastError = undefined;
      this.emitEvent({ type: 'started', serviceName: name });
      logger.info(`Service started: ${name}`);
    } catch (error) {
      record.state = 'failed';
      record.lastError = error instanceof Error ? error : new Error(String(error));
      this.emitEvent({ type: 'failed', serviceName: name, error: record.lastError });
      logger.error(`Service failed to start: ${name}`, record.lastError);
      throw error;
    }
  }

  async stopService(name: string): Promise<void> {
    const record = this.services.get(name);
    if (!record) return;

    try {
      await record.service.stop();
      record.state = 'stopped';
      this.emitEvent({ type: 'stopped', serviceName: name });
      logger.info(`Service stopped: ${name}`);
    } catch (error) {
      logger.error(`Error stopping service: ${name}`, error instanceof Error ? error : new Error(String(error)));
    }
  }

  async recoverService(name: string): Promise<boolean> {
    const record = this.services.get(name);
    if (!record) return false;

    if (record.recoveryAttempts >= this.config.maxRecoveryAttempts) {
      logger.warn(`Max recovery attempts reached for: ${name}`);
      this.emitEvent({ type: 'recovery_exhausted', serviceName: name });
      return false;
    }

    record.recoveryAttempts++;
    record.lastRecoveryAttempt = new Date();
    
    logger.info(`Recovery attempt ${record.recoveryAttempts}/${this.config.maxRecoveryAttempts} for: ${name}`);
    this.emitEvent({ type: 'recovering', serviceName: name, attempt: record.recoveryAttempts });

    const backoffMs = this.config.recoveryBackoffMs * Math.pow(2, record.recoveryAttempts - 1);
    await new Promise(resolve => setTimeout(resolve, backoffMs));

    try {
      await this.stopService(name);
      await this.startService(name);
      
      logger.info(`Service recovered: ${name}`);
      this.emitEvent({ type: 'recovered', serviceName: name });
      return true;
    } catch (error) {
      logger.error(`Recovery failed for: ${name}`, error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  async startAll(): Promise<void> {
    for (const name of this.services.keys()) {
      try {
        await this.startService(name);
      } catch (error) {
        logger.error(`Failed to start service during startAll: ${name}`, error instanceof Error ? error : new Error(String(error)));
      }
    }
    this.startHealthChecks();
  }

  async stopAll(): Promise<void> {
    this.stopHealthChecks();
    for (const name of this.services.keys()) {
      await this.stopService(name);
    }
  }

  private startHealthChecks(): void {
    if (!this.config.autoRecoveryEnabled) return;

    this.healthCheckInterval = setInterval(async () => {
      for (const [name, record] of this.services) {
        if (record.state !== 'running') continue;

        try {
          const isHealthy = await record.service.healthCheck();
          if (!isHealthy) {
            logger.warn(`Health check failed for: ${name}`);
            record.state = 'degraded';
            this.emitEvent({ type: 'degraded', serviceName: name });
            
            await this.recoverService(name);
          }
        } catch (error) {
          logger.error(`Health check error for: ${name}`, error instanceof Error ? error : new Error(String(error)));
          record.state = 'failed';
          record.lastError = error instanceof Error ? error : new Error(String(error));
          this.emitEvent({ type: 'failed', serviceName: name, error: record.lastError });
          
          await this.recoverService(name);
        }
      }
    }, this.config.healthCheckIntervalMs);

    logger.info('Health check monitoring started');
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Health check monitoring stopped');
    }
  }

  private emitEvent(event: RecoveryEvent): void {
    if (this.onRecoveryEvent) {
      try {
        this.onRecoveryEvent(event);
      } catch (error) {
        logger.error('Error in recovery event handler', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  getServiceState(name: string): ServiceState | undefined {
    return this.services.get(name)?.state;
  }

  getAllStates(): Record<string, ServiceState> {
    const states: Record<string, ServiceState> = {};
    for (const [name, record] of this.services) {
      states[name] = record.state;
    }
    return states;
  }

  getServiceStats(name: string): ServiceStats | undefined {
    const record = this.services.get(name);
    if (!record) return undefined;

    return {
      name,
      state: record.state,
      recoveryAttempts: record.recoveryAttempts,
      lastError: record.lastError?.message,
      lastRecoveryAttempt: record.lastRecoveryAttempt?.toISOString(),
      circuitBreakerState: record.circuitBreaker.getState(),
    };
  }
}

export interface RecoveryEvent {
  type: 'starting' | 'started' | 'stopped' | 'failed' | 'degraded' | 'recovering' | 'recovered' | 'recovery_exhausted';
  serviceName: string;
  error?: Error;
  attempt?: number;
}

export interface ServiceStats {
  name: string;
  state: ServiceState;
  recoveryAttempts: number;
  lastError?: string;
  lastRecoveryAttempt?: string;
  circuitBreakerState: string;
}

export function createRecoverableWrapper<T>(
  name: string,
  instance: T,
  startFn: (inst: T) => Promise<void>,
  stopFn: (inst: T) => Promise<void>,
  healthFn: (inst: T) => Promise<boolean>
): RecoverableService {
  return {
    name,
    start: () => startFn(instance),
    stop: () => stopFn(instance),
    healthCheck: () => healthFn(instance),
  };
}
