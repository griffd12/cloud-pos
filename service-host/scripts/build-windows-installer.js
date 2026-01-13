#!/usr/bin/env node

/**
 * Windows Installer Builder for Cloud POS Service Host
 * 
 * Creates a self-contained Windows installer package that includes:
 * - Compiled Service Host
 * - PowerShell installation script
 * - NSSM for Windows Service management
 * - Configuration wizard
 * 
 * Usage: node scripts/build-windows-installer.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const INSTALLER_DIR = path.join(ROOT, 'windows-installer');
const OUTPUT_DIR = path.join(ROOT, '..', 'cal-packages');

const VERSION = require(path.join(ROOT, 'package.json')).version;
const INSTALLER_NAME = `CloudPOS-ServiceHost-v${VERSION}-Setup`;

console.log('='.repeat(60));
console.log(`Building Windows Installer for Service Host v${VERSION}`);
console.log('='.repeat(60));

// Clean and create directories
if (fs.existsSync(INSTALLER_DIR)) {
  fs.rmSync(INSTALLER_DIR, { recursive: true });
}
fs.mkdirSync(INSTALLER_DIR, { recursive: true });
fs.mkdirSync(path.join(INSTALLER_DIR, 'app'), { recursive: true });
fs.mkdirSync(path.join(INSTALLER_DIR, 'tools'), { recursive: true });

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Build TypeScript
console.log('\n1. Building TypeScript...');
try {
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('Build failed');
  process.exit(1);
}

// Copy application files
console.log('\n2. Copying application files...');
copyDir(DIST_DIR, path.join(INSTALLER_DIR, 'app', 'dist'));

// Copy package.json (production version)
const pkg = require(path.join(ROOT, 'package.json'));
const prodPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: pkg.main,
  type: pkg.type,
  scripts: {
    start: pkg.scripts.start,
  },
  dependencies: pkg.dependencies,
  engines: pkg.engines,
};
fs.writeFileSync(
  path.join(INSTALLER_DIR, 'app', 'package.json'),
  JSON.stringify(prodPkg, null, 2)
);

// Create data directory
fs.mkdirSync(path.join(INSTALLER_DIR, 'app', 'data'), { recursive: true });
fs.writeFileSync(
  path.join(INSTALLER_DIR, 'app', 'data', '.gitkeep'),
  '# Local SQLite database will be stored here\n'
);

// Create logs directory
fs.mkdirSync(path.join(INSTALLER_DIR, 'app', 'logs'), { recursive: true });

// Create config template
console.log('\n3. Creating configuration template...');
const configTemplate = {
  cloudUrl: "https://your-cloud-pos.replit.app",
  serviceHostId: "",
  registrationToken: "",
  propertyId: "",
  localPort: 3001,
  services: {
    caps: true,
    printController: true,
    kdsController: true,
    paymentController: false
  },
  sync: {
    intervalMs: 30000,
    retryDelayMs: 5000,
    maxRetries: 3
  },
  database: {
    path: "./data/local.db"
  },
  logging: {
    level: "info",
    file: "./logs/service-host.log"
  }
};
fs.writeFileSync(
  path.join(INSTALLER_DIR, 'app', 'config.template.json'),
  JSON.stringify(configTemplate, null, 2)
);

// Create PowerShell installer
console.log('\n4. Creating PowerShell installer...');
const psInstaller = `
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Cloud POS Service Host Installer v${VERSION}
.DESCRIPTION
    Installs and configures the Cloud POS Service Host as a Windows Service.
    This script will:
    1. Check/install Node.js if needed
    2. Install application dependencies
    3. Configure the service host
    4. Install as a Windows Service
.NOTES
    Run this script as Administrator
#>

param(
    [switch]$Uninstall,
    [switch]$Silent,
    [string]$CloudUrl,
    [string]$ServiceHostId,
    [string]$Token
)

$ErrorActionPreference = "Stop"
$ServiceName = "CloudPOSServiceHost"
$ServiceDisplayName = "Cloud POS Service Host"
$InstallPath = "C:\\CloudPOS\\ServiceHost"
$NodeVersion = "20.10.0"
$NssmVersion = "2.24"

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Text)
    Write-Host "[*] $Text" -ForegroundColor Green
}

function Write-Info {
    param([string]$Text)
    Write-Host "    $Text" -ForegroundColor Gray
}

function Write-Warning {
    param([string]$Text)
    Write-Host "[!] $Text" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Text)
    Write-Host "[X] $Text" -ForegroundColor Red
}

function Test-NodeInstalled {
    try {
        $version = node --version 2>$null
        return $true
    } catch {
        return $false
    }
}

function Install-NodeJS {
    Write-Step "Installing Node.js v$NodeVersion..."
    
    $nodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-x64.msi"
    $msiPath = "$env:TEMP\\node-installer.msi"
    
    Write-Info "Downloading Node.js..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $msiPath -UseBasicParsing
    
    Write-Info "Running installer..."
    Start-Process msiexec.exe -ArgumentList "/i", $msiPath, "/qn", "/norestart" -Wait -NoNewWindow
    
    Remove-Item $msiPath -Force
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    Write-Info "Node.js installed successfully"
}

function Install-NSSM {
    Write-Step "Setting up NSSM (service manager)..."
    
    $nssmPath = "$InstallPath\\tools\\nssm.exe"
    
    if (Test-Path $nssmPath) {
        Write-Info "NSSM already present"
        return $nssmPath
    }
    
    $nssmUrl = "https://nssm.cc/release/nssm-$NssmVersion.zip"
    $zipPath = "$env:TEMP\\nssm.zip"
    $extractPath = "$env:TEMP\\nssm"
    
    Write-Info "Downloading NSSM..."
    Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath -UseBasicParsing
    
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    
    $nssmExe = Get-ChildItem -Path $extractPath -Recurse -Filter "nssm.exe" | Where-Object { $_.Directory.Name -eq "win64" } | Select-Object -First 1
    
    if (-not $nssmExe) {
        $nssmExe = Get-ChildItem -Path $extractPath -Recurse -Filter "nssm.exe" | Select-Object -First 1
    }
    
    New-Item -ItemType Directory -Path (Split-Path $nssmPath) -Force | Out-Null
    Copy-Item $nssmExe.FullName $nssmPath
    
    Remove-Item $zipPath -Force
    Remove-Item $extractPath -Recurse -Force
    
    Write-Info "NSSM installed to $nssmPath"
    return $nssmPath
}

function Uninstall-ServiceHost {
    Write-Header "Uninstalling Cloud POS Service Host"
    
    $nssmPath = "$InstallPath\\tools\\nssm.exe"
    
    # Stop and remove service
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Write-Step "Stopping service..."
        & $nssmPath stop $ServiceName 2>$null
        Start-Sleep -Seconds 2
        
        Write-Step "Removing service..."
        & $nssmPath remove $ServiceName confirm
    }
    
    # Remove installation
    if (Test-Path $InstallPath) {
        Write-Step "Removing installation files..."
        Remove-Item -Path $InstallPath -Recurse -Force
    }
    
    Write-Host ""
    Write-Host "Uninstallation complete!" -ForegroundColor Green
    exit 0
}

# Main Installation
if ($Uninstall) {
    Uninstall-ServiceHost
}

Write-Header "Cloud POS Service Host Installer v${VERSION}"

# Check for Admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This installer must be run as Administrator"
    Write-Info "Right-click and select 'Run as Administrator'"
    exit 1
}

# Check/Install Node.js
Write-Step "Checking Node.js installation..."
if (-not (Test-NodeInstalled)) {
    Install-NodeJS
} else {
    $nodeVer = node --version
    Write-Info "Node.js $nodeVer is installed"
}

# Create installation directory
Write-Step "Creating installation directory..."
if (-not (Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

# Copy application files
Write-Step "Copying application files..."
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item -Path "$scriptDir\\app\\*" -Destination $InstallPath -Recurse -Force
Copy-Item -Path "$scriptDir\\tools\\*" -Destination "$InstallPath\\tools" -Recurse -Force -ErrorAction SilentlyContinue

# Install dependencies
Write-Step "Installing Node.js dependencies..."
Push-Location $InstallPath
npm install --production --silent 2>$null
Pop-Location

# Install NSSM
$nssmPath = Install-NSSM

# Configuration
Write-Step "Configuring Service Host..."
$configPath = "$InstallPath\\config.json"

if (-not $Silent) {
    Write-Host ""
    Write-Host "Configuration Setup" -ForegroundColor Yellow
    Write-Host "-" * 40
    
    if (-not $CloudUrl) {
        $CloudUrl = Read-Host "Enter Cloud POS URL (e.g., https://your-app.replit.app)"
    }
    if (-not $ServiceHostId) {
        $ServiceHostId = Read-Host "Enter Service Host ID (from EMC)"
    }
    if (-not $Token) {
        $Token = Read-Host "Enter Registration Token (from EMC)"
    }
}

if ($CloudUrl -and $ServiceHostId -and $Token) {
    $config = Get-Content "$InstallPath\\config.template.json" | ConvertFrom-Json
    $config.cloudUrl = $CloudUrl
    $config.serviceHostId = $ServiceHostId
    $config.registrationToken = $Token
    $config | ConvertTo-Json -Depth 10 | Set-Content $configPath
    Write-Info "Configuration saved"
} else {
    Write-Warning "Configuration incomplete - edit $configPath manually before starting"
    Copy-Item "$InstallPath\\config.template.json" $configPath
}

# Stop existing service if running
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Step "Stopping existing service..."
    & $nssmPath stop $ServiceName 2>$null
    Start-Sleep -Seconds 2
    & $nssmPath remove $ServiceName confirm 2>$null
}

# Install Windows Service
Write-Step "Installing Windows Service..."
$nodePath = (Get-Command node).Path
$appPath = "$InstallPath\\dist\\index.js"

& $nssmPath install $ServiceName $nodePath $appPath
& $nssmPath set $ServiceName DisplayName $ServiceDisplayName
& $nssmPath set $ServiceName Description "On-premise server for Cloud POS offline operations"
& $nssmPath set $ServiceName AppDirectory $InstallPath
& $nssmPath set $ServiceName AppStdout "$InstallPath\\logs\\stdout.log"
& $nssmPath set $ServiceName AppStderr "$InstallPath\\logs\\stderr.log"
& $nssmPath set $ServiceName AppRotateFiles 1
& $nssmPath set $ServiceName AppRotateBytes 10485760
& $nssmPath set $ServiceName Start SERVICE_AUTO_START
& $nssmPath set $ServiceName AppExit Default Restart
& $nssmPath set $ServiceName AppRestartDelay 5000

# Start the service
Write-Step "Starting service..."
& $nssmPath start $ServiceName

Start-Sleep -Seconds 3

# Check service status
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host "Installation Complete!" -ForegroundColor Green
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host ""
    Write-Host "Service Status: Running" -ForegroundColor Green
    Write-Host "Install Path: $InstallPath" -ForegroundColor Gray
    Write-Host "Config File: $configPath" -ForegroundColor Gray
    Write-Host "Logs: $InstallPath\\logs" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To manage the service:" -ForegroundColor Yellow
    Write-Host "  Start:  nssm start $ServiceName"
    Write-Host "  Stop:   nssm stop $ServiceName"
    Write-Host "  Status: nssm status $ServiceName"
    Write-Host ""
} else {
    Write-Warning "Service installed but may not be running"
    Write-Info "Check logs at $InstallPath\\logs"
    Write-Info "Ensure config.json is properly configured"
}
`;

fs.writeFileSync(
  path.join(INSTALLER_DIR, 'Install-ServiceHost.ps1'),
  psInstaller
);

// Create batch file launcher for PowerShell
const batchLauncher = `@echo off
echo Cloud POS Service Host Installer v${VERSION}
echo.
echo This will install the Service Host as a Windows Service.
echo.
pause

PowerShell -ExecutionPolicy Bypass -File "%~dp0Install-ServiceHost.ps1"

pause
`;
fs.writeFileSync(
  path.join(INSTALLER_DIR, 'Install.bat'),
  batchLauncher
);

// Create uninstall batch
const uninstallBatch = `@echo off
echo Cloud POS Service Host Uninstaller
echo.
echo This will remove the Service Host and all data.
echo.
set /p confirm="Are you sure? (Y/N): "
if /i "%confirm%" neq "Y" exit /b

PowerShell -ExecutionPolicy Bypass -File "%~dp0Install-ServiceHost.ps1" -Uninstall

pause
`;
fs.writeFileSync(
  path.join(INSTALLER_DIR, 'Uninstall.bat'),
  uninstallBatch
);

// Create README
console.log('\n5. Creating documentation...');
const readme = `# Cloud POS Service Host v${VERSION}

## Windows Installation

### Quick Install
1. Right-click \`Install.bat\` and select "Run as Administrator"
2. Follow the prompts to enter your Cloud POS URL and registration token
3. The service will be installed and started automatically

### Silent Install
\`\`\`powershell
.\\Install-ServiceHost.ps1 -Silent -CloudUrl "https://your-app.replit.app" -ServiceHostId "your-id" -Token "your-token"
\`\`\`

### Manual Configuration
If you skipped configuration during install, edit:
\`C:\\CloudPOS\\ServiceHost\\config.json\`

Then restart the service:
\`\`\`cmd
nssm restart CloudPOSServiceHost
\`\`\`

## Service Management

| Action | Command |
|--------|---------|
| Start  | \`nssm start CloudPOSServiceHost\` |
| Stop   | \`nssm stop CloudPOSServiceHost\` |
| Status | \`nssm status CloudPOSServiceHost\` |
| Logs   | \`C:\\CloudPOS\\ServiceHost\\logs\\stdout.log\` |

## Uninstall

Right-click \`Uninstall.bat\` and select "Run as Administrator"

## Getting Registration Token

1. Log into EMC (Enterprise Management Console)
2. Navigate to Admin → Service Hosts
3. Click "Register New Service Host"
4. Select your property and services
5. Copy the Service Host ID and Token

## Troubleshooting

### Service Won't Start
- Check \`C:\\CloudPOS\\ServiceHost\\logs\\stderr.log\`
- Verify config.json has correct values
- Ensure firewall allows outbound HTTPS

### Connection Issues
- Verify Cloud URL is accessible from this machine
- Check that registration token hasn't expired
- Confirm Service Host ID matches EMC configuration

## Support

For issues, check the Service Host status in EMC under Admin → Service Hosts
`;

fs.writeFileSync(
  path.join(INSTALLER_DIR, 'README.md'),
  readme
);

// Create zip archive
console.log('\n6. Creating installer archive...');
const archiver = require('archiver');
const output = fs.createWriteStream(path.join(OUTPUT_DIR, `${INSTALLER_NAME}.zip`));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`\nInstaller created: ${INSTALLER_NAME}.zip (${archive.pointer()} bytes)`);
  console.log(`Location: ${OUTPUT_DIR}`);
  
  // Create manifest
  const manifest = {
    name: 'CloudPOS-ServiceHost-Installer',
    version: VERSION,
    type: 'windows-installer',
    packageFile: `${INSTALLER_NAME}.zip`,
    size: archive.pointer(),
    createdAt: new Date().toISOString(),
    requirements: {
      os: 'Windows 10/11 or Windows Server 2016+',
      adminRequired: true,
    },
    installPath: 'C:\\CloudPOS\\ServiceHost',
    serviceName: 'CloudPOSServiceHost',
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${INSTALLER_NAME}.manifest.json`),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log(`Manifest: ${INSTALLER_NAME}.manifest.json`);
  console.log('\nDone! The installer package is ready for distribution.');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(INSTALLER_DIR, false);
archive.finalize();

// Helper function to copy directory
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
