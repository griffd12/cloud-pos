import { useConnectionMode, type ConnectionMode } from "@/lib/api-client";
import { Wifi, WifiOff, AlertTriangle, CircleAlert, RefreshCw, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const modeConfig: Record<ConnectionMode, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof Wifi;
}> = {
  green: {
    label: "Online",
    description: "Connected to cloud - full functionality",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    borderColor: "border-green-200 dark:border-green-800",
    icon: Wifi,
  },
  yellow: {
    label: "Offline Mode",
    description: "Using local Service Host - cloud sync pending",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    icon: AlertTriangle,
  },
  orange: {
    label: "Limited",
    description: "Service Host down - using local agents only",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    borderColor: "border-orange-200 dark:border-orange-800",
    icon: CircleAlert,
  },
  red: {
    label: "Emergency",
    description: "No network - operations queued locally",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    borderColor: "border-red-200 dark:border-red-800",
    icon: WifiOff,
  },
};

interface ConnectionModeIndicatorProps {
  variant?: "badge" | "full" | "icon-only";
  showRefresh?: boolean;
  className?: string;
}

export function ConnectionModeIndicator({
  variant = "badge",
  showRefresh = false,
  className = "",
}: ConnectionModeIndicatorProps) {
  const { mode, status, forceCheck } = useConnectionMode();
  const [isChecking, setIsChecking] = useState(false);
  
  const config = modeConfig[mode];
  const Icon = config.icon;
  
  const handleRefresh = async () => {
    setIsChecking(true);
    try {
      await forceCheck();
    } finally {
      setIsChecking(false);
    }
  };
  
  if (variant === "icon-only") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center ${config.color} ${className}`} data-testid="connection-mode-icon">
            <Icon className="h-4 w-4" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  if (variant === "badge") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`${config.bgColor} ${config.borderColor} ${config.color} gap-1 ${className}`}
            data-testid="connection-mode-badge"
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            {status && (
              <div className="text-xs space-y-0.5 pt-1 border-t">
                <div className="flex items-center gap-1">
                  {status.cloudReachable ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span>Cloud API</span>
                </div>
                <div className="flex items-center gap-1">
                  {status.serviceHostReachable ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span>Service Host</span>
                </div>
                <div className="flex items-center gap-1">
                  {status.printAgentAvailable ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span>Print Agent</span>
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <div className={`flex items-center gap-2 p-2 rounded-md ${config.bgColor} ${config.borderColor} border ${className}`} data-testid="connection-mode-full">
      <Icon className={`h-5 w-5 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-sm ${config.color}`}>{config.label}</div>
        <div className="text-xs text-muted-foreground truncate">{config.description}</div>
      </div>
      {showRefresh && (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleRefresh}
          disabled={isChecking}
          data-testid="button-refresh-connection"
        >
          <RefreshCw className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`} />
        </Button>
      )}
    </div>
  );
}

export function ConnectionModeBanner() {
  const { mode, status } = useConnectionMode();
  
  if (mode === "green") {
    return null;
  }
  
  const config = modeConfig[mode];
  const Icon = config.icon;
  
  return (
    <div 
      className={`flex items-center gap-2 px-3 py-1.5 ${config.bgColor} ${config.borderColor} border-b`}
      data-testid="connection-mode-banner"
    >
      <Icon className={`h-4 w-4 ${config.color}`} />
      <span className={`text-sm font-medium ${config.color}`}>{config.label}:</span>
      <span className="text-sm text-muted-foreground">{config.description}</span>
      {status && (
        <span className="ml-auto text-xs text-muted-foreground">
          Last checked: {status.lastChecked.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
