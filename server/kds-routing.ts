import { db } from "./db";
import { eq, and, isNull, or } from "drizzle-orm";
import {
  menuItems, printClasses, printClassRouting, orderDevices, kdsDevices,
  workstationOrderDevices,
  type MenuItem, type KdsDevice, type OrderDevice
} from "@shared/schema";

export interface KdsRoutingTarget {
  kdsDeviceId: string;
  kdsDeviceName: string;
  stationType: string;
  orderDeviceId: string;
  orderDeviceName: string;
}

async function getWorkstationAllowedDeviceIds(workstationId?: string): Promise<Set<string> | null> {
  if (!workstationId || workstationId === 'default') return null;
  const assignments = await db.select().from(workstationOrderDevices)
    .where(eq(workstationOrderDevices.workstationId, workstationId));
  if (assignments.length === 0) return null;
  return new Set(assignments.map(a => a.orderDeviceId));
}

async function resolveRoutedOrderDeviceIds(printClassId: string, propertyId: string, rvcId?: string): Promise<string[]> {
  let routings;
  if (rvcId) {
    routings = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        eq(printClassRouting.rvcId, rvcId)
      ));
  }
  if (!routings || routings.length === 0) {
    routings = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        eq(printClassRouting.propertyId, propertyId),
        isNull(printClassRouting.rvcId)
      ));
  }
  if (!routings || routings.length === 0) {
    routings = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, printClassId),
        isNull(printClassRouting.propertyId),
        isNull(printClassRouting.rvcId)
      ));
  }
  if (!routings || routings.length === 0) return [];
  return routings.map(r => r.orderDeviceId);
}

async function buildKdsTargetsFromOrderDeviceIds(
  orderDeviceIds: string[],
  allowedDeviceIds: Set<string> | null
): Promise<KdsRoutingTarget[]> {
  const targets: KdsRoutingTarget[] = [];

  for (const odId of orderDeviceIds) {
    if (allowedDeviceIds && !allowedDeviceIds.has(odId)) continue;

    const [orderDevice] = await db.select().from(orderDevices)
      .where(eq(orderDevices.id, odId));
    if (!orderDevice) continue;

    if (!orderDevice.kdsDeviceId) continue;

    const [kdsDevice] = await db.select().from(kdsDevices)
      .where(eq(kdsDevices.id, orderDevice.kdsDeviceId));
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

export async function resolveKdsTargetsForMenuItem(
  menuItemId: string,
  propertyId: string,
  rvcId?: string,
  workstationId?: string
): Promise<KdsRoutingTarget[]> {
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId));
  if (!item || !item.printClassId) {
    console.log(`[KDS-ROUTING] Item ${menuItemId} has no print class, skipping`);
    return [];
  }

  const orderDeviceIds = await resolveRoutedOrderDeviceIds(item.printClassId, propertyId, rvcId);
  console.log(`[KDS-ROUTING] Item "${item.name}" (printClass=${item.printClassId}) -> orderDeviceIds=[${orderDeviceIds.join(',')}]`);
  if (orderDeviceIds.length === 0) return [];

  const allowedDeviceIds = await getWorkstationAllowedDeviceIds(workstationId);
  console.log(`[KDS-ROUTING] workstationId=${workstationId || 'NONE'}, allowedDeviceIds=${allowedDeviceIds ? `[${Array.from(allowedDeviceIds).join(',')}]` : 'NULL (no filter)'}`);
  const targets = await buildKdsTargetsFromOrderDeviceIds(orderDeviceIds, allowedDeviceIds);
  console.log(`[KDS-ROUTING] Final targets: ${targets.map(t => `${t.kdsDeviceName}(${t.orderDeviceName})`).join(', ') || 'NONE'}`);
  return targets;
}

export async function resolveKdsTargetsForPrintClass(
  printClassId: string,
  propertyId: string,
  rvcId?: string,
  workstationId?: string
): Promise<KdsRoutingTarget[]> {
  const orderDeviceIds = await resolveRoutedOrderDeviceIds(printClassId, propertyId, rvcId);
  if (orderDeviceIds.length === 0) return [];

  const allowedDeviceIds = await getWorkstationAllowedDeviceIds(workstationId);
  return buildKdsTargetsFromOrderDeviceIds(orderDeviceIds, allowedDeviceIds);
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
