# Cloud POS - Electron Build Guide

## Prerequisites
- Node.js 18+ 
- Windows 10/11 (for building Windows installer)
- Visual Studio Build Tools (for native module compilation)

## Native Dependencies
The Electron app requires these native Node.js modules that must be installed before building:

```bash
npm install better-sqlite3 keytar ws --save
```

For SQLCipher encryption support (AES-256), rebuild better-sqlite3 with SQLCipher:
```bash
npm rebuild better-sqlite3 --build-from-source --sqlite3=sqlcipher
```

## Building the Installer

### 1. Bump Version (required before each build)
```bash
node electron/bump-version.cjs patch   # 1.1.0 -> 1.1.1
node electron/bump-version.cjs minor   # 1.1.0 -> 1.2.0
node electron/bump-version.cjs major   # 1.1.0 -> 2.0.0
```

### 2. Build the Web App
```bash
npm run build
```

### 3. Build the Electron Installer
```bash
npx electron-builder --config electron/electron-builder.json --win
```

The installer will be output to `electron-dist/Cloud POS-{version}-Setup.exe`

## Log Files
After installation, logs are written to:
- `%LOCALAPPDATA%\Cloud POS\logs\app.log` - Application startup, config, errors
- `%LOCALAPPDATA%\Cloud POS\logs\print-agent.log` - Print agent connections, jobs, errors
- `%LOCALAPPDATA%\Cloud POS\logs\offline-db.log` - Database init, sync, encryption status
- `%LOCALAPPDATA%\Cloud POS\logs\installer.log` - Installation steps and results

Access logs from the app: Settings menu > View Logs

## Data Directories
- `%LOCALAPPDATA%\Cloud POS\config\` - Settings, printer config
- `%LOCALAPPDATA%\Cloud POS\data\` - SQLite database, offline queue, print queue
- `%LOCALAPPDATA%\Cloud POS\logs\` - Log files (auto-rotated at 5MB, keeps 5 files)
