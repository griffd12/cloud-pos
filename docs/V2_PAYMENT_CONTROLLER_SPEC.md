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

---

## Windows Service Implementation Specification

### Service Overview

The Payment Controller Windows Service is a .NET Windows Service application that:
1. Polls Cloud POS for pending terminal transactions
2. Communicates with physical EMV terminals via TCP/IP
3. Sends encrypted card data to Heartland Portico for authorization
4. Callbacks to Cloud POS with transaction results

### System Requirements

- **OS**: Windows 10/11 or Windows Server 2016+
- **.NET Runtime**: .NET 6.0 or later
- **Network**: TCP/IP access to terminals and Cloud POS
- **Dependencies**: GlobalPayments.Api NuGet package

### Directory Structure

```
C:\OPH-POS\
├── PaymentController\
│   ├── PaymentController.exe         # Main service executable
│   ├── PaymentController.exe.config  # Service configuration
│   ├── appsettings.json              # Runtime configuration
│   ├── logs\                         # Log files
│   │   ├── payment-controller.log
│   │   └── transactions\             # Transaction audit logs
│   └── data\
│       └── pending-transactions.db   # SQLite for offline queue
```

### Configuration File (appsettings.json)

```json
{
  "ServiceHost": {
    "Id": "svc-payment-001",
    "PropertyId": "prop-123",
    "Token": "sha256-hashed-token"
  },
  "CloudPOS": {
    "BaseUrl": "https://your-pos.replit.app",
    "CallbackUrl": "/api/payment-controller/callback",
    "StatusUrl": "/api/payment-controller/status",
    "PendingSessionsUrl": "/api/payment-controller/pending-sessions",
    "PollingIntervalMs": 1000,
    "TimeoutMs": 30000
  },
  "Heartland": {
    "Environment": "sandbox",
    "SiteId": "your-site-id",
    "LicenseId": "your-license-id",
    "DeviceId": "your-device-id",
    "Username": "your-username",
    "Password": "encrypted-password",
    "DeveloperId": "your-developer-id",
    "VersionNumber": "your-version"
  },
  "Terminals": [
    {
      "Id": "term-001",
      "Model": "verifone_t650c",
      "IpAddress": "192.168.1.100",
      "Port": 8081,
      "TimeoutMs": 60000
    }
  ],
  "Logging": {
    "Level": "Information",
    "RetentionDays": 30
  }
}
```

### Service Lifecycle

```csharp
// Program.cs - .NET 6 Worker Service
using Microsoft.Extensions.Hosting;

Host.CreateDefaultBuilder(args)
    .UseWindowsService(options =>
    {
        options.ServiceName = "CloudPOS Payment Controller";
    })
    .ConfigureServices((context, services) =>
    {
        services.AddHostedService<PaymentControllerWorker>();
        services.AddSingleton<ITerminalManager, HeartlandTerminalManager>();
        services.AddSingleton<ICloudPosClient, CloudPosHttpClient>();
    })
    .Build()
    .Run();
```

### Main Worker Loop

```csharp
// PaymentControllerWorker.cs
public class PaymentControllerWorker : BackgroundService
{
    private readonly ICloudPosClient _cloudPos;
    private readonly ITerminalManager _terminals;
    private readonly ILogger<PaymentControllerWorker> _logger;
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // 1. Poll for pending sessions
                var sessions = await _cloudPos.GetPendingSessionsAsync();
                
                foreach (var session in sessions)
                {
                    // 2. Find matching terminal
                    var terminal = _terminals.GetTerminal(session.TerminalId);
                    if (terminal == null)
                    {
                        _logger.LogWarning("Terminal {TerminalId} not found", session.TerminalId);
                        continue;
                    }
                    
                    // 3. Process transaction in background
                    _ = ProcessTransactionAsync(session, terminal, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error polling for sessions");
            }
            
            await Task.Delay(1000, stoppingToken); // Poll every 1 second
        }
    }
    
    private async Task ProcessTransactionAsync(
        PendingSession session, 
        ITerminal terminal,
        CancellationToken cancellationToken)
    {
        try
        {
            // Update status: connecting
            await _cloudPos.UpdateStatusAsync(session.SessionId, "pending", "Connecting to terminal");
            
            // Update status: awaiting card
            await _cloudPos.UpdateStatusAsync(session.SessionId, "awaiting_card", "Present card or tap to pay");
            
            // Execute transaction on terminal
            // NOTE: Cloud POS API returns amounts in CENTS (integer)
            // Heartland SDK expects amounts in DOLLARS (decimal)
            // Example: API returns 2550 cents = $25.50 for terminal
            var result = await terminal.ExecuteSaleAsync(
                amount: session.Amount / 100m, // Convert cents → dollars
                referenceNumber: session.SessionId
            );
            
            // Report result to Cloud POS
            if (result.IsApproved)
            {
                await _cloudPos.CallbackAsync(new TransactionCallback
                {
                    SessionId = session.SessionId,
                    Status = "approved",
                    AuthCode = result.AuthorizationCode,
                    CardBrand = result.CardType,
                    CardLast4 = result.CardLast4,
                    EntryMode = result.EntryMethod,
                    TransactionId = result.TransactionId,
                    ResponseCode = result.ResponseCode,
                    ResponseMessage = result.ResponseMessage
                });
            }
            else
            {
                await _cloudPos.CallbackAsync(new TransactionCallback
                {
                    SessionId = session.SessionId,
                    Status = "declined",
                    ResponseCode = result.ResponseCode,
                    ResponseMessage = result.ResponseMessage ?? "Card declined",
                    ErrorMessage = result.ErrorMessage
                });
            }
        }
        catch (OperationCanceledException)
        {
            await _cloudPos.CallbackAsync(new TransactionCallback
            {
                SessionId = session.SessionId,
                Status = "cancelled"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Transaction failed for session {SessionId}", session.SessionId);
            await _cloudPos.CallbackAsync(new TransactionCallback
            {
                SessionId = session.SessionId,
                Status = "error",
                ErrorMessage = ex.Message
            });
        }
    }
}
```

