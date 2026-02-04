# Windows Configuration (Electron)

## App Identity

- **App ID**: `com.cloudpos.desktop`
- **App Name**: Cloud POS
- **Output Formats**: NSIS Installer, Portable EXE

## Build Requirements

- Node.js 18+
- Windows build tools (for native modules)
- Wine (if cross-compiling from Linux/Mac)

## Building

### Development Mode
```bash
# Build web app first
npm run build

# Start Electron in dev mode
npx electron electron/main.js
```

### Production Build
```bash
# Build web app
npm run build

# Build Windows installer
npx electron-builder --config electron/electron-builder.json
```

Output will be in `electron-dist/`:
- `Cloud POS-x.x.x-Windows.exe` - NSIS installer
- `Cloud POS-x.x.x-Portable.exe` - Portable version

## Server URL Configuration

### Cloud Backend (Default)
The app connects to the cloud backend. Set URL via environment variable:
```bash
set ELECTRON_SERVER_URL=https://your-server.repl.co
npm run electron:dev
```

### On-Premise CAPS
For on-premise deployments:
```bash
set ELECTRON_SERVER_URL=http://192.168.1.100:3000
npm run electron:dev
```

### Standalone Mode
If `ELECTRON_SERVER_URL` is not set, the app loads the local build from `dist/public/`.
This is useful for:
- Demo/training environments
- Situations where network is unavailable during app startup

## Window Settings

The Electron window is optimized for POS use:
- **Minimum size**: 1024x768
- **Default size**: 1280x1024
- **Fullscreen**: Supported (F11 key)
- **Menu bar**: Hidden in production

## Security

- Node integration disabled
- Context isolation enabled
- Navigation restricted to trusted origins
- External links open in default browser

## Troubleshooting

### App shows white screen
- Verify web app is built: `npm run build`
- Check `dist/public/index.html` exists
- Verify server URL is accessible

### Cannot connect to server
- Check `ELECTRON_SERVER_URL` is set correctly
- Verify network connectivity
- Check firewall settings

### Build fails on Windows
- Install Windows Build Tools: `npm install -g windows-build-tools`
- Run as Administrator if permission errors occur

## Distribution

### Code Signing (Recommended for Production)
1. Obtain code signing certificate from trusted CA
2. Configure in `electron-builder.json`:
```json
{
  "win": {
    "certificateFile": "path/to/cert.pfx",
    "certificatePassword": "your-password"
  }
}
```

### Auto-Update
For automatic updates, add electron-updater:
```bash
npm install electron-updater
```
Then configure update server URL in the app.
