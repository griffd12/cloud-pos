/**
 * React Hook for Offline Sync Service
 * 
 * Provides reactive access to connection mode and sync status.
 * Automatically handles initialization and cleanup.
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  offlineSyncService, 
  type ConnectionMode, 
  type SyncStatus, 
  type SyncConfig 
} from '@/lib/offline-sync';
import { offlineStorage } from '@/lib/offline-storage';

interface UseOfflineSyncOptions {
  autoInitialize?: boolean;
  config?: SyncConfig;
}

interface UseOfflineSyncReturn {
  status: SyncStatus | null;
  mode: ConnectionMode;
  isOffline: boolean;
  pendingSyncCount: number;
  pendingPrintCount: number;
  initialize: (config: SyncConfig) => Promise<void>;
  forceSync: () => Promise<void>;
  cacheConfig: () => Promise<void>;
  checkConnectivity: () => Promise<ConnectionMode>;
}

export function useOfflineSync(options: UseOfflineSyncOptions = {}): UseOfflineSyncReturn {
  const { autoInitialize = false, config } = options;
  
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (autoInitialize && config && !isInitialized) {
      offlineSyncService.initialize(config).then(() => {
        setStatus(offlineSyncService.getStatus());
        setIsInitialized(true);
      });
    }
  }, [autoInitialize, config, isInitialized]);

  useEffect(() => {
    const unsubscribe = offlineSyncService.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    // Get initial status if service is already running
    const currentStatus = offlineSyncService.getStatus();
    if (currentStatus.mode) {
      setStatus(currentStatus);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  const initialize = useCallback(async (initConfig: SyncConfig) => {
    await offlineSyncService.initialize(initConfig);
    setStatus(offlineSyncService.getStatus());
    setIsInitialized(true);
  }, []);

  const forceSync = useCallback(async () => {
    await offlineSyncService.forceSync();
  }, []);

  const cacheConfig = useCallback(async () => {
    await offlineSyncService.cacheConfigurationForOffline();
  }, []);

  const checkConnectivity = useCallback(async () => {
    return offlineSyncService.checkConnectivity();
  }, []);

  const mode = status?.mode || 'green';
  const isOffline = mode === 'orange' || mode === 'red';

  return {
    status,
    mode,
    isOffline,
    pendingSyncCount: status?.pendingSyncItems || 0,
    pendingPrintCount: status?.pendingPrintJobs || 0,
    initialize,
    forceSync,
    cacheConfig,
    checkConnectivity,
  };
}

/**
 * Hook for displaying connection mode badge/indicator
 */
export function useConnectionMode(): {
  mode: ConnectionMode;
  label: string;
  color: string;
  description: string;
} {
  const { mode } = useOfflineSync();

  const modeInfo = {
    green: {
      label: 'ONLINE',
      color: 'bg-green-600',
      description: 'Connected to Cloud',
    },
    yellow: {
      label: 'LAN',
      color: 'bg-yellow-500 text-black',
      description: 'Service Host Only',
    },
    orange: {
      label: 'OFFLINE',
      color: 'bg-orange-500',
      description: 'Browser Storage',
    },
    red: {
      label: 'DISCONNECTED',
      color: 'bg-red-600',
      description: 'No Connectivity',
    },
  };

  return {
    mode,
    ...modeInfo[mode],
  };
}

/**
 * Hook for cached configuration access
 */
export function useCachedConfig<T>(key: string): {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      try {
        const cached = await offlineStorage.getConfig<T>(key);
        if (!cancelled) {
          setData(cached);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e as Error);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return { data, isLoading, error, refresh };
}

/**
 * Hook for offline check operations
 */
export function useOfflineChecks(rvcId: string): {
  checks: any[];
  isLoading: boolean;
  refresh: () => void;
  createCheck: (data: any) => Promise<any>;
} {
  const [checks, setChecks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadChecks() {
      setIsLoading(true);
      try {
        const offlineChecks = await offlineStorage.getOpenChecks(rvcId);
        if (!cancelled) {
          setChecks(offlineChecks);
        }
      } catch (e) {
        console.error('Failed to load offline checks:', e);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadChecks();

    return () => {
      cancelled = true;
    };
  }, [rvcId, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const createCheck = useCallback(async (data: any) => {
    const check = await offlineSyncService.createOfflineCheck({
      rvcId,
      ...data,
    });
    refresh();
    return check;
  }, [rvcId, refresh]);

  return { checks, isLoading, refresh, createCheck };
}
