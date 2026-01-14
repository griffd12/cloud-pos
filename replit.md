# Cloud POS System

## Overview
This project is an enterprise cloud-based Quick Service Restaurant (QSR) Point of Sale system. It is designed for high-volume environments and features a multi-property hierarchy (Enterprise → Property → Revenue Center), Kitchen Display System (KDS) integration, role-based access control, and comprehensive admin configuration. The system utilizes a Simphony-class design pattern where configuration flows down the hierarchy with override capabilities. Key features include device configuration, real-time KDS order flow, robust time & attendance, PCI-compliant payment processing, and extensive enterprise capabilities such as fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. The system also supports a hybrid cloud/on-premise architecture for offline resilience through an optional Service Host.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Principles
- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center for configuration and management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities at each hierarchical level.
- **Touch-First UI**: High-contrast theming optimized for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS updates and Service Host synchronization.
- **Offline Resilience (V2)**: Optional on-premise Service Host with local SQLite for offline operations and subsequent cloud synchronization.

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter
- **State Management**: TanStack React Query (server state), React Context (POS session)
- **UI Components**: shadcn/ui (Radix UI base)
- **Styling**: Tailwind CSS with custom design tokens

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Design**: RESTful JSON API with WebSocket support
- **Build**: tsx (development), esbuild (production)

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod
- **Schema**: `shared/schema.ts`
- **Migrations**: Drizzle Kit

### Key Domain Models
- **Hierarchy**: Enterprises, Properties, Revenue Centers (RVCs)
- **Menu System**: SLUs, Menu Items, Modifier Groups, Modifiers
- **Transactions**: Checks, Rounds, Check Items, Payments
- **Operations**: Employees, Roles, Privileges, Tax Groups, Tenders, Discounts
- **Device Configuration**: Workstations, Printers, KDS Devices, Order Devices, Print Classes

### Key Features and Implementations
- **Device Configuration**: Simphony-style configuration for Workstations, Printers, and KDS Devices with RVC-specific, Property-level, and Global overrides.
- **KDS Order Flow**: "Standard Mode" (send on action/payment) and "Dynamic Order Mode" (real-time KDS update on item addition).
- **Real-time Communication**: WebSocket server for KDS ticket updates and Service Host synchronization.
- **Device Type Configuration**: Dedicated device modes (POS Workstation, KDS Display) configured on first load.
- **Authentication**: PIN-based employee authentication with role-based access control and manager approval.
- **Time & Attendance**: Time clock, timecards, scheduling, tip pooling, and labor analytics.
- **Payment Processing**: PCI-compliant, gateway-agnostic framework (Stripe, Elavon Converge).
- **Printing System**: Comprehensive receipt and report printing supporting network printers (Epson, Star) via ESC/POS commands and a database-backed print job queue.
- **Print Agent System**: Standalone Node.js agent for bridging cloud POS to local network printers via WebSocket.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty Programs, Online Ordering Integration, Inventory Management, Sales & Labor Forecasting, Manager Alerts, Item Availability, Offline Order Queue, Accounting Export.
- **V2 Hybrid Architecture**: Introduces an optional on-premise Service Host (Node.js with SQLite) for offline resilience, supporting yellow (LAN only) and red (isolated) modes. Includes cloud sync infrastructure for configuration, transactions, and real-time updates.
- **Browser IndexedDB Offline Storage**: Client-side storage for ORANGE/RED connection modes when no server is available. Features:
  - IndexedDB-based local storage (`client/src/lib/offline-storage.ts`) for checks, timePunches, syncQueue
  - Automatic sync service (`client/src/lib/offline-sync.ts`) with retry logic and queue management
  - React hooks (`client/src/hooks/use-offline-sync.ts`) for connection mode and sync status
  - Graceful mode transitions with retry counter reset when connectivity is restored
- **Standalone Windows Executable**: Service Host can be packaged as a standalone .exe using `npm run package:exe`. Uses esbuild to bundle TypeScript/ESM into CommonJS, then pkg to create the executable. Native modules (better-sqlite3) are included as external assets.
- **Connectivity Test Dashboard**: EMC admin page (`/emc/connectivity-test`) for testing and monitoring device connectivity. Features:
  - Real-time connection mode display (GREEN/YELLOW/ORANGE/RED)
  - Service Host status monitoring with online/offline detection
  - Registered device status (workstations/KDS) with activity-based connectivity
  - KDS test ticket broadcasting for connectivity verification
  - Simulated cloud disconnect toggle for offline failover testing
  - Service Host URL configuration
- **Service Host WebSocket Integration**: Cloud endpoint `/ws/service-host` for real-time Service Host connections with:
  - Token-based authentication with property verification
  - Heartbeat monitoring for connection health
  - Automatic status updates (online/offline) with broadcast notifications
  - Config sync request handling
  - Transaction upload acknowledgment
