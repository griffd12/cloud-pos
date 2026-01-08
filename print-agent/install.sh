#!/bin/bash

# Cloud POS Print Agent - Linux/macOS Installer v2.0
# This script downloads, configures, and installs the Print Agent

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "============================================"
echo "  Cloud POS Print Agent Installer v2.0"
echo "============================================"
echo ""

# Set installation directory
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    INSTALL_DIR="$HOME/Library/Application Support/CloudPOS/PrintAgent"
else
    # Linux
    INSTALL_DIR="$HOME/.cloudpos/print-agent"
fi
CONFIG_FILE="$INSTALL_DIR/config.json"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[!] Node.js is not installed or not in PATH.${NC}"
    echo ""
    echo "Please install Node.js first:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  brew install node"
        echo "  or visit https://nodejs.org/"
    else
        echo "  sudo apt install nodejs npm  (Debian/Ubuntu)"
        echo "  sudo dnf install nodejs npm  (Fedora)"
        echo "  or visit https://nodejs.org/"
    fi
    echo ""
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Node.js found"
echo "     Version: $(node --version)"
echo ""

# Get configuration from user
echo "Please enter the following configuration details:"
echo "(You can find these in the Cloud POS admin panel under Print Agents)"
echo ""
echo "The server URL should be the full WebSocket URL, for example:"
echo "  wss://your-pos-app.replit.app/ws/print-agents"
echo ""

# Get URL
while true; do
    read -p "Enter Cloud POS Server URL: " CLOUD_URL
    if [ -n "$CLOUD_URL" ]; then
        break
    fi
    echo -e "${RED}[!] URL cannot be empty. Please try again.${NC}"
done

# Ensure URL ends with /ws/print-agents
if [[ "$CLOUD_URL" != *"/ws/print-agents"* ]]; then
    echo -e "${YELLOW}[*]${NC} Adding WebSocket endpoint to URL..."
    CLOUD_URL="${CLOUD_URL}/ws/print-agents"
fi

# Get Token
echo ""
while true; do
    read -p "Enter Agent Token: " AGENT_TOKEN
    if [ -n "$AGENT_TOKEN" ]; then
        break
    fi
    echo -e "${RED}[!] Token cannot be empty. Please try again.${NC}"
done

echo ""
echo "Configuration:"
echo "  URL:   $CLOUD_URL"
echo "  Token: ${AGENT_TOKEN:0:20}..."
echo ""

# Create installation directory
echo -e "${BLUE}[*]${NC} Creating installation directory..."
mkdir -p "$INSTALL_DIR"
echo -e "${GREEN}[OK]${NC} Installation directory: $INSTALL_DIR"

# Download print agent files
echo ""
echo -e "${BLUE}[*]${NC} Downloading Print Agent files..."

# Extract base URL from WebSocket URL for download
BASE_URL=$(echo "$CLOUD_URL" | sed 's|wss://|https://|g' | sed 's|ws://|http://|g' | sed 's|/ws/print-agents||g')
DOWNLOAD_URL="${BASE_URL}/api/print-agents/download"
echo "     Download URL: $DOWNLOAD_URL"

if command -v curl &> /dev/null; then
    curl -L -o "$INSTALL_DIR/print-agent.zip" "$DOWNLOAD_URL" --fail
elif command -v wget &> /dev/null; then
    wget -O "$INSTALL_DIR/print-agent.zip" "$DOWNLOAD_URL"
else
    echo -e "${RED}[!] Neither curl nor wget found. Please install one of them.${NC}"
    exit 1
fi

if [ ! -f "$INSTALL_DIR/print-agent.zip" ]; then
    echo -e "${RED}[!] Failed to download Print Agent${NC}"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} Downloaded successfully"

# Extract files
echo ""
echo -e "${BLUE}[*]${NC} Extracting files..."
cd "$INSTALL_DIR"
unzip -o print-agent.zip

# Move files from subdirectory if needed
if [ -d "$INSTALL_DIR/print-agent" ]; then
    echo -e "${BLUE}[*]${NC} Reorganizing files..."
    cp -r "$INSTALL_DIR/print-agent/"* "$INSTALL_DIR/"
    rm -rf "$INSTALL_DIR/print-agent"
fi

# Clean up
rm -f "$INSTALL_DIR/print-agent.zip"
echo -e "${GREEN}[OK]${NC} Files extracted"

