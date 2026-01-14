#!/bin/bash
# OPS-POS Base Setup - Linux/macOS Uninstallation Script

CAL_ROOT="${1:-${CAL_ROOT_DIR:-$HOME/ops-pos}}"

echo "=========================================="
echo "OPS-POS Base Setup - Uninstall"
echo "=========================================="
echo ""
echo "This will remove the .installed marker only."
echo "Directory structure will be preserved."
echo ""

marker_path="$CAL_ROOT/.installed"
if [ -f "$marker_path" ]; then
    rm -f "$marker_path"
    echo "Removed installation marker."
fi

echo ""
echo "Uninstall complete."
echo ""

exit 0
