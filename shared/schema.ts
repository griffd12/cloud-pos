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
  // Business Date Settings - when does the business day roll over to the next day
  businessDateRolloverTime: text("business_date_rollover_time").default("04:00"), // HH:MM format, e.g., "04:00" for 4 AM
  businessDateMode: text("business_date_mode").default("auto"), // 'auto' or 'manual'
  currentBusinessDate: text("current_business_date"), // YYYY-MM-DD format, used for manual mode
  // Branding - custom sign-in logo for the property
  signInLogoUrl: text("sign_in_logo_url"),
  // Auto clock-out settings - automatically clock out employees when business date changes
  autoClockOutEnabled: boolean("auto_clock_out_enabled").default(false),
  active: boolean("active").default(true),
});

// DOM Send Modes for KDS
export const DOM_SEND_MODES = ["fire_on_fly", "fire_on_next", "fire_on_tender"] as const;
export type DomSendMode = (typeof DOM_SEND_MODES)[number];

export const rvcs = pgTable("rvcs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  fastTransactionDefault: boolean("fast_transaction_default").default(false),
  defaultOrderType: text("default_order_type").default("dine_in"),
  orderTypeDefault: text("order_type_default").default("dine_in"),
  dynamicOrderMode: boolean("dynamic_order_mode").default(false),
  domSendMode: text("dom_send_mode").default("fire_on_fly"), // 'fire_on_fly', 'fire_on_next', 'fire_on_tender'
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
  // Auto-Logout Settings
  autoLogoutMinutes: integer("auto_logout_minutes"), // null or 0 = disabled
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
  // New Order Notification Settings
  newOrderSound: boolean("new_order_sound").default(true),
  newOrderBlinkSeconds: integer("new_order_blink_seconds").default(5), // 0 = no blink
  // Color Alert Settings (time-based color changes)
  colorAlert1Enabled: boolean("color_alert_1_enabled").default(true),
  colorAlert1Seconds: integer("color_alert_1_seconds").default(60), // After 1 minute
  colorAlert1Color: text("color_alert_1_color").default("yellow"),
  colorAlert2Enabled: boolean("color_alert_2_enabled").default(true),
  colorAlert2Seconds: integer("color_alert_2_seconds").default(180), // After 3 minutes
  colorAlert2Color: text("color_alert_2_color").default("orange"),
  colorAlert3Enabled: boolean("color_alert_3_enabled").default(true),
  colorAlert3Seconds: integer("color_alert_3_seconds").default(300), // After 5 minutes
  colorAlert3Color: text("color_alert_3_color").default("red"),
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
// PAYMENT PROCESSING - Gateway-agnostic payment processor configuration
// ============================================================================

// Supported payment gateway types
export const PAYMENT_GATEWAY_TYPES = [
  "stripe",
  "elavon_converge",
  "elavon_fusebox",  // Elavon Fusebox EMV gateway
  "shift4",
  "heartland",
  "freedompay",
  "eigen",
] as const;
export type PaymentGatewayType = (typeof PAYMENT_GATEWAY_TYPES)[number];

// Payment transaction statuses
export const PAYMENT_TRANSACTION_STATUSES = [
  "pending",        // Transaction initiated
  "authorized",     // Auth approved, awaiting capture
  "captured",       // Funds captured/settled
  "voided",         // Transaction voided before settlement
  "refunded",       // Full refund processed
  "partial_refund", // Partial refund processed
  "declined",       // Authorization declined
  "failed",         // Technical failure
] as const;
export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];

// Payment Processors - configured per property (credentials stored as secrets)
export const paymentProcessors = pgTable("payment_processors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(), // Display name, e.g., "Main Credit Card Processor"
  gatewayType: text("gateway_type").notNull(), // 'stripe', 'elavon_converge', etc.
  // Environment settings
  environment: text("environment").default("sandbox"), // 'sandbox' or 'production'
  // Credential references - NOT the actual credentials, just the secret key names
  // Actual credentials stored in Replit Secrets (e.g., STRIPE_API_KEY, ELAVON_MERCHANT_ID)
  credentialKeyPrefix: text("credential_key_prefix").notNull(), // e.g., "STRIPE" or "ELAVON_MAIN"
  // Gateway-specific settings (JSON) - endpoint URLs, merchant IDs, terminal IDs, etc.
  gatewaySettings: jsonb("gateway_settings"), 
  // Feature flags
  supportsTokenization: boolean("supports_tokenization").default(true),
  supportsTipAdjust: boolean("supports_tip_adjust").default(true),
  supportsPartialAuth: boolean("supports_partial_auth").default(false),
  supportsEmv: boolean("supports_emv").default(true),
  supportsContactless: boolean("supports_contactless").default(true),
  // Timing settings
  authHoldMinutes: integer("auth_hold_minutes").default(1440), // How long auth is valid (24 hours default)
  settlementTime: text("settlement_time").default("02:00"), // When batch closes (HH:MM)
  // Status
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
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
  paymentProcessorId: varchar("payment_processor_id").references(() => paymentProcessors.id), // Link to processor for card tenders
  active: boolean("active").default(true),
});

// Payment Transactions - tracks all gateway communications (NO card data stored)
export const paymentTransactions = pgTable("payment_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkPaymentId: varchar("check_payment_id").references(() => checkPayments.id), // Links to POS payment
  paymentProcessorId: varchar("payment_processor_id").notNull().references(() => paymentProcessors.id),
  // Transaction identifiers from gateway
  gatewayTransactionId: text("gateway_transaction_id"), // Transaction ID from processor
  authCode: text("auth_code"), // Authorization code
  referenceNumber: text("reference_number"), // Gateway reference number
  // Safe card display info only (PCI compliant)
  cardBrand: text("card_brand"), // 'visa', 'mastercard', 'amex', 'discover', etc.
  cardLast4: text("card_last4"), // Last 4 digits only
  cardExpiryMonth: integer("card_expiry_month"), // 1-12
  cardExpiryYear: integer("card_expiry_year"), // e.g., 2025
  entryMode: text("entry_mode"), // 'chip', 'contactless', 'swipe', 'manual', 'token'
  // Amounts (in cents to avoid floating point issues)
  authAmount: integer("auth_amount").notNull(), // Original authorized amount in cents
  captureAmount: integer("capture_amount"), // Amount actually captured (may differ for tips)
  tipAmount: integer("tip_amount").default(0), // Tip added after auth
  // Transaction state
  status: text("status").notNull().default("pending"), // See PAYMENT_TRANSACTION_STATUSES
  transactionType: text("transaction_type").notNull(), // 'sale', 'auth', 'capture', 'void', 'refund'
  // Gateway response details
  responseCode: text("response_code"), // Gateway response code
  responseMessage: text("response_message"), // Human-readable response
  avsResult: text("avs_result"), // Address verification result
  cvvResult: text("cvv_result"), // CVV verification result
  // Timestamps
  initiatedAt: timestamp("initiated_at").defaultNow(),
  authorizedAt: timestamp("authorized_at"),
  capturedAt: timestamp("captured_at"),
  settledAt: timestamp("settled_at"),
  // Terminal/device info
  terminalId: text("terminal_id"), // Physical terminal identifier
  workstationId: varchar("workstation_id").references(() => workstations.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  // Refund tracking
  originalTransactionId: varchar("original_transaction_id"), // For refunds/voids, links to original
  refundedAmount: integer("refunded_amount").default(0), // Total refunded so far
  // Batch/settlement info
  batchId: text("batch_id"), // Settlement batch identifier
  businessDate: text("business_date"), // YYYY-MM-DD
});

// Relations
export const paymentProcessorsRelations = relations(paymentProcessors, ({ one, many }) => ({
  property: one(properties, { fields: [paymentProcessors.propertyId], references: [properties.id] }),
  transactions: many(paymentTransactions),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  checkPayment: one(checkPayments, { fields: [paymentTransactions.checkPaymentId], references: [checkPayments.id] }),
  paymentProcessor: one(paymentProcessors, { fields: [paymentTransactions.paymentProcessorId], references: [paymentProcessors.id] }),
  workstation: one(workstations, { fields: [paymentTransactions.workstationId], references: [workstations.id] }),
  employee: one(employees, { fields: [paymentTransactions.employeeId], references: [employees.id] }),
}));

// ============================================================================
// PAYMENT TERMINAL DEVICES (External EMV Card Readers)
// ============================================================================

// Terminal device statuses
export const TERMINAL_DEVICE_STATUSES = ["online", "offline", "busy", "error", "maintenance"] as const;
export type TerminalDeviceStatus = (typeof TERMINAL_DEVICE_STATUSES)[number];

// Terminal session statuses
export const TERMINAL_SESSION_STATUSES = ["pending", "processing", "awaiting_card", "card_inserted", "pin_entry", "approved", "declined", "cancelled", "timeout", "error"] as const;
export type TerminalSessionStatus = (typeof TERMINAL_SESSION_STATUSES)[number];

// Terminal device models (common EMV terminals)
export const TERMINAL_MODELS = ["pax_a920", "pax_s300", "verifone_vx520", "verifone_vx820", "verifone_p400", "ingenico_lane_3000", "ingenico_lane_5000", "stripe_s700", "stripe_m2", "stripe_wisepos_e", "bbpos_chipper", "generic"] as const;
export type TerminalModel = (typeof TERMINAL_MODELS)[number];

// Connection types for terminals
export const TERMINAL_CONNECTION_TYPES = ["ethernet", "wifi", "usb", "bluetooth", "cloud"] as const;
export type TerminalConnectionType = (typeof TERMINAL_CONNECTION_TYPES)[number];

