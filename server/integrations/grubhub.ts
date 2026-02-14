import crypto from "crypto";
import type { OnlineOrderSource } from "@shared/schema";
import type { ParsedDeliveryOrder, ParsedOrderItem, ParsedOrderModifier } from "./uber-eats";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const GRUBHUB_AUTH_URL = "https://api-gtm.grubhub.com/auth";
const GRUBHUB_API_BASE = "https://api-gtm.grubhub.com";
const TOKEN_REFRESH_BUFFER_MS = 60_000;

class GrubhubIntegration {
  private tokenCache: Map<string, TokenCache> = new Map();

  async getAccessToken(source: OnlineOrderSource): Promise<string> {
    const cacheKey = source.id;
    const cached = this.tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }

    if (!source.clientId || !source.clientSecret) {
      throw new Error("[grubhub] Missing clientId or clientSecret on source config");
    }

    console.log(`[grubhub] Fetching new access token for source ${source.id}`);

    const params = new URLSearchParams({
      client_id: source.clientId,
      client_secret: source.clientSecret,
      grant_type: "client_credentials",
    });

    const response = await fetch(GRUBHUB_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[grubhub] Token request failed: ${response.status} ${errorBody}`);
      throw new Error(`[grubhub] Failed to obtain access token: ${response.status}`);
    }

    const data = await response.json();
    const accessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 3600;

    this.tokenCache.set(cacheKey, {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    console.log(`[grubhub] Access token obtained, expires in ${expiresIn}s`);
    return accessToken;
  }

  verifyWebhookSignature(payload: string, signature: string, webhookSecret: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

      return crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch (err) {
      console.error("[grubhub] Webhook signature verification error:", err);
      return false;
    }
  }

  parseOrder(webhookPayload: any, source: OnlineOrderSource): ParsedDeliveryOrder {
    const orderData = webhookPayload?.order || webhookPayload;
    const customerData = orderData.customer || orderData.diner || {};
    const deliveryInfo = orderData.delivery_info || orderData.delivery || {};
    const cartData = orderData.line_items || orderData.items || orderData.cart?.items || [];
    const totalsData = orderData.totals || orderData.pricing || {};

    const items: ParsedOrderItem[] = cartData.map((item: any) => {
      const modifiers: ParsedOrderModifier[] = (item.options || item.modifiers || item.selected_modifiers || []).map(
        (mod: any) => ({
          externalModifierId: mod.id || mod.external_id || "",
          name: mod.name || mod.title || "",
          quantity: mod.quantity || 1,
          price: String(parseFloat(mod.price || mod.unit_price || "0").toFixed(2)),
        })
      );

      return {
        externalItemId: item.id || item.external_id || item.menu_item_id || "",
        name: item.name || item.title || "",
        quantity: item.quantity || 1,
        unitPrice: String(parseFloat(item.price || item.unit_price || "0").toFixed(2)),
        modifiers,
        specialInstructions: item.special_instructions || item.notes || undefined,
      };
    });

    const orderType: "pickup" | "delivery" =
      (orderData.order_type === "pickup" ||
        orderData.fulfillment_type === "PICKUP" ||
        orderData.when_for === "PICKUP")
        ? "pickup"
        : "delivery";

    const addressData = deliveryInfo.address || deliveryInfo.destination || customerData.address || {};
    const deliveryAddress = [
      addressData.street_address || addressData.address_1 || addressData.line1 || "",
      addressData.city || "",
      addressData.state || "",
      addressData.zip || addressData.zip_code || addressData.postal_code || "",
    ]
      .filter(Boolean)
      .join(", ") || undefined;

    const scheduledTimeRaw = orderData.scheduled_time || orderData.when_for_time || orderData.estimated_pickup_time;

    return {
      externalOrderId: orderData.id || orderData.order_id || orderData.external_id || "",
      platform: "grubhub",
      orderType,
      customerName: [customerData.first_name, customerData.last_name].filter(Boolean).join(" ") || customerData.name || "Guest",
      customerPhone: customerData.phone || customerData.phone_number || "",
      customerEmail: customerData.email || undefined,
      deliveryAddress,
      deliveryInstructions: deliveryInfo.instructions || deliveryInfo.notes || deliveryInfo.delivery_instructions || undefined,
      scheduledTime: scheduledTimeRaw ? new Date(scheduledTimeRaw) : undefined,
      items,
      subtotal: String(parseFloat(totalsData.subtotal || totalsData.food_sales || "0").toFixed(2)),
      taxTotal: String(parseFloat(totalsData.tax || totalsData.sales_tax || "0").toFixed(2)),
      deliveryFee: String(parseFloat(totalsData.delivery_fee || "0").toFixed(2)),
      serviceFee: String(parseFloat(totalsData.service_fee || totalsData.processing_fee || "0").toFixed(2)),
      tip: String(parseFloat(totalsData.tip || totalsData.driver_tip || "0").toFixed(2)),
      total: String(parseFloat(totalsData.total || "0").toFixed(2)),
      rawPayload: webhookPayload,
    };
  }

  async acceptOrder(
    source: OnlineOrderSource,
    externalOrderId: string,
    prepTimeMinutes: number
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const url = `${GRUBHUB_API_BASE}/fulfillment/v1/orders/${externalOrderId}/confirm`;

    console.log(`[grubhub] Accepting order ${externalOrderId} with ${prepTimeMinutes}min prep time`);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prep_time_minutes: prepTimeMinutes,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[grubhub] Accept order failed: ${response.status} ${errorBody}`);
      throw new Error(`[grubhub] Failed to accept order ${externalOrderId}: ${response.status}`);
    }

    console.log(`[grubhub] Order ${externalOrderId} accepted`);
  }

  async denyOrder(
    source: OnlineOrderSource,
    externalOrderId: string,
    reason: string
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const url = `${GRUBHUB_API_BASE}/fulfillment/v1/orders/${externalOrderId}/reject`;

    console.log(`[grubhub] Denying order ${externalOrderId}: ${reason}`);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reject_reason: reason,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[grubhub] Deny order failed: ${response.status} ${errorBody}`);
      throw new Error(`[grubhub] Failed to deny order ${externalOrderId}: ${response.status}`);
    }

    console.log(`[grubhub] Order ${externalOrderId} denied`);
  }

  async markReady(
    source: OnlineOrderSource,
    externalOrderId: string
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const url = `${GRUBHUB_API_BASE}/fulfillment/v1/orders/${externalOrderId}/ready`;

    console.log(`[grubhub] Marking order ${externalOrderId} ready for pickup`);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[grubhub] Mark ready failed: ${response.status} ${errorBody}`);
      throw new Error(`[grubhub] Failed to mark order ${externalOrderId} ready: ${response.status}`);
    }

    console.log(`[grubhub] Order ${externalOrderId} marked ready`);
  }

  async syncMenu(
    source: OnlineOrderSource,
    menuItems: any[],
    modifierGroups: any[]
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const restaurantId = source.merchantStoreId;

    if (!restaurantId) {
      throw new Error("[grubhub] Missing merchantStoreId on source config");
    }

    console.log(`[grubhub] Syncing menu for restaurant ${restaurantId}: ${menuItems.length} items, ${modifierGroups.length} modifier groups`);

    const ghModifierGroups = modifierGroups.map((group: any) => ({
      id: group.id,
      name: group.name,
      min_selections: group.minSelect ?? (group.required ? 1 : 0),
      max_selections: group.maxSelect ?? 10,
      modifiers: (group.modifiers || []).map((mod: any) => ({
        id: mod.id,
        name: mod.name,
        price: {
          amount: Math.round(parseFloat(mod.priceDelta || mod.price || "0") * 100),
          currency: "USD",
        },
        min_quantity: 0,
        max_quantity: 5,
      })),
    }));

    const ghMenuItems = menuItems.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.shortName || item.name,
      price: {
        amount: Math.round(parseFloat(item.price) * 100),
        currency: "USD",
      },
      modifier_group_ids: item.modifierGroupIds || [],
      tax_rate: item.taxRate ? parseFloat(item.taxRate) : 0,
      available: item.active !== false,
    }));

    const categories = [{
      id: "default_category",
      name: "Menu",
      items: ghMenuItems.map((item: any) => ({ id: item.id })),
    }];

    const menuPayload = {
      menus: [
        {
          id: "main_menu",
          name: "Main Menu",
          categories,
          availability: {
            schedule: [
              { day: "MONDAY", from: "00:00", to: "23:59" },
              { day: "TUESDAY", from: "00:00", to: "23:59" },
              { day: "WEDNESDAY", from: "00:00", to: "23:59" },
              { day: "THURSDAY", from: "00:00", to: "23:59" },
              { day: "FRIDAY", from: "00:00", to: "23:59" },
              { day: "SATURDAY", from: "00:00", to: "23:59" },
              { day: "SUNDAY", from: "00:00", to: "23:59" },
            ],
          },
        },
      ],
      items: ghMenuItems,
      modifier_groups: ghModifierGroups,
    };

    const url = `${GRUBHUB_API_BASE}/menus/v1/restaurants/${restaurantId}/menus`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(menuPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[grubhub] Menu sync failed: ${response.status} ${errorBody}`);
      throw new Error(`[grubhub] Failed to sync menu for restaurant ${restaurantId}: ${response.status}`);
    }

    console.log(`[grubhub] Menu synced successfully for restaurant ${restaurantId}`);
  }

  async updateStoreStatus(
    source: OnlineOrderSource,
    online: boolean
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const restaurantId = source.merchantStoreId;

    if (!restaurantId) {
      throw new Error("[grubhub] Missing merchantStoreId on source config");
    }

    console.log(`[grubhub] Setting restaurant ${restaurantId} status to ${online ? "online" : "offline"}`);

    const url = `${GRUBHUB_API_BASE}/restaurants/v1/restaurants/${restaurantId}/availability`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        available: online,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[grubhub] Store status update failed: ${response.status} ${errorBody}`);
      throw new Error(`[grubhub] Failed to update store status: ${response.status}`);
    }

    console.log(`[grubhub] Restaurant ${restaurantId} is now ${online ? "online" : "offline"}`);
  }

  async testConnection(
    source: OnlineOrderSource
  ): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getAccessToken(source);

      const restaurantId = source.merchantStoreId;
      if (!restaurantId) {
        return { success: false, message: "Missing merchantStoreId in source configuration" };
      }

      const url = `${GRUBHUB_API_BASE}/restaurants/v1/restaurants/${restaurantId}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          message: `API returned ${response.status}: ${errorBody}`,
        };
      }

      const restaurantData = await response.json();
      return {
        success: true,
        message: `Connected to restaurant "${restaurantData.name || restaurantId}" on Grubhub`,
      };
    } catch (err: any) {
      console.error("[grubhub] Connection test failed:", err);
      return {
        success: false,
        message: err.message || "Unknown error during connection test",
      };
    }
  }
}

export const grubhubIntegration = new GrubhubIntegration();
