@echo off
REM OPS-POS Base Setup - Windows Batch Installation Script
REM This script creates the base directory structure for OPS-POS on Windows

set CAL_ROOT=%~1
if "%CAL_ROOT%"=="" set CAL_ROOT=C:\OPS-POS

echo ==========================================
echo OPS-POS Base Setup v1.0.0
echo ==========================================
echo.
echo Installation Directory: %CAL_ROOT%
echo.

REM Create the main directory structure
echo Creating directory structure...

if not exist "%CAL_ROOT%" mkdir "%CAL_ROOT%"
echo Created: %CAL_ROOT%

if not exist "%CAL_ROOT%\ServiceHost" mkdir "%CAL_ROOT%\ServiceHost"
echo Created: %CAL_ROOT%\ServiceHost

if not exist "%CAL_ROOT%\ServiceHost\data" mkdir "%CAL_ROOT%\ServiceHost\data"
echo Created: %CAL_ROOT%\ServiceHost\data

if not exist "%CAL_ROOT%\ServiceHost\logs" mkdir "%CAL_ROOT%\ServiceHost\logs"
echo Created: %CAL_ROOT%\ServiceHost\logs

if not exist "%CAL_ROOT%\Packages" mkdir "%CAL_ROOT%\Packages"
echo Created: %CAL_ROOT%\Packages

if not exist "%CAL_ROOT%\PrintAgent" mkdir "%CAL_ROOT%\PrintAgent"
echo Created: %CAL_ROOT%\PrintAgent

if not exist "%CAL_ROOT%\Config" mkdir "%CAL_ROOT%\Config"
echo Created: %CAL_ROOT%\Config

if not exist "%CAL_ROOT%\Logs" mkdir "%CAL_ROOT%\Logs"
echo Created: %CAL_ROOT%\Logs

echo.
echo ==========================================
echo Installation Complete!
echo ==========================================
echo.
echo Directory structure created at: %CAL_ROOT%
echo.

exit /b 0
