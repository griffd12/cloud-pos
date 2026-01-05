import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import Stripe from "stripe";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { resolveKdsTargetsForMenuItem, getActiveKdsDevices, getKdsStationTypes, getOrderDeviceSendMode } from "./kds-routing";
import { resolveBusinessDate, isValidBusinessDateFormat, incrementDate } from "./businessDate";
import {
  insertEnterpriseSchema, insertPropertySchema, insertRvcSchema, insertRoleSchema,
  insertEmployeeSchema, insertMajorGroupSchema, insertFamilyGroupSchema,
  insertSluSchema, insertTaxGroupSchema, insertPrintClassSchema,
  insertWorkstationSchema, insertPrinterSchema, insertKdsDeviceSchema,
  insertOrderDeviceSchema, insertOrderDevicePrinterSchema, insertOrderDeviceKdsSchema,
  insertPrintClassRoutingSchema, insertMenuItemSchema, insertModifierGroupSchema,
  insertModifierSchema, insertModifierGroupModifierSchema, insertMenuItemModifierGroupSchema,
  insertTenderSchema, insertDiscountSchema, insertServiceChargeSchema,
  insertCheckSchema, insertCheckItemSchema, insertCheckPaymentSchema,
  insertPosLayoutSchema, insertPosLayoutCellSchema,
  // T&A schemas
  insertJobCodeSchema, insertPayPeriodSchema, insertTimePunchSchema,
  insertBreakSessionSchema, insertTimecardSchema, insertTimecardExceptionSchema,
  insertEmployeeAvailabilitySchema, insertAvailabilityExceptionSchema,
  insertTimeOffRequestSchema, insertShiftTemplateSchema, insertShiftSchema,
  insertShiftCoverRequestSchema, insertShiftCoverOfferSchema,
  insertTipPoolPolicySchema, insertTipPoolRunSchema,
  // Payment schemas
  insertPaymentProcessorSchema,
  insertTerminalDeviceSchema,
  insertTerminalSessionSchema,
  TERMINAL_MODELS,
  TERMINAL_CONNECTION_TYPES,
  TERMINAL_DEVICE_STATUSES,
} from "@shared/schema";
import { z } from "zod";
import {
  createPaymentAdapter,
  resolveCredentials,
  getRegisteredGatewayTypes,
  isGatewayTypeSupported,
  getRequiredCredentialKeys,
} from "./payments";

const clients: Map<string, Set<WebSocket>> = new Map();

// Generic POS event broadcaster for real-time updates
interface PosEvent {
  type: string;
  payload?: Record<string, unknown>;
}

function broadcastPosEvent(event: PosEvent, channel?: string) {
  const targetChannel = channel || "all";
  const channelClients = clients.get(targetChannel);
  if (channelClients) {
    channelClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(event));
      }
    });
  }
  // Always also broadcast to "all" channel if a specific channel was targeted
  if (channel && channel !== "all") {
    const allClients = clients.get("all");
    if (allClients) {
      allClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(event));
        }
      });
    }
  }
}

// Event broadcasters for real-time updates across the system
function broadcastKdsUpdate(rvcId?: string) {
  broadcastPosEvent({ type: "kds_update" }, rvcId || "all");
}

function broadcastLoyaltyUpdate(customerId: string, newBalance: number, lifetimePoints: number) {
  broadcastPosEvent({
    type: "loyalty_update",
    payload: { customerId, currentPoints: newBalance, lifetimePoints }
  });
}

function broadcastCheckUpdate(checkId: string, status?: string, rvcId?: string) {
  broadcastPosEvent({
    type: "check_update",
    payload: { checkId, status, rvcId }
  }, rvcId || "all");
}

function broadcastCheckItemUpdate(checkId: string, itemId?: string) {
  broadcastPosEvent({
    type: "check_item_update",
    payload: { checkId, itemId }
  });
}

function broadcastPaymentUpdate(checkId: string, paymentId?: string) {
  broadcastPosEvent({
    type: "payment_update",
    payload: { checkId, paymentId }
  });
}

function broadcastMenuUpdate() {
  broadcastPosEvent({ type: "menu_update" });
}

// Helper to calculate tax snapshot for a check item at ring-in time
// This captures the tax settings so they are IMMUTABLE and not retroactively changed
interface TaxSnapshot {
  taxGroupIdAtSale: string | null;
  taxModeAtSale: string;
  taxRateAtSale: string;
  taxAmount: string;
  taxableAmount: string;
}

async function calculateTaxSnapshot(
  menuItemId: string,
  unitPrice: number,
  modifiers: { priceDelta: string }[],
  quantity: number
): Promise<TaxSnapshot> {
  const menuItem = await storage.getMenuItem(menuItemId);
  const taxGroups = await storage.getTaxGroups();
  const taxGroup = taxGroups.find((tg) => tg.id === menuItem?.taxGroupId);
  
  const taxGroupIdAtSale = taxGroup?.id || null;
  const taxModeAtSale = taxGroup?.taxMode || "add_on";
  const taxRateAtSale = parseFloat(taxGroup?.rate || "0");
  
  const modifierTotal = (modifiers || []).reduce(
    (mSum: number, mod: any) => mSum + parseFloat(mod.priceDelta || "0"),
    0
  );
  const taxableAmount = (unitPrice + modifierTotal) * quantity;
  
  // Calculate tax amount (only for add_on mode - inclusive mode has no additional tax)
  const taxAmount = taxModeAtSale === "add_on" ? taxableAmount * taxRateAtSale : 0;
  
  return {
    taxGroupIdAtSale,
    taxModeAtSale,
    taxRateAtSale: taxRateAtSale.toFixed(6),
    taxAmount: taxAmount.toFixed(2),
    taxableAmount: taxableAmount.toFixed(2),
  };
}

function broadcastEmployeeUpdate() {
  broadcastPosEvent({ type: "employee_update" });
}

function broadcastAdminUpdate(entityType: string, entityId?: string) {
  broadcastPosEvent({
    type: "admin_update",
    payload: { entityType, entityId }
  });
}

function broadcastInventoryUpdate(itemId?: string) {
  broadcastPosEvent({
    type: "inventory_update",
    payload: { itemId }
  });
}

function broadcastScheduleUpdate() {
  broadcastPosEvent({ type: "schedule_update" });
}

function broadcastReportUpdate(reportType?: string) {
  broadcastPosEvent({
    type: "report_update",
    payload: { reportType }
  });
}

// Shared helper to send unsent items to KDS with proper round and ticket creation
async function sendItemsToKds(
  checkId: string,
  employeeId: string,
  itemsToSend: any[],
  options: { auditAction?: string } = {}
): Promise<{ round: any; updatedItems: any[] }> {
  const check = await storage.getCheck(checkId);
  if (!check) throw new Error("Check not found");

  const rvc = await storage.getRvc(check.rvcId);
  if (!rvc) throw new Error("RVC not found");

  // Create round for this batch of items
  const existingRounds = await storage.getRounds(checkId);
  const roundNumber = existingRounds.length + 1;

  const round = await storage.createRound({
    checkId,
    roundNumber,
    sentByEmployeeId: employeeId,
  });

  // Mark items as sent with round ID
  const updatedItems = [];
  for (const item of itemsToSend) {
    const updated = await storage.updateCheckItem(item.id, {
      sent: true,
      roundId: round.id,
    });
    if (updated) updatedItems.push(updated);
  }

  // Group items by KDS device for routing
  const itemsByKdsDevice = new Map<string, { kdsDeviceId: string; stationType: string; orderDeviceId: string; items: any[] }>();
  const unroutedItems: any[] = [];

  for (const item of updatedItems) {
    if (item.menuItemId) {
      const targets = await resolveKdsTargetsForMenuItem(item.menuItemId, rvc.propertyId, check.rvcId || undefined);
      if (targets.length > 0) {
        for (const target of targets) {
          if (!itemsByKdsDevice.has(target.kdsDeviceId)) {
            itemsByKdsDevice.set(target.kdsDeviceId, {
              kdsDeviceId: target.kdsDeviceId,
              stationType: target.stationType,
              orderDeviceId: target.orderDeviceId,
              items: [],
            });
          }
          itemsByKdsDevice.get(target.kdsDeviceId)!.items.push(item);
        }
      } else {
        unroutedItems.push(item);
      }
    } else {
      unroutedItems.push(item);
    }
  }

  // Create KDS tickets for routed items
  for (const [kdsDeviceId, data] of Array.from(itemsByKdsDevice.entries())) {
    const kdsTicket = await storage.createKdsTicket({
      checkId,
      roundId: round.id,
      kdsDeviceId: data.kdsDeviceId,
      orderDeviceId: data.orderDeviceId,
      stationType: data.stationType,
      rvcId: check.rvcId,
      status: "active",
    });
    for (const item of data.items) {
      await storage.createKdsTicketItem(kdsTicket.id, item.id);
    }
  }

  // Create fallback ticket for unrouted items
  if (unroutedItems.length > 0) {
    const fallbackTicket = await storage.createKdsTicket({
      checkId,
      roundId: round.id,
      rvcId: check.rvcId,
      status: "active",
    });
    for (const item of unroutedItems) {
      await storage.createKdsTicketItem(fallbackTicket.id, item.id);
    }
  }

  // Create audit log
  await storage.createAuditLog({
    rvcId: check.rvcId,
    employeeId,
    action: options.auditAction || "send_to_kitchen",
    targetType: "check",
    targetId: checkId,
    details: { roundNumber, itemCount: itemsToSend.length },
  });

  broadcastKdsUpdate(check.rvcId || undefined);

  return { round, updatedItems };
}

// Helper to recalculate and persist check totals from items
// Called after every item add/update/void to maintain data integrity
// IMPORTANT: Uses STORED tax amounts from ring-in time, NOT current menu item settings
// This ensures tax is immutable and not retroactively recalculated if menu item tax settings change
async function recalculateCheckTotals(checkId: string): Promise<void> {
  const check = await storage.getCheck(checkId);
  if (!check) return;

  const items = await storage.getCheckItems(checkId);
  const activeItems = items.filter((i) => !i.voided);
  
  let displaySubtotal = 0;
  let addOnTax = 0;

  for (const item of activeItems) {
    // Use stored taxableAmount if available (new items have this)
    // Fall back to calculation for legacy items (before tax snapshot was implemented)
    if (item.taxableAmount) {
      // New items with tax snapshot - use stored values
      displaySubtotal += parseFloat(item.taxableAmount);
      addOnTax += parseFloat(item.taxAmount || "0");
    } else {
      // Legacy fallback: calculate from current settings (old items before this fix)
      // This maintains backwards compatibility for existing checks
      const unitPrice = parseFloat(item.unitPrice || "0");
      const modifierTotal = (item.modifiers || []).reduce(
        (mSum: number, mod: any) => mSum + parseFloat(mod.priceDelta || "0"),
        0
      );
      const itemTotal = (unitPrice + modifierTotal) * (item.quantity || 1);
      displaySubtotal += itemTotal;
      
      // For legacy items, we must look up current tax settings (unavoidable)
      const menuItems = await storage.getMenuItems();
      const taxGroups = await storage.getTaxGroups();
      const menuItem = menuItems.find((mi) => mi.id === item.menuItemId);
      const taxGroup = taxGroups.find((tg) => tg.id === menuItem?.taxGroupId);
      const taxRate = parseFloat(taxGroup?.rate || "0");
      const taxMode = taxGroup?.taxMode || "add_on";
      
      if (taxMode === "add_on") {
        addOnTax += itemTotal * taxRate;
      }
    }
  }

  // Round to 2 decimal places for financial accuracy
  const subtotal = Math.round(displaySubtotal * 100) / 100;
  const tax = Math.round(addOnTax * 100) / 100;
  const total = Math.round((displaySubtotal + addOnTax) * 100) / 100;

  await storage.updateCheck(checkId, {
    subtotal: subtotal.toFixed(2),
    taxTotal: tax.toFixed(2),
    total: total.toFixed(2),
  });
}

// Helper for dynamic order mode - adds item to a preview ticket for real-time KDS display
// Items remain unsent (sent=false) until explicit Send or Pay action
// All items for a check are consolidated onto a single preview ticket
// Respects DOM send modes: fire_on_fly (immediate), fire_on_next (next item triggers), fire_on_tender (payment triggers)
async function addItemToPreviewTicket(
  checkId: string,
  item: any,
  rvc: any,
  options?: { triggerSendOfPrevious?: boolean }
): Promise<any> {
  const check = await storage.getCheck(checkId);
  if (!check) return item;

  const sendMode = rvc?.domSendMode || "fire_on_fly";

  // Fire on Tender mode - don't add to KDS preview, items only appear on payment
  if (sendMode === "fire_on_tender") {
    // Items stay in check only, will be sent when payment is made
    return item;
  }

  // Get or create preview ticket for this check
  let previewTicket = await storage.getPreviewTicket(checkId);
  if (!previewTicket) {
    previewTicket = await storage.createKdsTicket({
      checkId,
      rvcId: check.rvcId,
      status: "active",
      isPreview: true,
      paid: false,
    });
  }

  // Fire on Fly mode - add item immediately to KDS preview
  if (sendMode === "fire_on_fly") {
    await storage.createKdsTicketItem(previewTicket.id, item.id);
    broadcastKdsUpdate(check.rvcId || undefined);
    return item;
  }

  // Fire on Next mode - this item triggers sending the PREVIOUS item(s) that were queued
  if (sendMode === "fire_on_next") {
    // Get all check items that are NOT yet in KDS preview
    const allItems = await storage.getCheckItems(checkId);
    const ticketItems = await storage.getKdsTicketItems(previewTicket.id);
    const ticketItemCheckIds = new Set(ticketItems.map(ti => ti.checkItemId));
    
    // Find items that are in check but not yet in KDS (excluding voided and the current new item)
    const pendingItems = allItems.filter(ci => 
      !ticketItemCheckIds.has(ci.id) && 
      !ci.voided && 
      ci.id !== item.id // Don't send the current item - it waits for the NEXT item
    );
    
    // Add all pending items (previous items) to KDS preview
    for (const pendingItem of pendingItems) {
      await storage.createKdsTicketItem(previewTicket.id, pendingItem.id);
    }
    
    // The current item is NOT added yet - it will be added when the NEXT item is rung
    // We store it in check but don't add to KDS preview
    
    broadcastKdsUpdate(check.rvcId || undefined);
    return item;
  }

  return item;
}

// Helper to send any pending Fire on Next items when check is finalized
async function sendPendingFireOnNextItems(checkId: string): Promise<void> {
  const check = await storage.getCheck(checkId);
  if (!check) return;

  const rvc = await storage.getRvc(check.rvcId);
  if (!rvc || rvc.domSendMode !== "fire_on_next") return;

  const previewTicket = await storage.getPreviewTicket(checkId);
  if (!previewTicket) return;

  const allItems = await storage.getCheckItems(checkId);
  const ticketItems = await storage.getKdsTicketItems(previewTicket.id);
  const ticketItemCheckIds = new Set(ticketItems.map(ti => ti.checkItemId));

  // Find items that haven't been added to KDS yet
  const pendingItems = allItems.filter(ci => 
    !ticketItemCheckIds.has(ci.id) && !ci.voided
  );

  // Add remaining items to KDS preview
  for (const pendingItem of pendingItems) {
    await storage.createKdsTicketItem(previewTicket.id, pendingItem.id);
  }

  if (pendingItems.length > 0) {
    broadcastKdsUpdate(check.rvcId || undefined);
  }
}

// Helper for DOM: Re-display bumped orders when modified
// When items are added/modified/voided on a check with a bumped ticket, 
// automatically recall the ticket so kitchen sees the update
async function recallBumpedTicketsOnModification(checkId: string): Promise<boolean> {
  const tickets = await storage.getKdsTicketsByCheck(checkId);
  let recalled = false;
  
  for (const ticket of tickets) {
    if (ticket.status === "bumped") {
      await storage.recallKdsTicket(ticket.id);
      recalled = true;
    }
  }
  
  if (recalled) {
    const check = await storage.getCheck(checkId);
    broadcastKdsUpdate(check?.rvcId || undefined);
  }
  
  return recalled;
}

// Helper to convert preview ticket to final when Send is pressed
// This creates a proper round, marks items as sent, and removes preview flag
// Also handles DOM send modes properly
async function finalizePreviewTicket(
  checkId: string,
  employeeId: string
): Promise<{ round: any; updatedItems: any[] } | null> {
  const check = await storage.getCheck(checkId);
  if (!check) return null;

  const rvc = await storage.getRvc(check.rvcId);
  if (!rvc) return null;

  // For fire_on_next mode, send any pending items that haven't been added to KDS yet
  if (rvc.dynamicOrderMode && rvc.domSendMode === "fire_on_next") {
    await sendPendingFireOnNextItems(checkId);
  }

  // For fire_on_tender mode, all items need to be sent now
  // Create preview ticket with all items if it doesn't exist
  let previewTicket = await storage.getPreviewTicket(checkId);
  
  if (rvc.dynamicOrderMode && rvc.domSendMode === "fire_on_tender") {
    // Create or update preview ticket with all unsent items
    if (!previewTicket) {
      previewTicket = await storage.createKdsTicket({
        checkId,
        rvcId: check.rvcId,
        status: "active",
        isPreview: true,
        paid: false,
      });
    }
    
    const items = await storage.getCheckItems(checkId);
    const unsentItems = items.filter(i => !i.sent && !i.voided);
    for (const item of unsentItems) {
      await storage.createKdsTicketItem(previewTicket.id, item.id);
    }
  }

  if (!previewTicket) return null;

  // Get items linked to preview ticket
  const items = await storage.getCheckItems(checkId);
  const unsentItems = items.filter(i => !i.sent && !i.voided);
  
  if (unsentItems.length === 0) {
    // No items to send, just remove preview status
    await storage.updateKdsTicket(previewTicket.id, { isPreview: false });
    return null;
  }

  // Create round for this send
  const existingRounds = await storage.getRounds(checkId);
  const roundNumber = existingRounds.length + 1;

  const round = await storage.createRound({
    checkId,
    roundNumber,
    sentByEmployeeId: employeeId,
  });

  // Mark items as sent with round ID
  const updatedItems = [];
  for (const item of unsentItems) {
    const updated = await storage.updateCheckItem(item.id, {
      sent: true,
      roundId: round.id,
    });
    if (updated) updatedItems.push(updated);
  }

  // Update preview ticket to be a regular ticket with round linkage
  await storage.updateKdsTicket(previewTicket.id, {
    isPreview: false,
    roundId: round.id,
  });

  // Create audit log
  await storage.createAuditLog({
    rvcId: check.rvcId,
    employeeId,
    action: "send_to_kitchen",
    targetType: "check",
    targetId: checkId,
    details: { roundNumber, itemCount: unsentItems.length },
  });

  broadcastKdsUpdate(check.rvcId || undefined);

  return { round, updatedItems };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    let subscribedChannel: string | null = null;

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "subscribe" && data.channel === "kds") {
          const channel = data.rvcId || "all";
          subscribedChannel = channel;
          if (!clients.has(channel)) {
            clients.set(channel, new Set());
          }
          clients.get(channel)!.add(ws);
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    });

    ws.on("close", () => {
      if (subscribedChannel && clients.has(subscribedChannel)) {
        clients.get(subscribedChannel)!.delete(ws);
      }
    });
  });

  // ============================================================================
  // DEVICE TOKEN MIDDLEWARE - Protects POS/KDS routes from unenrolled browsers
  // Routes exempt from device token validation:
  // - /emc/* (EMC uses session-based auth)
  // - /registered-devices/enroll (device enrollment process)
  // - /registered-devices/validate (token validation)
  // Note: req.path inside app.use('/api') omits the /api prefix
  // ============================================================================
  const deviceTokenExemptRoutes = [
    /^\/emc(\/.*)?$/,                      // EMC routes (session-based auth)
    /^\/registered-devices\/enroll$/,       // Device enrollment
    /^\/registered-devices\/validate$/,     // Token validation
  ];

  app.use("/api", async (req, res, next) => {
    // Check if route is exempt from device token validation
    const isExempt = deviceTokenExemptRoutes.some(pattern => pattern.test(req.path));
    if (isExempt) {
      return next();
    }

    // Get device token from header
    const deviceToken = req.headers["x-device-token"] as string;
    if (!deviceToken) {
      // Block requests without device token for POS/KDS routes
      return res.status(401).json({ 
        message: "Device not enrolled. Please complete device enrollment.",
        code: "DEVICE_TOKEN_REQUIRED"
      });
    }

    // Validate device token
    const deviceTokenHash = crypto.createHash("sha256").update(deviceToken).digest("hex");
    const device = await storage.getRegisteredDeviceByToken(deviceTokenHash);
    
    if (!device || device.status !== "enrolled") {
      return res.status(401).json({ 
        message: "Invalid or revoked device token. Please re-enroll this device.",
        code: "DEVICE_TOKEN_INVALID"
      });
    }

    // Attach device info to request for downstream use
    (req as any).enrolledDevice = device;
    next();
  });

  // ============================================================================
  // AUTH ROUTES
  // ============================================================================

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { pin, rvcId } = req.body;
      if (!pin || !rvcId) {
        return res.status(400).json({ message: "PIN and RVC ID required" });
      }

      const employee = await storage.getEmployeeByPin(pin);
      if (!employee || !employee.active) {
        return res.status(401).json({ message: "Invalid PIN" });
      }

      let privileges: string[] = [];
      let salariedBypass = false;
      let bypassJobCode = null;

      // Check if employee has a salaried job with bypassClockIn enabled
      const jobAssignments = await storage.getEmployeeJobCodesWithDetails(employee.id);
      const bypassJob = jobAssignments.find(j => j.bypassClockIn && j.jobCode?.compensationType === "salaried");
      
      if (bypassJob && bypassJob.jobCode?.roleId) {
        // Salaried employee with bypass - load privileges from job's role
        privileges = await storage.getRolePrivileges(bypassJob.jobCode.roleId);
        salariedBypass = true;
        bypassJobCode = bypassJob.jobCode;
      } else if (employee.roleId) {
        // Fall back to employee's default role (for admin access)
        privileges = await storage.getRolePrivileges(employee.roleId);
      }
      
      // Default privileges if none found
      if (privileges.length === 0) {
        privileges = [
          "fast_transaction", "send_to_kitchen", "void_unsent", "void_sent",
          "apply_discount", "admin_access", "kds_access", "manager_approval"
        ];
      }

      res.json({ employee, privileges, salariedBypass, bypassJobCode });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ============================================================================
  // ENTERPRISE ROUTES
  // ============================================================================

  app.get("/api/enterprises", async (req, res) => {
    const data = await storage.getEnterprises();
    res.json(data);
  });

  app.get("/api/enterprises/:id", async (req, res) => {
    const data = await storage.getEnterprise(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/enterprises", async (req, res) => {
    try {
      const validated = insertEnterpriseSchema.parse(req.body);
      const data = await storage.createEnterprise(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/enterprises/:id", async (req, res) => {
    const data = await storage.updateEnterprise(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/enterprises/:id", async (req, res) => {
    await storage.deleteEnterprise(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // PROPERTY ROUTES
  // ============================================================================

  app.get("/api/properties", async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    const data = await storage.getProperties(enterpriseId);
    res.json(data);
  });

  app.get("/api/properties/:id", async (req, res) => {
    const data = await storage.getProperty(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/properties", async (req, res) => {
    try {
      const validated = insertPropertySchema.parse(req.body);
      const data = await storage.createProperty(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/properties/:id", async (req, res) => {
    // Validate currentBusinessDate format if provided
    if (req.body.currentBusinessDate && !/^\d{4}-\d{2}-\d{2}$/.test(req.body.currentBusinessDate)) {
      return res.status(400).json({ message: "currentBusinessDate must be in YYYY-MM-DD format" });
    }
    // Require currentBusinessDate when manual mode is set
    if (req.body.businessDateMode === 'manual' && !req.body.currentBusinessDate) {
      // Check if existing property has a currentBusinessDate
      const existing = await storage.getProperty(req.params.id);
      if (!existing?.currentBusinessDate && !req.body.currentBusinessDate) {
        return res.status(400).json({ message: "currentBusinessDate is required when businessDateMode is 'manual'" });
      }
    }
    const data = await storage.updateProperty(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/properties/:id", async (req, res) => {
    await storage.deleteProperty(req.params.id);
    res.status(204).send();
  });

  app.get("/api/properties/:propertyId/employee-job-codes", async (req, res) => {
    try {
      const { propertyId } = req.params;
      const data = await storage.getAllEmployeeJobCodesForProperty(propertyId);
      res.json(data);
    } catch (error) {
      console.error("Error fetching employee job codes for property:", error);
      res.status(500).json({ message: "Failed to fetch employee job codes" });
    }
  });

  // ============================================================================
  // RVC ROUTES
  // ============================================================================

  app.get("/api/rvcs", async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;
    const data = await storage.getRvcs(propertyId);
    res.json(data);
  });

  app.get("/api/rvcs/:id", async (req, res) => {
    const data = await storage.getRvc(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  // Get property by RVC ID (for login page to fetch logo)
  app.get("/api/rvcs/:id/property", async (req, res) => {
    const rvc = await storage.getRvc(req.params.id);
    if (!rvc) return res.status(404).json({ message: "RVC not found" });
    const property = await storage.getProperty(rvc.propertyId);
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json(property);
  });

  app.post("/api/rvcs", async (req, res) => {
    try {
      const validated = insertRvcSchema.parse(req.body);
      const data = await storage.createRvc(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/rvcs/:id", async (req, res) => {
    const data = await storage.updateRvc(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/rvcs/:id", async (req, res) => {
    await storage.deleteRvc(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // ROLE ROUTES
  // ============================================================================

  app.get("/api/roles", async (req, res) => {
    const data = await storage.getRoles();
    res.json(data);
  });

  app.post("/api/roles", async (req, res) => {
    try {
      const validated = insertRoleSchema.parse(req.body);
      const data = await storage.createRole(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/roles/:id", async (req, res) => {
    const data = await storage.updateRole(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/roles/:id", async (req, res) => {
    await storage.deleteRole(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // EMPLOYEE ROUTES
  // ============================================================================

  app.get("/api/employees", async (req, res) => {
    const data = await storage.getEmployees();
    res.json(data);
  });

  app.get("/api/employees/:id", async (req, res) => {
    const data = await storage.getEmployee(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/employees", async (req, res) => {
    try {
      // Auto-assign employee number if not provided
      let employeeData = { ...req.body };
      if (!employeeData.employeeNumber) {
        const existingEmployees = await storage.getEmployees();
        const maxNum = existingEmployees.reduce((max, emp) => {
          const num = parseInt(emp.employeeNumber, 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        employeeData.employeeNumber = String(maxNum + 1).padStart(3, '0');
      }
      const validated = insertEmployeeSchema.parse(employeeData);
      const data = await storage.createEmployee(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/employees/:id", async (req, res) => {
    const data = await storage.updateEmployee(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/employees/:id", async (req, res) => {
    await storage.deleteEmployee(req.params.id);
    res.status(204).send();
  });

  // Employee Assignments (multi-property)
  app.get("/api/employee-assignments", async (req, res) => {
    const data = await storage.getAllEmployeeAssignments();
    res.json(data);
  });

  app.get("/api/employees/:id/assignments", async (req, res) => {
    const data = await storage.getEmployeeAssignments(req.params.id);
    res.json(data);
  });

  app.put("/api/employees/:id/assignments", async (req, res) => {
    const propertyIds = req.body.propertyIds || [];
    const data = await storage.setEmployeeAssignments(req.params.id, propertyIds);
    res.json(data);
  });

  // ============================================================================
  // PRIVILEGES ROUTES
  // ============================================================================

  app.get("/api/privileges", async (req, res) => {
    const data = await storage.getPrivileges();
    res.json(data);
  });

  app.post("/api/privileges/seed", async (req, res) => {
    // Seed all 28+ privileges from the POS roles matrix
    const privilegeList = [
      // Check Control
      { code: "open_check", name: "Open Check", domain: "check_control" },
      { code: "close_check", name: "Close Check", domain: "check_control" },
      { code: "split_check", name: "Split Check", domain: "check_control" },
      { code: "merge_checks", name: "Merge Checks", domain: "check_control" },
      { code: "transfer_check", name: "Transfer Check", domain: "check_control" },
      { code: "reopen_check", name: "Reopen Closed Check", domain: "check_control" },
      { code: "change_order_type", name: "Change Order Type", domain: "check_control" },
      { code: "assign_table", name: "Assign/Reassign Table", domain: "check_control" },
      // Item Control
      { code: "add_item", name: "Add Item", domain: "item_control" },
      { code: "void_item", name: "Void Item", domain: "item_control" },
      { code: "void_item_no_reason", name: "Void Item w/o Reason", domain: "item_control" },
      { code: "modify_price", name: "Modify Price", domain: "item_control" },
      { code: "add_modifier", name: "Add Modifier", domain: "item_control" },
      { code: "remove_modifier", name: "Remove Modifier", domain: "item_control" },
      // Payment Control
      { code: "apply_tender", name: "Apply Tender", domain: "payment_control" },
      { code: "split_payment", name: "Split Payment", domain: "payment_control" },
      { code: "refund", name: "Refund", domain: "payment_control" },
      { code: "force_tender", name: "Force Tender", domain: "payment_control" },
      { code: "offline_payment", name: "Offline Payment", domain: "payment_control" },
      // Manager Override
      { code: "approve_void", name: "Approve Void", domain: "manager_override" },
      { code: "approve_discount", name: "Approve Discount", domain: "manager_override" },
      { code: "approve_refund", name: "Approve Refund", domain: "manager_override" },
      { code: "approve_price_override", name: "Approve Price Override", domain: "manager_override" },
      { code: "manager_approval", name: "Manager Approval", domain: "manager_override" },
      // Reporting
      { code: "view_sales_reports", name: "View Sales Reports", domain: "reporting" },
      { code: "view_labor_reports", name: "View Labor Reports", domain: "reporting" },
      { code: "view_operations_reports", name: "View Operations Reports", domain: "reporting" },
      { code: "view_financial_reports", name: "View Financial Reports", domain: "reporting" },
      { code: "view_dashboard", name: "View Dashboard", domain: "reporting" },
      { code: "export_reports", name: "Export Reports", domain: "reporting" },
      { code: "view_audit_logs", name: "View Audit Logs", domain: "reporting" },
      // Admin & Operations
      { code: "admin_access", name: "Admin Access", domain: "admin" },
      { code: "kds_access", name: "KDS Access", domain: "operations" },
      // Legacy codes for backward compatibility
      { code: "fast_transaction", name: "Fast Transaction Mode", domain: "operations" },
      { code: "send_to_kitchen", name: "Send to Kitchen", domain: "operations" },
      { code: "void_unsent", name: "Void Unsent Items", domain: "item_control" },
      { code: "void_sent", name: "Void Sent Items", domain: "item_control" },
      { code: "apply_discount", name: "Apply Discount", domain: "payment_control" },
    ];
    await storage.upsertPrivileges(privilegeList);
    res.json({ message: "Privileges seeded successfully", count: privilegeList.length });
  });

  app.post("/api/roles/seed", async (req, res) => {
    // Seed 6 roles from the POS roles matrix with privilege assignments
    // Privilege codes matching the matrix
    const allPrivileges = [
      "open_check", "close_check", "split_check", "merge_checks", "transfer_check", "reopen_check", "change_order_type", "assign_table",
      "add_item", "void_item", "void_item_no_reason", "modify_price", "add_modifier", "remove_modifier",
      "apply_tender", "split_payment", "refund", "force_tender", "offline_payment",
      "approve_void", "approve_discount", "approve_refund", "approve_price_override", "manager_approval",
      "view_sales_reports", "view_labor_reports", "export_reports", "view_audit_logs",
      "admin_access", "kds_access", "fast_transaction", "send_to_kitchen", "void_unsent", "void_sent", "apply_discount"
    ];

    // Staff privileges (most limited)
    const staffPrivileges = [
      "open_check", "close_check", "split_check", "merge_checks", "change_order_type", "assign_table",
      "add_item", "add_modifier",
      "apply_tender", "split_payment",
      "fast_transaction", "send_to_kitchen", "kds_access"
    ];

    // Supervisor privileges (Staff + more)
    const supervisorPrivileges = [
      ...staffPrivileges,
      "transfer_check", "reopen_check",
      "void_item", "remove_modifier",
      "approve_void", "approve_discount",
      "view_sales_reports"
    ];

    // Ops Manager privileges (Supervisor + more)
    const opsMgrPrivileges = [
      ...supervisorPrivileges,
      "void_item_no_reason", "modify_price",
      "refund", "force_tender", "offline_payment",
      "approve_refund", "approve_price_override", "manager_approval",
      "view_labor_reports",
      "void_unsent", "void_sent", "apply_discount"
    ];

    // Property Admin privileges (Ops Mgr + reports)
    const propAdminPrivileges = [
      ...opsMgrPrivileges,
      "export_reports", "view_audit_logs"
    ];

    // Enterprise Admin privileges (all)
    const entAdminPrivileges = [...allPrivileges, "admin_access"];

    // System Admin privileges (all)
    const sysAdminPrivileges = [...allPrivileges, "admin_access"];

    const rolesData = [
      { code: "SYS_ADMIN", name: "System Admin", privileges: sysAdminPrivileges },
      { code: "ENT_ADMIN", name: "Enterprise Admin", privileges: entAdminPrivileges },
      { code: "PROP_ADMIN", name: "Property Admin", privileges: propAdminPrivileges },
      { code: "OPS_MGR", name: "Operations Manager", privileges: opsMgrPrivileges },
      { code: "SUPERVISOR", name: "Supervisor", privileges: supervisorPrivileges },
      { code: "STAFF", name: "Staff", privileges: staffPrivileges },
    ];

    const createdRoles = [];
    for (const roleData of rolesData) {
      const role = await storage.upsertRole({ name: roleData.name, code: roleData.code, active: true });
      await storage.setRolePrivileges(role.id, Array.from(new Set(roleData.privileges))); // Remove duplicates
      createdRoles.push(role);
    }

    res.json({ message: "Roles seeded successfully", roles: createdRoles });
  });

  // Get privileges for a specific role
  app.get("/api/roles/:roleId/privileges", async (req, res) => {
    try {
      const privileges = await storage.getRolePrivileges(req.params.roleId);
      res.json(privileges);
    } catch (error) {
      console.error("Error fetching role privileges:", error);
      res.status(500).json({ message: "Failed to fetch role privileges" });
    }
  });

  // Set privileges for a specific role
  app.put("/api/roles/:roleId/privileges", async (req, res) => {
    try {
      const { privileges } = req.body;
      if (!Array.isArray(privileges)) {
        return res.status(400).json({ message: "privileges must be an array" });
      }
      await storage.setRolePrivileges(req.params.roleId, privileges);
      res.json({ message: "Role privileges updated" });
    } catch (error) {
      console.error("Error updating role privileges:", error);
      res.status(500).json({ message: "Failed to update role privileges" });
    }
  });

  // ============================================================================
  // MAJOR GROUP ROUTES (for reporting)
  // ============================================================================

  app.get("/api/major-groups", async (req, res) => {
    const data = await storage.getMajorGroups();
    res.json(data);
  });

  app.get("/api/major-groups/:id", async (req, res) => {
    const data = await storage.getMajorGroup(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/major-groups", async (req, res) => {
    try {
      const validated = insertMajorGroupSchema.parse(req.body);
      const data = await storage.createMajorGroup(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/major-groups/:id", async (req, res) => {
    try {
      const validated = insertMajorGroupSchema.partial().parse(req.body);
      const data = await storage.updateMajorGroup(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete("/api/major-groups/:id", async (req, res) => {
    await storage.deleteMajorGroup(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // FAMILY GROUP ROUTES (for reporting)
  // ============================================================================

  app.get("/api/family-groups", async (req, res) => {
    const majorGroupId = req.query.majorGroupId as string | undefined;
    const data = await storage.getFamilyGroups(majorGroupId);
    res.json(data);
  });

  app.get("/api/family-groups/:id", async (req, res) => {
    const data = await storage.getFamilyGroup(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/family-groups", async (req, res) => {
    try {
      const validated = insertFamilyGroupSchema.parse(req.body);
      const data = await storage.createFamilyGroup(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/family-groups/:id", async (req, res) => {
    try {
      const validated = insertFamilyGroupSchema.partial().parse(req.body);
      const data = await storage.updateFamilyGroup(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete("/api/family-groups/:id", async (req, res) => {
    await storage.deleteFamilyGroup(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // SLU ROUTES
  // ============================================================================

  app.get("/api/slus", async (req, res) => {
    const rvcId = req.query.rvcId as string | undefined;
    const data = await storage.getSlus(rvcId);
    res.json(data);
  });

  // Get SLUs by RVC ID (path param version for frontend convenience)
  app.get("/api/slus/:rvcId", async (req, res) => {
    // Return all active SLUs - in inheritance model, if no RVC-specific SLUs, return global ones
    const data = await storage.getSlus();
    res.json(data);
  });

  app.post("/api/slus", async (req, res) => {
    try {
      const validated = insertSluSchema.parse(req.body);
      const data = await storage.createSlu(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/slus/:id", async (req, res) => {
    const data = await storage.updateSlu(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/slus/:id", async (req, res) => {
    await storage.deleteSlu(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // MENU ITEM ROUTES
  // ============================================================================

  app.get("/api/menu-items", async (req, res) => {
    const sluId = req.query.sluId as string | undefined;
    const data = await storage.getMenuItems(sluId);
    res.json(data);
  });

  app.post("/api/menu-items", async (req, res) => {
    try {
      const validated = insertMenuItemSchema.parse(req.body);
      const data = await storage.createMenuItem(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/menu-items/:id", async (req, res) => {
    const data = await storage.updateMenuItem(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/menu-items/:id", async (req, res) => {
    try {
      await storage.deleteMenuItem(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Cannot delete menu item" });
    }
  });

  // Menu Items Import/Export
  app.get("/api/menu-items/export", async (req, res) => {
    const items = await storage.getMenuItems();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=menu-items.json");
    res.json(items);
  });

  app.post("/api/menu-items/import", async (req, res) => {
    try {
      const items = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: "Expected an array of menu items" });
      }
      const majorGroups = await storage.getMajorGroups();
      const familyGroups = await storage.getFamilyGroups();
      const existingMenuItems = await storage.getMenuItems();
      
      let created = 0;
      let updated = 0;
      const results: any[] = [];
      
      for (const item of items) {
        const { id, majorGroup, familyGroup, ...data } = item;
        let majorGroupId = data.majorGroupId || null;
        let familyGroupId = data.familyGroupId || null;
        
        if (majorGroup && typeof majorGroup === 'string' && majorGroup.trim() && !majorGroupId) {
          const found = majorGroups.find(g => g.name.toLowerCase() === majorGroup.trim().toLowerCase());
          majorGroupId = found?.id || null;
        }
        if (familyGroup && typeof familyGroup === 'string' && familyGroup.trim() && !familyGroupId) {
          const found = familyGroups.find(g => g.name.toLowerCase() === familyGroup.trim().toLowerCase());
          familyGroupId = found?.id || null;
        }
        
        const itemData = {
          name: data.name,
          shortName: data.shortName || null,
          price: data.price,
          taxGroupId: data.taxGroupId || null,
          printClassId: data.printClassId || null,
          majorGroupId,
          familyGroupId,
          color: data.color || "#3B82F6",
          active: data.active !== false,
        };
        
        let existingItem = null;
        if (id && typeof id === 'string' && id.trim()) {
          existingItem = existingMenuItems.find(m => m.id === id.trim());
        }
        if (!existingItem && data.name) {
          existingItem = existingMenuItems.find(m => m.name.toLowerCase() === data.name.toLowerCase());
        }
        
        if (existingItem) {
          const updatedItem = await storage.updateMenuItem(existingItem.id, itemData);
          results.push(updatedItem);
          updated++;
        } else {
          const newItem = await storage.createMenuItem({
            ...itemData,
            enterpriseId: null,
            propertyId: null,
            rvcId: null,
          });
          results.push(newItem);
          created++;
        }
      }
      
      res.status(201).json({ 
        imported: results.length, 
        created, 
        updated, 
        message: `Processed ${results.length} items: ${created} created, ${updated} updated`,
        items: results 
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Import failed" });
    }
  });

  // Unlink menu item from all SLUs (remove from POS display without deleting)
  app.post("/api/menu-items/:id/unlink-slus", async (req, res) => {
    try {
      const count = await storage.unlinkMenuItemFromSLUs(req.params.id);
      // Also deactivate the menu item
      await storage.updateMenuItem(req.params.id, { active: false });
      res.json({ message: `Unlinked from ${count} categories and deactivated`, unlinkedCount: count });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to unlink" });
    }
  });

  // Get all menu item SLU linkages (or filter by menuItemId)
  app.get("/api/menu-item-slus", async (req, res) => {
    const menuItemId = req.query.menuItemId as string | undefined;
    const data = await storage.getMenuItemSlus(menuItemId);
    res.json(data);
  });

  // Set SLU linkages for a menu item
  app.post("/api/menu-items/:id/slus", async (req, res) => {
    try {
      const { sluIds } = req.body;
      if (!Array.isArray(sluIds)) {
        return res.status(400).json({ message: "sluIds must be an array" });
      }
      await storage.setMenuItemSlus(req.params.id, sluIds);
      res.json({ message: "SLU linkages updated" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update SLU linkages" });
    }
  });

  // ============================================================================
  // MODIFIER ROUTES (standalone modifiers)
  // ============================================================================

  app.get("/api/modifiers", async (req, res) => {
    const data = await storage.getModifiers();
    res.json(data);
  });

  app.get("/api/modifiers/:id", async (req, res) => {
    const data = await storage.getModifier(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/modifiers", async (req, res) => {
    try {
      const validated = insertModifierSchema.parse(req.body);
      const data = await storage.createModifier(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/modifiers/:id", async (req, res) => {
    const data = await storage.updateModifier(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/modifiers/:id", async (req, res) => {
    try {
      await storage.deleteModifier(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete modifier" });
    }
  });

  // ============================================================================
  // MODIFIER GROUP ROUTES
  // ============================================================================

  app.get("/api/modifier-groups", async (req, res) => {
    const menuItemId = req.query.menuItemId as string | undefined;
    const data = await storage.getModifierGroups(menuItemId);
    res.json(data);
  });

  app.get("/api/modifier-groups/:id", async (req, res) => {
    const data = await storage.getModifierGroup(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/modifier-groups", async (req, res) => {
    try {
      const validated = insertModifierGroupSchema.parse(req.body);
      const data = await storage.createModifierGroup(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/modifier-groups/:id", async (req, res) => {
    const data = await storage.updateModifierGroup(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/modifier-groups/:id", async (req, res) => {
    await storage.deleteModifierGroup(req.params.id);
    res.status(204).send();
  });

  // Modifier Group to Modifier linkage
  app.get("/api/modifier-groups/:id/modifiers", async (req, res) => {
    const data = await storage.getModifierGroupModifiers(req.params.id);
    res.json(data);
  });

  app.post("/api/modifier-groups/:id/modifiers", async (req, res) => {
    try {
      const { modifierId, isDefault, displayOrder } = req.body;
      const validated = insertModifierGroupModifierSchema.parse({
        modifierGroupId: req.params.id,
        modifierId,
        isDefault: isDefault || false,
        displayOrder: displayOrder || 0,
      });
      const data = await storage.linkModifierToGroup(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete("/api/modifier-groups/:groupId/modifiers/:modifierId", async (req, res) => {
    await storage.unlinkModifierFromGroup(req.params.groupId, req.params.modifierId);
    res.status(204).send();
  });

  // ============================================================================
  // MENU ITEM MODIFIER GROUP LINKAGE ROUTES
  // ============================================================================

  app.get("/api/menu-items/:id/modifier-groups", async (req, res) => {
    const data = await storage.getMenuItemModifierGroups(req.params.id);
    res.json(data);
  });

  app.post("/api/menu-items/:id/modifier-groups", async (req, res) => {
    try {
      const { modifierGroupId, displayOrder } = req.body;
      const validated = insertMenuItemModifierGroupSchema.parse({
        menuItemId: req.params.id,
        modifierGroupId,
        displayOrder: displayOrder || 0,
      });
      const data = await storage.linkModifierGroupToMenuItem(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete("/api/menu-items/:menuItemId/modifier-groups/:groupId", async (req, res) => {
    await storage.unlinkModifierGroupFromMenuItem(req.params.menuItemId, req.params.groupId);
    res.status(204).send();
  });

  // Bulk update menu item modifier groups
  app.put("/api/menu-items/:id/modifier-groups", async (req, res) => {
    try {
      const { modifierGroupIds } = req.body;
      if (!Array.isArray(modifierGroupIds)) {
        return res.status(400).json({ message: "modifierGroupIds must be an array" });
      }
      // Get existing linkages
      const existing = await storage.getMenuItemModifierGroups(req.params.id);
      const existingIds = existing.map(e => e.modifierGroupId);
      
      // Remove those not in the new list
      for (const ex of existing) {
        if (!modifierGroupIds.includes(ex.modifierGroupId)) {
          await storage.unlinkModifierGroupFromMenuItem(req.params.id, ex.modifierGroupId);
        }
      }
      
      // Add new ones
      for (let i = 0; i < modifierGroupIds.length; i++) {
        if (!existingIds.includes(modifierGroupIds[i])) {
          await storage.linkModifierGroupToMenuItem({
            menuItemId: req.params.id,
            modifierGroupId: modifierGroupIds[i],
            displayOrder: i,
          });
        }
      }
      
      res.json({ message: "Modifier group linkages updated" });
    } catch (error) {
      res.status(400).json({ message: "Failed to update modifier group linkages" });
    }
  });

  // ============================================================================
  // TAX GROUP ROUTES
  // ============================================================================

  app.get("/api/tax-groups", async (req, res) => {
    const data = await storage.getTaxGroups();
    res.json(data);
  });

  app.post("/api/tax-groups", async (req, res) => {
    try {
      const validated = insertTaxGroupSchema.parse(req.body);
      const data = await storage.createTaxGroup(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/tax-groups/:id", async (req, res) => {
    const data = await storage.updateTaxGroup(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/tax-groups/:id", async (req, res) => {
    try {
      await storage.deleteTaxGroup(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      if (error.code === "23503") {
        res.status(400).json({ message: "Cannot delete tax group that is in use by menu items" });
      } else {
        console.error("Delete tax group error:", error);
        res.status(500).json({ message: "Failed to delete tax group" });
      }
    }
  });

  // ============================================================================
  // PRINT CLASS ROUTES
  // ============================================================================

  app.get("/api/print-classes", async (req, res) => {
    const data = await storage.getPrintClasses();
    res.json(data);
  });

  app.post("/api/print-classes", async (req, res) => {
    try {
      const validated = insertPrintClassSchema.parse(req.body);
      const data = await storage.createPrintClass(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/print-classes/:id", async (req, res) => {
    const data = await storage.updatePrintClass(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/print-classes/:id", async (req, res) => {
    try {
      await storage.deletePrintClass(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      if (error.code === '23503') {
        res.status(400).json({ message: "Cannot delete: This print class is still assigned to menu items. Please remove it from all menu items first." });
      } else {
        console.error("Error deleting print class:", error);
        res.status(500).json({ message: "Failed to delete print class" });
      }
    }
  });

  // ============================================================================
  // ORDER DEVICE ROUTES
  // ============================================================================

  app.get("/api/order-devices", async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;
    const data = await storage.getOrderDevices(propertyId);
    res.json(data);
  });

  app.post("/api/order-devices", async (req, res) => {
    try {
      const validated = insertOrderDeviceSchema.parse(req.body);
      const data = await storage.createOrderDevice(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/order-devices/:id", async (req, res) => {
    const data = await storage.updateOrderDevice(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/order-devices/:id", async (req, res) => {
    await storage.deleteOrderDevice(req.params.id);
    res.status(204).send();
  });

  // Order Device Printers linkage
  app.get("/api/order-devices/:id/printers", async (req, res) => {
    const data = await storage.getOrderDevicePrinters(req.params.id);
    res.json(data);
  });

  app.post("/api/order-devices/:id/printers", async (req, res) => {
    try {
      const validated = insertOrderDevicePrinterSchema.parse({
        orderDeviceId: req.params.id,
        ...req.body,
      });
      const data = await storage.linkPrinterToOrderDevice(validated);
      res.status(201).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid data";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/order-device-printers/:id", async (req, res) => {
    await storage.unlinkPrinterFromOrderDevice(req.params.id);
    res.status(204).send();
  });

  // Order Device KDS linkage
  app.get("/api/order-devices/:id/kds", async (req, res) => {
    const data = await storage.getOrderDeviceKdsList(req.params.id);
    res.json(data);
  });

  app.post("/api/order-devices/:id/kds", async (req, res) => {
    try {
      const validated = insertOrderDeviceKdsSchema.parse({
        orderDeviceId: req.params.id,
        ...req.body,
      });
      const data = await storage.linkKdsToOrderDevice(validated);
      res.status(201).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid data";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/order-device-kds/:id", async (req, res) => {
    await storage.unlinkKdsFromOrderDevice(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // WORKSTATION ROUTES
  // ============================================================================

  app.get("/api/workstations", async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;
    const data = await storage.getWorkstations(propertyId);
    res.json(data);
  });

  app.get("/api/workstations/:id", async (req, res) => {
    const data = await storage.getWorkstation(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  // Get workstation context with property and allowed RVCs
  app.get("/api/workstations/:id/context", async (req, res) => {
    const workstation = await storage.getWorkstation(req.params.id);
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    
    const property = await storage.getProperty(workstation.propertyId);
    if (!property) return res.status(404).json({ message: "Property not found" });
    
    // Get only RVCs from this workstation's property
    const rvcs = await storage.getRvcs(workstation.propertyId);
    
    res.json({
      workstation,
      property,
      rvcs,
    });
  });

  app.post("/api/workstations", async (req, res) => {
    try {
      const validated = insertWorkstationSchema.parse(req.body);
      const data = await storage.createWorkstation(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/workstations/:id", async (req, res) => {
    const data = await storage.updateWorkstation(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/workstations/:id", async (req, res) => {
    await storage.deleteWorkstation(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // PRINTER ROUTES
  // ============================================================================

  app.get("/api/printers", async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;
    const data = await storage.getPrinters(propertyId);
    res.json(data);
  });

  app.get("/api/printers/:id", async (req, res) => {
    const data = await storage.getPrinter(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/printers", async (req, res) => {
    try {
      const validated = insertPrinterSchema.parse(req.body);
      const data = await storage.createPrinter(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/printers/:id", async (req, res) => {
    const data = await storage.updatePrinter(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/printers/:id", async (req, res) => {
    await storage.deletePrinter(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // KDS DEVICE ROUTES
  // ============================================================================

  app.get("/api/kds-devices", async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;
    const data = await storage.getKdsDevices(propertyId);
    res.json(data);
  });

  app.get("/api/kds-devices/:id", async (req, res) => {
    const data = await storage.getKdsDevice(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.post("/api/kds-devices", async (req, res) => {
    try {
      const validated = insertKdsDeviceSchema.parse(req.body);
      const data = await storage.createKdsDevice(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/kds-devices/:id", async (req, res) => {
    const data = await storage.updateKdsDevice(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/kds-devices/:id", async (req, res) => {
    await storage.deleteKdsDevice(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // PRINT CLASS ROUTING
  // ============================================================================

  app.get("/api/print-class-routing", async (req, res) => {
    const { printClassId, propertyId, rvcId } = req.query as { printClassId?: string; propertyId?: string; rvcId?: string };
    if (printClassId) {
      const data = await storage.getPrintClassRouting(printClassId, propertyId, rvcId);
      res.json(data);
    } else {
      const data = await storage.getAllPrintClassRoutings();
      res.json(data);
    }
  });

  app.post("/api/print-class-routing", async (req, res) => {
    try {
      const validated = insertPrintClassRoutingSchema.parse(req.body);
      const data = await storage.createPrintClassRouting(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete("/api/print-class-routing/:id", async (req, res) => {
    await storage.deletePrintClassRouting(req.params.id);
    res.status(204).send();
  });

  // Routing resolution endpoint
  app.get("/api/resolve-devices/:menuItemId/:rvcId", async (req, res) => {
    const { menuItemId, rvcId } = req.params;
    const devices = await storage.resolveDevicesForMenuItem(menuItemId, rvcId);
    res.json(devices);
  });

  // ============================================================================
  // TENDER ROUTES
  // ============================================================================

  app.get("/api/tenders", async (req, res) => {
    const rvcId = req.query.rvcId as string | undefined;
    const data = await storage.getTenders(rvcId);
    res.json(data);
  });

  // Get tenders by RVC ID (path param version for frontend convenience)
  app.get("/api/tenders/:rvcId", async (req, res) => {
    const data = await storage.getTenders();
    res.json(data);
  });

  app.post("/api/tenders", async (req, res) => {
    try {
      const validated = insertTenderSchema.parse(req.body);
      const data = await storage.createTender(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/tenders/:id", async (req, res) => {
    const data = await storage.updateTender(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/tenders/:id", async (req, res) => {
    await storage.deleteTender(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // DISCOUNT ROUTES
  // ============================================================================

  app.get("/api/discounts", async (req, res) => {
    const data = await storage.getDiscounts();
    res.json(data);
  });

  app.post("/api/discounts", async (req, res) => {
    try {
      const validated = insertDiscountSchema.parse(req.body);
      const data = await storage.createDiscount(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/discounts/:id", async (req, res) => {
    const data = await storage.updateDiscount(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/discounts/:id", async (req, res) => {
    await storage.deleteDiscount(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // SERVICE CHARGE ROUTES
  // ============================================================================

  app.get("/api/service-charges", async (req, res) => {
    const data = await storage.getServiceCharges();
    res.json(data);
  });

  app.post("/api/service-charges", async (req, res) => {
    try {
      const validated = insertServiceChargeSchema.parse(req.body);
      const data = await storage.createServiceCharge(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.put("/api/service-charges/:id", async (req, res) => {
    const data = await storage.updateServiceCharge(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/service-charges/:id", async (req, res) => {
    await storage.deleteServiceCharge(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // CHECK LIFECYCLE ROUTES
  // ============================================================================

  app.get("/api/checks", async (req, res) => {
    const rvcId = req.query.rvcId as string | undefined;
    const status = req.query.status as string | undefined;
    const checks = await storage.getChecks(rvcId, status);
    res.json(checks);
  });

  // Get open checks for pickup - includes item count and last activity info
  app.get("/api/checks/open", async (req, res) => {
    try {
      const rvcId = req.query.rvcId as string;
      if (!rvcId) {
        return res.status(400).json({ message: "rvcId is required" });
      }
      
      const openChecks = await storage.getOpenChecks(rvcId);
      
      // Enrich each check with item count and last round info
      const enrichedChecks = await Promise.all(
        openChecks.map(async (check) => {
          const items = await storage.getCheckItems(check.id);
          const activeItems = items.filter((i) => !i.voided);
          const rounds = await storage.getRounds(check.id);
          const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
          
          return {
            ...check,
            itemCount: activeItems.length,
            unsentCount: activeItems.filter((i) => !i.sent).length,
            roundCount: rounds.length,
            lastRoundAt: lastRound?.sentAt || null,
          };
        })
      );
      
      res.json(enrichedChecks);
    } catch (error) {
      console.error("Get open checks error:", error);
      res.status(400).json({ message: "Failed to get open checks" });
    }
  });

  app.get("/api/checks/:id", async (req, res) => {
    const check = await storage.getCheck(req.params.id);
    if (!check) return res.status(404).json({ message: "Check not found" });
    const items = await storage.getCheckItems(req.params.id);
    const payments = await storage.getPayments(req.params.id);
    const totalTendered = payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
    const checkTotal = parseFloat(check.total || "0");
    // For cash over-tender: paidAmount is what was applied, changeDue is difference
    const paidAmount = Math.min(totalTendered, checkTotal);
    const changeDue = Math.max(0, totalTendered - checkTotal);
    res.json({ check: { ...check, paidAmount, tenderedAmount: totalTendered, changeDue }, items });
  });

  app.post("/api/checks", async (req, res) => {
    try {
      const { rvcId, employeeId, orderType } = req.body;
      const checkNumber = await storage.getNextCheckNumber(rvcId);
      
      // Get property for business date calculation
      const rvc = await storage.getRvc(rvcId);
      let businessDate: string | undefined;
      if (rvc) {
        const property = await storage.getProperty(rvc.propertyId);
        if (property) {
          businessDate = resolveBusinessDate(new Date(), property);
        }
      }
      
      const check = await storage.createCheck({
        checkNumber,
        rvcId,
        employeeId,
        orderType: orderType || "dine_in",
        status: "open",
        businessDate,
      });
      
      // Broadcast real-time update for new check
      broadcastCheckUpdate(check.id, "open", rvcId);
      
      res.status(201).json(check);
    } catch (error) {
      console.error("Create check error:", error);
      res.status(400).json({ message: "Failed to create check" });
    }
  });

  app.post("/api/checks/:id/items", async (req, res) => {
    try {
      const checkId = req.params.id;
      const { menuItemId, menuItemName, unitPrice, modifiers, quantity, itemStatus } = req.body;

      // Get property for business date calculation
      const check = await storage.getCheck(checkId);
      let businessDate: string | undefined;
      if (check) {
        const rvc = await storage.getRvc(check.rvcId);
        if (rvc) {
          const property = await storage.getProperty(rvc.propertyId);
          if (property) {
            businessDate = resolveBusinessDate(new Date(), property);
          }
        }
      }

      // Capture tax settings at ring-in time (IMMUTABLE - prevents retroactive tax changes)
      const itemQuantity = quantity || 1;
      const taxSnapshot = await calculateTaxSnapshot(
        menuItemId,
        parseFloat(unitPrice || "0"),
        modifiers || [],
        itemQuantity
      );
      
      const item = await storage.createCheckItem({
        checkId,
        menuItemId,
        menuItemName,
        unitPrice,
        modifiers: modifiers || [],
        quantity: itemQuantity,
        itemStatus: itemStatus || "active", // 'pending' for items awaiting modifiers
        sent: false,
        voided: false,
        businessDate,
        // Tax snapshot - locked at ring-in time
        ...taxSnapshot,
      });

      // Check for dynamic order mode - add to preview ticket if RVC has dynamicOrderMode enabled
      // Items stay unsent until explicit Send action or payment
      let finalItem = item;
      if (check && menuItemId) {
        const rvc = await storage.getRvc(check.rvcId);
        if (rvc && rvc.dynamicOrderMode) {
          // RVC has dynamic order mode enabled - add item to preview ticket for real-time KDS display
          try {
            await addItemToPreviewTicket(checkId, item, rvc);
          } catch (e) {
            console.error("Dynamic order preview error:", e);
          }
        }
        
        // DOM: Re-display bumped orders when modified
        // If any tickets for this check are bumped, recall them to show the new item
        await recallBumpedTicketsOnModification(checkId);
      }

      // Recalculate and persist check totals
      await recalculateCheckTotals(checkId);

      // Broadcast real-time update for new item
      broadcastCheckItemUpdate(checkId, finalItem.id);

      res.status(201).json(finalItem);
    } catch (error) {
      console.error("Add item error:", error);
      res.status(400).json({ message: "Failed to add item" });
    }
  });

  app.post("/api/checks/:id/send", async (req, res) => {
    try {
      const checkId = req.params.id;
      const { employeeId } = req.body;

      const check = await storage.getCheck(checkId);
      if (!check) {
        return res.status(404).json({ message: "Check not found" });
      }

      const rvc = await storage.getRvc(check.rvcId);
      
      // Check if there's a preview ticket (dynamic order mode)
      const previewResult = await finalizePreviewTicket(checkId, employeeId);
      if (previewResult) {
        // Preview ticket was finalized, return updated items
        const allItems = await storage.getCheckItems(checkId);
        return res.json({ round: previewResult.round, updatedItems: allItems });
      }

      // Standard mode - send unsent items normally
      const items = await storage.getCheckItems(checkId);
      const unsentItems = items.filter((item) => !item.sent && !item.voided);

      if (unsentItems.length === 0) {
        const allItems = await storage.getCheckItems(checkId);
        return res.json({ round: null, updatedItems: allItems });
      }

      // Use shared helper for consistent send behavior
      const { round, updatedItems } = await sendItemsToKds(checkId, employeeId, unsentItems);
      
      const allItems = await storage.getCheckItems(checkId);
      res.json({ round, updatedItems: allItems });
    } catch (error) {
      console.error("Send error:", error);
      res.status(400).json({ message: "Failed to send order" });
    }
  });

  // Update check item modifiers (only for unsent items or pending items in dynamic mode)
  app.patch("/api/check-items/:id/modifiers", async (req, res) => {
    try {
      const itemId = req.params.id;
      const { modifiers, employeeId, itemStatus } = req.body;

      const item = await storage.getCheckItem(itemId);
      if (!item) return res.status(404).json({ message: "Item not found" });

      // Allow modifications if: item is not sent, OR item is in "pending" status (dynamic mode)
      if (item.sent && item.itemStatus !== "pending") {
        return res.status(400).json({ message: "Cannot modify sent items" });
      }

      // Recalculate tax snapshot when modifiers change (modifiers affect taxable amount)
      // IMPORTANT: Use the ORIGINAL tax settings from ring-in, just recalculate the amounts
      const unitPrice = parseFloat(item.unitPrice || "0");
      const qty = item.quantity || 1;
      const modifierTotal = (modifiers || []).reduce(
        (mSum: number, mod: any) => mSum + parseFloat(mod.priceDelta || "0"),
        0
      );
      const taxableAmount = (unitPrice + modifierTotal) * qty;
      
      // Use original tax settings if available, otherwise calculate fresh
      let taxAmount: number;
      let taxUpdateData: any = {};
      
      if (item.taxRateAtSale) {
        // Use ORIGINAL tax settings from ring-in time
        const taxRate = parseFloat(item.taxRateAtSale);
        taxAmount = item.taxModeAtSale === "add_on" ? taxableAmount * taxRate : 0;
        taxUpdateData = {
          taxAmount: taxAmount.toFixed(2),
          taxableAmount: taxableAmount.toFixed(2),
        };
      } else {
        // Legacy item - calculate fresh snapshot
        const taxSnapshot = await calculateTaxSnapshot(item.menuItemId, unitPrice, modifiers || [], qty);
        taxUpdateData = taxSnapshot;
      }
      
      // Update modifiers and optionally itemStatus (for finalizing pending items)
      const updateData: any = { modifiers, ...taxUpdateData };
      if (itemStatus) {
        updateData.itemStatus = itemStatus;
      }
      const updated = await storage.updateCheckItem(itemId, updateData);

      const check = await storage.getCheck(item.checkId);
      
      // Broadcast KDS update if item was already sent (for dynamic mode updates)
      if (item.sent) {
        broadcastKdsUpdate(check?.rvcId || undefined);
      }

      await storage.createAuditLog({
        rvcId: check?.rvcId,
        employeeId,
        action: itemStatus === "active" && item.itemStatus === "pending" ? "finalize_pending_item" : "modify_item",
        targetType: "check_item",
        targetId: itemId,
        details: { menuItemName: item.menuItemName, modifiers, itemStatus },
      });

      // Broadcast KDS update so pending items update in real-time
      broadcastKdsUpdate(check?.rvcId || undefined);

      // Recalculate and persist check totals (modifiers affect prices)
      await recalculateCheckTotals(item.checkId);
      
      // DOM: Re-display bumped orders when modified
      await recallBumpedTicketsOnModification(item.checkId);

      res.json(updated);
    } catch (error) {
      console.error("Update modifiers error:", error);
      res.status(400).json({ message: "Failed to update modifiers" });
    }
  });

  app.post("/api/check-items/:id/void", async (req, res) => {
    try {
      const itemId = req.params.id;
      const { employeeId, reason, managerPin } = req.body;

      const item = await storage.getCheckItem(itemId);
      if (!item) return res.status(404).json({ message: "Item not found" });

      let managerApprovalId = null;
      if (item.sent && managerPin) {
        const manager = await storage.getEmployeeByPin(managerPin);
        if (!manager) {
          return res.status(401).json({ message: "Invalid manager PIN" });
        }
        managerApprovalId = manager.id;
      }

      const updated = await storage.updateCheckItem(itemId, {
        voided: true,
        voidReason: reason,
        voidedByEmployeeId: employeeId,
        voidedAt: new Date(),
      });

      // Update KDS ticket item status to voided so KDS reflects the void in real-time
      await storage.voidKdsTicketItem(itemId);

      const check = await storage.getCheck(item.checkId);
      await storage.createAuditLog({
        rvcId: check?.rvcId,
        employeeId,
        action: item.sent ? "void_sent" : "void_unsent",
        targetType: "check_item",
        targetId: itemId,
        details: { menuItemName: item.menuItemName, reason },
        reasonCode: reason,
        managerApprovalId,
      });

      // Recalculate and persist check totals (voiding affects total)
      await recalculateCheckTotals(item.checkId);

      // DOM: Re-display bumped orders when modified (voiding is a modification)
      await recallBumpedTicketsOnModification(item.checkId);

      broadcastKdsUpdate(check?.rvcId || undefined);
      res.json(updated);
    } catch (error) {
      console.error("Void error:", error);
      res.status(400).json({ message: "Failed to void item" });
    }
  });

  app.post("/api/checks/:id/payments", async (req, res) => {
    try {
      const checkId = req.params.id;
      const { tenderId, amount, employeeId, paymentTransactionId } = req.body;

      const tender = await storage.getTender(tenderId);
      if (!tender) return res.status(400).json({ message: "Invalid tender" });

      // DUPLICATE PREVENTION: If paymentTransactionId looks like a check payment ID (from Stripe record-payment),
      // check if this payment already exists to avoid creating duplicates
      if (paymentTransactionId) {
        const existingPayments = await storage.getPayments(checkId);
        const alreadyExists = existingPayments.find(p => p.id === paymentTransactionId);
        if (alreadyExists) {
          // Payment already recorded (likely from /api/stripe/record-payment), skip creation
          const check = await storage.getCheck(checkId);
          const paidAmount = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
          console.log("Payment already exists, skipping duplicate creation for:", paymentTransactionId);
          broadcastPaymentUpdate(checkId);
          return res.json({ ...check, paidAmount, payment: alreadyExists });
        }
      }

      // Get property for business date calculation
      const checkForBiz = await storage.getCheck(checkId);
      let businessDate: string | undefined;
      if (checkForBiz) {
        const rvc = await storage.getRvc(checkForBiz.rvcId);
        if (rvc) {
          const property = await storage.getProperty(rvc.propertyId);
          if (property) {
            businessDate = resolveBusinessDate(new Date(), property);
          }
        }
      }

      // Check if this is an authorized (pre-auth) transaction
      let paymentStatus = "completed";
      if (paymentTransactionId) {
        const transaction = await storage.getPaymentTransaction(paymentTransactionId);
        if (transaction && transaction.status === "authorized") {
          paymentStatus = "authorized";
        }
      }

      const payment = await storage.createPayment({
        checkId,
        tenderId,
        tenderName: tender.name,
        amount,
        employeeId,
        businessDate,
        paymentTransactionId: paymentTransactionId || null,
        paymentStatus,
      });

      const check = await storage.getCheck(checkId);
      if (!check) return res.status(404).json({ message: "Check not found" });
      
      const items = await storage.getCheckItems(checkId);
      const payments = await storage.getPayments(checkId);
      const activeItems = items.filter((i) => !i.voided);

      // Use persisted totals from check record (set by recalculateCheckTotals)
      const total = parseFloat(check.total || "0");
      const paidAmount = Math.round(payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0) * 100) / 100;

      console.log("Payment check - paidAmount:", paidAmount, "total:", total, "should close:", paidAmount >= total - 0.01);
      
      if (paidAmount >= total - 0.01) {
        // Check if RVC has dynamic order mode enabled
        const rvc = await storage.getRvc(check?.rvcId || "");
        const isDynamicMode = rvc?.dynamicOrderMode || false;

        // First, finalize any preview ticket (dynamic order mode)
        let previewFinalized = false;
        if (isDynamicMode) {
          try {
            const result = await finalizePreviewTicket(checkId, employeeId);
            previewFinalized = result !== null;
          } catch (e) {
            console.error("Payment preview finalize error:", e);
          }
        }

        // Only auto-send to KDS if NOT in dynamic mode or no preview was finalized
        // In dynamic mode, the preview ticket already contains all items
        if (!previewFinalized) {
          const unsentItems = activeItems.filter((i) => !i.sent);
          if (unsentItems.length > 0 && check) {
            try {
              await sendItemsToKds(checkId, employeeId, unsentItems, {
                auditAction: "payment_auto_send",
              });
            } catch (e) {
              console.error("Payment auto-send error:", e);
            }
          }
        }

        // Mark all KDS tickets for this check as paid
        try {
          await storage.markKdsTicketsPaid(checkId);
          broadcastKdsUpdate(check?.rvcId || undefined);
        } catch (e) {
          console.error("Mark tickets paid error:", e);
        }

        // Totals are already persisted via recalculateCheckTotals, just update status
        const updatedCheck = await storage.updateCheck(checkId, {
          status: "closed",
          closedAt: new Date(),
        });

        await storage.createAuditLog({
          rvcId: check?.rvcId,
          employeeId,
          action: "close_check",
          targetType: "check",
          targetId: checkId,
          details: { total, paidAmount },
        });

        console.log("Closing check, returning status:", updatedCheck?.status);
        
        // Broadcast real-time update for check closure
        broadcastCheckUpdate(checkId, "closed", check?.rvcId);
        broadcastPaymentUpdate(checkId);
        
        return res.json({ ...updatedCheck, paidAmount });
      }

      // Broadcast real-time update for partial payment
      broadcastPaymentUpdate(checkId);
      
      res.json({ ...check, paidAmount });
    } catch (error) {
      console.error("Payment error:", error);
      res.status(400).json({ message: "Payment failed" });
    }
  });

  app.get("/api/checks/:id/payments", async (req, res) => {
    const payments = await storage.getPayments(req.params.id);
    const paidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
    res.json({ payments, paidAmount });
  });

  // ============================================================================
  // CHECK CONTROL FUNCTIONS (Split, Transfer, Merge, Price Override)
  // ============================================================================

  // Split Check - Create new check(s) and move/share items
  // Supports: moving items, sharing items (splitting an item across checks)
  app.post("/api/checks/:id/split", async (req, res) => {
    try {
      const sourceCheckId = req.params.id;
      const { employeeId, operations } = req.body;
      // operations: Array of { type: 'move' | 'share', itemId: string, targetCheckIndex: number, shareRatio?: number }
      // For share: creates new items with split quantities/amounts

      if (!employeeId) {
        return res.status(400).json({ message: "Employee ID required" });
      }

      const sourceCheck = await storage.getCheck(sourceCheckId);
      if (!sourceCheck) {
        return res.status(404).json({ message: "Source check not found" });
      }
      if (sourceCheck.status === "closed") {
        return res.status(400).json({ message: "Cannot split a closed check" });
      }

      // Verify all items are sent before allowing split
      const itemsToCheck = await storage.getCheckItems(sourceCheckId);
      const unsentItemsOnCheck = itemsToCheck.filter(item => !item.sent && !item.voided);
      if (unsentItemsOnCheck.length > 0) {
        return res.status(400).json({ message: "Please send all unsent items first before splitting the check" });
      }

      // Count how many new checks we need
      const targetIndices = new Set(operations.map((op: any) => op.targetCheckIndex));
      const newChecks: any[] = [];

      // Create new checks as needed
      for (const targetIndex of Array.from(targetIndices)) {
        const checkNumber = await storage.getNextCheckNumber(sourceCheck.rvcId);
        const rvc = await storage.getRvc(sourceCheck.rvcId);
        let businessDate: string | undefined;
        if (rvc) {
          const property = await storage.getProperty(rvc.propertyId);
          if (property) {
            businessDate = resolveBusinessDate(new Date(), property);
          }
        }
        const newCheck = await storage.createCheck({
          checkNumber,
          rvcId: sourceCheck.rvcId,
          employeeId: sourceCheck.employeeId,
          orderType: sourceCheck.orderType,
          status: "open",
          businessDate,
          tableNumber: sourceCheck.tableNumber,
          guestCount: 1,
        });
        newChecks.push({ index: targetIndex, check: newCheck });
      }

      const results: any[] = [];

      // Process each operation
      for (const op of operations) {
        const targetCheck = newChecks.find((nc) => nc.index === op.targetCheckIndex)?.check;
        if (!targetCheck) continue;

        const item = await storage.getCheckItem(op.itemId);
        if (!item) continue;

        if (op.type === "move") {
          // Move entire item to new check - keep sent status (items must be sent before splitting)
          await storage.updateCheckItem(op.itemId, { checkId: targetCheck.id });
          results.push({ type: "move", itemId: op.itemId, newCheckId: targetCheck.id });
        } else if (op.type === "share") {
          // Share item: split the quantity and amount across checks
          const shareRatio = op.shareRatio || 0.5; // Default to 50/50
          const originalQty = item.quantity || 1;
          const originalPrice = parseFloat(item.unitPrice || "0");

          // Update original item with reduced quantity/value
          const originalShare = 1 - shareRatio;
          const newQtyOriginal = Math.max(1, Math.round(originalQty * originalShare));
          const newPriceOriginal = originalPrice * originalShare;

          await storage.updateCheckItem(op.itemId, {
            quantity: newQtyOriginal,
            unitPrice: newPriceOriginal.toFixed(2),
          });

          // Create new item on target check with shared portion
          const sharedQty = Math.max(1, originalQty - newQtyOriginal);
          const sharedPrice = originalPrice * shareRatio;

          // Get business date
          const rvc = await storage.getRvc(targetCheck.rvcId);
          let businessDate: string | undefined;
          if (rvc) {
            const property = await storage.getProperty(rvc.propertyId);
            if (property) {
              businessDate = resolveBusinessDate(new Date(), property);
            }
          }

          // Calculate tax snapshot for the shared portion
          // Important: The shared item should use the ORIGINAL tax settings, not recalculate
          // If original item has tax snapshot, inherit it; otherwise calculate new
          // CRITICAL: Scale modifiers by share ratio too (modifiers are split proportionally)
          let taxSnapshot: TaxSnapshot | null = null;
          if (item.taxableAmount) {
            // Inherit tax settings from original item, but recalculate amounts for new price/qty
            // The original taxableAmount was for original qty and full price - scale by shareRatio
            const originalTaxable = parseFloat(item.taxableAmount);
            const newTaxableAmount = originalTaxable * shareRatio;
            
            const taxRate = parseFloat(item.taxRateAtSale || "0");
            const newTaxAmount = item.taxModeAtSale === "add_on" ? newTaxableAmount * taxRate : 0;
            
            taxSnapshot = {
              taxGroupIdAtSale: item.taxGroupIdAtSale,
              taxModeAtSale: item.taxModeAtSale || "add_on",
              taxRateAtSale: item.taxRateAtSale || "0",
              taxAmount: newTaxAmount.toFixed(2),
              taxableAmount: newTaxableAmount.toFixed(2),
            };
            
            // Also update the ORIGINAL item's tax snapshot proportionally
            const originalRemainingTaxable = originalTaxable * (1 - shareRatio);
            const originalRemainingTax = item.taxModeAtSale === "add_on" ? originalRemainingTaxable * taxRate : 0;
            await storage.updateCheckItem(op.itemId, {
              taxAmount: originalRemainingTax.toFixed(2),
              taxableAmount: originalRemainingTaxable.toFixed(2),
            });
          } else {
            // Legacy item without tax snapshot - calculate fresh
            // Scale modifiers by share ratio for consistency
            const scaledModifiers = (item.modifiers || []).map((mod: any) => ({
              ...mod,
              priceDelta: (parseFloat(mod.priceDelta || "0") * shareRatio).toFixed(2),
            }));
            taxSnapshot = await calculateTaxSnapshot(
              item.menuItemId,
              sharedPrice,
              scaledModifiers,
              sharedQty
            );
          }

          const newItem = await storage.createCheckItem({
            checkId: targetCheck.id,
            menuItemId: item.menuItemId,
            menuItemName: `${item.menuItemName} (shared)`,
            unitPrice: sharedPrice.toFixed(2),
            modifiers: item.modifiers || [],
            quantity: sharedQty,
            itemStatus: "active",
            sent: item.sent, // Keep original sent status (items must be sent before splitting)
            roundId: item.roundId, // Keep original round reference
            voided: false,
            businessDate,
            // Tax snapshot - inherited from original or calculated fresh
            ...taxSnapshot,
          });

          results.push({
            type: "share",
            originalItemId: op.itemId,
            newItemId: newItem.id,
            newCheckId: targetCheck.id,
            shareRatio,
          });
        }
      }

      // Recalculate totals for all affected checks
      await recalculateCheckTotals(sourceCheckId);
      for (const nc of newChecks) {
        await recalculateCheckTotals(nc.check.id);
      }

      // Log the action
      await storage.createAuditLog({
        rvcId: sourceCheck.rvcId,
        employeeId,
        action: "split_check",
        targetType: "check",
        targetId: sourceCheckId,
        details: {
          sourceCheckNumber: sourceCheck.checkNumber,
          newCheckNumbers: newChecks.map((nc) => nc.check.checkNumber),
          operationCount: operations.length,
        },
      });

      // Return updated source check and new checks
      const updatedSourceCheck = await storage.getCheck(sourceCheckId);
      const sourceItems = await storage.getCheckItems(sourceCheckId);
      const newChecksWithItems = await Promise.all(
        newChecks.map(async (nc) => ({
          check: await storage.getCheck(nc.check.id),
          items: await storage.getCheckItems(nc.check.id),
        }))
      );

      res.json({
        sourceCheck: { check: updatedSourceCheck, items: sourceItems },
        newChecks: newChecksWithItems,
        results,
      });
    } catch (error) {
      console.error("Split check error:", error);
      res.status(500).json({ message: "Failed to split check" });
    }
  });

  // Transfer Check - Move check ownership to another employee
  app.post("/api/checks/:id/transfer", async (req, res) => {
    try {
      const checkId = req.params.id;
      const { employeeId, toEmployeeId } = req.body;

      if (!employeeId || !toEmployeeId) {
        return res.status(400).json({ message: "Both employeeId and toEmployeeId required" });
      }

      const check = await storage.getCheck(checkId);
      if (!check) {
        return res.status(404).json({ message: "Check not found" });
      }
      if (check.status === "closed") {
        return res.status(400).json({ message: "Cannot transfer a closed check" });
      }

      const toEmployee = await storage.getEmployee(toEmployeeId);
      if (!toEmployee) {
        return res.status(400).json({ message: "Target employee not found" });
      }

      const fromEmployee = await storage.getEmployee(check.employeeId);

      // Update check ownership
      const updatedCheck = await storage.updateCheck(checkId, {
        employeeId: toEmployeeId,
      });

      // Log the action
      await storage.createAuditLog({
        rvcId: check.rvcId,
        employeeId,
        action: "transfer_check",
        targetType: "check",
        targetId: checkId,
        details: {
          checkNumber: check.checkNumber,
          fromEmployeeId: check.employeeId,
          fromEmployeeName: fromEmployee ? `${fromEmployee.firstName} ${fromEmployee.lastName}` : "Unknown",
          toEmployeeId,
          toEmployeeName: `${toEmployee.firstName} ${toEmployee.lastName}`,
        },
      });

      res.json(updatedCheck);
    } catch (error) {
      console.error("Transfer check error:", error);
      res.status(500).json({ message: "Failed to transfer check" });
    }
  });

  // Merge Checks - Combine multiple checks into one
  app.post("/api/checks/merge", async (req, res) => {
    try {
      const { targetCheckId, sourceCheckIds, employeeId } = req.body;

      if (!employeeId) {
        return res.status(400).json({ message: "Employee ID required" });
      }
      if (!targetCheckId || !sourceCheckIds || sourceCheckIds.length === 0) {
        return res.status(400).json({ message: "Target check and source checks required" });
      }

      const targetCheck = await storage.getCheck(targetCheckId);
      if (!targetCheck) {
        return res.status(404).json({ message: "Target check not found" });
      }
      if (targetCheck.status === "closed") {
        return res.status(400).json({ message: "Cannot merge into a closed check" });
      }

      const mergedFromChecks: number[] = [];

      // Move items from each source check to target
      for (const sourceId of sourceCheckIds) {
        if (sourceId === targetCheckId) continue;

        const sourceCheck = await storage.getCheck(sourceId);
        if (!sourceCheck || sourceCheck.status === "closed") continue;

        const sourceItems = await storage.getCheckItems(sourceId);
        for (const item of sourceItems) {
          if (!item.voided) {
            await storage.updateCheckItem(item.id, { checkId: targetCheckId });
          }
        }

        // Close the source check (it's now empty)
        await storage.updateCheck(sourceId, {
          status: "closed",
          closedAt: new Date(),
        });

        mergedFromChecks.push(sourceCheck.checkNumber);
      }

      // Recalculate target check totals
      await recalculateCheckTotals(targetCheckId);

      // Log the action
      await storage.createAuditLog({
        rvcId: targetCheck.rvcId,
        employeeId,
        action: "merge_checks",
        targetType: "check",
        targetId: targetCheckId,
        details: {
          targetCheckNumber: targetCheck.checkNumber,
          mergedFromChecks,
        },
      });

      // Return updated target check with items
      const updatedCheck = await storage.getCheck(targetCheckId);
      const items = await storage.getCheckItems(targetCheckId);

      res.json({ check: updatedCheck, items });
    } catch (error) {
      console.error("Merge checks error:", error);
      res.status(500).json({ message: "Failed to merge checks" });
    }
  });

  // Price Override - Change price of an item
  app.post("/api/check-items/:id/price-override", async (req, res) => {
    try {
      const itemId = req.params.id;
      const { newPrice, reason, employeeId, managerPin } = req.body;

      if (!employeeId) {
        return res.status(400).json({ message: "Employee ID required" });
      }
      if (typeof newPrice !== "number" || newPrice < 0) {
        return res.status(400).json({ message: "Valid price required" });
      }

      const item = await storage.getCheckItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }

      const check = await storage.getCheck(item.checkId);

      // Manager approval for price overrides
      let managerApprovalId = null;
      if (managerPin) {
        const manager = await storage.getEmployeeByPin(managerPin);
        if (!manager) {
          return res.status(401).json({ message: "Invalid manager PIN" });
        }
        // Check if manager has price override approval privilege
        if (manager.roleId) {
          const privileges = await storage.getRolePrivileges(manager.roleId);
          if (!privileges.includes("approve_price_override") && !privileges.includes("admin_access")) {
            return res.status(403).json({ message: "Manager does not have price override approval privilege" });
          }
        }
        managerApprovalId = manager.id;
      }

      const oldPrice = parseFloat(item.unitPrice || "0");

      // Update the item price
      const updatedItem = await storage.updateCheckItem(itemId, {
        unitPrice: newPrice.toFixed(2),
      });

      // Recalculate check totals
      await recalculateCheckTotals(item.checkId);

      // Log the action
      await storage.createAuditLog({
        rvcId: check?.rvcId,
        employeeId,
        action: "price_override",
        targetType: "check_item",
        targetId: itemId,
        details: {
          menuItemName: item.menuItemName,
          oldPrice,
          newPrice,
          reason,
        },
        reasonCode: reason,
        managerApprovalId,
      });

      res.json(updatedItem);
    } catch (error) {
      console.error("Price override error:", error);
      res.status(500).json({ message: "Failed to override price" });
    }
  });

  // ============================================================================
  // REFUND ROUTES
  // ============================================================================

  // Get closed checks for transaction lookup
  app.get("/api/rvcs/:rvcId/closed-checks", async (req, res) => {
    try {
      const { rvcId } = req.params;
      const { businessDate, checkNumber, limit } = req.query;
      
      const options: { businessDate?: string; checkNumber?: number; limit?: number } = {};
      if (businessDate) options.businessDate = businessDate as string;
      if (checkNumber) options.checkNumber = parseInt(checkNumber as string);
      if (limit) options.limit = parseInt(limit as string);

      const closedChecks = await storage.getClosedChecks(rvcId, options);
      res.json(closedChecks);
    } catch (error) {
      console.error("Get closed checks error:", error);
      res.status(500).json({ message: "Failed to get closed checks" });
    }
  });

  // Reopen a closed check
  app.post("/api/checks/:id/reopen", async (req, res) => {
    try {
      const { id } = req.params;
      const { employeeId } = req.body;

      if (!employeeId) {
        return res.status(400).json({ message: "Employee ID required" });
      }

      const check = await storage.getCheck(id);
      if (!check) {
        return res.status(404).json({ message: "Check not found" });
      }
      if (check.status !== "closed") {
        return res.status(400).json({ message: "Only closed checks can be reopened" });
      }

      // Reopen the check
      const reopenedCheck = await storage.updateCheck(id, {
        status: "open",
        closedAt: null,
      });

      // Log the action
      await storage.createAuditLog({
        rvcId: check.rvcId,
        employeeId,
        action: "reopen_check",
        targetType: "check",
        targetId: id,
        details: { checkNumber: check.checkNumber },
      });

      res.json(reopenedCheck);
    } catch (error) {
      console.error("Reopen check error:", error);
      res.status(500).json({ message: "Failed to reopen check" });
    }
  });

  // Get check with full details (items and payments) for refund preview
  app.get("/api/checks/:id/full-details", async (req, res) => {
    try {
      const result = await storage.getCheckWithPaymentsAndItems(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Check not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Get check details error:", error);
      res.status(500).json({ message: "Failed to get check details" });
    }
  });

  // Get refunds for an RVC
  app.get("/api/rvcs/:rvcId/refunds", async (req, res) => {
    try {
      const refundList = await storage.getRefunds(req.params.rvcId);
      res.json(refundList);
    } catch (error) {
      console.error("Get refunds error:", error);
      res.status(500).json({ message: "Failed to get refunds" });
    }
  });

  // Get refund details
  app.get("/api/refunds/:id", async (req, res) => {
    try {
      const result = await storage.getRefundWithDetails(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Refund not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Get refund error:", error);
      res.status(500).json({ message: "Failed to get refund details" });
    }
  });

  // Create a refund
  app.post("/api/refunds", async (req, res) => {
    try {
      const {
        rvcId,
        originalCheckId,
        refundType,
        reason,
        processedByEmployeeId,
        managerApprovalId,
        items,
        businessDate,
      } = req.body;

      // Validate employee has refund privilege
      if (processedByEmployeeId) {
        const employee = await storage.getEmployee(processedByEmployeeId);
        if (!employee) {
          return res.status(400).json({ message: "Employee not found" });
        }
        if (!employee.roleId) {
          return res.status(403).json({ message: "Employee has no assigned role" });
        }
        const privileges = await storage.getRolePrivileges(employee.roleId);
        if (!privileges.includes("refund") && !privileges.includes("admin_access")) {
          return res.status(403).json({ message: "Employee does not have refund privileges" });
        }
      }

      // Validate manager approval if provided
      if (managerApprovalId) {
        const manager = await storage.getEmployee(managerApprovalId);
        if (!manager) {
          return res.status(400).json({ message: "Manager not found" });
        }
        if (!manager.roleId) {
          return res.status(403).json({ message: "Manager has no assigned role" });
        }
        const managerPrivileges = await storage.getRolePrivileges(manager.roleId);
        if (!managerPrivileges.includes("approve_refund") && !managerPrivileges.includes("admin_access")) {
          return res.status(403).json({ message: "Manager does not have refund approval privileges" });
        }
      }

      // Get original check
      const originalCheck = await storage.getCheck(originalCheckId);
      if (!originalCheck) {
        return res.status(404).json({ message: "Original check not found" });
      }
      if (originalCheck.status !== "closed") {
        return res.status(400).json({ message: "Can only refund closed checks" });
      }

      // Check for existing refunds on this check to prevent double-refunding
      const existingRefunds = await storage.getRefundsForCheck(originalCheckId);
      const existingFullRefund = existingRefunds.find(r => r.refundType === "full");
      if (existingFullRefund) {
        return res.status(400).json({ message: "This check has already been fully refunded" });
      }

      // Get check details
      const checkDetails = await storage.getCheckWithPaymentsAndItems(originalCheckId);
      if (!checkDetails) {
        return res.status(404).json({ message: "Check details not found" });
      }

      // Calculate refund amounts
      let refundSubtotal = 0;
      let refundTaxTotal = 0;
      const refundItemsData: any[] = [];

      if (refundType === "full") {
        // Refund all items
        for (const item of checkDetails.items.filter(i => !i.voided)) {
          const modifierTotal = (item.modifiers || []).reduce(
            (sum: number, m: any) => sum + parseFloat(m.priceDelta || "0"), 0
          );
          const itemTotal = (parseFloat(item.unitPrice) + modifierTotal) * (item.quantity || 1);
          refundSubtotal += itemTotal;

          refundItemsData.push({
            originalCheckItemId: item.id,
            menuItemName: item.menuItemName,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice,
            modifiers: item.modifiers,
            taxAmount: "0", // Will calculate below
            refundAmount: itemTotal.toFixed(2),
          });
        }
        refundTaxTotal = parseFloat(originalCheck.taxTotal || "0");
      } else {
        // Partial refund - use provided items
        for (const itemData of items || []) {
          const originalItem = checkDetails.items.find(i => i.id === itemData.originalCheckItemId);
          if (!originalItem) continue;

          const modifierTotal = (originalItem.modifiers || []).reduce(
            (sum: number, m: any) => sum + parseFloat(m.priceDelta || "0"), 0
          );
          const itemTotal = (parseFloat(originalItem.unitPrice) + modifierTotal) * (itemData.quantity || 1);
          refundSubtotal += itemTotal;

          refundItemsData.push({
            originalCheckItemId: originalItem.id,
            menuItemName: originalItem.menuItemName,
            quantity: itemData.quantity || 1,
            unitPrice: originalItem.unitPrice,
            modifiers: originalItem.modifiers,
            taxAmount: "0",
            refundAmount: itemTotal.toFixed(2),
          });
        }
        // Calculate proportional tax for partial refund
        const originalSubtotal = parseFloat(originalCheck.subtotal || "0");
        const originalTax = parseFloat(originalCheck.taxTotal || "0");
        if (originalSubtotal > 0) {
          refundTaxTotal = (refundSubtotal / originalSubtotal) * originalTax;
        }
      }

      const refundTotal = refundSubtotal + refundTaxTotal;

      // Distribute refund amount across original payment methods proportionally
      const refundPaymentsData: any[] = [];
      const totalPaid = checkDetails.payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
      
      for (const payment of checkDetails.payments) {
        const paymentAmount = parseFloat(payment.amount || "0");
        const proportionalRefund = totalPaid > 0 ? (paymentAmount / totalPaid) * refundTotal : 0;

        if (proportionalRefund > 0) {
          refundPaymentsData.push({
            originalPaymentId: payment.id,
            tenderId: payment.tenderId,
            tenderName: payment.tenderName,
            amount: proportionalRefund.toFixed(2),
          });
        }
      }

      // Get next refund number
      const refundNumber = await storage.getNextRefundNumber(rvcId);

      // Create the refund
      const refund = await storage.createRefund(
        {
          refundNumber,
          rvcId,
          originalCheckId,
          originalCheckNumber: originalCheck.checkNumber,
          refundType,
          subtotal: refundSubtotal.toFixed(2),
          taxTotal: refundTaxTotal.toFixed(2),
          total: refundTotal.toFixed(2),
          reason,
          processedByEmployeeId,
          managerApprovalId,
          businessDate: businessDate || originalCheck.businessDate,
        },
        refundItemsData,
        refundPaymentsData
      );

      // Create audit log
      await storage.createAuditLog({
        rvcId,
        employeeId: processedByEmployeeId,
        action: "process_refund",
        targetType: "refund",
        targetId: refund.id,
        details: {
          originalCheckNumber: originalCheck.checkNumber,
          refundType,
          total: refundTotal,
          managerApprovalId,
        },
      });

      res.json(refund);
    } catch (error) {
      console.error("Create refund error:", error);
      res.status(500).json({ message: "Failed to create refund" });
    }
  });

  // ============================================================================
  // KDS ROUTES
  // ============================================================================

  app.get("/api/kds-tickets", async (req, res) => {
    const filters = {
      rvcId: req.query.rvcId as string | undefined,
      kdsDeviceId: req.query.kdsDeviceId as string | undefined,
      stationType: req.query.stationType as string | undefined,
      propertyId: req.query.propertyId as string | undefined,
    };
    const data = await storage.getKdsTickets(filters);
    res.json(data);
  });

  app.get("/api/kds-station-types", async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;
    const types = await getKdsStationTypes(propertyId);
    res.json(types);
  });

  app.get("/api/kds-devices/active", async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;
    const devices = await getActiveKdsDevices(propertyId);
    res.json(devices);
  });

  app.post("/api/kds-tickets/:id/bump", async (req, res) => {
    try {
      const ticketId = req.params.id;
      // Accept either employeeId (POS mode) or deviceId (dedicated KDS mode)
      const { employeeId, deviceId } = req.body;

      // For dedicated KDS devices, pass undefined (null in DB) since deviceId can't go in employee FK field
      // Employee ID is used when bumped from POS mode with logged-in employee
      const bumpedBy = employeeId || undefined;
      const updated = await storage.bumpKdsTicket(ticketId, bumpedBy);

      broadcastKdsUpdate();
      res.json(updated);
    } catch (error) {
      console.error("Bump error:", error);
      res.status(400).json({ message: "Failed to bump ticket" });
    }
  });

  // Bump all tickets for a station/RVC/property
  app.post("/api/kds-tickets/bump-all", async (req, res) => {
    try {
      // Accept either rvcId (POS mode) or propertyId (dedicated KDS mode)
      const { employeeId, deviceId, rvcId, propertyId, stationType } = req.body;

      // Build filter based on what's provided
      const filters: { rvcId?: string; propertyId?: string; stationType?: string } = {};
      if (rvcId) filters.rvcId = rvcId;
      if (propertyId) filters.propertyId = propertyId;
      if (stationType) filters.stationType = stationType;

      const tickets = await storage.getKdsTickets(filters);
      const activeTickets = tickets.filter((t: any) => t.status === "active");
      
      // For dedicated KDS devices, pass undefined (null in DB) since deviceId can't go in employee FK field
      // Employee ID is used when bumped from POS mode with logged-in employee
      const bumpedBy = employeeId || undefined;
      
      let bumped = 0;
      for (const ticket of activeTickets) {
        await storage.bumpKdsTicket(ticket.id, bumpedBy);
        bumped++;
      }

      broadcastKdsUpdate(rvcId);
      res.json({ bumped, message: `Cleared ${bumped} tickets` });
    } catch (error) {
      console.error("Bump all error:", error);
      res.status(400).json({ message: "Failed to clear tickets" });
    }
  });

  app.post("/api/kds-tickets/:id/recall", async (req, res) => {
    try {
      const ticketId = req.params.id;
      // Accept either employeeId (POS mode) or deviceId (dedicated KDS mode)
      // scope determines which stations to recall to: 'expo' or 'all'
      const { scope, deviceId } = req.body;

      const updated = await storage.recallKdsTicket(ticketId, scope);

      broadcastKdsUpdate();
      res.json(updated);
    } catch (error) {
      console.error("Recall error:", error);
      res.status(400).json({ message: "Failed to recall ticket" });
    }
  });

  // Get bumped tickets for recall modal
  app.get("/api/kds-tickets/bumped", async (req, res) => {
    try {
      const filters = {
        rvcId: req.query.rvcId as string | undefined,
        stationType: req.query.stationType as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };
      const tickets = await storage.getBumpedKdsTickets(filters);
      res.json(tickets);
    } catch (error) {
      console.error("Get bumped tickets error:", error);
      res.status(400).json({ message: "Failed to get bumped tickets" });
    }
  });

  // Mark an individual KDS item as ready
  app.post("/api/kds-items/:id/ready", async (req, res) => {
    try {
      const itemId = req.params.id;
      await storage.markKdsItemReady(itemId);
      broadcastKdsUpdate();
      res.json({ success: true });
    } catch (error) {
      console.error("Mark item ready error:", error);
      res.status(400).json({ message: "Failed to mark item ready" });
    }
  });

  // Unmark an individual KDS item as ready
  app.post("/api/kds-items/:id/unready", async (req, res) => {
    try {
      const itemId = req.params.id;
      await storage.unmarkKdsItemReady(itemId);
      broadcastKdsUpdate();
      res.json({ success: true });
    } catch (error) {
      console.error("Unmark item ready error:", error);
      res.status(400).json({ message: "Failed to unmark item ready" });
    }
  });

  // ============================================================================
  // ADMIN STATS ROUTE
  // ============================================================================

  app.get("/api/admin/stats", async (req, res) => {
    const stats = await storage.getAdminStats();
    res.json(stats);
  });

  // ============================================================================
  // ADMIN SALES RESET ROUTES
  // ============================================================================

  // Get summary of sales data that would be deleted for a specific property
  app.get("/api/admin/sales-data-summary/:propertyId", async (req, res) => {
    try {
      const { propertyId } = req.params;
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      const summary = await storage.getSalesDataSummary(propertyId);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get summary" });
    }
  });

  // Clear sales data for a specific property - requires Admin role + PIN
  app.post("/api/admin/clear-sales-data", async (req, res) => {
    try {
      const { pin, confirmText, propertyId } = req.body;
      
      // Require property ID
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      
      // Require PIN for authentication
      if (!pin) {
        return res.status(400).json({ message: "Employee PIN is required" });
      }
      
      // Authenticate employee by PIN
      const employee = await storage.getEmployeeByPin(pin);
      if (!employee) {
        return res.status(401).json({ message: "Invalid PIN" });
      }
      
      // Check if employee has admin_access privilege
      if (!employee.roleId) {
        return res.status(403).json({ message: "Employee has no assigned role" });
      }
      
      const privileges = await storage.getRolePrivileges(employee.roleId);
      if (!privileges.includes("admin_access")) {
        return res.status(403).json({ message: "You do not have admin access privileges" });
      }
      
      const employeeId = employee.id;
      
      // Require explicit confirmation
      if (confirmText !== "RESET") {
        return res.status(400).json({ message: "Please type RESET to confirm" });
      }
      
      // Verify property exists
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      // Get summary before deletion for audit log
      const beforeSummary = await storage.getSalesDataSummary(propertyId);
      
      // Perform the deletion (wrapped in transaction inside storage method)
      const result = await storage.clearSalesData(propertyId);
      
      // Create audit log entry for this action (recorded AFTER clearing)
      await storage.createAuditLog({
        rvcId: null,
        employeeId,
        action: "sales_reset",
        targetType: "property",
        targetId: propertyId,
        details: {
          propertyId,
          propertyName: property.name,
          beforeCounts: beforeSummary,
          deletedCounts: result.deleted,
          timestamp: new Date().toISOString(),
        },
        reasonCode: "admin_reset",
        managerApprovalId: null,
      });
      
      res.json({
        success: true,
        message: "All sales data has been cleared",
        deleted: result.deleted,
      });
    } catch (error: any) {
      console.error("Sales reset error:", error);
      res.status(500).json({ message: error.message || "Failed to clear sales data" });
    }
  });

  // Get current business date for a property
  app.get("/api/properties/:id/business-date", async (req, res) => {
    try {
      const property = await storage.getProperty(req.params.id);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      const currentBusinessDate = resolveBusinessDate(new Date(), property);
      const nextBusinessDate = incrementDate(currentBusinessDate);
      
      res.json({
        currentBusinessDate,
        nextBusinessDate,
        rolloverTime: property.businessDateRolloverTime || "04:00",
        timezone: property.timezone || "America/New_York",
      });
    } catch (error: any) {
      console.error("Get business date error:", error);
      res.status(500).json({ message: error.message || "Failed to get business date" });
    }
  });

  // Increment business date by one day - requires Admin role + PIN
  app.post("/api/properties/:id/business-date/increment", async (req, res) => {
    try {
      const { pin } = req.body;
      const propertyId = req.params.id;
      
      // Require PIN for authentication
      if (!pin) {
        return res.status(400).json({ message: "Employee PIN is required" });
      }
      
      // Authenticate employee by PIN
      const employee = await storage.getEmployeeByPin(pin);
      if (!employee) {
        return res.status(401).json({ message: "Invalid PIN" });
      }
      
      // Check if employee has admin_access privilege
      if (!employee.roleId) {
        return res.status(403).json({ message: "Employee has no assigned role" });
      }
      
      const privileges = await storage.getRolePrivileges(employee.roleId);
      if (!privileges.includes("admin_access")) {
        return res.status(403).json({ message: "You do not have admin access privileges" });
      }
      
      // Get property
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      // Calculate current and next business date
      const currentBusinessDate = resolveBusinessDate(new Date(), property);
      const nextBusinessDate = incrementDate(currentBusinessDate);
      
      // Update property with new business date and set to manual mode
      await storage.updateProperty(propertyId, {
        businessDateMode: "manual",
        currentBusinessDate: nextBusinessDate,
      });
      
      // Create audit log entry
      await storage.createAuditLog({
        rvcId: null,
        employeeId: employee.id,
        action: "business_date_increment",
        targetType: "property",
        targetId: propertyId,
        details: {
          propertyId,
          propertyName: property.name,
          previousBusinessDate: currentBusinessDate,
          newBusinessDate: nextBusinessDate,
          timestamp: new Date().toISOString(),
        },
        reasonCode: "admin_action",
        managerApprovalId: null,
      });
      
      res.json({
        success: true,
        previousBusinessDate: currentBusinessDate,
        newBusinessDate: nextBusinessDate,
        message: `Business date changed from ${currentBusinessDate} to ${nextBusinessDate}`,
      });
    } catch (error: any) {
      console.error("Increment business date error:", error);
      res.status(500).json({ message: error.message || "Failed to increment business date" });
    }
  });

  // ============================================================================
  // POS LAYOUT ROUTES
  // ============================================================================

  app.get("/api/pos-layouts", async (req, res) => {
    const rvcId = req.query.rvcId as string | undefined;
    const data = await storage.getPosLayouts(rvcId);
    res.json(data);
  });

  app.get("/api/pos-layouts/default/:rvcId", async (req, res) => {
    // First try per-RVC default, then fall back to global default
    const layout = await storage.getDefaultLayoutForRvc(req.params.rvcId);
    res.json(layout || null);
  });

  app.get("/api/pos-layouts/:id", async (req, res) => {
    const layout = await storage.getPosLayout(req.params.id);
    if (!layout) return res.status(404).json({ message: "Layout not found" });
    res.json(layout);
  });

  app.post("/api/pos-layouts", async (req, res) => {
    try {
      const data = insertPosLayoutSchema.parse(req.body);
      const layout = await storage.createPosLayout(data);
      res.status(201).json(layout);
    } catch (error) {
      res.status(400).json({ message: "Invalid layout data" });
    }
  });

  app.patch("/api/pos-layouts/:id", async (req, res) => {
    try {
      const data = insertPosLayoutSchema.partial().parse(req.body);
      const layout = await storage.updatePosLayout(req.params.id, data);
      if (!layout) return res.status(404).json({ message: "Layout not found" });
      res.json(layout);
    } catch (error) {
      res.status(400).json({ message: "Invalid layout data" });
    }
  });

  app.delete("/api/pos-layouts/:id", async (req, res) => {
    const deleted = await storage.deletePosLayout(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Layout not found" });
    res.status(204).end();
  });

  app.get("/api/pos-layouts/:id/cells", async (req, res) => {
    const cells = await storage.getPosLayoutCells(req.params.id);
    res.json(cells);
  });

  app.put("/api/pos-layouts/:id/cells", async (req, res) => {
    try {
      const layoutId = req.params.id;
      const cellSchema = insertPosLayoutCellSchema.omit({ layoutId: true });
      const cellsData = z.array(cellSchema).parse(req.body);
      const cellsWithLayoutId = cellsData.map(c => ({ ...c, layoutId }));
      const cells = await storage.setPosLayoutCells(layoutId, cellsWithLayoutId);
      res.json(cells);
    } catch (error) {
      console.error("Error saving cells:", error);
      res.status(400).json({ message: "Invalid cells data" });
    }
  });

  // POS Layout RVC Assignments - get assignments for a layout
  app.get("/api/pos-layouts/:id/rvc-assignments", async (req, res) => {
    const assignments = await storage.getPosLayoutRvcAssignments(req.params.id);
    res.json(assignments);
  });

  // POS Layout RVC Assignments - set assignments for a layout
  app.put("/api/pos-layouts/:id/rvc-assignments", async (req, res) => {
    try {
      const layoutId = req.params.id;
      const assignmentSchema = z.array(z.object({
        propertyId: z.string(),
        rvcId: z.string(),
        isDefault: z.boolean().optional(),
      }));
      const assignments = assignmentSchema.parse(req.body);
      const result = await storage.setPosLayoutRvcAssignments(layoutId, assignments);
      res.json(result);
    } catch (error) {
      console.error("Error saving RVC assignments:", error);
      res.status(400).json({ message: "Invalid assignments data" });
    }
  });

  // Set a layout as default for a specific RVC
  app.put("/api/pos-layouts/:layoutId/set-default/:rvcId", async (req, res) => {
    try {
      await storage.setDefaultLayoutForRvc(req.params.rvcId, req.params.layoutId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting default layout:", error);
      res.status(400).json({ message: "Failed to set default layout" });
    }
  });

  // Get layouts for a specific RVC (includes both legacy and new assignments)
  app.get("/api/pos-layouts/for-rvc/:rvcId", async (req, res) => {
    const layouts = await storage.getPosLayoutsForRvc(req.params.rvcId);
    res.json(layouts);
  });

  // ============================================================================
  // DEVICE REGISTRY (CAL - Client Application Loader)
  // ============================================================================

  // Get all devices with optional filters
  app.get("/api/devices", async (req, res) => {
    const { enterpriseId, propertyId, deviceType, status } = req.query;
    const filters: any = {};
    if (enterpriseId) filters.enterpriseId = enterpriseId as string;
    if (propertyId) filters.propertyId = propertyId as string;
    if (deviceType) filters.deviceType = deviceType as string;
    if (status) filters.status = status as string;
    const devices = await storage.getDevices(Object.keys(filters).length > 0 ? filters : undefined);
    res.json(devices);
  });

  // Get single device
  app.get("/api/devices/:id", async (req, res) => {
    const device = await storage.getDevice(req.params.id);
    if (!device) return res.status(404).json({ message: "Device not found" });
    res.json(device);
  });

  // Create device (manual registration)
  app.post("/api/devices", async (req, res) => {
    try {
      const device = await storage.createDevice(req.body);
      res.status(201).json(device);
    } catch (error: any) {
      console.error("Error creating device:", error);
      res.status(400).json({ message: error.message || "Failed to create device" });
    }
  });

  // Update device
  app.patch("/api/devices/:id", async (req, res) => {
    try {
      const device = await storage.updateDevice(req.params.id, req.body);
      if (!device) return res.status(404).json({ message: "Device not found" });
      res.json(device);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update device" });
    }
  });

  // Delete device
  app.delete("/api/devices/:id", async (req, res) => {
    const deleted = await storage.deleteDevice(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Device not found" });
    res.status(204).end();
  });

  // Device heartbeat (called by client agents)
  app.post("/api/devices/:id/heartbeat", async (req, res) => {
    try {
      const device = await storage.getDevice(req.params.id);
      if (!device) return res.status(404).json({ message: "Device not found" });
      
      const heartbeat = await storage.createDeviceHeartbeat({
        deviceId: req.params.id,
        appVersion: req.body.appVersion,
        osVersion: req.body.osVersion,
        ipAddress: req.body.ipAddress,
        cpuUsage: req.body.cpuUsage,
        memoryUsage: req.body.memoryUsage,
        diskUsage: req.body.diskUsage,
      });
      res.json(heartbeat);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to record heartbeat" });
    }
  });

  // Get device heartbeat history
  app.get("/api/devices/:id/heartbeats", async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const heartbeats = await storage.getDeviceHeartbeats(req.params.id, limit);
    res.json(heartbeats);
  });

  // ============================================================================
  // DEVICE ENROLLMENT TOKENS
  // ============================================================================

  // Get all enrollment tokens
  app.get("/api/device-enrollment-tokens", async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    const tokens = await storage.getDeviceEnrollmentTokens(enterpriseId);
    res.json(tokens);
  });

  // Create enrollment token
  app.post("/api/device-enrollment-tokens", async (req, res) => {
    try {
      // Generate a secure random token
      const token = Array.from({ length: 32 }, () => 
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]
      ).join("");
      
      const enrollmentToken = await storage.createDeviceEnrollmentToken({
        ...req.body,
        token,
      });
      res.status(201).json(enrollmentToken);
    } catch (error: any) {
      console.error("Error creating enrollment token:", error);
      res.status(400).json({ message: error.message || "Failed to create token" });
    }
  });

  // Delete enrollment token
  app.delete("/api/device-enrollment-tokens/:id", async (req, res) => {
    const deleted = await storage.deleteDeviceEnrollmentToken(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Token not found" });
    res.status(204).end();
  });

  // Enroll a device using a token
  app.post("/api/devices/enroll", async (req, res) => {
    try {
      const { token, deviceId, name, deviceType, osType, osVersion, hardwareModel, serialNumber, ipAddress, macAddress } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: "Enrollment token is required" });
      }
      
      // Validate and use the token
      const enrollmentToken = await storage.useDeviceEnrollmentToken(token);
      if (!enrollmentToken) {
        return res.status(401).json({ message: "Invalid, expired, or exhausted enrollment token" });
      }
      
      // Check if token restricts device type
      if (enrollmentToken.deviceType && enrollmentToken.deviceType !== deviceType) {
        return res.status(400).json({ message: `This token only allows ${enrollmentToken.deviceType} devices` });
      }
      
      // Check if device already exists
      const existingDevice = await storage.getDeviceByDeviceId(deviceId);
      if (existingDevice) {
        // Update existing device
        const updated = await storage.updateDevice(existingDevice.id, {
          name,
          deviceType,
          osType,
          osVersion,
          hardwareModel,
          serialNumber,
          ipAddress,
          macAddress,
          status: "active",
          enrolledAt: new Date(),
        });
        return res.json(updated);
      }
      
      // Create new device
      const device = await storage.createDevice({
        enterpriseId: enrollmentToken.enterpriseId,
        propertyId: enrollmentToken.propertyId || undefined,
        deviceId,
        name,
        deviceType,
        osType,
        osVersion,
        hardwareModel,
        serialNumber,
        ipAddress,
        macAddress,
        status: "active",
        enrolledAt: new Date(),
      });
      
      res.status(201).json(device);
    } catch (error: any) {
      console.error("Error enrolling device:", error);
      res.status(400).json({ message: error.message || "Failed to enroll device" });
    }
  });

  // Import devices from property configuration (workstations & KDS devices)
  app.get("/api/devices/import-preview/:propertyId", async (req, res) => {
    try {
      const { propertyId } = req.params;
      
      // Get property info
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      // Get enterprise for the property
      const enterprise = await storage.getEnterprise(property.enterpriseId);
      
      // Get configured workstations and KDS devices
      const workstations = await storage.getWorkstations();
      const kdsDevices = await storage.getKdsDevices();
      
      const propertyWorkstations = workstations.filter(w => w.propertyId === propertyId);
      const propertyKdsDevices = kdsDevices.filter(k => k.propertyId === propertyId);
      
      // Check which ones already exist in device registry
      const existingDevices = await storage.getDevices();
      const existingDeviceIds = new Set(existingDevices.map(d => d.deviceId));
      
      const workstationItems = propertyWorkstations.map(ws => ({
        sourceId: ws.id,
        sourceType: "workstation",
        name: ws.name,
        deviceType: ws.deviceType === "kiosk" ? "kiosk" : "pos_workstation",
        deviceId: `WS-${ws.id.slice(0, 8)}`,
        alreadyExists: existingDeviceIds.has(`WS-${ws.id.slice(0, 8)}`),
      }));
      
      const kdsItems = propertyKdsDevices.map(kds => ({
        sourceId: kds.id,
        sourceType: "kds_device",
        name: kds.name,
        deviceType: "kds_display",
        deviceId: `KDS-${kds.id.slice(0, 8)}`,
        ipAddress: kds.ipAddress,
        alreadyExists: existingDeviceIds.has(`KDS-${kds.id.slice(0, 8)}`),
      }));
      
      res.json({
        property: { id: property.id, name: property.name },
        enterprise: enterprise ? { id: enterprise.id, name: enterprise.name } : null,
        items: [...workstationItems, ...kdsItems],
        summary: {
          total: workstationItems.length + kdsItems.length,
          workstations: workstationItems.length,
          kdsDevices: kdsItems.length,
          alreadyExists: [...workstationItems, ...kdsItems].filter(i => i.alreadyExists).length,
          toImport: [...workstationItems, ...kdsItems].filter(i => !i.alreadyExists).length,
        },
      });
    } catch (error: any) {
      console.error("Error previewing device import:", error);
      res.status(500).json({ message: error.message || "Failed to preview import" });
    }
  });

  app.post("/api/devices/import-from-property", async (req, res) => {
    try {
      const { propertyId, items } = req.body;
      
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      
      // Get property info
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      // Get configured workstations and KDS devices
      const workstations = await storage.getWorkstations();
      const kdsDevices = await storage.getKdsDevices();
      
      const propertyWorkstations = workstations.filter(w => w.propertyId === propertyId);
      const propertyKdsDevices = kdsDevices.filter(k => k.propertyId === propertyId);
      
      // Check existing
      const existingDevices = await storage.getDevices();
      const existingDeviceIds = new Set(existingDevices.map(d => d.deviceId));
      
      const imported: any[] = [];
      const skipped: any[] = [];
      
      // Import workstations
      for (const ws of propertyWorkstations) {
        const deviceId = `WS-${ws.id.slice(0, 8)}`;
        if (existingDeviceIds.has(deviceId)) {
          skipped.push({ name: ws.name, reason: "Already exists" });
          continue;
        }
        
        const device = await storage.createDevice({
          enterpriseId: property.enterpriseId,
          propertyId: property.id,
          deviceId,
          name: ws.name,
          deviceType: ws.deviceType === "kiosk" ? "kiosk" : "pos_workstation",
          status: "pending",
          sourceConfigType: "workstation",
          sourceConfigId: ws.id,
        });
        imported.push(device);
      }
      
      // Import KDS devices
      for (const kds of propertyKdsDevices) {
        const deviceId = `KDS-${kds.id.slice(0, 8)}`;
        if (existingDeviceIds.has(deviceId)) {
          skipped.push({ name: kds.name, reason: "Already exists" });
          continue;
        }
        
        const device = await storage.createDevice({
          enterpriseId: property.enterpriseId,
          propertyId: property.id,
          deviceId,
          name: kds.name,
          deviceType: "kds_display",
          ipAddress: kds.ipAddress || undefined,
          status: "pending",
          sourceConfigType: "kds_device",
          sourceConfigId: kds.id,
        });
        imported.push(device);
      }
      
      res.json({
        success: true,
        imported: imported.length,
        skipped: skipped.length,
        devices: imported,
        skippedDetails: skipped,
      });
    } catch (error: any) {
      console.error("Error importing devices:", error);
      res.status(500).json({ message: error.message || "Failed to import devices" });
    }
  });

  // ============================================================================
  // REPORTING & ANALYTICS
  // ============================================================================

  // Sales Dashboard Summary
  // Sales post to business date when items are rung in (CheckItems.businessDate)
  // Payments post to business date when payment is applied (CheckPayments.businessDate)
  // Checks tracked as: started, closed, carried over
  // 
  // Query params:
  // - businessDate: YYYY-MM-DD (recommended) - filters by business date field
  // - startDate/endDate: ISO timestamps (legacy) - filters by raw timestamps
  app.get("/api/reports/sales-summary", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allCheckItems = await storage.getAllCheckItems();
      const allPayments = await storage.getAllPayments();
      
      // Get valid RVC IDs for property filter
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Filter checks by property/RVC for check counts
      const checksInScope = validRvcIds 
        ? allChecks.filter(c => validRvcIds!.includes(c.rvcId))
        : allChecks;
      
      // CHECK MOVEMENT TRACKING
      // When using businessDate, filter by check.businessDate field
      // Checks Started = opened/started for the business date
      const checksStarted = checksInScope.filter(c => {
        if (useBusinessDate) {
          return c.businessDate === businessDate;
        } else {
          if (!c.openedAt) return false;
          const openDate = new Date(c.openedAt);
          return openDate >= start && openDate <= end;
        }
      });
      
      // Checks Closed = closed for the business date
      const checksClosed = checksInScope.filter(c => {
        if (c.status !== "closed") return false;
        if (useBusinessDate) {
          // For business date mode, check if the check's business date matches
          return c.businessDate === businessDate;
        } else {
          if (!c.closedAt) return false;
          const closeDate = new Date(c.closedAt);
          return closeDate >= start && closeDate <= end;
        }
      });
      
      // Checks Carried Over = checks from PREVIOUS business dates that are still open
      // These are checks that weren't closed before business date reset
      const checksCarriedOver = checksInScope.filter(c => {
        if (c.status !== "open") return false; // Only open checks can be carried over
        if (useBusinessDate) {
          // Open checks from a business date BEFORE the selected date
          // Guard: both must be valid YYYY-MM-DD strings for comparison
          if (!c.businessDate || !businessDate) return false;
          return c.businessDate < (businessDate as string);
        } else {
          if (!c.openedAt) return false;
          const openDate = new Date(c.openedAt);
          // Opened before the start of the period and still open
          return openDate < start;
        }
      });
      
      // Outstanding checks = ALL currently open checks in scope (includes carried over)
      // This represents the total liability - all unpaid checks
      const checksOutstanding = checksInScope.filter(c => c.status === "open");
      
      // Today's open checks = open checks from THIS business date only (for reconciliation)
      // These are checks started today that haven't been closed yet
      const todaysOpenChecks = checksInScope.filter(c => {
        if (c.status !== "open") return false;
        if (useBusinessDate) {
          return c.businessDate === businessDate;
        }
        return true;
      });
      
      // SALES CALCULATION - Based on CHECK subtotals/totals for proper reconciliation
      // This ensures Net Sales + Tax = Total, and Payments + Outstanding = Total
      // 
      // For the selected business date:
      // - Closed checks: use check.subtotal, check.taxTotal, check.total
      // - Open checks: use check.subtotal, check.taxTotal, check.total
      
      // Sum closed check values (raw cents for tax to avoid rounding errors)
      let closedSubtotalCents = 0;
      let closedTaxCents = 0;
      let closedTotalCents = 0;
      for (const c of checksClosed) {
        closedSubtotalCents += Math.round(parseFloat(c.subtotal || "0") * 100);
        closedTaxCents += Math.round(parseFloat(c.taxTotal || "0") * 100);
        closedTotalCents += Math.round(parseFloat(c.total || "0") * 100);
      }
      
      // Sum today's open check values (for reconciliation - only checks from this business date)
      let openSubtotalCents = 0;
      let openTaxCents = 0;
      let openTotalCents = 0;
      for (const c of todaysOpenChecks) {
        openSubtotalCents += Math.round(parseFloat(c.subtotal || "0") * 100);
        openTaxCents += Math.round(parseFloat(c.taxTotal || "0") * 100);
        openTotalCents += Math.round(parseFloat(c.total || "0") * 100);
      }
      
      // Sum ALL outstanding checks (includes carried over - for total liability)
      let allOutstandingCents = 0;
      for (const c of checksOutstanding) {
        allOutstandingCents += Math.round(parseFloat(c.total || "0") * 100);
      }
      
      // Calculate totals (all checks = closed + open for this business date)
      const grossSalesCents = closedSubtotalCents + openSubtotalCents;
      const taxTotalCents = closedTaxCents + openTaxCents;
      const totalWithTaxCents = closedTotalCents + openTotalCents;
      
      // Convert back to dollars
      const grossSales = grossSalesCents / 100;
      const taxTotal = taxTotalCents / 100;
      const netSales = grossSales; // Discounts would need separate tracking
      const totalWithTax = totalWithTaxCents / 100;
      
      // For item-level breakdown (still useful for reporting)
      const checkIdToRvc = new Map(allChecks.map(c => [c.id, c.rvcId]));
      const itemsInPeriod = allCheckItems.filter(ci => {
        if (ci.voided) return false;
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(ci.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        if (useBusinessDate) {
          return ci.businessDate === businessDate;
        } else {
          if (!ci.addedAt) return false;
          const itemDate = new Date(ci.addedAt);
          return itemDate >= start && itemDate <= end;
        }
      });
      
      const baseItemSales = itemsInPeriod.reduce((sum, ci) => 
        sum + parseFloat(ci.unitPrice || "0") * (ci.quantity || 1), 0
      );
      
      const modifierTotal = itemsInPeriod.reduce((sum, ci) => {
        if (!ci.modifiers || !Array.isArray(ci.modifiers)) return sum;
        const modSum = (ci.modifiers as any[]).reduce((mSum, mod) => {
          return mSum + parseFloat(mod.priceDelta || "0");
        }, 0);
        return sum + modSum * (ci.quantity || 1);
      }, 0);
      
      const itemSales = baseItemSales + modifierTotal;
      const serviceChargeTotal = 0; // Service charges would need separate tracking
      
      // PAYMENTS - Based on businessDate (operating day when payment was applied)
      // Important: p.amount is the TENDERED amount (what customer handed over).
      // For over-tender (cash), we need to cap at the check total to get the actual payment applied.
      const paymentsInPeriod = allPayments.filter(p => {
        // Apply RVC filter via check
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(p.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        // Filter by business date or timestamp
        if (useBusinessDate) {
          return p.businessDate === businessDate;
        } else {
          if (!p.paidAt) return false;
          const payDate = new Date(p.paidAt);
          return payDate >= start && payDate <= end;
        }
      });
      
      // Group payments by check and calculate actual applied amount
      // For each check, total applied payments cannot exceed check total
      const checkPaymentMap = new Map<string, number>();
      for (const p of paymentsInPeriod) {
        const current = checkPaymentMap.get(p.checkId) || 0;
        checkPaymentMap.set(p.checkId, current + parseFloat(p.amount || "0"));
      }
      
      // Cap each check's payments at the check total
      let totalPayments = 0;
      checkPaymentMap.forEach((tenderedTotal, checkId) => {
        const check = allChecks.find(c => c.id === checkId);
        if (check) {
          const checkTotal = parseFloat(check.total || "0");
          // Actual applied payment is the lesser of tendered and check total
          totalPayments += Math.min(tenderedTotal, checkTotal);
        } else {
          // If check not found (shouldn't happen), use tendered amount
          totalPayments += tenderedTotal;
        }
      });
      // Tips would need to be tracked separately if the system supports them
      const totalTips = 0;
      
      // Calculate totals for check movement (carried over and started use check.total)
      const carriedOverTotal = checksCarriedOver.reduce((sum, c) => sum + parseFloat(c.total || "0"), 0);
      const startedTotal = checksStarted.reduce((sum, c) => sum + parseFloat(c.total || "0"), 0);
      
      // Use closed check count for averages (only paid checks)
      const avgCheck = checksClosed.length > 0 ? totalPayments / checksClosed.length : 0;
      
      // Closed check totals for reconciliation (already calculated from cents above)
      const closedSubtotal = closedSubtotalCents / 100;
      const closedTax = closedTaxCents / 100;
      const closedTotal = closedTotalCents / 100;
      
      // Open check totals for reconciliation
      const openSubtotal = openSubtotalCents / 100;
      const openTax = openTaxCents / 100;
      const openTotal = openTotalCents / 100;
      
      res.json({
        // Sales (based on check business date - includes both open and closed)
        grossSales,          // All check subtotals (closed + open)
        netSales,            // Same as grossSales (discounts would reduce this)
        taxTotal,            // All check taxes (closed + open)
        totalWithTax,        // All check totals (closed + open)
        
        // Item-level breakdown (for detailed reporting)
        itemSales: Math.round(itemSales * 100) / 100,
        baseItemSales: Math.round(baseItemSales * 100) / 100,
        modifierTotal: Math.round(modifierTotal * 100) / 100,
        serviceChargeTotal,
        otherCharges: 0,
        discountTotal: 0, // Would need item-level discount tracking
        
        // Closed check breakdown (for reconciliation: Payments should equal closedTotal)
        closedSubtotal,      // Sum of closed check subtotals
        closedTax,           // Sum of closed check taxes
        closedTotal,         // Sum of closed check totals (subtotal + tax)
        
        // Open check breakdown (outstanding = openTotal)
        openSubtotal,        // Sum of open check subtotals
        openTax,             // Sum of open check taxes  
        openTotal,           // Sum of open check totals (subtotal + tax) - THIS IS OUTSTANDING
        
        // Payments (based on payment date - should equal closedTotal)
        totalPayments: Math.round(totalPayments * 100) / 100,
        totalTips: Math.round(totalTips * 100) / 100,
        paymentCount: paymentsInPeriod.length,
        
        // Check Movement (counts)
        checksStarted: checksStarted.length,
        checksClosed: checksClosed.length,
        checksCarriedOver: checksCarriedOver.length,
        checksOutstanding: checksOutstanding.length,
        openCheckCount: checksOutstanding.length, // backwards compatibility
        
        // Check Movement (totals)
        carriedOverTotal: Math.round(carriedOverTotal * 100) / 100,
        startedTotal: Math.round(startedTotal * 100) / 100,
        outstandingTotal: allOutstandingCents / 100, // ALL open checks (today's + carried over)
        
        // Today's open checks count (for reconciliation breakdown)
        todaysOpenCount: todaysOpenChecks.length,
        
        // Averages
        avgCheck: Math.round(avgCheck * 100) / 100,
        
        // Legacy fields for backwards compatibility
        checkCount: checksClosed.length,
      });
    } catch (error) {
      console.error("Sales summary error:", error);
      res.status(500).json({ message: "Failed to generate sales summary" });
    }
  });

  // Sales by Category (SLU) - Based on item businessDate (operating day when items were rung in)
  app.get("/api/reports/sales-by-category", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allCheckItems = await storage.getAllCheckItems();
      const allSlus = await storage.getSlus();
      const menuItemSluLinks = await storage.getMenuItemSlus();
      
      // Get valid RVC IDs for filtering
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Build check to RVC mapping
      const checkIdToRvc = new Map(allChecks.map(c => [c.id, c.rvcId]));
      
      // Filter items by businessDate or addedAt timestamp
      const itemsInPeriod = allCheckItems.filter(ci => {
        if (ci.voided) return false;
        // Apply RVC filter first
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(ci.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        // Filter by business date or timestamp
        if (useBusinessDate) {
          return ci.businessDate === businessDate;
        } else {
          if (!ci.addedAt) return false;
          const itemDate = new Date(ci.addedAt);
          return itemDate >= start && itemDate <= end;
        }
      });
      
      // Aggregate by category
      const categoryTotals: Record<string, { name: string; quantity: number; sales: number }> = {};
      
      for (const item of itemsInPeriod) {
        // Find SLU for this menu item
        const sluLink = menuItemSluLinks.find((l: any) => l.menuItemId === item.menuItemId);
        const slu = sluLink ? allSlus.find(s => s.id === sluLink.sluId) : null;
        const categoryName = slu?.name || "Uncategorized";
        const categoryId = slu?.id || "uncategorized";
        
        if (!categoryTotals[categoryId]) {
          categoryTotals[categoryId] = { name: categoryName, quantity: 0, sales: 0 };
        }
        
        const qty = item.quantity || 1;
        const basePrice = parseFloat(item.unitPrice);
        
        // Calculate modifier upcharges
        let modifierUpcharge = 0;
        if (item.modifiers && Array.isArray(item.modifiers)) {
          modifierUpcharge = (item.modifiers as any[]).reduce((mSum, mod) => {
            return mSum + parseFloat(mod.priceDelta || "0");
          }, 0);
        }
        
        categoryTotals[categoryId].quantity += qty;
        categoryTotals[categoryId].sales += (basePrice + modifierUpcharge) * qty;
      }
      
      const result = Object.entries(categoryTotals)
        .map(([id, data]) => ({ id, ...data, sales: Math.round(data.sales * 100) / 100 }))
        .sort((a, b) => b.sales - a.sales);
      
      res.json(result);
    } catch (error) {
      console.error("Sales by category error:", error);
      res.status(500).json({ message: "Failed to generate category sales" });
    }
  });

  // Top Selling Items - Based on item businessDate (operating day when items were rung in)
  app.get("/api/reports/top-items", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate, limit: limitParam } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      const limit = parseInt(limitParam as string) || 10;
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allCheckItems = await storage.getAllCheckItems();
      
      // Get valid RVC IDs for filtering
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Build check to RVC mapping
      const checkIdToRvc = new Map(allChecks.map(c => [c.id, c.rvcId]));
      
      // Filter items by businessDate or addedAt timestamp
      const itemsInPeriod = allCheckItems.filter(ci => {
        if (ci.voided) return false;
        // Apply RVC filter first
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(ci.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        // Filter by business date or timestamp
        if (useBusinessDate) {
          return ci.businessDate === businessDate;
        } else {
          if (!ci.addedAt) return false;
          const itemDate = new Date(ci.addedAt);
          return itemDate >= start && itemDate <= end;
        }
      });
      
      const itemTotals: Record<string, { name: string; quantity: number; sales: number }> = {};
      
      for (const item of itemsInPeriod) {
        const id = item.menuItemId;
        if (!itemTotals[id]) {
          itemTotals[id] = { name: item.menuItemName, quantity: 0, sales: 0 };
        }
        const qty = item.quantity || 1;
        const basePrice = parseFloat(item.unitPrice);
        
        // Calculate modifier upcharges
        let modifierUpcharge = 0;
        if (item.modifiers && Array.isArray(item.modifiers)) {
          modifierUpcharge = (item.modifiers as any[]).reduce((mSum, mod) => {
            return mSum + parseFloat(mod.priceDelta || "0");
          }, 0);
        }
        
        itemTotals[id].quantity += qty;
        itemTotals[id].sales += (basePrice + modifierUpcharge) * qty;
      }
      
      const result = Object.entries(itemTotals)
        .map(([id, data]) => ({ id, ...data, sales: Math.round(data.sales * 100) / 100 }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, limit);
      
      res.json(result);
    } catch (error) {
      console.error("Top items error:", error);
      res.status(500).json({ message: "Failed to generate top items" });
    }
  });

  // Tender Mix Report - Based on payment businessDate (operating day when payment was applied)
  app.get("/api/reports/tender-mix", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allPayments = await storage.getAllPayments();
      
      // Get valid RVC IDs for filtering
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Build check to RVC mapping
      const checkIdToRvc = new Map(allChecks.map(c => [c.id, c.rvcId]));
      
      // Filter payments by businessDate or paidAt timestamp
      const paymentsInPeriod = allPayments.filter(p => {
        // Apply RVC filter via check
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(p.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        // Filter by business date or timestamp
        if (useBusinessDate) {
          return p.businessDate === businessDate;
        } else {
          if (!p.paidAt) return false;
          const payDate = new Date(p.paidAt);
          return payDate >= start && payDate <= end;
        }
      });
      
      const tenderTotals: Record<string, { name: string; count: number; amount: number }> = {};
      
      // Group payments by check to properly cap at check total
      const paymentsByCheck = new Map<string, typeof paymentsInPeriod>();
      for (const payment of paymentsInPeriod) {
        const existing = paymentsByCheck.get(payment.checkId) || [];
        existing.push(payment);
        paymentsByCheck.set(payment.checkId, existing);
      }
      
      // Process each check's payments, capping total at check amount
      paymentsByCheck.forEach((checkPayments, checkId) => {
        const check = allChecks.find(c => c.id === checkId);
        const checkTotal = check ? parseFloat(check.total || "0") : Infinity;
        const totalTendered = checkPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
        
        // Calculate ratio to cap if over-tendered
        const ratio = totalTendered > checkTotal ? checkTotal / totalTendered : 1;
        
        for (const payment of checkPayments) {
          const id = payment.tenderId;
          if (!tenderTotals[id]) {
            tenderTotals[id] = { name: payment.tenderName, count: 0, amount: 0 };
          }
          tenderTotals[id].count += 1;
          // Apply ratio to cap payment amount proportionally
          tenderTotals[id].amount += parseFloat(payment.amount) * ratio;
        }
      });
      
      const totalAmount = Object.values(tenderTotals).reduce((sum, t) => sum + t.amount, 0);
      
      const result = Object.entries(tenderTotals)
        .map(([id, data]) => ({ 
          id, 
          ...data, 
          percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0 
        }))
        .sort((a, b) => b.amount - a.amount);
      
      res.json(result);
    } catch (error) {
      console.error("Tender mix error:", error);
      res.status(500).json({ message: "Failed to generate tender mix" });
    }
  });

  // Voids Report
  app.get("/api/reports/voids", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const employees = await storage.getEmployees();
      
      let filteredChecks = allChecks.filter(c => {
        const checkDate = c.status === "closed" && c.closedAt ? new Date(c.closedAt) : (c.openedAt ? new Date(c.openedAt) : null);
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        return true;
      });
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        filteredChecks = filteredChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.rvcId === rvcId);
      }
      
      const voidsByEmployee: Record<string, { name: string; count: number; amount: number }> = {};
      
      for (const check of filteredChecks) {
        const items = await storage.getCheckItems(check.id);
        for (const item of items) {
          if (!item.voided) continue;
          const empId = item.voidedByEmployeeId || check.employeeId;
          const emp = employees.find(e => e.id === empId);
          const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
          
          if (!voidsByEmployee[empId]) {
            voidsByEmployee[empId] = { name: empName, count: 0, amount: 0 };
          }
          voidsByEmployee[empId].count += 1;
          voidsByEmployee[empId].amount += parseFloat(item.unitPrice) * (item.quantity || 1);
        }
      }
      
      const result = Object.entries(voidsByEmployee)
        .map(([id, data]) => ({ employeeId: id, ...data }))
        .sort((a, b) => b.amount - a.amount);
      
      res.json(result);
    } catch (error) {
      console.error("Voids report error:", error);
      res.status(500).json({ message: "Failed to generate voids report" });
    }
  });

  // Discounts Report - Uses item.businessDate filtering to include discounts from all checks with items in scope
  app.get("/api/reports/discounts", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allCheckItems = await storage.getAllCheckItems();
      const allRvcs = await storage.getRvcs();
      const employees = await storage.getEmployees();
      
      // Filter checks by property/RVC first
      let checksInScope = [...allChecks];
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        checksInScope = checksInScope.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        checksInScope = checksInScope.filter(c => c.rvcId === rvcId);
      }
      
      const checkIdsInScope = new Set(checksInScope.map(c => c.id));
      const checkMap = new Map(checksInScope.map(c => [c.id, c]));
      
      // Filter items by businessDate - this determines which checks have in-scope sales
      const itemsInScope = allCheckItems.filter(item => {
        if (!checkIdsInScope.has(item.checkId)) return false;
        if (item.voided) return false;
        if (useBusinessDate) {
          return item.businessDate === businessDate;
        }
        // For date range, use item's businessDate if available
        const itemDate = item.businessDate ? new Date(item.businessDate + "T12:00:00") : (item.addedAt ? new Date(item.addedAt) : null);
        if (!itemDate) return false;
        return itemDate >= start && itemDate <= end;
      });
      
      // Get checks that have items in scope
      const checkIdsWithItems = new Set(itemsInScope.map(i => i.checkId));
      
      const discountsByEmployee: Record<string, { name: string; count: number; amount: number }> = {};
      let totalDiscountAmount = 0;
      let totalDiscountCount = 0;
      
      // Attribute discounts proportionally based on items in scope
      for (const checkId of Array.from(checkIdsWithItems)) {
        const check = checkMap.get(checkId);
        if (!check) continue;
        
        const checkDiscount = parseFloat(check.discountTotal || "0");
        if (checkDiscount <= 0) continue;
        
        // Get all items for this check (for proportion calculation)
        const allCheckItemsForCheck = allCheckItems.filter(i => i.checkId === checkId && !i.voided);
        const checkTotalItemValue = allCheckItemsForCheck.reduce((sum, i) => sum + parseFloat(i.unitPrice) * (i.quantity || 1), 0);
        
        // Get in-scope items for this check
        const inScopeItemsForCheck = itemsInScope.filter(i => i.checkId === checkId);
        const inScopeValue = inScopeItemsForCheck.reduce((sum, i) => sum + parseFloat(i.unitPrice) * (i.quantity || 1), 0);
        
        // Calculate proportional discount
        const proportion = checkTotalItemValue > 0 ? inScopeValue / checkTotalItemValue : 0;
        const attributedDiscount = checkDiscount * proportion;
        
        if (attributedDiscount > 0) {
          totalDiscountAmount += attributedDiscount;
          totalDiscountCount += 1;
          
          // By employee who rang the check
          const empId = check.employeeId;
          const emp = employees.find(e => e.id === empId);
          const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
          if (!discountsByEmployee[empId]) {
            discountsByEmployee[empId] = { name: empName, count: 0, amount: 0 };
          }
          discountsByEmployee[empId].count += 1;
          discountsByEmployee[empId].amount += attributedDiscount;
        }
      }
      
      res.json({
        totalAmount: totalDiscountAmount,
        totalCount: totalDiscountCount,
        byEmployee: Object.entries(discountsByEmployee)
          .map(([id, data]) => ({ employeeId: id, ...data }))
          .sort((a, b) => b.amount - a.amount),
      });
    } catch (error) {
      console.error("Discounts report error:", error);
      res.status(500).json({ message: "Failed to generate discounts report" });
    }
  });

  // Open Checks Report
  app.get("/api/reports/open-checks", async (req, res) => {
    try {
      const { propertyId, rvcId } = req.query;
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const employees = await storage.getEmployees();
      
      let openChecks = allChecks.filter(c => c.status === "open");
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        openChecks = openChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        openChecks = openChecks.filter(c => c.rvcId === rvcId);
      }
      
      const allCheckItems = await storage.getAllCheckItems();
      
      const checksWithDetails = openChecks.map(check => {
        const emp = employees.find(e => e.id === check.employeeId);
        const rvc = allRvcs.find(r => r.id === check.rvcId);
        const ageMinutes = check.openedAt 
          ? Math.floor((Date.now() - new Date(check.openedAt).getTime()) / 60000)
          : 0;
        const itemCount = allCheckItems.filter(ci => ci.checkId === check.id && !ci.voided).length;
        
        return {
          id: check.id,
          checkNumber: check.checkNumber,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          rvcName: rvc?.name || "Unknown",
          tableNumber: check.tableNumber,
          itemCount,
          total: parseFloat(check.total || "0"),
          durationMinutes: ageMinutes,
          openedAt: check.openedAt,
        };
      }).sort((a, b) => b.durationMinutes - a.durationMinutes);
      
      // Calculate summary
      const totalValue = checksWithDetails.reduce((sum, c) => sum + c.total, 0);
      const avgDuration = checksWithDetails.length > 0 
        ? checksWithDetails.reduce((sum, c) => sum + c.durationMinutes, 0) / checksWithDetails.length 
        : 0;
      
      res.json({
        checks: checksWithDetails,
        summary: {
          count: checksWithDetails.length,
          totalValue,
          avgDuration,
        }
      });
    } catch (error) {
      console.error("Open checks error:", error);
      res.status(500).json({ message: "Failed to generate open checks report" });
    }
  });

  // Sales by Employee - Uses businessDate filtering to include sales from all checks (open and closed)
  app.get("/api/reports/sales-by-employee", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allCheckItems = await storage.getAllCheckItems();
      const allRvcs = await storage.getRvcs();
      const employees = await storage.getEmployees();
      
      // Filter checks by property/RVC first
      let checksInScope = [...allChecks];
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        checksInScope = checksInScope.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        checksInScope = checksInScope.filter(c => c.rvcId === rvcId);
      }
      
      const checkIdsInScope = new Set(checksInScope.map(c => c.id));
      const checkMap = new Map(checksInScope.map(c => [c.id, c]));
      
      // Filter items by businessDate - this captures sales from ALL checks (open and closed)
      const itemsInScope = allCheckItems.filter(item => {
        if (!checkIdsInScope.has(item.checkId)) return false;
        if (item.voided) return false;
        if (useBusinessDate) {
          return item.businessDate === businessDate;
        }
        // For date range, use item's businessDate if available
        const itemDate = item.businessDate ? new Date(item.businessDate + "T12:00:00") : (item.addedAt ? new Date(item.addedAt) : null);
        if (!itemDate) return false;
        return itemDate >= start && itemDate <= end;
      });
      
      // Group by employee and calculate sales
      const salesByEmployee: Record<string, { name: string; checkCount: number; closedCheckCount: number; openCheckCount: number; itemCount: number; grossSales: number; netSales: number; avgCheck: number }> = {};
      const employeeChecks: Record<string, Set<string>> = {};
      
      for (const item of itemsInScope) {
        const check = checkMap.get(item.checkId);
        if (!check) continue;
        
        const empId = check.employeeId;
        const emp = employees.find(e => e.id === empId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
        const itemTotal = parseFloat(item.unitPrice) * (item.quantity || 1);
        
        if (!salesByEmployee[empId]) {
          salesByEmployee[empId] = { name: empName, checkCount: 0, closedCheckCount: 0, openCheckCount: 0, itemCount: 0, grossSales: 0, netSales: 0, avgCheck: 0 };
          employeeChecks[empId] = new Set();
        }
        
        employeeChecks[empId].add(item.checkId);
        salesByEmployee[empId].itemCount += item.quantity || 1;
        salesByEmployee[empId].grossSales += itemTotal;
      }
      
      // Count checks per employee and calculate net sales with proportional discount attribution
      for (const empId of Object.keys(salesByEmployee)) {
        const checkIds = employeeChecks[empId];
        salesByEmployee[empId].checkCount = checkIds.size;
        
        let totalDiscount = 0;
        let closedCount = 0;
        let openCount = 0;
        
        for (const checkId of Array.from(checkIds)) {
          const check = checkMap.get(checkId);
          if (!check) continue;
          
          if (check.status === "closed") {
            closedCount++;
          } else {
            openCount++;
          }
          
          // Calculate proportional discount attribution
          // Get all items for this check (for proportion calculation)
          const allCheckItemsForCheck = allCheckItems.filter(i => i.checkId === checkId && !i.voided);
          const checkTotalItemValue = allCheckItemsForCheck.reduce((sum, i) => sum + parseFloat(i.unitPrice) * (i.quantity || 1), 0);
          
          // Get in-scope items for this check
          const inScopeItemsForCheck = itemsInScope.filter(i => i.checkId === checkId);
          const inScopeValue = inScopeItemsForCheck.reduce((sum, i) => sum + parseFloat(i.unitPrice) * (i.quantity || 1), 0);
          
          // Attribute discount proportionally
          const proportion = checkTotalItemValue > 0 ? inScopeValue / checkTotalItemValue : 0;
          totalDiscount += parseFloat(check.discountTotal || "0") * proportion;
        }
        
        salesByEmployee[empId].closedCheckCount = closedCount;
        salesByEmployee[empId].openCheckCount = openCount;
        salesByEmployee[empId].netSales = salesByEmployee[empId].grossSales - totalDiscount;
        salesByEmployee[empId].avgCheck = salesByEmployee[empId].checkCount > 0 
          ? salesByEmployee[empId].netSales / salesByEmployee[empId].checkCount 
          : 0;
      }
      
      const result = Object.entries(salesByEmployee)
        .map(([id, data]) => ({ employeeId: id, ...data }))
        .sort((a, b) => b.netSales - a.netSales);
      
      res.json(result);
    } catch (error) {
      console.error("Sales by employee error:", error);
      res.status(500).json({ message: "Failed to generate sales by employee" });
    }
  });

  // Tender Detail Report - Individual payment transactions - Based on paidAt
  app.get("/api/reports/tender-detail", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate, tenderId } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allPayments = await storage.getAllPayments();
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allTenders = await storage.getTenders();
      const employees = await storage.getEmployees();
      
      // Get valid RVC IDs for filtering
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Build check to RVC mapping
      const checkIdToRvc = new Map(allChecks.map(c => [c.id, c.rvcId]));
      
      // Filter payments by businessDate or paidAt timestamp
      let payments = allPayments.filter(p => {
        // Apply RVC filter via check
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(p.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        // Filter by business date or timestamp
        if (useBusinessDate) {
          return p.businessDate === businessDate;
        } else {
          if (!p.paidAt) return false;
          const payDate = new Date(p.paidAt);
          return payDate >= start && payDate <= end;
        }
      });
      
      // Filter by specific tender if provided
      if (tenderId) {
        payments = payments.filter(p => p.tenderId === tenderId);
      }
      
      // Group payments by check to calculate applied amounts (capped at check total)
      const paymentsByCheck = new Map<string, typeof payments>();
      for (const payment of payments) {
        const existing = paymentsByCheck.get(payment.checkId) || [];
        existing.push(payment);
        paymentsByCheck.set(payment.checkId, existing);
      }
      
      // Calculate applied amount ratios for each check
      const paymentAppliedRatios = new Map<string, number>();
      paymentsByCheck.forEach((checkPayments, checkId) => {
        const check = allChecks.find(c => c.id === checkId);
        const checkTotal = check ? parseFloat(check.total || "0") : Infinity;
        const totalTendered = checkPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
        const ratio = totalTendered > checkTotal ? checkTotal / totalTendered : 1;
        checkPayments.forEach(p => paymentAppliedRatios.set(p.id, ratio));
      });
      
      const result = payments.map(p => {
        const check = allChecks.find(c => c.id === p.checkId);
        const tender = allTenders.find(t => t.id === p.tenderId);
        const rvc = check ? allRvcs.find(r => r.id === check.rvcId) : null;
        const emp = check ? employees.find(e => e.id === check.employeeId) : null;
        const ratio = paymentAppliedRatios.get(p.id) || 1;
        
        return {
          id: p.id,
          checkNumber: check?.checkNumber || 0,
          tenderName: tender?.name || "Unknown",
          tenderType: tender?.type || "unknown",
          amount: parseFloat(p.amount || "0") * ratio, // Applied amount, not tendered
          tipAmount: 0, // Tips would need separate tracking
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          rvcName: rvc?.name || "Unknown",
          paidAt: p.paidAt,
        };
      }).sort((a, b) => new Date(b.paidAt || 0).getTime() - new Date(a.paidAt || 0).getTime());
      
      // Summary by tender type
      const summary: Record<string, { count: number; amount: number; tips: number }> = {};
      for (const p of payments) {
        const tender = allTenders.find(t => t.id === p.tenderId);
        const name = tender?.name || "Unknown";
        const ratio = paymentAppliedRatios.get(p.id) || 1;
        if (!summary[name]) {
          summary[name] = { count: 0, amount: 0, tips: 0 };
        }
        summary[name].count += 1;
        summary[name].amount += parseFloat(p.amount || "0") * ratio; // Applied amount
        // Tips would need separate tracking
      }
      
      res.json({
        transactions: result,
        summary: Object.entries(summary).map(([name, data]) => ({ name, ...data })),
        totalAmount: result.reduce((sum, p) => sum + p.amount, 0),
        totalTips: result.reduce((sum, p) => sum + p.tipAmount, 0),
        transactionCount: result.length,
      });
    } catch (error) {
      console.error("Tender detail error:", error);
      res.status(500).json({ message: "Failed to generate tender detail report" });
    }
  });

  // Menu Item Sales Report - Detailed item-level sales (uses businessDate for consistency)
  app.get("/api/reports/menu-item-sales", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate, itemId } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allCheckItems = await storage.getAllCheckItems();
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const menuItems = await storage.getMenuItems();
      const slus = await storage.getSlus();
      const menuItemSlus = await storage.getMenuItemSlus();
      
      // Get valid RVC IDs for filtering
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Build check to RVC mapping
      const checkIdToRvc = new Map(allChecks.map(c => [c.id, c.rvcId]));
      
      // Filter items by businessDate (consistent with sales-summary and top-items)
      let checkItems = allCheckItems.filter(ci => {
        if (ci.voided) return false;
        // Apply RVC filter
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(ci.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        // Filter by business date or timestamp
        if (useBusinessDate) {
          return ci.businessDate === businessDate;
        } else {
          if (!ci.addedAt) return false;
          const itemDate = new Date(ci.addedAt);
          return itemDate >= start && itemDate <= end;
        }
      });
      
      // Aggregate by menu item
      const itemSales: Record<string, { 
        name: string; 
        category: string;
        quantity: number; 
        grossSales: number; 
        netSales: number;
        avgPrice: number;
      }> = {};
      
      for (const ci of checkItems) {
        const menuItem = menuItems.find(m => m.id === ci.menuItemId);
        if (!menuItem) continue;
        
        // Filter by specific item if provided
        if (itemId && ci.menuItemId !== itemId) continue;
        
        // Find category via menu_item_slus join table
        const menuItemSlu = menuItemSlus.find(mis => mis.menuItemId === ci.menuItemId);
        const slu = menuItemSlu ? slus.find(s => s.id === menuItemSlu.sluId) : null;
        const itemName = menuItem.name;
        const categoryName = slu?.name || "Uncategorized";
        
        if (!itemSales[ci.menuItemId]) {
          itemSales[ci.menuItemId] = { 
            name: itemName, 
            category: categoryName,
            quantity: 0, 
            grossSales: 0, 
            netSales: 0,
            avgPrice: 0,
          };
        }
        
        const qty = ci.quantity || 1;
        const price = parseFloat(ci.unitPrice || "0");
        
        // Calculate modifier upcharges
        let modifierUpcharge = 0;
        if (ci.modifiers && Array.isArray(ci.modifiers)) {
          modifierUpcharge = (ci.modifiers as any[]).reduce((mSum, mod) => {
            return mSum + parseFloat(mod.priceDelta || "0");
          }, 0);
        }
        
        const totalPrice = (price + modifierUpcharge) * qty;
        
        itemSales[ci.menuItemId].quantity += qty;
        itemSales[ci.menuItemId].grossSales += totalPrice;
        itemSales[ci.menuItemId].netSales += totalPrice;
      }
      
      // Calculate averages
      Object.values(itemSales).forEach(item => {
        item.avgPrice = item.quantity > 0 ? item.grossSales / item.quantity : 0;
      });
      
      const result = Object.entries(itemSales)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.netSales - a.netSales);
      
      // Calculate total modifier upcharges for the response
      const totalModifiers = checkItems.reduce((sum, ci) => {
        if (!ci.modifiers || !Array.isArray(ci.modifiers)) return sum;
        const modSum = (ci.modifiers as any[]).reduce((mSum, mod) => {
          return mSum + parseFloat(mod.priceDelta || "0");
        }, 0);
        return sum + modSum * (ci.quantity || 1);
      }, 0);
      
      res.json({
        items: result,
        totalQuantity: result.reduce((sum, i) => sum + i.quantity, 0),
        totalSales: result.reduce((sum, i) => sum + i.netSales, 0),
        totalModifiers,
        itemCount: result.length,
      });
    } catch (error) {
      console.error("Menu item sales error:", error);
      res.status(500).json({ message: "Failed to generate menu item sales report" });
    }
  });

  // Category Sales Report - Detailed sales by SLU/category (uses businessDate for consistency)
  app.get("/api/reports/category-sales", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate, categoryId } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allCheckItems = await storage.getAllCheckItems();
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const menuItems = await storage.getMenuItems();
      const slus = await storage.getSlus();
      const menuItemSlus = await storage.getMenuItemSlus();
      
      // Get valid RVC IDs for filtering
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Build check to RVC mapping
      const checkIdToRvc = new Map(allChecks.map(c => [c.id, c.rvcId]));
      
      // Filter items by businessDate (consistent with sales-summary and top-items)
      const checkItems = allCheckItems.filter(ci => {
        if (ci.voided) return false;
        // Apply RVC filter
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(ci.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        // Filter by business date or timestamp
        if (useBusinessDate) {
          return ci.businessDate === businessDate;
        } else {
          if (!ci.addedAt) return false;
          const itemDate = new Date(ci.addedAt);
          return itemDate >= start && itemDate <= end;
        }
      });
      
      // Build category -> items mapping
      const categoryData: Record<string, { 
        name: string; 
        totalQuantity: number; 
        totalSales: number;
        items: { id: string; name: string; quantity: number; sales: number }[];
      }> = {};
      
      for (const ci of checkItems) {
        const menuItem = menuItems.find(m => m.id === ci.menuItemId);
        if (!menuItem) continue;
        
        // Find category via menu_item_slus join table
        const menuItemSlu = menuItemSlus.find(mis => mis.menuItemId === ci.menuItemId);
        const slu = menuItemSlu ? slus.find(s => s.id === menuItemSlu.sluId) : null;
        const sluId = slu?.id || "uncategorized";
        const sluName = slu?.name || "Uncategorized";
        
        // Filter by specific category if provided
        if (categoryId && sluId !== categoryId) continue;
        
        if (!categoryData[sluId]) {
          categoryData[sluId] = { 
            name: sluName, 
            totalQuantity: 0, 
            totalSales: 0,
            items: [],
          };
        }
        
        const qty = ci.quantity || 1;
        const price = parseFloat(ci.unitPrice || "0");
        
        // Calculate modifier upcharges
        let modifierUpcharge = 0;
        if (ci.modifiers && Array.isArray(ci.modifiers)) {
          modifierUpcharge = (ci.modifiers as any[]).reduce((mSum, mod) => {
            return mSum + parseFloat(mod.priceDelta || "0");
          }, 0);
        }
        
        const sales = (price + modifierUpcharge) * qty;
        
        categoryData[sluId].totalQuantity += qty;
        categoryData[sluId].totalSales += sales;
        
        // Add to items list
        const existingItem = categoryData[sluId].items.find(i => i.id === ci.menuItemId);
        if (existingItem) {
          existingItem.quantity += qty;
          existingItem.sales += sales;
        } else {
          categoryData[sluId].items.push({
            id: ci.menuItemId,
            name: menuItem.name,
            quantity: qty,
            sales: sales,
          });
        }
      }
      
      // Sort items within each category
      Object.values(categoryData).forEach(cat => {
        cat.items.sort((a, b) => b.sales - a.sales);
      });
      
      const result = Object.entries(categoryData)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.totalSales - a.totalSales);
      
      res.json({
        categories: result,
        totalSales: result.reduce((sum, c) => sum + c.totalSales, 0),
        totalQuantity: result.reduce((sum, c) => sum + c.totalQuantity, 0),
      });
    } catch (error) {
      console.error("Category sales error:", error);
      res.status(500).json({ message: "Failed to generate category sales report" });
    }
  });

  // Hourly Sales
  // Hourly Sales Report - Based on item addedAt (when items were rung in)
  app.get("/api/reports/hourly-sales", async (req, res) => {
    try {
      const { propertyId, rvcId, date, businessDate } = req.query;
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      const targetDate = date ? new Date(date as string) : new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allProperties = await storage.getProperties();
      const allCheckItems = await storage.getAllCheckItems();
      
      // Determine the timezone to use for hour conversion
      let timezone = "America/Los_Angeles"; // Default to PST
      if (propertyId && propertyId !== "all") {
        const property = allProperties.find(p => p.id === propertyId);
        if (property?.timezone) {
          timezone = property.timezone;
        }
      }
      
      // Get valid RVC IDs for filtering
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Build check to RVC mapping
      const checkIdToRvc = new Map(allChecks.map(c => [c.id, c.rvcId]));
      
      // Filter items by businessDate or addedAt timestamp
      const itemsInPeriod = allCheckItems.filter(ci => {
        if (ci.voided) return false;
        // Apply RVC filter first
        if (validRvcIds) {
          const checkRvc = checkIdToRvc.get(ci.checkId);
          if (!checkRvc || !validRvcIds.includes(checkRvc)) return false;
        }
        // Filter by business date or timestamp
        if (useBusinessDate) {
          return ci.businessDate === businessDate;
        }
        if (!ci.addedAt) return false;
        const itemDate = new Date(ci.addedAt);
        return itemDate >= startOfDay && itemDate <= endOfDay;
      });
      
      // Initialize hourly buckets (0-23) with item count instead of check count
      const hourlyData: { hour: number; sales: number; checkCount: number }[] = [];
      for (let h = 0; h < 24; h++) {
        hourlyData.push({ hour: h, sales: 0, checkCount: 0 });
      }
      
      // Track unique checks per hour for checkCount
      const checksPerHour: Set<string>[] = Array.from({ length: 24 }, () => new Set());
      
      for (const item of itemsInPeriod) {
        const itemDate = new Date(item.addedAt!);
        // Use getHours() on a Date object adjusted for timezone
        const localDateStr = itemDate.toLocaleString("en-US", { timeZone: timezone });
        const localDate = new Date(localDateStr);
        let hour = localDate.getHours();
        
        // Ensure hour is valid (0-23)
        if (isNaN(hour) || hour < 0 || hour > 23) {
          hour = 0;
        }
        
        const qty = item.quantity || 1;
        const basePrice = parseFloat(item.unitPrice || "0");
        let modifierUpcharge = 0;
        if (item.modifiers && Array.isArray(item.modifiers)) {
          modifierUpcharge = (item.modifiers as any[]).reduce((sum, mod) => 
            sum + parseFloat(mod.priceDelta || "0"), 0
          );
        }
        
        hourlyData[hour].sales += (basePrice + modifierUpcharge) * qty;
        checksPerHour[hour].add(item.checkId);
      }
      
      // Set checkCount to unique checks with items in that hour
      for (let h = 0; h < 24; h++) {
        hourlyData[h].checkCount = checksPerHour[h].size;
        hourlyData[h].sales = Math.round(hourlyData[h].sales * 100) / 100;
      }
      
      res.json(hourlyData);
    } catch (error) {
      console.error("Hourly sales error:", error);
      res.status(500).json({ message: "Failed to generate hourly sales" });
    }
  });

  // Closed Checks Report
  app.get("/api/reports/closed-checks", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const employees = await storage.getEmployees();
      const allPayments = await storage.getAllPayments();
      
      let closedChecks = allChecks.filter(c => c.status === "closed");
      
      // Filter by property/RVC
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        closedChecks = closedChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        closedChecks = closedChecks.filter(c => c.rvcId === rvcId);
      }
      
      // Filter by date (based on closedAt)
      closedChecks = closedChecks.filter(check => {
        if (useBusinessDate) {
          return check.businessDate === businessDate;
        }
        if (!check.closedAt) return false;
        const closedAt = new Date(check.closedAt);
        return closedAt >= start && closedAt <= end;
      });
      
      const result = closedChecks.map(check => {
        const emp = employees.find(e => e.id === check.employeeId);
        const rvc = allRvcs.find(r => r.id === check.rvcId);
        const checkPayments = allPayments.filter(p => p.checkId === check.id);
        const checkTotal = parseFloat(check.total || "0");
        const totalTendered = checkPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
        // Cap totalPaid at check total - for cash over-tender, we show what was applied to the check, not what customer handed over
        const totalPaid = Math.min(totalTendered, checkTotal);
        
        const durationMinutes = check.openedAt && check.closedAt
          ? Math.floor((new Date(check.closedAt).getTime() - new Date(check.openedAt).getTime()) / 60000)
          : 0;
        
        return {
          id: check.id,
          checkNumber: check.checkNumber,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          rvcName: rvc?.name || "Unknown",
          tableNumber: check.tableNumber,
          guestCount: check.guestCount,
          subtotal: parseFloat(check.subtotal || "0"),
          tax: parseFloat(check.taxTotal || "0"),
          total: checkTotal,
          totalPaid,
          durationMinutes,
          openedAt: check.openedAt,
          closedAt: check.closedAt,
          businessDate: check.businessDate,
        };
      }).sort((a, b) => new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime());
      
      res.json({
        checks: result,
        summary: {
          count: result.length,
          totalSales: result.reduce((sum, c) => sum + c.total, 0),
          avgCheck: result.length > 0 ? result.reduce((sum, c) => sum + c.total, 0) / result.length : 0,
          avgDuration: result.length > 0 ? result.reduce((sum, c) => sum + c.durationMinutes, 0) / result.length : 0,
        },
      });
    } catch (error) {
      console.error("Closed checks error:", error);
      res.status(500).json({ message: "Failed to generate closed checks report" });
    }
  });

  // Employee Balance Report - Shows employee sales transactions
  app.get("/api/reports/employee-balance", async (req, res) => {
    try {
      const { propertyId, rvcId, employeeId, startDate, endDate, businessDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      
      const employees = await storage.getEmployees();
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allPayments = await storage.getAllPayments();
      const allCheckItems = await storage.getAllCheckItems();
      const tenders = await storage.getTenders();
      const menuItems = await storage.getMenuItems();
      
      // Get valid RVC IDs
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Filter checks by property/RVC - include ALL checks (open and closed) for business date
      // Sales should be tracked when rung, not when paid
      let filteredChecks = allChecks.filter(check => {
        if (validRvcIds && !validRvcIds.includes(check.rvcId)) return false;
        
        if (useBusinessDate) {
          return check.businessDate === businessDate;
        }
        // For date range, use openedAt since items are rung when check is open
        if (!check.openedAt) return false;
        const openedAt = new Date(check.openedAt);
        return openedAt >= start && openedAt <= end;
      });
      
      // If specific employee, filter further
      if (employeeId && employeeId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.employeeId === employeeId);
      }
      
      // Build employee balance data
      const employeeData: Record<string, {
        id: string;
        name: string;
        checkCount: number;
        closedCheckCount: number;
        openCheckCount: number;
        itemCount: number;
        grossSales: number;
        discounts: number;
        netSales: number;
        tax: number;
        total: number;
        cashCollected: number;
        creditCollected: number;
        otherCollected: number;
        totalCollected: number;
        tips: number;
        outstandingBalance: number;
      }> = {};
      
      for (const check of filteredChecks) {
        const emp = employees.find(e => e.id === check.employeeId);
        if (!emp) continue;
        
        const empId = emp.id;
        if (!employeeData[empId]) {
          employeeData[empId] = {
            id: empId,
            name: `${emp.firstName} ${emp.lastName}`,
            checkCount: 0,
            closedCheckCount: 0,
            openCheckCount: 0,
            itemCount: 0,
            grossSales: 0,
            discounts: 0,
            netSales: 0,
            tax: 0,
            total: 0,
            cashCollected: 0,
            creditCollected: 0,
            otherCollected: 0,
            totalCollected: 0,
            tips: 0,
            outstandingBalance: 0,
          };
        }
        
        employeeData[empId].checkCount++;
        if (check.status === "closed") {
          employeeData[empId].closedCheckCount++;
        } else {
          employeeData[empId].openCheckCount++;
        }
        
        // Get items for this check that match the businessDate filter
        // This ensures we count items by their actual business date
        const checkItems = allCheckItems.filter(ci => {
          if (ci.checkId !== check.id) return false;
          if (ci.voided) return false;
          if (useBusinessDate) {
            return ci.businessDate === businessDate;
          }
          return true;
        });
        
        // Calculate sales from items directly (not from check.subtotal which may exclude open checks)
        let itemGrossSales = 0;
        let modifierTotal = 0;
        for (const item of checkItems) {
          const qty = item.quantity || 1;
          const price = parseFloat(item.unitPrice || "0");
          // Calculate modifier total from modifiers array
          const modPrice = (item.modifiers || []).reduce((sum, mod) => 
            sum + parseFloat(mod.priceDelta || "0"), 0);
          itemGrossSales += price * qty;
          modifierTotal += modPrice * qty;
          employeeData[empId].itemCount += qty;
        }
        
        const totalItemSales = itemGrossSales + modifierTotal;
        employeeData[empId].grossSales += totalItemSales;
        
        // Discounts from check (if available)
        const discountAmount = parseFloat(check.discountTotal || "0");
        employeeData[empId].discounts += discountAmount;
        
        // Calculate tax proportionally if check is closed, otherwise estimate
        if (check.status === "closed") {
          employeeData[empId].tax += parseFloat(check.taxTotal || "0");
          const checkTotal = parseFloat(check.total || "0");
          employeeData[empId].total += checkTotal;
          
          // Get payments for closed checks - cap at check total for over-tender
          const checkPayments = allPayments.filter(p => p.checkId === check.id);
          const totalTendered = checkPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
          const ratio = totalTendered > checkTotal ? checkTotal / totalTendered : 1;
          
          for (const payment of checkPayments) {
            const tenderedAmount = parseFloat(payment.amount || "0");
            const appliedAmount = tenderedAmount * ratio; // Cap at check total proportionally
            employeeData[empId].totalCollected += appliedAmount;
            
            const tender = tenders.find(t => t.id === payment.tenderId);
            if (tender?.type === "cash") {
              employeeData[empId].cashCollected += appliedAmount;
            } else if (tender?.type === "credit") {
              employeeData[empId].creditCollected += appliedAmount;
            } else {
              employeeData[empId].otherCollected += appliedAmount;
            }
          }
        } else {
          // For open checks, calculate estimated tax and total
          // Use check's current values which are updated as items are added
          const openTax = parseFloat(check.taxTotal || "0");
          const openTotal = parseFloat(check.total || "0");
          employeeData[empId].tax += openTax;
          employeeData[empId].total += openTotal;
          employeeData[empId].outstandingBalance += openTotal;
        }
        
        employeeData[empId].netSales = employeeData[empId].grossSales - employeeData[empId].discounts;
      }
      
      const result = Object.values(employeeData).map(emp => ({
        employeeId: emp.id,
        employeeName: emp.name,
        checkCount: emp.checkCount,
        closedCheckCount: emp.closedCheckCount,
        openCheckCount: emp.openCheckCount,
        itemCount: emp.itemCount,
        grossSales: emp.grossSales,
        discounts: emp.discounts,
        netSales: emp.netSales,
        tax: emp.tax,
        total: emp.total,
        cashCollected: emp.cashCollected,
        creditCollected: emp.creditCollected,
        otherCollected: emp.otherCollected,
        totalCollected: emp.totalCollected,
        tips: emp.tips,
        outstandingBalance: emp.outstandingBalance,
      })).sort((a, b) => b.grossSales - a.grossSales);
      
      res.json({
        employees: result,
        summary: {
          employeeCount: result.length,
          totalChecks: result.reduce((sum, e) => sum + e.checkCount, 0),
          closedChecks: result.reduce((sum, e) => sum + e.closedCheckCount, 0),
          openChecks: result.reduce((sum, e) => sum + e.openCheckCount, 0),
          totalSales: result.reduce((sum, e) => sum + e.grossSales, 0),
          totalTips: result.reduce((sum, e) => sum + e.tips, 0),
          totalCollected: result.reduce((sum, e) => sum + e.totalCollected, 0),
          outstandingBalance: result.reduce((sum, e) => sum + e.outstandingBalance, 0),
        },
      });
    } catch (error) {
      console.error("Employee balance error:", error);
      res.status(500).json({ message: "Failed to generate employee balance report" });
    }
  });

  // KDS KPI Dashboard
  app.get("/api/reports/kds-kpi", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, businessDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      const useBusinessDate = businessDate && typeof businessDate === 'string' && isValidBusinessDateFormat(businessDate);
      
      const allRvcs = await storage.getRvcs();
      
      // Get ALL KDS tickets including bumped ones for reporting
      let allKdsTickets: any[];
      if (rvcId && rvcId !== "all") {
        allKdsTickets = await storage.getAllKdsTicketsForReporting({ rvcId: rvcId as string });
      } else {
        allKdsTickets = await storage.getAllKdsTicketsForReporting();
      }
      
      // Get valid RVC IDs for property filtering
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      
      // Filter tickets by RVC (property) and date
      const filteredTickets = allKdsTickets.filter((ticket: any) => {
        if (validRvcIds && !validRvcIds.includes(ticket.rvcId)) return false;
        
        if (useBusinessDate) {
          const ticketDate = ticket.createdAt ? new Date(ticket.createdAt) : null;
          if (!ticketDate) return false;
          const ticketBd = ticketDate.toISOString().split('T')[0];
          return ticketBd === businessDate;
        }
        
        if (!ticket.createdAt) return false;
        const createdAt = new Date(ticket.createdAt);
        return createdAt >= start && createdAt <= end;
      });
      
      // Calculate ticket times - "bumped" is the completed status for KDS tickets
      const completedTickets = filteredTickets.filter((t: any) => 
        (t.status === "completed" || t.status === "bumped") && (t.completedAt || t.bumpedAt)
      );
      const ticketTimes = completedTickets.map((t: any) => {
        const created = new Date(t.createdAt);
        const completed = new Date(t.completedAt || t.bumpedAt);
        return (completed.getTime() - created.getTime()) / 1000;
      });
      
      const avgTicketTime = ticketTimes.length > 0 
        ? ticketTimes.reduce((a: number, b: number) => a + b, 0) / ticketTimes.length 
        : 0;
      const minTicketTime = ticketTimes.length > 0 ? Math.min(...ticketTimes) : 0;
      const maxTicketTime = ticketTimes.length > 0 ? Math.max(...ticketTimes) : 0;
      
      // Count items from tickets - tickets from getKdsTickets already have items array
      let totalItems = 0;
      let readyItems = 0;
      for (const ticket of filteredTickets) {
        if (ticket.items && Array.isArray(ticket.items)) {
          totalItems += ticket.items.length;
          readyItems += ticket.items.filter((i: any) => i.isReady).length;
        }
      }
      
      // Tickets by status - include "active" as in-progress and "bumped" as completed
      const statusCounts = {
        pending: filteredTickets.filter((t: any) => t.status === "pending").length,
        inProgress: filteredTickets.filter((t: any) => t.status === "in_progress" || t.status === "active").length,
        completed: filteredTickets.filter((t: any) => t.status === "completed" || t.status === "bumped").length,
        recalled: filteredTickets.filter((t: any) => t.status === "recalled" || t.isRecalled).length,
      };
      
      // Hourly throughput
      const hourlyThroughput: { hour: number; tickets: number; avgTime: number }[] = [];
      for (let h = 0; h < 24; h++) {
        const hourTickets = completedTickets.filter((t: any) => {
          const created = new Date(t.createdAt);
          return created.getUTCHours() === h;
        });
        const hourTimes = hourTickets.map((t: any) => {
          const created = new Date(t.createdAt);
          const completed = new Date(t.completedAt || t.bumpedAt);
          return (completed.getTime() - created.getTime()) / 1000;
        });
        hourlyThroughput.push({
          hour: h,
          tickets: hourTickets.length,
          avgTime: hourTimes.length > 0 ? hourTimes.reduce((a: number, b: number) => a + b, 0) / hourTimes.length : 0,
        });
      }
      
      res.json({
        summary: {
          totalTickets: filteredTickets.length,
          completedTickets: completedTickets.length,
          totalItems,
          readyItems,
          avgTicketTimeSeconds: Math.round(avgTicketTime),
          minTicketTimeSeconds: Math.round(minTicketTime),
          maxTicketTimeSeconds: Math.round(maxTicketTime),
        },
        statusCounts,
        hourlyThroughput,
      });
    } catch (error) {
      console.error("KDS KPI error:", error);
      res.status(500).json({ message: "Failed to generate KDS KPI report" });
    }
  });

  // Sales Comparison Dashboard - Uses businessDate-based item filtering to include all checks (open and closed)
  app.get("/api/reports/sales-comparison", async (req, res) => {
    try {
      const { propertyId, rvcId, comparisonType } = req.query;
      
      const allChecks = await storage.getChecks();
      const allCheckItems = await storage.getAllCheckItems();
      const allRvcs = await storage.getRvcs();
      
      // Get valid RVC IDs
      let validRvcIds: string[] | null = null;
      if (propertyId && propertyId !== "all") {
        validRvcIds = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
      }
      if (rvcId && rvcId !== "all") {
        validRvcIds = [rvcId as string];
      }
      
      // Filter checks by property/RVC
      const checksInScope = allChecks.filter(c => {
        if (validRvcIds && !validRvcIds.includes(c.rvcId)) return false;
        return true;
      });
      const checkIdsInScope = new Set(checksInScope.map(c => c.id));
      const checkMap = new Map(checksInScope.map(c => [c.id, c]));
      
      // Helper to format date as YYYY-MM-DD in local timezone (not UTC)
      const formatBusinessDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      // Helper to calculate sales for a date range using businessDate on items
      const calculateSales = (startDate: Date, endDate: Date) => {
        // Convert dates to YYYY-MM-DD strings for businessDate comparison (local timezone)
        const startStr = formatBusinessDate(startDate);
        const endStr = formatBusinessDate(endDate);
        
        // Filter items by businessDate range
        const itemsInRange = allCheckItems.filter(item => {
          if (!checkIdsInScope.has(item.checkId)) return false;
          if (item.voided) return false;
          if (!item.businessDate) return false;
          return item.businessDate >= startStr && item.businessDate <= endStr;
        });
        
        // Calculate gross sales from items
        const grossSales = itemsInRange.reduce((sum, item) => {
          return sum + (parseFloat(item.unitPrice) * (item.quantity || 1));
        }, 0);
        
        // Get unique checks that have items in this range
        const checkIdsWithItems = new Set(itemsInRange.map(i => i.checkId));
        
        // For each check with items in range, calculate proportional discount and tax
        let totalDiscounts = 0;
        let totalTax = 0;
        
        for (const checkId of Array.from(checkIdsWithItems)) {
          const check = checkMap.get(checkId);
          if (!check) continue;
          
          // Get all items for this check (for proportion calculation)
          const allCheckItemsForCheck = allCheckItems.filter(i => i.checkId === checkId && !i.voided);
          const checkTotalItemValue = allCheckItemsForCheck.reduce((sum, i) => sum + parseFloat(i.unitPrice) * (i.quantity || 1), 0);
          
          // Get items in range for this check
          const inRangeItems = itemsInRange.filter(i => i.checkId === checkId);
          const inRangeValue = inRangeItems.reduce((sum, i) => sum + parseFloat(i.unitPrice) * (i.quantity || 1), 0);
          
          // Calculate proportion of check's discount/tax to attribute to in-range items
          const proportion = checkTotalItemValue > 0 ? inRangeValue / checkTotalItemValue : 0;
          totalDiscounts += parseFloat(check.discountTotal || "0") * proportion;
          totalTax += parseFloat(check.taxTotal || "0") * proportion;
        }
        
        // Net sales = gross - discounts
        const netSales = grossSales - totalDiscounts;
        
        // Total = net + tax
        const total = netSales + totalTax;
        
        return {
          checkCount: checkIdsWithItems.size,
          grossSales,
          discounts: totalDiscounts,
          netSales,
          tax: totalTax,
          total,
          avgCheck: checkIdsWithItems.size > 0 ? total / checkIdsWithItems.size : 0,
        };
      };
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      let currentPeriod: { start: Date; end: Date; label: string };
      let previousPeriod: { start: Date; end: Date; label: string };
      
      switch (comparisonType) {
        case "today_vs_last_week": {
          const lastWeekSameDay = new Date(today);
          lastWeekSameDay.setDate(lastWeekSameDay.getDate() - 7);
          const lastWeekSameDayEnd = new Date(lastWeekSameDay);
          lastWeekSameDayEnd.setHours(23, 59, 59, 999);
          
          currentPeriod = { start: today, end: todayEnd, label: "Today" };
          previousPeriod = { start: lastWeekSameDay, end: lastWeekSameDayEnd, label: "Same Day Last Week" };
          break;
        }
        case "this_week_vs_last_week": {
          const dayOfWeek = now.getDay();
          const weekStart = new Date(today);
          weekStart.setDate(weekStart.getDate() - dayOfWeek);
          
          const lastWeekStart = new Date(weekStart);
          lastWeekStart.setDate(lastWeekStart.getDate() - 7);
          const lastWeekEnd = new Date(lastWeekStart);
          lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
          lastWeekEnd.setHours(23, 59, 59, 999);
          
          currentPeriod = { start: weekStart, end: todayEnd, label: "This Week" };
          previousPeriod = { start: lastWeekStart, end: lastWeekEnd, label: "Last Week" };
          break;
        }
        case "this_month_vs_last_month": {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          lastMonthEnd.setHours(23, 59, 59, 999);
          
          currentPeriod = { start: monthStart, end: todayEnd, label: "This Month" };
          previousPeriod = { start: lastMonthStart, end: lastMonthEnd, label: "Last Month" };
          break;
        }
        case "this_year_vs_last_year": {
          const yearStart = new Date(now.getFullYear(), 0, 1);
          const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
          const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
          lastYearEnd.setHours(23, 59, 59, 999);
          
          currentPeriod = { start: yearStart, end: todayEnd, label: "This Year" };
          previousPeriod = { start: lastYearStart, end: lastYearEnd, label: "Last Year" };
          break;
        }
        default: {
          // Default to today vs yesterday
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayEnd = new Date(yesterday);
          yesterdayEnd.setHours(23, 59, 59, 999);
          
          currentPeriod = { start: today, end: todayEnd, label: "Today" };
          previousPeriod = { start: yesterday, end: yesterdayEnd, label: "Yesterday" };
        }
      }
      
      const currentSales = calculateSales(currentPeriod.start, currentPeriod.end);
      const previousSales = calculateSales(previousPeriod.start, previousPeriod.end);
      
      // Calculate variances with value and percentage
      const calculateChange = (current: number, previous: number) => {
        const value = current - previous;
        let percentage = 0;
        if (previous === 0) {
          percentage = current > 0 ? 100 : 0;
        } else {
          percentage = ((current - previous) / previous) * 100;
        }
        return { value, percentage };
      };
      
      res.json({
        currentPeriod: {
          label: currentPeriod.label,
          startDate: currentPeriod.start.toISOString(),
          endDate: currentPeriod.end.toISOString(),
          data: currentSales,
        },
        previousPeriod: {
          label: previousPeriod.label,
          startDate: previousPeriod.start.toISOString(),
          endDate: previousPeriod.end.toISOString(),
          data: previousSales,
        },
        changes: {
          checkCount: calculateChange(currentSales.checkCount, previousSales.checkCount),
          grossSales: calculateChange(currentSales.grossSales, previousSales.grossSales),
          netSales: calculateChange(currentSales.netSales, previousSales.netSales),
          total: calculateChange(currentSales.total, previousSales.total),
          avgCheck: calculateChange(currentSales.avgCheck, previousSales.avgCheck),
        },
      });
    } catch (error) {
      console.error("Sales comparison error:", error);
      res.status(500).json({ message: "Failed to generate sales comparison" });
    }
  });

  // ============================================================================
  // TIME & ATTENDANCE API ROUTES
  // ============================================================================

  // === TIME PUNCHES ===

  // Get time punches with filters
  app.get("/api/time-punches", async (req, res) => {
    try {
      const { propertyId, employeeId, businessDate, startDate, endDate } = req.query;
      const punches = await storage.getTimePunches({
        propertyId: propertyId as string,
        employeeId: employeeId as string,
        businessDate: businessDate as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json(punches);
    } catch (error) {
      console.error("Get time punches error:", error);
      res.status(500).json({ message: "Failed to get time punches" });
    }
  });

  // Get single time punch
  app.get("/api/time-punches/:id", async (req, res) => {
    try {
      const punch = await storage.getTimePunch(req.params.id);
      if (!punch) {
        return res.status(404).json({ message: "Time punch not found" });
      }
      res.json(punch);
    } catch (error) {
      console.error("Get time punch error:", error);
      res.status(500).json({ message: "Failed to get time punch" });
    }
  });

  // Clock In
  app.post("/api/time-punches/clock-in", async (req, res) => {
    try {
      const { employeeId, propertyId, workstationId, jobCodeId, notes } = req.body;
      
      if (!employeeId || !propertyId) {
        return res.status(400).json({ message: "Employee ID and Property ID are required" });
      }

      // Check if employee is already clocked in
      const lastPunch = await storage.getLastPunch(employeeId);
      if (lastPunch && lastPunch.punchType === "clock_in") {
        return res.status(400).json({ message: "Employee is already clocked in" });
      }

      // Check for active break
      const activeBreak = await storage.getActiveBreak(employeeId);
      if (activeBreak) {
        return res.status(400).json({ message: "Employee has an active break. End break first." });
      }

      // Get property for business date calculation using configured rollover time
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(400).json({ message: "Property not found" });
      }

      const now = new Date();
      const businessDate = resolveBusinessDate(now, property);

      const punch = await storage.createTimePunch({
        propertyId,
        employeeId,
        punchType: "clock_in",
        actualTimestamp: now,
        businessDate,
        jobCodeId,
        notes,
        source: "pos",
      });

      // Recalculate timecard
      await storage.recalculateTimecard(employeeId, businessDate);

      res.status(201).json(punch);
    } catch (error) {
      console.error("Clock in error:", error);
      res.status(500).json({ message: "Failed to clock in" });
    }
  });

  // Clock Out
  app.post("/api/time-punches/clock-out", async (req, res) => {
    try {
      const { employeeId, propertyId, workstationId, notes } = req.body;
      
      if (!employeeId || !propertyId) {
        return res.status(400).json({ message: "Employee ID and Property ID are required" });
      }

      // Check if employee is clocked in
      const lastPunch = await storage.getLastPunch(employeeId);
      if (!lastPunch || lastPunch.punchType !== "clock_in") {
        return res.status(400).json({ message: "Employee is not clocked in" });
      }

      // Get property for business date calculation using configured rollover time
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(400).json({ message: "Property not found" });
      }

      const now = new Date();
      const businessDate = resolveBusinessDate(now, property);

      // Check for active break - end it automatically before clock out
      const activeBreak = await storage.getActiveBreak(employeeId);
      if (activeBreak) {
        const breakMinutes = Math.round((now.getTime() - new Date(activeBreak.startTime).getTime()) / 60000);
        await storage.updateBreakSession(activeBreak.id, {
          endTime: now,
          actualMinutes: breakMinutes,
        });
        // Recalculate timecard after ending break
        await storage.recalculateTimecard(employeeId, activeBreak.businessDate);
      }

      const punch = await storage.createTimePunch({
        propertyId,
        employeeId,
        punchType: "clock_out",
        actualTimestamp: now,
        businessDate,
        notes,
        source: "pos",
      });

      // Recalculate timecard after clock out punch
      await storage.recalculateTimecard(employeeId, businessDate);

      res.status(201).json(punch);
    } catch (error) {
      console.error("Clock out error:", error);
      res.status(500).json({ message: "Failed to clock out" });
    }
  });

  // Get employee clock status
  app.get("/api/time-punches/status/:employeeId", async (req, res) => {
    try {
      const { employeeId } = req.params;
      const lastPunch = await storage.getLastPunch(employeeId);
      const activeBreak = await storage.getActiveBreak(employeeId);

      let status: "clocked_out" | "clocked_in" | "on_break" = "clocked_out";
      if (activeBreak) {
        status = "on_break";
      } else if (lastPunch && lastPunch.punchType === "clock_in") {
        status = "clocked_in";
      }

      res.json({
        status,
        lastPunch,
        activeBreak,
        clockedInAt: lastPunch?.punchType === "clock_in" ? lastPunch.actualTimestamp : null,
      });
    } catch (error) {
      console.error("Get clock status error:", error);
      res.status(500).json({ message: "Failed to get clock status" });
    }
  });

  // Edit time punch (manager only)
  app.patch("/api/time-punches/:id", async (req, res) => {
    try {
      const { actualTimestamp, editedById, editReason } = req.body;
      
      if (!editedById || !editReason) {
        return res.status(400).json({ message: "Editor ID and reason are required" });
      }

      const punch = await storage.updateTimePunch(
        req.params.id,
        { actualTimestamp: actualTimestamp ? new Date(actualTimestamp) : undefined },
        editedById,
        editReason
      );

      if (!punch) {
        return res.status(404).json({ message: "Time punch not found" });
      }

      // Recalculate timecard
      await storage.recalculateTimecard(punch.employeeId, punch.businessDate);

      res.json(punch);
    } catch (error) {
      console.error("Edit time punch error:", error);
      res.status(500).json({ message: "Failed to edit time punch" });
    }
  });

  // Void time punch (manager only)
  app.post("/api/time-punches/:id/void", async (req, res) => {
    try {
      const { voidedById, voidReason } = req.body;
      
      if (!voidedById || !voidReason) {
        return res.status(400).json({ message: "Voider ID and reason are required" });
      }

      const punch = await storage.voidTimePunch(req.params.id, voidedById, voidReason);
      if (!punch) {
        return res.status(404).json({ message: "Time punch not found" });
      }

      // Recalculate timecard
      await storage.recalculateTimecard(punch.employeeId, punch.businessDate);

      res.json(punch);
    } catch (error) {
      console.error("Void time punch error:", error);
      res.status(500).json({ message: "Failed to void time punch" });
    }
  });

  // === BREAKS ===

  // Get break sessions
  app.get("/api/breaks", async (req, res) => {
    try {
      const { propertyId, employeeId, businessDate } = req.query;
      const breaks = await storage.getBreakSessions({
        propertyId: propertyId as string,
        employeeId: employeeId as string,
        businessDate: businessDate as string,
      });
      res.json(breaks);
    } catch (error) {
      console.error("Get breaks error:", error);
      res.status(500).json({ message: "Failed to get breaks" });
    }
  });

  // Start break
  app.post("/api/breaks/start", async (req, res) => {
    try {
      const { employeeId, propertyId, breakType, scheduledMinutes, isPaid } = req.body;
      
      if (!employeeId || !propertyId) {
        return res.status(400).json({ message: "Employee ID and Property ID are required" });
      }

      // Check if employee is clocked in
      const lastPunch = await storage.getLastPunch(employeeId);
      if (!lastPunch || lastPunch.punchType !== "clock_in") {
        return res.status(400).json({ message: "Employee must be clocked in to start a break" });
      }

      // Check for existing active break
      const activeBreak = await storage.getActiveBreak(employeeId);
      if (activeBreak) {
        return res.status(400).json({ message: "Employee already has an active break" });
      }

      // Get property for business date calculation using configured rollover time
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(400).json({ message: "Property not found" });
      }

      const now = new Date();
      const businessDate = resolveBusinessDate(now, property);

      const breakSession = await storage.createBreakSession({
        propertyId,
        employeeId,
        businessDate,
        breakType: breakType || "meal",
        startTime: now,
        scheduledMinutes: scheduledMinutes || 30,
        isPaid: isPaid ?? false,
      });

      res.status(201).json(breakSession);
    } catch (error) {
      console.error("Start break error:", error);
      res.status(500).json({ message: "Failed to start break" });
    }
  });

  // End break
  app.post("/api/breaks/end", async (req, res) => {
    try {
      const { employeeId, propertyId } = req.body;
      
      if (!employeeId) {
        return res.status(400).json({ message: "Employee ID is required" });
      }

      const activeBreak = await storage.getActiveBreak(employeeId);
      if (!activeBreak) {
        return res.status(400).json({ message: "No active break found" });
      }

      const now = new Date();
      const actualMinutes = Math.round((now.getTime() - new Date(activeBreak.startTime).getTime()) / 60000);

      const breakSession = await storage.updateBreakSession(activeBreak.id, {
        endTime: now,
        actualMinutes,
      });

      // Recalculate timecard and return updated data
      const timecard = await storage.recalculateTimecard(employeeId, activeBreak.businessDate);

      res.json({ breakSession, timecard });
    } catch (error) {
      console.error("End break error:", error);
      res.status(500).json({ message: "Failed to end break" });
    }
  });

  // === TIMECARDS ===

  // Get timecards
  app.get("/api/timecards", async (req, res) => {
    try {
      const { propertyId, employeeId, payPeriodId, businessDate, startDate, endDate } = req.query;
      const timecards = await storage.getTimecards({
        propertyId: propertyId as string,
        employeeId: employeeId as string,
        payPeriodId: payPeriodId as string,
        businessDate: businessDate as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json(timecards);
    } catch (error) {
      console.error("Get timecards error:", error);
      res.status(500).json({ message: "Failed to get timecards" });
    }
  });

  // Get single timecard
  app.get("/api/timecards/:id", async (req, res) => {
    try {
      const timecard = await storage.getTimecard(req.params.id);
      if (!timecard) {
        return res.status(404).json({ message: "Timecard not found" });
      }
      res.json(timecard);
    } catch (error) {
      console.error("Get timecard error:", error);
      res.status(500).json({ message: "Failed to get timecard" });
    }
  });

  // Get employee timecard with punches for a date
  app.get("/api/timecards/employee/:employeeId/date/:businessDate", async (req, res) => {
    try {
      const { employeeId, businessDate } = req.params;
      
      const timecards = await storage.getTimecards({ employeeId, businessDate });
      const timecard = timecards[0];
      
      const punches = await storage.getTimePunches({ employeeId, businessDate });
      const breaks = await storage.getBreakSessions({ employeeId, businessDate });

      res.json({
        timecard,
        punches,
        breaks,
      });
    } catch (error) {
      console.error("Get employee timecard error:", error);
      res.status(500).json({ message: "Failed to get employee timecard" });
    }
  });

  // Update timecard (manual edit)
  app.patch("/api/timecards/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { regularHours, overtimeHours, doubleTimeHours, tips, editReason, editedById } = req.body;
      
      // Get existing timecard to get propertyId and businessDate for snapshot refresh
      const existing = await storage.getTimecard(id);
      if (!existing) {
        return res.status(404).json({ message: "Timecard not found" });
      }
      
      // Calculate total hours and pay
      const regHrs = parseFloat(regularHours || existing.regularHours || "0");
      const otHrs = parseFloat(overtimeHours || existing.overtimeHours || "0");
      const dtHrs = parseFloat(doubleTimeHours || existing.doubleTimeHours || "0");
      const totalHours = regHrs + otHrs + dtHrs;
      
      // Get pay rate from timecard or employee job code
      const payRate = parseFloat(existing.payRate || "0");
      const regularPay = regHrs * payRate;
      const overtimePay = otHrs * payRate * 1.5;
      const doublePay = dtHrs * payRate * 2;
      const totalPay = regularPay + overtimePay + doublePay;
      
      const updateData: any = {
        regularHours: regHrs.toFixed(2),
        overtimeHours: otHrs.toFixed(2),
        doubleTimeHours: dtHrs.toFixed(2),
        totalHours: totalHours.toFixed(2),
        regularPay: regularPay.toFixed(2),
        overtimePay: overtimePay.toFixed(2),
        totalPay: totalPay.toFixed(2),
      };
      
      if (tips !== undefined) {
        updateData.tips = parseFloat(tips || "0").toFixed(2);
      }
      
      const timecard = await storage.updateTimecard(id, updateData);
      
      // Log the edit for audit trail
      if (editedById && editReason) {
        await storage.createTimecardEdit({
          propertyId: existing.propertyId,
          targetType: "timecard",
          targetId: id,
          editedById: editedById,
          editType: "hours_adjustment",
          beforeValue: { totalHours: existing.totalHours || "0" },
          afterValue: { totalHours: totalHours.toFixed(2) },
          notes: editReason,
        });
      }
      
      // Recalculate labor snapshot for this business date
      if (existing.propertyId && existing.businessDate) {
        await storage.calculateLaborSnapshot(existing.propertyId, existing.businessDate);
      }
      
      res.json(timecard);
    } catch (error) {
      console.error("Update timecard error:", error);
      res.status(500).json({ message: "Failed to update timecard" });
    }
  });

  // Recalculate timecard
  app.post("/api/timecards/recalculate", async (req, res) => {
    try {
      const { employeeId, businessDate } = req.body;
      
      if (!employeeId || !businessDate) {
        return res.status(400).json({ message: "Employee ID and business date are required" });
      }

      const timecard = await storage.recalculateTimecard(employeeId, businessDate);
      res.json(timecard);
    } catch (error) {
      console.error("Recalculate timecard error:", error);
      res.status(500).json({ message: "Failed to recalculate timecard" });
    }
  });

  // === TIMECARD EXCEPTIONS ===

  // Get exceptions
  app.get("/api/timecard-exceptions", async (req, res) => {
    try {
      const { propertyId, employeeId, status } = req.query;
      const exceptions = await storage.getTimecardExceptions({
        propertyId: propertyId as string,
        employeeId: employeeId as string,
        status: status as string,
      });
      res.json(exceptions);
    } catch (error) {
      console.error("Get timecard exceptions error:", error);
      res.status(500).json({ message: "Failed to get timecard exceptions" });
    }
  });

  // Create exception
  app.post("/api/timecard-exceptions", async (req, res) => {
    try {
      const parsed = insertTimecardExceptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid exception data", errors: parsed.error.issues });
      }
      const exception = await storage.createTimecardException(parsed.data);
      res.status(201).json(exception);
    } catch (error) {
      console.error("Create exception error:", error);
      res.status(500).json({ message: "Failed to create exception" });
    }
  });

  // Resolve exception
  app.post("/api/timecard-exceptions/:id/resolve", async (req, res) => {
    try {
      const { resolvedById, resolutionNotes } = req.body;
      
      if (!resolvedById) {
        return res.status(400).json({ message: "Resolver ID is required" });
      }

      const exception = await storage.resolveTimecardException(
        req.params.id,
        resolvedById,
        resolutionNotes || ""
      );

      if (!exception) {
        return res.status(404).json({ message: "Exception not found" });
      }

      res.json(exception);
    } catch (error) {
      console.error("Resolve exception error:", error);
      res.status(500).json({ message: "Failed to resolve exception" });
    }
  });

  // === PAY PERIODS ===

  // Get pay periods
  app.get("/api/pay-periods", async (req, res) => {
    try {
      const { propertyId } = req.query;
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      const periods = await storage.getPayPeriods(propertyId as string);
      res.json(periods);
    } catch (error) {
      console.error("Get pay periods error:", error);
      res.status(500).json({ message: "Failed to get pay periods" });
    }
  });

  // Get single pay period
  app.get("/api/pay-periods/:id", async (req, res) => {
    try {
      const period = await storage.getPayPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ message: "Pay period not found" });
      }
      res.json(period);
    } catch (error) {
      console.error("Get pay period error:", error);
      res.status(500).json({ message: "Failed to get pay period" });
    }
  });

  // Get pay period for date
  app.get("/api/pay-periods/for-date", async (req, res) => {
    try {
      const { propertyId, date } = req.query;
      if (!propertyId || !date) {
        return res.status(400).json({ message: "Property ID and date are required" });
      }
      const period = await storage.getPayPeriodForDate(propertyId as string, date as string);
      res.json(period || null);
    } catch (error) {
      console.error("Get pay period for date error:", error);
      res.status(500).json({ message: "Failed to get pay period" });
    }
  });

  // Create pay period
  app.post("/api/pay-periods", async (req, res) => {
    try {
      const parsed = insertPayPeriodSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid pay period data", errors: parsed.error.issues });
      }
      const period = await storage.createPayPeriod(parsed.data);
      res.status(201).json(period);
    } catch (error) {
      console.error("Create pay period error:", error);
      res.status(500).json({ message: "Failed to create pay period" });
    }
  });

  // Update pay period
  app.patch("/api/pay-periods/:id", async (req, res) => {
    try {
      const period = await storage.updatePayPeriod(req.params.id, req.body);
      if (!period) {
        return res.status(404).json({ message: "Pay period not found" });
      }
      res.json(period);
    } catch (error) {
      console.error("Update pay period error:", error);
      res.status(500).json({ message: "Failed to update pay period" });
    }
  });

  // Lock pay period
  app.post("/api/pay-periods/:id/lock", async (req, res) => {
    try {
      const { lockedById } = req.body;
      if (!lockedById) {
        return res.status(400).json({ message: "Locker ID is required" });
      }
      
      const period = await storage.lockPayPeriod(req.params.id, lockedById);
      if (!period) {
        return res.status(404).json({ message: "Pay period not found" });
      }
      res.json(period);
    } catch (error) {
      console.error("Lock pay period error:", error);
      res.status(500).json({ message: "Failed to lock pay period" });
    }
  });

  // Unlock pay period
  app.post("/api/pay-periods/:id/unlock", async (req, res) => {
    try {
      const { unlockedById, reason } = req.body;
      if (!unlockedById || !reason) {
        return res.status(400).json({ message: "Unlocker ID and reason are required" });
      }
      
      const period = await storage.unlockPayPeriod(req.params.id, reason, unlockedById);
      if (!period) {
        return res.status(404).json({ message: "Pay period not found" });
      }
      res.json(period);
    } catch (error) {
      console.error("Unlock pay period error:", error);
      res.status(500).json({ message: "Failed to unlock pay period" });
    }
  });

  // Payroll export - generates CSV data for a pay period
  app.get("/api/pay-periods/:id/export", async (req, res) => {
    try {
      const period = await storage.getPayPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ message: "Pay period not found" });
      }

      // Get all timecards for this pay period
      const timecards = await storage.getTimecards({
        propertyId: period.propertyId,
        payPeriodId: period.id,
      });

      // Get all employees for enrichment
      const employees = await storage.getEmployees();
      const employeeMap = new Map(employees.map(e => [e.id, e]));

      // Get all job codes for enrichment
      const jobCodes = await storage.getJobCodes(period.propertyId);
      const jobCodeMap = new Map(jobCodes.map(j => [j.id, j]));

      // Aggregate data per employee
      const employeeSummaries: Record<string, {
        employeeId: string;
        employeeNumber: string;
        firstName: string;
        lastName: string;
        regularHours: number;
        overtimeHours: number;
        doubleTimeHours: number;
        totalHours: number;
        regularPay: number;
        overtimePay: number;
        totalPay: number;
        breakMinutes: number;
        daysWorked: number;
      }> = {};

      for (const tc of timecards) {
        const emp = employeeMap.get(tc.employeeId);
        if (!emp) continue;

        if (!employeeSummaries[tc.employeeId]) {
          employeeSummaries[tc.employeeId] = {
            employeeId: tc.employeeId,
            employeeNumber: emp.employeeNumber,
            firstName: emp.firstName,
            lastName: emp.lastName,
            regularHours: 0,
            overtimeHours: 0,
            doubleTimeHours: 0,
            totalHours: 0,
            regularPay: 0,
            overtimePay: 0,
            totalPay: 0,
            breakMinutes: 0,
            daysWorked: 0,
          };
        }

        const summary = employeeSummaries[tc.employeeId];
        summary.regularHours += parseFloat(tc.regularHours || "0");
        summary.overtimeHours += parseFloat(tc.overtimeHours || "0");
        summary.doubleTimeHours += parseFloat(tc.doubleTimeHours || "0");
        summary.totalHours += parseFloat(tc.totalHours || "0");
        summary.regularPay += parseFloat(tc.regularPay || "0");
        summary.overtimePay += parseFloat(tc.overtimePay || "0");
        summary.totalPay += parseFloat(tc.totalPay || "0");
        summary.breakMinutes += tc.breakMinutes || 0;
        summary.daysWorked += 1;
      }

      const format = req.query.format || "json";
      
      if (format === "csv") {
        // Generate CSV
        const headers = [
          "Employee Number",
          "First Name",
          "Last Name",
          "Regular Hours",
          "Overtime Hours",
          "Double Time Hours",
          "Total Hours",
          "Regular Pay",
          "Overtime Pay",
          "Total Pay",
          "Break Minutes",
          "Days Worked"
        ].join(",");

        const rows = Object.values(employeeSummaries).map(s => [
          s.employeeNumber,
          s.firstName,
          s.lastName,
          s.regularHours.toFixed(2),
          s.overtimeHours.toFixed(2),
          s.doubleTimeHours.toFixed(2),
          s.totalHours.toFixed(2),
          s.regularPay.toFixed(2),
          s.overtimePay.toFixed(2),
          s.totalPay.toFixed(2),
          s.breakMinutes,
          s.daysWorked
        ].join(","));

        const csv = [headers, ...rows].join("\n");
        
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="payroll_${period.startDate}_${period.endDate}.csv"`);
        res.send(csv);
      } else {
        // Return JSON
        res.json({
          payPeriod: {
            id: period.id,
            startDate: period.startDate,
            endDate: period.endDate,
            status: period.status,
          },
          employees: Object.values(employeeSummaries),
          totals: {
            regularHours: Object.values(employeeSummaries).reduce((sum, s) => sum + s.regularHours, 0),
            overtimeHours: Object.values(employeeSummaries).reduce((sum, s) => sum + s.overtimeHours, 0),
            doubleTimeHours: Object.values(employeeSummaries).reduce((sum, s) => sum + s.doubleTimeHours, 0),
            totalHours: Object.values(employeeSummaries).reduce((sum, s) => sum + s.totalHours, 0),
            regularPay: Object.values(employeeSummaries).reduce((sum, s) => sum + s.regularPay, 0),
            overtimePay: Object.values(employeeSummaries).reduce((sum, s) => sum + s.overtimePay, 0),
            totalPay: Object.values(employeeSummaries).reduce((sum, s) => sum + s.totalPay, 0),
          },
          exportedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Payroll export error:", error);
      res.status(500).json({ message: "Failed to export payroll" });
    }
  });

  // === JOB CODES ===

  // Get job codes
  app.get("/api/job-codes", async (req, res) => {
    try {
      const { propertyId } = req.query;
      const jobCodes = await storage.getJobCodes(propertyId as string);
      res.json(jobCodes);
    } catch (error) {
      console.error("Get job codes error:", error);
      res.status(500).json({ message: "Failed to get job codes" });
    }
  });

  // Get single job code
  app.get("/api/job-codes/:id", async (req, res) => {
    try {
      const jobCode = await storage.getJobCode(req.params.id);
      if (!jobCode) {
        return res.status(404).json({ message: "Job code not found" });
      }
      res.json(jobCode);
    } catch (error) {
      console.error("Get job code error:", error);
      res.status(500).json({ message: "Failed to get job code" });
    }
  });

  // Create job code
  app.post("/api/job-codes", async (req, res) => {
    try {
      const parsed = insertJobCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid job code data", errors: parsed.error.issues });
      }
      const jobCode = await storage.createJobCode(parsed.data);
      res.status(201).json(jobCode);
    } catch (error) {
      console.error("Create job code error:", error);
      res.status(500).json({ message: "Failed to create job code" });
    }
  });

  // Update job code
  app.patch("/api/job-codes/:id", async (req, res) => {
    try {
      const jobCode = await storage.updateJobCode(req.params.id, req.body);
      if (!jobCode) {
        return res.status(404).json({ message: "Job code not found" });
      }
      res.json(jobCode);
    } catch (error) {
      console.error("Update job code error:", error);
      res.status(500).json({ message: "Failed to update job code" });
    }
  });

  // Delete job code
  app.delete("/api/job-codes/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteJobCode(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Job code not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete job code error:", error);
      res.status(500).json({ message: "Failed to delete job code" });
    }
  });

  // Get employee job codes (basic)
  app.get("/api/employees/:employeeId/job-codes", async (req, res) => {
    try {
      const jobCodes = await storage.getEmployeeJobCodes(req.params.employeeId);
      res.json(jobCodes);
    } catch (error) {
      console.error("Get employee job codes error:", error);
      res.status(500).json({ message: "Failed to get employee job codes" });
    }
  });

  // Get employee job codes with job details (including role)
  app.get("/api/employees/:employeeId/job-codes/details", async (req, res) => {
    try {
      const jobCodes = await storage.getEmployeeJobCodesWithDetails(req.params.employeeId);
      res.json(jobCodes);
    } catch (error) {
      console.error("Get employee job codes with details error:", error);
      res.status(500).json({ message: "Failed to get employee job codes" });
    }
  });

  // Get all employee job codes for a property (bulk)
  app.get("/api/properties/:propertyId/employee-job-codes", async (req, res) => {
    try {
      const jobCodes = await storage.getAllEmployeeJobCodesForProperty(req.params.propertyId);
      res.json(jobCodes);
    } catch (error) {
      console.error("Get all employee job codes for property error:", error);
      res.status(500).json({ message: "Failed to get employee job codes" });
    }
  });

  // Set employee job codes (with pay rates)
  app.put("/api/employees/:employeeId/job-codes", async (req, res) => {
    try {
      const { assignments, jobCodeIds } = req.body;
      // Support both old format (jobCodeIds array) and new format (assignments array with payRate)
      let assignmentData: { jobCodeId: string; payRate?: string; isPrimary?: boolean }[];
      
      if (assignments && Array.isArray(assignments)) {
        assignmentData = assignments;
      } else if (jobCodeIds && Array.isArray(jobCodeIds)) {
        // Backward compatibility: convert simple array to assignment format
        assignmentData = jobCodeIds.map((id: string, index: number) => ({
          jobCodeId: id,
          isPrimary: index === 0,
        }));
      } else {
        return res.status(400).json({ message: "assignments or jobCodeIds must be an array" });
      }
      
      const result = await storage.setEmployeeJobCodes(req.params.employeeId, assignmentData);
      res.json(result);
    } catch (error) {
      console.error("Set employee job codes error:", error);
      res.status(500).json({ message: "Failed to set employee job codes" });
    }
  });

  // === TIMECARD EDITS (AUDIT) ===

  // Get timecard edits
  app.get("/api/timecard-edits", async (req, res) => {
    try {
      const { propertyId, targetType, targetId } = req.query;
      const edits = await storage.getTimecardEdits({
        propertyId: propertyId as string,
        targetType: targetType as string,
        targetId: targetId as string,
      });
      res.json(edits);
    } catch (error) {
      console.error("Get timecard edits error:", error);
      res.status(500).json({ message: "Failed to get timecard edits" });
    }
  });

  // ============================================================================
  // LINE UP API - Daily Schedule Timeline
  // ============================================================================

  // Get line-up data for a specific day (shifts, timecards, breaks) - path params version
  app.get("/api/line-up/:propertyId/:date", async (req, res) => {
    try {
      const { propertyId, date } = req.params;

      // Get shifts for this date
      const shifts = await storage.getShifts({
        propertyId: propertyId,
        startDate: date,
        endDate: date,
      });

      // Get timecards for this business date
      const timecards = await storage.getTimecards({
        propertyId: propertyId,
        businessDate: date,
      });

      // Get break sessions for this business date
      const breakSessions = await storage.getBreakSessions({
        propertyId: propertyId,
        businessDate: date,
      });

      res.json({
        shifts,
        timecards,
        breakSessions,
      });
    } catch (error) {
      console.error("Get line-up data error:", error);
      res.status(500).json({ message: "Failed to get line-up data" });
    }
  });

  // Get line-up data for a specific day (legacy query params version)
  app.get("/api/line-up", async (req, res) => {
    try {
      const { propertyId, date } = req.query;
      
      if (!propertyId || !date) {
        return res.status(400).json({ message: "propertyId and date are required" });
      }

      // Get shifts for this date
      const shifts = await storage.getShifts({
        propertyId: propertyId as string,
        startDate: date as string,
        endDate: date as string,
      });

      // Get timecards for this business date
      const timecards = await storage.getTimecards({
        propertyId: propertyId as string,
        businessDate: date as string,
      });

      // Get break sessions for this business date
      const breakSessions = await storage.getBreakSessions({
        propertyId: propertyId as string,
        businessDate: date as string,
      });

      res.json({
        shifts,
        timecards,
        breakSessions,
      });
    } catch (error) {
      console.error("Get line-up data error:", error);
      res.status(500).json({ message: "Failed to get line-up data" });
    }
  });

  // ============================================================================
  // SCHEDULING API ROUTES
  // ============================================================================

  // === SHIFTS ===

  // Get shifts with filters
  app.get("/api/shifts", async (req, res) => {
    try {
      const { propertyId, rvcId, employeeId, startDate, endDate, status } = req.query;
      const shifts = await storage.getShifts({
        propertyId: propertyId as string,
        rvcId: rvcId as string,
        employeeId: employeeId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
      });
      res.json(shifts);
    } catch (error) {
      console.error("Get shifts error:", error);
      res.status(500).json({ message: "Failed to get shifts" });
    }
  });

  // Get single shift
  app.get("/api/shifts/:id", async (req, res) => {
    try {
      const shift = await storage.getShift(req.params.id);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }
      res.json(shift);
    } catch (error) {
      console.error("Get shift error:", error);
      res.status(500).json({ message: "Failed to get shift" });
    }
  });

  // Create shift
  app.post("/api/shifts", async (req, res) => {
    try {
      const parsed = insertShiftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid shift data", errors: parsed.error.issues });
      }
      const shift = await storage.createShift(parsed.data);
      res.status(201).json(shift);
    } catch (error) {
      console.error("Create shift error:", error);
      res.status(500).json({ message: "Failed to create shift" });
    }
  });

  // Bulk create shifts (for repeating shifts across multiple days)
  app.post("/api/shifts/bulk-create", async (req, res) => {
    try {
      const { shifts } = req.body;
      if (!Array.isArray(shifts) || shifts.length === 0) {
        return res.status(400).json({ message: "Shifts array is required" });
      }
      const createdShifts = [];
      for (const shiftData of shifts) {
        const parsed = insertShiftSchema.safeParse(shiftData);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid shift data", errors: parsed.error.issues });
        }
        const shift = await storage.createShift(parsed.data);
        createdShifts.push(shift);
      }
      res.status(201).json(createdShifts);
    } catch (error) {
      console.error("Bulk create shifts error:", error);
      res.status(500).json({ message: "Failed to bulk create shifts" });
    }
  });

  // Update shift
  app.patch("/api/shifts/:id", async (req, res) => {
    try {
      const shift = await storage.updateShift(req.params.id, req.body);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }
      res.json(shift);
    } catch (error) {
      console.error("Update shift error:", error);
      res.status(500).json({ message: "Failed to update shift" });
    }
  });

  // Delete shift
  app.delete("/api/shifts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteShift(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Shift not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete shift error:", error);
      res.status(500).json({ message: "Failed to delete shift" });
    }
  });

  // Publish shifts
  app.post("/api/shifts/publish", async (req, res) => {
    try {
      const { shiftIds, publishedById } = req.body;
      if (!Array.isArray(shiftIds) || shiftIds.length === 0) {
        return res.status(400).json({ message: "Shift IDs array is required" });
      }
      // publishedById is optional - pass null if not a valid UUID
      const validPublisherId = publishedById && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publishedById) 
        ? publishedById 
        : null;
      const shifts = await storage.publishShifts(shiftIds, validPublisherId);
      res.json(shifts);
    } catch (error) {
      console.error("Publish shifts error:", error);
      res.status(500).json({ message: "Failed to publish shifts" });
    }
  });

  // Copy week schedule
  app.post("/api/shifts/copy-week", async (req, res) => {
    try {
      const { propertyId, sourceWeekStart, targetWeekStart } = req.body;
      if (!propertyId || !sourceWeekStart || !targetWeekStart) {
        return res.status(400).json({ message: "Property ID, source week start, and target week start are required" });
      }
      const shifts = await storage.copyWeekSchedule(propertyId, sourceWeekStart, targetWeekStart);
      res.status(201).json(shifts);
    } catch (error) {
      console.error("Copy week schedule error:", error);
      res.status(500).json({ message: "Failed to copy week schedule" });
    }
  });

  // === SHIFT TEMPLATES ===

  // Get shift templates
  app.get("/api/shift-templates", async (req, res) => {
    try {
      const { propertyId } = req.query;
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      const templates = await storage.getShiftTemplates(propertyId as string);
      res.json(templates);
    } catch (error) {
      console.error("Get shift templates error:", error);
      res.status(500).json({ message: "Failed to get shift templates" });
    }
  });

  // Get single shift template
  app.get("/api/shift-templates/:id", async (req, res) => {
    try {
      const template = await storage.getShiftTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Shift template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get shift template error:", error);
      res.status(500).json({ message: "Failed to get shift template" });
    }
  });

  // Create shift template
  app.post("/api/shift-templates", async (req, res) => {
    try {
      const parsed = insertShiftTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid shift template data", errors: parsed.error.issues });
      }
      const template = await storage.createShiftTemplate(parsed.data);
      res.status(201).json(template);
    } catch (error) {
      console.error("Create shift template error:", error);
      res.status(500).json({ message: "Failed to create shift template" });
    }
  });

  // Update shift template
  app.patch("/api/shift-templates/:id", async (req, res) => {
    try {
      const template = await storage.updateShiftTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ message: "Shift template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Update shift template error:", error);
      res.status(500).json({ message: "Failed to update shift template" });
    }
  });

  // Delete shift template
  app.delete("/api/shift-templates/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteShiftTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Shift template not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete shift template error:", error);
      res.status(500).json({ message: "Failed to delete shift template" });
    }
  });

  // === EMPLOYEE AVAILABILITY ===

  // Get employee availability
  app.get("/api/employees/:employeeId/availability", async (req, res) => {
    try {
      const availability = await storage.getEmployeeAvailability(req.params.employeeId);
      res.json(availability);
    } catch (error) {
      console.error("Get employee availability error:", error);
      res.status(500).json({ message: "Failed to get employee availability" });
    }
  });

  // Set employee availability (replaces all)
  app.put("/api/employees/:employeeId/availability", async (req, res) => {
    try {
      const { availability } = req.body;
      if (!Array.isArray(availability)) {
        return res.status(400).json({ message: "Availability must be an array" });
      }
      // Add employeeId to each availability entry and validate
      const withEmployeeId = availability.map((a: any) => ({
        ...a,
        employeeId: req.params.employeeId,
      }));
      
      // Validate each availability entry
      const validatedEntries = [];
      for (let i = 0; i < withEmployeeId.length; i++) {
        const parsed = insertEmployeeAvailabilitySchema.safeParse(withEmployeeId[i]);
        if (!parsed.success) {
          return res.status(400).json({ 
            message: `Invalid availability entry at index ${i}`, 
            errors: parsed.error.issues 
          });
        }
        validatedEntries.push(parsed.data);
      }
      
      const result = await storage.setEmployeeAvailability(req.params.employeeId, validatedEntries);
      res.json(result);
    } catch (error) {
      console.error("Set employee availability error:", error);
      res.status(500).json({ message: "Failed to set employee availability" });
    }
  });

  // === AVAILABILITY EXCEPTIONS ===

  // Get availability exceptions
  app.get("/api/employees/:employeeId/availability-exceptions", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const exceptions = await storage.getAvailabilityExceptions(
        req.params.employeeId,
        startDate as string,
        endDate as string
      );
      res.json(exceptions);
    } catch (error) {
      console.error("Get availability exceptions error:", error);
      res.status(500).json({ message: "Failed to get availability exceptions" });
    }
  });

  // Create availability exception
  app.post("/api/availability-exceptions", async (req, res) => {
    try {
      const parsed = insertAvailabilityExceptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid availability exception data", errors: parsed.error.issues });
      }
      const exception = await storage.createAvailabilityException(parsed.data);
      res.status(201).json(exception);
    } catch (error) {
      console.error("Create availability exception error:", error);
      res.status(500).json({ message: "Failed to create availability exception" });
    }
  });

  // Delete availability exception
  app.delete("/api/availability-exceptions/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAvailabilityException(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Availability exception not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete availability exception error:", error);
      res.status(500).json({ message: "Failed to delete availability exception" });
    }
  });

  // === TIME OFF REQUESTS ===

  // Get time off requests
  app.get("/api/time-off-requests", async (req, res) => {
    try {
      const { employeeId, propertyId, status } = req.query;
      const requests = await storage.getTimeOffRequests({
        employeeId: employeeId as string,
        propertyId: propertyId as string,
        status: status as string,
      });
      res.json(requests);
    } catch (error) {
      console.error("Get time off requests error:", error);
      res.status(500).json({ message: "Failed to get time off requests" });
    }
  });

  // Get single time off request
  app.get("/api/time-off-requests/:id", async (req, res) => {
    try {
      const request = await storage.getTimeOffRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ message: "Time off request not found" });
      }
      res.json(request);
    } catch (error) {
      console.error("Get time off request error:", error);
      res.status(500).json({ message: "Failed to get time off request" });
    }
  });

  // Create time off request
  app.post("/api/time-off-requests", async (req, res) => {
    try {
      const parsed = insertTimeOffRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid time off request data", errors: parsed.error.issues });
      }
      const request = await storage.createTimeOffRequest(parsed.data);
      res.status(201).json(request);
    } catch (error) {
      console.error("Create time off request error:", error);
      res.status(500).json({ message: "Failed to create time off request" });
    }
  });

  // Update time off request
  app.patch("/api/time-off-requests/:id", async (req, res) => {
    try {
      const request = await storage.updateTimeOffRequest(req.params.id, req.body);
      if (!request) {
        return res.status(404).json({ message: "Time off request not found" });
      }
      res.json(request);
    } catch (error) {
      console.error("Update time off request error:", error);
      res.status(500).json({ message: "Failed to update time off request" });
    }
  });

  // Review time off request (approve/deny)
  app.post("/api/time-off-requests/:id/review", async (req, res) => {
    try {
      const { reviewedById, approved, notes } = req.body;
      if (!reviewedById || typeof approved !== "boolean") {
        return res.status(400).json({ message: "Reviewer ID and approval status are required" });
      }
      const request = await storage.reviewTimeOffRequest(req.params.id, reviewedById, approved, notes);
      if (!request) {
        return res.status(404).json({ message: "Time off request not found" });
      }
      res.json(request);
    } catch (error) {
      console.error("Review time off request error:", error);
      res.status(500).json({ message: "Failed to review time off request" });
    }
  });

  // === SHIFT COVER REQUESTS ===

  // Get shift cover requests
  app.get("/api/shift-cover-requests", async (req, res) => {
    try {
      const { shiftId, requesterId, status } = req.query;
      const requests = await storage.getShiftCoverRequests({
        shiftId: shiftId as string,
        requesterId: requesterId as string,
        status: status as string,
      });
      res.json(requests);
    } catch (error) {
      console.error("Get shift cover requests error:", error);
      res.status(500).json({ message: "Failed to get shift cover requests" });
    }
  });

  // Get single shift cover request
  app.get("/api/shift-cover-requests/:id", async (req, res) => {
    try {
      const request = await storage.getShiftCoverRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ message: "Shift cover request not found" });
      }
      res.json(request);
    } catch (error) {
      console.error("Get shift cover request error:", error);
      res.status(500).json({ message: "Failed to get shift cover request" });
    }
  });

  // Create shift cover request
  app.post("/api/shift-cover-requests", async (req, res) => {
    try {
      const parsed = insertShiftCoverRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid shift cover request data", errors: parsed.error.issues });
      }
      const request = await storage.createShiftCoverRequest(parsed.data);
      res.status(201).json(request);
    } catch (error) {
      console.error("Create shift cover request error:", error);
      res.status(500).json({ message: "Failed to create shift cover request" });
    }
  });

  // Update shift cover request
  app.patch("/api/shift-cover-requests/:id", async (req, res) => {
    try {
      const request = await storage.updateShiftCoverRequest(req.params.id, req.body);
      if (!request) {
        return res.status(404).json({ message: "Shift cover request not found" });
      }
      res.json(request);
    } catch (error) {
      console.error("Update shift cover request error:", error);
      res.status(500).json({ message: "Failed to update shift cover request" });
    }
  });

  // === SHIFT COVER OFFERS ===

  // Get shift cover offers for a request
  app.get("/api/shift-cover-requests/:coverRequestId/offers", async (req, res) => {
    try {
      const offers = await storage.getShiftCoverOffers(req.params.coverRequestId);
      res.json(offers);
    } catch (error) {
      console.error("Get shift cover offers error:", error);
      res.status(500).json({ message: "Failed to get shift cover offers" });
    }
  });

  // Create shift cover offer
  app.post("/api/shift-cover-offers", async (req, res) => {
    try {
      const parsed = insertShiftCoverOfferSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid shift cover offer data", errors: parsed.error.issues });
      }
      const offer = await storage.createShiftCoverOffer(parsed.data);
      res.status(201).json(offer);
    } catch (error) {
      console.error("Create shift cover offer error:", error);
      res.status(500).json({ message: "Failed to create shift cover offer" });
    }
  });

  // Update shift cover offer
  app.patch("/api/shift-cover-offers/:id", async (req, res) => {
    try {
      const offer = await storage.updateShiftCoverOffer(req.params.id, req.body);
      if (!offer) {
        return res.status(404).json({ message: "Shift cover offer not found" });
      }
      res.json(offer);
    } catch (error) {
      console.error("Update shift cover offer error:", error);
      res.status(500).json({ message: "Failed to update shift cover offer" });
    }
  });

  // === SHIFT COVER APPROVALS ===

  // Approve shift cover (accept an offer)
  app.post("/api/shift-cover-requests/:coverRequestId/approve", async (req, res) => {
    try {
      const { offerId, approvedById, notes } = req.body;
      if (!offerId || !approvedById) {
        return res.status(400).json({ message: "Offer ID and approver ID are required" });
      }
      const approval = await storage.approveShiftCover(req.params.coverRequestId, offerId, approvedById, notes);
      res.status(201).json(approval);
    } catch (error) {
      console.error("Approve shift cover error:", error);
      res.status(500).json({ message: "Failed to approve shift cover" });
    }
  });

  // Deny shift cover request
  app.post("/api/shift-cover-requests/:coverRequestId/deny", async (req, res) => {
    try {
      const { approvedById, notes } = req.body;
      if (!approvedById) {
        return res.status(400).json({ message: "Approver ID is required" });
      }
      const approval = await storage.denyShiftCover(req.params.coverRequestId, approvedById, notes);
      res.status(201).json(approval);
    } catch (error) {
      console.error("Deny shift cover error:", error);
      res.status(500).json({ message: "Failed to deny shift cover" });
    }
  });

  // ============================================================================
  // TIP POOLING API ROUTES
  // ============================================================================

  // === TIP POOL POLICIES ===

  // Get tip pool policies
  app.get("/api/tip-pool-policies", async (req, res) => {
    try {
      const { propertyId } = req.query;
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      const policies = await storage.getTipPoolPolicies(propertyId as string);
      res.json(policies);
    } catch (error) {
      console.error("Get tip pool policies error:", error);
      res.status(500).json({ message: "Failed to get tip pool policies" });
    }
  });

  // Get single tip pool policy
  app.get("/api/tip-pool-policies/:id", async (req, res) => {
    try {
      const policy = await storage.getTipPoolPolicy(req.params.id);
      if (!policy) {
        return res.status(404).json({ message: "Tip pool policy not found" });
      }
      res.json(policy);
    } catch (error) {
      console.error("Get tip pool policy error:", error);
      res.status(500).json({ message: "Failed to get tip pool policy" });
    }
  });

  // Create tip pool policy
  app.post("/api/tip-pool-policies", async (req, res) => {
    try {
      const parsed = insertTipPoolPolicySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid tip pool policy data", errors: parsed.error.issues });
      }
      const policy = await storage.createTipPoolPolicy(parsed.data);
      res.status(201).json(policy);
    } catch (error) {
      console.error("Create tip pool policy error:", error);
      res.status(500).json({ message: "Failed to create tip pool policy" });
    }
  });

  // Update tip pool policy
  app.patch("/api/tip-pool-policies/:id", async (req, res) => {
    try {
      const policy = await storage.updateTipPoolPolicy(req.params.id, req.body);
      if (!policy) {
        return res.status(404).json({ message: "Tip pool policy not found" });
      }
      res.json(policy);
    } catch (error) {
      console.error("Update tip pool policy error:", error);
      res.status(500).json({ message: "Failed to update tip pool policy" });
    }
  });

  // Delete tip pool policy
  app.delete("/api/tip-pool-policies/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTipPoolPolicy(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Tip pool policy not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete tip pool policy error:", error);
      res.status(500).json({ message: "Failed to delete tip pool policy" });
    }
  });

  // === TIP POOL RUNS ===

  // Get tip pool runs
  app.get("/api/tip-pool-runs", async (req, res) => {
    try {
      const { propertyId, businessDate } = req.query;
      const runs = await storage.getTipPoolRuns({
        propertyId: propertyId as string,
        businessDate: businessDate as string,
      });
      res.json(runs);
    } catch (error) {
      console.error("Get tip pool runs error:", error);
      res.status(500).json({ message: "Failed to get tip pool runs" });
    }
  });

  // Get single tip pool run
  app.get("/api/tip-pool-runs/:id", async (req, res) => {
    try {
      const run = await storage.getTipPoolRun(req.params.id);
      if (!run) {
        return res.status(404).json({ message: "Tip pool run not found" });
      }
      res.json(run);
    } catch (error) {
      console.error("Get tip pool run error:", error);
      res.status(500).json({ message: "Failed to get tip pool run" });
    }
  });

  // Create tip pool run (manual)
  app.post("/api/tip-pool-runs", async (req, res) => {
    try {
      const parsed = insertTipPoolRunSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid tip pool run data", errors: parsed.error.issues });
      }
      const run = await storage.createTipPoolRun(parsed.data);
      res.status(201).json(run);
    } catch (error) {
      console.error("Create tip pool run error:", error);
      res.status(500).json({ message: "Failed to create tip pool run" });
    }
  });

  // Execute tip pool settlement (calculate and distribute tips)
  app.post("/api/tip-pool-settlement", async (req, res) => {
    try {
      const { propertyId, businessDate, policyId, runById } = req.body;
      if (!propertyId || !businessDate || !policyId || !runById) {
        return res.status(400).json({ 
          message: "Property ID, business date, policy ID, and runner ID are required" 
        });
      }
      
      const result = await storage.runTipPoolSettlement(propertyId, businessDate, policyId, runById);
      res.status(201).json(result);
    } catch (error) {
      console.error("Tip pool settlement error:", error);
      res.status(500).json({ message: "Failed to run tip pool settlement" });
    }
  });

  // === TIP ALLOCATIONS ===

  // Get tip allocations for a run
  app.get("/api/tip-pool-runs/:runId/allocations", async (req, res) => {
    try {
      const allocations = await storage.getTipAllocations(req.params.runId);
      res.json(allocations);
    } catch (error) {
      console.error("Get tip allocations error:", error);
      res.status(500).json({ message: "Failed to get tip allocations" });
    }
  });

  // ============================================================================
  // LABOR ANALYTICS API ROUTES
  // ============================================================================

  // === LABOR SNAPSHOTS ===

  // Get labor snapshots
  app.get("/api/labor-snapshots", async (req, res) => {
    try {
      const { propertyId, rvcId, businessDate, startDate, endDate } = req.query;
      const snapshots = await storage.getLaborSnapshots({
        propertyId: propertyId as string,
        rvcId: rvcId as string,
        businessDate: businessDate as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json(snapshots);
    } catch (error) {
      console.error("Get labor snapshots error:", error);
      res.status(500).json({ message: "Failed to get labor snapshots" });
    }
  });

  // Calculate/refresh labor snapshot for a business date
  app.post("/api/labor-snapshots/calculate", async (req, res) => {
    try {
      const { propertyId, businessDate } = req.body;
      if (!propertyId || !businessDate) {
        return res.status(400).json({ message: "Property ID and business date are required" });
      }
      const snapshot = await storage.calculateLaborSnapshot(propertyId, businessDate);
      res.status(201).json(snapshot);
    } catch (error) {
      console.error("Calculate labor snapshot error:", error);
      res.status(500).json({ message: "Failed to calculate labor snapshot" });
    }
  });

  // === LABOR VS SALES REPORT ===

  // Get labor vs sales summary for a date range
  app.get("/api/reports/labor-vs-sales", async (req, res) => {
    try {
      const { propertyId, startDate, endDate } = req.query;
      if (!propertyId || !startDate || !endDate) {
        return res.status(400).json({ message: "Property ID, start date, and end date are required" });
      }
      
      // Get timecards directly instead of laborSnapshots (which aren't populated)
      const timecardData = await storage.getTimecards({
        propertyId: propertyId as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // Get the active overtime rule for this property to get configured multipliers
      const otRule = await storage.getActiveOvertimeRule(propertyId as string);
      const otMultiplier = otRule?.overtimeMultiplier ? parseFloat(otRule.overtimeMultiplier) : 1.5;
      const dtMultiplier = otRule?.doubleTimeMultiplier ? parseFloat(otRule.doubleTimeMultiplier) : 2.0;
      
      // Aggregate by business date
      const dailyData: Record<string, { laborHours: number; laborCost: number }> = {};
      
      for (const tc of timecardData) {
        const bd = tc.businessDate;
        // Skip timecards without a businessDate
        if (!bd) continue;
        
        if (!dailyData[bd]) {
          dailyData[bd] = { laborHours: 0, laborCost: 0 };
        }
        const hours = parseFloat(tc.totalHours || "0");
        const payRate = parseFloat(tc.payRate || "0");
        const regularHours = parseFloat(tc.regularHours || "0");
        const overtimeHours = parseFloat(tc.overtimeHours || "0");
        const doubleTimeHours = parseFloat(tc.doubleTimeHours || "0");
        
        dailyData[bd].laborHours += hours;
        // Calculate labor cost using configured multipliers from overtime rule
        dailyData[bd].laborCost += (regularHours * payRate) + (overtimeHours * payRate * otMultiplier) + (doubleTimeHours * payRate * dtMultiplier);
      }
      
      // Get sales data from checks (items rung on businessDate, not when check was closed)
      // Use efficient single-query storage method
      const checksData = await storage.getChecksByPropertyAndDateRange(
        propertyId as string,
        startDate as string,
        endDate as string
      );
      
      const salesByDate: Record<string, number> = {};
      for (const check of checksData) {
        const bd = check.businessDate;
        if (!bd) continue;
        
        if (!salesByDate[bd]) {
          salesByDate[bd] = 0;
        }
        salesByDate[bd] += parseFloat(check.subtotal || "0");
      }
      
      // Build summary
      const summary = {
        propertyId,
        startDate,
        endDate,
        totalSales: 0,
        totalLaborCost: 0,
        totalLaborHours: 0,
        laborCostPercentage: 0,
        dailyBreakdown: [] as any[],
      };
      
      // Get all dates in range
      const allDates = new Set([...Object.keys(dailyData), ...Object.keys(salesByDate)]);
      for (const bd of Array.from(allDates).sort()) {
        const sales = salesByDate[bd] || 0;
        const laborHours = dailyData[bd]?.laborHours || 0;
        const laborCost = dailyData[bd]?.laborCost || 0;
        
        summary.totalSales += sales;
        summary.totalLaborCost += laborCost;
        summary.totalLaborHours += laborHours;
        
        summary.dailyBreakdown.push({
          businessDate: bd,
          sales,
          laborCost,
          laborHours,
          laborPercentage: sales > 0 ? (laborCost / sales) * 100 : 0,
        });
      }
      
      summary.laborCostPercentage = summary.totalSales > 0 
        ? (summary.totalLaborCost / summary.totalSales) * 100 
        : 0;
      
      res.json(summary);
    } catch (error) {
      console.error("Labor vs sales report error:", error);
      res.status(500).json({ message: "Failed to generate labor vs sales report" });
    }
  });

  // === OVERTIME REPORT ===

  // Get overtime hours for a date range
  app.get("/api/reports/overtime", async (req, res) => {
    try {
      const { propertyId, startDate, endDate } = req.query;
      if (!propertyId || !startDate || !endDate) {
        return res.status(400).json({ message: "Property ID, start date, and end date are required" });
      }
      
      // Get timecards for the property within the date range
      const timecards = await storage.getTimecards({
        propertyId: propertyId as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // Group by employee and calculate overtime
      const employeeOvertime: Record<string, { 
        employeeId: string; 
        regularHours: number; 
        overtimeHours: number;
        doubleTimeHours: number;
      }> = {};
      
      for (const tc of timecards) {
        if (!employeeOvertime[tc.employeeId]) {
          employeeOvertime[tc.employeeId] = {
            employeeId: tc.employeeId,
            regularHours: 0,
            overtimeHours: 0,
            doubleTimeHours: 0,
          };
        }
        employeeOvertime[tc.employeeId].regularHours += parseFloat(tc.regularHours || "0");
        employeeOvertime[tc.employeeId].overtimeHours += parseFloat(tc.overtimeHours || "0");
        employeeOvertime[tc.employeeId].doubleTimeHours += parseFloat(tc.doubleTimeHours || "0");
      }
      
      const employees = Object.values(employeeOvertime).filter(e => e.overtimeHours > 0 || e.doubleTimeHours > 0);
      
      res.json({
        propertyId,
        startDate,
        endDate,
        totalRegularHours: employees.reduce((sum, e) => sum + e.regularHours, 0),
        totalOvertimeHours: employees.reduce((sum, e) => sum + e.overtimeHours, 0),
        totalDoubleTimeHours: employees.reduce((sum, e) => sum + e.doubleTimeHours, 0),
        employeesWithOvertime: employees,
      });
    } catch (error) {
      console.error("Overtime report error:", error);
      res.status(500).json({ message: "Failed to generate overtime report" });
    }
  });

  // === TIPS REPORT ===

  // Get tips summary for a date range
  app.get("/api/reports/tips", async (req, res) => {
    try {
      const { propertyId, startDate, endDate } = req.query;
      if (!propertyId || !startDate || !endDate) {
        return res.status(400).json({ message: "Property ID, start date, and end date are required" });
      }
      
      // Get all tip pool runs in the date range
      const runs = await storage.getTipPoolRuns({ propertyId: propertyId as string });
      const filteredRuns = runs.filter(r => 
        r.businessDate >= (startDate as string) && r.businessDate <= (endDate as string)
      );
      
      // Aggregate tip data
      const summary = {
        propertyId,
        startDate,
        endDate,
        totalTips: 0,
        runCount: filteredRuns.length,
        dailyBreakdown: [] as any[],
        employeeTotals: {} as Record<string, number>,
      };
      
      for (const run of filteredRuns) {
        const totalTips = parseFloat(run.totalTips || "0");
        summary.totalTips += totalTips;
        
        summary.dailyBreakdown.push({
          businessDate: run.businessDate,
          totalTips,
          status: run.status,
        });
        
        // Get allocations for this run
        const allocations = await storage.getTipAllocations(run.id);
        for (const alloc of allocations) {
          if (!summary.employeeTotals[alloc.employeeId]) {
            summary.employeeTotals[alloc.employeeId] = 0;
          }
          summary.employeeTotals[alloc.employeeId] += parseFloat(alloc.totalTips || "0");
        }
      }
      
      res.json(summary);
    } catch (error) {
      console.error("Tips report error:", error);
      res.status(500).json({ message: "Failed to generate tips report" });
    }
  });

  // === AUTO CLOCK-OUT ===
  
  // Process auto clock-out for a property when business date changes
  app.post("/api/time-punches/auto-clock-out", async (req, res) => {
    try {
      const { propertyId, triggeredBy } = req.body;
      
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }

      // Get property and check if auto clock-out is enabled
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      if (!property.autoClockOutEnabled) {
        return res.status(400).json({ message: "Auto clock-out is not enabled for this property" });
      }

      // Get all time punches for this property to find clocked-in employees
      const punches = await storage.getTimePunches({ propertyId });
      
      // Group punches by employee to find those still clocked in
      const employeePunches: Record<string, typeof punches> = {};
      for (const punch of punches) {
        if (!employeePunches[punch.employeeId]) {
          employeePunches[punch.employeeId] = [];
        }
        employeePunches[punch.employeeId].push(punch);
      }

      const now = new Date();
      const businessDate = resolveBusinessDate(now, property);
      const clockedOutEmployees: string[] = [];
      
      for (const [employeeId, empPunches] of Object.entries(employeePunches)) {
        // Sort by timestamp descending to get most recent first
        const sorted = [...empPunches].sort((a, b) => 
          new Date(b.actualTimestamp).getTime() - new Date(a.actualTimestamp).getTime()
        );
        
        // Find the most recent punch
        const mostRecent = sorted[0];
        if (mostRecent && mostRecent.punchType === "clock_in") {
          // This employee is clocked in - auto clock them out
          
          // End any active break first
          const activeBreak = await storage.getActiveBreak(employeeId);
          if (activeBreak) {
            const breakMinutes = Math.round((now.getTime() - new Date(activeBreak.startTime).getTime()) / 60000);
            await storage.updateBreakSession(activeBreak.id, {
              endTime: now,
              actualMinutes: breakMinutes,
            });
            // Recalculate timecard for the break's business date
            await storage.recalculateTimecard(employeeId, activeBreak.businessDate);
          }

          // Create clock-out punch with note indicating auto clock-out
          await storage.createTimePunch({
            propertyId,
            employeeId,
            punchType: "clock_out",
            actualTimestamp: now,
            businessDate,
            notes: "Auto clock-out: Business date change",
            source: "system",
          });

          // Recalculate timecard
          await storage.recalculateTimecard(employeeId, businessDate);
          
          clockedOutEmployees.push(employeeId);
        }
      }

      // Create audit log entry
      if (clockedOutEmployees.length > 0) {
        await storage.createAuditLog({
          action: "auto_clock_out",
          targetType: "time_punch",
          targetId: propertyId,
          employeeId: triggeredBy || null,
          details: {
            propertyId,
            employeesClockedOut: clockedOutEmployees.length,
            employeeIds: clockedOutEmployees,
            businessDate,
            timestamp: now.toISOString(),
          },
        });
      }

      res.json({
        success: true,
        clockedOutCount: clockedOutEmployees.length,
        employeeIds: clockedOutEmployees,
        message: clockedOutEmployees.length > 0 
          ? `Auto clocked out ${clockedOutEmployees.length} employee(s)`
          : "No employees were clocked in",
      });
    } catch (error) {
      console.error("Auto clock-out error:", error);
      res.status(500).json({ message: "Failed to process auto clock-out" });
    }
  });

  // === CLOCKED IN STATUS REPORT ===
  
  // Get all employees currently clocked in
  app.get("/api/reports/clocked-in-status", async (req, res) => {
    try {
      const { propertyId } = req.query;
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      
      // Get all time punches for this property
      const punches = await storage.getTimePunches({ propertyId: propertyId as string });
      
      // Group punches by employee and business date to find those still clocked in
      const employeePunches: Record<string, typeof punches> = {};
      for (const punch of punches) {
        const key = `${punch.employeeId}`;
        if (!employeePunches[key]) {
          employeePunches[key] = [];
        }
        employeePunches[key].push(punch);
      }
      
      // Find employees who are currently clocked in (have clock_in without matching clock_out)
      const clockedInEmployees: Array<{
        employeeId: string;
        clockInTime: Date;
        businessDate: string;
        jobCodeId: string | null;
        durationMinutes: number;
        isOnBreak: boolean;
        breakType?: string;
      }> = [];
      
      for (const [employeeId, empPunches] of Object.entries(employeePunches)) {
        // Sort by timestamp descending to get most recent first
        const sorted = [...empPunches].sort((a, b) => 
          new Date(b.actualTimestamp).getTime() - new Date(a.actualTimestamp).getTime()
        );
        
        // Find the most recent punch
        const mostRecent = sorted[0];
        if (mostRecent && mostRecent.punchType === "clock_in") {
          // This employee is currently clocked in
          const clockInTime = new Date(mostRecent.actualTimestamp);
          const now = new Date();
          const durationMinutes = Math.floor((now.getTime() - clockInTime.getTime()) / (1000 * 60));
          
          // Check if on break - look for break_start without break_end
          const breakPunches = sorted.filter(p => p.punchType === "break_start" || p.punchType === "break_end");
          let isOnBreak = false;
          let breakType: string | undefined;
          
          if (breakPunches.length > 0) {
            const mostRecentBreak = breakPunches[0];
            if (mostRecentBreak.punchType === "break_start") {
              isOnBreak = true;
              // Try to get break type from notes or default to "unpaid"
              breakType = mostRecentBreak.notes || "unpaid";
            }
          }
          
          clockedInEmployees.push({
            employeeId,
            clockInTime,
            businessDate: mostRecent.businessDate,
            jobCodeId: mostRecent.jobCodeId,
            durationMinutes,
            isOnBreak,
            breakType,
          });
        }
      }
      
      // Get employee details for the clocked in employees
      const employeeIds = clockedInEmployees.map(e => e.employeeId);
      const employees = await storage.getEmployees();
      const employeeMap = new Map(employees.map(e => [e.id, e]));
      
      // Get job codes for display
      const jobCodes = await storage.getJobCodes();
      const jobCodeMap = new Map(jobCodes.map(j => [j.id, j]));
      
      // Build response with employee names and job info
      const result = clockedInEmployees.map(ce => {
        const employee = employeeMap.get(ce.employeeId);
        const jobCode = ce.jobCodeId ? jobCodeMap.get(ce.jobCodeId) : null;
        
        return {
          ...ce,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : "Unknown",
          employeeNumber: employee?.employeeNumber || "",
          jobName: jobCode?.name || "N/A",
        };
      });
      
      // Sort by clock in time (earliest first)
      result.sort((a, b) => new Date(a.clockInTime).getTime() - new Date(b.clockInTime).getTime());
      
      res.json({
        propertyId,
        timestamp: new Date().toISOString(),
        totalClockedIn: result.length,
        onBreak: result.filter(e => e.isOnBreak).length,
        working: result.filter(e => !e.isOnBreak).length,
        employees: result,
      });
    } catch (error) {
      console.error("Clocked in status report error:", error);
      res.status(500).json({ message: "Failed to generate clocked in status report" });
    }
  });

  // ============================================================================
  // OVERTIME RULES - Property-specific labor law configuration
  // ============================================================================

  app.get("/api/overtime-rules", async (req, res) => {
    try {
      const { propertyId } = req.query;
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      const rules = await storage.getOvertimeRules(propertyId as string);
      res.json(rules);
    } catch (error) {
      console.error("Get overtime rules error:", error);
      res.status(500).json({ message: "Failed to get overtime rules" });
    }
  });

  app.get("/api/overtime-rules/:id", async (req, res) => {
    try {
      const rule = await storage.getOvertimeRule(req.params.id);
      if (!rule) {
        return res.status(404).json({ message: "Overtime rule not found" });
      }
      res.json(rule);
    } catch (error) {
      console.error("Get overtime rule error:", error);
      res.status(500).json({ message: "Failed to get overtime rule" });
    }
  });

  app.get("/api/overtime-rules/active/:propertyId", async (req, res) => {
    try {
      const rule = await storage.getActiveOvertimeRule(req.params.propertyId);
      res.json(rule || null);
    } catch (error) {
      console.error("Get active overtime rule error:", error);
      res.status(500).json({ message: "Failed to get active overtime rule" });
    }
  });

  app.post("/api/overtime-rules", async (req, res) => {
    try {
      const rule = await storage.createOvertimeRule(req.body);
      res.status(201).json(rule);
    } catch (error) {
      console.error("Create overtime rule error:", error);
      res.status(500).json({ message: "Failed to create overtime rule" });
    }
  });

  app.patch("/api/overtime-rules/:id", async (req, res) => {
    try {
      const rule = await storage.updateOvertimeRule(req.params.id, req.body);
      if (!rule) {
        return res.status(404).json({ message: "Overtime rule not found" });
      }
      res.json(rule);
    } catch (error) {
      console.error("Update overtime rule error:", error);
      res.status(500).json({ message: "Failed to update overtime rule" });
    }
  });

  app.delete("/api/overtime-rules/:id", async (req, res) => {
    try {
      const success = await storage.deleteOvertimeRule(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Overtime rule not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete overtime rule error:", error);
      res.status(500).json({ message: "Failed to delete overtime rule" });
    }
  });

  // ============================================================================
  // PAYMENT PROCESSORS (Admin Configuration)
  // ============================================================================

  app.get("/api/payment-processors", async (req, res) => {
    try {
      const propertyId = req.query.propertyId as string | undefined;
      const processors = await storage.getPaymentProcessors(propertyId);
      res.json(processors);
    } catch (error) {
      console.error("Get payment processors error:", error);
      res.status(500).json({ message: "Failed to get payment processors" });
    }
  });

  app.get("/api/payment-processors/gateway-types", async (req, res) => {
    try {
      const types = getRegisteredGatewayTypes();
      res.json(types);
    } catch (error) {
      console.error("Get gateway types error:", error);
      res.status(500).json({ message: "Failed to get gateway types" });
    }
  });

  app.get("/api/payment-processors/:id", async (req, res) => {
    try {
      const processor = await storage.getPaymentProcessor(req.params.id);
      if (!processor) {
        return res.status(404).json({ message: "Payment processor not found" });
      }
      res.json(processor);
    } catch (error) {
      console.error("Get payment processor error:", error);
      res.status(500).json({ message: "Failed to get payment processor" });
    }
  });

  app.post("/api/payment-processors", async (req, res) => {
    try {
      const parsed = insertPaymentProcessorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payment processor data", errors: parsed.error.flatten().fieldErrors });
      }
      const processor = await storage.createPaymentProcessor(parsed.data);
      res.status(201).json(processor);
    } catch (error) {
      console.error("Create payment processor error:", error);
      res.status(500).json({ message: "Failed to create payment processor" });
    }
  });

  app.patch("/api/payment-processors/:id", async (req, res) => {
    try {
      const parsed = insertPaymentProcessorSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payment processor data", errors: parsed.error.flatten().fieldErrors });
      }
      const processor = await storage.updatePaymentProcessor(req.params.id, parsed.data);
      if (!processor) {
        return res.status(404).json({ message: "Payment processor not found" });
      }
      res.json(processor);
    } catch (error) {
      console.error("Update payment processor error:", error);
      res.status(500).json({ message: "Failed to update payment processor" });
    }
  });

  app.delete("/api/payment-processors/:id", async (req, res) => {
    try {
      const success = await storage.deletePaymentProcessor(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Payment processor not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete payment processor error:", error);
      res.status(500).json({ message: "Failed to delete payment processor" });
    }
  });

  app.post("/api/payment-processors/:id/test-connection", async (req, res) => {
    try {
      const processor = await storage.getPaymentProcessor(req.params.id);
      if (!processor) {
        return res.status(404).json({ message: "Payment processor not found" });
      }

      if (!isGatewayTypeSupported(processor.gatewayType)) {
        return res.status(400).json({ message: `Unsupported gateway type: ${processor.gatewayType}` });
      }

      const requiredKeys = getRequiredCredentialKeys(processor.gatewayType);
      const credentials = resolveCredentials(processor.credentialKeyPrefix, requiredKeys);
      const settings = (processor.gatewaySettings as Record<string, any>) || {};
      const environment = (processor.environment as "sandbox" | "production") || "sandbox";

      const adapter = createPaymentAdapter(processor.gatewayType, credentials, settings, environment);
      if (!adapter.testConnection) {
        return res.status(400).json({ message: "Gateway does not support connection testing" });
      }

      const result = await adapter.testConnection();
      res.json(result);
    } catch (error) {
      console.error("Test connection error:", error);
      res.status(500).json({ message: "Failed to test connection", success: false });
    }
  });

  // ============================================================================
  // PAYMENT GATEWAY OPERATIONS (Authorize, Capture, Void, Refund, Tip Adjust)
  // ============================================================================

  app.post("/api/payments/authorize", async (req, res) => {
    try {
      const { propertyId, amount, orderId, employeeId, workstationId, currency } = req.body;

      if (!propertyId || !amount) {
        return res.status(400).json({ message: "Property ID and amount required" });
      }

      const processor = await storage.getActivePaymentProcessor(propertyId);
      if (!processor) {
        return res.status(400).json({ message: "No active payment processor configured for this property" });
      }

      const requiredKeys = getRequiredCredentialKeys(processor.gatewayType);
      const credentials = resolveCredentials(processor.credentialKeyPrefix, requiredKeys);
      
      // Validate all required credentials are present
      const missingKeys = requiredKeys.filter(key => !credentials[key]);
      if (missingKeys.length > 0) {
        return res.status(400).json({ 
          message: `Missing required credentials: ${missingKeys.map(k => `${processor.credentialKeyPrefix}_${k}`).join(', ')}` 
        });
      }

      const settings = (processor.gatewaySettings as Record<string, any>) || {};
      const environment = (processor.environment as "sandbox" | "production") || "sandbox";

      const adapter = createPaymentAdapter(processor.gatewayType, credentials, settings, environment);

      const result = await adapter.authorize({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency || "usd",
        orderId,
        employeeId,
        workstationId,
      });

      // Record the transaction - use responseMessage for errors since dedicated error fields don't exist
      const transaction = await storage.createPaymentTransaction({
        paymentProcessorId: processor.id,
        gatewayTransactionId: result.transactionId || null,
        authCode: result.authCode || null,
        referenceNumber: result.referenceNumber || null,
        cardBrand: result.cardBrand || null,
        cardLast4: result.cardLast4 || null,
        entryMode: result.entryMode || null,
        authAmount: Math.round(amount * 100),
        status: result.success ? "authorized" : "declined",
        transactionType: "auth",
        responseCode: result.success ? result.responseCode || null : result.errorCode || null,
        responseMessage: result.success ? result.responseMessage || null : result.errorMessage || null,
      });

      res.json({
        success: result.success,
        transactionId: transaction.id,
        gatewayTransactionId: result.transactionId,
        authCode: result.authCode,
        cardBrand: result.cardBrand,
        cardLast4: result.cardLast4,
        errorMessage: result.errorMessage,
        declined: result.declined,
        declineReason: result.declineReason,
      });
    } catch (error) {
      console.error("Authorization error:", error);
      res.status(500).json({ message: "Authorization failed", success: false });
    }
  });

  app.post("/api/payments/capture", async (req, res) => {
    try {
      const { transactionId, amount, tipAmount } = req.body;

      if (!transactionId) {
        return res.status(400).json({ message: "Transaction ID required" });
      }

      const transaction = await storage.getPaymentTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      const processor = await storage.getPaymentProcessor(transaction.paymentProcessorId);
      if (!processor) {
        return res.status(400).json({ message: "Payment processor not found" });
      }

      const requiredKeys = getRequiredCredentialKeys(processor.gatewayType);
      const credentials = resolveCredentials(processor.credentialKeyPrefix, requiredKeys);
      
      // Validate all required credentials are present
      const missingKeys = requiredKeys.filter(key => !credentials[key]);
      if (missingKeys.length > 0) {
        return res.status(400).json({ 
          message: `Missing required credentials: ${missingKeys.map(k => `${processor.credentialKeyPrefix}_${k}`).join(', ')}` 
        });
      }

      const settings = (processor.gatewaySettings as Record<string, any>) || {};
      const environment = (processor.environment as "sandbox" | "production") || "sandbox";

      const adapter = createPaymentAdapter(processor.gatewayType, credentials, settings, environment);

      // Calculate total capture amount (base amount + tip)
      const baseAmount = amount ? Math.round(amount * 100) : transaction.authAmount;
      const tipAmountCents = tipAmount ? Math.round(tipAmount * 100) : 0;
      const totalCaptureAmount = baseAmount + tipAmountCents;

      const result = await adapter.capture({
        transactionId: transaction.gatewayTransactionId || "",
        amount: totalCaptureAmount,
        tipAmount: tipAmountCents, // For reference/logging
      });

      // Update the transaction record
      await storage.updatePaymentTransaction(transactionId, {
        status: result.success ? "captured" : "capture_failed",
        captureAmount: result.success ? totalCaptureAmount : null,
        tipAmount: tipAmountCents,
        responseCode: result.success ? result.responseCode || null : result.errorCode || null,
        responseMessage: result.success ? result.responseMessage || null : result.errorMessage || null,
      });

      res.json({
        success: result.success,
        transactionId,
        capturedAmount: result.capturedAmount,
        errorMessage: result.errorMessage,
      });
    } catch (error) {
      console.error("Capture error:", error);
      res.status(500).json({ message: "Capture failed", success: false });
    }
  });

  app.post("/api/payments/void", async (req, res) => {
    try {
      const { transactionId, reason } = req.body;

      if (!transactionId) {
        return res.status(400).json({ message: "Transaction ID required" });
      }

      const transaction = await storage.getPaymentTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      const processor = await storage.getPaymentProcessor(transaction.paymentProcessorId);
      if (!processor) {
        return res.status(400).json({ message: "Payment processor not found" });
      }

      const requiredKeys = getRequiredCredentialKeys(processor.gatewayType);
      const credentials = resolveCredentials(processor.credentialKeyPrefix, requiredKeys);
      
      // Validate all required credentials are present
      const missingKeys = requiredKeys.filter(key => !credentials[key]);
      if (missingKeys.length > 0) {
        return res.status(400).json({ 
          message: `Missing required credentials: ${missingKeys.map(k => `${processor.credentialKeyPrefix}_${k}`).join(', ')}` 
        });
      }

      const settings = (processor.gatewaySettings as Record<string, any>) || {};
      const environment = (processor.environment as "sandbox" | "production") || "sandbox";

      const adapter = createPaymentAdapter(processor.gatewayType, credentials, settings, environment);

      const result = await adapter.void({
        transactionId: transaction.gatewayTransactionId || "",
        reason,
      });

      // Update the transaction record
      await storage.updatePaymentTransaction(transactionId, {
        status: result.success ? "voided" : "void_failed",
        responseCode: result.success ? result.responseCode || null : result.errorCode || null,
        responseMessage: result.success ? result.responseMessage || null : result.errorMessage || null,
      });

      res.json({
        success: result.success,
        transactionId,
        errorMessage: result.errorMessage,
      });
    } catch (error) {
      console.error("Void error:", error);
      res.status(500).json({ message: "Void failed", success: false });
    }
  });

  app.post("/api/payments/refund", async (req, res) => {
    try {
      const { transactionId, amount, reason } = req.body;

      if (!transactionId || !amount) {
        return res.status(400).json({ message: "Transaction ID and amount required" });
      }

      const originalTransaction = await storage.getPaymentTransaction(transactionId);
      if (!originalTransaction) {
        return res.status(404).json({ message: "Original transaction not found" });
      }

      const processor = await storage.getPaymentProcessor(originalTransaction.paymentProcessorId);
      if (!processor) {
        return res.status(400).json({ message: "Payment processor not found" });
      }

      const requiredKeys = getRequiredCredentialKeys(processor.gatewayType);
      const credentials = resolveCredentials(processor.credentialKeyPrefix, requiredKeys);
      
      // Validate all required credentials are present
      const missingKeys = requiredKeys.filter(key => !credentials[key]);
      if (missingKeys.length > 0) {
        return res.status(400).json({ 
          message: `Missing required credentials: ${missingKeys.map(k => `${processor.credentialKeyPrefix}_${k}`).join(', ')}` 
        });
      }

      const settings = (processor.gatewaySettings as Record<string, any>) || {};
      const environment = (processor.environment as "sandbox" | "production") || "sandbox";

      const adapter = createPaymentAdapter(processor.gatewayType, credentials, settings, environment);

      const refundAmountCents = Math.round(amount * 100);

      const result = await adapter.refund({
        transactionId: originalTransaction.gatewayTransactionId || "",
        amount: refundAmountCents,
        reason,
      });

      // Create a new refund transaction record
      const refundTransaction = await storage.createPaymentTransaction({
        paymentProcessorId: processor.id,
        gatewayTransactionId: result.transactionId || null,
        authCode: null,
        referenceNumber: originalTransaction.gatewayTransactionId,
        cardBrand: originalTransaction.cardBrand,
        cardLast4: originalTransaction.cardLast4,
        entryMode: null,
        authAmount: refundAmountCents,
        status: result.success ? "refunded" : "refund_failed",
        transactionType: "refund",
        responseCode: result.success ? result.responseCode || null : result.errorCode || null,
        responseMessage: result.success ? result.responseMessage || null : result.errorMessage || null,
      });

      res.json({
        success: result.success,
        transactionId: refundTransaction.id,
        refundedAmount: result.refundedAmount,
        errorMessage: result.errorMessage,
      });
    } catch (error) {
      console.error("Refund error:", error);
      res.status(500).json({ message: "Refund failed", success: false });
    }
  });

  app.post("/api/payments/tip-adjust", async (req, res) => {
    try {
      const { transactionId, tipAmount } = req.body;

      if (!transactionId || tipAmount === undefined) {
        return res.status(400).json({ message: "Transaction ID and tip amount required" });
      }

      const transaction = await storage.getPaymentTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      const processor = await storage.getPaymentProcessor(transaction.paymentProcessorId);
      if (!processor) {
        return res.status(400).json({ message: "Payment processor not found" });
      }

      if (!processor.supportsTipAdjust) {
        return res.status(400).json({ message: "Tip adjustment not supported by this processor" });
      }

      const requiredKeys = getRequiredCredentialKeys(processor.gatewayType);
      const credentials = resolveCredentials(processor.credentialKeyPrefix, requiredKeys);
      
      // Validate all required credentials are present
      const missingKeys = requiredKeys.filter(key => !credentials[key]);
      if (missingKeys.length > 0) {
        return res.status(400).json({ 
          message: `Missing required credentials: ${missingKeys.map(k => `${processor.credentialKeyPrefix}_${k}`).join(', ')}` 
        });
      }

      const settings = (processor.gatewaySettings as Record<string, any>) || {};
      const environment = (processor.environment as "sandbox" | "production") || "sandbox";

      const adapter = createPaymentAdapter(processor.gatewayType, credentials, settings, environment);

      if (!adapter.tipAdjust) {
        return res.status(400).json({ message: "Gateway does not support tip adjustment" });
      }

      const tipAmountCents = Math.round(tipAmount * 100);

      const result = await adapter.tipAdjust({
        transactionId: transaction.gatewayTransactionId || "",
        tipAmount: tipAmountCents,
      });

      // Update the transaction record
      await storage.updatePaymentTransaction(transactionId, {
        tipAmount: tipAmountCents,
        captureAmount: result.newTotalAmount,
        responseCode: result.success ? result.responseCode || null : result.errorCode || null,
        responseMessage: result.success ? result.responseMessage || null : result.errorMessage || null,
      });

      res.json({
        success: result.success,
        transactionId,
        newTotalAmount: result.newTotalAmount,
        tipAmount: result.tipAmount,
        errorMessage: result.errorMessage,
      });
    } catch (error) {
      console.error("Tip adjust error:", error);
      res.status(500).json({ message: "Tip adjustment failed", success: false });
    }
  });

  // Get transaction status
  app.get("/api/payments/transactions/:id", async (req, res) => {
    try {
      const transaction = await storage.getPaymentTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      res.json(transaction);
    } catch (error) {
      console.error("Get transaction error:", error);
      res.status(500).json({ message: "Failed to get transaction" });
    }
  });

  // Get transactions for a check payment
  app.get("/api/payments/check-payment/:checkPaymentId/transactions", async (req, res) => {
    try {
      const transactions = await storage.getPaymentTransactions(req.params.checkPaymentId);
      res.json(transactions);
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({ message: "Failed to get transactions" });
    }
  });

  // ============================================================================
  // POS CARD PAYMENT - Unified endpoint for processing card payments from POS
  // Routes through the property's configured payment processor
  // ============================================================================

  // Get payment processor config for a property (for frontend to know what mode we're in)
  app.get("/api/pos/payment-config/:propertyId", async (req, res) => {
    try {
      const processor = await storage.getActivePaymentProcessor(req.params.propertyId);
      
      if (!processor) {
        return res.json({
          configured: false,
          mode: "demo",
          message: "No payment processor configured - running in demo mode",
        });
      }

      // Check if credentials are available
      const requiredKeys = getRequiredCredentialKeys(processor.gatewayType);
      const credentials = resolveCredentials(processor.credentialKeyPrefix, requiredKeys);
      const missingKeys = requiredKeys.filter(key => !credentials[key]);
      const credentialsConfigured = missingKeys.length === 0;

      res.json({
        configured: true,
        credentialsConfigured,
        processorId: processor.id,
        processorName: processor.name,
        gatewayType: processor.gatewayType,
        environment: processor.environment || "sandbox",
        mode: credentialsConfigured ? (processor.environment === "production" ? "live" : "test") : "demo",
        supportsTokenization: processor.supportsTokenization,
        supportsTipAdjust: processor.supportsTipAdjust,
        supportsPartialAuth: processor.supportsPartialAuth,
      });
    } catch (error) {
      console.error("Get payment config error:", error);
      res.status(500).json({ message: "Failed to get payment config" });
    }
  });

  // Process a card payment from the POS
  // This is the main endpoint the POS frontend calls when processing a credit/debit card
  app.post("/api/pos/process-card-payment", async (req, res) => {
    try {
      const { checkId, tenderId, amount, cardData, employeeId, workstationId, authOnly } = req.body;
      const isAuthOnly = authOnly === true; // Pre-auth mode for full-service

      if (!checkId || !tenderId || !amount) {
        return res.status(400).json({ success: false, message: "Check ID, tender ID, and amount required" });
      }

      // Get the check to find the property
      const check = await storage.getCheck(checkId);
      if (!check) {
        return res.status(404).json({ success: false, message: "Check not found" });
      }

      // Get the RVC to find the property
      const rvc = await storage.getRvc(check.rvcId);
      if (!rvc) {
        return res.status(404).json({ success: false, message: "RVC not found" });
      }

      const propertyId = rvc.propertyId;

      // Get the tender to check if it has a linked processor
      const tender = await storage.getTender(tenderId);
      if (!tender) {
        return res.status(404).json({ success: false, message: "Tender not found" });
      }

      // Get the payment processor - either from tender or property default
      let processor = null;
      if (tender.paymentProcessorId) {
        processor = await storage.getPaymentProcessor(tender.paymentProcessorId);
      }
      if (!processor) {
        processor = await storage.getActivePaymentProcessor(propertyId);
      }

      // If no processor configured, run in demo mode
      if (!processor) {
        // Demo mode - simulate approval based on test card patterns
        const cleanCardNumber = cardData?.cardNumber?.replace(/\s/g, "") || "";
        const isDeclineCard = cleanCardNumber.startsWith("4000000000000002");
        
        if (isDeclineCard) {
          return res.json({
            success: false,
            declined: true,
            declineReason: "Insufficient funds (demo decline)",
            message: "Card declined",
          });
        }

        // Demo approval
        return res.json({
          success: true,
          approved: true,
          transactionId: `DEMO-${Date.now()}`,
          authCode: "DEMO",
          cardLast4: cleanCardNumber.slice(-4) || "0000",
          cardBrand: cleanCardNumber.startsWith("4") ? "visa" : cleanCardNumber.startsWith("5") ? "mastercard" : "card",
          message: isAuthOnly ? "Pre-authorized (demo mode)" : "Payment approved (demo mode)",
          status: isAuthOnly ? "authorized" : "captured",
          demoMode: true,
        });
      }

      // Check if credentials are configured
      const requiredKeys = getRequiredCredentialKeys(processor.gatewayType);
      const credentials = resolveCredentials(processor.credentialKeyPrefix, requiredKeys);
      const missingKeys = requiredKeys.filter(key => !credentials[key]);

      // If credentials not configured, fall back to demo mode
      if (missingKeys.length > 0) {
        const cleanCardNumber = cardData?.cardNumber?.replace(/\s/g, "") || "";
        const isDeclineCard = cleanCardNumber.startsWith("4000000000000002");
        
        if (isDeclineCard) {
          return res.json({
            success: false,
            declined: true,
            declineReason: "Insufficient funds (demo decline)",
            message: "Card declined",
          });
        }

        return res.json({
          success: true,
          approved: true,
          transactionId: `DEMO-${Date.now()}`,
          authCode: "DEMO",
          cardLast4: cleanCardNumber.slice(-4) || "0000",
          cardBrand: cleanCardNumber.startsWith("4") ? "visa" : cleanCardNumber.startsWith("5") ? "mastercard" : "card",
          message: isAuthOnly ? `Pre-authorized (credentials not configured for ${processor.name})` : `Payment approved (credentials not configured for ${processor.name})`,
          status: isAuthOnly ? "authorized" : "captured",
          demoMode: true,
        });
      }

      // Production/test mode with real processor
      const settings = (processor.gatewaySettings as Record<string, any>) || {};
      const environment = (processor.environment as "sandbox" | "production") || "sandbox";

      // For sandbox/test environment, we can simulate without hitting the real gateway
      if (environment === "sandbox") {
        const cleanCardNumber = cardData?.cardNumber?.replace(/\s/g, "") || "";
        const isDeclineCard = cleanCardNumber.startsWith("4000000000000002");
        
        // Create a transaction record for test mode
        const transactionStatus = isDeclineCard ? "declined" : (isAuthOnly ? "authorized" : "captured");
        const transactionType = isAuthOnly ? "auth" : "sale";
        const transaction = await storage.createPaymentTransaction({
          paymentProcessorId: processor.id,
          gatewayTransactionId: `TEST-${Date.now()}`,
          authCode: isDeclineCard ? null : "TEST123",
          cardBrand: cleanCardNumber.startsWith("4") ? "visa" : cleanCardNumber.startsWith("5") ? "mastercard" : "card",
          cardLast4: cleanCardNumber.slice(-4) || "0000",
          entryMode: "manual",
          authAmount: Math.round(amount * 100),
          captureAmount: isAuthOnly ? null : Math.round(amount * 100), // Only set if captured
          status: transactionStatus,
          transactionType: transactionType,
          responseCode: isDeclineCard ? "05" : "00",
          responseMessage: isDeclineCard ? "Declined" : (isAuthOnly ? "Pre-authorized" : "Approved"),
          employeeId,
          workstationId,
          capturedAt: isAuthOnly ? null : new Date(), // Only set if captured
        });

        if (isDeclineCard) {
          return res.json({
            success: false,
            declined: true,
            declineReason: "Insufficient funds (test decline card)",
            message: "Card declined",
            transactionId: transaction.id,
          });
        }

        return res.json({
          success: true,
          approved: true,
          transactionId: transaction.id,
          gatewayTransactionId: transaction.gatewayTransactionId,
          authCode: transaction.authCode,
          cardLast4: transaction.cardLast4,
          cardBrand: transaction.cardBrand,
          message: isAuthOnly ? `Pre-authorized (${processor.gatewayType} test mode)` : `Payment approved (${processor.gatewayType} test mode)`,
          status: isAuthOnly ? "authorized" : "captured",
          testMode: true,
        });
      }

      // Production mode requires tokenized payment data, not raw card numbers
      // This endpoint is for demo/test purposes only
      // In production, integrate processor-specific tokenization:
      // - Stripe: Use Stripe Elements to get PaymentMethod ID
      // - Elavon: Use Converge hosted payment page to get token
      // - Others: Use their respective secure tokenization SDKs
      
      // For now, reject production requests that contain raw card data
      if (cardData?.cardNumber) {
        return res.status(400).json({
          success: false,
          message: "Production mode requires tokenized payment data. Raw card numbers are not accepted for PCI compliance.",
          requiresTokenization: true,
          gatewayType: processor.gatewayType,
        });
      }

      // If we get here with a paymentToken (future implementation), we can process it
      const { paymentToken } = req.body;
      if (!paymentToken) {
        return res.status(400).json({
          success: false,
          message: "Payment token required for production transactions. Please configure payment terminal integration.",
          requiresTokenization: true,
          gatewayType: processor.gatewayType,
        });
      }

      // Future: Process tokenized payment through adapter
      // const adapter = createPaymentAdapter(processor.gatewayType, credentials, settings, environment);
      // const result = await adapter.authorize({ ... paymentToken ... });
      
      return res.status(501).json({
        success: false,
        message: "Production card processing requires payment terminal or tokenization integration. Contact support for setup.",
        gatewayType: processor.gatewayType,
      });

    } catch (error) {
      console.error("POS card payment error:", error);
      res.status(500).json({ success: false, message: "Payment processing failed" });
    }
  });

  // Capture an authorized payment with tip
  // Used for full-service restaurant flow where tip is added after authorization
  app.post("/api/pos/capture-with-tip", async (req, res) => {
    try {
      const { checkPaymentId, tipAmount = 0, employeeId } = req.body;

      if (!checkPaymentId) {
        return res.status(400).json({ success: false, message: "Check payment ID required" });
      }

      // Get the check payment
      const payments = await storage.getAllPayments();
      const payment = payments.find(p => p.id === checkPaymentId);
      if (!payment) {
        return res.status(404).json({ success: false, message: "Payment not found" });
      }

      if (payment.paymentStatus !== "authorized") {
        return res.status(400).json({ success: false, message: "Payment is not in authorized state" });
      }

      // Get the linked payment transaction
      let transaction = null;
      if (payment.paymentTransactionId) {
        transaction = await storage.getPaymentTransaction(payment.paymentTransactionId);
      }

      // Calculate final capture amount (original auth + tip)
      const originalAmount = parseFloat(payment.amount || "0");
      const tipValue = parseFloat(tipAmount) || 0;
      const finalAmount = originalAmount + tipValue;

      // For demo/test mode, just update the records
      // In production, this would call the payment gateway's capture endpoint
      if (transaction) {
        // Update the transaction record
        await storage.updatePaymentTransaction(transaction.id, {
          status: "captured",
          captureAmount: Math.round(finalAmount * 100),
          tipAmount: Math.round(tipValue * 100),
          capturedAt: new Date(),
        });
      }

      // Update the check payment record
      await storage.updateCheckPayment(checkPaymentId, {
        amount: finalAmount.toString(),
        tipAmount: tipValue.toString(),
        paymentStatus: "completed",
      });

      // Recalculate check totals
      await recalculateCheckTotals(payment.checkId);

      // Check if check should be closed
      const check = await storage.getCheck(payment.checkId);
      if (check) {
        const allPayments = await storage.getPayments(payment.checkId);
        const total = parseFloat(check.total || "0");
        const paidAmount = allPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

        if (paidAmount >= total - 0.01) {
          // Close the check
          await storage.updateCheck(payment.checkId, { status: "closed", closedAt: new Date() });
        }
      }

      res.json({
        success: true,
        message: "Payment captured with tip",
        originalAmount,
        tipAmount: tipValue,
        finalAmount,
        checkPaymentId,
      });

    } catch (error) {
      console.error("Capture with tip error:", error);
      res.status(500).json({ success: false, message: "Failed to capture payment" });
    }
  });

  // Record payment from external standalone terminal (Elavon, etc.)
  // POS does NOT handle card data - just records the transaction result
  app.post("/api/pos/record-external-payment", async (req, res) => {
    try {
      const { 
        checkId, 
        tenderId, 
        totalCharged, 
        tipAmount = "0", 
        approvalCode, 
        last4, 
        employeeId 
      } = req.body;

      if (!checkId || !tenderId || !totalCharged || !approvalCode) {
        return res.status(400).json({ 
          success: false, 
          message: "Check ID, tender ID, total charged, and approval code are required" 
        });
      }

      const total = parseFloat(totalCharged);
      const tip = parseFloat(tipAmount) || 0;
      
      if (isNaN(total) || total <= 0) {
        return res.status(400).json({ success: false, message: "Total charged must be a valid positive number" });
      }
      if (isNaN(tip) || tip < 0) {
        return res.status(400).json({ success: false, message: "Tip amount must be zero or positive" });
      }

      // Get the check
      const check = await storage.getCheck(checkId);
      if (!check) {
        return res.status(404).json({ success: false, message: "Check not found" });
      }

      // Get the tender for name
      const tender = await storage.getTender(tenderId);
      const tenderName = tender?.name || "Card";

      // Create the check payment record (no payment transaction needed for external terminal)
      // The external terminal already processed the full payment - we're just recording it
      // Note: We store approval code and last4 in paymentTransactionId field for reference
      const externalRef = last4 ? `EXT:${approvalCode}:${last4}` : `EXT:${approvalCode}`;
      const checkPayment = await storage.createPayment({
        checkId,
        tenderId,
        tenderName,
        amount: total.toString(),
        tipAmount: tip.toString(),
        paymentStatus: "completed",
        paymentTransactionId: externalRef, // Store reference info here
        employeeId: employeeId || null,
      });

      // Recalculate check totals
      await recalculateCheckTotals(checkId);

      // Check if check should be closed
      const updatedCheck = await storage.getCheck(checkId);
      if (updatedCheck) {
        const allPayments = await storage.getPayments(checkId);
        const checkTotal = parseFloat(updatedCheck.total || "0");
        const paidAmount = allPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

        if (paidAmount >= checkTotal - 0.01) {
          await storage.updateCheck(checkId, { status: "closed", closedAt: new Date() });
        }
      }

      res.json({
        success: true,
        message: "External terminal payment recorded",
        paymentId: checkPayment.id,
        totalCharged: total,
        tipAmount: tip,
        approvalCode,
      });

    } catch (error) {
      console.error("Record external payment error:", error);
      res.status(500).json({ success: false, message: "Failed to record external payment" });
    }
  });

  // ============================================================================
  // TERMINAL DEVICES - EMV Card Reader Management
  // ============================================================================

  // Get terminal device metadata (models, connection types, statuses)
  app.get("/api/terminal-devices/metadata", async (req, res) => {
    res.json({
      models: TERMINAL_MODELS,
      connectionTypes: TERMINAL_CONNECTION_TYPES,
      statuses: TERMINAL_DEVICE_STATUSES,
    });
  });

  // Get all terminal devices for a property
  app.get("/api/terminal-devices", async (req, res) => {
    try {
      const { propertyId } = req.query;
      const devices = await storage.getTerminalDevices(propertyId as string);
      res.json(devices);
    } catch (error) {
      console.error("Get terminal devices error:", error);
      res.status(500).json({ message: "Failed to get terminal devices" });
    }
  });

  // Get terminal devices for a specific workstation
  app.get("/api/terminal-devices/workstation/:workstationId", async (req, res) => {
    try {
      const devices = await storage.getTerminalDevicesByWorkstation(req.params.workstationId);
      res.json(devices);
    } catch (error) {
      console.error("Get workstation terminal devices error:", error);
      res.status(500).json({ message: "Failed to get terminal devices" });
    }
  });

  // Get a single terminal device
  app.get("/api/terminal-devices/:id", async (req, res) => {
    try {
      const device = await storage.getTerminalDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ message: "Terminal device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Get terminal device error:", error);
      res.status(500).json({ message: "Failed to get terminal device" });
    }
  });

  // Create a terminal device
  app.post("/api/terminal-devices", async (req, res) => {
    try {
      const parsed = insertTerminalDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid terminal device data", errors: parsed.error.flatten().fieldErrors });
      }
      const device = await storage.createTerminalDevice(parsed.data);
      res.status(201).json(device);
    } catch (error) {
      console.error("Create terminal device error:", error);
      res.status(500).json({ message: "Failed to create terminal device" });
    }
  });

  // Update a terminal device
  app.patch("/api/terminal-devices/:id", async (req, res) => {
    try {
      const parsed = insertTerminalDeviceSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid terminal device data", errors: parsed.error.flatten().fieldErrors });
      }
      const device = await storage.updateTerminalDevice(req.params.id, parsed.data);
      if (!device) {
        return res.status(404).json({ message: "Terminal device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Update terminal device error:", error);
      res.status(500).json({ message: "Failed to update terminal device" });
    }
  });

  // Delete a terminal device
  app.delete("/api/terminal-devices/:id", async (req, res) => {
    try {
      const success = await storage.deleteTerminalDevice(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Terminal device not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete terminal device error:", error);
      res.status(500).json({ message: "Failed to delete terminal device" });
    }
  });

  // Update terminal device status (for heartbeat/status polling)
  app.post("/api/terminal-devices/:id/heartbeat", async (req, res) => {
    try {
      const { status } = req.body;
      const device = await storage.updateTerminalDeviceStatus(
        req.params.id,
        status || "online",
        new Date()
      );
      if (!device) {
        return res.status(404).json({ message: "Terminal device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Terminal heartbeat error:", error);
      res.status(500).json({ message: "Failed to update terminal status" });
    }
  });

  // ============================================================================
  // TERMINAL SESSIONS - Payment sessions on EMV terminals
  // ============================================================================

  // Get terminal sessions
  app.get("/api/terminal-sessions", async (req, res) => {
    try {
      const { terminalDeviceId, status } = req.query;
      const sessions = await storage.getTerminalSessions(
        terminalDeviceId as string,
        status as string
      );
      res.json(sessions);
    } catch (error) {
      console.error("Get terminal sessions error:", error);
      res.status(500).json({ message: "Failed to get terminal sessions" });
    }
  });

  // Get a single terminal session
  app.get("/api/terminal-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getTerminalSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Terminal session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Get terminal session error:", error);
      res.status(500).json({ message: "Failed to get terminal session" });
    }
  });

  // Get active session for a terminal
  app.get("/api/terminal-devices/:terminalId/active-session", async (req, res) => {
    try {
      const session = await storage.getActiveTerminalSession(req.params.terminalId);
      res.json(session || null);
    } catch (error) {
      console.error("Get active terminal session error:", error);
      res.status(500).json({ message: "Failed to get active session" });
    }
  });

  // Create a terminal session (initiate payment on terminal)
  app.post("/api/terminal-sessions", async (req, res) => {
    try {
      const parsed = insertTerminalSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid session data", errors: parsed.error.flatten().fieldErrors });
      }

      // Check if terminal has an active session
      const activeSession = await storage.getActiveTerminalSession(parsed.data.terminalDeviceId);
      if (activeSession) {
        return res.status(409).json({ 
          message: "Terminal has an active payment session",
          activeSessionId: activeSession.id,
        });
      }

      // Get the terminal to verify it exists and is online
      const terminal = await storage.getTerminalDevice(parsed.data.terminalDeviceId);
      if (!terminal) {
        return res.status(404).json({ message: "Terminal device not found" });
      }
      if (terminal.status !== "online") {
        return res.status(400).json({ message: `Terminal is ${terminal.status}, cannot initiate payment` });
      }

      // Set session expiration (5 minutes from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      const session = await storage.createTerminalSession({
        ...parsed.data,
        status: "pending",
        expiresAt,
      });

      // Update terminal status to busy
      await storage.updateTerminalDeviceStatus(terminal.id, "busy");

      res.status(201).json(session);
    } catch (error) {
      console.error("Create terminal session error:", error);
      res.status(500).json({ message: "Failed to create terminal session" });
    }
  });

  // Update terminal session status
  app.patch("/api/terminal-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getTerminalSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Terminal session not found" });
      }

      const { status, statusMessage, processorReference, paymentTransactionId, metadata } = req.body;
      
      const updateData: any = {};
      if (status) updateData.status = status;
      if (statusMessage) updateData.statusMessage = statusMessage;
      if (processorReference) updateData.processorReference = processorReference;
      if (paymentTransactionId) updateData.paymentTransactionId = paymentTransactionId;
      if (metadata) updateData.metadata = metadata;

      // If session is complete (approved, declined, cancelled, timeout, error), set completedAt
      const terminalStatuses = ["approved", "declined", "cancelled", "timeout", "error"];
      if (status && terminalStatuses.includes(status)) {
        updateData.completedAt = new Date();
        
        // Reset terminal status to online
        await storage.updateTerminalDeviceStatus(session.terminalDeviceId, "online");
      }

      const updated = await storage.updateTerminalSession(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Update terminal session error:", error);
      res.status(500).json({ message: "Failed to update terminal session" });
    }
  });

  // Cancel a terminal session
  app.post("/api/terminal-sessions/:id/cancel", async (req, res) => {
    try {
      const session = await storage.getTerminalSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Terminal session not found" });
      }

      const activeStatuses = ["pending", "processing", "awaiting_card", "card_inserted", "pin_entry"];
      if (!activeStatuses.includes(session.status || "")) {
        return res.status(400).json({ message: "Session is not active, cannot cancel" });
      }

      const updated = await storage.updateTerminalSession(req.params.id, {
        status: "cancelled",
        statusMessage: req.body.reason || "Cancelled by user",
        completedAt: new Date(),
      });

      // Reset terminal status
      await storage.updateTerminalDeviceStatus(session.terminalDeviceId, "online");

      res.json(updated);
    } catch (error) {
      console.error("Cancel terminal session error:", error);
      res.status(500).json({ message: "Failed to cancel terminal session" });
    }
  });

  // Simulate terminal callback (for testing/demo)
  app.post("/api/terminal-sessions/:id/simulate-callback", async (req, res) => {
    try {
      const session = await storage.getTerminalSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Terminal session not found" });
      }

      const { action } = req.body; // 'approve' or 'decline'
      
      if (action === "approve") {
        // Create a payment transaction for the approved payment
        const terminal = await storage.getTerminalDevice(session.terminalDeviceId);
        const processor = terminal?.paymentProcessorId 
          ? await storage.getPaymentProcessor(terminal.paymentProcessorId)
          : null;

        const authCode = "SIM" + Math.floor(Math.random() * 100000).toString().padStart(6, "0");
        const cardLast4 = "4242";
        const cardBrand = "visa";

        let transaction = null;
        if (processor) {
          transaction = await storage.createPaymentTransaction({
            paymentProcessorId: processor.id,
            gatewayTransactionId: `SIM-${Date.now()}`,
            authCode,
            cardBrand,
            cardLast4,
            entryMode: "contactless",
            authAmount: session.amount,
            captureAmount: session.amount + (session.tipAmount || 0),
            tipAmount: session.tipAmount || 0,
            status: "captured",
            transactionType: "sale",
            responseCode: "00",
            responseMessage: "Approved (Simulated)",
            workstationId: session.workstationId || undefined,
            employeeId: session.employeeId || undefined,
            terminalId: terminal?.terminalId || terminal?.id,
          });
        }

        // Create check payment if check was specified
        let checkPayment = null;
        if (session.checkId && session.tenderId) {
          const tender = await storage.getTender(session.tenderId);
          const amountDollars = (session.amount / 100).toFixed(2);
          const tipDollars = ((session.tipAmount || 0) / 100).toFixed(2);
          
          checkPayment = await storage.createPayment({
            checkId: session.checkId,
            tenderId: session.tenderId,
            tenderName: tender?.name || "Card",
            amount: amountDollars,
            tipAmount: tipDollars,
            paymentStatus: "completed",
            paymentTransactionId: transaction?.id || `TERM:${authCode}:${cardLast4}`,
            employeeId: session.employeeId || undefined,
          });

          // Recalculate check totals and auto-close if fully paid
          await recalculateCheckTotals(session.checkId);
          const updatedCheck = await storage.getCheck(session.checkId);
          if (updatedCheck) {
            const allPayments = await storage.getPayments(session.checkId);
            const totalPaid = allPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
            const checkTotal = parseFloat(updatedCheck.total || "0");
            if (totalPaid >= checkTotal && checkTotal > 0) {
              await storage.updateCheck(session.checkId, { status: "closed", closedAt: new Date() });
            }
          }
        }

        await storage.updateTerminalSession(session.id, {
          status: "approved",
          statusMessage: "Payment approved",
          paymentTransactionId: transaction?.id,
          completedAt: new Date(),
        });

        await storage.updateTerminalDeviceStatus(session.terminalDeviceId, "online");

        res.json({
          success: true,
          approved: true,
          transactionId: transaction?.id,
          checkPaymentId: checkPayment?.id,
          authCode,
          cardLast4,
          cardBrand,
        });
      } else {
        await storage.updateTerminalSession(session.id, {
          status: "declined",
          statusMessage: "Card declined",
          completedAt: new Date(),
        });

        await storage.updateTerminalDeviceStatus(session.terminalDeviceId, "online");

        res.json({
          success: false,
          declined: true,
          declineReason: "Insufficient funds (Simulated)",
        });
      }
    } catch (error) {
      console.error("Simulate terminal callback error:", error);
      res.status(500).json({ message: "Failed to simulate callback" });
    }
  });

  // ============================================================================
  // REGISTERED DEVICES - POS/KDS device enrollment and access control
  // ============================================================================

  // Get all registered devices (admin view)
  app.get("/api/registered-devices", async (req, res) => {
    try {
      const { propertyId } = req.query;
      const devices = await storage.getRegisteredDevices(propertyId as string);
      res.json(devices);
    } catch (error) {
      console.error("Get registered devices error:", error);
      res.status(500).json({ message: "Failed to get registered devices" });
    }
  });

  // Get single registered device
  app.get("/api/registered-devices/:id", async (req, res) => {
    try {
      const device = await storage.getRegisteredDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ message: "Registered device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Get registered device error:", error);
      res.status(500).json({ message: "Failed to get registered device" });
    }
  });

  // Create a new registered device (admin creates device entry with enrollment code)
  app.post("/api/registered-devices", async (req, res) => {
    try {
      const { propertyId, deviceType, workstationId, kdsDeviceId, name, serialNumber, assetTag, macAddress, notes, createdByEmployeeId } = req.body;

      if (!propertyId || !deviceType || !name) {
        return res.status(400).json({ message: "Property ID, device type, and name are required" });
      }

      // Validate device type
      if (!["pos_workstation", "kds_display"].includes(deviceType)) {
        return res.status(400).json({ message: "Device type must be 'pos_workstation' or 'kds_display'" });
      }

      // Validate that either workstationId or kdsDeviceId is provided based on type
      if (deviceType === "pos_workstation" && !workstationId) {
        return res.status(400).json({ message: "Workstation ID is required for POS workstation type" });
      }
      if (deviceType === "kds_display" && !kdsDeviceId) {
        return res.status(400).json({ message: "KDS Device ID is required for KDS display type" });
      }

      // Generate a 6-digit enrollment code
      const enrollmentCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Code expires in 24 hours
      const enrollmentCodeExpiresAt = new Date();
      enrollmentCodeExpiresAt.setHours(enrollmentCodeExpiresAt.getHours() + 24);

      const device = await storage.createRegisteredDevice({
        propertyId,
        deviceType,
        workstationId: deviceType === "pos_workstation" ? workstationId : null,
        kdsDeviceId: deviceType === "kds_display" ? kdsDeviceId : null,
        name,
        enrollmentCode,
        enrollmentCodeExpiresAt,
        status: "pending",
        serialNumber: serialNumber || null,
        assetTag: assetTag || null,
        macAddress: macAddress || null,
        notes: notes || null,
        createdByEmployeeId: createdByEmployeeId || null,
      });

      res.status(201).json(device);
    } catch (error) {
      console.error("Create registered device error:", error);
      res.status(500).json({ message: "Failed to create registered device" });
    }
  });

  // Generate a new enrollment code for an existing device
  app.post("/api/registered-devices/:id/generate-code", async (req, res) => {
    try {
      const device = await storage.getRegisteredDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ message: "Registered device not found" });
      }

      // Generate a new 6-digit enrollment code
      const enrollmentCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Code expires in 24 hours
      const enrollmentCodeExpiresAt = new Date();
      enrollmentCodeExpiresAt.setHours(enrollmentCodeExpiresAt.getHours() + 24);

      const updated = await storage.updateRegisteredDevice(req.params.id, {
        enrollmentCode,
        enrollmentCodeExpiresAt,
        status: "pending",
        deviceToken: null,
        deviceTokenHash: null,
        enrolledAt: null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Generate enrollment code error:", error);
      res.status(500).json({ message: "Failed to generate enrollment code" });
    }
  });

  // Enroll a device using enrollment code (called from device-setup page)
  app.post("/api/registered-devices/enroll", async (req, res) => {
    try {
      const { enrollmentCode, deviceInfo } = req.body;

      if (!enrollmentCode) {
        return res.status(400).json({ message: "Enrollment code is required" });
      }

      // Find device by enrollment code
      const device = await storage.getRegisteredDeviceByEnrollmentCode(enrollmentCode);
      if (!device) {
        return res.status(404).json({ message: "Invalid or expired enrollment code" });
      }

      // Check if code is expired
      if (device.enrollmentCodeExpiresAt && new Date() > new Date(device.enrollmentCodeExpiresAt)) {
        return res.status(400).json({ message: "Enrollment code has expired" });
      }

      // Generate a secure device token (UUID format for simplicity)
      const crypto = await import("crypto");
      const deviceToken = crypto.randomUUID() + "-" + crypto.randomBytes(16).toString("hex");
      const deviceTokenHash = crypto.createHash("sha256").update(deviceToken).digest("hex");

      // Update device with enrollment info
      const updated = await storage.updateRegisteredDevice(device.id, {
        status: "enrolled",
        deviceToken: null, // We don't store the actual token, only the hash
        deviceTokenHash,
        enrollmentCode: null, // Clear the enrollment code after use
        enrollmentCodeExpiresAt: null,
        enrolledAt: new Date(),
        lastAccessAt: new Date(),
        // Store device info if provided
        osInfo: deviceInfo?.osInfo || null,
        browserInfo: deviceInfo?.browserInfo || null,
        screenResolution: deviceInfo?.screenResolution || null,
        ipAddress: deviceInfo?.ipAddress || null,
      });

      // Return the device token and device info (client stores this securely)
      res.json({
        success: true,
        deviceToken,
        device: {
          id: updated?.id,
          name: updated?.name,
          deviceType: updated?.deviceType,
          propertyId: updated?.propertyId,
          workstationId: updated?.workstationId,
          kdsDeviceId: updated?.kdsDeviceId,
          status: updated?.status,
        },
      });
    } catch (error) {
      console.error("Device enrollment error:", error);
      res.status(500).json({ message: "Failed to enroll device" });
    }
  });

  // Validate device token (called on app load to verify device is still authorized)
  app.post("/api/registered-devices/validate", async (req, res) => {
    try {
      const { deviceToken } = req.body;

      if (!deviceToken) {
        return res.status(400).json({ message: "Device token is required", valid: false });
      }

      // Hash the token to find the device
      const crypto = await import("crypto");
      const deviceTokenHash = crypto.createHash("sha256").update(deviceToken).digest("hex");

      const device = await storage.getRegisteredDeviceByToken(deviceTokenHash);
      if (!device) {
        return res.status(401).json({ message: "Invalid or revoked device token", valid: false });
      }

      // Check if device is still enrolled
      if (device.status !== "enrolled") {
        return res.status(401).json({ message: `Device is ${device.status}`, valid: false });
      }

      // Update last access time
      await storage.updateRegisteredDevice(device.id, {
        lastAccessAt: new Date(),
      });

      res.json({
        valid: true,
        device: {
          id: device.id,
          name: device.name,
          deviceType: device.deviceType,
          propertyId: device.propertyId,
          workstationId: device.workstationId,
          kdsDeviceId: device.kdsDeviceId,
          status: device.status,
        },
      });
    } catch (error) {
      console.error("Device validation error:", error);
      res.status(500).json({ message: "Failed to validate device", valid: false });
    }
  });

  // Update registered device (admin can update metadata)
  app.patch("/api/registered-devices/:id", async (req, res) => {
    try {
      const device = await storage.getRegisteredDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ message: "Registered device not found" });
      }

      const { name, serialNumber, assetTag, macAddress, notes, status, disabledByEmployeeId, disabledReason } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
      if (assetTag !== undefined) updateData.assetTag = assetTag;
      if (macAddress !== undefined) updateData.macAddress = macAddress;
      if (notes !== undefined) updateData.notes = notes;

      // Handle status changes
      if (status && status !== device.status) {
        updateData.status = status;
        if (status === "disabled" || status === "revoked") {
          updateData.disabledAt = new Date();
          updateData.disabledByEmployeeId = disabledByEmployeeId || null;
          updateData.disabledReason = disabledReason || null;
          // Clear token to revoke access
          updateData.deviceToken = null;
          updateData.deviceTokenHash = null;
        }
      }

      const updated = await storage.updateRegisteredDevice(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Update registered device error:", error);
      res.status(500).json({ message: "Failed to update registered device" });
    }
  });

  // Delete registered device
  app.delete("/api/registered-devices/:id", async (req, res) => {
    try {
      const success = await storage.deleteRegisteredDevice(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Registered device not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Delete registered device error:", error);
      res.status(500).json({ message: "Failed to delete registered device" });
    }
  });

  // ============================================================================
  // EMC (Enterprise Management Console) - Email/Password Authentication
  // Accessible from any browser worldwide for system configuration
  // ============================================================================

  // Check if first-time setup is required (no EMC users exist)
  app.get("/api/emc/setup-required", async (req, res) => {
    try {
      const userCount = await storage.getEmcUserCount();
      res.json({ setupRequired: userCount === 0 });
    } catch (error) {
      console.error("EMC setup check error:", error);
      res.status(500).json({ message: "Failed to check EMC setup status" });
    }
  });

  // First-time setup - create initial admin user
  app.post("/api/emc/setup", async (req, res) => {
    try {
      const userCount = await storage.getEmcUserCount();
      if (userCount > 0) {
        return res.status(400).json({ message: "Setup has already been completed" });
      }

      const { email, password, displayName, enterpriseId } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Hash password with bcrypt (10 salt rounds)
      const passwordHash = await bcrypt.hash(password, 10);

      const user = await storage.createEmcUser({
        email: email.toLowerCase(),
        passwordHash,
        displayName: displayName || email.split("@")[0],
        role: "enterprise_admin", // First user gets highest level access
        enterpriseId: enterpriseId || null,
        propertyId: null,
        isActive: true,
      });

      // Create session - hash token before storage for security
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await storage.createEmcSession({
        userId: user.id,
        sessionToken: sessionTokenHash, // Store hashed token
        expiresAt,
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
        },
        sessionToken, // Return unhashed token to client
        expiresAt,
      });
    } catch (error) {
      console.error("EMC setup error:", error);
      res.status(500).json({ message: "Failed to complete setup" });
    }
  });

  // EMC Login - email/password authentication
  app.post("/api/emc/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getEmcUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Account is disabled" });
      }

      // Verify password using bcrypt
      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        // Update failed login count
        await storage.updateEmcUser(user.id, {
          failedLoginAttempts: (user.failedLoginAttempts || 0) + 1,
          lastFailedLogin: new Date(),
        });
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Successful login - reset failed attempts
      await storage.updateEmcUser(user.id, {
        failedLoginAttempts: 0,
        lastLoginAt: new Date(),
      });

      // Create session - hash token before storage for security
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await storage.createEmcSession({
        userId: user.id,
        sessionToken: sessionTokenHash, // Store hashed token
        expiresAt,
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          enterpriseId: user.enterpriseId,
          propertyId: user.propertyId,
        },
        sessionToken, // Return unhashed token to client
        expiresAt,
      });
    } catch (error) {
      console.error("EMC login error:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });

  // EMC Session validation - check if session is still valid
  app.post("/api/emc/validate-session", async (req, res) => {
    try {
      const { sessionToken } = req.body;

      if (!sessionToken) {
        return res.status(401).json({ valid: false, message: "No session token provided" });
      }

      // Hash the token before lookup
      const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
      const session = await storage.getEmcSessionByToken(sessionTokenHash);
      if (!session) {
        return res.status(401).json({ valid: false, message: "Invalid or expired session" });
      }

      const user = await storage.getEmcUser(session.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ valid: false, message: "User account is disabled" });
      }

      res.json({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          enterpriseId: user.enterpriseId,
          propertyId: user.propertyId,
        },
        session: {
          expiresAt: session.expiresAt,
        },
      });
    } catch (error) {
      console.error("EMC session validation error:", error);
      res.status(500).json({ valid: false, message: "Failed to validate session" });
    }
  });

  // EMC Logout - invalidate session
  app.post("/api/emc/logout", async (req, res) => {
    try {
      const { sessionToken } = req.body;

      if (sessionToken) {
        // Hash the token before lookup
        const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
        const session = await storage.getEmcSessionByToken(sessionTokenHash);
        if (session) {
          await storage.deleteEmcSession(session.id);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("EMC logout error:", error);
      res.status(500).json({ message: "Failed to logout" });
    }
  });

  // Get current EMC user info
  app.get("/api/emc/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No session token provided" });
      }

      const sessionToken = authHeader.slice(7);
      // Hash the token before lookup
      const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
      const session = await storage.getEmcSessionByToken(sessionTokenHash);
      if (!session) {
        return res.status(401).json({ message: "Invalid or expired session" });
      }

      const user = await storage.getEmcUser(session.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: "User account is disabled" });
      }

      res.json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        enterpriseId: user.enterpriseId,
        propertyId: user.propertyId,
      });
    } catch (error) {
      console.error("EMC get user error:", error);
      res.status(500).json({ message: "Failed to get user info" });
    }
  });

  // ============================================================================
  // STRIPE MANUAL CARD ENTRY - PaymentIntent API for secure card processing
  // ============================================================================

  // Create a PaymentIntent for manual card entry (Stripe Elements)
  app.post("/api/stripe/create-payment-intent", async (req, res) => {
    try {
      const { amount, checkId, tenderId, employeeId, workstationId, propertyId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      // Get Stripe secret key from environment
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return res.status(500).json({ message: "Stripe is not configured. Please add STRIPE_SECRET_KEY." });
      }

      const stripe = new Stripe(stripeSecretKey);

      // Create PaymentIntent - amount should be in cents
      // For POS, we only accept card payments (not Cash App, Klarna, Amazon Pay, etc.)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert dollars to cents
        currency: "usd",
        payment_method_types: ["card"], // Card only for POS
        metadata: {
          checkId: checkId || "",
          tenderId: tenderId || "",
          employeeId: employeeId || "",
          workstationId: workstationId || "",
          propertyId: propertyId || "",
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error) {
      console.error("Create PaymentIntent error:", error);
      const stripeError = error as Stripe.errors.StripeError;
      res.status(500).json({ 
        message: stripeError.message || "Failed to create payment intent" 
      });
    }
  });

  // Record a completed Stripe payment after successful card charge
  app.post("/api/stripe/record-payment", async (req, res) => {
    try {
      const { 
        paymentIntentId, 
        checkId, 
        tenderId, 
        amount, 
        employeeId, 
        cardBrand, 
        cardLast4 
      } = req.body;

      if (!paymentIntentId || !checkId || !tenderId || !amount) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const check = await storage.getCheck(checkId);
      if (!check) {
        return res.status(404).json({ message: "Check not found" });
      }

      const tender = await storage.getTender(tenderId);
      if (!tender) {
        return res.status(404).json({ message: "Tender not found" });
      }

      // Get business date from check's RVC property or use current date as fallback
      let businessDate = new Date().toISOString().split("T")[0];
      if (check.rvcId) {
        const rvc = await storage.getRvc(check.rvcId);
        if (rvc?.propertyId) {
          const property = await storage.getProperty(rvc.propertyId);
          if (property) {
            businessDate = resolveBusinessDate(new Date(), property);
          }
        }
      }

      // Create check payment record (Stripe payment processed directly, no processor record needed)
      const checkPayment = await storage.createPayment({
        checkId,
        tenderId,
        tenderName: tender.name,
        amount: amount.toString(),
        employeeId,
        businessDate,
        paymentStatus: "completed",
      });

      // Calculate total paid and check if check should be closed
      const allPayments = await storage.getPayments(checkId);
      const totalPaid = allPayments.reduce((sum: number, p: { amount: string | null }) => 
        sum + parseFloat(p.amount || "0"), 0);
      const checkTotal = parseFloat(check.total || "0");

      let updatedCheck = check;
      if (totalPaid >= checkTotal) {
        const result = await storage.updateCheck(checkId, {
          status: "closed",
          closedAt: new Date(),
        });
        if (result) updatedCheck = result;
      }

      res.json({
        success: true,
        checkPaymentId: checkPayment.id,
        paymentIntentId,
        cardBrand,
        cardLast4,
        check: updatedCheck,
      });
    } catch (error) {
      console.error("Record Stripe payment error:", error);
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  // ============================================================================
  // FISCAL CLOSE / END-OF-DAY ROUTES
  // ============================================================================

  app.get("/api/fiscal-periods", async (req, res) => {
    try {
      const { propertyId, startDate, endDate } = req.query;
      const periods = await storage.getFiscalPeriods(
        propertyId as string,
        startDate as string,
        endDate as string
      );
      res.json(periods);
    } catch (error) {
      console.error("Get fiscal periods error:", error);
      res.status(500).json({ message: "Failed to get fiscal periods" });
    }
  });

  app.get("/api/fiscal-periods/:id", async (req, res) => {
    try {
      const period = await storage.getFiscalPeriod(req.params.id);
      if (!period) return res.status(404).json({ message: "Fiscal period not found" });
      res.json(period);
    } catch (error) {
      res.status(500).json({ message: "Failed to get fiscal period" });
    }
  });

  app.get("/api/fiscal-periods/current/:propertyId", async (req, res) => {
    try {
      const property = await storage.getProperty(req.params.propertyId);
      if (!property) return res.status(404).json({ message: "Property not found" });
      
      const businessDate = resolveBusinessDate(new Date(), property);
      let period = await storage.getFiscalPeriodByDate(req.params.propertyId, businessDate);
      
      // Create if doesn't exist
      if (!period) {
        period = await storage.createFiscalPeriod({
          propertyId: req.params.propertyId,
          businessDate,
          status: "open",
        });
      }
      res.json(period);
    } catch (error) {
      console.error("Get current fiscal period error:", error);
      res.status(500).json({ message: "Failed to get current fiscal period" });
    }
  });

  app.post("/api/fiscal-periods/:id/close", async (req, res) => {
    try {
      const { employeeId, cashActual, notes } = req.body;
      const period = await storage.getFiscalPeriod(req.params.id);
      if (!period) return res.status(404).json({ message: "Fiscal period not found" });

      // Calculate financial totals from checks
      const totals = await storage.calculateFiscalPeriodTotals(period.propertyId, period.businessDate);
      
      const cashVariance = cashActual !== undefined ? 
        parseFloat(cashActual) - parseFloat(totals.cashExpected || "0") : null;

      const updated = await storage.updateFiscalPeriod(req.params.id, {
        status: "closed",
        closedAt: new Date(),
        closedById: employeeId,
        ...totals,
        cashActual: cashActual?.toString(),
        cashVariance: cashVariance?.toString(),
        notes,
      });

      // Create audit log
      await storage.createAuditLog({
        employeeId,
        action: "fiscal_close",
        targetType: "fiscal_period",
        targetId: req.params.id,
        details: { businessDate: period.businessDate, ...totals },
      });

      res.json(updated);
    } catch (error) {
      console.error("Close fiscal period error:", error);
      res.status(500).json({ message: "Failed to close fiscal period" });
    }
  });

  app.post("/api/fiscal-periods/:id/reopen", async (req, res) => {
    try {
      const { employeeId, reason } = req.body;
      const period = await storage.getFiscalPeriod(req.params.id);
      if (!period) return res.status(404).json({ message: "Fiscal period not found" });

      const updated = await storage.updateFiscalPeriod(req.params.id, {
        status: "reopened",
        reopenedAt: new Date(),
        reopenedById: employeeId,
        reopenReason: reason,
      });

      await storage.createAuditLog({
        employeeId,
        action: "fiscal_reopen",
        targetType: "fiscal_period",
        targetId: req.params.id,
        details: { reason },
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to reopen fiscal period" });
    }
  });

  // ============================================================================
  // CASH MANAGEMENT ROUTES
  // ============================================================================

  app.get("/api/cash-drawers", async (req, res) => {
    try {
      const { propertyId } = req.query;
      const drawers = await storage.getCashDrawers(propertyId as string);
      res.json(drawers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get cash drawers" });
    }
  });

  app.post("/api/cash-drawers", async (req, res) => {
    try {
      const drawer = await storage.createCashDrawer(req.body);
      res.status(201).json(drawer);
    } catch (error) {
      res.status(500).json({ message: "Failed to create cash drawer" });
    }
  });

  app.get("/api/drawer-assignments", async (req, res) => {
    try {
      const { propertyId, employeeId, businessDate } = req.query;
      // Require propertyId for security - prevents cross-property data exposure
      if (!propertyId) {
        return res.status(400).json({ message: "propertyId is required" });
      }
      const assignments = await storage.getDrawerAssignments(
        propertyId as string,
        employeeId as string,
        businessDate as string
      );
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get drawer assignments" });
    }
  });

  app.post("/api/drawer-assignments", async (req, res) => {
    try {
      const assignment = await storage.createDrawerAssignment(req.body);
      res.status(201).json(assignment);
    } catch (error) {
      res.status(500).json({ message: "Failed to create drawer assignment" });
    }
  });

  app.post("/api/drawer-assignments/:id/close", async (req, res) => {
    try {
      const { actualAmount, closedById, notes } = req.body;
      const assignment = await storage.getDrawerAssignment(req.params.id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      const variance = parseFloat(actualAmount) - parseFloat(assignment.expectedAmount || "0");

      const updated = await storage.updateDrawerAssignment(req.params.id, {
        status: "closed",
        actualAmount: actualAmount.toString(),
        variance: variance.toString(),
        closedAt: new Date(),
        closedById,
        notes,
      });

      // Create variance alert if significant
      if (Math.abs(variance) > 5) {
        await storage.createManagerAlert({
          propertyId: assignment.drawerId ? 
            (await storage.getCashDrawer(assignment.drawerId))?.propertyId || "" : "",
          alertType: "cash_variance",
          severity: Math.abs(variance) > 20 ? "critical" : "warning",
          title: "Cash Drawer Variance",
          message: `Drawer variance of $${variance.toFixed(2)}`,
          employeeId: assignment.employeeId,
          metadata: { assignmentId: req.params.id, variance },
        });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to close drawer assignment" });
    }
  });

  app.post("/api/cash-transactions", async (req, res) => {
    try {
      const transaction = await storage.createCashTransaction(req.body);
      
      // Update drawer assignment expected amount
      if (req.body.assignmentId) {
        const assignment = await storage.getDrawerAssignment(req.body.assignmentId);
        if (assignment) {
          const delta = ["sale", "paid_in", "pickup"].includes(req.body.transactionType) ?
            parseFloat(req.body.amount) : -parseFloat(req.body.amount);
          await storage.updateDrawerAssignment(req.body.assignmentId, {
            expectedAmount: (parseFloat(assignment.expectedAmount || "0") + delta).toString(),
          });
        }
      }
      
      res.status(201).json(transaction);
    } catch (error) {
      res.status(500).json({ message: "Failed to create cash transaction" });
    }
  });

  app.get("/api/safe-counts", async (req, res) => {
    try {
      const { propertyId, businessDate } = req.query;
      const counts = await storage.getSafeCounts(propertyId as string, businessDate as string);
      res.json(counts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get safe counts" });
    }
  });

  app.post("/api/safe-counts", async (req, res) => {
    try {
      const count = await storage.createSafeCount(req.body);
      res.status(201).json(count);
    } catch (error) {
      res.status(500).json({ message: "Failed to create safe count" });
    }
  });

  // ============================================================================
  // GIFT CARD ROUTES
  // ============================================================================

  app.get("/api/gift-cards", async (req, res) => {
    try {
      const { propertyId, status } = req.query;
      const cards = await storage.getGiftCards(propertyId as string, status as string);
      res.json(cards);
    } catch (error) {
      res.status(500).json({ message: "Failed to get gift cards" });
    }
  });

  app.get("/api/gift-cards/lookup/:cardNumber", async (req, res) => {
    try {
      const card = await storage.getGiftCardByNumber(req.params.cardNumber);
      if (!card) return res.status(404).json({ message: "Gift card not found" });
      
      // Validate PIN if card requires PIN and PIN was provided
      const { pin } = req.query;
      if (card.pin && pin && card.pin !== pin) {
        return res.status(401).json({ message: "Invalid PIN" });
      }
      
      // Return card info (include full card number for POS display but mask in actual response for security)
      res.json({
        ...card,
        // Return masked card number for display, but include original for matching
        maskedCardNumber: card.cardNumber.slice(0, 4) + "****" + card.cardNumber.slice(-4),
        pinValidated: card.pin ? (pin === card.pin) : true,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to lookup gift card" });
    }
  });

  app.post("/api/gift-cards", async (req, res) => {
    try {
      const card = await storage.createGiftCard(req.body);
      
      // Create activation transaction
      await storage.createGiftCardTransaction({
        giftCardId: card.id,
        propertyId: req.body.propertyId,
        transactionType: "activation",
        amount: req.body.initialBalance,
        balanceBefore: "0",
        balanceAfter: req.body.initialBalance,
        employeeId: req.body.activatedById,
      });

      res.status(201).json(card);
    } catch (error) {
      res.status(500).json({ message: "Failed to create gift card" });
    }
  });

  app.post("/api/gift-cards/:id/reload", async (req, res) => {
    try {
      const { amount, employeeId, propertyId } = req.body;
      const card = await storage.getGiftCard(req.params.id);
      if (!card) return res.status(404).json({ message: "Gift card not found" });

      const newBalance = parseFloat(card.currentBalance) + parseFloat(amount);
      
      const updated = await storage.updateGiftCard(req.params.id, {
        currentBalance: newBalance.toString(),
      });

      await storage.createGiftCardTransaction({
        giftCardId: card.id,
        propertyId,
        transactionType: "reload",
        amount,
        balanceBefore: card.currentBalance,
        balanceAfter: newBalance.toString(),
        employeeId,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to reload gift card" });
    }
  });

  app.post("/api/gift-cards/:id/redeem", async (req, res) => {
    try {
      const { amount, checkId, employeeId, propertyId, checkPaymentId, pin, referenceNumber } = req.body;
      
      // Atomically fetch and validate card state
      const card = await storage.getGiftCard(req.params.id);
      if (!card) return res.status(404).json({ message: "Gift card not found" });
      if (card.status !== "active") return res.status(400).json({ message: "Gift card is not active" });
      
      // Validate PIN if card requires one
      if (card.pin && pin !== card.pin) {
        return res.status(401).json({ message: "Invalid PIN" });
      }
      
      // Validate amount against current balance (re-check atomically)
      const requestedAmount = parseFloat(amount);
      const currentBalance = parseFloat(card.currentBalance);
      if (requestedAmount > currentBalance) {
        return res.status(400).json({ 
          message: "Insufficient balance",
          currentBalance: currentBalance.toFixed(2),
        });
      }

      const redeemAmount = Math.min(parseFloat(amount), parseFloat(card.currentBalance));
      const newBalance = parseFloat(card.currentBalance) - redeemAmount;

      const updateData: any = {
        currentBalance: newBalance.toString(),
        lastUsedAt: new Date(),
      };
      if (newBalance === 0) {
        updateData.status = "redeemed";
      }

      const updated = await storage.updateGiftCard(req.params.id, updateData);

      const transaction = await storage.createGiftCardTransaction({
        giftCardId: card.id,
        propertyId,
        transactionType: "redemption",
        amount: redeemAmount.toString(),
        balanceBefore: card.currentBalance,
        balanceAfter: newBalance.toString(),
        checkId,
        checkPaymentId,
        employeeId,
        referenceNumber,
      });

      res.json({ 
        success: true,
        giftCard: updated, 
        transaction,
        redeemedAmount: redeemAmount,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to redeem gift card" });
    }
  });

  app.get("/api/gift-cards/:id/transactions", async (req, res) => {
    try {
      const transactions = await storage.getGiftCardTransactions(req.params.id);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to get gift card transactions" });
    }
  });

  // ============================================================================
  // LOYALTY PROGRAM ROUTES
  // ============================================================================

  app.get("/api/loyalty-programs", async (req, res) => {
    try {
      const { enterpriseId } = req.query;
      const programs = await storage.getLoyaltyPrograms(enterpriseId as string);
      res.json(programs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get loyalty programs" });
    }
  });

  app.post("/api/loyalty-programs", async (req, res) => {
    try {
      const program = await storage.createLoyaltyProgram(req.body);
      res.status(201).json(program);
    } catch (error) {
      res.status(500).json({ message: "Failed to create loyalty program" });
    }
  });

  app.put("/api/loyalty-programs/:id", async (req, res) => {
    try {
      const program = await storage.updateLoyaltyProgram(req.params.id, req.body);
      res.json(program);
    } catch (error) {
      res.status(500).json({ message: "Failed to update loyalty program" });
    }
  });

  app.get("/api/loyalty-members", async (req, res) => {
    try {
      const { programId, search } = req.query;
      const members = await storage.getLoyaltyMembers(programId as string, search as string);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to get loyalty members" });
    }
  });

  app.get("/api/loyalty-members/lookup/:identifier", async (req, res) => {
    try {
      // Can lookup by member number, phone, or email
      const member = await storage.getLoyaltyMemberByIdentifier(req.params.identifier);
      if (!member) return res.status(404).json({ message: "Member not found" });
      res.json(member);
    } catch (error) {
      res.status(500).json({ message: "Failed to lookup member" });
    }
  });

  app.get("/api/loyalty-members/:id", async (req, res) => {
    try {
      const member = await storage.getLoyaltyMember(req.params.id);
      if (!member) return res.status(404).json({ message: "Member not found" });
      res.json(member);
    } catch (error) {
      res.status(500).json({ message: "Failed to get loyalty member" });
    }
  });

  app.post("/api/loyalty-members", async (req, res) => {
    try {
      const member = await storage.createLoyaltyMember(req.body);
      res.status(201).json(member);
    } catch (error) {
      res.status(500).json({ message: "Failed to create loyalty member" });
    }
  });

  app.patch("/api/loyalty-members/:id", async (req, res) => {
    try {
      const member = await storage.getLoyaltyMember(req.params.id);
      if (!member) return res.status(404).json({ message: "Member not found" });
      
      const { firstName, lastName, phone, email, birthDate, notes } = req.body;
      const updated = await storage.updateLoyaltyMember(req.params.id, {
        firstName,
        lastName,
        phone,
        email,
        birthDate,
        notes,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update loyalty member" });
    }
  });

  app.post("/api/loyalty-members/:id/earn", async (req, res) => {
    try {
      const { points, checkId, checkTotal, propertyId, employeeId, reason } = req.body;
      const member = await storage.getLoyaltyMember(req.params.id);
      if (!member) return res.status(404).json({ message: "Member not found" });

      const oldLifetime = member.lifetimePoints || 0;
      const newPoints = (member.currentPoints || 0) + points;
      const newLifetime = oldLifetime + points;

      const updated = await storage.updateLoyaltyMember(req.params.id, {
        currentPoints: newPoints,
        lifetimePoints: newLifetime,
        visitCount: (member.visitCount || 0) + 1,
        lifetimeSpend: (parseFloat(member.lifetimeSpend || "0") + parseFloat(checkTotal || "0")).toString(),
        lastVisitAt: new Date(),
      });

      await storage.createLoyaltyTransaction({
        memberId: member.id,
        propertyId,
        transactionType: "earn",
        points,
        pointsBefore: member.currentPoints || 0,
        pointsAfter: newPoints,
        checkId,
        checkTotal,
        employeeId,
        reason,
      });

      // Check for auto-awards after earning points
      const autoAwardedRewards: string[] = [];
      const rewards = await storage.getLoyaltyRewards(member.programId);
      const memberTransactions = await storage.getLoyaltyTransactionsByMember(member.id);
      
      for (const reward of rewards) {
        if (!reward.active || !reward.autoAwardAtPoints) continue;
        
        // Check if member just crossed the threshold (wasn't over before, now is)
        if (oldLifetime < reward.autoAwardAtPoints && newLifetime >= reward.autoAwardAtPoints) {
          // Check if autoAwardOnce and already awarded
          if (reward.autoAwardOnce) {
            const alreadyAwarded = memberTransactions.some(
              tx => tx.reason?.includes(`Auto-award: ${reward.name}`)
            );
            if (alreadyAwarded) continue;
          }
          
          // Award the reward (add points value or create notification)
          autoAwardedRewards.push(reward.name);
          
          // Log the auto-award as a transaction
          await storage.createLoyaltyTransaction({
            memberId: member.id,
            propertyId,
            transactionType: "earn",
            points: 0, // The reward itself, not additional points
            pointsBefore: newPoints,
            pointsAfter: newPoints,
            reason: `Auto-award: ${reward.name} (reached ${reward.autoAwardAtPoints} lifetime points)`,
          });
        }
      }

      res.json({ ...updated, autoAwardedRewards });
    } catch (error) {
      res.status(500).json({ message: "Failed to earn points" });
    }
  });

  app.post("/api/loyalty-members/:id/redeem", async (req, res) => {
    try {
      const { points, checkId, propertyId, employeeId, reason } = req.body;
      const member = await storage.getLoyaltyMember(req.params.id);
      if (!member) return res.status(404).json({ message: "Member not found" });
      if ((member.currentPoints || 0) < points) {
        return res.status(400).json({ message: "Insufficient points" });
      }

      const newPoints = (member.currentPoints || 0) - points;

      const updated = await storage.updateLoyaltyMember(req.params.id, {
        currentPoints: newPoints,
      });

      await storage.createLoyaltyTransaction({
        memberId: member.id,
        propertyId,
        transactionType: "redeem",
        points: -points,
        pointsBefore: member.currentPoints || 0,
        pointsAfter: newPoints,
        checkId,
        employeeId,
        reason,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to redeem points" });
    }
  });

  app.get("/api/loyalty-rewards", async (req, res) => {
    try {
      const { programId } = req.query;
      const rewards = await storage.getLoyaltyRewards(programId as string);
      res.json(rewards);
    } catch (error) {
      res.status(500).json({ message: "Failed to get loyalty rewards" });
    }
  });

  app.post("/api/loyalty-rewards", async (req, res) => {
    try {
      const reward = await storage.createLoyaltyReward(req.body);
      res.status(201).json(reward);
    } catch (error) {
      res.status(500).json({ message: "Failed to create loyalty reward" });
    }
  });

  // ============================================================================
  // INVENTORY MANAGEMENT ROUTES
  // ============================================================================

  app.get("/api/inventory-items", async (req, res) => {
    try {
      const { propertyId, category } = req.query;
      const items = await storage.getInventoryItems(propertyId as string, category as string);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to get inventory items" });
    }
  });

  app.post("/api/inventory-items", async (req, res) => {
    try {
      const item = await storage.createInventoryItem(req.body);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to create inventory item" });
    }
  });

  app.put("/api/inventory-items/:id", async (req, res) => {
    try {
      const item = await storage.updateInventoryItem(req.params.id, req.body);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to update inventory item" });
    }
  });

  app.get("/api/inventory-stock", async (req, res) => {
    try {
      const { propertyId } = req.query;
      const stock = await storage.getInventoryStock(propertyId as string);
      res.json(stock);
    } catch (error) {
      res.status(500).json({ message: "Failed to get inventory stock" });
    }
  });

  app.post("/api/inventory-transactions", async (req, res) => {
    try {
      const { inventoryItemId, propertyId, transactionType, quantity, unitCost, employeeId, reason, referenceNumber, businessDate } = req.body;

      // Get current stock
      let stock = await storage.getInventoryStockByItem(inventoryItemId, propertyId);
      const currentQty = stock ? parseFloat(stock.currentQuantity || "0") : 0;
      const newQty = currentQty + parseFloat(quantity);

      // Create transaction
      const transaction = await storage.createInventoryTransaction({
        inventoryItemId,
        propertyId,
        transactionType,
        quantity: quantity.toString(),
        quantityBefore: currentQty.toString(),
        quantityAfter: newQty.toString(),
        unitCost: unitCost?.toString(),
        totalCost: unitCost ? (parseFloat(unitCost) * Math.abs(parseFloat(quantity))).toString() : undefined,
        businessDate,
        employeeId,
        reason,
        referenceNumber,
      });

      // Update stock
      if (stock) {
        await storage.updateInventoryStock(stock.id, {
          currentQuantity: newQty.toString(),
        });
      } else {
        await storage.createInventoryStock({
          inventoryItemId,
          propertyId,
          currentQuantity: newQty.toString(),
        });
      }

      // Check for low stock alert
      const item = await storage.getInventoryItem(inventoryItemId);
      if (item && item.reorderPoint && newQty <= parseFloat(item.reorderPoint)) {
        await storage.createManagerAlert({
          propertyId,
          alertType: "inventory",
          severity: newQty <= 0 ? "critical" : "warning",
          title: "Low Inventory Alert",
          message: `${item.name} is low on stock (${newQty} remaining)`,
          metadata: { inventoryItemId, currentQuantity: newQty, reorderPoint: item.reorderPoint },
        });
      }

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Inventory transaction error:", error);
      res.status(500).json({ message: "Failed to create inventory transaction" });
    }
  });

  app.get("/api/recipes", async (req, res) => {
    try {
      const { menuItemId } = req.query;
      const recipes = await storage.getRecipes(menuItemId as string);
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get recipes" });
    }
  });

  app.post("/api/recipes", async (req, res) => {
    try {
      const recipe = await storage.createRecipe(req.body);
      res.status(201).json(recipe);
    } catch (error) {
      res.status(500).json({ message: "Failed to create recipe" });
    }
  });

  // ============================================================================
  // ONLINE ORDERING ROUTES
  // ============================================================================

  app.get("/api/online-order-sources", async (req, res) => {
    try {
      const { propertyId } = req.query;
      const sources = await storage.getOnlineOrderSources(propertyId as string);
      res.json(sources);
    } catch (error) {
      res.status(500).json({ message: "Failed to get online order sources" });
    }
  });

  app.post("/api/online-order-sources", async (req, res) => {
    try {
      const source = await storage.createOnlineOrderSource(req.body);
      res.status(201).json(source);
    } catch (error) {
      res.status(500).json({ message: "Failed to create online order source" });
    }
  });

  app.get("/api/online-orders", async (req, res) => {
    try {
      const { propertyId, status, startDate, endDate } = req.query;
      const orders = await storage.getOnlineOrders(
        propertyId as string,
        status as string,
        startDate as string,
        endDate as string
      );
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to get online orders" });
    }
  });

  app.post("/api/online-orders", async (req, res) => {
    try {
      const order = await storage.createOnlineOrder(req.body);
      
      // Create manager alert for new order
      await storage.createManagerAlert({
        propertyId: req.body.propertyId,
        rvcId: req.body.rvcId,
        alertType: "security", // Using security as general notification
        severity: "info",
        title: "New Online Order",
        message: `New ${req.body.orderType} order from ${req.body.customerName || "Customer"}`,
        metadata: { orderId: order.id, externalOrderId: req.body.externalOrderId },
      });

      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to create online order" });
    }
  });

  app.put("/api/online-orders/:id", async (req, res) => {
    try {
      const order = await storage.updateOnlineOrder(req.params.id, req.body);
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to update online order" });
    }
  });

  app.post("/api/online-orders/:id/inject", async (req, res) => {
    try {
      const { employeeId } = req.body;
      const order = await storage.getOnlineOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      // Create a POS check from the online order
      const check = await storage.createCheck({
        rvcId: order.rvcId || undefined,
        employeeId,
        orderType: order.orderType === "delivery" ? "delivery" : "pickup",
        guestName: order.customerName,
        notes: `Online Order: ${order.externalOrderId}`,
      });

      // Add items from online order with tax snapshots
      const items = order.items as any[];
      for (const item of items) {
        const qty = item.quantity || 1;
        const taxSnapshot = await calculateTaxSnapshot(
          item.menuItemId,
          parseFloat(item.price || "0"),
          item.modifiers || [],
          qty
        );
        
        await storage.createCheckItem({
          checkId: check.id,
          menuItemId: item.menuItemId,
          menuItemName: item.name,
          unitPrice: item.price,
          quantity: qty,
          modifiers: item.modifiers || [],
          ...taxSnapshot,
        });
      }

      // Update online order with check link
      await storage.updateOnlineOrder(req.params.id, {
        checkId: check.id,
        status: "confirmed",
        confirmedAt: new Date(),
        injectedAt: new Date(),
        injectedById: employeeId,
      });

      // Recalculate check totals
      await recalculateCheckTotals(check.id);
      const updatedCheck = await storage.getCheck(check.id);

      res.json({ check: updatedCheck, order });
    } catch (error) {
      console.error("Inject online order error:", error);
      res.status(500).json({ message: "Failed to inject online order" });
    }
  });

  // ============================================================================
  // MANAGER ALERTS ROUTES
  // ============================================================================

  app.get("/api/manager-alerts", async (req, res) => {
    try {
      const { propertyId, alertType, read, acknowledged } = req.query;
      const alerts = await storage.getManagerAlerts(
        propertyId as string,
        alertType as string,
        read === "true" ? true : read === "false" ? false : undefined,
        acknowledged === "true" ? true : acknowledged === "false" ? false : undefined
      );
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get manager alerts" });
    }
  });

  app.get("/api/manager-alerts/unread-count/:propertyId", async (req, res) => {
    try {
      const count = await storage.getUnreadAlertCount(req.params.propertyId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  app.post("/api/manager-alerts/:id/read", async (req, res) => {
    try {
      const { employeeId } = req.body;
      const alert = await storage.updateManagerAlert(req.params.id, {
        read: true,
        readAt: new Date(),
        readById: employeeId,
      });
      res.json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark alert as read" });
    }
  });

  app.post("/api/manager-alerts/:id/acknowledge", async (req, res) => {
    try {
      const { employeeId, resolution } = req.body;
      const alert = await storage.updateManagerAlert(req.params.id, {
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedById: employeeId,
        resolution,
      });
      res.json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  // ============================================================================
  // ITEM AVAILABILITY / PREP COUNTDOWN ROUTES
  // ============================================================================

  app.get("/api/item-availability", async (req, res) => {
    try {
      const { propertyId, rvcId, businessDate } = req.query;
      const availability = await storage.getItemAvailability(
        propertyId as string,
        rvcId as string,
        businessDate as string
      );
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to get item availability" });
    }
  });

  app.post("/api/item-availability", async (req, res) => {
    try {
      const availability = await storage.createItemAvailability(req.body);
      res.status(201).json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to create item availability" });
    }
  });

  app.put("/api/item-availability/:id", async (req, res) => {
    try {
      const availability = await storage.updateItemAvailability(req.params.id, req.body);
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to update item availability" });
    }
  });

  app.post("/api/item-availability/:id/86", async (req, res) => {
    try {
      const { employeeId } = req.body;
      const availability = await storage.updateItemAvailability(req.params.id, {
        is86ed: true,
        isAvailable: false,
        eightySixedAt: new Date(),
        eightySixedById: employeeId,
        currentQuantity: 0,
      });

      // Get the menu item name for the alert
      const item = await storage.getItemAvailability(req.params.id);
      const menuItem = item?.menuItemId ? await storage.getMenuItem(item.menuItemId) : null;

      // Create alert
      if (item) {
        await storage.createManagerAlert({
          propertyId: item.propertyId,
          rvcId: item.rvcId || undefined,
          alertType: "inventory",
          severity: "warning",
          title: "Item 86'd",
          message: `${menuItem?.name || "Item"} has been 86'd (sold out)`,
          employeeId,
          metadata: { menuItemId: item.menuItemId },
        });
      }

      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to 86 item" });
    }
  });

  app.get("/api/prep-items", async (req, res) => {
    try {
      const { propertyId } = req.query;
      const items = await storage.getPrepItems(propertyId as string);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to get prep items" });
    }
  });

  app.post("/api/prep-items", async (req, res) => {
    try {
      const item = await storage.createPrepItem(req.body);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to create prep item" });
    }
  });

  app.post("/api/prep-items/:id/update-level", async (req, res) => {
    try {
      const { quantity, employeeId } = req.body;
      const item = await storage.updatePrepItem(req.params.id, {
        currentLevel: quantity,
        lastPrepAt: new Date(),
        lastPrepById: employeeId,
        lastPrepQuantity: quantity,
      });
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to update prep level" });
    }
  });

  // ============================================================================
  // LABOR FORECASTING ROUTES
  // ============================================================================

  app.get("/api/sales-forecasts", async (req, res) => {
    try {
      const { propertyId, startDate, endDate } = req.query;
      const forecasts = await storage.getSalesForecasts(
        propertyId as string,
        startDate as string,
        endDate as string
      );
      res.json(forecasts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get sales forecasts" });
    }
  });

  app.post("/api/sales-forecasts", async (req, res) => {
    try {
      const forecast = await storage.createSalesForecast(req.body);
      res.status(201).json(forecast);
    } catch (error) {
      res.status(500).json({ message: "Failed to create sales forecast" });
    }
  });

  app.post("/api/sales-forecasts/generate", async (req, res) => {
    try {
      const { propertyId, startDate, endDate } = req.body;
      
      // Simple forecast generation based on historical data
      const historicalData = await storage.getHistoricalSalesData(propertyId, 8); // Last 8 weeks
      
      const forecasts = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let date = start; date <= end; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = date.getDay();
        const dateStr = date.toISOString().split("T")[0];
        
        // Average sales for this day of week from historical data
        const dayData = historicalData.filter(d => new Date(d.businessDate).getDay() === dayOfWeek);
        const avgSales = dayData.length > 0 ? 
          dayData.reduce((sum, d) => sum + parseFloat(d.netSales || "0"), 0) / dayData.length : 
          1000; // Default if no history

        const forecast = await storage.createSalesForecast({
          propertyId,
          forecastDate: dateStr,
          dayOfWeek,
          projectedSales: avgSales.toFixed(2),
          projectedGuests: Math.round(avgSales / 15), // Assume $15 avg check
          projectedChecks: Math.round(avgSales / 25), // Assume $25 avg check
          confidence: "0.75",
        });
        forecasts.push(forecast);
      }

      res.json(forecasts);
    } catch (error) {
      console.error("Generate forecasts error:", error);
      res.status(500).json({ message: "Failed to generate forecasts" });
    }
  });

  app.get("/api/labor-forecasts", async (req, res) => {
    try {
      const { propertyId, startDate, endDate } = req.query;
      const forecasts = await storage.getLaborForecasts(
        propertyId as string,
        startDate as string,
        endDate as string
      );
      res.json(forecasts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get labor forecasts" });
    }
  });

  app.post("/api/labor-forecasts/generate", async (req, res) => {
    try {
      const { propertyId, startDate, endDate, targetLaborPercent } = req.body;
      
      // Get sales forecasts for the period
      const salesForecasts = await storage.getSalesForecasts(propertyId, startDate, endDate);
      const jobCodes = await storage.getJobCodes(propertyId);
      
      const laborForecasts = [];
      
      for (const salesForecast of salesForecasts) {
        const projectedSales = parseFloat(salesForecast.projectedSales || "0");
        const laborBudget = projectedSales * (targetLaborPercent / 100);
        
        for (const jobCode of jobCodes) {
          const hourlyRate = parseFloat(jobCode.hourlyRate || "15");
          const hoursNeeded = laborBudget / jobCodes.length / hourlyRate;
          
          const forecast = await storage.createLaborForecast({
            propertyId,
            forecastDate: salesForecast.forecastDate,
            jobCodeId: jobCode.id,
            totalHoursNeeded: hoursNeeded.toFixed(2),
            projectedLaborCost: (hoursNeeded * hourlyRate).toFixed(2),
            targetLaborPercent: targetLaborPercent.toString(),
          });
          laborForecasts.push(forecast);
        }
      }

      res.json(laborForecasts);
    } catch (error) {
      console.error("Generate labor forecasts error:", error);
      res.status(500).json({ message: "Failed to generate labor forecasts" });
    }
  });

  // ============================================================================
  // ACCOUNTING EXPORT ROUTES
  // ============================================================================

  app.get("/api/gl-mappings", async (req, res) => {
    try {
      const { propertyId, enterpriseId } = req.query;
      const mappings = await storage.getGlMappings(propertyId as string, enterpriseId as string);
      res.json(mappings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get GL mappings" });
    }
  });

  app.post("/api/gl-mappings", async (req, res) => {
    try {
      const mapping = await storage.createGlMapping(req.body);
      res.status(201).json(mapping);
    } catch (error) {
      res.status(500).json({ message: "Failed to create GL mapping" });
    }
  });

  app.get("/api/accounting-exports", async (req, res) => {
    try {
      const { propertyId } = req.query;
      const exports = await storage.getAccountingExports(propertyId as string);
      res.json(exports);
    } catch (error) {
      res.status(500).json({ message: "Failed to get accounting exports" });
    }
  });

  app.post("/api/accounting-exports/generate", async (req, res) => {
    try {
      const { propertyId, startDate, endDate, formatType, employeeId } = req.body;

      // Create export record
      const exportRecord = await storage.createAccountingExport({
        propertyId,
        exportType: "custom",
        formatType: formatType || "csv",
        startDate,
        endDate,
        status: "processing",
        generatedById: employeeId,
      });

      // Generate export data (simplified - would be more complex in production)
      const fiscalPeriods = await storage.getFiscalPeriods(propertyId, startDate, endDate);
      
      let totalRevenue = 0;
      let totalTax = 0;
      let rowCount = 0;

      for (const period of fiscalPeriods) {
        totalRevenue += parseFloat(period.netSales || "0");
        totalTax += parseFloat(period.taxCollected || "0");
        rowCount++;
      }

      // Update export record
      const updated = await storage.updateAccountingExport(exportRecord.id, {
        status: "completed",
        generatedAt: new Date(),
        totalRevenue: totalRevenue.toString(),
        totalTax: totalTax.toString(),
        rowCount,
      });

      res.json(updated);
    } catch (error) {
      console.error("Generate accounting export error:", error);
      res.status(500).json({ message: "Failed to generate accounting export" });
    }
  });

  // ============================================================================
  // OFFLINE ORDER QUEUE ROUTES
  // ============================================================================

  app.get("/api/offline-queue", async (req, res) => {
    try {
      const { propertyId, status } = req.query;
      const queue = await storage.getOfflineOrderQueue(propertyId as string, status as string);
      res.json(queue);
    } catch (error) {
      res.status(500).json({ message: "Failed to get offline queue" });
    }
  });

  app.post("/api/offline-queue", async (req, res) => {
    try {
      // Check for duplicate by localId
      const existing = await storage.getOfflineOrderByLocalId(req.body.localId);
      if (existing) {
        return res.json(existing); // Idempotent - return existing record
      }

      const queueItem = await storage.createOfflineOrderQueue(req.body);
      res.status(201).json(queueItem);
    } catch (error) {
      res.status(500).json({ message: "Failed to queue offline order" });
    }
  });

  app.post("/api/offline-queue/:id/sync", async (req, res) => {
    try {
      const queueItem = await storage.getOfflineOrderQueueItem(req.params.id);
      if (!queueItem) return res.status(404).json({ message: "Queue item not found" });

      // Attempt to sync
      await storage.updateOfflineOrderQueue(req.params.id, {
        status: "syncing",
        syncAttempts: (queueItem.syncAttempts || 0) + 1,
        lastSyncAttempt: new Date(),
      });

      try {
        // Create the actual check from the order data
        const orderData = queueItem.orderData as any;
        const check = await storage.createCheck({
          rvcId: queueItem.rvcId || undefined,
          employeeId: queueItem.employeeId || undefined,
          orderType: orderData.orderType,
          guestName: orderData.guestName,
          notes: orderData.notes,
        });

        // Add items with tax snapshots
        for (const item of orderData.items || []) {
          const qty = item.quantity || 1;
          const taxSnapshot = await calculateTaxSnapshot(
            item.menuItemId,
            parseFloat(item.unitPrice || "0"),
            item.modifiers || [],
            qty
          );
          
          await storage.createCheckItem({
            checkId: check.id,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItemName,
            unitPrice: item.unitPrice,
            quantity: qty,
            modifiers: item.modifiers,
            ...taxSnapshot,
          });
        }

        await recalculateCheckTotals(check.id);

        // Mark as synced
        await storage.updateOfflineOrderQueue(req.params.id, {
          status: "synced",
          syncedCheckId: check.id,
          syncedAt: new Date(),
        });

        const finalCheck = await storage.getCheck(check.id);
        res.json({ success: true, check: finalCheck });
      } catch (syncError: any) {
        await storage.updateOfflineOrderQueue(req.params.id, {
          status: "failed",
          errorMessage: syncError.message,
        });
        throw syncError;
      }
    } catch (error: any) {
      console.error("Sync offline order error:", error);
      res.status(500).json({ message: error.message || "Failed to sync offline order" });
    }
  });

  // ============================================================================
  // POS CUSTOMER MANAGEMENT
  // ============================================================================

  // Search for customers (loyalty members)
  app.get("/api/pos/customers/search", async (req, res) => {
    try {
      const { query, programId } = req.query;
      const members = await storage.getLoyaltyMembers(
        programId as string | undefined,
        query as string | undefined
      );
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to search customers" });
    }
  });

  // Get customer details with history
  app.get("/api/pos/customers/:id", async (req, res) => {
    try {
      const member = await storage.getLoyaltyMember(req.params.id);
      if (!member) return res.status(404).json({ message: "Customer not found" });

      // Get recent checks for this customer
      const recentChecks = await storage.getChecksByCustomer(member.id, 10);
      
      // Get items for each recent check
      const checksWithItems = await Promise.all(
        recentChecks.map(async (check) => {
          const items = await storage.getCheckItems(check.id);
          return { ...check, items };
        })
      );
      
      // Get loyalty transactions
      const transactions = await storage.getLoyaltyTransactionsByMember(member.id);
      
      // Get available rewards
      const rewards = await storage.getLoyaltyRewards(member.programId);
      const availableRewards = rewards.filter(r => 
        r.active && 
        (member.currentPoints || 0) >= (r.pointsCost || 0)
      );

      res.json({
        customer: member,
        recentChecks: checksWithItems,
        transactions,
        availableRewards,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get customer details" });
    }
  });

  // Attach customer to check
  app.post("/api/pos/checks/:checkId/customer", async (req, res) => {
    try {
      const { customerId } = req.body;
      const check = await storage.attachCustomerToCheck(req.params.checkId, customerId);
      if (!check) return res.status(404).json({ message: "Check not found" });
      res.json(check);
    } catch (error) {
      res.status(500).json({ message: "Failed to attach customer" });
    }
  });

  // Detach customer from check
  app.delete("/api/pos/checks/:checkId/customer", async (req, res) => {
    try {
      const check = await storage.detachCustomerFromCheck(req.params.checkId);
      if (!check) return res.status(404).json({ message: "Check not found" });
      res.json(check);
    } catch (error) {
      res.status(500).json({ message: "Failed to detach customer" });
    }
  });

  // Update customer profile from POS
  app.patch("/api/pos/customers/:id", async (req, res) => {
    try {
      const { firstName, lastName, phone, email, notes } = req.body;
      const updated = await storage.updateLoyaltyMember(req.params.id, {
        firstName,
        lastName,
        phone,
        email,
        notes,
      });
      if (!updated) return res.status(404).json({ message: "Customer not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  // Add manual points to customer
  app.post("/api/pos/customers/:id/add-points", async (req, res) => {
    try {
      const { points, reason, employeeId } = req.body;
      const member = await storage.getLoyaltyMember(req.params.id);
      if (!member) return res.status(404).json({ message: "Customer not found" });

      const pointsBefore = member.currentPoints || 0;
      const pointsAfter = pointsBefore + points;
      const lifetimeBefore = member.lifetimePoints || 0;
      const lifetimeAfter = lifetimeBefore + (points > 0 ? points : 0);

      // Update member points
      await storage.updateLoyaltyMember(member.id, {
        currentPoints: pointsAfter,
        lifetimePoints: lifetimeAfter,
      });

      // Create transaction record
      const transaction = await storage.createLoyaltyTransaction({
        memberId: member.id,
        transactionType: "adjust",
        points,
        pointsBefore,
        pointsAfter,
        employeeId,
        reason: reason || "Manual adjustment from POS",
      });

      res.json({ 
        success: true, 
        transaction,
        newBalance: pointsAfter,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to add points" });
    }
  });

  // Get customer's last order for reorder
  app.get("/api/pos/customers/:id/last-order", async (req, res) => {
    try {
      const checks = await storage.getChecksByCustomer(req.params.id, 1);
      if (checks.length === 0) {
        return res.json({ lastOrder: null, items: [] });
      }

      const lastCheck = checks[0];
      const items = await storage.getCheckItems(lastCheck.id);

      res.json({
        lastOrder: lastCheck,
        items: items.filter(i => !i.voided),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get last order" });
    }
  });

  // Reorder last order - copy items to current check
  app.post("/api/pos/checks/:checkId/reorder/:customerId", async (req, res) => {
    try {
      const { checkId, customerId } = req.params;
      
      // Get customer's last order
      const checks = await storage.getChecksByCustomer(customerId, 1);
      if (checks.length === 0) {
        return res.status(404).json({ message: "No previous orders found" });
      }

      const lastCheck = checks[0];
      const items = await storage.getCheckItems(lastCheck.id);
      const validItems = items.filter(i => !i.voided);

      // Add items to current check with tax snapshots
      // For reorders, we calculate fresh tax based on CURRENT menu item settings
      // (not the old order's settings, since prices/tax may have changed)
      for (const item of validItems) {
        const qty = item.quantity || 1;
        const taxSnapshot = await calculateTaxSnapshot(
          item.menuItemId,
          parseFloat(item.unitPrice || "0"),
          item.modifiers || [],
          qty
        );
        
        await storage.createCheckItem({
          checkId,
          menuItemId: item.menuItemId,
          menuItemName: item.menuItemName,
          unitPrice: item.unitPrice,
          quantity: qty,
          modifiers: item.modifiers,
          itemStatus: "active",
          ...taxSnapshot,
        });
      }

      await recalculateCheckTotals(checkId);
      const updatedCheck = await storage.getCheck(checkId);
      const newItems = await storage.getCheckItems(checkId);

      res.json({
        check: updatedCheck,
        items: newItems,
        itemsAdded: validItems.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder" });
    }
  });

  // ============================================================================
  // POS LOYALTY OPERATIONS
  // ============================================================================

  // Earn points on check payment
  app.post("/api/pos/loyalty/earn", async (req, res) => {
    try {
      const { checkId, customerId, employeeId } = req.body;
      
      const check = await storage.getCheck(checkId);
      if (!check) return res.status(404).json({ message: "Check not found" });
      
      const member = await storage.getLoyaltyMember(customerId);
      if (!member) return res.status(404).json({ message: "Customer not found" });

      // Get the loyalty program to determine points per dollar
      const programs = await storage.getLoyaltyPrograms();
      const program = programs.find(p => p.id === member.programId);
      if (!program) return res.status(404).json({ message: "Loyalty program not found" });

      const checkTotal = parseFloat(check.total || "0");
      const pointsPerDollar = parseFloat(program.pointsPerDollar || "1");
      const pointsEarned = Math.floor(checkTotal * pointsPerDollar);

      if (pointsEarned <= 0) {
        return res.json({ 
          success: true, 
          pointsEarned: 0,
          message: "No points earned",
        });
      }

      const pointsBefore = member.currentPoints || 0;
      const pointsAfter = pointsBefore + pointsEarned;
      const lifetimeBefore = member.lifetimePoints || 0;
      const lifetimeAfter = lifetimeBefore + pointsEarned;

      // Update member points
      await storage.updateLoyaltyMember(member.id, {
        currentPoints: pointsAfter,
        lifetimePoints: lifetimeAfter,
        lastVisitAt: new Date(),
      });

      // Update check with points earned
      await storage.updateCheck(checkId, {
        loyaltyPointsEarned: pointsEarned,
      });

      // Create transaction record
      const transaction = await storage.createLoyaltyTransaction({
        memberId: member.id,
        propertyId: undefined,
        transactionType: "earn",
        points: pointsEarned,
        pointsBefore,
        pointsAfter,
        checkId,
        checkTotal: check.total,
        employeeId,
        reason: `Earned on check #${check.checkNumber}`,
      });

      // Check for auto-award rewards
      const rewards = await storage.getLoyaltyRewards(member.programId);
      const memberTransactions = await storage.getLoyaltyTransactionsByMember(member.id);
      const autoAwardedRewards: string[] = [];
      
      for (const reward of rewards) {
        if (!reward.active || !reward.autoAwardAtPoints) continue;
        
        const threshold = reward.autoAwardAtPoints;
        if (lifetimeBefore < threshold && lifetimeAfter >= threshold) {
          if (reward.autoAwardOnce) {
            const alreadyAwarded = memberTransactions.some(
              t => t.reason?.includes(`Auto-awarded: ${reward.name}`)
            );
            if (alreadyAwarded) continue;
          }
          
          // Create auto-award transaction
          await storage.createLoyaltyTransaction({
            memberId: member.id,
            transactionType: "earn",
            points: 0,
            pointsBefore: pointsAfter,
            pointsAfter: pointsAfter,
            employeeId,
            reason: `Auto-awarded: ${reward.name} (reached ${threshold} lifetime points)`,
          });
          
          autoAwardedRewards.push(reward.name);
        }
      }

      // Check for available rewards to prompt
      const availableRewards = rewards.filter(r => 
        r.active && 
        (pointsAfter >= (r.pointsCost || 0))
      );

      // Broadcast real-time update to all connected clients
      broadcastLoyaltyUpdate(member.id, pointsAfter, lifetimeAfter);

      res.json({
        success: true,
        pointsEarned,
        newBalance: pointsAfter,
        lifetimePoints: lifetimeAfter,
        transaction,
        autoAwardedRewards,
        availableRewards,
      });
    } catch (error: any) {
      console.error("Loyalty earn error:", error);
      res.status(500).json({ message: error.message || "Failed to earn points" });
    }
  });

  // Get available rewards for customer
  app.get("/api/pos/loyalty/:customerId/available-rewards", async (req, res) => {
    try {
      const member = await storage.getLoyaltyMember(req.params.customerId);
      if (!member) return res.status(404).json({ message: "Customer not found" });

      const rewards = await storage.getLoyaltyRewards(member.programId);
      const availableRewards = rewards.filter(r => 
        r.active && 
        (member.currentPoints || 0) >= (r.pointsCost || 0)
      );

      res.json({
        currentPoints: member.currentPoints,
        availableRewards,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get available rewards" });
    }
  });

  // Redeem a reward on a check
  app.post("/api/pos/loyalty/redeem", async (req, res) => {
    try {
      const { customerId, rewardId, checkId, employeeId, propertyId } = req.body;

      const member = await storage.getLoyaltyMember(customerId);
      if (!member) return res.status(404).json({ message: "Customer not found" });

      const reward = await storage.getLoyaltyReward(rewardId);
      if (!reward) return res.status(404).json({ message: "Reward not found" });

      const check = await storage.getCheck(checkId);
      if (!check) return res.status(404).json({ message: "Check not found" });

      // Check if member has enough points
      const pointsCost = reward.pointsCost || 0;
      if ((member.currentPoints || 0) < pointsCost) {
        return res.status(400).json({ message: "Insufficient points" });
      }

      // Calculate discount amount
      let discountAmount = "0";
      if (reward.rewardType === "discount") {
        if (reward.discountAmount) {
          discountAmount = reward.discountAmount;
        } else if (reward.discountPercent) {
          const checkTotal = parseFloat(check.total || "0");
          const percent = parseFloat(reward.discountPercent);
          discountAmount = (checkTotal * percent / 100).toFixed(2);
        }
      }

      // Deduct points
      const pointsBefore = member.currentPoints || 0;
      const pointsAfter = pointsBefore - pointsCost;

      await storage.updateLoyaltyMember(member.id, {
        currentPoints: pointsAfter,
      });

      // Create redemption record
      const redemption = await storage.createLoyaltyRedemption({
        memberId: member.id,
        rewardId: reward.id,
        checkId,
        propertyId,
        pointsUsed: pointsCost,
        discountApplied: discountAmount,
        status: "applied",
        employeeId,
      });

      // Create loyalty transaction
      await storage.createLoyaltyTransaction({
        memberId: member.id,
        propertyId,
        transactionType: "redeem",
        points: -pointsCost,
        pointsBefore,
        pointsAfter,
        checkId,
        employeeId,
        reason: `Redeemed: ${reward.name}`,
      });

      // Update check loyalty points redeemed
      await storage.updateCheck(checkId, {
        loyaltyPointsRedeemed: (check.loyaltyPointsRedeemed || 0) + pointsCost,
      });

      // Update reward redemption count
      await storage.updateLoyaltyReward(reward.id, {
        redemptionCount: (reward.redemptionCount || 0) + 1,
      });

      res.json({
        success: true,
        redemption,
        discountAmount,
        newBalance: pointsAfter,
        reward,
      });
    } catch (error: any) {
      console.error("Loyalty redeem error:", error);
      res.status(500).json({ message: error.message || "Failed to redeem reward" });
    }
  });

  // Customer self-enrollment in loyalty program
  app.post("/api/pos/loyalty/enroll", async (req, res) => {
    try {
      const { programId, firstName, lastName, phone, email } = req.body;

      // Check if customer already exists
      const existingByPhone = phone ? await storage.getLoyaltyMemberByIdentifier(phone) : null;
      const existingByEmail = email ? await storage.getLoyaltyMemberByIdentifier(email) : null;

      if (existingByPhone || existingByEmail) {
        return res.status(400).json({ 
          message: "Customer already enrolled",
          existingMember: existingByPhone || existingByEmail,
        });
      }

      // Generate member number
      const memberNumber = `LM${Date.now().toString(36).toUpperCase()}`;

      const member = await storage.createLoyaltyMember({
        programId,
        memberNumber,
        firstName,
        lastName,
        phone,
        email,
        status: "active",
        currentPoints: 0,
        lifetimePoints: 0,
      });

      res.status(201).json({
        success: true,
        member,
        message: "Successfully enrolled in loyalty program",
      });
    } catch (error: any) {
      console.error("Enrollment error:", error);
      res.status(500).json({ message: error.message || "Failed to enroll" });
    }
  });

  // ============================================================================
  // POS GIFT CARD OPERATIONS
  // ============================================================================

  // Sell/activate a new gift card
  app.post("/api/pos/gift-cards/sell", async (req, res) => {
    try {
      const { cardNumber, initialBalance, propertyId, employeeId, checkId } = req.body;

      // Check if card already exists
      const existing = await storage.getGiftCardByNumber(cardNumber);
      if (existing) {
        return res.status(400).json({ message: "Gift card number already exists" });
      }

      // Create the gift card
      const giftCard = await storage.createGiftCard({
        cardNumber,
        propertyId,
        initialBalance,
        currentBalance: initialBalance,
        status: "active",
        activatedAt: new Date(),
        activatedById: employeeId,
      });

      // Create activation transaction
      await storage.createGiftCardTransaction({
        giftCardId: giftCard.id,
        transactionType: "activate",
        amount: initialBalance,
        balanceBefore: "0",
        balanceAfter: initialBalance,
        propertyId,
        checkId,
        employeeId,
        notes: "Initial activation",
      });

      res.status(201).json({
        success: true,
        giftCard,
        message: `Gift card activated with $${initialBalance} balance`,
      });
    } catch (error: any) {
      console.error("Gift card sell error:", error);
      res.status(500).json({ message: error.message || "Failed to activate gift card" });
    }
  });

  // Reload an existing gift card
  app.post("/api/pos/gift-cards/reload", async (req, res) => {
    try {
      const { cardNumber, amount, propertyId, employeeId, checkId } = req.body;

      const giftCard = await storage.getGiftCardByNumber(cardNumber);
      if (!giftCard) {
        return res.status(404).json({ message: "Gift card not found" });
      }

      if (giftCard.status !== "active") {
        return res.status(400).json({ message: `Gift card is ${giftCard.status}` });
      }

      const currentBalance = parseFloat(giftCard.currentBalance || "0");
      const reloadAmount = parseFloat(amount);
      const newBalance = (currentBalance + reloadAmount).toFixed(2);

      // Update gift card balance
      await storage.updateGiftCard(giftCard.id, {
        currentBalance: newBalance,
      });

      // Create reload transaction
      await storage.createGiftCardTransaction({
        giftCardId: giftCard.id,
        transactionType: "reload",
        amount,
        balanceBefore: giftCard.currentBalance,
        balanceAfter: newBalance,
        propertyId,
        checkId,
        employeeId,
        notes: `Reloaded $${amount}`,
      });

      res.json({
        success: true,
        cardNumber: giftCard.cardNumber,
        previousBalance: currentBalance.toFixed(2),
        reloadAmount: reloadAmount.toFixed(2),
        newBalance,
      });
    } catch (error: any) {
      console.error("Gift card reload error:", error);
      res.status(500).json({ message: error.message || "Failed to reload gift card" });
    }
  });

  // Check gift card balance
  app.get("/api/pos/gift-cards/balance/:cardNumber", async (req, res) => {
    try {
      const giftCard = await storage.getGiftCardByNumber(req.params.cardNumber);
      if (!giftCard) {
        return res.status(404).json({ message: "Gift card not found" });
      }

      // Get recent transactions
      const transactions = await storage.getGiftCardTransactions(giftCard.id);
      const recentTransactions = transactions.slice(0, 5);

      res.json({
        cardNumber: giftCard.cardNumber,
        currentBalance: giftCard.currentBalance,
        status: giftCard.status,
        activatedAt: giftCard.activatedAt,
        expiresAt: giftCard.expiresAt,
        recentTransactions,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check balance" });
    }
  });

  // Redeem gift card on a check
  app.post("/api/pos/gift-cards/redeem", async (req, res) => {
    try {
      const { cardNumber, amount, propertyId, employeeId, checkId, pin } = req.body;

      const giftCard = await storage.getGiftCardByNumber(cardNumber);
      if (!giftCard) {
        return res.status(404).json({ message: "Gift card not found" });
      }

      if (giftCard.status !== "active") {
        return res.status(400).json({ message: `Gift card is ${giftCard.status}` });
      }

      // Validate PIN if required
      if (giftCard.pin && giftCard.pin !== pin) {
        return res.status(401).json({ message: "Invalid PIN" });
      }

      const currentBalance = parseFloat(giftCard.currentBalance || "0");
      const redeemAmount = parseFloat(amount);

      if (redeemAmount > currentBalance) {
        return res.status(400).json({ 
          message: "Insufficient balance",
          currentBalance: currentBalance.toFixed(2),
          requestedAmount: redeemAmount.toFixed(2),
        });
      }

      const newBalance = (currentBalance - redeemAmount).toFixed(2);

      // Update gift card balance
      await storage.updateGiftCard(giftCard.id, {
        currentBalance: newBalance,
      });

      // Create redemption transaction
      const transaction = await storage.createGiftCardTransaction({
        giftCardId: giftCard.id,
        transactionType: "redeem",
        amount: `-${amount}`,
        balanceBefore: giftCard.currentBalance,
        balanceAfter: newBalance,
        propertyId,
        checkId,
        employeeId,
        notes: `Redeemed on check`,
      });

      res.json({
        success: true,
        transaction,
        amountRedeemed: redeemAmount.toFixed(2),
        remainingBalance: newBalance,
      });
    } catch (error: any) {
      console.error("Gift card redeem error:", error);
      res.status(500).json({ message: error.message || "Failed to redeem gift card" });
    }
  });

  return httpServer;
}
