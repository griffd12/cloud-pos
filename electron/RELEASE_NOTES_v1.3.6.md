# Cloud POS v1.3.6 Release Notes

## Electron Changes

### Auto-Startup Upgrade Migration
- Existing workstations upgrading from v1.3.5 or earlier now **automatically get auto-startup enabled** on the first launch after the update — no need to re-run the Setup Wizard
- On startup, the app detects if setup was previously completed but auto-startup was never registered, and configures it automatically
- The migration verifies that registration succeeded before marking it complete; if something goes wrong, it retries on the next launch instead of silently giving up
- A persistent `autoStartupMigrated` flag in the local config prevents the migration from running on every launch
- All migration activity is logged to the unified system log for troubleshooting

## Enhanced Font Scaling Coverage
- **Font scale now applies at the document level** instead of a container div, so all portaled overlays (modifier popups, pizza builder, function screen, gift cards, loyalty panels, open checks dialogs) automatically inherit the workstation's configured font size
- Applies to both POS and KDS pages via a new `useDocumentFontScale` hook that sets CSS zoom on `document.documentElement`
- Cleanup is automatic — navigating away from POS/KDS restores normal zoom

## Bug Fixes

### Fixed: "Configuration Error" Flash on POS Login
- Fixed a brief "This workstation does not have an RVC assigned" error message that flashed on screen for a split second when signing into a workstation
- The error appeared even when the workstation had a valid RVC assigned in the EMC
- **Root cause**: A timing race condition in the login screen — the workstation data loaded correctly but the RVC selection state hadn't updated yet, causing the error to display for one render frame before disappearing
- The fix checks the workstation's RVC assignment directly from the loaded data, preventing the false error from ever appearing
- Affects all workstations across all properties and enterprises

## Server & Database Changes

### Delivery Platform Integrations (Uber Eats, DoorDash, Grubhub)
- **Full API integrations** with three major delivery platforms — Uber Eats, DoorDash, and Grubhub — enabling direct order flow from delivery apps into the POS
- Each platform has a dedicated integration module handling:
  - **OAuth / JWT authentication** with token management and refresh
  - **Webhook signature verification** for secure incoming order notifications
  - **Order parsing** into a normalized `ParsedDeliveryOrder` format for consistent processing
  - **Accept / Deny / Ready** API calls back to the platform
  - **Menu sync** to push your POS menu items to the delivery platform
  - **Store status management** (open/close toggle) per platform
- **Webhook endpoints** at `/api/webhooks/ubereats`, `/api/webhooks/grubhub`, `/api/webhooks/doordash` receive incoming orders in real time
- **Auto-accept and auto-inject**: When configured, incoming orders are automatically accepted on the platform and injected into the POS as new checks with full item details, tax calculation, and KDS routing
- Auto-injected checks include platform metadata: `fulfillmentStatus` set to "received", `platformSource` (e.g., "ubereats"), `onlineOrderId` linking to the online orders table, and `customerName` from the delivery order
- **Item mapping**: Map external platform menu item IDs to your local POS menu items via `delivery_platform_item_mappings` table — unmapped items are noted during import
- **EMC Online Ordering page** for per-property platform management:
  - Configure credentials (client ID, secret, store ID) per platform per property
  - Test connection to verify credentials
  - Trigger menu sync to push current menu to platforms
  - Toggle store open/closed status
  - View real-time incoming orders dashboard with accept/deny/ready action buttons
  - Manual inject button to push an accepted order into the POS on demand
- **Database schema additions**:
  - `online_order_sources` table for platform credentials, tokens, auto-accept/auto-inject settings, menu sync status, and default RVC assignment
  - `delivery_platform_item_mappings` table for external-to-local menu item ID mapping
  - `online_orders` table for tracking all incoming delivery orders with status, raw payload, and platform metadata

