# Cloud POS V2: Browser-Based Full Offline Specification

## Document Version: 1.1
## Date: January 12, 2026
## Revision: Added Distributed Controller Architecture for enhanced RED mode resilience

---

## 1. Executive Summary

This specification defines how the Cloud POS system will operate as a **browser-based application with full offline capabilities**. The goal is to provide uninterrupted restaurant operations regardless of internet connectivity while maintaining the simplicity of a web-based deployment.

### Key Design Principles

1. **Browser-first**: The POS UI runs in Chrome/Edge on workstations
2. **Service Host backend**: A local Node.js server provides offline services
3. **Distributed controllers**: Print and Payment agents run on each workstation for maximum resilience
4. **Automatic failover**: Seamless switching between cloud and local modes
5. **Zero data loss**: All transactions sync when connectivity restores
6. **No manual intervention**: Staff should not notice connectivity changes

---

## 2. Architecture Overview

### 2.1 System Components (Distributed Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROPERTY NETWORK                                     │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │   Workstation 1     │  │   Workstation 2     │  │   Workstation 3     │ │
│  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │ │
│  │  │    Browser    │  │  │  │    Browser    │  │  │  │    Browser    │  │ │
│  │  │    (POS UI)   │  │  │  │    (POS UI)   │  │  │  │    (POS UI)   │  │ │
│  │  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │ │
│  │                     │  │                     │  │                     │ │
│  │  LOCAL AGENTS:      │  │  LOCAL AGENTS:      │  │  LOCAL AGENTS:      │ │
│  │  ┌─────────────┐   │  │  ┌─────────────┐   │  │  ┌─────────────┐   │ │
│  │  │ Print Agent │   │  │  │ Print Agent │   │  │  │ Print Agent │   │ │
│  │  └─────────────┘   │  │  └─────────────┘   │  │  └─────────────┘   │ │
│  │  ┌─────────────┐   │  │                     │  │  ┌─────────────┐   │ │
│  │  │ Payment App │   │  │                     │  │  │ Payment App │   │ │
│  │  └─────────────┘   │  │                     │  │  └─────────────┘   │ │
│  └──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘ │
│             │                        │                        │            │
│             └────────────────────────┼────────────────────────┘            │
│                                      │ LAN                                 │
│                                      ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    SERVICE HOST (Primary)                             │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │ │
│  │  │    CAPS     │ │    Print    │ │     KDS     │ │   Payment   │    │ │
│  │  │   Service   │ │  Controller │ │  Controller │ │  Controller │    │ │
│  │  │  (Primary)  │ │  (Primary)  │ │  (Primary)  │ │  (Primary)  │    │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐    │ │
│  │  │                    SQLite Database                           │    │ │
│  │  │  (Encrypted local copy of property config + transactions)    │    │ │
│  │  └─────────────────────────────────────────────────────────────┘    │ │
│  └───────────────────────────────┬──────────────────────────────────────┘ │
│                                  │                                         │
└──────────────────────────────────┼─────────────────────────────────────────┘
                                   │ Internet (when available)
                                   ▼
                    ┌──────────────────────────────┐
                    │         CLOUD                │
                    │  ┌────────────────────────┐  │
                    │  │   PostgreSQL Database  │  │
                    │  │   (Master data store)  │  │
                    │  └────────────────────────┘  │
                    │                              │
                    │  ┌────────────────────────┐  │
                    │  │    API Server          │  │
                    │  │    WebSocket Server    │  │
                    │  └────────────────────────┘  │
                    └──────────────────────────────┘
