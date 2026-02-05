import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

const DEVICE_TYPE_KEY = "pos_device_type";
const DEVICE_TYPE_EXPLICIT_KEY = "pos_device_type_explicit"; // Tracks if user explicitly chose device type
const DEVICE_ID_KEY = "pos_device_linked_id";
const DEVICE_NAME_KEY = "pos_device_name";
const DEVICE_TOKEN_KEY = "pos_device_token";
const REGISTERED_DEVICE_ID_KEY = "pos_registered_device_id";
const DEVICE_PROPERTY_ID_KEY = "pos_device_property_id";

export type DeviceType = "pos" | "kds" | null;

interface RegisteredDeviceInfo {
  id: string;
  name: string;
  deviceType: string;
  propertyId: string;
  workstationId?: string | null;
  kdsDeviceId?: string | null;
  status: string;
}

interface DeviceContextType {
  deviceType: DeviceType;
  linkedDeviceId: string | null;
  deviceName: string | null;
  deviceToken: string | null;
  registeredDeviceId: string | null;
  propertyId: string | null;
  isConfigured: boolean;
  isValidating: boolean;
  validationError: string | null;
  hasExplicitDeviceType: boolean; // True if user explicitly selected device type
  
  setDeviceTypeOnly: (type: "pos" | "kds") => void; // Set device type without linking to specific device
  configureAsPos: (workstationId: string, name: string) => void;
  configureAsKds: (kdsDeviceId: string, name: string) => void;
  enrollDevice: (token: string, device: RegisteredDeviceInfo) => void;
  clearDeviceConfig: () => void;
  validateDeviceToken: () => Promise<boolean>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

function getStoredDeviceType(): DeviceType {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(DEVICE_TYPE_KEY);
  if (stored === "pos" || stored === "kds") return stored;
  return null;
}

function getStoredDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(DEVICE_ID_KEY);
}

function getStoredDeviceName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(DEVICE_NAME_KEY);
}

function getStoredDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

function getStoredRegisteredDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REGISTERED_DEVICE_ID_KEY);
}

function getStoredPropertyId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(DEVICE_PROPERTY_ID_KEY);
}

function getStoredExplicitDeviceType(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DEVICE_TYPE_EXPLICIT_KEY) === "true";
}

const AUTO_ENROLL_REDIRECT_KEY = "pos_auto_enroll_redirect";

function processUrlCredentials(): { stored: boolean; autoEnroll: boolean; targetPath: string | null } {
  if (typeof window === 'undefined') return { stored: false, autoEnroll: false, targetPath: null };
  
  const params = new URLSearchParams(window.location.search);
  const deviceToken = params.get("device_token");
  const deviceId = params.get("device_id");
  const registeredDeviceId = params.get("registered_device_id");
  const deviceName = params.get("device_name");
  const deviceType = params.get("device_type");
  const propertyId = params.get("property_id");
  const autoEnroll = params.get("auto_enroll") === "true";
  
  console.log("[DeviceContext] Checking URL params:", { 
    hasToken: !!deviceToken, 
    hasDeviceId: !!deviceId,
    hasRegisteredDeviceId: !!registeredDeviceId,
    autoEnroll,
    path: window.location.pathname,
    search: window.location.search
  });
  
  if (deviceToken && deviceId && deviceName && deviceType && propertyId) {
    console.log("[DeviceContext] Storing CAL credentials from URL", {
      deviceId,
      registeredDeviceId,
      deviceName,
      deviceType,
      autoEnroll
    });
    
    localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
    localStorage.setItem(DEVICE_PROPERTY_ID_KEY, propertyId);
    
    if (registeredDeviceId) {
      localStorage.setItem(REGISTERED_DEVICE_ID_KEY, registeredDeviceId);
    }
    
    const targetPath = deviceType === "kds_display" ? "/kds" : "/pos";
    
    if (deviceType === "pos_workstation") {
      localStorage.setItem(DEVICE_TYPE_KEY, "pos");
      localStorage.setItem(DEVICE_TYPE_EXPLICIT_KEY, "true");
    } else if (deviceType === "kds_display") {
      localStorage.setItem(DEVICE_TYPE_KEY, "kds");
      localStorage.setItem(DEVICE_TYPE_EXPLICIT_KEY, "true");
    }
    
    if (autoEnroll) {
      sessionStorage.setItem(AUTO_ENROLL_REDIRECT_KEY, targetPath);
    }
    
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    console.log("[DeviceContext] Credentials stored successfully, auto-enroll redirect:", autoEnroll ? targetPath : "none");
    return { stored: true, autoEnroll, targetPath };
  }
  return { stored: false, autoEnroll: false, targetPath: null };
}

export function getAutoEnrollRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  const redirect = sessionStorage.getItem(AUTO_ENROLL_REDIRECT_KEY);
  if (redirect) {
    sessionStorage.removeItem(AUTO_ENROLL_REDIRECT_KEY);
  }
  return redirect;
}

const urlCredsProcessed = processUrlCredentials();

