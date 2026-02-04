#!/bin/bash
# Build All Platforms Script for Cloud POS
# Builds web app and prepares for all native platforms

set -e

echo "=== Cloud POS Full Build ==="
echo ""

# Step 1: Build web application
echo "[1/3] Building web application..."
npm run build

echo ""
echo "[2/3] Preparing Android..."
npx cap sync android
echo "Android project synced. To build APK:"
echo "  cd android && ./gradlew assembleDebug"

echo ""
echo "[3/3] Preparing Windows/Electron..."
echo "Electron is ready. To build installer:"
echo "  npx electron-builder --config electron/electron-builder.json --win"
echo ""
echo "For development testing:"
echo "  npx electron electron/main.js"

echo ""
echo "=== Build Summary ==="
echo "Web app:     dist/public/"
echo "Android:     android/ (run gradlew assembleDebug)"
echo "Windows:     electron/ (run electron-builder)"
echo ""
echo "See native/README.md for detailed build instructions."
