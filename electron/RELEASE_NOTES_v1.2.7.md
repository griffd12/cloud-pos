# Cloud POS v1.2.7 - SQLite Native Module Fix

## SQLite Now Properly Bundled

### Root Cause
In previous versions, `better-sqlite3` was listed in the electron-builder file configuration but was never actually installed as a project dependency. This meant the installer had no native SQLite binary to bundle, so every terminal fell back to slower JSON file storage for offline data.

### What's Fixed
- **better-sqlite3 installed as a real dependency** — the native SQLite module is now properly included in the project and will be compiled for Windows x64 during the build process
- **asarUnpack configured** — native `.node` binary files for better-sqlite3 (and keytar) are extracted outside the Electron asar archive so they can be loaded by the Node.js runtime
- **Enhanced logging** — the offline database initialization now logs the specific error message if better-sqlite3 fails to load, plus a success message when it loads correctly, making future diagnostics easier

### What This Means
- Offline data storage will use a real SQLite database instead of JSON files
- Faster queries for menu items, employees, modifiers, and all cached POS data
- More reliable offline operation under heavy load
- SQLite WAL (Write-Ahead Logging) mode provides better concurrent read/write performance

## Upgrade Notes
- Terminals running v1.2.6 will auto-update to v1.2.7
- After update, check the app log — you should see `better-sqlite3 native module loaded successfully` instead of the old `using JSON file storage` warning
- The first launch after update will re-sync all 32 tables into the new SQLite database
- Run the Offline System Verification page to confirm SQLite is active
