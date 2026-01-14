# OPS-POS Bootstrap Installer

The Bootstrap Installer is required for the **initial installation** of Service Host on new devices. Once installed, all future updates are delivered automatically via CAL packages.

## Overview

The bootstrap process:
1. Creates the OPS-POS directory structure
2. Downloads the Service Host executable
3. Registers the device with the cloud
4. Installs and starts the Service Host as a system service
5. Configures CAL client for automatic updates

## Prerequisites

Before running the bootstrap installer, you need:

1. **Cloud URL** - The URL of your OPS-POS cloud server (e.g., `https://pos.yourcompany.com`)
2. **Property ID** - The ID of the property this device belongs to (get from EMC)
3. **Registration Token** - A one-time token generated in EMC for device registration

### Getting a Registration Token

1. Log into EMC (Enterprise Management Console)
2. Go to **Devices** → **Service Hosts**
3. Click **"Generate Registration Token"**
4. Copy the token (valid for 24 hours)

## Windows Installation

### Quick Install

Open PowerShell as Administrator and run:

```powershell
.\bootstrap-install.ps1 -CloudUrl "https://pos.yourcompany.com" -PropertyId "prop-uuid" -RegistrationToken "token123"
```

### Full Options

```powershell
.\bootstrap-install.ps1 `
    -CloudUrl "https://pos.yourcompany.com" `
    -PropertyId "prop-uuid" `
    -RegistrationToken "token123" `
    -DeviceName "POS-Terminal-01" `
    -RootDir "D:\OPS-POS"
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| CloudUrl | Yes | - | Cloud server URL |
| PropertyId | Yes | - | Property ID from EMC |
| RegistrationToken | Yes | - | One-time registration token |
| DeviceName | No | Computer name | Display name for the device |
| RootDir | No | C:\OPS-POS | Installation directory |

### What Gets Installed

```
C:\OPS-POS\
├── ServiceHost\
│   ├── service-host.exe      # Main executable
│   ├── data\                  # SQLite database
│   └── logs\                  # Service Host logs
├── Packages\                  # Installed CAL packages
├── PrintAgent\                # Print agent files
├── Config\
│   ├── service-host.json     # Configuration
│   └── auth-token.json       # Cloud authentication
└── Logs\                      # Application logs
```

A Windows Service named **OPS-POS-ServiceHost** is also installed and started.

## Linux Installation

### Quick Install

```bash
chmod +x bootstrap-install.sh
sudo ./bootstrap-install.sh \
    --cloud-url "https://pos.yourcompany.com" \
    --property-id "prop-uuid" \
    --registration-token "token123"
```

### Full Options

```bash
sudo ./bootstrap-install.sh \
    --cloud-url "https://pos.yourcompany.com" \
    --property-id "prop-uuid" \
    --registration-token "token123" \
    --device-name "POS-Terminal-01" \
    --root-dir "/opt/ops-pos"
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| --cloud-url | Yes | - | Cloud server URL |
| --property-id | Yes | - | Property ID from EMC |
| --registration-token | Yes | - | One-time registration token |
| --device-name | No | hostname | Display name for the device |
| --root-dir | No | ~/ops-pos | Installation directory |

### What Gets Installed

```
~/ops-pos/
├── service-host/
│   ├── service-host           # Main executable
│   ├── data/                  # SQLite database
│   └── logs/                  # Service Host logs
├── packages/                  # Installed CAL packages
├── print-agent/               # Print agent files
├── config/
│   ├── service-host.json     # Configuration
│   └── auth-token.json       # Cloud authentication
└── logs/                      # Application logs
```

A systemd service named **ops-pos-service-host** is also installed and enabled.

## After Installation

Once the bootstrap installer completes:

1. **Verify Registration** - Check EMC → Devices → Service Hosts for the new device
2. **Assign to RVC** - Link the workstations to this Service Host in EMC
3. **Deploy Packages** - Deploy any CAL packages as needed from EMC → CAL Packages

## Troubleshooting

### Device Not Appearing in EMC

- Verify network connectivity to the cloud URL
- Check the auth-token.json file for error messages
- Review Service Host logs in the logs directory

### Service Won't Start

**Windows:**
```powershell
Get-Service OPS-POS-ServiceHost
Get-EventLog -LogName Application -Source OPS-POS -Newest 20
```

**Linux:**
```bash
sudo systemctl status ops-pos-service-host
sudo journalctl -u ops-pos-service-host -n 50
```

### Manual Registration

If automatic registration fails, you can manually register in EMC:

1. Go to **Devices** → **Service Hosts** → **Add Service Host**
2. Enter the device details
3. Copy the provided token to `config/auth-token.json`
4. Restart the Service Host

## Uninstalling

### Windows

```powershell
Stop-Service OPS-POS-ServiceHost
sc.exe delete OPS-POS-ServiceHost
Remove-Item -Recurse -Force C:\OPS-POS
```

### Linux

```bash
sudo systemctl stop ops-pos-service-host
sudo systemctl disable ops-pos-service-host
sudo rm /etc/systemd/system/ops-pos-service-host.service
sudo systemctl daemon-reload
rm -rf ~/ops-pos
```
