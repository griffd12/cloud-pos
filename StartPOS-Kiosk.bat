@echo off
REM ========================================
REM  POS Kiosk Startup Script for Microsoft Edge
REM  Place this file in: C:\Users\[USERNAME]\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
REM ========================================

REM Set your POS URL here (replace with your actual Replit app URL)
set POS_URL=https://your-app-name.replit.app

REM Wait a few seconds for network to initialize after boot
timeout /t 5 /nobreak >nul

REM Launch Edge in kiosk mode (fullscreen, no address bar)
start msedge --kiosk "%POS_URL%" --edge-kiosk-type=fullscreen

REM Alternative options (uncomment the one you prefer):

REM Option 2: Kiosk mode with a specific window size
REM start msedge --kiosk "%POS_URL%" --edge-kiosk-type=fullscreen --window-size=1920,1080

REM Option 3: Fullscreen but NOT kiosk (user can still access browser controls with F11)
REM start msedge --start-fullscreen "%POS_URL%"

REM Option 4: App mode (no tabs, minimal UI, but not true kiosk)
REM start msedge --app="%POS_URL%"
