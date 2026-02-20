# Cloud POS v1.4.7 Release Notes

**Release Date:** February 20, 2026

## Cash Drawer Kick Fixes (Star TSP100III USB/Serial)

### Drawer Kick Before Cut (Critical Fix)
- Moved the ESC/POS cash drawer kick command to execute BEFORE the paper cut command
- Previously, kick bytes were appended AFTER the cut, which some Star printers ignore
- Receipt byte order is now: receipt data → drawer kick → feed → cut
- This ensures reliable drawer opening on Star TSP100III and other ESC/POS printers

### Serial/USB Drawer Kick Routing
- The manual "Open Drawer" command now correctly routes to the workstation-specific print agent for serial/USB printers
- Previously, the system picked the first available agent on the property, which could be the wrong workstation
- Uses `hostWorkstationId` from printer configuration to find the correct agent with physical COM port access

### Local Drawer Kick Serial/USB Support
- The Print Agent's local `kickDrawerLocal()` method now supports serial and USB printers
- Previously, local drawer kick only worked for network (IP-based) printers
- Supports printer lookup by ID, direct COM port specification, and automatic fallback to first configured printer

## Upgrade Notes
- Auto-update from v1.4.6 via differential download
- Cash drawer should now reliably open on cash payments for USB/serial printers
- No configuration changes required
