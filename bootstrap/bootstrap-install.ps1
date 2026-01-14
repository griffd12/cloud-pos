# OPS-POS Bootstrap Installer for Windows
# This script installs the initial Service Host and CAL client
# After this, all future updates come via CAL packages

param(
    [Parameter(Mandatory=$true)]
    [string]$CloudUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$PropertyId,
    
    [Parameter(Mandatory=$true)]
    [string]$RegistrationToken,
    
    [Parameter(Mandatory=$false)]
    [string]$DeviceName = $env:COMPUTERNAME,
    
    [Parameter(Mandatory=$false)]
    [string]$RootDir = "C:\OPS-POS"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  OPS-POS Bootstrap Installer v1.0.0" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

function Write-Step {
    param([string]$Message)
    Write-Host "[*] $Message" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host "[+] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[-] $Message" -ForegroundColor Red
}

function Cleanup-OnFailure {
    Write-Host ""
    Write-Fail "Installation failed - cleaning up..."
    
    $serviceName = "OPS-POS-ServiceHost"
    $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($existingService) {
        Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $serviceName 2>$null | Out-Null
    }
    
    Write-Host "    Partial installation remains at: $RootDir"
    Write-Host "    Review the error above and try again."
}

try {
    Write-Step "Creating OPS-POS directory structure..."
    
    $directories = @(
        "$RootDir",
        "$RootDir\ServiceHost",
        "$RootDir\ServiceHost\data",
        "$RootDir\ServiceHost\logs",
        "$RootDir\Packages",
        "$RootDir\PrintAgent",
        "$RootDir\Config",
        "$RootDir\Logs"
    )
    
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Host "    Created: $dir"
        } else {
            Write-Host "    Exists: $dir"
        }
    }
    Write-Success "Directory structure created"
    
    Write-Step "Downloading Service Host..."
    $serviceHostUrl = "$CloudUrl/downloads/service-host.exe"
    $serviceHostPath = "$RootDir\ServiceHost\service-host.exe"
    
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $serviceHostUrl -OutFile $serviceHostPath -UseBasicParsing -TimeoutSec 120
        
        if (-not (Test-Path $serviceHostPath)) {
            throw "Download completed but file not found at $serviceHostPath"
        }
        
        $fileSize = (Get-Item $serviceHostPath).Length
        if ($fileSize -lt 1000) {
            throw "Downloaded file is too small ($fileSize bytes) - likely an error page"
        }
        
        Write-Success "Service Host downloaded to $serviceHostPath ($([math]::Round($fileSize/1MB, 2)) MB)"
    } catch {
        Write-Fail "CRITICAL: Failed to download Service Host"
        Write-Host "    URL: $serviceHostUrl" -ForegroundColor Red
        Write-Host "    Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Possible solutions:" -ForegroundColor Yellow
        Write-Host "  1. Verify the cloud URL is correct" -ForegroundColor White
        Write-Host "  2. Check network connectivity to the server" -ForegroundColor White
        Write-Host "  3. Manually download service-host.exe and place at: $serviceHostPath" -ForegroundColor White
        Cleanup-OnFailure
        exit 1
    }
    
    Write-Step "Creating configuration file..."
    $configPath = "$RootDir\Config\service-host.json"
    $config = @{
        cloudUrl = $CloudUrl
        propertyId = $PropertyId
        deviceName = $DeviceName
        rootDir = $RootDir
        dataDir = "$RootDir\ServiceHost\data"
        logsDir = "$RootDir\ServiceHost\logs"
        packagesDir = "$RootDir\Packages"
        autoStart = $true
        registeredAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    $config | ConvertTo-Json -Depth 10 | Out-File -FilePath $configPath -Encoding UTF8
    Write-Success "Configuration saved to $configPath"
    
    Write-Step "Registering device with cloud..."
    $registrationPayload = @{
        propertyId = $PropertyId
        deviceName = $DeviceName
        deviceType = "service_host"
        registrationToken = $RegistrationToken
        hostname = $env:COMPUTERNAME
        platform = "windows"
        installedAt = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json
    
    try {
        $registrationUrl = "$CloudUrl/api/devices/register"
        $response = Invoke-RestMethod -Uri $registrationUrl -Method Post -Body $registrationPayload -ContentType "application/json" -TimeoutSec 30
        
        if (-not $response.serviceHostId) {
            throw "Registration response missing serviceHostId"
        }
        
        $tokenPath = "$RootDir\Config\auth-token.json"
        $response | ConvertTo-Json -Depth 10 | Out-File -FilePath $tokenPath -Encoding UTF8
        Write-Success "Device registered successfully"
        Write-Host "    Service Host ID: $($response.serviceHostId)" -ForegroundColor Cyan
    } catch {
        Write-Fail "CRITICAL: Failed to register device with cloud"
        Write-Host "    URL: $registrationUrl" -ForegroundColor Red
        Write-Host "    Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Possible solutions:" -ForegroundColor Yellow
        Write-Host "  1. Verify the registration token is valid (tokens expire after 24 hours)" -ForegroundColor White
        Write-Host "  2. Check that the Property ID is correct" -ForegroundColor White
        Write-Host "  3. Verify the cloud server is accessible" -ForegroundColor White
        Cleanup-OnFailure
        exit 1
    }
    
    Write-Step "Installing Service Host as Windows Service..."
    $serviceName = "OPS-POS-ServiceHost"
    
    try {
        $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        
        if ($existingService) {
            Write-Host "    Stopping existing service..."
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            sc.exe delete $serviceName | Out-Null
            Start-Sleep -Seconds 2
        }
        
        $serviceExe = "`"$serviceHostPath`" --config `"$configPath`""
        New-Service -Name $serviceName -BinaryPathName $serviceExe -DisplayName "OPS-POS Service Host" -Description "OPS-POS Service Host for offline POS operations and CAL package management" -StartupType Automatic | Out-Null
        
        Write-Success "Windows Service installed: $serviceName"
    } catch {
        Write-Fail "CRITICAL: Failed to install Windows Service"
        Write-Host "    Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Possible solutions:" -ForegroundColor Yellow
        Write-Host "  1. Run this script as Administrator" -ForegroundColor White
        Write-Host "  2. Check Windows Event Log for details" -ForegroundColor White
        Cleanup-OnFailure
        exit 1
    }
    
    Write-Step "Starting Service Host..."
    try {
        Start-Service -Name $serviceName
        Start-Sleep -Seconds 3
        
        $service = Get-Service -Name $serviceName
        if ($service.Status -ne "Running") {
            throw "Service started but is not in Running state (current: $($service.Status))"
        }
        
        Write-Success "Service Host started and running"
    } catch {
        Write-Fail "CRITICAL: Failed to start Service Host"
        Write-Host "    Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Check logs at: $RootDir\ServiceHost\logs\" -ForegroundColor Yellow
        Write-Host "Check Windows Event Log: Get-EventLog -LogName Application -Newest 20" -ForegroundColor Yellow
        Cleanup-OnFailure
        exit 1
    }
    
    Write-Step "Verifying Service Host health..."
    try {
        Start-Sleep -Seconds 5
        
        $service = Get-Service -Name $serviceName
        if ($service.Status -ne "Running") {
            throw "Service is no longer running (status: $($service.Status))"
        }
        
        Write-Success "Service Host is healthy"
    } catch {
        Write-Fail "WARNING: Service Host health check failed"
        Write-Host "    Error: $_" -ForegroundColor Red
        Write-Host "    The installation completed but the service may not be working correctly." -ForegroundColor Yellow
        Write-Host "    Check logs at: $RootDir\ServiceHost\logs\" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  Bootstrap Installation Complete!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installation Directory: $RootDir" -ForegroundColor Cyan
    Write-Host "Cloud URL: $CloudUrl" -ForegroundColor Cyan
    Write-Host "Property ID: $PropertyId" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify the device appears in EMC under Devices" -ForegroundColor White
    Write-Host "  2. Assign the device to a Revenue Center" -ForegroundColor White
    Write-Host "  3. Deploy CAL packages as needed" -ForegroundColor White
    Write-Host ""
    Write-Host "All future updates will be delivered via CAL packages automatically." -ForegroundColor Cyan
    
    exit 0
    
} catch {
    Write-Fail "Unexpected error during installation: $_"
    Cleanup-OnFailure
    exit 1
}
