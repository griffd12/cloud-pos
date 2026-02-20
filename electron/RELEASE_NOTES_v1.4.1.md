# Cloud POS v1.4.1 Release Notes

**Release Date:** February 20, 2026

---

## Installer Changes

### Single Desktop Shortcut
- Consolidated from two desktop shortcuts (Cloud POS + Cloud KDS) to a single "Cloud POS" shortcut
- KDS mode is accessible from the in-app Mode menu (Mode > KDS Mode) without needing a separate shortcut
- Start Menu still includes dedicated POS, KDS, and Kiosk shortcut variants for power users
- Auto-launch registry entry updated to launch without a hardcoded mode flag (defaults to POS, switchable in-app)
- Uninstaller cleans up legacy "Cloud KDS.lnk" desktop shortcut from previous versions

---

## Electron / Print Agent Changes

### Serial Printer Support
- Full serial port (COM1-COM8) and baud rate (9600-115200) configuration added for receipt printers
- Print agent routes print jobs and cash drawer kicks through serial ports when connection type is "serial"
- ESC/POS receipt data and drawer kick commands sent via `serialport` module with proper open/close lifecycle
- COM port printing only available from Electron desktop app (browsers cannot access serial ports)

### Cash Drawer Kick - Serial Routing Fix
- Server now includes `connectionType`, `comPort`, and `baudRate` in the DRAWER_KICK WebSocket message
- Enables print agent to route drawer kick commands directly to serial printers without relying on local printer map lookup
- Network printer drawer kicks continue to work unchanged

---

## Server Changes

### Workstation Order Device Routing
- Per-workstation control over which order devices receive orders via `workstation_order_devices` junction table
- KDS routing engine intersects a menu item's Print Class devices with the workstation's allowed devices
- When no workstation assignments exist, all devices receive orders (backward compatible)
- EMC UI for managing workstation-to-order-device assignments with multi-select interface

### KDS Routing Improvements
- KDS ticket routing now uses direct order device mapping through `print_class_routing` table
- Device-scoped filtering prevents duplicate tickets across dedicated KDS expo screens
- GET tickets, bump-all, and clear operations all support `kdsDeviceId` parameter
- Frontend sends `kdsDeviceId` in query params for dedicated KDS devices

### Print Class Configuration
- Fixed infinite loop when saving print class routing configurations
- Print class routing correctly maps menu items to order devices for KDS ticket creation

### Print Agent Management
- Improved print agent registration and deletion logic
- Better handling of agent reconnection and stale agent cleanup

### Serial Printer EMC Configuration
- Printers page shows COM port and baud rate selectors when "Serial (Legacy)" connection type is selected
- Serial printers store `comPort` and `baudRate` fields with null `ipAddress`/`port`
- Network printers continue to use `ipAddress`/`port` with null `comPort`

---

## Upgrade Instructions

1. Download `Cloud-POS-1.4.1-Setup.exe` from GitHub Releases
2. Run the installer -- it will automatically replace the previous version
3. The old "Cloud KDS" desktop shortcut is automatically removed during installation
4. To use KDS mode, launch Cloud POS and switch via the Mode menu, or use the Start Menu KDS shortcut
5. Print agent will reconnect automatically

---

## Compatibility

- Fully backward compatible with v1.4.0
- No breaking changes
- Database schema changes applied automatically
- Serial printer support requires this updated Electron build
- Existing network printer configurations are unaffected
