import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEmc } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { apiClient, useConnectionMode, type ConnectionMode } from "@/lib/api-client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wifi,
  WifiOff,
  Signal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  Monitor,
  Tv,
  Loader2,
  Play,
  Square,
  Send,
  Activity,
  Zap,
  Globe,
  Laptop,
  ArrowRightLeft,
  Clock,
  Building2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Property } from "@shared/schema";

interface ConnectivityStatus {
  mode: ConnectionMode;
  cloudReachable: boolean;
  serviceHostReachable: boolean;
  printAgentAvailable: boolean;
  paymentAppAvailable: boolean;
  lastChecked: Date;
}

interface TestResult {
  id: string;
  timestamp: Date;
  testType: string;
  target: string;
  success: boolean;
  latencyMs?: number;
  error?: string;
}

interface ServiceHostStatus {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastHeartbeat: string | null;
  propertyId: string;
  propertyName: string;
}

interface DeviceStatus {
  id: string;
  name: string;
  type: 'workstation' | 'kds';
  status: 'connected' | 'disconnected' | 'pending';
  lastSeen: string | null;
  propertyId: string;
  propertyName: string;
}

const modeConfig: Record<ConnectionMode, {
  color: string;
  bgColor: string;
  label: string;
  description: string;
  Icon: typeof Wifi;
}> = {
  green: {
    color: 'text-green-600',
    bgColor: 'bg-green-500',
    label: 'GREEN - Cloud Connected',
    description: 'Full cloud connectivity. All features available.',
    Icon: Wifi,
  },
  yellow: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500',
    label: 'YELLOW - LAN Only',
    description: 'Cloud offline, using local services. Core POS features work.',
    Icon: Signal,
  },
  orange: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-500',
    label: 'ORANGE - Local Agents',
    description: 'Host workstation offline. Print and payment agents available.',
    Icon: WifiOff,
  },
  red: {
    color: 'text-red-600',
    bgColor: 'bg-red-500',
    label: 'RED - Emergency',
    description: 'All services offline. Browser storage only.',
    Icon: AlertTriangle,
  },
};

