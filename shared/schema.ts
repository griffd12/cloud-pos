import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, decimal, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// ENTERPRISE HIERARCHY
// ============================================================================

export const enterprises = pgTable("enterprises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  active: boolean("active").default(true),
});

export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  address: text("address"),
  timezone: text("timezone").default("America/New_York"),
  active: boolean("active").default(true),
});

export const rvcs = pgTable("rvcs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  fastTransactionDefault: boolean("fast_transaction_default").default(false),
  defaultOrderType: text("default_order_type").default("dine_in"),
  orderTypeDefault: text("order_type_default").default("dine_in"),
  dynamicOrderMode: boolean("dynamic_order_mode").default(false),
  active: boolean("active").default(true),
});

// Hierarchy relations
export const enterprisesRelations = relations(enterprises, ({ many }) => ({
  properties: many(properties),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  enterprise: one(enterprises, { fields: [properties.enterpriseId], references: [enterprises.id] }),
  rvcs: many(rvcs),
}));

export const rvcsRelations = relations(rvcs, ({ one }) => ({
  property: one(properties, { fields: [rvcs.propertyId], references: [properties.id] }),
}));

// ============================================================================
// ROLES & PRIVILEGES
// ============================================================================

export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  active: boolean("active").default(true),
});

export const privileges = pgTable("privileges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain"), // e.g., 'check_control', 'item_control', 'payment_control', 'manager_override', 'reporting'
  description: text("description"),
});

export const rolePrivileges = pgTable("role_privileges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => roles.id),
  privilegeCode: text("privilege_code").notNull(),
});

// ============================================================================
// EMPLOYEES
// ============================================================================

export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  employeeNumber: text("employee_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  pinHash: text("pin_hash").notNull(),
  roleId: varchar("role_id").references(() => roles.id),
  active: boolean("active").default(true),
});

export const employeesRelations = relations(employees, ({ one, many }) => ({
  role: one(roles, { fields: [employees.roleId], references: [roles.id] }),
  assignments: many(employeeAssignments),
}));

// Employee multi-property/RVC assignments
export const employeeAssignments = pgTable("employee_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  isPrimary: boolean("is_primary").default(false),
});

export const employeeAssignmentsRelations = relations(employeeAssignments, ({ one }) => ({
  employee: one(employees, { fields: [employeeAssignments.employeeId], references: [employees.id] }),
  enterprise: one(enterprises, { fields: [employeeAssignments.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [employeeAssignments.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [employeeAssignments.rvcId], references: [rvcs.id] }),
}));

// ============================================================================
// REPORTING GROUPS (for Major/Family Group reporting)
// ============================================================================

export const majorGroups = pgTable("major_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

export const familyGroups = pgTable("family_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  majorGroupId: varchar("major_group_id").references(() => majorGroups.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

export const majorGroupsRelations = relations(majorGroups, ({ many }) => ({
  familyGroups: many(familyGroups),
}));

export const familyGroupsRelations = relations(familyGroups, ({ one }) => ({
  majorGroup: one(majorGroups, { fields: [familyGroups.majorGroupId], references: [majorGroups.id] }),
}));

// ============================================================================
// MENU STRUCTURE
// ============================================================================

// Screen Lookup Units (category buttons)
export const slus = pgTable("slus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  buttonLabel: text("button_label").notNull(),
  displayOrder: integer("display_order").default(0),
  color: text("color").default("#3B82F6"),
  active: boolean("active").default(true),
});

// Tax Groups
export const taxGroups = pgTable("tax_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  rate: decimal("rate", { precision: 5, scale: 4 }).notNull(),
  taxMode: text("tax_mode").notNull().default("add_on"), // 'add_on' or 'inclusive'
  active: boolean("active").default(true),
});

// Print Classes (logical routing category - decouples menu items from physical devices)
export const printClasses = pgTable("print_classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  active: boolean("active").default(true),
});

// ============================================================================
// DEVICE CONFIGURATION (Simphony-style)
// ============================================================================

// Workstations (FOH Terminals)
export const workstations = pgTable("workstations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  deviceType: text("device_type").notNull().default("pos_terminal"), // pos_terminal, kiosk, manager_station
  // Functional Behavior
  defaultOrderType: text("default_order_type").default("dine_in"),
  fastTransactionEnabled: boolean("fast_transaction_enabled").default(false),
  requireBeginCheck: boolean("require_begin_check").default(true),
  allowPickupCheck: boolean("allow_pickup_check").default(true),
  allowReopenClosedChecks: boolean("allow_reopen_closed_checks").default(false),
  allowOfflineOperation: boolean("allow_offline_operation").default(false),
  // Employee Interaction
  allowedRoleIds: text("allowed_role_ids").array(),
  managerApprovalDevice: boolean("manager_approval_device").default(false),
  clockInAllowed: boolean("clock_in_allowed").default(true),
  // Routing & Printing - Receipt Printing
  defaultReceiptPrinterId: varchar("default_receipt_printer_id"),
  backupReceiptPrinterId: varchar("backup_receipt_printer_id"),
  // Routing & Printing - Report Printing
  reportPrinterId: varchar("report_printer_id"),
  backupReportPrinterId: varchar("backup_report_printer_id"),
  // Routing & Printing - Void Printing
  voidPrinterId: varchar("void_printer_id"),
  backupVoidPrinterId: varchar("backup_void_printer_id"),
  // Order Routing
  defaultOrderDeviceId: varchar("default_order_device_id"),
  defaultKdsExpoId: varchar("default_kds_expo_id"),
  // Network / System
  ipAddress: text("ip_address"),
  hostname: text("hostname"),
  isOnline: boolean("is_online").default(false),
  lastSeenAt: timestamp("last_seen_at"),
  active: boolean("active").default(true),
});

