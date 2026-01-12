# V2 Pilot Deployment Checklist

## Overview
This checklist guides the deployment of Cloud POS V2 hybrid architecture to a pilot property. Follow steps in order - each phase depends on completing the previous one.

---

## Phase 1: Pre-Deployment Requirements

### 1.1 Hardware Requirements
- [ ] Dedicated on-premise server for Service Host
  - Minimum: 4GB RAM, 50GB disk, dual-core CPU
  - Operating System: Windows 10/11 or Linux (Ubuntu 20.04+)
  - Static IP address on local network
- [ ] Network thermal printers identified and accessible
  - Epson TM-T88 series or Star TSP series
  - Connected to same LAN as Service Host
  - Note IP addresses: ________________
- [ ] KDS displays identified (if applicable)
  - IP addresses: ________________
- [ ] POS workstations with modern browsers (Chrome/Edge recommended)

### 1.2 Network Requirements
- [ ] Stable internet connection for cloud sync
- [ ] Local network (LAN) connectivity between all devices
- [ ] Firewall allows outbound WebSocket connections (wss://)
- [ ] Local ports available:
  - Service Host API: 3001
  - Printer communication: 9100 (TCP)

### 1.3 Cloud Access
- [ ] EMC (Enterprise Management Console) admin credentials ready
- [ ] Property already configured in cloud system
- [ ] Menu items, employees, and settings configured for property

---

## Phase 2: EMC Cloud Configuration (Do First)

> **Important**: Complete all EMC steps BEFORE installing the Service Host on-premise.

### 2.1 Register Service Host in EMC
1. [ ] Log into EMC as Enterprise Administrator
2. [ ] Navigate to **Admin > Service Hosts**
3. [ ] Click **Configuration** tab
4. [ ] Click **Add Service Host** button
5. [ ] Fill in Service Host details:
   - Name: (e.g., "Store-001 Primary Host")
   - Property: Select the pilot property
   - Host Type: Primary
   - IP Address: Local IP of on-premise server
6. [ ] Click **Create**
7. [ ] **IMPORTANT**: Copy and securely save the **Authentication Token**
   - This token is shown only once!
   - Token: ________________________________

### 2.2 Configure Workstation Service Bindings
1. [ ] Navigate to **Admin > Workstations**
2. [ ] Select the workstation that will run Service Host
3. [ ] In Service Bindings section, enable:
   - [ ] CAPS (Check And Posting Service) - Required
   - [ ] Print Controller - If using network printers
   - [ ] KDS Controller - If using kitchen displays
   - [ ] Payment Controller - If processing payments locally
4. [ ] Click **Save**

### 2.3 Configure Print Agents (if using network printers)
1. [ ] Navigate to **Admin > Print Agents**
2. [ ] Click **Add Print Agent**
3. [ ] Fill in details:
   - Name: (e.g., "Store-001 Print Agent")
   - Property: Select pilot property
4. [ ] Create and copy the **Agent Token**
   - Token: ________________________________
5. [ ] Note the Agent ID for configuration

### 2.4 Configure Print Routing
1. [ ] Navigate to **Admin > Print Classes**
2. [ ] Verify print classes exist for:
   - [ ] Guest Check
   - [ ] Kitchen Tickets (per station if needed)
3. [ ] Navigate to **Admin > Printers**
4. [ ] Add network printers:
   - Name: ________________
   - IP Address: ________________
   - Port: 9100
   - Printer Type: Network ESC/POS
5. [ ] Navigate to **Admin > Print Class Routing**
6. [ ] Configure routing rules for the property

### 2.5 Verify Configuration Sync Settings
1. [ ] Navigate to **Admin > Service Hosts > Status Dashboard**
2. [ ] Confirm Service Host appears with status "Offline" (expected - not yet installed)
3. [ ] Note the Service Host ID: ________________

---

## Phase 3: On-Premise Service Host Installation

### 3.1 Prepare Installation Package
1. [ ] Download Service Host package from deployment server
2. [ ] Extract to installation directory (e.g., `C:\CloudPOS\ServiceHost`)

### 3.2 Configure Service Host
1. [ ] Open configuration file: `config/service-host.json`
2. [ ] Set required values:
```json
{
  "cloudUrl": "wss://your-cloud-pos-url.com/ws/service-host",
  "authToken": "TOKEN_FROM_STEP_2.1",
  "propertyId": "PROPERTY_UUID",
  "serviceHostId": "SERVICE_HOST_ID_FROM_EMC",
  "localDb": "./data/local.sqlite",
  "printers": [
    {
      "name": "Kitchen",
      "ip": "192.168.1.100",
      "port": 9100
    }
  ]
}
```
3. [ ] Save configuration file

### 3.3 Initialize Service Host
1. [ ] Open terminal/command prompt as Administrator
2. [ ] Navigate to Service Host directory
3. [ ] Run: `npm install` (first time only)
4. [ ] Run: `npm run init` to initialize local database
5. [ ] Verify initialization completed without errors

### 3.4 Start Service Host
1. [ ] Run: `npm start`
2. [ ] Verify console shows:
   - [ ] "Connecting to cloud..."
   - [ ] "Cloud connection established"
   - [ ] "Downloading configuration..."
   - [ ] "Configuration sync complete"
   - [ ] "Service Host ready"

### 3.5 Verify Cloud Connection
1. [ ] Return to EMC **Admin > Service Hosts > Status Dashboard**
2. [ ] Confirm Service Host now shows:
   - [ ] Status: **Online** (green indicator)
   - [ ] Connection Mode: **GREEN**
   - [ ] Last Heartbeat: Recent timestamp

---

## Phase 4: Print Agent Installation (If Using Network Printers)

### 4.1 Install Print Agent
1. [ ] Download Print Agent package
2. [ ] Extract to directory (e.g., `C:\CloudPOS\PrintAgent`)

### 4.2 Configure Print Agent
1. [ ] Open configuration file: `config/print-agent.json`
2. [ ] Set values:
```json
{
  "agentId": "AGENT_ID_FROM_EMC",
  "agentToken": "TOKEN_FROM_STEP_2.3",
  "cloudUrl": "wss://your-cloud-pos-url.com/ws/print-agents",
  "printers": [
    {
      "name": "Kitchen",
      "ip": "192.168.1.100",
      "port": 9100
    },
    {
      "name": "Bar",
      "ip": "192.168.1.101", 
      "port": 9100
    }
  ]
}
```
3. [ ] Save configuration

### 4.3 Start Print Agent
1. [ ] Run: `npm start`
2. [ ] Verify connection to cloud
3. [ ] Check EMC shows Print Agent as **Online**

### 4.4 Test Printing
1. [ ] From EMC, navigate to printer configuration
2. [ ] Send test print to each printer
3. [ ] Verify test receipts print correctly

---

## Phase 5: Workstation Configuration

### 5.1 Configure POS Workstations
1. [ ] On each POS workstation, open browser
2. [ ] Navigate to POS application URL
3. [ ] On first load, device configuration will prompt
4. [ ] Select **POS Workstation** mode
5. [ ] Enter workstation credentials/select from list
6. [ ] Verify connection to Service Host (status indicator green)

### 5.2 Configure KDS Displays (If Applicable)
1. [ ] On each KDS display, open browser
2. [ ] Navigate to POS application URL
3. [ ] Select **KDS Display** mode
4. [ ] Select KDS device from list
5. [ ] Verify receiving test orders

---

## Phase 6: Connectivity Mode Testing

### 6.1 Test GREEN Mode (Normal Operation)
1. [ ] Create test order on POS
2. [ ] Verify order appears on KDS
3. [ ] Complete payment
4. [ ] Verify receipt prints
5. [ ] Check EMC shows transaction in reports

### 6.2 Test YELLOW Mode (Internet Down)
1. [ ] Disconnect internet from Service Host (unplug WAN cable)
2. [ ] Wait 30 seconds for mode change
3. [ ] Verify EMC dashboard shows YELLOW mode (may be delayed)
4. [ ] On POS workstation, verify:
   - [ ] Status indicator changes to yellow
   - [ ] "Local Mode" message displays
5. [ ] Create new order
6. [ ] Verify order processes locally
7. [ ] Verify KDS still receives orders (via local LAN)
8. [ ] Complete payment
9. [ ] Verify receipt prints

### 6.3 Test Sync Recovery
1. [ ] Reconnect internet
2. [ ] Wait for automatic reconnection (up to 3 minutes)
3. [ ] Verify:
   - [ ] Status returns to GREEN
   - [ ] "Syncing..." indicator appears briefly
   - [ ] Pending sync count goes to 0
4. [ ] Check EMC reports show offline transactions

### 6.4 Test RED Mode (Complete Isolation) - Optional
> **Warning**: Only test if comfortable with manual recovery procedures.

1. [ ] Stop Service Host application
2. [ ] Verify workstations show RED mode
3. [ ] Verify workstations queue orders locally
4. [ ] Restart Service Host
5. [ ] Verify workstations reconnect and sync

---

## Phase 7: Go-Live Verification

### 7.1 EMC Monitoring Setup
1. [ ] Navigate to **Admin > Service Hosts > Status Dashboard**
2. [ ] Verify all indicators green:
   - [ ] Service Host: Online
   - [ ] Connection Mode: GREEN
   - [ ] Pending Sync: 0
   - [ ] Active Alerts: 0
3. [ ] Set up alert notifications (if available)

### 7.2 Final Operational Checks
- [ ] All workstations connected and showing GREEN mode
- [ ] All printers responding to test prints
- [ ] KDS displays receiving and bumping orders
- [ ] Payments processing successfully
- [ ] End-of-day reports generating correctly

### 7.3 Staff Training Reminders
- [ ] Show staff the connection mode indicator
- [ ] Explain YELLOW mode: "Internet is down but you can keep working"
- [ ] Explain what to do if RED mode appears: "Contact support"
- [ ] Demonstrate how to check transaction sync status

---

## Phase 8: Post-Deployment Monitoring

### Daily Checks (First Week)
- [ ] Morning: Verify Service Host online in EMC
- [ ] Check pending sync count is 0
- [ ] Review any alerts from previous day
- [ ] Verify end-of-day close completed successfully

### Weekly Checks (First Month)
- [ ] Review resource utilization trends (CPU, memory, disk)
- [ ] Check for any recurring alerts
- [ ] Verify all offline transactions synced
- [ ] Backup local SQLite database

---

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Service Host shows Offline | Network/auth issue | Check internet, verify token |
| YELLOW mode won't recover | Cloud unreachable | Check firewall, DNS, cloud status |
| Prints not working | Print Agent offline | Restart Print Agent, check printer IPs |
| Slow transaction sync | Large queue backlog | Wait, or check network bandwidth |
| High memory alert | Long uptime | Schedule periodic Service Host restart |

---

## Emergency Contacts

- Cloud Support: ________________
- Property Manager: ________________
- IT Support: ________________

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| IT Administrator | | | |
| Property Manager | | | |
| Cloud Support | | | |

---

*Document Version: 1.0*
*Last Updated: January 2026*
