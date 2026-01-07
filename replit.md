# Cloud POS System

## Overview
This is an enterprise cloud-based Quick Service Restaurant (QSR) Point of Sale system designed for high-volume, fast-paced restaurant environments. Its core purpose is to provide a robust POS solution with a multi-property hierarchy (Enterprise → Property → Revenue Center), Kitchen Display System (KDS) integration, role-based access control, and comprehensive admin configuration capabilities. The system features a Simphony-class design pattern where configuration flows down the hierarchy with override capabilities at each level. Key capabilities include comprehensive device configuration, real-time KDS order flow, robust time & attendance, PCI-compliant payment processing, and extensive enterprise features like fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with esbuild for server bundling
- **Routing**: Wouter
- **State Management**: TanStack React Query for server state, React Context for POS session
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS with custom design tokens for touch-first, high-contrast theming

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API with WebSocket support for real-time KDS updates
- **Build**: tsx for development, esbuild for production

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` for table definitions and relations
- **Migrations**: Drizzle Kit

### Key Domain Models
- **Hierarchy**: Enterprises → Properties → Revenue Centers (RVCs)
- **Menu System**: SLUs (Categories) → Menu Items → Modifier Groups → Modifiers
- **Transactions**: Checks → Rounds → Check Items → Payments
- **Operations**: Employees, Roles, Privileges, Tax Groups, Tenders, Discounts
- **Device Configuration**: Workstations, Printers, KDS Devices, Order Devices, Print Classes

### Device Configuration (Simphony-Style)
The system supports comprehensive device configuration including Workstations, Printers, and KDS Devices at the Property level. Routing is managed via Print Classes, Order Devices, and Print Class Routing, allowing for RVC-specific, Property-level, and Global overrides.

### KDS Order Flow
Supports two modes: "Standard Mode" (items sent to KDS upon "Send" action or payment) and "Dynamic Order Mode" (items appear on KDS immediately upon being added to check, ideal for fast-casual).

### Real-time Communication
WebSocket server at `/ws` path for real-time KDS ticket updates using a channel-based subscription model.

### Device Type Configuration
Supports dedicated device modes (POS Workstation, KDS Display) configured on first load, persisting in localStorage. KDS devices are restricted to `/kds` routes and automatically subscribe to KDS updates.

### Authentication
PIN-based employee authentication with role-based privilege system and manager approval flows for privileged operations.

### Admin Utilities
Includes Property Sales Reset for clearing transactional data with multi-layer safety confirmations and audit logging.

### Time & Attendance System
Comprehensive module with:
- **Time Clock**: Employee self-service clock in/out, breaks.
- **Timecards**: Manager review and editing, exception management, dual-source audit trail.
- **Scheduling**: Weekly schedule builder, shift creation, publishing workflow.
- **Tip Pooling**: Policy management and settlement runs.
- **Labor Analytics**: Reporting on labor vs sales, overtime, and tips.

### Payment Processing
PCI-compliant, gateway-agnostic framework supporting Stripe and Elavon Converge. No card data is stored; only transaction IDs and safe data are retained. Credentials are stored as Replit secrets.

### Printing System
Comprehensive receipt and report printing system supporting both network and local printers:
- **Network Printing**: Direct TCP/IP printing to port 9100 for network-connected thermal printers (Epson, Star)
- **Local Print Agent**: WebSocket-based print agent support for serial/USB connected printers
- **ESC/POS Support**: Built-in ESC/POS command builder for Epson-compatible thermal printers
- **Print Job Queue**: Database-backed print job queue with retry handling and status tracking
- **Print Classes**: Simphony-style print class routing for kitchen ticket distribution
- **Supported Features**: Check receipts, kitchen tickets, sales reports, employee reports, test prints
- **Hardware Support**: Epson TM-T88V/VI series, Star TSP series, and other ESC/POS compatible printers
- **Print Service Location**: `server/printService.ts` for ESC/POS building and network printing

### Enterprise Features
Includes robust features for enterprise management:
- **Fiscal Close / End-of-Day**: Business date management, daily totals, cash reconciliation.
- **Cash Management**: Cash drawer configuration, assignments, transactions (paid in/out, drops), safe counts.
- **Gift Cards**: Enterprise or property-specific gift cards with activation, reload, redemption, and balance tracking.
- **Loyalty Programs**: Multi-enrollment architecture where members can enroll in multiple programs simultaneously. Each enrollment tracks its own metrics (currentPoints, lifetimePoints, visitCount, currentTier, lifetimeSpend). Supports points/visits/spend/tiered program types with program-specific reward catalogs.
- **Online Ordering Integration**: Support for external order sources (DoorDash, UberEats, etc.) with order injection and menu mapping.
- **Inventory Management**: Item catalog, stock tracking, transaction types, recipe costing, low stock alerts.
- **Sales & Labor Forecasting**: Daily sales projections and hourly labor needs calculation.
- **Manager Alerts**: Configurable alerts for various operational events with severity levels.
- **Item Availability / Prep Countdown**: Quantity tracking, 86'd status, low stock thresholds.
- **Offline Order Queue**: Client-side order capture during network outages with sync retry.
- **Accounting Export**: GL account code mapping and export generation.

### External API Integration
The system provides API endpoints for integration with external management applications:
- **GET /api/sales/:date** - Returns daily sales data (totalSales, transactionCount, averageTicket)
- **Authentication**: API key via `x-api-key` header (uses `MANAGER_APP_API_KEY` secret)
- **Optional Filters**: `propertyId` query parameter for property-specific data

## External Dependencies

### Database
- PostgreSQL (via `DATABASE_URL` environment variable)
- `pg` for connection pooling
- `connect-pg-simple` for session storage

### UI Libraries
- Radix UI primitives
- Embla Carousel
- cmdk
- react-day-picker
- react-hook-form with zod resolver
- Recharts

### Development Tools
- Replit-specific Vite plugins
- Google Fonts (Inter, DM Sans, Fira Code, Geist Mono)