// Printers (Physical print devices)
export const printers = pgTable("printers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  printerType: text("printer_type").notNull().default("kitchen"), // receipt, kitchen, bar, prep, report
  // Connection
  connectionType: text("connection_type").notNull().default("network"), // network, usb, serial
  ipAddress: text("ip_address"),
  subnetMask: text("subnet_mask").default("255.255.255.0"),
  port: integer("port").default(9100),
  driverProtocol: text("driver_protocol").default("epson"), // epson, star
  model: text("model"), // e.g., TM-T88V, TM-T20III, TSP143IV, mC-Print3
  characterWidth: integer("character_width").default(42), // 42, 48, 56
  // Behavior
  autoCut: boolean("auto_cut").default(true),
  printLogo: boolean("print_logo").default(false),
  printOrderHeader: boolean("print_order_header").default(true),
  printOrderFooter: boolean("print_order_footer").default(true),
  printVoids: boolean("print_voids").default(true),
  printReprints: boolean("print_reprints").default(true),
  // Failover
  retryAttempts: integer("retry_attempts").default(3),
  failureHandlingMode: text("failure_handling_mode").default("alert_cashier"), // fail_silently, alert_cashier
  // Status
  isOnline: boolean("is_online").default(false),
  lastSeenAt: timestamp("last_seen_at"),
  active: boolean("active").default(true),
});

// KDS Devices (Kitchen Display Screens)
export const kdsDevices = pgTable("kds_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  stationType: text("station_type").notNull().default("hot"), // hot, cold, prep, expo, bar
  // Display Rules
  showDraftItems: boolean("show_draft_items").default(false),
  showSentItemsOnly: boolean("show_sent_items_only").default(true),
  groupBy: text("group_by").default("order"), // order, item, course
  showTimers: boolean("show_timers").default(true),
  autoSortBy: text("auto_sort_by").default("time"), // priority, time
  // Interaction
  allowBump: boolean("allow_bump").default(true),
  allowRecall: boolean("allow_recall").default(true),
  allowVoidDisplay: boolean("allow_void_display").default(true),
  expoMode: boolean("expo_mode").default(false),
  // Network
  wsChannel: text("ws_channel"),
  ipAddress: text("ip_address"),
  isOnline: boolean("is_online").default(false),
  lastSeenAt: timestamp("last_seen_at"),
  active: boolean("active").default(true),
});

