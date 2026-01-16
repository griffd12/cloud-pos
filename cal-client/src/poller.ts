/**
 * CAL Client Deployment Poller
 * 
 * Polls Service Host or EMC for pending deployments.
 * Priority: Service Host (LAN) > EMC (Cloud)
 */

import https from 'https';
import http from 'http';
import { CalClientConfig } from './config.js';
import { LocalRegistry } from './registry.js';
import { PackageDeployer, PendingDeployment, DeploymentStatus } from './deployer.js';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class DeploymentPoller {
  private config: CalClientConfig;
  private registry: LocalRegistry;
  private deployer: PackageDeployer;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private useServiceHost: boolean = true;
  private consecutiveServiceHostFailures: number = 0;
  private maxServiceHostFailures: number = 3;
  
  constructor(config: CalClientConfig, registry: LocalRegistry, deployer: PackageDeployer) {
    this.config = config;
    this.registry = registry;
    this.deployer = deployer;
    this.useServiceHost = !!config.serviceHostUrl;
    
    this.deployer.onStatus((status) => {
      this.reportDeploymentStatus(status);
    });
  }
  
  start(): void {
    console.log(`[Poller] Starting with ${this.config.pollIntervalMs}ms interval`);
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.config.pollIntervalMs);
  }
  
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[Poller] Stopped');
  }
  
  async poll(): Promise<void> {
    if (this.isPolling) {
      console.log('[Poller] Already polling, skipping');
      return;
    }
    
    this.isPolling = true;
    
    try {
      const deployments = await this.fetchPendingDeployments();
      
      if (deployments.length === 0) {
        console.log('[Poller] No pending deployments');
        return;
      }
      
      console.log(`[Poller] Found ${deployments.length} pending deployment(s)`);
      
      const sorted = deployments.sort((a, b) => a.priority - b.priority);
      
      for (const deployment of sorted) {
        if (this.registry.isInstalled(deployment.packageName, deployment.packageType, deployment.versionNumber)) {
          console.log(`[Poller] Skipping ${deployment.packageName} v${deployment.versionNumber} - already installed`);
          await this.reportDeploymentStatus({
            deploymentId: deployment.deploymentId,
            status: 'completed',
            message: 'Already installed',
            completedAt: new Date().toISOString(),
          });
          continue;
        }
        
        if (deployment.scheduledAt) {
          const scheduledTime = new Date(deployment.scheduledAt).getTime();
          if (scheduledTime > Date.now()) {
            console.log(`[Poller] Skipping ${deployment.packageName} - scheduled for ${deployment.scheduledAt}`);
            continue;
          }
        }
        
        console.log(`[Poller] Processing deployment: ${deployment.packageName} v${deployment.versionNumber}`);
        await this.deployer.processDeployment(deployment);
      }
      
    } catch (err) {
      console.error(`[Poller] Poll error: ${(err as Error).message}`);
    } finally {
      this.isPolling = false;
    }
  }
  
  private async fetchPendingDeployments(): Promise<PendingDeployment[]> {
    if (this.useServiceHost && this.config.serviceHostUrl) {
      try {
        const deployments = await this.fetchFromServiceHost();
        this.consecutiveServiceHostFailures = 0;
        return deployments;
      } catch (err) {
        this.consecutiveServiceHostFailures++;
        console.warn(`[Poller] Service Host fetch failed (${this.consecutiveServiceHostFailures}/${this.maxServiceHostFailures}): ${(err as Error).message}`);
        
        if (this.consecutiveServiceHostFailures >= this.maxServiceHostFailures) {
          console.log('[Poller] Falling back to EMC');
          this.useServiceHost = false;
        }
      }
    }
    
    return await this.fetchFromEmc();
  }
  
  private async fetchFromServiceHost(): Promise<PendingDeployment[]> {
    const url = `${this.config.serviceHostUrl}/api/cal-client/pending`;
    console.log(`[Poller] Fetching from Service Host: ${url}`);
    
    const response = await this.httpGet<PendingDeployment[]>(url);
    return response.data || [];
  }
  
  private async fetchFromEmc(): Promise<PendingDeployment[]> {
    const url = `${this.config.cloudUrl}/api/cal-client/${this.config.deviceId}/pending-deployments`;
    console.log(`[Poller] Fetching from EMC: ${url}`);
    
    const response = await this.httpGet<PendingDeployment[]>(url);
    return response.data || [];
  }
  
  private async reportDeploymentStatus(status: DeploymentStatus): Promise<void> {
    try {
      const url = `${this.config.cloudUrl}/api/cal-client/${this.config.deviceId}/deployment-status`;
      await this.httpPost(url, status);
      console.log(`[Poller] Reported status for ${status.deploymentId}: ${status.status}`);
    } catch (err) {
      console.error(`[Poller] Failed to report status: ${(err as Error).message}`);
    }
  }
  
  private httpGet<T>(url: string): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'X-Device-Token': this.config.deviceToken,
          'X-Device-ID': this.config.deviceId,
          'Content-Type': 'application/json',
        },
      };
      
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, data: parsed });
            } else {
              resolve({ success: false, error: parsed.message || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ success: false, error: 'Invalid JSON response' });
          }
        });
      });
      
      req.on('error', reject);
      req.end();
    });
  }
  
  private httpPost(url: string, body: object): Promise<ApiResponse<unknown>> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      const bodyStr = JSON.stringify(body);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'X-Device-Token': this.config.deviceToken,
          'X-Device-ID': this.config.deviceId,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      };
      
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, data: parsed });
            } else {
              resolve({ success: false, error: parsed.message || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ success: true });
          }
        });
      });
      
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }
}
