import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  enterprises, properties, rvcs, roles, privileges, rolePrivileges, employees,
  slus, taxGroups, printClasses, orderDevices, menuItems, menuItemSlus,
  modifierGroups, modifiers, menuItemModifierGroups, tenders, discounts, serviceCharges,
  checks, rounds, checkItems, checkPayments, checkDiscounts, auditLogs, kdsTickets, kdsTicketItems,
  type Enterprise, type InsertEnterprise,
  type Property, type InsertProperty,
  type Rvc, type InsertRvc,
  type Role, type InsertRole,
  type Employee, type InsertEmployee,
  type Slu, type InsertSlu,
  type TaxGroup, type InsertTaxGroup,
  type PrintClass, type InsertPrintClass,
  type OrderDevice, type InsertOrderDevice,
  type MenuItem, type InsertMenuItem,
  type ModifierGroup, type InsertModifierGroup,
  type Modifier, type InsertModifier,
  type Tender, type InsertTender,
  type Discount, type InsertDiscount,
  type ServiceCharge, type InsertServiceCharge,
  type Check, type InsertCheck,
  type Round, type InsertRound,
  type CheckItem, type InsertCheckItem,
  type CheckPayment, type InsertCheckPayment,
  type AuditLog, type InsertAuditLog,
  type KdsTicket, type InsertKdsTicket,
} from "@shared/schema";

export interface IStorage {
  // Enterprises
  getEnterprises(): Promise<Enterprise[]>;
  getEnterprise(id: string): Promise<Enterprise | undefined>;
  createEnterprise(data: InsertEnterprise): Promise<Enterprise>;
  updateEnterprise(id: string, data: Partial<InsertEnterprise>): Promise<Enterprise | undefined>;
  deleteEnterprise(id: string): Promise<boolean>;

  // Properties
  getProperties(enterpriseId?: string): Promise<Property[]>;
  getProperty(id: string): Promise<Property | undefined>;
  createProperty(data: InsertProperty): Promise<Property>;
  updateProperty(id: string, data: Partial<InsertProperty>): Promise<Property | undefined>;
  deleteProperty(id: string): Promise<boolean>;

  // RVCs
  getRvcs(propertyId?: string): Promise<Rvc[]>;
  getRvc(id: string): Promise<Rvc | undefined>;
  createRvc(data: InsertRvc): Promise<Rvc>;
  updateRvc(id: string, data: Partial<InsertRvc>): Promise<Rvc | undefined>;
  deleteRvc(id: string): Promise<boolean>;

  // Roles
  getRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(data: InsertRole): Promise<Role>;
  updateRole(id: string, data: Partial<InsertRole>): Promise<Role | undefined>;
  deleteRole(id: string): Promise<boolean>;
  getRolePrivileges(roleId: string): Promise<string[]>;

