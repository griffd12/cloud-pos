# Payment Controller Specification

## Overview

The Payment Controller is a semi-integrated payment processing service that enables EMV terminal communication for the Cloud POS system. It acts as a bridge between the Cloud POS (browser-based) and physical EMV terminals (Verifone, PAX, Ingenico) using processor-specific SDKs (Heartland, Elavon, etc.).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Cloud POS (Browser)                           │
│  ┌──────────────┐    ┌─────────────────┐    ┌────────────────────────┐  │
│  │ Payment Modal │───▶│ Terminal Session │───▶│ WebSocket Status Updates│ │
│  └──────────────┘    └─────────────────┘    └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ REST API
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cloud POS Server (Node.js)                        │
│  ┌─────────────────────┐    ┌──────────────────┐    ┌────────────────┐  │
│  │ /api/terminal-sessions│───▶│ Terminal Session  │───▶│ WebSocket Broadcast│ │
│  └─────────────────────┘    │ Management       │    └────────────────┘  │
│                             └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ REST API (via CAPS host)
┌─────────────────────────────────────────────────────────────────────────┐
│                  Payment Controller Service (.NET/Windows)               │
│  ┌──────────────────┐    ┌─────────────────┐    ┌───────────────────┐   │
│  │ REST API Handler │───▶│ Processor Adapter│───▶│ Terminal SDK       │  │
│  │ (HTTP Server)    │    │ (Heartland/Elavon)│   │ (TCP/IP to device) │  │
│  └──────────────────┘    └─────────────────┘    └───────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ TCP/IP
┌─────────────────────────────────────────────────────────────────────────┐
│                          EMV Terminal Device                             │
│  ┌──────────────┐    ┌────────────────┐    ┌──────────────────────┐    │
│  │ Card Reader   │───▶│ EMV Chip/NFC    │───▶│ P2PE Encryption      │    │
│  │ (Insert/Tap)  │    │ Processing      │    │ (Card data secured)  │    │
│  └──────────────┘    └────────────────┘    └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Encrypted (P2PE)
┌─────────────────────────────────────────────────────────────────────────┐
│                     Payment Processor (Heartland Portico)                │
│  ┌──────────────┐    ┌────────────────┐    ┌──────────────────────┐    │
│  │ Decryption   │───▶│ Authorization   │───▶│ Response to Terminal  │   │
│  │ (HSM)        │    │ Network         │    │ (Approved/Declined)   │   │
│  └──────────────┘    └────────────────┘    └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Benefits

1. **PCI Out-of-Scope**: Card data flows directly from terminal to processor, never touches POS
2. **EMV Chip Support**: Reduces chargebacks and fraud via chip card authentication
3. **Contactless/NFC**: Apple Pay, Google Pay, tap-to-pay support
4. **Tip Adjust**: Capture with modified amount for restaurant tip workflows

## Supported Terminals

### Heartland Pay App (Semi-Integrated)
| Model | Device Type | Connection | Notes |
|-------|-------------|------------|-------|
| Verifone Trinity T650c | `verifone_t650c` | Ethernet/USB | Countertop, touchscreen |
| Verifone Trinity T650p | `verifone_t650p` | Ethernet/USB/WiFi | Portable, handheld |
| Verifone Trinity P630 | `verifone_p630` | Ethernet/USB | Countertop with keypad |
| PAX A35 | `pax_a35` | Ethernet/WiFi/USB | Android, 4" touchscreen |
| PAX A77 | `pax_a77` | WiFi/4G/Bluetooth | Mobile, 5.5" touchscreen |

### Heartland OPI (Oracle Payment Interface for Simphony/Micros)
| Model | Device Type | Connection | Notes |
|-------|-------------|------------|-------|
| Ingenico iPP 350 | `ingenico_ipp350` | Ethernet/USB | Legacy, still supported |
| Ingenico iSC Touch 250 | `ingenico_isc_touch_250` | Ethernet/USB | 4.3" touchscreen |
| Ingenico Lane 3000 | `ingenico_lane_3000` | Ethernet/WiFi/USB | Compact |
| Ingenico Lane 5000 | `ingenico_lane_5000` | Ethernet/USB | 3.5" touchscreen |

## REST API Contract

### Base URL
The Payment Controller runs on the CAPS host and exposes a local REST API:
```
http://{caps-host}:8090/api/v1
```

### Authentication
All requests require the Service Host Token in the `X-Service-Token` header:
```
X-Service-Token: {service_host_token}
```

---

### 1. Device Status

**GET** `/api/v1/devices`

Returns all connected terminal devices and their current status.

