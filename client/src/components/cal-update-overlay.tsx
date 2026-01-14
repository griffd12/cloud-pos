import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Download, Package, Terminal, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface CalUpdateStatus {
  type: "CAL_UPDATE_STATUS";
  status: "starting" | "downloading" | "installing" | "running_script" | "completed" | "failed";
  packageName: string;
  packageVersion: string;
  message: string;
  progress?: number;
  logOutput?: string;
}

interface CalUpdateOverlayProps {
  updateStatus: CalUpdateStatus | null;
  onDismiss?: () => void;
}

export function CalUpdateOverlay({ updateStatus, onDismiss }: CalUpdateOverlayProps) {
  const logEndRef = useRef<HTMLDivElement>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [updateStatus?.logOutput]);
  
  useEffect(() => {
    if (updateStatus?.status === "completed") {
      setShowCompleted(true);
      const timer = setTimeout(() => {
        setShowCompleted(false);
        onDismiss?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [updateStatus?.status, onDismiss]);
  
  if (!updateStatus) return null;
  
  if (updateStatus.status === "completed" && !showCompleted) return null;
  
  const getStatusIcon = () => {
    switch (updateStatus.status) {
      case "starting":
      case "downloading":
        return <Download className="h-8 w-8 animate-pulse text-primary" />;
      case "installing":
      case "running_script":
        return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
      case "completed":
        return <CheckCircle2 className="h-8 w-8 text-green-500" />;
      case "failed":
        return <XCircle className="h-8 w-8 text-destructive" />;
      default:
        return <Package className="h-8 w-8 text-primary" />;
    }
  };
  
  const getStatusText = () => {
    switch (updateStatus.status) {
      case "starting":
        return "Starting Update";
      case "downloading":
        return "Downloading Package";
      case "installing":
        return "Installing Package";
      case "running_script":
        return "Running Setup Script";
      case "completed":
        return "Update Complete";
      case "failed":
        return "Update Failed";
      default:
        return "Updating";
    }
  };
  
  const getProgressValue = () => {
    if (updateStatus.progress) return updateStatus.progress;
    switch (updateStatus.status) {
      case "starting":
        return 5;
      case "downloading":
        return 30;
      case "installing":
        return 50;
      case "running_script":
        return 75;
      case "completed":
        return 100;
      case "failed":
        return 0;
      default:
        return 10;
    }
  };
  
  const getStatusBadgeVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    switch (updateStatus.status) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };
  
  const logLines = updateStatus.logOutput?.split("\n").filter(line => line.trim()) || [];
  
  return (
    <div 
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center"
      data-testid="cal-update-overlay"
    >
      <Card className="w-full max-w-2xl mx-4 shadow-2xl border-2">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <CardTitle className="text-xl" data-testid="text-update-title">
                  System Update In Progress
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Please wait while the system is being updated
                </p>
              </div>
            </div>
            <Badge variant={getStatusBadgeVariant()} data-testid="badge-update-status">
              {getStatusText()}
            </Badge>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium" data-testid="text-package-name">
                  {updateStatus.packageName}
                </span>
                <Badge variant="outline" className="text-xs" data-testid="badge-package-version">
                  v{updateStatus.packageVersion}
                </Badge>
              </div>
              <span className="text-muted-foreground">
                {getProgressValue()}%
              </span>
            </div>
            <Progress 
              value={getProgressValue()} 
              className="h-2"
              data-testid="progress-update"
            />
          </div>
          
          <div className="text-sm text-muted-foreground" data-testid="text-current-status">
            {updateStatus.message}
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="h-4 w-4" />
              <span>Installation Log</span>
            </div>
            
            <ScrollArea className="h-64 w-full rounded-md border bg-muted/30 p-4">
              <div className="font-mono text-xs space-y-1" data-testid="log-output">
                {logLines.length === 0 ? (
                  <p className="text-muted-foreground italic">Waiting for log output...</p>
                ) : (
                  logLines.map((line, index) => (
                    <div 
                      key={index}
                      className={`${
                        line.includes("[ERROR]") 
                          ? "text-destructive" 
                          : line.includes("[CAL]") 
                            ? "text-primary" 
                            : "text-foreground"
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>
          
          {updateStatus.status === "failed" && (
            <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium">
                Update failed. The system will retry automatically. Please contact support if the issue persists.
              </p>
            </div>
          )}
          
          {updateStatus.status === "completed" && (
            <div className="mt-4 p-3 rounded-md bg-green-500/10 border border-green-500/20">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                Update completed successfully. Resuming normal operations...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
        <p className="text-sm text-muted-foreground">
          POS operations are temporarily disabled during system updates
        </p>
      </div>
    </div>
  );
}
