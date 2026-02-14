import express, { type Express, type Request, type Response } from "express";
import { uberEatsIntegration } from "./integrations/uber-eats";
import { grubhubIntegration } from "./integrations/grubhub";
import { doorDashIntegration } from "./integrations/doordash";
import type { OnlineOrderSource, InsertOnlineOrder } from "@shared/schema";

type BroadcastFn = (event: { type: string; payload?: any }, channel?: string) => void;
type CalculateTaxSnapshotFn = (menuItemId: string, price: number, modifiers: any[], qty: number) => Promise<any>;
type RecalculateCheckTotalsFn = (checkId: string) => Promise<void>;

function getIntegrationForPlatform(platform: string): any {
  switch (platform) {
    case "ubereats":
    case "uber_eats":
      return uberEatsIntegration;
    case "grubhub":
      return grubhubIntegration;
    case "doordash":
      return doorDashIntegration;
    default:
      return null;
  }
}

function getSignatureHeader(platform: string, req: Request): string {
  switch (platform) {
    case "ubereats":
    case "uber_eats":
      return (req.headers["x-uber-signature"] as string) || "";
    case "grubhub":
      return (req.headers["x-grubhub-signature"] as string) || "";
    case "doordash":
      return (req.headers["x-doordash-signature"] as string) || "";
    default:
      return "";
  }
}

async function autoInjectOrder(
  order: any,
  source: OnlineOrderSource,
  storage: any,
  calculateTaxSnapshotFn: CalculateTaxSnapshotFn,
  recalculateCheckTotalsFn: RecalculateCheckTotalsFn,
  broadcastFn: BroadcastFn
): Promise<any> {
  try {
    const rvcId = source.defaultRvcId;
    if (!rvcId) {
      console.log("[delivery-platform] Cannot auto-inject: no defaultRvcId on source");
      return null;
    }

    const checkNumber = await storage.getNextCheckNumber(rvcId);
    const check = await storage.createCheck({
      rvcId,
      employeeId: "system",
      checkNumber,
      orderType: source.defaultOrderType || "delivery",
      status: "open",
      guestCount: 1,
      subtotal: "0",
      taxTotal: "0",
      total: "0",
      notes: `Online order from ${source.platform}: ${order.externalOrderId}`,
    });

    const orderItems = Array.isArray(order.items) ? order.items : (typeof order.items === "string" ? JSON.parse(order.items) : []);
    const mappings = await storage.getDeliveryPlatformItemMappings(source.id);

    for (const item of orderItems) {
      const mapping = mappings.find(
        (m: any) => m.externalItemId === item.externalItemId && m.mappingType === "menu_item"
      );

      let taxSnapshot = null;
      if (mapping?.localMenuItemId) {
        const modMappings = (item.modifiers || []).map((mod: any) => {
          const modMapping = mappings.find(
            (m: any) => m.externalModifierId === mod.externalModifierId && m.mappingType === "modifier"
          );
          return { priceDelta: mod.price || "0", localModifierId: modMapping?.localModifierId };
        });

        try {
          taxSnapshot = await calculateTaxSnapshotFn(
            mapping.localMenuItemId,
            parseFloat(item.unitPrice || "0"),
            modMappings,
            item.quantity || 1
          );
        } catch (err) {
          console.log("[delivery-platform] Tax calculation failed for item, continuing without tax:", err);
        }
      }

      await storage.createCheckItem({
        checkId: check.id,
        menuItemId: mapping?.localMenuItemId || null,
        name: item.name,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || "0",
        sent: false,
        voided: false,
        modifiers: (item.modifiers || []).map((mod: any) => ({
          name: mod.name,
          priceDelta: mod.price || "0",
          quantity: mod.quantity || 1,
        })),
        specialInstructions: item.specialInstructions || null,
        ...(taxSnapshot ? {
          taxGroupIdAtSale: taxSnapshot.taxGroupIdAtSale,
          taxModeAtSale: taxSnapshot.taxModeAtSale,
          taxRateAtSale: taxSnapshot.taxRateAtSale,
          taxAmount: taxSnapshot.taxAmount,
          taxableAmount: taxSnapshot.taxableAmount,
        } : {}),
      });
    }

    await recalculateCheckTotalsFn(check.id);

    const updatedOrder = await storage.updateOnlineOrder(order.id, {
      checkId: check.id,
      injectedAt: new Date(),
      status: "preparing",
    });

    broadcastFn({ type: "kds_update" }, rvcId);
    broadcastFn({ type: "check_update", payload: { checkId: check.id, status: "open", rvcId } }, rvcId);
    broadcastFn({ type: "online_order_updated", payload: { orderId: order.id, checkId: check.id, status: "preparing" } });

    console.log(`[delivery-platform] Auto-injected order ${order.id} as check ${check.id}`);
    return { check, order: updatedOrder };
  } catch (err) {
    console.error("[delivery-platform] Auto-inject failed:", err);
    return null;
  }
}

