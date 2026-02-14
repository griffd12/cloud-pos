import crypto from "crypto";
import type { OnlineOrderSource } from "@shared/schema";

export interface ParsedOrderModifier {
  externalModifierId: string;
  name: string;
  quantity: number;
  price: string;
}

export interface ParsedOrderItem {
  externalItemId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  modifiers: ParsedOrderModifier[];
  specialInstructions?: string;
}

export interface ParsedDeliveryOrder {
  externalOrderId: string;
  platform: string;
  orderType: 'pickup' | 'delivery';
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  scheduledTime?: Date;
  items: ParsedOrderItem[];
  subtotal: string;
  taxTotal: string;
  deliveryFee: string;
  serviceFee: string;
  tip: string;
  total: string;
  rawPayload: any;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const UBER_TOKEN_URL = "https://login.uber.com/oauth/v2/token";
const UBER_API_BASE = "https://api.uber.com";
const TOKEN_REFRESH_BUFFER_MS = 60_000;

class UberEatsIntegration {
  private tokenCache: Map<string, TokenCache> = new Map();

  async getAccessToken(source: OnlineOrderSource): Promise<string> {
    const cacheKey = source.id;
    const cached = this.tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }

    if (!source.clientId || !source.clientSecret) {
      throw new Error("[uber-eats] Missing clientId or clientSecret on source config");
    }

    console.log(`[uber-eats] Fetching new access token for source ${source.id}`);

    const params = new URLSearchParams({
      client_id: source.clientId,
      client_secret: source.clientSecret,
      grant_type: "client_credentials",
      scope: "eats.store eats.order eats.store.orders.read",
    });

    const response = await fetch(UBER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[uber-eats] Token request failed: ${response.status} ${errorBody}`);
      throw new Error(`[uber-eats] Failed to obtain access token: ${response.status}`);
    }

    const data = await response.json();
    const accessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 3600;

    this.tokenCache.set(cacheKey, {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    console.log(`[uber-eats] Access token obtained, expires in ${expiresIn}s`);
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
      console.error("[uber-eats] Webhook signature verification error:", err);
      return false;
    }
  }

  parseOrder(webhookPayload: any, source: OnlineOrderSource): ParsedDeliveryOrder {
    const order = webhookPayload?.meta?.resource_id
      ? webhookPayload
      : webhookPayload;

    const orderData = order.order || order;
    const eaterData = orderData.eater || {};
    const deliveryInfo = orderData.delivery_info || orderData.delivery || {};
    const cartData = orderData.cart || orderData;
    const paymentData = orderData.payment || {};

    const items: ParsedOrderItem[] = (cartData.items || []).map((item: any) => {
      const modifiers: ParsedOrderModifier[] = (item.selected_modifier_groups || []).flatMap(
        (group: any) =>
          (group.selected_items || []).map((mod: any) => ({
            externalModifierId: mod.id || mod.external_id || "",
            name: mod.title || mod.name || "",
            quantity: mod.quantity || 1,
            price: String(((mod.price?.unit_price?.amount || 0) / 100).toFixed(2)),
          }))
      );

      return {
        externalItemId: item.id || item.external_id || "",
        name: item.title || item.name || "",
        quantity: item.quantity || 1,
        unitPrice: String(((item.price?.unit_price?.amount || 0) / 100).toFixed(2)),
        modifiers,
        specialInstructions: item.special_instructions || item.special_request || undefined,
      };
    });

    const orderType: 'pickup' | 'delivery' =
      (orderData.type === "PICK_UP" || orderData.fulfillment_type === "PICK_UP")
        ? "pickup"
        : "delivery";

    const addressParts = deliveryInfo.location || deliveryInfo.address || {};
    const deliveryAddress = [
      addressParts.street_address || addressParts.address_1 || "",
      addressParts.city || "",
      addressParts.state || "",
      addressParts.zip_code || addressParts.postal_code || "",
    ]
      .filter(Boolean)
      .join(", ") || undefined;

    const scheduledTimeRaw = orderData.placed_at || orderData.estimated_ready_for_pickup_at;

    return {
      externalOrderId: orderData.id || orderData.display_id || "",
      platform: "uber_eats",
      orderType,
      customerName: [eaterData.first_name, eaterData.last_name].filter(Boolean).join(" ") || "Guest",
      customerPhone: eaterData.phone?.number || eaterData.phone || "",
      customerEmail: eaterData.email || undefined,
      deliveryAddress,
      deliveryInstructions: deliveryInfo.notes || deliveryInfo.delivery_instructions || undefined,
      scheduledTime: scheduledTimeRaw ? new Date(scheduledTimeRaw) : undefined,
      items,
      subtotal: String(((paymentData.charges?.sub_total?.amount || 0) / 100).toFixed(2)),
      taxTotal: String(((paymentData.charges?.tax?.amount || 0) / 100).toFixed(2)),
      deliveryFee: String(((paymentData.charges?.delivery_fee?.amount || 0) / 100).toFixed(2)),
      serviceFee: String(((paymentData.charges?.small_order_fee?.amount || 0) / 100).toFixed(2)),
      tip: String(((paymentData.charges?.tip?.amount || 0) / 100).toFixed(2)),
      total: String(((paymentData.charges?.total?.amount || 0) / 100).toFixed(2)),
      rawPayload: webhookPayload,
    };
  }

  async acceptOrder(
    source: OnlineOrderSource,
    externalOrderId: string,
    prepTimeMinutes: number
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const url = `${UBER_API_BASE}/v1/eats/orders/${externalOrderId}/accept_pos_order`;

    console.log(`[uber-eats] Accepting order ${externalOrderId} with ${prepTimeMinutes}min prep time`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: "accepted",
        estimated_prep_time: prepTimeMinutes,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[uber-eats] Accept order failed: ${response.status} ${errorBody}`);
      throw new Error(`[uber-eats] Failed to accept order ${externalOrderId}: ${response.status}`);
    }

