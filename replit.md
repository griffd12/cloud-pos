# Cloud POS System

## CRITICAL SYSTEM RULES – READ FIRST

This POS system already has multiple Enterprises configured. There may be:
- Existing Enterprises
- Existing Properties
- Existing RVCs
- Existing Menu, EMC, and configuration data already in use

### What is NOT Allowed
- Delete existing configuration
- Rename existing configuration
- Change the meaning or behavior of existing configuration
- Break or invalidate any existing Enterprise setup

### All Changes MUST be NON-DESTRUCTIVE and ADDITIVE ONLY

**Definitions:**
- **ADDITIVE** = new fields, new options, new configuration records, or new logic that does not alter existing behavior
- **NON-DESTRUCTIVE** = existing Enterprises continue to work exactly as before without modification

### When Making ANY Change
1. Assume existing Enterprises are already live and operational
2. Existing configurations must continue to function without requiring edits
3. No existing data may be removed or overwritten
4. No defaults may be changed retroactively

### Enterprise Configuration Rules
Any new feature, field, or configuration must:
- Be OPTIONAL for existing Enterprises
- Default to OFF or NULL for existing Enterprises
- Be explicitly enabled per Enterprise, Property, or RVC if needed

### EMC (Enterprise Management Console) Rules
- If a new configuration option is added:
  - ALL Enterprises must see the new option in EMC
  - Existing Enterprises must retain their current values
  - New Enterprises must inherit the new option with safe defaults
- EMC pages must be UPDATED, not recreated
- Existing EMC pages must not be replaced or removed

### Multi-Enterprise Rule (CRITICAL)
- Changes must apply consistently across:
  - Enterprise A (existing)
  - Enterprise B (existing)
  - Any future Enterprise C, D, etc.
- The system must NEVER assume there is only one Enterprise

### Migration & Versioning Rules
- If a database change is required:
  - Use versioned migrations only
  - Never drop columns or tables used by existing Enterprises
  - Add new columns as nullable or with safe defaults
- No migration may require manual intervention for existing Enterprises

### Before Making Any Change, You MUST
1. State whether the change is additive or destructive
2. Confirm that no existing Enterprise configuration will be altered
3. Confirm how the change appears in EMC for:
   - Existing Enterprises
   - New Enterprises

### If a Requested Change Would Break Existing Enterprises
- You must REFUSE the change
- You must propose a safe alternative that preserves compatibility

## Overview
This project is an enterprise cloud-based Quick Service Restaurant (QSR) Point of Sale system designed for high-volume environments. It features a multi-property hierarchy (Enterprise → Property → Revenue Center), Kitchen Display System (KDS) integration, and comprehensive admin configuration, leveraging a Simphony-class design pattern for configuration inheritance with override capabilities. The system supports device configuration, real-time KDS order flow, robust time & attendance, PCI-compliant payment processing, and extensive enterprise capabilities including fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. An optional CAPS (Central Application Processing Service) provides a hybrid cloud/on-premise architecture for offline resilience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Principles
- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center for scalable management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming optimized for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS updates and CAPS synchronization.
- **Offline Resilience**: Optional on-premise CAPS with local SQLite for offline operations and cloud synchronization.

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, React Context, shadcn/ui, Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, RESTful JSON API with WebSocket support.
- **Database**: PostgreSQL with Drizzle ORM.
- **Offline Storage**: Browser IndexedDB for client-side offline resilience.

### Key Features and Implementations
- **Device Configuration**: Simphony-style configuration for Workstations, Printers, and KDS Devices with hierarchical overrides.
- **KDS Order Flow**: Supports "Standard Mode" and "Dynamic Order Mode" with real-time WebSocket updates.
- **Authentication**: PIN-based employee authentication with role-based access control and manager approval.
- **Time & Attendance**: Comprehensive time clock, timecards, scheduling, and labor analytics.
- **Payment Processing**: PCI-compliant, gateway-agnostic framework.
- **Printing System**: Comprehensive receipt and report printing with network printer support (ESC/POS) via a database-backed print queue and a standalone Print Agent System.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty Programs, Online Ordering Integration, Inventory Management, Sales & Labor Forecasting.
- **Pizza Builder Module**: Full-page visual pizza customization interface at `/pizza-builder/:menuItemId`. Features:
  - Visual SVG pizza graphic with topping dots using deterministic pseudo-random placement
  - Section selection modes: Whole pizza, Half (Left/Right), Quarter (4 sections)
  - Topping selection by category (Proteins, Market, Cheese, Premium) with size-based pricing
  - Quantity adjustment per topping (1x, 2x, 3x) with section-specific placement
  - Base sauce selection (Marinara, Alfredo, Olive Oil, BBQ, Ranch)
  - Auto-detection of pizza items in POS by name pattern ("classic pizza", "gluten crust", "create your own pizza")
  - Seamless integration with check flow - adds pizza with all selected modifiers to current check

