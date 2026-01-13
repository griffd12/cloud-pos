/**
 * CAL (Configuration Asset Library) Deployment Sync
 * 
 * Handles downloading and installing CAL packages on the Service Host.
 * - Checks for pending deployments on startup
 * - Receives real-time notifications via WebSocket
 * - Downloads package files
 * - Installs/extracts packages
 * - Reports status back to cloud
 */

import fs from 'fs';
import path from 'path';
import { CloudConnection } from './cloud-connection.js';
import { Database } from '../db/database.js';

interface PendingDeployment {
  targetId: string;
  deploymentId: string;
  packageName: string;
  packageType: string;
  versionNumber: string;
  downloadUrl: string | null;
  checksum: string | null;
  action: string;
  scheduledAt: string | null;
}

export class CalSync {
  private db: Database;
  private cloud: CloudConnection;
  private serviceHostId: string;
  private packagesDir: string;
  private deploymentQueue: PendingDeployment[] = [];
  private currentlyProcessing: Set<string> = new Set();
  private successfullyCompleted: Set<string> = new Set(); // Deployments we've successfully installed
  private failedWithCooldown: Map<string, number> = new Map(); // targetId -> retry after timestamp
  private workerRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  
  // Backoff for failed deployments (start at 1 min, max 10 min)
  private static readonly INITIAL_RETRY_DELAY_MS = 60000;
  private static readonly MAX_RETRY_DELAY_MS = 600000;

  constructor(db: Database, cloud: CloudConnection, serviceHostId: string, dataDir: string) {
    this.db = db;
    this.cloud = cloud;
    this.serviceHostId = serviceHostId;
    this.packagesDir = path.join(dataDir, 'packages');

    if (!fs.existsSync(this.packagesDir)) {
      fs.mkdirSync(this.packagesDir, { recursive: true });
    }

    this.setupCloudHandlers();
  }

  private setupCloudHandlers(): void {
    this.cloud.onMessage('CAL_DEPLOYMENT', async (message) => {
      console.log('[CAL] Received deployment notification:', message.targetId);
      this.enqueueDeployment(message as PendingDeployment);
    });

    this.cloud.onMessage('CAL_DEPLOYMENT_CHECK', async () => {
      console.log('[CAL] Cloud requested deployment check');
      await this.checkPendingDeployments();
    });
  }

