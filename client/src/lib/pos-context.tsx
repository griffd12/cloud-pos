import { createContext, useContext, useState, useCallback, useEffect, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { Employee, Rvc, Check, CheckItem, MenuItem, Slu, ModifierGroup, Modifier, OrderType, Timecard, JobCode } from "@shared/schema";

const RVC_STORAGE_KEY = "pos_selected_rvc";

interface SelectedModifier {
  id: string;
  name: string;
  priceDelta: string;
}

interface PosContextType {
  currentEmployee: Employee | null;
  currentRvc: Rvc | null;
  currentCheck: Check | null;
  checkItems: CheckItem[];
  selectedSlu: Slu | null;
  pendingItem: MenuItem | null;
  pendingModifiers: SelectedModifier[];
  privileges: string[];
  isClockedIn: boolean;
  currentTimecard: Timecard | null;
  isSalariedBypass: boolean;
  currentJobCode: JobCode | null;
  
  setCurrentEmployee: (employee: Employee | null) => void;
  setCurrentRvc: (rvc: Rvc | null) => void;
  setCurrentCheck: (check: Check | null) => void;
  setCheckItems: Dispatch<SetStateAction<CheckItem[]>>;
  setSelectedSlu: (slu: Slu | null) => void;
  setPendingItem: (item: MenuItem | null) => void;
  setPendingModifiers: (modifiers: SelectedModifier[]) => void;
  setPrivileges: (privileges: string[]) => void;
  setIsClockedIn: (value: boolean) => void;
  setCurrentTimecard: (timecard: Timecard | null) => void;
  setIsSalariedBypass: (value: boolean) => void;
  setCurrentJobCode: (jobCode: JobCode | null) => void;
  
  hasPrivilege: (code: string) => boolean;
  logout: () => void;
}

const PosContext = createContext<PosContextType | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [currentRvc, setCurrentRvcState] = useState<Rvc | null>(() => {
    // Load saved RVC from localStorage on initialization
    try {
      const saved = localStorage.getItem(RVC_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as Rvc;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  });
  const [currentCheck, setCurrentCheck] = useState<Check | null>(null);
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [selectedSlu, setSelectedSlu] = useState<Slu | null>(null);
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<SelectedModifier[]>([]);
  const [privileges, setPrivileges] = useState<string[]>([]);
  const [isClockedIn, setIsClockedIn] = useState<boolean>(false);
  const [currentTimecard, setCurrentTimecard] = useState<Timecard | null>(null);
  const [isSalariedBypass, setIsSalariedBypass] = useState<boolean>(false);
  const [currentJobCode, setCurrentJobCode] = useState<JobCode | null>(null);

  // Persist RVC selection to localStorage when it changes
  const setCurrentRvc = useCallback((rvc: Rvc | null) => {
    setCurrentRvcState(rvc);
    if (rvc) {
      try {
        localStorage.setItem(RVC_STORAGE_KEY, JSON.stringify(rvc));
      } catch {
        // Ignore storage errors
      }
    } else {
      localStorage.removeItem(RVC_STORAGE_KEY);
    }
  }, []);

  const hasPrivilege = useCallback((code: string) => {
    return privileges.includes(code);
  }, [privileges]);

  // Logout clears employee and transaction state but KEEPS RVC selection
  const logout = useCallback(() => {
    setCurrentEmployee(null);
    setCurrentCheck(null);
    setCheckItems([]);
    setSelectedSlu(null);
    setPendingItem(null);
    setPendingModifiers([]);
    setPrivileges([]);
    setIsClockedIn(false);
    setCurrentTimecard(null);
    setIsSalariedBypass(false);
    setCurrentJobCode(null);
    // NOTE: We intentionally do NOT clear currentRvc - it persists until explicitly changed
  }, []);

  return (
    <PosContext.Provider
      value={{
        currentEmployee,
        currentRvc,
        currentCheck,
        checkItems,
        selectedSlu,
        pendingItem,
        pendingModifiers,
        privileges,
        isClockedIn,
        currentTimecard,
        isSalariedBypass,
        currentJobCode,
        setCurrentEmployee,
        setCurrentRvc,
        setCurrentCheck,
        setCheckItems,
        setSelectedSlu,
        setPendingItem,
        setPendingModifiers,
        setPrivileges,
        setIsClockedIn,
        setCurrentTimecard,
        setIsSalariedBypass,
        setCurrentJobCode,
        hasPrivilege,
        logout,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePosContext() {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error("usePosContext must be used within PosProvider");
  }
  return context;
}
