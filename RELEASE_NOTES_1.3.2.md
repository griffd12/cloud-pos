# Cloud POS v1.3.2 Release Notes

**Release Date:** February 12, 2026

---

## Highlights

- Near-instant item ring-in on the POS (previously ~3 seconds)
- Improved EMC navigation with back button and grid return on tree clicks
- Enhanced error resilience for background operations

---

## Performance

### POS Item Ring-In Speed
The most impactful change in this release. Adding menu items to a check is now near-instant, down from a noticeable ~3 second delay in production environments.

**What changed:**
- Server-side database queries are now parallelized instead of running one after another
- Duplicate data lookups eliminated
- Tax calculations reuse already-loaded data instead of re-fetching
- Non-critical operations (KDS updates, total recalculation) now run in the background after the POS screen has already updated
- Check totals recalculation optimized to avoid redundant lookups per item

**What you'll notice:**
- Items appear on the check immediately when tapped
- Modifier selection modal closes instantly after confirmation
- If the server encounters an issue, the item is automatically removed and an error is displayed

---

## EMC Improvements

### Configuration Grid Navigation
- **Back button** added to the header bar when viewing any configuration page -- one click returns you to the main configuration grid
- **Tree node clicks** (Enterprise, Property, or RVC) now return to the configuration grid while preserving your scope selection
- Previously there was no way to navigate back to the grid from a configuration page

### Access Control
- Non-admin users are now properly redirected away from admin-only pages when scope changes

---

## Reliability

- Background operations (KDS preview, bumped ticket recall, total recalculation) now include error handling and logging -- a failure in one background task no longer affects others
- Failed item additions properly restore availability counts and clean up the UI

---

## Upgrade Notes

| Station Type | Action Required |
|---|---|
| **Cloud / Web POS** | Republish the server -- all fixes apply immediately |
| **Windows Electron** | Auto-update delivers v1.3.2 automatically. Performance fix is server-side, so stations benefit as soon as the server is updated |

- No database migrations required
- No configuration changes needed
- Fully backward compatible with v1.3.1