### Orders Screen Redesign (POS Open Checks)
- **Completely redesigned** the POS Open Checks page from a simple list to a **card-based orders view** inspired by modern POS systems
- **Order type tabs**: Filter by All, Dine-In, Takeout, Pickup, or Delivery to quickly find the orders you need
- **Status filter**: Toggle between Active (open) and Completed (closed) orders
- **Order cards** display rich information at a glance:
  - Order type icon (utensils for dine-in, shopping bag for takeout, map pin for pickup, truck for delivery)
  - **Platform badge** for delivery orders — color-coded by platform: green for Uber Eats (UE), orange for Grubhub (GH), red for DoorDash (DD)
  - **Time-since-opened** with color coding: green (< 10 min), yellow (10–20 min), red (> 20 min)
  - **Fulfillment status badge** showing current lifecycle stage (Received, In Progress, Ready, Picked Up, Completed)
  - Item count, order total, table number, and employee name
  - Customer name for pickup/delivery orders
- **Fulfillment lifecycle management** for pickup and delivery orders:
  - Quick-action buttons directly on order cards: **Start** (→ In Progress), **Ready** (→ Ready for Pickup), **Complete** (→ Completed)
  - Status transitions follow the lifecycle: Received → In Progress → Ready → Picked Up (for delivery) or Completed (for pickup)
  - When an order is marked **Ready**, the system automatically notifies the delivery platform (Uber Eats, DoorDash, or Grubhub) via their API so the driver knows to pick up
  - Status changes sync to the `online_orders` table for consistent tracking
- **New API endpoints**:
  - `GET /api/checks/orders` — retrieves orders with optional `orderType` and `statusFilter` query parameters, includes joined employee name and item/round counts
  - `PATCH /api/checks/:id/fulfillment` — updates fulfillment status, syncs with online orders table, and triggers delivery platform notifications
- **Schema additions** on the `checks` table:
  - `fulfillmentStatus` — tracks lifecycle stage (null for dine-in, "received"/"in_progress"/"ready"/"picked_up"/"completed" for pickup/delivery)
  - `onlineOrderId` — links to the `online_orders` table for delivery platform orders
  - `customerName` — customer name for pickup/delivery orders
  - `platformSource` — identifies the originating platform ("ubereats", "grubhub", "doordash", or null)

### Customer Onboarding Data Import
- New Excel-based bulk data import system for rapidly provisioning a new customer's entire database
- Download a single Excel workbook template with **20 tabs** covering all database entities in dependency order:
  1. Enterprise
  2. Properties
  3. Revenue Centers
  4. Tax Groups
  5. Tenders
  6. Discounts
  7. Service Charges
  8. Roles
  9. Job Codes
  10. Printers
  11. KDS Devices
  12. Order Devices
  13. Print Classes
  14. Major Groups
  15. Family Groups
  16. SLUs (Screen Lookup Units)
  17. Modifier Groups
  18. Modifiers
  19. Menu Items
  20. Employees
- Each tab includes column headers, field descriptions, and example data rows
- **Cross-sheet data validation dropdowns** on lookup columns (e.g., the Property tab's `enterprise_code` column has a dropdown populated from the Enterprise tab)
- Color-coded tabs by category: blue for organization, green for financial, teal for labor, amber for devices, orange for menu structure, red for menu items, indigo for employees
- Import API accepts **CSV, JSON, and XLSX** uploads with automatic foreign key resolution (codes/names are resolved to database UUIDs)
- EMC Onboarding page updated with a new **Data Import** tab featuring:
  - One-click Excel template download
  - Phase-by-phase upload interface grouped by category (Organization, Financial, Labor, Devices, Menu Structure, Modifiers, Menu Items, Employees)
  - Real-time import status with success/warning/failure indicators per phase
  - Error details displayed inline with row-level feedback

## Upgrade Notes
- Terminals running v1.3.5 will auto-update to v1.3.6
- **Auto-startup migration runs automatically** — existing terminals will begin launching on Windows boot after the update without any manual configuration
- The Delivery Platform Integrations and Data Import features include both server-side and UI changes; Electron terminals will receive the updated frontend through the auto-update mechanism
- The Orders Screen Redesign is a frontend change that will be included in the Electron installer build
- Delivery platform webhooks require the production server URL to be registered with each platform's developer portal
- All changes are backward-compatible with existing enterprise configurations — new fields default to null and new features are opt-in
