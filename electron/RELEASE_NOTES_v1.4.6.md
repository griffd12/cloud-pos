# Cloud POS v1.4.6 Release Notes

**Release Date:** February 20, 2026

## Serial/USB Printing Fixes

### Serial Port Job Queue (Critical Fix)
- Added per-COM-port job queuing to the embedded Print Agent
- Print jobs for the same serial port now execute one at a time instead of racing for port access
- Fixes "Access denied" / "COM port busy" errors when multiple receipts or drawer kicks arrive simultaneously
- 150ms cooldown between serial jobs ensures the port fully releases before the next job starts
- Independent queues per COM port — jobs for different ports (e.g., COM1 and COM3) still run in parallel

### USB Connection Type Support
- Print Agent now recognizes `connectionType: "usb"` in addition to `"serial"` for print jobs and drawer kicks
- Applies to both direct connection type routing and mapped printer lookups
- Ensures printers configured as USB type with a COM port route correctly through the serial printing path

## Previous Changes (included since v1.4.5)

### Printer Validation Fix
- Server-side print engine now accepts `connectionType: "usb"` when a COM port is configured
- Previously, USB-configured printers were rejected by validation even though the serial routing code existed

### Database Corrections
- Station1-PTR printer connection type corrected from `usb` to `serial` for proper Print Agent routing
