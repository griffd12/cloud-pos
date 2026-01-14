import { useState, useEffect, useCallback, useRef } from "react";

interface CalUpdateStatus {
  type: "CAL_UPDATE_STATUS";
  status: "starting" | "downloading" | "installing" | "running_script" | "completed" | "failed";
  packageName: string;
  packageVersion: string;
  message: string;
  progress?: number;
  logOutput?: string;
}

interface UseCalUpdatesOptions {
  serviceHostUrl?: string;
  enabled?: boolean;
}

export function useCalUpdates(options: UseCalUpdatesOptions = {}) {
  const { serviceHostUrl, enabled = true } = options;
  const [updateStatus, setUpdateStatus] = useState<CalUpdateStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const connect = useCallback(() => {
    if (!enabled || !serviceHostUrl) return;
    
    const wsUrl = serviceHostUrl.replace(/^http/, "ws") + "/ws";
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log("[CAL Updates] Connected to Service Host");
        setIsConnected(true);
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "CAL_UPDATE_STATUS") {
            setUpdateStatus(message as CalUpdateStatus);
          }
        } catch (err) {
          console.error("[CAL Updates] Failed to parse message:", err);
        }
      };
      
      ws.onclose = () => {
        console.log("[CAL Updates] Disconnected from Service Host");
        setIsConnected(false);
        wsRef.current = null;
        
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };
      
      ws.onerror = (err) => {
        console.error("[CAL Updates] WebSocket error:", err);
      };
    } catch (err) {
      console.error("[CAL Updates] Failed to connect:", err);
    }
  }, [serviceHostUrl, enabled]);
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);
  
  const dismissUpdate = useCallback(() => {
    setUpdateStatus(null);
  }, []);
  
  useEffect(() => {
    if (enabled && serviceHostUrl) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [enabled, serviceHostUrl, connect, disconnect]);
  
  const isUpdating = updateStatus !== null && 
    updateStatus.status !== "completed" && 
    updateStatus.status !== "failed";
  
  return {
    updateStatus,
    isConnected,
    isUpdating,
    dismissUpdate,
  };
}
