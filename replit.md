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
- **CAL Package Deployment Pipeline**: System for distributing and managing software packages (CAL Packages) to workstations and Service Hosts, including versioning, targeted deployments, and agent-side reception.
- **Service Host SQLite Schema**: Local database schema mirroring cloud PostgreSQL for offline operations. Includes configuration tables (enterprises, properties, rvcs, roles, employees, menu, devices), transactional tables (checks, rounds, payments), and local-only tables (sync_queue, check_locks, print_queue). Monetary values stored as INTEGER cents for precision. Located at `service-host/src/db/schema.ts` and `service-host/src/db/database.ts`.

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