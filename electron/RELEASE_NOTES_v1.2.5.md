# Cloud POS v1.2.5 - Release Notes

**Release Date:** February 10, 2026

---

## Complete Offline Database Mirror

The local SQLite database is now a true complete mirror of the cloud database. Previously, 6 sync endpoints were returning 404 errors because the server-side API routes didn't exist. This release adds all missing endpoints and tables.

### New Sync Endpoints (fixes 404 sync errors)
- `/api/sync/modifier-group-modifiers` — Modifier-to-group linkages
- `/api/sync/menu-item-modifier-groups` — Menu item-to-modifier group linkages
- `/api/sync/order-device-printers` — Order device printer assignments
- `/api/sync/order-device-kds` — Order device KDS assignments
- `/api/sync/menu-item-recipe-ingredients` — Recipe ingredient data
- `/api/print-class-routings` — Print class routing configuration

### New Offline SQLite Tables (12 added)
- `modifiers` — Individual modifier records
- `modifier_group_modifiers` — Modifier-to-group linkage with isDefault/displayOrder
- `menu_item_modifier_groups` — Menu item-to-modifier group linkage with displayOrder
- `kds_devices` — KDS device configuration
- `order_devices` — Order device configuration
- `order_device_printers` — Order device to printer assignments
- `order_device_kds` — Order device to KDS assignments
- `print_classes` — Print class definitions
- `print_class_routings` — Print routing rules
- `ingredient_prefixes` — Ingredient prefix configuration
- `menu_item_recipe_ingredients` — Recipe ingredient data for conversational ordering
- `payment_terminals` — EMV payment terminal configuration

### Expanded Sync Coverage
- `syncFromCloud` now downloads 30+ tables (up from ~18)
- All EMC configuration data syncs to local DB: modifiers, linkages, devices, print classes, recipes, terminals

---

## POS Performance: Instant Item Taps

### Modifier Map Pre-Fetch
- New `/api/pos/modifier-map` endpoint returns all modifier groups organized by menu item ID in a single API call
- POS page pre-fetches the entire modifier map on load (cached for 5 minutes)
- Tapping a menu item now does an instant local lookup instead of a network call
- Both "Add Item" and "Edit Modifiers" flows use the pre-fetched map

### Backend Query Optimization
- Fixed N+1 query problem in `getModifierGroups` — now uses 3-4 batched queries instead of one query per modifier group
- Significant reduction in database load for enterprises with many modifier groups

---

## Offline API Interceptor Improvements

### New Offline Handlers
- Full modifier-map handler: builds the complete modifier map from local SQLite data with proper `isDefault` flags, `displayOrder` sorting, and group ordering
- Per-item modifier group filtering: when offline, `GET /api/modifier-groups?menuItemId=X` correctly filters and sorts from local linkage tables
- All 12 new tables are registered in `canHandleOffline()` and `entityMap` for seamless offline access

### Supported Offline Tables (total: 30+)
Menu items, modifier groups, modifiers, condiment groups, combo meals, employees, tax rates, discounts, tender types, order types, service charges, major/family groups, menu item classes, revenue centers, properties, printers, workstations, KDS devices, order devices, print classes, print class routings, ingredient prefixes, and all linkage tables

---

## Page Cache Fix (from v1.2.4+)

- `.cache` suffix approach for page cache file storage prevents ENOTDIR errors
- Recursive directory creation safely handles conflicting files within cache directory
- Legacy file support: reads new `.cache` path first, falls back to old format for backward compatibility
- SPA fallback (serving /pos for unknown routes) uses dual-path lookup

---

## Bug Fixes

- Fixed offline sync logging: each failed sync endpoint now logs its specific HTTP status code and error message
- Fixed modifier ordering: offline modifier groups and modifiers now respect `displayOrder` from linkage tables
- Fixed modifier defaults: `isDefault` flag from `modifier_group_modifiers` linkage is now preserved in offline mode

---

## Upgrade Instructions

1. Build new installer: `npm run electron:build` (on Windows with build tools)
2. Create GitHub Release tagged `v1.2.5`
3. Upload `Cloud POS-1.2.5-Setup.exe` to the release
4. Existing installations will auto-update (if GitHub repo is accessible)
5. For fresh installs: download and run the new Setup.exe

## Auto-Updater Note

If the auto-updater shows "Update check failed," ensure the GitHub repository (`griffd12/cloud-pos`) is either:
- **Public**, or
- **Private with `GH_TOKEN`** set in the app's environment (electron-updater supports this natively for private repos)
