# Cloud POS System

## Overview
This project is an enterprise cloud-based Quick Service Restaurant (QSR) Point of Sale system designed for high-volume environments. It provides a scalable and robust POS solution with comprehensive administrative configuration and real-time operational capabilities. Key features include a multi-property hierarchy, Kitchen Display System (KDS) integration, and extensive enterprise functionalities such as fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. The system leverages a Simphony-class design pattern for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. The business vision is to deliver a highly flexible and reliable POS system that can be deployed across various QSR operations, ensuring continuous service even in offline conditions and supporting both web and native application environments (Android & Windows).

## User Preferences
Preferred communication style: Simple, everyday language.
- **Release Notes Requirement**: Whenever a new Electron installer version is created (version bump in `electron/electron-builder.json`), always generate release notes summarizing all changes included in that version. Format them for use as GitHub Release descriptions.

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
- **Native Applications**: Capacitor (Android) and Electron (Windows) wrappers for web app deployment, offering 100% feature parity.

### Key Features and Implementations
- **Device Configuration**: Hierarchical configuration for Workstations, Printers, and KDS Devices.
- **KDS Order Flow**: Supports "Standard Mode" and "Dynamic Order Mode" with real-time updates.
- **Authentication**: PIN-based employee authentication with role-based access control.
- **Time & Attendance**: Comprehensive time clock, timecards, scheduling, and labor analytics.
- **Payment Processing**: PCI-compliant, gateway-agnostic framework.
- **Printing System**: Database-backed print queue and a standalone Print Agent System for network printer support (ESC/POS).
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty Programs, Online Ordering, Inventory, Sales & Labor Forecasting.
- **Pizza Builder Module**: Visual, full-page interface for pizza customization, integrating with the check flow and adding modifiers.
- **Multi-Enterprise Architecture**: Server-side data isolation enforced via `getEnforcedEnterpriseId()` helper; `system_admin`, `enterprise_admin`, `property_admin` access levels. All EMC API endpoints enforce enterprise boundaries.
- **Native Application Capabilities (Windows Electron)**: Embedded print agent, SQLite/SQLCipher for offline data caching, local reporting, store-and-forward for offline transactions, EMV terminal communication, auto-launch, kiosk mode, and a terminal setup wizard. Includes deferred initialization for services, configuration loading guards, and workstation/RVC sync.
- **Offline Database Sync**: Critical POS tables (menu-items, employees, etc.) are synced from the cloud to the offline database.
- **Electron Protocol Interceptor**: Intercepts HTTPS requests, routing API calls to local SQLite when offline and serving cached static assets.
- **Offline Self-Test**: Diagnostic checks for offline readiness.
- **Unified System Logger**: Centralized logging for all Electron subsystems with rotation and renderer-to-main IPC logging.
- **Offline-Aware Fetch**: `fetchWithTimeout()` and `getQueryFn` cache successful GET responses to IndexedDB (24h TTL) and serve cached data transparently when offline.
- **Customer Member Enrollment (POS)**: Allows member creation from POS, with auto-enrollment in active loyalty programs. Loyalty is property-scoped.
- **EMC Simphony-Style MDI Layout**: The EMC uses a three-panel layout: hierarchy tree (left) for Enterprise > Property > RVC navigation, category navigation (center-left), and embedded configuration panels (right). No popup dialogs — all pages render inline. Tree selection drives scope context via `useEmc()` hook. Page visibility adapts based on tree level (enterprise-only pages, property-required pages).
- **Configuration Inheritance & Override**: Items at enterprise level inherit down to all properties and RVCs. Zone and Inheritance columns show origin and whether items are "Inherited" or "Defined Here". Override creates a local copy at the current scope level. Deleting an override restores the inherited version. Override tracking via `config_overrides` table with `useConfigOverride()` hook.
- **EMC Scope-Based Configuration**: The hierarchy tree acts as a universal scope selector, determining where items are programmed (enterprise-wide, property-wide, or RVC-only).
- **Offline PIN Authentication**: Falls back to locally cached employee records in IndexedDB for authentication when offline.
- **Auto-Updater**: `electron-updater` integration for background updates, notifying the user via IPC, with manual check and update banner.
- **Setup Wizard URL Validation**: Ensures robust server URL validation and error handling.
- **Electron Startup Loading Screen**: Displays an inline HTML loading page and error pages for connection failures.
- **React ErrorBoundary**: Catches rendering errors, shows a user-friendly fallback, and logs errors to the unified system log.
- **Stress Test Infrastructure**: API-driven performance testing via `/api/stress-test/start|stop|status|cleanup`. Creates real POS transactions (check create → add items → send → tender) with `testMode=true` flag. Test checks are automatically excluded from all sales reports, fiscal totals, and open checks queries via `getChecks()` filter. Configurable patterns (single/double/triple item), target tx/min, and duration. Cleanup purges all test data (checks, items, payments, rounds, KDS tickets). Implemented in `server/stressTest.ts`.
- **Visual POS Stress Test**: Accessible from POS Functions > Stress Test button. Drives the actual POS UI in real-time — you see checks open, items appear on the check panel, orders send, payments process, and checks close automatically. Features a dark overlay with live metrics (tx count, success/fail, avg/min/max ms, tx/min, progress bar). Configurable duration, speed, item patterns, and tender. Screen flashes with color-coded phases (blue=create, green=items, orange=send, purple=pay). Auto-cleans test data on completion/stop. Component: `client/src/components/pos/stress-test-overlay.tsx`.
- **Display Font Scaling**: Per-workstation and per-KDS-device font size control (Small 85%, Medium 100%, Large 120%, Extra Large 140%) using CSS zoom with viewport compensation. Configurable via EMC. `useFontScale` hook in `client/src/hooks/use-font-scale.ts`.
- **Auto-Startup on Boot (Windows)**: Setup Wizard registers the correct application (POS or KDS) for auto-launch on Windows boot using Electron's `setLoginItemSettings`. IPC handlers for querying/toggling status (`get-auto-startup-status`, `set-auto-startup`).
- **KDS Header Bar Enhancement**: KDS header displays enterprise name, device name, current date/time, and RVC name — matching the POS header layout. Uses property/enterprise queries for context.
- **KDS Settings Icon Removed**: Gear/Settings icon removed from KDS to prevent access to device configuration during normal operation.

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

### Planned Features (Future)
- **Self-Service Kiosk Mode**: A dedicated kiosk interface optimized for customer self-ordering. 62% of brands are adding kiosks and ~80% of QSRs now use them. The system already has the POS engine and menu infrastructure — this feature adds a customer-facing touchscreen UI with large buttons, visual menu browsing, modifier selection, payment integration, and order confirmation. Kiosk devices would be configured in the EMC hierarchy alongside Workstations and KDS devices.
- **QR Code Order & Pay**: Guests scan a QR code at their table or counter to browse the menu, place orders, and pay directly from their phone — no app download required. Orders feed into the existing KDS and check flow in real time. Integrates with loyalty programs for automatic point accrual, dynamically updates menu availability based on inventory, and reduces labor pressure by enabling self-service ordering.
- **Delivery Platform Integration APIs**: Direct API feeds from third-party delivery platforms (Uber Eats, DoorDash, Grubhub, etc.) aggregated into a single unified order stream within the POS. Incoming delivery orders automatically create checks, route to KDS, and appear in sales reporting. Eliminates the need for separate tablets per platform and ensures all order channels are visible in one place.