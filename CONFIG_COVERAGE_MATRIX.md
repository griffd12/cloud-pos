# Config Coverage Matrix

**Cloud POS 3.0 — EMC Configuration Audit**
*Generated: 2026-02-20*

This document audits every EMC (Enterprise Management Console) configuration page and its associated database-backed settings. For each setting, it identifies whether the runtime behavior is **config-driven** (reads from the database at runtime) or **hardcoded** (relies on string comparisons, fixed constants, or missing configuration columns).

**Legend:**
- ✅ Config-driven — Runtime reads the DB column to determine behavior
- ❌ Hardcoded — Behavior determined by string checks, constants, or absent config
- ⚠️ Dead Config — Column exists in schema but is NOT read at runtime
- 🔧 Missing Config — Behavior exists but has no corresponding DB column

---

## Table of Contents

1. [Enterprise Configuration](#1-enterprise-configuration)
2. [Property Configuration](#2-property-configuration)
3. [Revenue Center (RVC) Configuration](#3-revenue-center-rvc-configuration)
4. [Workstations](#4-workstations)
5. [Tenders](#5-tenders)
6. [Menu Items](#6-menu-items)
7. [Modifier Groups & Modifiers](#7-modifier-groups--modifiers)
8. [Discounts](#8-discounts)
9. [Service Charges](#9-service-charges)
10. [Tax Groups](#10-tax-groups)
11. [SLUs (Screen Lookup Units)](#11-slus-screen-lookup-units)
12. [Major Groups](#12-major-groups)
13. [Family Groups](#13-family-groups)
14. [Printers](#14-printers)
15. [Print Classes](#15-print-classes)
16. [Print Class Routing](#16-print-class-routing)
17. [Order Devices](#17-order-devices)
18. [Workstation Order Devices](#18-workstation-order-devices)
19. [KDS Devices](#19-kds-devices)
20. [Print Agents](#20-print-agents)
21. [Terminal Devices (EMV)](#21-terminal-devices-emv)
22. [Service Hosts](#22-service-hosts)
23. [Employees](#23-employees)
24. [Roles & Privileges](#24-roles--privileges)
25. [Job Codes](#25-job-codes)
26. [Overtime Rules](#26-overtime-rules)
27. [Break Rules](#27-break-rules)
28. [Minor Labor Rules](#28-minor-labor-rules)
29. [Tip Pool Policies & Tip Rules](#29-tip-pool-policies--tip-rules)
30. [Payment Processors](#30-payment-processors)
31. [Gift Cards](#31-gift-cards)
32. [Loyalty Programs](#32-loyalty-programs)
33. [Online Order Sources](#33-online-order-sources)
34. [Inventory](#34-inventory)
35. [Forecasting](#35-forecasting)
36. [Manager Alerts](#36-manager-alerts)
37. [Item Availability (86 Board)](#37-item-availability-86-board)
38. [Descriptor Sets (Receipt Headers/Trailers)](#38-descriptor-sets-receipt-headerstrailers)
39. [POS Layouts](#39-pos-layouts)
40. [Pizza Builder Configuration](#40-pizza-builder-configuration)
41. [CAL Packages (Client Application Loader)](#41-cal-packages-client-application-loader)
42. [Config Overrides (Inheritance)](#42-config-overrides-inheritance)
43. [Fiscal Close / Business Date](#43-fiscal-close--business-date)
44. [Cash Management](#44-cash-management)
45. [Scheduling & Shifts](#45-scheduling--shifts)
46. [Delivery Platform Integrations](#46-delivery-platform-integrations)
47. [Stress Testing](#47-stress-testing)

---

## Summary Statistics

| Category | Total Settings | ✅ Config-Driven | ❌ Hardcoded | ⚠️ Dead Config | 🔧 Missing Config |
|:---|:---:|:---:|:---:|:---:|:---:|
| Hierarchy (Ent/Prop/RVC) | 20 | 18 | 0 | 0 | 5 |
| Workstations | 32 | 28 | 2 | 0 | 2 |
| Tenders | 8 | 4 | 4 | 0 | 4 |
| Menu/Modifiers/SLU | 24 | 18 | 3 | 3 | 5 |
| Discounts/Service Charges/Tax | 18 | 15 | 1 | 2 | 3 |
| Devices/Printing | 42 | 20 | 5 | 12 | 5 |
| Labor/Scheduling | 28 | 25 | 1 | 0 | 2 |
| Enterprise Features | 30 | 28 | 0 | 0 | 2 |
| Other (Layouts/Descriptors/etc.) | 12 | 10 | 1 | 0 | 1 |
| **TOTALS** | **214** | **166 (78%)** | **17 (8%)** | **17 (8%)** | **29 (14%)** |

---

## 1. Enterprise Configuration

**EMC Page:** Enterprise > General
**Table:** `enterprises`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | POS status bar display | ✅ | Displayed on POS header |
| Code | `code` | Multi-tenant scoping | ✅ | Used in API isolation |
| Active | `active` | Login filtering | ✅ | Inactive blocks all access |
| Enterprise ID | `id` | `getEnforcedEnterpriseId()` | ✅ | Core data isolation key |

---

## 2. Property Configuration

**EMC Page:** Property > General
**Table:** `properties`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Receipt printing fallback | ✅ | Used if no descriptor set |
| Code | `code` | API filtering | ✅ | |
| Address | `address` | Receipt printing fallback | ✅ | Used if no descriptor set |
| Timezone | `timezone` | `businessDate.ts` | ✅ | Business date calculation |
| Business Date Rollover Time | `businessDateRolloverTime` | `businessDate.ts` | ✅ | Determines day boundary |
| Business Date Mode | `businessDateMode` | `fiscalScheduler.ts` | ✅ | Auto vs manual rollover |
| Current Business Date | `currentBusinessDate` | Reporting, check creation | ✅ | Active operating date |
| Sign-In Logo URL | `signInLogoUrl` | POS login screen | ✅ | Branding on terminal |
| Auto Clock-Out Enabled | `autoClockOutEnabled` | Fiscal close routine | ✅ | Clocks out all on day-end |
| Active | `active` | Login filtering | ✅ | |

### 🔧 Missing Property Config

| Missing Setting | Current Behavior | Simphony Equivalent |
|:---|:---|:---|
| Receipt Auto-Print on Close | Always prints on check close | `AutoPrintCheckOnClose` |
| Number of Receipt Copies | Always 1 | `ReceiptCopies` |
| Guest Count Required | Always optional | `RequireGuestCount` |
| Default Tip Percentage Options | No config, hardcoded in UI | `TipPercentages` |

---

## 3. Revenue Center (RVC) Configuration

**EMC Page:** Property > Revenue Centers
**Table:** `rvcs`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | POS display, receipts | ✅ | |
| Code | `code` | API filtering | ✅ | |
| Fast Transaction Default | `fastTransactionDefault` | POS ring-in mode | ✅ | Quick vs standard service |
| Default Order Type | `defaultOrderType` | Check creation | ✅ | Dine-in/Takeout/etc. |
| Dynamic Order Mode | `dynamicOrderMode` | KDS routing engine | ✅ | Live order display |
| DOM Send Mode | `domSendMode` | Item fire timing | ✅ | Immediate vs delayed |
| Conversational Ordering | `conversationalOrderingEnabled` | POS modifier flow | ✅ | |
| Active | `active` | RVC selection | ✅ | |

### 🔧 Missing RVC Config

| Missing Setting | Current Behavior | Simphony Equivalent |
|:---|:---|:---|
| Kitchen Print Always On | Always sends to KDS on fire | `AutoFireToKitchen` |
| Print Voids to Kitchen | Handled at printer level only | `SendVoidsToKDS` (RVC-level) |

---

## 4. Workstations

**EMC Page:** Property > Workstations
**Table:** `workstations`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Status display | ✅ | |
| Device Type | `deviceType` | UI mode selection | ✅ | |
| Default Order Type | `defaultOrderType` | Check creation | ✅ | |
| Fast Transaction | `fastTransactionEnabled` | Ring-in mode | ✅ | |
| Require Begin Check | `requireBeginCheck` | POS flow control | ✅ | |
| Allow Pickup Check | `allowPickupCheck` | Check transfer | ✅ | |
| Allow Reopen Closed | `allowReopenClosedChecks` | Check lifecycle | ✅ | |
| Allow Offline | `allowOfflineOperation` | Sync config | ✅ | |
| Manager Approval Device | `managerApprovalDevice` | Manager overlay routing | ✅ | |
| Clock-In Allowed | `clockInAllowed` | Time clock access | ✅ | |
| Default Receipt Printer | `defaultReceiptPrinterId` | Print job routing | ✅ | |
| Backup Receipt Printer | `backupReceiptPrinterId` | Failover routing | ✅ | |
| Report Printer | `reportPrinterId` | Report output | ✅ | |
| Void Printer | `voidPrinterId` | Void ticket routing | ✅ | |
| Default Order Device | `defaultOrderDeviceId` | KDS primary target | ✅ | |
| Default KDS Expo | `defaultKdsExpoId` | Expo station routing | ✅ | |
| IP Address | `ipAddress` | Heartbeat tracking | ✅ | |
| Service Host URL | `serviceHostUrl` | CAL/hybrid connection | ✅ | |
| Auto Logout Minutes | `autoLogoutMinutes` | Inactivity timer | ✅ | |
| Font Scale | `fontScale` | UI zoom level | ✅ | |
| Cash Drawer Enabled | `cashDrawerEnabled` | Drawer kick gating | ✅ | |
| Cash Drawer Printer | `cashDrawerPrinterId` | Pulse target | ✅ | |
| Cash Drawer Kick Pin | `cashDrawerKickPin` | ESC/POS pin selection | ✅ | |
| Cash Drawer Pulse Duration | `cashDrawerPulseDuration` | Pulse timing | ✅ | Clamped 50-500ms (hardcoded bounds) |
| Cash Drawer Auto Open on Cash | `cashDrawerAutoOpenOnCash` | Auto-kick on cash payment | ✅ | |
| Cash Drawer Auto Open on Drop | `cashDrawerAutoOpenOnDrop` | Auto-kick on cash drop | ✅ | |
| COM Port Settings | `comPort`, `comBaudRate`, etc. | Serial printer passthrough | ✅ | |
| RVC Assignment | `rvcId` | POS context selection | ✅ | |
| Check Locking | *(none)* | Always locks by workstationId | ❌ | No toggle to disable |
| RVC Fallback | *(none)* | Falls back to first RVC if null | ❌ | No "require RVC" config |

---

## 5. Tenders

**EMC Page:** Enterprise > Tenders
**Table:** `tenders`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Receipt, POS display | ✅ | Captured at sale time |
| Code | `code` | API identification | ✅ | |
| Type | `type` | Payment routing | ❌ | **String checks** (`"cash"`, `"credit"`, `"gift"`) drive ALL behavior |
| Payment Processor ID | `paymentProcessorId` | Gateway dispatch | ✅ | Routes to Stripe/Heartland/etc. |
| Is System | `isSystem` | Prevents deletion | ✅ | |
| Active | `active` | POS filter | ✅ | |
| Cash drawer kick | *(derived from type)* | `tender.type === "cash"` | ❌ | Should be `popDrawer` flag |
| Change due calculation | *(derived from type)* | `tender.type === "cash"` | ❌ | Should be `allowChangeDue` flag |
| Card entry routing | *(derived from type)* | `tender.type === "credit"` | ❌ | Should be `requiresCardEntry` flag |

### 🔧 Missing Tender Config (Critical)

| Missing Setting | Current Behavior | Simphony Equivalent |
|:---|:---|:---|
| `allowOverTender` | Allowed for all tenders | `Over Tender Allowed` |
| `popDrawer` | Only if `type === "cash"` | `Pop Cash Drawer` |
| `allowTips` | Hardcoded for card types | `Tip Allowed` |
| `printCheckOnPayment` | No per-tender receipt control | `Print Check on Payment` |
| `roundingMethod` | Standard decimal always | `Rounding Method` |
| `maxTenderAmount` | No limit | `Maximum Tender Amount` |

**Priority:** HIGH — Tender behavior is the most impactful hardcoded area. All operational logic keys off `tender.type` string instead of discrete boolean flags.

---

## 6. Menu Items

**EMC Page:** Enterprise > Menu Items
**Table:** `menuItems`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | POS grid, receipts, KDS | ✅ | |
| Short Name | `shortName` | Button label fallback | ✅ | |
| Price | `price` | Ring-in pricing | ✅ | |
| Tax Group | `taxGroupId` | Tax calculation | ✅ | |
| Print Class | `printClassId` | Kitchen routing | ✅ | |
| Major Group | `majorGroupId` | Reporting rollup | ✅ | |
| Family Group | `familyGroupId` | Reporting rollup | ✅ | |
| Menu Build Enabled | `menuBuildEnabled` | Pizza/combo builder | ✅ | |
| Active | `active` | POS filter | ✅ | |
| Color | `color` | *(should be button color)* | ⚠️ | Exists but POS grid uses theme colors |

### 🔧 Missing Menu Item Config

| Missing Setting | Current Behavior | Simphony Equivalent |
|:---|:---|:---|
| Allow Price Override | Privilege-only check | `Allow Price Override` per item |
| Allow Void | Privilege-only check | `Allow Void` per item |
| Require Reason on Void | No config | `Void Reason Required` |
| Max Quantity | No limit | `Maximum Quantity` |
| Open Price Item | No flag | `Open Price` |

---

## 7. Modifier Groups & Modifiers

**EMC Page:** Enterprise > Modifier Groups, Enterprise > Modifiers
**Tables:** `modifierGroups`, `modifiers`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Group Name | `modifierGroups.name` | Modifier modal header | ✅ | |
| Min Select | `modifierGroups.minSelect` | Validation enforcement | ✅ | |
| Max Select | `modifierGroups.maxSelect` | Validation enforcement | ✅ | |
| Required | `modifierGroups.required` | Forces modal open | ✅ | |
| Modifier Name | `modifiers.name` | POS display, receipts | ✅ | |
| Price Delta | `modifiers.priceDelta` | Price adjustment | ✅ | |
| Is Default | `modifiers.isDefault` | Pre-selection | ✅ | |

### 🔧 Missing Modifier Config

| Missing Setting | Current Behavior | Notes |
|:---|:---|:---|
| Server-side enforcement | Client-only validation | `min/maxSelect` only enforced in UI |

---

## 8. Discounts

**EMC Page:** Enterprise > Discounts
**Table:** `discounts`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Receipts, POS display | ✅ | |
| Code | `code` | *(lookup key)* | ⚠️ | Exists but most lookups use ID |
| Type | `type` | Percent vs amount calc | ✅ | |
| Value | `value` | Discount magnitude | ✅ | |
| Requires Manager Approval | `requiresManagerApproval` | Approval flow trigger | ✅ | |
| Active | `active` | POS filter | ✅ | |

### 🔧 Missing Discount Config

| Missing Setting | Current Behavior | Simphony Equivalent |
|:---|:---|:---|
| Stacking Rules | One per entity (hardcoded) | `Allow Multiple Discounts` |
| Applicable Order Types | Applies to all | `Order Type Filter` |
| Excluded Items | No exclusion config | `Exclusion Class` |

---

## 9. Service Charges

**EMC Page:** Enterprise > Service Charges
**Table:** `serviceCharges`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Receipts, POS display | ✅ | |
| Code | `code` | Identification | ✅ | |
| Type | `type` | Percent vs amount | ✅ | |
| Value | `value` | Charge magnitude | ✅ | |
| Auto Apply | `autoApply` | Automatic application | ✅ | |
| Is Taxable | `isTaxable` | Tax calculation | ✅ | |
| Tax Group | `taxGroupId` | Tax rate resolution | ✅ | |
| Revenue Category | `revenueCategory` | Revenue vs non-revenue | ✅ | |
| Order Types | `orderTypes` | *(client-side filter)* | ⚠️ | Exists but only filtered in POS query, not enforced server-side |
| Post to Tip Pool | `postToTipPool` | *(reporting flag)* | ✅ | Read but distribution engine incomplete |
| Tip Eligible | `tipEligible` | *(reporting flag)* | ✅ | Same as above |

### 🔧 Missing Service Charge Config

| Missing Setting | Current Behavior | Notes |
|:---|:---|:---|
| Auto-Apply Threshold | No party-size or amount threshold | Need `minGuestCount` or `minCheckAmount` |

---

## 10. Tax Groups

**EMC Page:** Enterprise > Tax Groups
**Table:** `taxGroups`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Admin display, reports | ✅ | |
| Rate | `rate` | Tax calculation engine | ✅ | Core formula input |
| Tax Mode | `taxMode` | Add-on vs inclusive | ✅ | Changes calculation formula |
| Active | `active` | Lookup filter | ✅ | |

### 🔧 Missing Tax Config

| Missing Setting | Current Behavior | Simphony Equivalent |
|:---|:---|:---|
| Tax Exempt Override | No check-level override | `Tax Exempt` flag on checks |

---

## 11. SLUs (Screen Lookup Units)

**EMC Page:** Enterprise > SLUs
**Table:** `slus`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Tab label | ✅ | |
| Button Label | `buttonLabel` | Short display name | ✅ | |
| Display Order | `displayOrder` | Tab sorting | ✅ | |
| Color | `color` | *(should be tab color)* | ⚠️ | Exists but POS tabs use theme colors |
| Active | `active` | POS filter | ✅ | |

---

## 12. Major Groups

**EMC Page:** Enterprise > Major Groups
**Table:** `majorGroups`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Report grouping | ✅ | |
| Display Order | `displayOrder` | *(admin only)* | ⚠️ | Not used in report sorting |

---

## 13. Family Groups

**EMC Page:** Enterprise > Family Groups
**Table:** `familyGroups`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Report sub-grouping | ✅ | |
| Major Group | `majorGroupId` | Hierarchy link | ✅ | |
| Display Order | `displayOrder` | *(admin only)* | ⚠️ | Not used in report sorting |

---

## 14. Printers

**EMC Page:** Property > Printers
**Table:** `printers`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Admin identification | ✅ | |
| Printer Type | `printerType` | Receipt vs kitchen filter | ✅ | |
| Connection Type | `connectionType` | Network vs serial routing | ✅ | |
| IP Address | `ipAddress` | TCP connection target | ✅ | |
| Port | `port` | TCP port (default 9100) | ✅ | |
| COM Port | `comPort` | Serial passthrough | ✅ | |
| Baud Rate | `baudRate` | Serial config | ✅ | |
| Character Width | `characterWidth` | ESC/POS line formatting | ✅ | Default 42 |
| Active | `active` | Lookup filter | ✅ | |
| Model | `model` | *(admin display only)* | ⚠️ | Not read for behavior |
| Driver Protocol | `driverProtocol` | *(admin display only)* | ⚠️ | Always ESC/POS |
| Auto Cut | `autoCut` | *(not read)* | ⚠️ | Cut command always sent |
| Print Logo | `printLogo` | *(not read)* | ⚠️ | Logo printing not implemented |
| Print Order Header | `printOrderHeader` | *(not read)* | ⚠️ | Always prints header |
| Print Order Footer | `printOrderFooter` | *(not read)* | ⚠️ | Always prints footer |
| Print Voids | `printVoids` | *(not read at print time)* | ⚠️ | Void tickets always print |
| Print Reprints | `printReprints` | *(not read)* | ⚠️ | Reprints always allowed |
| Retry Attempts | `retryAttempts` | *(not read)* | ⚠️ | Hardcoded retry logic |
| Failure Handling | `failureHandlingMode` | *(not read)* | ⚠️ | No failover logic |

### ❌ Hardcoded Printer Behaviors

| Behavior | Current Value | Notes |
|:---|:---|:---|
| Network timeout | 5000ms | Hardcoded in `printToNetworkPrinter` |
| ESC/POS commands | Fixed byte sequences | Init, bold, align, cut all hardcoded |
| Cut on every receipt | Always cuts | `autoCut` column ignored |

---

## 15. Print Classes

**EMC Page:** Enterprise > Print Classes
**Table:** `printClasses`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Admin display | ✅ | |
| Code | `code` | Identification | ✅ | |
| ID | `id` | Routing key (menuItem → printClass → orderDevice) | ✅ | Core routing linkage |

---

## 16. Print Class Routing

**EMC Page:** Enterprise > Print Class Routing
**Table:** `printClassRouting`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Print Class ID | `printClassId` | Routing lookup key | ✅ | |
| Order Device ID | `orderDeviceId` | Routing target | ✅ | |
| RVC ID | `rvcId` | RVC-level override | ✅ | Hierarchical: RVC → Property → Global |
| Property ID | `propertyId` | Property-level override | ✅ | |

---

## 17. Order Devices

**EMC Page:** Property > Order Devices
**Table:** `orderDevices`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Admin display | ✅ | |
| KDS Device ID | `kdsDeviceId` | Physical KDS target | ✅ | |
| Send On | `sendOn` | Fire timing (button vs dynamic) | ✅ | |
| Send Voids | `sendVoids` | *(not read)* | ⚠️ | Voids always sent to KDS |
| Send Reprints | `sendReprints` | *(not read)* | ⚠️ | |

---

## 18. Workstation Order Devices

**EMC Page:** Property > Workstations > Order Device Routing
**Table:** `workstationOrderDevices`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Workstation ID | `workstationId` | Intersection filter source | ✅ | |
| Order Device ID | `orderDeviceId` | Allowed device list | ✅ | |

Behavior: If entries exist, only listed devices receive orders. If empty, all routed devices are used (backward compatible).

---

## 19. KDS Devices

**EMC Page:** Property > KDS Devices
**Table:** `kdsDevices`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | KDS display header | ✅ | |
| Station Type | `stationType` | Ticket grouping/label | ✅ | Hot/Cold/Expo |
| Font Scale | `fontScale` | KDS UI zoom | ✅ | |
| New Order Sound | `newOrderSound` | Audio alert | ✅ | |
| New Order Blink Seconds | `newOrderBlinkSeconds` | Visual alert timing | ✅ | |
| Color Alert 1 Enabled | `colorAlert1Enabled` | Timer-based highlighting | ✅ | |
| Color Alert 1 Seconds | `colorAlert1Seconds` | Alert threshold | ✅ | |
| Color Alert 1 Color | `colorAlert1Color` | Alert color | ✅ | |
| Color Alerts 2-3 | *(same pattern)* | *(same pattern)* | ✅ | |
| Show Draft Items | `showDraftItems` | *(not read)* | ⚠️ | KDS shows all items |
| Show Sent Items Only | `showSentItemsOnly` | *(not read)* | ⚠️ | |
| Group By | `groupBy` | *(not read)* | ⚠️ | Hardcoded grouping |
| Show Timers | `showTimers` | *(not read)* | ⚠️ | Timers always shown |
| Auto Sort By | `autoSortBy` | *(not read)* | ⚠️ | Fixed sort order |
| Allow Bump | `allowBump` | *(not read)* | ⚠️ | Bump always allowed |
| Allow Recall | `allowRecall` | *(not read)* | ⚠️ | Recall always allowed |
| Allow Void Display | `allowVoidDisplay` | *(not read)* | ⚠️ | |

---

## 20. Print Agents

**EMC Page:** Property > Print Agents
**Table:** `printAgents`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| ID (Agent ID) | `id` | WebSocket routing key | ✅ | Maps to connected agent socket |
| Name | `name` | Admin display | ✅ | |
| Status | `status` | Connection tracking | ✅ | |

---

## 21. Terminal Devices (EMV)

**EMC Page:** Property > Terminal Devices
**Table:** `terminalDevices`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Model | `model` | *(admin display)* | ✅ | |
| Connection Type | `connectionType` | LAN vs Cloud routing | ✅ | |
| Network Address | `ipAddress` | TCP target for LAN | ✅ | |
| Port | `port` | TCP port | ✅ | |
| Capabilities | `capabilities` | *(admin display)* | ⚠️ | Not used for feature gating |

---

## 22. Service Hosts

**EMC Page:** Property > Service Hosts
**Table:** `serviceHosts`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Is Primary | `isPrimary` | Primary host resolution | ✅ | |
| Service Type | `serviceType` | Host classification | ✅ | |
| Status | `status` | Health tracking | ✅ | |

---

## 23. Employees

**EMC Page:** Property > Employees
**Table:** `employees`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Employee Number | `employeeNumber` | Display, identification | ✅ | |
| First/Last Name | `firstName`, `lastName` | POS display, receipts | ✅ | |
| Date of Birth | `dateOfBirth` | Minor labor enforcement | ✅ | Age calculation |
| PIN Hash | `pinHash` | Authentication | ✅ | bcrypt comparison |
| Role ID | `roleId` | Privilege resolution | ✅ | |
| Active | `active` | Login gating | ✅ | |

---

## 24. Roles & Privileges

**EMC Page:** Enterprise > Roles, Enterprise > Privileges
**Tables:** `roles`, `privileges`, `rolePrivileges`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Role Name | `roles.name` | Admin display | ✅ | |
| Access Level | `roles.accessLevel` | System/enterprise/property gating | ✅ | |
| Privilege Code | `privileges.code` | Runtime permission checks | ✅ | `manager_override`, `void_item`, etc. |
| Domain | `privileges.domain` | UI grouping | ✅ | |
| System admin bypass | *(hardcoded)* | `isSystemLevel` helper | ❌ | Not configurable, by design |

---

## 25. Job Codes

**EMC Page:** Property > Job Codes
**Table:** `jobCodes`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Schedule display | ✅ | |
| Compensation Type | `compensationType` | Salaried bypass for clock-in | ✅ | |
| Hourly Rate | `hourlyRate` | Labor cost projections | ✅ | |
| Salary Amount/Period | `salaryAmount`, `salaryPeriod` | Pay calculations | ✅ | |
| Tip Mode | `tipMode` | Tip pool eligibility | ✅ | |
| Tip Pool Weight | `tipPoolWeight` | Distribution weighting | ✅ | |
| Color | `color` | Schedule UI | ✅ | |
| Role Override | `roleId` | Shift-specific permissions | ✅ | |

---

## 26. Overtime Rules

**EMC Page:** Property > Overtime Rules
**Table:** `overtimeRules`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| OT Multiplier | `overtimeMultiplier` | Pay rate calculation | ✅ | Default 1.5x |
| OT Threshold Hours | `overtimeThresholdHours` | Daily OT trigger | ✅ | |
| Double Time Threshold | `doubleTimeThresholdHours` | Double-time trigger | ✅ | |
| Weekly Threshold | `weeklyThresholdHours` | Weekly OT trigger | ✅ | |

---

## 27. Break Rules

**EMC Page:** Property > Break Rules
**Table:** `breakRules`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Meal Break Threshold Hours | `mealBreakThresholdHours` | Break attestation trigger | ✅ | |
| Meal Break Minutes | `mealBreakMinutes` | Required break duration | ✅ | |
| Rest Break Interval | `restBreakIntervalHours` | Rest break schedule | ✅ | |
| Rest Break Minutes | `restBreakMinutes` | Rest duration | ✅ | |
| Allow Meal Break Waiver | `allowMealBreakWaiver` | Waive button enable/disable | ✅ | |
| Active | `active` | Enforcement toggle | ✅ | |

---

## 28. Minor Labor Rules

**EMC Page:** Property > Minor Labor Rules
**Table:** `minorLaborRules`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Max Hours Per Day | `maxHoursPerDay` | Scheduling enforcement | ✅ | |
| Max Hours Per Week | `maxHoursPerWeek` | Scheduling enforcement | ✅ | |
| Curfew Weeknight | `curfewWeeknight` | Clock-in blocking | ✅ | |
| Curfew Weekend | `curfewWeekend` | Clock-in blocking | ✅ | |

---

## 29. Tip Pool Policies & Tip Rules

**EMC Page:** Property > Tip Pool Policies
**Tables:** `tipPoolPolicies`, `tipRules`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Calculation Method | `calculationMethod` | Tip pool formula | ✅ | |
| Tip Mode | `tipMode` | Pool scope (property/RVC/individual) | ✅ | |
| Distribution Method | `distributionMethod` | Hours vs weight-based | ✅ | |
| Timeframe | `timeframe` | Distribution period | ✅ | |

---

## 30. Payment Processors

**EMC Page:** Enterprise > Payment Processors
**Table:** `paymentProcessors`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Name | `name` | Admin display | ✅ | |
| Gateway Type | `gatewayType` | Adapter dispatch | ✅ | Stripe/Heartland/North/Elavon |
| Settings (JSONB) | `settings` | Processor-specific flags | ✅ | Merchant IDs, feature toggles |
| Environment | `environment` | Sandbox vs production | ✅ | |
| Active | `active` | Tender routing filter | ✅ | |

---

## 31. Gift Cards

**EMC Page:** Enterprise > Gift Cards
**Table:** `giftCards`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Card Number | `cardNumber` | Lookup key | ✅ | |
| PIN | `pin` | Validation | ✅ | |
| Balance | `balance` | Redemption limit | ✅ | |
| Status | `status` | Active/sold/disabled gating | ✅ | |

---

## 32. Loyalty Programs

**EMC Page:** Enterprise > Loyalty Programs
**Tables:** `loyaltyPrograms`, `loyaltyMembers`, `loyaltyRewards`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Program Name | `name` | POS display | ✅ | |
| Points per Dollar | `pointsPerDollar` | Earn calculation | ✅ | |
| Current Points | `loyaltyMembers.currentPoints` | Balance display | ✅ | |
| Member Number | `loyaltyMembers.memberNumber` | Lookup key | ✅ | |
| Reward Thresholds | `loyaltyRewards.*` | Redemption eligibility | ✅ | |

---

## 33. Online Order Sources

**EMC Page:** Enterprise > Online Ordering
**Tables:** `onlineOrderSources`, `onlineOrders`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Source Type | `sourceType` | DoorDash/UberEats/Grubhub routing | ✅ | |
| Status | `status` | Active/paused gating | ✅ | |
| Estimated Prep Time | `estimatedPrepTime` | Order timing | ✅ | |

---

## 34. Inventory

**EMC Page:** Property > Inventory
**Tables:** `inventoryItems`, `inventoryStock`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Track Inventory | `trackInventory` | Deduction toggle | ✅ | |
| Quantity on Hand | `quantityOnHand` | Stock level | ✅ | |
| Reorder Point | `reorderPoint` | Alert threshold | ✅ | |

---

## 35. Forecasting

**EMC Page:** Property > Forecasting
**Tables:** `salesForecasts`, `laborForecasts`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Forecast Date | `forecastDate` | Schedule overlay | ✅ | |
| Projected Sales | `projectedSales` | Labor planning | ✅ | |
| Projected Labor Cost | `projectedLaborCost` | Staffing guidance | ✅ | |

---

## 36. Manager Alerts

**EMC Page:** Property > Manager Alerts
**Tables:** `managerAlerts`, `alertSubscriptions`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Alert Type | `alertType` | Event classification | ✅ | |
| Severity | `severity` | Priority display | ✅ | |
| Status | `status` | Active/dismissed | ✅ | |

---

## 37. Item Availability (86 Board)

**EMC Page:** Property > Item Availability
**Table:** `itemAvailability`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Current Quantity | `currentQuantity` | Countdown display | ✅ | |
| Is 86'd | `is86d` | POS button disable | ✅ | |

---

## 38. Descriptor Sets (Receipt Headers/Trailers)

**EMC Page:** Enterprise > Descriptor Sets
**Table:** `descriptorSets`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Header Lines | `headerLines` | Receipt top text | ✅ | Max 16 lines |
| Trailer Lines | `trailerLines` | Receipt bottom text | ✅ | Max 16 lines |
| Logo Enabled | `logoEnabled` | Logo on receipt | ✅ | |
| Logo Asset ID | `logoAssetId` | Logo image reference | ✅ | |
| Override Header | `overrideHeader` | Inheritance override | ✅ | |
| Override Trailer | `overrideTrailer` | Inheritance override | ✅ | |
| Scope Type/ID | `scopeType`, `scopeId` | Enterprise/Property/RVC targeting | ✅ | |

---

## 39. POS Layouts

**EMC Page:** RVC > POS Layouts
**Tables:** `posLayouts`, `posLayoutCells`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Layout Name | `name` | Admin display | ✅ | |
| Grid Rows/Cols | `rows`, `cols` | Grid dimensions | ✅ | |
| Cell MenuItem ID | `menuItemId` | Button assignment | ✅ | |
| Cell Label | `label` | Custom button text | ✅ | |
| Cell Color | `color` | Button color | ✅ | |
| Cell Font Size | `fontSize` | Button text scale | ✅ | |

---

## 40. Pizza Builder Configuration

**EMC Page:** Enterprise > Menu Items (menuBuildEnabled)
**Runtime:** `client/src/pages/pizza-builder.tsx`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Menu Build Enabled | `menuItems.menuBuildEnabled` | Triggers pizza builder | ✅ | |
| Section layout (whole/half/quarter) | *(hardcoded)* | Fixed sections | ❌ | Should be configurable per item |

---

## 41. CAL Packages (Client Application Loader)

**EMC Page:** Enterprise > CAL Packages
**Table:** `calPackages`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Version | `version` | Update detection | ✅ | |
| Package URL | `packageUrl` | Download source | ✅ | |
| Enterprise Scope | `enterpriseId` | Deployment targeting | ✅ | |

---

## 42. Config Overrides (Inheritance)

**EMC Page:** *(system-level, used across all pages)*
**Table:** `configOverrides`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Entity Type | `entityType` | Override target classification | ✅ | |
| Entity ID | `entityId` | Specific entity | ✅ | |
| Scope Type | `scopeType` | Enterprise/Property/RVC level | ✅ | |
| Scope ID | `scopeId` | Specific scope | ✅ | |
| Override Fields | `overrideFields` | JSONB of overridden values | ✅ | |

---

## 43. Fiscal Close / Business Date

**EMC Page:** Property > Fiscal Close
**Runtime:** `server/fiscalScheduler.ts`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Business Date Mode | `properties.businessDateMode` | Auto vs manual rollover | ✅ | |
| Rollover Time | `properties.businessDateRolloverTime` | Day boundary time | ✅ | |
| Auto Clock-Out | `properties.autoClockOutEnabled` | Mass clock-out on close | ✅ | |

---

## 44. Cash Management

**EMC Page:** Property > Cash Management
**Tables:** `cashDrawerAssignments`, `cashTransactions`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Drawer Assignment | `employeeId`, `workstationId` | Drawer ownership | ✅ | |
| Starting Bank | `startingBank` | Opening balance | ✅ | |
| Cash Transaction Type | `transactionType` | Drop/pickup/sale tracking | ✅ | |
| Drawer Enforcement | *(derived)* | Cash tenders require `drawerAssignmentId` | ✅ | |

---

## 45. Scheduling & Shifts

**EMC Page:** Property > Scheduling
**Tables:** `schedules`, `shifts`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Schedule Period | `startDate`, `endDate` | Schedule range | ✅ | |
| Shift Times | `startTime`, `endTime` | Employee assignment | ✅ | |
| Job Code | `jobCodeId` | Role/pay resolution | ✅ | |
| Published | `published` | Visibility to employees | ✅ | |

---

## 46. Delivery Platform Integrations

**EMC Page:** Enterprise > Online Order Sources
**Runtime:** `server/integrations/`

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Uber Eats Config | `onlineOrderSources.settings` | API credentials, store ID | ✅ | |
| DoorDash Config | `onlineOrderSources.settings` | API credentials, store ID | ✅ | |
| Grubhub Config | `onlineOrderSources.settings` | API credentials, store ID | ✅ | |
| Menu Sync | *(runtime)* | Push menu to platform | ✅ | |

---

## 47. Stress Testing

**EMC Page:** Admin > Stress Testing
**Runtime:** `server/routes.ts` stress test endpoints

| Setting | DB Column | Runtime Reader | Status | Notes |
|:---|:---|:---|:---|:---|
| Config Parameters | *(request body)* | Transaction count, concurrency | ✅ | Not persisted, per-run |

---

## Priority Remediation Roadmap

### Phase 1 — Critical (Tender System)
**Impact:** Highest. All payment behavior keyed off string checks.

| Task | Effort | Risk |
|:---|:---|:---|
| Add `popDrawer`, `allowOverTender`, `allowTips`, `printCheckOnPayment` to `tenders` table | Medium | Low (additive) |
| Refactor `tender.type === "cash"` checks to read config flags | Medium | Medium (behavior change) |
| Add `allowChangeDue`, `maxTenderAmount`, `roundingMethod` | Medium | Low |

### Phase 2 — High (Device Config Activation)
**Impact:** 17 dead config columns on printers and KDS devices.

| Task | Effort | Risk |
|:---|:---|:---|
| Wire `autoCut`, `printVoids`, `printReprints` into `printService.ts` | Low | Low |
| Wire `showTimers`, `autoSortBy`, `allowBump`, `allowRecall` into KDS display | Medium | Low |
| Wire `sendVoids`, `sendReprints` on order devices | Low | Low |

### Phase 3 — Medium (Missing RVC/Property Config)
| Task | Effort | Risk |
|:---|:---|:---|
| Add `autoPrintReceiptOnClose` to `rvcs` or `properties` | Low | Low |
| Add `receiptCopies` to `rvcs` or `properties` | Low | Low |
| Add `requireGuestCount` to `rvcs` | Low | Low |

### Phase 4 — Enhancement (Menu Item Granular Control)
| Task | Effort | Risk |
|:---|:---|:---|
| Add `allowPriceOverride`, `allowVoid`, `requireVoidReason` to `menuItems` | Medium | Low |
| Add `maxQuantity`, `isOpenPrice` to `menuItems` | Low | Low |
| Add `stackingAllowed`, `orderTypeFilter` to `discounts` | Medium | Low |

### Phase 5 — Polish (Color/Display Config)
| Task | Effort | Risk |
|:---|:---|:---|
| Wire `menuItems.color` into POS grid buttons | Low | Low |
| Wire `slus.color` into POS tab bar | Low | Low |
| Wire `majorGroups.displayOrder` into report sorting | Low | Low |

---

*This matrix serves as the living implementation roadmap for Cloud POS 3.0's transition to a fully configuration-driven, option-bit architecture modeled after Oracle Simphony.*