```

### 2.2 Distributed Controller Philosophy

The system uses a **distributed architecture** where critical functions can run at multiple levels:

| Function | Primary Location | Fallback Location | Purpose |
|----------|------------------|-------------------|---------|
| **Check Management** | Service Host (CAPS) | Browser (IndexedDB) | Order state and transactions |
| **Printing** | Service Host Print Controller | Workstation Print Agent | Receipt and kitchen tickets |
| **Payment Processing** | Service Host Payment Controller | Workstation Payment App | Card transactions |
| **KDS Routing** | Service Host KDS Controller | Peer-to-peer WebSocket | Kitchen display tickets |

This ensures that even if the Service Host fails, individual workstations can continue operating with printing and card payments.

### 2.3 Component Descriptions

| Component | Location | Technology | Purpose |
|-----------|----------|------------|---------|
| **POS UI** | Workstation Browser | React + TypeScript | User interface for order entry, payments, reports |
| **Service Host** | Designated PC at property | Node.js + Express | Primary local backend services |
| **CAPS** | Service Host | Node.js service | Check And Posting - manages orders, payments, check state |
| **Print Controller** | Service Host (Primary) | Node.js service | Routes print jobs to network printers |
| **Print Agent** | Each Workstation | Lightweight Node.js app | Direct printing when Service Host unavailable |
| **KDS Controller** | Service Host | Node.js service | Manages kitchen display screens |
| **Payment Controller** | Service Host (Primary) | Node.js service | Coordinates payment terminal communication |
| **Payment App** | Select Workstations | Gateway software | Direct card processing when Service Host unavailable |
| **Local Database** | Service Host | SQLite + SQLCipher | Encrypted local data storage |
| **Cloud** | Replit/AWS | Node.js + PostgreSQL | Master database, EMC, reporting |

---

## 3. Connectivity Modes

### 3.1 Mode Definitions

| Mode | Cloud | Service Host | Local Agents | Description |
|------|-------|--------------|--------------|-------------|
| **GREEN** | ✅ | ✅ | ✅ | Normal operation - cloud is primary |
| **YELLOW** | ❌ | ✅ | ✅ | Internet down - Service Host is primary |
| **ORANGE** | ❌ | ❌ | ✅ | Service Host down - local agents active |
| **RED** | ❌ | ❌ | ❌ | Complete isolation - browser only |

### 3.1.1 ORANGE Mode (New)

ORANGE mode is a critical addition that handles the scenario where the Service Host is down but workstations are still on the network:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORANGE MODE OPERATION                               │
│                     (Service Host Down, LAN Active)                         │
│                                                                             │
│   ┌─────────────────────┐      ┌─────────────────────┐                     │
│   │   Workstation 1     │      │   Workstation 2     │                     │
│   │  ┌───────────────┐  │      │  ┌───────────────┐  │                     │
│   │  │    Browser    │  │      │  │    Browser    │  │                     │
│   │  │  (Orders in   │  │      │  │  (Orders in   │  │                     │
│   │  │   IndexedDB)  │  │      │  │   IndexedDB)  │  │                     │
│   │  └───────┬───────┘  │      │  └───────────────┘  │                     │
│   │          │          │      │                     │                     │
│   │  ┌───────▼───────┐  │      │                     │                     │
│   │  │  Print Agent  │──┼──────┼─────────────────────┼──► Network Printer  │
│   │  └───────────────┘  │      │                     │                     │
│   │  ┌───────────────┐  │      │                     │                     │
│   │  │  Payment App  │──┼──────┼─────────────────────┼──► Payment Gateway  │
│   │  └───────────────┘  │      │                     │     (Internet)      │
│   └─────────────────────┘      └─────────────────────┘                     │
│                                                                             │
│   SERVICE HOST: ❌ OFFLINE                                                  │
│                                                                             │
│   CAPABILITIES:                                                             │
│   ✅ Order entry (queued in browser)                                       │
│   ✅ Printing (via local Print Agent)                                      │
│   ✅ Card payments (if workstation has Payment App + internet)             │
│   ✅ Cash payments                                                          │
│   ❌ Check sharing between workstations                                     │
│   ❌ Central KDS routing                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Mode Detection Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER MODE DETECTION                              │
│                                                                             │
│                        ┌─────────────────┐                                  │
│                        │   Browser Load  │                                  │
│                        └────────┬────────┘                                  │
│                                 │                                           │
│                                 ▼                                           │
│                   ┌─────────────────────────────┐                          │
│                   │   Try Cloud API Heartbeat   │                          │
│                   │   (GET /api/health)         │                          │
│                   └──────────────┬──────────────┘                          │
│                                  │                                          │
│              ┌───────────────────┼───────────────────┐                     │
│              │ Success           │                   │ Fail (timeout/error)│
│              ▼                   │                   ▼                      │
│     ┌────────────────┐           │         ┌────────────────────────┐      │
│     │   GREEN MODE   │           │         │ Try Service Host API   │      │
│     │ Use Cloud APIs │           │         │ (GET http://SH:3001/)  │      │
│     └────────────────┘           │         └───────────┬────────────┘      │
│                                  │                     │                    │
│                                  │     ┌───────────────┼───────────────┐   │
│                                  │     │ Success       │               │   │
│                                  │     ▼               │ Fail          │   │
│                                  │ ┌────────────────┐  │               ▼   │
│                                  │ │  YELLOW MODE   │  │    ┌────────────┐ │
│                                  │ │ Use SH APIs    │  │    │  RED MODE  │ │
│                                  │ └────────────────┘  │    │ LocalStore │ │
│                                  │                     │    └────────────┘ │
│                                  │                     │                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Mode Transitions

**GREEN → YELLOW (Internet Lost)**
```
1. Cloud API requests start timing out
2. After 3 consecutive failures (45 seconds), browser switches to YELLOW
3. Browser redirects API calls to Service Host (http://service-host:3001)
4. UI shows yellow indicator: "Offline Mode - Local Operations Active"
5. All new transactions go to Service Host
```

**YELLOW → GREEN (Internet Restored)**
```
1. Service Host detects cloud connectivity restored
2. Service Host begins transaction replay to cloud
3. Browser detects cloud available via periodic health check
4. Browser switches back to cloud APIs
5. UI shows green indicator: "Online"
```

**YELLOW → RED (LAN Lost)**
```
1. Service Host API requests fail
2. Browser falls back to localStorage-only mode
3. UI shows red indicator: "Emergency Mode - Limited Operations"
4. Only cash transactions, no printing
```

---

## 4. Service Host Specification

### 4.1 Installation Requirements

| Requirement | Specification |
|-------------|---------------|
| **Operating System** | Windows 10/11, Windows Server 2016+ |
| **RAM** | Minimum 4GB, Recommended 8GB |
| **Storage** | Minimum 10GB free space |
| **Network** | Static IP address on property LAN |
| **Ports** | 3001 (HTTP API), 3002 (WebSocket) |

### 4.2 Service Host Services

#### 4.2.1 CAPS (Check And Posting Service)

**Responsibilities:**
- Maintain authoritative check state for the property
- Manage check locking (which workstation has which check)
- Process transactions and update check totals
- Queue transactions for cloud sync
- Handle check sharing between workstations

**API Endpoints:**
```
POST   /api/caps/checks              Create new check
GET    /api/caps/checks              List open checks
GET    /api/caps/checks/:id          Get check details
POST   /api/caps/checks/:id/items    Add items to check
POST   /api/caps/checks/:id/payments Apply payment
POST   /api/caps/checks/:id/close    Close check
POST   /api/caps/checks/:id/lock     Lock check to workstation
DELETE /api/caps/checks/:id/lock     Release check lock
```

#### 4.2.2 Print Controller

**Responsibilities:**
- Receive print jobs from workstations
- Route to correct printer based on Print Class configuration
- Manage print queue with retry logic
- Direct TCP/IP printing to LAN printers (port 9100)
- No internet required for printing

**API Endpoints:**
```
POST   /api/print/jobs               Submit print job
GET    /api/print/jobs/:id           Get job status
GET    /api/print/queue              View print queue
DELETE /api/print/jobs/:id           Cancel print job
```

#### 4.2.3 KDS Controller

**Responsibilities:**
- Receive order tickets from CAPS
- Route to appropriate KDS displays
- Track bump status per item/ticket
- Manage expo routing for multi-station flows
- WebSocket communication with KDS displays

**API Endpoints:**
```
GET    /api/kds/tickets              Get active tickets
POST   /api/kds/tickets/:id/bump     Bump ticket/item
GET    /api/kds/stations             Get KDS station status
```

**WebSocket Events:**
```
kds:ticket:new      New ticket arrived
kds:ticket:update   Ticket modified
kds:ticket:bump     Item/ticket bumped
kds:ticket:recall   Ticket recalled
```

#### 4.2.4 Payment Controller

**Responsibilities:**
- Manage payment terminal connections
- Route payment requests to correct terminal
- Handle EMV chip, contactless, swipe transactions
- Process offline authorizations when needed

**API Endpoints:**
```
POST   /api/payment/authorize        Start payment authorization
POST   /api/payment/capture          Capture authorized payment
POST   /api/payment/void             Void transaction
GET    /api/payment/terminals        Get terminal status
```

### 4.3 Local Database Schema

The Service Host maintains a local SQLite database with these key tables:

```sql
-- Property configuration (synced from cloud)
CREATE TABLE config_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Active checks (local state)
CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  check_number INTEGER NOT NULL,
  table_id TEXT,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'open', 'closed', 'voided'
  subtotal INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  locked_by_ws TEXT,
  cloud_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Check items
CREATE TABLE check_items (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES checks(id),
  menu_item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  modifiers TEXT,  -- JSON array
  status TEXT NOT NULL,  -- 'ordered', 'sent', 'voided'
  sent_at TIMESTAMP,
  cloud_synced BOOLEAN DEFAULT FALSE
);

-- Payments
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES checks(id),
  tender_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  tip INTEGER DEFAULT 0,
  reference TEXT,  -- Card last 4, auth code, etc.
  status TEXT NOT NULL,  -- 'authorized', 'captured', 'voided'
  cloud_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transaction replay queue
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,  -- 'check', 'payment', 'timecard', etc.
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'create', 'update', 'delete'
  payload TEXT NOT NULL,  -- JSON
  attempts INTEGER DEFAULT 0,
  last_attempt TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Print job queue
CREATE TABLE print_queue (
  id TEXT PRIMARY KEY,
  printer_id TEXT NOT NULL,
  content BLOB NOT NULL,  -- ESC/POS commands
  status TEXT NOT NULL,  -- 'pending', 'printing', 'completed', 'failed'
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.4 Cloud Synchronization

#### 4.4.1 Configuration Sync (Cloud → Service Host)

**Full Sync (on startup or after long offline period):**
```
1. Service Host connects to cloud
2. Request: GET /api/sync/config/full?propertyId=XXX
3. Cloud returns complete property configuration:
   - Menu items, modifiers, prices
   - Employees, jobs, roles
   - Tax groups, tenders, discounts
   - Printers, KDS devices, order devices
   - Print classes, print routing
4. Service Host stores in config_cache table
5. Service Host sets current config version
```

**Delta Sync (continuous):**
```
1. Service Host maintains WebSocket connection to cloud
2. Cloud pushes config changes as they occur
3. Service Host applies incremental updates
4. Typical changes: price updates, menu edits, employee changes
```

#### 4.4.2 Transaction Sync (Service Host → Cloud)

**Real-time (when online):**
```
1. Workstation submits transaction to Service Host
2. Service Host processes locally (immediate response)
3. Service Host queues transaction for cloud sync
4. Background worker sends to cloud
5. On success: mark cloud_synced = true
6. On failure: retry with exponential backoff
```

**Batch Replay (after reconnection):**
```
1. Service Host detects cloud connectivity restored
2. Query sync_queue for unsynced transactions
3. Replay in chronological order
4. Handle conflicts (cloud may have newer data)
5. Clear queue entries on success
```

#### 4.4.3 Conflict Resolution

| Scenario | Resolution |
|----------|------------|
| Same check edited offline at 2 workstations | Last-write-wins with merge of non-conflicting items |
| Employee clocked in offline, already clocked in on cloud | Keep earliest clock-in time |
| Menu item price changed while offline transaction pending | Transaction uses price at time of sale |
| Payment authorized offline, card declined when synced | Flag for manager review, mark check as "payment issue" |

---

## 5. Distributed Local Agents

### 5.1 Print Agent (Per-Workstation)

The Print Agent is a lightweight application that runs on each workstation, providing direct printing capability when the Service Host is unavailable.

#### 5.1.1 Print Agent Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRINT AGENT OPERATION                               │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                        WORKSTATION                                   │  │
│   │                                                                      │  │
│   │   ┌───────────────┐       ┌───────────────────────────────────┐    │  │
│   │   │    Browser    │       │         PRINT AGENT               │    │  │
│   │   │    (POS UI)   │       │                                   │    │  │
│   │   │               │       │  ┌─────────────────────────────┐ │    │  │
│   │   │   Print Job   │──────►│  │   HTTP Server (port 3003)   │ │    │  │
│   │   │   Request     │       │  └─────────────────────────────┘ │    │  │
│   │   │               │       │                │                 │    │  │
│   │   └───────────────┘       │                ▼                 │    │  │
│   │                           │  ┌─────────────────────────────┐ │    │  │
│   │                           │  │   ESC/POS Command Builder   │ │    │  │
│   │                           │  └─────────────────────────────┘ │    │  │
│   │                           │                │                 │    │  │
│   │                           │                ▼                 │    │  │
│   │                           │  ┌─────────────────────────────┐ │    │  │
│   │                           │  │   TCP/IP Sender (port 9100) │ │    │  │
│   │                           │  └─────────────────────────────┘ │    │  │
│   │                           │                                   │    │  │
│   │                           └───────────────────────────────────┘    │  │
│   │                                            │                        │  │
│   └────────────────────────────────────────────┼────────────────────────┘  │
│                                                │                            │
│                                                ▼                            │
│                                   ┌──────────────────────┐                 │
│                                   │   Network Printer    │                 │
│                                   │   (192.168.1.50)     │                 │
│                                   └──────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 5.1.2 Print Agent Specification

| Property | Value |
|----------|-------|
| **Technology** | Node.js (bundled with pkg) |
| **Size** | ~15 MB |
| **Port** | 3003 (HTTP API) |
| **Startup** | Windows Service or System Tray app |
| **Requirements** | Windows 10/11, 512MB RAM |

#### 5.1.3 Print Agent API

```
POST /api/print
Body: {
  "printerId": "kitchen-printer-1",
  "printerIp": "192.168.1.50",
  "printerPort": 9100,
  "jobType": "receipt" | "kitchen" | "report",
  "content": {
    "header": "Check #1234",
    "items": [...],
    "totals": {...}
  }
}

Response: {
  "success": true,
  "jobId": "abc123"
}
```

#### 5.1.4 Print Agent Failover Logic

```typescript
// Browser print request flow
async function printReceipt(check: Check) {
  try {
    // Try 1: Service Host Print Controller
    await fetch(`${serviceHostUrl}/api/print/jobs`, {
      method: 'POST',
      body: JSON.stringify({ check, jobType: 'receipt' })
    });
  } catch (serviceHostError) {
    try {
      // Try 2: Local Print Agent
      await fetch('http://localhost:3003/api/print', {
        method: 'POST',
        body: JSON.stringify({
          printerId: check.receiptPrinterId,
          printerIp: printerConfig[check.receiptPrinterId].ip,
          printerPort: 9100,
          jobType: 'receipt',
          content: formatReceiptContent(check)
        })
      });
    } catch (localAgentError) {
      // Both failed - queue for later or show error
      throw new Error('Printing unavailable');
    }
  }
}
```

#### 5.1.5 Print Agent CAL Package

The Print Agent is distributed via CAL as a separate lightweight package:

```
PrintAgent-v1.0.0.exe (Self-extracting installer)
│
├── print-agent.exe       (Node.js bundled, ~15MB)
├── config/
│   └── printers.json     (Cached printer config)
└── logs/
    └── print-agent.log
```

---

### 5.2 Payment App (Per-Workstation)

The Payment App handles card transactions when the Service Host Payment Controller is unavailable.

#### 5.2.1 Payment App Options

| Option | Description | Use Case |
|--------|-------------|----------|
| **Stripe Terminal Local** | Stripe's local SDK | Stripe Terminal hardware |
| **Elavon Converge** | Elavon's Windows app | Elavon payment terminals |
| **Verifone Connect** | Verifone's middleware | Verifone terminals |
| **PAX Store** | PAX's device manager | PAX terminals |

#### 5.2.2 Payment App Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PAYMENT APP OPERATION                                 │
│                                                                             │
│   ┌───────────────┐       ┌───────────────┐       ┌───────────────┐        │
│   │    Browser    │       │  Payment App  │       │   Payment     │        │
│   │    (POS UI)   │──────►│  (localhost)  │──────►│   Terminal    │        │
│   │               │ HTTP  │               │ USB/  │               │        │
│   │   Amount:     │       │  - Validate   │ LAN   │  Chip/Tap/    │        │
│   │   $25.99      │       │  - Route      │       │  Swipe        │        │
│   │               │       │  - Respond    │       │               │        │
│   └───────────────┘       └───────┬───────┘       └───────────────┘        │
│                                   │                                         │
│                                   │ HTTPS (if terminal has internet)        │
│                                   ▼                                         │
│                          ┌───────────────┐                                  │
│                          │   Payment     │                                  │
│                          │   Gateway     │                                  │
│                          │ (Stripe/etc)  │                                  │
│                          └───────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 5.2.3 Payment App API

```
POST /api/payment/authorize
Body: {
  "amount": 2599,
  "currency": "USD",
  "terminalId": "terminal-1",
  "checkId": "check-abc123"
}

Response: {
  "success": true,
  "transactionId": "txn_xyz789",
  "authCode": "123456",
  "cardLast4": "4242",
  "cardBrand": "visa"
}
```

#### 5.2.4 Payment Failover Logic

```typescript
// Browser payment request flow
async function processPayment(amount: number, tenderId: string) {
  try {
    // Try 1: Service Host Payment Controller
    return await fetch(`${serviceHostUrl}/api/payment/authorize`, {
      method: 'POST',
      body: JSON.stringify({ amount, tenderId })
    });
  } catch (serviceHostError) {
    // Service Host unavailable
    if (hasLocalPaymentApp()) {
      try {
        // Try 2: Local Payment App
        return await fetch('http://localhost:3004/api/payment/authorize', {
          method: 'POST',
          body: JSON.stringify({ amount, terminalId: getDefaultTerminal() })
        });
      } catch (localAppError) {
        throw new Error('Payment processing unavailable');
      }
    } else {
      throw new Error('No payment app installed on this workstation');
    }
  }
}

function hasLocalPaymentApp(): boolean {
  // Check if Payment App is running locally
  return localStorage.getItem('paymentAppInstalled') === 'true';
}
```

#### 5.2.5 Offline Authorization (Store-and-Forward)

Some payment terminals support offline authorization with later settlement:

```
1. Terminal collects card data
2. Terminal performs offline risk checks
3. Transaction approved locally with offline auth code
4. Transaction stored in terminal memory
5. When internet restored, terminal sends batch to processor
6. If any transaction declined, POS notified for reconciliation
```

**Note**: Offline authorization limits vary by processor (typically $50-$200 max).

---

### 5.3 Agent Discovery

The browser needs to discover which local agents are available:

```typescript
// client/src/lib/agent-discovery.ts

interface AgentStatus {
  printAgent: boolean;
  paymentApp: boolean;
}

async function discoverLocalAgents(): Promise<AgentStatus> {
  const status: AgentStatus = {
    printAgent: false,
    paymentApp: false
  };
  
  // Check Print Agent
  try {
    const res = await fetch('http://localhost:3003/health', { 
      signal: AbortSignal.timeout(1000) 
    });
    status.printAgent = res.ok;
  } catch {}
  
  // Check Payment App
  try {
    const res = await fetch('http://localhost:3004/health', { 
      signal: AbortSignal.timeout(1000) 
    });
    status.paymentApp = res.ok;
  } catch {}
  
  return status;
}
```

---

## 6. Browser Application Changes

### 6.1 Service Discovery

The browser must know how to find the Service Host on the local network.

**Option A: DNS-based (Recommended)**
```
Configure property router to resolve:
  service-host.local → 192.168.1.100 (Service Host IP)

Browser connects to: http://service-host.local:3001
```

**Option B: Configuration-based**
```
Store Service Host URL in browser localStorage during initial setup:
  localStorage.setItem('serviceHostUrl', 'http://192.168.1.100:3001')
```

**Option C: mDNS/Bonjour Discovery**
```
Service Host broadcasts: _cloudpos._tcp.local
Browser discovers via WebRTC mDNS (limited browser support)
```

### 5.2 API Client Architecture

```typescript
// client/src/lib/api-client.ts

interface ApiClientConfig {
  cloudUrl: string;
  serviceHostUrl: string;
  mode: 'green' | 'yellow' | 'red';
}

class ApiClient {
  private config: ApiClientConfig;
  private mode: 'green' | 'yellow' | 'red' = 'green';
  
  async request(endpoint: string, options: RequestInit): Promise<Response> {
    const baseUrl = this.getBaseUrl();
    
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      return response;
    } catch (error) {
      return this.handleFailure(endpoint, options, error);
    }
  }
  
  private getBaseUrl(): string {
    switch (this.mode) {
      case 'green': return this.config.cloudUrl;
      case 'yellow': return this.config.serviceHostUrl;
      case 'red': throw new Error('No network available');
    }
  }
  
  private async handleFailure(endpoint: string, options: RequestInit, error: Error): Promise<Response> {
    if (this.mode === 'green') {
      // Try Service Host
      this.mode = 'yellow';
      return this.request(endpoint, options);
    } else if (this.mode === 'yellow') {
      // Fall back to local storage
      this.mode = 'red';
      return this.handleOfflineRequest(endpoint, options);
    }
    throw error;
  }
}
```

### 5.3 Offline Data Storage (RED Mode)

When both cloud and Service Host are unavailable, the browser uses IndexedDB:

```typescript
// client/src/lib/offline-storage.ts

interface OfflineCheck {
  id: string;
  checkNumber: number;
  items: OfflineCheckItem[];
  payments: OfflinePayment[];
  status: 'open' | 'closed';
  createdAt: Date;
}

class OfflineStorage {
  private db: IDBDatabase;
  
  async saveCheck(check: OfflineCheck): Promise<void> {
    const tx = this.db.transaction('checks', 'readwrite');
    await tx.objectStore('checks').put(check);
  }
  
  async getOpenChecks(): Promise<OfflineCheck[]> {
    const tx = this.db.transaction('checks', 'readonly');
    return tx.objectStore('checks')
      .index('status')
      .getAll('open');
  }
  
  async syncToServiceHost(serviceHostUrl: string): Promise<void> {
    const checks = await this.getAllUnsyncedChecks();
    for (const check of checks) {
      await fetch(`${serviceHostUrl}/api/caps/checks/import`, {
        method: 'POST',
        body: JSON.stringify(check),
      });
      await this.markSynced(check.id);
    }
  }
}
```

### 5.4 UI Mode Indicators

```typescript
// client/src/components/connection-status.tsx

function ConnectionStatus() {
  const { mode } = useConnectionMode();
  
  const indicators = {
    green: { color: 'bg-green-500', label: 'Online', icon: Wifi },
    yellow: { color: 'bg-yellow-500', label: 'Offline Mode', icon: WifiOff },
    red: { color: 'bg-red-500', label: 'Emergency Mode', icon: AlertTriangle },
  };
  
  const { color, label, icon: Icon } = indicators[mode];
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${color}`}>
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
```

---

## 6. Operational Capabilities by Mode

### 6.1 Feature Matrix (Updated with ORANGE Mode)

| Feature | GREEN | YELLOW | ORANGE | RED |
|---------|-------|--------|--------|-----|
| **Order Entry** | ✅ | ✅ | ✅ | ✅ (cached menu) |
| **Modifiers** | ✅ | ✅ | ✅ | ✅ |
| **Discounts** | ✅ | ✅ | ✅ (cached) | ❌ |
| **Split Checks** | ✅ | ✅ | ❌ | ❌ |
| **Check Transfer** | ✅ | ✅ | ❌ | ❌ |
| **Cash Payment** | ✅ | ✅ | ✅ | ✅ |
| **Card Payment** | ✅ | ✅ | ✅ (local app) | ❌ |
| **Gift Card** | ✅ | ✅ | ❌ | ❌ |
| **Receipt Printing** | ✅ | ✅ | ✅ (Print Agent) | ❌ |
| **Kitchen Printing** | ✅ | ✅ | ✅ (Print Agent) | ❌ |
| **KDS Display** | ✅ | ✅ | ⚠️ (limited) | ❌ |
| **Employee Clock In/Out** | ✅ | ✅ | ✅ (local) | ✅ (local) |
| **Manager Functions** | ✅ | ✅ | ⚠️ (limited) | ❌ |
| **Reports** | ✅ | ✅ | ❌ | ❌ |
| **Menu Changes** | ✅ | ❌ | ❌ | ❌ |
| **Configuration** | ✅ | ❌ | ❌ | ❌ |

### 6.2 ORANGE Mode Capabilities (Service Host Down, LAN Active)

When the Service Host is down but the local network is still functioning:

**What Works:**
1. **Printing**: Local Print Agent on each workstation sends directly to network printers via TCP/IP
2. **Card Payments**: Workstations with Payment App installed can process cards (if they have internet access)
3. **Order Entry**: Full menu available from browser cache, orders queued in IndexedDB
4. **Cash Payments**: Fully functional
5. **Time Clock**: Employees can clock in/out (stored locally)

**What Doesn't Work:**
1. **Check Sharing**: Each workstation operates independently (no central CAPS)
2. **Central KDS**: No coordinated kitchen routing (but see 6.2.1 for peer-to-peer option)
3. **Gift Cards**: Require central validation
4. **Centralized Reports**: No aggregated data until sync

### 6.2.1 Peer-to-Peer KDS in ORANGE Mode

For kitchen display, workstations can communicate directly:

```
┌──────────────────┐         ┌──────────────────┐
│   POS Browser    │◄───────►│   KDS Browser    │
│   (Workstation)  │  WebRTC │   (Kitchen)      │
└──────────────────┘         └──────────────────┘

1. POS discovers KDS via mDNS/local broadcast
2. WebRTC data channel established
3. Orders sent directly to KDS
4. Bump status returned to POS
```

This provides basic KDS functionality without the Service Host, though without central coordination for multi-station kitchens.

### 6.3 RED Mode Limitations (True Isolation)

RED mode only occurs when there is **complete network failure** (no LAN, no internet). This is rare but the system handles it:

1. **Menu**: Only items cached in browser IndexedDB
2. **Payments**: Cash only (no network to card terminals)
3. **Printing**: Not available (no network to printers)
4. **Multi-workstation**: Each workstation fully independent
5. **Check Numbers**: Uses locally-generated temporary numbers (offline range)
6. **Data Sync**: All transactions queued for later sync

**When Does TRUE RED Happen?**
- Complete network switch/router failure
- Building-wide power outage (except workstation on UPS)
- All network cables disconnected
- Catastrophic infrastructure failure

In practice, ORANGE mode (Service Host down, LAN up) is far more common than TRUE RED.

### 6.3 Recovery from RED Mode

```
1. LAN connectivity restored
2. Browser detects Service Host available
3. Browser uploads queued transactions to Service Host
4. Service Host assigns permanent check numbers
5. Service Host merges with existing checks (if any)
6. Browser switches to YELLOW mode
7. Normal operations resume
```

---

## 7. Check Number Management

### 7.1 Check Number Ranges

To prevent duplicate check numbers during offline operation, each workstation is assigned a range:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CHECK NUMBER ALLOCATION                                 │
│                                                                             │
│  Workstation 1:  1-999      (online)                                        │
│  Workstation 2:  1000-1999  (online)                                        │
│  Workstation 3:  2000-2999  (online)                                        │
│                                                                             │
│  Offline Pool:                                                              │
│  Workstation 1:  10001-10999  (used when Service Host unreachable)         │
│  Workstation 2:  11001-11999  (used when Service Host unreachable)         │
│  Workstation 3:  12001-12999  (used when Service Host unreachable)         │
│                                                                             │
│  When sync occurs, offline checks get mapped to real numbers               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 EMC Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EMC → Devices → Workstations → [Workstation 1] → Check Numbers             │
│                                                                             │
│ Online Check Numbers:                                                       │
│   Start: [1        ]  End: [999      ]                                     │
│                                                                             │
│ Offline Check Numbers:                                                      │
│   Start: [10001    ]  End: [10999    ]                                     │
│                                                                             │
│ Current Check Number: 127                                                   │
│ Last Offline Check: 10003                                                   │
│                                                                             │
│ [Save]  [Reset Counter]                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Service Host Deployment

### 8.1 CAL Package Contents

```
ServiceHost-v1.0.0.exe (Self-extracting installer)
│
├── service-host.exe        (Node.js bundled with pkg)
├── node_modules/           (Dependencies)
├── config/
│   ├── property.json       (Property ID, cloud URL)
│   └── services.json       (Enabled services)
├── db/
│   └── (created on first run)
├── logs/
│   └── (runtime logs)
└── scripts/
    ├── install-service.bat (Register as Windows service)
    └── uninstall-service.bat
```

### 8.2 Installation Flow

```
1. Administrator runs ServiceHost-v1.0.0.exe
2. UAC prompt: "Allow changes?" → Yes
3. Installer dialog:
   ┌────────────────────────────────────────────────────┐
   │  Cloud POS Service Host Installer                  │
   │                                                    │
   │  Property ID: [                              ]     │
   │  Cloud URL:   [https://your-pos.replit.app   ]     │
   │                                                    │
   │  Services to enable:                               │
   │  [x] CAPS (Check & Posting)                        │
   │  [x] Print Controller                              │
   │  [x] KDS Controller                                │
   │  [ ] Payment Controller                            │
   │                                                    │
   │  Install Location: C:\CloudPOS\ServiceHost         │
   │  [ ] Start as Windows Service                      │
   │  [ ] Start on Windows boot                         │
   │                                                    │
   │         [Install]  [Cancel]                        │
   └────────────────────────────────────────────────────┘
4. Files extracted and configured
5. Service Host starts and connects to cloud
6. Initial configuration sync downloads
7. Ready for workstation connections
```

### 8.3 Service Host Management

**Windows Service:**
```
Service Name: CloudPOS-ServiceHost
Display Name: Cloud POS Service Host
Startup Type: Automatic
Recovery: Restart on failure (3 attempts, then stop)
```

**Management Commands:**
```batch
# Start service
net start CloudPOS-ServiceHost

# Stop service
net stop CloudPOS-ServiceHost

# View status
sc query CloudPOS-ServiceHost

# View logs
type C:\CloudPOS\ServiceHost\logs\service.log
```

---

## 9. Security Considerations

### 9.1 Network Security

| Concern | Mitigation |
|---------|------------|
| LAN sniffing | Use HTTPS between browser and Service Host (self-signed cert) |
| Unauthorized access | Workstation authentication via device token |
| Service Host impersonation | Mutual TLS between Service Host and cloud |
| Database theft | SQLite encrypted with SQLCipher (AES-256) |

### 9.2 Data Protection

1. **Encryption at rest**: Local database encrypted with property-specific key
2. **Encryption in transit**: TLS for all network communication
3. **No PAN storage**: Card numbers never stored locally (PCI compliance)
4. **Token-based auth**: Workstations authenticate with rotating tokens
5. **Audit logging**: All transactions logged with timestamps and user IDs

### 9.3 Key Management

```
Property Encryption Key Flow:

1. Cloud generates unique AES-256 key per property
2. Key encrypted with property master password
3. Encrypted key stored in CAL package
4. On install, admin enters master password
5. Key decrypted and stored in Windows Credential Manager
6. Service Host retrieves key at startup
7. Key never written to disk unencrypted
```

---

## 10. Monitoring and Alerting

### 10.1 Service Host Health Checks

The cloud monitors Service Host status via heartbeats:

```
Every 30 seconds:
  Service Host → Cloud: POST /api/service-hosts/:id/heartbeat
  {
    "status": "online",
    "mode": "green",
    "connectedWorkstations": 3,
    "pendingSyncItems": 0,
    "diskSpaceGB": 45.2,
    "cpuUsage": 12,
    "memoryUsage": 2.1,
    "uptime": 86400
  }
```

### 10.2 Alert Conditions

| Condition | Severity | Action |
|-----------|----------|--------|
| Service Host offline > 5 min | Critical | Email/SMS to property manager |
| Sync queue > 100 items | Warning | Email to support |
| Disk space < 1GB | Critical | Email to support |
| Connection mode YELLOW > 1 hour | Warning | Email to property manager |
| Failed transactions | Critical | Immediate notification |

### 10.3 EMC Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EMC → System → Service Host Status                                          │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Property          │ Status  │ Mode   │ WS │ Pending │ Last Seen        ││
│ ├───────────────────┼─────────┼────────┼────┼─────────┼──────────────────┤│
│ │ Newport Beach     │ ✅ Online│ GREEN  │ 4  │ 0       │ Just now         ││
│ │ Santa Monica      │ ⚠️ Warn │ YELLOW │ 2  │ 15      │ 2 min ago        ││
│ │ Manhattan Beach   │ ❌ Offline│ -     │ -  │ -       │ 15 min ago       ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│ [View Details]  [Force Sync]  [Restart Service]                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Create Service Host Node.js application skeleton
- [ ] Implement CAPS core (check CRUD, locking)
- [ ] Implement local SQLite database with encryption
- [ ] Build basic cloud sync (config download)

### Phase 2: Services (Weeks 3-4)
- [ ] Implement Print Controller service
- [ ] Implement KDS Controller service
- [ ] Add WebSocket support for real-time updates
- [ ] Build transaction replay queue

### Phase 3: Browser Integration (Weeks 5-6)
- [ ] Create API client with failover logic
- [ ] Implement connection mode detection
- [ ] Add offline storage (IndexedDB) for RED mode
- [ ] Update UI with mode indicators

### Phase 4: Packaging (Week 7)
- [ ] Create CAL installer with pkg
- [ ] Build Windows service wrapper
- [ ] Create installation wizard
- [ ] Test deployment process

### Phase 5: Testing & Polish (Week 8)
- [ ] Network failure simulation testing
- [ ] Multi-workstation conflict testing
- [ ] Performance testing under load
- [ ] Documentation and training materials

---

## 12. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **CAPS** | Check And Posting Service - manages order/payment transactions |
| **CAL** | Client Application Loader - software deployment system |
| **Service Host** | Local server providing offline services |
| **Print Agent** | Lightweight per-workstation app for direct printing |
| **Payment App** | Per-workstation gateway software for card processing |
| **GREEN Mode** | Normal operation with cloud connectivity |
| **YELLOW Mode** | Offline operation via Service Host |
| **ORANGE Mode** | Service Host down, local agents active |
| **RED Mode** | Complete isolation, browser-only operation |
| **Sync Queue** | Buffer of transactions waiting to sync to cloud |

### B. API Reference

See separate document: `API_REFERENCE.md`

### C. Troubleshooting Guide

See separate document: `TROUBLESHOOTING.md`

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-12 | Cloud POS Team | Initial specification |
| 1.1 | 2026-01-12 | Cloud POS Team | Added ORANGE mode, distributed Print Agents, Payment Apps, enhanced resilience |