  // Employees
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: string): Promise<Employee | undefined>;
  getEmployeeByPin(pin: string): Promise<Employee | undefined>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<boolean>;

  // SLUs
  getSlus(rvcId?: string): Promise<Slu[]>;
  getSlu(id: string): Promise<Slu | undefined>;
  createSlu(data: InsertSlu): Promise<Slu>;
  updateSlu(id: string, data: Partial<InsertSlu>): Promise<Slu | undefined>;
  deleteSlu(id: string): Promise<boolean>;

  // Tax Groups
  getTaxGroups(): Promise<TaxGroup[]>;
  getTaxGroup(id: string): Promise<TaxGroup | undefined>;
  createTaxGroup(data: InsertTaxGroup): Promise<TaxGroup>;
  updateTaxGroup(id: string, data: Partial<InsertTaxGroup>): Promise<TaxGroup | undefined>;
  deleteTaxGroup(id: string): Promise<boolean>;

  // Print Classes
  getPrintClasses(): Promise<PrintClass[]>;
  getPrintClass(id: string): Promise<PrintClass | undefined>;
  createPrintClass(data: InsertPrintClass): Promise<PrintClass>;
  updatePrintClass(id: string, data: Partial<InsertPrintClass>): Promise<PrintClass | undefined>;
  deletePrintClass(id: string): Promise<boolean>;

  // Order Devices
  getOrderDevices(propertyId?: string): Promise<OrderDevice[]>;
  getOrderDevice(id: string): Promise<OrderDevice | undefined>;
  createOrderDevice(data: InsertOrderDevice): Promise<OrderDevice>;
  updateOrderDevice(id: string, data: Partial<InsertOrderDevice>): Promise<OrderDevice | undefined>;
  deleteOrderDevice(id: string): Promise<boolean>;

  // Menu Items
  getMenuItems(sluId?: string): Promise<MenuItem[]>;
  getMenuItem(id: string): Promise<MenuItem | undefined>;
  createMenuItem(data: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, data: Partial<InsertMenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: string): Promise<boolean>;

  // Modifier Groups
  getModifierGroups(menuItemId?: string): Promise<(ModifierGroup & { modifiers: Modifier[] })[]>;
  getModifierGroup(id: string): Promise<ModifierGroup | undefined>;
  createModifierGroup(data: InsertModifierGroup): Promise<ModifierGroup>;
  updateModifierGroup(id: string, data: Partial<InsertModifierGroup>): Promise<ModifierGroup | undefined>;
  deleteModifierGroup(id: string): Promise<boolean>;

  // Tenders
  getTenders(rvcId?: string): Promise<Tender[]>;
  getTender(id: string): Promise<Tender | undefined>;
  createTender(data: InsertTender): Promise<Tender>;
  updateTender(id: string, data: Partial<InsertTender>): Promise<Tender | undefined>;
  deleteTender(id: string): Promise<boolean>;

  // Discounts
  getDiscounts(): Promise<Discount[]>;
  getDiscount(id: string): Promise<Discount | undefined>;
  createDiscount(data: InsertDiscount): Promise<Discount>;
  updateDiscount(id: string, data: Partial<InsertDiscount>): Promise<Discount | undefined>;
  deleteDiscount(id: string): Promise<boolean>;

  // Service Charges
  getServiceCharges(): Promise<ServiceCharge[]>;
  getServiceCharge(id: string): Promise<ServiceCharge | undefined>;
  createServiceCharge(data: InsertServiceCharge): Promise<ServiceCharge>;
  updateServiceCharge(id: string, data: Partial<InsertServiceCharge>): Promise<ServiceCharge | undefined>;
  deleteServiceCharge(id: string): Promise<boolean>;

  // Checks
  getChecks(rvcId?: string, status?: string): Promise<Check[]>;
  getCheck(id: string): Promise<Check | undefined>;
  createCheck(data: InsertCheck): Promise<Check>;
  updateCheck(id: string, data: Partial<Check>): Promise<Check | undefined>;
  getNextCheckNumber(rvcId: string): Promise<number>;

  // Check Items
  getCheckItems(checkId: string): Promise<CheckItem[]>;
  getCheckItem(id: string): Promise<CheckItem | undefined>;
  createCheckItem(data: InsertCheckItem): Promise<CheckItem>;
  updateCheckItem(id: string, data: Partial<CheckItem>): Promise<CheckItem | undefined>;

  // Rounds
  createRound(data: InsertRound): Promise<Round>;
  getRounds(checkId: string): Promise<Round[]>;

  // Payments
  createPayment(data: InsertCheckPayment): Promise<CheckPayment>;
  getPayments(checkId: string): Promise<CheckPayment[]>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(rvcId?: string): Promise<AuditLog[]>;

  // KDS Tickets
  getKdsTickets(rvcId?: string): Promise<any[]>;
  getKdsTicket(id: string): Promise<KdsTicket | undefined>;
  createKdsTicket(data: InsertKdsTicket): Promise<KdsTicket>;
  updateKdsTicket(id: string, data: Partial<KdsTicket>): Promise<KdsTicket | undefined>;

  // Admin Stats
  getAdminStats(): Promise<{ enterprises: number; properties: number; rvcs: number; employees: number; menuItems: number; activeChecks: number }>;
}