export function DeviceProvider({ children }: { children: ReactNode }) {
  // Security disabled - default to null if no device type is stored (shows device type selector)
  const [deviceType, setDeviceType] = useState<DeviceType>(getStoredDeviceType());
  const [hasExplicitDeviceType, setHasExplicitDeviceType] = useState<boolean>(getStoredExplicitDeviceType);
  const [linkedDeviceId, setLinkedDeviceId] = useState<string | null>(getStoredDeviceId);
  const [deviceName, setDeviceName] = useState<string | null>(getStoredDeviceName);
  const [deviceToken, setDeviceToken] = useState<string | null>(getStoredDeviceToken);
  const [registeredDeviceId, setRegisteredDeviceId] = useState<string | null>(getStoredRegisteredDeviceId);
  const [propertyId, setPropertyId] = useState<string | null>(getStoredPropertyId);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Set device type only (without linking to a specific workstation/kds device)
  const setDeviceTypeOnly = useCallback((type: "pos" | "kds") => {
    localStorage.setItem(DEVICE_TYPE_KEY, type);
    localStorage.setItem(DEVICE_TYPE_EXPLICIT_KEY, "true");
    setDeviceType(type);
    setHasExplicitDeviceType(true);
  }, []);

  const configureAsPos = useCallback((workstationId: string, name: string) => {
    localStorage.setItem(DEVICE_TYPE_KEY, "pos");
    localStorage.setItem(DEVICE_TYPE_EXPLICIT_KEY, "true");
    localStorage.setItem(DEVICE_ID_KEY, workstationId);
    localStorage.setItem(DEVICE_NAME_KEY, name);
    setDeviceType("pos");
    setHasExplicitDeviceType(true);
    setLinkedDeviceId(workstationId);
    setDeviceName(name);
  }, []);

  const configureAsKds = useCallback((kdsDeviceId: string, name: string) => {
    localStorage.setItem(DEVICE_TYPE_KEY, "kds");
    localStorage.setItem(DEVICE_TYPE_EXPLICIT_KEY, "true");
    localStorage.setItem(DEVICE_ID_KEY, kdsDeviceId);
    localStorage.setItem(DEVICE_NAME_KEY, name);
    setDeviceType("kds");
    setHasExplicitDeviceType(true);
    setLinkedDeviceId(kdsDeviceId);
    setDeviceName(name);
  }, []);

  const enrollDevice = useCallback((token: string, device: RegisteredDeviceInfo) => {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
    localStorage.setItem(REGISTERED_DEVICE_ID_KEY, device.id);
    localStorage.setItem(DEVICE_NAME_KEY, device.name);
    localStorage.setItem(DEVICE_PROPERTY_ID_KEY, device.propertyId);
    setDeviceToken(token);
    setRegisteredDeviceId(device.id);
    setDeviceName(device.name);
    setPropertyId(device.propertyId);

    // Handle both full names ("pos_workstation") and short names ("pos") from server
    const isPosDevice = device.deviceType === "pos_workstation" || device.deviceType === "pos";
    const isKdsDevice = device.deviceType === "kds_display" || device.deviceType === "kds";

    if (isPosDevice && device.workstationId) {
      localStorage.setItem(DEVICE_TYPE_KEY, "pos");
      localStorage.setItem(DEVICE_TYPE_EXPLICIT_KEY, "true");
      localStorage.setItem(DEVICE_ID_KEY, device.workstationId);
      setDeviceType("pos");
      setHasExplicitDeviceType(true);
      setLinkedDeviceId(device.workstationId);
    } else if (isKdsDevice && device.kdsDeviceId) {
      localStorage.setItem(DEVICE_TYPE_KEY, "kds");
      localStorage.setItem(DEVICE_TYPE_EXPLICIT_KEY, "true");
      localStorage.setItem(DEVICE_ID_KEY, device.kdsDeviceId);
      setDeviceType("kds");
      setHasExplicitDeviceType(true);
      setLinkedDeviceId(device.kdsDeviceId);
    }
    setValidationError(null);
  }, []);

  const clearDeviceConfig = useCallback(() => {
    localStorage.removeItem(DEVICE_TYPE_KEY);
    localStorage.removeItem(DEVICE_TYPE_EXPLICIT_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_NAME_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    localStorage.removeItem(REGISTERED_DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_PROPERTY_ID_KEY);
    setDeviceType(null);
    setHasExplicitDeviceType(false);
    setLinkedDeviceId(null);
    setDeviceName(null);
    setDeviceToken(null);
    setRegisteredDeviceId(null);
    setPropertyId(null);
    setValidationError(null);
  }, []);

  const validateDeviceToken = useCallback(async (): Promise<boolean> => {
    const token = getStoredDeviceToken();
    if (!token) {
      return false;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const response = await fetch("/api/registered-devices/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceToken: token }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        setValidationError(data.message || "Device validation failed");
        clearDeviceConfig();
        return false;
      }

      return true;
    } catch (error) {
      setValidationError("Failed to validate device");
      return false;
    } finally {
      setIsValidating(false);
    }
  }, [clearDeviceConfig]);

  // Security disabled - skip automatic token validation
  // useEffect(() => {
  //   if (deviceToken) {
  //     validateDeviceToken();
  //   }
  // }, []);

  // Security disabled - always consider device as configured
  const isConfigured = true;

  return (
    <DeviceContext.Provider
      value={{
        deviceType,
        linkedDeviceId,
        deviceName,
        deviceToken,
        registeredDeviceId,
        propertyId,
        isConfigured,
        isValidating,
        validationError,
        hasExplicitDeviceType,
        setDeviceTypeOnly,
        configureAsPos,
        configureAsKds,
        enrollDevice,
        clearDeviceConfig,
        validateDeviceToken,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDeviceContext() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDeviceContext must be used within a DeviceProvider");
  }
  return context;
}
