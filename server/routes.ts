import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { resolveKdsTargetsForMenuItem, getActiveKdsDevices, getKdsStationTypes, getOrderDeviceSendMode } from "./kds-routing";
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
} from "@shared/schema";
import { z } from "zod";

const clients: Map<string, Set<WebSocket>> = new Map();

function broadcastKdsUpdate(rvcId?: string) {
  const channel = rvcId || "all";
  const channelClients = clients.get(channel);
  if (channelClients) {
    channelClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "kds_update" }));
      }
    });
  }
  const allClients = clients.get("all");
  if (allClients) {
    allClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "kds_update" }));
      }
    });
  }
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

// Helper for dynamic order mode - adds item to a preview ticket for real-time KDS display
// Items remain unsent (sent=false) until explicit Send or Pay action
// All items for a check are consolidated onto a single preview ticket
async function addItemToPreviewTicket(
  checkId: string,
  item: any,
  rvc: any
): Promise<any> {
  const check = await storage.getCheck(checkId);
  if (!check) return item;

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

  // Add item to the preview ticket (createKdsTicketItem now handles duplicates)
  await storage.createKdsTicketItem(previewTicket.id, item.id);

  broadcastKdsUpdate(check.rvcId || undefined);
  return item;
}

// Helper to convert preview ticket to final when Send is pressed
// This creates a proper round, marks items as sent, and removes preview flag
async function finalizePreviewTicket(
  checkId: string,
  employeeId: string
): Promise<{ round: any; updatedItems: any[] } | null> {
  const check = await storage.getCheck(checkId);
  if (!check) return null;

  const previewTicket = await storage.getPreviewTicket(checkId);
  if (!previewTicket) return null;

  const rvc = await storage.getRvc(check.rvcId);
  if (!rvc) return null;

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
      if (employee.roleId) {
        privileges = await storage.getRolePrivileges(employee.roleId);
      }
      privileges = privileges.length > 0 ? privileges : [
        "fast_transaction", "send_to_kitchen", "void_unsent", "void_sent",
        "apply_discount", "admin_access", "kds_access", "manager_approval"
      ];

      res.json({ employee, privileges });
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
    const data = await storage.updateProperty(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });

  app.delete("/api/properties/:id", async (req, res) => {
    await storage.deleteProperty(req.params.id);
    res.status(204).send();
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
      const validated = insertEmployeeSchema.parse(req.body);
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
    const paidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
    res.json({ check: { ...check, paidAmount }, items });
  });

  app.post("/api/checks", async (req, res) => {
    try {
      const { rvcId, employeeId, orderType } = req.body;
      const checkNumber = await storage.getNextCheckNumber(rvcId);
      const check = await storage.createCheck({
        checkNumber,
        rvcId,
        employeeId,
        orderType: orderType || "dine_in",
        status: "open",
      });
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

      const item = await storage.createCheckItem({
        checkId,
        menuItemId,
        menuItemName,
        unitPrice,
        modifiers: modifiers || [],
        quantity: quantity || 1,
        itemStatus: itemStatus || "active", // 'pending' for items awaiting modifiers
        sent: false,
        voided: false,
      });

      // Check for dynamic order mode - add to preview ticket if RVC has dynamicOrderMode enabled
      // Items stay unsent until explicit Send action or payment
      let finalItem = item;
      const check = await storage.getCheck(checkId);
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
      }

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

      // Update modifiers and optionally itemStatus (for finalizing pending items)
      const updateData: { modifiers: any; itemStatus?: string } = { modifiers };
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
      const { tenderId, amount, employeeId } = req.body;

      const tender = await storage.getTender(tenderId);
      if (!tender) return res.status(400).json({ message: "Invalid tender" });

      const payment = await storage.createPayment({
        checkId,
        tenderId,
        tenderName: tender.name,
        amount,
        employeeId,
      });

      const check = await storage.getCheck(checkId);
      const items = await storage.getCheckItems(checkId);
      const payments = await storage.getPayments(checkId);
      const taxGroups = await storage.getTaxGroups();
      const menuItems = await storage.getMenuItems();

      const activeItems = items.filter((i) => !i.voided);
      let displaySubtotal = 0;  // What customer sees as subtotal
      let addOnTax = 0;
      
      for (const item of activeItems) {
        const unitPrice = parseFloat(item.unitPrice || "0");
        const modifierTotal = (item.modifiers || []).reduce(
          (mSum: number, mod: any) => mSum + parseFloat(mod.priceDelta || "0"),
          0
        );
        const itemTotal = (unitPrice + modifierTotal) * (item.quantity || 1);
        
        const menuItem = menuItems.find((mi) => mi.id === item.menuItemId);
        const taxGroup = taxGroups.find((tg) => tg.id === menuItem?.taxGroupId);
        const taxRate = parseFloat(taxGroup?.rate || "0");
        const taxMode = taxGroup?.taxMode || "add_on";
        
        if (taxMode === "inclusive") {
          // For inclusive tax, the item price already contains tax
          // Customer sees the full price, no separate tax line added
          displaySubtotal += itemTotal;
        } else {
          // For add-on tax, add item total and calculate tax separately
          displaySubtotal += itemTotal;
          addOnTax += itemTotal * taxRate;
        }
      }
      
      const subtotal = displaySubtotal;
      const tax = addOnTax;
      const total = displaySubtotal + addOnTax;
      const paidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

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

        const updatedCheck = await storage.updateCheck(checkId, {
          status: "closed",
          closedAt: new Date(),
          subtotal: subtotal.toString(),
          taxTotal: tax.toString(),
          total: total.toString(),
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
        return res.json({ ...updatedCheck, paidAmount });
      }

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
  // KDS ROUTES
  // ============================================================================

  app.get("/api/kds-tickets", async (req, res) => {
    const filters = {
      rvcId: req.query.rvcId as string | undefined,
      kdsDeviceId: req.query.kdsDeviceId as string | undefined,
      stationType: req.query.stationType as string | undefined,
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
      const { employeeId } = req.body;

      const updated = await storage.bumpKdsTicket(ticketId, employeeId);

      broadcastKdsUpdate();
      res.json(updated);
    } catch (error) {
      console.error("Bump error:", error);
      res.status(400).json({ message: "Failed to bump ticket" });
    }
  });

  // Bump all tickets for a station/RVC
  app.post("/api/kds-tickets/bump-all", async (req, res) => {
    try {
      const { employeeId, rvcId, stationType } = req.body;

      const tickets = await storage.getKdsTickets({ rvcId, stationType });
      const activeTickets = tickets.filter((t: any) => t.status === "active");
      
      let bumped = 0;
      for (const ticket of activeTickets) {
        await storage.bumpKdsTicket(ticket.id, employeeId);
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

      const updated = await storage.recallKdsTicket(ticketId);

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
  app.get("/api/reports/sales-summary", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      
      // Filter checks by date and property/rvc
      let filteredChecks = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        return true;
      });
      
      // Apply property filter (skip if "all" or empty)
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        filteredChecks = filteredChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      
      // Apply RVC filter (skip if "all" or empty)
      if (rvcId && rvcId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.rvcId === rvcId);
      }
      
      const closedChecks = filteredChecks.filter(c => c.status === "closed");
      const openChecks = filteredChecks.filter(c => c.status === "open");
      const closedCheckIds = closedChecks.map(c => c.id);
      
      // Get all check items to calculate actual item sales
      const allCheckItems = await storage.getAllCheckItems();
      const menuItemsInChecks = allCheckItems.filter(ci => 
        closedCheckIds.includes(ci.checkId) && !ci.voided
      );
      
      // Calculate base item sales
      const baseItemSales = menuItemsInChecks.reduce((sum, ci) => 
        sum + parseFloat(ci.unitPrice || "0") * (ci.quantity || 1), 0
      );
      
      // Calculate modifier upcharges from JSON modifiers field
      const modifierTotal = menuItemsInChecks.reduce((sum, ci) => {
        if (!ci.modifiers || !Array.isArray(ci.modifiers)) return sum;
        const modSum = (ci.modifiers as any[]).reduce((mSum, mod) => {
          return mSum + parseFloat(mod.priceDelta || "0");
        }, 0);
        return sum + modSum * (ci.quantity || 1);
      }, 0);
      
      const itemSales = baseItemSales + modifierTotal;
      
      const grossSales = closedChecks.reduce((sum, c) => sum + parseFloat(c.subtotal || "0"), 0);
      const serviceChargeTotal = closedChecks.reduce((sum, c) => sum + parseFloat(c.serviceChargeTotal || "0"), 0);
      const otherCharges = grossSales - itemSales - serviceChargeTotal;
      const totalDiscounts = closedChecks.reduce((sum, c) => sum + parseFloat(c.discountTotal || "0"), 0);
      const netSales = grossSales - totalDiscounts;
      const totalTax = closedChecks.reduce((sum, c) => sum + parseFloat(c.taxTotal || "0"), 0);
      const totalWithTax = closedChecks.reduce((sum, c) => sum + parseFloat(c.total || "0"), 0);
      const checkCount = closedChecks.length;
      const guestCount = closedChecks.reduce((sum, c) => sum + (c.guestCount || 1), 0);
      const avgCheck = checkCount > 0 ? netSales / checkCount : 0;
      const avgPerGuest = guestCount > 0 ? netSales / guestCount : 0;
      
      res.json({
        grossSales,
        itemSales,
        baseItemSales,
        modifierTotal,
        serviceChargeTotal,
        otherCharges,
        discountTotal: totalDiscounts,
        netSales,
        taxTotal: totalTax,
        totalWithTax,
        checkCount,
        guestCount,
        avgCheck,
        avgPerGuest,
        openCheckCount: openChecks.length,
      });
    } catch (error) {
      console.error("Sales summary error:", error);
      res.status(500).json({ message: "Failed to generate sales summary" });
    }
  });

  // Sales by Category (SLU)
  app.get("/api/reports/sales-by-category", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allMenuItems = await storage.getMenuItems();
      const allSlus = await storage.getSlus();
      const menuItemSluLinks = await storage.getMenuItemSlus();
      
      // Filter checks
      let filteredChecks = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        if (c.status !== "closed") return false;
        return true;
      });
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        filteredChecks = filteredChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.rvcId === rvcId);
      }
      
      // Get all check items for filtered checks
      const categoryTotals: Record<string, { name: string; quantity: number; sales: number }> = {};
      
      for (const check of filteredChecks) {
        const items = await storage.getCheckItems(check.id);
        for (const item of items) {
          if (item.voided) continue;
          
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
      }
      
      const result = Object.entries(categoryTotals)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.sales - a.sales);
      
      res.json(result);
    } catch (error) {
      console.error("Sales by category error:", error);
      res.status(500).json({ message: "Failed to generate category sales" });
    }
  });

  // Top Selling Items
  app.get("/api/reports/top-items", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, limit: limitParam } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      const limit = parseInt(limitParam as string) || 10;
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      
      let filteredChecks = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        if (c.status !== "closed") return false;
        return true;
      });
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        filteredChecks = filteredChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.rvcId === rvcId);
      }
      
      const itemTotals: Record<string, { name: string; quantity: number; sales: number }> = {};
      
      for (const check of filteredChecks) {
        const items = await storage.getCheckItems(check.id);
        for (const item of items) {
          if (item.voided) continue;
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
      }
      
      const result = Object.entries(itemTotals)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, limit);
      
      res.json(result);
    } catch (error) {
      console.error("Top items error:", error);
      res.status(500).json({ message: "Failed to generate top items" });
    }
  });

  // Tender Mix Report
  app.get("/api/reports/tender-mix", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      
      let filteredChecks = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        if (c.status !== "closed") return false;
        return true;
      });
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        filteredChecks = filteredChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.rvcId === rvcId);
      }
      
      const tenderTotals: Record<string, { name: string; count: number; amount: number }> = {};
      
      for (const check of filteredChecks) {
        const payments = await storage.getPayments(check.id);
        for (const payment of payments) {
          const id = payment.tenderId;
          if (!tenderTotals[id]) {
            tenderTotals[id] = { name: payment.tenderName, count: 0, amount: 0 };
          }
          tenderTotals[id].count += 1;
          tenderTotals[id].amount += parseFloat(payment.amount);
        }
      }
      
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
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
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

  // Discounts Report
  app.get("/api/reports/discounts", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const employees = await storage.getEmployees();
      
      let filteredChecks = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        if (c.status !== "closed") return false;
        return true;
      });
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        filteredChecks = filteredChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.rvcId === rvcId);
      }
      
      const discountsByEmployee: Record<string, { name: string; count: number; amount: number }> = {};
      let totalDiscountAmount = 0;
      let totalDiscountCount = 0;
      
      for (const check of filteredChecks) {
        const discountAmount = parseFloat(check.discountTotal || "0");
        if (discountAmount > 0) {
          totalDiscountAmount += discountAmount;
          totalDiscountCount += 1;
          
          // By employee who rang the check
          const empId = check.employeeId;
          const emp = employees.find(e => e.id === empId);
          const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
          if (!discountsByEmployee[empId]) {
            discountsByEmployee[empId] = { name: empName, count: 0, amount: 0 };
          }
          discountsByEmployee[empId].count += 1;
          discountsByEmployee[empId].amount += discountAmount;
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
      
      const result = openChecks.map(check => {
        const emp = employees.find(e => e.id === check.employeeId);
        const rvc = allRvcs.find(r => r.id === check.rvcId);
        const ageMinutes = check.openedAt 
          ? Math.floor((Date.now() - new Date(check.openedAt).getTime()) / 60000)
          : 0;
        
        return {
          id: check.id,
          checkNumber: check.checkNumber,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          rvcName: rvc?.name || "Unknown",
          tableNumber: check.tableNumber,
          total: parseFloat(check.total || "0"),
          ageMinutes,
          openedAt: check.openedAt,
        };
      }).sort((a, b) => b.ageMinutes - a.ageMinutes);
      
      res.json(result);
    } catch (error) {
      console.error("Open checks error:", error);
      res.status(500).json({ message: "Failed to generate open checks report" });
    }
  });

  // Sales by Employee
  app.get("/api/reports/sales-by-employee", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const employees = await storage.getEmployees();
      
      let filteredChecks = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        if (c.status !== "closed") return false;
        return true;
      });
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        filteredChecks = filteredChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.rvcId === rvcId);
      }
      
      const salesByEmployee: Record<string, { name: string; checkCount: number; netSales: number; avgCheck: number }> = {};
      
      for (const check of filteredChecks) {
        const empId = check.employeeId;
        const emp = employees.find(e => e.id === empId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
        const netSales = parseFloat(check.subtotal || "0") - parseFloat(check.discountTotal || "0");
        
        if (!salesByEmployee[empId]) {
          salesByEmployee[empId] = { name: empName, checkCount: 0, netSales: 0, avgCheck: 0 };
        }
        salesByEmployee[empId].checkCount += 1;
        salesByEmployee[empId].netSales += netSales;
      }
      
      // Calculate averages
      Object.values(salesByEmployee).forEach(emp => {
        emp.avgCheck = emp.checkCount > 0 ? emp.netSales / emp.checkCount : 0;
      });
      
      const result = Object.entries(salesByEmployee)
        .map(([id, data]) => ({ employeeId: id, ...data }))
        .sort((a, b) => b.netSales - a.netSales);
      
      res.json(result);
    } catch (error) {
      console.error("Sales by employee error:", error);
      res.status(500).json({ message: "Failed to generate sales by employee" });
    }
  });

  // Tender Detail Report - Individual payment transactions
  app.get("/api/reports/tender-detail", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, tenderId } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allPayments = await storage.getAllPayments();
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allTenders = await storage.getTenders();
      const employees = await storage.getEmployees();
      
      // Filter checks by date range and location - use openedAt for date filter
      let filteredCheckIds = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        if (c.status !== "closed") return false;
        return true;
      }).map(c => c.id);
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        const propertyChecks = allChecks.filter(c => propertyRvcs.includes(c.rvcId)).map(c => c.id);
        filteredCheckIds = filteredCheckIds.filter(id => propertyChecks.includes(id));
      }
      if (rvcId && rvcId !== "all") {
        const rvcChecks = allChecks.filter(c => c.rvcId === rvcId).map(c => c.id);
        filteredCheckIds = filteredCheckIds.filter(id => rvcChecks.includes(id));
      }
      
      // Get payments for those checks
      let payments = allPayments.filter(p => filteredCheckIds.includes(p.checkId));
      
      // Filter by specific tender if provided
      if (tenderId) {
        payments = payments.filter(p => p.tenderId === tenderId);
      }
      
      const result = payments.map(p => {
        const check = allChecks.find(c => c.id === p.checkId);
        const tender = allTenders.find(t => t.id === p.tenderId);
        const rvc = check ? allRvcs.find(r => r.id === check.rvcId) : null;
        const emp = check ? employees.find(e => e.id === check.employeeId) : null;
        
        return {
          id: p.id,
          checkNumber: check?.checkNumber || 0,
          tenderName: tender?.name || "Unknown",
          tenderType: tender?.type || "unknown",
          amount: parseFloat(p.amount || "0"),
          tipAmount: parseFloat(p.tipAmount || "0"),
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
        if (!summary[name]) {
          summary[name] = { count: 0, amount: 0, tips: 0 };
        }
        summary[name].count += 1;
        summary[name].amount += parseFloat(p.amount || "0");
        summary[name].tips += parseFloat(p.tipAmount || "0");
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

  // Menu Item Sales Report - Detailed item-level sales
  app.get("/api/reports/menu-item-sales", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, itemId } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allCheckItems = await storage.getAllCheckItems();
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const menuItems = await storage.getMenuItems();
      const slus = await storage.getSlus();
      const menuItemSlus = await storage.getMenuItemSlus();
      
      // Filter checks by date and location - use openedAt for date filter
      let filteredCheckIds = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        if (c.status !== "closed") return false;
        return true;
      }).map(c => c.id);
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        const propertyChecks = allChecks.filter(c => propertyRvcs.includes(c.rvcId)).map(c => c.id);
        filteredCheckIds = filteredCheckIds.filter(id => propertyChecks.includes(id));
      }
      if (rvcId && rvcId !== "all") {
        const rvcChecks = allChecks.filter(c => c.rvcId === rvcId).map(c => c.id);
        filteredCheckIds = filteredCheckIds.filter(id => rvcChecks.includes(id));
      }
      
      // Get check items
      let checkItems = allCheckItems.filter(ci => filteredCheckIds.includes(ci.checkId) && !ci.voided);
      
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

  // Category Sales Report - Detailed sales by SLU/category
  app.get("/api/reports/category-sales", async (req, res) => {
    try {
      const { propertyId, rvcId, startDate, endDate, categoryId } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const allCheckItems = await storage.getAllCheckItems();
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const menuItems = await storage.getMenuItems();
      const slus = await storage.getSlus();
      const menuItemSlus = await storage.getMenuItemSlus();
      
      // Filter checks by date and location - use openedAt for date filter
      let filteredCheckIds = allChecks.filter(c => {
        const checkDate = c.openedAt ? new Date(c.openedAt) : null;
        if (!checkDate) return false;
        if (checkDate < start || checkDate > end) return false;
        if (c.status !== "closed") return false;
        return true;
      }).map(c => c.id);
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        const propertyChecks = allChecks.filter(c => propertyRvcs.includes(c.rvcId)).map(c => c.id);
        filteredCheckIds = filteredCheckIds.filter(id => propertyChecks.includes(id));
      }
      if (rvcId && rvcId !== "all") {
        const rvcChecks = allChecks.filter(c => c.rvcId === rvcId).map(c => c.id);
        filteredCheckIds = filteredCheckIds.filter(id => rvcChecks.includes(id));
      }
      
      // Get check items
      const checkItems = allCheckItems.filter(ci => filteredCheckIds.includes(ci.checkId) && !ci.voided);
      
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
  app.get("/api/reports/hourly-sales", async (req, res) => {
    try {
      const { propertyId, rvcId, date } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const allChecks = await storage.getChecks();
      const allRvcs = await storage.getRvcs();
      const allProperties = await storage.getProperties();
      
      // Determine the timezone to use for hour conversion
      let timezone = "America/Los_Angeles"; // Default to PST
      if (propertyId && propertyId !== "all") {
        const property = allProperties.find(p => p.id === propertyId);
        if (property?.timezone) {
          timezone = property.timezone;
        }
      }
      
      let filteredChecks = allChecks.filter(c => {
        const checkDate = c.closedAt ? new Date(c.closedAt) : null;
        if (!checkDate) return false;
        if (checkDate < startOfDay || checkDate > endOfDay) return false;
        if (c.status !== "closed") return false;
        return true;
      });
      
      if (propertyId && propertyId !== "all") {
        const propertyRvcs = allRvcs.filter(r => r.propertyId === propertyId).map(r => r.id);
        filteredChecks = filteredChecks.filter(c => propertyRvcs.includes(c.rvcId));
      }
      if (rvcId && rvcId !== "all") {
        filteredChecks = filteredChecks.filter(c => c.rvcId === rvcId);
      }
      
      // Initialize hourly buckets (0-23)
      const hourlyData: { hour: number; sales: number; checkCount: number }[] = [];
      for (let h = 0; h < 24; h++) {
        hourlyData.push({ hour: h, sales: 0, checkCount: 0 });
      }
      
      for (const check of filteredChecks) {
        // Convert UTC time to local timezone to get correct hour
        const closedDate = new Date(check.closedAt!);
        const localTimeStr = closedDate.toLocaleString("en-US", { timeZone: timezone, hour: "numeric", hour12: false });
        const hour = parseInt(localTimeStr, 10);
        const netSales = parseFloat(check.subtotal || "0") - parseFloat(check.discountTotal || "0");
        hourlyData[hour].sales += netSales;
        hourlyData[hour].checkCount += 1;
      }
      
      res.json(hourlyData);
    } catch (error) {
      console.error("Hourly sales error:", error);
      res.status(500).json({ message: "Failed to generate hourly sales" });
    }
  });

  return httpServer;
}
