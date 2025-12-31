import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check as CheckIcon, Clock, XCircle, RotateCcw, CircleCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface KdsItem {
  id: string;
  checkItemId?: string;
  name: string;
  quantity: number;
  modifiers?: { name: string }[];
  status: "pending" | "bumped" | "voided";
  itemStatus?: "pending" | "active";
  isReady?: boolean;
}

export interface ColorAlertSettings {
  yellowThreshold: number;
  orangeThreshold: number;
  redThreshold: number;
}

interface KdsTicketProps {
  ticketId: string;
  checkNumber: number;
  orderType: string;
  stationType?: string;
  items: KdsItem[];
  isDraft: boolean;
  isPreview?: boolean;
  isPaid?: boolean;
  isRecalled?: boolean;
  createdAt: Date;
  colorAlerts?: ColorAlertSettings;
  itemSelectEnabled?: boolean;
  onBump: (ticketId: string) => void;
  onRecall?: (ticketId: string) => void;
}

const ORDER_TYPE_COLORS: Record<string, string> = {
  dine_in: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  take_out: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  delivery: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  pickup: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine In",
  take_out: "Take Out",
  delivery: "Delivery",
  pickup: "Pickup",
};

const STATION_TYPE_COLORS: Record<string, string> = {
  hot: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  cold: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  prep: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  expo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  bar: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

const STATION_TYPE_LABELS: Record<string, string> = {
  hot: "HOT",
  cold: "COLD",
  prep: "PREP",
  expo: "EXPO",
  bar: "BAR",
};

const DEFAULT_COLOR_ALERTS: ColorAlertSettings = {
  yellowThreshold: 60,
  orangeThreshold: 180,
  redThreshold: 300,
};

export function KdsTicket({
  ticketId,
  checkNumber,
  orderType,
  stationType,
  items,
  isDraft,
  isPreview = false,
  isPaid = false,
  isRecalled = false,
  createdAt,
  colorAlerts = DEFAULT_COLOR_ALERTS,
  itemSelectEnabled = true,
  onBump,
  onRecall,
}: KdsTicketProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const calculateElapsed = () => {
      const now = new Date();
      const created = new Date(createdAt);
      return Math.floor((now.getTime() - created.getTime()) / 1000);
    };
    
    setElapsedSeconds(calculateElapsed());
    
    const interval = setInterval(() => {
      setElapsedSeconds(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTimerColorClass = useCallback(() => {
    if (elapsedSeconds >= colorAlerts.redThreshold) return "text-red-500";
    if (elapsedSeconds >= colorAlerts.orangeThreshold) return "text-orange-500";
    if (elapsedSeconds >= colorAlerts.yellowThreshold) return "text-yellow-500";
    return "text-green-500";
  }, [elapsedSeconds, colorAlerts]);

  const getCardBorderClass = useCallback(() => {
    if (isRecalled) return "border-2 border-purple-500 shadow-purple-500/20 shadow-lg";
    if (elapsedSeconds >= colorAlerts.redThreshold) return "border-2 border-red-500";
    if (elapsedSeconds >= colorAlerts.orangeThreshold) return "border-2 border-orange-500";
    if (elapsedSeconds >= colorAlerts.yellowThreshold) return "border-2 border-yellow-500";
    return "";
  }, [elapsedSeconds, colorAlerts, isRecalled]);

  const markReadyMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("POST", `/api/kds-items/${itemId}/ready`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
  });

  const unmarkReadyMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("POST", `/api/kds-items/${itemId}/unready`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
  });

  const handleItemClick = (item: KdsItem) => {
    if (!itemSelectEnabled || item.status === "voided" || item.itemStatus === "pending") return;
    
    if (item.isReady) {
      unmarkReadyMutation.mutate(item.id);
    } else {
      markReadyMutation.mutate(item.id);
    }
  };

  const activeItems = items.filter((item) => item.status !== "voided");
  const allItemsReady = activeItems.length > 0 && activeItems.every((item) => item.isReady);

  return (
    <Card
      className={`flex flex-col transition-all ${isDraft ? "opacity-60" : ""} ${getCardBorderClass()}`}
      data-testid={`kds-ticket-${ticketId}`}
    >
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2 space-y-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl font-bold" data-testid={`text-ticket-number-${ticketId}`}>
            #{checkNumber}
          </span>
          {isRecalled && (
            <Badge className="text-xs bg-purple-500 text-white animate-pulse">
              <RotateCcw className="w-3 h-3 mr-1" />
              RECALL
            </Badge>
          )}
          {stationType && (
            <Badge
              variant="outline"
              className={`text-xs font-bold ${STATION_TYPE_COLORS[stationType] || ""}`}
            >
              {STATION_TYPE_LABELS[stationType] || stationType.toUpperCase()}
            </Badge>
          )}
          {isDraft && (
            <Badge variant="secondary" className="text-xs">
              DRAFT
            </Badge>
          )}
          {isPreview && !isDraft && (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              PREVIEW
            </Badge>
          )}
          {isPaid && (
            <Badge className="text-xs bg-green-500 text-white">
              PAID
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={ORDER_TYPE_COLORS[orderType] || ""}
          >
            {ORDER_TYPE_LABELS[orderType] || orderType}
          </Badge>
          <div className={`flex items-center gap-1 text-sm font-medium tabular-nums ${getTimerColorClass()}`}>
            <Clock className="w-3.5 h-3.5" />
            {formatTime(elapsedSeconds)}
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex-1 py-3 space-y-1">
        {activeItems.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-2 p-1.5 rounded-md transition-colors ${
              itemSelectEnabled && item.itemStatus !== "pending" && item.status !== "voided"
                ? "cursor-pointer hover-elevate"
                : ""
            } ${item.isReady ? "bg-green-500/10" : ""} ${item.itemStatus === "pending" ? "animate-pulse" : ""}`}
            onClick={() => handleItemClick(item)}
            data-testid={`kds-item-${item.id}`}
          >
            <div
              className={`w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center text-sm font-bold ${
                item.isReady
                  ? "bg-green-500/20 text-green-600"
                  : item.status === "bumped"
                  ? "bg-green-500/20 text-green-600"
                  : item.itemStatus === "pending"
                  ? "bg-amber-500/20 text-amber-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.isReady ? <CircleCheck className="w-4 h-4" /> : item.quantity}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {item.status === "bumped" && (
                  <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                )}
                <span
                  className={`font-medium ${
                    item.isReady
                      ? "text-green-600 dark:text-green-400"
                      : item.status === "bumped"
                      ? "line-through text-muted-foreground"
                      : item.itemStatus === "pending"
                      ? "text-amber-600 dark:text-amber-400"
                      : ""
                  }`}
                >
                  {item.quantity > 1 && !item.isReady ? `${item.quantity}x ` : ""}{item.name}
                </span>
                {item.itemStatus === "pending" && (
                  <Badge variant="outline" className="text-[10px] py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                    MODIFYING
                  </Badge>
                )}
              </div>
              {item.modifiers && item.modifiers.length > 0 && (
                <div className={`mt-0.5 space-y-0.5 ${item.itemStatus === "pending" ? "animate-pulse" : ""}`}>
                  {item.modifiers.map((mod, idx) => (
                    <span
                      key={idx}
                      className={`block text-xs pl-1 ${
                        item.itemStatus === "pending" 
                          ? "text-amber-600 dark:text-amber-400 font-medium" 
                          : "text-muted-foreground"
                      }`}
                    >
                      - {mod.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {items.filter((i) => i.status === "voided").length > 0 && (
          <div className="pt-2 space-y-1">
            <Separator />
            {items
              .filter((i) => i.status === "voided")
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 text-destructive/70"
                >
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm line-through">
                    {item.quantity}x {item.name}
                  </span>
                  <Badge variant="destructive" className="text-xs">
                    VOID
                  </Badge>
                </div>
              ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2">
        {!isDraft && !isPreview && !activeItems.some((i) => i.itemStatus === "pending") && (
          <Button
            className={`w-full h-12 text-base font-semibold ${allItemsReady ? "bg-green-600 hover:bg-green-700" : ""}`}
            onClick={() => onBump(ticketId)}
            disabled={activeItems.length > 0 && activeItems.every((i) => i.status === "bumped")}
            data-testid={`button-bump-${ticketId}`}
          >
            <CheckIcon className="w-5 h-5 mr-2" />
            {activeItems.length === 0 ? "DISMISS" : allItemsReady ? "ALL READY - BUMP" : "BUMP"}
          </Button>
        )}
        {!isDraft && activeItems.some((i) => i.itemStatus === "pending") && (
          <div className="w-full h-12 flex items-center justify-center text-amber-600 dark:text-amber-400 text-sm font-medium animate-pulse">
            Item being configured...
          </div>
        )}
        {isPreview && !activeItems.some((i) => i.itemStatus === "pending") && (
          <div className="w-full h-12 flex items-center justify-center text-amber-600 dark:text-amber-400 text-sm font-medium">
            Preview - awaiting send/payment
          </div>
        )}
        {isDraft && (
          <div className="w-full h-12 flex items-center justify-center text-muted-foreground text-sm">
            Waiting for send...
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
