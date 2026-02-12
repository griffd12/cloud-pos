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
- **Auto-Startup on Boot (Windows & Android)**: During the setup wizard, the selected configuration type (Workstation vs KDS) determines which application is added to the OS startup folder for all users. If the device is configured as a Workstation, the Cloud POS exe is added to the startup folder. If configured as a KDS device, the Cloud KDS exe is added instead. This ensures the correct application auto-launches when the PC or Android device reboots, without manual intervention.
- **KDS Header Bar Enhancement**: The KDS screen header should display the same contextual information as the POS header: enterprise name, device name, current date/time, and RVC name. The RVC name is important for environments where KDS devices are configured for different Revenue Centers. No employee name is needed since KDS devices do not have individual logins.
- **Remove Gear/Settings Icon from KDS**: The gear icon on the KDS screen currently navigates to the "Connect to Server" page, which should not be accessible during normal KDS operation. Remove the gear icon from the KDS interface entirely.