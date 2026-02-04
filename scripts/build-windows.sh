#!/bin/bash
# Windows Executable Build Script for Cloud POS
# This script builds the web app and creates Windows installers using Electron Builder

set -e

echo "=== Cloud POS Windows Build ==="

# Step 1: Build the web app
echo "[1/3] Building web application..."
npm run build

# Step 2: Build Windows executables
echo "[2/3] Building Windows executables..."
echo "Note: Cross-compilation from Linux requires Wine. For production builds, use a Windows machine or CI."

# Check if running on Windows or has Wine
if command -v wine &> /dev/null || [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    npx electron-builder --config electron/electron-builder.json --win
    
    echo "[3/3] Build complete!"
    echo ""
    echo "=== Output Files ==="
    ls -la electron-dist/*.exe 2>/dev/null || echo "Check electron-dist/ for output files"
else
    echo ""
    echo "=== Cross-compilation Note ==="
    echo "Windows builds from Linux require Wine installed."
    echo ""
    echo "Options:"
    echo "1. Install Wine: sudo apt install wine"
    echo "2. Use GitHub Actions for CI builds (see .github/workflows/)"
    echo "3. Build directly on a Windows machine"
    echo ""
    echo "For development testing, you can run Electron directly:"
    echo "  npm run build && npx electron electron/main.js"
fi
