import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

const DEVICE_TYPE_KEY = "pos_device_type";
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

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [deviceType, setDeviceType] = useState<DeviceType>(getStoredDeviceType);
  const [linkedDeviceId, setLinkedDeviceId] = useState<string | null>(getStoredDeviceId);
  const [deviceName, setDeviceName] = useState<string | null>(getStoredDeviceName);
  const [deviceToken, setDeviceToken] = useState<string | null>(getStoredDeviceToken);
  const [registeredDeviceId, setRegisteredDeviceId] = useState<string | null>(getStoredRegisteredDeviceId);
  const [propertyId, setPropertyId] = useState<string | null>(getStoredPropertyId);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const configureAsPos = useCallback((workstationId: string, name: string) => {
    localStorage.setItem(DEVICE_TYPE_KEY, "pos");
    localStorage.setItem(DEVICE_ID_KEY, workstationId);
    localStorage.setItem(DEVICE_NAME_KEY, name);
    setDeviceType("pos");
    setLinkedDeviceId(workstationId);
    setDeviceName(name);
  }, []);

  const configureAsKds = useCallback((kdsDeviceId: string, name: string) => {
    localStorage.setItem(DEVICE_TYPE_KEY, "kds");
    localStorage.setItem(DEVICE_ID_KEY, kdsDeviceId);
    localStorage.setItem(DEVICE_NAME_KEY, name);
    setDeviceType("kds");
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

    if (device.deviceType === "pos_workstation" && device.workstationId) {
      localStorage.setItem(DEVICE_TYPE_KEY, "pos");
      localStorage.setItem(DEVICE_ID_KEY, device.workstationId);
      setDeviceType("pos");
      setLinkedDeviceId(device.workstationId);
    } else if (device.deviceType === "kds_display" && device.kdsDeviceId) {
      localStorage.setItem(DEVICE_TYPE_KEY, "kds");
      localStorage.setItem(DEVICE_ID_KEY, device.kdsDeviceId);
      setDeviceType("kds");
      setLinkedDeviceId(device.kdsDeviceId);
    }
    setValidationError(null);
  }, []);

  const clearDeviceConfig = useCallback(() => {
    localStorage.removeItem(DEVICE_TYPE_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_NAME_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    localStorage.removeItem(REGISTERED_DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_PROPERTY_ID_KEY);
    setDeviceType(null);
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

  useEffect(() => {
    if (deviceToken) {
      validateDeviceToken();
    }
  }, []);

  const isConfigured = deviceType !== null && linkedDeviceId !== null && deviceToken !== null;

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
