# Cloud POS v1.3.8 Release Notes

## Electron Changes

### Maximized Window on Launch
- The application now opens maximized (full screen) on startup for both initial launch and post-setup-wizard
- Setup wizard and kiosk mode are excluded — they retain their own window sizing
- Ensures the POS interface uses the full available screen area immediately without requiring manual window resizing

## Server / Web Changes

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
