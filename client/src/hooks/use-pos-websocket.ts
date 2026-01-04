import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

interface PosEvent {
  type: string;
  payload?: {
    customerId?: string;
    currentPoints?: number;
    lifetimePoints?: number;
    checkId?: string;
    status?: string;
  };
}

export function usePosWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    isUnmountedRef.current = false;
    
    const connect = () => {
      if (isUnmountedRef.current) return;
      
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmountedRef.current) {
            ws.close();
            return;
          }
          ws.send(JSON.stringify({ action: "subscribe", channel: "all" }));
        };

        ws.onmessage = (event) => {
          if (isUnmountedRef.current) return;
          try {
            const data: PosEvent = JSON.parse(event.data);
            handlePosEvent(data);
          } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!isUnmountedRef.current) {
            reconnectTimeoutRef.current = setTimeout(connect, 2000);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          ws.close();
        };
      } catch (error) {
        console.error("Failed to connect WebSocket:", error);
        if (!isUnmountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
      }
    };

    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return wsRef;
}

function handlePosEvent(event: PosEvent) {
  switch (event.type) {
    case "loyalty_update":
      if (event.payload?.customerId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/pos/customers", event.payload.customerId] 
        });
        queryClient.invalidateQueries({ 
          queryKey: ["/api/loyalty-members", event.payload.customerId] 
        });
        queryClient.invalidateQueries({ 
          queryKey: ["/api/loyalty-members"] 
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/pos/customers/search"]
        });
      }
      break;

    case "check_update":
      if (event.payload?.checkId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/checks", event.payload.checkId] 
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      break;

    case "kds_update":
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      break;

    default:
      break;
  }
}
