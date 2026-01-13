# Cloud POS Service Host - Deployment Guide

This guide covers deploying and testing the Service Host for offline POS operations.

## Overview

The Service Host is an on-premise Node.js server that enables:
- **CAPS (Cloud Access Point Sync)** - Check control and sync with cloud
- **Print Controller** - Local receipt/ticket printing
- **KDS Controller** - Kitchen display updates
- **Payment Controller** - Terminal management

### Connection Modes

| Mode | Cloud | Service Host | Browser | Description |
|------|-------|--------------|---------|-------------|
| GREEN | ✓ | Optional | - | Normal cloud operation |
| YELLOW | ✗ | ✓ | - | LAN-only via Service Host |
| ORANGE | ✗ | ✗ | ✓ | Browser IndexedDB only |
| RED | ✗ | ✗ | ✗ | No connectivity |

## Prerequisites

- Windows 10/11 or Windows Server 2016+
- Node.js 18+ (auto-installed by installer)
- Network access to Cloud POS URL
- Service Host registered in EMC

## Installation Methods

### Method 1: Standalone Executable (Recommended)

The standalone `.exe` includes Node.js bundled inside - no installation required.

1. Download `CloudPOS-ServiceHost-v{version}-win.exe` from EMC or CAL
2. Create `config.json` in the same directory (see Configuration section)
3. Run the executable

To install as a Windows Service with the standalone exe:
```powershell
nssm install CloudPOSServiceHost "C:\CloudPOS\ServiceHost\CloudPOS-ServiceHost.exe"
nssm set CloudPOSServiceHost AppDirectory "C:\CloudPOS\ServiceHost"
nssm start CloudPOSServiceHost
```

### Method 2: Windows Installer (With Node.js)

1. Download the installer package from EMC or CAL
2. Extract the ZIP file
3. Right-click `Install.bat` → "Run as Administrator"
4. Follow the prompts to enter:
   - Cloud POS URL (e.g., `https://your-app.replit.app`)
   - Service Host ID (from EMC)
   - Registration Token (from EMC)
5. The service will be installed and started automatically

Note: This method will auto-install Node.js if needed.

### Method 3: Silent Installation

```powershell
.\Install-ServiceHost.ps1 -Silent `
  -CloudUrl "https://your-app.replit.app" `
  -ServiceHostId "your-service-host-id" `
  -Token "your-registration-token"
