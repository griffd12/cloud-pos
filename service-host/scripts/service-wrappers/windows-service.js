#!/usr/bin/env node

/**
 * Windows Service Wrapper for Cloud POS Service Host
 * 
 * Installs the Service Host as a Windows Service that:
 * - Starts automatically on boot
 * - Restarts on crash
 * - Logs to Windows Event Log
 * 
 * Usage:
 *   node windows-service.js install   - Install as Windows Service
 *   node windows-service.js uninstall - Remove Windows Service
 *   node windows-service.js start     - Start the service
 *   node windows-service.js stop      - Stop the service
 *   node windows-service.js status    - Check service status
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVICE_NAME = 'CloudPOSServiceHost';
const SERVICE_DISPLAY = 'Cloud POS Service Host';
const SERVICE_DESC = 'On-premise server for Cloud POS offline operations';

const ROOT = path.join(__dirname, '../..');
const NODE_PATH = process.execPath;
const SCRIPT_PATH = path.join(ROOT, 'dist', 'index.js');
const LOG_DIR = path.join(ROOT, 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function isAdmin() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runAsAdmin(args) {
  console.log('This command requires administrator privileges.');
  console.log('Please run from an elevated command prompt or PowerShell.');
  process.exit(1);
}

function createServiceScript() {
  const scriptContent = `
@echo off
setlocal

set NODE_PATH=${NODE_PATH}
set SCRIPT_PATH=${SCRIPT_PATH}
set LOG_FILE=${path.join(LOG_DIR, 'service.log')}

cd /d "${ROOT}"

"%NODE_PATH%" "%SCRIPT_PATH%" >> "%LOG_FILE%" 2>&1
`;

  const scriptPath = path.join(ROOT, 'service-runner.bat');
  fs.writeFileSync(scriptPath, scriptContent);
  return scriptPath;
}

function install() {
  if (!isAdmin()) {
    runAsAdmin(['install']);
    return;
  }

  console.log(`Installing ${SERVICE_DISPLAY}...`);
  
  ensureLogDir();
  const runnerScript = createServiceScript();
  
  // Escape quotes for paths with spaces
  const escapedScript = runnerScript.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  try {
    // Use sc.exe to create the service
    // For production, consider using nssm or node-windows for better Node.js support
    execSync(`sc create ${SERVICE_NAME} binPath= "cmd.exe /c \\"${escapedScript}\\"" start= auto DisplayName= "${SERVICE_DISPLAY}"`, { stdio: 'inherit' });
    execSync(`sc description ${SERVICE_NAME} "${SERVICE_DESC}"`, { stdio: 'inherit' });
    execSync(`sc failure ${SERVICE_NAME} reset= 60 actions= restart/5000/restart/10000/restart/30000`, { stdio: 'inherit' });
    
    console.log('');
    console.log('Service installed successfully!');
    console.log('');
    console.log('Before starting the service:');
    console.log('  1. Edit config.json with your cloud URL and token');
    console.log('  2. Run: node windows-service.js start');
    console.log('');
    console.log('To view logs:');
    console.log(`  ${path.join(LOG_DIR, 'service.log')}`);
    
  } catch (e) {
    console.error('Failed to install service:', e.message);
    process.exit(1);
  }
}

function uninstall() {
  if (!isAdmin()) {
    runAsAdmin(['uninstall']);
    return;
  }

  console.log(`Uninstalling ${SERVICE_DISPLAY}...`);

  try {
    // Stop first if running
    try {
      execSync(`sc stop ${SERVICE_NAME}`, { stdio: 'ignore' });
    } catch {}

    execSync(`sc delete ${SERVICE_NAME}`, { stdio: 'inherit' });
    console.log('Service uninstalled successfully!');
    
  } catch (e) {
    console.error('Failed to uninstall service:', e.message);
    process.exit(1);
  }
}

function start() {
  if (!isAdmin()) {
    runAsAdmin(['start']);
    return;
  }

  console.log(`Starting ${SERVICE_DISPLAY}...`);

  try {
    execSync(`sc start ${SERVICE_NAME}`, { stdio: 'inherit' });
    console.log('Service started!');
  } catch (e) {
    console.error('Failed to start service:', e.message);
    console.error('Check config.json and logs for details.');
    process.exit(1);
  }
}

function stop() {
  if (!isAdmin()) {
    runAsAdmin(['stop']);
    return;
  }

  console.log(`Stopping ${SERVICE_DISPLAY}...`);

  try {
    execSync(`sc stop ${SERVICE_NAME}`, { stdio: 'inherit' });
    console.log('Service stopped!');
  } catch (e) {
    console.error('Failed to stop service:', e.message);
    process.exit(1);
  }
}

function status() {
  try {
    execSync(`sc query ${SERVICE_NAME}`, { stdio: 'inherit' });
  } catch (e) {
    console.log('Service not installed or not accessible.');
  }
}

// Main
const command = process.argv[2];

switch (command) {
  case 'install':
    install();
    break;
  case 'uninstall':
    uninstall();
    break;
  case 'start':
    start();
    break;
  case 'stop':
    stop();
    break;
  case 'status':
    status();
    break;
  default:
    console.log('Cloud POS Service Host - Windows Service Manager');
    console.log('');
    console.log('Usage:');
    console.log('  node windows-service.js install   - Install as Windows Service');
    console.log('  node windows-service.js uninstall - Remove Windows Service');
    console.log('  node windows-service.js start     - Start the service');
    console.log('  node windows-service.js stop      - Stop the service');
    console.log('  node windows-service.js status    - Check service status');
    break;
}
