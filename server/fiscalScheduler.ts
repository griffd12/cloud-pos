/**
 * Automatic Fiscal Close Scheduler
 * 
 * Runs periodically to check if any property has reached its rollover time
 * and automatically closes the business day and opens the next one.
 * 
 * Uses the unified rollover logic from businessDate.ts to ensure consistency
 * between transaction attribution and fiscal period management.
 * 
 * Key design decisions:
 * - Uses hasReachedClosingTime from businessDate.ts for consistent rollover logic
 * - Always processes the OLDEST unclosed period first (Simphony-style)
 * - Checks for duplicate periods before creating new ones
 * - Loops until all eligible periods are closed (handles backlog)
 * - Only processes properties with businessDateMode = "auto"
 * - Triggers auto clock-out for properties with autoClockOutEnabled = true
 */

import { storage } from "./storage";
import { hasReachedClosingTime, incrementDate } from "./businessDate";
import { log } from "./index";

/**
 * Process auto clock-out for employees still clocked in.
 * Called at rollover time when autoClockOutEnabled is true.
 */
async function processAutoClockOut(propertyId: string, businessDate: string): Promise<number> {
  try {
    const property = await storage.getProperty(propertyId);
    if (!property?.autoClockOutEnabled) return 0;

    const punches = await storage.getTimePunches({ propertyId });
    const employeePunches: Record<string, typeof punches> = {};
    
    for (const punch of punches) {
      if (!employeePunches[punch.employeeId]) {
        employeePunches[punch.employeeId] = [];
      }
      employeePunches[punch.employeeId].push(punch);
    }

    const now = new Date();
    const clockedOutEmployees: string[] = [];

    for (const [employeeId, empPunches] of Object.entries(employeePunches)) {
      const sorted = empPunches.sort((a, b) => 
        new Date(b.actualTimestamp).getTime() - new Date(a.actualTimestamp).getTime()
      );
      const lastPunch = sorted[0];
      
      if (lastPunch && lastPunch.punchType === "clock_in") {
        // Use the clock-in's business date, not the closing period's date
        const clockInBusinessDate = lastPunch.businessDate;
        
        await storage.createTimePunch({
          propertyId,
          employeeId,
          jobCodeId: lastPunch.jobCodeId,
          punchType: "clock_out",
          actualTimestamp: now,
          roundedTimestamp: now,
          businessDate: clockInBusinessDate,
          source: "auto_clock_out",
          notes: "Automatic clock-out at end of business day",
        });
        
        // Recalculate timecard to update clock_out_time
        await storage.recalculateTimecard(employeeId, clockInBusinessDate);
        
        clockedOutEmployees.push(employeeId);
      }
    }

    if (clockedOutEmployees.length > 0) {
      await storage.createAuditLog({
        action: "auto_clock_out",
        targetType: "time_punch",
        targetId: propertyId,
        employeeId: null,
        details: {
          propertyId,
          employeesClockedOut: clockedOutEmployees.length,
          employeeIds: clockedOutEmployees,
          businessDate,
          timestamp: now.toISOString(),
          source: "fiscal_scheduler",
        },
      });
      log(
        `Auto clock-out: Clocked out ${clockedOutEmployees.length} employee(s) for property ${property.name}`,
        "fiscal-scheduler"
      );
    }

    return clockedOutEmployees.length;
  } catch (error) {
    console.error(`[FISCAL_SCHEDULER_ERROR] Auto clock-out for property ${propertyId}:`, error);
    log(`Auto clock-out ERROR for property ${propertyId}: ${error}`, "fiscal-scheduler");
    return 0;
  }
}

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Process automatic fiscal close for a single property.
 * Loops until all eligible periods are closed (handles backlog).
 * Only processes properties with businessDateMode = "auto".
 */
async function processPropertyFiscalClose(propertyId: string): Promise<void> {
  try {
    const property = await storage.getProperty(propertyId);
    if (!property) return;

    // Only process properties with auto rollover mode
    if (property.businessDateMode !== "auto") {
      return;
    }

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

      // Use the unified rollover logic from businessDate.ts
      if (!hasReachedClosingTime(oldestOpenPeriod.businessDate, property)) {
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

      // Process auto clock-out BEFORE closing the period
      await processAutoClockOut(propertyId, freshPeriod.businessDate);

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

      // Update property's current business date to the next day
      const nextBusinessDate = incrementDate(freshPeriod.businessDate);
      await storage.updateProperty(propertyId, {
        currentBusinessDate: nextBusinessDate,
      });

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
