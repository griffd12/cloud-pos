# CAL (Configuration Asset Library) Packages

This directory contains CAL packages for the Cloud POS system. CAL packages are deployable software and configuration bundles that can be pushed to Service Hosts and workstations.

## Overview

The CAL system works similar to Oracle Simphony's Client Application Loader (CAL):

1. **Package Creation**: Create a package with install scripts and files
2. **Upload**: Upload the package to a web server or cloud storage
3. **Deployment**: Use EMC to create a deployment targeting specific properties/devices
4. **Installation**: Service Host automatically downloads and runs the install script
5. **Status**: Deployment status is reported back to the cloud in real-time

## Package Structure

Each CAL package should have the following structure:

```
package-name/
├── manifest.json           # Package metadata
├── install.ps1             # PowerShell install script (Windows)
├── install.bat             # Batch install script (Windows fallback)
├── install.sh              # Shell install script (Linux/macOS)
├── uninstall.ps1           # PowerShell uninstall script (optional)
├── uninstall.bat           # Batch uninstall script (optional)
├── uninstall.sh            # Shell uninstall script (optional)
└── files/                  # Additional files to deploy
    └── ...
```

## Install Script Environment Variables

When the install script runs, these environment variables are available:

| Variable | Description |
|----------|-------------|
| `CAL_ROOT_DIR` | Root installation directory (e.g., `C:\OPS-POS`) |
| `CAL_PACKAGE_NAME` | Name of the package being installed |
| `CAL_PACKAGE_VERSION` | Version number of the package |
| `CAL_PACKAGE_TYPE` | Type of package (service_host, configuration, etc.) |
| `CAL_PACKAGE_DIR` | Directory where package was extracted |
| `CAL_SERVICE_HOST_ID` | ID of the Service Host performing the install |

The install script also receives the root directory as the first command line argument.

## Creating a Package

1. Create a directory with your package name
2. Add a `manifest.json` with package metadata
3. Add install scripts for your target platform(s)
4. Add any files needed for the package
5. Run the package script:

```bash
chmod +x package-cal.sh
./package-cal.sh ops-pos-base-setup
```

This creates a `.tar.gz` file ready for deployment.

## Deploying a Package

1. Upload the `.tar.gz` file to a web server or cloud storage (e.g., S3, Azure Blob)
2. Go to EMC → CAL Packages
3. Create or select the package
4. Add a new version with the download URL
5. Click "Deploy" and select the target (property or specific devices)
6. The Service Host will automatically download and install the package

## Package Types

| Type | Description |
|------|-------------|
| `service_host` | Service Host application updates |
| `service_host_prereqs` | Prerequisites for Service Host |
| `caps` | CAPS (Check and Posting Service) components |
| `print_controller` | Print controller components |
| `kds_controller` | KDS controller components |
| `kds_client` | KDS display client |
| `payment_controller` | Payment terminal integration |
| `cal_client` | CAL client/agent updates |
| `configuration` | Configuration files and settings |
| `custom` | Custom packages |

## Available Packages

### OPS-POS Base Setup (`ops-pos-base-setup`)

Creates the base directory structure for OPS-POS on Windows/Linux:

```
C:\OPS-POS\                 (Windows)
~/ops-pos/                  (Linux/macOS)
├── ServiceHost/
│   ├── data/
│   └── logs/
├── Packages/
├── PrintAgent/
├── Config/
└── Logs/
```

## Update Experience

When a CAL package is being installed:

1. **POS Lockout**: The POS workstation displays a full-screen overlay
2. **Progress Display**: Shows package name, version, and current status
3. **Log Window**: Real-time output from the install script
4. **Status Updates**: Status is reported back to EMC in real-time
5. **Automatic Resume**: POS resumes normal operation after installation

This ensures no transactions are processed during updates and provides visibility into the update process.

## Troubleshooting

### Package not downloading
- Verify the download URL is accessible
- Check Service Host cloud connection status
- Review Service Host logs for download errors

### Install script failing
- Check the script output in EMC deployment status
- Verify script has proper permissions
- Test the script manually on a workstation

### Deployment stuck in "pending"
- Verify Service Host is connected to cloud
- Check if Service Host has the deployment in its queue
- Try triggering a deployment check from the cloud
