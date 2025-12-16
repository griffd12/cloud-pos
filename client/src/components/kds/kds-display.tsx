import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KdsTicket } from "./kds-ticket";
import { RefreshCw, Monitor, Flame, Snowflake, PackageCheck } from "lucide-react";

interface KdsItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: { name: string }[];
  status: "pending" | "bumped" | "voided";
}

interface Ticket {
  id: string;
  checkNumber: number;
  orderType: string;
  items: KdsItem[];
  isDraft: boolean;
  createdAt: Date;
  station?: string;
}

interface KdsDisplayProps {
  tickets: Ticket[];
  onBump: (ticketId: string) => void;
  onRecall?: (ticketId: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const STATIONS = [
  { id: "all", label: "All", icon: Monitor },
  { id: "hot", label: "Hot", icon: Flame },
  { id: "cold", label: "Cold", icon: Snowflake },
  { id: "expo", label: "Expo", icon: PackageCheck },
];

export function KdsDisplay({
  tickets,
  onBump,
  onRecall,
  onRefresh,
  isLoading = false,
}: KdsDisplayProps) {
  const [selectedStation, setSelectedStation] = useState("all");

  const filteredTickets =
    selectedStation === "all"
      ? tickets
      : tickets.filter((t) => t.station === selectedStation);

  const activeTickets = filteredTickets.filter((t) => !t.isDraft);
  const draftTickets = filteredTickets.filter((t) => t.isDraft);

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="flex-shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
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

          <div className="flex items-center gap-2">
            <Tabs value={selectedStation} onValueChange={setSelectedStation}>
              <TabsList>
                {STATIONS.map((station) => {
                  const Icon = station.icon;
                  return (
                    <TabsTrigger
                      key={station.id}
                      value={station.id}
                      className="gap-1.5"
                      data-testid={`tab-station-${station.id}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{station.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

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

      <ScrollArea className="flex-1">
        <div className="p-4">
          {filteredTickets.length === 0 ? (
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
                  items={ticket.items}
                  isDraft={false}
                  createdAt={ticket.createdAt}
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
                  items={ticket.items}
                  isDraft={true}
                  createdAt={ticket.createdAt}
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
