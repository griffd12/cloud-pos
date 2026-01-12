/**
 * Device Status Types for System Status Display
 * 
 * Used at both FOH (POS) and EMC levels for monitoring
 * workstations, printers, Service Hosts, and other devices.
 */

export type DeviceType = 
  | 'workstation' 
  | 'printer' 
  | 'kds' 
  | 'service_host' 
  | 'print_agent' 
  | 'payment_terminal';

export type DeviceStatus = 
  | 'online'      // Working normally
  | 'offline'     // Not responding
  | 'degraded'    // Partially working (e.g., high latency)
  | 'error'       // Has errors but connected
  | 'unknown';    // Status not determined

export type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';

export interface DeviceInfo {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  propertyId: string;
  rvcId?: string;
  ipAddress?: string;
  lastSeen: string;
  lastError?: string;
  metadata?: Record<string, any>;
}

export interface WorkstationStatus extends DeviceInfo {
  type: 'workstation';
  employeeId?: string;
  employeeName?: string;
  connectionMode: ConnectionMode;
  checkCount: number;
  pendingSyncCount: number;
  deviceToken?: string;
}

export interface PrinterStatus extends DeviceInfo {
  type: 'printer';
  printerType: 'receipt' | 'kitchen' | 'label' | 'report';
  port: number;
  queuedJobs: number;
  completedJobs: number;
  failedJobs: number;
  paperStatus?: 'ok' | 'low' | 'out' | 'unknown';
  coverOpen?: boolean;
}

export interface KdsStatus extends DeviceInfo {
  type: 'kds';
  stationName: string;
  activeTickets: number;
  averageBumpTime?: number; // seconds
}

export interface ServiceHostStatus extends DeviceInfo {
  type: 'service_host';
  version: string;
  cloudConnected: boolean;
  uptime: number; // seconds
  workstationCount: number;
  pendingTransactions: number;
  lastConfigSync?: string;
  databaseSize?: number; // bytes
}

export interface PrintAgentStatus extends DeviceInfo {
  type: 'print_agent';
  printerCount: number;
  queuedJobs: number;
  connected: boolean;
}

export interface PaymentTerminalStatus extends DeviceInfo {
  type: 'payment_terminal';
  terminalType: string;
  connected: boolean;
  lastTransaction?: string;
  batteryLevel?: number;
}

// Aggregated status for a property
export interface PropertySystemStatus {
  propertyId: string;
  propertyName: string;
  overallMode: ConnectionMode;
  serviceHosts: ServiceHostStatus[];
  workstations: WorkstationStatus[];
  printers: PrinterStatus[];
  kdsDevices: KdsStatus[];
  printAgents: PrintAgentStatus[];
  paymentTerminals: PaymentTerminalStatus[];
  lastUpdated: string;
  alerts: SystemAlert[];
}

export interface SystemAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

// FOH-specific simplified view
export interface FohSystemStatus {
  connectionMode: ConnectionMode;
  cloudConnected: boolean;
  serviceHostConnected: boolean;
  printers: Array<{
    id: string;
    name: string;
    status: DeviceStatus;
    queuedJobs: number;
  }>;
  kdsDevices: Array<{
    id: string;
    name: string;
    status: DeviceStatus;
    activeTickets: number;
  }>;
  paymentTerminal?: {
    status: DeviceStatus;
    connected: boolean;
  };
  pendingSyncCount: number;
  lastCloudSync?: string;
  alerts: SystemAlert[];
}

// Helper functions
export function getStatusColor(status: DeviceStatus): string {
  switch (status) {
    case 'online': return 'green';
    case 'offline': return 'red';
    case 'degraded': return 'yellow';
    case 'error': return 'orange';
    case 'unknown': return 'gray';
  }
}

export function getModeColor(mode: ConnectionMode): string {
  switch (mode) {
    case 'green': return 'green';
    case 'yellow': return 'yellow';
    case 'orange': return 'orange';
    case 'red': return 'red';
  }
}

export function getModeName(mode: ConnectionMode): string {
  switch (mode) {
    case 'green': return 'Online';
    case 'yellow': return 'Offline Mode';
    case 'orange': return 'Limited Mode';
    case 'red': return 'Emergency Mode';
  }
}

export function getModeDescription(mode: ConnectionMode): string {
  switch (mode) {
    case 'green': return 'Connected to cloud and Service Host';
    case 'yellow': return 'No internet - using Service Host';
    case 'orange': return 'Service Host degraded - local agents only';
    case 'red': return 'Completely offline - browser cache mode';
  }
}
