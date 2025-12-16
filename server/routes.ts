import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import {
  insertEnterpriseSchema, insertPropertySchema, insertRvcSchema, insertRoleSchema,
  insertEmployeeSchema, insertSluSchema, insertTaxGroupSchema, insertPrintClassSchema,
  insertOrderDeviceSchema, insertMenuItemSchema, insertModifierGroupSchema,
  insertTenderSchema, insertDiscountSchema, insertServiceChargeSchema,
  insertCheckSchema, insertCheckItemSchema, insertCheckPaymentSchema,
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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    let subscribedChannel: string | null = null;

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "subscribe" && data.channel === "kds") {
          subscribedChannel = data.rvcId || "all";
          if (!clients.has(subscribedChannel)) {
            clients.set(subscribedChannel, new Set());
          }
          clients.get(subscribedChannel)!.add(ws);
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

  // ============================================================================
  // MODIFIER GROUP ROUTES
  // ============================================================================

  app.get("/api/modifier-groups", async (req, res) => {
    const menuItemId = req.query.menuItemId as string | undefined;
    const data = await storage.getModifierGroups(menuItemId);
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
    await storage.deleteTaxGroup(req.params.id);
    res.status(204).send();
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
    await storage.deletePrintClass(req.params.id);
    res.status(204).send();
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
    const data = await storage.getChecks(rvcId, status);
    res.json(data);
  });

  app.get("/api/checks/:id", async (req, res) => {
    const check = await storage.getCheck(req.params.id);
    if (!check) return res.status(404).json({ message: "Check not found" });
    const items = await storage.getCheckItems(req.params.id);
    res.json({ check, items });
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
      const { menuItemId, menuItemName, unitPrice, modifiers, quantity } = req.body;

      const item = await storage.createCheckItem({
        checkId,
        menuItemId,
        menuItemName,
        unitPrice,
        modifiers: modifiers || [],
        quantity: quantity || 1,
        sent: false,
        voided: false,
      });

      broadcastKdsUpdate();
      res.status(201).json(item);
    } catch (error) {
      console.error("Add item error:", error);
      res.status(400).json({ message: "Failed to add item" });
    }
  });

  app.post("/api/checks/:id/send", async (req, res) => {
    try {
      const checkId = req.params.id;
      const { employeeId } = req.body;

      const existingRounds = await storage.getRounds(checkId);
      const roundNumber = existingRounds.length + 1;

      const round = await storage.createRound({
        checkId,
        roundNumber,
        sentByEmployeeId: employeeId,
      });

      const items = await storage.getCheckItems(checkId);
      const unsentItems = items.filter((item) => !item.sent && !item.voided);

      const updatedItems = [];
      for (const item of unsentItems) {
        const updated = await storage.updateCheckItem(item.id, {
          sent: true,
          roundId: round.id,
        });
        if (updated) updatedItems.push(updated);
      }

      const check = await storage.getCheck(checkId);
      if (check) {
        const kdsTicket = await storage.createKdsTicket({
          checkId,
          roundId: round.id,
          status: "active",
        });
      }

      const allItems = await storage.getCheckItems(checkId);

      await storage.createAuditLog({
        rvcId: check?.rvcId,
        employeeId,
        action: "send_to_kitchen",
        targetType: "check",
        targetId: checkId,
        details: { roundNumber, itemCount: unsentItems.length },
      });

      broadcastKdsUpdate();
      res.json({ round, updatedItems: allItems });
    } catch (error) {
      console.error("Send error:", error);
      res.status(400).json({ message: "Failed to send order" });
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

      broadcastKdsUpdate();
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

      const activeItems = items.filter((i) => !i.voided);
      const subtotal = activeItems.reduce((sum, item) => {
        const unitPrice = parseFloat(item.unitPrice || "0");
        const modifierTotal = (item.modifiers || []).reduce(
          (mSum, mod) => mSum + parseFloat(mod.priceDelta || "0"),
          0
        );
        return sum + (unitPrice + modifierTotal) * (item.quantity || 1);
      }, 0);
      const tax = subtotal * 0.0825;
      const total = subtotal + tax;
      const paidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

      if (paidAmount >= total) {
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

        return res.json(updatedCheck);
      }

      res.json(check);
    } catch (error) {
      console.error("Payment error:", error);
      res.status(400).json({ message: "Payment failed" });
    }
  });

  // ============================================================================
  // KDS ROUTES
  // ============================================================================

  app.get("/api/kds-tickets", async (req, res) => {
    const rvcId = req.query.rvcId as string | undefined;
    const data = await storage.getKdsTickets(rvcId);
    res.json(data);
  });

  app.post("/api/kds-tickets/:id/bump", async (req, res) => {
    try {
      const ticketId = req.params.id;
      const { employeeId } = req.body;

      const updated = await storage.updateKdsTicket(ticketId, {
        status: "bumped",
        bumpedAt: new Date(),
        bumpedByEmployeeId: employeeId,
      });

      broadcastKdsUpdate();
      res.json(updated);
    } catch (error) {
      console.error("Bump error:", error);
      res.status(400).json({ message: "Failed to bump ticket" });
    }
  });

  // ============================================================================
  // ADMIN STATS ROUTE
  // ============================================================================

  app.get("/api/admin/stats", async (req, res) => {
    const stats = await storage.getAdminStats();
    res.json(stats);
  });

  return httpServer;
}