// Terminal Devices - Physical EMV card readers
export const terminalDevices = pgTable("terminal_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  paymentProcessorId: varchar("payment_processor_id").references(() => paymentProcessors.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  name: text("name").notNull(),
  model: text("model").notNull(), // See TERMINAL_MODELS
  serialNumber: text("serial_number"),
  terminalId: text("terminal_id"), // Processor-assigned terminal ID
  connectionType: text("connection_type").default("ethernet"), // See TERMINAL_CONNECTION_TYPES
  networkAddress: text("network_address"), // IP address or hostname for network terminals
  port: integer("port"), // Network port if applicable
  cloudDeviceId: text("cloud_device_id"), // For cloud-connected terminals (e.g., Stripe Terminal device ID)
  status: text("status").default("offline"), // See TERMINAL_DEVICE_STATUSES
  lastHeartbeat: timestamp("last_heartbeat"),
  capabilities: jsonb("capabilities"), // Supported features: {contactless, chip, swipe, pinDebit, cashback}
  firmwareVersion: text("firmware_version"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Terminal Sessions - Active payment sessions on terminals
export const terminalSessions = pgTable("terminal_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  terminalDeviceId: varchar("terminal_device_id").notNull().references(() => terminalDevices.id),
  checkId: varchar("check_id").references(() => checks.id),
  tenderId: varchar("tender_id").references(() => tenders.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  amount: integer("amount").notNull(), // Amount in cents
  tipAmount: integer("tip_amount").default(0), // Pre-set tip if any
  currency: text("currency").default("usd"),
  status: text("status").default("pending"), // See TERMINAL_SESSION_STATUSES
  statusMessage: text("status_message"), // Human-readable status message
  processorReference: text("processor_reference"), // Reference ID from processor SDK
  paymentTransactionId: varchar("payment_transaction_id").references(() => paymentTransactions.id),
  initiatedAt: timestamp("initiated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"), // Session timeout
  metadata: jsonb("metadata"), // Additional processor-specific data
});

// Relations
export const terminalDevicesRelations = relations(terminalDevices, ({ one, many }) => ({
  property: one(properties, { fields: [terminalDevices.propertyId], references: [properties.id] }),
  paymentProcessor: one(paymentProcessors, { fields: [terminalDevices.paymentProcessorId], references: [paymentProcessors.id] }),
  workstation: one(workstations, { fields: [terminalDevices.workstationId], references: [workstations.id] }),
  sessions: many(terminalSessions),
}));

export const terminalSessionsRelations = relations(terminalSessions, ({ one }) => ({
  terminalDevice: one(terminalDevices, { fields: [terminalSessions.terminalDeviceId], references: [terminalDevices.id] }),
  check: one(checks, { fields: [terminalSessions.checkId], references: [checks.id] }),
  tender: one(tenders, { fields: [terminalSessions.tenderId], references: [tenders.id] }),
  employee: one(employees, { fields: [terminalSessions.employeeId], references: [employees.id] }),
  workstation: one(workstations, { fields: [terminalSessions.workstationId], references: [workstations.id] }),
  paymentTransaction: one(paymentTransactions, { fields: [terminalSessions.paymentTransactionId], references: [paymentTransactions.id] }),
}));

// ============================================================================
// REGISTERED DEVICES - Security enrollment for POS/KDS access
// ============================================================================

// Device types for registration
export const REGISTERED_DEVICE_TYPES = ["pos_workstation", "kds_display"] as const;
export const REGISTERED_DEVICE_STATUSES = ["pending", "enrolled", "disabled", "revoked"] as const;

// Registered Devices - Physical devices authorized to access POS/KDS
export const registeredDevices = pgTable("registered_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  // What this device is linked to
  deviceType: text("device_type").notNull(), // 'pos_workstation' or 'kds_display'
  workstationId: varchar("workstation_id").references(() => workstations.id), // For POS workstation type
  kdsDeviceId: varchar("kds_device_id").references(() => kdsDevices.id), // For KDS display type
  // Device identification
  name: text("name").notNull(), // Friendly name for this registration (e.g., "Front Counter PC")
  // Enrollment
  enrollmentCode: text("enrollment_code"), // One-time code for device enrollment (cleared after use)
  enrollmentCodeExpiresAt: timestamp("enrollment_code_expires_at"),
  deviceToken: text("device_token"), // Secure token issued after enrollment (stored in browser)
  deviceTokenHash: text("device_token_hash"), // Hash of the device token for server-side validation
  status: text("status").notNull().default("pending"), // pending, enrolled, disabled, revoked
  enrolledAt: timestamp("enrolled_at"),
  lastAccessAt: timestamp("last_access_at"),
  // Optional hardware metadata (manually entered or auto-detected where possible)
  osInfo: text("os_info"), // e.g., "Windows 11", "Chrome OS"
  browserInfo: text("browser_info"), // e.g., "Chrome 120"
  screenResolution: text("screen_resolution"), // e.g., "1920x1080"
  serialNumber: text("serial_number"), // Manually entered by admin
  assetTag: text("asset_tag"), // Internal tracking number
  macAddress: text("mac_address"), // Manually entered
  ipAddress: text("ip_address"), // Last known IP (informational only)
  notes: text("notes"), // Admin notes
  // Audit
  createdAt: timestamp("created_at").defaultNow(),
  createdByEmployeeId: varchar("created_by_employee_id").references(() => employees.id),
  disabledAt: timestamp("disabled_at"),
  disabledByEmployeeId: varchar("disabled_by_employee_id").references(() => employees.id),
  disabledReason: text("disabled_reason"),
});

export const registeredDevicesRelations = relations(registeredDevices, ({ one }) => ({
  property: one(properties, { fields: [registeredDevices.propertyId], references: [properties.id] }),
  workstation: one(workstations, { fields: [registeredDevices.workstationId], references: [workstations.id] }),
  kdsDevice: one(kdsDevices, { fields: [registeredDevices.kdsDeviceId], references: [kdsDevices.id] }),
  createdByEmployee: one(employees, { fields: [registeredDevices.createdByEmployeeId], references: [employees.id] }),
  disabledByEmployee: one(employees, { fields: [registeredDevices.disabledByEmployeeId], references: [employees.id] }),
}));

// ============================================================================
// EMC (ENTERPRISE MANAGEMENT CONSOLE) USERS
// ============================================================================
// Separate from employees - these are admin users who access the system from any browser
// using email/password authentication (not PIN-based like POS employees)

export const emcUsers = pgTable("emc_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  // Access level
  accessLevel: text("access_level").notNull().default("property_admin"), // super_admin, enterprise_admin, property_admin
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id), // null for super_admin
  propertyId: varchar("property_id").references(() => properties.id), // null for enterprise_admin and above
  // Status
  active: boolean("active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  // Audit
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emcUsersRelations = relations(emcUsers, ({ one }) => ({
  enterprise: one(enterprises, { fields: [emcUsers.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [emcUsers.propertyId], references: [properties.id] }),
}));

// EMC Sessions for server-side session management
export const emcSessions = pgTable("emc_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => emcUsers.id),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emcSessionsRelations = relations(emcSessions, ({ one }) => ({
  user: one(emcUsers, { fields: [emcSessions.userId], references: [emcUsers.id] }),
}));

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
  customerId: varchar("customer_id"), // Links to loyaltyMembers for customer tracking
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
  originBusinessDate: text("origin_business_date"), // YYYY-MM-DD format, the business date when check was FIRST created (never changes)
  businessDate: text("business_date"), // YYYY-MM-DD format, the business date when check was CLOSED (updated on close)
  loyaltyPointsEarned: integer("loyalty_points_earned"), // Points earned on this check
  loyaltyPointsRedeemed: integer("loyalty_points_redeemed"), // Points redeemed on this check
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
  menuItemId: varchar("menu_item_id").references(() => menuItems.id), // Nullable for special items like gift cards
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
  businessDate: text("business_date"), // YYYY-MM-DD format, the operating day this item was rung in
  // Tax snapshot at ring-in time - IMMUTABLE once set
  // These values capture tax settings at the moment item was rung, preventing retroactive tax changes
  taxGroupIdAtSale: varchar("tax_group_id_at_sale"), // Tax group ID at ring-in time
  taxModeAtSale: text("tax_mode_at_sale"), // 'inclusive' or 'add_on' at ring-in time
  taxRateAtSale: decimal("tax_rate_at_sale", { precision: 10, scale: 6 }), // Tax rate at ring-in (e.g., 0.0725 for 7.25%)
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }), // Calculated add-on tax for this item (locked at ring-in)
  taxableAmount: decimal("taxable_amount", { precision: 10, scale: 2 }), // Item total (base for add-on tax calculation)
  // Item-level discount fields
  discountId: varchar("discount_id").references(() => discounts.id), // Applied discount
  discountName: text("discount_name"), // Discount name at time of application
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }), // Calculated discount amount
  discountAppliedBy: varchar("discount_applied_by").references(() => employees.id), // Who applied the discount
  discountApprovedBy: varchar("discount_approved_by").references(() => employees.id), // Manager who approved (if required)
  // Non-revenue flag for items that should not count toward sales (e.g., gift card sales/reloads)
  // Gift card sales are liabilities, not revenue - revenue is recognized when redeemed
  isNonRevenue: boolean("is_non_revenue").default(false),
  nonRevenueType: text("non_revenue_type"), // 'gift_card_sale', 'gift_card_reload', etc.
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
  businessDate: text("business_date"), // YYYY-MM-DD format, the operating day this payment was applied
  paymentTransactionId: varchar("payment_transaction_id"), // Link to gateway transaction for card payments (no FK to avoid circular ref)
  paymentStatus: text("payment_status").default("completed"), // 'authorized' (pre-auth), 'completed' (captured/finalized)
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }), // Tip added to pre-auth
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
// REFUNDS
// ============================================================================

export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  refundNumber: integer("refund_number").notNull(),
  rvcId: varchar("rvc_id").notNull().references(() => rvcs.id),
  originalCheckId: varchar("original_check_id").notNull().references(() => checks.id),
  originalCheckNumber: integer("original_check_number").notNull(),
  refundType: text("refund_type").notNull(), // 'full' or 'partial'
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  processedByEmployeeId: varchar("processed_by_employee_id").notNull().references(() => employees.id),
  managerApprovalId: varchar("manager_approval_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
  businessDate: text("business_date"), // YYYY-MM-DD format
});

// Refund Items (tracks which items from the original check were refunded)
export const refundItems = pgTable("refund_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  refundId: varchar("refund_id").notNull().references(() => refunds.id),
  originalCheckItemId: varchar("original_check_item_id").notNull().references(() => checkItems.id),
  menuItemName: text("menu_item_name").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  modifiers: jsonb("modifiers").$type<{ name: string; priceDelta: string }[]>(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).notNull(),
});

// Refund Payments (tracks how refunds were applied back to original payment methods)
export const refundPayments = pgTable("refund_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  refundId: varchar("refund_id").notNull().references(() => refunds.id),
  originalPaymentId: varchar("original_payment_id").notNull().references(() => checkPayments.id),
  tenderId: varchar("tender_id").notNull().references(() => tenders.id),
  tenderName: text("tender_name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
});

export const refundsRelations = relations(refunds, ({ one, many }) => ({
  rvc: one(rvcs, { fields: [refunds.rvcId], references: [rvcs.id] }),
  originalCheck: one(checks, { fields: [refunds.originalCheckId], references: [checks.id] }),
  processedBy: one(employees, { fields: [refunds.processedByEmployeeId], references: [employees.id] }),
  managerApproval: one(employees, { fields: [refunds.managerApprovalId], references: [employees.id] }),
  items: many(refundItems),
  payments: many(refundPayments),
}));

export const refundItemsRelations = relations(refundItems, ({ one }) => ({
  refund: one(refunds, { fields: [refundItems.refundId], references: [refunds.id] }),
  originalCheckItem: one(checkItems, { fields: [refundItems.originalCheckItemId], references: [checkItems.id] }),
}));