// Order Devices (Logical routing containers - links to printers and KDS)
export const orderDevices = pgTable("order_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  // Controller KDS Device - the KDS that controls this order device's behavior
  kdsDeviceId: varchar("kds_device_id").references(() => kdsDevices.id),
  // Behavior
  sendOn: text("send_on").default("send_button"), // send_button, dynamic
  sendVoids: boolean("send_voids").default(true),
  sendReprints: boolean("send_reprints").default(true),
  active: boolean("active").default(true),
});

// Order Device to Printer linkage
export const orderDevicePrinters = pgTable("order_device_printers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderDeviceId: varchar("order_device_id").notNull().references(() => orderDevices.id),
  printerId: varchar("printer_id").notNull().references(() => printers.id),
  displayOrder: integer("display_order").default(0),
});

// Order Device to KDS linkage
export const orderDeviceKds = pgTable("order_device_kds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderDeviceId: varchar("order_device_id").notNull().references(() => orderDevices.id),
  kdsDeviceId: varchar("kds_device_id").notNull().references(() => kdsDevices.id),
  displayOrder: integer("display_order").default(0),
});

// Print Class to Order Device routing (resolved per Property/RVC)
export const printClassRouting = pgTable("print_class_routing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  printClassId: varchar("print_class_id").notNull().references(() => printClasses.id),
  orderDeviceId: varchar("order_device_id").notNull().references(() => orderDevices.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
});

// Menu Items
export const menuItems = pgTable("menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  shortName: text("short_name"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  taxGroupId: varchar("tax_group_id").references(() => taxGroups.id),
  printClassId: varchar("print_class_id").references(() => printClasses.id),
  majorGroupId: varchar("major_group_id").references(() => majorGroups.id),
  familyGroupId: varchar("family_group_id").references(() => familyGroups.id),
  color: text("color").default("#3B82F6"),
  active: boolean("active").default(true),
});

// Menu Item to SLU linkage
export const menuItemSlus = pgTable("menu_item_slus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  sluId: varchar("slu_id").notNull().references(() => slus.id),
  displayOrder: integer("display_order").default(0),
});

// ============================================================================
// MODIFIER SYSTEM
// ============================================================================

// Modifier Groups - categories like "Meat Temps", "Bread Choice", "Toppings", "Dips"
export const modifierGroups = pgTable("modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  required: boolean("required").default(false),
  minSelect: integer("min_select").default(0),
  maxSelect: integer("max_select").default(99),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

// Standalone Modifiers - items like "Medium", "Well Done", "Rye", "Wheat", "Peanuts", "Almonds"
// Can belong to multiple groups
export const modifiers = pgTable("modifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  priceDelta: decimal("price_delta", { precision: 10, scale: 2 }).default("0"),
  active: boolean("active").default(true),
});

// Many-to-many: Modifier to Modifier Group linkage
// A modifier can belong to multiple groups
export const modifierGroupModifiers = pgTable("modifier_group_modifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modifierGroupId: varchar("modifier_group_id").notNull().references(() => modifierGroups.id),
  modifierId: varchar("modifier_id").notNull().references(() => modifiers.id),
  isDefault: boolean("is_default").default(false),
  displayOrder: integer("display_order").default(0),
});

// Many-to-many: Menu Item to Modifier Group linkage (Required Modifiers)
// A menu item can have multiple required modifier groups
export const menuItemModifierGroups = pgTable("menu_item_modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  modifierGroupId: varchar("modifier_group_id").notNull().references(() => modifierGroups.id),
  displayOrder: integer("display_order").default(0),
});

// ============================================================================
// TENDERS, DISCOUNTS, SERVICE CHARGES
// ============================================================================

export const tenders = pgTable("tenders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(), // 'cash', 'credit', 'gift', 'other'
  active: boolean("active").default(true),
});

export const discounts = pgTable("discounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(), // 'percent', 'amount'
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  requiresManagerApproval: boolean("requires_manager_approval").default(false),
  active: boolean("active").default(true),
});