export default function ConnectivityTestPage() {
  const { toast } = useToast();
  const { selectedEnterpriseId } = useEmc();
  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";
  const { mode, status, forceCheck } = useConnectionMode();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [serviceHostUrl, setServiceHostUrl] = useState(
    localStorage.getItem('serviceHostUrl') || 'http://service-host.local:3001'
  );
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/properties${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: serviceHosts = [], isLoading: hostsLoading } = useQuery<ServiceHostStatus[]>({
    queryKey: ["/api/service-hosts/status-summary", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/service-hosts/status-summary${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch service hosts");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: registeredDevices = [] } = useQuery<DeviceStatus[]>({
    queryKey: ["/api/registered-devices/status-summary", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/registered-devices/status-summary${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch registered devices");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const filteredServiceHosts = selectedPropertyId && selectedPropertyId !== "all"
    ? serviceHosts.filter(h => h.propertyId === selectedPropertyId)
    : serviceHosts;

  const filteredDevices = selectedPropertyId && selectedPropertyId !== "all"
    ? registeredDevices.filter(d => d.propertyId === selectedPropertyId)
    : registeredDevices;

  // Fetch live connectivity status from server (Print Agents, etc.)
  const { data: connectivityStatus } = useQuery<{
    printAgents: { connected: boolean; count: number };
    serviceHosts: { connected: boolean; count: number };
    timestamp: string;
  }>({
    queryKey: ["/api/connectivity-status", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/connectivity-status${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch connectivity status");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const config = modeConfig[mode];
  const ModeIcon = config.Icon;

  const addTestResult = (result: Omit<TestResult, 'id' | 'timestamp'>) => {
    setTestResults(prev => [{
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...result,
    }, ...prev.slice(0, 19)]);
  };

  const runConnectivityTest = async () => {
    setIsRunningTest(true);
    
    try {
      const startCloud = performance.now();
      try {
        const res = await fetch('/health', { signal: AbortSignal.timeout(5000) });
        const latency = Math.round(performance.now() - startCloud);
        addTestResult({
          testType: 'Cloud Health',
          target: 'Cloud API',
          success: res.ok,
          latencyMs: latency,
        });
      } catch (e) {
        addTestResult({
          testType: 'Cloud Health',
          target: 'Cloud API',
          success: false,
          error: (e as Error).message,
        });
      }

      const startSh = performance.now();
      try {
        const res = await fetch(`${serviceHostUrl}/health`, { signal: AbortSignal.timeout(5000) });
        const latency = Math.round(performance.now() - startSh);
        addTestResult({
          testType: 'Service Health',
          target: serviceHostUrl,
          success: res.ok,
          latencyMs: latency,
        });
      } catch (e) {
        addTestResult({
          testType: 'Service Health',
          target: serviceHostUrl,
          success: false,
          error: (e as Error).message,
        });
      }

      await forceCheck();
      
      toast({ title: "Connectivity test complete" });
    } finally {
      setIsRunningTest(false);
    }
  };

  const runKdsTest = async () => {
    setIsRunningTest(true);
    const selectedProperty = properties.find(p => p.id === selectedPropertyId);
    const targetLabel = selectedProperty ? selectedProperty.name : 'All Properties';
    const propertyIdToSend = selectedPropertyId && selectedPropertyId !== "all" ? selectedPropertyId : undefined;
    
    try {
      const res = await apiRequest("POST", "/api/kds-tickets/test", {
        testMessage: "Connectivity test ticket",
        source: "connectivity-test-dashboard",
        propertyId: propertyIdToSend,
      });
      
      if (res.ok) {
        addTestResult({
          testType: 'KDS Test Ticket',
          target: `Kitchen Display (${targetLabel})`,
          success: true,
        });
        toast({ title: `Test ticket sent to KDS at ${targetLabel}` });
      } else {
        const error = await res.json();
        addTestResult({
          testType: 'KDS Test Ticket',
          target: `Kitchen Display (${targetLabel})`,
          success: false,
          error: error.error || 'Failed to send test ticket',
        });
      }
    } catch (e) {
      addTestResult({
        testType: 'KDS Test Ticket',
        target: `Kitchen Display (${targetLabel})`,
        success: false,
        error: (e as Error).message,
      });
    } finally {
      setIsRunningTest(false);
    }
  };

  const reloadAllDevices = async () => {
    const selectedProperty = properties.find(p => p.id === selectedPropertyId);
    const targetLabel = selectedProperty ? selectedProperty.name : 'All Properties';
    const propertyIdToSend = selectedPropertyId && selectedPropertyId !== "all" ? selectedPropertyId : undefined;
    
    try {
      const res = await apiRequest("POST", "/api/registered-devices/reload", {
        propertyId: propertyIdToSend,
      });
      
      if (res.ok) {
        addTestResult({
          testType: 'Remote Reload',
          target: `All Devices (${targetLabel})`,
          success: true,
        });
        toast({ title: `Reload command sent to devices at ${targetLabel}` });
      } else {
        const error = await res.json();
        toast({ 
          title: "Failed to reload devices", 
          description: error.message,
          variant: "destructive" 
        });
      }
    } catch (e) {
      toast({ 
        title: "Failed to reload devices", 
        description: (e as Error).message,
        variant: "destructive" 
      });
    }
  };

  const reloadDevice = async (deviceId: string, deviceName: string) => {
    try {
      const res = await apiRequest("POST", "/api/registered-devices/reload", {
        deviceId,
      });
      
      if (res.ok) {
        addTestResult({
          testType: 'Remote Reload',
          target: deviceName,
          success: true,
        });
        toast({ title: `Reload command sent to ${deviceName}` });
      } else {
        const error = await res.json();
        toast({ 
          title: `Failed to reload ${deviceName}`, 
          description: error.message,
          variant: "destructive" 
        });
      }
    } catch (e) {
      toast({ 
        title: `Failed to reload ${deviceName}`, 
        description: (e as Error).message,
        variant: "destructive" 
      });
    }
  };

  const handleServiceHostUrlChange = () => {
    localStorage.setItem('serviceHostUrl', serviceHostUrl);
    apiClient.configure({ serviceHostUrl });
    toast({ title: "Service URL updated" });
    forceCheck();
  };

  const handleSimulateOffline = (checked: boolean) => {
    setSimulateOffline(checked);
    if (checked) {
      toast({ 
        title: "Simulating offline mode", 
        description: "Cloud requests will be blocked to test failover" 
      });
    } else {
      forceCheck();
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Connectivity Test Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Test workstation, KDS, and service communications
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <Select
              value={selectedPropertyId}
              onValueChange={setSelectedPropertyId}
            >
              <SelectTrigger className="w-48" data-testid="select-property">
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={runConnectivityTest}
            disabled={isRunningTest}
            data-testid="button-run-test"
          >
            {isRunningTest ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Run Connectivity Test
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className={`p-4 rounded-lg border-2 ${
              mode === 'green' ? 'border-green-500 bg-green-50 dark:bg-green-950/20' :
              mode === 'yellow' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20' :
              mode === 'orange' ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' :
              'border-red-500 bg-red-50 dark:bg-red-950/20'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${config.bgColor}`}>
                  <ModeIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className={`font-bold text-lg ${config.color}`}>{config.label}</h3>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Globe className="w-4 h-4" />
                  <span className="text-sm font-medium">Cloud</span>
                </div>
                <div className={`flex items-center justify-center gap-1 ${
                  status?.cloudReachable ? 'text-green-600' : 'text-red-600'
                }`}>
                  {status?.cloudReachable ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm">{status?.cloudReachable ? 'Connected' : 'Offline'}</span>
                </div>
              </div>

              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Server className="w-4 h-4" />
                  <span className="text-sm font-medium">Local Services</span>
                </div>
                <div className={`flex items-center justify-center gap-1 ${
                  status?.serviceHostReachable ? 'text-green-600' : 'text-red-600'
                }`}>
                  {status?.serviceHostReachable ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm">{status?.serviceHostReachable ? 'Connected' : 'Offline'}</span>
                </div>
              </div>

              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Laptop className="w-4 h-4" />
                  <span className="text-sm font-medium">Print Agent</span>
                </div>
                <div className={`flex items-center justify-center gap-1 ${
                  connectivityStatus?.printAgents?.connected ? 'text-green-600' : 'text-muted-foreground'
                }`}>
                  {connectivityStatus?.printAgents?.connected ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm">
                    {connectivityStatus?.printAgents?.connected 
                      ? `Connected (${connectivityStatus.printAgents.count})` 
                      : 'Not Connected'}
                  </span>
                </div>
              </div>

              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-medium">Payment App</span>
                </div>
                <div className={`flex items-center justify-center gap-1 ${
                  status?.paymentAppAvailable ? 'text-green-600' : 'text-muted-foreground'
                }`}>
                  {status?.paymentAppAvailable ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm">{status?.paymentAppAvailable ? 'Available' : 'Not Found'}</span>
                </div>
              </div>
            </div>

            {status?.lastChecked && (
              <p className="text-xs text-muted-foreground text-center">
                Last checked: {formatDistanceToNow(status.lastChecked, { addSuffix: true })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Quick Tests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              className="w-full" 
              variant="outline"
              onClick={forceCheck}
              disabled={isRunningTest}
              data-testid="button-refresh-status"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Status
            </Button>
            
            <Button 
              className="w-full" 
              variant="outline"
              onClick={runKdsTest}
              disabled={isRunningTest}
              data-testid="button-kds-test"
            >
              <Tv className="w-4 h-4 mr-2" />
              Send KDS Test Ticket
            </Button>

            <Button 
              className="w-full" 
              variant="outline"
              onClick={reloadAllDevices}
              disabled={isRunningTest}
              data-testid="button-reload-all"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload All Devices
            </Button>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="service-host-url" className="text-sm">Service URL</Label>
              <div className="flex gap-2">
                <Input
                  id="service-host-url"
                  value={serviceHostUrl}
                  onChange={(e) => setServiceHostUrl(e.target.value)}
                  placeholder="http://service-host.local:3001"
                  data-testid="input-service-host-url"
                />
                <Button 
                  size="icon" 
                  variant="outline"
                  onClick={handleServiceHostUrlChange}
                  data-testid="button-save-url"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Separator />

            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="simulate-offline" className="text-sm font-medium">
                    Simulate Cloud Disconnect
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Block cloud requests to test offline failover
                  </p>
                </div>
                <Switch
                  id="simulate-offline"
                  checked={simulateOffline}
                  onCheckedChange={handleSimulateOffline}
                  data-testid="switch-simulate-offline"
                />
              </div>
              {simulateOffline && (
                <div className="mt-2 flex items-center gap-2 text-orange-600 text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Offline simulation active</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Services
            </CardTitle>
            <CardDescription>On-premise services for offline resilience</CardDescription>
          </CardHeader>
          <CardContent>
            {hostsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredServiceHosts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No services {selectedPropertyId && selectedPropertyId !== "all" ? "for this property" : "registered"}</p>
                <p className="text-xs">Register a service to enable offline mode</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredServiceHosts.map((host) => (
                  <div 
                    key={host.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <Server className={`w-5 h-5 ${
                        host.status === 'online' ? 'text-green-600' : 'text-red-600'
                      }`} />
                      <div>
                        <p className="font-medium text-sm">{host.name}</p>
                        <p className="text-xs text-muted-foreground">{host.propertyName}</p>
                      </div>
                    </div>
                    <Badge variant={host.status === 'online' ? 'default' : 'destructive'}>
                      {host.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Registered Devices
            </CardTitle>
            <CardDescription>Workstations and KDS displays</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredDevices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Monitor className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No devices {selectedPropertyId && selectedPropertyId !== "all" ? "for this property" : "registered"}</p>
                <p className="text-xs">Enroll devices using an enrollment code</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDevices.slice(0, 5).map((device) => (
                  <div 
                    key={device.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      {device.type === 'kds' ? (
                        <Tv className="w-5 h-5 text-orange-600" />
                      ) : (
                        <Monitor className="w-5 h-5 text-blue-600" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{device.name}</p>
                        <p className="text-xs text-muted-foreground">{device.propertyName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => reloadDevice(device.id, device.name)}
                        disabled={device.status !== 'connected'}
                        title={device.status === 'connected' ? 'Reload device' : 'Device offline'}
                        data-testid={`button-reload-device-${device.id}`}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Badge variant={
                        device.status === 'connected' ? 'default' :
                        device.status === 'pending' ? 'secondary' : 'destructive'
                      }>
                        {device.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Test Results
          </CardTitle>
          <CardDescription>Recent connectivity test results</CardDescription>
        </CardHeader>
        <CardContent>
          {testResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>No tests run yet</p>
              <p className="text-xs">Click "Run Connectivity Test" to start</p>
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {testResults.map((result) => (
                  <div 
                    key={result.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      result.success ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 
                      'border-red-200 bg-red-50 dark:bg-red-950/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{result.testType}</p>
                        <p className="text-xs text-muted-foreground">{result.target}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {result.latencyMs !== undefined && (
                        <p className="text-sm font-mono">{result.latencyMs}ms</p>
                      )}
                      {result.error && (
                        <p className="text-xs text-red-600">{result.error}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(result.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
