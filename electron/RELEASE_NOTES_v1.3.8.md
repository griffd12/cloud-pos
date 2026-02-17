# Cloud POS v1.3.8 Release Notes

## Electron Changes

### Maximized Window on Launch
- The application now opens maximized (full screen) on startup for both initial launch and post-setup-wizard
- Setup wizard and kiosk mode are excluded — they retain their own window sizing
- Ensures the POS interface uses the full available screen area immediately without requiring manual window resizing

### Offline Database Hardening (Electron Parity)
- Updated Electron offline SQLite database with new idempotency methods: `acquireIdempotencyLock`, `completeIdempotencyKey`, `failIdempotencyKey`
- Added `status` and `request_hash` columns to `idempotency_keys` table for INSERT-first pattern support
- Offline database now matches cloud schema for full offline operation parity

## Server / Web Changes

### Concurrency-Safe Hardening Patch
Five database-level safeguards added to prevent duplicate records under high concurrency and network retry conditions:

1. **UNIQUE Constraint on Check Numbers** — `UNIQUE(rvc_id, check_number)` on the `checks` table acts as a database-level safety net. Even if two concurrent requests manage to reserve the same counter value, the second INSERT will fail rather than create a duplicate check number. This is in addition to the existing atomic `INSERT...ON CONFLICT DO UPDATE...RETURNING` counter reservation in `rvc_counters`.

2. **INSERT-First Idempotency** — Replaced the old SELECT-then-INSERT pattern for idempotency keys with an atomic INSERT-first approach using `INSERT...ON CONFLICT`. This eliminates the race window where two concurrent requests could both see "no key exists" and both proceed. New `status` column (`pending`, `completed`, `failed`) and `request_hash` column track request lifecycle. The idempotency system is transparent — it only activates when an `Idempotency-Key` header is present; normal browser POS flow is completely unaffected.

3. **Payment Attempt Deduplication** — `UNIQUE` constraint on `payment_attempt_id` in the `payments` table prevents the same payment from being recorded twice, even if the client retries. The payment endpoint sets `paymentAttemptId` from the idempotency key when present.

4. **Expired Key Cleanup Index** — `idx_idempotency_expires` index on `expires_at` column for efficient cleanup of expired idempotency records without full table scans.

5. **Production Index Verification** — All five indexes confirmed present and active in production: `idx_checks_rvc_check_number`, `idx_idempotency_keys_lookup`, `idx_idempotency_expires`, `unique_check_number_per_rvc`, `unique_payment_attempt`.

### Complete Refund System with Payment Gateway Integration
- Refunds on credit card payments are now automatically processed through the original payment gateway
- The system looks up the stored gateway transaction ID from the original payment and sends the refund request to the processor (Stripe, Elavon, Heartland, etc.)
- If the transaction record lacks a processor reference, the system falls back to the tender's configured processor
- Refund amounts are converted to cents with a rounding guard (skips gateway call if amount rounds to zero)
- Mixed tender refunds (e.g., part cash, part credit) are handled correctly — only credit card payments trigger gateway calls; cash and gift card refunds are marked as manual
- Failed gateway refunds still create the refund record but return a warning to the operator for manual follow-up
- New fields added to refund payment records for audit tracking: `gatewayRefundId`, `gatewayStatus`, `gatewayMessage`, `refundMethod`

### POS Refund Authorization Fix
- Fixed privilege name mismatch that prevented operators from accessing the Transaction Lookup / Refund function
- The POS was checking for `process_refunds` privilege, but the database roles store it as `refund` — corrected to match
- Manager approval privilege also fixed from `approve_refunds` to `approve_refund`
- Added fallback support for `admin_access` privilege so administrators can always process refunds

## Verification & Testing

### Concurrency Collision Test
- 20 concurrent check creation requests produced 20 unique sequential check numbers with zero duplicates
- 5 concurrent requests verified producing 5 unique sequential numbers (66-70)

### Idempotency Verification
- Duplicate request with same idempotency key correctly returns the original response (no double-create)
- Different request body with same key correctly returns 409 conflict
- Requests without idempotency key pass through transparently (no behavior change)

### Full FOH Flow Verified (Both Enterprises)
All front-of-house operations tested end-to-end across two enterprises:
- **Create Check** — Sequential check numbers, correct business date stamping
- **Add Items** — Menu items ring with proper pricing and tax calculation
- **Send to KDS** — Orders route to kitchen display, rounds created correctly
- **Take Payment** — Cash payments process, checks auto-close when fully paid, split payments keep check open until balance is met
- **Split Check** — Items moved to new check with atomic check number assignment
- **Merge Checks** — Split checks merged back, items reunited, totals recalculated
- **Transfer Check** — Ownership transferred between employees with audit logging
- **Reopen Closed Check** — Closed check reopened, status reset, items editable
- **Edit Reopened Check** — New items added and sent on reopened check
- **Re-close Edited Check** — Remaining balance paid, check re-closed correctly

### Production Validation
- Server healthy, all 5 hardening indexes confirmed present and active in production
- Zero duplicate check numbers or payments found in production data