export const serviceCharges = pgTable("service_charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(), // 'percent', 'amount'
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  autoApply: boolean("auto_apply").default(false),
  orderTypes: text("order_types").array(),
  active: boolean("active").default(true),
});

// ============================================================================
// CHECK LIFECYCLE
// ============================================================================

export const checks = pgTable("checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkNumber: integer("check_number").notNull(),
  rvcId: varchar("rvc_id").notNull().references(() => rvcs.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  orderType: text("order_type").notNull(), // 'dine_in', 'take_out', 'delivery', 'pickup'
  status: text("status").notNull().default("open"), // 'open', 'closed', 'voided'
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).default("0"),
  discountTotal: decimal("discount_total", { precision: 10, scale: 2 }).default("0"),
  serviceChargeTotal: decimal("service_charge_total", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  guestCount: integer("guest_count").default(1),
  tableNumber: text("table_number"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

// Rounds (each send creates a round)
export const rounds = pgTable("rounds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  roundNumber: integer("round_number").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  sentByEmployeeId: varchar("sent_by_employee_id").references(() => employees.id),
});

// Check Items (line items on a check)
export const checkItems = pgTable("check_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  roundId: varchar("round_id").references(() => rounds.id),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  menuItemName: text("menu_item_name").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  modifiers: jsonb("modifiers").$type<{ name: string; priceDelta: string }[]>(),
  itemStatus: text("item_status").notNull().default("active"), // 'pending' = awaiting modifiers, 'active' = ready
  sent: boolean("sent").default(false),
  voided: boolean("voided").default(false),
  voidReason: text("void_reason"),
  voidedByEmployeeId: varchar("voided_by_employee_id").references(() => employees.id),
  voidedAt: timestamp("voided_at"),
  addedAt: timestamp("added_at").defaultNow(),
});

// Check Payments
export const checkPayments = pgTable("check_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  tenderId: varchar("tender_id").notNull().references(() => tenders.id),
  tenderName: text("tender_name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at").defaultNow(),
  employeeId: varchar("employee_id").references(() => employees.id),
});

