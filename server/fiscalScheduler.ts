/**
 * Automatic Fiscal Close Scheduler
 * 
 * Runs periodically to check if any property has reached its rollover time
 * and automatically closes the business day and opens the next one.
 * 
 * DESIGN NOTE:
 * This scheduler uses the same business date logic as resolveBusinessDate to ensure
 * consistency between transaction attribution and fiscal period management.
 * 
 * According to resolveBusinessDate:
 * - If current local time < rollover time: business date = previous calendar day
 * - If current local time >= rollover time: business date = current calendar day
 * 
 * A business date period is closed when the current business date (as determined
 * by resolveBusinessDate) has advanced past the period's business date.
 * 
 * For typical restaurant operations with early morning rollovers (e.g., 04:00),
 * this means:
 * - Business date 2026-01-05 spans from 2026-01-05 04:00 to 2026-01-06 04:00
 * - The period closes when resolveBusinessDate returns 2026-01-06 (at 04:00 on 2026-01-06)
 * 
 * IMPORTANT: Properties should use early morning rollover times (00:00-06:00) for
 * correct behavior. Pre-midnight rollovers may not work as expected.
 * 
 * Key design decisions:
 * - Uses the same logic as resolveBusinessDate for consistency
 * - Always processes the OLDEST unclosed period first (Simphony-style)
 * - Checks for duplicate periods before creating new ones
 * - Loops until all eligible periods are closed (handles backlog)
 */

import { storage } from "./storage";
import { resolveBusinessDate, incrementDate } from "./businessDate";
import { log } from "./index";

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Checks if the business date should be closed based on current time.
 * A period should be closed when the current business date (per resolveBusinessDate)
 * is LATER than the period's business date.
 * 
 * This ensures consistency with how transactions are attributed to business dates.
 */
function shouldClosePeriod(
  property: {
    id: string;
    timezone: string | null;
    businessDateRolloverTime: string | null;
  },
  periodBusinessDate: string
): boolean {
  const currentBusinessDate = resolveBusinessDate(new Date(), {
    businessDateRolloverTime: property.businessDateRolloverTime,
    businessDateMode: "auto",
    currentBusinessDate: null,
    timezone: property.timezone,
  });

  return currentBusinessDate > periodBusinessDate;
}

/**
 * Process automatic fiscal close for a single property.
 * Loops until all eligible periods are closed (handles backlog).
 */
async function processPropertyFiscalClose(propertyId: string): Promise<void> {
  try {
    const property = await storage.getProperty(propertyId);
    if (!property) return;

    let closedCount = 0;
    const maxIterations = 30;

    for (let i = 0; i < maxIterations; i++) {
      const periods = await storage.getFiscalPeriods(propertyId);
      const openPeriods = periods
        .filter((p) => p.status === "open" || p.status === "reopened")
        .sort((a, b) => a.businessDate.localeCompare(b.businessDate));

      if (openPeriods.length === 0) {
        break;
      }

      const oldestOpenPeriod = openPeriods[0];

      if (!shouldClosePeriod(property, oldestOpenPeriod.businessDate)) {
        break;
      }

      const freshPeriod = await storage.getFiscalPeriod(oldestOpenPeriod.id);
      if (!freshPeriod || (freshPeriod.status !== "open" && freshPeriod.status !== "reopened")) {
        continue;
      }

      const totals = await storage.calculateFiscalPeriodTotals(
        propertyId,
        freshPeriod.businessDate
      );

      await storage.updateFiscalPeriod(freshPeriod.id, {
        status: "closed",
        closedAt: new Date(),
        closedById: null,
        grossSales: totals.grossSales || "0",
        netSales: totals.netSales || "0",
        taxCollected: totals.taxCollected || "0",
        discountsTotal: totals.discountsTotal || "0",
        refundsTotal: totals.refundsTotal || "0",
        tipsTotal: totals.tipsTotal || "0",
        serviceChargesTotal: totals.serviceChargesTotal || "0",
        checkCount: totals.checkCount || 0,
        guestCount: totals.guestCount || 0,
        cashExpected: totals.cashExpected || "0",
        cardTotal: totals.cardTotal || "0",
        notes: "Automatically closed at rollover time",
      });

      closedCount++;

      const nextBusinessDate = incrementDate(freshPeriod.businessDate);
      const existingNextPeriod = await storage.getFiscalPeriodByDate(propertyId, nextBusinessDate);
      if (!existingNextPeriod) {
        await storage.createFiscalPeriod({
          propertyId,
          businessDate: nextBusinessDate,
          status: "open",
        });
        log(
          `Auto fiscal close: Created new period ${nextBusinessDate} for property ${property.name}`,
          "fiscal-scheduler"
        );
      }

      log(
        `Auto fiscal close: Closed ${freshPeriod.businessDate} for property ${property.name}`,
        "fiscal-scheduler"
      );
    }

    if (closedCount > 0) {
      log(
        `Auto fiscal close: Completed ${closedCount} period(s) for property ${property.name}`,
        "fiscal-scheduler"
      );
    }
  } catch (error) {
    console.error(`[FISCAL_SCHEDULER_ERROR] Property ${propertyId}:`, error);
    log(
      `Auto fiscal close ERROR for property ${propertyId}: ${error}`,
      "fiscal-scheduler"
    );
  }
}

/**
 * Main scheduler function that runs every minute
 */
async function checkAndProcessFiscalClose(): Promise<void> {
  try {
    const properties = await storage.getProperties();

    for (const property of properties) {
      await processPropertyFiscalClose(property.id);
    }
  } catch (error) {
    console.error("[FISCAL_SCHEDULER_ERROR] Main loop:", error);
    log(`Fiscal scheduler main loop ERROR: ${error}`, "fiscal-scheduler");
  }
}

/**
 * Start the automatic fiscal close scheduler
 */
export function startFiscalScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  schedulerInterval = setInterval(checkAndProcessFiscalClose, 60000);

  log("Automatic fiscal close scheduler started (checks every minute)", "fiscal-scheduler");
}

/**
 * Stop the automatic fiscal close scheduler
 */
export function stopFiscalScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log("Automatic fiscal close scheduler stopped", "fiscal-scheduler");
  }
}
