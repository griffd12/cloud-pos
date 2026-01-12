/**
 * Service Host Alert Engine
 * 
 * Monitors Service Host health and triggers alerts based on configurable rules:
 * - Service Host offline detection
 * - Sync queue backup alerts
 * - Low disk space warnings
 * - Connection mode degradation
 * - High resource utilization
 */

import { IStorage } from "./storage";

interface AlertEngineConfig {
  checkIntervalMs: number;
  offlineThresholdMinutes: number;
  syncQueueWarningThreshold: number;
  syncQueueCriticalThreshold: number;
  diskSpaceWarningGB: number;
  diskSpaceCriticalGB: number;
  cpuWarningPercent: number;
  memoryWarningMB: number;
}

const DEFAULT_CONFIG: AlertEngineConfig = {
  checkIntervalMs: 60000,
  offlineThresholdMinutes: 5,
  syncQueueWarningThreshold: 50,
  syncQueueCriticalThreshold: 100,
  diskSpaceWarningGB: 5,
  diskSpaceCriticalGB: 1,
  cpuWarningPercent: 90,
  memoryWarningMB: 2000,
};

export class AlertEngine {
  private storage: IStorage;
  private config: AlertEngineConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private activeAlertIds: Set<string> = new Set();

  constructor(storage: IStorage, config: Partial<AlertEngineConfig> = {}) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.intervalId) {
      return;
    }

    console.log(`[alert-engine] Starting alert engine (interval: ${this.config.checkIntervalMs}ms)`);
    
    this.checkAlertConditions();
    
    this.intervalId = setInterval(() => {
      this.checkAlertConditions();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[alert-engine] Stopped");
    }
  }

  private async checkAlertConditions(): Promise<void> {
    try {
      const serviceHosts = await this.storage.getServiceHosts();
      const now = Date.now();
      const offlineThreshold = now - this.config.offlineThresholdMinutes * 60 * 1000;

      for (const host of serviceHosts) {
        await this.checkServiceHostHealth(host, offlineThreshold);
      }
    } catch (error) {
      console.error("[alert-engine] Error checking conditions:", error);
    }
  }

  private async checkServiceHostHealth(host: any, offlineThreshold: number): Promise<void> {
    const lastHeartbeat = host.lastHeartbeatAt ? new Date(host.lastHeartbeatAt).getTime() : 0;
    const isOffline = !lastHeartbeat || lastHeartbeat < offlineThreshold;
    
    if (isOffline) {
      await this.triggerAlert(host, "service_host_offline", "critical", 
        `Service Host "${host.name}" has not sent a heartbeat for more than ${this.config.offlineThresholdMinutes} minutes`);
    } else {
      await this.resolveAlertIfExists(host.id, "service_host_offline");
    }

    const metrics = await this.storage.getServiceHostMetrics(host.id, 1);
    if (metrics.length === 0) return;
    
    const latestMetrics = metrics[0];

    if (latestMetrics.pendingSyncItems !== null && latestMetrics.pendingSyncItems !== undefined) {
      if (latestMetrics.pendingSyncItems >= this.config.syncQueueCriticalThreshold) {
        await this.triggerAlert(host, "sync_queue_backup", "critical",
          `Service Host "${host.name}" has ${latestMetrics.pendingSyncItems} pending sync items (critical threshold: ${this.config.syncQueueCriticalThreshold})`);
      } else if (latestMetrics.pendingSyncItems >= this.config.syncQueueWarningThreshold) {
        await this.triggerAlert(host, "sync_queue_backup", "warning",
          `Service Host "${host.name}" has ${latestMetrics.pendingSyncItems} pending sync items`);
      } else {
        await this.resolveAlertIfExists(host.id, "sync_queue_backup");
      }
    }

    if (latestMetrics.diskFreeGB !== null && latestMetrics.diskFreeGB !== undefined) {
      if (latestMetrics.diskFreeGB < this.config.diskSpaceCriticalGB) {
        await this.triggerAlert(host, "disk_space_low", "critical",
          `Service Host "${host.name}" has only ${latestMetrics.diskFreeGB}GB free disk space`);
      } else if (latestMetrics.diskFreeGB < this.config.diskSpaceWarningGB) {
        await this.triggerAlert(host, "disk_space_low", "warning",
          `Service Host "${host.name}" has low disk space (${latestMetrics.diskFreeGB}GB free)`);
      } else {
        await this.resolveAlertIfExists(host.id, "disk_space_low");
      }
    }

    if (latestMetrics.connectionMode) {
      const mode = latestMetrics.connectionMode.toLowerCase();
      if (mode === "red") {
        await this.triggerAlert(host, "connection_mode_red", "critical",
          `Service Host "${host.name}" is in RED mode (complete isolation)`);
      } else if (mode === "orange") {
        await this.triggerAlert(host, "connection_mode_orange", "warning",
          `Service Host "${host.name}" is in ORANGE mode (Service Host down, local agents only)`);
      } else if (mode === "yellow") {
        await this.triggerAlert(host, "connection_mode_yellow", "warning",
          `Service Host "${host.name}" is in YELLOW mode (internet down, local mode)`);
      } else {
        await this.resolveAlertIfExists(host.id, "connection_mode_yellow");
        await this.resolveAlertIfExists(host.id, "connection_mode_orange");
        await this.resolveAlertIfExists(host.id, "connection_mode_red");
      }
    }

    if (latestMetrics.cpuUsagePercent !== null && latestMetrics.cpuUsagePercent !== undefined) {
      if (latestMetrics.cpuUsagePercent >= this.config.cpuWarningPercent) {
        await this.triggerAlert(host, "high_cpu", "warning",
          `Service Host "${host.name}" has high CPU usage (${latestMetrics.cpuUsagePercent}%)`);
      } else {
        await this.resolveAlertIfExists(host.id, "high_cpu");
      }
    }

    if (latestMetrics.memoryUsageMB !== null && latestMetrics.memoryUsageMB !== undefined) {
      if (latestMetrics.memoryUsageMB >= this.config.memoryWarningMB) {
        await this.triggerAlert(host, "high_memory", "warning",
          `Service Host "${host.name}" has high memory usage (${latestMetrics.memoryUsageMB}MB)`);
      } else {
        await this.resolveAlertIfExists(host.id, "high_memory");
      }
    }
  }

  private getAlertKey(serviceHostId: string, alertType: string): string {
    return `${serviceHostId}:${alertType}`;
  }

  private async triggerAlert(host: any, alertType: string, severity: string, message: string): Promise<void> {
    const alertKey = this.getAlertKey(host.id, alertType);
    
    if (this.activeAlertIds.has(alertKey)) {
      return;
    }

    try {
      await this.storage.createServiceHostAlert({
        serviceHostId: host.id,
        propertyId: host.propertyId,
        alertType,
        severity,
        message,
        triggeredAt: new Date(),
      });
      
      this.activeAlertIds.add(alertKey);
      console.log(`[alert-engine] Alert triggered: ${alertType} for ${host.name} (${severity})`);
    } catch (error) {
      console.error(`[alert-engine] Failed to create alert:`, error);
    }
  }

  private async resolveAlertIfExists(serviceHostId: string, alertType: string): Promise<void> {
    const alertKey = this.getAlertKey(serviceHostId, alertType);
    
    if (!this.activeAlertIds.has(alertKey)) {
      return;
    }

    try {
      const alerts = await this.storage.getServiceHostAlerts(undefined, false);
      const matchingAlert = alerts.find(
        a => a.serviceHostId === serviceHostId && a.alertType === alertType && !a.resolvedAt
      );
      
      if (matchingAlert) {
        await this.storage.resolveServiceHostAlert(matchingAlert.id);
        console.log(`[alert-engine] Alert resolved: ${alertType} for service host ${serviceHostId}`);
      }
      
      this.activeAlertIds.delete(alertKey);
    } catch (error) {
      console.error(`[alert-engine] Failed to resolve alert:`, error);
    }
  }
}

let alertEngine: AlertEngine | null = null;

export function startAlertEngine(storage: IStorage): AlertEngine {
  if (alertEngine) {
    return alertEngine;
  }
  
  alertEngine = new AlertEngine(storage);
  alertEngine.start();
  return alertEngine;
}

export function stopAlertEngine(): void {
  if (alertEngine) {
    alertEngine.stop();
    alertEngine = null;
  }
}
