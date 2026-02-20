# Cloud POS 3.0 — Product Roadmap

## Vision

Cloud POS 3.0 transitions the system from a partially hardcoded architecture to a fully **configuration-driven, option-bit system** — modeled after Oracle Simphony's design philosophy. Every operational behavior will be controlled by database settings exposed through the EMC (Enterprise Management Console), not by hardcoded logic in the application code.

The code reads configuration at runtime; the EMC tells the system what to do.

---

## Architecture Principle

> **"The tender type is for classification and reporting. The tender's configuration flags control behavior."**

All runtime decisions (pop drawer, print receipt, allow tips, etc.) must read from database columns on the relevant configuration record — never from `if (tender.type === "cash")` or similar hardcoded type checks.

---

## Audit Summary (Current State)

| EMC Area | Config-Driven | Hardcoded | Priority |
|---|---|---|---|
| Tender Media | Partial | High | **HIGH** |
| RVC Settings | Partial | Medium | **HIGH** |
| Workstation | Mostly Good | Low | MEDIUM |
| Menu Items & Modifiers | Good | Minimal | LOW |
| Discounts | Good | Minimal | LOW |
| Service Charges | Good | Minimal | LOW |
| KDS / Order Devices | Good | Minimal | LOW |
| Printing | Partial | Medium | **HIGH** |
| Payment Processing | Partial | Medium | MEDIUM |
| Pizza Builder | Standalone | Low | LOW |

---

## Phase 1: Tender Media Configuration (HIGH PRIORITY)

### Problem

The `tenders` table currently has: `name`, `code`, `type`, `paymentProcessorId`, `active`, `isSystem`.

All behavioral decisions are hardcoded against `tender.type === "cash"` in `pos.tsx` and `routes.ts`. This means:
- Cash drawer pop is hardcoded to cash tenders only
- Over-tendering is hardcoded to cash tenders only
- Tip prompts are not configurable per tender
- Receipt printing behavior is not per-tender

### New Database Columns for `tenders` Table

| Column | Type | Default | Description |
|---|---|---|---|
| `pop_drawer` | boolean | `true` (cash), `false` (others) | Whether applying this tender triggers a cash drawer kick |
| `allow_tips` | boolean | `true` (credit), `false` (cash) | Whether to show tip prompt when this tender is selected |
| `allow_over_tender` | boolean | `true` (cash), `false` (others) | Whether the tendered amount can exceed the check balance (enables change due) |
| `print_check_on_payment` | boolean | `true` | Whether to auto-print a receipt when this tender closes a check |
| `max_payment_amount` | decimal(10,2) | `NULL` | Maximum single payment amount allowed (NULL = no limit) |
| `require_manager_approval` | boolean | `false` | Whether applying this tender requires manager PIN |
| `display_order` | integer | `0` | Sort order in the payment modal |

### EMC UI Changes

- Tender form gets new section: **"Tender Behavior"** with toggles for each flag
- Each toggle clearly labeled with description

### Code Refactoring

**Files affected:**
- `client/src/pages/pos.tsx` — Replace `tender.type === "cash"` checks with `tender.popDrawer`, `tender.allowOverTender`
- `client/src/components/pos/payment-modal.tsx` — Read `tender.allowTips`, `tender.allowOverTender` from DB
- `server/routes.ts` — Use `tender.popDrawer` for drawer kick decision, `tender.printCheckOnPayment` for auto-print
- `shared/schema.ts` — Add new columns to `tenders` table
- `client/src/pages/emc.tsx` — Update tender form in EMC

### Specific Hardcoded Logic to Remove

1. **`pos.tsx:854-857`** — `const isCashTender = appliedTender?.type === "cash"` → Replace with `appliedTender?.popDrawer`
2. **`pos.tsx:855`** — `const shouldKickDrawer = isCashTender && wsContext?.workstation?.cashDrawerAutoOpenOnCash` → Replace with `appliedTender?.popDrawer && wsContext?.workstation?.cashDrawerEnabled`
3. **`pos.tsx:856`** — `if (shouldKickDrawer && result.status !== "closed")` → Remove the `result.status !== "closed"` guard; tender says pop = pop always
4. **`routes.ts:5721`** — `const hasCashPayment = tender?.type === "cash"` → Replace with `tender?.popDrawer`
5. **`routes.ts:5390`** — `if (tender.type === "cash")` → Review and replace with config flag
6. **`routes.ts:6901`** — `const isCardTender = tender && tender.type === "credit"` → Replace with appropriate config flag
7. **`payment-modal.tsx`** — Over-tender logic checks → Read from `tender.allowOverTender`

