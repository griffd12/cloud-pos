# Cloud POS Stress Test Guide

## Overview

The stress test infrastructure simulates real POS transactions to measure system performance under load. It creates actual checks through the full transaction lifecycle (open check, add items, send to kitchen, tender payment) while keeping all test data completely isolated from real sales reports and fiscal totals.

All test transactions are flagged with `testMode=true` and are automatically excluded from:
- Sales Summary reports
- Fiscal Period totals
- Open Checks reports
- Menu Item Sales reports
- Category Sales reports

## Prerequisites

Before running a stress test, you need three pieces of information from your system:

| Parameter | Description | Where to Find |
|-----------|-------------|---------------|
| **rvcId** | The Revenue Center to run transactions against | EMC > Properties > Revenue Centers |
| **employeeId** | The employee who will "ring" the test transactions | EMC > Employees |
| **tenderId** | The tender type used to pay (usually Cash) | EMC > Tenders |

You can look these up via the API:
```bash
# List Revenue Centers
curl http://localhost:5000/api/rvcs

# List Employees
curl http://localhost:5000/api/employees

# List Tenders
curl http://localhost:5000/api/tenders
```

## API Endpoints

### 1. Start a Stress Test

**POST** `/api/stress-test/start`

Starts a new stress test. Only one test can run at a time.

**Request Body:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `rvcId` | string | *(required)* | Revenue Center ID |
| `employeeId` | string | *(required)* | Employee ID for the transactions |
| `tenderId` | string | *(required)* | Tender ID for payments (e.g., Cash) |
| `durationMinutes` | number | `5` | How long to run the test |
| `targetTxPerMinute` | number | `10` | Target transactions per minute |
| `patterns` | string[] | `["single","double","triple"]` | Item count patterns per transaction |

**Patterns explained:**
- `"single"` = 1 random menu item per check
- `"double"` = 2 random menu items per check
- `"triple"` = 3 random menu items per check

The system randomly picks from the provided patterns for each transaction.

**Example - Quick 1-minute test:**
```bash
curl -X POST http://localhost:5000/api/stress-test/start \
  -H "Content-Type: application/json" \
  -d '{
    "rvcId": "YOUR_RVC_ID",
    "employeeId": "YOUR_EMPLOYEE_ID",
    "tenderId": "YOUR_TENDER_ID",
    "durationMinutes": 1,
    "targetTxPerMinute": 10,
    "patterns": ["single"]
  }'
```

**Example - 15-minute load test with mixed orders:**
```bash
curl -X POST http://localhost:5000/api/stress-test/start \
  -H "Content-Type: application/json" \
  -d '{
    "rvcId": "YOUR_RVC_ID",
    "employeeId": "YOUR_EMPLOYEE_ID",
    "tenderId": "YOUR_TENDER_ID",
    "durationMinutes": 15,
    "targetTxPerMinute": 30,
    "patterns": ["single", "double", "triple"]
  }'
```

**Response:**
```json
{
  "message": "Stress test started",
  "config": {
    "rvcId": "...",
    "durationMinutes": 15,
    "targetTxPerMinute": 30,
    "patterns": ["single", "double", "triple"]
  }
}
```

---

### 2. Check Status / View Metrics

**GET** `/api/stress-test/status`

Returns real-time metrics for the current or most recent test.

```bash
curl http://localhost:5000/api/stress-test/status
```

**Response:**
```json
{
  "status": "running",
  "startedAt": "2026-02-13T07:46:07.377Z",
  "elapsedSeconds": 120,
  "totalTransactions": 38,
  "successfulTransactions": 37,
  "failedTransactions": 1,
  "avgTransactionMs": 116,
  "minTransactionMs": 73,
  "maxTransactionMs": 221,
  "transactionsPerMinute": 18.5,
  "intervals": [
    { "minuteMark": 1, "txCount": 18, "txPerMinute": 18.0, "avgMs": 110 }
  ],
  "errors": ["Payment failed: 500"]
}
```

**Metrics explained:**

| Field | Description |
|-------|-------------|
| `status` | `running`, `completed`, `stopped`, or `error` |
| `elapsedSeconds` | Time since test started |
| `totalTransactions` | Total attempted transactions |
| `successfulTransactions` | Transactions completed successfully |
| `failedTransactions` | Transactions that encountered errors |
| `avgTransactionMs` | Average time per successful transaction (milliseconds) |
| `minTransactionMs` | Fastest transaction |
| `maxTransactionMs` | Slowest transaction |
| `transactionsPerMinute` | Overall throughput rate |
| `intervals` | Performance snapshots at 1, 5, 10, and 15 minute marks |
| `errors` | Last 10 error messages (if any) |

---