### Heartland Terminal Manager

```csharp
// HeartlandTerminalManager.cs
using GlobalPayments.Api;
using GlobalPayments.Api.Terminals;
using GlobalPayments.Api.Terminals.UPA;

public class HeartlandTerminalManager : ITerminalManager
{
    private readonly Dictionary<string, IDeviceInterface> _devices = new();
    private readonly HeartlandConfig _config;
    
    public HeartlandTerminalManager(IOptions<HeartlandConfig> config)
    {
        _config = config.Value;
        InitializeDevices();
    }
    
    private void InitializeDevices()
    {
        foreach (var terminalConfig in _config.Terminals)
        {
            var connectionConfig = new ConnectionConfig
            {
                DeviceType = GetDeviceType(terminalConfig.Model),
                ConnectionMode = ConnectionModes.TCP_IP,
                IpAddress = terminalConfig.IpAddress,
                Port = terminalConfig.Port.ToString(),
                Timeout = terminalConfig.TimeoutMs,
                RequestIdProvider = new RandomIdProvider()
            };
            
            var device = DeviceService.Create(connectionConfig);
            _devices[terminalConfig.Id] = device;
        }
    }
    
    private DeviceType GetDeviceType(string model) => model switch
    {
        "verifone_t650c" => DeviceType.UPA_VERIFONE_T650C,
        "verifone_t650p" => DeviceType.UPA_VERIFONE_T650P,
        "verifone_p630" => DeviceType.UPA_VERIFONE_P630,
        "pax_a35" => DeviceType.UPA_PAX_A35,
        "pax_a77" => DeviceType.UPA_PAX_A77,
        _ => throw new NotSupportedException($"Unknown terminal model: {model}")
    };
    
    public ITerminal GetTerminal(string terminalId)
    {
        return _devices.TryGetValue(terminalId, out var device)
            ? new HeartlandTerminal(device)
            : null;
    }
}

public class HeartlandTerminal : ITerminal
{
    private readonly IDeviceInterface _device;
    
    public HeartlandTerminal(IDeviceInterface device) => _device = device;
    
    public async Task<TransactionResult> ExecuteSaleAsync(decimal amount, string referenceNumber)
    {
        try
        {
            var response = await _device.CreditSale(amount)
                .WithReferenceNumber(referenceNumber)
                .ExecuteAsync();
            
            return new TransactionResult
            {
                IsApproved = response.Status == "Success",
                AuthorizationCode = response.AuthorizationCode,
                TransactionId = response.TransactionId,
                CardType = response.CardType,
                CardLast4 = response.CardLast4,
                EntryMethod = response.EntryMethod,
                ResponseCode = response.ResponseCode,
                ResponseMessage = response.ResponseText
            };
        }
        catch (ApiException ex)
        {
            return new TransactionResult
            {
                IsApproved = false,
                ResponseCode = ex.ResponseCode,
                ErrorMessage = ex.Message
            };
        }
    }
    
    public async Task<TransactionResult> ExecuteAuthAsync(decimal amount, string referenceNumber)
    {
        var response = await _device.CreditAuth(amount)
            .WithReferenceNumber(referenceNumber)
            .ExecuteAsync();
        
        return MapResponse(response);
    }
    
    public async Task<TransactionResult> CaptureAsync(string transactionId, decimal amount)
    {
        var response = await _device.Capture(amount)
            .WithTransactionId(transactionId)
            .ExecuteAsync();
        
        return MapResponse(response);
    }
    
    public async Task<TransactionResult> VoidAsync(string transactionId)
    {
        var response = await _device.Void()
            .WithTransactionId(transactionId)
            .ExecuteAsync();
        
        return MapResponse(response);
    }
    
    public async Task<TransactionResult> RefundAsync(string transactionId, decimal amount)
    {
        var response = await _device.CreditReturn(amount)
            .WithTransactionId(transactionId)
            .ExecuteAsync();
        
        return MapResponse(response);
    }
    
    public async Task<TransactionResult> TipAdjustAsync(string transactionId, decimal tipAmount)
    {
        var response = await _device.TipAdjust(tipAmount)
            .WithTransactionId(transactionId)
            .ExecuteAsync();
        
        return MapResponse(response);
    }
    
    private TransactionResult MapResponse(IDeviceResponse response) => new()
    {
        IsApproved = response.Status == "Success",
        AuthorizationCode = response.AuthorizationCode,
        TransactionId = response.TransactionId,
        CardType = response.CardType,
        CardLast4 = response.CardLast4,
        EntryMethod = response.EntryMethod,
        ResponseCode = response.ResponseCode,
        ResponseMessage = response.ResponseText
    };
}
```

