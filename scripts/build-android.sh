#!/bin/bash
# Android APK Build Script for Cloud POS
# This script builds the web app and syncs to Android project

set -e

echo "=== Cloud POS Android Build ==="

# Step 1: Build the web app
echo "[1/4] Building web application..."
npm run build

# Step 2: Sync with Capacitor
echo "[2/4] Syncing with Capacitor Android..."
npx cap sync android

# Step 3: Generate debug APK (no signing required)
echo "[3/4] Building debug APK..."
cd android
./gradlew assembleDebug

# Step 4: Copy APK to output directory
echo "[4/4] Copying APK to output..."
mkdir -p ../dist/android
cp app/build/outputs/apk/debug/app-debug.apk ../dist/android/CloudPOS-debug.apk

echo ""
echo "=== Build Complete ==="
echo "Debug APK: dist/android/CloudPOS-debug.apk"
echo ""
echo "To build a release APK, you need to:"
echo "1. Create a keystore: keytool -genkey -v -keystore cloudpos.keystore -alias cloudpos -keyalg RSA -keysize 2048 -validity 10000"
echo "2. Configure signing in android/app/build.gradle"
echo "3. Run: cd android && ./gradlew assembleRelease"
