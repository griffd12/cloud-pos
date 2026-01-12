# Cloud POS V2: Phase 5 Test Plan
## Multi-Workstation & Offline Controller Validation

**Version:** 1.0  
**Date:** January 12, 2026  
**Status:** Active

---

## 1. Test Topology

### 1.1 Physical Test Environment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TEST NETWORK TOPOLOGY                                 │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │   Workstation 1     │  │   Workstation 2     │  │   Workstation 3     │ │
│  │   (Primary POS)     │  │   (Secondary POS)   │  │   (KDS Terminal)    │ │
│  │                     │  │                     │  │                     │ │
│  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │ │
│  │  │ Chrome Browser│  │  │  │ Chrome Browser│  │  │  │ Chrome Browser│  │ │
│  │  │ POS Mode      │  │  │  │ POS Mode      │  │  │  │ KDS Mode      │  │ │
│  │  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │ │
│  │                     │  │                     │  │                     │ │
│  │  Print Agent: ✓     │  │  Print Agent: ✓     │  │  Print Agent: ✗     │ │
│  │  Payment App: ✓     │  │  Payment App: ✗     │  │  Payment App: ✗     │ │
│  │                     │  │                     │  │                     │ │
│  │  IP: 192.168.1.101  │  │  IP: 192.168.1.102  │  │  IP: 192.168.1.103  │ │
│  └──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘ │
│             │                        │                        │            │
│             └────────────────────────┼────────────────────────┘            │
│                                      │                                     │
│                               LAN Switch                                   │
│                                      │                                     │
│  ┌───────────────────────────────────┴───────────────────────────────────┐ │
│  │                    SERVICE HOST (192.168.1.50)                         │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │ │
│  │  │    CAPS     │ │    Print    │ │     KDS     │ │   Payment   │      │ │
│  │  │   Service   │ │  Controller │ │  Controller │ │  Controller │      │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘      │ │
│  │                                                                        │ │
│  │  SQLite Database: ./data/service-host.db                               │ │
│  │  Port: 3001 (HTTP) / 3001 (WebSocket)                                  │ │
│  └────────────────────────────────────┬──────────────────────────────────┘ │
│                                       │                                    │
│  ┌────────────────────────────────────┴──────────────────────────────┐    │
│  │                    Network Printer (192.168.1.200)                 │    │
│  │                    Epson TM-T88VI (Port 9100)                      │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└────────────────────────────────────────────────────────┬────────────────────┘
                                                         │
                                                    Router/Firewall
                                                         │
                                                    ─────┴─────
                                                    │ INTERNET │
                                                    ───────────
                                                         │
                                          ┌──────────────────────────┐
                                          │   CLOUD (Replit)         │
                                          │   https://pos.replit.app │
                                          └──────────────────────────┘
