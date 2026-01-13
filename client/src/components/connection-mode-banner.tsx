import { useConnectionMode, type ConnectionMode } from "@/lib/api-client";
import { Wifi, Signal, WifiOff, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ConnectionModeBannerProps {
  className?: string;
}

const modeConfig: Record<ConnectionMode, {
  bgColor: string;
  textColor: string;
  label: string;
  shortLabel: string;
  Icon: typeof Wifi;
}> = {
  green: {
    bgColor: "bg-green-500",
    textColor: "text-white",
    label: "Cloud Connected - All features available",
    shortLabel: "CLOUD",
    Icon: Wifi,
  },
  yellow: {
    bgColor: "bg-yellow-500",
    textColor: "text-black",
    label: "LAN Only - Using Service Host (Cloud offline)",
    shortLabel: "LAN",
    Icon: Signal,
  },
  orange: {
    bgColor: "bg-orange-500",
    textColor: "text-white",
    label: "Local Agents Only - Limited functionality",
    shortLabel: "LOCAL",
    Icon: WifiOff,
  },
  red: {
    bgColor: "bg-red-500",
    textColor: "text-white",
    label: "Emergency Mode - Browser storage only",
    shortLabel: "OFFLINE",
    Icon: AlertTriangle,
  },
};

export function ConnectionModeBanner({ className = "" }: ConnectionModeBannerProps) {
  const { mode, status } = useConnectionMode();
  const config = modeConfig[mode];
  const Icon = config.Icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-testid="connection-mode-banner"
          className={`h-6 w-full flex items-center justify-center gap-2 ${config.bgColor} ${config.textColor} text-xs font-medium select-none cursor-default ${className}`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{config.shortLabel}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">{config.label}</p>
          {status && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Cloud: {status.cloudReachable ? "Connected" : "Offline"}</p>
              <p>Service Host: {status.serviceHostReachable ? "Connected" : "Offline"}</p>
              <p>Print Agent: {status.printAgentAvailable ? "Available" : "Unavailable"}</p>
              <p>Last checked: {status.lastChecked?.toLocaleTimeString() || "Never"}</p>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