- **Transaction Sync Security**: All sync endpoints (`/api/sync/transactions`, `/api/sync/time-punches`) protected with Service Host token authentication and property authorization
- **CAL Package Deployment Pipeline**: Oracle Simphony-style system for distributing software packages (CAL Packages) to Service Hosts and workstations. Features:
  - **Package Types**: service_host, service_host_prereqs, caps, print_controller, kds_controller, kds_client, payment_controller, cal_client, configuration, custom
  - **Install Script Execution**: Automatically runs startup scripts (.bat/.ps1 on Windows, .sh on Linux) with environment variables (CAL_ROOT_DIR, CAL_PACKAGE_NAME, CAL_PACKAGE_VERSION, CAL_PACKAGE_TYPE, CAL_PACKAGE_DIR, CAL_SERVICE_HOST_ID)
  - **Root Directory**: Configurable installation root (default: C:\OPS-POS\ on Windows, ~/ops-pos/ on Linux)
  - **WebSocket Broadcasting**: Real-time update progress pushed to connected POS workstations
  - **POS Update Overlay**: Full-screen blocker during updates showing package name, version, status, and real-time log output
  - **Package Structure**: manifest.json + install scripts + optional files directory
  - **Deployment Flow**: Upload .tar.gz → Create version in EMC → Create deployment → Service Host downloads → Extracts → Runs install script → Reports status
  - **First Package**: "OPS-POS Base Setup" (v1.0.0) creates the C:\OPS-POS\ directory structure with ServiceHost, Packages, PrintAgent, Config, and Logs subdirectories
  - **Bootstrap Installation**: Initial Service Host installation requires a standalone Bootstrap Installer (bootstrap-install.ps1 for Windows, bootstrap-install.sh for Linux) that:
    1. Creates C:\OPS-POS\ directory structure
    2. Downloads and installs Service Host executable
    3. Registers the device with the cloud
    4. Configures the CAL client for future updates
    After bootstrap, all subsequent updates come via CAL packages automatically.
  - **Files**: `service-host/src/sync/cal-sync.ts`, `client/src/components/cal-update-overlay.tsx`, `client/src/hooks/use-cal-updates.ts`, `cal-packages/`, `bootstrap/`
- **Config Sync Service**: Cloud → Local SQLite synchronization with full and delta sync support. Handles all entity types: hierarchy (enterprises, properties, RVCs), menu (SLUs, items, modifiers), employees (roles, privileges, assignments), devices (workstations, printers, KDS, order devices), operations (tax groups, tenders, discounts, service charges), POS layouts, payments, and loyalty. Features version tracking, auto-sync intervals, real-time updates via WebSocket, and proper soft/hard delete handling. Located at `service-host/src/sync/config-sync.ts`.
- **Service Host SQLite Schema (v3)**: Comprehensive local database schema mirroring cloud PostgreSQL for full offline POS operations. Includes:
  - **Configuration**: enterprises, properties, rvcs, roles, privileges, employees, employee_assignments, major_groups, family_groups, slus, tax_groups, print_classes
  - **Menu System**: menu_items, menu_item_slus, modifier_groups, modifiers, modifier_group_modifiers, menu_item_modifier_groups
  - **Devices**: workstations, printers, kds_devices, order_devices, order_device_printers, order_device_kds, print_class_routing, terminal_devices
  - **Transactions**: checks, rounds, check_items, check_payments, check_discounts, check_service_charges, tenders, discounts, service_charges
  - **Payments**: payment_processors, payment_transactions
  - **KDS**: kds_tickets, kds_ticket_items
  - **Cash Management**: cash_drawers, drawer_assignments, cash_transactions, safe_counts
  - **Time & Attendance**: job_codes, employee_job_codes, time_punches, break_sessions, time_entries
  - **Fiscal Operations**: fiscal_periods
  - **Loyalty**: loyalty_programs, loyalty_members, loyalty_member_enrollments, loyalty_transactions, loyalty_rewards, loyalty_redemptions
  - **Gift Cards**: gift_cards, gift_card_transactions
  - **Orders**: offline_order_queue, online_order_sources, online_orders
  - **Other**: pos_layouts, pos_layout_cells, pos_layout_rvc_assignments, item_availability, refunds, refund_items, refund_payments, audit_logs
  - **Local-Only**: sync_queue, sync_metadata, check_locks, print_queue, workstation_config, config_cache
  
  Design patterns: Monetary values as INTEGER cents; decimal rates as TEXT for precision; all tables use TEXT for IDs, INTEGER for booleans (0/1), TEXT for timestamps (ISO8601); cloud_synced flags for sync tracking. Located at `service-host/src/db/schema.ts` and `service-host/src/db/database.ts`.

## External Dependencies

### Database
- PostgreSQL (`DATABASE_URL`)
- `pg` (connection pooling)
- `connect-pg-simple` (session storage)

### UI Libraries
- Radix UI
- Embla Carousel
- cmdk
- react-day-picker
- react-hook-form with zod resolver
- Recharts

### Development Tools
- Replit-specific Vite plugins
- Google Fonts (Inter, DM Sans, Fira Code, Geist Mono)

### Payment Gateways
- Stripe
- Elavon Converge