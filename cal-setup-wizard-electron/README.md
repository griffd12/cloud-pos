# OPS-POS CAL Setup Wizard (Electron)

A desktop application for provisioning OPS-POS devices following the Oracle Simphony CAL (Configuration Asset Library) model.

## What This Wizard Does

1. **Connects to Cloud** - Validates connectivity to your OPS-POS cloud environment
2. **Authenticates** - Signs in with EMC administrator credentials
3. **Selects Property** - Chooses which property this device belongs to
4. **Selects Device** - Picks the workstation or KDS configuration
5. **Installs Software**:
   - Creates the OPS-POS directory structure (`C:\OPS-POS\` on Windows)
   - Downloads and installs the Service Host executable
   - Saves device configuration
   - Registers the device with secure token binding
   - Optionally starts the Service Host as a background process
6. **Launches POS** - Opens the POS/KDS in the default browser with device token

## Directory Structure Created

```
C:\OPS-POS\
├── ServiceHost\
│   ├── service-host.exe     # Service Host executable
│   ├── data\                # Local SQLite database
│   └── logs\                # Service Host logs
├── Packages\                # Downloaded CAL packages
├── PrintAgent\              # Print Agent files
├── Config\
│   └── service-host.json    # Device configuration
└── Logs\                    # Application logs
```

## Building the Executable

### Prerequisites
- Node.js 18+
- npm or yarn

### Development
```bash
cd cal-setup-wizard-electron
npm install
npm start
```

### Build for Windows
```bash
npm run build:win
```
This creates:
- `dist/OPS-POS CAL Setup Wizard Setup 1.0.0.exe` (installer)
- `dist/OPS-POS CAL Setup Wizard 1.0.0.exe` (portable)

### Build for macOS
```bash
npm run build:mac
```

### Build for Linux
```bash
npm run build:linux
```

## Security Features

- **Device Token Binding**: Each device receives a unique cryptographic token during registration
- **Token Storage**: Tokens are stored securely in the configuration file and browser localStorage
- **EMC Authentication**: Administrator credentials are validated against the cloud before installation
- **No Hardcoded Credentials**: All authentication happens at runtime against your cloud environment

## Usage in the Field

1. Download the installer from your IT portal or CAL package system
2. Run the installer on the new device (no installation required for portable version)
3. Enter the cloud URL provided by your IT administrator
4. Sign in with EMC credentials
5. Select the property and device
6. Wait for installation to complete
7. Click "Launch POS" to start using the system

## Offline Mode

Once installed, devices can operate offline using the Service Host's local SQLite database. The Service Host automatically syncs with the cloud when connectivity is restored.

## Troubleshooting

### "Cannot connect to cloud"
- Verify the cloud URL is correct
- Check network connectivity
- Ensure firewall allows outbound HTTPS

### "Service Host download failed"
- The installer will continue in browser-only mode
- Manually download service-host.exe and place in `C:\OPS-POS\ServiceHost\`

### "Permission denied creating directories"
- Run the wizard as Administrator on Windows
- Ensure you have write access to the install directory
