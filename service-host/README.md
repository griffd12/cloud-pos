# Cloud POS CAPS (Central Application Processing Service)

On-premise server providing offline operation capabilities for the Cloud POS system.

## Overview

CAPS (Central Application Processing Service) runs at each restaurant property, providing local services when internet connectivity is lost. It enables seamless operation transitions between online (GREEN) and offline (YELLOW/ORANGE/RED) modes.

## Features

- **CAPS (Check And Posting Service)** - Local order management, check locking, payments
- **Print Controller** - Kitchen ticket and receipt printing via TCP/IP
- **KDS Controller** - Real-time kitchen display routing via WebSocket
- **Payment Controller** - Local payment terminal integration
- **Transaction Sync** - Automatic sync with cloud when connectivity restores
- **Check Locking** - Prevents concurrent editing by multiple workstations

## Requirements

- Node.js 18 or later
- Network access to cloud (for initial setup and sync)
- Local network access from POS workstations

## Quick Start

### Installation

1. **Download the package** from your EMC or cloud portal

2. **Extract and install dependencies**
   ```bash
   unzip CAPS-v1.0.0.zip
   cd ServiceHost
   npm install --production
   ```

3. **Run the setup wizard**
   ```bash
   npm run setup
   ```
   This interactive wizard will:
   - Validate prerequisites
   - Collect cloud URL and authentication token
   - Test connectivity
   - Create configuration file
   - Optionally install as system service

### Manual Configuration

If you prefer manual configuration:

1. Copy `config.example.json` to `config.json`
2. Edit with your settings:
   ```json
   {
     "cloudUrl": "https://your-pos.replit.app",
     "token": "your-service-host-token",
     "propertyId": "your-property-id",
     "port": 3001,
     "dataDir": "./data"
   }
   ```

3. Start the service:
   ```bash
   npm start
   ```

## Service Installation

### Windows

Install as a Windows Service that starts automatically:

```bash
npm run service:install
npm run service:start
```

Other commands:
```bash
npm run service:stop     # Stop the service
npm run service:status   # Check service status
```

### Linux (systemd)

1. Copy the service file:
   ```bash
   sudo cp cloud-pos-service-host.service /etc/systemd/system/
   ```

2. Edit paths if needed:
   ```bash
   sudo nano /etc/systemd/system/cloud-pos-service-host.service
   ```

3. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable cloud-pos-service-host
   sudo systemctl start cloud-pos-service-host
   ```

### macOS

The setup wizard creates a launchd plist file. To install:

```bash
sudo cp com.cloudpos.servicehost.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.cloudpos.servicehost.plist
```

## API Endpoints

### Health Check (Unauthenticated)
```
GET /health
```

### CAPS - Check Management
```
POST   /api/caps/checks              Create check
GET    /api/caps/checks              List open checks
GET    /api/caps/checks/:id          Get check
POST   /api/caps/checks/:id/items    Add items (requires workstationId)
POST   /api/caps/checks/:id/send     Send to kitchen
POST   /api/caps/checks/:id/pay      Add payment
POST   /api/caps/checks/:id/close    Close check
POST   /api/caps/checks/:id/void     Void check
```

### Check Locking (Multi-Workstation)
```
POST   /api/caps/checks/:id/lock          Acquire lock
POST   /api/caps/checks/:id/unlock        Release lock
GET    /api/caps/checks/:id/lock          Get lock status
POST   /api/caps/checks/:id/lock/refresh  Extend lock
POST   /api/caps/workstation/:id/release-locks  Release all locks
POST   /api/caps/workstation/:id/check-range    Set check number range
```

### Print Controller
```
POST   /api/print/jobs               Submit print job
GET    /api/print/jobs/:id           Get job status
```

### KDS Controller
```
GET    /api/kds/tickets              Get active tickets
GET    /api/kds/tickets/bumped       Get bumped tickets
POST   /api/kds/tickets/:id/bump     Bump ticket
POST   /api/kds/tickets/:id/recall   Recall ticket
```

### Payment Controller
```
POST   /api/payment/authorize        Authorize payment
POST   /api/payment/:id/capture      Capture payment
POST   /api/payment/:id/void         Void payment
POST   /api/payment/:id/refund       Refund payment
```

### Configuration
```
GET    /api/config/menu-items        Get menu items
GET    /api/config/slus              Get categories
GET    /api/config/tenders           Get tenders
GET    /api/config/discounts         Get discounts
```

## Check Locking

CAPS implements check locking to prevent multiple workstations from editing the same check simultaneously:

1. **Acquire lock** before editing: `POST /api/caps/checks/:id/lock`
   ```json
   { "workstationId": "ws-001", "employeeId": "emp-123" }
   ```

2. **Locks expire** after 5 minutes (auto-refresh recommended)

3. **Release lock** when done: `POST /api/caps/checks/:id/unlock`
   ```json
   { "workstationId": "ws-001" }
   ```

4. **Conflict returns 409** if another workstation holds the lock

## Check Number Ranges

Each workstation can be assigned a unique check number range for offline operation:

```bash
POST /api/caps/workstation/:id/check-range
{ "start": 1000, "end": 1999 }
```

This prevents duplicate check numbers when multiple workstations operate offline.

## WebSocket

Connect to `/ws` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

// Subscribe to KDS updates
ws.send(JSON.stringify({ type: 'subscribe_kds', deviceId: 'kds-1' }));

// Receive updates
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // Handle: kds_tickets, kds_ticket_new, kds_ticket_bumped, etc.
};
```

