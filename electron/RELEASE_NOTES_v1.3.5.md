# Cloud POS v1.3.5 Release Notes

## New Features

### Auto-Startup on Boot (Windows)
- After completing the Setup Wizard, the application now automatically registers itself to launch on Windows startup
- The correct application mode is registered based on the device configuration selected during setup:
  - **Workstation**: Cloud POS launches automatically on boot
  - **KDS Device**: Cloud KDS launches automatically on boot
- Uses Electron's native `setLoginItemSettings` API for reliable OS-level startup registration
- Auto-startup can be queried and toggled programmatically via IPC (`get-auto-startup-status`, `set-auto-startup`)
- Ensures the correct application auto-launches when the PC reboots without manual intervention

### KDS Header Bar Enhancement
- The KDS screen header now displays the same contextual information as the POS header:
  - **Enterprise name** — identifies the organization
  - **Device name** — shows which KDS station this is
  - **Current date and time** — updates every 30 seconds
  - **RVC (Revenue Center) name** — critical for environments where KDS devices serve different Revenue Centers
- Styled consistently with the POS header, including the branded icon and two-line layout
- No employee name is shown since KDS devices do not have individual logins

### Remove Gear/Settings Icon from KDS
- The gear icon that previously appeared on the KDS screen has been removed entirely
- This icon navigated to the "Connect to Server" page, which should not be accessible during normal KDS operation
- The fullscreen toggle and theme toggle remain available in the KDS header

## Server & Database Changes (v1.3.4)

These changes were released in v1.3.4 as server-side and database updates. They do not affect the Electron installer — no new build was required.

### Display Font Scaling (Database + Web UI)
- Added `font_scale` column to the `workstations` table and the `kds_devices` table
- Per-workstation and per-KDS-device font size control with four options: Small (85%), Medium (100%), Large (120%), Extra Large (140%)
- Configurable via the EMC under Workstation and KDS Device settings
- Applied on POS and KDS screens using CSS zoom with viewport compensation for proportional scaling of all UI elements
- Solves readability issues on smaller touchscreens typically viewed from 1–2 feet away
- `useFontScale` hook reads the configured value and applies it to the page

### Stress Test Enhancements (Database + Web UI)
- Stress test results are now persisted to the database with full metrics (transaction count, success/fail, avg/min/max response times, throughput)
- New EMC Stress Test Report page showing historical test runs with color-coded performance thresholds
- A system tender is auto-provisioned for stress testing — hidden from the EMC tender list and configured to skip receipt printing
- Test checks remain automatically excluded from all sales reports, fiscal totals, and open checks queries

## Upgrade Notes
- Terminals running v1.3.3 or v1.3.4 will auto-update to v1.3.5
- Database migrations for v1.3.4 (`font_scale` columns on `workstations` and `kds_devices`) are auto-applied on server startup
- All changes are backward-compatible with existing enterprise configurations
- Auto-startup registration occurs automatically after the next Setup Wizard completion
