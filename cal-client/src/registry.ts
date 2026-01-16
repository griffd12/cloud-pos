/**
 * CAL Client Package Registry
 * 
 * Tracks installed package versions locally.
 * Registry location: %ProgramData%/OPS-POS/cal-client/installed.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface InstalledPackage {
  packageName: string;
  packageType: string;
  version: string;
  installedAt: string;
  deploymentId: string;
  installPath: string;
}

export interface PackageRegistry {
  version: string;
  lastUpdated: string;
  packages: Record<string, InstalledPackage>;
}

function getDefaultRegistryPath(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'OPS-POS', 'cal-client', 'installed.json');
  }
  return path.join(os.homedir(), '.ops-pos', 'cal-client', 'installed.json');
}

export class LocalRegistry {
  private registryPath: string;
  private registry: PackageRegistry;
  
  constructor(registryPath?: string) {
    this.registryPath = registryPath || getDefaultRegistryPath();
    this.registry = this.load();
  }
  
  private load(): PackageRegistry {
    if (fs.existsSync(this.registryPath)) {
      try {
        const content = fs.readFileSync(this.registryPath, 'utf-8');
        return JSON.parse(content);
      } catch (err) {
        console.error(`[Registry] Failed to load registry: ${(err as Error).message}`);
      }
    }
    
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      packages: {},
    };
  }
  
  private save(): void {
    const registryDir = path.dirname(this.registryPath);
    if (!fs.existsSync(registryDir)) {
      fs.mkdirSync(registryDir, { recursive: true });
    }
    
    this.registry.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2));
  }
  
  private getKey(packageName: string, packageType: string): string {
    return `${packageType}:${packageName}`;
  }
  
  getInstalledVersion(packageName: string, packageType: string): string | null {
    const key = this.getKey(packageName, packageType);
    return this.registry.packages[key]?.version || null;
  }
  
  isInstalled(packageName: string, packageType: string, version: string): boolean {
    const installedVersion = this.getInstalledVersion(packageName, packageType);
    return installedVersion === version;
  }
  
  needsUpdate(packageName: string, packageType: string, targetVersion: string): boolean {
    const installedVersion = this.getInstalledVersion(packageName, packageType);
    if (!installedVersion) return true;
    return this.compareVersions(targetVersion, installedVersion) > 0;
  }
  
  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(p => parseInt(p) || 0);
    const partsB = b.split('.').map(p => parseInt(p) || 0);
    const maxLen = Math.max(partsA.length, partsB.length);
    
    for (let i = 0; i < maxLen; i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }
    return 0;
  }
  
  recordInstall(pkg: InstalledPackage): void {
    const key = this.getKey(pkg.packageName, pkg.packageType);
    this.registry.packages[key] = pkg;
    this.save();
    console.log(`[Registry] Recorded install: ${pkg.packageName} v${pkg.version}`);
  }
  
  removePackage(packageName: string, packageType: string): void {
    const key = this.getKey(packageName, packageType);
    delete this.registry.packages[key];
    this.save();
    console.log(`[Registry] Removed: ${packageName}`);
  }
  
  getAllInstalled(): InstalledPackage[] {
    return Object.values(this.registry.packages);
  }
  
  toJSON(): PackageRegistry {
    return { ...this.registry };
  }
}
