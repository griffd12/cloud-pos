/**
 * CAL Client Package Deployer
 * 
 * Handles downloading, extracting, and installing CAL packages.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import tar from 'tar';
import { LocalRegistry, InstalledPackage } from './registry.js';
import { CalClientConfig } from './config.js';

const execAsync = promisify(exec);

export interface PendingDeployment {
  deploymentId: string;
  packageName: string;
  packageType: string;
  versionNumber: string;
  downloadUrl: string | null;
  checksum: string | null;
  action: 'install' | 'uninstall';
  scheduledAt: string | null;
  priority: number;
}

export interface DeploymentStatus {
  deploymentId: string;
  status: 'starting' | 'downloading' | 'extracting' | 'installing' | 'completed' | 'failed';
  message: string;
  progress?: number;
  logOutput?: string;
  completedAt?: string;
}

type StatusCallback = (status: DeploymentStatus) => void;

export class PackageDeployer {
  private config: CalClientConfig;
  private registry: LocalRegistry;
  private packagesDir: string;
  private statusCallbacks: StatusCallback[] = [];
  private isProcessing: boolean = false;
  private scriptOutput: string[] = [];
  
  constructor(config: CalClientConfig, registry: LocalRegistry) {
    this.config = config;
    this.registry = registry;
    this.packagesDir = path.join(config.calRootDir, 'Packages');
    
    if (!fs.existsSync(this.packagesDir)) {
      fs.mkdirSync(this.packagesDir, { recursive: true });
    }
  }
  
  onStatus(callback: StatusCallback): void {
    this.statusCallbacks.push(callback);
  }
  
  private broadcastStatus(status: DeploymentStatus): void {
    for (const callback of this.statusCallbacks) {
      try {
        callback(status);
      } catch (err) {
        console.error(`[Deployer] Status callback error: ${(err as Error).message}`);
      }
    }
  }
  
  isUpdating(): boolean {
    return this.isProcessing;
  }
  
  async processDeployment(deployment: PendingDeployment): Promise<boolean> {
    if (this.isProcessing) {
      console.log(`[Deployer] Already processing, skipping ${deployment.packageName}`);
      return false;
    }
    
    this.isProcessing = true;
    this.scriptOutput = [];
    
    try {
      if (deployment.action === 'uninstall') {
        return await this.uninstallPackage(deployment);
      }
      
      if (this.registry.isInstalled(deployment.packageName, deployment.packageType, deployment.versionNumber)) {
        console.log(`[Deployer] Package ${deployment.packageName} v${deployment.versionNumber} already installed`);
        this.broadcastStatus({
          deploymentId: deployment.deploymentId,
          status: 'completed',
          message: 'Already installed',
          completedAt: new Date().toISOString(),
        });
        return true;
      }
      
      this.broadcastStatus({
        deploymentId: deployment.deploymentId,
        status: 'starting',
        message: `Starting deployment of ${deployment.packageName} v${deployment.versionNumber}`,
      });
      
      if (!deployment.downloadUrl) {
        throw new Error('No download URL provided for package');
      }
      
      this.broadcastStatus({
        deploymentId: deployment.deploymentId,
        status: 'downloading',
        message: 'Downloading package...',
        progress: 10,
      });
      
      const packageFile = await this.downloadPackage(deployment);
      
      this.broadcastStatus({
        deploymentId: deployment.deploymentId,
        status: 'extracting',
        message: 'Extracting package...',
        progress: 40,
      });
      
      const extractDir = await this.extractPackage(packageFile, deployment);
      
      this.broadcastStatus({
        deploymentId: deployment.deploymentId,
        status: 'installing',
        message: 'Running install script...',
        progress: 60,
      });
      
      await this.runInstallScript(extractDir, deployment);
      
      const installedPkg: InstalledPackage = {
        packageName: deployment.packageName,
        packageType: deployment.packageType,
        version: deployment.versionNumber,
        installedAt: new Date().toISOString(),
        deploymentId: deployment.deploymentId,
        installPath: extractDir,
      };
      
      this.registry.recordInstall(installedPkg);
      
      this.broadcastStatus({
        deploymentId: deployment.deploymentId,
        status: 'completed',
        message: `Successfully installed ${deployment.packageName} v${deployment.versionNumber}`,
        progress: 100,
        logOutput: this.scriptOutput.join('\n'),
        completedAt: new Date().toISOString(),
      });
      
      return true;
      
    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error(`[Deployer] Deployment failed: ${errorMessage}`);
      
      this.broadcastStatus({
        deploymentId: deployment.deploymentId,
        status: 'failed',
        message: `Deployment failed: ${errorMessage}`,
        logOutput: this.scriptOutput.join('\n'),
        completedAt: new Date().toISOString(),
      });
      
      return false;
      
    } finally {
      this.isProcessing = false;
    }
  }
  
  private async downloadPackage(deployment: PendingDeployment): Promise<string> {
    const fileName = `${deployment.packageName}-${deployment.versionNumber}.tar.gz`;
    const filePath = path.join(this.packagesDir, fileName);
    
    return new Promise((resolve, reject) => {
      const url = new URL(deployment.downloadUrl!);
      const protocol = url.protocol === 'https:' ? https : http;
      
      const headers: Record<string, string> = {
        'X-Device-Token': this.config.deviceToken,
      };
      
      const request = protocol.get(url, { headers }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            deployment.downloadUrl = redirectUrl;
            this.downloadPackage(deployment).then(resolve).catch(reject);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }
        
        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`[Deployer] Downloaded to ${filePath}`);
          resolve(filePath);
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      });
      
      request.on('error', reject);
    });
  }
  
  private async extractPackage(packageFile: string, deployment: PendingDeployment): Promise<string> {
    const extractDir = path.join(this.packagesDir, `${deployment.packageName}-${deployment.versionNumber}`);
    
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });
    
    await tar.extract({
      file: packageFile,
      cwd: extractDir,
    });
    
    console.log(`[Deployer] Extracted to ${extractDir}`);
    return extractDir;
  }
  
  private async runInstallScript(extractDir: string, deployment: PendingDeployment): Promise<void> {
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'install.bat' : 'install.sh';
    const altScriptName = isWindows ? 'install.ps1' : null;
    
    let scriptPath = path.join(extractDir, scriptName);
    let usePowerShell = false;
    
    if (!fs.existsSync(scriptPath) && altScriptName) {
      const altPath = path.join(extractDir, altScriptName);
      if (fs.existsSync(altPath)) {
        scriptPath = altPath;
        usePowerShell = true;
      }
    }
    
    if (!fs.existsSync(scriptPath)) {
      console.log(`[Deployer] No install script found at ${scriptPath}, skipping script execution`);
      return;
    }
    
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      CAL_ROOT_DIR: this.config.calRootDir,
      CAL_PACKAGE_NAME: deployment.packageName,
      CAL_PACKAGE_VERSION: deployment.versionNumber,
      CAL_PACKAGE_TYPE: deployment.packageType,
      CAL_PACKAGE_DIR: extractDir,
      CAL_DEVICE_ID: this.config.deviceId,
      CAL_PROPERTY_ID: this.config.propertyId,
    };
    
    return new Promise((resolve, reject) => {
      let cmd: string;
      let args: string[];
      
      if (isWindows) {
        if (usePowerShell) {
          cmd = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath];
        } else {
          cmd = 'cmd.exe';
          args = ['/c', scriptPath];
        }
      } else {
        cmd = 'bash';
        args = [scriptPath];
      }
      
      console.log(`[Deployer] Running: ${cmd} ${args.join(' ')}`);
      
      const proc = spawn(cmd, args, {
        cwd: extractDir,
        env,
        shell: false,
      });
      
      proc.stdout.on('data', (data) => {
        const line = data.toString().trim();
        if (line) {
          console.log(`[Script] ${line}`);
          this.scriptOutput.push(line);
        }
      });
      
      proc.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line) {
          console.error(`[Script] ${line}`);
          this.scriptOutput.push(`[ERROR] ${line}`);
        }
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`[Deployer] Script completed successfully`);
          resolve();
        } else {
          reject(new Error(`Script exited with code ${code}`));
        }
      });
      
      proc.on('error', reject);
    });
  }
  
  private async uninstallPackage(deployment: PendingDeployment): Promise<boolean> {
    console.log(`[Deployer] Uninstalling ${deployment.packageName}`);
    
    const installed = this.registry.getAllInstalled().find(
      p => p.packageName === deployment.packageName && p.packageType === deployment.packageType
    );
    
    if (!installed) {
      console.log(`[Deployer] Package ${deployment.packageName} not installed`);
      return true;
    }
    
    const uninstallScript = path.join(
      installed.installPath,
      process.platform === 'win32' ? 'uninstall.bat' : 'uninstall.sh'
    );
    
    if (fs.existsSync(uninstallScript)) {
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        CAL_ROOT_DIR: this.config.calRootDir,
        CAL_PACKAGE_NAME: deployment.packageName,
        CAL_PACKAGE_VERSION: installed.version,
        CAL_PACKAGE_TYPE: deployment.packageType,
        CAL_PACKAGE_DIR: installed.installPath,
      };
      
      try {
        await execAsync(uninstallScript, { cwd: installed.installPath, env });
      } catch (err) {
        console.error(`[Deployer] Uninstall script failed: ${(err as Error).message}`);
      }
    }
    
    this.registry.removePackage(deployment.packageName, deployment.packageType);
    
    this.broadcastStatus({
      deploymentId: deployment.deploymentId,
      status: 'completed',
      message: `Uninstalled ${deployment.packageName}`,
      completedAt: new Date().toISOString(),
    });
    
    return true;
  }
}
