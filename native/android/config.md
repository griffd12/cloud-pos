# Android Configuration

## App Identity

- **Package Name**: `com.cloudpos.app`
- **App Name**: Cloud POS
- **Minimum SDK**: 21 (Android 5.0 Lollipop)
- **Target SDK**: 34 (Android 14)

## Permissions Required

The Android app requires these permissions (configured in AndroidManifest.xml):

- `INTERNET` - Connect to cloud backend
- `ACCESS_NETWORK_STATE` - Check network connectivity
- `WRITE_EXTERNAL_STORAGE` - Store receipts/reports (legacy, scoped storage used on newer Android)

## Optional Permissions (Phase 3)

These will be added when native hardware integration is implemented:

- `BLUETOOTH` / `BLUETOOTH_ADMIN` - Bluetooth printer support
- `ACCESS_FINE_LOCATION` - Some Bluetooth scanning requires location permission
- `USB_PERMISSION` - USB printer support

## Signing Configuration

For release builds, configure signing in `android/app/build.gradle`:

```groovy
android {
    signingConfigs {
        release {
            storeFile file("path/to/keystore.jks")
            storePassword "your-store-password"
            keyAlias "your-key-alias"
            keyPassword "your-key-password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

## Server URL Configuration

### Development
Set environment variable before building:
```bash
export CAPACITOR_SERVER_URL="https://your-dev-server.repl.co"
npm run build
npx cap sync android
```

### Production
1. Update `capacitor.config.ts` with production URL
2. Rebuild and sync

### On-Premise (CAPS)
For on-premise deployments connecting to local CAPS:
```bash
export CAPACITOR_SERVER_URL="http://192.168.1.100:3000"
```

## Troubleshooting

### White screen on launch
- Check that web assets were synced: `npx cap sync android`
- Verify server URL is accessible from device

### Network errors
- Check `android:usesCleartextTraffic="true"` in AndroidManifest.xml for HTTP URLs
- Verify device has network connectivity

### Build failures
- Ensure Android SDK is up to date
- Run `./gradlew clean` then rebuild
