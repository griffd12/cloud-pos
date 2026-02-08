import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Play,
  Database,
  Activity,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { getIsOfflineMode, onOfflineModeChange, fetchWithTimeout } from "@/lib/queryClient";
import { offlineStorage } from "@/lib/offline-storage";
import type { CachedConfig } from "@/lib/offline-storage";
import { useLocation } from "wouter";

interface FetchLogEntry {
  id: number;
  timestamp: string;
  url: string;
  method: string;
  status: "success" | "cached" | "error";
  statusCode?: number;
  duration: number;
  message: string;
}

interface StorageStats {
  configCount: number;
  checksCount: number;
  syncQueueCount: number;
  printQueueCount: number;
}

const TEST_ENDPOINTS = [
  { label: "Menu Items", url: "/api/menu-items?enterpriseId=1" },
  { label: "Employees", url: "/api/employees?enterpriseId=1" },
  { label: "Revenue Centers", url: "/api/rvcs?enterpriseId=1" },
  { label: "Discounts", url: "/api/discounts?enterpriseId=1" },
  { label: "Workstations", url: "/api/workstations?enterpriseId=1" },
];

export default function OfflineTestPage() {
  const [, setLocation] = useLocation();
  const [isOffline, setIsOffline] = useState(getIsOfflineMode());
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [fetchLog, setFetchLog] = useState<FetchLogEntry[]>([]);
  const [cacheEntries, setCacheEntries] = useState<CachedConfig[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [idbAvailable, setIdbAvailable] = useState<boolean | null>(null);
  const logIdRef = useRef(0);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);

  useEffect(() => {
    const unsub = onOfflineModeChange((offline) => setIsOffline(offline));
    return unsub;
  }, []);

  useEffect(() => {
    checkIdbAvailability();
    refreshCacheData();
  }, []);

  const checkIdbAvailability = async () => {
    const available = await offlineStorage.isAvailable();
    setIdbAvailable(available);
  };

  const refreshCacheData = async () => {
    try {
      const [entries, stats] = await Promise.all([
        offlineStorage.getAllConfigEntries(),
        offlineStorage.getStorageStats(),
      ]);
      setCacheEntries(entries);
      setStorageStats(stats);
    } catch {
      setCacheEntries([]);
      setStorageStats(null);
    }
  };

  const addLogEntry = useCallback((entry: Omit<FetchLogEntry, "id" | "timestamp">) => {
    logIdRef.current++;
    setFetchLog((prev) => [
      {
        ...entry,
        id: logIdRef.current,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const enableSimulatedOffline = useCallback(() => {
    if (simulatedOffline) return;
    originalFetchRef.current = window.fetch;
    window.fetch = (() => {
      return Promise.reject(new TypeError("Failed to fetch"));
    }) as typeof window.fetch;
    setSimulatedOffline(true);
  }, [simulatedOffline]);

  const disableSimulatedOffline = useCallback(() => {
    if (!simulatedOffline || !originalFetchRef.current) return;
    window.fetch = originalFetchRef.current;
    originalFetchRef.current = null;
    setSimulatedOffline(false);
  }, [simulatedOffline]);

  useEffect(() => {
    return () => {
      if (originalFetchRef.current) {
        window.fetch = originalFetchRef.current;
        originalFetchRef.current = null;
      }
    };
  }, []);

  const runSingleTest = async (label: string, url: string) => {
    const start = performance.now();
    try {
      const res = await fetchWithTimeout(url);
      const duration = Math.round(performance.now() - start);
      const isCached = res.headers.get("X-Offline-Cache") === "true";
      addLogEntry({
        url,
        method: "GET",
        status: isCached ? "cached" : "success",
        statusCode: res.status,
        duration,
        message: isCached
          ? `${label}: Served from IndexedDB cache`
          : `${label}: Live server response (${res.status})`,
      });
    } catch (err: any) {
      const duration = Math.round(performance.now() - start);
      addLogEntry({
        url,
        method: "GET",
        status: "error",
        duration,
        message: `${label}: ${err.message || "Network error"}`,
      });
    }
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    setFetchLog([]);

    for (const endpoint of TEST_ENDPOINTS) {
      await runSingleTest(endpoint.label, endpoint.url);
      await new Promise((r) => setTimeout(r, 200));
    }

    await refreshCacheData();
    setIsRunningTests(false);
  };

  const clearAllCache = async () => {
    try {
      await offlineStorage.clearAllData();
      await refreshCacheData();
      addLogEntry({
        url: "local",
        method: "DELETE",
        status: "success",
        duration: 0,
        message: "All IndexedDB cache cleared",
      });
    } catch (err: any) {
      addLogEntry({
        url: "local",
        method: "DELETE",
        status: "error",
        duration: 0,
        message: `Clear failed: ${err.message}`,
      });
    }
  };

  const clearExpiredCache = async () => {
    try {
      const count = await offlineStorage.clearExpiredConfig();
      await refreshCacheData();
      addLogEntry({
        url: "local",
        method: "DELETE",
        status: "success",
        duration: 0,
        message: `Cleared ${count} expired cache entries`,
      });
    } catch (err: any) {
      addLogEntry({
        url: "local",
        method: "DELETE",
        status: "error",
        duration: 0,
        message: `Clear expired failed: ${err.message}`,
      });
    }
  };

  const formatTimeAgo = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    return `${Math.round(diff / 3600000)}h ago`;
  };

  const formatTimeRemaining = (isoString: string) => {
    const diff = new Date(isoString).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    if (diff < 60000) return `${Math.round(diff / 1000)}s`;
    if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
    return `${Math.round(diff / 3600000)}h`;
  };

  const getDataPreview = (data: any): string => {
    if (Array.isArray(data)) return `Array[${data.length}]`;
    if (typeof data === "object" && data !== null) {
      const keys = Object.keys(data);
      return `Object{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "..." : ""}}`;
    }
    return String(data).substring(0, 50);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-4" data-testid="offline-test-page">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/emc")}
          data-testid="button-back"
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">
          Offline System Verification
        </h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Badge
            variant={isOffline ? "destructive" : "default"}
            data-testid="badge-connection-status"
          >
            {isOffline ? (
              <>
                <WifiOff className="w-3 h-3 mr-1" /> OFFLINE
              </>
            ) : (
              <>
                <Wifi className="w-3 h-3 mr-1" /> ONLINE
              </>
            )}
          </Badge>
          {simulatedOffline && (
            <Badge variant="outline" data-testid="badge-simulated">
              <AlertTriangle className="w-3 h-3 mr-1" /> Simulated
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card data-testid="card-system-status">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Connection</span>
              <Badge
                variant={isOffline ? "destructive" : "default"}
                className="text-xs"
                data-testid="status-connection"
              >
                {isOffline ? "Offline" : "Online"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">IndexedDB</span>
              <Badge
                variant={idbAvailable === null ? "outline" : idbAvailable ? "default" : "destructive"}
                className="text-xs"
                data-testid="status-indexeddb"
              >
                {idbAvailable === null ? "Checking..." : idbAvailable ? "Available" : "Unavailable"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fetch Timeout</span>
              <span className="text-sm font-mono" data-testid="text-timeout">8000ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Cache TTL</span>
              <span className="text-sm font-mono" data-testid="text-cache-ttl">24 hours</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Simulated Offline</span>
              <Badge
                variant={simulatedOffline ? "destructive" : "secondary"}
                className="text-xs"
                data-testid="status-simulated"
              >
                {simulatedOffline ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-storage-stats">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">IndexedDB Storage</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {storageStats ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Cached Configs</span>
                  <span className="text-sm font-mono" data-testid="text-config-count">
                    {storageStats.configCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Offline Checks</span>
                  <span className="text-sm font-mono" data-testid="text-checks-count">
                    {storageStats.checksCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sync Queue</span>
                  <span className="text-sm font-mono" data-testid="text-sync-count">
                    {storageStats.syncQueueCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Print Queue</span>
                  <span className="text-sm font-mono" data-testid="text-print-count">
                    {storageStats.printQueueCount}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            <div className="flex gap-2 pt-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={refreshCacheData}
                data-testid="button-refresh-cache"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearExpiredCache}
                data-testid="button-clear-expired"
              >
                <Clock className="w-3 h-3 mr-1" /> Clear Expired
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={clearAllCache}
                data-testid="button-clear-all"
              >
                <Trash2 className="w-3 h-3 mr-1" /> Clear All
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-test-controls">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Test Controls</CardTitle>
            <Play className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Test the offline system by running API calls, simulating network failure, and verifying cache fallback.
            </p>
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={runAllTests}
                disabled={isRunningTests}
                data-testid="button-run-tests"
              >
                {isRunningTests ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Running Tests...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" /> Run All API Tests
                  </>
                )}
              </Button>
              {!simulatedOffline ? (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={enableSimulatedOffline}
                  data-testid="button-simulate-offline"
                >
                  <WifiOff className="w-4 h-4 mr-2" /> Simulate Offline
                </Button>
              ) : (
                <Button
                  className="w-full"
                  variant="default"
                  onClick={disableSimulatedOffline}
                  data-testid="button-go-online"
                >
                  <Wifi className="w-4 h-4 mr-2" /> Go Back Online
                </Button>
              )}
            </div>
            <div className="border-t pt-2">
              <p className="text-xs text-muted-foreground mb-2">Recommended test sequence:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                <li>Run All API Tests (populates cache)</li>
                <li>Click "Simulate Offline"</li>
                <li>Run All API Tests again (should serve from cache)</li>
                <li>Click "Go Back Online" to restore</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-fetch-log">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">
            Fetch Request Log ({fetchLog.length} entries)
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFetchLog([])}
            data-testid="button-clear-log"
          >
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          {fetchLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-logs">
              No fetch requests logged yet. Click "Run All API Tests" to begin.
            </p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {fetchLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 py-1.5 px-2 rounded text-xs font-mono border-b last:border-b-0"
                  data-testid={`log-entry-${entry.id}`}
                >
                  {entry.status === "success" && (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                  )}
                  {entry.status === "cached" && (
                    <Database className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  )}
                  {entry.status === "error" && (
                    <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-muted-foreground flex-shrink-0">{entry.timestamp}</span>
                  <span className="flex-1 break-all">{entry.message}</span>
                  <span className="text-muted-foreground flex-shrink-0">{entry.duration}ms</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-cache-entries">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">
            Cache Contents ({cacheEntries.length} entries)
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={refreshCacheData}
            data-testid="button-refresh-entries"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {cacheEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-cache">
              No cached data. Run API tests while online to populate the cache.
            </p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 py-1 px-2 text-xs font-semibold text-muted-foreground border-b">
                <span>Cache Key</span>
                <span>Data</span>
                <span>Cached</span>
                <span>Expires</span>
              </div>
              {cacheEntries.map((entry) => (
                <div
                  key={entry.key}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-2 py-1.5 px-2 rounded text-xs font-mono border-b last:border-b-0 items-center"
                  data-testid={`cache-entry-${entry.key}`}
                >
                  <span className="break-all">{entry.key}</span>
                  <span className="text-muted-foreground">{getDataPreview(entry.data)}</span>
                  <span className="text-muted-foreground">{formatTimeAgo(entry.cachedAt)}</span>
                  <span className="text-muted-foreground">
                    {entry.expiresAt ? (
                      <Badge
                        variant={
                          new Date(entry.expiresAt).getTime() - Date.now() < 3600000
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {formatTimeRemaining(entry.expiresAt)}
                      </Badge>
                    ) : (
                      "No expiry"
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