# Create config.json
echo ""
echo -e "${BLUE}[*]${NC} Creating configuration file..."
cat > "$CONFIG_FILE" << EOF
{
  "server": "$CLOUD_URL",
  "token": "$AGENT_TOKEN",
  "defaultPrinterPort": 9100,
  "reconnectInterval": 5000,
  "maxReconnectInterval": 60000,
  "heartbeatInterval": 30000,
  "printTimeout": 10000
}
EOF
echo -e "${GREEN}[OK]${NC} Configuration saved to $CONFIG_FILE"

# Install dependencies
echo ""
echo -e "${BLUE}[*]${NC} Installing dependencies..."
cd "$INSTALL_DIR"

# Create package.json if it doesn't exist
if [ ! -f "$INSTALL_DIR/package.json" ]; then
    cat > "$INSTALL_DIR/package.json" << EOF
{
  "name": "cloud-pos-print-agent",
  "version": "1.0.0",
  "dependencies": {
    "ws": "^8.0.0"
  }
}
EOF
fi

npm install --production
echo -e "${GREEN}[OK]${NC} Dependencies installed"

# Verify print-agent.js exists
if [ ! -f "$INSTALL_DIR/print-agent.js" ]; then
    echo -e "${RED}[!] Error: print-agent.js not found after extraction${NC}"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} Print Agent files verified"

# Create helper scripts
echo ""
echo -e "${BLUE}[*]${NC} Creating helper scripts..."

# Start script
cat > "$INSTALL_DIR/start-agent.sh" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
echo "============================================"
echo "  Cloud POS Print Agent"
echo "============================================"
echo ""
echo "Starting agent... Press Ctrl+C to stop."
echo ""
node print-agent.js
EOF
chmod +x "$INSTALL_DIR/start-agent.sh"

# Start in background script
cat > "$INSTALL_DIR/start-agent-background.sh" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
nohup node print-agent.js >> agent.log 2>&1 &
echo "Print Agent started in background (PID: \$!)"
echo "Check agent.log for output."
EOF
chmod +x "$INSTALL_DIR/start-agent-background.sh"

# Stop script
cat > "$INSTALL_DIR/stop-agent.sh" << EOF
#!/bin/bash
echo "Stopping Cloud POS Print Agent..."
pkill -f "node.*print-agent.js" 2>/dev/null && echo "Agent stopped." || echo "Agent was not running."
EOF
chmod +x "$INSTALL_DIR/stop-agent.sh"

# View logs script
cat > "$INSTALL_DIR/view-logs.sh" << EOF
#!/bin/bash
echo "============================================"
echo "  Cloud POS Print Agent Logs"
echo "============================================"
echo ""
if [ -f "$INSTALL_DIR/agent.log" ]; then
    tail -100 "$INSTALL_DIR/agent.log"
else
    echo "No log file found."
fi
EOF
chmod +x "$INSTALL_DIR/view-logs.sh"

echo -e "${GREEN}[OK]${NC} Helper scripts created"

# Ask about systemd service (Linux only)
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo ""
    read -p "Would you like to install as a systemd service (auto-start on boot)? (y/n): " INSTALL_SERVICE
    if [[ "$INSTALL_SERVICE" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}[*]${NC} Creating systemd service..."
        
        SERVICE_FILE="/etc/systemd/system/cloudpos-print-agent.service"
        sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Cloud POS Print Agent
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/print-agent.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable cloudpos-print-agent
        echo -e "${GREEN}[OK]${NC} Systemd service installed"
        echo ""
        echo "Service commands:"
        echo "  sudo systemctl start cloudpos-print-agent   - Start service"
        echo "  sudo systemctl stop cloudpos-print-agent    - Stop service"
        echo "  sudo systemctl status cloudpos-print-agent  - Check status"
        echo "  sudo journalctl -u cloudpos-print-agent -f  - View logs"
    fi
fi

# Installation complete
echo ""
echo "============================================"
echo "  Installation Complete!"
echo "============================================"
echo ""
echo "Installation directory: $INSTALL_DIR"
echo ""
echo "Available scripts:"
echo "  - start-agent.sh           : Start the agent (foreground)"
echo "  - start-agent-background.sh: Start the agent in background"
echo "  - stop-agent.sh            : Stop the agent"
echo "  - view-logs.sh             : View agent logs"
echo ""

read -p "Would you like to test the connection now? (y/n): " TEST_NOW
if [[ "$TEST_NOW" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Starting Print Agent..."
    echo "(Press Ctrl+C to stop)"
    echo ""
    cd "$INSTALL_DIR"
    node print-agent.js
else
    echo ""
    echo "To start the agent later, run:"
    echo "  $INSTALL_DIR/start-agent.sh"
    echo ""
fi
