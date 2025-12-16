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

### Real-time Communication
- WebSocket server at `/ws` path for KDS ticket updates
- Channel-based subscription model for RVC-specific or global updates

### Authentication
- PIN-based employee authentication
- Role-based privilege system for operation authorization
- Manager approval flow for privileged operations (voids, discounts)

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