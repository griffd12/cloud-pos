# Cloud POS System

## Overview
This project is an enterprise cloud-based Quick Service Restaurant (QSR) Point of Sale system designed for high-volume environments. It features a multi-property hierarchy (Enterprise → Property → Revenue Center), Kitchen Display System (KDS) integration, and comprehensive admin configuration, leveraging a Simphony-class design pattern for configuration inheritance with override capabilities. The system supports device configuration, real-time KDS order flow, robust time & attendance, PCI-compliant payment processing, and extensive enterprise capabilities including fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. An optional Service Host provides a hybrid cloud/on-premise architecture for offline resilience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Principles
- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center for scalable management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming optimized for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS updates and Service Host synchronization.
- **Offline Resilience**: Optional on-premise Service Host with local SQLite for offline operations and cloud synchronization.

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
- **Hybrid Architecture (V2)**: Introduces an optional on-premise Service Host (Node.js with SQLite) for offline resilience (yellow/red modes) with cloud sync infrastructure.
- **CAL Package Deployment Pipeline**: Oracle Simphony-style system for distributing software packages (CAL Packages) to Service Hosts and workstations, enabling automatic updates via a CAL Client Background Service.
- **CAL Setup Wizard**: An Electron Desktop App for device initialization, including directory creation, Service Host installation, and device registration.
- **Device Binding Security**: SHA-256 hashed device tokens ensure secure access to POS/KDS functionality via REST API middleware and WebSocket authentication.
- **Config Sync Service**: Cloud to local SQLite synchronization for all entity types (hierarchy, menu, employees, devices, operations, POS layouts, payments, loyalty) with version tracking and real-time updates.
- **Service Host SQLite Schema**: Comprehensive local database schema mirroring cloud PostgreSQL for full offline POS operations, including configuration, menu, devices, transactions, payments, KDS, cash management, time & attendance, fiscal operations, loyalty, gift cards, and orders.

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
- Stripe
- Elavon Converge