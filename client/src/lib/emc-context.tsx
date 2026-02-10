import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface EmcUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  accessLevel: "system_admin" | "super_admin" | "enterprise_admin" | "property_admin";
  enterpriseId: string | null;
  propertyId: string | null;
}

interface EmcContextType {
  user: EmcUser | null;
  sessionToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  selectedEnterpriseId: string | null;
  setSelectedEnterpriseId: (id: string | null) => void;
  selectedPropertyId: string | null;
  setSelectedPropertyId: (id: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setup: (email: string, password: string, displayName?: string, enterpriseId?: string) => Promise<void>;
}

const EmcContext = createContext<EmcContextType | null>(null);

const EMC_SESSION_KEY = "emc_session_token";

const EMC_SELECTED_ENTERPRISE_KEY = "emc_selected_enterprise_id";
const EMC_SELECTED_PROPERTY_KEY = "emc_selected_property_id";

export function EmcProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<EmcUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEnterpriseId, setSelectedEnterpriseIdState] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyIdState] = useState<string | null>(null);

  const setSelectedEnterpriseId = useCallback((id: string | null) => {
    setSelectedEnterpriseIdState(id);
    if (id) {
      sessionStorage.setItem(EMC_SELECTED_ENTERPRISE_KEY, id);
    } else {
      sessionStorage.removeItem(EMC_SELECTED_ENTERPRISE_KEY);
    }
    // Clear property selection when enterprise changes
    setSelectedPropertyIdState(null);
    sessionStorage.removeItem(EMC_SELECTED_PROPERTY_KEY);
  }, []);

  const setSelectedPropertyId = useCallback((id: string | null) => {
    setSelectedPropertyIdState(id);
    if (id) {
      sessionStorage.setItem(EMC_SELECTED_PROPERTY_KEY, id);
    } else {
      sessionStorage.removeItem(EMC_SELECTED_PROPERTY_KEY);
    }
  }, []);

  useEffect(() => {
    const storedEnterpriseId = sessionStorage.getItem(EMC_SELECTED_ENTERPRISE_KEY);
    if (storedEnterpriseId) {
      setSelectedEnterpriseIdState(storedEnterpriseId);
    }
    const storedPropertyId = sessionStorage.getItem(EMC_SELECTED_PROPERTY_KEY);
    if (storedPropertyId) {
      setSelectedPropertyIdState(storedPropertyId);
    }
  }, []);

  const validateSession = useCallback(async (token: string) => {
    try {
      const response = await fetch("/api/emc/validate-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: token }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          setUser(data.user);
          setSessionToken(token);
          return true;
        }
      }
      sessionStorage.removeItem(EMC_SESSION_KEY);
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const storedToken = sessionStorage.getItem(EMC_SESSION_KEY);
    if (storedToken) {
      validateSession(storedToken).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [validateSession]);

  const login = async (email: string, password: string) => {
    const response = await fetch("/api/emc/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Login failed");
    }

    const data = await response.json();
    sessionStorage.setItem(EMC_SESSION_KEY, data.sessionToken);
    setSessionToken(data.sessionToken);
    setUser(data.user);
  };

  const logout = async () => {
    if (sessionToken) {
      try {
        await fetch("/api/emc/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken }),
        });
      } catch {
      }
    }
    sessionStorage.removeItem(EMC_SESSION_KEY);
    setSessionToken(null);
    setUser(null);
  };

  const setup = async (email: string, password: string, displayName?: string, enterpriseId?: string) => {
    const response = await fetch("/api/emc/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName, enterpriseId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Setup failed");
    }

    const data = await response.json();
    sessionStorage.setItem(EMC_SESSION_KEY, data.sessionToken);
    setSessionToken(data.sessionToken);
    setUser(data.user);
  };

  return (
    <EmcContext.Provider
      value={{
        user,
        sessionToken,
        isLoading,
        isAuthenticated: !!user && !!sessionToken,
        selectedEnterpriseId,
        setSelectedEnterpriseId,
        selectedPropertyId,
        setSelectedPropertyId,
        login,
        logout,
        setup,
      }}
    >
      {children}
    </EmcContext.Provider>
  );
}

export function useEmc() {
  const context = useContext(EmcContext);
  if (!context) {
    throw new Error("useEmc must be used within EmcProvider");
  }
  return context;
}