**Response:**
```json
{
  "devices": [
    {
      "deviceId": "term-001",
      "model": "verifone_t650c",
      "serialNumber": "V123456789",
      "ipAddress": "192.168.1.100",
      "port": 8081,
      "status": "online",
      "lastHeartbeat": "2026-01-28T06:00:00Z",
      "firmwareVersion": "1.2.3",
      "capabilities": {
        "chip": true,
        "contactless": true,
        "swipe": true,
        "pinDebit": true,
        "cashback": false
      }
    }
  ]
}
```

---

### 2. Initiate Sale

**POST** `/api/v1/transactions/sale`

Initiates a credit card sale on the specified terminal. The terminal will prompt for card insertion/tap.

**Request:**
```json
{
  "deviceId": "term-001",
  "amount": 1250,
  "tipAmount": 0,
  "currency": "USD",
  "referenceId": "session-abc123",
  "metadata": {
    "checkId": "check-uuid",
    "checkNumber": 42,
    "employeeId": "emp-uuid",
    "employeeName": "John Doe"
  }
}
```

**Response (Immediate):**
```json
{
  "transactionId": "txn-uuid",
  "status": "awaiting_card",
  "message": "Insert, tap, or swipe card",
  "deviceId": "term-001",
  "startedAt": "2026-01-28T06:30:00Z",
  "expiresAt": "2026-01-28T06:32:00Z"
}
```

**Callback (Webhook to Cloud POS):**
```json
{
  "event": "transaction_complete",
  "transactionId": "txn-uuid",
  "referenceId": "session-abc123",
  "status": "approved",
  "authCode": "123456",
  "cardBrand": "visa",
  "cardLast4": "4242",
  "entryMode": "chip",
  "amount": 1250,
  "tipAmount": 0,
  "gatewayTransactionId": "HPS-12345678",
  "completedAt": "2026-01-28T06:30:45Z"
}
```

---

### 3. Initiate Auth (Pre-Authorization)

**POST** `/api/v1/transactions/auth`

Pre-authorizes an amount without capturing. Used for full-service restaurant flow.

**Request:**
```json
{
  "deviceId": "term-001",
  "amount": 5000,
  "currency": "USD",
  "referenceId": "session-abc123"
}
```

**Response:**
```json
{
  "transactionId": "txn-uuid",
  "status": "awaiting_card",
  "message": "Insert, tap, or swipe card"
}
```

---

### 4. Capture with Tip

**POST** `/api/v1/transactions/{transactionId}/capture`

Captures a pre-authorized transaction with an optional tip amount.

**Request:**
```json
{
  "amount": 5000,
  "tipAmount": 750
}
```

**Response:**
```json
{
  "transactionId": "txn-uuid",
  "status": "captured",
  "authCode": "123456",
  "captureAmount": 5750,
  "tipAmount": 750,
  "gatewayTransactionId": "HPS-12345678"
}
```

---

### 5. Void Transaction

**POST** `/api/v1/transactions/{transactionId}/void`

Voids a transaction before batch settlement.

**Request:**
```json
{
  "reason": "Customer changed mind"
}
```

**Response:**
```json
{
  "transactionId": "txn-uuid",
  "status": "voided",
  "voidedAt": "2026-01-28T07:00:00Z"
}
```

---

### 6. Refund

**POST** `/api/v1/transactions/refund`

Processes a refund (after batch settlement) or linked refund.

**Request:**
```json
{
  "deviceId": "term-001",
  "amount": 1250,
  "originalTransactionId": "txn-original-uuid",
  "referenceId": "refund-session-123"
}
```

**Response:**
```json
{
  "transactionId": "txn-refund-uuid",
  "status": "approved",
  "authCode": "654321",
  "amount": 1250,
  "gatewayTransactionId": "HPS-87654321"
}
```

---

### 7. Cancel Pending Transaction

**POST** `/api/v1/transactions/{transactionId}/cancel`

Cancels a pending transaction (e.g., customer walked away).

**Response:**
```json
{
  "transactionId": "txn-uuid",
  "status": "cancelled",
  "message": "Transaction cancelled by POS"
}
```

---

### 8. Device Ping/Health

**GET** `/api/v1/devices/{deviceId}/ping`

Tests connectivity to a specific terminal.

**Response:**
```json
{
  "deviceId": "term-001",
  "status": "online",
  "latencyMs": 45,
  "firmwareVersion": "1.2.3"
}
```

---

## WebSocket Events

The Cloud POS server broadcasts terminal session status updates via WebSocket:

**Channel:** `terminal-session:{sessionId}`

**Events:**
```json
{ "event": "status_change", "status": "awaiting_card", "message": "Insert, tap, or swipe card" }
{ "event": "status_change", "status": "card_inserted", "message": "Reading card..." }
{ "event": "status_change", "status": "processing", "message": "Processing payment..." }
{ "event": "status_change", "status": "approved", "message": "Payment approved", "authCode": "123456" }
{ "event": "status_change", "status": "declined", "message": "Card declined", "reason": "Insufficient funds" }
{ "event": "status_change", "status": "cancelled", "message": "Transaction cancelled" }
{ "event": "status_change", "status": "timeout", "message": "Session timed out" }
{ "event": "status_change", "status": "error", "message": "Terminal communication error" }
```

