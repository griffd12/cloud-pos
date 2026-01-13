import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Clock, Receipt, ShoppingBag, Send, Loader2, Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface OpenCheck {
  id: string;
  checkNumber: number;
  orderType: string;
  status: string;
  guestCount: number | null;
  itemCount: number;
  unsentCount: number;
  roundCount: number;
  lastRoundAt: string | null;
  createdAt: string;
}

interface CheckLockStatus {
  status: 'available' | 'locked' | 'offline_locked';
  lockedByWorkstationId?: string;
  lockedByWorkstationName?: string;
  lockMode?: string;
  isCurrentWorkstation?: boolean;
}

interface OpenChecksModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (checkId: string) => void;
  rvcId: string | undefined;
  workstationId?: string | null;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatOrderType(type: string): string {
  const labels: Record<string, string> = {
    dine_in: "Dine In",
    take_out: "Take Out",
    delivery: "Delivery",
    pickup: "Pickup",
  };
  return labels[type] || type;
}

function LockIndicator({ lockStatus }: { lockStatus: CheckLockStatus | undefined }) {
  if (!lockStatus || lockStatus.status === 'available') {
    const isOwner = lockStatus?.isCurrentWorkstation;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" 
            data-testid={isOwner ? "lock-indicator-owner" : "lock-indicator-green"} 
          />
        </TooltipTrigger>
        <TooltipContent>
          {isOwner ? "You have this check" : "Available to pick up"}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (lockStatus.status === 'offline_locked') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" data-testid="lock-indicator-red" />
            <Lock className="w-3 h-3 text-red-500" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">Locked by offline workstation</p>
            <p className="text-xs text-muted-foreground">{lockStatus.lockedByWorkstationName || lockStatus.lockedByWorkstationId}</p>
            <p className="text-xs text-red-400 mt-1">Workstation is offline - may require manager override</p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500 flex-shrink-0" data-testid="lock-indicator-yellow" />
          <Lock className="w-3 h-3 text-yellow-500" />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-sm">
          <p className="font-medium">Locked by another workstation</p>
          <p className="text-xs text-muted-foreground">{lockStatus.lockedByWorkstationName || lockStatus.lockedByWorkstationId}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function OpenChecksModal({
  open,
  onClose,
  onSelect,
  rvcId,
  workstationId,
}: OpenChecksModalProps) {
  const { data: openChecks = [], isLoading, refetch: refetchChecks } = useQuery<OpenCheck[]>({
    queryKey: ["/api/checks/open", { rvcId }],
    queryFn: async () => {
      if (!rvcId) return [];
      const res = await fetch(`/api/checks/open?rvcId=${rvcId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch open checks");
      return res.json();
    },
    enabled: open && !!rvcId,
    refetchOnMount: "always",
    staleTime: 0,
    refetchInterval: open ? 2000 : false,
  });
  
  const { data: lockData, refetch: refetchLocks } = useQuery<{ lockStatus: Record<string, CheckLockStatus> }>({
    queryKey: ["/api/checks/locks", { rvcId, workstationId }],
    queryFn: async () => {
      if (!rvcId) return { lockStatus: {} };
      const params = new URLSearchParams();
      params.append("rvcId", rvcId);
      if (workstationId) params.append("workstationId", workstationId);
      
      const res = await fetch(`/api/checks/locks?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return { lockStatus: {} };
      return res.json();
    },
    enabled: open && !!rvcId,
    refetchOnMount: "always",
    staleTime: 0,
    refetchInterval: open ? 2000 : false,
  });

  const lockStatuses = lockData?.lockStatus || {};

  useEffect(() => {
    if (open && rvcId) {
      refetchChecks();
      refetchLocks();
    }
  }, [open, rvcId, refetchChecks, refetchLocks]);

  const handleSelect = (checkId: string) => {
    onSelect(checkId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            data-testid="text-open-checks-title"
          >
            <Receipt className="w-5 h-5" />
            Open Checks
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : openChecks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No open checks</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 pr-2">
              {openChecks.map((check) => {
                const lockStatus = lockStatuses[check.id];
                return (
                  <Card
                    key={check.id}
                    className="p-3 cursor-pointer hover-elevate active-elevate-2"
                    onClick={() => handleSelect(check.id)}
                    data-testid={`card-open-check-${check.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <LockIndicator lockStatus={lockStatus} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">
                            Check #{check.checkNumber}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {formatOrderType(check.orderType)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>{check.itemCount} items</span>
                          {check.roundCount > 0 && (
                            <span className="flex items-center gap-1">
                              <Send className="w-3 h-3" />
                              {check.roundCount} sent
                            </span>
                          )}
                          {check.unsentCount > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {check.unsentCount} unsent
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(check.lastRoundAt || check.createdAt)}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose} data-testid="button-close-open-checks">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
