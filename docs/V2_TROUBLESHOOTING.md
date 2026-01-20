# Cloud POS V2: Troubleshooting Guide

## Quick Reference

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| POS shows RED mode | No network connectivity | Check network cables, router |
| POS shows YELLOW mode | Cloud unreachable | Check internet, verify cloud URL |
| POS shows ORANGE mode | CAPS service down | Start CAPS service, check logs |
| Printing not working | Printer or agent offline | Check printer power, network, agent status |
| KDS not receiving orders | WebSocket disconnected | Refresh KDS, check CAPS service |
| Check locked error | Another workstation editing | Wait for lock expiry or contact holder |
| Transactions not syncing | Cloud connectivity issue | Check sync queue, verify credentials |

---

## 1. Connection Mode Issues

### 1.1 POS Stuck in RED Mode

**Symptoms:**
- Connection indicator shows RED
- Limited functionality (cash only, no printing)

**Diagnostic Steps:**
1. Check if browser shows "Offline" in network tab
2. Verify workstation has network connectivity: `ping 192.168.1.1`
3. Try accessing CAPS service directly: `http://<caps-host-ip>:3001/health`
4. Check if other workstations are affected

**Solutions:**
- Reconnect network cable
- Restart router/switch
- Verify DHCP is providing IP addresses
- Check if workstation firewall is blocking connections

### 1.2 POS Stuck in YELLOW Mode (Cannot Reach Cloud)

**Symptoms:**
- Connection indicator shows YELLOW
- Operations work but sync pending
- New menu changes not appearing

**Diagnostic Steps:**
1. From Service Host, test cloud connectivity: `curl https://<cloud-url>/health`
2. Check CAPS sync queue: Look in Admin → Services Status
3. Verify cloud URL in CAPS config

**Solutions:**
- Verify internet connectivity at property
- Check if firewall is blocking outbound HTTPS
- Verify cloud URL is correct in `config.json`
- Restart CAPS service: `npm run service:restart`

### 1.3 POS Stuck in ORANGE Mode (CAPS Service Down)

**Symptoms:**
- Connection indicator shows ORANGE  
- Printing works via local agent
- Check sharing between workstations not available

**Diagnostic Steps:**
1. Check if CAPS process is running
2. View CAPS logs: `service-host/data/logs/`
3. Test CAPS health: `curl http://<caps-host-ip>:3001/health`

**Solutions:**
- Start CAPS: `npm start` or via Windows Service
- Check CAPS logs for errors
- Verify port 3001 is not in use by another application
- Restart the CAPS host computer

---

## 2. CAPS Service Issues

### 2.1 CAPS Won't Start

**Symptoms:**
- Service fails to start
- Error messages in logs
- Port already in use error

**Diagnostic Steps:**
1. Check logs: `service-host/data/logs/service.log`
2. Verify config.json exists and is valid JSON
3. Check if port 3001 is available: `netstat -an | grep 3001`

**Solutions:**
- Fix any JSON syntax errors in config.json
- Kill process using port 3001: `taskkill /PID <pid> /F` (Windows)
- Verify Node.js is installed: `node --version`
- Reinstall dependencies: `npm install`

### 2.2 CAPS Not Syncing with Cloud

**Symptoms:**
- Sync queue keeps growing
- Config changes not appearing
- Cloud shows CAPS service offline

**Diagnostic Steps:**
1. Check sync queue size in CAPS dashboard
2. View sync errors in logs
3. Test cloud connectivity manually

**Solutions:**
- Verify cloud URL is correct
- Regenerate CAPS token in EMC
- Check internet connectivity
- Clear stuck transactions (with manager approval)

### 2.3 Database Errors

**Symptoms:**
- "Database locked" errors
- Slow performance
- Data not persisting

**Solutions:**
- Stop CAPS service, wait 30 seconds, restart
- Check disk space: CAPS needs at least 1GB free
- If corrupt: Backup `data/service-host.db`, delete, restart (will resync from cloud)

---

## 3. Check Locking Issues

### 3.1 "Check In Use" Error

**Symptoms:**
- Cannot edit a check
- Error shows another workstation name

**Cause:** Another workstation is currently editing this check

**Solutions:**
- Wait 5 minutes for lock to expire automatically
- Have the other workstation finish editing and exit the check
- Manager can force-release locks in EMC → Admin → Release Locks

### 3.2 Lock Not Releasing

**Symptoms:**
- Check appears locked even after workstation exited
- Lock timer seems stuck

**Solutions:**
- Locks expire automatically after 5 minutes
- Browser crash may leave orphaned locks - they will expire
- Manager can release via API: `POST /api/workstations/{id}/release-locks`

### 3.3 Offline Lock Conflicts

**Symptoms:**
- After reconnecting, locks seem out of sync
- Multiple workstations edited same check offline

**This is a known limitation:**
- In ORANGE/RED mode, check sharing is disabled
- Each workstation operates independently
- On sync, server applies transactions chronologically
- Manual reconciliation may be needed for conflicts

---

## 4. Print Issues

### 4.1 No Printers Found

**Symptoms:**
- Print button does nothing
- "No printer configured" error

