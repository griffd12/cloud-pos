import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { OnlineOrderSource } from "@shared/schema";
import type { ParsedDeliveryOrder, ParsedOrderItem, ParsedOrderModifier } from "./uber-eats";

const DOORDASH_API_BASE = "https://openapi.doordash.com";

class DoorDashIntegration {
  generateJWT(source: OnlineOrderSource): string {
    if (!source.clientId || !source.clientSecret || !source.apiKeyPrefix) {
      throw new Error("[doordash] Missing clientId, clientSecret, or apiKeyPrefix on source config");
    }

    const developerId = source.clientId;
    const keyId = source.apiKeyPrefix;
    const signingSecret = source.clientSecret;

    const decodedSecret = Buffer.from(
      signingSecret.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    );

    const now = Math.floor(Date.now() / 1000);

    const token = jwt.sign(
      {
        aud: "doordash",
        iss: developerId,
        kid: keyId,
        exp: now + 300,
        iat: now,
      },
      decodedSecret,
      {
        algorithm: "HS256",
        header: {
          alg: "HS256",
          typ: "JWT",
          "dd-ver": "DD-JWT-V1",
        } as any,
      }
    );

    return token;
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
      console.error("[doordash] Webhook signature verification error:", err);
      return false;
    }
  }

  parseOrder(webhookPayload: any, source: OnlineOrderSource): ParsedDeliveryOrder {
    const delivery = webhookPayload.delivery || webhookPayload;
    const orderDetails = delivery.order_details || delivery;
    const customer = delivery.customer || orderDetails.customer || {};
    const pickup = delivery.pickup || orderDetails.pickup || {};
    const dropoff = delivery.dropoff || orderDetails.dropoff || {};

    const items: ParsedOrderItem[] = (orderDetails.items || orderDetails.order_items || []).map((item: any) => {
      const modifiers: ParsedOrderModifier[] = (item.options || item.modifiers || item.extras || []).map((mod: any) => ({
        externalModifierId: mod.id || mod.external_id || "",
        name: mod.name || mod.title || "",
        quantity: mod.quantity || 1,
        price: String(parseFloat(mod.price || mod.unit_price || "0").toFixed(2)),
      }));

      return {
        externalItemId: item.id || item.external_id || "",
        name: item.name || item.title || "",
        quantity: item.quantity || 1,
        unitPrice: String(parseFloat(item.price || item.unit_price || "0").toFixed(2)),
        modifiers,
        specialInstructions: item.special_instructions || item.notes || undefined,
      };
    });

    const isPickup =
      delivery.order_type === "pickup" ||
      delivery.fulfillment_type === "pickup" ||
      !dropoff.address;

    const addressParts = dropoff.address || dropoff.location || {};
    const deliveryAddress = typeof addressParts === "string"
      ? addressParts
      : [
          addressParts.street || addressParts.street_address || "",
          addressParts.city || "",
          addressParts.state || "",
          addressParts.zip_code || addressParts.postal_code || "",
        ]
          .filter(Boolean)
          .join(", ") || undefined;

    const subtotal = parseFloat(orderDetails.subtotal || delivery.subtotal || "0");
    const tax = parseFloat(orderDetails.tax || delivery.tax || "0");
    const deliveryFeeVal = parseFloat(orderDetails.delivery_fee || delivery.fee || "0");
    const serviceFee = parseFloat(orderDetails.service_fee || "0");
    const tip = parseFloat(orderDetails.tip || delivery.tip || dropoff.tip || "0");
    const total = parseFloat(orderDetails.total || delivery.total || "0") ||
      (subtotal + tax + deliveryFeeVal + serviceFee + tip);

    const scheduledTimeRaw =
      delivery.pickup_time ||
      delivery.estimated_pickup_time ||
      pickup.time;

    return {
      externalOrderId: delivery.external_delivery_id || delivery.id || delivery.delivery_id || "",
      platform: "doordash",
      orderType: isPickup ? "pickup" : "delivery",
      customerName: [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        dropoff.contact_given_name ||
        "Guest",
      customerPhone: customer.phone_number || dropoff.phone_number || "",
      customerEmail: customer.email || undefined,
      deliveryAddress,
      deliveryInstructions: dropoff.instructions || dropoff.delivery_instructions || undefined,
      scheduledTime: scheduledTimeRaw ? new Date(scheduledTimeRaw) : undefined,
      items,
      subtotal: subtotal.toFixed(2),
      taxTotal: tax.toFixed(2),
      deliveryFee: deliveryFeeVal.toFixed(2),
      serviceFee: serviceFee.toFixed(2),
      tip: tip.toFixed(2),
      total: total.toFixed(2),
      rawPayload: webhookPayload,
    };
  }

  async acceptOrder(
    source: OnlineOrderSource,
    externalOrderId: string,
    prepTimeMinutes: number
  ): Promise<void> {
    const token = this.generateJWT(source);
    const url = `${DOORDASH_API_BASE}/drive/v2/deliveries/${externalOrderId}`;

    console.log(`[doordash] Accepting order ${externalOrderId} with ${prepTimeMinutes}min prep time`);

    const pickupTime = new Date(Date.now() + prepTimeMinutes * 60 * 1000).toISOString();

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pickup_time: pickupTime,
        status: "confirmed",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[doordash] Accept order failed: ${response.status} ${errorBody}`);
      throw new Error(`[doordash] Failed to accept order ${externalOrderId}: ${response.status}`);
    }

    console.log(`[doordash] Order ${externalOrderId} accepted`);
  }

  async denyOrder(
    source: OnlineOrderSource,
    externalOrderId: string,
    reason: string
  ): Promise<void> {
    const token = this.generateJWT(source);
    const url = `${DOORDASH_API_BASE}/drive/v2/deliveries/${externalOrderId}/cancel`;

    console.log(`[doordash] Denying order ${externalOrderId}: ${reason}`);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: reason,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[doordash] Deny order failed: ${response.status} ${errorBody}`);
      throw new Error(`[doordash] Failed to deny order ${externalOrderId}: ${response.status}`);
    }

    console.log(`[doordash] Order ${externalOrderId} denied`);
  }

  async markReady(
    source: OnlineOrderSource,
    externalOrderId: string
  ): Promise<void> {
    const token = this.generateJWT(source);
    const url = `${DOORDASH_API_BASE}/drive/v2/deliveries/${externalOrderId}`;

    console.log(`[doordash] Marking order ${externalOrderId} ready for pickup`);

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "enroute_to_pickup",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[doordash] Mark ready failed: ${response.status} ${errorBody}`);
      throw new Error(`[doordash] Failed to mark order ${externalOrderId} ready: ${response.status}`);
    }

    console.log(`[doordash] Order ${externalOrderId} marked ready`);
  }

  async getDeliveryStatus(
    source: OnlineOrderSource,
    externalOrderId: string
  ): Promise<any> {
    const token = this.generateJWT(source);
    const url = `${DOORDASH_API_BASE}/drive/v2/deliveries/${externalOrderId}`;

    console.log(`[doordash] Getting delivery status for ${externalOrderId}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[doordash] Get delivery status failed: ${response.status} ${errorBody}`);
      throw new Error(`[doordash] Failed to get delivery status for ${externalOrderId}: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[doordash] Delivery ${externalOrderId} status: ${data.delivery_status || data.status}`);
    return data;
  }

  async testConnection(
    source: OnlineOrderSource
  ): Promise<{ success: boolean; message: string }> {
    try {
      const token = this.generateJWT(source);

      const storeId = source.merchantStoreId;
      if (!storeId) {
        return { success: false, message: "Missing merchantStoreId in source configuration" };
      }

      const url = `${DOORDASH_API_BASE}/drive/v2/deliveries`;
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

      return {
        success: true,
        message: `Connected to DoorDash Drive API for store "${storeId}"`,
      };
    } catch (err: any) {
      console.error("[doordash] Connection test failed:", err);
      return {
        success: false,
        message: err.message || "Unknown error during connection test",
      };
    }
  }
}

export const doorDashIntegration = new DoorDashIntegration();
