import { useState, useEffect, useCallback } from "react";

const DEVICE_TOKEN_KEY = "ops_device_token";
const DEVICE_ID_KEY = "ops_device_id";
const DEVICE_NAME_KEY = "ops_device_name";
const DEVICE_TYPE_KEY = "ops_device_type";
const PROPERTY_ID_KEY = "ops_property_id";
const CLOUD_URL_KEY = "ops_cloud_url";

export interface DeviceInfo {
  id: string;
  name: string;
  deviceType: "pos_workstation" | "kds_display";
  propertyId: string;
  workstationId?: string;
  kdsDeviceId?: string;
  status: string;
}

export interface EnrollmentState {
  isEnrolled: boolean;
  isValidating: boolean;
  deviceInfo: DeviceInfo | null;
  error: string | null;
}

export function getDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

export function setDeviceToken(token: string): void {
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
}

export function clearDeviceToken(): void {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(DEVICE_NAME_KEY);
  localStorage.removeItem(DEVICE_TYPE_KEY);
  localStorage.removeItem(PROPERTY_ID_KEY);
  localStorage.removeItem(CLOUD_URL_KEY);
}

export function getStoredDeviceInfo(): { 
  id: string | null; 
  name: string | null; 
  type: string | null;
  propertyId: string | null;
} {
  return {
    id: localStorage.getItem(DEVICE_ID_KEY),
    name: localStorage.getItem(DEVICE_NAME_KEY),
    type: localStorage.getItem(DEVICE_TYPE_KEY),
    propertyId: localStorage.getItem(PROPERTY_ID_KEY),
  };
}

export function useDeviceEnrollment() {
  const [state, setState] = useState<EnrollmentState>({
    isEnrolled: false,
    isValidating: true,
    deviceInfo: null,
    error: null,
  });

  const validateEnrollment = useCallback(async () => {
    const deviceToken = getDeviceToken();

    if (!deviceToken) {
      setState({
        isEnrolled: false,
        isValidating: false,
        deviceInfo: null,
        error: "This device is not enrolled. Please run the CAL Setup Wizard.",
      });
      return false;
    }

    try {
      const response = await fetch("/api/registered-devices/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceToken }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        clearDeviceToken();
        setState({
          isEnrolled: false,
          isValidating: false,
          deviceInfo: null,
          error: data.message || "Device enrollment is invalid or has been revoked.",
        });
        return false;
      }

      setState({
        isEnrolled: true,
        isValidating: false,
        deviceInfo: data.device,
        error: null,
      });
      return true;
    } catch (error) {
      setState({
        isEnrolled: false,
        isValidating: false,
        deviceInfo: null,
        error: "Failed to validate device enrollment. Please check your connection.",
      });
      return false;
    }
  }, []);

  useEffect(() => {
    validateEnrollment();
  }, [validateEnrollment]);

  return {
    ...state,
    validateEnrollment,
  };
}
