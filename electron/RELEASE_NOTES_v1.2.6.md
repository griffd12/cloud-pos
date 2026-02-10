# Cloud POS v1.2.6 - Offline System Fixes

## Critical Offline Fixes

### Offline Login Now Working
- Added `POST /api/auth/login` handler to the offline API interceptor — login was completely broken when offline because this endpoint had no offline handler
- PIN authentication now works against locally cached employee records in SQLite
- Default POS privileges (fast transaction, send to kitchen, void, discount, admin, KDS, manager approval) are automatically granted during offline login when no role-specific privileges are stored

### Status Bar Fix - Correct Online/Offline Detection
- Fixed critical bug where `/api/health` was being served from the page cache with stale "online" data even when the terminal was actually offline
- API responses are now excluded from the disk page cache entirely — only HTML/JS/CSS assets are cached
- The offline interceptor now returns `offlineMode: true` in the `/api/health` response so the UI properly shows offline status

### Missing Offline API Handlers Added
The login flow calls several endpoints after PIN entry. These were all returning "No offline handler" errors:
- `GET /api/auth/offline-employees` — returns cached employee list for offline auth
- `GET /api/break-rules` — returns empty array (not needed offline)
- `GET /api/time-punches/status/:employeeId` — returns "clocked_in" status offline (skips clock-in requirement)
- `GET /api/employees/:id/job-codes/details` — returns empty array offline (skips job code checks)

### Cloud Server - New Sync Endpoints
Six new API endpoints added to the cloud server for offline database sync:
- `GET /api/tender-types` — tender/payment types with enterprise filtering
- `GET /api/tax-rates` — tax rates/groups with enterprise filtering
- `GET /api/condiment-groups` — condiment group data
- `GET /api/combo-meals` — combo meal configurations
- `GET /api/order-types` — order type list
- `GET /api/menu-item-classes` — menu item classification data

## Upgrade Notes
- **Cloud server must be republished** before updating terminals
- Terminals running v1.2.5 will auto-update to v1.2.6
- After update, run the Offline System Verification page to confirm all tests pass
- Perform a manual offline test: disconnect internet, verify login works, verify status bar shows "OFFLINE"
