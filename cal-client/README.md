# OPS-POS CAL Client

Background service for managing workstation software deployments, similar to Oracle Simphony's CAL Client.

## Overview

The CAL Client runs on each workstation and:
1. Polls for pending CAL package deployments (from Service Host or EMC)
2. Downloads and installs packages
3. Tracks installed package versions locally
4. Reports deployment status back to EMC

## Architecture

```
EMC (Cloud)
    ↓ Creates deployments
Service Host (On-Premise)  ←──or──→  EMC (Direct fallback)
    ↓ Caches/proxies packages
CAL Client (Workstation)
    ↓ Polls every 5 minutes
Local Registry (installed.json)
    Tracks: packageName, version, installDate
```

## Installation

### Prerequisites
- Node.js 18+ installed on the workstation
- Device registered via CAL Setup Wizard

### Manual Installation
```bash
cd cal-client
npm install
npm run build
npm run service:install
```

### Via CAL Setup Wizard
The CAL Setup Wizard can automatically install and configure the CAL Client during device provisioning.

## Configuration

Configuration is loaded from:
1. Environment variables (highest priority)
2. Config file at `%ProgramData%/OPS-POS/cal-client/config.json` (Windows)
   or `~/.ops-pos/cal-client/config.json` (Linux)

### Configuration Options

| Option | Env Variable | Description |
|--------|--------------|-------------|
| cloudUrl | CAL_CLOUD_URL | URL of the cloud EMC |
| serviceHostUrl | CAL_SERVICE_HOST_URL | URL of local Service Host (optional) |
| deviceId | CAL_DEVICE_ID | Registered device ID |
| deviceToken | CAL_DEVICE_TOKEN | Device authentication token |
| propertyId | CAL_PROPERTY_ID | Property ID for this device |
| calRootDir | CAL_ROOT_DIR | Root directory for CAL installs (default: C:\OPS-POS) |
| pollIntervalMs | CAL_POLL_INTERVAL_MS | Polling interval in ms (default: 300000 = 5 min) |
| logLevel | CAL_LOG_LEVEL | Log level: debug, info, warn, error |

### Example config.json
```json
{
  "cloudUrl": "https://your-cloud-pos.replit.app",
  "serviceHostUrl": "http://192.168.1.100:3001",
  "deviceId": "ws-123-abc",
  "deviceToken": "device-auth-token-here",
  "propertyId": "prop-456-def",
  "calRootDir": "C:\\OPS-POS",
  "pollIntervalMs": 300000,
  "logLevel": "info"
}
```

## Windows Service Management

```bash
# Install as Windows service
npm run service:install

# Start service
npm run service:start

# Stop service
npm run service:stop

# Uninstall service
npm run service:uninstall
```

## Running Manually (for testing)

```bash
npm run dev
```

## Local Package Registry

Installed packages are tracked in `installed.json`:
- Location: `%ProgramData%/OPS-POS/cal-client/installed.json`
- Contains: package name, type, version, install date, install path

## Deployment Hierarchy

CAL deployments follow Oracle Simphony's "most specific wins" pattern:

1. **Workstation-level** (priority 100) - Specific to this workstation
2. **Property-level** (priority 500) - Applies to all workstations at this property
3. **Enterprise-level** (priority 1000) - Applies to all properties

If the same package is deployed at multiple levels, the most specific deployment wins.

## Package Installation

When a pending deployment is found:
1. Package is downloaded from EMC/Service Host
2. Package is extracted to `C:\OPS-POS\Packages\{name}-{version}\`
3. Install script is executed (`install.bat` or `install.ps1` on Windows)
4. Status is reported back to EMC
5. Local registry is updated

### Install Script Environment Variables

| Variable | Description |
|----------|-------------|
| CAL_ROOT_DIR | Root installation directory |
| CAL_PACKAGE_NAME | Package name |
| CAL_PACKAGE_VERSION | Package version |
| CAL_PACKAGE_TYPE | Package type |
| CAL_PACKAGE_DIR | Extracted package directory |
| CAL_DEVICE_ID | Device ID |
| CAL_PROPERTY_ID | Property ID |

## Troubleshooting

### Service won't start
- Check config.json exists and is valid JSON
- Verify cloudUrl is accessible
- Check device token is valid

### Packages not installing
- Check EMC for deployment status
- Verify deployment is scheduled (not future-dated)
- Check CAL Client logs in Event Viewer (Windows)

### Connection issues
- If Service Host is unavailable, CAL Client will fall back to EMC after 3 failures
- Check network connectivity to Service Host/EMC
