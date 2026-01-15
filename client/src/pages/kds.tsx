import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { KdsDisplay } from "@/components/kds/kds-display";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { usePosContext } from "@/lib/pos-context";
import { useDeviceContext } from "@/lib/device-context";
import { usePosWebSocket, subscribeToKdsTestTicket } from "@/hooks/use-pos-websocket";
import { useDeviceHeartbeat } from "@/hooks/use-device-heartbeat";
import { useDeviceReload } from "@/hooks/use-device-reload";
import { DeviceEnrollmentGuard } from "@/components/device-enrollment-guard";
import { ArrowLeft, Settings, Wifi, WifiOff, Maximize, Minimize } from "lucide-react";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { Link, Redirect, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { ConnectionModeBanner } from "@/components/connection-mode-banner";

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

export default function KdsPage() {
  const { toast } = useToast();
  const { currentEmployee, currentRvc } = usePosContext();
  const { deviceType, linkedDeviceId, deviceName, clearDeviceConfig, isConfigured } = useDeviceContext();
  const [, navigate] = useLocation();
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedStation, setSelectedStation] = useState("all");
  const [initialized, setInitialized] = useState(false);
  const [testTicketMessage, setTestTicketMessage] = useState<string | null>(null);
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();

  // Real-time sync for menu updates, employee changes, etc.
  usePosWebSocket();
  
  // Listen for remote reload commands from EMC (use device context for targeting)
  const { registeredDeviceId, propertyId: devicePropertyId } = useDeviceContext();
  useDeviceReload({ registeredDeviceId: registeredDeviceId || undefined, propertyId: devicePropertyId || undefined });
  
  // Send periodic device heartbeats to maintain online status
  useDeviceHeartbeat(true);

  // Check if this is a dedicated KDS device
  const isDedicatedKds = deviceType === "kds" && isConfigured;

  // For dedicated KDS, fetch the configured device info to get propertyId
  const { data: configuredKdsDevice, isLoading: isLoadingDevice, isError: deviceError } = useQuery<KdsDevice>({
    queryKey: ["/api/kds-devices", linkedDeviceId],
    enabled: isDedicatedKds && !!linkedDeviceId,
    retry: 2,
  });

  // Handle case where configured device was deleted or not found
  useEffect(() => {
    if (isDedicatedKds && linkedDeviceId && deviceError) {
      toast({ 
        title: "Device not found", 
        description: "The configured KDS device no longer exists. Please reconfigure.",
        variant: "destructive" 
      });
      clearDeviceConfig();
      navigate("/setup");
    }
  }, [isDedicatedKds, linkedDeviceId, deviceError, clearDeviceConfig, navigate, toast]);

  // Use property from configured device for dedicated KDS, otherwise from current RVC
  const propertyId = isDedicatedKds 
    ? configuredKdsDevice?.propertyId 
    : currentRvc?.propertyId;

  // Subscribe to KDS test ticket events (filtered by property)
  useEffect(() => {
    const unsubscribe = subscribeToKdsTestTicket((payload) => {
      // Only show test ticket if it's for all properties (null) or matches this device's property
      const testPropertyId = payload?.propertyId;
      if (testPropertyId && testPropertyId !== propertyId) {
        return; // Skip - this test ticket is for a different property
      }
      
      const message = payload?.message || "Test ticket received";
      setTestTicketMessage(message);
      toast({
        title: "Test Ticket Received",
        description: message,
        duration: 5000,
      });
      // Auto-clear after 5 seconds
      setTimeout(() => setTestTicketMessage(null), 5000);
    });
    return unsubscribe;
  }, [toast, propertyId]);

  // Device heartbeat for KDS - updates lastAccessAt for connectivity tracking
  useEffect(() => {
    const deviceToken = localStorage.getItem("pos_device_token");
    if (!deviceToken || !isDedicatedKds) return;

    const sendHeartbeat = async () => {
      try {
        await fetch("/api/registered-devices/heartbeat", {
          method: "POST",
          headers: {
            ...getAuthHeaders(),
            "X-Device-Token": deviceToken,
          },
        });
      } catch (error) {
        // Silently ignore heartbeat errors
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Send heartbeat every 30 seconds
    const interval = setInterval(sendHeartbeat, 30000);

    return () => clearInterval(interval);
  }, [isDedicatedKds]);

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

  // Auto-select the configured KDS device if in dedicated mode
  useEffect(() => {
    if (isDedicatedKds && linkedDeviceId && kdsDevices.length > 0 && !initialized) {
      const configuredDevice = kdsDevices.find(d => d.id === linkedDeviceId);
      if (configuredDevice) {
        setSelectedStation(configuredDevice.stationType);
        setInitialized(true);
      }
    }
  }, [isDedicatedKds, linkedDeviceId, kdsDevices, initialized]);

  const selectedDevice = selectedStation !== "all" 
    ? kdsDevices.find((d) => d.stationType === selectedStation)
    : kdsDevices[0];

  const handleChangeDevice = () => {
    clearDeviceConfig();
    navigate("/setup");
  };

  const deviceSettings = selectedDevice ? {
    newOrderSound: selectedDevice.newOrderSound,
    newOrderBlinkSeconds: selectedDevice.newOrderBlinkSeconds,
    colorAlert1Enabled: selectedDevice.colorAlert1Enabled,
    colorAlert1Seconds: selectedDevice.colorAlert1Seconds,
    colorAlert1Color: selectedDevice.colorAlert1Color,
    colorAlert2Enabled: selectedDevice.colorAlert2Enabled,
    colorAlert2Seconds: selectedDevice.colorAlert2Seconds,
    colorAlert2Color: selectedDevice.colorAlert2Color,
    colorAlert3Enabled: selectedDevice.colorAlert3Enabled,
    colorAlert3Seconds: selectedDevice.colorAlert3Seconds,
    colorAlert3Color: selectedDevice.colorAlert3Color,
  } : undefined;

  // Build query params - for dedicated KDS, use propertyId; for POS mode, use rvcId
  const queryParams = new URLSearchParams();
  if (isDedicatedKds && propertyId) {
    queryParams.set("propertyId", propertyId);
  } else if (currentRvc?.id) {
    queryParams.set("rvcId", currentRvc.id);
  }
  if (selectedStation !== "all") queryParams.set("stationType", selectedStation);

  const [apiConnected, setApiConnected] = useState<boolean | null>(null);

  const { data: tickets = [], isLoading, refetch, isError: ticketsError } = useQuery<Ticket[]>({
    queryKey: ["/api/kds-tickets", isDedicatedKds ? propertyId : currentRvc?.id, selectedStation],
    queryFn: async () => {
      const res = await fetch(`/api/kds-tickets?${queryParams.toString()}`, { 
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        setApiConnected(false);
        throw new Error("Failed to fetch tickets");
      }
      setApiConnected(true);
      return res.json();
    },
    enabled: isDedicatedKds ? !!propertyId : !!currentRvc,
    select: (data: any[]) =>
      data.map((t) => ({
        ...t,
        createdAt: new Date(t.createdAt),
      })),
    refetchInterval: 2000,
  });

  // WebSocket for real-time KDS updates
  // For dedicated KDS, subscribe to property-wide updates; for POS mode, subscribe to RVC
  useEffect(() => {
    // Need either propertyId (dedicated KDS) or currentRvc (POS mode)
    if (!isDedicatedKds && !currentRvc) return;
    if (isDedicatedKds && !propertyId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/kds`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setWsConnected(true);
      // Subscribe to KDS channel
      // For POS mode: subscribe to specific RVC channel
      // For dedicated KDS: subscribe to global KDS channel (no rvcId filter)
      // The client-side filtering by propertyId handles ticket relevance
      const subscribeMsg: Record<string, any> = { type: "subscribe", channel: "kds" };
      if (!isDedicatedKds && currentRvc?.id) {
        subscribeMsg.rvcId = currentRvc.id;
      }
      // Dedicated KDS subscribes to all KDS updates and filters client-side by propertyId
      socket.send(JSON.stringify(subscribeMsg));
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
  }, [currentRvc?.id, propertyId, isDedicatedKds, refetch]);

  const bumpMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      // For dedicated KDS, use device identity; for POS mode, use employee
      const payload: Record<string, any> = {};
      if (isDedicatedKds) {
        payload.deviceId = linkedDeviceId;
      } else {
        payload.employeeId = currentEmployee?.id;
      }
      const response = await apiRequest("POST", "/api/kds-tickets/" + ticketId + "/bump", payload);
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
      // For dedicated KDS, include device identity
      const payload: Record<string, any> = {};
      if (isDedicatedKds) {
        payload.deviceId = linkedDeviceId;
      }
      const response = await apiRequest("POST", "/api/kds-tickets/" + ticketId + "/recall", payload);
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
      // Use propertyId/deviceId for dedicated KDS devices, rvcId/employeeId for POS mode
      const payload: Record<string, any> = {
        stationType: selectedStation !== "all" ? selectedStation : undefined,
      };
      if (isDedicatedKds) {
        payload.propertyId = propertyId;
        payload.deviceId = linkedDeviceId;
      } else {
        payload.employeeId = currentEmployee?.id;
        payload.rvcId = currentRvc?.id;
      }
      const response = await apiRequest("POST", "/api/kds-tickets/bump-all", payload);
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

  // For dedicated KDS devices, skip the employee/RVC check if we have a property from the device
  if (!isDedicatedKds && (!currentEmployee || !currentRvc)) {
    return <Redirect to="/" />;
  }

  // Show loading state while fetching device info for dedicated KDS
  if (isDedicatedKds && isLoadingDevice) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading device configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <DeviceEnrollmentGuard requiredDeviceType="kds_display">
    <div className="h-screen flex flex-col">
      <ConnectionModeBanner />
      <header className="flex-shrink-0 border-b px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {!isDedicatedKds && (
            <Link href="/pos">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
          )}
          <h1 className="text-lg font-semibold">
            {isDedicatedKds && deviceName ? deviceName : "Kitchen Display"}
          </h1>
          <div className="flex items-center gap-2">
            <Badge 
              variant={apiConnected === true ? "default" : apiConnected === false ? "destructive" : "secondary"}
              className="text-xs"
              data-testid="status-api-connection"
            >
              {apiConnected === true ? (
                <><Wifi className="w-3 h-3 mr-1" /> API</>
              ) : apiConnected === false ? (
                <><WifiOff className="w-3 h-3 mr-1" /> API</>
              ) : (
                "Connecting..."
              )}
            </Badge>
            <div
              className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`}
              title={wsConnected ? "WebSocket Connected" : "WebSocket Disconnected"}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fullscreenSupported && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              data-testid="button-fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleChangeDevice}
            title="Change Device Configuration"
            data-testid="button-change-device"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <ThemeToggle />
        </div>
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
        deviceSettings={deviceSettings}
        rvcId={currentRvc?.id}
        propertyId={propertyId}
      />
    </div>
    </DeviceEnrollmentGuard>
  );
}
