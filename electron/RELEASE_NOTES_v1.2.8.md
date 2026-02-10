# Cloud POS v1.2.8 - SQLite Sync Schema Fix

## Fixed: 8 Tables Now Sync Properly to SQLite

### The Problem
In v1.2.7, SQLite was successfully loaded but 8 tables failed to sync because their SQLite schema was missing the `enterprise_id` column that the sync code expects. The offline-db log showed errors like:
```
[ERROR] [Cache] Cache printers error | DATA: table printers has no column named enterprise_id
```

### Tables Fixed
1. `modifier_group_modifiers` — modifier-to-group linkages
2. `menu_item_modifier_groups` — menu item-to-modifier group linkages
3. `menu_item_recipe_ingredients` — pizza/recipe ingredient data
4. `printers` — printer configurations
5. `workstations` — workstation configurations
6. `kds_devices` — KDS device configurations
7. `order_device_printers` — order device-to-printer routing
8. `order_device_kds` — order device-to-KDS routing

### Auto-Migration for Existing Databases
Terminals that already updated to v1.2.7 and have an existing SQLite database will be automatically migrated — the app detects any missing `enterprise_id` columns on startup and adds them via `ALTER TABLE`. No data loss, no need to reinstall.

## Upgrade Notes
- Terminals running v1.2.7 will auto-update to v1.2.8
- After update, check the offline-db log — you should see `Sync complete. 32 tables synced, 0 errors` with NO cache errors
- All 32 tables should now fully sync into SQLite for complete offline operation