export const refundPaymentsRelations = relations(refundPayments, ({ one }) => ({
  refund: one(refunds, { fields: [refundPayments.refundId], references: [refunds.id] }),
  originalPayment: one(checkPayments, { fields: [refundPayments.originalPaymentId], references: [checkPayments.id] }),
  tender: one(tenders, { fields: [refundPayments.tenderId], references: [tenders.id] }),
}));

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
  isRecalled: boolean("is_recalled").default(false), // True when ticket has been recalled from bumped
  recalledAt: timestamp("recalled_at"),
  bumpedAt: timestamp("bumped_at"),
  bumpedByEmployeeId: varchar("bumped_by_employee_id").references(() => employees.id),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }), // DOM: display subtotal on ticket
  createdAt: timestamp("created_at").defaultNow(),
});

export const kdsTicketItems = pgTable("kds_ticket_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kdsTicketId: varchar("kds_ticket_id").notNull().references(() => kdsTickets.id),
  checkItemId: varchar("check_item_id").notNull().references(() => checkItems.id),
  status: text("status").notNull().default("pending"), // 'pending', 'bumped', 'voided'
  isReady: boolean("is_ready").default(false), // True when item is marked as ready/made
  readyAt: timestamp("ready_at"),
  isModified: boolean("is_modified").default(false), // DOM: item was modified after initial send
  modifiedAt: timestamp("modified_at"), // DOM: when item was last modified
  sortPriority: integer("sort_priority").default(0), // DOM: for priority sorting (modified items higher)
});

// ============================================================================
// PRINT AGENTS (Local network print relay agents - like Oracle Simphony Controllers)
// ============================================================================

export const PRINT_AGENT_STATUSES = ["online", "offline", "disconnected"] as const;
export type PrintAgentStatus = (typeof PRINT_AGENT_STATUSES)[number];

