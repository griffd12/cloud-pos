# Cloud POS v1.3.0 - Release Notes

## Security: Removed Reset Device from POS Interface
- **Removed "Reset Device" button** from the Functions modal on the POS screen
- **Removed "Reset Device" menu item** from the login screen settings dropdown
- Prevents unauthorized users or customers from switching the terminal to a different enterprise/workstation
- To reconfigure a terminal, the app must be uninstalled and reinstalled

## POS Gift Card Reload
- Added **Reload** tab to the POS Gift Card modal allowing cashiers to add funds to existing gift cards during a transaction
- Swipe or enter card number, select or type reload amount with preset quick-select buttons
- Balance check before reload to confirm current card value
- Calls `POST /api/pos/gift-cards/reload` with real-time balance update confirmation

## POS Loyalty Member Enrollment
- Added **New Member Enrollment** form directly in the POS Customer modal
- Cashiers can sign up new loyalty members (first name, last name, phone, email) without leaving the POS screen
- Automatic enrollment into available loyalty programs after member creation
- **Enroll in Program** option for existing members to join additional active loyalty programs
- Edit member profile (name, phone, email) directly from POS
- View member details: points balance, program enrollments, transaction history, and available rewards

## Open Checks Report
- Added **Open Checks** tab to the Reports dashboard
- Summary cards showing total count, total value, and average duration of open checks
- Detailed table with check number, server, table, guest count, amount, and time open
- Filterable by property and revenue center
- Export to CSV, Excel, and PDF formats
