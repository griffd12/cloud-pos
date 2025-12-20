import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { KdsDisplay } from "@/components/kds/kds-display";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePosContext } from "@/lib/pos-context";
import { ArrowLeft } from "lucide-react";
import { Link, Redirect } from "wouter";

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
  stationType?: string;
  kdsDeviceId?: string;
  items: KdsItem[];
  isDraft: boolean;
  status: string;
  createdAt: Date;
}

interface KdsDevice {
  id: string;
  name: string;
  stationType: string;
  propertyId: string;
}

export default function KdsPage() {
  const { toast } = useToast();
  const { currentEmployee, currentRvc } = usePosContext();
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedStation, setSelectedStation] = useState("all");

  const propertyId = currentRvc?.propertyId;

  const { data: kdsDevices = [] } = useQuery<KdsDevice[]>({
    queryKey: ["/api/kds-devices/active", propertyId],
    enabled: !!propertyId,
  });

  const stationTypes = kdsDevices.reduce((acc, device) => {
    if (!acc.includes(device.stationType)) {
      acc.push(device.stationType);
    }
    return acc;
  }, [] as string[]);

  const queryParams = new URLSearchParams();
  if (currentRvc?.id) queryParams.set("rvcId", currentRvc.id);
  if (selectedStation !== "all") queryParams.set("stationType", selectedStation);

  const { data: tickets = [], isLoading, refetch } = useQuery<Ticket[]>({
    queryKey: ["/api/kds-tickets", currentRvc?.id, selectedStation],
    queryFn: async () => {
      const res = await fetch(`/api/kds-tickets?${queryParams.toString()}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!currentRvc,
    select: (data: any[]) =>
      data.map((t) => ({
        ...t,
        createdAt: new Date(t.createdAt),
      })),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!currentRvc) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setWsConnected(true);
      socket.send(JSON.stringify({ type: "subscribe", channel: "kds", rvcId: currentRvc.id }));
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "kds_update") {
          refetch();
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
    };

    socket.onerror = () => {
      setWsConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [currentRvc, refetch]);

  const bumpMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const response = await apiRequest("POST", "/api/kds-tickets/" + ticketId + "/bump", {
        employeeId: currentEmployee?.id,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to bump ticket", variant: "destructive" });
    },
  });

  const recallMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const response = await apiRequest("POST", "/api/kds-tickets/" + ticketId + "/recall", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to recall ticket", variant: "destructive" });
    },
  });

  const bumpAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/kds-tickets/bump-all", {
        employeeId: currentEmployee?.id,
        rvcId: currentRvc?.id,
        stationType: selectedStation !== "all" ? selectedStation : undefined,
      });
      return response.json();
    },
    onSuccess: (data: { bumped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to clear tickets", variant: "destructive" });
    },
  });

  const handleBump = useCallback(
    (ticketId: string) => {
      bumpMutation.mutate(ticketId);
    },
    [bumpMutation]
  );

  const handleRecall = useCallback(
    (ticketId: string) => {
      recallMutation.mutate(ticketId);
    },
    [recallMutation]
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleBumpAll = useCallback(() => {
    bumpAllMutation.mutate();
  }, [bumpAllMutation]);

  if (!currentEmployee || !currentRvc) {
    return <Redirect to="/" />;
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="flex-shrink-0 border-b px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/pos">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Kitchen Display</h1>
          <div
            className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`}
            title={wsConnected ? "Connected" : "Disconnected"}
          />
        </div>
        <ThemeToggle />
      </header>

      <KdsDisplay
        tickets={tickets}
        stationTypes={stationTypes}
        selectedStation={selectedStation}
        onStationChange={setSelectedStation}
        onBump={handleBump}
        onRecall={handleRecall}
        onRefresh={handleRefresh}
        onBumpAll={handleBumpAll}
        isLoading={isLoading}
        isBumpingAll={bumpAllMutation.isPending}
      />
    </div>
  );
}
