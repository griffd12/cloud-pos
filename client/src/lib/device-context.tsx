import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const DEVICE_TYPE_KEY = "pos_device_type";
const DEVICE_ID_KEY = "pos_device_linked_id";
const DEVICE_NAME_KEY = "pos_device_name";

export type DeviceType = "pos" | "kds" | null;

interface DeviceContextType {
  deviceType: DeviceType;
  linkedDeviceId: string | null;
  deviceName: string | null;
  isConfigured: boolean;
  
  configureAsPos: (workstationId: string, name: string) => void;
  configureAsKds: (kdsDeviceId: string, name: string) => void;
  clearDeviceConfig: () => void;
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

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [deviceType, setDeviceType] = useState<DeviceType>(getStoredDeviceType);
  const [linkedDeviceId, setLinkedDeviceId] = useState<string | null>(getStoredDeviceId);
  const [deviceName, setDeviceName] = useState<string | null>(getStoredDeviceName);

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

  const clearDeviceConfig = useCallback(() => {
    localStorage.removeItem(DEVICE_TYPE_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_NAME_KEY);
    setDeviceType(null);
    setLinkedDeviceId(null);
    setDeviceName(null);
  }, []);

  const isConfigured = deviceType !== null && linkedDeviceId !== null;

  return (
    <DeviceContext.Provider
      value={{
        deviceType,
        linkedDeviceId,
        deviceName,
        isConfigured,
        configureAsPos,
        configureAsKds,
        clearDeviceConfig,
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
