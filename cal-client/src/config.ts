/**
 * CAL Client Configuration
 * 
 * Loads configuration from config.json or environment variables.
 * Config file location: %ProgramData%/OPS-POS/cal-client/config.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CalClientConfig {
  cloudUrl: string;
  serviceHostUrl: string | null;
  deviceId: string;
  deviceToken: string;
  propertyId: string;
  calRootDir: string;
  pollIntervalMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function getDefaultConfigPath(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'OPS-POS', 'cal-client', 'config.json');
  }
  return path.join(os.homedir(), '.ops-pos', 'cal-client', 'config.json');
}

function getDefaultCalRootDir(): string {
  if (process.platform === 'win32') {
    return 'C:\\OPS-POS';
  }
  return path.join(os.homedir(), 'ops-pos');
}

export function loadConfig(configPath?: string): CalClientConfig {
  const configFile = configPath || process.env.CAL_CLIENT_CONFIG || getDefaultConfigPath();
  
  let fileConfig: Partial<CalClientConfig> = {};
  
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf-8');
      fileConfig = JSON.parse(content);
      console.log(`[Config] Loaded config from ${configFile}`);
    } catch (err) {
      console.error(`[Config] Failed to parse config file: ${(err as Error).message}`);
    }
  } else {
    console.log(`[Config] No config file found at ${configFile}, using environment variables`);
  }
  
  const config: CalClientConfig = {
    cloudUrl: process.env.CAL_CLOUD_URL || fileConfig.cloudUrl || '',
    serviceHostUrl: process.env.CAL_SERVICE_HOST_URL || fileConfig.serviceHostUrl || null,
    deviceId: process.env.CAL_DEVICE_ID || fileConfig.deviceId || '',
    deviceToken: process.env.CAL_DEVICE_TOKEN || fileConfig.deviceToken || '',
    propertyId: process.env.CAL_PROPERTY_ID || fileConfig.propertyId || '',
    calRootDir: process.env.CAL_ROOT_DIR || fileConfig.calRootDir || getDefaultCalRootDir(),
    pollIntervalMs: parseInt(process.env.CAL_POLL_INTERVAL_MS || '') || fileConfig.pollIntervalMs || 300000,
    logLevel: (process.env.CAL_LOG_LEVEL || fileConfig.logLevel || 'info') as CalClientConfig['logLevel'],
  };
  
  if (!config.cloudUrl) {
    throw new Error('Cloud URL is required. Set CAL_CLOUD_URL or cloudUrl in config.');
  }
  
  if (!config.deviceId) {
    throw new Error('Device ID is required. Set CAL_DEVICE_ID or deviceId in config.');
  }
  
  if (!config.deviceToken) {
    throw new Error('Device token is required. Set CAL_DEVICE_TOKEN or deviceToken in config.');
  }
  
  return config;
}

export function saveConfig(config: CalClientConfig, configPath?: string): void {
  const configFile = configPath || getDefaultConfigPath();
  const configDir = path.dirname(configFile);
  
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  console.log(`[Config] Saved config to ${configFile}`);
}
