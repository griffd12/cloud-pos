# Cloud POS System

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system specifically designed for Quick Service Restaurants (QSRs) operating in high-volume environments. It delivers a scalable and robust solution with extensive administrative configuration capabilities and real-time operational features. The system supports a multi-property hierarchy, integrates with Kitchen Display Systems (KDS), and includes comprehensive enterprise functionalities such as fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. It employs a Simphony-class design for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. The vision is to provide a highly flexible and reliable POS system deployable across various QSR operations, ensuring continuous service even in offline conditions, and supporting both web and native application environments (Android & Windows).

## User Preferences
Preferred communication style: Simple, everyday language.
- **Release Notes Requirement**: Whenever a new Electron installer version is created (version bump in `electron/electron-builder.json`), always generate release notes summarizing all changes included in that version. Format them for use as GitHub Release descriptions.
- **Database Schema Documentation**: The file `DATABASE_SCHEMA.md` in the project root is a living reference document that must be kept up to date whenever any database schema changes are made (new tables, columns, constraints, indexes, or relationship changes).

## System Architecture

### Core Design Principles
- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center for scalable management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming optimized for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS updates and CAPS synchronization.
- **Offline Resilience**: Optional on-premise CAPS with local SQLite for offline operations and cloud synchronization.
- **Non-Destructive Changes**: All system modifications must be additive and not alter existing enterprise configurations. New features must be optional and default to OFF/NULL for existing enterprises.

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, React Context, shadcn/ui, Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, RESTful JSON API with WebSocket support.
- **Database**: PostgreSQL with Drizzle ORM.
- **Offline Storage**: Browser IndexedDB for client-side offline resilience.
- **Native Applications**: Capacitor (Android) and Electron (Windows) wrappers for web app deployment with 100% feature parity.

### Key Features and Implementations
- **Device Configuration**: Hierarchical setup for Workstations, Printers, and KDS Devices.
- **KDS Order Flow**: Supports "Standard Mode" and "Dynamic Order Mode" with real-time updates.
- **Authentication**: PIN-based employee authentication with role-based access control.
- **Time & Attendance**: Time clock, timecards, scheduling, and labor analytics.
- **Payment Processing**: PCI-compliant, gateway-agnostic framework.
- **Printing System**: Database-backed print queue and standalone Print Agent System for network (ESC/POS) printers.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty Programs, Online Ordering, Inventory, Sales & Labor Forecasting.
- **Pizza Builder Module**: Visual, full-page interface for pizza customization.
- **Multi-Enterprise Architecture**: Server-side data isolation enforced via `getEnforcedEnterpriseId()` helper; `system_admin`, `enterprise_admin`, `property_admin` access levels.
- **Native Application Capabilities (Windows Electron)**: Embedded print agent, SQLite/SQLCipher for offline data caching, local reporting, store-and-forward for offline transactions, EMV terminal communication, auto-launch, kiosk mode, and a terminal setup wizard.
- **Offline Database Sync**: Critical POS tables synced from cloud to offline database.
- **Electron Protocol Interceptor**: Routes API calls to local SQLite when offline and serves cached static assets.
- **Offline-Aware Fetch**: `fetchWithTimeout()` and `getQueryFn` cache GET responses to IndexedDB and serve cached data transparently when offline.
- **Orders Screen Redesign**: Card-based orders view with order type tabs and filters, displaying order details and quick-action buttons for lifecycle management.
- **Customer Member Enrollment**: Allows member creation from POS with auto-enrollment in active loyalty programs.
- **EMC Simphony-Style MDI Layout**: Three-panel layout (hierarchy tree, category navigation, configuration panels) with inline rendering.
- **Configuration Inheritance & Override**: Items inherit down the hierarchy, with override capabilities tracked via `config_overrides` table.
- **Concurrency-Safe Check Numbering**: Atomic check number generation using `rvc_counters` table and `createCheckAtomic()` method to ensure unique, sequential numbers without gaps.
- **Stress Test Infrastructure**: API-driven and visual POS stress testing for performance evaluation, generating realistic transactions with configurable parameters and automatic data cleanup.
- **Display Font Scaling**: Per-workstation and per-KDS-device font size control using root font-size scaling.
- **Auto-Startup on Boot (Windows)**: Registers POS or KDS for auto-launch using Electron's `setLoginItemSettings`.
- **Service Charge Ledger System**: `check_service_charges` transactional table with configuration fields on `service_charges`, supporting application API, manual override, and voiding.
- **Canonical Reporting DAL**: 7 query functions (`v_sales_lines`, `v_check_discounts`, etc.) parameterized by `propertyId` + `businessDate`.
- **FOH/BOH Reports**: 6 report endpoints including Z Report, Cash Drawer Report, Cashier Report, Daily Sales Summary, Labor Summary, and Tip Pool Summary.
- **Report Validation**: `/api/reports/validate` runs 4 invariant checks for reconciliation and data integrity.
- **Cash Drawer Enforcement**: Cash tenders require `drawerAssignmentId`; `cash_transactions` rows are auto-created for sales/refunds.
- **Customer Onboarding Data Import**: Excel-based bulk data import system covering all database entities with dependency ordering and cross-sheet validation.
- **Delivery Platform Integration APIs**: Direct API integrations with Uber Eats, DoorDash, and Grubhub for order parsing, acceptance, menu sync, and store status management.

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