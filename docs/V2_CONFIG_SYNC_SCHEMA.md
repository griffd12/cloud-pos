# V2 Configuration Sync Schema

## Overview

This document defines the configuration data that flows from the Cloud EMC to Service Hosts, enabling offline-capable POS operations. The sync mechanism ensures Service Hosts have a complete, encrypted copy of all property-scoped configuration needed for autonomous operation.

## Sync Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLOUD EMC                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Configuration Database (PostgreSQL)                              │   │
│  │  - Enterprises, Properties, Revenue Centers                       │   │
│  │  - Menu System (SLUs, Items, Modifiers)                          │   │
│  │  - Employees, Roles, Privileges                                   │   │
│  │  - Tax, Tenders, Discounts, Service Charges                      │   │
│  │  - Device Configuration (Workstations, Printers, KDS)            │   │
│  │  - Service Host Registrations & Bindings                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Config Sync Service                                              │   │
│  │  - Full Sync Endpoint: /api/sync/config/full                     │   │
│  │  - Delta Sync Endpoint: /api/sync/config/delta?since={version}   │   │
│  │  - Push Notifications via WebSocket: /ws/service-host            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVICE HOST (On-Premise)                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Sync Manager                                                     │   │
│  │  - Heartbeat every 30 seconds                                    │   │
│  │  - Delta sync on config version change                           │   │
│  │  - Full sync on first boot or recovery                           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Local SQLite Cache (Encrypted)                                   │   │
│  │  - Property configuration snapshot                                │   │
│  │  - Offline transaction queue                                      │   │
│  │  - Check/payment state                                           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Service Controllers                                              │   │
│  │  - CAPS (Check & Posting Service)                                │   │
│  │  - Print Controller                                               │   │
│  │  - KDS Controller                                                 │   │
│  │  - Payment Controller                                             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              │ LAN (REST + WebSocket)
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         WORKSTATIONS (Browser)                           │
│  - POS UI connects to Service Host on local network                     │
│  - Never calls Cloud directly when Service Host is available            │
│  - Falls back to Cloud only if Service Host unreachable (GREEN mode)    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Configuration Entities

### Tier 1: Core Configuration (Required for POS Operation)

| Entity | Table | Scope | Sync Priority | Notes |
|--------|-------|-------|---------------|-------|
| Enterprise | `enterprises` | Parent context | HIGH | Brand/company info |
| Property | `properties` | Primary scope | HIGH | Location settings, business date |
| Revenue Centers | `rvcs` | Property | HIGH | Order types, DOM settings |
| Employees | `employees` | Property | HIGH | PIN auth, roles |
| Roles | `roles` | Property | HIGH | Privilege assignments |
| Privileges | `privileges` | Global | HIGH | Available privilege definitions |
| Job Codes | `job_codes` | Property | MEDIUM | Labor tracking |

### Tier 2: Menu System (Required for Order Taking)

| Entity | Table | Scope | Sync Priority | Notes |
|--------|-------|-------|---------------|-------|
| SLUs (Categories) | `slus` | Property | HIGH | Screen lookup units |
| Menu Items | `menu_items` | Property | HIGH | Products for sale |
| Modifier Groups | `modifier_groups` | Property | HIGH | Modifier containers |
| Modifiers | `modifiers` | Property | HIGH | Item modifications |
| Modifier Group Modifiers | `modifier_group_modifiers` | Property | HIGH | M-N relationship |
| Menu Item Modifier Groups | `menu_item_modifier_groups` | Property | HIGH | M-N relationship |

### Tier 3: Financial Configuration

| Entity | Table | Scope | Sync Priority | Notes |
|--------|-------|-------|---------------|-------|
| Tax Groups | `tax_groups` | Property | HIGH | Tax rates and rules |
| Tenders | `tenders` | Property | HIGH | Payment methods |
| Discounts | `discounts` | Property | MEDIUM | Discount definitions |
| Service Charges | `service_charges` | Property | MEDIUM | Auto-gratuity, fees |
| Payment Processors | N/A | Property | HIGH | Stripe/Elavon config (secrets handled separately) |

### Tier 4: Device Configuration