---

## Phase 2: RVC Printing Settings (HIGH PRIORITY)

### Problem

Receipt printing is hardcoded to always auto-print when a check closes (`routes.ts:5719`). There is no "print on demand" option. Number of copies is always 1.

### New Database Columns for `rvcs` Table

| Column | Type | Default | Description |
|---|---|---|---|
| `receipt_print_mode` | text | `'auto_on_close'` | `'auto_on_close'` = print when check closes; `'on_demand'` = only print when operator presses Print key |
| `receipt_copies` | integer | `1` | Number of receipt copies to print |
| `kitchen_print_mode` | text | `'auto_on_send'` | `'auto_on_send'` = print when items are sent; `'on_demand'` = manual only |
| `void_receipt_print` | boolean | `true` | Whether to auto-print a void receipt |
| `require_guest_count` | boolean | `false` | Whether guest count is required before adding items |

### EMC UI Changes

- RVC settings form gets new section: **"Printing"** with:
  - Receipt Print Mode dropdown (Auto Print on Close / Print on Demand)
  - Receipt Copies number input
  - Kitchen Print Mode dropdown
  - Void Receipt Print toggle
- RVC settings form gets new section: **"General"** with:
  - Require Guest Count toggle

### Code Refactoring

**Files affected:**
- `server/routes.ts` — Check `rvc.receiptPrintMode` before auto-printing; support copy count
- `shared/schema.ts` — Add new columns to `rvcs` table
- `client/src/pages/emc.tsx` — Update RVC settings form

### Specific Hardcoded Logic to Remove

1. **`routes.ts:5719-5738`** — Auto-print block executes unconditionally → Wrap in `if (rvc.receiptPrintMode === 'auto_on_close')` check
2. **`routes.ts:20106`** — Same auto-print pattern in refund flow → Same fix

---

## Phase 3: Workstation Cash Drawer Refinement (MEDIUM PRIORITY)

### Current State

Workstation cash drawer settings are already mostly configurable:
- `cashDrawerEnabled`, `cashDrawerPrinterId`, `cashDrawerKickPin`, `cashDrawerPulseDuration`
- `cashDrawerAutoOpenOnCash`, `cashDrawerAutoOpenOnDrop`

### Combined Policy Model

The drawer kick decision becomes a **two-level policy**: the tender says "I want to pop" AND the workstation says "I have a drawer and allow it."

**Runtime logic:**
```
if (tender.popDrawer && workstation.cashDrawerEnabled && workstation.cashDrawerAutoOpenOnCash) {
  kickDrawer();
}
```

- Keep `cashDrawerEnabled` on workstation (controls whether this station HAS a drawer)
- Keep `cashDrawerAutoOpenOnCash` on workstation (workstation-level override to disable drawer pops even if tender wants it)
- Keep hardware settings (`cashDrawerPrinterId`, `cashDrawerKickPin`, `cashDrawerPulseDuration`)
- Keep `cashDrawerAutoOpenOnDrop` — this is workstation-specific behavior for cash drops
- The key change: remove `tender.type === "cash"` checks; use `tender.popDrawer` instead

---

## Phase 4: Payment Processing Refinement (MEDIUM PRIORITY)

### Current State

Payment processors are configurable in DB. Tender-to-processor linkage exists. EMV terminal settings exist.

### Potential Additions

| Column | Table | Description |
|---|---|---|
| `require_signature_above` | `tenders` | Dollar amount above which signature is required |
| `allow_partial_payment` | `tenders` | Whether this tender can be used for partial payments |
| `allow_split_tender` | `rvcs` | Whether split-tender payments are allowed |
| `tip_suggestion_percentages` | `rvcs` | JSON array of suggested tip percentages (e.g., `[15, 18, 20, 25]`) |
| `pre_auth_enabled` | `tenders` | Whether to pre-authorize card payments |

---

## Phase 5: Menu & Modifier Enhancements (LOW PRIORITY)

### Current State

Menu items and modifiers are already well config-driven:
- Price, tax group, print class, major/family groups, SLU assignments
- Modifier groups with required flag, min/max selections
- Modifier prices and upcharges

### Potential Additions

| Column | Table | Description |
|---|---|---|
| `allow_price_override` | `menu_items` | Whether this item's price can be changed at POS |
| `require_manager_for_void` | `menu_items` | Whether voiding this item requires manager approval |
| `max_quantity` | `menu_items` | Maximum quantity per line item |
| `open_price` | `menu_items` | Whether this item has an open (variable) price |
| `default_modifier_id` | `modifier_group_items` | Pre-selected modifier in a group |

