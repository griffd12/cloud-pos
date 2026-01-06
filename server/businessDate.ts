/**
 * Business Date Utility Functions
 * 
 * Calculates the "operating day" (business date) based on a timestamp and
 * the property's rollover time. For example, if rollover time is 4:00 AM,
 * transactions at 2:00 AM Tuesday belong to Monday's business date.
 * 
 * UNIFIED ROLLOVER LOGIC:
 * - A business date's period starts at rollover time on that calendar date
 * - The period ends (closes) at rollover time, which could be:
 *   - For pre-noon rollovers (00:00-11:59): at that time on the NEXT calendar day
 *   - For post-noon rollovers (12:00-23:59): at that time on the SAME calendar day (next day's period starts)
 * 
 * Wait - that doesn't match the resolveBusinessDate logic. Let me trace through again...
 * 
 * Current resolveBusinessDate logic:
 * - If current time < rollover: business date = previous calendar day
 * - If current time >= rollover: business date = current calendar day
 * 
 * This means:
 * - For 04:00 rollover at 03:59 on Jan 6: business date = Jan 5
 * - For 04:00 rollover at 04:00 on Jan 6: business date = Jan 6
 * So Jan 5's business period ends when we're at/past 04:00 on Jan 6.
 * 
 * - For 23:00 rollover at 22:59 on Jan 5: business date = Jan 4
 * - For 23:00 rollover at 23:00 on Jan 5: business date = Jan 5
 * - For 23:00 rollover at 00:00 on Jan 6: business date = Jan 5 (00:00 < 23:00, so previous day)
 * - For 23:00 rollover at 22:59 on Jan 6: business date = Jan 5 (22:59 < 23:00, so previous day)
 * - For 23:00 rollover at 23:00 on Jan 6: business date = Jan 6
 * So Jan 5's business period ends when we're at/past 23:00 on Jan 6.
 * 
 * So the closing instant for a business date is ALWAYS:
 * - rollover time on the NEXT calendar day
 * 
 * This is because resolveBusinessDate treats rollover as the START of a new business date.
 */

import type { Property } from "@shared/schema";
import { toZonedTime, fromZonedTime, format } from "date-fns-tz";

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
 * Calculates the exact UTC instant when a business date closes.
 * 
 * The closing instant is rollover time on the NEXT calendar day after the business date.
 * This is because resolveBusinessDate treats rollover as the START of a new business date.
 * 
 * Examples:
 * - Business date 2026-01-05 with 04:00 rollover: closes at 2026-01-06 04:00 local time
 * - Business date 2026-01-05 with 23:00 rollover: closes at 2026-01-06 23:00 local time
 * 
 * @param businessDate - YYYY-MM-DD formatted business date
 * @param property - The property with rollover time and timezone settings
 * @returns UTC Date when the business date closes
 */
export function getBusinessDateClosingInstant(
  businessDate: string,
  property: Pick<Property, 'businessDateRolloverTime' | 'timezone'>
): Date {
  const timezone = property.timezone || 'America/New_York';
  const rolloverTime = property.businessDateRolloverTime || '04:00';
  
  const [year, month, day] = businessDate.split('-').map(Number);
  
  // Closing happens at rollover time on the NEXT calendar day
  const nextDay = new Date(year, month - 1, day + 1);
  const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  
  // Create the local time string for the closing instant
  const closingLocalTimeStr = `${nextDayStr}T${rolloverTime}:00`;
  
  // Convert to UTC using date-fns-tz
  const closingInstant = fromZonedTime(closingLocalTimeStr, timezone);
  
  return closingInstant;
}

/**
 * Checks if the current time has reached or passed the closing instant for a business date.
 * 
 * @param businessDate - YYYY-MM-DD formatted business date
 * @param property - The property with rollover time and timezone settings
 * @param now - Optional current time (defaults to now)
 * @returns true if the business date should be closed
 */
export function hasReachedClosingTime(
  businessDate: string,
  property: Pick<Property, 'businessDateRolloverTime' | 'timezone'>,
  now: Date = new Date()
): boolean {
  const closingInstant = getBusinessDateClosingInstant(businessDate, property);
  return now.getTime() >= closingInstant.getTime();
}

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
  
  // Convert timestamp to property's local time using date-fns-tz
  const zonedTime = toZonedTime(date, timezone);
  
  // Get local time components
  const localYear = zonedTime.getFullYear();
  const localMonth = zonedTime.getMonth();
  const localDay = zonedTime.getDate();
  const localHour = zonedTime.getHours();
  const localMinute = zonedTime.getMinutes();
  
  // Determine if we're before the rollover time
  const currentMinutes = localHour * 60 + localMinute;
  const rolloverMinutes = rolloverHour * 60 + rolloverMinute;
  
  let businessDate = new Date(localYear, localMonth, localDay);
  
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
  
  const [year, month, day] = businessDate.split('-').map(Number);
  
  // Business date starts at rollover time of that day
  const startLocalStr = `${businessDate}T${rolloverTime}:00`;
  
  // Business date ends at rollover time of the next day
  const nextDay = new Date(year, month - 1, day + 1);
  const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  const endLocalStr = `${nextDayStr}T${rolloverTime}:00`;
  
  // Convert to UTC using date-fns-tz
  const start = fromZonedTime(startLocalStr, timezone);
  const end = fromZonedTime(endLocalStr, timezone);
  
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

/**
 * Increments a business date by one day.
 * @param businessDate - YYYY-MM-DD formatted string
 * @returns YYYY-MM-DD formatted string for the next day
 */
export function incrementDate(businessDate: string): string {
  const [year, month, day] = businessDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Checks if we just crossed the rollover time for a property.
 * This is used to detect when auto clock-out should be triggered.
 * 
 * @param lastCheckedDate - The last known business date (YYYY-MM-DD)
 * @param property - The property with settings
 * @returns true if the business date has changed since lastCheckedDate
 */
export function hasBusinessDateChanged(
  lastCheckedDate: string,
  property: Pick<Property, 'businessDateRolloverTime' | 'businessDateMode' | 'currentBusinessDate' | 'timezone'>
): boolean {
  const currentBusinessDate = getCurrentBusinessDate(property);
  return currentBusinessDate !== lastCheckedDate;
}
