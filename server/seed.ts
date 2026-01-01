import { db } from "./db";
import {
  enterprises, properties, rvcs, roles, privileges, rolePrivileges,
  employees, slus, menuItems, menuItemSlus, taxGroups, printClasses,
  modifierGroups, modifiers, menuItemModifierGroups, tenders, discounts
} from "@shared/schema";
import { randomUUID } from "crypto";

async function seed() {
  console.log("Seeding database...");

  // Enterprise
  const [enterprise] = await db.insert(enterprises).values({
    id: randomUUID(),
    name: "Demo Restaurant Group",
    code: "DRG",
    active: true,
  }).returning();
  console.log("Created enterprise:", enterprise.name);

  // Property
  const [property] = await db.insert(properties).values({
    id: randomUUID(),
    enterpriseId: enterprise.id,
    name: "Main Street Location",
    code: "MSL",
    address: "123 Main St, City, ST 12345",
    timezone: "America/New_York",
    active: true,
  }).returning();
  console.log("Created property:", property.name);

  // RVC (Revenue Center)
  const [rvc] = await db.insert(rvcs).values({
    id: randomUUID(),
    propertyId: property.id,
    name: "Main Dining",
    code: "MD",
    orderTypeDefault: "dine_in",
    active: true,
  }).returning();
  console.log("Created RVC:", rvc.name);

  // Create privileges
  const privilegeData = [
    // POS privileges
    { code: "fast_transaction", name: "Fast Transaction Mode", domain: "pos" },
    { code: "send_to_kitchen", name: "Send Orders to Kitchen", domain: "pos" },
    { code: "void_unsent", name: "Void Unsent Items", domain: "pos" },
    { code: "void_sent", name: "Void Sent Items", domain: "pos" },
    { code: "apply_discount", name: "Apply Discounts", domain: "pos" },
    { code: "admin_access", name: "Admin Access", domain: "admin" },
    { code: "kds_access", name: "KDS Access", domain: "pos" },
    { code: "manager_approval", name: "Manager Approval", domain: "manager" },
    { code: "close_check", name: "Close Check", domain: "pos" },
    { code: "reopen_check", name: "Reopen Closed Check", domain: "pos" },
    // Refund privileges
    { code: "refund", name: "Process Refunds", domain: "pos" },
    { code: "approve_refund", name: "Approve Refunds", domain: "manager" },
    // Time & Attendance privileges
    { code: "clock_in_out", name: "Clock In/Out", domain: "time_attendance" },
    { code: "view_my_timecard", name: "View My Timecard", domain: "time_attendance" },
    { code: "view_my_schedule", name: "View My Schedule", domain: "time_attendance" },
    { code: "request_time_off", name: "Request Time Off", domain: "time_attendance" },
    { code: "request_shift_cover", name: "Request Shift Cover", domain: "time_attendance" },
    { code: "offer_shift_cover", name: "Offer to Cover Shift", domain: "time_attendance" },
    { code: "manage_availability", name: "Manage Availability", domain: "time_attendance" },
    { code: "timecard_view_all", name: "View All Timecards", domain: "time_attendance" },
    { code: "timecard_edit", name: "Edit Timecards", domain: "time_attendance" },
    { code: "timecard_approve", name: "Approve Timecards", domain: "time_attendance" },
    { code: "pay_period_lock", name: "Lock Pay Periods", domain: "payroll" },
    { code: "pay_period_unlock", name: "Unlock Pay Periods", domain: "payroll" },
    { code: "payroll_export", name: "Export Payroll", domain: "payroll" },
    { code: "exception_manage", name: "Manage Timecard Exceptions", domain: "time_attendance" },
    // Scheduling privileges
    { code: "schedule_view", name: "View Schedule", domain: "scheduling" },
    { code: "schedule_build", name: "Build Schedule", domain: "scheduling" },
    { code: "schedule_publish", name: "Publish Schedule", domain: "scheduling" },
    { code: "schedule_copy", name: "Copy Schedule", domain: "scheduling" },
    { code: "shift_cover_approve", name: "Approve Shift Cover Requests", domain: "scheduling" },
    { code: "time_off_approve", name: "Approve Time Off Requests", domain: "scheduling" },
    { code: "availability_manage", name: "Manage Employee Availability", domain: "scheduling" },
    // Tip pooling privileges
    { code: "tip_pool_view", name: "View Tip Pool", domain: "tips" },
    { code: "tip_pool_manage", name: "Manage Tip Pool Policies", domain: "tips" },
    { code: "tip_pool_settle", name: "Run Tip Pool Settlement", domain: "tips" },
    // Labor reporting privileges
    { code: "labor_report_view", name: "View Labor Reports", domain: "reporting" },
    { code: "labor_vs_sales", name: "View Labor vs Sales", domain: "reporting" },
  ];
  for (const p of privilegeData) {
    await db.insert(privileges).values({ id: randomUUID(), ...p }).onConflictDoNothing();
  }

  // Roles
  const [managerRole] = await db.insert(roles).values({
    id: randomUUID(),
    propertyId: property.id,
    name: "Manager",
    code: "MGR",
    active: true,
  }).returning();

  const [serverRole] = await db.insert(roles).values({
    id: randomUUID(),
    propertyId: property.id,
    name: "Server",
    code: "SVR",
    active: true,
  }).returning();
  console.log("Created roles: Manager, Server");

  // Role privileges
  const allPrivileges = await db.select().from(privileges);
  for (const priv of allPrivileges) {
    await db.insert(rolePrivileges).values({ id: randomUUID(), roleId: managerRole.id, privilegeCode: priv.code });
    if (["fast_transaction", "send_to_kitchen", "void_unsent", "close_check"].includes(priv.code)) {
      await db.insert(rolePrivileges).values({ id: randomUUID(), roleId: serverRole.id, privilegeCode: priv.code });
    }
  }

  // Employees
  const [manager] = await db.insert(employees).values({
    id: randomUUID(),
    propertyId: property.id,
    roleId: managerRole.id,
    firstName: "John",
    lastName: "Manager",
    employeeNumber: "001",
    pinHash: "1234",
    active: true,
  }).returning();

  const [server] = await db.insert(employees).values({
    id: randomUUID(),
    propertyId: property.id,
    roleId: serverRole.id,
    firstName: "Jane",
    lastName: "Server",
    employeeNumber: "002",
    pinHash: "5678",
    active: true,
  }).returning();
  console.log("Created employees: John Manager (PIN: 1234), Jane Server (PIN: 5678)");

  // Tax Groups
  const [taxGroup] = await db.insert(taxGroups).values({
    id: randomUUID(),
    name: "Standard Tax",
    rate: "0.0825",
    active: true,
  }).returning();

  // Print Classes
  const [hotFood] = await db.insert(printClasses).values({
    id: randomUUID(),
    name: "Hot Food",
    code: "HOT",
  }).returning();

  const [coldFood] = await db.insert(printClasses).values({
    id: randomUUID(),
    name: "Cold Food",
    code: "COLD",
  }).returning();

  const [beverage] = await db.insert(printClasses).values({
    id: randomUUID(),
    name: "Beverages",
    code: "BEV",
  }).returning();

  // SLUs (Screen Lookup Categories)
  const sluData = [
    { name: "Appetizers", buttonLabel: "APPS", color: "#f97316", displayOrder: 1 },
    { name: "Entrees", buttonLabel: "ENTREES", color: "#ef4444", displayOrder: 2 },
    { name: "Sides", buttonLabel: "SIDES", color: "#eab308", displayOrder: 3 },
    { name: "Desserts", buttonLabel: "DESSERTS", color: "#ec4899", displayOrder: 4 },
    { name: "Beverages", buttonLabel: "DRINKS", color: "#3b82f6", displayOrder: 5 },
  ];

  const sluRecords: any[] = [];
  for (const s of sluData) {
    const [slu] = await db.insert(slus).values({
      id: randomUUID(),
      ...s,
      active: true,
    }).returning();
    sluRecords.push(slu);
  }
  console.log("Created SLUs:", sluRecords.map(s => s.name).join(", "));

  // Menu Items
  const menuData = [
    { name: "Mozzarella Sticks", price: "9.99", slu: 0, printClass: hotFood.id },
    { name: "Wings (6pc)", price: "12.99", slu: 0, printClass: hotFood.id },
    { name: "Loaded Nachos", price: "11.99", slu: 0, printClass: hotFood.id },
    { name: "Bruschetta", price: "8.99", slu: 0, printClass: coldFood.id },
    { name: "Classic Burger", price: "14.99", slu: 1, printClass: hotFood.id },
    { name: "Grilled Chicken", price: "16.99", slu: 1, printClass: hotFood.id },
    { name: "Fish and Chips", price: "15.99", slu: 1, printClass: hotFood.id },
    { name: "Caesar Salad", price: "11.99", slu: 1, printClass: coldFood.id },
    { name: "Pasta Primavera", price: "13.99", slu: 1, printClass: hotFood.id },
    { name: "Ribeye Steak", price: "28.99", slu: 1, printClass: hotFood.id },
    { name: "French Fries", price: "4.99", slu: 2, printClass: hotFood.id },
    { name: "Onion Rings", price: "5.99", slu: 2, printClass: hotFood.id },
    { name: "Side Salad", price: "4.49", slu: 2, printClass: coldFood.id },
    { name: "Mashed Potatoes", price: "4.99", slu: 2, printClass: hotFood.id },
    { name: "Chocolate Cake", price: "7.99", slu: 3, printClass: coldFood.id },
    { name: "Cheesecake", price: "8.99", slu: 3, printClass: coldFood.id },
    { name: "Ice Cream", price: "5.99", slu: 3, printClass: coldFood.id },
    { name: "Soft Drink", price: "2.99", slu: 4, printClass: beverage.id },
    { name: "Coffee", price: "3.49", slu: 4, printClass: beverage.id },
    { name: "Iced Tea", price: "2.99", slu: 4, printClass: beverage.id },
    { name: "Lemonade", price: "3.49", slu: 4, printClass: beverage.id },
  ];

  for (const item of menuData) {
    const [menuItem] = await db.insert(menuItems).values({
      id: randomUUID(),
      name: item.name,
      price: item.price,
      taxGroupId: taxGroup.id,
      printClassId: item.printClass,
      active: true,
    }).returning();

    await db.insert(menuItemSlus).values({
      id: randomUUID(),
      menuItemId: menuItem.id,
      sluId: sluRecords[item.slu].id,
      displayOrder: 0,
    });
  }
  console.log("Created", menuData.length, "menu items");

  // Modifier Groups
  const [tempGroup] = await db.insert(modifierGroups).values({
    id: randomUUID(),
    name: "Temperature",
    minSelect: 1,
    maxSelect: 1,
    required: true,
    displayOrder: 1,
  }).returning();

  const temps = ["Rare", "Medium Rare", "Medium", "Medium Well", "Well Done"];
  for (let i = 0; i < temps.length; i++) {
    await db.insert(modifiers).values({
      id: randomUUID(),
      modifierGroupId: tempGroup.id,
      name: temps[i],
      priceDelta: "0.00",
      displayOrder: i + 1,
      active: true,
    });
  }

  const [sizeGroup] = await db.insert(modifierGroups).values({
    id: randomUUID(),
    name: "Size",
    minSelect: 1,
    maxSelect: 1,
    required: true,
    displayOrder: 2,
  }).returning();

  const sizes = [
    { name: "Small", price: "0.00" },
    { name: "Medium", price: "1.00" },
    { name: "Large", price: "2.00" },
  ];
  for (let i = 0; i < sizes.length; i++) {
    await db.insert(modifiers).values({
      id: randomUUID(),
      modifierGroupId: sizeGroup.id,
      name: sizes[i].name,
      priceDelta: sizes[i].price,
      displayOrder: i + 1,
      active: true,
    });
  }

  const [addonsGroup] = await db.insert(modifierGroups).values({
    id: randomUUID(),
    name: "Add-ons",
    minSelect: 0,
    maxSelect: 5,
    required: false,
    displayOrder: 3,
  }).returning();

  const addons = [
    { name: "Extra Cheese", price: "1.50" },
    { name: "Bacon", price: "2.00" },
    { name: "Avocado", price: "1.99" },
    { name: "Jalapenos", price: "0.75" },
  ];
  for (let i = 0; i < addons.length; i++) {
    await db.insert(modifiers).values({
      id: randomUUID(),
      modifierGroupId: addonsGroup.id,
      name: addons[i].name,
      priceDelta: addons[i].price,
      displayOrder: i + 1,
      active: true,
    });
  }
  console.log("Created modifier groups: Temperature, Size, Add-ons");

  // Tenders
  const tenderData = [
    { name: "Cash", code: "CASH", type: "cash" },
    { name: "Credit Card", code: "CC", type: "credit" },
    { name: "Debit Card", code: "DC", type: "debit" },
    { name: "Gift Card", code: "GC", type: "gift" },
  ];
  for (const t of tenderData) {
    await db.insert(tenders).values({
      id: randomUUID(),
      name: t.name,
      code: t.code,
      type: t.type,
      active: true,
    });
  }
  console.log("Created tenders: Cash, Credit Card, Debit Card, Gift Card");

  // Discounts
  const discountData = [
    { name: "10% Off", code: "10OFF", type: "percent", value: "10.00" },
    { name: "20% Off", code: "20OFF", type: "percent", value: "20.00" },
    { name: "$5 Off", code: "5OFF", type: "amount", value: "5.00" },
    { name: "Employee Discount", code: "EMP50", type: "percent", value: "50.00" },
  ];
  for (const d of discountData) {
    await db.insert(discounts).values({
      id: randomUUID(),
      name: d.name,
      code: d.code,
      type: d.type,
      value: d.value,
      active: true,
    });
  }
  console.log("Created discounts");

  console.log("\n=== Seed Complete ===");
  console.log("Login Credentials:");
  console.log("  Manager: PIN 1234");
  console.log("  Server:  PIN 5678");
  console.log("\nNavigate to /pos to start using the POS system");
  console.log("Navigate to /kds for the Kitchen Display System");
  console.log("Navigate to /admin for administration\n");

  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