```

### 1.2 Virtual/Simulated Environment

For development testing, we simulate the topology:

| Component | Simulation Method |
|-----------|-------------------|
| Workstation 1 | Chrome Tab 1 on dev machine |
| Workstation 2 | Chrome Tab 2 (incognito) |
| Workstation 3 | Chrome Tab 3 (KDS mode) |
| Service Host | `npm run dev` in service-host/ folder |
| Network Printer | TCP echo server on port 9100 |
| Cloud | `npm run dev` in main project (port 5000) |

---

## 2. Connection Mode Test Matrix

### 2.1 Mode Definitions Recap

| Mode | Cloud | Service Host | Local Agents | Primary Data Source |
|------|-------|--------------|--------------|---------------------|
| GREEN | ✓ Reachable | ✓ Reachable | ✓ Available | Cloud |
| YELLOW | ✗ Unreachable | ✓ Reachable | ✓ Available | Service Host |
| ORANGE | ✗ Unreachable | ✗ Unreachable | ✓ Available | Browser IndexedDB |
| RED | ✗ Unreachable | ✗ Unreachable | ✗ Unavailable | Browser IndexedDB |

### 2.2 Mode Transition Test Cases

| ID | Transition | Trigger | Expected Behavior | Validation |
|----|------------|---------|-------------------|------------|
| MT-001 | GREEN → YELLOW | Block cloud endpoint | Indicator turns yellow, API redirects to Service Host | Health check fails 3x, mode changes |
| MT-002 | YELLOW → GREEN | Restore cloud endpoint | Indicator turns green, transactions sync | Cloud reachable, sync queue empties |
| MT-003 | YELLOW → ORANGE | Stop Service Host | Indicator turns orange, local agents active | Service Host unreachable, Print Agent works |
| MT-004 | ORANGE → YELLOW | Start Service Host | Indicator turns yellow, checks sync | Service Host reachable, data merged |
| MT-005 | ORANGE → RED | Stop all local agents | Indicator turns red, cash-only mode | No network services available |
| MT-006 | RED → ORANGE | Start Print Agent | Indicator turns orange, printing resumes | Print Agent responds to health check |
| MT-007 | RED → YELLOW | Start Service Host (agents running) | Indicator turns yellow, full offline mode | Service Host responds, transactions sync |
| MT-008 | RED → GREEN | Restore all connectivity | Indicator turns green, full sync | All services reachable, data synced |

### 2.3 Feature Availability by Mode

| Feature | GREEN | YELLOW | ORANGE | RED | Test Method |
|---------|-------|--------|--------|-----|-------------|
| Create Check | ✓ | ✓ | ✓ | ✓ | Attempt check creation |
| Add Items | ✓ | ✓ | ✓ | ✓ | Add menu item to check |
| Apply Discount | ✓ | ✓ | ✓ (cached) | ✗ | Apply discount, verify |
| Split Check | ✓ | ✓ | ✗ | ✗ | Attempt split |
| Cash Payment | ✓ | ✓ | ✓ | ✓ | Process cash payment |
| Card Payment | ✓ | ✓ | ✓ (if local app) | ✗ | Process card payment |
| Receipt Print | ✓ | ✓ | ✓ (Print Agent) | ✗ | Print receipt |
| Kitchen Print | ✓ | ✓ | ✓ (Print Agent) | ✗ | Send to kitchen |
| KDS Display | ✓ | ✓ | ⚠️ Limited | ✗ | Check KDS receives ticket |

---

## 3. Check Locking Test Cases

### 3.1 Basic Locking

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| CL-001 | Acquire lock | WS1 requests lock on check 100 | Lock granted, lock_holder = WS1 |
| CL-002 | Release lock | WS1 releases lock on check 100 | Lock released, lock_holder = null |
| CL-003 | Conflict on locked check | WS1 holds lock, WS2 requests lock | WS2 receives 409 Conflict |
| CL-004 | Lock expiration | WS1 acquires lock, waits 5+ minutes | Lock auto-expires, WS2 can acquire |
| CL-005 | Lock refresh | WS1 acquires lock, refreshes at 4 min | Lock extended, expiry reset |
| CL-006 | Force release | Manager releases WS1's locks | All WS1 locks cleared |

### 3.2 Concurrent Edit Scenarios

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| CE-001 | Simultaneous add items | WS1 and WS2 both try to add items | Only lock holder succeeds |
| CE-002 | Payment while editing | WS1 editing, WS2 tries payment | WS2 gets lock conflict error |
| CE-003 | Workstation crash | WS1 crashes while holding lock | Lock expires after 5 min |
| CE-004 | Transfer check | WS1 transfers check to WS2 | Lock transfers, WS2 becomes holder |

### 3.3 Offline Lock Behavior

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| OL-001 | Lock during YELLOW | Acquire lock via Service Host | Lock stored locally, works offline |
| OL-002 | Lock during ORANGE | Try to acquire lock | Denied (no CAPS available) |
| OL-003 | Lock during RED | Browser creates local lock | Local-only lock, merged on sync |
| OL-004 | Sync locked check | WS1 has local lock, reconnects | Lock state synced to Service Host |

---

## 4. Print Routing Test Cases

### 4.1 Normal Print Flow

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| PR-001 | Receipt via Service Host | GREEN mode, print receipt | Job sent to Service Host → Printer |
| PR-002 | Kitchen ticket routing | Send order to kitchen | Print class routes to correct printer |
| PR-003 | Multi-printer routing | Order with items from 2 stations | 2 tickets printed to 2 printers |

### 4.2 Print Failover

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| PF-001 | Service Host down | ORANGE mode, print receipt | Print Agent handles job directly |
| PF-002 | Print Agent recovery | Service Host down → up | Queued jobs sync and print |
| PF-003 | Network printer down | Printer offline | Job queued, retried on printer recovery |
| PF-004 | All print unavailable | RED mode, no agents | Print fails gracefully, user notified |

---

## 5. Transaction Sync Test Cases

### 5.1 Normal Sync Flow

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| TS-001 | GREEN mode sync | Complete transaction | Immediately synced to cloud |
| TS-002 | YELLOW mode queue | Complete transaction offline | Queued in Service Host sync table |
| TS-003 | YELLOW → GREEN replay | Restore connectivity | Queued transactions replay to cloud |
| TS-004 | Conflict resolution | Same check edited offline by 2 WS | Server timestamp wins, merge applied |

### 5.2 Edge Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| SE-001 | Large sync queue | 100+ transactions pending | All sync successfully, in order |
| SE-002 | Sync during failure | Cloud drops mid-sync | Transaction marked failed, retried |
| SE-003 | Duplicate prevention | Same transaction sent twice | Idempotency key prevents duplicate |
| SE-004 | Check number collision | Offline check numbers overlap | Cloud reassigns permanent numbers |

---

## 6. KDS Integration Test Cases

### 6.1 KDS Display

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| KD-001 | New ticket display | Send order to kitchen | KDS shows new ticket |
| KD-002 | Bump ticket | Kitchen bumps item | Item marked complete, ticket updates |
| KD-003 | Recall ticket | Recall bumped ticket | Ticket returns to display |
| KD-004 | Multi-KDS routing | Order with expo routing | Tickets route to correct stations |

### 6.2 KDS Offline Behavior

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| KO-001 | YELLOW mode KDS | Service Host handles routing | KDS works via local WebSocket |
| KO-002 | KDS during ORANGE | Service Host down | KDS offline, no new tickets |
| KO-003 | KDS recovery | Service Host restored | Pending tickets appear on KDS |

---

## 7. Performance Test Cases

### 7.1 Load Testing

| ID | Test Case | Target | Measurement |
|----|-----------|--------|-------------|
| LT-001 | Concurrent checks | 50 open checks | Response time < 200ms |
| LT-002 | High transaction rate | 100 transactions/min | No failures |
| LT-003 | Large sync queue | 500 pending syncs | Sync completes in < 5 min |
| LT-004 | WebSocket connections | 10 KDS displays | All receive updates < 100ms |

### 7.2 Recovery Time

| ID | Test Case | Target | Measurement |
|----|-----------|--------|-------------|
| RT-001 | Mode detection | < 45 seconds | Time from failure to mode change |
| RT-002 | Service Host failover | < 5 seconds | Time to route to Service Host |
| RT-003 | Sync queue replay | < 30 sec/100 items | Time to sync pending transactions |
| RT-004 | Service Host startup | < 10 seconds | Time to full operational |

---

## 8. Test Execution Procedures

### 8.1 Setting Up Test Environment

```bash
# Terminal 1: Start Cloud (main POS)
cd /home/runner/workspace
npm run dev