### Cloud POS HTTP Client

```csharp
// CloudPosHttpClient.cs
public class CloudPosHttpClient : ICloudPosClient
{
    private readonly HttpClient _http;
    private readonly ServiceHostConfig _serviceHost;
    private readonly CloudPosConfig _config;
    
    public CloudPosHttpClient(
        IOptions<ServiceHostConfig> serviceHostConfig,
        IOptions<CloudPosConfig> cloudPosConfig)
    {
        _serviceHost = serviceHostConfig.Value;
        _config = cloudPosConfig.Value;
        _http = new HttpClient
        {
            BaseAddress = new Uri(_config.BaseUrl),
            Timeout = TimeSpan.FromMilliseconds(_config.TimeoutMs)
        };
    }
    
    public async Task<List<PendingSession>> GetPendingSessionsAsync()
    {
        // Include serviceHostId and propertyId for host-level scoping
        var url = $"{_config.PendingSessionsUrl}?serviceHostId={_serviceHost.Id}&propertyId={_serviceHost.PropertyId}";
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("X-Service-Token", _serviceHost.Token);
        
        var response = await _http.SendAsync(request);
        response.EnsureSuccessStatusCode();
        
        var result = await response.Content.ReadFromJsonAsync<PendingSessionsResponse>();
        return result?.Sessions ?? new List<PendingSession>();
    }
    
    public async Task UpdateStatusAsync(string sessionId, string status, string message = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, _config.StatusUrl);
        request.Headers.Add("X-Service-Token", _serviceHost.Token);
        request.Content = JsonContent.Create(new
        {
            sessionId,          // Cloud POS session ID
            referenceId = sessionId, // Alternative field per spec
            status,
            statusMessage = message
        });
        
        await _http.SendAsync(request);
    }
    
    public async Task CallbackAsync(TransactionCallback callback)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, _config.CallbackUrl);
        request.Headers.Add("X-Service-Token", _serviceHost.Token);
        
        // Ensure referenceId is set for spec compliance
        callback.ReferenceId ??= callback.SessionId;
        request.Content = JsonContent.Create(callback);
        
        var response = await _http.SendAsync(request);
        response.EnsureSuccessStatusCode();
    }
}

// Configuration classes
public class ServiceHostConfig
{
    public string Id { get; set; }       // Service host unique ID
    public string PropertyId { get; set; } // Property this host serves
    public string Token { get; set; }     // SHA-256 hashed service token
}

public class CloudPosConfig
{
    public string BaseUrl { get; set; }
    public string CallbackUrl { get; set; }
    public string StatusUrl { get; set; }
    public string PendingSessionsUrl { get; set; }
    public int PollingIntervalMs { get; set; }
    public int TimeoutMs { get; set; }
}

public class TransactionCallback
{
    public string SessionId { get; set; }    // Primary session identifier
    public string ReferenceId { get; set; }  // Alternative per spec
    public string Status { get; set; }       // approved, declined, error, cancelled
    public string AuthCode { get; set; }
    public string CardBrand { get; set; }
    public string CardLast4 { get; set; }
    public string EntryMode { get; set; }    // chip, contactless, swipe
    public string TransactionId { get; set; } // Gateway transaction ID
    public string ResponseCode { get; set; }
    public string ResponseMessage { get; set; }
    public string ErrorMessage { get; set; }
    public int? TipAmount { get; set; }      // In cents
}
```

