# Cloud POS v1.3.9 Release Notes

**Release Date:** February 17, 2026

---

## Highlights

- Stripe Terminal refunds now process actual card refunds back to the customer's payment method
- All FOH/BOH reports hardened to correctly reflect tips, voids, refunds, and tax totals
- Service charge configuration expanded with 5 new fields for tax, revenue category, and tip pool support
- Concurrency-safe check numbering prevents duplicate check numbers under high load
- Idempotency and offline hardening across critical operations
- Canonical Reporting DAL with 7 query functions and 6 report endpoints

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
| **Windows Electron** | Version not yet bumped -- Electron installer update will follow in a future release |

- No breaking changes
- Database schema changes applied automatically via Drizzle ORM push
- Existing checks and payments are unaffected -- the refund fix applies to new terminal payments going forward
- Legacy terminal payments without `payment_transaction_id` use the new fallback lookup for refund processing
- Fully backward compatible with v1.3.8
