@echo off
setlocal EnableDelayedExpansion

:: Cloud POS Print Agent - Windows Installer v2.0
:: This script downloads, configures, and installs the Print Agent

title Cloud POS Print Agent Installer
color 0A

echo.
echo ============================================
echo   Cloud POS Print Agent Installer v2.0
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
echo The server URL should be the full WebSocket URL, for example:
echo   wss://your-pos-app.replit.app/ws/print-agents
echo.

:GET_URL
set /p CLOUD_URL="Enter Cloud POS Server URL (e.g., wss://yourapp.replit.app/ws/print-agents): "
if "!CLOUD_URL!"=="" (
    echo [!] URL cannot be empty. Please try again.
    goto GET_URL
)

:: Ensure URL ends with /ws/print-agents
echo !CLOUD_URL! | findstr /C:"/ws/print-agents" >nul
if %errorlevel% neq 0 (
    echo [*] Adding WebSocket endpoint to URL...
    set "CLOUD_URL=!CLOUD_URL!/ws/print-agents"
)

:GET_TOKEN
echo.
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

powershell -Command "& { try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!DOWNLOAD_URL!' -OutFile '%INSTALL_DIR%\print-agent.zip' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 } }"
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

:: Create config.json with proper escaping
echo.
echo [*] Creating configuration file...

:: Use PowerShell to create proper JSON (handles special characters in token)
powershell -Command "& { $config = @{ server = '!CLOUD_URL!'; token = '!AGENT_TOKEN!'; defaultPrinterPort = 9100; reconnectInterval = 5000; maxReconnectInterval = 60000; heartbeatInterval = 30000; printTimeout = 10000 }; $config | ConvertTo-Json | Set-Content -Path '%CONFIG_FILE%' -Encoding UTF8 }"
if %errorlevel% neq 0 (
    echo [!] Failed to create configuration file
    pause
    exit /b 1
)
echo [OK] Configuration saved to %CONFIG_FILE%

:: Initialize package.json and install ws dependency
echo.
echo [*] Installing dependencies...
cd /d "%INSTALL_DIR%"

:: Check if package.json exists, if not create one
if not exist "%INSTALL_DIR%\package.json" (
    echo { "name": "cloud-pos-print-agent", "version": "1.0.0", "dependencies": { "ws": "^8.0.0" } } > "%INSTALL_DIR%\package.json"
)

call npm install --production 2>&1
if %errorlevel% neq 0 (
    echo [!] Warning: npm install had issues, trying again...
    call npm install ws --save 2>&1
)
echo [OK] Dependencies installed

:: Verify print-agent.js exists
if not exist "%INSTALL_DIR%\print-agent.js" (
    echo [!] Error: print-agent.js not found after extraction
    echo [!] The download may have failed or the file structure is incorrect
    pause
    exit /b 1
)
echo [OK] Print Agent files verified

:: Ask about auto-start
echo.
set /p AUTO_START="Start Print Agent automatically when Windows starts? (Y/N): "
if /i "!AUTO_START!"=="Y" (
    echo [*] Setting up auto-start...
    
    :: Create a VBS script to run the agent hidden
    echo Set WshShell = CreateObject^("WScript.Shell"^) > "%INSTALL_DIR%\start-hidden.vbs"
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

:: Start script (visible console)
(
echo @echo off
echo title Cloud POS Print Agent
echo cd /d "%INSTALL_DIR%"
echo echo ============================================
echo echo   Cloud POS Print Agent
echo echo ============================================
echo echo.
echo echo Starting agent... Press Ctrl+C to stop.
echo echo.
echo node print-agent.js
echo pause
) > "%INSTALL_DIR%\start-agent.bat"

:: Start hidden script
(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo start /b node print-agent.js ^>^> agent.log 2^>^&1
echo echo Print Agent started in background. Check agent.log for output.
) > "%INSTALL_DIR%\start-agent-hidden.bat"

:: Stop script  
(
echo @echo off
echo echo Stopping Cloud POS Print Agent...
echo for /f "tokens=2" %%%%a in ^('tasklist /fi "imagename eq node.exe" /fo list ^| find "PID:"'^) do ^(
echo     wmic process where "ProcessId=%%%%a" get CommandLine 2^>nul ^| find "print-agent" ^>nul ^&^& taskkill /f /pid %%%%a 2^>nul
echo ^)
echo echo Agent stopped.
echo pause
) > "%INSTALL_DIR%\stop-agent.bat"

:: View logs script
(
echo @echo off
echo echo ============================================
echo echo   Cloud POS Print Agent Logs
echo echo ============================================
echo echo.
echo if exist "%INSTALL_DIR%\agent.log" ^(
echo     type "%INSTALL_DIR%\agent.log"
echo ^) else ^(
echo     echo No log file found.
echo ^)
echo echo.
echo pause
) > "%INSTALL_DIR%\view-logs.bat"

:: Test connection script
(
echo @echo off
echo title Cloud POS Print Agent - Test Mode
echo cd /d "%INSTALL_DIR%"
echo echo ============================================
echo echo   Cloud POS Print Agent - Test Mode
echo echo ============================================
echo echo.
echo echo Testing connection to server...
echo echo Press Ctrl+C to stop.
echo echo.
echo node print-agent.js
echo pause
) > "%INSTALL_DIR%\test-connection.bat"

echo [OK] Helper scripts created

:: Installation complete
echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo Installation directory: %INSTALL_DIR%
echo.
echo Available scripts:
echo   - start-agent.bat        : Start the agent (visible console)
echo   - start-agent-hidden.bat : Start the agent in background
echo   - stop-agent.bat         : Stop the agent
echo   - view-logs.bat          : View agent logs
echo   - test-connection.bat    : Test server connection
echo.
echo Would you like to test the connection now?
set /p START_NOW="Test connection? (Y/N): "
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
    echo   "%INSTALL_DIR%\start-agent.bat"
    echo.
    pause
)

endlocal