## Connectivity Modes

| Mode | Cloud | CAPS | Description |
|------|-------|------|-------------|
| GREEN | ✓ | ✓ | Normal - cloud primary |
| YELLOW | ✗ | ✓ | Offline - CAPS primary |
| ORANGE | ✗ | ✗ | CAPS down, local agents only |
| RED | ✗ | ✗ | Complete isolation |

## Testing

Run the test suite to validate installation:

```bash
npm test
```

For verbose output:
```bash
npm run test:verbose
```

## Data Storage

Local SQLite database stores:
- Configuration cache (synced from cloud)
- Active checks and items
- Print queue
- KDS tickets
- Sync queue (pending cloud uploads)

Database location: `./data/service-host.db`

## Sync Behavior

### Configuration (Cloud → CAPS)
- Full sync on startup
- Delta sync via WebSocket for real-time updates

### Transactions (CAPS → Cloud)
- Queued immediately after local commit
- Background worker syncs every 5 seconds
- Retry with backoff on failure
- Maximum 10 retry attempts

## Troubleshooting

### CAPS won't start
- Check `config.json` exists and has valid settings
- Ensure port 3001 is not in use
- Check logs in the data directory

### Cannot connect to cloud
- Verify cloud URL is correct
- Check internet connectivity
- Ensure token is valid (regenerate in EMC if needed)

### Workstations can't connect
- Verify CAPS is running: `curl http://localhost:3001/health`
- Check firewall allows port 3001
- Ensure workstations use correct CAPS host IP address

### Print jobs failing
- Verify printer IP address and port
- Check printer is on same network
- Test with: `telnet <printer-ip> 9100`

### KDS not updating
- Verify WebSocket connection
- Check deviceId matches configuration

## Development

```bash
# Install dev dependencies
npm install

# Run in development mode (auto-restart on changes)
npm run dev

# Build for production
npm run build

# Create distributable package
npm run package
```

## Directory Structure

```
service-host/
├── dist/                    # Compiled JavaScript
├── data/                    # SQLite database and logs
├── scripts/
│   ├── package.js          # Package creation script
│   ├── setup-wizard.js     # Interactive setup
│   ├── test-all.js         # Test suite
│   └── service-wrappers/   # OS-specific service scripts
├── src/
│   ├── db/                 # SQLite database layer
│   ├── middleware/         # Express middleware
│   ├── routes/             # API routes
│   ├── services/           # CAPS, Print, KDS, Payment
│   └── sync/               # Cloud sync workers
├── config.json             # Configuration (create from example)
├── config.example.json     # Example configuration
└── package.json
```

## Version History

- **1.1.0** - Updated terminology to Services/CAPS
- **1.0.0** - Initial release with CAPS, Print, KDS, Payment controllers

## License

MIT
