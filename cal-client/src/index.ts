/**
 * OPS-POS CAL Client
 * 
 * Background service for managing workstation software deployments.
 * Polls Service Host or EMC for pending CAL packages and installs them.
 * 
 * Usage:
 *   npm start              - Run in foreground
 *   npm run service:install - Install as Windows service
 *   npm run service:start   - Start Windows service
 *   npm run service:stop    - Stop Windows service
 *   npm run service:uninstall - Remove Windows service
 */

import { loadConfig, CalClientConfig } from './config.js';
import { LocalRegistry } from './registry.js';
import { PackageDeployer } from './deployer.js';
import { DeploymentPoller } from './poller.js';

class CalClient {
  private config: CalClientConfig;
  private registry: LocalRegistry;
  private deployer: PackageDeployer;
  private poller: DeploymentPoller;
  
  constructor() {
    console.log('========================================');
    console.log('  OPS-POS CAL Client v1.0.0');
    console.log('========================================');
    console.log('');
    
    console.log('[Main] Loading configuration...');
    this.config = loadConfig();
    
    console.log('[Main] Initializing local registry...');
    this.registry = new LocalRegistry();
    
    console.log('[Main] Initializing package deployer...');
    this.deployer = new PackageDeployer(this.config, this.registry);
    
    console.log('[Main] Initializing deployment poller...');
    this.poller = new DeploymentPoller(this.config, this.registry, this.deployer);
  }
  
  start(): void {
    console.log('');
    console.log('[Main] Configuration:');
    console.log(`  Cloud URL: ${this.config.cloudUrl}`);
    console.log(`  Service Host URL: ${this.config.serviceHostUrl || '(none)'}`);
    console.log(`  Device ID: ${this.config.deviceId}`);
    console.log(`  Property ID: ${this.config.propertyId}`);
    console.log(`  CAL Root: ${this.config.calRootDir}`);
    console.log(`  Poll Interval: ${this.config.pollIntervalMs}ms`);
    console.log('');
    
    const installed = this.registry.getAllInstalled();
    console.log(`[Main] Installed packages (${installed.length}):`);
    if (installed.length === 0) {
      console.log('  (none)');
    } else {
      for (const pkg of installed) {
        console.log(`  - ${pkg.packageName} v${pkg.version} (${pkg.packageType})`);
      }
    }
    console.log('');
    
    this.poller.start();
    
    console.log('[Main] CAL Client started. Press Ctrl+C to stop.');
    
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }
  
  stop(): void {
    console.log('');
    console.log('[Main] Shutting down...');
    this.poller.stop();
    console.log('[Main] CAL Client stopped.');
    process.exit(0);
  }
}

const client = new CalClient();
client.start();
