import type { IStorage } from "./storage";
import { db } from "./db";
import { checks, checkItems, checkPayments, kdsTickets, kdsTicketItems, rounds } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

interface StressTestConfig {
  rvcId: string;
  employeeId: string;
  tenderId: string;
  durationMinutes: number;
  targetTxPerMinute: number;
  patterns: ("single" | "double" | "triple")[];
}

interface TransactionResult {
  checkId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  itemCount: number;
  total: number;
  success: boolean;
  error?: string;
}

interface StressTestMetrics {
  status: "running" | "completed" | "stopped" | "error";
  startedAt: string;
  elapsedSeconds: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  avgTransactionMs: number;
  minTransactionMs: number;
  maxTransactionMs: number;
  transactionsPerMinute: number;
  intervals: IntervalMetrics[];
  errors: string[];
}

interface IntervalMetrics {
  minuteMark: number;
  txCount: number;
  txPerMinute: number;
  avgMs: number;
}

let activeTest: {
  config: StressTestConfig;
  running: boolean;
  startTime: number;
  results: TransactionResult[];
  testCheckIds: string[];
  menuItems: { id: string; name: string; price: string }[];
  intervalTimer?: ReturnType<typeof setInterval>;
} | null = null;

async function runTransaction(
  baseUrl: string,
  config: StressTestConfig,
  menuItems: { id: string; name: string; price: string }[],
): Promise<TransactionResult> {
  const startTime = Date.now();
  let checkId = "";
  let itemCount = 0;
  let total = 0;

  try {
    const pattern = config.patterns[Math.floor(Math.random() * config.patterns.length)];
    itemCount = pattern === "single" ? 1 : pattern === "double" ? 2 : 3;

    const createRes = await fetch(`${baseUrl}/api/checks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rvcId: config.rvcId,
        employeeId: config.employeeId,
        orderType: "dine_in",
        testMode: true,
      }),
    });
    if (!createRes.ok) throw new Error(`Create check failed: ${createRes.status}`);
    const check = await createRes.json();
    checkId = check.id;

    for (let i = 0; i < itemCount; i++) {
      const item = menuItems[Math.floor(Math.random() * menuItems.length)];
      const addRes = await fetch(`${baseUrl}/api/checks/${checkId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: item.id,
          menuItemName: item.name,
          unitPrice: item.price,
          quantity: 1,
          modifiers: [],
        }),
      });
      if (!addRes.ok) throw new Error(`Add item failed: ${addRes.status}`);
    }

    const sendRes = await fetch(`${baseUrl}/api/checks/${checkId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: config.employeeId }),
    });
    if (!sendRes.ok) throw new Error(`Send failed: ${sendRes.status}`);

    const checkRes = await fetch(`${baseUrl}/api/checks/${checkId}`);
    if (!checkRes.ok) throw new Error(`Get check failed: ${checkRes.status}`);
    const updatedCheck = await checkRes.json();
    total = parseFloat(updatedCheck.total || "0");

    const payRes = await fetch(`${baseUrl}/api/checks/${checkId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenderId: config.tenderId,
        amount: total.toFixed(2),
        employeeId: config.employeeId,
      }),
    });
    if (!payRes.ok) throw new Error(`Payment failed: ${payRes.status}`);

    const endTime = Date.now();
    return {
      checkId,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      itemCount,
      total,
      success: true,
    };
  } catch (error: any) {
    const endTime = Date.now();
    return {
      checkId,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      itemCount,
      total,
      success: false,
      error: error.message,
    };
  }
}

function computeMetrics(): StressTestMetrics {
  if (!activeTest) {
    return {
      status: "stopped",
      startedAt: "",
      elapsedSeconds: 0,
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      avgTransactionMs: 0,
      minTransactionMs: 0,
      maxTransactionMs: 0,
      transactionsPerMinute: 0,
      intervals: [],
      errors: [],
    };
  }

  const { results, startTime, running } = activeTest;
  const elapsed = (Date.now() - startTime) / 1000;
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const durations = successful.map((r) => r.durationMs);

  const intervalMinutes = [1, 5, 10, 15];
  const intervals: IntervalMetrics[] = [];
  for (const mins of intervalMinutes) {
    const cutoff = startTime + mins * 60 * 1000;
    if (cutoff > Date.now()) break;
    const inInterval = successful.filter((r) => r.endTime <= cutoff);
    const actualElapsed = Math.min(mins, elapsed / 60);
    intervals.push({
      minuteMark: mins,
      txCount: inInterval.length,
      txPerMinute: actualElapsed > 0 ? inInterval.length / actualElapsed : 0,
      avgMs:
        inInterval.length > 0
          ? inInterval.reduce((s, r) => s + r.durationMs, 0) / inInterval.length
          : 0,
    });
  }

  return {
    status: running ? "running" : results.length > 0 ? "completed" : "stopped",
    startedAt: new Date(startTime).toISOString(),
    elapsedSeconds: Math.round(elapsed),
    totalTransactions: results.length,
    successfulTransactions: successful.length,
    failedTransactions: failed.length,
    avgTransactionMs:
      durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : 0,
    minTransactionMs: durations.length > 0 ? Math.min(...durations) : 0,
    maxTransactionMs: durations.length > 0 ? Math.max(...durations) : 0,
    transactionsPerMinute:
      elapsed > 0 ? Math.round((successful.length / elapsed) * 60 * 10) / 10 : 0,
    intervals,
    errors: failed.slice(-10).map((r) => r.error || "Unknown error"),
  };
}

