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

export const employeesRelations = relations(employees, ({ one }) => ({
  role: one(roles, { fields: [employees.roleId], references: [roles.id] }),
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
  active: boolean("active").default(true),
});

// Print Classes (logical routing category)
export const printClasses = pgTable("print_classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
});

// Order Devices (routing targets)
export const orderDevices = pgTable("order_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'printer', 'kds'
  ipAddress: text("ip_address"),
  active: boolean("active").default(true),
});

// Print Class to Order Device routing
export const printClassRouting = pgTable("print_class_routing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  printClassId: varchar("print_class_id").notNull().references(() => printClasses.id),
  orderDeviceId: varchar("order_device_id").notNull().references(() => orderDevices.id),
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
});

export const modifiers = pgTable("modifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modifierGroupId: varchar("modifier_group_id").notNull().references(() => modifierGroups.id),
  name: text("name").notNull(),
  priceDelta: decimal("price_delta", { precision: 10, scale: 2 }).default("0"),
  isDefault: boolean("is_default").default(false),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

// Menu Item to Modifier Group linkage
export const menuItemModifierGroups = pgTable("menu_item_modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  modifierGroupId: varchar("modifier_group_id").notNull().references(() => modifierGroups.id),
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
  status: text("status").notNull().default("draft"), // 'draft', 'active', 'bumped'
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
export const insertSluSchema = createInsertSchema(slus).omit({ id: true });
export const insertTaxGroupSchema = createInsertSchema(taxGroups).omit({ id: true });
export const insertPrintClassSchema = createInsertSchema(printClasses).omit({ id: true });
export const insertOrderDeviceSchema = createInsertSchema(orderDevices).omit({ id: true });
export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true });
export const insertModifierGroupSchema = createInsertSchema(modifierGroups).omit({ id: true });
export const insertModifierSchema = createInsertSchema(modifiers).omit({ id: true });
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
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Slu = typeof slus.$inferSelect;
export type InsertSlu = z.infer<typeof insertSluSchema>;
export type TaxGroup = typeof taxGroups.$inferSelect;
export type InsertTaxGroup = z.infer<typeof insertTaxGroupSchema>;
export type PrintClass = typeof printClasses.$inferSelect;
export type InsertPrintClass = z.infer<typeof insertPrintClassSchema>;
export type OrderDevice = typeof orderDevices.$inferSelect;
export type InsertOrderDevice = z.infer<typeof insertOrderDeviceSchema>;
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type InsertModifierGroup = z.infer<typeof insertModifierGroupSchema>;
export type Modifier = typeof modifiers.$inferSelect;
export type InsertModifier = z.infer<typeof insertModifierSchema>;
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
