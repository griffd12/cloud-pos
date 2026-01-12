/**
 * Request Validation Middleware for Service Host
 * 
 * Features:
 * - Schema-based validation using Zod-like patterns
 * - Input sanitization
 * - Request size limits
 * - Content-type validation
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger('Validation');

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: Record<string, unknown>;
}

export interface ValidationSchema {
  [key: string]: FieldValidator;
}

export interface FieldValidator {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'uuid';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: unknown[];
  items?: FieldValidator;
  properties?: ValidationSchema;
  sanitize?: (value: unknown) => unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateField(value: unknown, validator: FieldValidator, path: string): string[] {
  const errors: string[] = [];

  if (value === undefined || value === null) {
    if (validator.required) {
      errors.push(`${path} is required`);
    }
    return errors;
  }

  switch (validator.type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${path} must be a string`);
        break;
      }
      if (validator.minLength !== undefined && value.length < validator.minLength) {
        errors.push(`${path} must be at least ${validator.minLength} characters`);
      }
      if (validator.maxLength !== undefined && value.length > validator.maxLength) {
        errors.push(`${path} must be at most ${validator.maxLength} characters`);
      }
      if (validator.pattern && !validator.pattern.test(value)) {
        errors.push(`${path} has invalid format`);
      }
      if (validator.enum && !validator.enum.includes(value)) {
        errors.push(`${path} must be one of: ${validator.enum.join(', ')}`);
      }
      break;

    case 'uuid':
      if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        errors.push(`${path} must be a valid UUID`);
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push(`${path} must be a number`);
        break;
      }
      if (validator.min !== undefined && value < validator.min) {
        errors.push(`${path} must be at least ${validator.min}`);
      }
      if (validator.max !== undefined && value > validator.max) {
        errors.push(`${path} must be at most ${validator.max}`);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${path} must be a boolean`);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path} must be an array`);
        break;
      }
      if (validator.items) {
        value.forEach((item, index) => {
          errors.push(...validateField(item, validator.items!, `${path}[${index}]`));
        });
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${path} must be an object`);
        break;
      }
      if (validator.properties) {
        for (const [key, propValidator] of Object.entries(validator.properties)) {
          errors.push(...validateField((value as Record<string, unknown>)[key], propValidator, `${path}.${key}`));
        }
      }
      break;
  }

  return errors;
}

export function validateRequest(data: unknown, schema: ValidationSchema): ValidationResult {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const [key, validator] of Object.entries(schema)) {
    const value = (data as Record<string, unknown>)[key];
    const fieldErrors = validateField(value, validator, key);
    errors.push(...fieldErrors);

    if (fieldErrors.length === 0 && value !== undefined) {
      sanitized[key] = validator.sanitize ? validator.sanitize(value) : value;
    }
  }

  if (errors.length > 0) {
    logger.warn('Request validation failed', { errors: errors.slice(0, 5) });
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : undefined,
  };
}

export function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, 10000);
}

export function sanitizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

export const COMMON_SCHEMAS = {
  checkId: { type: 'uuid' as const, required: true },
  workstationId: { type: 'uuid' as const, required: true },
  employeeId: { type: 'uuid' as const, required: true },
  rvcId: { type: 'uuid' as const, required: true },
  
  createCheck: {
    rvcId: { type: 'uuid' as const, required: true },
    employeeId: { type: 'uuid' as const, required: true },
    workstationId: { type: 'uuid' as const, required: true },
    orderType: { type: 'string' as const, enum: ['dine_in', 'take_out', 'delivery', 'pickup'] },
    tableNumber: { type: 'string' as const, maxLength: 50 },
    guestCount: { type: 'number' as const, min: 1, max: 999 },
  },
  
  addItem: {
    checkId: { type: 'uuid' as const, required: true },
    menuItemId: { type: 'uuid' as const, required: true },
    quantity: { type: 'number' as const, required: true, min: 1, max: 999 },
    workstationId: { type: 'uuid' as const, required: true },
    modifiers: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          modifierId: { type: 'uuid' as const, required: true },
          quantity: { type: 'number' as const, min: 1 },
        },
      },
    },
  },

  payment: {
    checkId: { type: 'uuid' as const, required: true },
    tenderId: { type: 'uuid' as const, required: true },
    amount: { type: 'number' as const, required: true, min: 0.01 },
    tipAmount: { type: 'number' as const, min: 0 },
  },
};

export function validateContentType(contentType: string | undefined, expected: string): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().includes(expected.toLowerCase());
}

export function validateRequestSize(size: number, maxSizeKB: number): boolean {
  return size <= maxSizeKB * 1024;
}
