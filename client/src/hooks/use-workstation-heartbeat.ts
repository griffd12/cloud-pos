import { useEffect, useRef, useCallback } from "react";
import { apiClient, useConnectionMode } from "@/lib/api-client";
import { apiRequest } from "@/lib/queryClient";

interface HeartbeatConfig {
  workstationId: string | null;
  employeeId?: string | null;
  intervalMs?: number;
  enabled?: boolean;
}

export function useWorkstationHeartbeat({
  workstationId,
  employeeId,
  intervalMs = 30000,
  enabled = true,
}: HeartbeatConfig) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { mode } = useConnectionMode();

  const sendHeartbeat = useCallback(async () => {
    if (!workstationId) return;

    try {
      await apiRequest("POST", "/api/system-status/workstation/heartbeat", {
        workstationId,
        employeeId,
        connectionMode: mode,
        pendingSyncCount: 0,
        checkCount: 0,
      });
    } catch (error) {
      console.warn("Heartbeat failed:", error);
    }
  }, [workstationId, employeeId, mode]);

  useEffect(() => {
    if (!enabled || !workstationId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    sendHeartbeat();

    intervalRef.current = setInterval(sendHeartbeat, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, workstationId, intervalMs, sendHeartbeat]);

  return { sendHeartbeat };
}