async function handleWebhook(
  platform: string,
  integration: any,
  req: Request,
  res: Response,
  storage: any,
  broadcastFn: BroadcastFn,
  calculateTaxSnapshotFn: CalculateTaxSnapshotFn,
  recalculateCheckTotalsFn: RecalculateCheckTotalsFn
) {
  try {
    const rawBody = req.body.toString();
    const signature = getSignatureHeader(platform, req);

    const sources = await storage.getOnlineOrderSourcesByPlatform(platform);
    const activeSources = sources.filter((s: OnlineOrderSource) => s.active);

    if (activeSources.length === 0) {
      console.log(`[delivery-platform] No active sources for platform ${platform}`);
      return res.status(200).json({ message: "No active sources" });
    }

    let matchedSource: OnlineOrderSource | null = null;
    for (const source of activeSources) {
      if (source.webhookSecret && signature) {
        const valid = integration.verifyWebhookSignature(rawBody, signature, source.webhookSecret);
        if (valid) {
          matchedSource = source;
          break;
        }
      } else {
        matchedSource = source;
        break;
      }
    }

    if (!matchedSource) {
      console.log(`[delivery-platform] No matching source found for ${platform} webhook (signature mismatch)`);
      return res.status(200).json({ message: "Signature verification failed" });
    }

    const payload = JSON.parse(rawBody);
    const parsedOrder = integration.parseOrder(payload, matchedSource);

    const existingOrder = await storage.getOnlineOrderByExternalId(parsedOrder.externalOrderId, matchedSource.id);
    if (existingOrder) {
      console.log(`[delivery-platform] Duplicate order ${parsedOrder.externalOrderId}, skipping`);
      return res.status(200).json({ message: "Order already exists" });
    }

    const orderData: InsertOnlineOrder = {
      propertyId: matchedSource.propertyId,
      rvcId: matchedSource.defaultRvcId || null,
      sourceId: matchedSource.id,
      externalOrderId: parsedOrder.externalOrderId,
      status: "received",
      orderType: parsedOrder.orderType,
      customerName: parsedOrder.customerName,
      customerPhone: parsedOrder.customerPhone,
      customerEmail: parsedOrder.customerEmail || null,
      deliveryAddress: parsedOrder.deliveryAddress || null,
      deliveryInstructions: parsedOrder.deliveryInstructions || null,
      scheduledTime: parsedOrder.scheduledTime || null,
      estimatedPrepMinutes: matchedSource.defaultPrepMinutes || 15,
      subtotal: parsedOrder.subtotal,
      taxTotal: parsedOrder.taxTotal,
      deliveryFee: parsedOrder.deliveryFee,
      serviceFee: parsedOrder.serviceFee,
      tip: parsedOrder.tip,
      total: parsedOrder.total,
      items: parsedOrder.items,
      rawPayload: parsedOrder.rawPayload,
    };

    const newOrder = await storage.createOnlineOrder(orderData);
    console.log(`[delivery-platform] Created online order ${newOrder.id} from ${platform} (external: ${parsedOrder.externalOrderId})`);

    if (matchedSource.autoAccept) {
      try {
        const prepMinutes = matchedSource.defaultPrepMinutes || 15;
        await integration.acceptOrder(matchedSource, parsedOrder.externalOrderId, prepMinutes);
        await storage.updateOnlineOrder(newOrder.id, {
          status: "confirmed",
          confirmedAt: new Date(),
        });
        console.log(`[delivery-platform] Auto-accepted order ${newOrder.id}`);
      } catch (err) {
        console.error(`[delivery-platform] Auto-accept failed for order ${newOrder.id}:`, err);
      }
    }

    if (matchedSource.autoInject) {
      await autoInjectOrder(newOrder, matchedSource, storage, calculateTaxSnapshotFn, recalculateCheckTotalsFn, broadcastFn);
    }

    broadcastFn({
      type: "online_order_received",
      payload: {
        orderId: newOrder.id,
        platform,
        externalOrderId: parsedOrder.externalOrderId,
        customerName: parsedOrder.customerName,
        orderType: parsedOrder.orderType,
        total: parsedOrder.total,
        sourceId: matchedSource.id,
      },
    });

    return res.status(200).json({ message: "OK" });
  } catch (err) {
    console.error(`[delivery-platform] Webhook error for ${platform}:`, err);
    return res.status(200).json({ message: "Error processing webhook" });
  }
}

