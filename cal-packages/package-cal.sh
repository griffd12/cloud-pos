#!/bin/bash
# Script to package a CAL package directory into a .tar.gz file
# Usage: ./package-cal.sh <package-directory>

if [ -z "$1" ]; then
    echo "Usage: ./package-cal.sh <package-directory>"
    echo "Example: ./package-cal.sh ops-pos-base-setup"
    exit 1
fi

PACKAGE_DIR="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$SCRIPT_DIR/$PACKAGE_DIR" ]; then
    echo "Error: Package directory '$PACKAGE_DIR' not found in $SCRIPT_DIR"
    exit 1
fi

# Read version from manifest.json if it exists
if [ -f "$SCRIPT_DIR/$PACKAGE_DIR/manifest.json" ]; then
    VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SCRIPT_DIR/$PACKAGE_DIR/manifest.json" | cut -d'"' -f4)
else
    VERSION="1.0.0"
fi

OUTPUT_FILE="${PACKAGE_DIR}-${VERSION}.tar.gz"

echo "=========================================="
echo "CAL Package Builder"
echo "=========================================="
echo ""
echo "Package: $PACKAGE_DIR"
echo "Version: $VERSION"
echo "Output:  $OUTPUT_FILE"
echo ""

cd "$SCRIPT_DIR"

# Create the tar.gz package
tar -czvf "$OUTPUT_FILE" -C "$PACKAGE_DIR" .

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "Package created successfully!"
    echo "=========================================="
    echo ""
    echo "File: $SCRIPT_DIR/$OUTPUT_FILE"
    echo "Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
    echo ""
    echo "To deploy this package:"
    echo "1. Upload the .tar.gz file to a web server or cloud storage"
    echo "2. In EMC, go to CAL Packages and create a new package version"
    echo "3. Enter the download URL for the package"
    echo "4. Create a deployment targeting the desired property/devices"
    echo ""
else
    echo "Error: Failed to create package"
    exit 1
fi
