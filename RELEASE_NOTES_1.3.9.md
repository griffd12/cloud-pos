# Cloud POS v1.3.9 Release Notes

**Release Date:** February 18, 2026

---

## Highlights

- Stripe Terminal refunds now process actual card refunds back to the customer's payment method
- All FOH/BOH reports hardened to correctly reflect tips, voids, refunds, and tax totals
- Service charge configuration expanded with 5 new fields for tax, revenue category, and tip pool support
- Concurrency-safe check numbering prevents duplicate check numbers under high load
- Idempotency and offline hardening across critical operations
- Canonical Reporting DAL with 7 query functions and 6 report endpoints
- Cash drawer kick integrated directly into receipt printing for reliable drawer opens on cash payments
- KDS alert system simplified to 2-stage alerts (yellow/red) with forced color validation
- KDS ticket modifier text styling improved for readability
- EMC device management pages converted to inline horizontal editing layout
- Electron Windows installer bumped to v1.3.9

---

## Payment Gateway Refunds (Critical Fix)

### Stripe Terminal Refund Chain
Previously, refunds on Stripe Terminal payments would mark the check as refunded in the POS but did **not** send the refund back to Stripe. The customer's card was never credited. This has been fully resolved.

**Root Cause:**
When the terminal session polling endpoint detected a successful payment, it updated the session status to "approved" but did not create a `payment_transactions` record. Without this record, the refund flow had no way to find the Stripe PaymentIntent ID needed to issue an actual refund.

**What Changed:**
- Terminal session polling now creates a `payment_transactions` record with the Stripe PaymentIntent ID when a payment succeeds
- Idempotency guards prevent duplicate records if the polling endpoint is called multiple times
- Bidirectional linking between `check_payments` and `payment_transactions` ensures the refund flow can always locate the gateway transaction
- Fallback lookup mechanism handles legacy/orphaned payment records that predate this fix
- Three payment callback flows (simulate, payment controller, general) all establish bidirectional links

**Result:**
- Full refunds and partial refunds now process the actual Stripe refund back to the customer's card
- Refund reason is passed through to Stripe as metadata
- Confirmed working end-to-end with Stripe Terminal reader SNS-001

### Payment Recording Reliability
- Stripe Elements (web form) payments now preserve the PaymentIntent ID in payment_transactions
- `gateway_transaction_id` lookup added to storage layer for cross-referencing
- All three payment flows (Stripe Elements, Stripe Terminal, Sandbox) now create consistent transaction records

---

## Reports Hardening

### Tip Reporting
- **Z Report**: Net Sales, Gross Sales, and all financial totals now include tip amounts
- **Cashier Report**: Employee-level totals include tips collected per payment method
- **Daily Sales Summary**: Tips broken out by tender type with correct aggregation
- **Labor Summary**: Tip pool contributions now visible in labor cost calculations
- **Employee Reports**: Individual employee tip totals added to shift and daily views

### Void & Refund Accuracy
- All reports now correctly filter voids by business date rather than transaction timestamp
- Refunded checks display accurate post-refund totals instead of original amounts
- Check history views show refund status, refund amount, and original payment details
- Sales averages recalculated to exclude fully refunded checks
- Financial report totals (Z Report, Cash Drawer Report) properly subtract refunded amounts and taxes

### Tax Calculation Fixes
- Tax totals on checks now correctly recalculate after voided line items
- Voided items no longer contribute to check tax totals
- Tax reporting views align with corrected check-level tax calculations

---

## Canonical Reporting DAL

### Query Functions
Seven standardized query functions parameterized by `propertyId` and `businessDate`:
- `v_sales_lines` -- Line-item sales detail with menu item, quantity, price, tax, and discount
- `v_check_discounts` -- Discount application detail by check
- `v_check_payments` -- Payment detail by check with tender type and tip
- `v_check_service_charges` -- Service charge detail by check
- `v_labor_entries` -- Clock-in/out records with job, role, and hours
- `v_cash_transactions` -- Cash drawer activity (sales, refunds, drops, pickups)
- `v_void_lines` -- Voided item detail with reason and manager approval

### Report Endpoints
Six report endpoints under `/api/reports/`:
- **Z Report** (`/z-report`) -- End-of-day financial summary
- **Cash Drawer Report** (`/cash-drawer`) -- Drawer-level cash accountability
- **Cashier Report** (`/cashier`) -- Employee-level sales and payment summary
- **Daily Sales Summary** (`/daily-sales`) -- Revenue center sales breakdown
- **Labor Summary** (`/labor-summary`) -- Hours, labor cost, and overtime
- **Tip Pool Summary** (`/tip-pool`) -- Tip distribution by pool and employee

### Report Validation
- `/api/reports/validate` runs 4 invariant checks for data integrity and reconciliation
- Validates that payment totals match check totals, cash drawer balances, and tax calculations

---

## Service Charge Enhancements

### New Configuration Fields
Five new fields added to the service charge configuration:
- **Taxable** -- Whether the service charge is subject to tax
- **Tax Group** -- Which tax group applies when taxable
- **Revenue Category** -- Category for revenue reporting
- **Tip Pool** -- Which tip pool receives the service charge amount
- **Tip Eligible** -- Whether the service charge counts toward employee tip calculations

### Service Charge Ledger
- `check_service_charges` transactional table tracks application, manual override, and voiding
- API endpoint for retrieving service charges associated with a specific check
- Reporting view (`v_check_service_charges`) included in canonical DAL

---

## System Hardening

