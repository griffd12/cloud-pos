/**
 * Connection Status Indicator
 * 
 * Shows current connectivity mode (GREEN, YELLOW, ORANGE, RED)
 * with visual indicator and tooltip details.
 */

import { Wifi, WifiOff, AlertTriangle, Signal } from "lucide-react";
import { useConnectionMode, type ConnectionMode } from "@/lib/api-client";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
    label: 'Online',
    description: 'Connected to cloud',
    Icon: Wifi,
  },
  yellow: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500',
    label: 'Offline Mode',
    description: 'Using local services',
    Icon: Signal,
  },
  orange: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-500',
    label: 'Limited Mode',
    description: 'Local agents only',
    Icon: WifiOff,
  },
  red: {
    color: 'text-red-600',
    bgColor: 'bg-red-500',
    label: 'Emergency Mode',
    description: 'Browser only',
    Icon: AlertTriangle,
  },
};

interface ConnectionStatusProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ConnectionStatus({ 
  className, 
  showLabel = true,
  size = 'md' 
}: ConnectionStatusProps) {
  const { mode, status } = useConnectionMode();
  const config = modeConfig[mode];
  const Icon = config.Icon;
  
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={cn(
            "gap-1.5 cursor-default",
            config.color,
            className
          )}
          data-testid="badge-connection-status"
        >
          <span 
            className={cn("rounded-full", config.bgColor, {
              'h-2 w-2': size === 'sm',
              'h-2.5 w-2.5': size === 'md',
              'h-3 w-3': size === 'lg',
            })} 
          />
          <Icon className={sizeClasses[size]} />
          {showLabel && (
            <span className="text-xs font-medium">{config.label}</span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-2">
          <div className="font-medium">{config.description}</div>
          {status && (
            <div className="text-xs space-y-1 text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  status.cloudReachable ? "bg-green-500" : "bg-red-500"
                )} />
                Cloud: {status.cloudReachable ? 'Connected' : 'Disconnected'}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  status.serviceHostReachable ? "bg-green-500" : "bg-red-500"
                )} />
                Local Services: {status.serviceHostReachable ? 'Connected' : 'Disconnected'}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  status.printAgentAvailable ? "bg-green-500" : "bg-gray-400"
                )} />
                Print Agent: {status.printAgentAvailable ? 'Available' : 'Not detected'}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  status.paymentAppAvailable ? "bg-green-500" : "bg-gray-400"
                )} />
                Payment App: {status.paymentAppAvailable ? 'Available' : 'Not detected'}
              </div>
              <div className="text-[10px] pt-1 border-t">
                Last checked: {status.lastChecked.toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function ConnectionModeIndicator({ className }: { className?: string }) {
  const { mode } = useConnectionMode();
  const config = modeConfig[mode];
  
  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium",
        config.bgColor,
        className
      )}
      data-testid="indicator-connection-mode"
    >
      <config.Icon className="h-4 w-4" />
      <span>{config.label}</span>
    </div>
  );
}
