import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSystemStatus } from "@/hooks/use-system-status";
import { 
  Database, 
  Wifi, 
  WifiOff, 
  Printer, 
  RefreshCw, 
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Circle
} from "lucide-react";

interface SystemStatusModalProps {
  open: boolean;
  onClose: () => void;
  propertyId?: string;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "online":
    case "healthy":
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "degraded":
    case "unknown":
      return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    case "offline":
    case "error":
    case "critical":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "no_agents":
      return <Circle className="w-5 h-5 text-muted-foreground" />;
    default:
      return <Circle className="w-5 h-5 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  let label = status;
  
  switch (status) {
    case "online":
    case "healthy":
      variant = "default";
      label = "Online";
      break;
    case "degraded":
      variant = "outline";
      label = "Degraded";
      break;
    case "unknown":
      variant = "outline";
      label = "Unknown";
      break;
    case "offline":
    case "error":
    case "critical":
      variant = "destructive";
      label = status === "critical" ? "Critical" : "Offline";
      break;
    case "no_agents":
      variant = "secondary";
      label = "Not Configured";
      break;
  }
  
  return <Badge variant={variant}>{label}</Badge>;
}

interface ServiceRowProps {
  icon: React.ReactNode;
  name: string;
  status: string;
  message: string;
  extra?: React.ReactNode;
}

function ServiceRow({ icon, name, status, message, extra }: ServiceRowProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/30">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-medium">{name}</span>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
        {extra}
      </div>
    </div>
  );
}

export function SystemStatusModal({ open, onClose, propertyId }: SystemStatusModalProps) {
  const { status, isLoading, isFetching, refetch } = useSystemStatus({ 
    propertyId, 
    enabled: open 
  });

  const handleRefresh = () => {
    refetch();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Status
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : status ? (
            <>
              <div className="flex items-center justify-between gap-2 pb-2 border-b">
                <div className="flex items-center gap-2">
                  <StatusIcon status={status.overallStatus} />
                  <span className="font-semibold">
                    {status.overallStatus === "healthy" && "All Systems Operational"}
                    {status.overallStatus === "degraded" && "Some Services Degraded"}
                    {status.overallStatus === "critical" && "System Issues Detected"}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleRefresh}
                  disabled={isFetching}
                  data-testid="button-refresh-status"
                >
                  <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <ServiceRow
                icon={<Database className="w-5 h-5 text-blue-500" />}
                name="Database"
                status={status.services.database.status}
                message={status.services.database.message}
              />

              <ServiceRow
                icon={<Wifi className="w-5 h-5 text-purple-500" />}
                name="EMC (Management Console)"
                status={status.services.emc.status}
                message={status.services.emc.message}
              />

              <ServiceRow
                icon={<Printer className="w-5 h-5 text-orange-500" />}
                name="Print Agent"
                status={status.services.printAgent.status}
                message={status.services.printAgent.message}
                extra={
                  status.services.printAgent.agents.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {status.services.printAgent.agents.map((agent) => (
                        <div 
                          key={agent.id} 
                          className="flex items-center justify-between text-xs bg-background/50 px-2 py-1 rounded"
                          data-testid={`status-agent-${agent.id}`}
                        >
                          <span>{agent.name}</span>
                          <span className={`flex items-center gap-1 ${
                            agent.status === "online" 
                              ? "text-green-500" 
                              : "text-muted-foreground"
                          }`}>
                            {agent.status === "online" ? (
                              <Wifi className="w-3 h-3" />
                            ) : (
                              <WifiOff className="w-3 h-3" />
                            )}
                            {agent.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />

              <p className="text-xs text-muted-foreground text-center pt-2">
                Last updated: {new Date(status.timestamp).toLocaleTimeString()}
              </p>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Unable to fetch system status
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-close-system-status">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