**Diagnostic Steps:**
1. Verify printer is powered on
2. Check printer network connectivity: `ping <printer-ip>`
3. Verify printer port 9100 is open: `telnet <printer-ip> 9100`
4. Check Print Class routing in EMC

**Solutions:**
- Power cycle printer
- Verify printer IP in EMC matches actual IP
- Check Print Agent is running (for ORANGE mode)
- Configure Print Class routing for the RVC

### 4.2 Print Jobs Failing

**Symptoms:**
- Print job shows "Failed" status
- Jobs stuck in queue

**Diagnostic Steps:**
1. Check printer status lights
2. View print job queue in EMC
3. Check Print Agent logs (if using agents)

**Solutions:**
- Clear paper jam
- Verify printer has paper and ribbon
- Restart printer
- Cancel stuck jobs and retry

### 4.3 Wrong Printer Receiving Orders

**Symptoms:**
- Kitchen tickets going to wrong station
- Receipt printing to kitchen printer

**Solutions:**
- Review Print Class routing in EMC
- Verify menu items have correct Print Class assigned
- Check Order Device configuration

---

## 5. KDS Issues

### 5.1 KDS Not Receiving Orders

**Symptoms:**
- Orders not appearing on KDS
- KDS shows "Disconnected"

**Diagnostic Steps:**
1. Check KDS WebSocket connection
2. Verify Service Host is running
3. Check KDS device configuration in EMC

**Solutions:**
- Refresh KDS browser
- Verify KDS is subscribed to correct station
- Check CAPS WebSocket is working
- Verify network connectivity between KDS and CAPS host

### 5.2 KDS Tickets Not Bumping

**Symptoms:**
- Bump button doesn't respond
- Ticket stays on screen after bump

**Solutions:**
- Refresh KDS browser
- Check WebSocket connection
- Verify user has bump privileges
- Check CAPS logs for errors

---

## 6. Payment Issues

### 6.1 Card Terminal Not Connecting

**Symptoms:**
- Terminal shows offline
- Payment attempts timeout

**Diagnostic Steps:**
1. Check terminal power and display
2. Verify terminal network connection
3. Check Payment Controller status

**Solutions:**
- Power cycle terminal
- Verify terminal IP configuration
- Check if terminal needs software update
- Contact payment processor if terminal is registered

### 6.2 Payments Failing in ORANGE Mode

**Symptoms:**
- Card payments fail when CAPS is down
- Only cash accepted

**This is expected behavior:**
- Card payments require Payment App on workstation
- Not all workstations have Payment App installed
- Cash payments always work

**Solutions:**
- Install Payment App on critical workstations
- Use cash tender until connectivity restored
- Contact support for Payment App installation

---

## 7. Data Sync Issues

### 7.1 Menu Changes Not Appearing

**Symptoms:**
- New menu items missing
- Price changes not reflected
- Changes made in EMC not visible

**Cause:** Browser cache or sync delay

**Solutions:**
- Hard refresh browser: Ctrl+Shift+R
- Wait 30 seconds for sync to complete
- Check if in YELLOW mode (changes sync when GREEN)
- Clear browser cache

### 7.2 Transactions Not Syncing to Cloud

**Symptoms:**
- Cloud reports show gaps
- Sync queue growing
- Offline transactions not appearing

**Diagnostic Steps:**
1. Check sync queue size in CAPS
2. Review sync error logs
3. Verify cloud connectivity

**Solutions:**
- Check internet connectivity
- Verify cloud URL and token
- Review failed transaction errors
- Manually retry sync from CAPS dashboard

---

## 8. Browser Issues

### 8.1 POS Not Loading

**Symptoms:**
- White screen
- JavaScript errors in console
- "Cannot load application" message

**Solutions:**
- Hard refresh: Ctrl+Shift+R
- Clear browser cache
- Try incognito/private mode
- Verify correct URL
- Try different browser (Chrome/Edge recommended)

### 8.2 Slow Performance

**Symptoms:**
- UI lag
- Slow screen transitions
- Delayed responses

**Solutions:**
- Close unused browser tabs
- Clear browser cache
- Check workstation CPU/memory usage
- Verify network is not congested
- Restart browser

---

## 9. Getting Help

### Log Collection
When contacting support, collect these logs:
1. CAPS logs: `service-host/data/logs/`
2. Browser console: F12 → Console tab → Copy all
3. Screenshot of error message
4. Connection mode indicator status

### Useful Commands

**Check CAPS Status:**
```bash
curl http://localhost:3001/health
```

**View Sync Queue:**
```bash
curl http://localhost:3001/api/sync/status
```

**Test Printer Connectivity:**
```bash
telnet <printer-ip> 9100
```

**Release All Locks for Workstation:**
```bash
curl -X POST http://localhost:3001/api/workstations/<id>/release-locks
```

### Support Contacts
- Cloud POS Support: support@cloudpos.example.com
- Emergency Line: 1-800-XXX-XXXX (24/7 for payment issues)

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-12 | Initial troubleshooting guide |
| 1.1 | 2026-01-20 | Updated terminology (Services/CAPS) |
