# Cloud POS v1.3.0 - Release Notes

## Comprehensive Offline Mode Fixes

### Database Migrations (Auto-applied on startup)
- Added missing `check_number` column to `offline_checks` table (was causing checks to fail saving)
- Added missing `priority` column to `offline_queue` table (was preventing sync queue operations)
- Added missing `tender_id` column to `offline_payments` table (was breaking payment recording)

### Open Checks Sync
- Cloud open checks are now synced to local SQLite during `syncFromCloud` so they appear when the terminal goes offline
- `getOfflineChecks` now returns both locally-created and cloud-synced checks
- Check lookup (`getOfflineCheck`) now resolves by both local ID and `cloud_id` for cloud-originated checks

### New Offline API Handlers
- `POST /api/checks/:id/send` - Mark items as sent (queued for KDS sync when online)
- `POST /api/checks/:id/print` - Queue receipt print for sync
- `POST /api/checks/:id/lock` / `unlock` - Check locking/unlocking
- `POST /api/checks/:id/discount` - Apply discounts with proper total recalculation
- `GET /api/checks/open` - Return open checks from local database
- `GET /api/checks/locks` - Return empty locks (all local)
- `GET /api/checks/:id/full-details` - Full check detail lookup
- `GET /api/checks/:id/discounts` - Check discount list
- `GET /api/item-availability` - Returns empty (all items available offline)
- `POST /api/system-status/workstation/heartbeat` - Heartbeat response
- `GET/POST /api/gift-cards` - Graceful "requires cloud connection" message
- `POST /api/loyalty` - Graceful "requires cloud connection" message

### Offline Status Bar Fix
- Connected Electron's IPC `online-status` event to the web app's offline mode system
- Red "Offline Mode" banner now appears immediately when Electron detects connection loss (not just when a fetch fails)
- Checks initial online status on app load via `getOnlineStatus` IPC

### Updated Endpoint Coverage
- Added `/api/item-availability`, `/api/gift-cards`, `/api/system-status`, `/api/loyalty` to `canHandleOffline()` endpoint lists
