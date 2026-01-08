# Cloud POS Print Agent

This is a local print agent that runs on-premises at your property. It connects to the Cloud POS system and relays print jobs to local network printers.

## Why Do I Need This?

The Cloud POS runs on the internet, but your thermal printers are on your local network (192.168.x.x addresses). The cloud cannot directly reach local network printers. This agent bridges that gap by:

1. Running on a computer at your location (Windows, Mac, or Linux)
2. Connecting outbound to the Cloud POS via WebSocket
3. Receiving print jobs from the cloud
4. Forwarding them to your local network printers

## Requirements

- Node.js 16 or later
- A computer on the same network as your printers
- Network printers accessible via TCP/IP (usually port 9100)

## Installation

1. Copy this folder to a computer at your property
2. Run `npm install` to install dependencies
3. Configure your agent (see below)
4. Run `npm start` or `node print-agent.js`

## Configuration

### Option 1: Config File

Create a `config.json` file in the same folder:

```json
{
  "server": "https://your-pos-app.replit.app",
  "token": "your-agent-token-from-emc"
}
```

### Option 2: Command Line

```bash
node print-agent.js --server https://your-pos-app.replit.app --token your-agent-token
```

## Getting Your Agent Token

1. Log into the EMC (Enterprise Management Console)
2. Go to Property Settings > Print Agents
3. Click "Add Print Agent"
4. Copy the generated token (it's only shown once!)
5. Paste it into your config.json or command line

## Running as a Service

### Windows

Use a tool like [nssm](https://nssm.cc/) or [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start print-agent.js --name "POS Print Agent"
pm2 save
pm2 startup
```

### Linux/Mac

Using pm2:

```bash
npm install -g pm2
pm2 start print-agent.js --name "pos-print-agent"
pm2 save
pm2 startup
```

Or create a systemd service (Linux):

```ini
[Unit]
Description=Cloud POS Print Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /path/to/print-agent.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### "Connection timeout"

- Ensure your printer is powered on
- Verify the printer IP address is correct
- Check that port 9100 is accessible (try `telnet <printer-ip> 9100`)

### "Authentication failed"

- Verify your agent token is correct
- Check if the agent was disabled in EMC
- Try regenerating the token in EMC

### Agent keeps disconnecting

- Check your internet connection
- The agent will automatically reconnect with exponential backoff
- Check the EMC to verify the agent status

## Configuration Options

All options in `config.json`:

| Option | Default | Description |
|--------|---------|-------------|
| server | (required) | Cloud POS server URL |
| token | (required) | Agent authentication token |
| reconnectInterval | 5000 | Initial reconnect delay (ms) |
| maxReconnectInterval | 60000 | Maximum reconnect delay (ms) |
| heartbeatInterval | 30000 | Heartbeat frequency (ms) |
| defaultPrinterPort | 9100 | Default printer TCP port |
| printTimeout | 10000 | Printer connection timeout (ms) |
