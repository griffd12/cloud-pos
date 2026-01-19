/**
 * EMC Device Management Dashboard
 * 
 * Enterprise-level view of all devices across properties including:
 * - Hierarchical status view (Enterprise → Property → Devices)
 * - Service Host monitoring
 * - Workstation status
 * - Printer status
 * - KDS status
 * - System alerts
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Building2,
  Store,
  Server,
  Monitor,
  Printer,
  Tv,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ChevronRight,
  Wifi,
  WifiOff,
  Activity,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';
type DeviceStatus = 'online' | 'offline' | 'degraded' | 'error' | 'unknown';

interface PropertySummary {
  propertyId: string;
  propertyName: string;
  mode: ConnectionMode;
  serviceHostCount: number;
  workstationCount: number;
  printerCount: number;
  offlineDeviceCount: number;
  alertCount: number;
}

interface EnterpriseStatus {
  enterpriseId: string;
  enterpriseName: string;
  overallMode: ConnectionMode;
  totalProperties: number;
  totalDevices: number;
  totalOffline: number;
  properties: PropertySummary[];
  lastUpdated: string;
}

const modeColors: Record<ConnectionMode, { bg: string; text: string; label: string }> = {
  green: { bg: 'bg-green-500', text: 'text-green-600', label: 'Online' },
  yellow: { bg: 'bg-yellow-500', text: 'text-yellow-600', label: 'Offline' },
  orange: { bg: 'bg-orange-500', text: 'text-orange-600', label: 'Limited' },
  red: { bg: 'bg-red-500', text: 'text-red-600', label: 'Down' },
};

function StatusBadge({ mode }: { mode: ConnectionMode }) {
  const config = modeColors[mode];
  return (
    <Badge variant="outline" className={cn("gap-1", config.text)}>
      <span className={cn("h-2 w-2 rounded-full", config.bg)} />
      {config.label}
    </Badge>
  );
}

function DeviceStatusIcon({ status }: { status: DeviceStatus }) {
  switch (status) {
    case 'online':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'offline':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'degraded':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'error':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

interface EmcDeviceDashboardProps {
  enterpriseId: string;
}

export function EmcDeviceDashboard({ enterpriseId }: EmcDeviceDashboardProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Fetch enterprise status
  const { data: enterpriseStatus, isLoading, refetch } = useQuery<EnterpriseStatus>({
    queryKey: ['/api/system-status/enterprise', enterpriseId],
    refetchInterval: 30000,
  });

  // Fetch selected property details
  const { data: propertyDetails } = useQuery<{
    propertyId: string;
    propertyName: string;
    overallMode: ConnectionMode;
    serviceHosts: any[];
    workstations: any[];
    printers: any[];
    kdsDevices: any[];
    alerts: any[];
  }>({
    queryKey: ['/api/system-status/property', selectedPropertyId],
    enabled: !!selectedPropertyId,
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="emc-device-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Device Management</h2>
          <p className="text-muted-foreground">
            Monitor and manage all devices across your properties
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {enterpriseStatus && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard
              title="Enterprise Status"
              icon={Building2}
              value={modeColors[enterpriseStatus.overallMode].label}
              mode={enterpriseStatus.overallMode}
            />
            <SummaryCard
              title="Properties"
              icon={Store}
              value={enterpriseStatus.totalProperties.toString()}
              subtitle="locations"
            />
            <SummaryCard
              title="Total Devices"
              icon={Activity}
              value={enterpriseStatus.totalDevices.toString()}
              subtitle="configured"
            />
            <SummaryCard
              title="Offline Devices"
              icon={WifiOff}
              value={enterpriseStatus.totalOffline.toString()}
              subtitle="need attention"
              alert={enterpriseStatus.totalOffline > 0}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Properties</CardTitle>
                <CardDescription>Select a property to view details</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-1 p-4 pt-0">
                    {enterpriseStatus.properties.map((property) => (
                      <button
                        key={property.propertyId}
                        onClick={() => setSelectedPropertyId(property.propertyId)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors",
                          selectedPropertyId === property.propertyId
                            ? "bg-accent"
                            : "hover:bg-muted"
                        )}
                        data-testid={`button-property-${property.propertyId}`}
                      >
                        <div className="flex items-center gap-3">
                          <Store className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{property.propertyName}</div>
                            <div className="text-xs text-muted-foreground">
                              {property.workstationCount} workstations
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge mode={property.mode} />
                          {property.alertCount > 0 && (
                            <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                              {property.alertCount}
                            </Badge>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">
                  {propertyDetails 
                    ? `${propertyDetails.propertyName} Devices`
                    : 'Select a Property'}
                </CardTitle>
                {propertyDetails && (
                  <StatusBadge mode={propertyDetails.overallMode} />
                )}
              </CardHeader>
              <CardContent>
                {propertyDetails ? (
                  <PropertyDeviceDetails details={propertyDetails} />
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    Select a property to view device details
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ 
  title, 
  icon: Icon, 
  value, 
  subtitle,
  mode,
  alert,
}: { 
  title: string; 
  icon: typeof Building2; 
  value: string;
  subtitle?: string;
  mode?: ConnectionMode;
  alert?: boolean;
}) {
  return (
    <Card className={cn(alert && "border-red-200 dark:border-red-800")}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="flex items-center gap-2">
              {mode ? (
                <StatusBadge mode={mode} />
              ) : (
                <p className="text-2xl font-bold">{value}</p>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={cn(
            "p-3 rounded-full",
            alert ? "bg-red-100 dark:bg-red-900" : "bg-muted"
          )}>
            <Icon className={cn(
              "h-5 w-5",
              alert ? "text-red-600" : "text-muted-foreground"
            )} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PropertyDeviceDetails({ details }: { details: any }) {
  return (
    <Tabs defaultValue="services" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="services" className="gap-1">
          <Server className="h-4 w-4" />
          <span className="hidden sm:inline">Services</span>
        </TabsTrigger>
        <TabsTrigger value="workstations" className="gap-1">
          <Monitor className="h-4 w-4" />
          <span className="hidden sm:inline">Workstations</span>
        </TabsTrigger>
        <TabsTrigger value="printers" className="gap-1">
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Printers</span>
        </TabsTrigger>
        <TabsTrigger value="kds" className="gap-1">
          <Tv className="h-4 w-4" />
          <span className="hidden sm:inline">KDS</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="services" className="mt-4">
        <DeviceTable
          devices={details.serviceHosts || []}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'status', label: 'Status' },
            { key: 'version', label: 'Version' },
            { key: 'pendingTransactions', label: 'Pending Sync' },
            { key: 'lastSeen', label: 'Last Seen' },
          ]}
        />
      </TabsContent>

      <TabsContent value="workstations" className="mt-4">
        <DeviceTable
          devices={details.workstations || []}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'status', label: 'Status' },
            { key: 'connectionMode', label: 'Mode' },
            { key: 'ipAddress', label: 'IP Address' },
            { key: 'lastSeen', label: 'Last Seen' },
          ]}
        />
      </TabsContent>

      <TabsContent value="printers" className="mt-4">
        <DeviceTable
          devices={details.printers || []}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'status', label: 'Status' },
            { key: 'printerType', label: 'Type' },
            { key: 'ipAddress', label: 'IP Address' },
            { key: 'queuedJobs', label: 'Queued' },
          ]}
        />
      </TabsContent>

      <TabsContent value="kds" className="mt-4">
        <DeviceTable
          devices={details.kdsDevices || []}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'status', label: 'Status' },
            { key: 'activeTickets', label: 'Active Tickets' },
            { key: 'lastSeen', label: 'Last Seen' },
          ]}
        />
      </TabsContent>
    </Tabs>
  );
}

interface Column {
  key: string;
  label: string;
}

function DeviceTable({ devices, columns }: { devices: any[]; columns: Column[] }) {
  if (devices.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No devices configured
      </div>
    );
  }

  const formatValue = (device: any, key: string) => {
    const value = device[key];
    
    if (key === 'status') {
      return <DeviceStatusIcon status={value} />;
    }
    
    if (key === 'connectionMode' && value) {
      return <StatusBadge mode={value} />;
    }
    
    if (key === 'lastSeen' && value) {
      return new Date(value).toLocaleString();
    }
    
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">-</span>;
    }
    
    return value;
  };

  return (
    <ScrollArea className="h-[280px]">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.label}</TableHead>
            ))}
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device) => (
            <TableRow key={device.id}>
              {columns.map((col) => (
                <TableCell key={col.key}>
                  {formatValue(device, col.key)}
                </TableCell>
              ))}
              <TableCell>
                <Button variant="ghost" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

export function DeviceAlertsList({ propertyId }: { propertyId: string }) {
  const { data } = useQuery<{ alerts?: any[] }>({
    queryKey: ['/api/system-status/property', propertyId],
    enabled: !!propertyId,
    refetchInterval: 15000,
  });

  const alerts = data?.alerts || [];

  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
        All devices operating normally
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert: any) => (
        <div 
          key={alert.id}
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg",
            alert.severity === 'critical' ? "bg-red-50 dark:bg-red-950" :
            alert.severity === 'error' ? "bg-orange-50 dark:bg-orange-950" :
            alert.severity === 'warning' ? "bg-yellow-50 dark:bg-yellow-950" :
            "bg-blue-50 dark:bg-blue-950"
          )}
        >
          <AlertTriangle className={cn(
            "h-5 w-5 mt-0.5",
            alert.severity === 'critical' ? "text-red-500" :
            alert.severity === 'error' ? "text-orange-500" :
            alert.severity === 'warning' ? "text-yellow-500" :
            "text-blue-500"
          )} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{alert.deviceName}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{alert.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
