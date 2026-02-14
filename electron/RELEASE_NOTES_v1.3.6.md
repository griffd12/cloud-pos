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
- The Data Import feature is server-side only and does not affect the Electron installer
- All changes are backward-compatible with existing enterprise configurations
