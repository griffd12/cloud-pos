# Cloud POS v1.4.9 Release Notes

**Release Date:** February 21, 2026

---

## Windows Print Spooler Support (USB Printers)

- **New `windows_printer` connection type** — USB printers on Windows (e.g., Star TSP100III) are now fully supported through the Windows Print Spooler. Previously, USB printers could only be configured as serial (COM port) devices, which didn't work for printers that appear as Windows Spooler devices rather than COM ports.
- **PowerShell raw port printing** — The Electron Print Agent now uses PowerShell to look up the printer's port via `Get-WmiObject Win32_Printer` and writes ESC/POS data directly to the port handle, ensuring raw binary commands (receipts, drawer kicks) reach the printer without driver interference.
- **Printer Discovery** — New `DISCOVER_PRINTERS` WebSocket message allows the server to request enumeration of all Windows printers installed on an agent's workstation. The agent responds with printer names, ports, drivers, and status.
- **EMC Configuration** — The Printers admin panel now shows "Windows USB Printer" as a connection type option. When selected, it presents a text field for the exact Windows printer name (from Devices and Printers) and a host workstation selector.
- **Cash drawer kick via Windows printers** — Drawer kick ESC/POS commands are now routed through the Windows Print Spooler path, so cash drawers connected to USB receipt printers work correctly.
- **Test print support** — The test print endpoint now accepts `windowsPrinterName` and validates it for the `windows_printer` connection type.

## Hierarchical Payment Gateway Configuration

- **Simphony-style inheritance** — Payment gateway settings now follow Enterprise > Property > Workstation hierarchy with configuration inheritance and per-level override capability.
- **`payment_gateway_config` table** — New database table stores gateway configuration at each hierarchy level.
- **EMC configuration panel** — Shows inherited values with badges, override toggles, and merged config resolution via `getMergedPaymentGatewayConfig()`.
- **Gateway-aware UI** — Selecting a gateway type (Heartland, Elavon, Stripe, Shift4, FreedomPay, Eigen, North/Ingenico) dynamically shows only supported fields with processor-specific labels and descriptions.
- **Apply Defaults button** — Pre-fills recommended settings per processor from the gateway field registry.

## Context Help System

- **ContextHelpWrapper component** — Every EMC option bit and configuration field now has a help icon (?) that displays a plain-English description on click.
- **Config help text registry** — Centralized registry (`client/src/lib/config-help-registry.ts`) maps field identifiers to help text descriptions.
- **Payment gateway field help** — All payment gateway configuration fields include contextual help text explaining what each setting does.

## Semi-Integrated Payment Terminal Support

- **Semi-integrated payment architecture** — Card-present payment processing now uses a model where the POS sends high-level commands (sale, void, refund) to physical payment terminals, and the terminals handle card reading, EMV chip processing, and processor communication.
- **Integration model classification** — Processors classified as `direct`, `direct_with_terminal` (Stripe), or `semi_integrated` (Heartland, Elavon Fusebox, Ingenico, Shift4, FreedomPay, Eigen).
- **Heartland adapter** — First semi-integrated adapter implementation for Heartland Pay App terminals.
- **Interface types** — Defined in `server/payments/semi-integrated-types.ts` with standard request/response contracts for all semi-integrated processors.

---

## Schema Changes

### `printers` table
- Added `windows_printer_name` (text, nullable) — Windows spooler printer name for USB printers

### `print_jobs` table
- Added `windows_printer_name` (text, nullable) — Windows printer device name for job routing

### `payment_gateway_config` table (new)
- Hierarchical payment gateway configuration with Enterprise/Property/Workstation scope

---

## Files Changed
- `shared/schema.ts` — Added `windowsPrinterName` to printers and print_jobs tables
- `electron/print-agent-service.cjs` — Added `sendToWindowsPrinter()`, `enumerateWindowsPrinters()`, `handleDiscoverPrinters()`, Windows printer support in drawer kick and print job handlers
- `client/src/pages/admin/printers.tsx` — Added Windows USB Printer connection type UI
- `server/routes.ts` — Updated print job creation, routing, and test print to support Windows printers
- `electron/electron-builder.json` — Version bump to 1.4.9
- `DATABASE_SCHEMA.md` — Updated with new columns and tables