| Entity | Table | Scope | Sync Priority | Notes |
|--------|-------|-------|---------------|-------|
| Workstations | `workstations` | Property | HIGH | POS terminals |
| Printers | `printers` | Property | HIGH | Receipt/kitchen printers |
| KDS Devices | `kds_devices` | Property | HIGH | Kitchen displays |
| Print Classes | `print_classes` | Property | MEDIUM | Print routing rules |
| Order Devices | `order_devices` | Property | MEDIUM | Production routing |
| Print Class Routing | `print_class_routing` | Property | MEDIUM | RVC-specific routing |
| Order Device Printers | `order_device_printers` | Property | MEDIUM | Printer assignments |
| Order Device KDS | `order_device_kds` | Property | MEDIUM | KDS assignments |

### Tier 5: Service Host Configuration

| Entity | Table | Scope | Sync Priority | Notes |
|--------|-------|-------|---------------|-------|
| Service Hosts | `service_hosts` | Property | HIGH | Host registration |
| Workstation Service Bindings | `workstation_service_bindings` | Property | HIGH | Service assignments |
| Service Host Metrics | `service_host_metrics` | Property | LOW | Monitoring data |

### Tier 6: Extended Features (Optional Sync)

| Entity | Table | Scope | Sync Priority | Notes |
|--------|-------|-------|---------------|-------|
| Gift Cards | `gift_cards` | Enterprise/Property | MEDIUM | Balance lookups |
| Loyalty Programs | `loyalty_programs` | Enterprise | MEDIUM | Program definitions |
| Loyalty Members | `loyalty_members` | Enterprise | LOW | Customer records |
| Schedules | `schedules` | Property | LOW | Shift scheduling |
| Shifts | `shifts` | Property | LOW | Shift assignments |

## Sync Payload Schema

### Full Sync Response

```typescript
interface FullSyncPayload {
  version: number;                    // Config version number
  timestamp: string;                  // ISO timestamp of sync
  propertyId: string;                 // Target property
  
  // Tier 1: Core
  enterprise: Enterprise;
  property: Property;
  revenueCenters: RevenueCenter[];
  employees: Employee[];
  roles: Role[];
  privileges: Privilege[];
  jobCodes: JobCode[];
  
  // Tier 2: Menu
  slus: SLU[];
  menuItems: MenuItem[];
  modifierGroups: ModifierGroup[];
  modifiers: Modifier[];
  modifierGroupModifiers: ModifierGroupModifier[];
  menuItemModifierGroups: MenuItemModifierGroup[];
  
  // Tier 3: Financial
  taxGroups: TaxGroup[];
  tenders: Tender[];
  discounts: Discount[];
  serviceCharges: ServiceCharge[];
  
  // Tier 4: Devices
  workstations: Workstation[];
  printers: Printer[];
  kdsDevices: KDSDevice[];
  printClasses: PrintClass[];
  orderDevices: OrderDevice[];
  printClassRouting: PrintClassRouting[];
  orderDevicePrinters: OrderDevicePrinter[];
  orderDeviceKds: OrderDeviceKds[];
  
  // Tier 5: Service Host
  serviceHosts: ServiceHost[];
  workstationServiceBindings: WorkstationServiceBinding[];
  
  // Tier 6: Extended (optional based on feature flags)
  giftCards?: GiftCard[];
  loyaltyPrograms?: LoyaltyProgram[];
  loyaltyEnrollments?: LoyaltyEnrollment[];
}
```

### Delta Sync Response

```typescript
interface DeltaSyncPayload {
  fromVersion: number;                // Previous version
  toVersion: number;                  // Current version
  timestamp: string;                  // ISO timestamp
  propertyId: string;                 // Target property
  
  changes: ConfigChange[];            // List of changes since fromVersion
}

interface ConfigChange {
  id: string;                         // Change ID
  entityType: string;                 // Table name (e.g., "menu_items")
  entityId: string;                   // Record ID
  operation: "INSERT" | "UPDATE" | "DELETE";
  data?: Record<string, any>;         // New/updated data (null for DELETE)
  changedAt: string;                  // ISO timestamp
  changedBy?: string;                 // User who made change
}
```

## Sync Cadence

### Heartbeat Interval
- **Frequency**: Every 30 seconds
- **Purpose**: Report health metrics, check for config updates
- **Payload**: CPU, memory, disk, connection mode, pending transactions

### Delta Sync Trigger
- **Trigger**: Heartbeat response indicates new config version available
- **Behavior**: Service Host requests changes since its current version
- **Fallback**: Full sync if delta too large or version gap > 100

