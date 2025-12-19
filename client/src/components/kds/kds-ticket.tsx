import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check as CheckIcon, Clock, Star, XCircle } from "lucide-react";

interface KdsItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: { name: string }[];
  status: "pending" | "bumped" | "voided";
  itemStatus?: "pending" | "active"; // 'pending' = awaiting modifiers
}

interface KdsTicketProps {
  ticketId: string;
  checkNumber: number;
  orderType: string;
  stationType?: string;
  items: KdsItem[];
  isDraft: boolean;
  createdAt: Date;
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

export function KdsTicket({
  ticketId,
  checkNumber,
  orderType,
  stationType,
  items,
  isDraft,
  createdAt,
  onBump,
  onRecall,
}: KdsTicketProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
      setElapsedSeconds(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTimerColor = () => {
    if (elapsedSeconds > 600) return "text-red-500"; // > 10 mins
    if (elapsedSeconds > 300) return "text-amber-500"; // > 5 mins
    return "text-green-500";
  };

  const activeItems = items.filter((item) => item.status !== "voided");

  return (
    <Card
      className={`flex flex-col transition-opacity ${isDraft ? "opacity-60" : ""}`}
      data-testid={`kds-ticket-${ticketId}`}
    >
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2 space-y-0">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold" data-testid={`text-ticket-number-${ticketId}`}>
            #{checkNumber}
          </span>
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
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={ORDER_TYPE_COLORS[orderType] || ""}
          >
            {ORDER_TYPE_LABELS[orderType] || orderType}
          </Badge>
          <div className={`flex items-center gap-1 text-sm font-medium tabular-nums ${getTimerColor()}`}>
            <Clock className="w-3.5 h-3.5" />
            {formatTime(elapsedSeconds)}
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex-1 py-3 space-y-2">
        {activeItems.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-2 ${item.itemStatus === "pending" ? "animate-pulse" : ""}`}
            data-testid={`kds-item-${item.id}`}
          >
            <div
              className={`w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center text-sm font-bold ${
                item.status === "bumped"
                  ? "bg-green-500/20 text-green-600"
                  : item.itemStatus === "pending"
                  ? "bg-amber-500/20 text-amber-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.quantity}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {item.status === "bumped" && (
                  <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                )}
                <span
                  className={`font-medium ${
                    item.status === "bumped"
                      ? "line-through text-muted-foreground"
                      : item.itemStatus === "pending"
                      ? "text-amber-600 dark:text-amber-400"
                      : ""
                  }`}
                >
                  {item.name}
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
        {!isDraft && !activeItems.some((i) => i.itemStatus === "pending") && (
          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={() => onBump(ticketId)}
            disabled={activeItems.every((i) => i.status === "bumped")}
            data-testid={`button-bump-${ticketId}`}
          >
            <CheckIcon className="w-5 h-5 mr-2" />
            BUMP
          </Button>
        )}
        {!isDraft && activeItems.some((i) => i.itemStatus === "pending") && (
          <div className="w-full h-12 flex items-center justify-center text-amber-600 dark:text-amber-400 text-sm font-medium animate-pulse">
            Item being configured...
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
