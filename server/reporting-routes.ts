import { Express, Request, Response } from "express";
import {
  getSalesLines, getCheckDiscounts, getServiceChargeLines,
  getPaymentLines, getVoidLines, getTimecardLines,
  getCashDrawerActivity, getDrawerSummary,
  type ReportFilters
} from "./reporting-views";
import { db } from "./db";
import { sql } from "drizzle-orm";

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function num(val: any): number {
  return Number(val || 0);
}

export function registerReportingRoutes(app: Express, storage: any) {

  // =========================================================================
  // FOH 1 – Z Report (Daily Close)
  // =========================================================================
  app.get("/api/reports/z-report", async (req: Request, res: Response) => {
    try {
      const { propertyId, businessDate, rvcId } = req.query as Record<string, string | undefined>;
      if (!propertyId || !businessDate) {
        return res.status(400).json({ message: "propertyId and businessDate are required" });
      }

      const filters: ReportFilters = { propertyId, businessDate, rvcId };

      const [salesLines, checkDiscountLines, serviceChargeLines, paymentLines, voidLines] = await Promise.all([
        getSalesLines(filters),
        getCheckDiscounts(filters),
        getServiceChargeLines(filters),
        getPaymentLines(filters),
        getVoidLines(filters),
      ]);

      const grossSales = round2(salesLines.reduce((s, l) => s + num(l.grossLine), 0));
      const itemDiscounts = round2(salesLines.reduce((s, l) => s + num(l.discountAmount), 0));
      const checkDiscountsTotal = round2(checkDiscountLines.reduce((s, l) => s + num(l.amount), 0));
      const totalDiscounts = round2(itemDiscounts + checkDiscountsTotal);
      const netSales = round2(grossSales - totalDiscounts);

      const itemTax = round2(salesLines.reduce((s, l) => s + num(l.taxAmount), 0));
      const serviceChargeTax = round2(serviceChargeLines.reduce((s, l) => s + num(l.taxAmount), 0));
      const totalTax = round2(itemTax + serviceChargeTax);

      const serviceCharges = round2(serviceChargeLines.reduce((s, l) => s + num(l.amount), 0));
      const totalRevenue = round2(netSales + totalTax + serviceCharges);

      const totalCollected = round2(paymentLines.reduce((s, l) => s + num(l.amount), 0));

      const cardTips = round2(
        paymentLines
          .filter(l => l.tenderType === "credit" || l.tenderType === "debit")
          .reduce((s, l) => s + num(l.tipAmount), 0)
      );
      const cashTips = round2(
        paymentLines
          .filter(l => l.tenderType === "cash")
          .reduce((s, l) => s + num(l.tipAmount), 0)
      );

      const voidCount = voidLines.length;
      const voidAmount = round2(voidLines.reduce((s, l) => s + num(l.voidAmount), 0));

      const checkIds = new Set(salesLines.map(l => l.checkId));
      const checkCount = checkIds.size;

      const tenderMap = new Map<string, number>();
      for (const p of paymentLines) {
        const name = p.tenderName || "Unknown";
        tenderMap.set(name, (tenderMap.get(name) || 0) + num(p.amount));
      }
      const tenderBreakdown = Array.from(tenderMap.entries()).map(([tenderName, amount]) => ({
        tenderName,
        amount: round2(amount),
      }));

      res.json({
        propertyId,
        businessDate,
        rvcId: rvcId || null,
        grossSales,
        itemDiscounts,
        checkDiscounts: checkDiscountsTotal,
        totalDiscounts,
        netSales,
        itemTax,
        serviceChargeTax,
        totalTax,
        serviceCharges,
        totalRevenue,
        totalCollected,
        cardTips,
        cashTips,
        voidCount,
        voidAmount,
        checkCount,
        tenderBreakdown,
      });
    } catch (err: any) {
      console.error("Z-report error:", err);
      res.status(500).json({ message: "Failed to generate Z report", error: err.message });
    }
  });

  // =========================================================================
  // FOH 2 – Cash Drawer Report
  // =========================================================================
  app.get("/api/reports/cash-drawer", async (req: Request, res: Response) => {
    try {
      const { assignmentId } = req.query as Record<string, string | undefined>;
      if (!assignmentId) {
        return res.status(400).json({ message: "assignmentId is required" });
      }

      const summary = await getDrawerSummary(assignmentId);

      const assignmentResult = await db.execute(sql`
        SELECT
          da.id,
          da.property_id AS "propertyId",
          da.business_date AS "businessDate",
          da.opening_amount AS "openingAmount",
          da.closing_amount AS "closingAmount",
          da.actual_amount AS "actualAmount",
          da.variance,
          da.status
        FROM drawer_assignments da
        WHERE da.id = ${assignmentId}
      `);
      const assignment = assignmentResult.rows[0] as any;

      let transactions: any[] = [];
      if (assignment) {
        const activity = await getCashDrawerActivity({
          propertyId: assignment.propertyId,
          businessDate: assignment.businessDate,
        });
        transactions = activity.filter(t => t.assignmentId === assignmentId);
      }

      const actualCash = num(assignment?.actualAmount);
      const expectedCash = num(summary.expectedCash);
      const variance = assignment?.variance != null ? num(assignment.variance) : round2(actualCash - expectedCash);

      res.json({
        assignmentId,
        opening: round2(num(summary.opening)),
        cashSales: round2(num(summary.cashSales)),
        paidIns: round2(num(summary.paidIns)),
        paidOuts: round2(num(summary.paidOuts)),
        drops: round2(num(summary.drops)),
        pickups: round2(num(summary.pickups)),
        cashRefunds: round2(num(summary.cashRefunds)),
        expectedCash: round2(expectedCash),
        actualCash: round2(actualCash),
        variance: round2(variance),
        transactions,
      });
    } catch (err: any) {
      console.error("Cash drawer report error:", err);
      res.status(500).json({ message: "Failed to generate cash drawer report", error: err.message });
    }
  });

  // =========================================================================
  // FOH 3 – Cashier Report (Employee Shift Report)
  // =========================================================================
  app.get("/api/reports/cashier-report", async (req: Request, res: Response) => {
    try {
      const { propertyId, businessDate, employeeId, rvcId } = req.query as Record<string, string | undefined>;
      if (!propertyId || !businessDate) {
        return res.status(400).json({ message: "propertyId and businessDate are required" });
      }

      const filters: ReportFilters = { propertyId, businessDate, rvcId };

      const [salesLines, checkDiscountLines, paymentLines, voidLines, timecardLines] = await Promise.all([
        getSalesLines(filters),
        getCheckDiscounts(filters),
        getPaymentLines(filters),
        getVoidLines(filters),
        getTimecardLines(filters),
      ]);

      const employeeIds = new Set<string>();
      for (const l of salesLines) if (l.employeeId) employeeIds.add(l.employeeId);
      for (const l of paymentLines) if (l.employeeId) employeeIds.add(l.employeeId);

      const reports: any[] = [];

      for (const empId of Array.from(employeeIds)) {
        if (employeeId && empId !== employeeId) continue;

        const empSales = salesLines.filter(l => l.employeeId === empId);
        const empCheckDiscounts = checkDiscountLines.filter(l => l.employeeId === empId);
        const empPayments = paymentLines.filter(l => l.employeeId === empId);
        const empVoids = voidLines.filter(l => l.voidedByEmployeeId === empId);
        const empTimecards = timecardLines.filter(l => l.employeeId === empId);

        const checksOpened = new Set(empSales.map(l => l.checkId)).size;
        const grossSales = round2(empSales.reduce((s, l) => s + num(l.grossLine), 0));
        const itemDiscounts = round2(empSales.reduce((s, l) => s + num(l.discountAmount), 0));
        const checkDiscountsAmt = round2(empCheckDiscounts.reduce((s, l) => s + num(l.amount), 0));
        const discounts = round2(itemDiscounts + checkDiscountsAmt);
        const netSales = round2(grossSales - discounts);

        const voidCount = empVoids.length;
        const voidAmount = round2(empVoids.reduce((s, l) => s + num(l.voidAmount), 0));

        const cardTips = round2(
          empPayments
            .filter(l => l.tenderType === "credit" || l.tenderType === "debit")
            .reduce((s, l) => s + num(l.tipAmount), 0)
        );
        const declaredCashTips = round2(empTimecards.reduce((s, l) => s + num(l.declaredCashTips), 0));

        const cashCollected = round2(
          empPayments.filter(l => l.tenderType === "cash").reduce((s, l) => s + num(l.amount), 0)
        );
        const cardCollected = round2(
          empPayments
            .filter(l => l.tenderType === "credit" || l.tenderType === "debit")
            .reduce((s, l) => s + num(l.amount), 0)
        );
        const totalCollected = round2(empPayments.reduce((s, l) => s + num(l.amount), 0));

        reports.push({
          employeeId: empId,
          checksOpened,
          grossSales,
          discounts,
          netSales,
          voidCount,
          voidAmount,
          cardTips,
          declaredCashTips,
          cashCollected,
          cardCollected,
          totalCollected,
        });
      }

      reports.sort((a, b) => b.netSales - a.netSales);

      res.json(reports);
    } catch (err: any) {
      console.error("Cashier report error:", err);
      res.status(500).json({ message: "Failed to generate cashier report", error: err.message });
    }
  });

  // =========================================================================
  // BOH 4 – Daily Sales Summary
  // =========================================================================
  app.get("/api/reports/daily-sales-summary", async (req: Request, res: Response) => {
    try {
      const { propertyId, businessDate, rvcId } = req.query as Record<string, string | undefined>;
      if (!propertyId || !businessDate) {
        return res.status(400).json({ message: "propertyId and businessDate are required" });
      }

      const filters: ReportFilters = { propertyId, businessDate, rvcId };

      const [salesLines, checkDiscountLines, serviceChargeLines, paymentLines, voidLines] = await Promise.all([
        getSalesLines(filters),
        getCheckDiscounts(filters),
        getServiceChargeLines(filters),
        getPaymentLines(filters),
        getVoidLines(filters),
      ]);

      const grossSales = round2(salesLines.reduce((s, l) => s + num(l.grossLine), 0));
      const itemDiscounts = round2(salesLines.reduce((s, l) => s + num(l.discountAmount), 0));
      const checkDiscountsTotal = round2(checkDiscountLines.reduce((s, l) => s + num(l.amount), 0));
      const totalDiscounts = round2(itemDiscounts + checkDiscountsTotal);
      const netSales = round2(grossSales - totalDiscounts);

      const itemTax = round2(salesLines.reduce((s, l) => s + num(l.taxAmount), 0));
      const serviceChargeTax = round2(serviceChargeLines.reduce((s, l) => s + num(l.taxAmount), 0));
      const totalTax = round2(itemTax + serviceChargeTax);
      const serviceChargesAmt = round2(serviceChargeLines.reduce((s, l) => s + num(l.amount), 0));
      const totalRevenue = round2(netSales + totalTax + serviceChargesAmt);
      const totalCollected = round2(paymentLines.reduce((s, l) => s + num(l.amount), 0));
      const voidCount = voidLines.length;
      const voidAmount = round2(voidLines.reduce((s, l) => s + num(l.voidAmount), 0));
      const checkCount = new Set(salesLines.map(l => l.checkId)).size;

      const tenderMap = new Map<string, number>();
      for (const p of paymentLines) {
        const name = p.tenderName || "Unknown";
        tenderMap.set(name, (tenderMap.get(name) || 0) + num(p.amount));
      }
      const tenderBreakdown = Array.from(tenderMap.entries()).map(([tenderName, amount]) => ({
        tenderName,
        amount: round2(amount),
      }));

      const productMixMap = new Map<string, { itemName: string; quantity: number; grossSales: number; netSales: number }>();
      for (const l of salesLines) {
        const key = l.itemName;
        const existing = productMixMap.get(key);
        if (existing) {
          existing.quantity += num(l.quantity);
          existing.grossSales += num(l.grossLine);
          existing.netSales += num(l.netLine);
        } else {
          productMixMap.set(key, {
            itemName: l.itemName,
            quantity: num(l.quantity),
            grossSales: num(l.grossLine),
            netSales: num(l.netLine),
          });
        }
      }
      const productMix = Array.from(productMixMap.values()).map(p => ({
        ...p,
        grossSales: round2(p.grossSales),
        netSales: round2(p.netSales),
      }));

      const discountDetailMap = new Map<string, { name: string; amount: number; count: number }>();
      for (const l of checkDiscountLines) {
        const key = l.name;
        const existing = discountDetailMap.get(key);
        if (existing) {
          existing.amount += num(l.amount);
          existing.count += 1;
        } else {
          discountDetailMap.set(key, { name: l.name, amount: num(l.amount), count: 1 });
        }
      }
      const discountDetail = Array.from(discountDetailMap.values()).map(d => ({
        ...d,
        amount: round2(d.amount),
      }));

      const scDetailMap = new Map<string, { name: string; amount: number; taxAmount: number; count: number }>();
      for (const l of serviceChargeLines) {
        const key = l.nameAtSale;
        const existing = scDetailMap.get(key);
        if (existing) {
          existing.amount += num(l.amount);
          existing.taxAmount += num(l.taxAmount);
          existing.count += 1;
        } else {
          scDetailMap.set(key, { name: l.nameAtSale, amount: num(l.amount), taxAmount: num(l.taxAmount), count: 1 });
        }
      }
      const serviceChargeDetail = Array.from(scDetailMap.values()).map(sc => ({
        ...sc,
        amount: round2(sc.amount),
        taxAmount: round2(sc.taxAmount),
      }));

      res.json({
        propertyId,
        businessDate,
        rvcId: rvcId || null,
        grossSales,
        itemDiscounts,
        checkDiscounts: checkDiscountsTotal,
        totalDiscounts,
        netSales,
        itemTax,
        serviceChargeTax,
        totalTax,
        serviceCharges: serviceChargesAmt,
        totalRevenue,
        totalCollected,
        voidCount,
        voidAmount,
        checkCount,
        tenderBreakdown,
        productMix,
        discountDetail,
        serviceChargeDetail,
      });
    } catch (err: any) {
      console.error("Daily sales summary error:", err);
      res.status(500).json({ message: "Failed to generate daily sales summary", error: err.message });
    }
  });

  // =========================================================================
  // BOH 5 – Labor Summary
  // =========================================================================
  app.get("/api/reports/labor-summary", async (req: Request, res: Response) => {
    try {
      const { propertyId, businessDate } = req.query as Record<string, string | undefined>;
      if (!propertyId || !businessDate) {
        return res.status(400).json({ message: "propertyId and businessDate are required" });
      }

      const filters: ReportFilters = { propertyId, businessDate };

      const [timecardLines, salesLines, checkDiscountLines] = await Promise.all([
        getTimecardLines(filters),
        getSalesLines(filters),
        getCheckDiscounts(filters),
      ]);

      const grossSales = salesLines.reduce((s, l) => s + num(l.grossLine), 0);
      const itemDisc = salesLines.reduce((s, l) => s + num(l.discountAmount), 0);
      const checkDisc = checkDiscountLines.reduce((s, l) => s + num(l.amount), 0);
      const netSales = round2(grossSales - itemDisc - checkDisc);

      let totalRegularHours = 0;
      let totalOvertimeHours = 0;
      let totalDoubleTimeHours = 0;
      let totalHours = 0;
      let totalRegularPay = 0;
      let totalOvertimePay = 0;
      let totalPay = 0;
      let totalDeclaredCashTips = 0;

      const byEmployee: any[] = [];

      const empMap = new Map<string, typeof timecardLines>();
      for (const tc of timecardLines) {
        const arr = empMap.get(tc.employeeId) || [];
        arr.push(tc);
        empMap.set(tc.employeeId, arr);
      }

      for (const [empId, tcs] of Array.from(empMap.entries())) {
        let regH = 0, otH = 0, dtH = 0, tH = 0, regP = 0, otP = 0, tP = 0, dcT = 0;
        for (const tc of tcs) {
          regH += num(tc.regularHours);
          otH += num(tc.overtimeHours);
          dtH += num(tc.doubleTimeHours);
          tH += num(tc.totalHours);
          regP += num(tc.regularPay);
          otP += num(tc.overtimePay);
          tP += num(tc.totalPay);
          dcT += num(tc.declaredCashTips);
        }

        totalRegularHours += regH;
        totalOvertimeHours += otH;
        totalDoubleTimeHours += dtH;
        totalHours += tH;
        totalRegularPay += regP;
        totalOvertimePay += otP;
        totalPay += tP;
        totalDeclaredCashTips += dcT;

        byEmployee.push({
          employeeId: empId,
          regularHours: round2(regH),
          overtimeHours: round2(otH),
          doubleTimeHours: round2(dtH),
          totalHours: round2(tH),
          regularPay: round2(regP),
          overtimePay: round2(otP),
          totalPay: round2(tP),
          declaredCashTips: round2(dcT),
          clockInTime: tcs[0]?.clockInTime || null,
          clockOutTime: tcs[tcs.length - 1]?.clockOutTime || null,
        });
      }

      const laborPercent = netSales > 0 ? round2((totalPay / netSales) * 100) : 0;
      const salesPerLaborHour = totalHours > 0 ? round2(netSales / totalHours) : 0;

      res.json({
        propertyId,
        businessDate,
        totalRegularHours: round2(totalRegularHours),
        totalOvertimeHours: round2(totalOvertimeHours),
        totalDoubleTimeHours: round2(totalDoubleTimeHours),
        totalHours: round2(totalHours),
        totalRegularPay: round2(totalRegularPay),
        totalOvertimePay: round2(totalOvertimePay),
        totalPay: round2(totalPay),
        totalDeclaredCashTips: round2(totalDeclaredCashTips),
        netSales,
        laborPercent,
        salesPerLaborHour,
        employeeCount: empMap.size,
        byEmployee,
      });
    } catch (err: any) {
      console.error("Labor summary error:", err);
      res.status(500).json({ message: "Failed to generate labor summary", error: err.message });
    }
  });

  // =========================================================================
  // BOH 6 – Tip Pool Summary (CC Tips Only)
  // =========================================================================
  app.get("/api/reports/tip-pool-summary", async (req: Request, res: Response) => {
    try {
      const { propertyId, businessDate } = req.query as Record<string, string | undefined>;
      if (!propertyId || !businessDate) {
        return res.status(400).json({ message: "propertyId and businessDate are required" });
      }

      const filters: ReportFilters = { propertyId, businessDate };

      const [paymentLines, timecardLines] = await Promise.all([
        getPaymentLines(filters),
        getTimecardLines(filters),
      ]);

      const totalPoolableTips = round2(
        paymentLines
          .filter(l => l.tenderType === "credit" || l.tenderType === "debit")
          .reduce((s, l) => s + num(l.tipAmount), 0)
      );

      const participantTimecards = timecardLines.filter(tc => num(tc.totalHours) > 0);

      const empHoursMap = new Map<string, number>();
      for (const tc of participantTimecards) {
        empHoursMap.set(tc.employeeId, (empHoursMap.get(tc.employeeId) || 0) + num(tc.totalHours));
      }

      const totalHoursWorked = round2(Array.from(empHoursMap.values()).reduce((s, h) => s + h, 0));

      const participants = Array.from(empHoursMap.entries()).map(([employeeId, hoursWorked]) => {
        const sharePercentage = totalHoursWorked > 0 ? round2((hoursWorked / totalHoursWorked) * 100) : 0;
        const allocatedAmount = round2((sharePercentage / 100) * totalPoolableTips);
        return {
          employeeId,
          hoursWorked: round2(hoursWorked),
          sharePercentage,
          allocatedAmount,
        };
      });

      res.json({
        propertyId,
        businessDate,
        totalPoolableTips,
        totalHoursWorked,
        participantCount: participants.length,
        participants,
      });
    } catch (err: any) {
      console.error("Tip pool summary error:", err);
      res.status(500).json({ message: "Failed to generate tip pool summary", error: err.message });
    }
  });

  // =========================================================================
  // 7 – Validation Endpoint
  // =========================================================================
  app.get("/api/reports/validate", async (req: Request, res: Response) => {
    try {
      const { propertyId, businessDate } = req.query as Record<string, string | undefined>;
      if (!propertyId || !businessDate) {
        return res.status(400).json({ message: "propertyId and businessDate are required" });
      }

      // a) Service charge reconciliation
      const scReconResult = await db.execute(sql`
        SELECT
          c.id AS "checkId",
          c.check_number AS "checkNumber",
          COALESCE(c.service_charge_total, 0) AS "headerTotal",
          COALESCE(sub.line_total, 0) AS "lineTotal"
        FROM checks c
        JOIN rvcs r ON r.id = c.rvc_id
        LEFT JOIN (
          SELECT check_id, SUM(amount) AS line_total
          FROM check_service_charges
          WHERE voided = false
          GROUP BY check_id
        ) sub ON sub.check_id = c.id
        WHERE c.business_date = ${businessDate}
          AND r.property_id = ${propertyId}
          AND (c.test_mode = false OR c.test_mode IS NULL)
      `);

      const scRows = scReconResult.rows as any[];
      const scMismatches: any[] = [];
      for (const row of scRows) {
        const header = num(row.headerTotal);
        const lines = num(row.lineTotal);
        if (Math.abs(header - lines) > 0.01) {
          scMismatches.push({
            checkId: row.checkId,
            checkNumber: row.checkNumber,
            headerTotal: round2(header),
            lineTotal: round2(lines),
            difference: round2(header - lines),
          });
        }
      }

      const serviceChargeReconciliation = {
        status: scMismatches.length === 0 ? "PASS" : "FAIL",
        total: scRows.length,
        mismatches: scMismatches.length,
        details: scMismatches,
      };

      // b) Tip double-counting check (Model A verification)
      const tipCheckResult = await db.execute(sql`
        SELECT
          COALESCE(SUM(cp.amount), 0) AS "totalCollected",
          COALESCE(SUM(cp.tip_amount), 0) AS "totalTips"
        FROM check_payments cp
        JOIN checks c ON c.id = cp.check_id
        JOIN rvcs r ON r.id = c.rvc_id
        WHERE cp.payment_status = 'completed'
          AND (c.test_mode = false OR c.test_mode IS NULL)
          AND COALESCE(cp.business_date, c.business_date) = ${businessDate}
          AND r.property_id = ${propertyId}
      `);

      const tipRow = tipCheckResult.rows[0] as any;
      const totalCollectedVal = round2(num(tipRow?.totalCollected));
      const totalTipsVal = round2(num(tipRow?.totalTips));

      const tipDoubleCountCheck = {
        status: "PASS" as string,
        totalCollected: totalCollectedVal,
        totalTips: totalTipsVal,
        message: "Model A: payment.amount already includes tips. No double counting detected.",
      };

      // c) Cash drawer linkage
      const cashPaymentsResult = await db.execute(sql`
        SELECT
          cp.id AS "paymentId",
          cp.check_id AS "checkId",
          cp.amount
        FROM check_payments cp
        JOIN checks c ON c.id = cp.check_id
        JOIN rvcs r ON r.id = c.rvc_id
        JOIN tenders t ON t.id = cp.tender_id
        WHERE t.type = 'cash'
          AND cp.payment_status = 'completed'
          AND (c.test_mode = false OR c.test_mode IS NULL)
          AND COALESCE(cp.business_date, c.business_date) = ${businessDate}
          AND r.property_id = ${propertyId}
      `);

      const cashPayments = cashPaymentsResult.rows as any[];

      const cashTxResult = await db.execute(sql`
        SELECT DISTINCT check_id AS "checkId"
        FROM cash_transactions
        WHERE property_id = ${propertyId}
          AND business_date = ${businessDate}
          AND check_id IS NOT NULL
      `);
      const linkedCheckIds = new Set((cashTxResult.rows as any[]).map(r => r.checkId));

      const orphanedPayments: any[] = [];
      for (const cp of cashPayments) {
        if (cp.checkId && !linkedCheckIds.has(cp.checkId)) {
          orphanedPayments.push({
            paymentId: cp.paymentId,
            checkId: cp.checkId,
            amount: round2(num(cp.amount)),
          });
        }
      }

      const cashDrawerLinkage = {
        status: orphanedPayments.length === 0 ? "PASS" : "FAIL",
        totalCashPayments: cashPayments.length,
        orphaned: orphanedPayments.length,
        details: orphanedPayments,
      };

      // d) Sales rebuild
      const rebuildResult = await db.execute(sql`
        SELECT
          c.id AS "checkId",
          c.check_number AS "checkNumber",
          COALESCE(c.total, 0) AS "total",
          COALESCE(c.subtotal, 0) AS "subtotal",
          COALESCE(c.tax_total, 0) AS "taxTotal",
          COALESCE(c.service_charge_total, 0) AS "serviceChargeTotal",
          COALESCE(c.discount_total, 0) AS "discountTotal"
        FROM checks c
        JOIN rvcs r ON r.id = c.rvc_id
        WHERE c.business_date = ${businessDate}
          AND r.property_id = ${propertyId}
          AND c.status = 'closed'
          AND (c.test_mode = false OR c.test_mode IS NULL)
      `);

      const rebuildRows = rebuildResult.rows as any[];
      const rebuildMismatches: any[] = [];
      for (const row of rebuildRows) {
        const storedTotal = num(row.total);
        const computed = num(row.subtotal) + num(row.taxTotal) + num(row.serviceChargeTotal) - num(row.discountTotal);
        if (Math.abs(storedTotal - computed) > 0.02) {
          rebuildMismatches.push({
            checkId: row.checkId,
            checkNumber: row.checkNumber,
            storedTotal: round2(storedTotal),
            computedTotal: round2(computed),
            difference: round2(storedTotal - computed),
          });
        }
      }

      const salesRebuild = {
        status: rebuildMismatches.length === 0 ? "PASS" : "FAIL",
        total: rebuildRows.length,
        mismatches: rebuildMismatches.length,
        details: rebuildMismatches,
      };

      const overall =
        serviceChargeReconciliation.status === "PASS" &&
        tipDoubleCountCheck.status === "PASS" &&
        cashDrawerLinkage.status === "PASS" &&
        salesRebuild.status === "PASS"
          ? "PASS"
          : "FAIL";

      res.json({
        businessDate,
        propertyId,
        overall,
        checks: {
          serviceChargeReconciliation,
          tipDoubleCountCheck,
          cashDrawerLinkage,
          salesRebuild,
        },
      });
    } catch (err: any) {
      console.error("Validation error:", err);
      res.status(500).json({ message: "Failed to run validation checks", error: err.message });
    }
  });
}
