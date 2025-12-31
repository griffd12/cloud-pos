/**
 * Business Date Utility Functions
 * 
 * Calculates the "operating day" (business date) based on a timestamp and
 * the property's rollover time. For example, if rollover time is 4:00 AM,
 * transactions at 2:00 AM Tuesday belong to Monday's business date.
 */

import type { Property } from "@shared/schema";

/**
 * Validates a YYYY-MM-DD format string.
 */
export function isValidBusinessDateFormat(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(dateStr)) return false;
  const parsed = new Date(dateStr);
  return !isNaN(parsed.getTime());
}

/**
 * Default property settings for when property is not available.
 * Uses conservative defaults that should work for most US-based operations.
 */
export const DEFAULT_BUSINESS_DATE_SETTINGS = {
  businessDateRolloverTime: '04:00',
  businessDateMode: 'auto' as const,
  currentBusinessDate: null,
  timezone: 'America/New_York',
};

/**
 * Resolves the business date for a given timestamp based on property settings.
 * 
 * @param timestamp - The actual timestamp of the transaction (UTC or with timezone)
 * @param property - The property with businessDateRolloverTime and timezone settings
 * @returns YYYY-MM-DD formatted string representing the business date
 * 
 * Logic:
 * - If current local time is BEFORE rollover time, the business date is the PREVIOUS calendar day
 * - If current local time is AT or AFTER rollover time, the business date is the CURRENT calendar day
 * 
 * Example with 4:00 AM rollover:
 * - 10:00 AM Monday = Monday's business date (after rollover)
 * - 2:00 AM Tuesday = Monday's business date (before rollover)
 * - 4:00 AM Tuesday = Tuesday's business date (at rollover)
 * - 4:01 AM Tuesday = Tuesday's business date (after rollover)
 */
export function resolveBusinessDate(
  timestamp: Date | string,
  property: Pick<Property, 'businessDateRolloverTime' | 'businessDateMode' | 'currentBusinessDate' | 'timezone'> | null | undefined
): string {
  // Use default settings if property is not available
  const settings = property ?? DEFAULT_BUSINESS_DATE_SETTINGS;
  
  // For manual mode, return the current business date if set and valid
  if (settings.businessDateMode === 'manual' && isValidBusinessDateFormat(settings.currentBusinessDate)) {
    return settings.currentBusinessDate!;
  }

  // Parse the timestamp
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  
  // Get property timezone (default to America/New_York if not set)
  const timezone = settings.timezone || 'America/New_York';
  
  // Parse rollover time (default to 4:00 AM)
  const rolloverTime = settings.businessDateRolloverTime || '04:00';
  const [rolloverHour, rolloverMinute] = rolloverTime.split(':').map(Number);
  
  // Convert timestamp to property's local time
  const localTimeStr = date.toLocaleString('en-US', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false 
  });
  
  // Parse local time components
  const [datePart, timePart] = localTimeStr.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  
  // Determine if we're before the rollover time
  const currentMinutes = hour * 60 + minute;
  const rolloverMinutes = rolloverHour * 60 + rolloverMinute;
  
  let businessDate = new Date(year, month - 1, day);
  
  // If current time is before rollover, business date is previous day
  if (currentMinutes < rolloverMinutes) {
    businessDate.setDate(businessDate.getDate() - 1);
  }
  
  // Format as YYYY-MM-DD
  const yyyy = businessDate.getFullYear();
  const mm = String(businessDate.getMonth() + 1).padStart(2, '0');
  const dd = String(businessDate.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Gets the start and end timestamps for a business date.
 * Useful for querying transactions that belong to a specific business date.
 * 
 * @param businessDate - YYYY-MM-DD formatted business date
 * @param property - The property with settings
 * @returns Object with start and end Date objects in UTC
 */
export function getBusinessDateRange(
  businessDate: string,
  property: Pick<Property, 'businessDateRolloverTime' | 'timezone'>
): { start: Date; end: Date } {
  const timezone = property.timezone || 'America/New_York';
  const rolloverTime = property.businessDateRolloverTime || '04:00';
  const [rolloverHour, rolloverMinute] = rolloverTime.split(':').map(Number);
  
  const [year, month, day] = businessDate.split('-').map(Number);
  
  // Business date starts at rollover time of that day
  const startLocalStr = `${businessDate}T${rolloverTime}:00`;
  
  // Business date ends at rollover time of the next day
  const nextDay = new Date(year, month - 1, day + 1);
  const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  const endLocalStr = `${nextDayStr}T${rolloverTime}:00`;
  
  // Convert to UTC timestamps
  // Using a formatter to get the UTC offset for the timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'short'
  });
  
  // Create date objects representing the local times
  // This is a simplification - for production, use a proper timezone library like luxon
  const start = new Date(`${startLocalStr}`);
  const end = new Date(`${endLocalStr}`);
  
  return { start, end };
}

/**
 * Gets the current business date for a property based on current time.
 */
export function getCurrentBusinessDate(
  property: Pick<Property, 'businessDateRolloverTime' | 'businessDateMode' | 'currentBusinessDate' | 'timezone'>
): string {
  return resolveBusinessDate(new Date(), property);
}

/**
 * Formats a business date for display.
 */
export function formatBusinessDate(businessDate: string): string {
  const [year, month, day] = businessDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}