export class DatabaseStorage implements IStorage {
  // Enterprises
  async getEnterprises(): Promise<Enterprise[]> {
    return db.select().from(enterprises);
  }

  async getEnterprise(id: string): Promise<Enterprise | undefined> {
    const [result] = await db.select().from(enterprises).where(eq(enterprises.id, id));
    return result;
  }

  async createEnterprise(data: InsertEnterprise): Promise<Enterprise> {
    const [result] = await db.insert(enterprises).values(data).returning();
    return result;
  }

  async updateEnterprise(id: string, data: Partial<InsertEnterprise>): Promise<Enterprise | undefined> {
    const [result] = await db.update(enterprises).set(data).where(eq(enterprises.id, id)).returning();
    return result;
  }

  async deleteEnterprise(id: string): Promise<boolean> {
    const result = await db.delete(enterprises).where(eq(enterprises.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Properties
  async getProperties(enterpriseId?: string): Promise<Property[]> {
    if (enterpriseId) {
      return db.select().from(properties).where(eq(properties.enterpriseId, enterpriseId));
    }
    return db.select().from(properties);
  }

  async getProperty(id: string): Promise<Property | undefined> {
    const [result] = await db.select().from(properties).where(eq(properties.id, id));
    return result;
  }

  async createProperty(data: InsertProperty): Promise<Property> {
    const [result] = await db.insert(properties).values(data).returning();
    return result;
  }

  async updateProperty(id: string, data: Partial<InsertProperty>): Promise<Property | undefined> {
    const [result] = await db.update(properties).set(data).where(eq(properties.id, id)).returning();
    return result;
  }

  async deleteProperty(id: string): Promise<boolean> {
    const result = await db.delete(properties).where(eq(properties.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // RVCs
  async getRvcs(propertyId?: string): Promise<Rvc[]> {
    if (propertyId) {
      return db.select().from(rvcs).where(eq(rvcs.propertyId, propertyId));
    }
    return db.select().from(rvcs);
  }

  async getRvc(id: string): Promise<Rvc | undefined> {
    const [result] = await db.select().from(rvcs).where(eq(rvcs.id, id));
    return result;
  }

  async createRvc(data: InsertRvc): Promise<Rvc> {
    const [result] = await db.insert(rvcs).values(data).returning();
    return result;
  }

  async updateRvc(id: string, data: Partial<InsertRvc>): Promise<Rvc | undefined> {
    const [result] = await db.update(rvcs).set(data).where(eq(rvcs.id, id)).returning();
    return result;
  }

  async deleteRvc(id: string): Promise<boolean> {
    const result = await db.delete(rvcs).where(eq(rvcs.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Roles
  async getRoles(): Promise<Role[]> {
    return db.select().from(roles);
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [result] = await db.select().from(roles).where(eq(roles.id, id));
    return result;
  }

  async createRole(data: InsertRole): Promise<Role> {
    const [result] = await db.insert(roles).values(data).returning();
    return result;
  }

  async updateRole(id: string, data: Partial<InsertRole>): Promise<Role | undefined> {
    const [result] = await db.update(roles).set(data).where(eq(roles.id, id)).returning();
    return result;
  }

  async deleteRole(id: string): Promise<boolean> {
    const result = await db.delete(roles).where(eq(roles.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getRolePrivileges(roleId: string): Promise<string[]> {
    const result = await db.select().from(rolePrivileges).where(eq(rolePrivileges.roleId, roleId));
    return result.map(rp => rp.privilegeCode);
  }

  // Employees
  async getEmployees(): Promise<Employee[]> {
    return db.select().from(employees);
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const [result] = await db.select().from(employees).where(eq(employees.id, id));
    return result;
  }

  async getEmployeeByPin(pin: string): Promise<Employee | undefined> {
    const [result] = await db.select().from(employees).where(eq(employees.pinHash, pin));
    return result;
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> {
    const [result] = await db.insert(employees).values(data).returning();
    return result;
  }

  async updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const [result] = await db.update(employees).set(data).where(eq(employees.id, id)).returning();
    return result;
  }

  async deleteEmployee(id: string): Promise<boolean> {
    const result = await db.delete(employees).where(eq(employees.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // SLUs
  async getSlus(rvcId?: string): Promise<Slu[]> {
    return db.select().from(slus).orderBy(slus.displayOrder);
  }

  async getSlu(id: string): Promise<Slu | undefined> {
    const [result] = await db.select().from(slus).where(eq(slus.id, id));
    return result;
  }

  async createSlu(data: InsertSlu): Promise<Slu> {
    const [result] = await db.insert(slus).values(data).returning();
    return result;
  }

  async updateSlu(id: string, data: Partial<InsertSlu>): Promise<Slu | undefined> {
    const [result] = await db.update(slus).set(data).where(eq(slus.id, id)).returning();
    return result;
  }

  async deleteSlu(id: string): Promise<boolean> {
    // First delete related menu item linkages
    await db.delete(menuItemSlus).where(eq(menuItemSlus.sluId, id));
    // Then delete the SLU
    const result = await db.delete(slus).where(eq(slus.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Tax Groups
  async getTaxGroups(): Promise<TaxGroup[]> {
    return db.select().from(taxGroups);
  }

  async getTaxGroup(id: string): Promise<TaxGroup | undefined> {
    const [result] = await db.select().from(taxGroups).where(eq(taxGroups.id, id));
    return result;
  }

  async createTaxGroup(data: InsertTaxGroup): Promise<TaxGroup> {
    const [result] = await db.insert(taxGroups).values(data).returning();
    return result;
  }

  async updateTaxGroup(id: string, data: Partial<InsertTaxGroup>): Promise<TaxGroup | undefined> {
    const [result] = await db.update(taxGroups).set(data).where(eq(taxGroups.id, id)).returning();
    return result;
  }

  async deleteTaxGroup(id: string): Promise<boolean> {
    const result = await db.delete(taxGroups).where(eq(taxGroups.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Print Classes
  async getPrintClasses(): Promise<PrintClass[]> {
    return db.select().from(printClasses);
  }

  async getPrintClass(id: string): Promise<PrintClass | undefined> {
    const [result] = await db.select().from(printClasses).where(eq(printClasses.id, id));
    return result;
  }

  async createPrintClass(data: InsertPrintClass): Promise<PrintClass> {
    const [result] = await db.insert(printClasses).values(data).returning();
    return result;
  }

  async updatePrintClass(id: string, data: Partial<InsertPrintClass>): Promise<PrintClass | undefined> {
    const [result] = await db.update(printClasses).set(data).where(eq(printClasses.id, id)).returning();
    return result;
  }

  async deletePrintClass(id: string): Promise<boolean> {
    const result = await db.delete(printClasses).where(eq(printClasses.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Order Devices
  async getOrderDevices(propertyId?: string): Promise<OrderDevice[]> {
    if (propertyId) {
      return db.select().from(orderDevices).where(eq(orderDevices.propertyId, propertyId));
    }
    return db.select().from(orderDevices);
  }

  async getOrderDevice(id: string): Promise<OrderDevice | undefined> {
    const [result] = await db.select().from(orderDevices).where(eq(orderDevices.id, id));
    return result;
  }

  async createOrderDevice(data: InsertOrderDevice): Promise<OrderDevice> {
    const [result] = await db.insert(orderDevices).values(data).returning();
    return result;
  }

  async updateOrderDevice(id: string, data: Partial<InsertOrderDevice>): Promise<OrderDevice | undefined> {
    const [result] = await db.update(orderDevices).set(data).where(eq(orderDevices.id, id)).returning();
    return result;
  }

  async deleteOrderDevice(id: string): Promise<boolean> {
    const result = await db.delete(orderDevices).where(eq(orderDevices.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Menu Items
  async getMenuItems(sluId?: string): Promise<MenuItem[]> {
    if (sluId) {
      const linkages = await db.select().from(menuItemSlus).where(eq(menuItemSlus.sluId, sluId));
      const itemIds = linkages.map(l => l.menuItemId);
      if (itemIds.length === 0) return [];
      return db.select().from(menuItems).where(sql`${menuItems.id} = ANY(${itemIds})`);
    }
    return db.select().from(menuItems);
  }

  async getMenuItem(id: string): Promise<MenuItem | undefined> {
    const [result] = await db.select().from(menuItems).where(eq(menuItems.id, id));
    return result;
  }

  async createMenuItem(data: InsertMenuItem): Promise<MenuItem> {
    const [result] = await db.insert(menuItems).values(data).returning();
    return result;
  }

  async updateMenuItem(id: string, data: Partial<InsertMenuItem>): Promise<MenuItem | undefined> {
    const [result] = await db.update(menuItems).set(data).where(eq(menuItems.id, id)).returning();
    return result;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    // Check if menu item is referenced in check_items (can't delete if used in orders)
    const usedInOrders = await db.select().from(checkItems).where(eq(checkItems.menuItemId, id)).limit(1);
    if (usedInOrders.length > 0) {
      throw new Error("This menu item has transaction history and cannot be deleted. To remove it from the POS, use 'Unlink from Categories' or set it to Inactive.");
    }
    // First delete related SLU linkages
    await db.delete(menuItemSlus).where(eq(menuItemSlus.menuItemId, id));
    // Then delete the menu item
    const result = await db.delete(menuItems).where(eq(menuItems.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async unlinkMenuItemFromSLUs(menuItemId: string): Promise<number> {
    const result = await db.delete(menuItemSlus).where(eq(menuItemSlus.menuItemId, menuItemId));
    return result.rowCount || 0;
  }

  // Modifier Groups
  async getModifierGroups(menuItemId?: string): Promise<(ModifierGroup & { modifiers: Modifier[] })[]> {
    let groups: ModifierGroup[];
    if (menuItemId) {
      const linkages = await db.select().from(menuItemModifierGroups).where(eq(menuItemModifierGroups.menuItemId, menuItemId));
      const groupIds = linkages.map(l => l.modifierGroupId);
      if (groupIds.length === 0) return [];
      groups = await db.select().from(modifierGroups).where(sql`${modifierGroups.id} = ANY(${groupIds})`);
    } else {
      groups = await db.select().from(modifierGroups).orderBy(modifierGroups.displayOrder);
    }

    const result: (ModifierGroup & { modifiers: Modifier[] })[] = [];
    for (const group of groups) {
      const mods = await db.select().from(modifiers).where(eq(modifiers.modifierGroupId, group.id)).orderBy(modifiers.displayOrder);
      result.push({ ...group, modifiers: mods });
    }
    return result;
  }

  async getModifierGroup(id: string): Promise<ModifierGroup | undefined> {
    const [result] = await db.select().from(modifierGroups).where(eq(modifierGroups.id, id));
    return result;
  }

  async createModifierGroup(data: InsertModifierGroup): Promise<ModifierGroup> {
    const [result] = await db.insert(modifierGroups).values(data).returning();
    return result;
  }

  async updateModifierGroup(id: string, data: Partial<InsertModifierGroup>): Promise<ModifierGroup | undefined> {
    const [result] = await db.update(modifierGroups).set(data).where(eq(modifierGroups.id, id)).returning();
    return result;
  }

  async deleteModifierGroup(id: string): Promise<boolean> {
    const result = await db.delete(modifierGroups).where(eq(modifierGroups.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Tenders
  async getTenders(rvcId?: string): Promise<Tender[]> {
    return db.select().from(tenders).where(eq(tenders.active, true));
  }

  async getTender(id: string): Promise<Tender | undefined> {
    const [result] = await db.select().from(tenders).where(eq(tenders.id, id));
    return result;
  }

  async createTender(data: InsertTender): Promise<Tender> {
    const [result] = await db.insert(tenders).values(data).returning();
    return result;
  }

  async updateTender(id: string, data: Partial<InsertTender>): Promise<Tender | undefined> {
    const [result] = await db.update(tenders).set(data).where(eq(tenders.id, id)).returning();
    return result;
  }

  async deleteTender(id: string): Promise<boolean> {
    const result = await db.delete(tenders).where(eq(tenders.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Discounts
  async getDiscounts(): Promise<Discount[]> {
    return db.select().from(discounts);
  }

  async getDiscount(id: string): Promise<Discount | undefined> {
    const [result] = await db.select().from(discounts).where(eq(discounts.id, id));
    return result;
  }

  async createDiscount(data: InsertDiscount): Promise<Discount> {
    const [result] = await db.insert(discounts).values(data).returning();
    return result;
  }

  async updateDiscount(id: string, data: Partial<InsertDiscount>): Promise<Discount | undefined> {
    const [result] = await db.update(discounts).set(data).where(eq(discounts.id, id)).returning();
    return result;
  }

  async deleteDiscount(id: string): Promise<boolean> {
    const result = await db.delete(discounts).where(eq(discounts.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Service Charges
  async getServiceCharges(): Promise<ServiceCharge[]> {
    return db.select().from(serviceCharges);
  }

  async getServiceCharge(id: string): Promise<ServiceCharge | undefined> {
    const [result] = await db.select().from(serviceCharges).where(eq(serviceCharges.id, id));
    return result;
  }

  async createServiceCharge(data: InsertServiceCharge): Promise<ServiceCharge> {
    const [result] = await db.insert(serviceCharges).values(data).returning();
    return result;
  }

  async updateServiceCharge(id: string, data: Partial<InsertServiceCharge>): Promise<ServiceCharge | undefined> {
    const [result] = await db.update(serviceCharges).set(data).where(eq(serviceCharges.id, id)).returning();
    return result;
  }

  async deleteServiceCharge(id: string): Promise<boolean> {
    const result = await db.delete(serviceCharges).where(eq(serviceCharges.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Checks
  async getChecks(rvcId?: string, status?: string): Promise<Check[]> {
    let query = db.select().from(checks);
    if (rvcId && status) {
      return db.select().from(checks).where(and(eq(checks.rvcId, rvcId), eq(checks.status, status)));
    }
    if (rvcId) {
      return db.select().from(checks).where(eq(checks.rvcId, rvcId));
    }
    if (status) {
      return db.select().from(checks).where(eq(checks.status, status));
    }
    return db.select().from(checks).orderBy(desc(checks.openedAt));
  }

  async getCheck(id: string): Promise<Check | undefined> {
    const [result] = await db.select().from(checks).where(eq(checks.id, id));
    return result;
  }

  async createCheck(data: InsertCheck): Promise<Check> {
    const [result] = await db.insert(checks).values(data).returning();
    return result;
  }

  async updateCheck(id: string, data: Partial<Check>): Promise<Check | undefined> {
    const [result] = await db.update(checks).set(data).where(eq(checks.id, id)).returning();
    return result;
  }

  async getNextCheckNumber(rvcId: string): Promise<number> {
    const result = await db.select({ maxNum: sql<number>`COALESCE(MAX(${checks.checkNumber}), 0)` })
      .from(checks)
      .where(eq(checks.rvcId, rvcId));
    return (result[0]?.maxNum || 0) + 1;
  }

  // Check Items
  async getCheckItems(checkId: string): Promise<CheckItem[]> {
    return db.select().from(checkItems).where(eq(checkItems.checkId, checkId));
  }

  async getCheckItem(id: string): Promise<CheckItem | undefined> {
    const [result] = await db.select().from(checkItems).where(eq(checkItems.id, id));
    return result;
  }

  async createCheckItem(data: InsertCheckItem): Promise<CheckItem> {
    const [result] = await db.insert(checkItems).values(data).returning();
    return result;
  }

  async updateCheckItem(id: string, data: Partial<CheckItem>): Promise<CheckItem | undefined> {
    const [result] = await db.update(checkItems).set(data).where(eq(checkItems.id, id)).returning();
    return result;
  }

  // Rounds
  async createRound(data: InsertRound): Promise<Round> {
    const [result] = await db.insert(rounds).values(data).returning();
    return result;
  }

  async getRounds(checkId: string): Promise<Round[]> {
    return db.select().from(rounds).where(eq(rounds.checkId, checkId));
  }

  // Payments
  async createPayment(data: InsertCheckPayment): Promise<CheckPayment> {
    const [result] = await db.insert(checkPayments).values(data).returning();
    return result;
  }

  async getPayments(checkId: string): Promise<CheckPayment[]> {
    return db.select().from(checkPayments).where(eq(checkPayments.checkId, checkId));
  }

  // Audit Logs
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [result] = await db.insert(auditLogs).values(data).returning();
    return result;
  }

  async getAuditLogs(rvcId?: string): Promise<AuditLog[]> {
    if (rvcId) {
      return db.select().from(auditLogs).where(eq(auditLogs.rvcId, rvcId)).orderBy(desc(auditLogs.createdAt));
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  // KDS Tickets
  async getKdsTickets(rvcId?: string): Promise<any[]> {
    const tickets = await db.select().from(kdsTickets)
      .where(sql`${kdsTickets.status} != 'bumped'`)
      .orderBy(kdsTickets.createdAt);

    const result = [];
    for (const ticket of tickets) {
      const check = await this.getCheck(ticket.checkId);
      const items = await db.select().from(kdsTicketItems).where(eq(kdsTicketItems.kdsTicketId, ticket.id));
      const checkItemsList = [];
      for (const item of items) {
        const checkItem = await this.getCheckItem(item.checkItemId);
        if (checkItem) {
          checkItemsList.push({
            id: checkItem.id,
            name: checkItem.menuItemName,
            quantity: checkItem.quantity || 1,
            modifiers: checkItem.modifiers,
            status: item.status,
          });
        }
      }
      result.push({
        id: ticket.id,
        checkNumber: check?.checkNumber || 0,
        orderType: check?.orderType || 'dine_in',
        items: checkItemsList,
        isDraft: ticket.status === 'draft',
        createdAt: ticket.createdAt,
      });
    }
    return result;
  }

  async getKdsTicket(id: string): Promise<KdsTicket | undefined> {
    const [result] = await db.select().from(kdsTickets).where(eq(kdsTickets.id, id));
    return result;
  }

  async createKdsTicket(data: InsertKdsTicket): Promise<KdsTicket> {
    const [result] = await db.insert(kdsTickets).values(data).returning();
    return result;
  }

  async updateKdsTicket(id: string, data: Partial<KdsTicket>): Promise<KdsTicket | undefined> {
    const [result] = await db.update(kdsTickets).set(data).where(eq(kdsTickets.id, id)).returning();
    return result;
  }

  // Admin Stats
  async getAdminStats(): Promise<{ enterprises: number; properties: number; rvcs: number; employees: number; menuItems: number; activeChecks: number }> {
    const [entCount] = await db.select({ count: sql<number>`count(*)` }).from(enterprises);
    const [propCount] = await db.select({ count: sql<number>`count(*)` }).from(properties);
    const [rvcCount] = await db.select({ count: sql<number>`count(*)` }).from(rvcs);
    const [empCount] = await db.select({ count: sql<number>`count(*)` }).from(employees);
    const [itemCount] = await db.select({ count: sql<number>`count(*)` }).from(menuItems);
    const [checkCount] = await db.select({ count: sql<number>`count(*)` }).from(checks).where(eq(checks.status, 'open'));

    return {
      enterprises: Number(entCount?.count || 0),
      properties: Number(propCount?.count || 0),
      rvcs: Number(rvcCount?.count || 0),
      employees: Number(empCount?.count || 0),
      menuItems: Number(itemCount?.count || 0),
      activeChecks: Number(checkCount?.count || 0),
    };
  }
}

export const storage = new DatabaseStorage();