### Concurrency-Safe Check Numbering
- Atomic check number generation using `rvc_counters` table and `createCheckAtomic()` method
- Prevents duplicate check numbers under concurrent POS station usage
- Sequential numbering without gaps guaranteed at the database level

### Idempotency Protection
- Idempotency keys added to critical POST operations (check creation, payment recording, KDS ticket bumping)
- Duplicate requests within a time window return the original response instead of creating duplicates
- Terminal session payment recording guarded against re-poll duplicates

### Offline Hardening
- Offline check creation uses atomic numbering consistent with online flow
- KDS ticket and print job handling improved for fault tolerance
- Data clearing process updated with missing entity deletions and counter resets

---

## Cash Drawer Integration

### Embedded Drawer Kick in Receipt Printing
Previously, the cash drawer kick was sent as a separate TCP connection to the receipt printer after payment. This was unreliable because it required a second network connection that could fail independently. The drawer kick ESC/POS command is now **embedded directly into the receipt print data** so it fires as part of the same print job -- matching how Oracle Simphony and other commercial POS systems handle drawer opens.

**How It Works:**
- When a cash payment closes a check, the server appends `ESC p` (0x1B 0x70) drawer kick bytes to the end of the receipt ESC/POS data
- The kick command executes as part of the same TCP stream that prints the receipt -- no separate connection needed
- Only triggers when the workstation has `cashDrawerEnabled` and `cashDrawerAutoOpenOnCash` both set to true
- Respects per-workstation pin selection (pin 2 or pin 5) and pulse duration settings

### Critical Fix: Drawer Open Failure
- Fixed a bug where the cash drawer kick endpoint called a non-existent storage function (`getPrintAgentsByProperty`), causing all drawer open attempts to fail silently
- Corrected to use the existing `getPrintAgents(propertyId)` method
- Verified working with checks #53 and #54

### Print Agent Improvements (Electron)
- `ESC @` (printer initialize) command now sent before `ESC p` (drawer kick) to reset the printer's command buffer
- Default pulse duration increased from 100ms to 200ms across all code paths for better solenoid activation
- Diagnostic logging added to track kick command bytes, pin selection, and pulse timing
- Standalone drawer kick (via "Open Drawer" button) still works as a separate command for no-sale opens

### Workstation Cash Drawer Configuration
- Cash drawer settings configurable per workstation in EMC: enable/disable, printer assignment, kick pin, pulse duration
- Auto-open on cash payment and auto-open on cash drop toggles
- Pin selection: pin 2 (standard for most Epson-compatible drawers) or pin 5

---

## KDS (Kitchen Display System) Improvements

### 2-Stage Alert System
The KDS alert system has been simplified from 3 stages to 2 stages to match standard kitchen operations:
- **Stage 1 (Yellow)** -- Order has been waiting beyond the first alert threshold
- **Stage 2 (Red)** -- Order has been waiting beyond the second alert threshold
- Alert stage 3 has been removed from the configuration UI and is disabled in the database
- Forced color validation ensures alert 1 is always yellow (#F59E0B) and alert 2 is always red (#EF4444)

### Ticket Readability
- Modifier text on KDS tickets now uses improved styling for better visibility at a distance
- Modifier names display more clearly with consistent font sizing and spacing

### Device Settings Refresh
- KDS screen now properly refreshes device-specific settings (font scaling, alert thresholds) when configuration changes are saved in EMC
- Alert threshold changes apply in real-time without requiring a KDS page reload

---

## EMC Device Management (Inline Editing)

### Horizontal Embedded Layout
All "Devices & Routing" configuration pages in EMC now use a Simphony-style horizontal embedded layout with inline editing, replacing the previous modal dialog approach:
- **KDS Devices** -- Card-based editing with grouped sections for device settings, alert thresholds, and display options
- **Order Devices** -- Inline configuration with server-side validation for KDS device assignments
- **Workstations** -- Inline cash drawer configuration section with printer assignment and kick settings

---

## EMC & Admin UI

### Form Standardization
- Dialog-based configuration forms across admin pages replaced with embedded form components
- Consistent form behavior across Menu Items, Modifiers, Tax Groups, Tenders, and other entities

### Payment Processor Assignment
- Credit and debit card tenders can now be assigned a specific payment processor
- Processor selection dropdown added to tender configuration

### Refund Modal Enhancements
- Full refund and partial refund options with item-level selection
- Manager approval endpoint (`/api/auth/manager-approval`) for refund authorization
- Refund reason required before processing
- Item selection fix -- previously users could not select individual items for partial refunds

---

## Documentation

- Comprehensive `DATABASE_SCHEMA.md` added to project root documenting all tables, columns, constraints, indexes, and relationships
- Living reference document updated with each schema change

---

## Upgrade Notes

| Station Type | Action Required |
|---|---|
| **Cloud / Web POS** | Republish the server -- all fixes apply immediately |
| **Windows Electron** | Download and install **Cloud-POS-1.3.9-Setup.exe** from GitHub Releases. Auto-update will prompt if configured. |

- No breaking changes
- Database schema changes applied automatically via Drizzle ORM push
- Existing checks and payments are unaffected -- the refund fix applies to new terminal payments going forward
- Legacy terminal payments without `payment_transaction_id` use the new fallback lookup for refund processing
- Cash drawer kick improvements require the updated Electron print agent (included in 1.3.9 installer)
- KDS alert stage 3 is automatically disabled for existing configurations
- Fully backward compatible with v1.3.8
