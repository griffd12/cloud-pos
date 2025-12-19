import { db } from "./db";
import { eq, and, isNull, or } from "drizzle-orm";
import {
  menuItems, printClasses, printClassRouting, orderDevices, orderDeviceKds, kdsDevices,
  type MenuItem, type KdsDevice, type OrderDevice
} from "@shared/schema";

export interface KdsRoutingTarget {
  kdsDeviceId: string;
  kdsDeviceName: string;
  stationType: string;
  orderDeviceId: string;
  orderDeviceName: string;
}

export async function resolveKdsTargetsForMenuItem(
  menuItemId: string,
  propertyId: string,
  rvcId?: string
): Promise<KdsRoutingTarget[]> {
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId));
  if (!item || !item.printClassId) {
    return [];
  }

  const printClassId = item.printClassId;

  let routing;
  if (rvcId) {
    [routing] = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        eq(printClassRouting.rvcId, rvcId)
      ));
  }
  if (!routing) {
    [routing] = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        eq(printClassRouting.propertyId, propertyId),
        isNull(printClassRouting.rvcId)
      ));
  }
  if (!routing) {
    [routing] = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        isNull(printClassRouting.propertyId),
        isNull(printClassRouting.rvcId)
      ));
  }

  if (!routing) {
    return [];
  }

  const [orderDevice] = await db.select().from(orderDevices)
    .where(eq(orderDevices.id, routing.orderDeviceId));
  if (!orderDevice) {
    return [];
  }

  const kdsLinks = await db.select().from(orderDeviceKds)
    .where(eq(orderDeviceKds.orderDeviceId, orderDevice.id));

  const targets: KdsRoutingTarget[] = [];
  for (const link of kdsLinks) {
    const [kdsDevice] = await db.select().from(kdsDevices)
      .where(eq(kdsDevices.id, link.kdsDeviceId));
    if (kdsDevice && kdsDevice.active) {
      targets.push({
        kdsDeviceId: kdsDevice.id,
        kdsDeviceName: kdsDevice.name,
        stationType: kdsDevice.stationType || "hot",
        orderDeviceId: orderDevice.id,
        orderDeviceName: orderDevice.name,
      });
    }
  }

  return targets;
}

export async function resolveKdsTargetsForPrintClass(
  printClassId: string,
  propertyId: string,
  rvcId?: string
): Promise<KdsRoutingTarget[]> {
  let routing;
  if (rvcId) {
    [routing] = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        eq(printClassRouting.rvcId, rvcId)
      ));
  }
  if (!routing) {
    [routing] = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        eq(printClassRouting.propertyId, propertyId),
        isNull(printClassRouting.rvcId)
      ));
  }
  if (!routing) {
    [routing] = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        isNull(printClassRouting.propertyId),
        isNull(printClassRouting.rvcId)
      ));
  }

  if (!routing) {
    return [];
  }

  const [orderDevice] = await db.select().from(orderDevices)
    .where(eq(orderDevices.id, routing.orderDeviceId));
  if (!orderDevice) {
    return [];
  }

  const kdsLinks = await db.select().from(orderDeviceKds)
    .where(eq(orderDeviceKds.orderDeviceId, orderDevice.id));

  const targets: KdsRoutingTarget[] = [];
  for (const link of kdsLinks) {
    const [kdsDevice] = await db.select().from(kdsDevices)
      .where(eq(kdsDevices.id, link.kdsDeviceId));
    if (kdsDevice && kdsDevice.active) {
      targets.push({
        kdsDeviceId: kdsDevice.id,
        kdsDeviceName: kdsDevice.name,
        stationType: kdsDevice.stationType || "hot",
        orderDeviceId: orderDevice.id,
        orderDeviceName: orderDevice.name,
      });
    }
  }

  return targets;
}

export async function getActiveKdsDevices(propertyId?: string): Promise<KdsDevice[]> {
  if (propertyId) {
    return db.select().from(kdsDevices)
      .where(and(eq(kdsDevices.propertyId, propertyId), eq(kdsDevices.active, true)));
  }
  return db.select().from(kdsDevices).where(eq(kdsDevices.active, true));
}

export async function getKdsStationTypes(propertyId?: string): Promise<string[]> {
  const devices = await getActiveKdsDevices(propertyId);
  const types = new Set<string>();
  for (const device of devices) {
    types.add(device.stationType || "hot");
  }
  return Array.from(types);
}

export async function getOrderDeviceSendMode(orderDeviceId: string): Promise<"send_button" | "dynamic"> {
  const [device] = await db.select().from(orderDevices).where(eq(orderDevices.id, orderDeviceId));
  return (device?.sendOn as "send_button" | "dynamic") || "send_button";
}