# Terminal 2: Start Service Host
cd service-host
npm install
npm run dev

# Terminal 3: Network simulation (optional)
# Use browser DevTools Network panel to throttle/block requests
```

### 8.2 Simulating Network Failures

**Block Cloud (GREEN → YELLOW):**
```javascript
// In browser console
window.testNetworkBlocked = true;
// Or use DevTools → Network → Block request URL pattern: */api/*
```

**Stop Service Host (YELLOW → ORANGE):**
```bash
# Press Ctrl+C in Terminal 2
```

**Simulate RED Mode:**
```bash
# Stop Service Host and Print Agent
# Set browser to offline mode (DevTools → Network → Offline)
```

### 8.3 Validating Mode Transitions

```javascript
// Check current mode in browser console
apiClient.getMode();  // Returns: 'green' | 'yellow' | 'orange' | 'red'

// Get detailed status
apiClient.getStatus();
// Returns: { mode, cloudReachable, serviceHostReachable, ... }

// Monitor mode changes
apiClient.onModeChange((mode) => console.log('Mode changed to:', mode));
```

---

## 9. Pass/Fail Criteria

### 9.1 Phase 5 Exit Criteria

| Category | Criteria | Target |
|----------|----------|--------|
| Mode Transitions | All MT-* tests pass | 100% |
| Check Locking | All CL-* and CE-* tests pass | 100% |
| Offline Locking | All OL-* tests pass | 100% |
| Print Routing | All PR-* and PF-* tests pass | 100% |
| Transaction Sync | All TS-* and SE-* tests pass | 100% |
| KDS Integration | All KD-* and KO-* tests pass | 100% |
| Performance | All LT-* and RT-* meet targets | 90%+ |

### 9.2 Defect Severity

| Severity | Definition | Action |
|----------|------------|--------|
| Critical | Data loss, system crash, payment failure | Block Phase 6 |
| High | Feature completely broken | Fix before Phase 6 |
| Medium | Feature degraded but usable | Document, fix in Phase 6 |
| Low | Minor UI/UX issue | Log for future sprint |

---

## 10. Test Automation

### 10.1 Automated Test Scripts

Location: `service-host/scripts/test-all.js`

```bash
# Run all automated tests
cd service-host
npm test

# Run with verbose output
npm run test:verbose
```

### 10.2 Browser-Based Test Harness

Location: `client/src/lib/__tests__/connection-mode.test.ts`

Tests can be run via Jest/Vitest for:
- API client failover logic
- Offline store operations
- Mode detection algorithms

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-12 | Cloud POS Team | Initial test plan |
