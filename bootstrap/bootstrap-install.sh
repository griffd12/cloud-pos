#!/bin/bash
# OPS-POS Bootstrap Installer for Linux
# This script installs the initial Service Host and CAL client
# After this, all future updates come via CAL packages

set -e

print_header() {
    echo "============================================"
    echo "  OPS-POS Bootstrap Installer v1.0.0"
    echo "============================================"
    echo ""
}

print_step() {
    echo -e "\033[33m[*] $1\033[0m"
}

print_success() {
    echo -e "\033[32m[+] $1\033[0m"
}

print_error() {
    echo -e "\033[31m[-] $1\033[0m"
}

usage() {
    echo "Usage: $0 --cloud-url <URL> --property-id <ID> --registration-token <TOKEN> [OPTIONS]"
    echo ""
    echo "Required:"
    echo "  --cloud-url           Cloud server URL (e.g., https://pos.example.com)"
    echo "  --property-id         Property ID to register with"
    echo "  --registration-token  One-time registration token from EMC"
    echo ""
    echo "Optional:"
    echo "  --device-name         Device name (default: hostname)"
    echo "  --root-dir            Installation directory (default: ~/ops-pos)"
    echo "  --help                Show this help message"
    echo ""
    exit 1
}

CLOUD_URL=""
PROPERTY_ID=""
REGISTRATION_TOKEN=""
DEVICE_NAME=$(hostname)
ROOT_DIR="$HOME/ops-pos"

while [[ $# -gt 0 ]]; do
    case $1 in
        --cloud-url)
            CLOUD_URL="$2"
            shift 2
            ;;
        --property-id)
            PROPERTY_ID="$2"
            shift 2
            ;;
        --registration-token)
            REGISTRATION_TOKEN="$2"
            shift 2
            ;;
        --device-name)
            DEVICE_NAME="$2"
            shift 2
            ;;
        --root-dir)
            ROOT_DIR="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

if [[ -z "$CLOUD_URL" ]] || [[ -z "$PROPERTY_ID" ]] || [[ -z "$REGISTRATION_TOKEN" ]]; then
    echo "Error: Missing required parameters"
    usage
fi

print_header

print_step "Creating OPS-POS directory structure..."

directories=(
    "$ROOT_DIR"
    "$ROOT_DIR/service-host"
    "$ROOT_DIR/service-host/data"
    "$ROOT_DIR/service-host/logs"
    "$ROOT_DIR/packages"
    "$ROOT_DIR/print-agent"
    "$ROOT_DIR/config"
    "$ROOT_DIR/logs"
)

for dir in "${directories[@]}"; do
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        echo "    Created: $dir"
    else
        echo "    Exists: $dir"
    fi
done
print_success "Directory structure created"

print_step "Downloading Service Host..."
SERVICE_HOST_URL="$CLOUD_URL/downloads/service-host"
SERVICE_HOST_PATH="$ROOT_DIR/service-host/service-host"

if curl -fsSL -o "$SERVICE_HOST_PATH" "$SERVICE_HOST_URL" 2>/dev/null; then
    chmod +x "$SERVICE_HOST_PATH"
    print_success "Service Host downloaded to $SERVICE_HOST_PATH"
else
    print_error "Failed to download Service Host from $SERVICE_HOST_URL"
    echo "    You may need to manually copy service-host to $SERVICE_HOST_PATH"
fi

print_step "Creating configuration file..."
CONFIG_PATH="$ROOT_DIR/config/service-host.json"
INSTALLED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$CONFIG_PATH" << EOF
{
  "cloudUrl": "$CLOUD_URL",
  "propertyId": "$PROPERTY_ID",
  "deviceName": "$DEVICE_NAME",
  "rootDir": "$ROOT_DIR",
  "dataDir": "$ROOT_DIR/service-host/data",
  "logsDir": "$ROOT_DIR/service-host/logs",
  "packagesDir": "$ROOT_DIR/packages",
  "autoStart": true,
  "registeredAt": "$INSTALLED_AT"
}
EOF
print_success "Configuration saved to $CONFIG_PATH"

print_step "Registering device with cloud..."
REGISTRATION_URL="$CLOUD_URL/api/devices/register"
REGISTRATION_PAYLOAD=$(cat << EOF
{
  "propertyId": "$PROPERTY_ID",
  "deviceName": "$DEVICE_NAME",
  "deviceType": "service_host",
  "registrationToken": "$REGISTRATION_TOKEN",
  "hostname": "$(hostname)",
  "platform": "linux",
  "installedAt": "$INSTALLED_AT"
}
EOF
)

TOKEN_PATH="$ROOT_DIR/config/auth-token.json"
if curl -fsSL -X POST -H "Content-Type: application/json" -d "$REGISTRATION_PAYLOAD" -o "$TOKEN_PATH" "$REGISTRATION_URL" 2>/dev/null; then
    print_success "Device registered successfully"
    SERVICE_HOST_ID=$(cat "$TOKEN_PATH" | grep -o '"serviceHostId":"[^"]*"' | cut -d'"' -f4)
    echo -e "    Service Host ID: \033[36m$SERVICE_HOST_ID\033[0m"
else
    print_error "Failed to register with cloud"
    echo "    You can register manually later via EMC"
fi

print_step "Creating systemd service..."
SERVICE_FILE="/etc/systemd/system/ops-pos-service-host.service"

if [[ -w "/etc/systemd/system" ]]; then
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=OPS-POS Service Host
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$ROOT_DIR/service-host
ExecStart=$SERVICE_HOST_PATH --config $CONFIG_PATH
Restart=always
RestartSec=10
StandardOutput=append:$ROOT_DIR/service-host/logs/stdout.log
StandardError=append:$ROOT_DIR/service-host/logs/stderr.log

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable ops-pos-service-host
    print_success "Systemd service installed: ops-pos-service-host"
else
    print_error "Cannot write to /etc/systemd/system - run as root to install service"
    echo "    You can run Service Host manually: $SERVICE_HOST_PATH --config $CONFIG_PATH"
fi

print_step "Starting Service Host..."
if sudo systemctl start ops-pos-service-host 2>/dev/null; then
    print_success "Service Host started"
else
    print_error "Failed to start Service Host"
    echo "    Run manually: $SERVICE_HOST_PATH --config $CONFIG_PATH"
fi

echo ""
echo "============================================"
echo "  Bootstrap Installation Complete!"
echo "============================================"
echo ""
echo -e "Installation Directory: \033[36m$ROOT_DIR\033[0m"
echo -e "Cloud URL: \033[36m$CLOUD_URL\033[0m"
echo -e "Property ID: \033[36m$PROPERTY_ID\033[0m"
echo ""
echo -e "\033[33mNext Steps:\033[0m"
echo "  1. Verify the device appears in EMC under Devices"
echo "  2. Assign the device to a Revenue Center"
echo "  3. Deploy CAL packages as needed"
echo ""
echo -e "\033[36mAll future updates will be delivered via CAL packages automatically.\033[0m"
