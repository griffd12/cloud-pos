import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Property, type Workstation } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Server,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  Settings,
  AlertTriangle,
  Activity,
  HardDrive,
  Cpu,
  RefreshCw,
  MemoryStick,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ServiceBinding {
  id: string;
  workstationId: string;
  serviceType: string;
  isActive: boolean;
}

interface WorkstationWithProperty extends Workstation {
  propertyName?: string;
}

interface ServiceHostStatus {
  id: string;
  name: string;
  propertyId: string;
  propertyName: string;
  status: 'online' | 'offline';
  connectionMode: string;
  connectedWorkstations: number;
  pendingSyncItems: number;
  lastHeartbeat: string | null;
  cpuUsagePercent?: number;
  memoryUsageMB?: number;
  diskUsagePercent?: number;
  diskFreeGB?: number;
  version?: string;
}

interface ServiceHostAlert {
  id: string;
  serviceHostId: string;
  propertyId: string;
  alertType: string;
  severity: string;
  message: string;
  triggeredAt: string;
  acknowledgedAt: string | null;
}

interface DashboardData {
  serviceHosts: ServiceHostStatus[];
  alerts: ServiceHostAlert[];
  summary: {
    total: number;
    online: number;
    offline: number;
    activeAlerts: number;
  };
}

export default function ServiceHostsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: workstations = [], isLoading: wsLoading } = useQuery<WorkstationWithProperty[]>({
    queryKey: ["/api/workstations"],
  });

  const { data: allBindings = [] } = useQuery<ServiceBinding[]>({
    queryKey: ["/api/workstation-service-bindings"],
  });

  const { data: dashboardData, isLoading: dashboardLoading, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/service-hosts/status-dashboard"],
    refetchInterval: 30000,
  });

  const workstationsWithServiceHost = workstations.filter(ws => {
    const bindings = allBindings.filter(b => b.workstationId === ws.id);
    return bindings.some(b => b.serviceType === "caps" || b.serviceType === "print_controller" || 
                             b.serviceType === "kds_controller" || b.serviceType === "payment_controller");
  });

  const getServiceBindingsForWorkstation = (workstationId: string) => {
    return allBindings.filter(b => b.workstationId === workstationId);
  };

  const getStatusBadge = (bindings: ServiceBinding[]) => {
    const activeServices = bindings.filter(b => b.isActive);
    if (activeServices.length === 0) {
      return <Badge variant="outline" className="text-muted-foreground">No Services</Badge>;
    }
    return <Badge className="bg-green-600">{activeServices.length} Active</Badge>;
  };

  const getServiceLabel = (serviceType: string) => {
    const labels: Record<string, string> = {
      caps: "CAPS",
      print_controller: "Print",
      kds_controller: "KDS",
      payment_controller: "Payment",
    };
    return labels[serviceType] || serviceType;
  };

  const getConnectionModeBadge = (mode: string) => {
    switch (mode?.toLowerCase()) {
      case 'green':
        return <Badge className="bg-green-600" data-testid="badge-mode-green">GREEN</Badge>;
      case 'yellow':
        return <Badge className="bg-yellow-500 text-black" data-testid="badge-mode-yellow">YELLOW</Badge>;
      case 'orange':
        return <Badge className="bg-orange-500" data-testid="badge-mode-orange">ORANGE</Badge>;
      case 'red':
        return <Badge className="bg-red-600" data-testid="badge-mode-red">RED</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-mode-unknown">Unknown</Badge>;
    }
  };

  const getAlertSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge className="bg-red-600">Critical</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 text-black">Warning</Badge>;
      default:
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Service Hosts</h1>
          <p className="text-muted-foreground">Monitor and manage on-premise Service Hosts</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          data-testid="button-refresh"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">
            <Activity className="h-4 w-4 mr-2" />
            Status Dashboard
          </TabsTrigger>
          <TabsTrigger value="configuration" data-testid="tab-configuration">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          {dashboardLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading dashboard...</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-2xl font-bold" data-testid="text-total-hosts">{dashboardData?.summary.total || 0}</p>
                        <p className="text-sm text-muted-foreground">Total Hosts</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-2xl font-bold text-green-600" data-testid="text-online-hosts">{dashboardData?.summary.online || 0}</p>
                        <p className="text-sm text-muted-foreground">Online</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="text-2xl font-bold text-red-600" data-testid="text-offline-hosts">{dashboardData?.summary.offline || 0}</p>
                        <p className="text-sm text-muted-foreground">Offline</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <div>
                        <p className="text-2xl font-bold text-amber-500" data-testid="text-active-alerts">{dashboardData?.summary.activeAlerts || 0}</p>
                        <p className="text-sm text-muted-foreground">Active Alerts</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Service Host Status</CardTitle>
                  <CardDescription>Real-time status of all registered Service Hosts</CardDescription>
                </CardHeader>
                <CardContent>
                  {!dashboardData?.serviceHosts?.length ? (
                    <div className="text-center py-12">
                      <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground mb-4">No Service Hosts registered</p>
                      <p className="text-sm text-muted-foreground">
                        Configure Service Hosts from the Configuration tab.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Property</TableHead>
                          <TableHead>Host Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Mode</TableHead>
                          <TableHead>Workstations</TableHead>
                          <TableHead>Pending Sync</TableHead>
                          <TableHead>Resources</TableHead>
                          <TableHead>Last Seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboardData.serviceHosts.map((host) => (
                          <TableRow key={host.id} data-testid={`row-service-host-${host.id}`}>
                            <TableCell className="font-medium">{host.propertyName}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Server className="h-4 w-4 text-primary" />
                                {host.name}
                              </div>
                            </TableCell>
                            <TableCell>
                              {host.status === 'online' ? (
                                <Badge className="bg-green-600">
                                  <Wifi className="h-3 w-3 mr-1" />
                                  Online
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <WifiOff className="h-3 w-3 mr-1" />
                                  Offline
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{getConnectionModeBadge(host.connectionMode)}</TableCell>
                            <TableCell>{host.connectedWorkstations}</TableCell>
                            <TableCell>
                              {host.pendingSyncItems > 0 ? (
                                <Badge variant="outline" className="text-amber-500">
                                  {host.pendingSyncItems}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-xs">
                                {host.cpuUsagePercent !== undefined && (
                                  <span className="flex items-center gap-1" title="CPU">
                                    <Cpu className="h-3 w-3" />
                                    {host.cpuUsagePercent}%
                                  </span>
                                )}
                                {host.memoryUsageMB !== undefined && (
                                  <span className="flex items-center gap-1" title="Memory">
                                    <MemoryStick className="h-3 w-3" />
                                    {host.memoryUsageMB}MB
                                  </span>
                                )}
                                {host.diskFreeGB !== undefined && (
                                  <span className="flex items-center gap-1" title="Disk Free">
                                    <HardDrive className="h-3 w-3" />
                                    {host.diskFreeGB}GB
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {host.lastHeartbeat ? (
                                formatDistanceToNow(new Date(host.lastHeartbeat), { addSuffix: true })
                              ) : (
                                'Never'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Active Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Severity</TableHead>
                          <TableHead>Alert</TableHead>
                          <TableHead>Triggered</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboardData.alerts.map((alert) => (
                          <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
                            <TableCell>{getAlertSeverityBadge(alert.severity)}</TableCell>
                            <TableCell>{alert.message}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDistanceToNow(new Date(alert.triggeredAt), { addSuffix: true })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="configuration">
          <Card>
            <CardHeader>
              <CardTitle>Workstations with Service Controller Bindings</CardTitle>
              <CardDescription>
                Workstations with CAPS, Print, KDS, or Payment Controller services act as Service Hosts.
                Configure service bindings on the Workstations page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {wsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : workstationsWithServiceHost.length === 0 ? (
                <div className="text-center py-12">
                  <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">No workstations configured with Service Host capabilities</p>
                  <p className="text-sm text-muted-foreground">
                    Go to Workstations page and assign CAPS, Print, KDS, or Payment Controller services to a workstation.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workstation</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Assigned Services</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workstationsWithServiceHost.map((ws) => {
                      const bindings = getServiceBindingsForWorkstation(ws.id);
                      const property = properties.find(p => p.id === ws.propertyId);
                      const activeBindings = bindings.filter(b => 
                        ["caps", "print_controller", "kds_controller", "payment_controller"].includes(b.serviceType)
                      );
                      
                      return (
                        <TableRow key={ws.id} data-testid={`row-workstation-${ws.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-primary" />
                              <span className="font-medium">{ws.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{property?.name || "Unknown"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {activeBindings.map(binding => (
                                <Badge key={binding.id} variant="secondary" className="text-xs">
                                  {getServiceLabel(binding.serviceType)}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(bindings)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Service Host Architecture</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  Service Hosts are workstations configured to run critical services that enable 
                  offline operation when cloud connectivity is lost.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Server className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <strong className="text-foreground">CAPS</strong> - Check And Posting Service handles 
                      transaction processing locally.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Settings className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <strong className="text-foreground">Print Controller</strong> - Routes print jobs to local 
                      network printers.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Settings className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <strong className="text-foreground">KDS Controller</strong> - Manages kitchen display 
                      tickets locally.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Settings className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <strong className="text-foreground">Payment Controller</strong> - Handles payment device 
                      communication.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Connection Modes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  When a property loses internet connectivity, workstations automatically failover 
                  to the local Service Host for uninterrupted operations.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-600 w-16 justify-center">GREEN</Badge>
                    <span>Connected to cloud, full functionality</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-yellow-500 text-black w-16 justify-center">YELLOW</Badge>
                    <span>Internet down, using local Service Host</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-500 w-16 justify-center">ORANGE</Badge>
                    <span>Service Host down, local agents active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-600 w-16 justify-center">RED</Badge>
                    <span>Complete isolation, browser-only operation</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
