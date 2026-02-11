# Cloud POS v1.3.1 Release Notes

## Bug Fixes

### Gift Card Reload - Payment-First Flow
- **Fixed**: Gift card reload now follows the same payment-first flow as gift card sales
- Reload amount is added as a line item on the check ("GC Reload XXXX")
- Card balance is **only updated after payment is completed** — no value is added to the card until the cashier settles the check
- Marked as non-revenue (liability) consistent with gift card sale accounting
- Auto-creates a check if none is open, matching the sell flow behavior

### POS Loyalty Member Enrollment
- **Fixed**: Loyalty enrollment form now properly finds active loyalty programs by filtering with the correct enterprise context
- Previously, the programs query was missing the enterprise filter, causing "No active loyalty program" errors
- Enterprise ID is now passed from the POS workstation context to the customer/loyalty modal

### Offline Login Freeze
- **Fixed**: System no longer freezes when internet is disconnected
- The default data fetcher now includes IndexedDB cache fallback — when the network is unreachable, cached data (workstation config, RVCs, employee data) is served from the local browser cache
- Login page renders correctly with cached data, allowing PIN-based offline authentication to proceed
- Offline mode is detected and flagged automatically, enabling the offline sign-in flow

## Technical Details

- **Backend**: `/api/pos/gift-cards/reload` endpoint rewritten to create check items with `__giftCardReload` modifier; payment completion flow updated to process reload items alongside gift card activations
- **Frontend**: `queryClient.ts` default `getQueryFn` now catches network errors (AbortError, Failed to fetch) and falls back to IndexedDB-cached responses with automatic offline mode detection
- **Frontend**: `customer-modal.tsx` loyalty programs query now includes `enterpriseId` parameter from workstation context

## Upgrade Notes

- **Cloud/Web POS stations**: Republishing the server applies all fixes immediately — no installer needed
- **Windows Electron stations**: Update recommended for the offline login fix to ensure the corrected code is cached locally for reliable offline operation
- Existing gift card balances are not affected — only new reload operations use the payment-first flow
