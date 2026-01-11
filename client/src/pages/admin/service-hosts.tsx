import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Property, type Workstation } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Server,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  Settings,
  Trash2,
} from "lucide-react";

interface ServiceHost {
  id: string;
  propertyId: string;
  name: string;
  role: "primary" | "backup";
  status: "online" | "offline" | "degraded";
  authToken?: string;
  lastHeartbeat: string | null;
}

interface ServiceBinding {
  id: string;
  workstationId: string;
  serviceType: string;
  isActive: boolean;
}

interface WorkstationWithProperty extends Workstation {
  propertyName?: string;
}

export default function ServiceHostsPage() {
  const { toast } = useToast();
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: workstations = [], isLoading } = useQuery<WorkstationWithProperty[]>({
    queryKey: ["/api/workstations"],
  });

  const { data: allBindings = [] } = useQuery<ServiceBinding[]>({
    queryKey: ["/api/workstation-service-bindings"],
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Service Hosts</h1>
          <p className="text-muted-foreground">Workstations configured as Service Hosts for on-premise resilience</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workstations with Service Controller Bindings</CardTitle>
          <CardDescription>
            Workstations with CAPS, Print, KDS, or Payment Controller services act as Service Hosts.
            Configure service bindings on the Workstations page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
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
                    <TableRow key={ws.id}>
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
            <CardTitle className="text-lg">Offline Resilience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              When a property loses internet connectivity, workstations automatically failover 
              to the local Service Host for uninterrupted operations.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-green-600" />
                <span><strong className="text-foreground">Green Mode</strong> - Connected to cloud, full functionality</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span><strong className="text-foreground">Yellow Mode</strong> - Internet down, using local Service Host</span>
              </div>
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 text-red-600" />
                <span><strong className="text-foreground">Red Mode</strong> - Complete isolation, limited operations</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
