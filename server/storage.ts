import { db } from "./db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  enterprises, properties, rvcs, roles, privileges, rolePrivileges, employees, employeeAssignments,
  majorGroups, familyGroups,
  slus, taxGroups, printClasses, orderDevices, menuItems, menuItemSlus, type MenuItemSlu,
  modifierGroups, modifiers, modifierGroupModifiers, menuItemModifierGroups,
  tenders, discounts, serviceCharges,
  checks, rounds, checkItems, checkPayments, checkDiscounts, auditLogs, kdsTickets, kdsTicketItems,
  workstations, printers, kdsDevices, orderDevicePrinters, orderDeviceKds, printClassRouting,
  posLayouts, posLayoutCells, posLayoutRvcAssignments,
  devices, deviceEnrollmentTokens, deviceHeartbeats,
  type Enterprise, type InsertEnterprise,
  type Property, type InsertProperty,
  type Rvc, type InsertRvc,
  type Role, type InsertRole,
  type Privilege, type InsertPrivilege,
  type Employee, type InsertEmployee,
  type EmployeeAssignment, type InsertEmployeeAssignment,
  type MajorGroup, type InsertMajorGroup,
  type FamilyGroup, type InsertFamilyGroup,
  type Slu, type InsertSlu,
  type TaxGroup, type InsertTaxGroup,
  type PrintClass, type InsertPrintClass,
  type Workstation, type InsertWorkstation,
  type Printer, type InsertPrinter,
  type KdsDevice, type InsertKdsDevice,
  type OrderDevice, type InsertOrderDevice,
  type OrderDevicePrinter, type InsertOrderDevicePrinter,
  type OrderDeviceKds, type InsertOrderDeviceKds,
  type PrintClassRouting, type InsertPrintClassRouting,
  type MenuItem, type InsertMenuItem,
  type ModifierGroup, type InsertModifierGroup,
  type Modifier, type InsertModifier,
  type ModifierGroupModifier, type InsertModifierGroupModifier,
  type MenuItemModifierGroup, type InsertMenuItemModifierGroup,
  type Tender, type InsertTender,
  type Discount, type InsertDiscount,
  type ServiceCharge, type InsertServiceCharge,
  type Check, type InsertCheck,
  type Round, type InsertRound,
  type CheckItem, type InsertCheckItem,
  type CheckPayment, type InsertCheckPayment,
  type AuditLog, type InsertAuditLog,
  type KdsTicket, type InsertKdsTicket,
  type PosLayout, type InsertPosLayout,
  type PosLayoutCell, type InsertPosLayoutCell,
  type PosLayoutRvcAssignment, type InsertPosLayoutRvcAssignment,
  type Device, type InsertDevice,
  type DeviceEnrollmentToken, type InsertDeviceEnrollmentToken,
  type DeviceHeartbeat, type InsertDeviceHeartbeat,
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
  setRolePrivileges(roleId: string, privilegeCodes: string[]): Promise<void>;
  upsertRole(data: InsertRole): Promise<Role>;

  // Employees
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: string): Promise<Employee | undefined>;
  getEmployeeByPin(pin: string): Promise<Employee | undefined>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<boolean>;

  // Employee Assignments (multi-property)
  getEmployeeAssignments(employeeId: string): Promise<EmployeeAssignment[]>;
  setEmployeeAssignments(employeeId: string, propertyIds: string[]): Promise<EmployeeAssignment[]>;

  // Privileges
  getPrivileges(): Promise<Privilege[]>;
  createPrivilege(data: InsertPrivilege): Promise<Privilege>;
  upsertPrivileges(privileges: InsertPrivilege[]): Promise<void>;

  // Major Groups
  getMajorGroups(): Promise<MajorGroup[]>;
  getMajorGroup(id: string): Promise<MajorGroup | undefined>;
  createMajorGroup(data: InsertMajorGroup): Promise<MajorGroup>;
  updateMajorGroup(id: string, data: Partial<InsertMajorGroup>): Promise<MajorGroup | undefined>;
  deleteMajorGroup(id: string): Promise<boolean>;

  // Family Groups
  getFamilyGroups(majorGroupId?: string): Promise<FamilyGroup[]>;
  getFamilyGroup(id: string): Promise<FamilyGroup | undefined>;
  createFamilyGroup(data: InsertFamilyGroup): Promise<FamilyGroup>;
  updateFamilyGroup(id: string, data: Partial<InsertFamilyGroup>): Promise<FamilyGroup | undefined>;
  deleteFamilyGroup(id: string): Promise<boolean>;

  // SLUs
  getSlus(rvcId?: string): Promise<Slu[]>;
  getSlu(id: string): Promise<Slu | undefined>;
  createSlu(data: InsertSlu): Promise<Slu>;
  updateSlu(id: string, data: Partial<InsertSlu>): Promise<Slu | undefined>;
  deleteSlu(id: string): Promise<boolean>;

  // Menu Item SLU Linkages
  getMenuItemSlus(menuItemId?: string): Promise<MenuItemSlu[]>;
  setMenuItemSlus(menuItemId: string, sluIds: string[]): Promise<void>;

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

  // Workstations
  getWorkstations(propertyId?: string): Promise<Workstation[]>;
  getWorkstation(id: string): Promise<Workstation | undefined>;
  createWorkstation(data: InsertWorkstation): Promise<Workstation>;
  updateWorkstation(id: string, data: Partial<InsertWorkstation>): Promise<Workstation | undefined>;
  deleteWorkstation(id: string): Promise<boolean>;

  // Printers
  getPrinters(propertyId?: string): Promise<Printer[]>;
  getPrinter(id: string): Promise<Printer | undefined>;
  createPrinter(data: InsertPrinter): Promise<Printer>;
  updatePrinter(id: string, data: Partial<InsertPrinter>): Promise<Printer | undefined>;
  deletePrinter(id: string): Promise<boolean>;

  // KDS Devices
  getKdsDevices(propertyId?: string): Promise<KdsDevice[]>;
  getKdsDevice(id: string): Promise<KdsDevice | undefined>;
  createKdsDevice(data: InsertKdsDevice): Promise<KdsDevice>;
  updateKdsDevice(id: string, data: Partial<InsertKdsDevice>): Promise<KdsDevice | undefined>;
  deleteKdsDevice(id: string): Promise<boolean>;

  // Order Devices
  getOrderDevices(propertyId?: string): Promise<OrderDevice[]>;
  getOrderDevice(id: string): Promise<OrderDevice | undefined>;
  createOrderDevice(data: InsertOrderDevice): Promise<OrderDevice>;
  updateOrderDevice(id: string, data: Partial<InsertOrderDevice>): Promise<OrderDevice | undefined>;
  deleteOrderDevice(id: string): Promise<boolean>;

  // Order Device Linkages
  getOrderDevicePrinters(orderDeviceId: string): Promise<OrderDevicePrinter[]>;
  linkPrinterToOrderDevice(data: InsertOrderDevicePrinter): Promise<OrderDevicePrinter>;
  unlinkPrinterFromOrderDevice(id: string): Promise<boolean>;
  getOrderDeviceKdsList(orderDeviceId: string): Promise<OrderDeviceKds[]>;
  linkKdsToOrderDevice(data: InsertOrderDeviceKds): Promise<OrderDeviceKds>;
  unlinkKdsFromOrderDevice(id: string): Promise<boolean>;

  // Print Class Routing
  getAllPrintClassRoutings(): Promise<PrintClassRouting[]>;
  getPrintClassRouting(printClassId: string, propertyId?: string, rvcId?: string): Promise<PrintClassRouting[]>;
  createPrintClassRouting(data: InsertPrintClassRouting): Promise<PrintClassRouting>;
  deletePrintClassRouting(id: string): Promise<boolean>;
  resolveDevicesForMenuItem(menuItemId: string, rvcId: string): Promise<{ printers: Printer[]; kdsDevices: KdsDevice[] }>;

  // Menu Items
  getMenuItems(sluId?: string): Promise<MenuItem[]>;
  getMenuItem(id: string): Promise<MenuItem | undefined>;
  createMenuItem(data: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, data: Partial<InsertMenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: string): Promise<boolean>;

  // Modifiers (standalone)
  getModifiers(): Promise<Modifier[]>;
  getModifier(id: string): Promise<Modifier | undefined>;
  createModifier(data: InsertModifier): Promise<Modifier>;
  updateModifier(id: string, data: Partial<InsertModifier>): Promise<Modifier | undefined>;
  deleteModifier(id: string): Promise<boolean>;

  // Modifier Groups
  getModifierGroups(menuItemId?: string): Promise<(ModifierGroup & { modifiers: (Modifier & { isDefault: boolean; displayOrder: number })[] })[]>;
  getModifierGroup(id: string): Promise<ModifierGroup | undefined>;
  createModifierGroup(data: InsertModifierGroup): Promise<ModifierGroup>;
  updateModifierGroup(id: string, data: Partial<InsertModifierGroup>): Promise<ModifierGroup | undefined>;
  deleteModifierGroup(id: string): Promise<boolean>;

  // Modifier Group to Modifier linkage
  getModifierGroupModifiers(modifierGroupId: string): Promise<ModifierGroupModifier[]>;
  linkModifierToGroup(data: InsertModifierGroupModifier): Promise<ModifierGroupModifier>;
  unlinkModifierFromGroup(modifierGroupId: string, modifierId: string): Promise<boolean>;
  updateModifierGroupModifier(id: string, data: Partial<InsertModifierGroupModifier>): Promise<ModifierGroupModifier | undefined>;

  // Menu Item to Modifier Group linkage
  getMenuItemModifierGroups(menuItemId: string): Promise<MenuItemModifierGroup[]>;
  linkModifierGroupToMenuItem(data: InsertMenuItemModifierGroup): Promise<MenuItemModifierGroup>;
  unlinkModifierGroupFromMenuItem(menuItemId: string, modifierGroupId: string): Promise<boolean>;

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
  getOpenChecks(rvcId: string): Promise<Check[]>;
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
  getAllPayments(): Promise<CheckPayment[]>;
  getAllCheckItems(): Promise<CheckItem[]>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(rvcId?: string): Promise<AuditLog[]>;

  // KDS Tickets
  getKdsTickets(filters?: { rvcId?: string; kdsDeviceId?: string; stationType?: string }): Promise<any[]>;
  getKdsTicket(id: string): Promise<KdsTicket | undefined>;
  createKdsTicket(data: InsertKdsTicket): Promise<KdsTicket>;
  updateKdsTicket(id: string, data: Partial<KdsTicket>): Promise<KdsTicket | undefined>;
  createKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void>;
  removeKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void>;
  voidKdsTicketItem(checkItemId: string): Promise<void>;
  bumpKdsTicket(id: string, employeeId: string): Promise<KdsTicket | undefined>;
  recallKdsTicket(id: string): Promise<KdsTicket | undefined>;
  getPreviewTicket(checkId: string): Promise<KdsTicket | undefined>;
  getKdsTicketsByCheck(checkId: string): Promise<KdsTicket[]>;
  markKdsTicketsPaid(checkId: string): Promise<void>;

  // Admin Stats
  getAdminStats(): Promise<{ enterprises: number; properties: number; rvcs: number; employees: number; menuItems: number; activeChecks: number }>;

  // POS Layouts
  getPosLayouts(rvcId?: string): Promise<PosLayout[]>;
  getPosLayout(id: string): Promise<PosLayout | undefined>;
  getDefaultPosLayout(rvcId: string): Promise<PosLayout | undefined>;
  createPosLayout(data: InsertPosLayout): Promise<PosLayout>;
  updatePosLayout(id: string, data: Partial<InsertPosLayout>): Promise<PosLayout | undefined>;
  deletePosLayout(id: string): Promise<boolean>;

  // POS Layout Cells
  getPosLayoutCells(layoutId: string): Promise<PosLayoutCell[]>;
  setPosLayoutCells(layoutId: string, cells: InsertPosLayoutCell[]): Promise<PosLayoutCell[]>;

  // POS Layout RVC Assignments
  getPosLayoutRvcAssignments(layoutId: string): Promise<PosLayoutRvcAssignment[]>;
  setPosLayoutRvcAssignments(layoutId: string, assignments: { propertyId: string; rvcId: string; isDefault?: boolean }[]): Promise<PosLayoutRvcAssignment[]>;
  getPosLayoutsForRvc(rvcId: string): Promise<PosLayout[]>;
  getDefaultLayoutForRvc(rvcId: string): Promise<PosLayout | undefined>;
  setDefaultLayoutForRvc(rvcId: string, layoutId: string): Promise<void>;

  // Admin Sales Reset (property-specific)
  getSalesDataSummary(propertyId: string): Promise<{ checks: number; checkItems: number; payments: number; rounds: number; kdsTickets: number; auditLogs: number }>;
  clearSalesData(propertyId: string): Promise<{ deleted: { checks: number; checkItems: number; payments: number; discounts: number; rounds: number; kdsTicketItems: number; kdsTickets: number; auditLogs: number } }>;

  // Device Registry (CAL)
  getDevices(filters?: { enterpriseId?: string; propertyId?: string; deviceType?: string; status?: string }): Promise<Device[]>;
  getDevice(id: string): Promise<Device | undefined>;
  getDeviceByDeviceId(deviceId: string): Promise<Device | undefined>;
  createDevice(data: InsertDevice): Promise<Device>;
  updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined>;
  deleteDevice(id: string): Promise<boolean>;
  updateDeviceLastSeen(id: string): Promise<void>;

  // Device Enrollment Tokens
  getDeviceEnrollmentTokens(enterpriseId?: string): Promise<DeviceEnrollmentToken[]>;
  getDeviceEnrollmentToken(id: string): Promise<DeviceEnrollmentToken | undefined>;
  getDeviceEnrollmentTokenByToken(token: string): Promise<DeviceEnrollmentToken | undefined>;
  createDeviceEnrollmentToken(data: InsertDeviceEnrollmentToken): Promise<DeviceEnrollmentToken>;
  deleteDeviceEnrollmentToken(id: string): Promise<boolean>;
  useDeviceEnrollmentToken(token: string): Promise<DeviceEnrollmentToken | undefined>;

  // Device Heartbeats
  createDeviceHeartbeat(data: InsertDeviceHeartbeat): Promise<DeviceHeartbeat>;
  getDeviceHeartbeats(deviceId: string, limit?: number): Promise<DeviceHeartbeat[]>;
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

  async setRolePrivileges(roleId: string, privilegeCodes: string[]): Promise<void> {
    // Delete existing privileges for this role
    await db.delete(rolePrivileges).where(eq(rolePrivileges.roleId, roleId));
    
    // Insert new privileges
    if (privilegeCodes.length === 0) return;
    
    const inserts = privilegeCodes.map(code => ({
      roleId,
      privilegeCode: code,
    }));
    await db.insert(rolePrivileges).values(inserts);
  }

  async upsertRole(data: InsertRole): Promise<Role> {
    // Try to find existing role by code
    const existing = await db.select().from(roles).where(eq(roles.code, data.code)).limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(roles).set(data).where(eq(roles.id, existing[0].id)).returning();
      return updated;
    }
    const [created] = await db.insert(roles).values(data).returning();
    return created;
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
    // Delete employee assignments first
    await db.delete(employeeAssignments).where(eq(employeeAssignments.employeeId, id));
    const result = await db.delete(employees).where(eq(employees.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Employee Assignments (multi-property)
  async getEmployeeAssignments(employeeId: string): Promise<EmployeeAssignment[]> {
    return db.select().from(employeeAssignments).where(eq(employeeAssignments.employeeId, employeeId));
  }

  async setEmployeeAssignments(employeeId: string, propertyIds: string[]): Promise<EmployeeAssignment[]> {
    // Delete existing assignments
    await db.delete(employeeAssignments).where(eq(employeeAssignments.employeeId, employeeId));
    
    // Insert new assignments
    if (propertyIds.length === 0) return [];
    
    const assignments = propertyIds.map((propertyId, index) => ({
      employeeId,
      propertyId,
      isPrimary: index === 0, // First property is primary
    }));
    
    return db.insert(employeeAssignments).values(assignments).returning();
  }

  // Privileges
  async getPrivileges(): Promise<Privilege[]> {
    return db.select().from(privileges);
  }

  async createPrivilege(data: InsertPrivilege): Promise<Privilege> {
    const [result] = await db.insert(privileges).values(data).returning();
    return result;
  }

  async upsertPrivileges(privilegeList: InsertPrivilege[]): Promise<void> {
    for (const priv of privilegeList) {
      await db.insert(privileges)
        .values(priv)
        .onConflictDoUpdate({
          target: privileges.code,
          set: { name: priv.name, domain: priv.domain, description: priv.description }
        });
    }
  }

  // Major Groups
  async getMajorGroups(): Promise<MajorGroup[]> {
    return db.select().from(majorGroups).orderBy(majorGroups.displayOrder);
  }

  async getMajorGroup(id: string): Promise<MajorGroup | undefined> {
    const [result] = await db.select().from(majorGroups).where(eq(majorGroups.id, id));
    return result;
  }

  async createMajorGroup(data: InsertMajorGroup): Promise<MajorGroup> {
    const [result] = await db.insert(majorGroups).values(data).returning();
    return result;
  }

  async updateMajorGroup(id: string, data: Partial<InsertMajorGroup>): Promise<MajorGroup | undefined> {
    const [result] = await db.update(majorGroups).set(data).where(eq(majorGroups.id, id)).returning();
    return result;
  }

  async deleteMajorGroup(id: string): Promise<boolean> {
    // Clear references in family groups and menu items first
    await db.update(familyGroups).set({ majorGroupId: null }).where(eq(familyGroups.majorGroupId, id));
    await db.update(menuItems).set({ majorGroupId: null }).where(eq(menuItems.majorGroupId, id));
    const result = await db.delete(majorGroups).where(eq(majorGroups.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Family Groups
  async getFamilyGroups(majorGroupId?: string): Promise<FamilyGroup[]> {
    if (majorGroupId) {
      return db.select().from(familyGroups).where(eq(familyGroups.majorGroupId, majorGroupId)).orderBy(familyGroups.displayOrder);
    }
    return db.select().from(familyGroups).orderBy(familyGroups.displayOrder);
  }

  async getFamilyGroup(id: string): Promise<FamilyGroup | undefined> {
    const [result] = await db.select().from(familyGroups).where(eq(familyGroups.id, id));
    return result;
  }

  async createFamilyGroup(data: InsertFamilyGroup): Promise<FamilyGroup> {
    const [result] = await db.insert(familyGroups).values(data).returning();
    return result;
  }

  async updateFamilyGroup(id: string, data: Partial<InsertFamilyGroup>): Promise<FamilyGroup | undefined> {
    const [result] = await db.update(familyGroups).set(data).where(eq(familyGroups.id, id)).returning();
    return result;
  }

  async deleteFamilyGroup(id: string): Promise<boolean> {
    // Clear references in menu items first
    await db.update(menuItems).set({ familyGroupId: null }).where(eq(menuItems.familyGroupId, id));
    const result = await db.delete(familyGroups).where(eq(familyGroups.id, id));
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

  // Menu Item SLU Linkages
  async getMenuItemSlus(menuItemId?: string): Promise<MenuItemSlu[]> {
    if (menuItemId) {
      return db.select().from(menuItemSlus).where(eq(menuItemSlus.menuItemId, menuItemId));
    }
    return db.select().from(menuItemSlus);
  }

  async setMenuItemSlus(menuItemId: string, sluIds: string[]): Promise<void> {
    // Delete existing linkages
    await db.delete(menuItemSlus).where(eq(menuItemSlus.menuItemId, menuItemId));
    // Insert new linkages
    if (sluIds.length > 0) {
      await db.insert(menuItemSlus).values(
        sluIds.map((sluId, index) => ({
          menuItemId,
          sluId,
          displayOrder: index,
        }))
      );
    }
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

  // Workstations
  async getWorkstations(propertyId?: string): Promise<Workstation[]> {
    if (propertyId) {
      return db.select().from(workstations).where(eq(workstations.propertyId, propertyId));
    }
    return db.select().from(workstations);
  }

  async getWorkstation(id: string): Promise<Workstation | undefined> {
    const [result] = await db.select().from(workstations).where(eq(workstations.id, id));
    return result;
  }

  async createWorkstation(data: InsertWorkstation): Promise<Workstation> {
    const [result] = await db.insert(workstations).values(data).returning();
    return result;
  }

  async updateWorkstation(id: string, data: Partial<InsertWorkstation>): Promise<Workstation | undefined> {
    const [result] = await db.update(workstations).set(data).where(eq(workstations.id, id)).returning();
    return result;
  }

  async deleteWorkstation(id: string): Promise<boolean> {
    const result = await db.delete(workstations).where(eq(workstations.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Printers
  async getPrinters(propertyId?: string): Promise<Printer[]> {
    if (propertyId) {
      return db.select().from(printers).where(eq(printers.propertyId, propertyId));
    }
    return db.select().from(printers);
  }

  async getPrinter(id: string): Promise<Printer | undefined> {
    const [result] = await db.select().from(printers).where(eq(printers.id, id));
    return result;
  }

  async createPrinter(data: InsertPrinter): Promise<Printer> {
    const [result] = await db.insert(printers).values(data).returning();
    return result;
  }

  async updatePrinter(id: string, data: Partial<InsertPrinter>): Promise<Printer | undefined> {
    const [result] = await db.update(printers).set(data).where(eq(printers.id, id)).returning();
    return result;
  }

  async deletePrinter(id: string): Promise<boolean> {
    const result = await db.delete(printers).where(eq(printers.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // KDS Devices
  async getKdsDevices(propertyId?: string): Promise<KdsDevice[]> {
    if (propertyId) {
      return db.select().from(kdsDevices).where(eq(kdsDevices.propertyId, propertyId));
    }
    return db.select().from(kdsDevices);
  }

  async getKdsDevice(id: string): Promise<KdsDevice | undefined> {
    const [result] = await db.select().from(kdsDevices).where(eq(kdsDevices.id, id));
    return result;
  }

  async createKdsDevice(data: InsertKdsDevice): Promise<KdsDevice> {
    const [result] = await db.insert(kdsDevices).values(data).returning();
    return result;
  }

  async updateKdsDevice(id: string, data: Partial<InsertKdsDevice>): Promise<KdsDevice | undefined> {
    const [result] = await db.update(kdsDevices).set(data).where(eq(kdsDevices.id, id)).returning();
    return result;
  }

  async deleteKdsDevice(id: string): Promise<boolean> {
    const result = await db.delete(kdsDevices).where(eq(kdsDevices.id, id));
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

  // Order Device Linkages
  async getOrderDevicePrinters(orderDeviceId: string): Promise<OrderDevicePrinter[]> {
    return db.select().from(orderDevicePrinters).where(eq(orderDevicePrinters.orderDeviceId, orderDeviceId));
  }

  async linkPrinterToOrderDevice(data: InsertOrderDevicePrinter): Promise<OrderDevicePrinter> {
    // Validate: Ensure printer and order device belong to same property
    const orderDevice = await this.getOrderDevice(data.orderDeviceId);
    const printer = await this.getPrinter(data.printerId);
    
    if (!orderDevice) {
      throw new Error("Order device not found");
    }
    if (!printer) {
      throw new Error("Printer not found");
    }
    if (orderDevice.propertyId !== printer.propertyId) {
      throw new Error("Printer must belong to the same property as the order device");
    }
    
    const [result] = await db.insert(orderDevicePrinters).values(data).returning();
    return result;
  }

  async unlinkPrinterFromOrderDevice(id: string): Promise<boolean> {
    const result = await db.delete(orderDevicePrinters).where(eq(orderDevicePrinters.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getOrderDeviceKdsList(orderDeviceId: string): Promise<OrderDeviceKds[]> {
    return db.select().from(orderDeviceKds).where(eq(orderDeviceKds.orderDeviceId, orderDeviceId));
  }

  async linkKdsToOrderDevice(data: InsertOrderDeviceKds): Promise<OrderDeviceKds> {
    // Validate: Ensure KDS device and order device belong to same property
    const orderDevice = await this.getOrderDevice(data.orderDeviceId);
    const kdsDevice = await this.getKdsDevice(data.kdsDeviceId);
    
    if (!orderDevice) {
      throw new Error("Order device not found");
    }
    if (!kdsDevice) {
      throw new Error("KDS device not found");
    }
    if (orderDevice.propertyId !== kdsDevice.propertyId) {
      throw new Error("KDS device must belong to the same property as the order device");
    }
    
    const [result] = await db.insert(orderDeviceKds).values(data).returning();
    return result;
  }

  async unlinkKdsFromOrderDevice(id: string): Promise<boolean> {
    const result = await db.delete(orderDeviceKds).where(eq(orderDeviceKds.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Print Class Routing
  async getAllPrintClassRoutings(): Promise<PrintClassRouting[]> {
    return db.select().from(printClassRouting);
  }

  async getPrintClassRouting(printClassId: string, propertyId?: string, rvcId?: string): Promise<PrintClassRouting[]> {
    const conditions = [eq(printClassRouting.printClassId, printClassId)];
    if (propertyId) conditions.push(eq(printClassRouting.propertyId, propertyId));
    if (rvcId) conditions.push(eq(printClassRouting.rvcId, rvcId));
    return db.select().from(printClassRouting).where(and(...conditions));
  }

  async createPrintClassRouting(data: InsertPrintClassRouting): Promise<PrintClassRouting> {
    const [result] = await db.insert(printClassRouting).values(data).returning();
    return result;
  }

  async deletePrintClassRouting(id: string): Promise<boolean> {
    const result = await db.delete(printClassRouting).where(eq(printClassRouting.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Routing Resolution: Menu Item → Print Class → Order Device → Physical Devices
  async resolveDevicesForMenuItem(menuItemId: string, rvcId: string): Promise<{ printers: Printer[]; kdsDevices: KdsDevice[] }> {
    // Get menu item and its print class
    const menuItem = await this.getMenuItem(menuItemId);
    if (!menuItem?.printClassId) {
      return { printers: [], kdsDevices: [] };
    }

    // Get RVC to find property
    const rvc = await this.getRvc(rvcId);
    if (!rvc) {
      return { printers: [], kdsDevices: [] };
    }

    // Find routing for this print class (check RVC-specific first, then property-level, then any)
    let routing = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, menuItem.printClassId),
        eq(printClassRouting.rvcId, rvcId)
      ));

    if (routing.length === 0) {
      routing = await db.select().from(printClassRouting)
        .where(and(
          eq(printClassRouting.printClassId, menuItem.printClassId),
          eq(printClassRouting.propertyId, rvc.propertyId)
        ));
    }

    if (routing.length === 0) {
      routing = await db.select().from(printClassRouting)
        .where(eq(printClassRouting.printClassId, menuItem.printClassId));
    }

    if (routing.length === 0) {
      return { printers: [], kdsDevices: [] };
    }

    // Get all order devices from routing
    const orderDeviceIds = routing.map(r => r.orderDeviceId);
    
    // Get linked printers and KDS devices for each order device
    const resolvedPrinters: Printer[] = [];
    const resolvedKds: KdsDevice[] = [];

    for (const odId of orderDeviceIds) {
      const printerLinks = await this.getOrderDevicePrinters(odId);
      for (const link of printerLinks) {
        const printer = await this.getPrinter(link.printerId);
        if (printer && printer.active) {
          resolvedPrinters.push(printer);
        }
      }

      const kdsLinks = await this.getOrderDeviceKdsList(odId);
      for (const link of kdsLinks) {
        const kds = await this.getKdsDevice(link.kdsDeviceId);
        if (kds && kds.active) {
          resolvedKds.push(kds);
        }
      }
    }

    return { printers: resolvedPrinters, kdsDevices: resolvedKds };
  }

  // Menu Items
  async getMenuItems(sluId?: string): Promise<MenuItem[]> {
    if (sluId) {
      const linkages = await db.select().from(menuItemSlus).where(eq(menuItemSlus.sluId, sluId));
      const itemIds = linkages.map(l => l.menuItemId);
      if (itemIds.length === 0) return [];
      return db.select().from(menuItems).where(inArray(menuItems.id, itemIds));
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
    // Delete all related linkages first
    await db.delete(menuItemSlus).where(eq(menuItemSlus.menuItemId, id));
    await db.delete(menuItemModifierGroups).where(eq(menuItemModifierGroups.menuItemId, id));
    await db.delete(posLayoutCells).where(eq(posLayoutCells.menuItemId, id));
    // Then delete the menu item
    const result = await db.delete(menuItems).where(eq(menuItems.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async unlinkMenuItemFromSLUs(menuItemId: string): Promise<number> {
    const result = await db.delete(menuItemSlus).where(eq(menuItemSlus.menuItemId, menuItemId));
    return result.rowCount || 0;
  }

  // Modifiers (standalone)
  async getModifiers(): Promise<Modifier[]> {
    return db.select().from(modifiers).where(eq(modifiers.active, true));
  }

  async getModifier(id: string): Promise<Modifier | undefined> {
    const [result] = await db.select().from(modifiers).where(eq(modifiers.id, id));
    return result;
  }

  async createModifier(data: InsertModifier): Promise<Modifier> {
    const [result] = await db.insert(modifiers).values(data).returning();
    return result;
  }

  async updateModifier(id: string, data: Partial<InsertModifier>): Promise<Modifier | undefined> {
    const [result] = await db.update(modifiers).set(data).where(eq(modifiers.id, id)).returning();
    return result;
  }

  async deleteModifier(id: string): Promise<boolean> {
    // First delete linkages to groups
    await db.delete(modifierGroupModifiers).where(eq(modifierGroupModifiers.modifierId, id));
    const result = await db.delete(modifiers).where(eq(modifiers.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Modifier Groups
  async getModifierGroups(menuItemId?: string): Promise<(ModifierGroup & { modifiers: (Modifier & { isDefault: boolean; displayOrder: number })[] })[]> {
    let groups: ModifierGroup[];
    if (menuItemId) {
      const linkages = await db.select().from(menuItemModifierGroups).where(eq(menuItemModifierGroups.menuItemId, menuItemId)).orderBy(menuItemModifierGroups.displayOrder);
      const groupIds = linkages.map(l => l.modifierGroupId);
      if (groupIds.length === 0) return [];
      groups = await db.select().from(modifierGroups).where(inArray(modifierGroups.id, groupIds));
    } else {
      groups = await db.select().from(modifierGroups).where(eq(modifierGroups.active, true)).orderBy(modifierGroups.displayOrder);
    }

    const result: (ModifierGroup & { modifiers: (Modifier & { isDefault: boolean; displayOrder: number })[] })[] = [];
    for (const group of groups) {
      // Get modifiers through the join table
      const linkages = await db.select().from(modifierGroupModifiers).where(eq(modifierGroupModifiers.modifierGroupId, group.id)).orderBy(modifierGroupModifiers.displayOrder);
      const modifierIds = linkages.map(l => l.modifierId);
      
      if (modifierIds.length === 0) {
        result.push({ ...group, modifiers: [] });
        continue;
      }
      
      const mods = await db.select().from(modifiers).where(and(inArray(modifiers.id, modifierIds), eq(modifiers.active, true)));
      // Add isDefault and displayOrder from the linkage
      const modsWithMeta = mods.map(m => {
        const linkage = linkages.find(l => l.modifierId === m.id);
        return {
          ...m,
          isDefault: linkage?.isDefault ?? false,
          displayOrder: linkage?.displayOrder ?? 0,
        };
      }).sort((a, b) => a.displayOrder - b.displayOrder);
      
      result.push({ ...group, modifiers: modsWithMeta });
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
    // First delete linkages to modifiers and menu items
    await db.delete(modifierGroupModifiers).where(eq(modifierGroupModifiers.modifierGroupId, id));
    await db.delete(menuItemModifierGroups).where(eq(menuItemModifierGroups.modifierGroupId, id));
    const result = await db.delete(modifierGroups).where(eq(modifierGroups.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Modifier Group to Modifier linkage
  async getModifierGroupModifiers(modifierGroupId: string): Promise<ModifierGroupModifier[]> {
    return db.select().from(modifierGroupModifiers).where(eq(modifierGroupModifiers.modifierGroupId, modifierGroupId)).orderBy(modifierGroupModifiers.displayOrder);
  }

  async linkModifierToGroup(data: InsertModifierGroupModifier): Promise<ModifierGroupModifier> {
    const [result] = await db.insert(modifierGroupModifiers).values(data).returning();
    return result;
  }

  async unlinkModifierFromGroup(modifierGroupId: string, modifierId: string): Promise<boolean> {
    const result = await db.delete(modifierGroupModifiers).where(
      and(eq(modifierGroupModifiers.modifierGroupId, modifierGroupId), eq(modifierGroupModifiers.modifierId, modifierId))
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updateModifierGroupModifier(id: string, data: Partial<InsertModifierGroupModifier>): Promise<ModifierGroupModifier | undefined> {
    const [result] = await db.update(modifierGroupModifiers).set(data).where(eq(modifierGroupModifiers.id, id)).returning();
    return result;
  }

  // Menu Item to Modifier Group linkage
  async getMenuItemModifierGroups(menuItemId: string): Promise<MenuItemModifierGroup[]> {
    return db.select().from(menuItemModifierGroups).where(eq(menuItemModifierGroups.menuItemId, menuItemId)).orderBy(menuItemModifierGroups.displayOrder);
  }

  async linkModifierGroupToMenuItem(data: InsertMenuItemModifierGroup): Promise<MenuItemModifierGroup> {
    const [result] = await db.insert(menuItemModifierGroups).values(data).returning();
    return result;
  }

  async unlinkModifierGroupFromMenuItem(menuItemId: string, modifierGroupId: string): Promise<boolean> {
    const result = await db.delete(menuItemModifierGroups).where(
      and(eq(menuItemModifierGroups.menuItemId, menuItemId), eq(menuItemModifierGroups.modifierGroupId, modifierGroupId))
    );
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

  async getOpenChecks(rvcId: string): Promise<Check[]> {
    return db.select().from(checks)
      .where(and(eq(checks.rvcId, rvcId), eq(checks.status, "open")))
      .orderBy(checks.openedAt);
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

  async getAllPayments(): Promise<CheckPayment[]> {
    return db.select().from(checkPayments);
  }

  async getAllCheckItems(): Promise<CheckItem[]> {
    return db.select().from(checkItems);
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
  async getKdsTickets(filters?: { rvcId?: string; kdsDeviceId?: string; stationType?: string }): Promise<any[]> {
    const conditions = [sql`${kdsTickets.status} != 'bumped'`];
    
    if (filters?.rvcId) {
      conditions.push(eq(kdsTickets.rvcId, filters.rvcId));
    }
    if (filters?.kdsDeviceId) {
      conditions.push(eq(kdsTickets.kdsDeviceId, filters.kdsDeviceId));
    }
    if (filters?.stationType) {
      conditions.push(eq(kdsTickets.stationType, filters.stationType));
    }

    const tickets = await db.select().from(kdsTickets)
      .where(and(...conditions))
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
            itemStatus: checkItem.itemStatus, // 'pending' or 'active'
          });
        }
      }
      result.push({
        id: ticket.id,
        checkNumber: check?.checkNumber || 0,
        orderType: check?.orderType || 'dine_in',
        stationType: ticket.stationType,
        kdsDeviceId: ticket.kdsDeviceId,
        items: checkItemsList,
        isDraft: ticket.status === 'draft',
        isPreview: ticket.isPreview || false,
        isPaid: ticket.paid || false,
        status: ticket.status,
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

  async createKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void> {
    // Check if this item is already on the ticket to avoid duplicates
    const existing = await db.select().from(kdsTicketItems)
      .where(and(eq(kdsTicketItems.kdsTicketId, kdsTicketId), eq(kdsTicketItems.checkItemId, checkItemId)));
    if (existing.length === 0) {
      await db.insert(kdsTicketItems).values({ kdsTicketId, checkItemId, status: "pending" });
    }
  }

  async removeKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void> {
    await db.delete(kdsTicketItems)
      .where(and(eq(kdsTicketItems.kdsTicketId, kdsTicketId), eq(kdsTicketItems.checkItemId, checkItemId)));
  }

  async voidKdsTicketItem(checkItemId: string): Promise<void> {
    await db.update(kdsTicketItems)
      .set({ status: "voided" })
      .where(eq(kdsTicketItems.checkItemId, checkItemId));
  }

  async bumpKdsTicket(id: string, employeeId: string): Promise<KdsTicket | undefined> {
    const [result] = await db.update(kdsTickets).set({
      status: "bumped",
      bumpedAt: new Date(),
      bumpedByEmployeeId: employeeId,
    }).where(eq(kdsTickets.id, id)).returning();
    
    if (result) {
      await db.update(kdsTicketItems).set({ status: "bumped" })
        .where(eq(kdsTicketItems.kdsTicketId, id));
    }
    return result;
  }

  async recallKdsTicket(id: string): Promise<KdsTicket | undefined> {
    const [result] = await db.update(kdsTickets).set({
      status: "active",
      bumpedAt: null,
      bumpedByEmployeeId: null,
    }).where(eq(kdsTickets.id, id)).returning();
    
    if (result) {
      await db.update(kdsTicketItems).set({ status: "pending" })
        .where(eq(kdsTicketItems.kdsTicketId, id));
    }
    return result;
  }

  async getPreviewTicket(checkId: string): Promise<KdsTicket | undefined> {
    const [result] = await db.select().from(kdsTickets)
      .where(and(eq(kdsTickets.checkId, checkId), eq(kdsTickets.isPreview, true)));
    return result;
  }

  async getKdsTicketsByCheck(checkId: string): Promise<KdsTicket[]> {
    return db.select().from(kdsTickets).where(eq(kdsTickets.checkId, checkId));
  }

  async markKdsTicketsPaid(checkId: string): Promise<void> {
    await db.update(kdsTickets).set({ paid: true }).where(eq(kdsTickets.checkId, checkId));
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

  // POS Layouts
  async getPosLayouts(rvcId?: string): Promise<PosLayout[]> {
    if (rvcId) {
      return db.select().from(posLayouts).where(eq(posLayouts.rvcId, rvcId));
    }
    return db.select().from(posLayouts);
  }

  async getPosLayout(id: string): Promise<PosLayout | undefined> {
    const [result] = await db.select().from(posLayouts).where(eq(posLayouts.id, id));
    return result;
  }

  async getDefaultPosLayout(rvcId: string): Promise<PosLayout | undefined> {
    const [result] = await db.select().from(posLayouts)
      .where(and(eq(posLayouts.rvcId, rvcId), eq(posLayouts.isDefault, true), eq(posLayouts.active, true)));
    return result;
  }

  async createPosLayout(data: InsertPosLayout): Promise<PosLayout> {
    const [result] = await db.insert(posLayouts).values(data).returning();
    return result;
  }

  async updatePosLayout(id: string, data: Partial<InsertPosLayout>): Promise<PosLayout | undefined> {
    const [result] = await db.update(posLayouts).set(data).where(eq(posLayouts.id, id)).returning();
    return result;
  }

  async deletePosLayout(id: string): Promise<boolean> {
    await db.delete(posLayoutCells).where(eq(posLayoutCells.layoutId, id));
    const result = await db.delete(posLayouts).where(eq(posLayouts.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // POS Layout Cells
  async getPosLayoutCells(layoutId: string): Promise<PosLayoutCell[]> {
    return db.select().from(posLayoutCells).where(eq(posLayoutCells.layoutId, layoutId));
  }

  async setPosLayoutCells(layoutId: string, cells: InsertPosLayoutCell[]): Promise<PosLayoutCell[]> {
    await db.delete(posLayoutCells).where(eq(posLayoutCells.layoutId, layoutId));
    if (cells.length === 0) return [];
    const result = await db.insert(posLayoutCells).values(cells.map(c => ({ ...c, layoutId }))).returning();
    return result;
  }

  // POS Layout RVC Assignments
  async getPosLayoutRvcAssignments(layoutId: string): Promise<PosLayoutRvcAssignment[]> {
    return db.select().from(posLayoutRvcAssignments).where(eq(posLayoutRvcAssignments.layoutId, layoutId));
  }

  async setPosLayoutRvcAssignments(layoutId: string, assignments: { propertyId: string; rvcId: string; isDefault?: boolean }[]): Promise<PosLayoutRvcAssignment[]> {
    // Delete existing assignments for this layout
    await db.delete(posLayoutRvcAssignments).where(eq(posLayoutRvcAssignments.layoutId, layoutId));
    if (assignments.length === 0) return [];
    
    // For any RVC where isDefault=true, clear existing defaults first
    for (const a of assignments) {
      if (a.isDefault) {
        await db.update(posLayoutRvcAssignments)
          .set({ isDefault: false })
          .where(eq(posLayoutRvcAssignments.rvcId, a.rvcId));
      }
    }
    
    // Insert new assignments
    const result = await db.insert(posLayoutRvcAssignments).values(
      assignments.map(a => ({ layoutId, propertyId: a.propertyId, rvcId: a.rvcId, isDefault: a.isDefault ?? false }))
    ).returning();
    return result;
  }

  async getPosLayoutsForRvc(rvcId: string): Promise<PosLayout[]> {
    // Get layouts assigned to this RVC via the join table or legacy rvcId field
    const assignedLayoutIds = await db.select({ layoutId: posLayoutRvcAssignments.layoutId })
      .from(posLayoutRvcAssignments)
      .where(eq(posLayoutRvcAssignments.rvcId, rvcId));
    const layoutIds = assignedLayoutIds.map(a => a.layoutId);
    
    // Get layouts either assigned via join table OR via legacy rvcId field
    if (layoutIds.length > 0) {
      return db.select().from(posLayouts).where(
        sql`${posLayouts.id} = ANY(${layoutIds}) OR ${posLayouts.rvcId} = ${rvcId}`
      );
    }
    // Fallback to just legacy rvcId
    return db.select().from(posLayouts).where(eq(posLayouts.rvcId, rvcId));
  }

  async getDefaultLayoutForRvc(rvcId: string): Promise<PosLayout | undefined> {
    // First check for a layout marked as default for this RVC in the assignments table
    const [assignment] = await db.select()
      .from(posLayoutRvcAssignments)
      .where(and(
        eq(posLayoutRvcAssignments.rvcId, rvcId),
        eq(posLayoutRvcAssignments.isDefault, true)
      ));
    
    if (assignment) {
      const [layout] = await db.select().from(posLayouts).where(eq(posLayouts.id, assignment.layoutId));
      return layout;
    }
    
    // Fallback: check for global default layout
    const [globalDefault] = await db.select().from(posLayouts).where(eq(posLayouts.isDefault, true));
    return globalDefault;
  }

  async setDefaultLayoutForRvc(rvcId: string, layoutId: string): Promise<void> {
    // Clear any existing default for this RVC
    await db.update(posLayoutRvcAssignments)
      .set({ isDefault: false })
      .where(eq(posLayoutRvcAssignments.rvcId, rvcId));
    
    // Set the new default
    await db.update(posLayoutRvcAssignments)
      .set({ isDefault: true })
      .where(and(
        eq(posLayoutRvcAssignments.rvcId, rvcId),
        eq(posLayoutRvcAssignments.layoutId, layoutId)
      ));
  }

  // Admin Sales Reset (property-specific)
  async getSalesDataSummary(propertyId: string): Promise<{ checks: number; checkItems: number; payments: number; rounds: number; kdsTickets: number; auditLogs: number }> {
    // Get all RVCs for this property
    const propertyRvcs = await db.select({ id: rvcs.id }).from(rvcs).where(eq(rvcs.propertyId, propertyId));
    const rvcIds = propertyRvcs.map(r => r.id);

    if (rvcIds.length === 0) {
      return { checks: 0, checkItems: 0, payments: 0, rounds: 0, kdsTickets: 0, auditLogs: 0 };
    }

    // Count checks for this property's RVCs
    const [checksCount] = await db.select({ count: sql<number>`count(*)` }).from(checks).where(inArray(checks.rvcId, rvcIds));
    
    // Get check IDs to count related records
    const propertyChecks = await db.select({ id: checks.id }).from(checks).where(inArray(checks.rvcId, rvcIds));
    const checkIds = propertyChecks.map(c => c.id);
    
    let itemsCount = { count: 0 };
    let paymentsCount = { count: 0 };
    let roundsCount = { count: 0 };
    
    if (checkIds.length > 0) {
      [itemsCount] = await db.select({ count: sql<number>`count(*)` }).from(checkItems).where(inArray(checkItems.checkId, checkIds));
      [paymentsCount] = await db.select({ count: sql<number>`count(*)` }).from(checkPayments).where(inArray(checkPayments.checkId, checkIds));
      [roundsCount] = await db.select({ count: sql<number>`count(*)` }).from(rounds).where(inArray(rounds.checkId, checkIds));
    }

    // KDS tickets and audit logs for this property's RVCs
    const [kdsCount] = await db.select({ count: sql<number>`count(*)` }).from(kdsTickets).where(inArray(kdsTickets.rvcId, rvcIds));
    const [auditCount] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(inArray(auditLogs.rvcId, rvcIds));

    return {
      checks: Number(checksCount?.count || 0),
      checkItems: Number(itemsCount?.count || 0),
      payments: Number(paymentsCount?.count || 0),
      rounds: Number(roundsCount?.count || 0),
      kdsTickets: Number(kdsCount?.count || 0),
      auditLogs: Number(auditCount?.count || 0),
    };
  }

  async clearSalesData(propertyId: string): Promise<{ deleted: { checks: number; checkItems: number; payments: number; discounts: number; rounds: number; kdsTicketItems: number; kdsTickets: number; auditLogs: number } }> {
    // Get all RVCs for this property
    const propertyRvcs = await db.select({ id: rvcs.id }).from(rvcs).where(eq(rvcs.propertyId, propertyId));
    const rvcIds = propertyRvcs.map(r => r.id);

    if (rvcIds.length === 0) {
      return { deleted: { checks: 0, checkItems: 0, payments: 0, discounts: 0, rounds: 0, kdsTicketItems: 0, kdsTickets: 0, auditLogs: 0 } };
    }

    // Use transaction to ensure atomicity - either all tables are cleared or none
    return await db.transaction(async (tx) => {
      // STEP 1: Gather all affected IDs upfront
      // Get check IDs for this property
      const propertyChecks = await tx.select({ id: checks.id }).from(checks).where(inArray(checks.rvcId, rvcIds));
      const checkIds = propertyChecks.map(c => c.id);

      // Get check item IDs for these checks
      let checkItemIds: string[] = [];
      if (checkIds.length > 0) {
        const propertyCheckItems = await tx.select({ id: checkItems.id }).from(checkItems).where(inArray(checkItems.checkId, checkIds));
        checkItemIds = propertyCheckItems.map(ci => ci.id);
      }

      // Get round IDs for these checks
      let roundIds: string[] = [];
      if (checkIds.length > 0) {
        const propertyRounds = await tx.select({ id: rounds.id }).from(rounds).where(inArray(rounds.checkId, checkIds));
        roundIds = propertyRounds.map(r => r.id);
      }

      // Get ALL KDS ticket IDs - by rvcId, checkId, OR roundId (deduplicated)
      const kdsTicketIdSet = new Set<string>();
      
      const kdsTicketsByRvc = await tx.select({ id: kdsTickets.id }).from(kdsTickets).where(inArray(kdsTickets.rvcId, rvcIds));
      kdsTicketsByRvc.forEach(k => kdsTicketIdSet.add(k.id));
      
      if (checkIds.length > 0) {
        const kdsTicketsByCheck = await tx.select({ id: kdsTickets.id }).from(kdsTickets).where(inArray(kdsTickets.checkId, checkIds));
        kdsTicketsByCheck.forEach(k => kdsTicketIdSet.add(k.id));
      }
      
      if (roundIds.length > 0) {
        const kdsTicketsByRound = await tx.select({ id: kdsTickets.id }).from(kdsTickets).where(inArray(kdsTickets.roundId, roundIds));
        kdsTicketsByRound.forEach(k => kdsTicketIdSet.add(k.id));
      }
      
      const allKdsTicketIds = Array.from(kdsTicketIdSet);

      // STEP 2: Delete in FK-safe order
      let kdsItemsResult = { rowCount: 0 };
      let kdsResult = { rowCount: 0 };
      let paymentsResult = { rowCount: 0 };
      let discountsResult = { rowCount: 0 };
      let itemsResult = { rowCount: 0 };
      let roundsResult = { rowCount: 0 };

      // 1. Delete kds_ticket_items (references kdsTickets and checkItems)
      if (allKdsTicketIds.length > 0) {
        kdsItemsResult = await tx.delete(kdsTicketItems).where(inArray(kdsTicketItems.kdsTicketId, allKdsTicketIds));
      }
      // Also delete by checkItemId to catch any stragglers
      if (checkItemIds.length > 0) {
        const additionalKdsItems = await tx.delete(kdsTicketItems).where(inArray(kdsTicketItems.checkItemId, checkItemIds));
        kdsItemsResult = { rowCount: (kdsItemsResult.rowCount || 0) + (additionalKdsItems.rowCount || 0) };
      }

      // 2. Delete kds_tickets (references rounds and checks)
      if (allKdsTicketIds.length > 0) {
        kdsResult = await tx.delete(kdsTickets).where(inArray(kdsTickets.id, allKdsTicketIds));
      }

      // 3. Delete check_payments and check_discounts
      if (checkIds.length > 0) {
        paymentsResult = await tx.delete(checkPayments).where(inArray(checkPayments.checkId, checkIds));
        discountsResult = await tx.delete(checkDiscounts).where(inArray(checkDiscounts.checkId, checkIds));
      }

      // 4. Delete check_items (after kds_ticket_items are gone)
      if (checkIds.length > 0) {
        itemsResult = await tx.delete(checkItems).where(inArray(checkItems.checkId, checkIds));
      }

      // 5. Delete rounds (after kds_tickets are gone)
      if (checkIds.length > 0) {
        roundsResult = await tx.delete(rounds).where(inArray(rounds.checkId, checkIds));
      }

      // 6. Delete audit logs and checks
      const auditResult = await tx.delete(auditLogs).where(inArray(auditLogs.rvcId, rvcIds));
      const checksResult = await tx.delete(checks).where(inArray(checks.rvcId, rvcIds));

      return {
        deleted: {
          checks: checksResult.rowCount || 0,
          checkItems: itemsResult.rowCount || 0,
          payments: paymentsResult.rowCount || 0,
          discounts: discountsResult.rowCount || 0,
          rounds: roundsResult.rowCount || 0,
          kdsTicketItems: kdsItemsResult.rowCount || 0,
          kdsTickets: kdsResult.rowCount || 0,
          auditLogs: auditResult.rowCount || 0,
        }
      };
    });
  }

  // ============================================================================
  // DEVICE REGISTRY (CAL)
  // ============================================================================

  async getDevices(filters?: { enterpriseId?: string; propertyId?: string; deviceType?: string; status?: string }): Promise<Device[]> {
    let query = db.select().from(devices);
    const conditions = [];
    
    if (filters?.enterpriseId) {
      conditions.push(eq(devices.enterpriseId, filters.enterpriseId));
    }
    if (filters?.propertyId) {
      conditions.push(eq(devices.propertyId, filters.propertyId));
    }
    if (filters?.deviceType) {
      conditions.push(eq(devices.deviceType, filters.deviceType));
    }
    if (filters?.status) {
      conditions.push(eq(devices.status, filters.status));
    }
    
    if (conditions.length > 0) {
      return db.select().from(devices).where(and(...conditions)).orderBy(desc(devices.createdAt));
    }
    return db.select().from(devices).orderBy(desc(devices.createdAt));
  }

  async getDevice(id: string): Promise<Device | undefined> {
    const [result] = await db.select().from(devices).where(eq(devices.id, id));
    return result;
  }

  async getDeviceByDeviceId(deviceId: string): Promise<Device | undefined> {
    const [result] = await db.select().from(devices).where(eq(devices.deviceId, deviceId));
    return result;
  }

  async createDevice(data: InsertDevice): Promise<Device> {
    const [result] = await db.insert(devices).values(data).returning();
    return result;
  }

  async updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined> {
    const [result] = await db.update(devices).set(data).where(eq(devices.id, id)).returning();
    return result;
  }

  async deleteDevice(id: string): Promise<boolean> {
    const result = await db.delete(devices).where(eq(devices.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updateDeviceLastSeen(id: string): Promise<void> {
    await db.update(devices).set({ lastSeenAt: new Date(), status: "active" }).where(eq(devices.id, id));
  }

  // Device Enrollment Tokens
  async getDeviceEnrollmentTokens(enterpriseId?: string): Promise<DeviceEnrollmentToken[]> {
    if (enterpriseId) {
      return db.select().from(deviceEnrollmentTokens).where(eq(deviceEnrollmentTokens.enterpriseId, enterpriseId)).orderBy(desc(deviceEnrollmentTokens.createdAt));
    }
    return db.select().from(deviceEnrollmentTokens).orderBy(desc(deviceEnrollmentTokens.createdAt));
  }

  async getDeviceEnrollmentToken(id: string): Promise<DeviceEnrollmentToken | undefined> {
    const [result] = await db.select().from(deviceEnrollmentTokens).where(eq(deviceEnrollmentTokens.id, id));
    return result;
  }

  async getDeviceEnrollmentTokenByToken(token: string): Promise<DeviceEnrollmentToken | undefined> {
    const [result] = await db.select().from(deviceEnrollmentTokens).where(eq(deviceEnrollmentTokens.token, token));
    return result;
  }

  async createDeviceEnrollmentToken(data: InsertDeviceEnrollmentToken): Promise<DeviceEnrollmentToken> {
    const [result] = await db.insert(deviceEnrollmentTokens).values(data).returning();
    return result;
  }

  async deleteDeviceEnrollmentToken(id: string): Promise<boolean> {
    const result = await db.delete(deviceEnrollmentTokens).where(eq(deviceEnrollmentTokens.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async useDeviceEnrollmentToken(token: string): Promise<DeviceEnrollmentToken | undefined> {
    const existing = await this.getDeviceEnrollmentTokenByToken(token);
    if (!existing || !existing.active) return undefined;
    
    // Check if expired
    if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
      return undefined;
    }
    
    // Check if max uses reached
    if (existing.maxUses && (existing.usedCount || 0) >= existing.maxUses) {
      return undefined;
    }
    
    // Increment used count
    const [result] = await db.update(deviceEnrollmentTokens)
      .set({ usedCount: (existing.usedCount || 0) + 1 })
      .where(eq(deviceEnrollmentTokens.id, existing.id))
      .returning();
    
    return result;
  }

  // Device Heartbeats
  async createDeviceHeartbeat(data: InsertDeviceHeartbeat): Promise<DeviceHeartbeat> {
    const [result] = await db.insert(deviceHeartbeats).values(data).returning();
    // Also update the device's last seen timestamp
    await this.updateDeviceLastSeen(data.deviceId);
    return result;
  }

  async getDeviceHeartbeats(deviceId: string, limit: number = 100): Promise<DeviceHeartbeat[]> {
    return db.select().from(deviceHeartbeats)
      .where(eq(deviceHeartbeats.deviceId, deviceId))
      .orderBy(desc(deviceHeartbeats.timestamp))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
