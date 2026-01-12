# Cloud POS Service Host

On-premise server providing offline operation capabilities for the Cloud POS system.

## Overview

The Service Host runs locally at a restaurant property and provides:

- **CAPS** (Check And Posting Service) - Order management, payments
- **Print Controller** - Kitchen/receipt printing via TCP/IP
- **KDS Controller** - Kitchen display routing and real-time updates
- **Payment Controller** - Card terminal integration

## Requirements

- Node.js 18+ 
- Windows 10/11 or Linux
- Network access to printers (port 9100)
- Internet access for cloud sync (optional for offline operation)

## Installation

1. Copy the service-host folder to the property server
2. Install dependencies:
   ```bash
   cd service-host
   npm install
   ```
3. Create configuration file:
   ```bash
   cp config.example.json config.json
   # Edit config.json with your cloud URL and token
   ```

## Configuration

Create a `config.json` file:

```json
{
  "cloudUrl": "https://your-cloud-pos.replit.app",
  "token": "your-service-host-token",
  "propertyId": "property-uuid",
  "port": 3001,
  "dataDir": "./data"
}
```

Or use command line arguments:

```bash
node dist/index.js --cloud https://your-pos.replit.app --token YOUR_TOKEN --property PROP_ID
```

## Running

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### CAPS - Check Management
```
POST   /api/caps/checks              Create check
GET    /api/caps/checks              List open checks
GET    /api/caps/checks/:id          Get check
POST   /api/caps/checks/:id/items    Add items
POST   /api/caps/checks/:id/send     Send to kitchen
POST   /api/caps/checks/:id/pay      Add payment
POST   /api/caps/checks/:id/close    Close check
POST   /api/caps/checks/:id/void     Void check
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

| Mode | Cloud | Service Host | Description |
|------|-------|--------------|-------------|
| GREEN | ✅ | ✅ | Normal - cloud primary |
| YELLOW | ❌ | ✅ | Offline - Service Host primary |
| ORANGE | ❌ | ❌ | Service Host down, local agents only |
| RED | ❌ | ❌ | Complete isolation |

## Data Storage

Local SQLite database stores:
- Configuration cache (synced from cloud)
- Active checks and items
- Print queue
- KDS tickets
- Sync queue (pending cloud uploads)

Database location: `./data/service-host.db`

## Sync Behavior

### Configuration (Cloud → Service Host)
- Full sync on startup
- Delta sync via WebSocket for real-time updates

### Transactions (Service Host → Cloud)
- Queued immediately after local commit
- Background worker syncs every 5 seconds
- Retry with backoff on failure
- Maximum 10 retry attempts

## Troubleshooting

### Cannot connect to cloud
- Check `cloudUrl` is correct
- Verify token is valid
- Check internet connectivity

### Print jobs failing
- Verify printer IP is reachable
- Check printer is on port 9100
- Ensure ESC/POS compatibility

### KDS not updating
- Verify WebSocket connection
- Check deviceId matches configuration
