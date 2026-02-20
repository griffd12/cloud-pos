# Cloud POS v1.4.3 Release Notes

**Release Date:** February 20, 2026

---

## Fixes

### Serial Printer Support - Module Bundling
- Added `serialport` and `@serialport/*` native modules to the Electron build
- v1.4.1 included serial routing code but did not bundle the `serialport` npm package, causing "serial port support not available" errors when printing to COM port printers
- Native bindings are now unpacked from ASAR for proper loading on Windows

### Print Job Routing - Schema Fix (Server-Side)
- Added `connection_type`, `com_port`, and `baud_rate` columns to the `print_jobs` database table
- Previous versions silently dropped these fields when creating print jobs, causing the agent to default to network printing and fail with "no printer IP" for serial printers
- Print jobs now correctly carry serial connection info from server to agent

### Build Configuration Fix
- Removed `beforeBuild` hook from v1.4.2 that was interfering with module packaging, causing `ws`, `better-sqlite3`, and `electron-updater` to be missing from the final installer
- Added automated `prebuild-cleanup.cjs` script to prevent node-gyp from attempting to recompile serialport (which requires Python); serialport uses prebuilt win32-x64 binaries instead
- `npmRebuild` remains enabled so `better-sqlite3` and `keytar` are correctly rebuilt for Electron's ABI

---

## Summary of Fixes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| "no printer IP" error on serial printers | `print_jobs` table missing connection columns | Added `connection_type`, `com_port`, `baud_rate` columns to schema |
| "serial port support not available" | `serialport` module not bundled in Electron | Added to `electron-builder.json` files + asarUnpack |
| "Cannot find module 'ws'" (v1.4.2) | `beforeBuild` hook interfered with packaging | Removed hook, added prebuild-cleanup script |
| "better-sqlite3 not available" (v1.4.2) | Same build issue as above | Same fix |
| "electron-updater not available" (v1.4.2) | Same build issue as above | Same fix |

---

## Upgrade Instructions

1. Download `Cloud-POS-1.4.3-Setup.exe` from GitHub Releases
2. Run the installer -- it will automatically replace the previous version
3. Print agent will reconnect automatically
4. Serial printers (COM port) will now work correctly

---

## Build Command (Windows)

```
npm install && node electron/prebuild-cleanup.cjs && npx electron-builder --config electron/electron-builder.json --win
```

The cleanup script automatically removes `@serialport/bindings-cpp/binding.gyp` to prevent node-gyp from trying to recompile serialport (which needs Python). Serialport uses its prebuilt win32-x64 binary instead.

---

## Compatibility

- Fully backward compatible with v1.4.1
- No breaking changes
- Database schema changes applied automatically on server
- Network printer configurations are unaffected
