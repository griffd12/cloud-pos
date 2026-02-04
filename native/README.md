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

## Native Hardware Integration (Phase 3) - IMPLEMENTED

Native apps can optionally integrate with Bluetooth/USB hardware for enhanced capabilities.

### Native Printer Service

Supports Bluetooth and USB receipt printers in addition to network TCP/IP printing:

```typescript
import { nativePrinter } from '@/lib/native-printer';

// Initialize (call once at app startup)
await nativePrinter.initialize();

// Discover Bluetooth printers
const printers = await nativePrinter.discoverBluetoothPrinters();

// Connect to a printer
await nativePrinter.connectPrinter(printers[0].address);

// Print a receipt
await nativePrinter.print({
  id: 'receipt-123',
  type: 'receipt',
  data: base64EscPosData,
});

// Check result - if no Bluetooth, use existing print infrastructure
const result = await nativePrinter.print(job);
if (!result.success && result.error === 'NO_BLUETOOTH_PRINTER') {
  // Fall back to existing PrintService for network printing
}
```

**Fallback Behavior:**
- If Bluetooth printer is connected → prints directly via Bluetooth
- If no Bluetooth printer → returns `error: 'NO_BLUETOOTH_PRINTER'` signal
- Caller should then use existing PrintService (e.g., `/api/print/check/:checkId`)
- Web browsers should use existing PrintService directly

### Native EMV Terminal Service

Supports Bluetooth EMV card readers (BBPOS, PAX, etc.) in addition to gateway processing:

```typescript
import { nativeEMVTerminal } from '@/lib/native-emv-terminal';

// Initialize
await nativeEMVTerminal.initialize();

// Discover terminals
const terminals = await nativeEMVTerminal.discoverTerminals();

// Connect to a terminal
await nativeEMVTerminal.connectTerminal(terminals[0].address);

// Process a transaction
const result = await nativeEMVTerminal.processTransaction({
  amount: 1500, // $15.00 in cents
  transactionType: 'sale',
  referenceId: 'check-456',
});

// Check result - if no terminal, use existing payment flow
if (!result.success && result.error === 'NO_BLUETOOTH_TERMINAL') {
  // Fall back to existing POS payment components
}
```

**Fallback Behavior:**
- If Bluetooth terminal is connected → processes via EMV terminal SDK
- If no terminal → returns `error: 'NO_BLUETOOTH_TERMINAL'` signal
- Caller should then use existing POS payment flow (CheckPayment, etc.)
- Web browsers should use existing payment components directly

**Note:** Native EMV terminal processing requires vendor SDK integration (BBPOS, PAX, Square, etc.). The current implementation is a stub that signals fallback to existing payment infrastructure.

### Native Services Manager

Coordinates initialization of all native services:

```typescript
import { nativeServices } from '@/lib/native-services';

// Initialize all services at once
await nativeServices.initialize();

// Check status
const status = nativeServices.getStatus();
console.log(status);
// {
//   platform: 'android',
//   storage: { initialized: true, backend: 'sqlite' },
//   printer: { initialized: true, nativeAvailable: true, connectedPrinter: 'Star TSP100' },
//   emvTerminal: { initialized: true, nativeAvailable: false, connectedTerminal: null }
// }
```

### Hardware Plugin Dependencies

For Android native hardware support, install the following Capacitor plugins:

```bash
# Bluetooth Serial for receipt printers
npm install @nichesoft/capacitor-bluetooth-serial
npx cap sync android

# For EMV terminals, integrate the vendor's SDK:
# - BBPOS: Add BBPOS SDK to android/app/libs/
# - PAX: Add PAX SDK to android/app/libs/
# - Square: Use Square's Capacitor plugin
```

### Important Notes

1. **All native hardware is OPTIONAL** - existing Print Agent and payment gateways work without changes
2. **Web browsers** always use network/API fallbacks
3. **Electron/Windows** uses Print Agent for receipts and gateway for payments
4. **Android** can use either Bluetooth hardware OR network/API fallbacks
