# Version 2: Hybrid Cloud/On-Prem Architecture
## Phase 1 Specification Document

**Version:** 1.0  
**Date:** January 10, 2026  
**Status:** Draft for Review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Service Host Components](#3-service-host-components)
4. [Database Design](#4-database-design)
5. [Sync Protocol](#5-sync-protocol)
6. [Offline Modes](#6-offline-modes)
7. [Check Sharing & Locking](#7-check-sharing--locking)
8. [Print Controller Service](#8-print-controller-service)
9. [CAL Package Deployment](#9-cal-package-deployment)
10. [EMC Configuration Changes](#10-emc-configuration-changes)
11. [Phase 1 Deliverables](#11-phase-1-deliverables)
12. [Resolved Design Decisions](#12-resolved-design-decisions)
13. [Cloud Sync Infrastructure - Implementation Guide](#13-cloud-sync-infrastructure---implementation-guide) ← **NEW: For Service Host developers**
14. [Open Questions](#14-open-questions)

---

## 1. Executive Summary

### Terminology Clarification

| Term | Definition |
|------|------------|
| **Service Host** | The PC (workstation) designated to run on-premise services (CAPS, Print, KDS, Payment). This IS the workstation you configure in EMC as "Check and Posting Service Host". Can be a dedicated PC or a workstation that also runs the POS client. |
| **CAPS** | Check and Posting Service - the core service running on the Service Host that manages checks, transactions, and local database. |
| **CAL Package** | Client Application Loader package - the installer that deploys the Service Host software and version updates. |
| **PED** | PIN Entry Device - the credit card terminal that handles card swipes/dips and encrypts card data. |

### Purpose
Transform the Cloud POS system from a pure cloud architecture to a hybrid cloud/on-premise solution inspired by Oracle Simphony's CAPS (Check and Posting Service) model.

### Key Benefits
- **Offline Resilience**: Restaurant operations continue without internet
- **Local Performance**: LAN-based communication for printing, KDS, check sharing
- **Data Integrity**: Automatic sync and replay when connectivity restored
- **Enterprise Scale**: Cloud manages configuration and reporting; on-prem handles operations

### Design Principles
1. **Reuse existing code** - Same schema, same business logic, different deployment
2. **Graceful degradation** - Online → Yellow Mode → Red Mode
3. **Automatic recovery** - No manual intervention when connectivity returns
4. **Security first** - Encrypted local database, credential management

---

## 2. Architecture Overview

### System Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLOUD (Replit)                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │    EMC     │ │  Reports   │ │   Menu &   │ │    Sync    │           │
│  │   Admin    │ │ Dashboard  │ │   Config   │ │  Gateway   │           │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘           │
│         │              │              │              │                  │
│         └──────────────┴──────────────┴──────────────┘                  │
│                                   │                                     │
│                          PostgreSQL Database                            │
│                    (Master - Source of Truth for Config)                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                          WebSocket + REST API
                          (Encrypted, Authenticated)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                         ON-PREMISE (Property)                           │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    SERVICE HOST (Windows PC)                       │ │
│  │                                                                    │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │ │
│  │  │    CAPS      │ │    Print     │ │     KDS      │              │ │
│  │  │   Service    │ │  Controller  │ │  Controller  │              │ │
│  │  │              │ │              │ │              │              │ │
│  │  │ - Check mgmt │ │ - Job queue  │ │ - Ticket     │              │ │
│  │  │ - Posting    │ │ - LAN print  │ │   routing    │              │ │
│  │  │ - Locking    │ │ - ESC/POS    │ │ - Bump mgmt  │              │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘              │ │
│  │                                                                    │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │              SQLite Database (Encrypted)                    │  │ │
│  │  │                                                             │  │ │
│  │  │  - Configuration cache (menu, employees, settings)          │  │ │
│  │  │  - Active checks and transactions                           │  │ │
│  │  │  - Replay queue (pending sync to cloud)                     │  │ │
│  │  │  - Time punches and labor data                              │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │              Sync Engine                                    │  │ │
│  │  │  - Config sync (cloud → local) every 2-3 min               │  │ │
│  │  │  - Heartbeat (bidirectional) every 15 sec                  │  │ │
│  │  │  - Transaction replay (local → cloud) real-time            │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              │ LAN                                      │
│          ┌───────────────────┼───────────────────┐                     │
│          │                   │                   │                     │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐            │
│  │     WS01      │   │     WS02      │   │     KDS       │            │
│  │   (POS/SH)    │   │     (POS)     │   │   Display     │            │
│  └───────────────┘   └───────────────┘   └───────────────┘            │
│          │                                                              │
│  ┌───────────────┐   ┌───────────────┐                                 │
│  │   Printer 1   │   │   Printer 2   │                                 │
│  │   (Receipt)   │   │   (Kitchen)   │                                 │
│  └───────────────┘   └───────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Communication Paths

| Path | Protocol | Purpose |
|------|----------|---------|
| Cloud ↔ Service Host | WebSocket + HTTPS | Config sync, transaction replay |
| Service Host ↔ Workstation | HTTP (LAN) | API calls, check operations |
| Service Host ↔ Workstation | WebSocket (LAN) | Real-time updates (check locks, KDS) |
| Service Host ↔ Printer | TCP/IP Port 9100 | ESC/POS print commands |
| Service Host ↔ KDS | WebSocket (LAN) | Ticket routing, bump status |

---

## 3. Service Host Components

### 3.1 CAPS (Check and Posting Service)

**Responsibilities:**
- Maintain authoritative check state for the property
- Manage check locking (which WS has which check)
- Process transactions and update check totals
- Handle check sharing between workstations
- Queue transactions for cloud sync

**Check State Machine (Complete Lifecycle):**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CHECK LIFECYCLE IN CAPS                              │
│                                                                             │
│  ┌─────────┐                                                                │
│  │  NEW    │  Employee starts new check                                     │
│  └────┬────┘                                                                │
│       │ Begin Check                                                         │
│       ▼                                                                     │
│  ┌─────────┐  ←──────────────────────────────────────────────────┐         │
│  │  OPEN   │  Check is active, owned by a workstation            │         │
│  │ (Locked)│                                                     │         │
│  └────┬────┘                                                     │         │
│       │                                                          │         │
│       ├──► Add Items ──► Items added to check ──────────────────┘         │
│       │                                                                     │
│       ├──► Send ──► Items sent to KDS (via KDS Controller)                 │
│       │             Print kitchen tickets (via Print Controller)            │
│       │                                                                     │
│       ├──► Park ──► Release lock, check becomes "Available"                │
│       │             ┌──────────┐                                           │
│       │             │ AVAILABLE│  (No WS owns it, can be picked up)        │
│       │             │ (Unlocked)│                                          │
│       │             └────┬─────┘                                           │
│       │                  │                                                  │
│       │                  ▼ Pickup by any WS                                │
│       │             ┌──────────┐                                           │
│       │             │  OPEN    │  (Now locked to new WS)                   │
│       │             │ (Locked) │                                           │
│       │             └────┬─────┘                                           │
│       │                  │                                                  │
│       ◄──────────────────┘  (Continue editing)                             │
│       │                                                                     │
│       ├──► Apply Payment (Partial) ──► Check remains open                  │
│       │                                                                     │
│       ├──► Apply Payment (Full) ──────────────────────────┐                │
│       │                                                    │                │
│       ▼                                                    ▼                │
│  ┌─────────┐                                         ┌─────────┐           │
│  │ PARTIAL │  Some balance remains                   │ CLOSED  │           │
│  │  PAID   │                                         └────┬────┘           │
│  └────┬────┘                                              │                │
│       │ Additional Payment                                │                │
│       └──────────────────────────────────────────────────►│                │
│                                                           │                │
│                                                           ▼                │
│                                                    ┌─────────────┐         │
│                                                    │   POSTED    │         │
│                                                    │ (In Replay  │         │
│                                                    │   Queue)    │         │
│                                                    └──────┬──────┘         │
│                                                           │                │
│                                                           ▼ Synced to Cloud│
│                                                    ┌─────────────┐         │
│                                                    │   SYNCED    │         │
│                                                    │  (In Cloud  │         │
│                                                    │   Reports)  │         │
│                                                    └─────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Check Operations Detail:**

| Operation | CAPS Action | Print Controller | KDS Controller |
|-----------|-------------|------------------|----------------|
| Begin Check | Create check record, lock to WS | - | - |
| Add Items | Update check_items, recalculate totals | - | - |
| Send | Mark items as "sent", update round | Print kitchen tickets | Send tickets to KDS displays |
| Park | Release lock, set status = available | - | - |
| Pickup | Acquire lock, assign to requesting WS | - | - |
| Payment | Create payment record, update balance | Print receipt (if configured) | - |
| Close | Set status = closed, release lock | Print final receipt | Remove from KDS (if configured) |
| Post | Add to replay queue for cloud sync | - | - |

**Check Lock Management:**

| Field | Type | Description |
|-------|------|-------------|
| `lock_workstation_id` | UUID | Which WS currently holds the lock |
| `lock_acquired_at` | Timestamp | When lock was acquired |
| `lock_type` | Enum | 'active' (editing), 'view' (read-only) |

### 3.2 Print Controller Service

**Responsibilities:**
- Receive print jobs from workstations
- Route to correct printer based on Print Class configuration
- Manage print queue with retry logic
- Direct TCP/IP printing to LAN printers
- No internet required for printing

**Print Flow:**
```
WS sends print request
        │
        ▼
┌─────────────────────────┐
│   Print Controller      │
│   (on Service Host)     │
│                         │
│  1. Validate request    │
│  2. Apply Print Class   │
│  3. Route to printer(s) │
│  4. Build ESC/POS       │
│  5. Send via TCP/IP     │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│   Printer               │
│   192.168.x.x:9100      │
└─────────────────────────┘
```

### 3.3 Payment Service (Credit Card Controller)

**Based on Oracle Simphony SPI (Simphony Payment Interface) Architecture**

The Payment Service handles credit card processing locally, ensuring PCI compliance by never storing card data:

**Architecture: SPI-Style (Recommended)**
```
┌───────────────────────────────────────────────────────────────────────────────┐
│                     PAYMENT FLOW (PCI COMPLIANT)                              │
│                                                                               │
│  ┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐ │
│  │   POS    │────>│   Payment    │────>│     PED     │────>│  Processor   │ │
│  │Workstation│     │   Service    │     │  (Terminal) │     │   Gateway    │ │
│  └──────────┘     └──────────────┘     └─────────────┘     └──────────────┘ │
│       ↑                                       │                    │         │
│       │                                       │                    │         │
│       │         Token + Approval              │    Card Data       │         │
│       └───────────────────────────────────────┘    (encrypted)     │         │
│                                                         └──────────┘         │
│                                                                               │
│  ✓ Card data NEVER touches POS or Service Host                               │
│  ✓ Only tokens stored in local/cloud database                                │
│  ✓ PED communicates directly with processor                                  │
│  ✓ Works in offline mode (PED → Gateway is independent path)                 │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Key Principles (PCI Compliance):**
1. **No card data storage** - POS and Service Host never see full card numbers
2. **Tokenization** - Only payment tokens stored in database
3. **PED handles encryption** - PIN Entry Device encrypts all card data
4. **Direct gateway connection** - PED talks directly to processor gateway
5. **Offline resilient** - Payment can work even if Service Host is offline (PED → Gateway is separate)

**Payment Driver Configuration (EMC):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Property: SNS-Newport Beach → Payment Configuration             │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Payment Driver Settings                                     ││
│ │                                                             ││
│ │ Driver Type: [▼ Simphony Payment Interface (SPI)]          ││
│ │                                                             ││
│ │ Connection Mode:                                            ││
│ │ ○ Terminal Mode (POS → PED direct)                          ││
│ │ ● Middleware Mode (POS → Payment Service → PED)             ││
│ │                                                             ││
│ │ Middleware Settings (if Middleware Mode):                   ││
│ │ Payment Service Host: [▼ WS01 - Service Host]              ││
│ │ Middleware IP: [Auto-assigned from Service Host]            ││
│ │ Port: [5023]                                                ││
│ │                                                             ││
│ │ Processor Gateway:                                          ││
│ │ Processor: [▼ Stripe / Elavon / FreedomPay / ...]          ││
│ │ Gateway URL: [https://api.stripe.com/...]                   ││
│ │ Merchant ID: [●●●●●●●●●●●●] (stored in secrets)             ││
│ │                                                             ││
│ │ PED Configuration:                                          ││
│ │ ┌─────────────┬─────────────┬────────────────┐              ││
│ │ │ Workstation │ PED IP      │ PED Type       │              ││
│ │ ├─────────────┼─────────────┼────────────────┤              ││
│ │ │ WS01        │ 192.168.1.50│ Verifone VX520 │              ││
│ │ │ WS02        │ 192.168.1.51│ Ingenico Lane  │              ││
│ │ └─────────────┴─────────────┴────────────────┘              ││
│ └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Offline Payment Handling:**

| Scenario | Behavior |
|----------|----------|
| Internet down, LAN up | PED → Gateway works IF gateway accessible. If not, payment declined. |
| Service Host down | Terminal Mode: PED still works. Middleware Mode: No payment. |
| Both down | No electronic payment. Cash only. |

**Important:** Modern payment processing does NOT support "store and forward" offline authorizations for security reasons. If the PED cannot reach the processor gateway, the payment is declined. This is industry standard for PCI compliance.

**Supported Functions:**
- Authorization (pre-auth)
- Sale (auth + capture)
- Void
- Refund
- Tip adjustment
- Manual entry (MOTO - phone orders)
- Signature capture
- Settlement (EOD batch close)

---

### 3.4 KDS Controller Service

**Responsibilities:**
- Receive order tickets from CAPS (when items are "Sent")
- Route to appropriate KDS displays based on Order Device configuration
- Track bump status per item/ticket
- Manage expo routing for multi-station flows
- All communication via LAN WebSocket (no internet required)

**KDS Flow (Parallel to Print Controller):**
```
WS sends items (Send button)
           │
           ▼
┌─────────────────────────┐
│   CAPS (Check Service)  │
│                         │
│  1. Mark items as sent  │
│  2. Create round        │
│  3. Notify services     │
└───────────┬─────────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
┌──────────┐  ┌──────────────┐
│  Print   │  │     KDS      │
│Controller│  │  Controller  │
└────┬─────┘  └──────┬───────┘
     │               │
     ▼               ▼
┌──────────┐  ┌──────────────┐
│ Printer  │  │ KDS Display  │
│ (TCP/IP) │  │ (WebSocket)  │
└──────────┘  └──────────────┘
```

**KDS Routing Logic (Same as Print Class):**
```typescript
function routeToKDS(items: CheckItem[], rvcId: string): KDSTicket[] {
  const tickets: Map<string, KDSTicket> = new Map();
  
  for (const item of items) {
    // Get Order Device from menu item configuration
    const orderDevice = getOrderDevice(item.menuItemId);
    
    // Get KDS devices for this order device in this RVC
    const kdsDevices = getKDSDevicesForOrderDevice(orderDevice.id, rvcId);
    
    for (const kds of kdsDevices) {
      if (!tickets.has(kds.id)) {
        tickets.set(kds.id, { kdsDeviceId: kds.id, items: [] });
      }
      tickets.get(kds.id)!.items.push(item);
    }
  }
  
  return Array.from(tickets.values());
}
```

**KDS Controller vs Print Controller Comparison:**

| Aspect | Print Controller | KDS Controller |
|--------|------------------|----------------|
| Routing Config | Print Class → Printer | Order Device → KDS Display |
| Protocol | TCP/IP Port 9100 | WebSocket (LAN) |
| Data Format | ESC/POS commands | JSON ticket data |
| Acknowledgment | Job status | Bump status |
| Retry | Yes (queue-based) | Yes (until bumped) |
| Expo Flow | N/A | Yes (multi-station routing) |

---

## 4. Database Design

### 4.1 Local Database Choice: SQLite with SQLCipher

**Why SQLite:**
- Single file, portable, no server installation
- Cross-platform (Windows, Android, Linux)
- Same Drizzle ORM syntax as PostgreSQL
- Proven reliability for embedded systems

**Why SQLCipher (Encryption):**
- AES-256 encryption at rest
- Transparent to application code
- Industry standard for mobile/embedded
- Protects against physical device theft

### 4.2 Schema Strategy

**Reuse existing schema with modifications:**

The Service Host uses the **same schema** as the cloud (`shared/schema.ts`) with these adaptations:

| Cloud Table | Local Table | Sync Direction | Notes |
|-------------|-------------|----------------|-------|
| enterprises | enterprises | Cloud → Local | Read-only locally |
| properties | properties | Cloud → Local | Read-only locally |
| revenue_centers | revenue_centers | Cloud → Local | Read-only locally |
| employees | employees | Cloud → Local | Config sync |
| roles | roles | Cloud → Local | Config sync |
| menu_items | menu_items | Cloud → Local | Config sync |
| slus | slus | Cloud → Local | Config sync |
| checks | checks | Bidirectional | Created locally, synced up |
| check_items | check_items | Bidirectional | Created locally, synced up |
| payments | payments | Bidirectional | Created locally, synced up |
| time_punches | time_punches | Bidirectional | Created locally, synced up |
| employee_schedules | employee_schedules | Cloud → Local | For clock-in enforcement |

### 4.3 New Tables for Service Host

```typescript
// Replay Queue - transactions pending sync to cloud
export const replayQueue = sqliteTable("replay_queue", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'check', 'payment', 'time_punch'
  entityId: text("entity_id").notNull(),
  operation: text("operation").notNull(), // 'create', 'update', 'delete'
  payload: text("payload").notNull(), // JSON of the entity
  createdAt: text("created_at").notNull(),
  attempts: integer("attempts").default(0),
  lastAttemptAt: text("last_attempt_at"),
  status: text("status").default("pending"), // 'pending', 'syncing', 'failed', 'completed'
  errorMessage: text("error_message"),
});

// Sync State - track what's been synced
export const syncState = sqliteTable("sync_state", {
  id: text("id").primaryKey(),
  tableName: text("table_name").notNull(),
  lastSyncAt: text("last_sync_at"),
  lastSyncVersion: integer("last_sync_version").default(0),
  status: text("status").default("idle"), // 'idle', 'syncing', 'error'
});

// Workstation Status - track online/offline state of each WS
export const workstationStatus = sqliteTable("workstation_status", {
  workstationId: text("workstation_id").primaryKey(),
  lastHeartbeatAt: text("last_heartbeat_at"),
  isOnline: integer("is_online").default(1), // SQLite boolean
  currentCheckId: text("current_check_id"),
  ipAddress: text("ip_address"),
});

// Check Locks - who has what check
export const checkLocks = sqliteTable("check_locks", {
  checkId: text("check_id").primaryKey(),
  workstationId: text("workstation_id").notNull(),
  lockedAt: text("locked_at").notNull(),
  lockType: text("lock_type").default("active"), // 'active', 'view'
});
```

### 4.4 Encryption Key Management

```
┌─────────────────────────────────────────────────────────────┐
│                         EMC (Cloud)                         │
│                                                             │
│  Property Configuration:                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Service Host Security                               │   │
│  │                                                     │   │
│  │ Database Encryption Key: [Generated/Rotated]       │   │
│  │ Last Rotated: Jan 10, 2026                          │   │
│  │                                                     │   │
│  │ [Rotate Key] [Download CAL Package]                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              Key embedded in CAL Package
              (encrypted with property certificate)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Host (On-Prem)                   │
│                                                             │
│  1. CAL Package installed                                   │
│  2. Key extracted and stored in:                            │
│     - Windows: DPAPI (Data Protection API)                  │
│     - Android: Android Keystore                             │
│  3. SQLite opened with key                                  │
│  4. If key rotates in cloud:                                │
│     - Service Host notified via sync                        │
│     - Must download new CAL package                         │
│     - Local DB recreated with new key                       │
│     - Data re-synced from cloud                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 Key Rotation Flow (What Happens When Keys Rotate)

When an admin rotates the encryption key in EMC (cloud), here's what happens:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          KEY ROTATION PROCESS                               │
│                                                                             │
│  STEP 1: Admin clicks [Rotate Key] in EMC                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Cloud:                                                                │  │
│  │ - Generates new encryption key                                        │  │
│  │ - Stores hash of new key in database                                  │  │
│  │ - Invalidates old key                                                 │  │
│  │ - Sends KEY_ROTATED message to connected Service Hosts                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  STEP 2: Service Host receives notification                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Service Host:                                                         │  │
│  │ - Receives KEY_ROTATED message                                        │  │
│  │ - Displays warning: "Key rotated - reinstall required"                │  │
│  │ - Continues operating with OLD key (grace period)                     │  │
│  │ - System tray icon changes to ORANGE                                  │  │
│  │ - Manager notification in EMC                                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  STEP 3: Admin downloads NEW CAL package                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ EMC:                                                                  │  │
│  │ - Admin goes to Service Host tab                                      │  │
│  │ - Clicks [Download CAL Package]                                       │  │
│  │ - New package contains NEW encryption key                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  STEP 4: Run new installer on Service Host PC                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Installer:                                                            │  │
│  │ - Detects existing installation                                       │  │
│  │ - Stops running Service Host                                          │  │
│  │ - Backs up replay queue (pending transactions)                        │  │
│  │ - DELETES old encrypted database (can't read it anymore)              │  │
│  │ - Installs new key in Windows DPAPI                                   │  │
│  │ - Creates fresh SQLite database with NEW key                          │  │
│  │ - Starts Service Host                                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  STEP 5: Service Host re-syncs from cloud                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Service Host:                                                         │  │
│  │ - Connects to cloud with NEW key                                      │  │
│  │ - Downloads FULL configuration (not delta)                            │  │
│  │ - Replays backed-up transactions to cloud                             │  │
│  │ - Syncs any open checks from cloud                                    │  │
│  │ - System tray icon returns to GREEN                                   │  │
│  │ - Ready for normal operation                                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
1. **No data loss** - Pending transactions are backed up before database wipe
2. **Grace period** - Service Host continues working briefly with old key
3. **Full resync** - After new key, all config redownloaded from cloud
4. **Open checks** - Preserved in cloud, synced back to new local DB
5. **Minimal downtime** - Usually 5-10 minutes for the upgrade process

---

## 5. Sync Protocol

### 5.1 Connection Establishment

```
Service Host                                          Cloud
     │                                                   │
     │──────────── WebSocket Connect ───────────────────►│
     │             (wss://cloud/ws/service-host)         │
     │                                                   │
     │◄─────────── Challenge ───────────────────────────│
     │             {nonce: "abc123"}                     │
     │                                                   │
     │──────────── Auth Response ───────────────────────►│
     │             {propertyId, signature(nonce, key)}   │
     │                                                   │
     │◄─────────── Auth OK + Config Version ────────────│
     │             {configVersion: 1234}                 │
     │                                                   │
     │──────────── Request Config Delta ────────────────►│
     │             {fromVersion: 1200}                   │
     │                                                   │
     │◄─────────── Config Delta ────────────────────────│
     │             {changes: [...], toVersion: 1234}     │
     │                                                   │
```

### 5.2 Sync Message Types

| Message Type | Direction | Frequency | Purpose |
|--------------|-----------|-----------|---------|
| `HEARTBEAT` | Bidirectional | 15 sec | Connectivity check, WS status |
| `CONFIG_SYNC` | Cloud → Local | 2-3 min | Menu, employees, settings |
| `SCHEDULE_SYNC` | Cloud → Local | 5 min | Employee schedules |
| `CHECK_SNAPSHOT` | Local → Cloud | 30 sec | Open check status for reporting |
| `TRANSACTION_POST` | Local → Cloud | Real-time | Closed checks, payments, punches |
| `REPLAY_BATCH` | Local → Cloud | On reconnect | Queued transactions |

### 5.3 Config Sync (Cloud → Local)

```json
// Cloud sends delta of changes since last sync
{
  "type": "CONFIG_DELTA",
  "fromVersion": 1200,
  "toVersion": 1234,
  "changes": [
    {
      "table": "menu_items",
      "operation": "upsert",
      "data": { "id": "uuid", "name": "Burger", "price": 1299, ... }
    },
    {
      "table": "employees", 
      "operation": "delete",
      "data": { "id": "uuid" }
    }
  ]
}
```

### 5.4 Transaction Posting (Local → Cloud)

```json
// Service Host posts completed transactions
{
  "type": "TRANSACTION_POST",
  "transactions": [
    {
      "type": "check_closed",
      "checkId": "uuid",
      "closedAt": "2026-01-10T20:30:00Z",
      "total": 4599,
      "items": [...],
      "payments": [...],
      "employeeId": "uuid",
      "workstationId": "uuid"
    },
    {
      "type": "time_punch",
      "employeeId": "uuid",
      "punchType": "clock_in",
      "punchTime": "2026-01-10T16:00:00Z"
    }
  ]
}
```

### 5.5 Replay Queue Processing

When Service Host reconnects after being offline:

```
1. Service Host connects to cloud
2. Cloud acknowledges, sends current config version
3. Service Host checks replay queue
4. For each queued transaction (in order):
   a. Send to cloud
   b. Wait for acknowledgment
   c. Mark as completed or retry
5. Once queue empty, resume normal operation
```

**Conflict Resolution:**
- Transactions are timestamped with local time
- Cloud processes in timestamp order
- If conflict detected (e.g., check already closed):
  - Cloud logs conflict
  - Returns error to Service Host
  - Service Host marks for manager review

---

## 6. Offline Modes

### 6.1 Mode Definitions

| Mode | Internet | LAN | Service Host | Workstation Behavior |
|------|----------|-----|--------------|---------------------|
| **Online** | ✅ | ✅ | Connected to cloud | Normal operation, real-time sync |
| **Yellow** | ❌ | ✅ | Running, no cloud | LAN operations continue, queue transactions |
| **Red** | ❌ | ❌ | Unreachable | WS operates standalone, local storage only |

### 6.2 Mode Detection

**Service Host Cloud Detection:**
```javascript
// Service Host monitors cloud connection
const HEARTBEAT_INTERVAL = 15000; // 15 seconds
const OFFLINE_THRESHOLD = 3; // 3 missed heartbeats = offline

let missedHeartbeats = 0;

setInterval(() => {
  try {
    await sendHeartbeat();
    missedHeartbeats = 0;
    setMode('online');
  } catch (error) {
    missedHeartbeats++;
    if (missedHeartbeats >= OFFLINE_THRESHOLD) {
      setMode('yellow');
    }
  }
}, HEARTBEAT_INTERVAL);
```

**Workstation Service Host Detection:**
```javascript
// Workstation monitors Service Host connection
const SH_HEARTBEAT_INTERVAL = 10000; // 10 seconds
const SH_OFFLINE_THRESHOLD = 3;

let missedSHHeartbeats = 0;

setInterval(() => {
  try {
    await pingServiceHost();
    missedSHHeartbeats = 0;
    setMode(serviceHostMode); // inherit SH mode
  } catch (error) {
    missedSHHeartbeats++;
    if (missedSHHeartbeats >= SH_OFFLINE_THRESHOLD) {
      setMode('red');
    }
  }
}, SH_HEARTBEAT_INTERVAL);
```

### 6.3 Yellow Mode Behavior

**What Works:**
- All POS operations (ringing, payments, check management)
- Printing (via Print Controller on LAN)
- KDS (via KDS Controller on LAN)
- Check sharing between workstations
- Clock in/out (using cached schedules)
- Manager functions

**What's Limited:**
- No real-time sync to cloud reports
- No EMC configuration changes take effect
- Gift card balance checks (if cloud-based)
- Online ordering injection

**Transaction Handling:**
- All transactions written to local SQLite
- Added to replay queue with timestamp
- Continues accumulating until connection restored

### 6.4 Red Mode Behavior

**What Works:**
- POS operations on that single workstation
- Local receipt printing (if printer directly connected)
- Offline check numbers (pre-assigned range)

**What's Limited:**
- No check sharing
- No KDS routing
- No Print Controller routing
- Limited reporting

**Recovery:**
1. Workstation reconnects to Service Host
2. Sends local transactions to Service Host
3. Service Host reconciles and adds to its replay queue
4. Service Host syncs to cloud when online

### 6.5 Automatic Recovery

```
┌─────────────────────────────────────────────────────────────┐
│                    Recovery Flow                            │
│                                                             │
│  1. Connection Restored                                     │
│     └── Service Host detects cloud connectivity             │
│                                                             │
│  2. Authentication                                          │
│     └── Re-establish WebSocket, verify credentials          │
│                                                             │
│  3. Config Catch-up                                         │
│     └── Download any config changes missed while offline    │
│                                                             │
│  4. Replay Queue Processing                                 │
│     └── Send queued transactions in timestamp order         │
│     └── Handle conflicts (log for manager review)           │
│                                                             │
│  5. Resume Normal Operation                                 │
│     └── Switch to Online mode                               │
│     └── Real-time sync resumes                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Check Sharing & Locking

### 7.1 Check Status Indicators

| Status | Icon | Meaning | Pickup Action |
|--------|------|---------|---------------|
| **Available** | 🟢 Green | Check is unlocked, no WS owns it | Free pickup |
| **In Use** | 🟡 Yellow | Check is locked by another ONLINE WS | Manager override required |
| **Offline WS** | 🔴 Red | Check is locked by an OFFLINE WS | Manager override (HIGH RISK) |

### 7.2 Lock Acquisition Flow

```
Workstation requests check pickup
           │
           ▼
┌─────────────────────────────────┐
│   CAPS (on Service Host)        │
│                                 │
│   Check lock status?            │
│   ├── Unlocked → Grant lock     │
│   ├── Locked by self → OK       │
│   ├── Locked by online WS       │
│   │   └── Return YELLOW status  │
│   └── Locked by offline WS      │
│       └── Return RED status     │
└─────────────────────────────────┘
           │
           ▼
    Return to workstation
```

### 7.3 Manager Override Flow

**Yellow Override (Check on Online WS):**
```
1. Manager authentication (PIN/swipe)
2. CAPS sends "LOCK_OVERRIDE" message to original WS
3. Original WS:
   a. Saves any pending changes
   b. Releases lock
   c. Displays "Check taken by WS02"
4. Requesting WS receives lock
5. Audit log entry created
```

**Red Override (Check on Offline WS):**
```
1. Manager authentication (PIN/swipe)
2. Warning dialog displayed:
   "This check was last modified on WS01 which is OFFLINE.
    Picking up may cause duplicate items when WS01 reconnects.
    
    Proceed with caution. A reconciliation will be required."
    
    [Cancel] [Override]
3. If Override:
   a. Check state cloned from last known state
   b. Original check marked "conflict_pending"
   c. New lock granted
   d. Audit log with override reason
4. When offline WS reconnects:
   a. Conflict detected
   b. Manager notification
   c. Side-by-side comparison shown
   d. Manager chooses which changes to keep
```

### 7.4 Conflict Resolution UI

```
┌─────────────────────────────────────────────────────────────┐
│  CHECK CONFLICT DETECTED                                    │
│                                                             │
│  Check #1234 has conflicting changes                        │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ Version A (WS01)    │  │ Version B (WS02)    │          │
│  │ (Original)          │  │ (Override)          │          │
│  │                     │  │                     │          │
│  │ Burger     $12.99   │  │ Burger     $12.99   │          │
│  │ Fries       $4.99   │  │ Fries       $4.99   │          │
│  │ + Soda      $2.99   │  │ + Salad     $6.99   │ ← Different│
│  │                     │  │                     │          │
│  │ Total:     $20.97   │  │ Total:     $24.97   │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  [Use Version A] [Use Version B] [Merge (Add Both Items)]  │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Print Controller Service

### 8.1 Print Flow (Hybrid)

**Current Cloud Flow (V1):**
```
WS → Cloud API → Print Agent WebSocket → Local Printer
     (Internet required)
```

**New Hybrid Flow (V2):**
```
WS → Service Host (LAN) → Print Controller → Local Printer
     (No internet required)
```

### 8.2 Printer Configuration

Printers are configured in EMC (same as today) but Print Controller uses the config locally:

```typescript
// Printer configuration (from EMC, synced to local DB)
{
  id: "uuid",
  name: "Kitchen Printer",
  propertyId: "uuid",
  ipAddress: "192.168.1.100",
  port: 9100,
  printerType: "epson_tm_t88",
  isEnabled: true
}
```

### 8.3 Print Class Routing (Local)

```typescript
// Print Controller routing logic
function routePrintJob(job: PrintJob): Printer[] {
  const printers: Printer[] = [];
  
  for (const item of job.items) {
    const printClass = getPrintClass(item.menuItemId);
    const routing = getPrintClassRouting(printClass.id, job.rvcId);
    
    if (routing) {
      printers.push(getPrinter(routing.printerId));
    }
  }
  
  return [...new Set(printers)]; // Dedupe
}
```

### 8.4 Print Queue Management

```typescript
// Local print queue table
export const printQueue = sqliteTable("print_queue", {
  id: text("id").primaryKey(),
  printerId: text("printer_id").notNull(),
  jobType: text("job_type").notNull(), // 'receipt', 'kitchen', 'report'
  payload: text("payload").notNull(), // ESC/POS commands or template data
  status: text("status").default("pending"), // 'pending', 'printing', 'completed', 'failed'
  attempts: integer("attempts").default(0),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
  errorMessage: text("error_message"),
});
```

---

## 9. CAL Package Deployment

### 9.1 Package Contents

```
ServiceHost-Windows-v1.0.0.exe     # Self-extracting installer
│
└── Contains:
    ├── ServiceHost.exe            # Main application (Node.js bundled with pkg)
    ├── runtime/                   # Bundled Node.js runtime
    ├── config/
    │   ├── property.json          # Property ID, cloud URL, encrypted config
    │   └── services.json          # Which services to run (CAPS, Print, KDS)
    ├── db/
    │   └── (created on first run) # SQLite database location
    └── logs/
        └── (runtime logs)
```

### 9.2 Silent Installer (Minimal Interaction)

The CAL package is a self-extracting executable that runs with minimal user interaction:

**Installation Steps (User Experience):**
```
1. Double-click ServiceHost-Windows-v1.0.0.exe
2. UAC prompt: "Allow this app to make changes?" → [Yes]
3. Single dialog appears:

   ┌────────────────────────────────────────────────────┐
   │  Cloud POS Service Host Installer                  │
   │                                                    │
   │  Property: SNS-Newport Beach                       │
   │  Services: CAPS, Print Controller, KDS Controller  │
   │                                                    │
   │  Install Location:                                 │
   │  [C:\Program Files\CloudPOS\ServiceHost]  [Browse] │
   │                                                    │
   │  ☑️ Start Service Host after installation          │
   │  ☑️ Run at Windows startup                         │
   │                                                    │
   │            [Install]  [Cancel]                     │
   └────────────────────────────────────────────────────┘

4. Progress bar shows installation
5. Service Host starts automatically
6. System tray icon appears (green = connected, yellow = offline)
```

**Silent Install (No UI):**
```cmd
ServiceHost-Windows-v1.0.0.exe /silent /install-path="C:\CloudPOS"
```

**Post-Install Verification:**
- Service Host connects to cloud
- Downloads latest configuration
- Displays system tray notification: "Service Host connected to SNS-Newport Beach"

### 9.3 CAL Versioning System

**How Version Updates Work (Simphony-Style):**

The cloud environment and local Service Hosts maintain version alignment through CAL packages:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VERSION MANAGEMENT FLOW                              │
│                                                                             │
│  STEP 1: Cloud Update                                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Cloud Environment upgraded to Version 1.2.0                           │ │
│  │ - New features added (e.g., new payment options)                       │ │
│  │ - Database schema updated                                              │ │
│  │ - API changes deployed                                                 │ │
│  │ - Cloud tested and verified                                            │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  STEP 2: CAL Package Created                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ New CAL Package: ServiceHost-1.2.0.exe                                │ │
│  │ - Contains updated Service Host application                            │ │
│  │ - Database migration scripts                                           │ │
│  │ - Compatible with Cloud 1.2.0                                          │ │
│  │ - Available for download in EMC                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  STEP 3: Selective Deployment                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Admin chooses WHERE to deploy:                                         │ │
│  │                                                                        │ │
│  │ ☑️ Newport Beach (WS01) → Deploy 1.2.0 (test first)                    │ │
│  │ ☐ Newport Beach (WS02) → Stay on 1.1.0                                 │ │
│  │ ☐ Laguna Beach (WS01) → Stay on 1.1.0                                  │ │
│  │ ☐ Laguna Beach (WS02) → Stay on 1.1.0                                  │ │
│  │                                                                        │ │
│  │ Test on one workstation, then roll out to others                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  STEP 4: Service Host Updates                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ When CAL Package deployed:                                             │ │
│  │ 1. Service Host downloads package from cloud                           │ │
│  │ 2. Stops services gracefully                                           │ │
│  │ 3. Backs up current database                                           │ │
│  │ 4. Runs database migrations                                            │ │
│  │ 5. Updates application files                                           │ │
│  │ 6. Restarts services                                                   │ │
│  │ 7. Reports success/failure to cloud                                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Version Compatibility Rules:**

| Cloud Version | CAL Version | Compatible? | Notes |
|---------------|-------------|-------------|-------|
| 1.2.0 | 1.2.0 | ✅ Yes | Exact match |
| 1.2.0 | 1.1.0 | ⚠️ Degraded | Old features work, new features unavailable |
| 1.2.0 | 1.0.0 | ❌ No | Too old, sync will fail |
| 1.1.0 | 1.2.0 | ❌ No | CAL ahead of cloud (shouldn't happen) |

**EMC CAL Package Management:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EMC → Setup → CAL Packages                                                 │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Available CAL Packages                                                  ││
│ │                                                                         ││
│ │ ┌────────────┬───────────┬─────────────┬────────────────┐              ││
│ │ │ Version    │ Released  │ Status      │ Actions        │              ││
│ │ ├────────────┼───────────┼─────────────┼────────────────┤              ││
│ │ │ 1.2.0      │ Jan 15    │ Latest      │ [Deploy] [Notes]│             ││
│ │ │ 1.1.1      │ Jan 10    │ Stable      │ [Deploy] [Notes]│             ││
│ │ │ 1.1.0      │ Jan 1     │ Previous    │ [Deploy] [Notes]│             ││
│ │ │ 1.0.0      │ Dec 15    │ Deprecated  │ [Notes]         │             ││
│ │ └────────────┴───────────┴─────────────┴────────────────┘              ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Deployment Targets (Version 1.2.0)                                      ││
│ │                                                                         ││
│ │ Select where to deploy:                                                 ││
│ │                                                                         ││
│ │ ☐ All Properties (Enterprise-wide)                                     ││
│ │                                                                         ││
│ │ Properties:                                                             ││
│ │ ├─ ☑️ SNS-Newport Beach                                                 ││
│ │ │    ├─ ☑️ WS01 (Service Host) - Currently: 1.1.0                       ││
│ │ │    ├─ ☐ WS02 - Currently: 1.1.0                                       ││
│ │ │    └─ ☐ KDS01 - Currently: 1.1.0                                      ││
│ │ │                                                                       ││
│ │ └─ ☐ SNS-Laguna Beach                                                   ││
│ │      ├─ ☐ WS01 (Service Host) - Currently: 1.1.0                        ││
│ │      └─ ☐ WS02 - Currently: 1.1.0                                       ││
│ │                                                                         ││
│ │ Deployment Schedule:                                                    ││
│ │ ○ Immediate                                                             ││
│ │ ● Scheduled: [2026-01-15] [02:00 AM] (during low traffic)              ││
│ │                                                                         ││
│ │ [Deploy Selected] [Cancel]                                              ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

**Deployment Status Monitoring:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CAL Deployment Status                                                       │
│                                                                             │
│ Deployment: Version 1.2.0 → SNS-Newport Beach                              │
│ Started: Jan 15, 2026 2:00 AM                                              │
│                                                                             │
│ ┌─────────────────┬───────────┬─────────────────────────────┐              │
│ │ Device          │ Status    │ Details                     │              │
│ ├─────────────────┼───────────┼─────────────────────────────┤              │
│ │ WS01 (SH)       │ ✅ Success │ Updated 2:05 AM             │              │
│ │ WS02            │ ⏳ Pending │ Scheduled for 2:10 AM       │              │
│ │ KDS01           │ ⏳ Pending │ Scheduled for 2:15 AM       │              │
│ └─────────────────┴───────────┴─────────────────────────────┘              │
│                                                                             │
│ [View Logs] [Retry Failed] [Cancel Pending]                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Use Cases:**

1. **Test before rollout**: Deploy 1.2.0 to one workstation at Newport Beach. Test for a week. If stable, deploy to all others.

2. **Property-by-property**: Upgrade Newport Beach to 1.2.0 while Laguna Beach stays on 1.1.0.

3. **Emergency rollback**: If 1.2.0 has issues, deploy 1.1.1 to affected devices.

4. **Scheduled maintenance**: Deploy during night hours (2 AM) when restaurant is closed.

---

### 9.4 EMC Configuration for CAL

**New "Service Host" tab in Property configuration:**

```
┌─────────────────────────────────────────────────────────────┐
│ Property: SNS-Newport Beach                                 │
│                                                             │
│ [General] [Revenue Centers] [Service Host] [Settings]       │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Service Host Configuration                              ││
│ │                                                         ││
│ │ Designated Service Host Workstation:                    ││
│ │ [▼ SNS-001-WS01                              ]         ││
│ │                                                         ││
│ │ Services:                                               ││
│ │ ☑️ Check and Posting Service (CAPS)                     ││
│ │ ☑️ Print Controller Service                             ││
│ │ ☑️ KDS Controller Service                               ││
│ │ ☐ Credit Card Service (future)                          ││
│ │                                                         ││
│ │ Sync Settings:                                          ││
│ │ Config Sync Interval: [2] minutes                       ││
│ │ Heartbeat Interval: [15] seconds                        ││
│ │                                                         ││
│ │ Security:                                               ││
│ │ Database Encryption Key: ●●●●●●●●●●●●                   ││
│ │ Last Rotated: Jan 10, 2026                              ││
│ │ [Rotate Key]                                            ││
│ │                                                         ││
│ │ [Download CAL Package]                                  ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 9.3 CAL Installation Flow

```
1. Admin downloads CAL package from EMC
2. Copy to Service Host PC
3. Run install.bat (or extract and run ServiceHost.exe)
4. Service Host:
   a. Reads config/property.json
   b. Decrypts database key
   c. Creates SQLite database
   d. Connects to cloud for initial sync
   e. Downloads full configuration
   f. Starts services (CAPS, Print, KDS)
5. Ready to accept workstation connections
```

### 9.4 Android CAL (Phase 4)

For Android Service Host (future):
- APK instead of ZIP
- Same config embedded
- Android Keystore for key storage
- Background service for 24/7 operation

---

## 10. EMC Configuration Changes

### 10.1 New Database Tables (Cloud)

```typescript
// Service Host registration
export const serviceHosts = pgTable("service_hosts", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").references(() => properties.id),
  name: varchar("name", { length: 100 }).notNull(),
  workstationId: uuid("workstation_id").references(() => workstations.id),
  status: varchar("status", { length: 20 }).default("offline"),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  version: varchar("version", { length: 20 }),
  services: jsonb("services").default([]), // ['caps', 'print', 'kds']
  encryptionKeyHash: varchar("encryption_key_hash", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Config versions for delta sync
export const configVersions = pgTable("config_versions", {
  id: serial("id").primaryKey(),
  propertyId: uuid("property_id").references(() => properties.id),
  version: integer("version").notNull(),
  tableName: varchar("table_name", { length: 50 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  operation: varchar("operation", { length: 10 }).notNull(), // 'insert', 'update', 'delete'
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 10.2 New API Endpoints (Cloud)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/service-hosts` | GET, POST | List/create service hosts |
| `/api/service-hosts/:id` | PATCH, DELETE | Update/delete service host |
| `/api/service-hosts/:id/package` | GET | Download CAL package |
| `/api/sync/config` | GET | Get config delta since version |
| `/api/sync/transactions` | POST | Receive transactions from service host |
| `/ws/service-host` | WebSocket | Real-time sync channel |

### 10.3 UI Changes

**Admin Navigation:**
```
Property: SNS-Newport Beach
├── Dashboard
├── Menu Management
├── Employees
├── Workstations
├── Service Host          ← NEW
│   ├── Configuration
│   ├── Services Status
│   ├── Sync Status
│   └── CAL Packages
├── Printers
├── KDS Devices
└── Settings
```

---

## 11. Phase 1 Deliverables

### 11.1 Scope

Phase 1 focuses on the **foundation** - getting the Service Host running with basic CAPS and sync:

| Deliverable | Priority | Status |
|-------------|----------|--------|
| SQLite schema (mirror of PostgreSQL) | P0 | Not Started |
| Service Host Windows application | P0 | Not Started |
| Cloud ↔ Service Host WebSocket | P0 | Not Started |
| Config sync (cloud → local) | P0 | Not Started |
| Basic CAPS (check create/update) | P0 | Not Started |
| Transaction posting (local → cloud) | P0 | Not Started |
| Offline detection (Yellow mode) | P1 | Not Started |
| EMC Service Host tab | P1 | Not Started |
| CAL package download | P2 | Not Started |

### 11.2 Out of Scope (Phase 1)

- Print Controller (Phase 2)
- KDS Controller (Phase 2)
- Red mode / WS standalone (Phase 3)
- Android Service Host (Phase 4)
- Key rotation workflow (Phase 5)

### 11.3 Success Criteria

Phase 1 is complete when:
1. Service Host can be installed on Windows PC
2. Service Host connects to cloud and syncs configuration
3. Workstations can connect to Service Host on LAN
4. Checks can be created and modified via Service Host
5. Closed checks sync to cloud database
6. System detects offline and enters Yellow mode
7. Transactions queue and replay when connection restored

---

## 12. Resolved Design Decisions

### Decision 1: Workstation Client
**Choice:** Browser with device token authentication
- Workstations use browser connecting to local Service Host
- Device must present enrollment token to access POS
- Faster to build, same UI as current system
- Service Host validates token before allowing access

### Decision 2: Service Host Deployment
**Choice:** Flexible - dedicated PC OR workstation dual-use
- Can run on dedicated hardware for high-volume properties
- Can run alongside POS client on same PC for smaller properties
- EMC configuration determines which WS hosts which services

### Decision 3: Failover Strategy
**Choice:** Primary/Secondary Service Host with automatic failover
- Property can have 2 Service Hosts (Primary + Backup)
- Backup monitors Primary via heartbeat
- If Primary fails, Backup promotes itself
- Workstations automatically reconnect to Backup
- When Primary recovers, it syncs from Backup and can resume

### Decision 4: Open Checks at Business Date Rollover
**Choice:** Sales post when rung, outstanding balance carries forward

**How It Works (Industry Standard):**
- **Sales post when items are RUNG/SENT** - not when check closes
- **Outstanding BALANCE carries forward** - what's still owed on the check
- **New items on carried-forward check → post to CURRENT business day**
- **Tenders on carried-forward check → post to CURRENT business day**

**Example:**
```
Monday:
  - Open check, ring $50 of items → $50 posts to Monday sales
  - Check left open at rollover → $50 balance carries forward

Tuesday:
  - Pick up carried-forward check
  - Add $10 more items → $10 posts to Tuesday sales (NOT Monday)
  - Collect $60 payment → $60 tender posts to Tuesday

Reports:
  - Monday Sales: $50 (items rung that day)
  - Tuesday Sales: $10 (new items rung that day)
  - Monday Outstanding: $50 (unpaid at EOD)
  - Tuesday Tenders: $60
```

**Database Implications:**
- `check_items.businessDatePosted` - set when item is sent, immutable
- `payments.businessDatePosted` - set when tender is applied
- `checks.businessDateOpened` - when check was first created
- `checks.businessDateClosed` - when check was fully paid (null if still open)
- Daily sales report = SUM of check_items WHERE businessDatePosted = target date

### Decision 5: Admin Navigation (EMC)
**Confirmed:** All existing modules remain unchanged
- Employees, Schedules, Roles - stay as-is
- Menu Items, SLUs, Modifiers - stay as-is
- Service Host is an ADDITIONAL tab, not a replacement
- No functionality is removed

### Decision 6: Check Number Ranges
**Choice:** Configurable per workstation in EMC
- Each workstation has min/max check number fields
- Example: WS01 (1-999), WS02 (1000-1999), WS03 (2000-2999)
- Prevents duplicate check numbers during offline operation
- System warns if ranges overlap

### Decision 7: Failover Timing
**Choice:** 3 minutes maximum
- Primary Service Host monitored via heartbeat every 15 seconds
- After 12 consecutive missed heartbeats (~3 min), Backup promotes itself
- Workstations automatically redirect to Backup
- Avoids false positives from brief network hiccups

### Decision 8: Project Structure
**Choice:** Separate Replit project
- V2 Service Host is a NEW Replit project (not a subfolder)
- Keeps V1 cloud system completely independent
- Easier to manage, version, and deploy separately
- Both projects can run simultaneously

---

## 13. Cloud Sync Infrastructure - Implementation Guide

> **IMPORTANT FOR SERVICE HOST DEVELOPERS**: This section contains everything the Service Host application needs to connect to the Cloud POS system. When building the Service Host in a new Replit project, use this as your reference for all cloud communication.

### 13.1 Cloud App Connection Details

**Cloud App URL:**
The cloud POS system runs on Replit and is accessible via HTTPS. The Service Host will connect to:

```
Production URL: https://<your-replit-app-name>.replit.app
Development URL: https://<your-replit-app-name>.replit.dev

Example: https://cloud-pos-system.replit.app
```

**Connection Flow:**
```
┌────────────────────────────────────────────────────────────────────────────┐
│                   SERVICE HOST STARTUP SEQUENCE                             │
│                                                                             │
│  1. Read config/property.json (contains cloud URL, property ID)            │
│  2. Connect to cloud via HTTPS                                              │
│  3. POST /api/service-hosts/authenticate with registration token           │
│  4. Receive JWT access token (valid 24 hours)                              │
│  5. Establish WebSocket connection to /ws/service-host                      │
│  6. Request full config sync                                                │
│  7. Store config in local SQLite                                            │
│  8. Start services (CAPS, Print, KDS)                                       │
│  9. Begin heartbeat loop (every 15 seconds)                                 │
│ 10. Ready to accept workstation connections                                 │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Service Host Registration & Authentication

**Initial Registration (Done Once in EMC):**
When a property admin creates a Service Host in EMC, the cloud generates:
- `serviceHostId` (UUID)
- `registrationToken` (one-time use, 64-char hex string)
- `encryptionKey` (for SQLite encryption)

These are embedded in the CAL package's `config/property.json`.

**property.json Structure:**
```json
{
  "cloudUrl": "https://cloud-pos-system.replit.app",
  "propertyId": "uuid-of-property",
  "serviceHostId": "uuid-of-service-host",
  "registrationToken": "64-char-hex-registration-token",
  "encryptionKey": "32-char-hex-encryption-key",
  "services": ["caps", "print", "kds"]
}
```

**Authentication Endpoint:**

```
POST /api/service-hosts/authenticate
Content-Type: application/json

Request Body:
{
  "serviceHostId": "uuid",
  "registrationToken": "64-char-hex",
  "version": "1.0.0",
  "hostname": "PROPERTY-SH01"
}

Response (Success - 200):
{
  "success": true,
  "accessToken": "jwt-token-valid-24h",
  "refreshToken": "refresh-token-valid-7d",
  "property": {
    "id": "uuid",
    "name": "SNS-Newport Beach",
    "enterpriseId": "uuid",
    "timezone": "America/Los_Angeles"
  },
  "configVersion": 1234
}

Response (Error - 401):
{
  "success": false,
  "error": "Invalid or expired registration token"
}
```

**Token Refresh:**
```
POST /api/service-hosts/refresh-token
Authorization: Bearer <refresh-token>

Response:
{
  "accessToken": "new-jwt-token",
  "refreshToken": "new-refresh-token"
}
```

### 13.3 REST API Endpoints

All endpoints require `Authorization: Bearer <access-token>` header.

#### 13.3.1 Configuration Sync (Cloud → Service Host)

**Get Full Configuration:**
```
GET /api/sync/config/full?propertyId={uuid}
Authorization: Bearer <token>

Response:
{
  "configVersion": 1234,
  "timestamp": "2026-01-11T10:00:00Z",
  "data": {
    "enterprise": { /* enterprise record */ },
    "property": { /* property record */ },
    "revenueCenters": [ /* array of RVCs */ ],
    "menuItems": [ /* array of menu items */ ],
    "modifierGroups": [ /* array of modifier groups */ ],
    "modifiers": [ /* array of modifiers */ ],
    "employees": [ /* array of employees */ ],
    "roles": [ /* array of roles */ ],
    "tenders": [ /* array of tenders */ ],
    "taxGroups": [ /* array of tax groups */ ],
    "discounts": [ /* array of discounts */ ],
    "printers": [ /* array of printers */ ],
    "kdsDevices": [ /* array of KDS devices */ ],
    "workstations": [ /* array of workstations */ ],
    "printClasses": [ /* array of print classes */ ],
    "orderDevices": [ /* array of order devices */ ],
    "printClassRoutings": [ /* array of routings */ ],
    "sluGroups": [ /* SLU groups (categories) */ ],
    "guestCheckDescriptors": [ /* check descriptors */ ]
  }
}
```

**Get Delta Configuration (Changes Since Version):**
```
GET /api/sync/config/delta?propertyId={uuid}&sinceVersion={number}
Authorization: Bearer <token>

Response:
{
  "fromVersion": 1200,
  "toVersion": 1234,
  "timestamp": "2026-01-11T10:00:00Z",
  "changes": [
    {
      "table": "menuItems",
      "operation": "insert",
      "entityId": "uuid",
      "data": { /* full record */ }
    },
    {
      "table": "menuItems",
      "operation": "update",
      "entityId": "uuid",
      "data": { /* full record */ }
    },
    {
      "table": "employees",
      "operation": "delete",
      "entityId": "uuid",
      "data": null
    }
  ]
}
```

#### 13.3.2 Transaction Posting (Service Host → Cloud)

**Post Transactions:**
```
POST /api/sync/transactions
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "serviceHostId": "uuid",
  "propertyId": "uuid",
  "businessDate": "2026-01-11",
  "transactions": [
    {
      "type": "check_closed",
      "localId": "local-uuid",
      "timestamp": "2026-01-11T14:30:00Z",
      "data": {
        "checkNumber": 1001,
        "employeeId": "uuid",
        "rvcId": "uuid",
        "subtotal": 45.99,
        "tax": 3.68,
        "total": 49.67,
        "items": [ /* check items */ ],
        "payments": [ /* payments */ ]
      }
    },
    {
      "type": "time_punch",
      "localId": "local-uuid",
      "timestamp": "2026-01-11T08:00:00Z",
      "data": {
        "employeeId": "uuid",
        "punchType": "clock_in",
        "jobCode": "server"
      }
    }
  ]
}

Response (Success):
{
  "success": true,
  "processed": 2,
  "cloudIds": {
    "local-uuid-1": "cloud-uuid-1",
    "local-uuid-2": "cloud-uuid-2"
  }
}
```

**Post Time Punches:**
```
POST /api/sync/time-punches
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "serviceHostId": "uuid",
  "propertyId": "uuid",
  "punches": [
    {
      "localId": "local-uuid",
      "employeeId": "uuid",
      "punchType": "clock_in",  // clock_in, clock_out, break_start, break_end
      "breakType": null,         // "meal" or "rest" if punchType is break_start
      "punchTime": "2026-01-11T08:00:00Z",
      "workstationId": "uuid",
      "jobCode": "server"
    }
  ]
}
```

#### 13.3.3 Service Host Status

**Heartbeat:**
```
POST /api/service-hosts/{id}/heartbeat
Authorization: Bearer <token>

Request Body:
{
  "status": "online",
  "activeChecks": 5,
  "pendingTransactions": 12,
  "localConfigVersion": 1234,
  "memoryUsage": 256,
  "uptime": 86400
}

Response:
{
  "acknowledged": true,
  "cloudConfigVersion": 1234,
  "pendingCommands": []
}
```

### 13.4 WebSocket Protocol

**Connection URL:**
```
wss://<cloud-app-url>/ws/service-host
```

**Connection Headers:**
```
Authorization: Bearer <access-token>
X-Service-Host-Id: <service-host-uuid>
X-Property-Id: <property-uuid>
```

**Message Format:**
All messages are JSON with this structure:
```json
{
  "type": "message_type",
  "id": "unique-message-id",
  "timestamp": "2026-01-11T10:00:00Z",
  "payload": { /* message-specific data */ }
}
```

**Message Types (Cloud → Service Host):**

| Type | Purpose | Payload |
|------|---------|---------|
| `config_update` | Config changed in EMC | `{ table, operation, entityId, data }` |
| `force_sync` | Admin requested full sync | `{}` |
| `command` | Remote command | `{ command, args }` |
| `ping` | Keep-alive | `{}` |

**Message Types (Service Host → Cloud):**

| Type | Purpose | Payload |
|------|---------|---------|
| `heartbeat` | Status update | `{ activeChecks, pendingTx }` |
| `transaction` | New transaction | `{ type, data }` |
| `check_update` | Check state change | `{ checkId, status }` |
| `pong` | Keep-alive response | `{}` |
| `error` | Error report | `{ code, message }` |

**Example WebSocket Session:**
```javascript
// Service Host connecting
const ws = new WebSocket('wss://cloud-pos.replit.app/ws/service-host', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'X-Service-Host-Id': serviceHostId,
    'X-Property-Id': propertyId
  }
});

ws.on('open', () => {
  // Send initial heartbeat
  ws.send(JSON.stringify({
    type: 'heartbeat',
    id: generateUUID(),
    timestamp: new Date().toISOString(),
    payload: {
      status: 'online',
      activeChecks: 0,
      pendingTransactions: 0,
      configVersion: localConfigVersion
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  switch (msg.type) {
    case 'config_update':
      // Apply config change to local SQLite
      applyConfigUpdate(msg.payload);
      break;
      
    case 'ping':
      // Respond with pong
      ws.send(JSON.stringify({ type: 'pong', id: msg.id }));
      break;
      
    case 'force_sync':
      // Trigger full config sync
      performFullSync();
      break;
  }
});
```

### 13.5 Local SQLite Database Schema

The Service Host maintains a local SQLite database that mirrors the cloud PostgreSQL schema. Tables use the same column names but SQLite-compatible types.

**Type Mappings:**

| PostgreSQL | SQLite |
|------------|--------|
| `uuid` | `text` (store as string) |
| `timestamp` | `text` (ISO 8601 format) |
| `jsonb` | `text` (JSON string) |
| `varchar` | `text` |
| `integer` | `integer` |
| `numeric(10,2)` | `real` |
| `boolean` | `integer` (0/1) |

**Core Tables to Mirror:**

```sql
-- Configuration tables (synced from cloud)
CREATE TABLE enterprises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT,
  name TEXT NOT NULL,
  timezone TEXT,
  address TEXT,
  phone TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE revenue_centers (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  name TEXT NOT NULL,
  rvc_number INTEGER,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  employee_number TEXT,
  first_name TEXT,
  last_name TEXT,
  pin_hash TEXT,
  role_id TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  slu_id TEXT,
  name TEXT NOT NULL,
  price REAL,
  tax_group_id TEXT,
  print_class_id TEXT,
  is_active INTEGER DEFAULT 1
);

-- Add all other tables following same pattern
```

**Local-Only Tables:**

```sql
-- Replay queue for pending cloud sync
CREATE TABLE replay_queue (
  id TEXT PRIMARY KEY,
  transaction_type TEXT NOT NULL,
  payload TEXT NOT NULL,  -- JSON
  status TEXT DEFAULT 'pending',  -- pending, sending, failed
  attempts INTEGER DEFAULT 0,
  created_at TEXT,
  last_attempt_at TEXT,
  error_message TEXT
);

-- Active checks (managed locally)
CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  check_number INTEGER NOT NULL,
  employee_id TEXT,
  rvc_id TEXT,
  table_number TEXT,
  cover_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'open',  -- open, closed, void
  subtotal REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  lock_workstation_id TEXT,
  lock_acquired_at TEXT,
  opened_at TEXT,
  closed_at TEXT,
  business_date TEXT,
  cloud_synced INTEGER DEFAULT 0
);

CREATE TABLE check_items (
  id TEXT PRIMARY KEY,
  check_id TEXT,
  menu_item_id TEXT,
  name TEXT,
  price REAL,
  quantity INTEGER DEFAULT 1,
  round_number INTEGER DEFAULT 1,
  sent_at TEXT,
  void_reason TEXT,
  parent_item_id TEXT
);

-- Sync metadata
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- Store: config_version, last_full_sync, last_delta_sync
```

### 13.6 Offline Detection & Mode Transitions

**Connectivity Check Logic:**
```javascript
class ConnectivityMonitor {
  private cloudConnected = true;
  private lastSuccessfulHeartbeat = Date.now();
  private missedHeartbeats = 0;
  
  async checkConnectivity() {
    try {
      await this.sendHeartbeat();
      this.missedHeartbeats = 0;
      this.lastSuccessfulHeartbeat = Date.now();
      
      if (!this.cloudConnected) {
        this.cloudConnected = true;
        this.emit('mode_change', 'online');
        this.startReplayQueue(); // Sync pending transactions
      }
    } catch (error) {
      this.missedHeartbeats++;
      
      // After 12 missed heartbeats (~3 min at 15s interval)
      if (this.missedHeartbeats >= 12 && this.cloudConnected) {
        this.cloudConnected = false;
        this.emit('mode_change', 'yellow'); // Offline mode
      }
    }
  }
  
  startHeartbeatLoop() {
    setInterval(() => this.checkConnectivity(), 15000);
  }
}
```

**Mode Behavior:**

| Mode | Cloud | LAN | Behavior |
|------|-------|-----|----------|
| Online (Green) | ✅ | ✅ | Normal operation, real-time sync |
| Yellow | ❌ | ✅ | Queue transactions, sync when restored |
| Red | ❌ | ❌ | Workstation standalone (Phase 3) |

### 13.7 Code Examples for Service Host

**Main Entry Point (index.ts):**
```typescript
import { loadConfig } from './config';
import { initDatabase } from './database';
import { CloudSync } from './sync/cloudSync';
import { CAPSService } from './services/caps';
import { PrintController } from './services/print';
import { startHttpServer } from './server';

async function main() {
  console.log('Starting Cloud POS Service Host...');
  
  // 1. Load configuration
  const config = await loadConfig('./config/property.json');
  
  // 2. Initialize encrypted SQLite database
  await initDatabase(config.encryptionKey);
  
  // 3. Authenticate with cloud
  const cloudSync = new CloudSync(config);
  await cloudSync.authenticate();
  
  // 4. Perform initial config sync
  await cloudSync.performFullSync();
  
  // 5. Start services
  const caps = new CAPSService();
  const print = new PrintController();
  
  // 6. Start HTTP server for workstation connections
  const server = startHttpServer({
    port: 8080,
    caps,
    print
  });
  
  // 7. Start WebSocket connection to cloud
  await cloudSync.connectWebSocket();
  
  // 8. Start heartbeat loop
  cloudSync.startHeartbeatLoop();
  
  console.log('Service Host ready on port 8080');
}

main().catch(console.error);
```

**Cloud Sync Module (sync/cloudSync.ts):**
```typescript
import axios from 'axios';
import WebSocket from 'ws';
import { db } from '../database';

export class CloudSync {
  private config: PropertyConfig;
  private accessToken: string | null = null;
  private ws: WebSocket | null = null;
  
  constructor(config: PropertyConfig) {
    this.config = config;
  }
  
  async authenticate(): Promise<void> {
    const response = await axios.post(
      `${this.config.cloudUrl}/api/service-hosts/authenticate`,
      {
        serviceHostId: this.config.serviceHostId,
        registrationToken: this.config.registrationToken,
        version: process.env.APP_VERSION || '1.0.0',
        hostname: require('os').hostname()
      }
    );
    
    this.accessToken = response.data.accessToken;
    console.log(`Authenticated with property: ${response.data.property.name}`);
  }
  
  async performFullSync(): Promise<void> {
    const response = await axios.get(
      `${this.config.cloudUrl}/api/sync/config/full`,
      {
        params: { propertyId: this.config.propertyId },
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
    
    const { configVersion, data } = response.data;
    
    // Store each table in SQLite
    await db.transaction(async (tx) => {
      await tx.delete('menu_items');
      for (const item of data.menuItems) {
        await tx.insert('menu_items', item);
      }
      // Repeat for all tables...
      
      // Store config version
      await tx.upsert('sync_metadata', {
        key: 'config_version',
        value: configVersion.toString()
      });
    });
    
    console.log(`Synced configuration version ${configVersion}`);
  }
  
  async postTransactions(transactions: Transaction[]): Promise<void> {
    try {
      await axios.post(
        `${this.config.cloudUrl}/api/sync/transactions`,
        {
          serviceHostId: this.config.serviceHostId,
          propertyId: this.config.propertyId,
          businessDate: new Date().toISOString().split('T')[0],
          transactions
        },
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
    } catch (error) {
      // Queue for later if offline
      for (const tx of transactions) {
        await db.insert('replay_queue', {
          id: generateUUID(),
          transaction_type: tx.type,
          payload: JSON.stringify(tx),
          status: 'pending',
          created_at: new Date().toISOString()
        });
      }
    }
  }
}
```

### 13.8 Workstation → Service Host API

Workstations connect to the Service Host on the LAN, not the cloud. The Service Host exposes these endpoints:

**Base URL:** `http://<service-host-ip>:8080`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/checks` | GET | List open checks |
| `/api/checks` | POST | Create new check |
| `/api/checks/:id` | GET | Get check details |
| `/api/checks/:id` | PATCH | Update check |
| `/api/checks/:id/items` | POST | Add items to check |
| `/api/checks/:id/send` | POST | Send items to KDS/kitchen |
| `/api/checks/:id/payments` | POST | Apply payment |
| `/api/checks/:id/close` | POST | Close check |
| `/api/menu` | GET | Get menu (from local cache) |
| `/api/employees/verify-pin` | POST | Verify employee PIN |
| `/api/time-clock/punch` | POST | Clock in/out |

---

## 14. Open Questions (Remaining)

1. **Time Synchronization**
   - All devices must have synced clocks
   - NTP server requirement?
   - What if Service Host clock drifts?

---

## Appendix A: Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Service Host (Windows) | Node.js + pkg | Reuse existing TypeScript code |
| Service Host (Android) | React Native (future) | Native performance, shared business logic |
| Local Database | SQLite + SQLCipher | Portable, encrypted, cross-platform |
| ORM | Drizzle ORM | Same as cloud, easy migration |
| Cloud Sync | WebSocket | Real-time bidirectional communication |
| Packaging | pkg (Node.js) | Single executable for Windows |
| UI | Electron (optional) | If local admin UI needed |

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **CAPS** | Check and Posting Service - manages check state and transactions |
| **CAL** | Client Application Loader - deployment package system |
| **Service Host** | On-premise server running CAPS and other services |
| **Yellow Mode** | Offline from cloud but LAN functioning |
| **Red Mode** | Complete isolation, workstation standalone |
| **Replay Queue** | Pending transactions waiting to sync to cloud |
| **Config Delta** | Changes to configuration since last sync |

---

*End of Phase 1 Specification Document*