---

## EMC Configuration

### Terminal Device Configuration (EMC > Devices > Terminal Devices)

| Field | Type | Description |
|-------|------|-------------|
| Name | string | Display name (e.g., "Bar Terminal 1") |
| Property | reference | Property this terminal belongs to |
| Workstation | reference | Workstation this terminal is paired with |
| Payment Processor | reference | Processor for this terminal (Heartland, Elavon, etc.) |
| Model | enum | Terminal model (see TERMINAL_MODELS) |
| Serial Number | string | Physical device serial number |
| Terminal ID | string | Processor-assigned terminal ID |
| Connection Type | enum | ethernet, wifi, usb, bluetooth, cloud |
| Network Address | string | IP address or hostname |
| Port | integer | TCP port (default: 8081 for Heartland) |
| Status | enum | online, offline, busy, error, maintenance |
| Capabilities | json | { contactless, chip, swipe, pinDebit, cashback } |

### Payment Controller Host Configuration (EMC > Services > Payment Controllers)

| Field | Type | Description |
|-------|------|-------------|
| Property | reference | Property this controller serves |
| Host Workstation | reference | PC running the Payment Controller service |
| API Port | integer | Port the Payment Controller listens on (default: 8090) |
| Callback URL | string | Cloud POS URL for transaction callbacks |
| Status | enum | online, offline, error |

---

## Heartland SDK Integration Notes

### SDK Options
- **.NET SDK**: `GlobalPayments.Api` NuGet package - **Recommended for Windows**
- **Java SDK**: Maven `com.globalpayments:globalpayments-api`
- **PHP SDK**: Composer `globalpayments/php-sdk`
- **Python SDK**: pip `globalpayments`

### Connection Configuration (C#/.NET Example)
```csharp
using GlobalPayments.Api;
using GlobalPayments.Api.Terminals;
using GlobalPayments.Api.Terminals.UPA;

var config = new ConnectionConfig {
    DeviceType = DeviceType.UPA_VERIFONE_T650P,
    ConnectionMode = ConnectionModes.TCP_IP,
    IpAddress = "192.168.1.100",
    Port = "8081",
    Timeout = 30000,
    RequestIdProvider = new RandomIdProvider()
};

var device = DeviceService.Create(config);
```

### Credit Sale Example
```csharp
var response = await device.CreditSale(12.50m)
    .WithReferenceNumber("check-123")
    .ExecuteAsync();

if (response.Status == "Success") {
    var authCode = response.AuthorizationCode;
    var cardLast4 = response.CardLast4;
    var transactionId = response.TransactionId;
}
```

### Tip Adjust Example
```csharp
var response = await device.TipAdjust(2.50m)
    .WithTransactionId(originalTransactionId)
    .ExecuteAsync();
```

---

## Security Considerations

1. **PCI DSS Scope**: Payment Controller is in-scope for PCI as it communicates with terminals
2. **P2PE**: Terminal encrypts card data at point of entry, decrypted only at processor HSM
3. **Service Token**: All API calls authenticated via service host token
4. **Network Isolation**: Payment Controller should be on isolated VLAN if possible
5. **TLS**: All communication between Cloud POS and Payment Controller uses HTTPS

---

## Error Codes

| Code | Description |
|------|-------------|
| `DEVICE_OFFLINE` | Terminal device is not responding |
| `DEVICE_BUSY` | Terminal is processing another transaction |
| `SESSION_EXPIRED` | Transaction session timed out |
| `CARD_DECLINED` | Card was declined by issuer |
| `CARD_BLOCKED` | Card is blocked or restricted |
| `INSUFFICIENT_FUNDS` | Not enough funds available |
| `INVALID_CARD` | Card number or data invalid |
| `PROCESSOR_ERROR` | Gateway returned an error |
| `NETWORK_ERROR` | Communication failure with processor |
| `CANCELLED` | Transaction cancelled by POS or customer |

---

## Implementation Phases

### Phase 1: Cloud POS Integration (Current)
- Terminal session management in Cloud POS
- WebSocket status updates to payment modal
- EMC terminal device configuration
- Simulated terminal responses for testing

### Phase 2: Payment Controller Service
- Windows service with .NET Heartland SDK
- REST API implementation
- Callback mechanism to Cloud POS
- Device status monitoring

### Phase 3: Certification
- Heartland semi-integrated certification
- Test transaction suite
- Production credentials

### Phase 4: Multi-Processor Support
- Elavon Converge/Fusebox integration
- Processor adapter pattern
- Unified API across gateways
