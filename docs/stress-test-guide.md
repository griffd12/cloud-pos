# Cloud POS Stress Test Guide

## Overview

The stress test simulates real POS transactions to measure system performance under load. It creates actual checks through the full transaction lifecycle (open check, add items, send to kitchen, tender payment) while keeping all test data completely isolated from real sales reports and fiscal totals.

All test transactions are flagged with `testMode=true` and are automatically excluded from:
- Sales Summary reports
- Fiscal Period totals
- Open Checks reports
- Menu Item Sales reports
- Category Sales reports

There are **two ways** to run a stress test:

| Method | Best For |
|--------|----------|
| **Visual POS Stress Test** (recommended) | Easy, on-screen testing with live metrics — no technical knowledge needed |
| **API Stress Test** | Automated/scripted testing via command line |

---

## Visual POS Stress Test (Recommended)

The visual stress test runs directly from the POS screen. You can watch transactions happen in real time — checks open, items appear, orders send, payments process, and checks close — all while a live stats overlay shows your performance metrics.

### How to Access

1. Sign into the POS with your employee PIN
2. Tap **Functions** (bottom toolbar)
3. Tap **Stress Test**

The stress test configuration panel will appear.

### Configuration Options

| Setting | What It Does | Default |
|---------|-------------|---------|
| **Duration** | How long the test runs (in minutes) | 2 minutes |
| **Speed** | Target number of transactions per minute | 10 tx/min |
| **Item Pattern** | How many menu items per check: Single (1), Double (2), or Triple (3) | Single |
| **Tender** | Which payment type to use for closing checks | Cash (auto-selected) |

**Recommended starting settings:**
- Duration: 1-2 minutes
- Speed: 5-10 tx/min
- Pattern: Single
- Tender: Cash

This gives you a quick baseline before ramping up.

### Starting the Test

1. Adjust the settings to your preference
2. Tap **Start Stress Test**

The configuration panel closes and the test begins immediately.

### What You'll See During the Test

**On the POS screen:**
- Checks open and close automatically
- Menu items appear on the check panel
- The screen **flashes with colors** to show each phase:
  - **Blue flash** = Creating a new check
  - **Green flash** = Adding menu items
  - **Orange flash** = Sending the order
  - **Purple flash** = Processing payment

**On the stats overlay (top of screen):**
A dark banner shows live metrics updating in real time:

| Metric | What It Means |
|--------|--------------|
| **Total Tx** | Total transactions attempted so far |
| **Success** | Transactions completed successfully |
| **Failed** | Transactions that encountered errors |
| **Avg ms** | Average time per transaction (milliseconds) |
| **Min ms** | Fastest transaction |
| **Max ms** | Slowest transaction |
| **Tx/min** | Current throughput rate |

A progress bar shows how much time remains.

The current activity is shown below the header (e.g., "Adding: Cheeseburger", "Processing payment...").

### Stopping the Test

- Tap the red **Stop** button on the overlay to end the test early
- The test also stops automatically when the configured duration expires

When the test stops:
1. Any in-progress transaction finishes
2. All test data is **automatically cleaned up** (deleted from the database)
3. Final results are displayed

### Reading the Results

After the test completes, you'll see a results summary with:

- **Total transactions** and success/failure counts
- **Average, minimum, and maximum** transaction times
- **Transactions per minute** achieved
- **Elapsed time** for the full test
- A note confirming test data was auto-cleaned

**Performance guidelines:**

| Avg Transaction Time | Rating |
|---------------------|--------|
| Under 100ms | Excellent |
| 100-200ms | Good |
| 200-500ms | Acceptable under load |
| Over 500ms | Investigate bottlenecks |

### After the Test

- Tap **Run Again** to start a new test with the same or different settings
- Tap the **X** button to close the overlay and return to normal POS operation

The POS is fully usable again immediately after closing the stress test.

### Important Notes

- **Test data is automatically cleaned up** — you don't need to do anything manually. All test checks, items, payments, and KDS tickets are deleted when the test ends.
- **No impact on reports** — even during the test, test transactions won't appear in your sales reports or fiscal totals.
- **No impact on existing data** — the stress test only creates new test transactions. It never touches your real checks, orders, or configuration.
- **One test at a time** — you can only run one stress test at a time.
- **Avoid peak hours** — while test data is excluded from reports, the transactions still use server resources. Run stress tests during off-peak times on production systems.

