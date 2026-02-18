# Cloud POS v1.3.9 Release Notes

**Release Date:** February 18, 2026

---

## Electron-Specific Changes

### Cash Drawer Kick Reliability
- `ESC @` (printer initialize) command now sent before `ESC p` (drawer kick) to reset the printer's command buffer before kicking the drawer
- Default pulse duration increased from 100ms to 200ms for more reliable solenoid activation across drawer models
- Diagnostic logging added to track kick command bytes, pin selection, and pulse timing in the print agent logs
- Cash drawer kick bytes are now embedded directly into receipt print data when a cash payment closes a check, eliminating the need for a separate TCP connection to the printer

### Critical Fix: Drawer Open Failure
- Fixed a bug where the cash drawer kick endpoint called a non-existent storage function (`getPrintAgentsByProperty`), causing all drawer open attempts to fail silently
- Corrected to use the existing `getPrintAgents(propertyId)` method

### Print Agent Service
- `buildDrawerKickCommand()` now uses `Buffer.concat` to prepend ESC @ before ESC p
- `handleDrawerKick()` default pulse duration updated to 200ms
- `kickDrawerLocal()` default pulse duration updated to 200ms

---

## Server Changes Included

### Cash Drawer Integration
- Receipt printing function (`printCheckReceipt`) now accepts workstation and payment type context
- When a cash payment closes a check, the server appends drawer kick ESC/POS bytes to the end of the receipt data
- Only triggers when workstation has `cashDrawerEnabled` and `cashDrawerAutoOpenOnCash` both enabled
- Respects per-workstation pin selection (pin 2 or pin 5) and pulse duration settings
- Default server-side pulse duration updated from 100ms to 200ms

### KDS 2-Stage Alert System
- Alert system simplified from 3 stages to 2 stages (yellow then red)
- Alert stage 3 disabled and hidden from configuration UI
- Forced color validation: alert 1 = yellow (#F59E0B), alert 2 = red (#EF4444)

### KDS Ticket Readability
- Modifier text styling improved for better visibility at distance
- Device settings refresh in real-time without KDS page reload

### EMC Inline Editing
- KDS Devices, Order Devices, and Workstations pages converted to Simphony-style horizontal embedded layout
- Modal dialogs replaced with inline card-based editing

### Payment Gateway Refunds
- Stripe Terminal refunds now process actual card refunds back to customer's payment method
- Terminal session polling creates `payment_transactions` record for refund chain
- Full and partial refunds supported with manager approval

### Reports Hardening
- All FOH/BOH reports corrected for tips, voids, refunds, and tax totals
- Canonical Reporting DAL with 7 query functions and 6 report endpoints
- Report validation endpoint runs 4 invariant checks

---

## Upgrade Instructions

1. Download `Cloud-POS-1.3.9-Setup.exe` from GitHub Releases
2. Run the installer -- it will automatically replace the previous version
3. The application will launch after installation completes
4. Print agent will reconnect automatically with the improved drawer kick logic

---

## Compatibility

- Fully backward compatible with v1.3.8
- No breaking changes
- Database schema changes applied automatically
- Cash drawer improvements require this updated Electron build to take effect
