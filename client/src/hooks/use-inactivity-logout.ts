import { useEffect, useRef, useCallback } from "react";
import { usePosContext } from "@/lib/pos-context";
import { apiRequest } from "@/lib/queryClient";

interface UseInactivityLogoutOptions {
  timeoutMinutes: number | null | undefined;
  enabled: boolean;
  onBeforeLogout?: () => Promise<void> | void;
}

export function useInactivityLogout({
  timeoutMinutes,
  enabled,
  onBeforeLogout,
}: UseInactivityLogoutOptions) {
  const { currentEmployee, currentCheck, logout } = usePosContext();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  // Store current check ID and employee ID in refs so they're always fresh
  const currentCheckIdRef = useRef<string | null>(null);
  const currentEmployeeIdRef = useRef<string | null>(null);
  
  // Keep the refs updated
  useEffect(() => {
    currentCheckIdRef.current = currentCheck?.id || null;
  }, [currentCheck?.id]);
  
  useEffect(() => {
    currentEmployeeIdRef.current = currentEmployee?.id || null;
  }, [currentEmployee?.id]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Use the same cancel-transaction endpoint as the Cancel key
  const cancelTransaction = useCallback(async () => {
    const checkId = currentCheckIdRef.current;
    const employeeId = currentEmployeeIdRef.current;
    
    if (!checkId) {
      console.log("[Auto-Logout] No current check to cancel");
      return;
    }

    console.log(`[Auto-Logout] Cancelling transaction for check ${checkId}`);

    try {
      const response = await apiRequest("POST", `/api/checks/${checkId}/cancel-transaction`, {
        employeeId,
        reason: "Auto-logout due to inactivity",
      });
      
      const data = await response.json();
      console.log(`[Auto-Logout] Transaction cancelled - voided ${data.voidedCount} item(s)`);
    } catch (error) {
      console.error("[Auto-Logout] Failed to cancel transaction:", error);
    }
  }, []);

  const performAutoLogout = useCallback(async () => {
    if (!currentEmployee) return;

    console.log("[Auto-Logout] Inactivity timeout reached, logging out employee");

    try {
      if (onBeforeLogout) {
        await onBeforeLogout();
      }
      // Cancel the transaction (voids unsent items, removes from KDS)
      await cancelTransaction();
    } catch (error) {
      console.error("[Auto-Logout] Error during pre-logout cleanup:", error);
    }

    logout();
  }, [currentEmployee, onBeforeLogout, cancelTransaction, logout]);

  useEffect(() => {
    if (!enabled || !timeoutMinutes || timeoutMinutes <= 0 || !currentEmployee) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;
    console.log(`[Auto-Logout] Timer active: ${timeoutMinutes} minutes (${timeoutMs}ms)`);

    const checkInactivity = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, timeoutMs - elapsed);
      if (elapsed >= timeoutMs) {
        console.log("[Auto-Logout] Timeout reached, logging out");
        performAutoLogout();
      } else if (remaining < 60000) {
        // Log warning in last minute
        console.log(`[Auto-Logout] Warning: ${Math.ceil(remaining / 1000)}s until auto-logout`);
      }
    };

    // Reset the activity timestamp when timer starts
    lastActivityRef.current = Date.now();
    timerRef.current = setInterval(checkInactivity, 10000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, timeoutMinutes, currentEmployee, performAutoLogout]);

  useEffect(() => {
    if (!enabled || !timeoutMinutes || timeoutMinutes <= 0 || !currentEmployee) {
      return;
    }

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, timeoutMinutes, currentEmployee, resetTimer]);

  return {
    resetTimer,
    lastActivity: lastActivityRef.current,
  };
}