### 3. Stop a Running Test

**POST** `/api/stress-test/stop`

Stops the currently running test immediately and returns final metrics.

```bash
curl -X POST http://localhost:5000/api/stress-test/stop
```

**Response:**
```json
{
  "message": "Stress test stopped",
  "metrics": { ... }
}
```

---

### 4. Clean Up Test Data

**POST** `/api/stress-test/cleanup`

Deletes ALL test transaction data from the database. This removes:
- Test checks (where `test_mode = true`)
- Check items belonging to test checks
- Rounds belonging to test checks
- Payments belonging to test checks
- KDS tickets and ticket items belonging to test checks

```bash
curl -X POST http://localhost:5000/api/stress-test/cleanup
```

**Response:**
```json
{
  "message": "Test data cleaned up",
  "deletedChecks": 150,
  "deletedItems": 312,
  "deletedPayments": 150,
  "deletedKdsTickets": 150
}
```

**Important:** Always run cleanup after you're done analyzing results. While test data won't appear in reports, cleaning it up keeps the database lean.

---

## Typical Workflow

### Step 1: Start the test
```bash
curl -X POST http://localhost:5000/api/stress-test/start \
  -H "Content-Type: application/json" \
  -d '{
    "rvcId": "cb11526a-3828-4eae-aadc-09d62e4e9c45",
    "employeeId": "9da5a5fa-1d49-43c6-98ba-3985ce556967",
    "tenderId": "910dee0c-f5a6-4a80-acbd-5254dab1207e",
    "durationMinutes": 5,
    "targetTxPerMinute": 20,
    "patterns": ["single", "double", "triple"]
  }'
```

### Step 2: Monitor progress (poll periodically)
```bash
curl http://localhost:5000/api/stress-test/status
```

### Step 3: Stop early if needed
```bash
curl -X POST http://localhost:5000/api/stress-test/stop
```

### Step 4: Review final metrics
```bash
curl http://localhost:5000/api/stress-test/status
```

### Step 5: Clean up test data
```bash
curl -X POST http://localhost:5000/api/stress-test/cleanup
```

---

## What Each Transaction Does

Each simulated transaction follows the full POS lifecycle:

1. **Create Check** - Opens a new check in the specified RVC with `testMode=true`
2. **Add Items** - Adds 1-3 random menu items (based on pattern) from the active menu
3. **Send to Kitchen** - Sends the order, which creates rounds and KDS tickets
4. **Retrieve Check Total** - Fetches the updated check with calculated totals
5. **Apply Payment** - Pays the full amount using the specified tender
6. **Auto-Close** - The check closes automatically when fully paid

This exercises the same code paths as real POS operations, making the results representative of actual system performance.

---

## Understanding the Results

### Transaction Time (avgTransactionMs)
- **< 100ms** - Excellent performance
- **100-200ms** - Good performance
- **200-500ms** - Acceptable, may indicate load
- **> 500ms** - Investigate potential bottlenecks

### Throughput (transactionsPerMinute)
Compare against your `targetTxPerMinute`. If actual throughput is significantly lower than the target, the system may be reaching capacity.

### Interval Metrics
The `intervals` array shows performance at the 1, 5, 10, and 15 minute marks. Look for:
- **Degradation over time** - avgMs increasing at later intervals suggests resource exhaustion
- **Consistent performance** - Similar avgMs across intervals indicates stable operation

### Error Rate
Any `failedTransactions > 0` should be investigated. Check the `errors` array for specific failure messages.

---

## Tips and Best Practices

1. **Start small** - Begin with a 1-minute test at 5-10 tx/min to verify everything works before running longer tests.

2. **Increase gradually** - Ramp up `targetTxPerMinute` in increments (10, 20, 30, 50) to find where performance degrades.

3. **Use realistic patterns** - If your typical order has 2-3 items, use `["double", "triple"]` patterns.

4. **Monitor the server** - Watch CPU, memory, and database connections during the test for bottleneck identification.

5. **Clean up between tests** - Always run cleanup before starting a new test to avoid accumulating old test data.

6. **Don't run in production during peak hours** - While test data is excluded from reports, the transactions still consume server resources.

7. **One test at a time** - The system only supports one concurrent stress test. Starting a new test while one is running will return an error.

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "A stress test is already running" | Previous test still active | Stop it with `/api/stress-test/stop` |
| "No active menu items with prices found" | No menu items configured | Add menu items in EMC before testing |
| High failure rate | Server overloaded or misconfigured IDs | Reduce `targetTxPerMinute` and verify IDs |
| Cleanup fails | Foreign key constraints | Retry - the cleanup handles proper deletion order |
| Test data in reports | Should not happen | Verify `test_mode` column exists on checks table |