## Security Mode Status

**SECURITY FEATURES DISABLED** - The system currently operates in an open-access mode:
- Device enrollment/token validation is bypassed
- POS and KDS are accessible directly from any web browser without CAL Setup Wizard
- WebSocket connections don't require device or EMC authentication
- Print agents can connect without strict token validation (just need agent ID)
- The following EMC pages have been removed: Device Hub, CAL Packages, Services, Connectivity Test, Registered Devices

This simplified mode allows the system to work as a standard web-based POS without on-premise security requirements. All payment functionality remains fully operational.

## Terminology
- **Print Agent**: Software running on a local machine that handles network printer communication

## External Dependencies

### Database
- PostgreSQL

### UI Libraries
- Radix UI
- Embla Carousel
- cmdk
- react-day-picker
- react-hook-form
- Recharts

### Payment Gateways
- Stripe (card-not-present / online payments)
- Elavon Converge (EMV terminal integration)
- Elavon Fusebox (EMV terminal with multi-processor support)
- Heartland / Global Payments (EMV terminal + online via Portico gateway)
  - Card-Present: Site ID, License ID, Device ID, Username, Password, Developer ID, Version Number
  - Card-Not-Present: Secret API Key, Developer ID, Version Number
  - Sandbox URL: https://cert.api2.heartlandportico.com
  - Production URL: https://api2.heartlandportico.com

## Follow-Up / Future Enhancements

### Oracle Simphony-Style Multi-Tenant Architecture (Priority: High)
The current system uses a shared PostgreSQL database with enterprise ID filtering for data isolation. To match Oracle Simphony's MTU (Multi-Tenant Unit) model for better isolation and disaster recovery:

1. **Company Code Login**
   - EMC login screen: Enter Company Code + Username + Password
   - Example: Company Code `BOM` (Blue Oceans Management) → dgriffin → password
   - User sees only their enterprise's data (properties, employees, sales, reports)

2. **Per-Enterprise URLs**
   - Subdomain-based: `bom.yourpos.com`, `acme.yourpos.com`
   - Or tenant-based routing: `yourpos.com/bom/emc`, `yourpos.com/acme/pos`

3. **Separate Databases per Enterprise** (Future)
   - Each enterprise gets its own PostgreSQL database
   - If one database crashes, other enterprises continue operating
   - Enhanced disaster recovery and complete data isolation

4. **Benefits**
   - Complete data isolation between customers
   - No single point of failure for all customers
   - Clear branding/identity per customer
   - Simphony-familiar login experience

### Current Multi-Tenant Status
- **Working**: Enterprise ID filtering across all 56+ EMC pages, POS, KDS, reports
- **Working**: New enterprises start with blank EMC (no shared data)
- **Working**: CAPS with local SQLite provides offline resilience per property
- **Needed**: Company code login, per-customer URLs, separate databases

## Native Applications (Android & Windows)

The Cloud POS system can be deployed as native applications for Android and Windows while maintaining 100% feature parity with the web version.

### Architecture
- **Web App**: The existing React frontend runs unchanged
- **Native Wrappers**: Capacitor (Android) and Electron (Windows) wrap the web app in native containers
- **Cloud Backend**: EMC remains fully cloud-based; POS connects to cloud or on-premise CAPS

### Project Structure
```
native/           # Documentation and native-specific configs
├── android/      # Android configuration docs
├── windows/      # Windows/Electron configuration docs
└── README.md     # Native apps overview

android/          # Capacitor Android project (auto-generated)
electron/         # Electron main process and config
├── main.js       # Electron main process
├── preload.js    # Secure IPC bridge
└── electron-builder.json
```

### Building Native Apps

**Android:**
```bash
npm run build                  # Build web app
npx cap sync android           # Sync to Android
npx cap open android           # Open in Android Studio
```

**Windows:**
```bash
npm run build                           # Build web app
npx electron electron/main.cjs          # Run in dev mode
npx electron-builder --config electron/electron-builder.json  # Build installer
```

### Feature Parity Guarantee
All POS functionality is preserved:
- Menu display, ordering, modifiers, pizza builder
- Check management and payment processing
- KDS integration and real-time updates
- Receipt printing (network printers or native plugins)
- Employee auth, time clock, manager approvals
- Full EMC access via cloud