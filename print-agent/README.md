# Cloud POS Print Agent

This is a local print agent that runs on-premises at your property. It connects to the Cloud POS system and relays print jobs to local network printers.

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

---

## Quick Start - One-Click Installers (Recommended)

### Step 1: Get Your Agent Token First

1. Log into the EMC (Enterprise Management Console) at your Cloud POS URL
2. Navigate to **Property Settings** > **Print Agents**
3. Click **Create Agent**
4. Give your agent a name (e.g., "Kitchen Print Agent")
5. **Important:** Copy the generated token immediately - it's only shown once!
6. Also note your Server URL (e.g., `wss://your-app.replit.app`)

### Step 2: Run the Installer

#### Windows

1. Download `install-windows.bat` from the Cloud POS admin panel
2. Right-click the file and select **Run as administrator**
3. The installer will:
   - Check for Node.js (and help you install it if needed)
   - Download the print agent files
   - Ask for your Server URL and Agent Token
   - Configure everything automatically
   - Optionally set up auto-start on Windows boot
   - Start the agent

#### Linux / macOS

1. Download `install.sh` from the Cloud POS admin panel
2. Open a terminal and run:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```
3. The installer will guide you through the same steps

That's it! The agent will now run and relay print jobs to your local printers.

### Helper Scripts Created by Installer

**Windows** (in `C:\ProgramData\CloudPOS\PrintAgent`):
- `start-agent.bat` - Start the Print Agent (visible console)
- `start-agent-hidden.bat` - Start in background
- `stop-agent.bat` - Stop the Print Agent
- `view-logs.bat` - View agent logs
- `test-connection.bat` - Test server connection

**Linux/macOS** (in installation directory):
- `start-agent.sh` - Start the Print Agent (foreground)
- `start-agent-background.sh` - Start in background
- `stop-agent.sh` - Stop the Print Agent
- `view-logs.sh` - View agent logs

---

## Manual Installation (All Platforms)

If you prefer manual installation:

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

### Step 2: Download Print Agent

Download the print-agent.zip from:
- EMC > Property Settings > Print Agents > Download Agent

Or directly from: `https://your-cloud-pos-url/api/print-agents/download`

Extract the ZIP to a folder (e.g., `C:\PrintAgent` or `/opt/print-agent`)

### Step 3: Install Dependencies

Open a terminal/command prompt, navigate to the print-agent folder, and run:

```bash
npm install
```

### Step 4: Get Your Agent Token

1. Log into the EMC at your Cloud POS URL
2. Navigate to **Property Settings** > **Print Agents**
3. Click **Create Agent**
4. Give your agent a name (e.g., "Kitchen Print Agent")
5. **Important:** Copy the generated token immediately - it's only shown once!
6. Save this token for the next step

### Step 5: Configure the Agent

Create a file named `config.json` in the same folder as the agent:

```json
{
  "server": "wss://your-cloud-pos-url.replit.app/ws/print-agents",
  "token": "paste-your-agent-token-here",
  "defaultPrinterPort": 9100,
  "reconnectInterval": 5000,
  "maxReconnectInterval": 60000,
  "heartbeatInterval": 30000
}
```

Replace:
- `your-cloud-pos-url.replit.app` with your actual Cloud POS URL
- `paste-your-agent-token-here` with the token you copied

### Step 6: Test the Agent

Run the agent to test the connection:

```bash
node print-agent.js
```

You should see output like:
```
Cloud POS Print Agent v1.0.0
Connecting to: wss://your-cloud-pos-url.replit.app/ws/print-agents
Connected! Authenticating...
Authenticated successfully. Ready for print jobs.
```

Press Ctrl+C to stop the agent.

---

## Configuration Options

### Config File (config.json)

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| server | Yes | - | WebSocket URL (wss://your-url/ws/print-agents) |
| token | Yes | - | Agent authentication token from EMC |
| defaultPrinterPort | No | 9100 | Default TCP port for printers |
| reconnectInterval | No | 5000 | Initial reconnect delay in milliseconds |
| maxReconnectInterval | No | 60000 | Maximum reconnect delay in milliseconds |
| heartbeatInterval | No | 30000 | Heartbeat frequency in milliseconds |
| printTimeout | No | 10000 | Print job timeout in milliseconds |

### Command Line Arguments

You can also pass configuration via command line:

```bash
node print-agent.js --server wss://your-url/ws/print-agents --token your-token
```

---

## Running as a Background Service

For production use, you'll want the agent to start automatically and run in the background.

### Windows - Automatic (via Installer)

If you used the one-click installer and selected "Yes" for auto-start, it's already configured!

### Linux - Using systemd (via Installer)

If you used `install.sh` and selected "Yes" for systemd service, it's already configured!

Service commands:
```bash
sudo systemctl start cloudpos-print-agent   # Start service
sudo systemctl stop cloudpos-print-agent    # Stop service
sudo systemctl status cloudpos-print-agent  # Check status
sudo journalctl -u cloudpos-print-agent -f  # View logs
```

### Using PM2 (All Platforms)

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

---

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

---

## Troubleshooting

### "Connection refused" or "Connection timeout"

- Verify the printer is powered on and connected to the network
- Check the printer IP address is correct
- Ensure port 9100 is accessible (test with telnet/nc as shown above)
- Some printers use a different port - check your printer manual

### "Authentication failed" or "Invalid agent token"

- Verify your agent token is correct (no extra spaces)
- Check if the agent was disabled in EMC
- Try regenerating the token in EMC (Print Agents > your agent > Regenerate Token)

### "WebSocket connection failed"

- Check your internet connection
- Verify the server URL is correct (should include `/ws/print-agents`)
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

---

## Logs and Monitoring

When running in foreground, logs output to the console.

When running in background:
- **Windows**: Check `agent.log` in the installation directory, or use `view-logs.bat`
- **Linux/macOS**: Check `agent.log` in the installation directory, or use `view-logs.sh`
- **systemd**: Use `journalctl -u cloudpos-print-agent -f`
- **PM2**: Use `pm2 logs "POS Print Agent"`

You can also monitor agent status in the EMC under Print Agents.

---

## Security Notes

- The agent token is sensitive - don't share it or commit it to version control
- The agent only connects outbound (no inbound ports need to be opened)
- All communication is encrypted via WSS (WebSocket Secure)
- Consider running the agent on a dedicated computer or VM

---

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the agent logs for error messages
3. Verify your configuration in the EMC
4. Contact your system administrator

## Version History

- **2.0.0** - Added Linux/macOS installer, improved Windows installer, fixed WebSocket connection
- **1.1.0** - Added Windows one-click installer
- **1.0.0** - Initial release with basic print relay functionality