---

## API Stress Test (Advanced)

For automated or scripted testing, you can control the stress test via API endpoints. This is useful for CI/CD pipelines, scheduled performance checks, or when you want to run tests without the POS UI.

### Prerequisites

You need three IDs from your system:

| Parameter | Description | Where to Find |
|-----------|-------------|---------------|
| **rvcId** | The Revenue Center to test against | EMC > Properties > Revenue Centers |
| **employeeId** | The employee who "rings" the transactions | EMC > Employees |
| **tenderId** | The tender type for payment (usually Cash) | EMC > Tenders |

You can look these up via the API:
```bash
# List Revenue Centers
curl http://localhost:5000/api/rvcs

# List Employees
curl http://localhost:5000/api/employees

# List Tenders
curl http://localhost:5000/api/tenders
```

### API Endpoints

#### 1. Start a Stress Test

**POST** `/api/stress-test/start`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `rvcId` | string | *(required)* | Revenue Center ID |
| `employeeId` | string | *(required)* | Employee ID for the transactions |
| `tenderId` | string | *(required)* | Tender ID for payments |
| `durationMinutes` | number | `5` | How long to run |
| `targetTxPerMinute` | number | `10` | Target transactions per minute |
| `patterns` | string[] | `["single","double","triple"]` | Item count patterns per transaction |

**Patterns:** `"single"` = 1 item, `"double"` = 2 items, `"triple"` = 3 items per check.

**Example — Quick 1-minute test:**
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

#### 2. Check Status

**GET** `/api/stress-test/status`

```bash
curl http://localhost:5000/api/stress-test/status
```

Returns real-time metrics including transaction counts, timing, throughput, and errors.

#### 3. Stop a Running Test

**POST** `/api/stress-test/stop`

```bash
curl -X POST http://localhost:5000/api/stress-test/stop
```

#### 4. Clean Up Test Data

**POST** `/api/stress-test/cleanup`

Deletes all test transaction data (checks, items, rounds, payments, KDS tickets).

```bash
curl -X POST http://localhost:5000/api/stress-test/cleanup
```

**Important:** Unlike the visual stress test, the API method does **not** auto-clean. Always run cleanup after you're done.

### API Workflow

```
1. Start:   POST /api/stress-test/start   (with config)
2. Monitor: GET  /api/stress-test/status   (poll periodically)
3. Stop:    POST /api/stress-test/stop     (if stopping early)
4. Review:  GET  /api/stress-test/status   (final metrics)
5. Cleanup: POST /api/stress-test/cleanup  (remove test data)
```

---

## What Each Transaction Does

Each simulated transaction follows the full POS lifecycle:

1. **Create Check** — Opens a new check in the specified RVC with `testMode=true`
2. **Add Items** — Adds 1-3 random menu items (based on pattern) from the active menu
3. **Send to Kitchen** — Sends the order, creating rounds and KDS tickets
4. **Retrieve Check Total** — Fetches the updated check with calculated totals
5. **Apply Payment** — Pays the full amount using the specified tender
6. **Auto-Close** — The check closes automatically when fully paid

This exercises the same code paths as real POS operations, making results representative of actual system performance.

---

## Tips and Best Practices

1. **Start small** — Begin with 1-2 minutes at 5-10 tx/min to verify everything works.
2. **Increase gradually** — Ramp up speed in increments (10, 20, 30, 50 tx/min) to find where performance degrades.
3. **Use realistic patterns** — If your typical order has 2-3 items, use Double or Triple patterns.
4. **Run during off-peak hours** — The test uses real server resources even though data is excluded from reports.
5. **Compare results** — Run the same test configuration at different times to track performance changes over time.

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "A stress test is already running" | Previous test still active | Stop it first, then start a new one |
| "No active menu items with prices found" | No menu items configured | Add menu items in EMC before testing |
| High failure rate | Server overloaded or misconfigured | Reduce speed and try again |
| Test data appearing in reports | Should not happen | Contact support — verify `test_mode` column on checks table |
