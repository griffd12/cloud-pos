# Cloud POS Print Agent

This is a local print agent that runs on-premises at your property. It connects to the Cloud POS system and relays print jobs to local network printers.

## Quick Start

1. Install Node.js (version 16 or later) from https://nodejs.org
2. Open a terminal/command prompt in this folder
3. Run `npm install` to install dependencies
4. Create a `config.json` file with your settings (see Configuration below)
5. Run `npm start` to start the agent

## Why Do I Need This?

The Cloud POS runs on the internet, but your thermal printers are on your local network (192.168.x.x addresses). The cloud cannot directly reach local network printers. This agent bridges that gap by:

1. Running on a computer at your location (Windows, Mac, or Linux)
2. Connecting outbound to the Cloud POS via WebSocket
3. Receiving print jobs from the cloud
4. Forwarding them to your local network printers

## System Requirements

- **Operating System**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 18.04+, etc.)
- **Node.js**: Version 16.x or later (download from https://nodejs.org)
- **Network**: Computer must be on the same network as your printers
- **Printers**: Network printers accessible via TCP/IP on port 9100 (most thermal receipt printers)
- **Internet**: Stable internet connection for cloud communication

## Installation

### Step 1: Install Node.js

**Windows:**
1. Download the Windows installer from https://nodejs.org (LTS version recommended)
2. Run the installer and follow the prompts
3. Restart your computer after installation

**macOS:**
1. Download the macOS installer from https://nodejs.org
2. Run the installer and follow the prompts
3. Or use Homebrew: `brew install node`

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Step 2: Install Dependencies

Open a terminal/command prompt, navigate to the print-agent folder, and run:

```bash
npm install
```

### Step 3: Get Your Agent Token

1. Log into the EMC (Enterprise Management Console) at your Cloud POS URL
2. Navigate to **Property Settings** > **Print Agents**
3. Click **Add Print Agent**
4. Give your agent a name (e.g., "Kitchen Print Agent")
5. **Important:** Copy the generated token immediately - it's only shown once!
6. Save this token for the next step

### Step 4: Configure the Agent

Create a file named `config.json` in the same folder as the agent:

```json
{
  "server": "https://your-cloud-pos-url.replit.app",
  "token": "paste-your-agent-token-here"
}
```

Replace:
- `your-cloud-pos-url.replit.app` with your actual Cloud POS URL
- `paste-your-agent-token-here` with the token you copied in Step 3

### Step 5: Test the Agent

Run the agent to test the connection:

```bash
npm start
```

You should see output like:
```
Cloud POS Print Agent v1.0.0
Connecting to: wss://your-cloud-pos-url.replit.app/ws/print-agents
Connected! Authenticating...
Authenticated successfully. Ready for print jobs.
```

Press Ctrl+C to stop the agent.

## Configuration Options

### Config File (config.json)

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| server | Yes | - | Your Cloud POS server URL (without /ws path) |
| token | Yes | - | Agent authentication token from EMC |
| reconnectInterval | No | 5000 | Initial reconnect delay in milliseconds |
| maxReconnectInterval | No | 60000 | Maximum reconnect delay in milliseconds |
| heartbeatInterval | No | 30000 | Heartbeat frequency in milliseconds |
| defaultPrinterPort | No | 9100 | Default TCP port for printers |
| printTimeout | No | 10000 | Printer connection timeout in milliseconds |

### Command Line Options

You can also pass configuration via command line:

```bash
node print-agent.js --server https://your-pos-app.replit.app --token your-agent-token
```

## Running as a Background Service

For production use, you'll want the agent to start automatically and run in the background.

### Windows - Using PM2

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Start the agent with PM2:
   ```bash
   pm2 start print-agent.js --name "POS Print Agent"
   ```

3. Save the configuration:
   ```bash
   pm2 save
   ```

4. Set up auto-start on boot:
   ```bash
   pm2 startup
   ```
   Follow the instructions provided.

### Windows - Using NSSM (Alternative)

1. Download NSSM from https://nssm.cc/
2. Run: `nssm install "POS Print Agent"`
3. Set the path to node.exe and print-agent.js
4. Start the service from Windows Services

### Linux - Using PM2

```bash
npm install -g pm2
pm2 start print-agent.js --name "pos-print-agent"
pm2 save
pm2 startup
```

### Linux - Using systemd

Create a service file at `/etc/systemd/system/pos-print-agent.service`:

```ini
[Unit]
Description=Cloud POS Print Agent
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/print-agent
ExecStart=/usr/bin/node print-agent.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pos-print-agent
sudo systemctl start pos-print-agent
```

### macOS - Using PM2

```bash
npm install -g pm2
pm2 start print-agent.js --name "pos-print-agent"
pm2 save
pm2 startup
```

## Testing Your Printer Connection

Before running the agent, verify your printer is accessible:

**Windows:**
```bash
telnet 192.168.1.100 9100
```
(Enable Telnet in Windows Features if not available)

**macOS/Linux:**
```bash
nc -zv 192.168.1.100 9100
```

Replace `192.168.1.100` with your printer's IP address. A successful connection means the printer is reachable.

## Finding Your Printer's IP Address

Most network printers can print a configuration page that includes the IP address:
- Look for a "Print Config" or "Network Status" button on the printer
- Or access the printer's menu panel

Common locations for the IP:
- Epson TM-T88: Hold Feed button while powering on
- Star TSP: Self-test button or menu
- Check your router's DHCP client list

## Troubleshooting

### "Connection refused" or "Connection timeout"

- Verify the printer is powered on and connected to the network
- Check the printer IP address is correct
- Ensure port 9100 is accessible (test with telnet/nc as shown above)
- Some printers use a different port - check your printer manual

### "Authentication failed"

- Verify your agent token is correct (no extra spaces)
- Check if the agent was disabled in EMC
- Try regenerating the token in EMC (Print Agents > your agent > Regenerate Token)

### "WebSocket connection failed"

- Check your internet connection
- Verify the server URL is correct
- Ensure firewalls allow outbound WebSocket connections (port 443)

### Agent keeps disconnecting

- Check your internet connection stability
- The agent will automatically reconnect with exponential backoff
- Monitor the EMC to verify the agent's connection status

### Print jobs fail

- Check if the printer is online and has paper
- Verify the printer IP hasn't changed (use DHCP reservation)
- Test the printer connection manually (telnet/nc)
- Check the agent logs for specific error messages

## Logs and Monitoring

The agent outputs logs to the console. When running with PM2:

```bash
pm2 logs "POS Print Agent"
```

You can also monitor agent status in the EMC under Print Agents.

## Security Notes

- The agent token is sensitive - don't share it or commit it to version control
- The agent only connects outbound (no inbound ports need to be opened)
- All communication is encrypted via WSS (WebSocket Secure)
- Consider running the agent on a dedicated computer or VM

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the agent logs for error messages
3. Verify your configuration in the EMC
4. Contact your system administrator

## Version History

- **1.0.0** - Initial release with basic print relay functionality
