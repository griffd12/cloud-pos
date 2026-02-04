# Cloud POS Native Applications

This directory contains configuration and documentation for building native Android and Windows applications from the Cloud POS web application.

## Architecture Overview

The native apps are **wrappers** around the existing web application:
- **Android**: Built using Capacitor, which wraps the React web app in a native WebView
- **Windows**: Built using Electron, which wraps the React web app in a Chromium-based window

All POS functionality remains identical - the same React code runs in both web browsers and native containers.

## Directory Structure

```
native/
├── android/          # Android-specific configuration and assets
├── windows/          # Windows/Electron-specific configuration
└── README.md         # This file

android/              # Capacitor-generated Android project (at repo root)
├── app/
│   └── src/main/
│       ├── assets/public/   # Built web app copied here
│       └── AndroidManifest.xml
└── ...

electron/             # Electron project for Windows (at repo root)
└── ...
```

## Building for Android

### Prerequisites
- Android Studio installed
- Android SDK (API level 21+)
- Java JDK 17+

### Build Steps

1. **Build the web app first:**
   ```bash
   npm run build
   ```

2. **Sync web assets to Android:**
   ```bash
   npx cap sync android
   ```

3. **Open in Android Studio:**
   ```bash
   npx cap open android
   ```

4. **Build APK from Android Studio:**
   - Build > Build Bundle(s) / APK(s) > Build APK(s)
   - Or use Gradle: `./gradlew assembleDebug`

### Configuration

The Android app connects to the cloud backend. Configure the server URL:

- **Development**: Set `CAPACITOR_SERVER_URL` environment variable
- **Production**: Update `capacitor.config.ts` with production URL

## Building for Windows

### Prerequisites
- Node.js 18+
- npm or yarn

### Build Steps

1. **Build the web app:**
   ```bash
   npm run build
   ```

2. **Build Windows executable:**
   ```bash
   npx electron-builder --config electron/electron-builder.json
   ```

The output will be in `electron-dist/`.

## Server Connection

Both native apps connect to the same cloud backend as the web version:
- EMC (Enterprise Management Console) remains fully cloud-based
- POS operations sync with the cloud backend
- Offline mode uses local SQLite for data persistence (Phase 2)

### Connection Modes

**Remote Mode (Recommended)**
Set the server URL to connect to cloud or on-premise CAPS:
- Android: Set `CAPACITOR_SERVER_URL` environment variable before building
- Windows: Set `ELECTRON_SERVER_URL` environment variable before running

**Standalone Mode (Offline Testing)**
If no server URL is set, apps load from `dist/public/`:
- Useful for demos, training, or situations where network is unavailable at startup
- Note: In standalone mode, no backend sync occurs until server URL is configured

### App Icons

Custom app icons can be added:
- **Android**: Place icons in `android/app/src/main/res/` (mipmap folders)
- **Windows**: Place `icon.ico` in `electron/assets/` and update electron-builder.json

Without custom icons, default Capacitor/Electron icons are used.

## Feature Parity Guarantee

All functionality available in the web POS is available in native apps:
- Menu display and ordering
- Check management
- Payment processing
- KDS integration
- Receipt printing (via network or native plugins)
- Employee management and time clock

## Offline Mode (Phase 2) - IMPLEMENTED

Native apps include enhanced offline capabilities using a unified storage layer:

### Storage Architecture
- **Native Android (Capacitor)**: SQLite database via @capacitor-community/sqlite
- **Web Browsers**: IndexedDB (existing behavior preserved)
- **Windows (Electron)**: IndexedDB with file-based persistence

### Features
- **Automatic platform detection**: Storage backend selected based on runtime environment
- **Same API across all platforms**: No code changes needed in business logic
- **Data migration**: Import/export between backends for platform transitions
- **Background sync**: Queued operations sync when connectivity is restored
- **Conflict resolution**: Last-write-wins with configurable strategies

### Storage Components
- **Config cache**: Menu items, employees, tax groups cached for offline access
- **Offline checks**: Full transaction support when cloud is unavailable
- **Sync queue**: Pending operations queued and retried automatically
- **Print queue**: Print jobs queued for when printers become available
- **Session data**: Employee login state persisted across app restarts

### Usage
The unified storage is automatically initialized when the app starts:
```typescript
import { unifiedStorage } from '@/lib/unified-storage';

// Check which backend is active
const stats = await unifiedStorage.getStorageStats();
console.log(stats.backend); // 'sqlite' or 'indexeddb'
console.log(stats.platform); // 'capacitor', 'electron', or 'web'

// Data migration when transitioning platforms
const { migrated, errors } = await unifiedStorage.migrateFromIndexedDB();

// Export data for backup
const backup = await unifiedStorage.exportData();

// Import from backup
await unifiedStorage.importData(backup);
```

### Integration Notes
- The unified storage layer provides the same API as existing IndexedDB storage
- Business logic in POS/KDS components uses the existing offlineStorage directly
- For new code, prefer using unifiedStorage which auto-selects the best backend
- Electron/Windows uses IndexedDB for reliability (no native C++ dependencies)
