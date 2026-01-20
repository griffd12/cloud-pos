# OPH-POS CAL Setup Wizard (Electron) v2.1.0

A desktop application for provisioning OPH-POS devices with **automatic service provisioning** based on workstation configuration in EMC.

## What's New in v2.1.0

- **Distributed Services Architecture**: Each service (CAPS, Print, KDS, Payment) runs on a designated host workstation
- **Updated Terminology**: "Services" section in EMC replaces the old "Service Host" terminology
- **Auto-Provisioning**: Wizard automatically provisions services based on EMC workstation bindings
- **Service Binding Display**: Shows assigned services (CAPS, Print, KDS, Payment) for each workstation
- **Print Agent Auto-Setup**: Automatically creates, configures, and starts Print Agents
- **CAPS Service Installation**: Downloads and installs CAPS as a Windows service with SQLite database
- **Status Reporting**: Reports setup progress back to EMC in real-time
- **Status Badges**: Device list shows setup status (COMPLETE, IN PROGRESS, FAILED)

## What This Wizard Does

1. **Connects to Cloud** - Validates connectivity to your OPH-POS cloud environment
2. **Authenticates** - Signs in with EMC administrator credentials
3. **Selects Property** - Chooses which property this device belongs to
4. **Displays Workstations** - Shows available devices with their service bindings:
   - CAPS (Central Application Processing Server) - Provides offline POS capability
   - Print Controller - Handles receipt and kitchen printing
   - KDS Controller - Manages Kitchen Display System updates
   - Payment Controller - Processes payment transactions
5. **Auto-Provisions Services**:
   - Reads service bindings configured in EMC
   - Creates Print Agents with secure tokens (if Print Controller assigned)
   - Downloads and configures Print Agent software
   - Configures CAPS with SQLite database for offline operation
   - Starts services as Windows background services
   - Creates OPH-POS directory structure
   - Registers device with secure token binding
6. **Reports Status** - Updates EMC with setup progress (in_progress → completed/failed)
7. **Launches POS** - Opens the POS/KDS in the default browser with device token

## Service Binding Workflow

### In EMC (Before Running Wizard)
1. Navigate to the **Services** section in EMC
2. Create a new Service for your property (CAPS, Print, KDS, or Payment)
3. Assign the service to a host workstation
4. Configure any additional service settings
5. Save the service configuration

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
C:\OPH-POS\
├── ServiceHost\
│   ├── service-host.exe     # CAPS executable (offline processing)
│   ├── config.json          # CAPS configuration with token
│   ├── data\                # Local SQLite database for offline operation
│   └── logs\                # CAPS service logs
├── Packages\                # Downloaded CAL packages
├── PrintAgent\
│   ├── print-agent.js       # Print Agent application
│   ├── config.json          # Auto-generated configuration with token
│   └── node_modules\        # Dependencies
├── CalClient\
│   ├── cal-client.exe       # CAL update client (optional)
│   └── cal-client-config.json
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
This creates (version number from package.json):
- `dist/OPH-POS CAL Setup Wizard Setup {version}.exe` (installer)
- `dist/OPH-POS CAL Setup Wizard {version}.exe` (portable)

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
| `/api/cal-setup/authenticate` | POST | Authenticate with EMC credentials |
| `/api/cal-setup/properties` | GET | Fetch available properties |
| `/api/cal-setup/devices/:propertyId` | GET | Fetch workstations with service bindings |
| `/api/cal-setup/provision-services` | POST | Auto-provision services for workstation |
| `/api/cal-setup/report-status` | POST | Report setup status to EMC |
| `/api/cal-setup/register-device` | POST | Register device with secure token |

## Security Features

- **Device Token Binding**: Each device receives a unique cryptographic token during registration
- **Print Agent Tokens**: Each Print Agent gets a unique secure token for authentication
- **CAPS Tokens**: Each CAPS service has a unique secure token for cloud sync
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

View status in EMC under the Services section. Each workstation displays a setup status badge.

## Troubleshooting

### "Cannot connect to cloud"
- Verify the cloud URL is correct
- Check network connectivity
- Ensure firewall allows outbound HTTPS

### "No service bindings found"
- Configure service bindings in EMC before running wizard
- Navigate to Services section → Create Service → Assign to host workstation

### "Print Agent setup failed"
- Check that Node.js 16.x or later is installed on the terminal (download from https://nodejs.org)
- Verify write permissions to `C:\OPH-POS\PrintAgent\`
- Check console output when running the Print Agent manually

### "CAPS download failed"
- The installer will continue in browser-only mode
- Manually download service-host.exe and place in `C:\OPH-POS\ServiceHost\`
- CAPS is optional but enables offline POS operation

### "Permission denied creating directories"
- Run the wizard as Administrator on Windows
- Ensure you have write access to the install directory

## Offline Mode

Once installed, devices with CAPS can operate offline using the local SQLite database. The CAPS service automatically syncs with the cloud when connectivity is restored, including:
- Menu items and modifiers
- Employee information
- Device configuration
- POS layouts
- Transactions (uploaded on reconnection)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.1.0 | 2026-01-20 | Terminology update: "Services" in EMC, "CAPS" for service, consistent across all UI and docs |
| 2.0.0 | 2026-01-15 | Auto-provisioning based on EMC service bindings, Print Agent auto-setup, status reporting |
| 1.0.3 | 2025-12 | Bug fixes and stability improvements |
| 1.0.0 | 2025-11 | Initial release with manual CAL package selection |

## Release Notes

### v2.1.0 (January 20, 2026)

**Terminology Updates:**
- EMC navigation: "Admin > Services" (previously "Admin > Service Hosts")
- Service name: "CAPS" (Central Application Processing Service)
- Host machine: "Host Workstation" for clarity

**UI Changes:**
- Updated all wizard labels and messages to use "Services" terminology
- Status messages now reference "CAPS" instead of "Service Host"
- Consistent messaging across setup steps

**Documentation:**
- Updated README with v2.1.0 features
- Clarified service binding workflow
- Added terminology section

**Build:**
- Package version: 2.1.0
- Compatible with EMC v2.1.0+