  async start(): Promise<void> {
    console.log('[CAL] Starting CAL sync service');
    
    await this.checkPendingDeployments();

    this.checkInterval = setInterval(() => {
      this.checkPendingDeployments().catch(err => {
        console.error('[CAL] Periodic check failed:', err.message);
      });
    }, 5 * 60 * 1000);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async checkPendingDeployments(): Promise<void> {
    if (!this.cloud.isConnected()) {
      console.log('[CAL] Cloud not connected, skipping deployment check');
      return;
    }

    try {
      const deployments = await this.cloud.get<PendingDeployment[]>(
        `/api/service-hosts/${this.serviceHostId}/pending-deployments`
      );

      console.log(`[CAL] Found ${deployments.length} pending deployment(s)`);

      for (const deployment of deployments) {
        this.enqueueDeployment(deployment);
      }
    } catch (err) {
      console.error('[CAL] Failed to check pending deployments:', (err as Error).message);
    }
  }

  private enqueueDeployment(deployment: PendingDeployment): void {
    // Skip if already being processed
    if (this.currentlyProcessing.has(deployment.targetId)) {
      console.log(`[CAL] Skipping ${deployment.targetId}, already being processed`);
      return;
    }
    
    // Skip if already successfully completed (prevent regression)
    if (this.successfullyCompleted.has(deployment.targetId)) {
      console.log(`[CAL] Skipping ${deployment.targetId}, already successfully completed`);
      return;
    }
    
    // Skip if failed and still in cooldown period
    const retryAfter = this.failedWithCooldown.get(deployment.targetId);
    if (retryAfter && Date.now() < retryAfter) {
      console.log(`[CAL] Skipping ${deployment.targetId}, in cooldown until ${new Date(retryAfter).toISOString()}`);
      return;
    }
    
    const alreadyQueued = this.deploymentQueue.some(d => d.targetId === deployment.targetId);
    if (!alreadyQueued) {
      this.deploymentQueue.push(deployment);
      console.log(`[CAL] Queued deployment: ${deployment.packageName} v${deployment.versionNumber}`);
      this.startWorker();
    }
  }

  private startWorker(): void {
    if (this.workerRunning) {
      return;
    }
    this.workerRunning = true;
    this.runWorker();
  }

  private async runWorker(): Promise<void> {
    while (this.deploymentQueue.length > 0) {
      const deployment = this.deploymentQueue.shift()!;
      
      // Mark as currently processing to prevent duplicate enqueuing
      this.currentlyProcessing.add(deployment.targetId);
      
      let success = false;
      try {
        console.log(`[CAL] Processing deployment: ${deployment.packageName} v${deployment.versionNumber}`);
        await this.processDeployment(deployment);
        success = true;
      } catch (err) {
        console.error(`[CAL] Worker error processing ${deployment.targetId}:`, (err as Error).message);
      } finally {
        // Clear from processing set after completion
        this.currentlyProcessing.delete(deployment.targetId);
        
        if (success) {
          // Track as successfully completed - won't reprocess
          this.successfullyCompleted.add(deployment.targetId);
          // Clear from failed cooldown if it was there
          this.failedWithCooldown.delete(deployment.targetId);
        } else {
          // Calculate backoff for failed deployment
          const existingCooldown = this.failedWithCooldown.get(deployment.targetId);
          const previousDelay = existingCooldown 
            ? existingCooldown - Date.now() + CalSync.INITIAL_RETRY_DELAY_MS 
            : 0;
          const newDelay = Math.min(
            Math.max(previousDelay * 2, CalSync.INITIAL_RETRY_DELAY_MS),
            CalSync.MAX_RETRY_DELAY_MS
          );
          this.failedWithCooldown.set(deployment.targetId, Date.now() + newDelay);
          console.log(`[CAL] Deployment ${deployment.targetId} failed, retry after ${newDelay / 1000}s`);
        }
      }
    }
    
    this.workerRunning = false;
    console.log('[CAL] Worker finished, queue empty');
  }

  private async processDeployment(deployment: PendingDeployment): Promise<void> {
    try {
      await this.updateStatus(deployment.targetId, 'downloading', 'Starting download...');

      if (deployment.action === 'install') {
        await this.installPackage(deployment);
      } else if (deployment.action === 'uninstall') {
        await this.uninstallPackage(deployment);
      } else {
        throw new Error(`Unknown action: ${deployment.action}`);
      }

      await this.updateStatus(deployment.targetId, 'completed', 'Installation successful');
      console.log(`[CAL] Deployment completed: ${deployment.packageName} v${deployment.versionNumber}`);

    } catch (err) {
      const message = (err as Error).message;
      console.error(`[CAL] Deployment failed: ${message}`);
      await this.updateStatus(deployment.targetId, 'failed', message);
      // Rethrow so runWorker knows this was a failure
      throw err;
    }
  }

  private async installPackage(deployment: PendingDeployment): Promise<void> {
    const packageDir = path.join(this.packagesDir, deployment.packageType);
    
    if (!fs.existsSync(packageDir)) {
      fs.mkdirSync(packageDir, { recursive: true });
    }

    if (deployment.downloadUrl) {
      await this.updateStatus(deployment.targetId, 'downloading', 'Downloading package...');
      
      const fileName = `${deployment.packageName.replace(/\s+/g, '-')}-${deployment.versionNumber}.tar.gz`;
      const filePath = path.join(packageDir, fileName);

      await this.downloadFile(deployment.downloadUrl, filePath);

      if (deployment.checksum) {
        const valid = await this.verifyChecksum(filePath, deployment.checksum);
        if (!valid) {
          fs.unlinkSync(filePath);
          throw new Error('Checksum verification failed');
        }
      }

      await this.updateStatus(deployment.targetId, 'installing', 'Extracting package...');
      await this.extractPackage(filePath, packageDir);

    } else {
      await this.updateStatus(deployment.targetId, 'installing', 'Registering package...');
    }

    this.recordInstalledPackage(deployment);

    console.log(`[CAL] Installed: ${deployment.packageName} v${deployment.versionNumber}`);
  }

  private async uninstallPackage(deployment: PendingDeployment): Promise<void> {
    const packageDir = path.join(this.packagesDir, deployment.packageType, deployment.packageName.replace(/\s+/g, '-'));
    
    if (fs.existsSync(packageDir)) {
      fs.rmSync(packageDir, { recursive: true, force: true });
    }

    this.removeInstalledPackage(deployment.packageName);

    console.log(`[CAL] Uninstalled: ${deployment.packageName}`);
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    let buffer: ArrayBuffer;
    
    // Check if URL is a cloud endpoint (relative path) or external URL (full URL)
    if (url.startsWith('/')) {
      // Cloud endpoint - use authenticated download
      buffer = await this.cloud.downloadFile(url);
    } else if (url.startsWith(this.cloud.getCloudUrl())) {
      // Full cloud URL - convert to relative and use authenticated download
      const endpoint = url.replace(this.cloud.getCloudUrl(), '');
      buffer = await this.cloud.downloadFile(endpoint);
    } else {
      // External URL (e.g., pre-signed S3 URL) - no auth needed
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      
      buffer = await response.arrayBuffer();
    }

    fs.writeFileSync(destPath, Buffer.from(buffer));
    console.log(`[CAL] Downloaded: ${destPath}`);
  }

  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    const crypto = await import('crypto');
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    return hash === expectedChecksum;
  }

  private async extractPackage(archivePath: string, destDir: string): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);
      console.log(`[CAL] Extracted: ${archivePath}`);
    } catch (err) {
      console.error(`[CAL] tar extraction failed: ${(err as Error).message}`);
      // Propagate error so caller knows extraction failed
      throw new Error(`Package extraction failed: ${(err as Error).message}`);
    }
  }

  private recordInstalledPackage(deployment: PendingDeployment): void {
    const manifest = this.loadManifest();
    
    manifest.packages[deployment.packageName] = {
      version: deployment.versionNumber,
      type: deployment.packageType,
      installedAt: new Date().toISOString(),
      deploymentId: deployment.deploymentId,
    };

    this.saveManifest(manifest);
  }

  private removeInstalledPackage(packageName: string): void {
    const manifest = this.loadManifest();
    delete manifest.packages[packageName];
    this.saveManifest(manifest);
  }

  private loadManifest(): { packages: Record<string, any> } {
    const manifestPath = path.join(this.packagesDir, 'manifest.json');
    
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        return { packages: {} };
      }
    }
    
    return { packages: {} };
  }

  private saveManifest(manifest: { packages: Record<string, any> }): void {
    const manifestPath = path.join(this.packagesDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async updateStatus(targetId: string, status: string, message: string): Promise<void> {
    console.log(`[CAL] Status update: ${status} - ${message}`);
    
    try {
      await this.cloud.post(`/api/cal-deployment-targets/${targetId}/status`, {
        status,
        statusMessage: message,
      });
    } catch (err) {
      console.error('[CAL] Failed to update status on cloud:', (err as Error).message);
      // Propagate error so caller can handle retry logic
      throw err;
    }
  }

  getInstalledPackages(): Record<string, any> {
    return this.loadManifest().packages;
  }
}
