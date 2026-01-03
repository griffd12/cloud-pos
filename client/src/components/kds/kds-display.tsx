import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { KdsTicket, ColorAlertSettings } from "./kds-ticket";
import { RefreshCw, Monitor, Flame, Snowflake, PackageCheck, UtensilsCrossed, GlassWater, Trash2, RotateCcw, List, Volume2, VolumeX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface KdsItem {
  id: string;
  checkItemId?: string;
  name: string;
  quantity: number;
  modifiers?: { name: string }[];
  status: "pending" | "bumped" | "voided";
  isReady?: boolean;
}

interface Ticket {
  id: string;
  checkNumber: number;
  orderType: string;
  stationType?: string;
  items: KdsItem[];
  isDraft: boolean;
  isPreview?: boolean;
  isPaid?: boolean;
  isRecalled?: boolean;
  status: string;
  createdAt: Date;
}

interface BumpedTicket {
  id: string;
  checkNumber?: number;
  orderType?: string;
  stationType?: string;
  bumpedAt: Date;
  items: { id: string; name: string; quantity: number; status: string }[];
}

interface KdsDeviceSettings {
  newOrderSound?: boolean;
  newOrderBlinkSeconds?: number;
  colorAlert1Enabled?: boolean;
  colorAlert1Seconds?: number;
  colorAlert1Color?: string;
  colorAlert2Enabled?: boolean;
  colorAlert2Seconds?: number;
  colorAlert2Color?: string;
  colorAlert3Enabled?: boolean;
  colorAlert3Seconds?: number;
  colorAlert3Color?: string;
}

interface KdsDisplayProps {
  tickets: Ticket[];
  stationTypes: string[];
  selectedStation: string;
  onStationChange: (station: string) => void;
  onBump: (ticketId: string) => void;
  onRecall?: (ticketId: string) => void;
  onRefresh?: () => void;
  onBumpAll?: () => void;
  isLoading?: boolean;
  isBumpingAll?: boolean;
  deviceSettings?: KdsDeviceSettings;
  rvcId?: string;
}

const STATION_ICONS: Record<string, LucideIcon> = {
  hot: Flame,
  cold: Snowflake,
  expo: PackageCheck,
  prep: UtensilsCrossed,
  bar: GlassWater,
};

const STATION_LABELS: Record<string, string> = {
  hot: "Hot",
  cold: "Cold",
  expo: "Expo",
  prep: "Prep",
  bar: "Bar",
};

const BEEP_SOUND = "data:audio/wav;base64,UklGRl9vT19teleXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU" +
  "tvT19t" + "g".repeat(100) + "AAAA".repeat(500);

export function KdsDisplay({
  tickets,
  stationTypes,
  selectedStation,
  onStationChange,
  onBump,
  onRecall,
  onRefresh,
  onBumpAll,
  isLoading = false,
  isBumpingAll = false,
  deviceSettings,
  rvcId,
}: KdsDisplayProps) {
  const [showAllDay, setShowAllDay] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(deviceSettings?.newOrderSound ?? true);
  const [blinkingTickets, setBlinkingTickets] = useState<Set<string>>(new Set());
  const previousTicketIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);

  const blinkDuration = deviceSettings?.newOrderBlinkSeconds ?? 5;

  const colorAlerts: ColorAlertSettings = {
    alert1Enabled: deviceSettings?.colorAlert1Enabled ?? true,
    alert1Seconds: deviceSettings?.colorAlert1Seconds ?? 60,
    alert1Color: deviceSettings?.colorAlert1Color ?? "yellow",
    alert2Enabled: deviceSettings?.colorAlert2Enabled ?? true,
    alert2Seconds: deviceSettings?.colorAlert2Seconds ?? 180,
    alert2Color: deviceSettings?.colorAlert2Color ?? "orange",
    alert3Enabled: deviceSettings?.colorAlert3Enabled ?? true,
    alert3Seconds: deviceSettings?.colorAlert3Seconds ?? 300,
    alert3Color: deviceSettings?.colorAlert3Color ?? "red",
  };

  const activeTickets = tickets.filter((t) => t.status === "active");
  const draftTickets = tickets.filter((t) => t.status === "draft");

  const { data: bumpedTickets = [] } = useQuery<BumpedTicket[]>({
    queryKey: ["/api/kds-tickets/bumped", rvcId, selectedStation],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (rvcId) params.append("rvcId", rvcId);
      if (selectedStation !== "all") params.append("stationType", selectedStation);
      params.append("limit", "50");
      const response = await fetch(`/api/kds-tickets/bumped?${params}`);
      if (!response.ok) throw new Error("Failed to fetch bumped tickets");
      return response.json();
    },
    enabled: showRecallModal,
    refetchInterval: showRecallModal ? 5000 : false,
  });

  const recallMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      await apiRequest("POST", `/api/kds-tickets/${ticketId}/recall`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets/bumped"] });
      setShowRecallModal(false);
    },
  });

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);

      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1100;
        osc2.type = "sine";
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.3);
      }, 150);
    } catch (e) {
      console.log("Audio playback failed:", e);
    }
  }, []);

  useEffect(() => {
    const currentTicketIds = new Set(activeTickets.map((t) => t.id));
    const previousIds = previousTicketIdsRef.current;

    const newTicketIds: string[] = [];
    currentTicketIds.forEach((id) => {
      if (!previousIds.has(id)) {
        newTicketIds.push(id);
      }
    });

    if (newTicketIds.length > 0 && previousIds.size > 0) {
      if (soundEnabled) {
        playNotificationSound();
      }

      if (blinkDuration > 0) {
        setBlinkingTickets((prev) => {
          const next = new Set(prev);
          newTicketIds.forEach((id) => next.add(id));
          return next;
        });

        setTimeout(() => {
          setBlinkingTickets((prev) => {
            const next = new Set(prev);
            newTicketIds.forEach((id) => next.delete(id));
            return next;
          });
        }, blinkDuration * 1000);
      }
    }

    previousTicketIdsRef.current = currentTicketIds;
  }, [activeTickets, soundEnabled, blinkDuration, playNotificationSound]);

  const getAllDaySummary = useCallback(() => {
    const summary: Record<string, { name: string; totalQty: number; readyQty: number }> = {};
    
    activeTickets.forEach((ticket) => {
      ticket.items.forEach((item) => {
        if (item.status === "voided") return;
        
        if (!summary[item.name]) {
          summary[item.name] = { name: item.name, totalQty: 0, readyQty: 0 };
        }
        summary[item.name].totalQty += item.quantity || 1;
        if (item.isReady) {
          summary[item.name].readyQty += item.quantity || 1;
        }
      });
    });
    
    return Object.values(summary).sort((a, b) => b.totalQty - a.totalQty);
  }, [activeTickets]);

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="flex-shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-xl font-bold" data-testid="text-kds-title">
              Kitchen Display
            </h1>
            <Badge variant="secondary" className="tabular-nums">
              {activeTickets.length} Active
            </Badge>
            {draftTickets.length > 0 && (
              <Badge variant="outline" className="tabular-nums">
                {draftTickets.length} Draft
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={soundEnabled ? "secondary" : "ghost"}
              size="icon"
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) {
                  playNotificationSound();
                }
              }}
              data-testid="button-kds-sound-toggle"
              title={soundEnabled ? "Sound enabled (click to test)" : "Sound muted"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>

            <Button
              variant={showAllDay ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAllDay(!showAllDay)}
              data-testid="button-kds-all-day"
            >
              <List className="w-4 h-4 mr-1" />
              All Day
            </Button>

            <Dialog open={showRecallModal} onOpenChange={setShowRecallModal}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-kds-recall-open">
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Recall
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Recall Bumped Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  {bumpedTickets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No bumped orders to recall
                    </div>
                  ) : (
                    bumpedTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                      >
                        <div>
                          <div className="font-bold">
                            #{ticket.checkNumber} - {ticket.orderType?.replace("_", " ")}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {ticket.items?.slice(0, 3).map((item) => `${item.quantity}x ${item.name}`).join(", ")}
                            {ticket.items && ticket.items.length > 3 && ` +${ticket.items.length - 3} more`}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Bumped: {new Date(ticket.bumpedAt).toLocaleTimeString()}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => recallMutation.mutate(ticket.id)}
                          disabled={recallMutation.isPending}
                          data-testid={`button-recall-${ticket.id}`}
                        >
                          <RotateCcw className="w-4 h-4 mr-1" />
                          Recall
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Tabs value={selectedStation} onValueChange={onStationChange}>
              <TabsList>
                <TabsTrigger
                  value="all"
                  className="gap-1.5"
                  data-testid="tab-station-all"
                >
                  <Monitor className="w-4 h-4" />
                  <span className="hidden sm:inline">All</span>
                </TabsTrigger>
                {stationTypes.map((stationType) => {
                  const Icon = STATION_ICONS[stationType] || Monitor;
                  const label = STATION_LABELS[stationType] || stationType;
                  return (
                    <TabsTrigger
                      key={stationType}
                      value={stationType}
                      className="gap-1.5"
                      data-testid={`tab-station-${stationType}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            {onBumpAll && tickets.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onBumpAll}
                disabled={isBumpingAll}
                data-testid="button-kds-bump-all"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear All
              </Button>
            )}

            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                disabled={isLoading}
                data-testid="button-kds-refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </div>
      </header>

      {showAllDay && (
        <div className="flex-shrink-0 border-b bg-muted/30 p-4">
          <h2 className="text-lg font-semibold mb-3">All Day Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {getAllDaySummary().map((item) => (
              <div
                key={item.name}
                className={`p-2 rounded-md border text-center ${
                  item.readyQty === item.totalQty ? "bg-green-500/10 border-green-500/30" : "bg-card"
                }`}
                data-testid={`all-day-item-${item.name}`}
              >
                <div className="text-2xl font-bold tabular-nums">
                  {item.readyQty > 0 && (
                    <span className="text-green-600">{item.readyQty}/</span>
                  )}
                  {item.totalQty}
                </div>
                <div className="text-xs text-muted-foreground truncate" title={item.name}>
                  {item.name}
                </div>
              </div>
            ))}
            {getAllDaySummary().length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-4">
                No items to display
              </div>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4">
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Monitor className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No tickets to display</p>
              <p className="text-sm">Orders will appear here when sent</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeTickets.map((ticket) => (
                <KdsTicket
                  key={ticket.id}
                  ticketId={ticket.id}
                  checkNumber={ticket.checkNumber}
                  orderType={ticket.orderType}
                  stationType={ticket.stationType}
                  items={ticket.items}
                  isDraft={false}
                  isPreview={ticket.isPreview}
                  isPaid={ticket.isPaid}
                  isRecalled={ticket.isRecalled}
                  createdAt={ticket.createdAt}
                  colorAlerts={colorAlerts}
                  isBlinking={blinkingTickets.has(ticket.id)}
                  subtotal={ticket.subtotal}
                  onBump={onBump}
                  onRecall={onRecall}
                />
              ))}
              {draftTickets.map((ticket) => (
                <KdsTicket
                  key={ticket.id}
                  ticketId={ticket.id}
                  checkNumber={ticket.checkNumber}
                  orderType={ticket.orderType}
                  stationType={ticket.stationType}
                  items={ticket.items}
                  isDraft={true}
                  isPreview={ticket.isPreview}
                  isPaid={ticket.isPaid}
                  createdAt={ticket.createdAt}
                  colorAlerts={colorAlerts}
                  subtotal={ticket.subtotal}
                  onBump={onBump}
                  onRecall={onRecall}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
