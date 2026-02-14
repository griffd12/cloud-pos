# Cloud POS v1.3.7 Release Notes

## Electron Changes

### UAC Prompt Eliminated
- Changed Windows execution level from `requireAdministrator` to `asInvoker` — the app no longer triggers a "User Account Control" prompt every time it launches
- Previously, Windows displayed "Do you want to allow this app from an unknown publisher to make changes to your device?" on every app start, requiring manual confirmation
- The installer still requests admin elevation when needed (for firewall rules and registry entries), but the app itself now runs with standard user permissions
- **Auto-start on boot now works reliably** — Windows can silently launch the app after a reboot without being blocked by a UAC prompt

### POS Reports Business Date Fix
- POS reports no longer use the browser's clock to determine "today" — they now wait for the server's business date before loading any data
- Previously, if the browser's UTC time was ahead of the property's local time (e.g., 12:54 AM PST = 8:54 AM UTC next day), the date picker would flash the wrong date and reports could query with an incorrect business date
- Report queries are now blocked until the server confirms the current business date, eliminating the race condition
- When the modal closes and reopens, it fetches the business date fresh each time

## Server Changes

### Business Date Query Parameter
- Single-day POS reports now filter by `businessDate` (matching the check's stamped business date) instead of `startDate/endDate` timestamp ranges
- This ensures checks always appear under the correct business date regardless of timezone differences between the server and browser
