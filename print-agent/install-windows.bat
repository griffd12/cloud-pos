@echo off
setlocal EnableDelayedExpansion

:: Cloud POS Print Agent - Windows Installer
:: This script downloads, configures, and installs the Print Agent

title Cloud POS Print Agent Installer
color 0A

echo.
echo ============================================
echo   Cloud POS Print Agent Installer
echo ============================================
echo.

:: Set installation directory
set "INSTALL_DIR=%ProgramData%\CloudPOS\PrintAgent"
set "CONFIG_FILE=%INSTALL_DIR%\config.json"

:: Check for admin rights (needed for ProgramData)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] This installer requires Administrator privileges.
    echo [!] Please right-click and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

:: Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js is not installed or not in PATH.
    echo.
    echo Please install Node.js first:
    echo   1. Go to https://nodejs.org/
    echo   2. Download and install the LTS version
    echo   3. Run this installer again
    echo.
    echo Would you like to open the Node.js download page now?
    set /p OPEN_NODE="Enter Y to open, or N to exit: "
    if /i "!OPEN_NODE!"=="Y" (
        start https://nodejs.org/
    )
    pause
    exit /b 1
)

echo [OK] Node.js found
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo     Version: %NODE_VERSION%
echo.

:: Get configuration from user
echo Please enter the following configuration details:
echo (You can find these in the Cloud POS admin panel under Print Agents)
echo.

:GET_URL
set /p CLOUD_URL="Enter Cloud POS WebSocket URL: "
if "!CLOUD_URL!"=="" (
    echo [!] URL cannot be empty. Please try again.
    goto GET_URL
)

:GET_TOKEN
set /p AGENT_TOKEN="Enter Agent Token: "
if "!AGENT_TOKEN!"=="" (
    echo [!] Token cannot be empty. Please try again.
    goto GET_TOKEN
)

echo.
echo Configuration:
echo   URL:   !CLOUD_URL!
echo   Token: !AGENT_TOKEN:~0,20!...
echo.

:: Create installation directory
echo [*] Creating installation directory...
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    if %errorlevel% neq 0 (
        echo [!] Failed to create installation directory
        pause
        exit /b 1
    )
)
echo [OK] Installation directory: %INSTALL_DIR%

:: Download print agent files using PowerShell
echo.
echo [*] Downloading Print Agent files...

:: Extract base URL from WebSocket URL for download
set "BASE_URL=!CLOUD_URL:wss://=https://!"
set "BASE_URL=!BASE_URL:ws://=http://!"
set "BASE_URL=!BASE_URL:/ws/print-agents=!"

set "DOWNLOAD_URL=!BASE_URL!/api/print-agents/download"
echo     Download URL: !DOWNLOAD_URL!

powershell -Command "& { try { Invoke-WebRequest -Uri '!DOWNLOAD_URL!' -OutFile '%INSTALL_DIR%\print-agent.zip' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 } }"
if %errorlevel% neq 0 (
    echo [!] Failed to download Print Agent
    echo [!] Please check your URL and internet connection
    pause
    exit /b 1
)
echo [OK] Downloaded successfully

:: Extract files
echo.
echo [*] Extracting files...
powershell -Command "& { Expand-Archive -Path '%INSTALL_DIR%\print-agent.zip' -DestinationPath '%INSTALL_DIR%' -Force }"
if %errorlevel% neq 0 (
    echo [!] Failed to extract files
    pause
    exit /b 1
)

:: Move files from subdirectory if needed (ZIP contains print-agent folder)
if exist "%INSTALL_DIR%\print-agent" (
    echo [*] Reorganizing files...
    xcopy /E /Y /Q "%INSTALL_DIR%\print-agent\*" "%INSTALL_DIR%\" >nul 2>&1
    rmdir /S /Q "%INSTALL_DIR%\print-agent" >nul 2>&1
)

:: Clean up zip file
del "%INSTALL_DIR%\print-agent.zip" >nul 2>&1
echo [OK] Files extracted

:: Create config.json
echo.
echo [*] Creating configuration file...

:: Use PowerShell to create proper JSON
powershell -Command "& { $config = @{ server = '!CLOUD_URL!'; token = '!AGENT_TOKEN!'; defaultPrinterPort = 9100; reconnectInterval = 5000; maxReconnectInterval = 60000; heartbeatInterval = 30000 }; $config | ConvertTo-Json | Set-Content -Path '%CONFIG_FILE%' }"
if %errorlevel% neq 0 (
    echo [!] Failed to create configuration file
    pause
    exit /b 1
)
echo [OK] Configuration saved to %CONFIG_FILE%

:: Install npm dependencies
echo.
echo [*] Installing dependencies...
cd /d "%INSTALL_DIR%"
call npm install --production >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Warning: npm install had issues, but continuing...
)
echo [OK] Dependencies installed

:: Ask about auto-start
echo.
set /p AUTO_START="Start Print Agent automatically when Windows starts? (Y/N): "
if /i "!AUTO_START!"=="Y" (
    echo [*] Setting up auto-start...
    
    :: Create a VBS script to run the agent hidden
    echo Set WshShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\start-hidden.vbs"
    echo WshShell.CurrentDirectory = "%INSTALL_DIR%" >> "%INSTALL_DIR%\start-hidden.vbs"
    echo WshShell.Run "cmd /c node print-agent.js >> agent.log 2>&1", 0 >> "%INSTALL_DIR%\start-hidden.vbs"
    
    :: Create shortcut in Startup folder
    set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
    powershell -Command "& { $WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_FOLDER%\CloudPOS Print Agent.lnk'); $Shortcut.TargetPath = 'wscript.exe'; $Shortcut.Arguments = '\"%INSTALL_DIR%\start-hidden.vbs\"'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Save() }"
    
    echo [OK] Auto-start configured
)

:: Create start and stop scripts
echo.
echo [*] Creating helper scripts...

:: Start script
echo @echo off > "%INSTALL_DIR%\start-agent.bat"
echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\start-agent.bat"
echo echo Starting Cloud POS Print Agent... >> "%INSTALL_DIR%\start-agent.bat"
echo node print-agent.js >> "%INSTALL_DIR%\start-agent.bat"

:: Stop script  
echo @echo off > "%INSTALL_DIR%\stop-agent.bat"
echo echo Stopping Cloud POS Print Agent... >> "%INSTALL_DIR%\stop-agent.bat"
echo taskkill /F /IM node.exe /FI "WINDOWTITLE eq Cloud POS Print Agent*" 2^>nul >> "%INSTALL_DIR%\stop-agent.bat"
echo echo Agent stopped. >> "%INSTALL_DIR%\stop-agent.bat"

echo [OK] Helper scripts created

:: Installation complete
echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo Installation directory: %INSTALL_DIR%
echo.
echo Helper scripts:
echo   - start-agent.bat : Start the Print Agent
echo   - stop-agent.bat  : Stop the Print Agent
echo.
echo Would you like to start the Print Agent now?
set /p START_NOW="Start now? (Y/N): "
if /i "!START_NOW!"=="Y" (
    echo.
    echo Starting Print Agent...
    echo (Press Ctrl+C to stop)
    echo.
    cd /d "%INSTALL_DIR%"
    node print-agent.js
) else (
    echo.
    echo To start the agent later, run:
    echo   %INSTALL_DIR%\start-agent.bat
    echo.
    pause
)

endlocal
