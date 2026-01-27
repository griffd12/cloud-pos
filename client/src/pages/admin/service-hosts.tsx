import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEmc } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Property, type Workstation, type ServiceHost } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Plus, Key, Trash2 } from "lucide-react";
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
  propertyId: string;
  serviceType: string;
  active: boolean;
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

const serviceHostFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  propertyId: z.string().min(1, "Property is required"),
  hostWorkstationId: z.string().min(1, "Host workstation is required"),
  serviceType: z.string().min(1, "Service type is required"),
});

type ServiceHostFormData = z.infer<typeof serviceHostFormSchema>;

interface CreatedServiceHost extends ServiceHost {
  registrationToken: string;
  encryptionKey: string;
}

export default function ServiceHostsPage() {
  const { toast } = useToast();
  const { selectedEnterpriseId } = useEmc();
  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";
  const [activeTab, setActiveTab] = useState("dashboard");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdHost, setCreatedHost] = useState<CreatedServiceHost | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/properties${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: workstations = [], isLoading: wsLoading } = useQuery<WorkstationWithProperty[]>({
    queryKey: ["/api/workstations", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/workstations${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch workstations");
      return res.json();
    },
  });

  const { data: allBindings = [] } = useQuery<ServiceBinding[]>({
    queryKey: ["/api/workstation-service-bindings", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/workstation-service-bindings${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch service bindings");
      return res.json();
    },
  });

  const { data: serviceHosts = [] } = useQuery<ServiceHost[]>({
    queryKey: ["/api/service-hosts", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/service-hosts${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch service hosts");
      return res.json();
    },
  });

  const { data: dashboardData, isLoading: dashboardLoading, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/service-hosts/status-dashboard", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/service-hosts/status-dashboard${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const createServiceHostMutation = useMutation({
    mutationFn: async (data: ServiceHostFormData) => {
      const res = await apiRequest("POST", "/api/service-hosts", {
        name: data.name,
        propertyId: data.propertyId,
        hostWorkstationId: data.hostWorkstationId,
        serviceType: data.serviceType,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create service");
      }
      const createdHost = await res.json() as CreatedServiceHost;
      return createdHost;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-hosts", { enterpriseId: selectedEnterpriseId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-hosts/status-dashboard", { enterpriseId: selectedEnterpriseId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/workstation-service-bindings", { enterpriseId: selectedEnterpriseId }] });
      setCreateDialogOpen(false);
      setCreatedHost(data);
      setTokenDialogOpen(true);
      toast({ title: "Service registered successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteServiceHostMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/service-hosts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-hosts", { enterpriseId: selectedEnterpriseId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-hosts/status-dashboard", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Service deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete service", variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const workstationsWithServiceHost = workstations.filter(ws => {
    const bindings = allBindings.filter(b => b.workstationId === ws.id && b.active);
    return bindings.some(b => b.serviceType === "caps" || b.serviceType === "print_controller" || 
                             b.serviceType === "kds_controller" || b.serviceType === "payment_controller");
  });

  const getServiceBindingsForWorkstation = (workstationId: string) => {
    const bindings = allBindings.filter(b => b.workstationId === workstationId && b.active);
    // Deduplicate by serviceType (keep first occurrence)
    const uniqueBindings = bindings.reduce((acc, binding) => {
      if (!acc.find(b => b.serviceType === binding.serviceType)) {
        acc.push(binding);
      }
      return acc;
    }, [] as ServiceBinding[]);
    return uniqueBindings;
  };

  const getStatusBadge = (bindings: ServiceBinding[]) => {
    if (bindings.length === 0) {
      return <Badge variant="outline" className="text-muted-foreground">No Services</Badge>;
    }
    return <Badge className="bg-green-600">{bindings.length} Active</Badge>;
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Services</h1>
          <p className="text-muted-foreground">Monitor and manage on-premise services</p>
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
                  <CardTitle>Service Status</CardTitle>
                  <CardDescription>Real-time status of all registered services</CardDescription>
                </CardHeader>
                <CardContent>
                  {!dashboardData?.serviceHosts?.length ? (
                    <div className="text-center py-12">
                      <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground mb-4">No services registered</p>
                      <p className="text-sm text-muted-foreground">
                        Configure services from the Configuration tab.
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
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Registered Services</CardTitle>
                <CardDescription>
                  Services registered for on-premise deployment. Each service receives a unique token for authentication.
                </CardDescription>
              </div>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-add-service">
                <Plus className="h-4 w-4 mr-2" />
                Register Service
              </Button>
            </CardHeader>
            <CardContent>
              {serviceHosts.length === 0 ? (
                <div className="text-center py-8">
                  <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-2">No Services registered</p>
                  <p className="text-sm text-muted-foreground">
                    Click "Register Service" to add your first service (CAPS, Print, KDS, or Payment).
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Host Workstation</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceHosts.map((host) => {
                      const property = properties.find(p => p.id === host.propertyId);
                      const hostWs = workstations.find(ws => ws.id === (host as any).hostWorkstationId);
                      return (
                        <TableRow key={host.id} data-testid={`row-registered-host-${host.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-primary" />
                              {host.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {getServiceLabel((host as any).serviceType || 'caps')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {hostWs ? (
                              <span className="font-medium">{hostWs.name}</span>
                            ) : (
                              <span className="text-muted-foreground">Not assigned</span>
                            )}
                          </TableCell>
                          <TableCell>{property?.name || "Unknown"}</TableCell>
                          <TableCell>
                            {host.status === 'online' ? (
                              <Badge className="bg-green-600">Online</Badge>
                            ) : (
                              <Badge variant="outline">Offline</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm(`Delete Service "${host.name}"? This cannot be undone.`)) {
                                  deleteServiceHostMutation.mutate(host.id);
                                }
                              }}
                              data-testid={`button-delete-host-${host.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workstations with Service Controller Bindings</CardTitle>
              <CardDescription>
                Workstations with CAPS, Print, KDS, or Payment Controller services act as service hosts.
                Configure service bindings on the Workstations page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {wsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : workstationsWithServiceHost.length === 0 ? (
                <div className="text-center py-12">
                  <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">No workstations configured with service hosting capabilities</p>
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
                <CardTitle className="text-lg">Services Architecture</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  Services run on designated workstations (host workstations) to enable 
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
                  to local services for uninterrupted operations.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-600 w-16 justify-center">GREEN</Badge>
                    <span>Connected to cloud, full functionality</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-yellow-500 text-black w-16 justify-center">YELLOW</Badge>
                    <span>Internet down, using local services</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-500 w-16 justify-center">ORANGE</Badge>
                    <span>Host workstation down, local agents active</span>
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

      <CreateServiceHostDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        properties={properties}
        workstations={workstations}
        onSubmit={(data) => createServiceHostMutation.mutate(data)}
        isLoading={createServiceHostMutation.isPending}
      />

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Service Registered
            </DialogTitle>
            <DialogDescription>
              Save these credentials securely. The token is only shown once and cannot be retrieved later.
            </DialogDescription>
          </DialogHeader>
          
          {createdHost && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-md">
                <p className="text-sm text-amber-600 font-medium mb-2">
                  Copy these credentials now - they will not be shown again!
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Service ID</label>
                <div className="flex gap-2">
                  <Input value={createdHost.id} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(createdHost.id, "Service ID")}
                    data-testid="button-copy-host-id"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Registration Token</label>
                <div className="flex gap-2">
                  <Input value={createdHost.registrationToken} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(createdHost.registrationToken, "Registration Token")}
                    data-testid="button-copy-token"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Encryption Key</label>
                <div className="flex gap-2">
                  <Input value={createdHost.encryptionKey} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(createdHost.encryptionKey, "Encryption Key")}
                    data-testid="button-copy-encryption-key"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setTokenDialogOpen(false)} data-testid="button-close-token-dialog">
              I've Saved These Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CreateServiceHostDialogProps {
  open: boolean;
  onClose: () => void;
  properties: Property[];
  workstations: Workstation[];
  onSubmit: (data: ServiceHostFormData) => void;
  isLoading: boolean;
}

function CreateServiceHostDialog({ open, onClose, properties, workstations, onSubmit, isLoading }: CreateServiceHostDialogProps) {
  const form = useForm<ServiceHostFormData>({
    resolver: zodResolver(serviceHostFormSchema),
    defaultValues: {
      name: "",
      propertyId: "",
      hostWorkstationId: "",
      serviceType: "caps",
    },
  });

  const selectedPropertyId = form.watch("propertyId");
  const selectedServiceType = form.watch("serviceType");
  
  const filteredWorkstations = workstations.filter(ws => ws.propertyId === selectedPropertyId);

  const handleSubmit = (data: ServiceHostFormData) => {
    onSubmit(data);
  };

  const serviceTypeOptions = [
    { value: "caps", label: "CAPS - Offline Transaction Processing", description: "The main brain for offline mode. Stores local database, handles transactions when cloud is unavailable." },
    { value: "print", label: "Print Service", description: "Routes print jobs to network printers. Handles receipts, kitchen tickets, reports." },
    { value: "kds", label: "KDS Controller", description: "Manages kitchen display routing and order flow." },
    { value: "payment", label: "Payment Controller", description: "Handles payment terminal communication and authorization." },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Service</DialogTitle>
          <DialogDescription>
            Register a new on-premise service. You'll receive authentication credentials for the service to connect to the cloud.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Host Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Store-001 Primary Host" {...field} data-testid="input-host-name" />
                  </FormControl>
                  <FormDescription>A descriptive name for this service</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="propertyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property</FormLabel>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue("hostWorkstationId", "");
                  }} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-property">
                        <SelectValue placeholder="Select a property" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {properties.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>The property this service will serve</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="serviceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-service-type">
                        <SelectValue placeholder="Select service type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {serviceTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {serviceTypeOptions.find(o => o.value === selectedServiceType)?.description || 
                     "Select the type of service this host will provide"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedPropertyId && (
              <FormField
                control={form.control}
                name="hostWorkstationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Host Workstation</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-host-workstation">
                          <SelectValue placeholder="Select host workstation" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredWorkstations.map((ws) => (
                          <SelectItem key={ws.id} value={ws.id}>
                            {ws.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The workstation that will run this service. CAL Wizard will install the service on this device.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="button-register">
                {isLoading ? "Registering..." : "Register Host"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
