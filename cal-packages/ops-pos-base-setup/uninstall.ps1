# OPS-POS Base Setup - PowerShell Uninstallation Script

param(
    [string]$CalRootDir = $env:CAL_ROOT_DIR
)

if (-not $CalRootDir) {
    $CalRootDir = "C:\OPS-POS"
}

Write-Host "=========================================="
Write-Host "OPS-POS Base Setup - Uninstall"
Write-Host "=========================================="
Write-Host ""
Write-Host "This will remove the .installed marker only."
Write-Host "Directory structure will be preserved."
Write-Host ""

$markerPath = "$CalRootDir\.installed"
if (Test-Path $markerPath) {
    Remove-Item $markerPath -Force
    Write-Host "Removed installation marker."
}

Write-Host ""
Write-Host "Uninstall complete."
Write-Host ""

exit 0