// Check Discounts Applied
export const checkDiscounts = pgTable("check_discounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  discountId: varchar("discount_id").notNull().references(() => discounts.id),
  discountName: text("discount_name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  appliedAt: timestamp("applied_at").defaultNow(),
  employeeId: varchar("employee_id").references(() => employees.id),
  managerApprovalId: varchar("manager_approval_id").references(() => employees.id),
});

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  action: text("action").notNull(), // 'void_unsent', 'void_sent', 'reopen_check', 'transfer_check', etc.
  targetType: text("target_type").notNull(), // 'check', 'check_item', 'employee'
  targetId: varchar("target_id").notNull(),
  details: jsonb("details"),
  reasonCode: text("reason_code"),
  managerApprovalId: varchar("manager_approval_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// KDS QUEUE
// ============================================================================

export const kdsTickets = pgTable("kds_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  roundId: varchar("round_id").references(() => rounds.id),
  orderDeviceId: varchar("order_device_id").references(() => orderDevices.id),
  kdsDeviceId: varchar("kds_device_id").references(() => kdsDevices.id),
  stationType: text("station_type"), // cached from KDS device for fast filtering
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  status: text("status").notNull().default("draft"), // 'draft', 'active', 'bumped'
  isPreview: boolean("is_preview").default(false), // True for Dynamic Order Mode preview tickets
  paid: boolean("paid").default(false), // True when the check has been fully paid
  bumpedAt: timestamp("bumped_at"),
  bumpedByEmployeeId: varchar("bumped_by_employee_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const kdsTicketItems = pgTable("kds_ticket_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kdsTicketId: varchar("kds_ticket_id").notNull().references(() => kdsTickets.id),
  checkItemId: varchar("check_item_id").notNull().references(() => checkItems.id),
  status: text("status").notNull().default("pending"), // 'pending', 'bumped', 'voided'
});

// ============================================================================
// INSERT SCHEMAS & TYPES
// ============================================================================

export const insertEnterpriseSchema = createInsertSchema(enterprises).omit({ id: true });
export const insertPropertySchema = createInsertSchema(properties).omit({ id: true });
export const insertRvcSchema = createInsertSchema(rvcs).omit({ id: true });
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true });
export const insertPrivilegeSchema = createInsertSchema(privileges).omit({ id: true });
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true });
export const insertEmployeeAssignmentSchema = createInsertSchema(employeeAssignments).omit({ id: true });
export const insertMajorGroupSchema = createInsertSchema(majorGroups).omit({ id: true });
export const insertFamilyGroupSchema = createInsertSchema(familyGroups).omit({ id: true });
export const insertSluSchema = createInsertSchema(slus).omit({ id: true });
export const insertTaxGroupSchema = createInsertSchema(taxGroups).omit({ id: true }).extend({
  rate: z.coerce.string(),
});
export const insertPrintClassSchema = createInsertSchema(printClasses).omit({ id: true });
export const insertWorkstationSchema = createInsertSchema(workstations).omit({ id: true });
export const insertPrinterSchema = createInsertSchema(printers).omit({ id: true }).extend({
  port: z.coerce.number().optional().default(9100),
  characterWidth: z.coerce.number().optional().default(42),
  retryAttempts: z.coerce.number().optional().default(3),
});
export const insertKdsDeviceSchema = createInsertSchema(kdsDevices).omit({ id: true });
export const insertOrderDeviceSchema = createInsertSchema(orderDevices).omit({ id: true });
export const insertOrderDevicePrinterSchema = createInsertSchema(orderDevicePrinters).omit({ id: true });
export const insertOrderDeviceKdsSchema = createInsertSchema(orderDeviceKds).omit({ id: true });
export const insertPrintClassRoutingSchema = createInsertSchema(printClassRouting).omit({ id: true });
export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true });
export const insertModifierGroupSchema = createInsertSchema(modifierGroups).omit({ id: true });
export const insertModifierSchema = createInsertSchema(modifiers).omit({ id: true });
export const insertModifierGroupModifierSchema = createInsertSchema(modifierGroupModifiers).omit({ id: true });
export const insertMenuItemModifierGroupSchema = createInsertSchema(menuItemModifierGroups).omit({ id: true });
export const insertTenderSchema = createInsertSchema(tenders).omit({ id: true });
export const insertDiscountSchema = createInsertSchema(discounts).omit({ id: true });
export const insertServiceChargeSchema = createInsertSchema(serviceCharges).omit({ id: true });
export const insertCheckSchema = createInsertSchema(checks).omit({ id: true });
export const insertRoundSchema = createInsertSchema(rounds).omit({ id: true });
export const insertCheckItemSchema = createInsertSchema(checkItems).omit({ id: true });
export const insertCheckPaymentSchema = createInsertSchema(checkPayments).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true });
export const insertKdsTicketSchema = createInsertSchema(kdsTickets).omit({ id: true });

