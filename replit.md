# Cloud POS System

## Overview
This project is an enterprise cloud-based Quick Service Restaurant (QSR) Point of Sale system designed for high-volume environments. Its core purpose is to provide a scalable and robust POS solution with comprehensive administrative configuration and real-time operational capabilities. Key features include a multi-property hierarchy (Enterprise → Property → Revenue Center), Kitchen Display System (KDS) integration, and extensive enterprise functionalities such as fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. The system leverages a Simphony-class design pattern for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. The business vision is to deliver a highly flexible and reliable POS system that can be deployed across various QSR operations, ensuring continuous service even in offline conditions and supporting both web and native application environments (Android & Windows).

## User Preferences
Preferred communication style: Simple, everyday language.

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
- **Multi-Enterprise Architecture**: Currently uses Enterprise ID filtering for data isolation; future plans include company code login, per-enterprise URLs, and separate databases for enhanced isolation and disaster recovery.
- **Native Application Capabilities (Windows Electron)**: Includes an embedded print agent, SQLite/SQLCipher for offline data caching, local reporting, store-and-forward for offline transactions, EMV terminal communication, auto-launch, kiosk mode, and a terminal setup wizard.

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