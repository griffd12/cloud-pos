# Cloud POS System

## Overview
This project is an enterprise cloud-based Quick Service Restaurant (QSR) Point of Sale system designed for high-volume environments. Its core purpose is to provide a scalable and robust POS solution with comprehensive administrative configuration and real-time operational capabilities. Key features include a multi-property hierarchy (Enterprise → Property → Revenue Center), Kitchen Display System (KDS) integration, and extensive enterprise functionalities such as fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. The system leverages a Simphony-class design pattern for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. The business vision is to deliver a highly flexible and reliable POS system that can be deployed across various QSR operations, ensuring continuous service even in offline conditions and supporting both web and native application environments (Android & Windows).

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
- **Multi-Enterprise Architecture**: Server-side enterprise data isolation enforced via `getEnforcedEnterpriseId()` helper in routes.ts. Access level hierarchy: `system_admin` (product owner, cross-enterprise) > `enterprise_admin` (single enterprise owner, locked to their enterprise) > `property_admin` (single location). The `isSystemLevel()` helper supports both `system_admin` and `super_admin` for backward compatibility. All EMC API endpoints (29+) enforce enterprise boundaries server-side - enterprise_admin users cannot access data from other enterprises even if they manipulate client-side requests. Frontend admin-layout.tsx provides defense-in-depth client-side filtering. Initial EMC setup creates `system_admin` account. Future plans include company code login, per-enterprise URLs, and separate databases for enhanced isolation.
- **Native Application Capabilities (Windows Electron)**: Includes an embedded print agent, SQLite/SQLCipher for offline data caching, local reporting, store-and-forward for offline transactions, EMV terminal communication, auto-launch, kiosk mode, and a terminal setup wizard.
- **Electron Deferred Initialization**: All services (print agent, offline DB, EMV, sync timers, connectivity monitoring) are gated behind `setupComplete` flag. On fresh install, only the Setup Wizard UI loads — no services initialize until wizard completes. The `initAllServices()` function in main.cjs handles deferred init with an idempotent `servicesInitialized` guard.
- **Electron Config Loading Guard**: DeviceContext includes an `isElectronLoading` flag that prevents the Router from making routing decisions (e.g., redirecting to `/server-setup`) until the async `getAppInfo()` IPC call completes and syncs the Electron config into localStorage. This prevents a race condition where the web app would redirect to setup pages before the Electron config was loaded.
- **Electron Workstation/RVC Sync**: DeviceContext also syncs `pos_workstation_id` and `pos_selected_rvc` to localStorage from the Electron config, preventing the POS page from showing a duplicate workstation/RVC selection screen.
- **Print Agent Auto-Registration**: The embedded print agent automatically registers with the cloud server during `initPrintAgent()` if no agent ID/token is configured. It calls `POST /api/print-agents` to create a new agent record and saves the returned credentials to `settings.json`.
- **Offline Sync Endpoints**: The offline database sync (`syncFromCloud`) syncs all POS-critical tables: menu-items, modifier-groups, condiment-groups, combo-meals, employees, tax-rates, discounts, tender-types, order-types, service-charges, major-groups, family-groups, menu-item-classes, rvcs, printers, workstations, properties, SLUs, POS layouts + cells. Revenue center URLs use `/api/rvcs` (not `/api/revenue-centers`).
- **Electron Protocol Interceptor**: `protocol.handle('https', ...)` intercepts ALL HTTPS requests to the server. When offline, API requests (`/api/*`) are routed to `OfflineApiInterceptor` for local SQLite responses. Non-API requests (HTML/JS/CSS) are served from a disk-based page cache at `DATA_DIR/page-cache/`. When online, only non-API responses are cached to disk (API responses are excluded from page cache to prevent stale data being served when offline). The interceptor detects connection loss on fetch failure and restores online status on success, notifying the renderer via `online-status` IPC.
- **Offline Self-Test**: IPC handler `offline-self-test` (exposed as `window.electronAPI.offlineSelfTest()`) runs diagnostic checks: protocol interceptor active, SQLite accessible, employees/menu cached, PIN auth endpoint registered, page cache populated. Returns pass/fail for each test with `overallStatus: 'READY FOR OFFLINE'` when all pass.
- **Data Directory Alignment**: On Windows, the app uses `LOCALAPPDATA\Cloud POS` for config/data directories, matching the installer and logger paths. On other platforms, it falls back to Electron's default `userData` path.
- **Unified System Logger**: All Electron subsystem logs dual-write to both individual log files (app.log, print-agent.log, offline-db.log, installer.log) AND a unified `system.log` file via logger.cjs. Format: `[timestamp] [LEVEL] [SUBSYSTEM    ] [category] message`. Subsystem tags: APP, PRINT, OFFLINEDB, SYNC, EMV, INTERCEPTOR, INSTALLER, NETWORK, RENDERER. 10MB max size with 5-file rotation. Standalone module at `electron/system-logger.cjs` also available.
- **Renderer-to-Main IPC Logging**: Renderer process can write to unified system log via `window.electronAPI.log(level, subsystem, category, message, data)`. Main process validates/sanitizes all inputs (whitelisted levels/subsystems, size-capped messages). Subsystem prefixed with `R:` to distinguish from main-process entries.
- **Offline-Aware Fetch with IndexedDB Fallback**: Both `fetchWithTimeout()` and the default `getQueryFn` in queryClient.ts automatically cache all successful GET responses to IndexedDB (24h TTL). When network fails (timeout/disconnect), serves cached data transparently. Offline mode flag tracked globally with listener pattern (`onOfflineModeChange`). Any successful response (GET or POST) clears offline mode. The default queryFn fallback is critical for the login page — it ensures workstation context, RVCs, and other initial queries load from cache when offline, preventing UI freeze.
- **Fetch Timeout**: All API calls use 8-second timeout via `fetchWithTimeout()` to prevent UI freeze when cloud is unreachable. Applied across 43+ fetch calls in POS page and components.
- **Customer Member Enrollment (POS)**: Adding a new member from POS no longer requires an active loyalty program. Members are created first, then auto-enrolled in any active loyalty programs for the enterprise. If no programs exist, the member is still created and can be linked to programs later. Visit and spend tracking is handled automatically by loyalty programs configured in Admin.
- **Property-Scoped Loyalty**: Loyalty programs, rewards, and members are all scoped to a specific property within an enterprise. A customer at one property does NOT earn loyalty at another property. Programs are filtered by both `enterpriseId` and `propertyId`. Members store both `enterpriseId` and `propertyId`. Payment completion loyalty awarding skips programs that don't match the check's property. Auto-enrollment on member creation only enrolls in programs for the same property.
- **Offline PIN Authentication**: When the app is offline and the cloud login API fails, the login page falls back to authenticating against locally cached employee records in IndexedDB. Employees are synced to the offline store (`offline-store.ts`) via `GET /api/auth/offline-employees` whenever the login page loads while online. Offline login grants limited privileges and skips clock-in requirements.
- **PosContext Electron Config Sync**: PosContext now imports `useDeviceContext` and re-reads `pos_workstation_id` from localStorage after DeviceContext finishes its async Electron config loading (via `isElectronLoading` flag). This prevents the "Select Workstation" screen from appearing after the Electron Setup Wizard completes.
- **Auto-Updater**: `electron-updater` integration with full lifecycle logging via UPDATER subsystem in unified system logger. Checks for updates 15s after startup and every 4 hours. Downloads silently in background, notifies renderer via `update-status` IPC. User can trigger immediate install via `window.electronAPI.updater.install()` or wait for auto-install on next app quit. Manual check available on the Offline System Verification page. Update banner appears at bottom of screen during download/ready states. Configured for GitHub Releases distribution via `electron-builder.json` publish settings.
- **Setup Wizard URL Validation**: Connection test strips trailing path segments from server URL (prevents `/MMM` type errors), validates response is JSON (not HTML SPA fallback), and stores cleaned base URL. Login handler also strips paths and handles non-JSON responses gracefully with clear error messages.
- **Electron Startup Loading Screen**: Both `createWindow()` and post-wizard `wizard-launch-app` show an inline HTML loading page (spinner + "Connecting to server...") via `data:` URL before navigating to the actual server. Prevents black screen during initial load. The `did-fail-load` handler displays a visible "Cannot Connect to Server" error page with server URL, error details, and a Retry button instead of silently failing. Error code -3 (navigation cancelled) is ignored during loading→server transitions. `did-finish-load` logs successful page loads for debugging.
- **Electron POS Startup Path**: All POS-mode startup paths use `/` (login page) instead of `/pos` to prevent React crashes from POS page hooks initializing without authentication context. KDS mode still uses `/kds`. Applies to: initial launch, wizard launch, mode switch, clear browser data, server URL change.
- **React ErrorBoundary**: Wraps entire app in `client/src/components/error-boundary.tsx`. Catches rendering errors and shows user-friendly fallback with error details, Reload button, and Try Again button. Logs errors to Electron unified system log via `electronAPI.log` IPC.

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