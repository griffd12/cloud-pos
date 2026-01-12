/**
 * FOH System Status Component
 * 
 * Displays system status at the POS level including:
 * - Connection mode (GREEN/YELLOW/ORANGE/RED)
 * - Service Host status
 * - Printer status
 * - KDS status
 * - Pending sync operations
 * - System alerts
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Wifi, 
  WifiOff, 
  Printer, 
  Monitor, 
  Server,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Upload,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useConnectionMode, apiClient, type ConnectionMode } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface DeviceStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'degraded' | 'error' | 'unknown';
  lastSeen?: string;
}

interface PrinterStatusInfo extends DeviceStatus {
  queuedJobs: number;
  printerType: string;
}

interface KdsStatusInfo extends DeviceStatus {
  activeTickets: number;
}

interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  deviceName: string;
  timestamp: string;
}

const modeConfig: Record<ConnectionMode, {
  bgColor: string;
  textColor: string;
  label: string;
  description: string;
  Icon: typeof Wifi;
}> = {
  green: {
    bgColor: 'bg-green-500',
    textColor: 'text-green-600',
    label: 'Online',
    description: 'Connected to cloud',
    Icon: Wifi,
  },
  yellow: {
    bgColor: 'bg-yellow-500',
    textColor: 'text-yellow-600',
    label: 'Offline Mode',
    description: 'Using Service Host',
    Icon: Wifi,
  },
  orange: {
    bgColor: 'bg-orange-500',
    textColor: 'text-orange-600',
    label: 'Limited',
    description: 'Local agents only',
    Icon: WifiOff,
  },
  red: {
    bgColor: 'bg-red-500',
    textColor: 'text-red-600',
    label: 'Emergency',
    description: 'Browser cache mode',
    Icon: AlertTriangle,
  },
};

function StatusIcon({ status }: { status: string }) {
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

interface FohSystemStatusProps {
  propertyId?: string;
  compact?: boolean;
}

export function FohSystemStatus({ propertyId, compact = false }: FohSystemStatusProps) {
  const { mode, status, forceCheck } = useConnectionMode();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const config = modeConfig[mode];

  // Fetch pending operations count
  useEffect(() => {
    const updatePendingCount = async () => {
      try {
        const count = await apiClient.getPendingOperationsCount();
        setPendingCount(count);
      } catch {
        setPendingCount(0);
      }
    };
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch property system status if propertyId provided
  const { data: propertyStatus, refetch } = useQuery({
    queryKey: ['/api/system-status/property', propertyId],
    enabled: !!propertyId,
    refetchInterval: 30000,
  });

  const handleRefresh = async () => {
    await forceCheck();
    if (propertyId) {
      refetch();
    }
  };

  if (compact) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2"
            data-testid="button-system-status-compact"
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", config.bgColor)} />
            <config.Icon className="h-4 w-4" />
            <span className="text-xs font-medium">{config.label}</span>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                {pendingCount}
              </Badge>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              System Status
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleRefresh}
                data-testid="button-refresh-status"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <SystemStatusContent 
            mode={mode} 
            status={status} 
            propertyStatus={propertyStatus}
            pendingCount={pendingCount}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Card data-testid="card-system-status">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            System Status
            <span className={cn("h-2.5 w-2.5 rounded-full", config.bgColor)} />
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefresh}
            data-testid="button-refresh-status"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SystemStatusContent 
          mode={mode} 
          status={status} 
          propertyStatus={propertyStatus}
          pendingCount={pendingCount}
        />
      </CardContent>
    </Card>
  );
}

function SystemStatusContent({ 
  mode, 
  status, 
  propertyStatus,
  pendingCount,
}: { 
  mode: ConnectionMode; 
  status: any; 
  propertyStatus: any;
  pendingCount: number;
}) {
  const config = modeConfig[mode];
  const [showDevices, setShowDevices] = useState(false);

  return (
    <div className="space-y-4">
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-lg",
        mode === 'green' ? "bg-green-50 dark:bg-green-950" :
        mode === 'yellow' ? "bg-yellow-50 dark:bg-yellow-950" :
        mode === 'orange' ? "bg-orange-50 dark:bg-orange-950" :
        "bg-red-50 dark:bg-red-950"
      )}>
        <div className={cn("p-2 rounded-full", config.bgColor)}>
          <config.Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="font-medium">{config.label}</div>
          <div className="text-sm text-muted-foreground">{config.description}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatusTile
          icon={Wifi}
          label="Cloud"
          status={status?.cloudReachable ? 'online' : 'offline'}
        />
        <StatusTile
          icon={Server}
          label="Service Host"
          status={status?.serviceHostReachable ? 'online' : 'offline'}
        />
        <StatusTile
          icon={Printer}
          label="Print Agent"
          status={status?.printAgentAvailable ? 'online' : 'offline'}
        />
        <StatusTile
          icon={CreditCard}
          label="Payment"
          status={status?.paymentAppAvailable ? 'online' : 'offline'}
        />
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
          <Upload className="h-4 w-4 text-yellow-600" />
          <span className="text-sm">
            <strong>{pendingCount}</strong> operations pending sync
          </span>
        </div>
      )}

      {propertyStatus && (
        <Collapsible open={showDevices} onOpenChange={setShowDevices}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span>Device Details</span>
              {showDevices ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {propertyStatus.printers?.length > 0 && (
              <DeviceSection
                title="Printers"
                icon={Printer}
                devices={propertyStatus.printers}
              />
            )}
            {propertyStatus.kdsDevices?.length > 0 && (
              <DeviceSection
                title="KDS Displays"
                icon={Monitor}
                devices={propertyStatus.kdsDevices}
              />
            )}
            {propertyStatus.workstations?.length > 0 && (
              <DeviceSection
                title="Workstations"
                icon={Monitor}
                devices={propertyStatus.workstations}
              />
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {propertyStatus?.alerts?.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Alerts</div>
            <ScrollArea className="h-32">
              {propertyStatus.alerts.map((alert: Alert) => (
                <div 
                  key={alert.id}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded text-sm mb-1",
                    alert.severity === 'critical' ? "bg-red-50 dark:bg-red-950" :
                    alert.severity === 'error' ? "bg-orange-50 dark:bg-orange-950" :
                    alert.severity === 'warning' ? "bg-yellow-50 dark:bg-yellow-950" :
                    "bg-blue-50 dark:bg-blue-950"
                  )}
                >
                  <AlertTriangle className={cn(
                    "h-4 w-4 mt-0.5",
                    alert.severity === 'critical' ? "text-red-500" :
                    alert.severity === 'error' ? "text-orange-500" :
                    alert.severity === 'warning' ? "text-yellow-500" :
                    "text-blue-500"
                  )} />
                  <div>
                    <div className="font-medium">{alert.deviceName}</div>
                    <div className="text-muted-foreground">{alert.message}</div>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>
        </>
      )}

      {status?.lastChecked && (
        <div className="text-xs text-muted-foreground text-center">
          Last checked: {new Date(status.lastChecked).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function StatusTile({ 
  icon: Icon, 
  label, 
  status 
}: { 
  icon: typeof Wifi; 
  label: string; 
  status: 'online' | 'offline' | 'degraded' | 'error' | 'unknown';
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg border",
      status === 'online' ? "border-green-200 dark:border-green-800" :
      status === 'offline' ? "border-red-200 dark:border-red-800" :
      "border-gray-200 dark:border-gray-800"
    )}>
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{label}</div>
      </div>
    </div>
  );
}

function DeviceSection({ 
  title, 
  icon: Icon, 
  devices 
}: { 
  title: string; 
  icon: typeof Printer; 
  devices: DeviceStatus[];
}) {
  const onlineCount = devices.filter(d => d.status === 'online').length;
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-4 w-4" />
          {title}
        </span>
        <span className="text-xs">
          {onlineCount}/{devices.length} online
        </span>
      </div>
      <div className="space-y-1">
        {devices.map((device) => (
          <div 
            key={device.id}
            className="flex items-center justify-between text-sm pl-5"
          >
            <span className="truncate">{device.name}</span>
            <StatusIcon status={device.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SystemStatusBadge() {
  const { mode, status } = useConnectionMode();
  const config = modeConfig[mode];
  
  return (
    <Badge 
      variant="outline" 
      className={cn("gap-1.5", config.textColor)}
      data-testid="badge-system-status"
    >
      <span className={cn("h-2 w-2 rounded-full", config.bgColor)} />
      <config.Icon className="h-3 w-3" />
      <span className="text-xs">{config.label}</span>
    </Badge>
  );
}
