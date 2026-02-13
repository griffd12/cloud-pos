# Cloud POS v1.3.3 Release Notes

## POS Performance Improvements

### Modifier Modal Instant Open
- The modifier selection modal now opens immediately when tapping a menu item with required modifiers
- In Dynamic Order Mode, the KDS pending item is created in the background without blocking the UI
- If the background KDS call fails, a warning toast is shown instead of silently failing

### Modifier Map API Optimization
- Reduced from 4 separate database queries to a single optimized SQL JOIN query
- Enterprise/property scope filters are now computed once per request instead of per menu item
- Combined with v1.3.2 ring-in optimizations, the full order flow is now near-instant

## Bug Fixes

### Repeat Order Customer Linking
- Fixed: When repeating a previous customer order, the customer was not linked to the new check
- The customer is now automatically attached to the new check before items are added

### Business Date Auto-Persistence (AUTO Mode)
- AUTO mode properties now automatically persist the calculated business date when it changes
- The `/api/properties/:id/business-date` endpoint stores updates for non-manual mode
- `resolveBusinessDate()` returns the stored date only for MANUAL mode; AUTO mode always recalculates from the property's timezone and rollover rules
- Rollover logic: AM rollover (e.g. 04:00) uses previous day before rollover; PM rollover (e.g. 22:00) advances to next day at/after rollover

## EMC & Admin Enhancements

### Configuration Deletion Protection
- All 15 admin configuration pages now enforce scope-based deletion rules
- Inherited items (from a higher level in the hierarchy) cannot be deleted — only overrides or locally-defined items can be removed
- Server enforces this with HTTP 403 responses for inherited item deletion attempts
- Protected entity types: Menu Items, Modifiers, Modifier Groups, Employees, Roles, Jobs, Tax Groups, Tenders, Discounts, Service Charges, SLUs, Major Groups, Family Groups, Print Classes, Order Devices

### EMC Simphony-Style Layout & Inheritance
- Updated admin console with three-panel MDI layout: hierarchy tree, category navigation, and embedded configuration panels
- Configuration inheritance columns show item origin (Inherited vs. Defined Here)
- Override creates a local copy at the current scope level; deleting an override restores the inherited version

## Upgrade Notes
- Terminals running v1.3.2 will auto-update to v1.3.3
- No database migrations required
- All changes are backward-compatible with existing enterprise configurations