    console.log(`[uber-eats] Order ${externalOrderId} accepted`);
  }

  async denyOrder(
    source: OnlineOrderSource,
    externalOrderId: string,
    reason: string
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const url = `${UBER_API_BASE}/v1/eats/orders/${externalOrderId}/deny_pos_order`;

    console.log(`[uber-eats] Denying order ${externalOrderId}: ${reason}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: {
          explanation: reason,
          code: "STORE_CLOSED",
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[uber-eats] Deny order failed: ${response.status} ${errorBody}`);
      throw new Error(`[uber-eats] Failed to deny order ${externalOrderId}: ${response.status}`);
    }

    console.log(`[uber-eats] Order ${externalOrderId} denied`);
  }

  async markReady(
    source: OnlineOrderSource,
    externalOrderId: string
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const url = `${UBER_API_BASE}/v1/eats/orders/${externalOrderId}/ready_for_pickup`;

    console.log(`[uber-eats] Marking order ${externalOrderId} ready for pickup`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[uber-eats] Mark ready failed: ${response.status} ${errorBody}`);
      throw new Error(`[uber-eats] Failed to mark order ${externalOrderId} ready: ${response.status}`);
    }

    console.log(`[uber-eats] Order ${externalOrderId} marked ready`);
  }

  async syncMenu(
    source: OnlineOrderSource,
    menuItems: any[],
    modifierGroups: any[]
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const storeId = source.merchantStoreId;

    if (!storeId) {
      throw new Error("[uber-eats] Missing merchantStoreId on source config");
    }

    console.log(`[uber-eats] Syncing menu for store ${storeId}: ${menuItems.length} items, ${modifierGroups.length} modifier groups`);

    const uberModifierGroups = modifierGroups.map((group: any) => ({
      id: group.id,
      title: { translations: { en: group.name } },
      quantity_info: {
        quantity: {
          min_permitted: group.minSelect ?? group.required ? 1 : 0,
          max_permitted: group.maxSelect ?? 10,
        },
      },
      modifier_options: (group.modifiers || []).map((mod: any) => ({
        id: mod.id,
        title: { translations: { en: mod.name } },
        price_info: {
          price: Math.round(parseFloat(mod.priceDelta || mod.price || "0") * 100),
          overrides: [],
        },
        quantity_info: {
          quantity: { min_permitted: 0, max_permitted: 5 },
        },
      })),
    }));

    const uberMenuItems = menuItems.map((item: any) => ({
      id: item.id,
      title: { translations: { en: item.name } },
      description: { translations: { en: item.shortName || item.name } },
      price_info: {
        price: Math.round(parseFloat(item.price) * 100),
        overrides: [],
      },
      modifier_group_ids: {
        ids: (item.modifierGroupIds || []),
        overrides: [],
      },
      tax_info: {
        tax_rate: item.taxRate ? parseFloat(item.taxRate) : 0,
      },
      dish_info: { classifications: {} },
    }));

    const categories = [{
      id: "default_category",
      title: { translations: { en: "Menu" } },
      entities: uberMenuItems.map((item: any) => ({
        id: item.id,
        type: "ITEM",
      })),
    }];

    const menuPayload = {
      menus: [
        {
          id: "main_menu",
          title: { translations: { en: "Main Menu" } },
          service_availability: [
            {
              day_of_week: "monday",
              time_periods: [{ start_time: "00:00", end_time: "23:59" }],
            },
            {
              day_of_week: "tuesday",
              time_periods: [{ start_time: "00:00", end_time: "23:59" }],
            },
            {
              day_of_week: "wednesday",
              time_periods: [{ start_time: "00:00", end_time: "23:59" }],
            },
            {
              day_of_week: "thursday",
              time_periods: [{ start_time: "00:00", end_time: "23:59" }],
            },
            {
              day_of_week: "friday",
              time_periods: [{ start_time: "00:00", end_time: "23:59" }],
            },
            {
              day_of_week: "saturday",
              time_periods: [{ start_time: "00:00", end_time: "23:59" }],
            },
            {
              day_of_week: "sunday",
              time_periods: [{ start_time: "00:00", end_time: "23:59" }],
            },
          ],
          category_ids: categories.map((c) => c.id),
        },
      ],
      categories,
      items: uberMenuItems,
      modifier_groups: uberModifierGroups,
      display_options: { disable_item_instructions: false },
    };

    const url = `${UBER_API_BASE}/v2/eats/stores/${storeId}/menus`;

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
      console.error(`[uber-eats] Menu sync failed: ${response.status} ${errorBody}`);
      throw new Error(`[uber-eats] Failed to sync menu for store ${storeId}: ${response.status}`);
    }

    console.log(`[uber-eats] Menu synced successfully for store ${storeId}`);
  }

  async updateStoreStatus(
    source: OnlineOrderSource,
    online: boolean
  ): Promise<void> {
    const token = await this.getAccessToken(source);
    const storeId = source.merchantStoreId;

    if (!storeId) {
      throw new Error("[uber-eats] Missing merchantStoreId on source config");
    }

    console.log(`[uber-eats] Setting store ${storeId} status to ${online ? "online" : "offline"}`);

    const url = `${UBER_API_BASE}/v1/eats/stores/${storeId}/status`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: online ? "ONLINE" : "OFFLINE",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[uber-eats] Store status update failed: ${response.status} ${errorBody}`);
      throw new Error(`[uber-eats] Failed to update store status: ${response.status}`);
    }

    console.log(`[uber-eats] Store ${storeId} is now ${online ? "online" : "offline"}`);
  }

  async testConnection(
    source: OnlineOrderSource
  ): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getAccessToken(source);

      const storeId = source.merchantStoreId;
      if (!storeId) {
        return { success: false, message: "Missing merchantStoreId in source configuration" };
      }

      const url = `${UBER_API_BASE}/v1/eats/stores/${storeId}`;
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

      const storeData = await response.json();
      return {
        success: true,
        message: `Connected to store "${storeData.name || storeId}" on Uber Eats`,
      };
    } catch (err: any) {
      console.error("[uber-eats] Connection test failed:", err);
      return {
        success: false,
        message: err.message || "Unknown error during connection test",
      };
    }
  }
}

export const uberEatsIntegration = new UberEatsIntegration();
