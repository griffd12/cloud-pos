# Cloud POS v1.4.0 Release Notes

**Release Date:** February 20, 2026

---

## Electron-Specific Changes

### Critical Fix: Cash Drawer Killing Print Jobs
- Removed `ESC @` (0x1B 0x40) printer initialize/reset command from `buildDrawerKickCommand()`
- This command was clearing the printer's buffer when the drawer kick fired within ~100ms of a print job, causing receipts to be cut off or not print at all
- Drawer kick now sends only `ESC p` (0x1B 0x70) which operates independently without resetting the printer
- Printing and drawer kick now work reliably together when triggered in quick succession

### North / Ingenico SI Payment Terminal Support
- New client-side terminal service (`north-terminal.ts`) for direct WebSocket communication with Ingenico terminals
- Supports Cloud WebSocket API (`wss://epxpay.nabancard.io`) for universal connectivity from both web and Electron environments
- No LAN restrictions -- works over any internet connection
- Real-time status callbacks during terminal transactions (connecting, waiting for card, processing, completed)
- Supported terminal models: Ingenico DESK 2600, LANE 3000/5000/7000, MOVE 5000, LINK 2500

---

## Server Changes Included

### North / Ingenico SI Payment Gateway Adapter
- Full `PaymentGatewayAdapter` implementation for North's Ingenico semi-integrated terminals
- All transaction types: CCR0 (Verify), CCR1 (Sale), CCR2 (Auth), CCR4 (Capture), CCRX (Void), CCR7 (Reversal), CCR9 (Refund)
- Tip adjust support via CCR4 with TIP_AMT field
- WebSocket Cloud API client with automatic connection management and 120-second terminal timeout
- XML transaction builder and parser with four-part key authentication (CUST_NBR-MERCH_NBR-DBA_NBR-TERMINAL_NBR)
- Comprehensive EPX response code mapping for Visa, Mastercard, Discover, and Amex
- Card brand and entry method translation (chip, contactless, swipe, manual, fallback)
- Connection test support via CCR0 (Account Verification)
- Registered in payment adapter system with credential keys: FOUR_PART_KEY, MAC_TIC

### EMC Configuration
- North (Ingenico SI) added as selectable gateway type in Payment Processors configuration
- Credential hint displays four-part key format and required secrets
- North gateway automatically routes to terminal-only payment flow in POS (no manual card entry)

### Reports & Daily Operations Enhancements
- Reports Dashboard redesigned with hero KPI cards, area charts, donut charts, and progress bars
- 7 operational report tabs moved to Daily Operations page with detailed tabular data
- Tip reporting accuracy improvements
- Quick-select date presets for daily sales report
- Product mix organized by category with expandable details
- Operational metrics (check count, avg check, covers) added to daily sales

---

## Upgrade Instructions

1. Download `Cloud-POS-1.4.0-Setup.exe` from GitHub Releases
2. Run the installer -- it will automatically replace the previous version
3. The application will launch after installation completes
4. Print agent will reconnect automatically with the fixed drawer kick logic
5. To use North/Ingenico terminals, configure a North (Ingenico SI) payment processor in EMC with your four-part key and MAC/TIC credentials

---

## Compatibility

- Fully backward compatible with v1.3.9
- No breaking changes
- Database schema changes applied automatically
- Cash drawer fix and North terminal support require this updated Electron build
