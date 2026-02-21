# Cloud POS v1.4.8 Release Notes

## Serial Printer Communication Fix

### Problem
v1.4.7 showed "printed successfully" in logs but the Star TSP100III printer connected via USB/serial (virtual COM port) did not actually print or kick the cash drawer. The serial port was opening and closing without errors, but the printer was not receiving or processing the data.

### Root Cause
The Star TSP100III virtual COM port driver requires the DTR (Data Terminal Ready) and RTS (Request To Send) control signals to be asserted high before the printer will accept data. The previous implementation opened the port and immediately wrote data without setting these signals, causing the printer to silently discard the bytes.

### Fixes
1. **DTR/RTS Signal Assertion**: After opening the serial port, DTR and RTS are now explicitly set HIGH before writing data. This tells the Star printer the host is ready to communicate.
2. **Settling Delay**: Added a 50ms delay after signal assertion before writing data, giving the printer time to recognize the DTR/RTS state change.
3. **Post-Drain Close Delay**: Added a 100ms delay after drain completes before closing the port, ensuring all data is physically transmitted before the port is released.
4. **Detailed Serial Logging**: Added step-by-step logging (port open, signal set, write bytes, drain, close) to make future serial debugging easier.
5. **Buffer Size Logging**: Print jobs now log the exact number of bytes being sent to the serial port.

### Technical Details
- `sendToSerialPrinter()` now calls `port.set({ dtr: true, rts: true })` after open
- Sequence: open → set DTR/RTS → 50ms wait → write → drain → 100ms wait → close
- `hupcl: false` prevents modem hangup signal on close
- All serial port operations now log at INFO level for diagnostics

### Update
This update will be delivered automatically via the built-in auto-updater.
