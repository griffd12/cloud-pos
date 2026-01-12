#!/usr/bin/env node

/**
 * Installation Wizard for Cloud POS Service Host
 * 
 * Interactive setup that:
 * - Validates prerequisites (Node.js version)
 * - Collects cloud URL and authentication token
 * - Configures property settings
 * - Tests cloud connectivity
 * - Creates config.json
 * - Optionally installs as system service
 * 
 * Usage: node setup-wizard.js
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

class SetupWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.config = {
      cloudUrl: '',
      token: '',
      propertyId: '',
      port: 3001,
      dataDir: path.join(ROOT, 'data')
    };
  }
  
  async run() {
    console.log('');
    console.log('='.repeat(60));
    console.log('  Cloud POS Service Host - Installation Wizard');
    console.log('='.repeat(60));
    console.log('');
    
    // Check prerequisites
    if (!this.checkPrerequisites()) {
      this.close();
      return;
    }
    
    console.log('This wizard will help you configure the Service Host.');
    console.log('');
    
    // Collect configuration
    await this.collectCloudUrl();
    await this.collectToken();
    await this.collectPropertyId();
    await this.collectPort();
    await this.collectDataDir();
    
    // Test connection
    console.log('');
    console.log('Testing cloud connection...');
    const connected = await this.testConnection();
    
    if (!connected) {
      const proceed = await this.askYesNo('Continue anyway? (y/n): ');
      if (!proceed) {
        console.log('Setup cancelled.');
        this.close();
        return;
      }
    }
    
    // Save configuration
    console.log('');
    this.saveConfig();
    
    // Offer service installation
    console.log('');
    const installService = await this.askYesNo('Install as system service? (y/n): ');
    
    if (installService) {
      await this.installService();
    }
    
    // Done
    console.log('');
    console.log('='.repeat(60));
    console.log('  Setup Complete!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Configuration saved to: config.json');
    console.log('');
    
    if (!installService) {
      console.log('To start the Service Host manually:');
      console.log('  npm start');
      console.log('');
    }
    
    console.log('The Service Host will be available at:');
    console.log(`  http://localhost:${this.config.port}`);
    console.log('');
    console.log('Workstations can connect to this address when offline.');
    console.log('');
    
    this.close();
  }
  
  checkPrerequisites() {
    console.log('Checking prerequisites...');
    console.log('');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    
    if (major < 18) {
      console.log(`  Node.js: ${nodeVersion} (FAIL - requires 18 or later)`);
      console.log('');
      console.log('Please install Node.js 18 or later from https://nodejs.org');
      return false;
    }
    
    console.log(`  Node.js: ${nodeVersion} (OK)`);
    
    // Check npm
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`  npm: v${npmVersion} (OK)`);
    } catch {
      console.log('  npm: Not found (FAIL)');
      return false;
    }
    
    // Check if dependencies are installed
    const nodeModules = path.join(ROOT, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
      console.log('  Dependencies: Not installed');
      console.log('');
      console.log('Installing dependencies...');
      try {
        execSync('npm install --production', { cwd: ROOT, stdio: 'inherit' });
        console.log('  Dependencies: Installed (OK)');
      } catch {
        console.log('  Dependencies: Failed to install');
        return false;
      }
    } else {
      console.log('  Dependencies: Installed (OK)');
    }
    
    console.log('');
    console.log('All prerequisites met!');
    console.log('');
    
    return true;
  }
  
  async collectCloudUrl() {
    this.config.cloudUrl = await this.ask(
      'Cloud URL (e.g., https://your-pos.replit.app): '
    );
    
    // Ensure no trailing slash
    this.config.cloudUrl = this.config.cloudUrl.replace(/\/+$/, '');
  }
  
  async collectToken() {
    console.log('');
    console.log('The Service Host token is generated in the EMC:');
    console.log('  EMC → System → Service Hosts → Add Service Host');
    console.log('');
    
    this.config.token = await this.ask('Service Host Token: ');
  }
  
  async collectPropertyId() {
    console.log('');
    console.log('Enter the Property ID this Service Host will serve.');
    console.log('You can find this in EMC → Properties.');
    console.log('');
    
    this.config.propertyId = await this.ask('Property ID: ');
  }
  
  async collectPort() {
    console.log('');
    const portStr = await this.ask(`Port (default: ${this.config.port}): `);
    
    if (portStr) {
      const port = parseInt(portStr, 10);
      if (port > 0 && port < 65536) {
        this.config.port = port;
      }
    }
  }
  
  async collectDataDir() {
    console.log('');
    console.log('Data directory stores the local database and logs.');
    console.log(`Default: ${this.config.dataDir}`);
    console.log('');
    
    const dataDir = await this.ask('Data directory (press Enter for default): ');
    
    if (dataDir) {
      this.config.dataDir = path.resolve(dataDir);
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }
  }
  
  async testConnection() {
    try {
      const https = require('https');
      const http = require('http');
      
      const url = new URL(`${this.config.cloudUrl}/health`);
      const client = url.protocol === 'https:' ? https : http;
      
      return new Promise((resolve) => {
        const req = client.get(url, { timeout: 10000 }, (res) => {
          if (res.statusCode === 200) {
            console.log('  Cloud connection: OK');
            resolve(true);
          } else {
            console.log(`  Cloud connection: Failed (HTTP ${res.statusCode})`);
            resolve(false);
          }
        });
        
        req.on('error', (e) => {
          console.log(`  Cloud connection: Failed (${e.message})`);
          resolve(false);
        });
        
        req.on('timeout', () => {
          req.destroy();
          console.log('  Cloud connection: Failed (timeout)');
          resolve(false);
        });
      });
    } catch (e) {
      console.log(`  Cloud connection: Failed (${e.message})`);
      return false;
    }
  }
  
  saveConfig() {
    console.log('Saving configuration...');
    
    const configContent = JSON.stringify(this.config, null, 2);
    fs.writeFileSync(CONFIG_PATH, configContent);
    
    console.log('Configuration saved!');
  }
  
  async installService() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      console.log('');
      console.log('Installing Windows Service...');
      console.log('Note: This requires administrator privileges.');
      console.log('');
      
      try {
        const serviceScript = path.join(__dirname, 'service-wrappers', 'windows-service.js');
        execSync(`node "${serviceScript}" install`, { stdio: 'inherit' });
        
        const startNow = await this.askYesNo('Start the service now? (y/n): ');
        if (startNow) {
          execSync(`node "${serviceScript}" start`, { stdio: 'inherit' });
        }
      } catch (e) {
        console.log('Service installation failed. You may need to run as administrator.');
        console.log('You can install manually later with:');
        console.log('  node scripts/service-wrappers/windows-service.js install');
      }
    } else if (platform === 'linux') {
      console.log('');
      console.log('To install as a systemd service:');
      console.log('');
      console.log('  1. Copy the service file:');
      console.log('     sudo cp cloud-pos-service-host.service /etc/systemd/system/');
      console.log('');
      console.log('  2. Edit the paths in the service file if needed');
      console.log('');
      console.log('  3. Enable and start:');
      console.log('     sudo systemctl enable cloud-pos-service-host');
      console.log('     sudo systemctl start cloud-pos-service-host');
      console.log('');
    } else if (platform === 'darwin') {
      console.log('');
      console.log('To install as a macOS Launch Daemon:');
      console.log('');
      console.log('  A launchd plist file will be created for you.');
      console.log('  Run: sudo launchctl load /Library/LaunchDaemons/com.cloudpos.servicehost.plist');
      console.log('');
      
      this.createMacOSLaunchDaemon();
    }
  }
  
  createMacOSLaunchDaemon() {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudpos.servicehost</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${path.join(ROOT, 'dist', 'index.js')}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${ROOT}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(this.config.dataDir, 'service.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(this.config.dataDir, 'service-error.log')}</string>
</dict>
</plist>`;

    const plistPath = path.join(ROOT, 'com.cloudpos.servicehost.plist');
    fs.writeFileSync(plistPath, plist);
    console.log(`Launch daemon plist created: ${plistPath}`);
  }
  
  ask(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }
  
  askYesNo(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }
  
  close() {
    this.rl.close();
  }
}

// Main
const wizard = new SetupWizard();
wizard.run().catch((e) => {
  console.error('Setup failed:', e);
  process.exit(1);
});
