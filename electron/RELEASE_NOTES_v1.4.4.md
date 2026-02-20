# Cloud POS v1.4.4 Release Notes

**Release Date:** February 20, 2026

---

## New Features

### Printer Diagnostics Suite (System Diagnostics Page)
- **Print Agent Status**: Shows connection state, agent ID, configured printers, and job counts
- **COM Port Test**: Scan available ports, select baud rate, test connectivity, and send ESC/POS test page
- **Network Printer Test**: TCP connection test to any IP/port for network receipt printers

### COM Port Detection for Oracle Workstations
- Added Windows Registry fallback detection (HKLM\HARDWARE\DEVICEMAP\SERIALCOMM) for built-in serial ports not found by standard detection
- Added WMI fallback detection (Win32_SerialPort) for driver-exposed ports on specialized POS hardware
- **Manual COM port entry**: When auto-detection finds no ports (common on Oracle Workstation 625x), a text field allows direct port entry (e.g. COM1) for testing

### System Diagnostics Navigation
- Added System Diagnostics access from KDS screen via settings gear dropdown menu
- Context-aware back navigation: returns to /kds for KDS devices, / for POS workstations

---

## Summary of Changes

| Feature | Description |
|---------|------------|
| Print Agent Status | View live connection state, agent ID, printer count, job counts |
| COM Port Scanner | Auto-detect + registry + WMI fallback + manual entry for Oracle WS |
| Serial Printer Test | Open COM port, verify connectivity, send ESC/POS test page |
| Network Printer Test | TCP socket connection test to verify network printer reachability |
| KDS Diagnostics Access | Settings gear menu now includes System Diagnostics link |
| Smart Back Navigation | Diagnostics page returns to correct screen based on device type |

---

## Upgrade Instructions

1. Download `Cloud-POS-1.4.4-Setup.exe` from GitHub Releases
2. Run the installer -- it will automatically replace the previous version
3. Auto-update from v1.4.3 is also supported
4. Navigate to System Diagnostics to access the new printer tools

---

## Build Command (Windows)

```
npm install && node electron/prebuild-cleanup.cjs && npx electron-builder --config electron/electron-builder.json --win
```

---

## Compatibility

- Fully backward compatible with v1.4.3
- No breaking changes
- No database schema changes