---

## Phase 6: Discount Enhancements (LOW PRIORITY)

### Current State

Discounts have: type, value, requiresManagerApproval, hierarchy scoping.

### Potential Additions

| Column | Table | Description |
|---|---|---|
| `applicable_order_types` | `discounts` | Which order types this discount applies to |
| `applicable_tender_types` | `discounts` | Which tenders this discount is compatible with |
| `max_discount_amount` | `discounts` | Cap on discount amount |
| `combinable` | `discounts` | Whether this discount can stack with others |
| `schedule_start` / `schedule_end` | `discounts` | Time-based availability (happy hour, etc.) |
| `day_of_week` | `discounts` | Day-based availability |

---

## Phase 7: Service Charge Enhancements (LOW PRIORITY)

### Current State

Already well-architected with: type, value, autoApply, orderTypes, taxability, tip pool posting.

### Potential Additions

| Column | Table | Description |
|---|---|---|
| `min_guest_count` | `service_charges` | Auto-apply only when guest count exceeds threshold (e.g., large party charge) |
| `schedule_based` | `service_charges` | Time-of-day auto-application |
| `allow_manual_override` | `service_charges` | Whether cashier can remove auto-applied charges |

---

## Migration Strategy

1. **One EMC page at a time** — Complete each phase before starting the next
2. **Non-destructive** — All new columns have sensible defaults; existing data unaffected
3. **Backward compatible** — If a flag is NULL, fall back to current behavior
4. **Data migration** — Set defaults based on current `type` field (e.g., cash tenders get `popDrawer = true`)
5. **Test at each phase** — Verify existing functionality isn't broken before moving on
6. **Version the Electron installer** — Major version bump to 3.0.0 when Phase 1+2 are complete

---

## Files That Will Be Modified (Across All Phases)

| File | Changes |
|---|---|
| `shared/schema.ts` | New columns on `tenders`, `rvcs`, `menu_items`, `discounts`, `service_charges` |
| `server/routes.ts` | Replace all `tender.type === "cash"` / `"credit"` checks with config flag reads |
| `client/src/pages/pos.tsx` | Replace hardcoded tender-type logic with config-driven logic |
| `client/src/components/pos/payment-modal.tsx` | Read tender config for tips, over-tender, etc. |
| `client/src/pages/emc.tsx` | New form fields and sections for all config options |
| `client/src/pages/admin/workstation-form.tsx` | Update drawer logic description |
| `server/storage.ts` | Update IStorage interface for new fields |
| `DATABASE_SCHEMA.md` | Document all new columns |
| `electron/electron-builder.json` | Version bump to 3.0.0 |

---

## Additional Hardcoded Behaviors Identified

These items were identified during the audit review and should be addressed within the relevant phases:

### Payment Processor Validation (Phase 1/4)
- **`routes.ts:3901`** — `if (validated.type === "credit" || validated.type === "debit") && !validated.paymentProcessorId)` — This validation is correct (credit/debit tenders need a processor) but should be expressed as a tender config flag like `requiresPaymentProcessor` rather than checking the type string.

### Price Override Manager Approval (Phase 5)
- **`price-override-modal.tsx:25`** — `requireManagerApproval = true` is the default prop. This should be driven by a per-menu-item `allow_price_override` and `require_manager_for_override` flag in the database, not a hardcoded default.

### Void/Reprint Print Triggers (Phase 2)
- Void receipt printing and reprint flows in `routes.ts` and print service need audit for hardcoded print-always behavior. These should respect the RVC `receipt_print_mode` setting or have their own config flags.

### Kitchen Printing (Phase 2)
- Kitchen print triggers on item send are currently always-on. A `kitchen_print_mode` setting on the RVC would allow "print on demand" for environments that use KDS exclusively without kitchen printers.

---

## Changelog

| Date | Change |
|---|---|
| 2026-02-20 | Initial roadmap created from full EMC audit |
| 2026-02-20 | Updated Phase 3: Combined policy model (tender + workstation) instead of deprecating workstation flags |
| 2026-02-20 | Added: Additional hardcoded behaviors section (processor validation, price override defaults, void/reprint triggers) |

---

## Notes

- This roadmap is a living document. Add items as new configuration needs are identified.
- Priority order: Phase 1 (Tenders) → Phase 2 (RVC Printing) → Phase 3 (Workstation) → Phase 4+ (as needed)
- The goal is zero `tender.type === "cash"` checks in the codebase by the end of Phase 1.

---

*Document created: February 20, 2026*
*Last updated: February 20, 2026*
