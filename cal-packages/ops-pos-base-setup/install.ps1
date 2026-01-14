# OPS-POS Base Setup - PowerShell Installation Script
# This script creates the base directory structure for OPS-POS on Windows

param(
    [string]$CalRootDir = $env:CAL_ROOT_DIR
)

# Use default if not provided
if (-not $CalRootDir) {
    $CalRootDir = "C:\OPS-POS"
}

Write-Host "=========================================="
Write-Host "OPS-POS Base Setup v1.0.0"
Write-Host "=========================================="
Write-Host ""
Write-Host "Installation Directory: $CalRootDir"
Write-Host ""

# Create the main directory structure
$directories = @(
    "$CalRootDir",
    "$CalRootDir\ServiceHost",
    "$CalRootDir\ServiceHost\data",
    "$CalRootDir\ServiceHost\logs",
    "$CalRootDir\Packages",
    "$CalRootDir\PrintAgent",
    "$CalRootDir\Config",
    "$CalRootDir\Logs"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        Write-Host "Creating directory: $dir"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    } else {
        Write-Host "Directory exists: $dir"
    }
}

# Create default configuration file
$configPath = "$CalRootDir\Config\settings.json"
if (-not (Test-Path $configPath)) {
    Write-Host ""
    Write-Host "Creating default configuration..."
    $config = @{
        version = "1.0.0"
        installedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        rootDirectory = $CalRootDir
        serviceHost = @{
            enabled = $true
            port = 3001
        }
        printAgent = @{
            enabled = $false
            port = 9200
        }
    }
    $config | ConvertTo-Json -Depth 3 | Out-File -FilePath $configPath -Encoding UTF8
    Write-Host "Configuration saved to: $configPath"
}

# Create a marker file to indicate successful installation
$markerPath = "$CalRootDir\.installed"
$markerContent = @{
    installedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    version = "1.0.0"
    packageName = "OPS-POS Base Setup"
}
$markerContent | ConvertTo-Json | Out-File -FilePath $markerPath -Encoding UTF8

Write-Host ""
Write-Host "=========================================="
Write-Host "Installation Complete!"
Write-Host "=========================================="
Write-Host ""
Write-Host "Directory structure created at: $CalRootDir"
Write-Host ""

exit 0
