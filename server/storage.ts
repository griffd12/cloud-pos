import { db } from "./db";
import { eq, and, desc, sql, inArray, gte, lte } from "drizzle-orm";
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
  refunds, refundItems, refundPayments,
  // T&A tables
  jobCodes, employeeJobCodes, payPeriods, timePunches, breakSessions,
  timecards, timecardExceptions, timecardEdits,
  employeeAvailability, availabilityExceptions, timeOffRequests,
  shiftTemplates, shifts, shiftCoverRequests, shiftCoverOffers, shiftCoverApprovals,
  tipPoolPolicies, tipPoolRuns, tipAllocations, laborSnapshots, overtimeRules,
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
  type Refund, type InsertRefund,
  type RefundItem, type InsertRefundItem,
  type RefundPayment, type InsertRefundPayment,
  // T&A imports
  type JobCode, type InsertJobCode,
  type EmployeeJobCode, type InsertEmployeeJobCode,
  type PayPeriod, type InsertPayPeriod,
  type TimePunch, type InsertTimePunch,
  type BreakSession, type InsertBreakSession,
  type Timecard, type InsertTimecard,
  type TimecardException, type InsertTimecardException,
  type TimecardEdit, type InsertTimecardEdit,
  type EmployeeAvailability, type InsertEmployeeAvailability,
  type AvailabilityException, type InsertAvailabilityException,
  type TimeOffRequest, type InsertTimeOffRequest,
  type ShiftTemplate, type InsertShiftTemplate,
  type Shift, type InsertShift,
  type ShiftCoverRequest, type InsertShiftCoverRequest,
  type ShiftCoverOffer, type InsertShiftCoverOffer,
  type ShiftCoverApproval, type InsertShiftCoverApproval,
  type TipPoolPolicy, type InsertTipPoolPolicy,
  type TipPoolRun, type InsertTipPoolRun,
  type TipAllocation, type InsertTipAllocation,
  type LaborSnapshot, type InsertLaborSnapshot,
  type OvertimeRule, type InsertOvertimeRule,
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
  getChecksByPropertyAndDateRange(propertyId: string, startDate: string, endDate: string): Promise<Check[]>;
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
  getAllKdsTicketsForReporting(filters?: { rvcId?: string }): Promise<any[]>;
  getKdsTicket(id: string): Promise<KdsTicket | undefined>;
  createKdsTicket(data: InsertKdsTicket): Promise<KdsTicket>;
  updateKdsTicket(id: string, data: Partial<KdsTicket>): Promise<KdsTicket | undefined>;
  createKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void>;
  removeKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void>;
  voidKdsTicketItem(checkItemId: string): Promise<void>;
  bumpKdsTicket(id: string, employeeId: string): Promise<KdsTicket | undefined>;
  recallKdsTicket(id: string): Promise<KdsTicket | undefined>;
  getBumpedKdsTickets(filters: { rvcId?: string; stationType?: string; limit?: number }): Promise<any[]>;
  markKdsItemReady(ticketItemId: string): Promise<void>;
  unmarkKdsItemReady(ticketItemId: string): Promise<void>;
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

  // Refunds
  getRefunds(rvcId?: string): Promise<Refund[]>;
  getRefundsForCheck(checkId: string): Promise<Refund[]>;
  getRefund(id: string): Promise<Refund | undefined>;
  getRefundWithDetails(id: string): Promise<{ refund: Refund; items: RefundItem[]; payments: RefundPayment[] } | undefined>;
  createRefund(data: InsertRefund, items: Omit<InsertRefundItem, 'refundId'>[], payments: Omit<InsertRefundPayment, 'refundId'>[]): Promise<Refund>;
  getNextRefundNumber(rvcId: string): Promise<number>;
  getClosedChecks(rvcId: string, options?: { businessDate?: string; checkNumber?: number; limit?: number }): Promise<Check[]>;
  getCheckWithPaymentsAndItems(checkId: string): Promise<{ check: Check; items: CheckItem[]; payments: CheckPayment[] } | undefined>;

  // ============================================================================
  // TIME & ATTENDANCE
  // ============================================================================

  // Job Codes
  getJobCodes(propertyId?: string): Promise<JobCode[]>;
  getJobCode(id: string): Promise<JobCode | undefined>;
  createJobCode(data: InsertJobCode): Promise<JobCode>;
  updateJobCode(id: string, data: Partial<InsertJobCode>): Promise<JobCode | undefined>;
  deleteJobCode(id: string): Promise<boolean>;

  // Employee Job Codes
  getEmployeeJobCodes(employeeId: string): Promise<EmployeeJobCode[]>;
  getEmployeeJobCodesWithDetails(employeeId: string): Promise<(EmployeeJobCode & { jobCode: JobCode })[]>;
  setEmployeeJobCodes(employeeId: string, assignments: { jobCodeId: string; payRate?: string; isPrimary?: boolean }[]): Promise<EmployeeJobCode[]>;

  // Pay Periods
  getPayPeriods(propertyId: string): Promise<PayPeriod[]>;
  getPayPeriod(id: string): Promise<PayPeriod | undefined>;
  getPayPeriodForDate(propertyId: string, date: string): Promise<PayPeriod | undefined>;
  createPayPeriod(data: InsertPayPeriod): Promise<PayPeriod>;
  updatePayPeriod(id: string, data: Partial<InsertPayPeriod>): Promise<PayPeriod | undefined>;
  lockPayPeriod(id: string, lockedById: string): Promise<PayPeriod | undefined>;
  unlockPayPeriod(id: string, reason: string, unlockedById: string): Promise<PayPeriod | undefined>;

  // Time Punches
  getTimePunches(filters: { propertyId?: string; employeeId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<TimePunch[]>;
  getTimePunch(id: string): Promise<TimePunch | undefined>;
  getLastPunch(employeeId: string): Promise<TimePunch | undefined>;
  createTimePunch(data: InsertTimePunch): Promise<TimePunch>;
  updateTimePunch(id: string, data: Partial<InsertTimePunch>, editedById?: string, editReason?: string): Promise<TimePunch | undefined>;
  voidTimePunch(id: string, voidedById: string, voidReason: string): Promise<TimePunch | undefined>;

  // Break Sessions
  getBreakSessions(filters: { propertyId?: string; employeeId?: string; businessDate?: string }): Promise<BreakSession[]>;
  getBreakSession(id: string): Promise<BreakSession | undefined>;
  getActiveBreak(employeeId: string): Promise<BreakSession | undefined>;
  createBreakSession(data: InsertBreakSession): Promise<BreakSession>;
  updateBreakSession(id: string, data: Partial<InsertBreakSession>): Promise<BreakSession | undefined>;

  // Timecards
  getTimecards(filters: { propertyId?: string; employeeId?: string; payPeriodId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<Timecard[]>;
  getTimecard(id: string): Promise<Timecard | undefined>;
  createTimecard(data: InsertTimecard): Promise<Timecard>;
  updateTimecard(id: string, data: Partial<InsertTimecard>): Promise<Timecard | undefined>;
  recalculateTimecard(employeeId: string, businessDate: string): Promise<Timecard | undefined>;

  // Timecard Exceptions
  getTimecardExceptions(filters: { propertyId?: string; employeeId?: string; status?: string }): Promise<TimecardException[]>;
  getTimecardException(id: string): Promise<TimecardException | undefined>;
  createTimecardException(data: InsertTimecardException): Promise<TimecardException>;
  resolveTimecardException(id: string, resolvedById: string, resolutionNotes: string): Promise<TimecardException | undefined>;

  // Timecard Edits (Audit Log)
  getTimecardEdits(filters: { propertyId?: string; targetType?: string; targetId?: string }): Promise<TimecardEdit[]>;
  createTimecardEdit(data: InsertTimecardEdit): Promise<TimecardEdit>;

  // ============================================================================
  // SCHEDULING
  // ============================================================================

  // Employee Availability
  getEmployeeAvailability(employeeId: string): Promise<EmployeeAvailability[]>;
  setEmployeeAvailability(employeeId: string, availability: InsertEmployeeAvailability[]): Promise<EmployeeAvailability[]>;

  // Availability Exceptions
  getAvailabilityExceptions(employeeId: string, startDate?: string, endDate?: string): Promise<AvailabilityException[]>;
  createAvailabilityException(data: InsertAvailabilityException): Promise<AvailabilityException>;
  deleteAvailabilityException(id: string): Promise<boolean>;

  // Time Off Requests
  getTimeOffRequests(filters: { employeeId?: string; propertyId?: string; status?: string }): Promise<TimeOffRequest[]>;
  getTimeOffRequest(id: string): Promise<TimeOffRequest | undefined>;
  createTimeOffRequest(data: InsertTimeOffRequest): Promise<TimeOffRequest>;
  updateTimeOffRequest(id: string, data: Partial<InsertTimeOffRequest>): Promise<TimeOffRequest | undefined>;
  reviewTimeOffRequest(id: string, reviewedById: string, approved: boolean, notes?: string): Promise<TimeOffRequest | undefined>;

  // Shift Templates
  getShiftTemplates(propertyId: string): Promise<ShiftTemplate[]>;
  getShiftTemplate(id: string): Promise<ShiftTemplate | undefined>;
  createShiftTemplate(data: InsertShiftTemplate): Promise<ShiftTemplate>;
  updateShiftTemplate(id: string, data: Partial<InsertShiftTemplate>): Promise<ShiftTemplate | undefined>;
  deleteShiftTemplate(id: string): Promise<boolean>;

  // Shifts
  getShifts(filters: { propertyId?: string; rvcId?: string; employeeId?: string; startDate?: string; endDate?: string; status?: string }): Promise<Shift[]>;
  getShift(id: string): Promise<Shift | undefined>;
  createShift(data: InsertShift): Promise<Shift>;
  updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined>;
  deleteShift(id: string): Promise<boolean>;
  publishShifts(shiftIds: string[], publishedById: string): Promise<Shift[]>;
  copyWeekSchedule(propertyId: string, sourceWeekStart: string, targetWeekStart: string): Promise<Shift[]>;

  // Shift Cover Requests
  getShiftCoverRequests(filters: { shiftId?: string; requesterId?: string; status?: string }): Promise<ShiftCoverRequest[]>;
  getShiftCoverRequest(id: string): Promise<ShiftCoverRequest | undefined>;
  createShiftCoverRequest(data: InsertShiftCoverRequest): Promise<ShiftCoverRequest>;
  updateShiftCoverRequest(id: string, data: Partial<InsertShiftCoverRequest>): Promise<ShiftCoverRequest | undefined>;

  // Shift Cover Offers
  getShiftCoverOffers(coverRequestId: string): Promise<ShiftCoverOffer[]>;
  createShiftCoverOffer(data: InsertShiftCoverOffer): Promise<ShiftCoverOffer>;
  updateShiftCoverOffer(id: string, data: Partial<InsertShiftCoverOffer>): Promise<ShiftCoverOffer | undefined>;

  // Shift Cover Approvals
  approveShiftCover(coverRequestId: string, offerId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval>;
  denyShiftCover(coverRequestId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval>;

  // ============================================================================
  // TIP POOLING
  // ============================================================================

  // Tip Pool Policies
  getTipPoolPolicies(propertyId: string): Promise<TipPoolPolicy[]>;
  getTipPoolPolicy(id: string): Promise<TipPoolPolicy | undefined>;
  createTipPoolPolicy(data: InsertTipPoolPolicy): Promise<TipPoolPolicy>;
  updateTipPoolPolicy(id: string, data: Partial<InsertTipPoolPolicy>): Promise<TipPoolPolicy | undefined>;
  deleteTipPoolPolicy(id: string): Promise<boolean>;

  // Tip Pool Runs
  getTipPoolRuns(filters: { propertyId?: string; businessDate?: string }): Promise<TipPoolRun[]>;
  getTipPoolRun(id: string): Promise<TipPoolRun | undefined>;
  createTipPoolRun(data: InsertTipPoolRun): Promise<TipPoolRun>;
  updateTipPoolRun(id: string, data: Partial<InsertTipPoolRun>): Promise<TipPoolRun | undefined>;

  // Tip Allocations
  getTipAllocations(tipPoolRunId: string): Promise<TipAllocation[]>;
  createTipAllocation(data: InsertTipAllocation): Promise<TipAllocation>;
  runTipPoolSettlement(propertyId: string, businessDate: string, policyId: string, runById: string): Promise<{ run: TipPoolRun; allocations: TipAllocation[] }>;

  // ============================================================================
  // LABOR VS SALES
  // ============================================================================

  // Labor Snapshots
  getLaborSnapshots(filters: { propertyId?: string; rvcId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<LaborSnapshot[]>;
  createLaborSnapshot(data: InsertLaborSnapshot): Promise<LaborSnapshot>;
  updateLaborSnapshot(id: string, data: Partial<InsertLaborSnapshot>): Promise<LaborSnapshot | undefined>;
  calculateLaborSnapshot(propertyId: string, businessDate: string): Promise<LaborSnapshot>;

  // ============================================================================
  // OVERTIME RULES
  // ============================================================================
  
  getOvertimeRules(propertyId: string): Promise<OvertimeRule[]>;
  getOvertimeRule(id: string): Promise<OvertimeRule | undefined>;
  getActiveOvertimeRule(propertyId: string): Promise<OvertimeRule | undefined>;
  createOvertimeRule(data: InsertOvertimeRule): Promise<OvertimeRule>;
  updateOvertimeRule(id: string, data: Partial<InsertOvertimeRule>): Promise<OvertimeRule | undefined>;
  deleteOvertimeRule(id: string): Promise<boolean>;
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

  async getChecksByPropertyAndDateRange(propertyId: string, startDate: string, endDate: string): Promise<Check[]> {
    // Get all RVCs for the property
    const propertyRvcs = await this.getRvcs(propertyId);
    const rvcIds = propertyRvcs.map(rvc => rvc.id);
    
    if (rvcIds.length === 0) return [];
    
    // Query checks for those RVCs within the date range
    return db.select().from(checks)
      .where(and(
        inArray(checks.rvcId, rvcIds),
        gte(checks.businessDate, startDate),
        lte(checks.businessDate, endDate)
      ))
      .orderBy(checks.businessDate);
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

    // Sort so recalled tickets appear first (in creation order among themselves)
    const sortedTickets = tickets.sort((a, b) => {
      if (a.isRecalled && !b.isRecalled) return -1;
      if (!a.isRecalled && b.isRecalled) return 1;
      return new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime();
    });

    const result = [];
    for (const ticket of sortedTickets) {
      const check = await this.getCheck(ticket.checkId);
      const items = await db.select().from(kdsTicketItems).where(eq(kdsTicketItems.kdsTicketId, ticket.id));
      const checkItemsList = [];
      for (const item of items) {
        const checkItem = await this.getCheckItem(item.checkItemId);
        if (checkItem) {
          checkItemsList.push({
            id: item.id, // Use the kdsTicketItem id for marking ready
            checkItemId: checkItem.id,
            name: checkItem.menuItemName,
            quantity: checkItem.quantity || 1,
            modifiers: checkItem.modifiers,
            status: item.status,
            itemStatus: checkItem.itemStatus, // 'pending' or 'active'
            isReady: item.isReady || false,
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
        isRecalled: ticket.isRecalled || false,
        status: ticket.status,
        createdAt: ticket.createdAt,
      });
    }
    return result;
  }

  async getAllKdsTicketsForReporting(filters?: { rvcId?: string }): Promise<any[]> {
    // Get ALL tickets including bumped ones for reporting purposes
    const conditions = [];
    
    if (filters?.rvcId) {
      conditions.push(eq(kdsTickets.rvcId, filters.rvcId));
    }

    const tickets = conditions.length > 0 
      ? await db.select().from(kdsTickets).where(and(...conditions)).orderBy(kdsTickets.createdAt)
      : await db.select().from(kdsTickets).orderBy(kdsTickets.createdAt);

    const result = [];
    for (const ticket of tickets) {
      const items = await db.select().from(kdsTicketItems).where(eq(kdsTicketItems.kdsTicketId, ticket.id));
      const checkItemsList = [];
      for (const item of items) {
        const checkItem = await this.getCheckItem(item.checkItemId);
        if (checkItem) {
          checkItemsList.push({
            id: item.id,
            checkItemId: checkItem.id,
            name: checkItem.menuItemName,
            quantity: checkItem.quantity || 1,
            modifiers: checkItem.modifiers,
            status: item.status,
            isReady: item.isReady || false,
          });
        }
      }
      result.push({
        id: ticket.id,
        rvcId: ticket.rvcId,
        stationType: ticket.stationType,
        kdsDeviceId: ticket.kdsDeviceId,
        items: checkItemsList,
        isPreview: ticket.isPreview || false,
        isPaid: ticket.paid || false,
        isRecalled: ticket.isRecalled || false,
        status: ticket.status,
        createdAt: ticket.createdAt,
        bumpedAt: ticket.bumpedAt,
        completedAt: ticket.bumpedAt, // bumpedAt is the completion time
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
      isRecalled: true,
      recalledAt: new Date(),
      bumpedAt: null,
      bumpedByEmployeeId: null,
    }).where(eq(kdsTickets.id, id)).returning();
    
    if (result) {
      // Reset item ready states as well
      await db.update(kdsTicketItems).set({ status: "pending", isReady: false, readyAt: null })
        .where(eq(kdsTicketItems.kdsTicketId, id));
    }
    return result;
  }

  async getBumpedKdsTickets(filters: { rvcId?: string; stationType?: string; limit?: number }): Promise<any[]> {
    const allTickets = await db.select().from(kdsTickets)
      .where(eq(kdsTickets.status, "bumped"))
      .orderBy(desc(kdsTickets.bumpedAt));
    
    let filtered = allTickets;
    if (filters.rvcId) {
      filtered = filtered.filter((t) => t.rvcId === filters.rvcId);
    }
    if (filters.stationType) {
      filtered = filtered.filter((t) => t.stationType === filters.stationType);
    }
    
    const limited = filters.limit ? filtered.slice(0, filters.limit) : filtered.slice(0, 50);
    
    // Load check details for each ticket
    const enriched = await Promise.all(limited.map(async (ticket) => {
      const check = await this.getCheck(ticket.checkId);
      const ticketItems = await db.select().from(kdsTicketItems)
        .where(eq(kdsTicketItems.kdsTicketId, ticket.id));
      
      const items = await Promise.all(ticketItems.map(async (ti) => {
        const checkItem = await this.getCheckItem(ti.checkItemId);
        return checkItem ? {
          id: ti.id,
          name: checkItem.menuItemName,
          quantity: checkItem.quantity,
          status: ti.status,
          isReady: ti.isReady,
        } : null;
      }));
      
      return {
        ...ticket,
        checkNumber: check?.checkNumber,
        orderType: check?.orderType,
        items: items.filter(Boolean),
      };
    }));
    
    return enriched;
  }

  async markKdsItemReady(ticketItemId: string): Promise<void> {
    await db.update(kdsTicketItems)
      .set({ isReady: true, readyAt: new Date() })
      .where(eq(kdsTicketItems.id, ticketItemId));
  }

  async unmarkKdsItemReady(ticketItemId: string): Promise<void> {
    await db.update(kdsTicketItems)
      .set({ isReady: false, readyAt: null })
      .where(eq(kdsTicketItems.id, ticketItemId));
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

  // Refunds
  async getRefunds(rvcId?: string): Promise<Refund[]> {
    if (rvcId) {
      return db.select().from(refunds).where(eq(refunds.rvcId, rvcId)).orderBy(desc(refunds.createdAt));
    }
    return db.select().from(refunds).orderBy(desc(refunds.createdAt));
  }

  async getRefundsForCheck(checkId: string): Promise<Refund[]> {
    return db.select().from(refunds).where(eq(refunds.originalCheckId, checkId)).orderBy(desc(refunds.createdAt));
  }

  async getRefund(id: string): Promise<Refund | undefined> {
    const [result] = await db.select().from(refunds).where(eq(refunds.id, id));
    return result;
  }

  async getRefundWithDetails(id: string): Promise<{ refund: Refund; items: RefundItem[]; payments: RefundPayment[] } | undefined> {
    const refund = await this.getRefund(id);
    if (!refund) return undefined;

    const items = await db.select().from(refundItems).where(eq(refundItems.refundId, id));
    const payments = await db.select().from(refundPayments).where(eq(refundPayments.refundId, id));

    return { refund, items, payments };
  }

  async createRefund(
    data: InsertRefund,
    items: Omit<InsertRefundItem, 'refundId'>[],
    payments: Omit<InsertRefundPayment, 'refundId'>[]
  ): Promise<Refund> {
    const [refund] = await db.insert(refunds).values(data).returning();

    if (items.length > 0) {
      await db.insert(refundItems).values(
        items.map(item => ({ ...item, refundId: refund.id }))
      );
    }

    if (payments.length > 0) {
      await db.insert(refundPayments).values(
        payments.map(payment => ({ ...payment, refundId: refund.id }))
      );
    }

    return refund;
  }

  async getNextRefundNumber(rvcId: string): Promise<number> {
    const result = await db.select({ maxNumber: sql<number>`COALESCE(MAX(${refunds.refundNumber}), 0)` })
      .from(refunds)
      .where(eq(refunds.rvcId, rvcId));
    return (result[0]?.maxNumber || 0) + 1;
  }

  async getClosedChecks(rvcId: string, options?: { businessDate?: string; checkNumber?: number; limit?: number }): Promise<Check[]> {
    const conditions = [eq(checks.rvcId, rvcId), eq(checks.status, "closed")];
    
    if (options?.businessDate) {
      conditions.push(eq(checks.businessDate, options.businessDate));
    }
    if (options?.checkNumber) {
      conditions.push(eq(checks.checkNumber, options.checkNumber));
    }

    let query = db.select().from(checks).where(and(...conditions)).orderBy(desc(checks.closedAt));
    
    if (options?.limit) {
      return query.limit(options.limit);
    }
    return query;
  }

  async getCheckWithPaymentsAndItems(checkId: string): Promise<{ check: Check; items: CheckItem[]; payments: CheckPayment[] } | undefined> {
    const [check] = await db.select().from(checks).where(eq(checks.id, checkId));
    if (!check) return undefined;

    const items = await db.select().from(checkItems).where(eq(checkItems.checkId, checkId));
    const payments = await db.select().from(checkPayments).where(eq(checkPayments.checkId, checkId));

    return { check, items, payments };
  }

  // ============================================================================
  // TIME & ATTENDANCE IMPLEMENTATIONS
  // ============================================================================

  // Job Codes
  async getJobCodes(propertyId?: string): Promise<JobCode[]> {
    if (propertyId) {
      return db.select().from(jobCodes).where(eq(jobCodes.propertyId, propertyId)).orderBy(jobCodes.displayOrder);
    }
    return db.select().from(jobCodes).orderBy(jobCodes.displayOrder);
  }

  async getJobCode(id: string): Promise<JobCode | undefined> {
    const [result] = await db.select().from(jobCodes).where(eq(jobCodes.id, id));
    return result;
  }

  async createJobCode(data: InsertJobCode): Promise<JobCode> {
    const [result] = await db.insert(jobCodes).values(data).returning();
    return result;
  }

  async updateJobCode(id: string, data: Partial<InsertJobCode>): Promise<JobCode | undefined> {
    const [result] = await db.update(jobCodes).set(data).where(eq(jobCodes.id, id)).returning();
    return result;
  }

  async deleteJobCode(id: string): Promise<boolean> {
    const result = await db.delete(jobCodes).where(eq(jobCodes.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Employee Job Codes
  async getEmployeeJobCodes(employeeId: string): Promise<EmployeeJobCode[]> {
    return db.select().from(employeeJobCodes).where(eq(employeeJobCodes.employeeId, employeeId));
  }

  async getEmployeeJobCodesWithDetails(employeeId: string): Promise<(EmployeeJobCode & { jobCode: JobCode })[]> {
    const results = await db
      .select({
        id: employeeJobCodes.id,
        employeeId: employeeJobCodes.employeeId,
        jobCodeId: employeeJobCodes.jobCodeId,
        payRate: employeeJobCodes.payRate,
        isPrimary: employeeJobCodes.isPrimary,
        jobCode: jobCodes,
      })
      .from(employeeJobCodes)
      .innerJoin(jobCodes, eq(employeeJobCodes.jobCodeId, jobCodes.id))
      .where(eq(employeeJobCodes.employeeId, employeeId));
    
    return results.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      jobCodeId: r.jobCodeId,
      payRate: r.payRate,
      isPrimary: r.isPrimary,
      jobCode: r.jobCode,
    }));
  }

  async setEmployeeJobCodes(employeeId: string, assignments: { jobCodeId: string; payRate?: string; isPrimary?: boolean }[]): Promise<EmployeeJobCode[]> {
    await db.delete(employeeJobCodes).where(eq(employeeJobCodes.employeeId, employeeId));
    if (assignments.length === 0) return [];
    const values = assignments.map((assignment, index) => ({
      employeeId,
      jobCodeId: assignment.jobCodeId,
      payRate: assignment.payRate || null,
      isPrimary: assignment.isPrimary ?? (index === 0),
    }));
    return db.insert(employeeJobCodes).values(values).returning();
  }

  // Pay Periods
  async getPayPeriods(propertyId: string): Promise<PayPeriod[]> {
    return db.select().from(payPeriods).where(eq(payPeriods.propertyId, propertyId)).orderBy(desc(payPeriods.startDate));
  }

  async getPayPeriod(id: string): Promise<PayPeriod | undefined> {
    const [result] = await db.select().from(payPeriods).where(eq(payPeriods.id, id));
    return result;
  }

  async getPayPeriodForDate(propertyId: string, date: string): Promise<PayPeriod | undefined> {
    const [result] = await db.select().from(payPeriods)
      .where(and(
        eq(payPeriods.propertyId, propertyId),
        lte(payPeriods.startDate, date),
        gte(payPeriods.endDate, date)
      ));
    return result;
  }

  async createPayPeriod(data: InsertPayPeriod): Promise<PayPeriod> {
    const [result] = await db.insert(payPeriods).values(data).returning();
    return result;
  }

  async updatePayPeriod(id: string, data: Partial<InsertPayPeriod>): Promise<PayPeriod | undefined> {
    const [result] = await db.update(payPeriods).set(data).where(eq(payPeriods.id, id)).returning();
    return result;
  }

  async lockPayPeriod(id: string, lockedById: string): Promise<PayPeriod | undefined> {
    const [result] = await db.update(payPeriods)
      .set({ status: "locked", lockedAt: new Date(), lockedById })
      .where(eq(payPeriods.id, id))
      .returning();
    return result;
  }

  async unlockPayPeriod(id: string, reason: string, unlockedById: string): Promise<PayPeriod | undefined> {
    const payPeriod = await this.getPayPeriod(id);
    if (!payPeriod) return undefined;
    
    // Create audit record for unlock
    await this.createTimecardEdit({
      propertyId: payPeriod.propertyId,
      targetType: "pay_period",
      targetId: id,
      editType: "unlock",
      beforeValue: { status: payPeriod.status },
      afterValue: { status: "open" },
      reasonCode: "manual_unlock",
      notes: reason,
      editedById: unlockedById,
    });

    const [result] = await db.update(payPeriods)
      .set({ status: "open", lockedAt: null, lockedById: null })
      .where(eq(payPeriods.id, id))
      .returning();
    return result;
  }

  // Time Punches
  async getTimePunches(filters: { propertyId?: string; employeeId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<TimePunch[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(timePunches.propertyId, filters.propertyId));
    if (filters.employeeId) conditions.push(eq(timePunches.employeeId, filters.employeeId));
    if (filters.businessDate) conditions.push(eq(timePunches.businessDate, filters.businessDate));
    if (filters.startDate) conditions.push(gte(timePunches.businessDate, filters.startDate));
    if (filters.endDate) conditions.push(lte(timePunches.businessDate, filters.endDate));
    conditions.push(eq(timePunches.voided, false));
    
    if (conditions.length === 0) {
      return db.select().from(timePunches).orderBy(desc(timePunches.actualTimestamp));
    }
    return db.select().from(timePunches).where(and(...conditions)).orderBy(desc(timePunches.actualTimestamp));
  }

  async getTimePunch(id: string): Promise<TimePunch | undefined> {
    const [result] = await db.select().from(timePunches).where(eq(timePunches.id, id));
    return result;
  }

  async getLastPunch(employeeId: string): Promise<TimePunch | undefined> {
    const [result] = await db.select().from(timePunches)
      .where(and(eq(timePunches.employeeId, employeeId), eq(timePunches.voided, false)))
      .orderBy(desc(timePunches.actualTimestamp))
      .limit(1);
    return result;
  }

  async createTimePunch(data: InsertTimePunch): Promise<TimePunch> {
    const [result] = await db.insert(timePunches).values(data).returning();
    return result;
  }

  async updateTimePunch(id: string, data: Partial<InsertTimePunch>, editedById?: string, editReason?: string): Promise<TimePunch | undefined> {
    const existing = await this.getTimePunch(id);
    if (!existing) return undefined;

    const updateData: any = { ...data };
    if (editedById) {
      updateData.isEdited = true;
      updateData.editedById = editedById;
      updateData.editedAt = new Date();
      updateData.editReason = editReason;
      if (!existing.originalTimestamp) {
        updateData.originalTimestamp = existing.actualTimestamp;
      }
      
      // Create audit record
      await this.createTimecardEdit({
        propertyId: existing.propertyId,
        targetType: "time_punch",
        targetId: id,
        editType: "update",
        beforeValue: existing,
        afterValue: { ...existing, ...updateData },
        reasonCode: editReason || "manual_edit",
        notes: editReason,
        editedById,
      });
    }

    const [result] = await db.update(timePunches).set(updateData).where(eq(timePunches.id, id)).returning();
    return result;
  }

  async voidTimePunch(id: string, voidedById: string, voidReason: string): Promise<TimePunch | undefined> {
    const existing = await this.getTimePunch(id);
    if (!existing) return undefined;

    await this.createTimecardEdit({
      propertyId: existing.propertyId,
      targetType: "time_punch",
      targetId: id,
      editType: "void",
      beforeValue: existing,
      afterValue: { ...existing, voided: true },
      reasonCode: "void",
      notes: voidReason,
      editedById: voidedById,
    });

    const [result] = await db.update(timePunches)
      .set({ voided: true, voidedById, voidedAt: new Date(), voidReason })
      .where(eq(timePunches.id, id))
      .returning();
    return result;
  }

  // Break Sessions
  async getBreakSessions(filters: { propertyId?: string; employeeId?: string; businessDate?: string }): Promise<BreakSession[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(breakSessions.propertyId, filters.propertyId));
    if (filters.employeeId) conditions.push(eq(breakSessions.employeeId, filters.employeeId));
    if (filters.businessDate) conditions.push(eq(breakSessions.businessDate, filters.businessDate));
    
    if (conditions.length === 0) {
      return db.select().from(breakSessions).orderBy(desc(breakSessions.startTime));
    }
    return db.select().from(breakSessions).where(and(...conditions)).orderBy(desc(breakSessions.startTime));
  }

  async getBreakSession(id: string): Promise<BreakSession | undefined> {
    const [result] = await db.select().from(breakSessions).where(eq(breakSessions.id, id));
    return result;
  }

  async getActiveBreak(employeeId: string): Promise<BreakSession | undefined> {
    const [result] = await db.select().from(breakSessions)
      .where(and(eq(breakSessions.employeeId, employeeId), sql`${breakSessions.endTime} IS NULL`))
      .orderBy(desc(breakSessions.startTime))
      .limit(1);
    return result;
  }

  async createBreakSession(data: InsertBreakSession): Promise<BreakSession> {
    const [result] = await db.insert(breakSessions).values(data).returning();
    return result;
  }

  async updateBreakSession(id: string, data: Partial<InsertBreakSession>): Promise<BreakSession | undefined> {
    const [result] = await db.update(breakSessions).set(data).where(eq(breakSessions.id, id)).returning();
    return result;
  }

  // Timecards
  async getTimecards(filters: { propertyId?: string; employeeId?: string; payPeriodId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<Timecard[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(timecards.propertyId, filters.propertyId));
    if (filters.employeeId) conditions.push(eq(timecards.employeeId, filters.employeeId));
    if (filters.payPeriodId) conditions.push(eq(timecards.payPeriodId, filters.payPeriodId));
    if (filters.businessDate) conditions.push(eq(timecards.businessDate, filters.businessDate));
    if (filters.startDate) conditions.push(gte(timecards.businessDate, filters.startDate));
    if (filters.endDate) conditions.push(lte(timecards.businessDate, filters.endDate));
    
    if (conditions.length === 0) {
      return db.select().from(timecards).orderBy(desc(timecards.businessDate));
    }
    return db.select().from(timecards).where(and(...conditions)).orderBy(desc(timecards.businessDate));
  }

  async getTimecard(id: string): Promise<Timecard | undefined> {
    const [result] = await db.select().from(timecards).where(eq(timecards.id, id));
    return result;
  }

  async createTimecard(data: InsertTimecard): Promise<Timecard> {
    const [result] = await db.insert(timecards).values(data).returning();
    return result;
  }

  async updateTimecard(id: string, data: Partial<InsertTimecard>): Promise<Timecard | undefined> {
    const [result] = await db.update(timecards).set({ ...data, updatedAt: new Date() }).where(eq(timecards.id, id)).returning();
    return result;
  }

  async recalculateTimecard(employeeId: string, businessDate: string): Promise<Timecard | undefined> {
    // Get all punches for this employee on this date
    const punches = await this.getTimePunches({ employeeId, businessDate });
    const breaks = await this.getBreakSessions({ employeeId, businessDate });

    // Calculate hours from clock in/out pairs
    const clockIns = punches.filter(p => p.punchType === "clock_in");
    const clockOuts = punches.filter(p => p.punchType === "clock_out");
    
    let totalMinutes = 0;
    let clockInTime: Date | null = null;
    let clockOutTime: Date | null = null;
    let jobCodeId: string | null = null;

    for (const clockIn of clockIns) {
      const matchingOut = clockOuts.find(o => new Date(o.actualTimestamp) > new Date(clockIn.actualTimestamp));
      
      // Always capture the earliest clock in time and job code, regardless of whether clocked out
      if (!clockInTime || new Date(clockIn.actualTimestamp) < clockInTime) {
        clockInTime = new Date(clockIn.actualTimestamp);
        jobCodeId = clockIn.jobCodeId || null;
      }
      
      if (matchingOut) {
        const duration = (new Date(matchingOut.actualTimestamp).getTime() - new Date(clockIn.actualTimestamp).getTime()) / 60000;
        totalMinutes += duration;
        if (!clockOutTime || new Date(matchingOut.actualTimestamp) > clockOutTime) {
          clockOutTime = new Date(matchingOut.actualTimestamp);
        }
      }
    }

    // Calculate break minutes
    let paidBreakMinutes = 0;
    let unpaidBreakMinutes = 0;
    for (const brk of breaks) {
      if (brk.actualMinutes) {
        if (brk.isPaid) {
          paidBreakMinutes += brk.actualMinutes;
        } else {
          unpaidBreakMinutes += brk.actualMinutes;
        }
      }
    }

    // Subtract unpaid breaks from total
    const workedMinutes = totalMinutes - unpaidBreakMinutes;
    const totalHoursWorked = workedMinutes / 60;

    // Get property from employee for OT rule lookup
    const employee = await this.getEmployee(employeeId);
    if (!employee?.propertyId) return undefined;
    
    // Get active overtime rule for this property
    const otRule = await this.getActiveOvertimeRule(employee.propertyId);
    
    // Apply OT rules - default to 8 hours regular if no rule configured
    const dailyRegular = otRule?.dailyOvertimeThreshold ? parseFloat(otRule.dailyOvertimeThreshold) : 8;
    const dailyDoubleThreshold = otRule?.dailyDoubleTimeThreshold ? parseFloat(otRule.dailyDoubleTimeThreshold) : null;
    const enableDailyOT = otRule?.enableDailyOvertime !== false;
    const enableDailyDT = otRule?.enableDailyDoubleTime === true && dailyDoubleThreshold !== null;
    
    let regularHours = totalHoursWorked;
    let overtimeHours = 0;
    let doubleTimeHours = 0;
    
    if (enableDailyOT) {
      if (enableDailyDT && dailyDoubleThreshold !== null) {
        // California-style: Regular up to 8, OT from 8-12, DT over 12
        if (totalHoursWorked > dailyDoubleThreshold) {
          regularHours = dailyRegular;
          overtimeHours = dailyDoubleThreshold - dailyRegular;
          doubleTimeHours = totalHoursWorked - dailyDoubleThreshold;
        } else if (totalHoursWorked > dailyRegular) {
          regularHours = dailyRegular;
          overtimeHours = totalHoursWorked - dailyRegular;
          doubleTimeHours = 0;
        } else {
          regularHours = totalHoursWorked;
          overtimeHours = 0;
          doubleTimeHours = 0;
        }
      } else {
        // Standard: Regular up to threshold, OT after
        regularHours = Math.min(totalHoursWorked, dailyRegular);
        overtimeHours = Math.max(0, totalHoursWorked - dailyRegular);
        doubleTimeHours = 0;
      }
    }

    // Look up employee's pay rate for this job
    let payRate: string | null = null;
    if (jobCodeId) {
      const jobAssignment = await db.select().from(employeeJobCodes)
        .where(and(eq(employeeJobCodes.employeeId, employeeId), eq(employeeJobCodes.jobCodeId, jobCodeId)))
        .limit(1);
      if (jobAssignment.length > 0 && jobAssignment[0].payRate) {
        payRate = jobAssignment[0].payRate;
      } else {
        // Fall back to job's default hourly rate
        const job = await db.select().from(jobCodes).where(eq(jobCodes.id, jobCodeId)).limit(1);
        if (job.length > 0 && job[0].hourlyRate) {
          payRate = job[0].hourlyRate;
        }
      }
    }

    // Get or create timecard
    const existing = await db.select().from(timecards)
      .where(and(eq(timecards.employeeId, employeeId), eq(timecards.businessDate, businessDate)))
      .limit(1);

    const timecardData: any = {
      regularHours: regularHours.toFixed(2),
      overtimeHours: overtimeHours.toFixed(2),
      doubleTimeHours: doubleTimeHours.toFixed(2),
      totalHours: totalHoursWorked.toFixed(2),
      breakMinutes: paidBreakMinutes + unpaidBreakMinutes,
      paidBreakMinutes,
      unpaidBreakMinutes,
      clockInTime,
      clockOutTime,
      updatedAt: new Date(),
    };
    
    if (jobCodeId) {
      timecardData.jobCodeId = jobCodeId;
    }
    if (payRate) {
      timecardData.payRate = payRate;
    }

    if (existing.length > 0) {
      return this.updateTimecard(existing[0].id, timecardData);
    } else {
      return this.createTimecard({
        propertyId: employee.propertyId,
        employeeId,
        businessDate,
        ...timecardData,
      });
    }
  }

  // Timecard Exceptions
  async getTimecardExceptions(filters: { propertyId?: string; employeeId?: string; status?: string }): Promise<TimecardException[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(timecardExceptions.propertyId, filters.propertyId));
    if (filters.employeeId) conditions.push(eq(timecardExceptions.employeeId, filters.employeeId));
    if (filters.status) conditions.push(eq(timecardExceptions.status, filters.status));
    
    if (conditions.length === 0) {
      return db.select().from(timecardExceptions).orderBy(desc(timecardExceptions.createdAt));
    }
    return db.select().from(timecardExceptions).where(and(...conditions)).orderBy(desc(timecardExceptions.createdAt));
  }

  async getTimecardException(id: string): Promise<TimecardException | undefined> {
    const [result] = await db.select().from(timecardExceptions).where(eq(timecardExceptions.id, id));
    return result;
  }

  async createTimecardException(data: InsertTimecardException): Promise<TimecardException> {
    const [result] = await db.insert(timecardExceptions).values(data).returning();
    return result;
  }

  async resolveTimecardException(id: string, resolvedById: string, resolutionNotes: string): Promise<TimecardException | undefined> {
    const [result] = await db.update(timecardExceptions)
      .set({ status: "resolved", resolvedById, resolvedAt: new Date(), resolutionNotes })
      .where(eq(timecardExceptions.id, id))
      .returning();
    return result;
  }

  // Timecard Edits (Audit Log)
  async getTimecardEdits(filters: { propertyId?: string; targetType?: string; targetId?: string }): Promise<TimecardEdit[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(timecardEdits.propertyId, filters.propertyId));
    if (filters.targetType) conditions.push(eq(timecardEdits.targetType, filters.targetType));
    if (filters.targetId) conditions.push(eq(timecardEdits.targetId, filters.targetId));
    
    if (conditions.length === 0) {
      return db.select().from(timecardEdits).orderBy(desc(timecardEdits.createdAt));
    }
    return db.select().from(timecardEdits).where(and(...conditions)).orderBy(desc(timecardEdits.createdAt));
  }

  async createTimecardEdit(data: InsertTimecardEdit): Promise<TimecardEdit> {
    const [result] = await db.insert(timecardEdits).values(data).returning();
    return result;
  }

  // ============================================================================
  // SCHEDULING IMPLEMENTATIONS
  // ============================================================================

  // Employee Availability
  async getEmployeeAvailability(employeeId: string): Promise<EmployeeAvailability[]> {
    return db.select().from(employeeAvailability).where(eq(employeeAvailability.employeeId, employeeId));
  }

  async setEmployeeAvailability(employeeId: string, availability: InsertEmployeeAvailability[]): Promise<EmployeeAvailability[]> {
    await db.delete(employeeAvailability).where(eq(employeeAvailability.employeeId, employeeId));
    if (availability.length === 0) return [];
    return db.insert(employeeAvailability).values(availability).returning();
  }

  // Availability Exceptions
  async getAvailabilityExceptions(employeeId: string, startDate?: string, endDate?: string): Promise<AvailabilityException[]> {
    const conditions = [eq(availabilityExceptions.employeeId, employeeId)];
    if (startDate) conditions.push(gte(availabilityExceptions.exceptionDate, startDate));
    if (endDate) conditions.push(lte(availabilityExceptions.exceptionDate, endDate));
    return db.select().from(availabilityExceptions).where(and(...conditions));
  }

  async createAvailabilityException(data: InsertAvailabilityException): Promise<AvailabilityException> {
    const [result] = await db.insert(availabilityExceptions).values(data).returning();
    return result;
  }

  async deleteAvailabilityException(id: string): Promise<boolean> {
    const result = await db.delete(availabilityExceptions).where(eq(availabilityExceptions.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Time Off Requests
  async getTimeOffRequests(filters: { employeeId?: string; propertyId?: string; status?: string }): Promise<TimeOffRequest[]> {
    const conditions: any[] = [];
    if (filters.employeeId) conditions.push(eq(timeOffRequests.employeeId, filters.employeeId));
    if (filters.propertyId) conditions.push(eq(timeOffRequests.propertyId, filters.propertyId));
    if (filters.status) conditions.push(eq(timeOffRequests.status, filters.status));
    
    if (conditions.length === 0) {
      return db.select().from(timeOffRequests).orderBy(desc(timeOffRequests.createdAt));
    }
    return db.select().from(timeOffRequests).where(and(...conditions)).orderBy(desc(timeOffRequests.createdAt));
  }

  async getTimeOffRequest(id: string): Promise<TimeOffRequest | undefined> {
    const [result] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, id));
    return result;
  }

  async createTimeOffRequest(data: InsertTimeOffRequest): Promise<TimeOffRequest> {
    const [result] = await db.insert(timeOffRequests).values(data).returning();
    return result;
  }

  async updateTimeOffRequest(id: string, data: Partial<InsertTimeOffRequest>): Promise<TimeOffRequest | undefined> {
    const [result] = await db.update(timeOffRequests).set({ ...data, updatedAt: new Date() }).where(eq(timeOffRequests.id, id)).returning();
    return result;
  }

  async reviewTimeOffRequest(id: string, reviewedById: string, approved: boolean, notes?: string): Promise<TimeOffRequest | undefined> {
    const [result] = await db.update(timeOffRequests)
      .set({ 
        status: approved ? "approved" : "denied", 
        reviewedById, 
        reviewedAt: new Date(), 
        reviewNotes: notes,
        updatedAt: new Date()
      })
      .where(eq(timeOffRequests.id, id))
      .returning();
    return result;
  }

  // Shift Templates
  async getShiftTemplates(propertyId: string): Promise<ShiftTemplate[]> {
    return db.select().from(shiftTemplates).where(eq(shiftTemplates.propertyId, propertyId));
  }

  async getShiftTemplate(id: string): Promise<ShiftTemplate | undefined> {
    const [result] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, id));
    return result;
  }

  async createShiftTemplate(data: InsertShiftTemplate): Promise<ShiftTemplate> {
    const [result] = await db.insert(shiftTemplates).values(data).returning();
    return result;
  }

  async updateShiftTemplate(id: string, data: Partial<InsertShiftTemplate>): Promise<ShiftTemplate | undefined> {
    const [result] = await db.update(shiftTemplates).set(data).where(eq(shiftTemplates.id, id)).returning();
    return result;
  }

  async deleteShiftTemplate(id: string): Promise<boolean> {
    const result = await db.delete(shiftTemplates).where(eq(shiftTemplates.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Shifts
  async getShifts(filters: { propertyId?: string; rvcId?: string; employeeId?: string; startDate?: string; endDate?: string; status?: string }): Promise<Shift[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(shifts.propertyId, filters.propertyId));
    if (filters.rvcId) conditions.push(eq(shifts.rvcId, filters.rvcId));
    if (filters.employeeId) conditions.push(eq(shifts.employeeId, filters.employeeId));
    if (filters.startDate) conditions.push(gte(shifts.shiftDate, filters.startDate));
    if (filters.endDate) conditions.push(lte(shifts.shiftDate, filters.endDate));
    if (filters.status) conditions.push(eq(shifts.status, filters.status));
    
    if (conditions.length === 0) {
      return db.select().from(shifts).orderBy(shifts.shiftDate, shifts.startTime);
    }
    return db.select().from(shifts).where(and(...conditions)).orderBy(shifts.shiftDate, shifts.startTime);
  }

  async getShift(id: string): Promise<Shift | undefined> {
    const [result] = await db.select().from(shifts).where(eq(shifts.id, id));
    return result;
  }

  async createShift(data: InsertShift): Promise<Shift> {
    const [result] = await db.insert(shifts).values(data).returning();
    return result;
  }

  async updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined> {
    const [result] = await db.update(shifts).set({ ...data, updatedAt: new Date() }).where(eq(shifts.id, id)).returning();
    return result;
  }

  async deleteShift(id: string): Promise<boolean> {
    const result = await db.delete(shifts).where(eq(shifts.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async publishShifts(shiftIds: string[], publishedById: string): Promise<Shift[]> {
    const now = new Date();
    return db.update(shifts)
      .set({ status: "published", publishedAt: now, publishedById, updatedAt: now })
      .where(inArray(shifts.id, shiftIds))
      .returning();
  }

  async copyWeekSchedule(propertyId: string, sourceWeekStart: string, targetWeekStart: string): Promise<Shift[]> {
    // Get all shifts from source week
    const sourceEnd = new Date(sourceWeekStart);
    sourceEnd.setDate(sourceEnd.getDate() + 6);
    
    const sourceShifts = await this.getShifts({ 
      propertyId, 
      startDate: sourceWeekStart, 
      endDate: sourceEnd.toISOString().split('T')[0] 
    });

    const dayDiff = Math.round((new Date(targetWeekStart).getTime() - new Date(sourceWeekStart).getTime()) / (1000 * 60 * 60 * 24));
    
    const newShifts: Shift[] = [];
    for (const shift of sourceShifts) {
      const newDate = new Date(shift.shiftDate);
      newDate.setDate(newDate.getDate() + dayDiff);
      
      const newShift = await this.createShift({
        propertyId: shift.propertyId,
        rvcId: shift.rvcId,
        employeeId: shift.employeeId,
        jobCodeId: shift.jobCodeId,
        templateId: shift.templateId,
        shiftDate: newDate.toISOString().split('T')[0],
        startTime: shift.startTime,
        endTime: shift.endTime,
        scheduledBreakMinutes: shift.scheduledBreakMinutes,
        status: "draft",
        notes: shift.notes,
      });
      newShifts.push(newShift);
    }

    return newShifts;
  }

  // Shift Cover Requests
  async getShiftCoverRequests(filters: { shiftId?: string; requesterId?: string; status?: string }): Promise<ShiftCoverRequest[]> {
    const conditions: any[] = [];
    if (filters.shiftId) conditions.push(eq(shiftCoverRequests.shiftId, filters.shiftId));
    if (filters.requesterId) conditions.push(eq(shiftCoverRequests.requesterId, filters.requesterId));
    if (filters.status) conditions.push(eq(shiftCoverRequests.status, filters.status));
    
    if (conditions.length === 0) {
      return db.select().from(shiftCoverRequests).orderBy(desc(shiftCoverRequests.createdAt));
    }
    return db.select().from(shiftCoverRequests).where(and(...conditions)).orderBy(desc(shiftCoverRequests.createdAt));
  }

  async getShiftCoverRequest(id: string): Promise<ShiftCoverRequest | undefined> {
    const [result] = await db.select().from(shiftCoverRequests).where(eq(shiftCoverRequests.id, id));
    return result;
  }

  async createShiftCoverRequest(data: InsertShiftCoverRequest): Promise<ShiftCoverRequest> {
    const [result] = await db.insert(shiftCoverRequests).values(data).returning();
    return result;
  }

  async updateShiftCoverRequest(id: string, data: Partial<InsertShiftCoverRequest>): Promise<ShiftCoverRequest | undefined> {
    const [result] = await db.update(shiftCoverRequests).set({ ...data, updatedAt: new Date() }).where(eq(shiftCoverRequests.id, id)).returning();
    return result;
  }

  // Shift Cover Offers
  async getShiftCoverOffers(coverRequestId: string): Promise<ShiftCoverOffer[]> {
    return db.select().from(shiftCoverOffers).where(eq(shiftCoverOffers.coverRequestId, coverRequestId));
  }

  async createShiftCoverOffer(data: InsertShiftCoverOffer): Promise<ShiftCoverOffer> {
    const [result] = await db.insert(shiftCoverOffers).values(data).returning();
    return result;
  }

  async updateShiftCoverOffer(id: string, data: Partial<InsertShiftCoverOffer>): Promise<ShiftCoverOffer | undefined> {
    const [result] = await db.update(shiftCoverOffers).set(data).where(eq(shiftCoverOffers.id, id)).returning();
    return result;
  }

  // Shift Cover Approvals
  async approveShiftCover(coverRequestId: string, offerId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval> {
    // Update the offer status
    await this.updateShiftCoverOffer(offerId, { status: "approved" });
    
    // Update the cover request status
    await this.updateShiftCoverRequest(coverRequestId, { status: "approved" });
    
    // Get offer details and update the shift assignment
    const [offer] = await db.select().from(shiftCoverOffers).where(eq(shiftCoverOffers.id, offerId));
    const [request] = await db.select().from(shiftCoverRequests).where(eq(shiftCoverRequests.id, coverRequestId));
    
    if (offer && request) {
      await this.updateShift(request.shiftId, { employeeId: offer.offererId });
    }
    
    const [result] = await db.insert(shiftCoverApprovals).values({
      coverRequestId,
      offerId,
      approvedById,
      approved: true,
      notes,
    }).returning();
    
    return result;
  }

  async denyShiftCover(coverRequestId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval> {
    await this.updateShiftCoverRequest(coverRequestId, { status: "denied" });
    
    const [result] = await db.insert(shiftCoverApprovals).values({
      coverRequestId,
      approvedById,
      approved: false,
      notes,
    }).returning();
    
    return result;
  }

  // ============================================================================
  // TIP POOLING IMPLEMENTATIONS
  // ============================================================================

  // Tip Pool Policies
  async getTipPoolPolicies(propertyId: string): Promise<TipPoolPolicy[]> {
    return db.select().from(tipPoolPolicies).where(eq(tipPoolPolicies.propertyId, propertyId));
  }

  async getTipPoolPolicy(id: string): Promise<TipPoolPolicy | undefined> {
    const [result] = await db.select().from(tipPoolPolicies).where(eq(tipPoolPolicies.id, id));
    return result;
  }

  async createTipPoolPolicy(data: InsertTipPoolPolicy): Promise<TipPoolPolicy> {
    const [result] = await db.insert(tipPoolPolicies).values(data).returning();
    return result;
  }

  async updateTipPoolPolicy(id: string, data: Partial<InsertTipPoolPolicy>): Promise<TipPoolPolicy | undefined> {
    const [result] = await db.update(tipPoolPolicies).set(data).where(eq(tipPoolPolicies.id, id)).returning();
    return result;
  }

  async deleteTipPoolPolicy(id: string): Promise<boolean> {
    const result = await db.delete(tipPoolPolicies).where(eq(tipPoolPolicies.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Tip Pool Runs
  async getTipPoolRuns(filters: { propertyId?: string; businessDate?: string }): Promise<TipPoolRun[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(tipPoolRuns.propertyId, filters.propertyId));
    if (filters.businessDate) conditions.push(eq(tipPoolRuns.businessDate, filters.businessDate));
    
    if (conditions.length === 0) {
      return db.select().from(tipPoolRuns).orderBy(desc(tipPoolRuns.businessDate));
    }
    return db.select().from(tipPoolRuns).where(and(...conditions)).orderBy(desc(tipPoolRuns.businessDate));
  }

  async getTipPoolRun(id: string): Promise<TipPoolRun | undefined> {
    const [result] = await db.select().from(tipPoolRuns).where(eq(tipPoolRuns.id, id));
    return result;
  }

  async createTipPoolRun(data: InsertTipPoolRun): Promise<TipPoolRun> {
    const [result] = await db.insert(tipPoolRuns).values(data).returning();
    return result;
  }

  async updateTipPoolRun(id: string, data: Partial<InsertTipPoolRun>): Promise<TipPoolRun | undefined> {
    const [result] = await db.update(tipPoolRuns).set(data).where(eq(tipPoolRuns.id, id)).returning();
    return result;
  }

  // Tip Allocations
  async getTipAllocations(tipPoolRunId: string): Promise<TipAllocation[]> {
    return db.select().from(tipAllocations).where(eq(tipAllocations.tipPoolRunId, tipPoolRunId));
  }

  async createTipAllocation(data: InsertTipAllocation): Promise<TipAllocation> {
    const [result] = await db.insert(tipAllocations).values(data).returning();
    return result;
  }

  async runTipPoolSettlement(propertyId: string, businessDate: string, policyId: string, runById: string): Promise<{ run: TipPoolRun; allocations: TipAllocation[] }> {
    // Get policy
    const policy = await this.getTipPoolPolicy(policyId);
    if (!policy) throw new Error("Tip pool policy not found");

    // Get all tips for the day from closed checks
    const closedChecks = await db.select().from(checks)
      .where(and(
        eq(checks.businessDate, businessDate),
        eq(checks.status, "closed")
      ));
    
    let totalTips = 0;
    for (const check of closedChecks) {
      const payments = await this.getPayments(check.id);
      for (const payment of payments) {
        totalTips += parseFloat(payment.tipAmount || "0");
      }
    }

    // Get timecards for eligible employees
    const dayTimecards = await this.getTimecards({ propertyId, businessDate });
    
    // Filter by excluded job codes and calculate hours
    const excludedJobCodes = policy.excludedJobCodeIds || [];
    const eligibleTimecards = dayTimecards.filter(tc => 
      !tc.jobCodeId || !excludedJobCodes.includes(tc.jobCodeId)
    );

    let totalHours = 0;
    for (const tc of eligibleTimecards) {
      totalHours += parseFloat(tc.totalHours || "0");
    }

    // Create the run
    const run = await this.createTipPoolRun({
      propertyId,
      policyId,
      businessDate,
      totalTips: totalTips.toFixed(2),
      totalHours: totalHours.toFixed(2),
      participantCount: eligibleTimecards.length,
      status: "completed",
      runById,
      runAt: new Date(),
    });

    // Calculate allocations based on calculation method
    const allocations: TipAllocation[] = [];
    
    if (policy.calculationMethod === "hours_worked" && totalHours > 0) {
      for (const tc of eligibleTimecards) {
        const hours = parseFloat(tc.totalHours || "0");
        const sharePercentage = (hours / totalHours) * 100;
        const allocatedAmount = (hours / totalHours) * totalTips;

        const allocation = await this.createTipAllocation({
          tipPoolRunId: run.id,
          employeeId: tc.employeeId,
          hoursWorked: hours.toFixed(2),
          sharePercentage: sharePercentage.toFixed(2),
          allocatedAmount: allocatedAmount.toFixed(2),
          totalTips: allocatedAmount.toFixed(2),
        });
        allocations.push(allocation);
      }
    } else if (policy.calculationMethod === "equal" && eligibleTimecards.length > 0) {
      const equalShare = totalTips / eligibleTimecards.length;
      const sharePercentage = 100 / eligibleTimecards.length;

      for (const tc of eligibleTimecards) {
        const allocation = await this.createTipAllocation({
          tipPoolRunId: run.id,
          employeeId: tc.employeeId,
          hoursWorked: tc.totalHours || "0",
          sharePercentage: sharePercentage.toFixed(2),
          allocatedAmount: equalShare.toFixed(2),
          totalTips: equalShare.toFixed(2),
        });
        allocations.push(allocation);
      }
    }

    return { run, allocations };
  }

  // ============================================================================
  // LABOR VS SALES IMPLEMENTATIONS
  // ============================================================================

  // Labor Snapshots
  async getLaborSnapshots(filters: { propertyId?: string; rvcId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<LaborSnapshot[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(laborSnapshots.propertyId, filters.propertyId));
    if (filters.rvcId) conditions.push(eq(laborSnapshots.rvcId, filters.rvcId));
    if (filters.businessDate) conditions.push(eq(laborSnapshots.businessDate, filters.businessDate));
    if (filters.startDate) conditions.push(gte(laborSnapshots.businessDate, filters.startDate));
    if (filters.endDate) conditions.push(lte(laborSnapshots.businessDate, filters.endDate));
    
    if (conditions.length === 0) {
      return db.select().from(laborSnapshots).orderBy(desc(laborSnapshots.businessDate));
    }
    return db.select().from(laborSnapshots).where(and(...conditions)).orderBy(desc(laborSnapshots.businessDate));
  }

  async createLaborSnapshot(data: InsertLaborSnapshot): Promise<LaborSnapshot> {
    const [result] = await db.insert(laborSnapshots).values(data).returning();
    return result;
  }

  async updateLaborSnapshot(id: string, data: Partial<InsertLaborSnapshot>): Promise<LaborSnapshot | undefined> {
    const [result] = await db.update(laborSnapshots).set({ ...data, updatedAt: new Date() }).where(eq(laborSnapshots.id, id)).returning();
    return result;
  }

  async calculateLaborSnapshot(propertyId: string, businessDate: string): Promise<LaborSnapshot> {
    // Get total sales for the day
    const dayChecks = await db.select().from(checks)
      .where(and(
        eq(checks.businessDate, businessDate),
        eq(checks.status, "closed")
      ));
    
    let totalSales = 0;
    for (const check of dayChecks) {
      totalSales += parseFloat(check.total || "0");
    }

    // Get labor hours and cost
    const dayTimecards = await this.getTimecards({ propertyId, businessDate });
    
    let laborHours = 0;
    let laborCost = 0;
    let headcount = dayTimecards.length;

    for (const tc of dayTimecards) {
      laborHours += parseFloat(tc.totalHours || "0");
      laborCost += parseFloat(tc.totalPay || "0");
    }

    const laborPercentage = totalSales > 0 ? (laborCost / totalSales) * 100 : 0;
    const salesPerLaborHour = laborHours > 0 ? totalSales / laborHours : 0;

    // Check for existing snapshot
    const existing = await db.select().from(laborSnapshots)
      .where(and(eq(laborSnapshots.propertyId, propertyId), eq(laborSnapshots.businessDate, businessDate)))
      .limit(1);

    const snapshotData = {
      totalSales: totalSales.toFixed(2),
      laborHours: laborHours.toFixed(2),
      laborCost: laborCost.toFixed(2),
      laborPercentage: laborPercentage.toFixed(2),
      salesPerLaborHour: salesPerLaborHour.toFixed(2),
      headcount,
    };

    if (existing.length > 0) {
      const [result] = await db.update(laborSnapshots)
        .set({ ...snapshotData, updatedAt: new Date() })
        .where(eq(laborSnapshots.id, existing[0].id))
        .returning();
      return result;
    }

    return this.createLaborSnapshot({
      propertyId,
      businessDate,
      ...snapshotData,
    });
  }

  // ============================================================================
  // OVERTIME RULES
  // ============================================================================

  async getOvertimeRules(propertyId: string): Promise<OvertimeRule[]> {
    return db.select().from(overtimeRules).where(eq(overtimeRules.propertyId, propertyId));
  }

  async getOvertimeRule(id: string): Promise<OvertimeRule | undefined> {
    const [result] = await db.select().from(overtimeRules).where(eq(overtimeRules.id, id));
    return result;
  }

  async getActiveOvertimeRule(propertyId: string): Promise<OvertimeRule | undefined> {
    const [result] = await db.select().from(overtimeRules)
      .where(and(eq(overtimeRules.propertyId, propertyId), eq(overtimeRules.active, true)))
      .orderBy(desc(overtimeRules.createdAt))
      .limit(1);
    return result;
  }

  async createOvertimeRule(data: InsertOvertimeRule): Promise<OvertimeRule> {
    const [result] = await db.insert(overtimeRules).values(data).returning();
    return result;
  }

  async updateOvertimeRule(id: string, data: Partial<InsertOvertimeRule>): Promise<OvertimeRule | undefined> {
    const [result] = await db.update(overtimeRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(overtimeRules.id, id))
      .returning();
    return result;
  }

  async deleteOvertimeRule(id: string): Promise<boolean> {
    const result = await db.delete(overtimeRules).where(eq(overtimeRules.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
}

export const storage = new DatabaseStorage();
