# Cloud POS v1.3.2 Release Notes

**Release Date:** February 12, 2026

---

## Highlights

- Near-instant item ring-in on the POS (previously ~3 seconds)
- Complete EMC redesign with Simphony-style three-panel MDI layout and hierarchy tree navigation
- Configuration inheritance and override system -- items inherit down the hierarchy with the ability to override at any level
- Zone and Inheritance columns on all configuration tables showing where each item originates
- Role-based and level-locked navigation -- pages auto-filter based on user role and selected scope
- Enhanced error resilience for background operations

---

## Performance

### POS Item Ring-In Speed
The most impactful change in this release. Adding menu items to a check is now near-instant, down from a noticeable ~3 second delay in production environments.

**What changed:**
- Server-side database queries are now parallelized instead of running one after another
- Duplicate data lookups eliminated
- Tax calculations reuse already-loaded data instead of re-fetching
- Non-critical operations (KDS updates, total recalculation) now run in the background after the POS screen has already updated
- Check totals recalculation optimized to avoid redundant lookups per item

**What you'll notice:**
- Items appear on the check immediately when tapped
- Modifier selection modal closes instantly after confirmation
- If the server encounters an issue, the item is automatically removed and an error is displayed

---

## EMC Redesign

### Three-Panel MDI Layout (Simphony-Style)
The Enterprise Management Console has been completely redesigned with a Simphony-class three-panel layout:
- **Left panel -- Hierarchy Tree**: Collapsible tree view showing Enterprise > Property > Revenue Center. Click any node to set scope. Auto-expands to the currently selected scope on load.
- **Center panel -- Configuration Grid**: Categorized navigation with Simphony-style category headers and multi-column clickable links. Replaces the previous vertical navigation list. Categories include Configuration, Operations, Labor, Payments, and more.
- **Right panel -- Embedded Configuration**: Selected configuration pages render inline in the right panel. No popup dialogs -- all pages render embedded within the layout.

### Hierarchy Tree Navigation
- Tree nodes for Enterprise, Property, and RVC are clickable to set the current scope
- Clicking a tree node returns to the configuration grid while preserving your scope selection
- Enterprises auto-expand to show their properties; properties expand to show their RVCs
- Visual highlighting indicates the currently selected node at each level
- Selection cascade: changing enterprise clears property and RVC; changing property clears RVC

### Configuration Grid Navigation
- **Back button** added to the header bar when viewing any configuration page -- one click returns you to the main configuration grid
- **Tree node clicks** now return to the configuration grid while preserving your scope selection
- Previously there was no way to navigate back to the grid from a configuration page

---

## Configuration Inheritance & Override System

### How Inheritance Works
Items configured at a higher level in the hierarchy automatically inherit down to all levels below:
- **Enterprise-level items** are available to all properties and all RVCs under that enterprise
- **Property-level items** are available to all RVCs under that property
- **RVC-level items** apply only to that specific Revenue Center

### Zone Column
Every configuration table now shows a **Zone** column that displays where each item was originally created:
- Shows the actual name of the enterprise, property, or RVC where the item is defined
- Icons distinguish between enterprise-level (building), property-level (store), and RVC-level (grid) items
- Helps administrators quickly identify the origin of any configuration item

### Inheritance Column
Every configuration table now shows an **Inheritance** column that indicates whether each item is:
- **Defined Here** -- the item was created at the currently selected scope level
- **Inherited** -- the item was inherited from a higher level in the hierarchy (enterprise or property)

### Override & Remove Override
- **Override**: When viewing an inherited item, you can create a local override at the current scope level. This creates a copy of the item that can be modified independently without changing the parent item.
- **Remove Override**: Deleting an override restores the inherited version from the parent scope. The original item at the higher level is never affected.
- Override tracking is managed via the `config_overrides` table with the `useConfigOverride()` hook
- Override queries fetch all ancestor scopes to prevent duplicates -- an overridden item at a lower level hides the parent version

### Configuration Pages with Override Support
The following 15 entity types support the full override workflow:
- Menu Items, Modifiers, Modifier Groups, Employees, Roles, Jobs
- Tax Groups, Tenders, Discounts, Service Charges
- SLUs, Major Groups, Family Groups, Print Classes, Order Devices

---

## Role-Based & Level-Locked Navigation

### Role-Based Access Control
- **Enterprise page** (the top-level enterprise configuration) is restricted to `system_admin` users only
- Non-admin users (property admins, managers) are automatically redirected if they attempt to access enterprise-only pages
- System admin check integrated into scope-change redirect logic

### Level-Locked Pages
Certain pages are only valid at specific hierarchy levels and are automatically hidden or shown based on the selected scope:
- **Enterprise-only pages**: Visible only when no property is selected (enterprise-wide view)
- **Property-required pages**: Hidden at enterprise level, visible when a specific property is selected
  - Includes: Workstations, Printers, KDS Devices, Schedules, and other property-scoped operations
- **Any-level pages**: Visible at all levels (Menu Items, Tax Groups, Employees, etc.)

### Automatic Redirects
- When you change scope (e.g., from a property to enterprise level), if the current page is not valid for the new scope, you are automatically redirected to the configuration grid
- Prevents stale content from displaying when navigating between hierarchy levels

---

## Reliability

- Background operations (KDS preview, bumped ticket recall, total recalculation) now include error handling and logging -- a failure in one background task no longer affects others
- Failed item additions properly restore availability counts and clean up the UI
- Each background task has individual error catching so partial failures are logged without blocking other operations

---

## Upgrade Notes

| Station Type | Action Required |
|---|---|
| **Cloud / Web POS** | Republish the server -- all fixes apply immediately |
| **Windows Electron** | Auto-update delivers v1.3.2 automatically. Performance fix is server-side, so stations benefit as soon as the server is updated |

- No database migrations required
- No configuration changes needed
- Fully backward compatible with v1.3.1
- The EMC redesign is purely a UI change -- all existing configuration data is preserved
- Override records are tracked in a new `config_overrides` table that is created automatically