### Installation Script (PowerShell)

```powershell
# install-payment-controller.ps1
param(
    [string]$CloudPosUrl = "https://your-pos.replit.app",
    [string]$ServiceToken = "",
    [string]$PropertyId = ""
)

$ServiceName = "CloudPOS Payment Controller"
$InstallPath = "C:\OPH-POS\PaymentController"

# Create directory structure
New-Item -ItemType Directory -Force -Path $InstallPath
New-Item -ItemType Directory -Force -Path "$InstallPath\logs"
New-Item -ItemType Directory -Force -Path "$InstallPath\logs\transactions"
New-Item -ItemType Directory -Force -Path "$InstallPath\data"

# Copy files
Copy-Item ".\publish\*" -Destination $InstallPath -Recurse

# Generate configuration
$config = @{
    ServiceHost = @{
        Id = "svc-payment-$(Get-Random -Maximum 9999)"
        PropertyId = $PropertyId
        Token = $ServiceToken
    }
    CloudPOS = @{
        BaseUrl = $CloudPosUrl
        CallbackUrl = "/api/payment-controller/callback"
        StatusUrl = "/api/payment-controller/status"
        PendingSessionsUrl = "/api/payment-controller/pending-sessions"
        PollingIntervalMs = 1000
        TimeoutMs = 30000
    }
    Heartland = @{
        Environment = "sandbox"
    }
    Terminals = @()
    Logging = @{
        Level = "Information"
        RetentionDays = 30
    }
} | ConvertTo-Json -Depth 10

$config | Out-File "$InstallPath\appsettings.json" -Encoding UTF8

# Install as Windows Service
New-Service -Name $ServiceName `
    -BinaryPathName "$InstallPath\PaymentController.exe" `
    -DisplayName "CloudPOS Payment Controller" `
    -Description "Semi-integrated EMV terminal payment processing for Cloud POS" `
    -StartupType Automatic

# Start service
Start-Service -Name $ServiceName

Write-Host "Payment Controller installed successfully!"
Write-Host "Service Status: $((Get-Service $ServiceName).Status)"
```

### Logging and Monitoring

The Payment Controller logs all transactions and events:

```
[2026-01-28 10:15:32.123] [INFO] Service starting...
[2026-01-28 10:15:32.456] [INFO] Connected to Cloud POS: https://your-pos.replit.app
[2026-01-28 10:15:33.001] [INFO] Terminal verifone_t650c (192.168.1.100) connected
[2026-01-28 10:15:45.123] [INFO] Received pending session: sess-abc123, $25.50
[2026-01-28 10:15:45.234] [INFO] Sending to terminal: verifone_t650c
[2026-01-28 10:15:45.345] [INFO] Status: awaiting_card
[2026-01-28 10:15:52.456] [INFO] Card presented: VISA ****4242 (contactless)
[2026-01-28 10:15:53.567] [INFO] Transaction APPROVED: Auth 123456
[2026-01-28 10:15:53.678] [INFO] Callback sent to Cloud POS
```

### Health Check Endpoint

The service exposes a local health check endpoint:

```
GET http://localhost:8090/health

Response:
{
  "status": "healthy",
  "uptime": "2h 15m 30s",
  "terminals": {
    "term-001": "online",
    "term-002": "offline"
  },
  "cloudPosConnected": true,
  "lastPollTime": "2026-01-28T10:15:45.123Z",
  "pendingTransactions": 0,
  "completedToday": 47
}
```

---

## Testing and Certification

### Sandbox Testing

1. Configure Heartland sandbox credentials in appsettings.json
2. Use test card numbers from Heartland documentation
3. Verify all transaction types: sale, auth, capture, void, refund, tip adjust

### Heartland Test Card Numbers

| Card Type | Number | Response |
|-----------|--------|----------|
| Visa Approve | 4012002000060016 | Approved |
| Visa Decline | 4012002000088881 | Declined |
| Mastercard | 5473500000000014 | Approved |
| Amex | 371449635398431 | Approved |
| Discover | 6011000990156527 | Approved |

### Certification Process

1. Complete Heartland semi-integrated certification questionnaire
2. Run prescribed test transaction suite
3. Submit transaction logs for review
4. Receive production credentials upon approval
