/**
 * Business Date Utility Functions
 * 
 * Calculates the "operating day" (business date) based on a timestamp and
 * the property's rollover time.
 * 
 * ROLLOVER CONVENTION:
 * The rollover time is when the business date ADVANCES to the next day.
 * 
 * For AM rollovers (00:00-11:59, typical restaurants):
 * - Business date N runs from rollover on day N to rollover on day N+1
 * - Example: 04:00 rollover - Jan 5 runs from 04:00 Jan 5 to 04:00 Jan 6
 * 
 * For PM rollovers (12:00-23:59, QSR early closing):
 * - Business date N runs from rollover on day N-1 to rollover on day N
 * - Example: 22:00 rollover - Jan 5 runs from 22:00 Jan 4 to 22:00 Jan 5
 * 
 * This means:
 * - For 04:00 rollover at 10:00 on Jan 5: business date = Jan 5
 * - For 04:00 rollover at 02:00 on Jan 6: business date = Jan 5 (late night)
 * - For 22:00 rollover at 10:00 on Jan 5: business date = Jan 5
 * - For 22:00 rollover at 23:00 on Jan 5: business date = Jan 6 (next day's period started)
 */

import type { Property } from "@shared/schema";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

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
 */
export const DEFAULT_BUSINESS_DATE_SETTINGS = {
  businessDateRolloverTime: '04:00',
  businessDateMode: 'auto' as const,
  currentBusinessDate: null,
  timezone: 'America/New_York',
};

/**
 * Gets the current business date for a property.
 * 
 * SIMPLE RULE: The property has a current business date. Everything posts to it.
 * When the business date rolls over (manually or automatically), it advances.
 * 
 * If currentBusinessDate is set, use it directly.
 * If not set (legacy), calculate from timestamp using rollover rules.
 */
export function resolveBusinessDate(
  timestamp: Date | string,
  property: Pick<Property, 'businessDateRolloverTime' | 'businessDateMode' | 'currentBusinessDate' | 'timezone'> | null | undefined
): string {
  const settings = property ?? DEFAULT_BUSINESS_DATE_SETTINGS;
  
  // SIMPLE: If property has a current business date set, USE IT
  // This is the intended behavior - everything posts to the current business date
  if (isValidBusinessDateFormat(settings.currentBusinessDate)) {
    return settings.currentBusinessDate!;
  }

  // FALLBACK: Calculate from timestamp if currentBusinessDate not set
  // This is only for initial setup or if property lacks a business date
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const timezone = settings.timezone || 'America/New_York';
  const rolloverTime = settings.businessDateRolloverTime || '04:00';
  const [rolloverHour, rolloverMinute] = rolloverTime.split(':').map(Number);
  
  const zonedTime = toZonedTime(date, timezone);
  const localYear = zonedTime.getFullYear();
  const localMonth = zonedTime.getMonth();
  const localDay = zonedTime.getDate();
  const localHour = zonedTime.getHours();
  const localMinute = zonedTime.getMinutes();
  
  const currentMinutes = localHour * 60 + localMinute;
  const rolloverMinutes = rolloverHour * 60 + rolloverMinute;
  const isPMRollover = rolloverHour >= 12;
  
  let businessDate = new Date(localYear, localMonth, localDay);
  
  if (isPMRollover) {
    // PM rollover: at/after rollover, advance to next business date
    if (currentMinutes >= rolloverMinutes) {
      businessDate.setDate(businessDate.getDate() + 1);
    }
  } else {
    // AM rollover: before rollover, use previous business date
    if (currentMinutes < rolloverMinutes) {
      businessDate.setDate(businessDate.getDate() - 1);
    }
  }
  
  const yyyy = businessDate.getFullYear();
  const mm = String(businessDate.getMonth() + 1).padStart(2, '0');
  const dd = String(businessDate.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calculates the exact UTC instant when a business date closes.
 * 
 * For AM rollovers: closes at rollover time on the NEXT calendar day
 * For PM rollovers: closes at rollover time on the SAME calendar day as the business date
 */
export function getBusinessDateClosingInstant(
  businessDate: string,
  property: Pick<Property, 'businessDateRolloverTime' | 'timezone'>
): Date {
  const timezone = property.timezone || 'America/New_York';
  const rolloverTime = property.businessDateRolloverTime || '04:00';
  const [rolloverHour] = rolloverTime.split(':').map(Number);
  const isPMRollover = rolloverHour >= 12;
  
  const [year, month, day] = businessDate.split('-').map(Number);
  
  let closingDateStr: string;
  if (isPMRollover) {
    // PM rollover: closes on the same calendar day as the business date
    closingDateStr = businessDate;
  } else {
    // AM rollover: closes on the next calendar day
    const nextDay = new Date(year, month - 1, day + 1);
    closingDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  }
  
  const closingLocalTimeStr = `${closingDateStr}T${rolloverTime}:00`;
  return fromZonedTime(closingLocalTimeStr, timezone);
}

/**
 * Checks if the current time has reached or passed the closing instant for a business date.
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
 * Gets the start and end timestamps for a business date.
 */
export function getBusinessDateRange(
  businessDate: string,
  property: Pick<Property, 'businessDateRolloverTime' | 'timezone'>
): { start: Date; end: Date } {
  const timezone = property.timezone || 'America/New_York';
  const rolloverTime = property.businessDateRolloverTime || '04:00';
  const [rolloverHour] = rolloverTime.split(':').map(Number);
  const isPMRollover = rolloverHour >= 12;
  
  const [year, month, day] = businessDate.split('-').map(Number);
  
  let startDateStr: string;
  let endDateStr: string;
  
  if (isPMRollover) {
    // PM rollover: period starts on previous day, ends on business date
    const prevDay = new Date(year, month - 1, day - 1);
    startDateStr = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
    endDateStr = businessDate;
  } else {
    // AM rollover: period starts on business date, ends on next day
    startDateStr = businessDate;
    const nextDay = new Date(year, month - 1, day + 1);
    endDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  }
  
  const start = fromZonedTime(`${startDateStr}T${rolloverTime}:00`, timezone);
  const end = fromZonedTime(`${endDateStr}T${rolloverTime}:00`, timezone);
  
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
 */
export function hasBusinessDateChanged(
  lastCheckedDate: string,
  property: Pick<Property, 'businessDateRolloverTime' | 'businessDateMode' | 'currentBusinessDate' | 'timezone'>
): boolean {
  const currentBusinessDate = getCurrentBusinessDate(property);
  return currentBusinessDate !== lastCheckedDate;
}
