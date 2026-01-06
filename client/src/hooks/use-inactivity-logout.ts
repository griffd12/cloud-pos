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
  const { currentEmployee, currentCheck, checkItems, logout } = usePosContext();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const cancelUnsentItems = useCallback(async () => {
    if (!currentCheck?.id) return;

    const unsentItems = checkItems.filter((item) => !item.sent);

    if (unsentItems.length === 0) return;

    try {
      for (const item of unsentItems) {
        await apiRequest("DELETE", `/api/check-items/${item.id}`);
      }
    } catch (error) {
      console.error("Failed to cancel unsent items during auto-logout:", error);
    }
  }, [currentCheck?.id, checkItems]);

  const performAutoLogout = useCallback(async () => {
    if (!currentEmployee) return;

    console.log("[Auto-Logout] Inactivity timeout reached, logging out employee");

    try {
      if (onBeforeLogout) {
        await onBeforeLogout();
      }
      await cancelUnsentItems();
    } catch (error) {
      console.error("[Auto-Logout] Error during pre-logout cleanup:", error);
    }

    logout();
  }, [currentEmployee, onBeforeLogout, cancelUnsentItems, logout]);

  useEffect(() => {
    if (!enabled || !timeoutMinutes || timeoutMinutes <= 0 || !currentEmployee) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;

    const checkInactivity = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMs) {
        performAutoLogout();
      }
    };

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
