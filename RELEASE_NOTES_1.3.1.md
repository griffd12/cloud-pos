# Cloud POS v1.3.1 Release Notes

## New Features

### EMC Scope-Based Configuration (Simphony-Style)
- **EMC Filter Bar as Universal Scope Selector**: The Enterprise > Property > RVC filter bar at the top of all EMC admin pages now determines where configuration items are created
  - **All Properties selected** = items are created enterprise-wide (available to all properties and RVCs)
  - **Specific Property selected** = items are created for that property and its RVCs only
  - **Specific Property + RVC selected** = items are created for that specific RVC only
- **RVC Selection Persistence**: Added Revenue Center selection to the EMC context with session storage persistence, so your scope selection is maintained as you navigate between pages
- **Selection Cascade**: Changing the enterprise clears property and RVC selections; changing the property clears the RVC selection
- **30+ Admin Pages Updated**: All configuration pages now consistently use the filter bar scope instead of having separate property selectors inside creation dialogs

### Configuration Pages Updated
- Menu Items, SLUs, Modifiers, Modifier Groups, Discounts, Tax Groups
- Tenders, Service Charges, Print Classes, Employees, Roles, POS Layouts
- Loyalty Programs, Major Groups, Family Groups, Gift Cards, Jobs
- Overtime Rules, Break Rules, Payment Processors, Printers, Workstations
- KDS Devices, Order Devices, Terminal Devices, Print Agents, Registered Devices
- Minor Labor, Descriptors, CAL Packages, Accounting Export, Tip Pooling, Fiscal Close
- Tip Rules, Service Hosts, Devices

### Operational Pages Enhanced
- Timecards, Scheduling, Cash Management, Fiscal Close, Labor Analytics
- Inventory, Forecasting, Line-Up, Item Availability, Online Ordering
- Utilities, Break Monitoring, Break Violations, Manager Alerts
- Connectivity Test, Accounting Export
- These operational pages now auto-sync to the EMC filter bar's property selection, so when you select a property in the filter bar, operational pages default to showing that property's data

## Bug Fixes

### Gift Card Reload - Payment-First Flow
- **Fixed**: Gift card reload now follows the same payment-first flow as gift card sales
- Reload amount is added as a line item on the check ("GC Reload XXXX")
- Card balance is **only updated after payment is completed** -- no value is added to the card until the cashier settles the check
- Marked as non-revenue (liability) consistent with gift card sale accounting
- Auto-creates a check if none is open, matching the sell flow behavior

### POS Loyalty Member Enrollment
- **Fixed**: Loyalty enrollment form now properly finds active loyalty programs by filtering with the correct enterprise context
- Previously, the programs query was missing the enterprise filter, causing "No active loyalty program" errors
- Enterprise ID is now passed from the POS workstation context to the customer/loyalty modal

### Offline Login Freeze
- **Fixed**: System no longer freezes when internet is disconnected
- The default data fetcher now includes IndexedDB cache fallback -- when the network is unreachable, cached data (workstation config, RVCs, employee data) is served from the local browser cache
- Login page renders correctly with cached data, allowing PIN-based offline authentication to proceed
- Offline mode is detected and flagged automatically, enabling the offline sign-in flow

## Upgrade Notes

- **Cloud/Web POS stations**: Republishing the server applies all fixes immediately -- no installer needed
- **Windows Electron stations**: Update recommended for the offline login fix to ensure the corrected code is cached locally for reliable offline operation
- Existing gift card balances are not affected -- only new reload operations use the payment-first flow
- All EMC configuration pages now use the filter bar for scope -- no more property dropdowns inside creation dialogs
- **Planned for future release**: Simphony-style configuration inheritance/override -- items configured at a higher level will automatically inherit down, with the ability to override specific fields at lower levels without changing the parent
