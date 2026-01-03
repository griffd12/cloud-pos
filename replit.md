# Cloud POS System

## Overview

This is an enterprise cloud-based Quick Service Restaurant (QSR) Point of Sale system designed for high-volume, fast-paced restaurant environments. The system features a multi-property hierarchy (Enterprise → Property → Revenue Center), Kitchen Display System (KDS) integration, role-based access control, and comprehensive admin configuration capabilities.

The architecture follows a Simphony-class design pattern where configuration flows down the hierarchy with override capabilities at each level.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom build script using esbuild for server bundling
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React Context for POS session state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens for POS-specific theming (touch-first, high contrast)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API with WebSocket support for real-time KDS updates
- **Build**: tsx for development, esbuild for production bundling

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` contains all table definitions and relations
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization

### Key Domain Models
- **Hierarchy**: Enterprises → Properties → Revenue Centers (RVCs)
- **Menu System**: SLUs (Screen Lookup Units/Categories) → Menu Items → Modifier Groups → Modifiers
- **Transactions**: Checks → Rounds → Check Items → Payments
- **Operations**: Employees, Roles, Privileges, Tax Groups, Tenders, Discounts
- **Device Configuration**: Workstations, Printers, KDS Devices, Order Devices, Print Classes

### Device Configuration (Simphony-Style)
The system implements a comprehensive device configuration model similar to Oracle Simphony:

**Physical Devices** (configured at Property level):
- **Workstations**: POS terminals, kiosks, manager stations with behavioral flags (fast transaction mode, default order types, clock-in allowed, etc.)
- **Printers**: Receipt printers, kitchen printers, bar printers with connection settings, failover configuration, and driver protocols
- **KDS Devices**: Kitchen Display System screens with station types (hot, cold, prep, expo, bar) and display options

**Routing Model**:
- **Print Classes**: Logical categories that define where menu items should be printed/displayed (e.g., "Hot Food", "Cold Food", "Drinks")
- **Order Devices**: Logical routing containers that group physical printers and KDS devices
- **Print Class Routing**: Links Print Classes to Order Devices with optional Property/RVC-level overrides

**Device Routing Resolution**:
Menu Item → Print Class → Print Class Routing → Order Device → Physical Devices (Printers + KDS)

The routing resolution (`resolveDevicesForMenuItem`) follows priority:
1. RVC-specific routing (highest priority)
2. Property-level routing
3. Global/default routing (lowest priority)

### KDS Order Flow
The system supports two order modes configurable per RVC:

**Standard Mode** (default):
- Items are added to a check but don't appear on KDS
- Cashier clicks "Send" to push all unsent items to KDS
- Items also auto-send when a check is paid out

**Dynamic Order Mode** (`dynamicOrderMode: true` on RVC):
- Items appear on KDS immediately when added to the check
- No "Send" action required - KDS sees items in real-time as they're rung in
- Ideal for fast-casual environments where food prep starts immediately

Payment auto-send: When a check is paid, any unsent items are automatically routed to KDS before the check closes.

### Real-time Communication
- WebSocket server at `/ws` path for KDS ticket updates
- Channel-based subscription model for RVC-specific or global updates

### Authentication
- PIN-based employee authentication
- Role-based privilege system for operation authorization
- Manager approval flow for privileged operations (voids, discounts)

### Admin Utilities
**Property Sales Reset** (`/admin/utilities`):
- Clears all transactional data for a specific property (not enterprise-wide)
- Deletes: checks (including open checks), check items, payments, discounts, rounds, KDS tickets, audit logs
- Scoped via RVC relationship (property → RVCs → checks/tickets)
- Multi-layer safety confirmations: property selector, acknowledge checkbox, employee PIN, type "RESET"
- Authorization: Requires employee with "admin_access" privilege (typically Manager role)
- Transactional: uses database transaction for atomic all-or-nothing deletion
- Mandatory audit logging with employee ID for accountability

### Time & Attendance System
The system includes a comprehensive Time & Attendance module with frontend admin pages:

**Time Clock** (`/admin/time-clock`):
- Employee self-service clock in/out
- Paid and meal break management
- Real-time status display showing clocked-in state and active breaks
- Today's summary with regular hours, overtime, and break totals

**Timecards** (`/admin/timecards`):
- Weekly timecard review and editing for managers
- Exception management with pending exception alerts
- Timecard edit dialog with mandatory reason field for audit trail
- Week navigation with property filtering

**Scheduling** (`/admin/scheduling`):
- Weekly schedule builder with 7-day calendar view
- Shift creation by employee and revenue center
- Shift publishing workflow (draft → published)
- Copy previous week functionality

**Tip Pooling** (`/admin/tip-pooling`):
- Tip pool policy management (hours-based, points-based, equal split)
- Settlement run execution with date and policy selection
- Allocation breakdown showing direct tips, pool share, and totals by employee

**Labor Analytics** (`/admin/labor-analytics`):
- Labor vs Sales reporting with daily breakdown and target comparison
- Overtime tracking with employee-level detail (regular, OT, double-time)
- Tips analysis with distribution by employee

**Schema Fields Reference**:
- TipPoolPolicy uses: `active` (not isActive), `calculationMethod` (not calcMethod)
- TipAllocation uses: `allocatedAmount` (not poolShare)
- Shift uses: `shiftDate`, `startTime`, `endTime` as strings
- Timecard uses: `clockInTime`, `clockOutTime` as timestamps, `totalHours` as decimal string

### Payment Processing
The system implements a PCI-compliant payment processing framework with gateway-agnostic adapters:

**Architecture**:
- **Gateway Adapters**: Pluggable payment processor adapters (`server/payments/adapters/`)
- **Registry**: Central adapter factory and credential resolution (`server/payments/registry.ts`)
- **Types**: Standardized request/response interfaces (`server/payments/types.ts`)

**Supported Processors**:
- **Stripe**: Payment intents with manual capture, tip adjustment via amount update
- **Elavon Converge**: JSON API with ccauthonly/cccomplete/ccvoid/ccreturn transactions

**PCI Compliance**:
- No card data storage (no PAN, CVV, track data, EMV cryptograms)
- Only safe data stored: transaction IDs, auth codes, last 4 digits, response codes
- Credentials stored as Replit secrets with key prefix pattern (e.g., `STRIPE_SECRET_KEY`)
- Database stores only the credential prefix reference

**API Endpoints**:
- `POST /api/payments/authorize` - Create authorization
- `POST /api/payments/:id/capture` - Capture authorized payment (amount includes tip)
- `POST /api/payments/:id/void` - Void uncaptured authorization
- `POST /api/payments/:id/refund` - Refund captured payment
- `POST /api/payments/:id/tip-adjust` - Adjust tip on authorized payment

**Transaction Status Flow**:
- `pending` → `authorized` → `captured` (success path)
- `pending` → `authorized` → `voided` (cancellation)
- `captured` → `refunded` (post-settlement refund)

## External Dependencies

### Database
- PostgreSQL via `DATABASE_URL` environment variable
- Connection pooling with `pg` package
- Session storage with `connect-pg-simple`

### UI Libraries
- Radix UI primitives (dialogs, dropdowns, forms, etc.)
- Embla Carousel for carousel components
- cmdk for command palette
- react-day-picker for calendar
- react-hook-form with zod resolver for forms
- Recharts for data visualization

### Development Tools
- Replit-specific Vite plugins for development (cartographer, dev-banner, runtime-error-modal)
- Google Fonts (Inter, DM Sans, Fira Code, Geist Mono)