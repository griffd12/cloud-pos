# Print Agent Installation Guide

This guide covers installing the Print Agent on terminals for local network printing.

## Overview

The Cloud POS runs on the internet, but your thermal printers are on your local network. The Print Agent bridges this gap by running on a computer at your location and forwarding print jobs to local printers.

## Prerequisites

- Node.js 16+ installed on the terminal
- Network access to the Cloud POS system
- Network printers accessible via TCP/IP (port 9100)

## Installation Steps

### Step 1: Create Print Agent in EMC

1. Log into Cloud POS Admin → Print Agents
2. Click "Create Agent" button
3. Enter a name (e.g., "WS02 Print Agent")
4. Select the Property (e.g., "Newport Beach")
5. Click Create

**Important:** Copy and save the Agent Token displayed - this token is only shown once.

### Step 2: Download Agent Software

1. In the Print Agents admin page, click "Download Agent Software"
2. Save the `print-agent.zip` file to the terminal
3. Extract to a folder (e.g., `C:\CloudPOS\PrintAgent` or `/opt/cloudpos/print-agent`)

### Step 3: Configure the Agent

**Option A: Using config.json**

Create a `config.json` file in the print-agent folder:

```json
{
  "server": "wss://your-cloudpos-url.replit.app",
  "token": "paste-your-agent-token-here"
}
```

**Option B: Using command-line arguments**

```bash
node print-agent.js --server wss://your-cloudpos-url.replit.app --token your-agent-token
```

### Step 4: Install Dependencies

```bash
cd /path/to/print-agent
npm install
```

### Step 5: Start the Agent

```bash
node print-agent.js
```

Or for production with pm2:

```bash
npm install -g pm2
pm2 start print-agent.js --name "print-agent"
pm2 startup
pm2 save
```

**Windows:** Use the included `install-windows.bat` for automated installation including auto-start.

**Linux/macOS:** Use the included `install.sh` for automated installation.

### Step 6: Verify Connection

1. Check the terminal console for "Connected to Cloud POS"
2. In EMC → Print Agents, verify status shows "Online" (green)
3. Create a test transaction and print a receipt

## Architecture Overview

```
[POS Terminal] → [Cloud POS] → WebSocket → [Print Agent] → TCP/IP → [Network Printer]
```

### Connection Flow

1. Print Agent connects to Cloud POS via WebSocket at `/ws/print-agents`
2. Agent sends HELLO message with authentication token
3. Cloud responds with AUTH_OK and agent info
4. Agent receives JOB messages containing ESC/POS data
5. Agent forwards data to printer via TCP/IP port 9100
6. Agent sends DONE/ERROR back to cloud

### Connection Modes

| Mode | Cloud | Service Host | Print Agent | Description |
|------|-------|--------------|-------------|-------------|
| GREEN | Yes | - | Yes | Full cloud operation |
| YELLOW | No | Yes | Yes | Offline with Service Host |
| ORANGE | No | No | Yes | Direct print agent only |
| RED | No | No | No | No services available |

## Workstation Service Bindings

In EMC → Workstations, you can view which terminals are designated for which services:

| Workstation | Recommended Services |
|-------------|---------------------|
| WS01 | CAPS (order entry), Payment Controller |
| WS02 | Print Controller, KDS Controller |

Note: Service bindings are for planning purposes. Actual print routing is based on which agents are online for each property.

## Troubleshooting

### Agent Won't Connect

1. Verify the Agent Token is correct (regenerate in EMC if needed)
2. Check the server URL format: `wss://your-app.replit.app` (use wss:// not https://)
3. Verify firewall allows outbound HTTPS/WSS connections
4. Check console output for connection errors

### Printer Not Responding

1. Verify printer IP address in EMC → Printers
2. Test printer connectivity: `echo "test" | nc -w 2 PRINTER_IP 9100`
3. Confirm printer is ESC/POS compatible (most thermal receipt printers are)
4. Check printer is powered on and has paper

### Jobs Stuck in "Pending"

1. Verify agent is online in EMC → Print Agents
2. Check agent console for errors
3. Ensure printer is configured in EMC with correct IP
4. Restart agent and retry

## Configuration Options

| Config Property | CLI Argument | Description | Default |
|-----------------|--------------|-------------|---------|
| server | --server | Cloud POS WebSocket URL | Required |
| token | --token | Agent authentication token | Required |
| reconnectInterval | - | Time between reconnect attempts (ms) | 5000 |
| maxReconnectInterval | - | Maximum reconnect interval (ms) | 60000 |
| heartbeatInterval | - | Heartbeat frequency (ms) | 30000 |
| printTimeout | - | Print job timeout (ms) | 10000 |

## Helper Scripts

After running the installer, these scripts are available:

**Windows** (in installation folder):
- `start-agent.bat` - Start the Print Agent
- `stop-agent.bat` - Stop the Print Agent
- `view-logs.bat` - View agent logs

**Linux/macOS**:
- `start-agent.sh` - Start the Print Agent
- `stop-agent.sh` - Stop the Print Agent
- `view-logs.sh` - View agent logs

## Additional Resources

See the full Print Agent README at `print-agent/README.md` in the source code for more detailed documentation.
