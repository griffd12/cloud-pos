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

## Previous Changes (v1.3.4)

### Display Font Scaling
- Per-workstation and per-KDS-device font size control (Small 85%, Medium 100%, Large 120%, Extra Large 140%)
- Font scale stored in both `workstations` and `kds_devices` tables
- Configurable via EMC for both Workstations and KDS Devices
- Uses CSS zoom with viewport compensation for proportional scaling of all UI elements
- Solves readability issues on smaller touchscreens viewed from 1-2 feet away

### Stress Test Infrastructure
- Persistent stress test results saved to database with full metrics
- EMC Stress Test Report page showing historical test runs with performance thresholds
- System tender auto-provisioned for stress testing (hidden from EMC, skips receipts)

## Upgrade Notes
- Terminals running v1.3.3 or v1.3.4 will auto-update to v1.3.5
- Database migration adds `font_scale` column to `kds_devices` table (auto-applied on startup)
- All changes are backward-compatible with existing enterprise configurations
- Auto-startup registration occurs automatically after the next Setup Wizard completion