### Full Sync Trigger
- **On First Boot**: Service Host has no local cache
- **On Recovery**: After extended offline period (>24 hours)
- **On Version Mismatch**: Cloud version significantly ahead
- **On Admin Request**: Manual sync from EMC dashboard

### Push Notifications
- **Channel**: WebSocket `/ws/service-host`
- **Events**:
  - `config:updated` - New configuration available
  - `config:urgent` - Critical update (e.g., employee termination)
  - `sync:required` - Full sync needed

## Config Version Tracking

### Cloud Side (config_versions table)

```sql
CREATE TABLE config_versions (
  id UUID PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id),
  version INTEGER NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  operation VARCHAR(20) NOT NULL,  -- INSERT, UPDATE, DELETE
  data JSONB,
  changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES employees(id)
);

CREATE INDEX idx_config_versions_property_version 
  ON config_versions(property_id, version);
```

### Service Host Side (SQLite)

```sql
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY,
  property_id TEXT NOT NULL,
  last_sync_version INTEGER NOT NULL,
  last_sync_at TEXT NOT NULL,
  last_full_sync_at TEXT,
  sync_status TEXT DEFAULT 'synced'  -- synced, syncing, error
);
```

## Error Handling

### Sync Failures

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| Network timeout | Retry with exponential backoff | Max 5 retries, then alert |
| Invalid response | Log error, skip this sync | Try again on next heartbeat |
| Version conflict | Request full sync | Rebuild local cache |
| Partial failure | Rollback to previous state | Alert and retry |

### Conflict Resolution

When both Cloud and Service Host have changes (offline edits synced back):

1. **Cloud wins** for configuration data (EMC is source of truth)
2. **Service Host wins** for transaction data (offline orders are authoritative)
3. **Merge strategy** for check state (most recent wins with audit trail)

## Security Considerations

### Data Encryption
- **In Transit**: TLS 1.3 for all sync communications
- **At Rest**: SQLite database encrypted with AES-256
- **Key Management**: Encryption key derived from Service Host auth token

### Authentication
- **Service Host → Cloud**: Bearer token (SHA-256 hashed, stored in `service_hosts.authToken`)
- **Workstation → Service Host**: Device token with property scope

### Sensitive Data Handling
- **Employee PINs**: Synced as bcrypt hashes, never plaintext
- **Payment Credentials**: NOT synced; Service Host uses secure vault
- **API Keys**: NOT synced; referenced by ID only

## Implementation Checklist

### Cloud API Endpoints (Existing)
- [x] `GET /api/sync/config/full` - Full configuration sync
- [x] `GET /api/sync/config/delta?since={version}` - Delta sync
- [x] `POST /api/service-hosts/:id/heartbeat` - Heartbeat endpoint
- [x] WebSocket `/ws/service-host` - Push notifications

### Service Host Components (To Build)
- [ ] Sync Manager - Coordinates sync operations
- [ ] Local Cache - SQLite with encryption
- [ ] Config Loader - Populates service controllers from cache
- [ ] Version Tracker - Tracks sync state

### Config Version Tracking (To Build)
- [ ] Trigger functions to log config changes
- [ ] Delta query optimization
- [ ] Version compaction (merge old changes)

## Appendix: Entity Relationship Diagram

```
Enterprise (1) ──────────────────────┐
                                     │
Property (N) ◄───────────────────────┤
    │                                │
    ├── Revenue Centers (N)          │
    │       └── Print Class Routing  │
    │                                │
    ├── Employees (N) ◄──────────────┤
    │       └── Role (1)             │
    │                                │
    ├── Menu System                  │
    │       ├── SLUs (N)             │
    │       ├── Menu Items (N)       │
    │       ├── Modifier Groups (N)  │
    │       └── Modifiers (N)        │
    │                                │
    ├── Financial                    │
    │       ├── Tax Groups (N)       │
    │       ├── Tenders (N)          │
    │       ├── Discounts (N)        │
    │       └── Service Charges (N)  │
    │                                │
    ├── Devices                      │
    │       ├── Workstations (N) ◄───┼── Service Bindings
    │       ├── Printers (N)         │
    │       ├── KDS Devices (N)      │
    │       ├── Print Classes (N)    │
    │       └── Order Devices (N)    │
    │                                │
    └── Service Hosts (N) ◄──────────┘
            └── Workstation Bindings (N)
```
