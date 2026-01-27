# Cloud POS System

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
- **Hybrid Architecture (V2)**: Introduces an optional on-premise CAPS (Node.js with SQLite) for offline resilience (yellow/red modes) with cloud sync infrastructure.
- **CAL Package Deployment Pipeline**: Oracle Simphony-style system for distributing software packages (CAL Packages) to CAPS hosts and workstations, enabling automatic updates via a CAL Client Background Service.
- **CAL Setup Wizard**: An Electron Desktop App for device initialization that automatically provisions services based on workstation configuration in EMC. Uses `C:\OPH-POS` as root directory. Features:
  - Reads workstation service bindings from EMC (CAPS, Print Controller, KDS Controller, Payment Controller)
  - **CAPS Provisioning**: Creates CAPS service records with secure tokens, saves config.json with cloudUrl/serviceHostId/token/propertyId, initializes ServiceHost/data directory for SQLite database
  - **Print Controller**: Auto-creates Print Agents with secure tokens, downloads and configures Print Agent software
  - **Payment Controller**: Saves payment-controller.json with gateway configuration
  - Reports setup status (in_progress, completed, failed) back to EMC
  - Displays setup status badges in device list for easy monitoring
- **Device Binding Security**: SHA-256 hashed device tokens ensure secure access to POS/KDS functionality via REST API middleware and WebSocket authentication.
- **Config Sync Service**: Cloud to local SQLite synchronization for all entity types (hierarchy, menu, employees, devices, operations, POS layouts, payments, loyalty) with version tracking and real-time updates.
- **CAPS SQLite Schema**: Comprehensive local database schema mirroring cloud PostgreSQL for full offline POS operations, including configuration, menu, devices, transactions, payments, KDS, cash management, time & attendance, fiscal operations, loyalty, gift cards, and orders.
- **Pizza Builder Module**: Full-page visual pizza customization interface at `/pizza-builder/:menuItemId`. Features:
  - Visual SVG pizza graphic with topping dots using deterministic pseudo-random placement
  - Section selection modes: Whole pizza, Half (Left/Right), Quarter (4 sections)
  - Topping selection by category (Proteins, Market, Cheese, Premium) with size-based pricing
  - Quantity adjustment per topping (1x, 2x, 3x) with section-specific placement
  - Base sauce selection (Marinara, Alfredo, Olive Oil, BBQ, Ranch)
  - Auto-detection of pizza items in POS by name pattern ("classic pizza", "gluten crust", "create your own pizza")
  - Seamless integration with check flow - adds pizza with all selected modifiers to current check

## Terminology
- **Services**: User-facing EMC navigation label (Admin > Services)
- **CAPS**: Central Application Processing Service - the core on-premise service handling checks, transactions, and local database
- **Host Workstation**: The PC/workstation designated to run a service (CAPS, Print, KDS, or Payment)

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