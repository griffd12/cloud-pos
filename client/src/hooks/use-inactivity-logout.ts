import { useEffect, useRef, useCallback } from "react";
import { usePosContext } from "@/lib/pos-context";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import type { CheckItem } from "@shared/schema";

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
  // Store current check ID in a ref so it's always fresh
  const currentCheckIdRef = useRef<string | null>(null);
  
  // Keep the ref updated
  useEffect(() => {
    currentCheckIdRef.current = currentCheck?.id || null;
  }, [currentCheck?.id]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const cancelUnsentItems = useCallback(async () => {
    const checkId = currentCheckIdRef.current;
    if (!checkId) {
      console.log("[Auto-Logout] No current check to cancel items from");
      return;
    }

    console.log(`[Auto-Logout] Fetching items for check ${checkId} to cancel unsent ones`);

    try {
      // Fetch fresh items from API instead of relying on stale closure
      const response = await fetch(`/api/checks/${checkId}/items`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        console.error("[Auto-Logout] Failed to fetch check items");
        return;
      }
      
      const items: CheckItem[] = await response.json();
      const unsentItems = items.filter((item) => !item.sent && !item.voided);

      console.log(`[Auto-Logout] Found ${unsentItems.length} unsent items to cancel`);

      if (unsentItems.length === 0) return;

      for (const item of unsentItems) {
        console.log(`[Auto-Logout] Deleting unsent item: ${item.id} (${item.menuItemName})`);
        await apiRequest("DELETE", `/api/check-items/${item.id}`);
      }
      
      console.log("[Auto-Logout] Successfully canceled all unsent items");
    } catch (error) {
      console.error("[Auto-Logout] Failed to cancel unsent items during auto-logout:", error);
    }
  }, []);

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
