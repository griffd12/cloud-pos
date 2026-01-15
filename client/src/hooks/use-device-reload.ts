import { useEffect } from "react";
import { subscribeToDeviceReload, subscribeToDeviceReloadAll } from "./use-pos-websocket";

interface UseDeviceReloadOptions {
  registeredDeviceId?: string;
  propertyId?: string;
}

/**
 * Hook that listens for remote reload commands and automatically
 * refreshes the browser when a reload command is received.
 * 
 * @param options - Device ID and property ID for targeted reload filtering
 */
export function useDeviceReload(options?: UseDeviceReloadOptions) {
  const { registeredDeviceId, propertyId } = options || {};
  
  useEffect(() => {
    // Handler for targeted reload commands (specific device)
    const unsubscribeTargeted = subscribeToDeviceReload((payload) => {
      const targetDeviceId = payload?.entityId;
      
      // For targeted reloads, only reload if the device ID matches
      if (targetDeviceId && registeredDeviceId && targetDeviceId !== registeredDeviceId) {
        console.log("[DeviceReload] Targeted reload not for this device, ignoring");
        return;
      }
      
      // If no device ID is provided, don't reload on targeted events
      if (targetDeviceId && !registeredDeviceId) {
        console.log("[DeviceReload] No device ID configured, ignoring targeted reload");
        return;
      }
      
      console.log("[DeviceReload] Reloading browser (targeted)...");
      setTimeout(() => {
        window.location.reload();
      }, 500);
    });

    // Handler for reload-all commands
    const unsubscribeAll = subscribeToDeviceReloadAll((payload) => {
      const targetPropertyId = payload?.propertyId;
      
      // For property-scoped reload-all, check property matches
      if (targetPropertyId && propertyId && targetPropertyId !== propertyId) {
        console.log("[DeviceReload] Reload-all not for this property, ignoring");
        return;
      }
      
      console.log("[DeviceReload] Reloading browser (all)...");
      setTimeout(() => {
        window.location.reload();
      }, 500);
    });

    return () => {
      unsubscribeTargeted();
      unsubscribeAll();
    };
  }, [registeredDeviceId, propertyId]);
}
