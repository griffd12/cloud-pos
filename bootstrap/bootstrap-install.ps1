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

function Write-Error {
    param([string]$Message)
    Write-Host "[-] $Message" -ForegroundColor Red
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
        Invoke-WebRequest -Uri $serviceHostUrl -OutFile $serviceHostPath -UseBasicParsing
        Write-Success "Service Host downloaded to $serviceHostPath"
    } catch {
        Write-Error "Failed to download Service Host from $serviceHostUrl"
        Write-Host "    You may need to manually copy service-host.exe to $serviceHostPath"
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
        $response = Invoke-RestMethod -Uri $registrationUrl -Method Post -Body $registrationPayload -ContentType "application/json"
        
        $tokenPath = "$RootDir\Config\auth-token.json"
        $response | ConvertTo-Json -Depth 10 | Out-File -FilePath $tokenPath -Encoding UTF8
        Write-Success "Device registered successfully"
        Write-Host "    Service Host ID: $($response.serviceHostId)" -ForegroundColor Cyan
    } catch {
        Write-Error "Failed to register with cloud: $_"
        Write-Host "    You can register manually later via EMC"
    }
    
    Write-Step "Installing Service Host as Windows Service..."
    try {
        $serviceName = "OPS-POS-ServiceHost"
        $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        
        if ($existingService) {
            Write-Host "    Stopping existing service..."
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            sc.exe delete $serviceName | Out-Null
            Start-Sleep -Seconds 2
        }
        
        $serviceExe = "$serviceHostPath --config `"$configPath`""
        New-Service -Name $serviceName -BinaryPathName $serviceExe -DisplayName "OPS-POS Service Host" -Description "OPS-POS Service Host for offline POS operations and CAL package management" -StartupType Automatic | Out-Null
        
        Write-Success "Windows Service installed: $serviceName"
    } catch {
        Write-Error "Failed to install as Windows Service: $_"
        Write-Host "    You can run Service Host manually from $serviceHostPath"
    }
    
    Write-Step "Starting Service Host..."
    try {
        Start-Service -Name "OPS-POS-ServiceHost"
        Write-Success "Service Host started"
    } catch {
        Write-Error "Failed to start Service Host: $_"
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
    
} catch {
    Write-Error "Bootstrap installation failed: $_"
    exit 1
}