async function startTest(baseUrl: string, config: StressTestConfig, storage: IStorage) {
  if (activeTest?.running) {
    throw new Error("A stress test is already running");
  }

  const allMenuItems = await storage.getMenuItems();
  const availableItems = allMenuItems
    .filter((mi: any) => mi.active && parseFloat(mi.price || "0") > 0)
    .slice(0, 20)
    .map((mi: any) => ({ id: mi.id, name: mi.name, price: mi.price }));

  if (availableItems.length === 0) {
    throw new Error("No active menu items with prices found");
  }

  activeTest = {
    config,
    running: true,
    startTime: Date.now(),
    results: [],
    testCheckIds: [],
    menuItems: availableItems,
  };

  const delayBetweenTx = (60 * 1000) / config.targetTxPerMinute;
  const endTime = activeTest.startTime + config.durationMinutes * 60 * 1000;

  (async () => {
    while (activeTest?.running && Date.now() < endTime) {
      const result = await runTransaction(baseUrl, config, activeTest.menuItems);
      if (!activeTest?.running) break;
      activeTest.results.push(result);
      if (result.checkId) {
        activeTest.testCheckIds.push(result.checkId);
      }

      const timeTaken = result.durationMs;
      const waitTime = Math.max(0, delayBetweenTx - timeTaken);
      if (waitTime > 0 && activeTest?.running) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    if (activeTest) {
      activeTest.running = false;
    }
  })();
}

function stopTest() {
  if (activeTest) {
    activeTest.running = false;
  }
}

async function cleanupTestData(): Promise<{ deletedChecks: number; deletedItems: number; deletedPayments: number; deletedKdsTickets: number }> {
  const testChecks = await db.select({ id: checks.id }).from(checks).where(eq(checks.testMode, true));
  const checkIds = testChecks.map(c => c.id);

  if (checkIds.length === 0) {
    activeTest = null;
    return { deletedChecks: 0, deletedItems: 0, deletedPayments: 0, deletedKdsTickets: 0 };
  }

  const batchSize = 100;
  let deletedItems = 0, deletedPayments = 0, deletedKdsTickets = 0;

  for (let i = 0; i < checkIds.length; i += batchSize) {
    const batch = checkIds.slice(i, i + batchSize);

    const kdsTicketRows = await db.select({ id: kdsTickets.id }).from(kdsTickets).where(inArray(kdsTickets.checkId, batch));
    const ticketIds = kdsTicketRows.map(t => t.id);
    if (ticketIds.length > 0) {
      await db.delete(kdsTicketItems).where(inArray(kdsTicketItems.kdsTicketId, ticketIds));
      await db.delete(kdsTickets).where(inArray(kdsTickets.id, ticketIds));
      deletedKdsTickets += ticketIds.length;
    }

    const itemResult = await db.delete(checkItems).where(inArray(checkItems.checkId, batch));
    deletedItems += (itemResult as any).rowCount || 0;

    await db.delete(rounds).where(inArray(rounds.checkId, batch));

    const payResult = await db.delete(checkPayments).where(inArray(checkPayments.checkId, batch));
    deletedPayments += (payResult as any).rowCount || 0;

    await db.delete(checks).where(inArray(checks.id, batch));
  }

  const result = { deletedChecks: checkIds.length, deletedItems, deletedPayments, deletedKdsTickets };
  activeTest = null;
  return result;
}

export function registerStressTestRoutes(app: any, storage: IStorage) {
  app.post("/api/stress-test/start", async (req: any, res: any) => {
    try {
      const {
        rvcId,
        employeeId,
        tenderId,
        durationMinutes = 5,
        targetTxPerMinute = 10,
        patterns = ["single", "double", "triple"],
      } = req.body;

      if (!rvcId || !employeeId || !tenderId) {
        return res.status(400).json({ message: "rvcId, employeeId, and tenderId are required" });
      }
      if (targetTxPerMinute <= 0 || durationMinutes <= 0) {
        return res.status(400).json({ message: "targetTxPerMinute and durationMinutes must be greater than 0" });
      }

      const protocol = req.headers["x-forwarded-proto"] || "http";
      const host = req.headers["host"] || "localhost:5000";
      const baseUrl = `${protocol}://${host}`;

      await startTest(baseUrl, {
        rvcId,
        employeeId,
        tenderId,
        durationMinutes,
        targetTxPerMinute,
        patterns,
      }, storage);

      res.json({ message: "Stress test started", config: { rvcId, durationMinutes, targetTxPerMinute, patterns } });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/stress-test/stop", async (_req: any, res: any) => {
    stopTest();
    res.json({ message: "Stress test stopped", metrics: computeMetrics() });
  });

  app.get("/api/stress-test/status", async (_req: any, res: any) => {
    res.json(computeMetrics());
  });

  app.post("/api/stress-test/cleanup", async (_req: any, res: any) => {
    try {
      const result = await cleanupTestData();
      res.json({ message: "Test data cleaned up", ...result });
    } catch (error: any) {
      res.status(500).json({ message: "Cleanup failed: " + error.message });
    }
  });
}
