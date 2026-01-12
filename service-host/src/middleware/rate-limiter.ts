/**
 * Rate Limiting Middleware for Service Host API
 * 
 * Features:
 * - Per-IP and per-workstation rate limiting
 * - Configurable windows and limits
 * - Burst allowance
 * - Sliding window algorithm
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger('RateLimiter');

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstAllowance: number;
  keyExtractor?: (req: RateLimitRequest) => string;
}

export interface RateLimitRequest {
  ip?: string;
  workstationId?: string;
  path?: string;
  method?: string;
}

interface RateLimitEntry {
  requests: number[];
  burstUsed: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
  burstAllowance: 20,
};

export class RateLimiter {
  private config: RateLimitConfig;
  private entries = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  private getKey(req: RateLimitRequest): string {
    if (this.config.keyExtractor) {
      return this.config.keyExtractor(req);
    }
    return req.workstationId || req.ip || 'unknown';
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;
      
      for (const [key, entry] of this.entries) {
        entry.requests = entry.requests.filter(ts => ts > windowStart);
        if (entry.requests.length === 0 && entry.burstUsed === 0) {
          this.entries.delete(key);
        }
      }
    }, this.config.windowMs);
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  check(req: RateLimitRequest): { allowed: boolean; remaining: number; resetIn: number } {
    const key = this.getKey(req);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.entries.get(key);
    if (!entry) {
      entry = { requests: [], burstUsed: 0 };
      this.entries.set(key, entry);
    }

    entry.requests = entry.requests.filter(ts => ts > windowStart);

    const currentCount = entry.requests.length;
    const effectiveLimit = this.config.maxRequests + Math.max(0, this.config.burstAllowance - entry.burstUsed);
    
    if (currentCount >= effectiveLimit) {
      const oldestRequest = entry.requests[0] || now;
      const resetIn = Math.max(0, oldestRequest + this.config.windowMs - now);
      
      logger.warn('Rate limit exceeded', { key, count: currentCount, limit: effectiveLimit });
      
      return {
        allowed: false,
        remaining: 0,
        resetIn,
      };
    }

    entry.requests.push(now);
    
    if (currentCount >= this.config.maxRequests) {
      entry.burstUsed++;
    }

    return {
      allowed: true,
      remaining: effectiveLimit - currentCount - 1,
      resetIn: this.config.windowMs,
    };
  }

  consume(req: RateLimitRequest): boolean {
    const result = this.check(req);
    return result.allowed;
  }

  getRemainingForKey(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) {
      return this.config.maxRequests + this.config.burstAllowance;
    }
    
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const validRequests = entry.requests.filter(ts => ts > windowStart).length;
    const effectiveLimit = this.config.maxRequests + Math.max(0, this.config.burstAllowance - entry.burstUsed);
    
    return Math.max(0, effectiveLimit - validRequests);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  resetAll(): void {
    this.entries.clear();
  }
}

export function createEndpointLimiters(): Map<string, RateLimiter> {
  const limiters = new Map<string, RateLimiter>();

  limiters.set('default', new RateLimiter({
    windowMs: 60000,
    maxRequests: 100,
    burstAllowance: 20,
  }));

  limiters.set('auth', new RateLimiter({
    windowMs: 300000,
    maxRequests: 10,
    burstAllowance: 5,
  }));

  limiters.set('sync', new RateLimiter({
    windowMs: 60000,
    maxRequests: 30,
    burstAllowance: 10,
  }));

  limiters.set('transaction', new RateLimiter({
    windowMs: 1000,
    maxRequests: 50,
    burstAllowance: 25,
  }));

  return limiters;
}

export function getRateLimiterForPath(path: string, limiters: Map<string, RateLimiter>): RateLimiter {
  if (path.includes('/auth') || path.includes('/login')) {
    return limiters.get('auth') || limiters.get('default')!;
  }
  if (path.includes('/sync')) {
    return limiters.get('sync') || limiters.get('default')!;
  }
  if (path.includes('/checks') || path.includes('/payments')) {
    return limiters.get('transaction') || limiters.get('default')!;
  }
  return limiters.get('default')!;
}