// Types
export type Enterprise = typeof enterprises.$inferSelect;
export type InsertEnterprise = z.infer<typeof insertEnterpriseSchema>;
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Rvc = typeof rvcs.$inferSelect;
export type InsertRvc = z.infer<typeof insertRvcSchema>;
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Privilege = typeof privileges.$inferSelect;
export type InsertPrivilege = z.infer<typeof insertPrivilegeSchema>;
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type EmployeeAssignment = typeof employeeAssignments.$inferSelect;
export type InsertEmployeeAssignment = z.infer<typeof insertEmployeeAssignmentSchema>;
export type MajorGroup = typeof majorGroups.$inferSelect;
export type InsertMajorGroup = z.infer<typeof insertMajorGroupSchema>;
export type FamilyGroup = typeof familyGroups.$inferSelect;
export type InsertFamilyGroup = z.infer<typeof insertFamilyGroupSchema>;
export type Slu = typeof slus.$inferSelect;
export type InsertSlu = z.infer<typeof insertSluSchema>;
export type TaxGroup = typeof taxGroups.$inferSelect;
export type InsertTaxGroup = z.infer<typeof insertTaxGroupSchema>;
export type PrintClass = typeof printClasses.$inferSelect;
export type InsertPrintClass = z.infer<typeof insertPrintClassSchema>;
export type Workstation = typeof workstations.$inferSelect;
export type InsertWorkstation = z.infer<typeof insertWorkstationSchema>;
export type Printer = typeof printers.$inferSelect;
export type InsertPrinter = z.infer<typeof insertPrinterSchema>;
export type KdsDevice = typeof kdsDevices.$inferSelect;
export type InsertKdsDevice = z.infer<typeof insertKdsDeviceSchema>;
export type OrderDevice = typeof orderDevices.$inferSelect;
export type InsertOrderDevice = z.infer<typeof insertOrderDeviceSchema>;
export type OrderDevicePrinter = typeof orderDevicePrinters.$inferSelect;
export type InsertOrderDevicePrinter = z.infer<typeof insertOrderDevicePrinterSchema>;
export type OrderDeviceKds = typeof orderDeviceKds.$inferSelect;
export type InsertOrderDeviceKds = z.infer<typeof insertOrderDeviceKdsSchema>;
export type PrintClassRouting = typeof printClassRouting.$inferSelect;
export type InsertPrintClassRouting = z.infer<typeof insertPrintClassRoutingSchema>;
export type MenuItemSlu = typeof menuItemSlus.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type InsertModifierGroup = z.infer<typeof insertModifierGroupSchema>;
export type Modifier = typeof modifiers.$inferSelect;
export type InsertModifier = z.infer<typeof insertModifierSchema>;
export type ModifierGroupModifier = typeof modifierGroupModifiers.$inferSelect;
export type InsertModifierGroupModifier = z.infer<typeof insertModifierGroupModifierSchema>;
export type MenuItemModifierGroup = typeof menuItemModifierGroups.$inferSelect;
export type InsertMenuItemModifierGroup = z.infer<typeof insertMenuItemModifierGroupSchema>;
export type Tender = typeof tenders.$inferSelect;
export type InsertTender = z.infer<typeof insertTenderSchema>;
export type Discount = typeof discounts.$inferSelect;
export type InsertDiscount = z.infer<typeof insertDiscountSchema>;
export type ServiceCharge = typeof serviceCharges.$inferSelect;
export type InsertServiceCharge = z.infer<typeof insertServiceChargeSchema>;
export type Check = typeof checks.$inferSelect;
export type InsertCheck = z.infer<typeof insertCheckSchema>;
export type Round = typeof rounds.$inferSelect;
export type InsertRound = z.infer<typeof insertRoundSchema>;
export type CheckItem = typeof checkItems.$inferSelect;
export type InsertCheckItem = z.infer<typeof insertCheckItemSchema>;
export type CheckPayment = typeof checkPayments.$inferSelect;
export type InsertCheckPayment = z.infer<typeof insertCheckPaymentSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type KdsTicket = typeof kdsTickets.$inferSelect;
export type InsertKdsTicket = z.infer<typeof insertKdsTicketSchema>;

// Privilege codes as constants
export const PRIVILEGE_CODES = {
  FAST_TRANSACTION: "fast_transaction",
  BEGIN_CHECK_BYPASS: "begin_check_bypass",
  SEND_TO_KITCHEN: "send_to_kitchen",
  VOID_UNSENT: "void_unsent",
  VOID_SENT: "void_sent",
  REOPEN_CHECK: "reopen_check",
  TRANSFER_CHECK: "transfer_check",
  SPLIT_CHECK: "split_check",
  MERGE_CHECK: "merge_check",
  APPLY_DISCOUNT: "apply_discount",
  PRICE_OVERRIDE: "price_override",
  MANAGER_APPROVAL: "manager_approval",
  ADMIN_ACCESS: "admin_access",
  KDS_ACCESS: "kds_access",
} as const;

export const ORDER_TYPES = ["dine_in", "take_out", "delivery", "pickup"] as const;
export type OrderType = typeof ORDER_TYPES[number];

