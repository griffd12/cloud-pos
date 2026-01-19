# OPS-POS CAL Setup Wizard (Electron) v2.0.0

A desktop application for provisioning OPS-POS devices with **automatic service provisioning** based on workstation configuration in EMC.

## What's New in v2.0.0

- **Auto-Provisioning**: Wizard automatically provisions services based on EMC workstation bindings
- **Service Binding Display**: Shows assigned services (CAPS, Print, KDS, Payment) for each workstation
- **Print Agent Auto-Setup**: Automatically creates, configures, and starts Print Agents
- **Status Reporting**: Reports setup progress back to EMC in real-time
- **Status Badges**: Device list shows setup status (COMPLETE, IN PROGRESS, FAILED)

## What This Wizard Does

1. **Connects to Cloud** - Validates connectivity to your OPS-POS cloud environment
2. **Authenticates** - Signs in with EMC administrator credentials
3. **Selects Property** - Chooses which property this device belongs to
4. **Displays Workstations** - Shows available devices with their service bindings:
   - CAPS (Central Application Processing Server)
   - Print Controller
   - KDS Controller
   - Payment Controller
5. **Auto-Provisions Services**:
   - Reads service bindings configured in EMC
   - Creates Print Agents with secure tokens (if Print Controller assigned)
   - Downloads and configures Print Agent software
   - Starts Print Agent as background service
   - Creates OPS-POS directory structure
   - Registers device with secure token binding
6. **Reports Status** - Updates EMC with setup progress (in_progress → completed/failed)
7. **Launches POS** - Opens the POS/KDS in the default browser with device token

## Service Binding Workflow

### In EMC (Before Running Wizard)
1. Navigate to Device Configuration → Workstations
2. Select a workstation
3. Assign service bindings (CAPS, Print Controller, KDS Controller, Payment Controller)
4. Save the workstation configuration

### On Terminal (Running Wizard)
1. Launch the CAL Setup Wizard
2. Enter cloud URL and authenticate
3. Select property
4. View workstations with their assigned services
5. Select the workstation to provision
6. Wizard auto-provisions all assigned services
7. Monitor status badge in EMC device list

## Directory Structure Created

```
C:\OPS-POS\
├── ServiceHost\
│   ├── service-host.exe     # Service Host executable
│   ├── data\                # Local SQLite database
│   └── logs\                # Service Host logs
├── Packages\                # Downloaded CAL packages
├── PrintAgent\
│   ├── index.js             # Print Agent application
│   ├── config.json          # Auto-generated configuration with token
│   └── node_modules\        # Dependencies
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
- `dist/OPS-POS CAL Setup Wizard Setup 2.0.0.exe` (installer)
- `dist/OPS-POS CAL Setup Wizard 2.0.0.exe` (portable)

### Build for macOS
```bash
npm run build:mac
```

### Build for Linux
```bash
npm run build:linux
```

## API Endpoints Used

The wizard communicates with these EMC endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Validate cloud connectivity |
| `/api/login` | POST | Authenticate with EMC credentials |
| `/api/properties` | GET | Fetch available properties |
| `/api/cal-setup/devices` | GET | Fetch workstations with service bindings |
| `/api/cal-setup/provision-services` | POST | Auto-provision services for workstation |
| `/api/cal-setup/report-status` | POST | Report setup status to EMC |
| `/api/devices/register-device` | POST | Register device with secure token |

## Security Features

- **Device Token Binding**: Each device receives a unique cryptographic token during registration
- **Print Agent Tokens**: Each Print Agent gets a unique secure token for authentication
- **Token Storage**: Tokens are stored securely in configuration files and browser localStorage
- **EMC Authentication**: Administrator credentials are validated against the cloud before installation
- **Property Access Control**: Status reporting validates user has access to workstation's property
- **No Hardcoded Credentials**: All authentication happens at runtime against your cloud environment

## Status Reporting

The wizard reports setup status to EMC throughout the provisioning process:

| Status | Description |
|--------|-------------|
| `pending` | Workstation not yet set up |
| `in_progress` | Setup currently running |
| `completed` | Setup finished successfully |
| `failed` | Setup encountered an error |

View status in EMC under Device Configuration → Workstations. Each device displays a status badge.

## Troubleshooting

### "Cannot connect to cloud"
- Verify the cloud URL is correct
- Check network connectivity
- Ensure firewall allows outbound HTTPS

### "No service bindings found"
- Configure service bindings in EMC before running wizard
- Navigate to Device Configuration → Workstations → Edit → Service Bindings

### "Print Agent setup failed"
- Check that Node.js is installed on the terminal
- Verify write permissions to `C:\OPS-POS\PrintAgent\`
- Check Print Agent logs in `C:\OPS-POS\PrintAgent\logs\`

### "Service Host download failed"
- The installer will continue in browser-only mode
- Manually download service-host.exe and place in `C:\OPS-POS\ServiceHost\`

### "Permission denied creating directories"
- Run the wizard as Administrator on Windows
- Ensure you have write access to the install directory

## Offline Mode

Once installed, devices can operate offline using the Service Host's local SQLite database. The Service Host automatically syncs with the cloud when connectivity is restored.

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-01 | Auto-provisioning based on EMC service bindings, Print Agent auto-setup, status reporting |
| 1.0.3 | 2025-12 | Bug fixes and stability improvements |
| 1.0.0 | 2025-11 | Initial release with manual CAL package selection |
