import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { resolveKdsTargetsForMenuItem, getActiveKdsDevices, getKdsStationTypes, getOrderDeviceSendMode } from "./kds-routing";
import {
  insertEnterpriseSchema, insertPropertySchema, insertRvcSchema, insertRoleSchema,
  insertEmployeeSchema, insertSluSchema, insertTaxGroupSchema, insertPrintClassSchema,
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
      const imported: any[] = [];
      for (const item of items) {
        const { id, ...data } = item;
        const newItem = await storage.createMenuItem({
          name: data.name,
          shortName: data.shortName || null,
          price: data.price,
          taxGroupId: data.taxGroupId || null,
          printClassId: data.printClassId || null,
          color: data.color || "#3B82F6",
          active: data.active !== false,
          enterpriseId: null,
          propertyId: null,
          rvcId: null,
        });
        imported.push(newItem);
      }
      res.status(201).json({ imported: imported.length, items: imported });
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

  // ============================================================================
  // ADMIN STATS ROUTE
  // ============================================================================

  app.get("/api/admin/stats", async (req, res) => {
    const stats = await storage.getAdminStats();
    res.json(stats);
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
    const layout = await storage.getDefaultPosLayout(req.params.rvcId);
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

  return httpServer;
}
