# CAL Setup Wizard

The CAL Setup Wizard is a graphical application that technicians run on new workstations and KDS devices to configure them for OPS-POS operations.

## Overview

This wizard replaces the command-line bootstrap installer with a user-friendly GUI that guides technicians through the complete device setup process:

1. **Connect** - Enter the cloud URL for the customer's environment
2. **Login** - Authenticate with EMC (Enterprise Management Console) credentials
3. **Select Property** - Choose from available properties (if multiple)
4. **Select Device** - Pick the workstation or KDS from the list
5. **Install** - Automatic download and configuration of Service Host and CAL client
6. **Complete** - Summary of the configured device

## How It Works

The wizard follows the Oracle Simphony CAL model:

1. Technician runs the Setup Wizard on the new device
2. Enters the cloud URL for this customer's OPS-POS environment
3. Logs in with their EMC credentials
4. Selects which property this device belongs to
5. Selects which workstation/KDS this device will be configured as
6. The wizard downloads and installs everything automatically

After setup, all future updates are delivered via CAL packages - no manual intervention needed.

## Running the Wizard

### Option 1: Open in Browser

Simply open `index.html` in a web browser on the target device.

Note: Some features (file system access, service installation) require the Electron version.

### Option 2: Electron Application (Recommended)

For full functionality including file system access and service installation:

```bash
# Package as Electron app
npm install -g electron-packager
cd cal-setup-wizard
electron-packager . OPS-POS-Setup --platform=win32 --arch=x64
```

### Option 3: Hosted Web Page

The wizard can also be hosted on a web server and accessed via URL. This is useful for environments where you can't distribute executables.

## API Endpoints

The wizard uses these cloud API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cal-setup/authenticate` | POST | Authenticate with EMC credentials |
| `/api/cal-setup/properties` | GET | Get list of properties user can access |
| `/api/cal-setup/devices/:propertyId` | GET | Get workstations/KDS for a property |
| `/api/cal-setup/register-device` | POST | Register the device and get installation config |
| `/api/cal-setup/config/:deviceId` | GET | Download device configuration |

## Browser vs Electron Differences

| Feature | Browser | Electron |
|---------|---------|----------|
| Device registration | Yes | Yes |
| Configuration download | Yes | Yes |
| Service Host installation | Simulated | Full |
| Directory creation | Simulated | Full |
| Windows Service setup | No | Yes |
| Auto-restart | No | Yes |

The browser version can complete the registration and configuration steps, but actual file system and service operations require the Electron version.

## Technician Workflow

1. Pre-requisites:
   - Device is connected to the network
   - EMC user account with appropriate access level
   - Workstation/KDS already created in EMC

2. Setup Process:
   - Run the Setup Wizard
   - Enter the cloud URL provided by the customer
   - Log in with your EMC credentials
   - Select the property (if shown)
   - Select the device from the list
   - Wait for installation to complete
   - Restart the device when prompted

3. Post-Setup:
   - Device connects to cloud automatically
   - Service Host syncs configuration
   - POS or KDS application is ready to use

## Troubleshooting

### Cannot connect to cloud
- Verify the URL is correct (include https://)
- Check network connectivity
- Verify firewall allows HTTPS traffic

### Login failed
- Verify EMC credentials are correct
- Check if account is active
- Verify account has access to properties

### No devices shown
- Verify workstations/KDS are created in EMC
- Verify they are assigned to the selected property
- Check user has access to view devices

### Installation failed
- Check network connectivity
- Review the installation log for specific errors
- Verify sufficient disk space
- Run wizard as Administrator (Windows)

## Security Notes

- EMC credentials are sent securely over HTTPS
- Session tokens expire after 4 hours
- Service Host tokens are unique per device
- No credentials are stored on the device