```

### Method 4: Manual Installation

1. Install Node.js 18+
2. Copy Service Host files to `C:\CloudPOS\ServiceHost`
3. Install dependencies:
   ```cmd
   cd C:\CloudPOS\ServiceHost
   npm install --production
   ```
4. Create `config.json`:
   ```json
   {
     "cloudUrl": "https://your-app.replit.app",
     "serviceHostId": "your-id",
     "registrationToken": "your-token",
     "propertyId": "your-property-id",
     "localPort": 3001
   }
   ```
5. Start:
   ```cmd
   npm start
   ```

## Getting Credentials from EMC

1. Log into your Cloud POS EMC
2. Navigate to **Admin → Service Hosts**
3. Click **Register New Service Host**
4. Fill in:
   - **Name**: Descriptive name (e.g., "Newport-ServiceHost-1")
   - **Property**: Select your property
   - **Workstation**: Optionally bind to a specific workstation
   - **Services**: Select which services to enable
     - CAPS (required for offline checks)
     - Print Controller
     - KDS Controller
     - Payment Controller
5. Click **Create**
6. **Copy the Token** - it's only shown once!

## Configuration Reference

### config.json

```json
{
  "cloudUrl": "https://your-app.replit.app",
  "serviceHostId": "uuid-from-emc",
  "registrationToken": "token-from-emc",
  "propertyId": "your-property-uuid",
  "localPort": 3001,
  
  "services": {
    "caps": true,
    "printController": true,
    "kdsController": true,
    "paymentController": false
  },
  
  "sync": {
    "intervalMs": 30000,
    "retryDelayMs": 5000,
    "maxRetries": 3
  },
  
  "database": {
    "path": "./data/local.db"
  },
  
  "logging": {
    "level": "info",
    "file": "./logs/service-host.log"
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cloudUrl` | string | required | Cloud POS instance URL |
| `serviceHostId` | string | required | Service Host ID from EMC |
| `registrationToken` | string | required | One-time token from EMC |
| `propertyId` | string | required | Property UUID |
| `localPort` | number | 3001 | Port for local API/WebSocket |
| `services.caps` | boolean | true | Enable check sync |
| `services.printController` | boolean | true | Enable printing |
| `services.kdsController` | boolean | true | Enable KDS |
| `services.paymentController` | boolean | false | Enable payment terminals |
| `sync.intervalMs` | number | 30000 | Config sync interval |
| `database.path` | string | ./data/local.db | SQLite database path |

## Service Management

### Windows Service Commands

| Action | Command |
|--------|---------|
| Start | `nssm start CloudPOSServiceHost` |
| Stop | `nssm stop CloudPOSServiceHost` |
| Restart | `nssm restart CloudPOSServiceHost` |
| Status | `nssm status CloudPOSServiceHost` |
| Edit Config | `nssm edit CloudPOSServiceHost` |

### Manual Start (Development)

```cmd
cd C:\CloudPOS\ServiceHost
npm start
```

### Viewing Logs

- **Service Logs**: `C:\CloudPOS\ServiceHost\logs\stdout.log`
- **Error Logs**: `C:\CloudPOS\ServiceHost\logs\stderr.log`
- **Application Logs**: `C:\CloudPOS\ServiceHost\logs\service-host.log`

## End-to-End Testing

### Test 1: Basic Connectivity

1. Ensure Service Host is running
2. Open browser to Cloud POS
3. Check EMC → Admin → Service Hosts
4. Verify status shows **ONLINE** (green)

### Test 2: Configuration Sync

1. Make a menu item change in EMC
2. Wait 30 seconds (or force sync)
3. Verify change appears on POS workstation

### Test 3: Offline Check (YELLOW Mode)

1. Disconnect cloud (or use EMC connectivity test to simulate)
2. Workstations should show YELLOW mode
3. Create a new check
4. Add items and process payment
5. Reconnect cloud
6. Verify transaction synced to cloud

### Test 4: Local Printing

1. Configure a network printer in EMC
2. Create and close a check
3. Verify receipt prints to local printer

### Test 5: KDS Integration

1. Ensure KDS device is configured
2. Send items to kitchen (via fire/order send)
3. Verify KDS displays update in real-time

## Firewall Configuration

The Service Host requires the following ports:

| Port | Direction | Purpose |
|------|-----------|---------|
| 3001 (default) | Inbound | Local API & WebSocket |
| 443 | Outbound | HTTPS to Cloud |
| 9100 | Outbound | Network printer (Epson/Star) |

Windows Firewall rule (run as admin):
```powershell
netsh advfirewall firewall add rule name="CloudPOS ServiceHost" dir=in action=allow protocol=TCP localport=3001
```

## Troubleshooting

### Service Won't Start

1. Check logs: `C:\CloudPOS\ServiceHost\logs\stderr.log`
2. Verify `config.json` is valid JSON
3. Ensure Node.js is installed: `node --version`
4. Test manual start: `npm start`

### Not Connecting to Cloud

1. Verify Cloud URL is correct and accessible
2. Check firewall allows outbound HTTPS
3. Confirm registration token hasn't expired
4. Try regenerating token in EMC

### Showing OFFLINE in EMC

1. Check Service Host is running
2. Verify WebSocket connection in logs
3. Check network connectivity
4. Review authentication errors

### Database Errors

1. Ensure `data` directory exists and is writable
2. Try deleting `local.db` and restarting (loses local data)
3. Check disk space

### Print Jobs Failing

1. Verify printer IP/port in EMC configuration
2. Test network connectivity: `ping <printer-ip>`
3. Check printer is online and has paper
4. Review print job errors in logs

## Uninstallation

1. Run `Uninstall.bat` as Administrator

Or manually:
```powershell
nssm stop CloudPOSServiceHost
nssm remove CloudPOSServiceHost confirm
Remove-Item -Recurse -Force C:\CloudPOS\ServiceHost
```

## Architecture Notes

### Data Flow

```
Cloud POS ←→ WebSocket ←→ Service Host ←→ Local SQLite
                                 ↓
                         Workstations/KDS
                                 ↓
                          Local Printers
```

### SQLite Database

The local database (`data/local.db`) stores:
- Cached configuration (menu, employees, etc.)
- Active checks (for offline operation)
- Pending sync queue
- Print job queue

### WebSocket Connection

- Maintains persistent connection to cloud
- Sends heartbeats every 30 seconds
- Auto-reconnects on disconnect
- Authenticates with registration token

## Support

For issues with the Service Host:
1. Check the troubleshooting section above
2. Review logs for error messages
3. Contact your Cloud POS administrator
4. Reference the Service Host status in EMC