// ============================================================================
// POS LAYOUTS (SCREEN DESIGNER)
// ============================================================================

export const posLayouts = pgTable("pos_layouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("slu_tabs"), // 'slu_tabs' or 'custom_grid'
  gridRows: integer("grid_rows").default(4),
  gridCols: integer("grid_cols").default(6),
  isDefault: boolean("is_default").default(false),
  active: boolean("active").default(true),
});

export const posLayoutCells = pgTable("pos_layout_cells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  layoutId: varchar("layout_id").notNull().references(() => posLayouts.id),
  rowIndex: integer("row_index").notNull(),
  colIndex: integer("col_index").notNull(),
  rowSpan: integer("row_span").default(1),
  colSpan: integer("col_span").default(1),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id),
  backgroundColor: text("background_color").default("#3B82F6"),
  textColor: text("text_color").default("#FFFFFF"),
  displayLabel: text("display_label"), // Optional override for button text
});

export const posLayoutCellsRelations = relations(posLayoutCells, ({ one }) => ({
  layout: one(posLayouts, { fields: [posLayoutCells.layoutId], references: [posLayouts.id] }),
  menuItem: one(menuItems, { fields: [posLayoutCells.menuItemId], references: [menuItems.id] }),
}));

// Join table for assigning layouts to multiple RVCs across properties
export const posLayoutRvcAssignments = pgTable("pos_layout_rvc_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  layoutId: varchar("layout_id").notNull().references(() => posLayouts.id, { onDelete: "cascade" }),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").notNull().references(() => rvcs.id),
  isDefault: boolean("is_default").default(false),
});

export const posLayoutsRelations = relations(posLayouts, ({ many }) => ({
  cells: many(posLayoutCells),
  rvcAssignments: many(posLayoutRvcAssignments),
}));