export function registerDeliveryPlatformRoutes(
  app: Express,
  storage: any,
  broadcastFn: BroadcastFn,
  calculateTaxSnapshotFn: CalculateTaxSnapshotFn,
  recalculateCheckTotalsFn: RecalculateCheckTotalsFn
) {
  app.post("/api/webhooks/ubereats", express.raw({ type: '*/*' }), async (req: Request, res: Response) => {
    await handleWebhook("ubereats", uberEatsIntegration, req, res, storage, broadcastFn, calculateTaxSnapshotFn, recalculateCheckTotalsFn);
  });

  app.post("/api/webhooks/grubhub", express.raw({ type: '*/*' }), async (req: Request, res: Response) => {
    await handleWebhook("grubhub", grubhubIntegration, req, res, storage, broadcastFn, calculateTaxSnapshotFn, recalculateCheckTotalsFn);
  });

  app.post("/api/webhooks/doordash", express.raw({ type: '*/*' }), async (req: Request, res: Response) => {
    await handleWebhook("doordash", doorDashIntegration, req, res, storage, broadcastFn, calculateTaxSnapshotFn, recalculateCheckTotalsFn);
  });

  app.post("/api/delivery-platforms/:sourceId/test-connection", async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;
      const source = await storage.getOnlineOrderSource(sourceId);
      if (!source) {
        return res.status(404).json({ message: "Source not found" });
      }

      const integration = getIntegrationForPlatform(source.platform);
      if (!integration) {
        return res.status(400).json({ message: `Unsupported platform: ${source.platform}` });
      }

      const result = await integration.testConnection(source);

      await storage.updateOnlineOrderSource(sourceId, {
        connectionStatus: result.success ? "connected" : "error",
        lastConnectionTest: new Date(),
      });

      console.log(`[delivery-platform] Connection test for source ${sourceId}: ${result.success ? "success" : "failed"}`);
      return res.json(result);
    } catch (err: any) {
      console.error("[delivery-platform] Test connection error:", err);
      return res.status(500).json({ success: false, message: err.message || "Connection test failed" });
    }
  });

  app.post("/api/delivery-platforms/:sourceId/sync-menu", async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;
      const source = await storage.getOnlineOrderSource(sourceId);
      if (!source) {
        return res.status(404).json({ message: "Source not found" });
      }

      const integration = getIntegrationForPlatform(source.platform);
      if (!integration) {
        return res.status(400).json({ message: `Unsupported platform: ${source.platform}` });
      }

      const menuItemsList = await storage.getMenuItems();
      const propertyMenuItems = menuItemsList.filter((item: any) =>
        item.propertyId === source.propertyId || item.enterpriseId === source.enterpriseId
      );

      const modifierGroupsList = await storage.getModifierGroups();

      await integration.syncMenu(source, propertyMenuItems, modifierGroupsList);

      await storage.updateOnlineOrderSource(sourceId, {
        menuSyncStatus: "synced",
        lastMenuSyncAt: new Date(),
        menuSyncError: null,
      });

      console.log(`[delivery-platform] Menu synced for source ${sourceId}`);
      return res.json({ success: true, message: "Menu synced successfully" });
    } catch (err: any) {
      console.error("[delivery-platform] Menu sync error:", err);

      const { sourceId } = req.params;
      await storage.updateOnlineOrderSource(sourceId, {
        menuSyncStatus: "error",
        menuSyncError: err.message || "Menu sync failed",
      });

      return res.status(500).json({ success: false, message: err.message || "Menu sync failed" });
    }
  });

  app.post("/api/delivery-platforms/:sourceId/toggle-store", async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;
      const { online } = req.body;
      const source = await storage.getOnlineOrderSource(sourceId);
      if (!source) {
        return res.status(404).json({ message: "Source not found" });
      }

      const integration = getIntegrationForPlatform(source.platform);
      if (!integration) {
        return res.status(400).json({ message: `Unsupported platform: ${source.platform}` });
      }

      await integration.updateStoreStatus(source, online !== false);

      console.log(`[delivery-platform] Store toggled for source ${sourceId}: ${online !== false ? "online" : "offline"}`);
      return res.json({ success: true, online: online !== false });
    } catch (err: any) {
      console.error("[delivery-platform] Toggle store error:", err);
      return res.status(500).json({ success: false, message: err.message || "Failed to toggle store" });
    }
  });

  app.post("/api/delivery-platforms/orders/:orderId/accept", async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const { prepTimeMinutes } = req.body;

      const order = await storage.getOnlineOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const source = await storage.getOnlineOrderSource(order.sourceId);
      if (!source) {
        return res.status(404).json({ message: "Order source not found" });
      }

      const integration = getIntegrationForPlatform(source.platform);
      if (!integration) {
        return res.status(400).json({ message: `Unsupported platform: ${source.platform}` });
      }

      await integration.acceptOrder(source, order.externalOrderId, prepTimeMinutes || source.defaultPrepMinutes || 15);

      const updatedOrder = await storage.updateOnlineOrder(orderId, {
        status: "confirmed",
        confirmedAt: new Date(),
        estimatedPrepMinutes: prepTimeMinutes || source.defaultPrepMinutes || 15,
      });

      if (!order.checkId && source.autoInject) {
        await autoInjectOrder(updatedOrder || order, source, storage, calculateTaxSnapshotFn, recalculateCheckTotalsFn, broadcastFn);
      }

      broadcastFn({
        type: "online_order_updated",
        payload: { orderId, status: "confirmed", platform: source.platform },
      });

      console.log(`[delivery-platform] Order ${orderId} accepted`);
      return res.json(updatedOrder);
    } catch (err: any) {
      console.error("[delivery-platform] Accept order error:", err);
      return res.status(500).json({ message: err.message || "Failed to accept order" });
    }
  });

  app.post("/api/delivery-platforms/orders/:orderId/deny", async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;

      const order = await storage.getOnlineOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const source = await storage.getOnlineOrderSource(order.sourceId);
      if (!source) {
        return res.status(404).json({ message: "Order source not found" });
      }

      const integration = getIntegrationForPlatform(source.platform);
      if (!integration) {
        return res.status(400).json({ message: `Unsupported platform: ${source.platform}` });
      }

      await integration.denyOrder(source, order.externalOrderId, reason || "Order declined");

      const updatedOrder = await storage.updateOnlineOrder(orderId, {
        status: "cancelled",
      });

      broadcastFn({
        type: "online_order_updated",
        payload: { orderId, status: "cancelled", platform: source.platform },
      });

      console.log(`[delivery-platform] Order ${orderId} denied`);
      return res.json(updatedOrder);
    } catch (err: any) {
      console.error("[delivery-platform] Deny order error:", err);
      return res.status(500).json({ message: err.message || "Failed to deny order" });
    }
  });

  app.post("/api/delivery-platforms/orders/:orderId/ready", async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;

      const order = await storage.getOnlineOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const source = await storage.getOnlineOrderSource(order.sourceId);
      if (!source) {
        return res.status(404).json({ message: "Order source not found" });
      }

      const integration = getIntegrationForPlatform(source.platform);
      if (!integration) {
        return res.status(400).json({ message: `Unsupported platform: ${source.platform}` });
      }

      await integration.markReady(source, order.externalOrderId);

      const updatedOrder = await storage.updateOnlineOrder(orderId, {
        status: "ready",
        readyAt: new Date(),
      });

      broadcastFn({
        type: "online_order_updated",
        payload: { orderId, status: "ready", platform: source.platform },
      });

      console.log(`[delivery-platform] Order ${orderId} marked ready`);
      return res.json(updatedOrder);
    } catch (err: any) {
      console.error("[delivery-platform] Mark ready error:", err);
      return res.status(500).json({ message: err.message || "Failed to mark order ready" });
    }
  });

  app.post("/api/delivery-platforms/orders/:orderId/inject", async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;

      const order = await storage.getOnlineOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.checkId) {
        return res.status(400).json({ message: "Order already injected into POS" });
      }

      const source = order.sourceId ? await storage.getOnlineOrderSource(order.sourceId) : null;
      const rvcId = order.rvcId || source?.defaultRvcId;

      if (!rvcId) {
        return res.status(400).json({ message: "No RVC configured for this order" });
      }

      const checkNumber = await storage.getNextCheckNumber(rvcId);
      const check = await storage.createCheck({
        rvcId,
        employeeId: "system",
        checkNumber,
        orderType: order.orderType || "delivery",
        status: "open",
        guestCount: 1,
        subtotal: "0",
        taxTotal: "0",
        total: "0",
        notes: `Online order: ${order.externalOrderId}`,
      });

      const orderItems = Array.isArray(order.items) ? order.items : (typeof order.items === "string" ? JSON.parse(order.items) : []);
      const mappings = source ? await storage.getDeliveryPlatformItemMappings(source.id) : [];

      for (const item of orderItems) {
        const mapping = mappings.find(
          (m: any) => m.externalItemId === item.externalItemId && m.mappingType === "menu_item"
        );

        let taxSnapshot = null;
        if (mapping?.localMenuItemId) {
          const modMappings = (item.modifiers || []).map((mod: any) => {
            const modMapping = mappings.find(
              (m: any) => m.externalModifierId === mod.externalModifierId && m.mappingType === "modifier"
            );
            return { priceDelta: mod.price || "0", localModifierId: modMapping?.localModifierId };
          });

          try {
            taxSnapshot = await calculateTaxSnapshotFn(
              mapping.localMenuItemId,
              parseFloat(item.unitPrice || "0"),
              modMappings,
              item.quantity || 1
            );
          } catch (err) {
            console.log("[delivery-platform] Tax calculation failed for item:", err);
          }
        }

        await storage.createCheckItem({
          checkId: check.id,
          menuItemId: mapping?.localMenuItemId || null,
          name: item.name,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || "0",
          sent: false,
          voided: false,
          modifiers: (item.modifiers || []).map((mod: any) => ({
            name: mod.name,
            priceDelta: mod.price || "0",
            quantity: mod.quantity || 1,
          })),
          specialInstructions: item.specialInstructions || null,
          ...(taxSnapshot ? {
            taxGroupIdAtSale: taxSnapshot.taxGroupIdAtSale,
            taxModeAtSale: taxSnapshot.taxModeAtSale,
            taxRateAtSale: taxSnapshot.taxRateAtSale,
            taxAmount: taxSnapshot.taxAmount,
            taxableAmount: taxSnapshot.taxableAmount,
          } : {}),
        });
      }

      await recalculateCheckTotalsFn(check.id);

      const updatedOrder = await storage.updateOnlineOrder(orderId, {
        checkId: check.id,
        injectedAt: new Date(),
        status: "preparing",
      });

      broadcastFn({ type: "check_update", payload: { checkId: check.id, status: "open", rvcId } }, rvcId);
      broadcastFn({ type: "online_order_updated", payload: { orderId, checkId: check.id, status: "preparing" } });
      broadcastFn({ type: "kds_update" }, rvcId);

      console.log(`[delivery-platform] Order ${orderId} injected as check ${check.id}`);
      return res.json({ check, order: updatedOrder });
    } catch (err: any) {
      console.error("[delivery-platform] Inject order error:", err);
      return res.status(500).json({ message: err.message || "Failed to inject order" });
    }
  });

  app.get("/api/delivery-platforms/:sourceId/item-mappings", async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;
      const mappings = await storage.getDeliveryPlatformItemMappings(sourceId);
      return res.json(mappings);
    } catch (err: any) {
      console.error("[delivery-platform] Get item mappings error:", err);
      return res.status(500).json({ message: err.message || "Failed to get item mappings" });
    }
  });

  app.post("/api/delivery-platforms/:sourceId/item-mappings", async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;
      const mappingData = { ...req.body, sourceId };
      const mapping = await storage.createDeliveryPlatformItemMapping(mappingData);
      console.log(`[delivery-platform] Created item mapping ${mapping.id} for source ${sourceId}`);
      return res.json(mapping);
    } catch (err: any) {
      console.error("[delivery-platform] Create item mapping error:", err);
      return res.status(500).json({ message: err.message || "Failed to create item mapping" });
    }
  });

  app.delete("/api/delivery-platforms/item-mappings/:mappingId", async (req: Request, res: Response) => {
    try {
      const { mappingId } = req.params;
      const deleted = await storage.deleteDeliveryPlatformItemMapping(mappingId);
      if (!deleted) {
        return res.status(404).json({ message: "Mapping not found" });
      }
      console.log(`[delivery-platform] Deleted item mapping ${mappingId}`);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[delivery-platform] Delete item mapping error:", err);
      return res.status(500).json({ message: err.message || "Failed to delete item mapping" });
    }
  });

  console.log("[delivery-platform] Delivery platform routes registered");
}
