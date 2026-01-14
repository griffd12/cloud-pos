#!/bin/bash
# OPS-POS Base Setup - Linux/macOS Installation Script
# This script creates the base directory structure for OPS-POS

CAL_ROOT="${1:-${CAL_ROOT_DIR:-$HOME/ops-pos}}"

echo "=========================================="
echo "OPS-POS Base Setup v1.0.0"
echo "=========================================="
echo ""
echo "Installation Directory: $CAL_ROOT"
echo ""

# Create the main directory structure
directories=(
    "$CAL_ROOT"
    "$CAL_ROOT/ServiceHost"
    "$CAL_ROOT/ServiceHost/data"
    "$CAL_ROOT/ServiceHost/logs"
    "$CAL_ROOT/Packages"
    "$CAL_ROOT/PrintAgent"
    "$CAL_ROOT/Config"
    "$CAL_ROOT/Logs"
)

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "Creating directory: $dir"
        mkdir -p "$dir"
    else
        echo "Directory exists: $dir"
    fi
done

# Create default configuration file
config_path="$CAL_ROOT/Config/settings.json"
if [ ! -f "$config_path" ]; then
    echo ""
    echo "Creating default configuration..."
    cat > "$config_path" << EOF
{
  "version": "1.0.0",
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "rootDirectory": "$CAL_ROOT",
  "serviceHost": {
    "enabled": true,
    "port": 3001
  },
  "printAgent": {
    "enabled": false,
    "port": 9200
  }
}
EOF
    echo "Configuration saved to: $config_path"
fi

# Create a marker file to indicate successful installation
marker_path="$CAL_ROOT/.installed"
cat > "$marker_path" << EOF
{
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "1.0.0",
  "packageName": "OPS-POS Base Setup"
}
EOF

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Directory structure created at: $CAL_ROOT"
echo ""

exit 0
