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

cleanup_on_failure() {
    echo ""
    print_error "Installation failed - cleaning up..."
    
    if [[ -f "/etc/systemd/system/ops-pos-service-host.service" ]]; then
        sudo systemctl stop ops-pos-service-host 2>/dev/null || true
        sudo systemctl disable ops-pos-service-host 2>/dev/null || true
        sudo rm -f /etc/systemd/system/ops-pos-service-host.service
        sudo systemctl daemon-reload 2>/dev/null || true
    fi
    
    echo "    Partial installation remains at: $ROOT_DIR"
    echo "    Review the error above and try again."
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

trap cleanup_on_failure ERR

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

HTTP_CODE=$(curl -fsSL -w "%{http_code}" -o "$SERVICE_HOST_PATH" "$SERVICE_HOST_URL" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" != "200" ]]; then
    print_error "CRITICAL: Failed to download Service Host"
    echo "    URL: $SERVICE_HOST_URL"
    echo "    HTTP Status: $HTTP_CODE"
    echo ""
    echo -e "\033[33mPossible solutions:\033[0m"
    echo "  1. Verify the cloud URL is correct"
    echo "  2. Check network connectivity to the server"
    echo "  3. Manually download service-host and place at: $SERVICE_HOST_PATH"
    cleanup_on_failure
    exit 1
fi

if [[ ! -f "$SERVICE_HOST_PATH" ]]; then
    print_error "CRITICAL: Download completed but file not found"
    echo "    Expected path: $SERVICE_HOST_PATH"
    cleanup_on_failure
    exit 1
fi

FILE_SIZE=$(stat -f%z "$SERVICE_HOST_PATH" 2>/dev/null || stat --printf="%s" "$SERVICE_HOST_PATH" 2>/dev/null || echo "0")
if [[ "$FILE_SIZE" -lt 1000 ]]; then
    print_error "CRITICAL: Downloaded file is too small ($FILE_SIZE bytes) - likely an error page"
    rm -f "$SERVICE_HOST_PATH"
    cleanup_on_failure
    exit 1
fi

chmod +x "$SERVICE_HOST_PATH"
print_success "Service Host downloaded to $SERVICE_HOST_PATH ($(echo "scale=2; $FILE_SIZE/1048576" | bc) MB)"

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
TOKEN_PATH="$ROOT_DIR/config/auth-token.json"

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

HTTP_CODE=$(curl -fsSL -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$REGISTRATION_PAYLOAD" \
    -o "$TOKEN_PATH" \
    "$REGISTRATION_URL" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then
    print_error "CRITICAL: Failed to register device with cloud"
    echo "    URL: $REGISTRATION_URL"
    echo "    HTTP Status: $HTTP_CODE"
    if [[ -f "$TOKEN_PATH" ]]; then
        echo "    Response: $(cat "$TOKEN_PATH")"
        rm -f "$TOKEN_PATH"
    fi
    echo ""
    echo -e "\033[33mPossible solutions:\033[0m"
    echo "  1. Verify the registration token is valid (tokens expire after 24 hours)"
    echo "  2. Check that the Property ID is correct"
    echo "  3. Verify the cloud server is accessible"
    cleanup_on_failure
    exit 1
fi

if [[ ! -f "$TOKEN_PATH" ]]; then
    print_error "CRITICAL: Registration completed but token file not created"
    cleanup_on_failure
    exit 1
fi

SERVICE_HOST_ID=$(grep -o '"serviceHostId":"[^"]*"' "$TOKEN_PATH" 2>/dev/null | cut -d'"' -f4 || echo "")
if [[ -z "$SERVICE_HOST_ID" ]]; then
    print_error "CRITICAL: Registration response missing serviceHostId"
    echo "    Response: $(cat "$TOKEN_PATH")"
    cleanup_on_failure
    exit 1
fi

print_success "Device registered successfully"
echo -e "    Service Host ID: \033[36m$SERVICE_HOST_ID\033[0m"

print_step "Creating systemd service..."
SERVICE_FILE="/etc/systemd/system/ops-pos-service-host.service"

if [[ ! -w "/etc/systemd/system" ]] && [[ $(id -u) -ne 0 ]]; then
    print_error "CRITICAL: Cannot write to /etc/systemd/system"
    echo "    Please run this script with sudo or as root"
    cleanup_on_failure
    exit 1
fi

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

print_step "Starting Service Host..."
if ! sudo systemctl start ops-pos-service-host; then
    print_error "CRITICAL: Failed to start Service Host"
    echo "    Check logs: sudo journalctl -u ops-pos-service-host -n 50"
    echo "    Check logs: cat $ROOT_DIR/service-host/logs/stderr.log"
    cleanup_on_failure
    exit 1
fi

sleep 3

SERVICE_STATUS=$(sudo systemctl is-active ops-pos-service-host 2>/dev/null || echo "unknown")
if [[ "$SERVICE_STATUS" != "active" ]]; then
    print_error "CRITICAL: Service Host is not running (status: $SERVICE_STATUS)"
    echo "    Check logs: sudo journalctl -u ops-pos-service-host -n 50"
    cleanup_on_failure
    exit 1
fi

print_success "Service Host started and running"

print_step "Verifying Service Host health..."
sleep 5

SERVICE_STATUS=$(sudo systemctl is-active ops-pos-service-host 2>/dev/null || echo "unknown")
if [[ "$SERVICE_STATUS" != "active" ]]; then
    print_error "WARNING: Service Host health check failed (status: $SERVICE_STATUS)"
    echo "    The installation completed but the service may not be working correctly."
    echo "    Check logs: sudo journalctl -u ops-pos-service-host -n 50"
else
    print_success "Service Host is healthy"
fi

trap - ERR

echo ""
echo "============================================"
echo -e "\033[32m  Bootstrap Installation Complete!\033[0m"
echo "============================================"
echo ""
echo -e "Installation Directory: \033[36m$ROOT_DIR\033[0m"
echo -e "Cloud URL: \033[36m$CLOUD_URL\033[0m"
echo -e "Property ID: \033[36m$PROPERTY_ID\033[0m"
echo -e "Service Host ID: \033[36m$SERVICE_HOST_ID\033[0m"
echo ""
echo -e "\033[33mNext Steps:\033[0m"
echo "  1. Verify the device appears in EMC under Devices"
echo "  2. Assign the device to a Revenue Center"
echo "  3. Deploy CAL packages as needed"
echo ""
echo -e "\033[36mAll future updates will be delivered via CAL packages automatically.\033[0m"

exit 0
