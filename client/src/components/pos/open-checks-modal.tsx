import { useState } from "react";
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
import {
  Clock,
  Receipt,
  ShoppingBag,
  Loader2,
  Lock,
  User,
  UtensilsCrossed,
  MapPin,
  Truck,
  Package,
  Play,
  CheckCircle,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getAuthHeaders, fetchWithTimeout, apiRequest, queryClient } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface OrderCheck {
  id: string;
  checkNumber: number;
  orderType: string;
  status: string;
  fulfillmentStatus: string | null;
  onlineOrderId: string | null;
  customerName: string | null;
  platformSource: string | null;
  guestCount: number | null;
  subtotal: string | null;
  total: string | null;
  tableNumber: string | null;
  openedAt: string;
  closedAt: string | null;
  employeeName: string | null;
  itemCount: number;
  unsentCount: number;
  roundCount: number;
  lastRoundAt: string | null;
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

const ORDER_TABS = [
  { key: "all", label: "All Orders" },
  { key: "dine_in", label: "Dine-In" },
  { key: "take_out", label: "Takeout" },
  { key: "pickup", label: "Pickup" },
  { key: "delivery", label: "Delivery" },
] as const;

type OrderTabKey = (typeof ORDER_TABS)[number]["key"];

function getOrderTypeIcon(orderType: string) {
  switch (orderType) {
    case "dine_in":
      return <UtensilsCrossed className="w-4 h-4" />;
    case "take_out":
      return <ShoppingBag className="w-4 h-4" />;
    case "pickup":
      return <MapPin className="w-4 h-4" />;
    case "delivery":
      return <Truck className="w-4 h-4" />;
    default:
      return <Receipt className="w-4 h-4" />;
  }
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

function getTimeSinceOpened(openedAt: string): { text: string; colorClass: string } {
  const now = new Date();
  const opened = new Date(openedAt);
  const diffMs = now.getTime() - opened.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  let text: string;
  if (diffMin < 1) text = "<1m";
  else if (diffMin < 60) text = `${diffMin}m`;
  else text = `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;

  let colorClass: string;
  if (diffMin < 10) colorClass = "text-green-400";
  else if (diffMin < 20) colorClass = "text-yellow-400";
  else colorClass = "text-red-400";

  return { text, colorClass };
}

function getPlatformBadge(platformSource: string | null) {
  if (!platformSource) return null;
  switch (platformSource) {
    case "ubereats":
      return { label: "UE", className: "bg-green-600 text-white" };
    case "grubhub":
      return { label: "GH", className: "bg-orange-600 text-white" };
    case "doordash":
      return { label: "DD", className: "bg-red-600 text-white" };
    default:
      return null;
  }
}

function getFulfillmentBadge(status: string | null) {
  if (!status) return null;
  switch (status) {
    case "received":
      return { label: "Received", className: "bg-blue-600 text-white" };
    case "in_progress":
      return { label: "In Progress", className: "bg-yellow-600 text-white" };
    case "ready":
      return { label: "Ready", className: "bg-green-600 text-white" };
    case "picked_up":
      return { label: "Picked Up", className: "bg-gray-600 text-white" };
    case "completed":
      return { label: "Completed", className: "bg-gray-600 text-white" };
    default:
      return null;
  }
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
  const [activeTab, setActiveTab] = useState<OrderTabKey>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "completed">("active");
  const { toast } = useToast();

  const { data: orders = [], isLoading } = useQuery<OrderCheck[]>({
    queryKey: ["/api/checks/orders", { rvcId, orderType: activeTab, statusFilter }],
    queryFn: async () => {
      if (!rvcId) return [];
      const params = new URLSearchParams({ rvcId });
      if (activeTab !== "all") params.append("orderType", activeTab);
      params.append("statusFilter", statusFilter);
      const res = await fetchWithTimeout(`/api/checks/orders?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    enabled: open && !!rvcId,
    refetchOnMount: "always",
    staleTime: 0,
    refetchInterval: open ? 3000 : false,
  });

  const { data: allOrdersForCounts = [] } = useQuery<OrderCheck[]>({
    queryKey: ["/api/checks/orders", { rvcId, orderType: "all", statusFilter }],
    queryFn: async () => {
      if (!rvcId) return [];
      const params = new URLSearchParams({ rvcId, statusFilter });
      const res = await fetchWithTimeout(`/api/checks/orders?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!rvcId && activeTab !== "all",
    refetchOnMount: "always",
    staleTime: 0,
    refetchInterval: open ? 3000 : false,
  });

  const countsSource = activeTab === "all" ? orders : allOrdersForCounts;

  const tabCounts: Record<string, number> = {
    all: countsSource.length,
    dine_in: countsSource.filter((o) => o.orderType === "dine_in").length,
    take_out: countsSource.filter((o) => o.orderType === "take_out").length,
    pickup: countsSource.filter((o) => o.orderType === "pickup").length,
    delivery: countsSource.filter((o) => o.orderType === "delivery").length,
  };

  const { data: lockData } = useQuery<{ lockStatus: Record<string, CheckLockStatus> }>({
    queryKey: ["/api/checks/locks", { rvcId, workstationId }],
    queryFn: async () => {
      if (!rvcId) return { lockStatus: {} };
      const params = new URLSearchParams();
      params.append("rvcId", rvcId);
      if (workstationId) params.append("workstationId", workstationId);
      const res = await fetchWithTimeout(`/api/checks/locks?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return { lockStatus: {} };
      return res.json();
    },
    enabled: open && !!rvcId,
    refetchOnMount: "always",
    staleTime: 0,
    refetchInterval: open ? 3000 : false,
  });

  const lockStatuses = lockData?.lockStatus || {};

  const fulfillmentMutation = useMutation({
    mutationFn: async ({ checkId, fulfillmentStatus }: { checkId: string; fulfillmentStatus: string }) => {
      await apiRequest("PATCH", `/api/checks/${checkId}/fulfillment`, { fulfillmentStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks/orders"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const handleSelect = (checkId: string) => {
    onSelect(checkId);
    onClose();
  };

  const handleFulfillmentAction = (e: React.MouseEvent, checkId: string, fulfillmentStatus: string) => {
    e.stopPropagation();
    fulfillmentMutation.mutate({ checkId, fulfillmentStatus });
  };

  const showFulfillmentActions = (check: OrderCheck) =>
    (check.orderType === "pickup" || check.orderType === "delivery") &&
    check.status === "open";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            data-testid="text-open-checks-title"
          >
            <Receipt className="w-5 h-5" />
            Orders
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 flex-wrap" data-testid="order-type-tabs">
          {ORDER_TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              data-testid={`tab-order-${tab.key}`}
              className="gap-1"
            >
              {tab.label}
              <Badge variant="secondary" className="ml-1 text-xs">
                {tabCounts[tab.key] ?? 0}
              </Badge>
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2" data-testid="status-filter-toggle">
          <Button
            variant={statusFilter === "active" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("active")}
            data-testid="filter-active"
          >
            Active
          </Button>
          <Button
            variant={statusFilter === "completed" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("completed")}
            data-testid="filter-completed"
          >
            Completed
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p data-testid="text-no-orders">No orders found</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-2 pb-2">
              {orders.map((check) => {
                const lockStatus = lockStatuses[check.id];
                const timeSince = getTimeSinceOpened(check.openedAt);
                const platform = getPlatformBadge(check.platformSource);
                const fulfillment = getFulfillmentBadge(check.fulfillmentStatus);

                return (
                  <Card
                    key={check.id}
                    className="p-3 cursor-pointer hover-elevate active-elevate-2"
                    onClick={() => handleSelect(check.id)}
                    data-testid={`card-order-${check.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <LockIndicator lockStatus={lockStatus} />
                        <div className="text-muted-foreground">
                          {getOrderTypeIcon(check.orderType)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold" data-testid={`text-check-number-${check.id}`}>
                              #{check.checkNumber}
                            </span>
                            {check.customerName && (
                              <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                                {check.customerName}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatOrderType(check.orderType)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {platform && (
                          <Badge className={`text-xs ${platform.className} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-platform-${check.id}`}>
                            {platform.label}
                          </Badge>
                        )}
                        <div className={`flex items-center gap-1 text-xs font-medium ${timeSince.colorClass}`} data-testid={`text-time-${check.id}`}>
                          <Clock className="w-3 h-3" />
                          {timeSince.text}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                      <span>{check.itemCount} items</span>
                      {check.total && parseFloat(check.total) > 0 && (
                        <span className="font-medium text-foreground" data-testid={`text-total-${check.id}`}>
                          ${parseFloat(check.total).toFixed(2)}
                        </span>
                      )}
                      {check.employeeName && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {check.employeeName}
                        </span>
                      )}
                    </div>

                    {(fulfillment || showFulfillmentActions(check)) && (
                      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                        <div>
                          {fulfillment && (
                            <Badge className={`text-xs ${fulfillment.className} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-fulfillment-${check.id}`}>
                              {fulfillment.label}
                            </Badge>
                          )}
                        </div>
                        {showFulfillmentActions(check) && (
                          <div className="flex items-center gap-1">
                            {(!check.fulfillmentStatus || check.fulfillmentStatus === "received") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => handleFulfillmentAction(e, check.id, "in_progress")}
                                disabled={fulfillmentMutation.isPending}
                                data-testid={`button-start-${check.id}`}
                              >
                                <Play className="w-3 h-3 mr-1" />
                                Start
                              </Button>
                            )}
                            {check.fulfillmentStatus === "in_progress" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => handleFulfillmentAction(e, check.id, "ready")}
                                disabled={fulfillmentMutation.isPending}
                                data-testid={`button-ready-${check.id}`}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Ready
                              </Button>
                            )}
                            {check.fulfillmentStatus === "ready" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) =>
                                  handleFulfillmentAction(
                                    e,
                                    check.id,
                                    check.orderType === "pickup" ? "picked_up" : "completed"
                                  )
                                }
                                disabled={fulfillmentMutation.isPending}
                                data-testid={`button-complete-${check.id}`}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Complete
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