export const posLayoutRvcAssignmentsRelations = relations(posLayoutRvcAssignments, ({ one }) => ({
  layout: one(posLayouts, { fields: [posLayoutRvcAssignments.layoutId], references: [posLayouts.id] }),
  property: one(properties, { fields: [posLayoutRvcAssignments.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [posLayoutRvcAssignments.rvcId], references: [rvcs.id] }),
}));

export const insertPosLayoutSchema = createInsertSchema(posLayouts).omit({ id: true });
export const insertPosLayoutCellSchema = createInsertSchema(posLayoutCells).omit({ id: true });
export const insertPosLayoutRvcAssignmentSchema = createInsertSchema(posLayoutRvcAssignments).omit({ id: true });

export type PosLayout = typeof posLayouts.$inferSelect;
export type InsertPosLayout = z.infer<typeof insertPosLayoutSchema>;
export type PosLayoutCell = typeof posLayoutCells.$inferSelect;
export type InsertPosLayoutCell = z.infer<typeof insertPosLayoutCellSchema>;
export type PosLayoutRvcAssignment = typeof posLayoutRvcAssignments.$inferSelect;
export type InsertPosLayoutRvcAssignment = z.infer<typeof insertPosLayoutRvcAssignmentSchema>;

// Void reason codes
export const VOID_REASONS = [
  { code: "customer_request", label: "Customer Request" },
  { code: "wrong_item", label: "Wrong Item Ordered" },
  { code: "quality_issue", label: "Quality Issue" },
  { code: "out_of_stock", label: "Out of Stock" },
  { code: "duplicate_entry", label: "Duplicate Entry" },
  { code: "manager_comp", label: "Manager Comp" },
  { code: "other", label: "Other" },
] as const;

// ============================================================================
// DEVICE REGISTRY (CAL - Client Application Loader)
// ============================================================================

export const DEVICE_TYPES = ["pos_workstation", "kds_display", "kds_controller", "service_host", "back_office"] as const;
export type DeviceType = typeof DEVICE_TYPES[number];

export const DEVICE_OS_TYPES = ["windows", "android", "linux", "ios"] as const;
export type DeviceOsType = typeof DEVICE_OS_TYPES[number];

export const DEVICE_STATUSES = ["pending", "active", "offline", "maintenance", "decommissioned"] as const;
export type DeviceStatus = typeof DEVICE_STATUSES[number];

export const devices = pgTable("devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  
  // Device identity
  deviceId: text("device_id").notNull().unique(), // UUID from device itself
  name: text("name").notNull(),
  deviceType: text("device_type").notNull(), // pos_workstation, kds_display, kds_controller, service_host, back_office
  
  // Hardware/OS info
  osType: text("os_type"), // windows, android, linux
  osVersion: text("os_version"),
  hardwareModel: text("hardware_model"),
  serialNumber: text("serial_number"),
  ipAddress: text("ip_address"),
  macAddress: text("mac_address"),
  
  // Software version tracking
  currentAppVersion: text("current_app_version"),
  targetAppVersion: text("target_app_version"), // Version it should be updated to
  
  // Status tracking
  status: text("status").notNull().default("pending"), // pending, active, offline, maintenance, decommissioned
  lastSeenAt: timestamp("last_seen_at"),
  enrolledAt: timestamp("enrolled_at"),
  
  // Configuration
  autoUpdate: boolean("auto_update").default(true),
  environment: text("environment").default("production"), // production, staging, lab
  
  // Source configuration tracking (for devices imported from workstations/kds config)
  sourceConfigType: text("source_config_type"), // workstation, kds_device
  sourceConfigId: varchar("source_config_id"),
  
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const devicesRelations = relations(devices, ({ one }) => ({
  enterprise: one(enterprises, { fields: [devices.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [devices.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [devices.rvcId], references: [rvcs.id] }),
}));

// Enrollment tokens for registering new devices
export const deviceEnrollmentTokens = pgTable("device_enrollment_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  
  name: text("name").notNull(), // Descriptive name for the token
  token: text("token").notNull().unique(),
  deviceType: text("device_type"), // Optional: restrict to specific device type
  maxUses: integer("max_uses").default(1),
  usedCount: integer("used_count").default(0),
  expiresAt: timestamp("expires_at"),
  
  createdById: varchar("created_by_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
  active: boolean("active").default(true),
});

export const deviceEnrollmentTokensRelations = relations(deviceEnrollmentTokens, ({ one }) => ({
  enterprise: one(enterprises, { fields: [deviceEnrollmentTokens.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [deviceEnrollmentTokens.propertyId], references: [properties.id] }),
  createdBy: one(employees, { fields: [deviceEnrollmentTokens.createdById], references: [employees.id] }),
}));

// Device activity/heartbeat log
export const deviceHeartbeats = pgTable("device_heartbeats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id").notNull().references(() => devices.id),
  
  appVersion: text("app_version"),
  osVersion: text("os_version"),
  ipAddress: text("ip_address"),
  cpuUsage: decimal("cpu_usage", { precision: 5, scale: 2 }),
  memoryUsage: decimal("memory_usage", { precision: 5, scale: 2 }),
  diskUsage: decimal("disk_usage", { precision: 5, scale: 2 }),
  
  timestamp: timestamp("timestamp").defaultNow(),
});

export const deviceHeartbeatsRelations = relations(deviceHeartbeats, ({ one }) => ({
  device: one(devices, { fields: [deviceHeartbeats.deviceId], references: [devices.id] }),
}));

// Insert schemas
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true, createdAt: true });
export const insertDeviceEnrollmentTokenSchema = createInsertSchema(deviceEnrollmentTokens).omit({ id: true, createdAt: true, usedCount: true });
export const insertDeviceHeartbeatSchema = createInsertSchema(deviceHeartbeats).omit({ id: true, timestamp: true });

// Types
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type DeviceEnrollmentToken = typeof deviceEnrollmentTokens.$inferSelect;
export type InsertDeviceEnrollmentToken = z.infer<typeof insertDeviceEnrollmentTokenSchema>;
export type DeviceHeartbeat = typeof deviceHeartbeats.$inferSelect;
export type InsertDeviceHeartbeat = z.infer<typeof insertDeviceHeartbeatSchema>;
