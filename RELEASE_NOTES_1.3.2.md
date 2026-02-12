# Cloud POS v1.3.2 Release Notes

## Performance Improvements

### POS Item Ring-In Speed (Critical Fix)
- **Fixed**: Reduced ~3 second delay when adding menu items to a check in production
- **Root cause**: The add-item API endpoint was making 10+ sequential database queries (check, RVC, property, menu item, tax groups, create item, RVC again, KDS tickets, recalculate totals with nested lookups)
- **Server-side optimizations**:
  - Parallelized initial data fetches (check + menu item + tax groups fetched simultaneously instead of sequentially)
  - Eliminated duplicate RVC lookup (was fetched twice per item add)
  - Inlined tax snapshot calculation to reuse already-fetched data instead of making separate queries
  - Moved non-critical background operations (KDS preview, bumped ticket recall, total recalculation, WebSocket broadcast) to run after the response is sent to the client
  - Background operations now run in parallel instead of sequentially
- **Check totals recalculation optimized**:
  - Parallelized fetching of check, items, and discounts (3 queries run simultaneously instead of sequentially)
  - Legacy item tax lookups (menu items + tax groups) are now fetched once and cached for the entire recalculation instead of being re-fetched inside a loop for every legacy item
- **Client-side optimistic updates**:
  - Items now appear instantly in the check detail when tapped, before the server confirms
  - If the server call fails, the optimistic item is removed and an error is shown
  - Modifier modal closes immediately after confirmation with optimistic item display
- **Net result**: Item ring-in should now feel near-instant instead of the previous ~3 second delay

## EMC Navigation Improvements

### Configuration Grid Navigation
- **Added**: Back button in the header bar when viewing any configuration page (Tax Groups, Employees, etc.) -- click to return to the main configuration grid
- **Fixed**: Clicking a node in the hierarchy tree (Enterprise, Property, or RVC) now returns to the main configuration grid while keeping your selected scope
- Previously, users were stuck on a configuration page with no way to navigate back to the grid

### Level-Locked Navigation Enhancements
- **Added**: System admin check to scope-change redirect logic -- non-admin users are properly redirected when navigating to admin-only pages
- Cleaned up unused interface properties in navigation system

## Upgrade Notes

- **Cloud/Web POS stations**: Republishing the server applies all performance fixes immediately
- **Windows Electron stations**: Auto-update will deliver v1.3.2 with all improvements -- the performance fix is server-side, so Electron stations benefit as soon as the server is updated
- No database migrations required
- No configuration changes needed
