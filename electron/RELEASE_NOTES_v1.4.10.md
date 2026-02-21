# Cloud POS v1.4.10 Release Notes

## Bug Fixes

### Windows USB Printer - FileStream Fix
- **Fixed**: PowerShell `FileStream` constructor failure that prevented USB printing
  - Root cause: `New-Object System.IO.FileStream(...)` in PowerShell treats parenthesized arguments as a single grouped expression, causing "Cannot find an overload for 'FileStream' and the argument count: '1'" error
  - Fix: Replaced with `[System.IO.FileStream]::new(...)` which correctly passes all 4 constructor arguments (path, FileMode, FileAccess, FileShare)
  - Also separated port path construction (`\\.\` + portName) into its own variable for clarity
- **Impact**: USB receipt printing and cash drawer kick now work correctly on Windows workstations using Star TSP100/TSP143 and other Windows Print Spooler devices

## Upgrade Notes
- Auto-update from v1.4.9 via electron-updater
- No database migration required
- No configuration changes needed — existing printer configurations will work immediately after update
