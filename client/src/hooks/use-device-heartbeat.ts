import { useEffect, useRef, useCallback } from "react";
import { getAuthHeaders } from "@/lib/queryClient";

const HEARTBEAT_INTERVAL_MS = 30000; // Send heartbeat every 30 seconds

export function useDeviceHeartbeat(enabled: boolean = true) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      if (!headers["X-Device-Token"]) {
        return;
      }

      await fetch("/api/registered-devices/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      });
    } catch (error) {
      console.debug("Heartbeat failed:", error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    sendHeartbeat();

    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, sendHeartbeat]);

  return { sendHeartbeat };
}
