# Cloud POS v1.4.5 Release Notes

**Release Date:** February 20, 2026

---

## Bug Fixes

### Cash Drawer Double-Kick Fix (Serial Printers)
- **Eliminated serial port collision on check close**: When a cash payment closes a check, the system was firing both the receipt-embedded ESC/POS drawer kick AND a standalone API kick simultaneously, causing the serial port to lock up or fail on the second access. The standalone kick is now skipped when the receipt already contains the kick command (closed checks), preventing the collision entirely.
- **Affected configuration**: Workstations using serial COM port printers (e.g., WS01 on COM1 with DB25-to-RJ45 adapter).

### Serial Port Retry Logic (Print Agent)
- **Added retry with backoff for busy/locked serial ports**: `sendToSerialPrinter()` now retries up to 2 times with a 500ms delay when the port reports "Access denied", "busy", "locked", or "in use" errors. This handles transient port lock states that occur on Windows when the port hasn't fully released from a prior operation.
- **Settled guard prevents duplicate resolve/reject**: A shared `settled` flag and `portOpened` flag ensure the Promise resolves or rejects exactly once, even if multiple error/timeout handlers fire due to flaky serial drivers.
- **Port error handler ignores post-write events**: After a successful port open and write, the `port.on('error')` handler is suppressed to prevent a stale error event from triggering an unnecessary retry.

### Cash Drawer Kick Failure Toast
- **User-visible feedback on kick failure**: If the standalone cash drawer kick API call fails, a red toast notification now appears ("Drawer kick failed — check printer connection") instead of silently failing.

### Workstation Form Crash Fix (OrderDeviceRouting)
- **Eliminated infinite re-render loop**: The Radix UI Checkbox component inside OrderDeviceRouting was causing a "Maximum update depth exceeded" crash due to its internal state management conflicting with the controlled `checked` prop and the parent row's click handler. Replaced the Radix Checkbox with a plain visual indicator (styled div + lucide Check icon) so only the row's `onClick` handles toggle state — no competing state updates, no crash.

---

## Summary of Changes

| Fix | Description |
|-----|-------------|
| Double-Kick Elimination | Skip standalone API kick when receipt print already embeds ESC/POS kick bytes |
| Serial Port Retry | 2 retries with 500ms delay for busy/locked/access-denied port states |
| Settled Guard | Prevents multiple resolve/reject from overlapping serial port handlers |
| Kick Failure Toast | Red notification when cash drawer kick fails |
| Workstation Form Crash | Replace Radix Checkbox with plain visual toggle to fix infinite loop |

---

## Upgrade Instructions

1. Download `Cloud-POS-1.4.5-Setup.exe` from GitHub Releases
2. Run the installer -- it will automatically replace the previous version
3. Auto-update from v1.4.4 is also supported
4. Cash drawer kick on serial printers should now work reliably on first attempt

---

## Build Command (Windows)

```
npm install && node electron/prebuild-cleanup.cjs && npx electron-builder --config electron/electron-builder.json --win
```

---

## Compatibility

- Fully backward compatible with v1.4.4
- No breaking changes
- No database schema changes