export const printAgents = pgTable("print_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id), // Optional - null means global (all properties)
  name: text("name").notNull(),
  description: text("description"),
  // Authentication
  agentToken: text("agent_token").notNull().unique(), // Token for agent authentication
  // Status
  status: text("status").notNull().default("offline"), // online, offline, disconnected
  lastHeartbeat: timestamp("last_heartbeat"),
  lastConnectedAt: timestamp("last_connected_at"),
  lastDisconnectedAt: timestamp("last_disconnected_at"),
  // Agent info (reported by agent)
  agentVersion: text("agent_version"),
  hostname: text("hostname"),
  ipAddress: text("ip_address"),
  osInfo: text("os_info"),
  // Configuration
  autoReconnect: boolean("auto_reconnect").default(true),
  heartbeatIntervalMs: integer("heartbeat_interval_ms").default(30000),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// PRINT JOBS (Queue for network/local printing)
// ============================================================================

export const PRINT_JOB_TYPES = ["check_receipt", "kitchen_ticket", "sales_report", "employee_report", "end_of_day", "cash_drawer"] as const;
export type PrintJobType = (typeof PRINT_JOB_TYPES)[number];

export const PRINT_JOB_STATUSES = ["pending", "printing", "completed", "failed", "cancelled"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

export const printJobs = pgTable("print_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  printAgentId: varchar("print_agent_id").references(() => printAgents.id), // Agent that will handle this job
  printerId: varchar("printer_id").references(() => printers.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  jobType: text("job_type").notNull(), // check_receipt, kitchen_ticket, sales_report, employee_report, end_of_day
  status: text("status").notNull().default("pending"), // pending, printing, completed, failed, cancelled
  priority: integer("priority").default(5), // 1-10, lower = higher priority
  // Reference data
  checkId: varchar("check_id").references(() => checks.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  businessDate: text("business_date"),
  // Print content
  escPosData: text("esc_pos_data"), // Base64 encoded ESC/POS commands
  plainTextData: text("plain_text_data"), // Plain text fallback for debugging
  // Printer destination info (for agent)
  printerIp: text("printer_ip"),
  printerPort: integer("printer_port").default(9100),
  printerName: text("printer_name"),
  // Retry handling
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastError: text("last_error"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  sentToAgentAt: timestamp("sent_to_agent_at"),
  printedAt: timestamp("printed_at"),
  expiresAt: timestamp("expires_at"),
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
export const insertPaymentProcessorSchema = createInsertSchema(paymentProcessors).omit({ id: true, createdAt: true });
export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({ id: true, initiatedAt: true });
export const insertTerminalDeviceSchema = createInsertSchema(terminalDevices).omit({ id: true, createdAt: true }).extend({
  port: z.coerce.number().optional(),
});
export const insertTerminalSessionSchema = createInsertSchema(terminalSessions).omit({ id: true, initiatedAt: true }).extend({
  amount: z.coerce.number(),
  tipAmount: z.coerce.number().optional(),
});
export const insertRegisteredDeviceSchema = createInsertSchema(registeredDevices).omit({ id: true, createdAt: true });
export const insertEmcUserSchema = createInsertSchema(emcUsers).omit({ id: true, createdAt: true, updatedAt: true, failedLoginAttempts: true, lockedUntil: true, lastLoginAt: true });
export const insertEmcSessionSchema = createInsertSchema(emcSessions).omit({ id: true, createdAt: true });
export const insertTenderSchema = createInsertSchema(tenders).omit({ id: true });
export const insertDiscountSchema = createInsertSchema(discounts).omit({ id: true });
export const insertServiceChargeSchema = createInsertSchema(serviceCharges).omit({ id: true });
export const insertCheckSchema = createInsertSchema(checks).omit({ id: true });
export const insertRoundSchema = createInsertSchema(rounds).omit({ id: true });
export const insertCheckItemSchema = createInsertSchema(checkItems).omit({ id: true });
export const insertCheckPaymentSchema = createInsertSchema(checkPayments).omit({ id: true });
export const insertCheckDiscountSchema = createInsertSchema(checkDiscounts).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true });
export const insertKdsTicketSchema = createInsertSchema(kdsTickets).omit({ id: true });
export const insertRefundSchema = createInsertSchema(refunds).omit({ id: true });
export const insertRefundItemSchema = createInsertSchema(refundItems).omit({ id: true });
export const insertRefundPaymentSchema = createInsertSchema(refundPayments).omit({ id: true });
export const insertPrintAgentSchema = createInsertSchema(printAgents).omit({ 
  id: true, 
  createdAt: true, 
  lastHeartbeat: true, 
  lastConnectedAt: true, 
  lastDisconnectedAt: true, 
  status: true, 
  agentVersion: true, 
  hostname: true, 
  ipAddress: true,
  agentToken: true,  // Generated by backend
  osInfo: true,      // Reported by agent
}).extend({
  propertyId: z.string().optional().nullable(),
});
export const insertPrintJobSchema = createInsertSchema(printJobs).omit({ id: true, createdAt: true, sentToAgentAt: true, printedAt: true });

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
export type PaymentProcessor = typeof paymentProcessors.$inferSelect;
export type InsertPaymentProcessor = z.infer<typeof insertPaymentProcessorSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type TerminalDevice = typeof terminalDevices.$inferSelect;
export type InsertTerminalDevice = z.infer<typeof insertTerminalDeviceSchema>;
export type TerminalSession = typeof terminalSessions.$inferSelect;
export type InsertTerminalSession = z.infer<typeof insertTerminalSessionSchema>;
export type RegisteredDevice = typeof registeredDevices.$inferSelect;
export type InsertRegisteredDevice = z.infer<typeof insertRegisteredDeviceSchema>;
export type EmcUser = typeof emcUsers.$inferSelect;
export type InsertEmcUser = z.infer<typeof insertEmcUserSchema>;
export type EmcSession = typeof emcSessions.$inferSelect;
export type InsertEmcSession = z.infer<typeof insertEmcSessionSchema>;
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
export type CheckDiscount = typeof checkDiscounts.$inferSelect;
export type InsertCheckDiscount = z.infer<typeof insertCheckDiscountSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type KdsTicket = typeof kdsTickets.$inferSelect;
export type InsertKdsTicket = z.infer<typeof insertKdsTicketSchema>;
export type KdsTicketItem = typeof kdsTicketItems.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type RefundItem = typeof refundItems.$inferSelect;
export type InsertRefundItem = z.infer<typeof insertRefundItemSchema>;
export type RefundPayment = typeof refundPayments.$inferSelect;
export type InsertRefundPayment = z.infer<typeof insertRefundPaymentSchema>;
export type PrintAgent = typeof printAgents.$inferSelect;
export type InsertPrintAgent = z.infer<typeof insertPrintAgentSchema>;
export type PrintJob = typeof printJobs.$inferSelect;
export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;

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
  PROCESS_REFUNDS: "process_refunds",
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
  fontSize: text("font_size").default("medium"), // 'small', 'medium', 'large', 'xlarge'
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

// ============================================================================
// TIME & ATTENDANCE - JOB CODES
// ============================================================================

export const JOB_CODE_TIP_MODES = ["not_eligible", "pooled", "direct", "both"] as const;
export type JobCodeTipMode = typeof JOB_CODE_TIP_MODES[number];

export const COMPENSATION_TYPES = ["hourly", "salaried"] as const;
export type CompensationType = typeof COMPENSATION_TYPES[number];

export const SALARY_PERIODS = ["weekly", "biweekly", "monthly", "annual"] as const;
export type SalaryPeriod = typeof SALARY_PERIODS[number];

export const jobCodes = pgTable("job_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  roleId: varchar("role_id").references(() => roles.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  compensationType: text("compensation_type").default("hourly"), // "hourly" or "salaried"
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  salaryAmount: decimal("salary_amount", { precision: 12, scale: 2 }), // amount per salaryPeriod
  salaryPeriod: text("salary_period"), // "weekly", "biweekly", "monthly", "annual"
  tipMode: text("tip_mode").default("not_eligible"),
  tipPoolWeight: decimal("tip_pool_weight", { precision: 5, scale: 2 }).default("1.00"),
  color: text("color").default("#3B82F6"),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

export const employeeJobCodes = pgTable("employee_job_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  jobCodeId: varchar("job_code_id").notNull().references(() => jobCodes.id),
  payRate: decimal("pay_rate", { precision: 10, scale: 2 }),
  isPrimary: boolean("is_primary").default(false),
  bypassClockIn: boolean("bypass_clock_in").default(false), // salaried employees can skip clock-in
});

export const jobCodesRelations = relations(jobCodes, ({ one, many }) => ({
  enterprise: one(enterprises, { fields: [jobCodes.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [jobCodes.propertyId], references: [properties.id] }),
  role: one(roles, { fields: [jobCodes.roleId], references: [roles.id] }),
  employeeJobCodes: many(employeeJobCodes),
}));

export const employeeJobCodesRelations = relations(employeeJobCodes, ({ one }) => ({
  employee: one(employees, { fields: [employeeJobCodes.employeeId], references: [employees.id] }),
  jobCode: one(jobCodes, { fields: [employeeJobCodes.jobCodeId], references: [jobCodes.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - PAY PERIODS
// ============================================================================

export const PAY_PERIOD_STATUSES = ["open", "pending_review", "locked", "exported"] as const;
export type PayPeriodStatus = typeof PAY_PERIOD_STATUSES[number];

export const payPeriods = pgTable("pay_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").default("open"),
  lockedAt: timestamp("locked_at"),
  lockedById: varchar("locked_by_id").references(() => employees.id),
  exportedAt: timestamp("exported_at"),
  exportedById: varchar("exported_by_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payPeriodsRelations = relations(payPeriods, ({ one }) => ({
  property: one(properties, { fields: [payPeriods.propertyId], references: [properties.id] }),
  lockedBy: one(employees, { fields: [payPeriods.lockedById], references: [employees.id] }),
  exportedBy: one(employees, { fields: [payPeriods.exportedById], references: [employees.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - TIME PUNCHES
// ============================================================================

export const PUNCH_TYPES = ["clock_in", "clock_out", "break_start", "break_end"] as const;
export type PunchType = typeof PUNCH_TYPES[number];

export const PUNCH_SOURCES = ["pos", "web", "mobile", "manager_edit", "system"] as const;
export type PunchSource = typeof PUNCH_SOURCES[number];

export const timePunches = pgTable("time_punches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  punchType: text("punch_type").notNull(),
  actualTimestamp: timestamp("actual_timestamp").notNull(),
  roundedTimestamp: timestamp("rounded_timestamp"),
  businessDate: text("business_date").notNull(),
  source: text("source").default("pos"),
  notes: text("notes"),
  isEdited: boolean("is_edited").default(false),
  originalTimestamp: timestamp("original_timestamp"),
  editedById: varchar("edited_by_id").references(() => employees.id),
  editedAt: timestamp("edited_at"),
  editReason: text("edit_reason"),
  voided: boolean("voided").default(false),
  voidedById: varchar("voided_by_id").references(() => employees.id),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timePunchesRelations = relations(timePunches, ({ one }) => ({
  property: one(properties, { fields: [timePunches.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [timePunches.employeeId], references: [employees.id] }),
  jobCode: one(jobCodes, { fields: [timePunches.jobCodeId], references: [jobCodes.id] }),
  editedBy: one(employees, { fields: [timePunches.editedById], references: [employees.id] }),
  voidedBy: one(employees, { fields: [timePunches.voidedById], references: [employees.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - BREAK SESSIONS
// ============================================================================

export const BREAK_TYPES = ["paid", "unpaid", "meal", "rest"] as const;
export type BreakType = typeof BREAK_TYPES[number];

export const breakSessions = pgTable("break_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  businessDate: text("business_date").notNull(),
  breakType: text("break_type").default("unpaid"),
  startPunchId: varchar("start_punch_id").references(() => timePunches.id),
  endPunchId: varchar("end_punch_id").references(() => timePunches.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  scheduledMinutes: integer("scheduled_minutes"),
  actualMinutes: integer("actual_minutes"),
  isPaid: boolean("is_paid").default(false),
  isViolation: boolean("is_violation").default(false),
  violationNotes: text("violation_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const breakSessionsRelations = relations(breakSessions, ({ one }) => ({
  property: one(properties, { fields: [breakSessions.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [breakSessions.employeeId], references: [employees.id] }),
  startPunch: one(timePunches, { fields: [breakSessions.startPunchId], references: [timePunches.id] }),
  endPunch: one(timePunches, { fields: [breakSessions.endPunchId], references: [timePunches.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - TIMECARDS
// ============================================================================

export const timecards = pgTable("timecards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  payPeriodId: varchar("pay_period_id").references(() => payPeriods.id),
  businessDate: text("business_date").notNull(),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  payRate: decimal("pay_rate", { precision: 10, scale: 2 }),
  clockInTime: timestamp("clock_in_time"),
  clockOutTime: timestamp("clock_out_time"),
  regularHours: decimal("regular_hours", { precision: 6, scale: 2 }).default("0"),
  overtimeHours: decimal("overtime_hours", { precision: 6, scale: 2 }).default("0"),
  doubleTimeHours: decimal("double_time_hours", { precision: 6, scale: 2 }).default("0"),
  breakMinutes: integer("break_minutes").default(0),
  paidBreakMinutes: integer("paid_break_minutes").default(0),
  unpaidBreakMinutes: integer("unpaid_break_minutes").default(0),
  totalHours: decimal("total_hours", { precision: 6, scale: 2 }).default("0"),
  regularPay: decimal("regular_pay", { precision: 10, scale: 2 }).default("0"),
  overtimePay: decimal("overtime_pay", { precision: 10, scale: 2 }).default("0"),
  totalPay: decimal("total_pay", { precision: 10, scale: 2 }).default("0"),
  tips: decimal("tips", { precision: 10, scale: 2 }).default("0"),
  status: text("status").default("open"),
  approvedById: varchar("approved_by_id").references(() => employees.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timecardsRelations = relations(timecards, ({ one }) => ({
  property: one(properties, { fields: [timecards.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [timecards.employeeId], references: [employees.id] }),
  payPeriod: one(payPeriods, { fields: [timecards.payPeriodId], references: [payPeriods.id] }),
  jobCode: one(jobCodes, { fields: [timecards.jobCodeId], references: [jobCodes.id] }),
  approvedBy: one(employees, { fields: [timecards.approvedById], references: [employees.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - EXCEPTIONS
// ============================================================================

export const EXCEPTION_TYPES = [
  "missed_punch", "late_clock_in", "early_clock_out", "no_show",
  "break_violation", "overtime_risk", "overtime_exceeded", "schedule_deviation"
] as const;
export type ExceptionType = typeof EXCEPTION_TYPES[number];

export const EXCEPTION_STATUSES = ["pending", "acknowledged", "resolved", "dismissed"] as const;
export type ExceptionStatus = typeof EXCEPTION_STATUSES[number];

export const timecardExceptions = pgTable("timecard_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  timecardId: varchar("timecard_id").references(() => timecards.id),
  timePunchId: varchar("time_punch_id").references(() => timePunches.id),
  exceptionType: text("exception_type").notNull(),
  businessDate: text("business_date").notNull(),
  description: text("description"),
  severity: text("severity").default("warning"),
  status: text("status").default("pending"),
  resolvedById: varchar("resolved_by_id").references(() => employees.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timecardExceptionsRelations = relations(timecardExceptions, ({ one }) => ({
  property: one(properties, { fields: [timecardExceptions.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [timecardExceptions.employeeId], references: [employees.id] }),
  timecard: one(timecards, { fields: [timecardExceptions.timecardId], references: [timecards.id] }),
  timePunch: one(timePunches, { fields: [timecardExceptions.timePunchId], references: [timePunches.id] }),
  resolvedBy: one(employees, { fields: [timecardExceptions.resolvedById], references: [employees.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - AUDIT LOG FOR EDITS
// ============================================================================

export const timecardEdits = pgTable("timecard_edits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  targetType: text("target_type").notNull(),
  targetId: varchar("target_id").notNull(),
  editType: text("edit_type").notNull(),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  reasonCode: text("reason_code"),
  notes: text("notes"),
  // Either employee or EMC user made the edit (one must be set)
  editedById: varchar("edited_by_id").references(() => employees.id),
  editedByEmcUserId: varchar("edited_by_emc_user_id").references(() => emcUsers.id),
  // For audit display purposes (immutable name at time of edit)
  editedByDisplayName: text("edited_by_display_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timecardEditsRelations = relations(timecardEdits, ({ one }) => ({
  property: one(properties, { fields: [timecardEdits.propertyId], references: [properties.id] }),
  editedBy: one(employees, { fields: [timecardEdits.editedById], references: [employees.id] }),
  editedByEmcUser: one(emcUsers, { fields: [timecardEdits.editedByEmcUserId], references: [emcUsers.id] }),
}));

// ============================================================================
// SCHEDULING - AVAILABILITY
// ============================================================================

export const AVAILABILITY_TYPES = ["available", "preferred", "unavailable"] as const;
export type AvailabilityType = typeof AVAILABILITY_TYPES[number];

export const employeeAvailability = pgTable("employee_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  propertyId: varchar("property_id").references(() => properties.id),
  dayOfWeek: integer("day_of_week"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  availabilityType: text("availability_type").default("available"),
  effectiveFrom: text("effective_from"),
  effectiveTo: text("effective_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const availabilityExceptions = pgTable("availability_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  propertyId: varchar("property_id").references(() => properties.id),
  exceptionDate: text("exception_date").notNull(),
  isAvailable: boolean("is_available").default(false),
  startTime: text("start_time"),
  endTime: text("end_time"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const employeeAvailabilityRelations = relations(employeeAvailability, ({ one }) => ({
  employee: one(employees, { fields: [employeeAvailability.employeeId], references: [employees.id] }),
  property: one(properties, { fields: [employeeAvailability.propertyId], references: [properties.id] }),
}));

export const availabilityExceptionsRelations = relations(availabilityExceptions, ({ one }) => ({
  employee: one(employees, { fields: [availabilityExceptions.employeeId], references: [employees.id] }),
  property: one(properties, { fields: [availabilityExceptions.propertyId], references: [properties.id] }),
}));

// ============================================================================
// SCHEDULING - TIME OFF REQUESTS
// ============================================================================

export const TIME_OFF_STATUSES = ["submitted", "approved", "denied", "cancelled"] as const;
export type TimeOffStatus = typeof TIME_OFF_STATUSES[number];

export const timeOffRequests = pgTable("time_off_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  propertyId: varchar("property_id").references(() => properties.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  requestType: text("request_type").default("pto"),
  reasonCode: text("reason_code"),
  notes: text("notes"),
  status: text("status").default("submitted"),
  reviewedById: varchar("reviewed_by_id").references(() => employees.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timeOffRequestsRelations = relations(timeOffRequests, ({ one }) => ({
  employee: one(employees, { fields: [timeOffRequests.employeeId], references: [employees.id] }),
  property: one(properties, { fields: [timeOffRequests.propertyId], references: [properties.id] }),
  reviewedBy: one(employees, { fields: [timeOffRequests.reviewedById], references: [employees.id] }),
}));

// ============================================================================
// SCHEDULING - SHIFTS
// ============================================================================

export const SHIFT_STATUSES = ["draft", "published", "acknowledged", "completed", "cancelled"] as const;
export type ShiftStatus = typeof SHIFT_STATUSES[number];

export const shiftTemplates = pgTable("shift_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  breakMinutes: integer("break_minutes").default(0),
  color: text("color"),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shifts = pgTable("shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  templateId: varchar("template_id").references(() => shiftTemplates.id),
  shiftDate: text("shift_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  scheduledBreakMinutes: integer("scheduled_break_minutes").default(0),
  status: text("status").default("draft"),
  notes: text("notes"),
  publishedAt: timestamp("published_at"),
  publishedById: varchar("published_by_id").references(() => employees.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shiftsRelations = relations(shifts, ({ one }) => ({
  property: one(properties, { fields: [shifts.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [shifts.rvcId], references: [rvcs.id] }),
  employee: one(employees, { fields: [shifts.employeeId], references: [employees.id] }),
  jobCode: one(jobCodes, { fields: [shifts.jobCodeId], references: [jobCodes.id] }),
  template: one(shiftTemplates, { fields: [shifts.templateId], references: [shiftTemplates.id] }),
  publishedBy: one(employees, { fields: [shifts.publishedById], references: [employees.id] }),
}));

export const shiftTemplatesRelations = relations(shiftTemplates, ({ one, many }) => ({
  property: one(properties, { fields: [shiftTemplates.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [shiftTemplates.rvcId], references: [rvcs.id] }),
  jobCode: one(jobCodes, { fields: [shiftTemplates.jobCodeId], references: [jobCodes.id] }),
  shifts: many(shifts),
}));

// ============================================================================
// SCHEDULING - SHIFT COVER/SWAP REQUESTS
// ============================================================================

export const COVER_REQUEST_STATUSES = ["open", "offered", "pending_approval", "approved", "denied", "cancelled", "expired"] as const;
export type CoverRequestStatus = typeof COVER_REQUEST_STATUSES[number];

export const shiftCoverRequests = pgTable("shift_cover_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id),
  requesterId: varchar("requester_id").notNull().references(() => employees.id),
  reason: text("reason"),
  status: text("status").default("open"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shiftCoverOffers = pgTable("shift_cover_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coverRequestId: varchar("cover_request_id").notNull().references(() => shiftCoverRequests.id),
  offererId: varchar("offerer_id").notNull().references(() => employees.id),
  notes: text("notes"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shiftCoverApprovals = pgTable("shift_cover_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coverRequestId: varchar("cover_request_id").notNull().references(() => shiftCoverRequests.id),
  offerId: varchar("offer_id").references(() => shiftCoverOffers.id),
  approvedById: varchar("approved_by_id").notNull().references(() => employees.id),
  approved: boolean("approved").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shiftCoverRequestsRelations = relations(shiftCoverRequests, ({ one, many }) => ({
  shift: one(shifts, { fields: [shiftCoverRequests.shiftId], references: [shifts.id] }),
  requester: one(employees, { fields: [shiftCoverRequests.requesterId], references: [employees.id] }),
  offers: many(shiftCoverOffers),
  approvals: many(shiftCoverApprovals),
}));

export const shiftCoverOffersRelations = relations(shiftCoverOffers, ({ one }) => ({
  coverRequest: one(shiftCoverRequests, { fields: [shiftCoverOffers.coverRequestId], references: [shiftCoverRequests.id] }),
  offerer: one(employees, { fields: [shiftCoverOffers.offererId], references: [employees.id] }),
}));

export const shiftCoverApprovalsRelations = relations(shiftCoverApprovals, ({ one }) => ({
  coverRequest: one(shiftCoverRequests, { fields: [shiftCoverApprovals.coverRequestId], references: [shiftCoverRequests.id] }),
  offer: one(shiftCoverOffers, { fields: [shiftCoverApprovals.offerId], references: [shiftCoverOffers.id] }),
  approvedBy: one(employees, { fields: [shiftCoverApprovals.approvedById], references: [employees.id] }),
}));

// ============================================================================
// TIP POOLING
// ============================================================================

export const TIP_POOL_CALC_METHODS = ["hours_worked", "points", "equal", "custom"] as const;
export type TipPoolCalcMethod = typeof TIP_POOL_CALC_METHODS[number];

export const tipPoolPolicies = pgTable("tip_pool_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  calculationMethod: text("calculation_method").default("hours_worked"),
  roleWeights: jsonb("role_weights"),
  excludedJobCodeIds: text("excluded_job_code_ids").array(),
  excludeManagers: boolean("exclude_managers").default(true),
  excludeTraining: boolean("exclude_training").default(true),
  minimumHoursRequired: decimal("minimum_hours_required", { precision: 4, scale: 2 }).default("0"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tipPoolRuns = pgTable("tip_pool_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  policyId: varchar("policy_id").references(() => tipPoolPolicies.id),
  businessDate: text("business_date").notNull(),
  totalTips: decimal("total_tips", { precision: 10, scale: 2 }).default("0"),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }).default("0"),
  participantCount: integer("participant_count").default(0),
  status: text("status").default("pending"),
  runById: varchar("run_by_id").references(() => employees.id),
  runAt: timestamp("run_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tipAllocations = pgTable("tip_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tipPoolRunId: varchar("tip_pool_run_id").notNull().references(() => tipPoolRuns.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  hoursWorked: decimal("hours_worked", { precision: 6, scale: 2 }).default("0"),
  pointsEarned: decimal("points_earned", { precision: 6, scale: 2 }).default("0"),
  sharePercentage: decimal("share_percentage", { precision: 5, scale: 2 }).default("0"),
  allocatedAmount: decimal("allocated_amount", { precision: 10, scale: 2 }).default("0"),
  directTips: decimal("direct_tips", { precision: 10, scale: 2 }).default("0"),
  totalTips: decimal("total_tips", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tipPoolPoliciesRelations = relations(tipPoolPolicies, ({ one, many }) => ({
  property: one(properties, { fields: [tipPoolPolicies.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [tipPoolPolicies.rvcId], references: [rvcs.id] }),
  runs: many(tipPoolRuns),
}));

export const tipPoolRunsRelations = relations(tipPoolRuns, ({ one, many }) => ({
  property: one(properties, { fields: [tipPoolRuns.propertyId], references: [properties.id] }),
  policy: one(tipPoolPolicies, { fields: [tipPoolRuns.policyId], references: [tipPoolPolicies.id] }),
  runBy: one(employees, { fields: [tipPoolRuns.runById], references: [employees.id] }),
  allocations: many(tipAllocations),
}));

export const tipAllocationsRelations = relations(tipAllocations, ({ one }) => ({
  tipPoolRun: one(tipPoolRuns, { fields: [tipAllocations.tipPoolRunId], references: [tipPoolRuns.id] }),
  employee: one(employees, { fields: [tipAllocations.employeeId], references: [employees.id] }),
}));

// ============================================================================
// LABOR VS SALES ANALYTICS
// ============================================================================

export const laborSnapshots = pgTable("labor_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  businessDate: text("business_date").notNull(),
  hour: integer("hour"),
  daypart: text("daypart"),
  totalSales: decimal("total_sales", { precision: 12, scale: 2 }).default("0"),
  laborHours: decimal("labor_hours", { precision: 8, scale: 2 }).default("0"),
  laborCost: decimal("labor_cost", { precision: 10, scale: 2 }).default("0"),
  laborPercentage: decimal("labor_percentage", { precision: 5, scale: 2 }).default("0"),
  salesPerLaborHour: decimal("sales_per_labor_hour", { precision: 10, scale: 2 }).default("0"),
  headcount: integer("headcount").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const laborSnapshotsRelations = relations(laborSnapshots, ({ one }) => ({
  property: one(properties, { fields: [laborSnapshots.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [laborSnapshots.rvcId], references: [rvcs.id] }),
}));

// ============================================================================
// OVERTIME RULES - Property-specific labor law configuration
// ============================================================================

export const overtimeRules = pgTable("overtime_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  description: text("description"),
  dailyRegularHours: decimal("daily_regular_hours", { precision: 4, scale: 2 }).default("8.00"),
  dailyOvertimeThreshold: decimal("daily_overtime_threshold", { precision: 4, scale: 2 }).default("8.00"),
  dailyDoubleTimeThreshold: decimal("daily_double_time_threshold", { precision: 4, scale: 2 }),
  weeklyOvertimeThreshold: decimal("weekly_overtime_threshold", { precision: 4, scale: 2 }).default("40.00"),
  weeklyDoubleTimeThreshold: decimal("weekly_double_time_threshold", { precision: 4, scale: 2 }),
  overtimeMultiplier: decimal("overtime_multiplier", { precision: 3, scale: 2 }).default("1.50"),
  doubleTimeMultiplier: decimal("double_time_multiplier", { precision: 3, scale: 2 }).default("2.00"),
  enableDailyOvertime: boolean("enable_daily_overtime").default(true),
  enableDailyDoubleTime: boolean("enable_daily_double_time").default(false),
  enableWeeklyOvertime: boolean("enable_weekly_overtime").default(true),
  enableWeeklyDoubleTime: boolean("enable_weekly_double_time").default(false),
  weekStartDay: integer("week_start_day").default(0),
  effectiveDate: text("effective_date"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const overtimeRulesRelations = relations(overtimeRules, ({ one }) => ({
  property: one(properties, { fields: [overtimeRules.propertyId], references: [properties.id] }),
}));

// ============================================================================
// T&A INSERT SCHEMAS AND TYPES
// ============================================================================

export const insertJobCodeSchema = createInsertSchema(jobCodes).omit({ id: true });
export const insertEmployeeJobCodeSchema = createInsertSchema(employeeJobCodes).omit({ id: true });
export const insertPayPeriodSchema = createInsertSchema(payPeriods).omit({ id: true, createdAt: true });
export const insertTimePunchSchema = createInsertSchema(timePunches).omit({ id: true, createdAt: true });
export const insertBreakSessionSchema = createInsertSchema(breakSessions).omit({ id: true, createdAt: true });
export const insertTimecardSchema = createInsertSchema(timecards).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimecardExceptionSchema = createInsertSchema(timecardExceptions).omit({ id: true, createdAt: true });
export const insertTimecardEditSchema = createInsertSchema(timecardEdits).omit({ id: true, createdAt: true });
export const insertEmployeeAvailabilitySchema = createInsertSchema(employeeAvailability).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAvailabilityExceptionSchema = createInsertSchema(availabilityExceptions).omit({ id: true, createdAt: true });
export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShiftTemplateSchema = createInsertSchema(shiftTemplates).omit({ id: true, createdAt: true });
export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShiftCoverRequestSchema = createInsertSchema(shiftCoverRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShiftCoverOfferSchema = createInsertSchema(shiftCoverOffers).omit({ id: true, createdAt: true });
export const insertShiftCoverApprovalSchema = createInsertSchema(shiftCoverApprovals).omit({ id: true, createdAt: true });
export const insertTipPoolPolicySchema = createInsertSchema(tipPoolPolicies).omit({ id: true, createdAt: true });
export const insertTipPoolRunSchema = createInsertSchema(tipPoolRuns).omit({ id: true, createdAt: true });
export const insertTipAllocationSchema = createInsertSchema(tipAllocations).omit({ id: true, createdAt: true });
export const insertLaborSnapshotSchema = createInsertSchema(laborSnapshots).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOvertimeRuleSchema = createInsertSchema(overtimeRules).omit({ id: true, createdAt: true, updatedAt: true });

export type JobCode = typeof jobCodes.$inferSelect;
export type InsertJobCode = z.infer<typeof insertJobCodeSchema>;
export type EmployeeJobCode = typeof employeeJobCodes.$inferSelect;
export type InsertEmployeeJobCode = z.infer<typeof insertEmployeeJobCodeSchema>;
export type PayPeriod = typeof payPeriods.$inferSelect;
export type InsertPayPeriod = z.infer<typeof insertPayPeriodSchema>;
export type TimePunch = typeof timePunches.$inferSelect;
export type InsertTimePunch = z.infer<typeof insertTimePunchSchema>;
export type BreakSession = typeof breakSessions.$inferSelect;
export type InsertBreakSession = z.infer<typeof insertBreakSessionSchema>;
export type Timecard = typeof timecards.$inferSelect;
export type InsertTimecard = z.infer<typeof insertTimecardSchema>;
export type TimecardException = typeof timecardExceptions.$inferSelect;
export type InsertTimecardException = z.infer<typeof insertTimecardExceptionSchema>;
export type TimecardEdit = typeof timecardEdits.$inferSelect;
export type InsertTimecardEdit = z.infer<typeof insertTimecardEditSchema>;
export type EmployeeAvailability = typeof employeeAvailability.$inferSelect;
export type InsertEmployeeAvailability = z.infer<typeof insertEmployeeAvailabilitySchema>;
export type AvailabilityException = typeof availabilityExceptions.$inferSelect;
export type InsertAvailabilityException = z.infer<typeof insertAvailabilityExceptionSchema>;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type InsertShiftTemplate = z.infer<typeof insertShiftTemplateSchema>;
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type ShiftCoverRequest = typeof shiftCoverRequests.$inferSelect;
export type InsertShiftCoverRequest = z.infer<typeof insertShiftCoverRequestSchema>;
export type ShiftCoverOffer = typeof shiftCoverOffers.$inferSelect;
export type InsertShiftCoverOffer = z.infer<typeof insertShiftCoverOfferSchema>;
export type ShiftCoverApproval = typeof shiftCoverApprovals.$inferSelect;
export type InsertShiftCoverApproval = z.infer<typeof insertShiftCoverApprovalSchema>;
export type TipPoolPolicy = typeof tipPoolPolicies.$inferSelect;
export type InsertTipPoolPolicy = z.infer<typeof insertTipPoolPolicySchema>;
export type TipPoolRun = typeof tipPoolRuns.$inferSelect;
export type InsertTipPoolRun = z.infer<typeof insertTipPoolRunSchema>;
export type TipAllocation = typeof tipAllocations.$inferSelect;
export type InsertTipAllocation = z.infer<typeof insertTipAllocationSchema>;
export type LaborSnapshot = typeof laborSnapshots.$inferSelect;
export type InsertLaborSnapshot = z.infer<typeof insertLaborSnapshotSchema>;
export type OvertimeRule = typeof overtimeRules.$inferSelect;
export type InsertOvertimeRule = z.infer<typeof insertOvertimeRuleSchema>;

// ============================================================================
// PHASE 1: OFFLINE ORDER QUEUE
// ============================================================================

export const OFFLINE_ORDER_STATUSES = ["pending", "syncing", "synced", "failed", "conflict"] as const;
export type OfflineOrderStatus = typeof OFFLINE_ORDER_STATUSES[number];

export const offlineOrderQueue = pgTable("offline_order_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  localId: text("local_id").notNull(), // Client-generated UUID for deduplication
  orderData: jsonb("order_data").notNull(), // Full check/items payload
  status: text("status").default("pending"),
  syncAttempts: integer("sync_attempts").default(0),
  lastSyncAttempt: timestamp("last_sync_attempt"),
  syncedCheckId: varchar("synced_check_id"), // After successful sync
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  syncedAt: timestamp("synced_at"),
});

export const insertOfflineOrderQueueSchema = createInsertSchema(offlineOrderQueue).omit({ id: true, createdAt: true, syncedAt: true });
export type OfflineOrderQueue = typeof offlineOrderQueue.$inferSelect;
export type InsertOfflineOrderQueue = z.infer<typeof insertOfflineOrderQueueSchema>;

// ============================================================================
// PHASE 2: FISCAL CLOSE / END-OF-DAY
// ============================================================================

export const FISCAL_PERIOD_STATUSES = ["open", "closing", "closed", "reopened"] as const;
export type FiscalPeriodStatus = typeof FISCAL_PERIOD_STATUSES[number];

export const fiscalPeriods = pgTable("fiscal_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  businessDate: text("business_date").notNull(), // YYYY-MM-DD
  status: text("status").default("open"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  closedById: varchar("closed_by_id").references(() => employees.id),
  reopenedAt: timestamp("reopened_at"),
  reopenedById: varchar("reopened_by_id").references(() => employees.id),
  reopenReason: text("reopen_reason"),
  // Financial Totals
  grossSales: decimal("gross_sales", { precision: 12, scale: 2 }).default("0"),
  netSales: decimal("net_sales", { precision: 12, scale: 2 }).default("0"),
  taxCollected: decimal("tax_collected", { precision: 12, scale: 2 }).default("0"),
  discountsTotal: decimal("discounts_total", { precision: 12, scale: 2 }).default("0"),
  refundsTotal: decimal("refunds_total", { precision: 12, scale: 2 }).default("0"),
  tipsTotal: decimal("tips_total", { precision: 12, scale: 2 }).default("0"),
  serviceChargesTotal: decimal("service_charges_total", { precision: 12, scale: 2 }).default("0"),
  checkCount: integer("check_count").default(0),
  guestCount: integer("guest_count").default(0),
  // Cash Reconciliation
  cashExpected: decimal("cash_expected", { precision: 12, scale: 2 }).default("0"),
  cashActual: decimal("cash_actual", { precision: 12, scale: 2 }),
  cashVariance: decimal("cash_variance", { precision: 12, scale: 2 }),
  // Card Totals
  cardTotal: decimal("card_total", { precision: 12, scale: 2 }).default("0"),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const fiscalPeriodsRelations = relations(fiscalPeriods, ({ one }) => ({
  property: one(properties, { fields: [fiscalPeriods.propertyId], references: [properties.id] }),
  closedBy: one(employees, { fields: [fiscalPeriods.closedById], references: [employees.id] }),
  reopenedBy: one(employees, { fields: [fiscalPeriods.reopenedById], references: [employees.id] }),
}));

export const insertFiscalPeriodSchema = createInsertSchema(fiscalPeriods).omit({ id: true, createdAt: true });
export type FiscalPeriod = typeof fiscalPeriods.$inferSelect;
export type InsertFiscalPeriod = z.infer<typeof insertFiscalPeriodSchema>;

// ============================================================================
// PHASE 2: CASH MANAGEMENT
// ============================================================================

export const DRAWER_STATUSES = ["assigned", "active", "counting", "closed"] as const;
export type DrawerStatus = typeof DRAWER_STATUSES[number];

export const cashDrawers = pgTable("cash_drawers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  name: text("name").notNull(),
  active: boolean("active").default(true),
});

export const drawerAssignments = pgTable("drawer_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  drawerId: varchar("drawer_id").notNull().references(() => cashDrawers.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  businessDate: text("business_date").notNull(),
  status: text("status").default("assigned"),
  openingAmount: decimal("opening_amount", { precision: 12, scale: 2 }).notNull(),
  expectedAmount: decimal("expected_amount", { precision: 12, scale: 2 }).default("0"),
  actualAmount: decimal("actual_amount", { precision: 12, scale: 2 }),
  variance: decimal("variance", { precision: 12, scale: 2 }),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  closedById: varchar("closed_by_id").references(() => employees.id),
  notes: text("notes"),
});

export const CASH_TRANSACTION_TYPES = ["sale", "refund", "paid_in", "paid_out", "drop", "pickup"] as const;
export type CashTransactionType = typeof CASH_TRANSACTION_TYPES[number];

export const cashTransactions = pgTable("cash_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  drawerId: varchar("drawer_id").references(() => cashDrawers.id),
  assignmentId: varchar("assignment_id").references(() => drawerAssignments.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  transactionType: text("transaction_type").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  businessDate: text("business_date").notNull(),
  checkId: varchar("check_id").references(() => checks.id),
  reason: text("reason"),
  managerApprovalId: varchar("manager_approval_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const safeCounts = pgTable("safe_counts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  businessDate: text("business_date").notNull(),
  countType: text("count_type").notNull().default("daily"), // opening, mid_day, closing, daily
  expectedAmount: decimal("expected_amount", { precision: 12, scale: 2 }),
  actualAmount: decimal("actual_amount", { precision: 12, scale: 2 }).notNull(),
  variance: decimal("variance", { precision: 12, scale: 2 }),
  // Denomination breakdown
  denominations: jsonb("denominations"), // { "100": 5, "50": 10, ... }
  notes: text("notes"),
  verifiedById: varchar("verified_by_id").references(() => employees.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCashDrawerSchema = createInsertSchema(cashDrawers).omit({ id: true });
export const insertDrawerAssignmentSchema = createInsertSchema(drawerAssignments).omit({ id: true, openedAt: true });
export const insertCashTransactionSchema = createInsertSchema(cashTransactions).omit({ id: true, createdAt: true });
export const insertSafeCountSchema = createInsertSchema(safeCounts).omit({ id: true, createdAt: true });

export type CashDrawer = typeof cashDrawers.$inferSelect;
export type InsertCashDrawer = z.infer<typeof insertCashDrawerSchema>;
export type DrawerAssignment = typeof drawerAssignments.$inferSelect;
export type InsertDrawerAssignment = z.infer<typeof insertDrawerAssignmentSchema>;
export type CashTransaction = typeof cashTransactions.$inferSelect;
export type InsertCashTransaction = z.infer<typeof insertCashTransactionSchema>;
export type SafeCount = typeof safeCounts.$inferSelect;
export type InsertSafeCount = z.infer<typeof insertSafeCountSchema>;

// ============================================================================
// PHASE 2: GIFT CARDS
// ============================================================================

export const GIFT_CARD_STATUSES = ["active", "redeemed", "expired", "cancelled", "suspended"] as const;
export type GiftCardStatus = typeof GIFT_CARD_STATUSES[number];

export const giftCards = pgTable("gift_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  cardNumber: text("card_number").notNull().unique(),
  pin: text("pin"), // Optional PIN for verification
  initialBalance: decimal("initial_balance", { precision: 12, scale: 2 }).notNull(),
  currentBalance: decimal("current_balance", { precision: 12, scale: 2 }).notNull(),
  status: text("status").default("active"),
  activatedAt: timestamp("activated_at"),
  activatedById: varchar("activated_by_id").references(() => employees.id),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  purchaserName: text("purchaser_name"),
  recipientName: text("recipient_name"),
  recipientEmail: text("recipient_email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const GIFT_CARD_TRANSACTION_TYPES = ["activation", "reload", "redemption", "refund", "adjustment", "expiration"] as const;
export type GiftCardTransactionType = typeof GIFT_CARD_TRANSACTION_TYPES[number];

export const giftCardTransactions = pgTable("gift_card_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  giftCardId: varchar("gift_card_id").notNull().references(() => giftCards.id),
  propertyId: varchar("property_id").references(() => properties.id),
  transactionType: text("transaction_type").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 2 }).notNull(),
  checkId: varchar("check_id").references(() => checks.id),
  checkPaymentId: varchar("check_payment_id").references(() => checkPayments.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGiftCardSchema = createInsertSchema(giftCards).omit({ id: true, createdAt: true });
export const insertGiftCardTransactionSchema = createInsertSchema(giftCardTransactions).omit({ id: true, createdAt: true });

export type GiftCard = typeof giftCards.$inferSelect;
export type InsertGiftCard = z.infer<typeof insertGiftCardSchema>;
export type GiftCardTransaction = typeof giftCardTransactions.$inferSelect;
export type InsertGiftCardTransaction = z.infer<typeof insertGiftCardTransactionSchema>;

// ============================================================================
// PHASE 2: ACCOUNTING EXPORT
// ============================================================================

export const EXPORT_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type ExportStatus = typeof EXPORT_STATUSES[number];

export const glMappings = pgTable("gl_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  sourceType: text("source_type").notNull(), // revenue, tax, tender, discount, service_charge, labor
  sourceId: varchar("source_id"), // ID of the source entity (tender, tax group, etc.)
  glAccountCode: text("gl_account_code").notNull(),
  glAccountName: text("gl_account_name"),
  debitCredit: text("debit_credit").default("credit"), // debit or credit
  description: text("description"),
  active: boolean("active").default(true),
});

export const accountingExports = pgTable("accounting_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  exportType: text("export_type").notNull().default("daily"), // daily, weekly, monthly, custom
  formatType: text("format_type").notNull().default("csv"), // csv, qbo, iif, json
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").default("pending"),
  generatedAt: timestamp("generated_at"),
  generatedById: varchar("generated_by_id").references(() => employees.id),
  downloadUrl: text("download_url"),
  errorMessage: text("error_message"),
  // Summary data
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }),
  totalTax: decimal("total_tax", { precision: 12, scale: 2 }),
  totalLabor: decimal("total_labor", { precision: 12, scale: 2 }),
  rowCount: integer("row_count"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGlMappingSchema = createInsertSchema(glMappings).omit({ id: true });
export const insertAccountingExportSchema = createInsertSchema(accountingExports).omit({ id: true, createdAt: true });

export type GlMapping = typeof glMappings.$inferSelect;
export type InsertGlMapping = z.infer<typeof insertGlMappingSchema>;
export type AccountingExport = typeof accountingExports.$inferSelect;
export type InsertAccountingExport = z.infer<typeof insertAccountingExportSchema>;

// ============================================================================
// PHASE 3: LOYALTY PROGRAM
// ============================================================================

export const LOYALTY_PROGRAM_TYPES = ["points", "visits", "spend", "tiered"] as const;
export type LoyaltyProgramType = typeof LOYALTY_PROGRAM_TYPES[number];

export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  name: text("name").notNull(),
  programType: text("program_type").notNull().default("points"),
  // Points earning rules
  pointsPerDollar: decimal("points_per_dollar", { precision: 5, scale: 2 }).default("1"),
  minimumPointsRedeem: integer("minimum_points_redeem").default(100),
  pointsRedemptionValue: decimal("points_redemption_value", { precision: 10, scale: 4 }).default("0.01"), // $ per point
  // Visit-based rules
  visitsForReward: integer("visits_for_reward").default(10),
  // Tier configuration
  tierConfig: jsonb("tier_config"), // { tiers: [{ name: "Gold", threshold: 1000, multiplier: 1.5 }] }
  // Expiration
  pointsExpirationDays: integer("points_expiration_days"), // null = never expires
  // Status
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const MEMBER_STATUSES = ["active", "inactive", "suspended"] as const;
export type MemberStatus = typeof MEMBER_STATUSES[number];

// Customer profile - can be enrolled in multiple loyalty programs
export const loyaltyMembers = pgTable("loyalty_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberNumber: text("member_number").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  birthDate: text("birth_date"), // MM-DD format for birthday rewards
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  notes: text("notes"),
});

// Junction table - links members to programs with per-program metrics
export const ENROLLMENT_STATUSES = ["active", "inactive", "suspended"] as const;
export type EnrollmentStatus = typeof ENROLLMENT_STATUSES[number];

export const loyaltyMemberEnrollments = pgTable("loyalty_member_enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => loyaltyMembers.id),
  programId: varchar("program_id").notNull().references(() => loyaltyPrograms.id),
  // Per-program metrics
  currentPoints: integer("current_points").default(0),
  lifetimePoints: integer("lifetime_points").default(0),
  currentTier: text("current_tier").default("standard"),
  visitCount: integer("visit_count").default(0),
  lifetimeSpend: decimal("lifetime_spend", { precision: 12, scale: 2 }).default("0"),
  // Status and dates
  status: text("status").default("active"),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  lastActivityAt: timestamp("last_activity_at"),
  pointsExpirationDate: timestamp("points_expiration_date"),
});

export const LOYALTY_TRANSACTION_TYPES = ["earn", "redeem", "adjust", "expire", "transfer"] as const;
export type LoyaltyTransactionType = typeof LOYALTY_TRANSACTION_TYPES[number];

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => loyaltyMembers.id),
  programId: varchar("program_id").notNull().references(() => loyaltyPrograms.id),
  enrollmentId: varchar("enrollment_id").references(() => loyaltyMemberEnrollments.id),
  propertyId: varchar("property_id").references(() => properties.id),
  transactionType: text("transaction_type").notNull(),
  // For points-based programs
  points: integer("points").default(0), // Positive for earn, negative for redeem
  pointsBefore: integer("points_before").default(0),
  pointsAfter: integer("points_after").default(0),
  // For visit-based programs
  visitIncrement: integer("visit_increment").default(0),
  visitsBefore: integer("visits_before").default(0),
  visitsAfter: integer("visits_after").default(0),
  // Transaction context
  checkId: varchar("check_id").references(() => checks.id),
  checkTotal: decimal("check_total", { precision: 12, scale: 2 }),
  employeeId: varchar("employee_id").references(() => employees.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programId: varchar("program_id").notNull().references(() => loyaltyPrograms.id),
  name: text("name").notNull(),
  description: text("description"),
  rewardType: text("reward_type").notNull().default("discount"), // discount, free_item, points_multiplier
  pointsCost: integer("points_cost").default(0),
  autoAwardAtPoints: integer("auto_award_at_points"), // If set, auto-award when member reaches this threshold
  autoAwardOnce: boolean("auto_award_once").default(true), // Only auto-award once per member
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  freeMenuItemId: varchar("free_menu_item_id").references(() => menuItems.id),
  giftCardAmount: decimal("gift_card_amount", { precision: 10, scale: 2 }), // For gift_card reward type
  minPurchase: decimal("min_purchase", { precision: 10, scale: 2 }),
  maxRedemptions: integer("max_redemptions"), // null = unlimited
  redemptionCount: integer("redemption_count").default(0),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  tierRequired: text("tier_required"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Loyalty Redemptions - tracks when rewards are redeemed at POS
export const loyaltyRedemptions = pgTable("loyalty_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => loyaltyMembers.id),
  rewardId: varchar("reward_id").notNull().references(() => loyaltyRewards.id),
  checkId: varchar("check_id").references(() => checks.id),
  propertyId: varchar("property_id").references(() => properties.id),
  pointsUsed: integer("points_used").default(0),
  discountApplied: decimal("discount_applied", { precision: 10, scale: 2 }),
  status: text("status").default("applied"), // 'applied', 'voided'
  employeeId: varchar("employee_id").references(() => employees.id),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
});

export const insertLoyaltyProgramSchema = createInsertSchema(loyaltyPrograms).omit({ id: true, createdAt: true });
export const insertLoyaltyMemberSchema = createInsertSchema(loyaltyMembers).omit({ id: true, createdAt: true });
export const insertLoyaltyMemberEnrollmentSchema = createInsertSchema(loyaltyMemberEnrollments).omit({ id: true, enrolledAt: true });
export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions).omit({ id: true, createdAt: true });
export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards).omit({ id: true, createdAt: true });
export const insertLoyaltyRedemptionSchema = createInsertSchema(loyaltyRedemptions).omit({ id: true, redeemedAt: true });

export type LoyaltyProgram = typeof loyaltyPrograms.$inferSelect;
export type InsertLoyaltyProgram = z.infer<typeof insertLoyaltyProgramSchema>;
export type LoyaltyMember = typeof loyaltyMembers.$inferSelect;
export type InsertLoyaltyMember = z.infer<typeof insertLoyaltyMemberSchema>;
export type LoyaltyMemberEnrollment = typeof loyaltyMemberEnrollments.$inferSelect;
export type InsertLoyaltyMemberEnrollment = z.infer<typeof insertLoyaltyMemberEnrollmentSchema>;
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type InsertLoyaltyTransaction = z.infer<typeof insertLoyaltyTransactionSchema>;
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;
export type LoyaltyRedemption = typeof loyaltyRedemptions.$inferSelect;
export type InsertLoyaltyRedemption = z.infer<typeof insertLoyaltyRedemptionSchema>;

// Extended type for member with all their enrollments
export type LoyaltyMemberWithEnrollments = LoyaltyMember & {
  enrollments: (LoyaltyMemberEnrollment & { program?: LoyaltyProgram })[];
};

// ============================================================================
// PHASE 3: ONLINE ORDERING INTEGRATION
// ============================================================================

export const ORDER_SOURCES = ["pos", "web", "mobile_app", "doordash", "ubereats", "grubhub", "phone", "catering"] as const;
export type OrderSource = typeof ORDER_SOURCES[number];

export const ONLINE_ORDER_STATUSES = ["received", "confirmed", "preparing", "ready", "picked_up", "delivered", "cancelled", "refunded"] as const;
export type OnlineOrderStatus = typeof ONLINE_ORDER_STATUSES[number];

export const onlineOrderSources = pgTable("online_order_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  sourceName: text("source_name").notNull(), // doordash, ubereats, website, etc.
  sourceType: text("source_type").notNull(), // marketplace, direct, phone
  apiKeyPrefix: text("api_key_prefix"), // For API credentials (actual stored in secrets)
  webhookUrl: text("webhook_url"),
  autoAccept: boolean("auto_accept").default(false),
  autoConfirmMinutes: integer("auto_confirm_minutes").default(5),
  defaultRvcId: varchar("default_rvc_id").references(() => rvcs.id),
  menuMappings: jsonb("menu_mappings"), // Maps external item IDs to local menu item IDs
  commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const onlineOrders = pgTable("online_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  sourceId: varchar("source_id").references(() => onlineOrderSources.id),
  externalOrderId: text("external_order_id").notNull(), // Order ID from the external system
  status: text("status").default("received"),
  orderType: text("order_type").default("pickup"), // pickup, delivery
  // Customer info
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  deliveryAddress: text("delivery_address"),
  deliveryInstructions: text("delivery_instructions"),
  // Timing
  scheduledTime: timestamp("scheduled_time"), // When customer wants it
  estimatedPrepMinutes: integer("estimated_prep_minutes"),
  confirmedAt: timestamp("confirmed_at"),
  readyAt: timestamp("ready_at"),
  pickedUpAt: timestamp("picked_up_at"),
  deliveredAt: timestamp("delivered_at"),
  // Financials
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  taxTotal: decimal("tax_total", { precision: 12, scale: 2 }).default("0"),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).default("0"),
  serviceFee: decimal("service_fee", { precision: 10, scale: 2 }).default("0"),
  tip: decimal("tip", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  commission: decimal("commission", { precision: 10, scale: 2 }).default("0"),
  // Items as JSON (may differ from local menu structure)
  items: jsonb("items").notNull(),
  // Link to POS check when injected
  checkId: varchar("check_id").references(() => checks.id),
  injectedAt: timestamp("injected_at"),
  injectedById: varchar("injected_by_id").references(() => employees.id),
  // Raw data for debugging
  rawPayload: jsonb("raw_payload"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOnlineOrderSourceSchema = createInsertSchema(onlineOrderSources).omit({ id: true, createdAt: true });
export const insertOnlineOrderSchema = createInsertSchema(onlineOrders).omit({ id: true, createdAt: true, updatedAt: true });

export type OnlineOrderSource = typeof onlineOrderSources.$inferSelect;
export type InsertOnlineOrderSource = z.infer<typeof insertOnlineOrderSourceSchema>;
export type OnlineOrder = typeof onlineOrders.$inferSelect;
export type InsertOnlineOrder = z.infer<typeof insertOnlineOrderSchema>;

// ============================================================================
// PHASE 3: INVENTORY MANAGEMENT
// ============================================================================

export const INVENTORY_UNIT_TYPES = ["each", "oz", "lb", "kg", "g", "ml", "l", "gal", "qt", "pt", "cup", "tbsp", "tsp"] as const;
export type InventoryUnitType = typeof INVENTORY_UNIT_TYPES[number];

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id), // Link to source menu item if imported
  name: text("name").notNull(),
  sku: text("sku"),
  category: text("category"),
  unitType: text("unit_type").default("each"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 4 }),
  parLevel: decimal("par_level", { precision: 10, scale: 2 }), // Ideal stock level
  reorderPoint: decimal("reorder_point", { precision: 10, scale: 2 }), // When to reorder
  reorderQuantity: decimal("reorder_quantity", { precision: 10, scale: 2 }),
  vendorId: varchar("vendor_id"),
  vendorSku: text("vendor_sku"),
  shelfLifeDays: integer("shelf_life_days"),
  storageLocation: text("storage_location"),
  trackInventory: boolean("track_inventory").default(true),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const inventoryStock = pgTable("inventory_stock", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: varchar("inventory_item_id").notNull().references(() => inventoryItems.id),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  currentQuantity: decimal("current_quantity", { precision: 12, scale: 4 }).default("0"),
  lastCountDate: text("last_count_date"),
  lastCountQuantity: decimal("last_count_quantity", { precision: 12, scale: 4 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const INVENTORY_TRANSACTION_TYPES = ["receive", "sale", "waste", "transfer", "adjustment", "count"] as const;
export type InventoryTransactionType = typeof INVENTORY_TRANSACTION_TYPES[number];

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: varchar("inventory_item_id").notNull().references(() => inventoryItems.id),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  transactionType: text("transaction_type").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(), // Positive for add, negative for remove
  quantityBefore: decimal("quantity_before", { precision: 12, scale: 4 }),
  quantityAfter: decimal("quantity_after", { precision: 12, scale: 4 }),
  unitCost: decimal("unit_cost", { precision: 10, scale: 4 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  businessDate: text("business_date"),
  checkId: varchar("check_id").references(() => checks.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  reason: text("reason"),
  referenceNumber: text("reference_number"), // PO number, invoice number, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Recipe linking (menu item to ingredients)
export const recipes = pgTable("recipes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  inventoryItemId: varchar("inventory_item_id").notNull().references(() => inventoryItems.id),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(), // Amount used per menu item
  unitType: text("unit_type"),
  wastePercent: decimal("waste_percent", { precision: 5, scale: 2 }).default("0"), // Account for prep waste
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true });
export const insertInventoryStockSchema = createInsertSchema(inventoryStock).omit({ id: true, updatedAt: true });
export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions).omit({ id: true, createdAt: true });
export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true });

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryStock = typeof inventoryStock.$inferSelect;
export type InsertInventoryStock = z.infer<typeof insertInventoryStockSchema>;
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;

// ============================================================================
// PHASE 3: LABOR FORECASTING
// ============================================================================

export const salesForecasts = pgTable("sales_forecasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  forecastDate: text("forecast_date").notNull(), // YYYY-MM-DD
  dayOfWeek: integer("day_of_week"), // 0-6
  // Hourly projections
  hourlyProjections: jsonb("hourly_projections"), // { "11": 500, "12": 1200, ... }
  projectedSales: decimal("projected_sales", { precision: 12, scale: 2 }),
  projectedGuests: integer("projected_guests"),
  projectedChecks: integer("projected_checks"),
  // Actual values (filled after day completes)
  actualSales: decimal("actual_sales", { precision: 12, scale: 2 }),
  actualGuests: integer("actual_guests"),
  actualChecks: integer("actual_checks"),
  // Model info
  modelVersion: text("model_version"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const laborForecasts = pgTable("labor_forecasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  forecastDate: text("forecast_date").notNull(),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  // Hourly labor needs
  hourlyNeeds: jsonb("hourly_needs"), // { "11": 2, "12": 4, ... } (employees needed per hour)
  totalHoursNeeded: decimal("total_hours_needed", { precision: 8, scale: 2 }),
  projectedLaborCost: decimal("projected_labor_cost", { precision: 12, scale: 2 }),
  targetLaborPercent: decimal("target_labor_percent", { precision: 5, scale: 2 }).default("25"),
  // Actual values
  actualHoursWorked: decimal("actual_hours_worked", { precision: 8, scale: 2 }),
  actualLaborCost: decimal("actual_labor_cost", { precision: 12, scale: 2 }),
  actualLaborPercent: decimal("actual_labor_percent", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSalesForecastSchema = createInsertSchema(salesForecasts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLaborForecastSchema = createInsertSchema(laborForecasts).omit({ id: true, createdAt: true, updatedAt: true });

export type SalesForecast = typeof salesForecasts.$inferSelect;
export type InsertSalesForecast = z.infer<typeof insertSalesForecastSchema>;
export type LaborForecast = typeof laborForecasts.$inferSelect;
export type InsertLaborForecast = z.infer<typeof insertLaborForecastSchema>;

// ============================================================================
// QUICK WIN: MANAGER ALERTS
// ============================================================================

export const ALERT_TYPES = ["void", "discount", "refund", "overtime", "exception", "hardware", "inventory", "security", "cash_variance"] as const;
export type AlertType = typeof ALERT_TYPES[number];

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = typeof ALERT_SEVERITIES[number];

export const managerAlerts = pgTable("manager_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  alertType: text("alert_type").notNull(),
  severity: text("severity").default("warning"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  // Context
  employeeId: varchar("employee_id").references(() => employees.id),
  checkId: varchar("check_id").references(() => checks.id),
  targetType: text("target_type"),
  targetId: varchar("target_id"),
  metadata: jsonb("metadata"), // Additional context
  // Status
  read: boolean("read").default(false),
  readAt: timestamp("read_at"),
  readById: varchar("read_by_id").references(() => employees.id),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedById: varchar("acknowledged_by_id").references(() => employees.id),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertSubscriptions = pgTable("alert_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  propertyId: varchar("property_id").references(() => properties.id),
  alertType: text("alert_type").notNull(),
  severity: text("severity"), // null = all severities
  notifyEmail: boolean("notify_email").default(false),
  notifySms: boolean("notify_sms").default(false),
  notifyPush: boolean("notify_push").default(true),
  active: boolean("active").default(true),
});

export const insertManagerAlertSchema = createInsertSchema(managerAlerts).omit({ id: true, createdAt: true });
export const insertAlertSubscriptionSchema = createInsertSchema(alertSubscriptions).omit({ id: true });

export type ManagerAlert = typeof managerAlerts.$inferSelect;
export type InsertManagerAlert = z.infer<typeof insertManagerAlertSchema>;
export type AlertSubscription = typeof alertSubscriptions.$inferSelect;
export type InsertAlertSubscription = z.infer<typeof insertAlertSubscriptionSchema>;

// ============================================================================
// QUICK WIN: PREP COUNTDOWN / ITEM AVAILABILITY
// ============================================================================

export const itemAvailability = pgTable("item_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  businessDate: text("business_date").notNull(),
  // Quantity tracking
  initialQuantity: integer("initial_quantity"), // Set at start of day
  currentQuantity: integer("current_quantity"),
  soldQuantity: integer("sold_quantity").default(0),
  // Status
  isAvailable: boolean("is_available").default(true),
  is86ed: boolean("is_86ed").default(false), // Item has been 86'd (out of stock)
  eightySixedAt: timestamp("eighty_sixed_at"),
  eightySixedById: varchar("eighty_sixed_by_id").references(() => employees.id),
  // Alerts
  lowStockThreshold: integer("low_stock_threshold").default(5),
  alertSent: boolean("alert_sent").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const prepItems = pgTable("prep_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  category: text("category"),
  parLevel: integer("par_level").notNull(),
  currentLevel: integer("current_level").default(0),
  unit: text("unit").default("each"),
  shelfLifeHours: integer("shelf_life_hours"),
  prepInstructions: text("prep_instructions"),
  // Linked menu items that consume this prep item
  menuItemIds: text("menu_item_ids").array(),
  consumptionPerItem: decimal("consumption_per_item", { precision: 5, scale: 2 }).default("1"),
  // Status
  lastPrepAt: timestamp("last_prep_at"),
  lastPrepById: varchar("last_prep_by_id").references(() => employees.id),
  lastPrepQuantity: integer("last_prep_quantity"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertItemAvailabilitySchema = createInsertSchema(itemAvailability).omit({ id: true, updatedAt: true });
export const insertPrepItemSchema = createInsertSchema(prepItems).omit({ id: true, createdAt: true });

export type ItemAvailability = typeof itemAvailability.$inferSelect;
export type InsertItemAvailability = z.infer<typeof insertItemAvailabilitySchema>;
export type PrepItem = typeof prepItems.$inferSelect;
export type InsertPrepItem = z.infer<typeof insertPrepItemSchema>;
