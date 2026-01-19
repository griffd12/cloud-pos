const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { exec, spawn } = require('child_process');
const os = require('os');

let mainWindow;
let logFilePath = null;

const DEFAULT_ROOT_DIR = process.platform === 'win32' ? 'C:\\OPH-POS' : path.join(os.homedir(), 'oph-pos');

function initLogFile(rootDir) {
  const normalizedRoot = path.normalize(rootDir || DEFAULT_ROOT_DIR);
  const logsDir = path.join(normalizedRoot, 'Logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  logFilePath = path.join(logsDir, `setup-wizard-${timestamp}.log`);
  writeLog('INFO', '=== OPH-POS CAL Setup Wizard Started ===');
  writeLog('INFO', `Platform: ${process.platform}, Arch: ${process.arch}`);
  writeLog('INFO', `Hostname: ${os.hostname()}`);
}

function writeLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level}] ${message}`;
  if (data) {
    line += ` | ${JSON.stringify(data)}`;
  }
  console.log(line);
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, line + '\n');
    } catch (e) {
      console.error('Failed to write log:', e);
    }
  }
}
const ALLOWED_ROOT_DIRS = [
  process.platform === 'win32' ? 'C:\\OPH-POS' : path.join(os.homedir(), 'oph-pos'),
  process.platform === 'win32' ? 'D:\\OPH-POS' : '/opt/oph-pos',
];

function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateRootDir(rootDir) {
  if (!rootDir || typeof rootDir !== 'string') return false;
  const normalized = path.normalize(rootDir);
  return ALLOWED_ROOT_DIRS.some(allowed => 
    normalized.toLowerCase().startsWith(allowed.toLowerCase())
  ) || normalized === path.normalize(DEFAULT_ROOT_DIR);
}

function sanitizeServiceName(name) {
  if (!name || typeof name !== 'string') return 'OPH-POS-ServiceHost';
  return name.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 64) || 'OPH-POS-ServiceHost';
}

function sanitizePackageName(name) {
  if (!name || typeof name !== 'string') return null;
  return name.replace(/[^a-zA-Z0-9\-_.]/g, '').substring(0, 128);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: 'OPH-POS CAL Setup Wizard',
    backgroundColor: '#0f172a',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  initLogFile(DEFAULT_ROOT_DIR);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function downloadFile(url, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    if (!validateUrl(url)) {
      return reject(new Error('Invalid URL'));
    }

    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath, progressCallback)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10) || 0;
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (progressCallback && totalSize > 0) {
          progressCallback(Math.round((downloadedSize / totalSize) * 100));
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });

    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

ipcMain.handle('get-system-info', async () => {
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    networkInterfaces: os.networkInterfaces(),
    defaultRootDir: DEFAULT_ROOT_DIR,
  };
});

ipcMain.handle('create-directories', async (event, rootDir) => {
  initLogFile(rootDir);
  writeLog('INFO', 'Creating directories', { rootDir });
  
  if (!validateRootDir(rootDir)) {
    writeLog('ERROR', 'Invalid root directory', { rootDir });
    return [{ path: rootDir, status: 'error', error: 'Invalid root directory. Use default path.' }];
  }

  const normalizedRoot = path.normalize(rootDir);
  const dirs = [
    normalizedRoot,
    path.join(normalizedRoot, 'ServiceHost'),
    path.join(normalizedRoot, 'ServiceHost', 'data'),
    path.join(normalizedRoot, 'ServiceHost', 'logs'),
    path.join(normalizedRoot, 'CalClient'),
    path.join(normalizedRoot, 'CalClient', 'logs'),
    path.join(normalizedRoot, 'Packages'),
    path.join(normalizedRoot, 'PrintAgent'),
    path.join(normalizedRoot, 'Config'),
    path.join(normalizedRoot, 'Logs'),
  ];

  const results = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        results.push({ path: dir, status: 'created' });
        writeLog('INFO', `Created directory: ${dir}`);
      } else {
        results.push({ path: dir, status: 'exists' });
        writeLog('INFO', `Directory exists: ${dir}`);
      }
    } catch (err) {
      results.push({ path: dir, status: 'error', error: err.message });
      writeLog('ERROR', `Failed to create directory: ${dir}`, { error: err.message });
    }
  }
  return results;
});

ipcMain.handle('download-service-host', async (event, cloudUrl, rootDir) => {
  if (!validateUrl(cloudUrl)) {
    return { success: false, error: 'Invalid cloud URL' };
  }
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }

  const serviceHostUrl = `${cloudUrl}/downloads/service-host.exe`;
  const normalizedRoot = path.normalize(rootDir);
  const destPath = path.join(normalizedRoot, 'ServiceHost', 'service-host.exe');
  
  try {
    if (mainWindow) mainWindow.webContents.send('download-progress', 0);
    
    await downloadFile(serviceHostUrl, destPath, (progress) => {
      if (mainWindow) mainWindow.webContents.send('download-progress', progress);
    });
    
    const stats = fs.statSync(destPath);
    if (stats.size < 1000) {
      throw new Error('Downloaded file is too small - likely an error page');
    }
    
    return { success: true, path: destPath, size: stats.size };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-config', async (event, rootDir, config) => {
  writeLog('INFO', 'Saving configuration', { rootDir, deviceName: config?.deviceName, deviceType: config?.deviceType });
  
  if (!validateRootDir(rootDir)) {
    writeLog('ERROR', 'Invalid root directory for config save');
    return { success: false, error: 'Invalid root directory' };
  }
  if (!config || typeof config !== 'object') {
    writeLog('ERROR', 'Invalid configuration object');
    return { success: false, error: 'Invalid configuration' };
  }

  const normalizedRoot = path.normalize(rootDir);
  const configPath = path.join(normalizedRoot, 'Config', 'service-host.json');
  
  try {
    const fullConfig = {
      cloudUrl: config.cloudUrl || '',
      propertyId: config.propertyId || '',
      propertyName: config.propertyName || '',
      deviceId: config.deviceId || '',
      deviceName: config.deviceName || '',
      deviceType: config.deviceType || '',
      deviceToken: config.deviceToken || '',
      registeredDeviceId: config.registeredDeviceId || '',
      rvcId: config.rvcId || null,
      rootDir: normalizedRoot,
      dataDir: path.join(normalizedRoot, 'ServiceHost', 'data'),
      logsDir: path.join(normalizedRoot, 'ServiceHost', 'logs'),
      packagesDir: path.join(normalizedRoot, 'Packages'),
      autoStart: true,
      installedAt: new Date().toISOString(),
    };
    
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
    writeLog('INFO', `Configuration saved to ${configPath}`);
    writeLog('INFO', 'Device credentials', { 
      deviceToken: config.deviceToken ? config.deviceToken.substring(0, 20) + '...' : 'MISSING',
      registeredDeviceId: config.registeredDeviceId || 'MISSING'
    });
    return { success: true, path: configPath };
  } catch (err) {
    writeLog('ERROR', 'Failed to save configuration', { error: err.message });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-log', async (event, level, message, data) => {
  writeLog(level || 'INFO', message, data);
});

ipcMain.handle('start-service-host', async (event, rootDir) => {
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }

  const normalizedRoot = path.normalize(rootDir);
  const exePath = path.join(normalizedRoot, 'ServiceHost', 'service-host.exe');
  const configPath = path.join(normalizedRoot, 'Config', 'service-host.json');
  
  if (!fs.existsSync(exePath)) {
    return { success: false, error: 'Service Host executable not found' };
  }
  
  try {
    const child = spawn(exePath, ['--config', configPath], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(normalizedRoot, 'ServiceHost'),
    });
    child.unref();
    return { success: true, pid: child.pid };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-windows-service', async (event, rootDir, serviceName = 'OPH-POS-ServiceHost') => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows service installation only available on Windows' };
  }
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }
  
  const sanitizedName = sanitizeServiceName(serviceName);
  const normalizedRoot = path.normalize(rootDir);
  const exePath = path.join(normalizedRoot, 'ServiceHost', 'service-host.exe');
  const configPath = path.join(normalizedRoot, 'Config', 'service-host.json');
  
  if (!fs.existsSync(exePath)) {
    return { success: false, error: 'Service Host executable not found' };
  }
  
  return new Promise((resolve) => {
    const cmd = `sc create "${sanitizedName}" binPath= "\\"${exePath}\\" --config \\"${configPath}\\" --service" start= auto`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        if (stderr && stderr.includes('already exists')) {
          resolve({ success: true, message: 'Service already exists' });
        } else {
          resolve({ success: false, error: stderr || error.message });
        }
      } else {
        exec(`sc start "${sanitizedName}"`, (startErr, startOut, startStderr) => {
          if (startErr) {
            resolve({ success: true, message: 'Service installed but not started', startError: startStderr });
          } else {
            resolve({ success: true, message: 'Service installed and started' });
          }
        });
      }
    });
  });
});

ipcMain.handle('download-cal-package', async (event, cloudUrl, packageName, rootDir) => {
  if (!validateUrl(cloudUrl)) {
    return { success: false, error: 'Invalid cloud URL' };
  }
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }
  
  const sanitizedPackage = sanitizePackageName(packageName);
  if (!sanitizedPackage) {
    return { success: false, error: 'Invalid package name' };
  }

  const packageUrl = `${cloudUrl}/api/cal-packages/download/${encodeURIComponent(sanitizedPackage)}`;
  const normalizedRoot = path.normalize(rootDir);
  const destPath = path.join(normalizedRoot, 'Packages', `${sanitizedPackage}.tar.gz`);
  
  try {
    if (mainWindow) mainWindow.webContents.send('download-progress', 0);
    
    await downloadFile(packageUrl, destPath, (progress) => {
      if (mainWindow) mainWindow.webContents.send('download-progress', progress);
    });
    
    return { success: true, path: destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-pos', async (event, posUrl) => {
  if (!validateUrl(posUrl)) {
    return { success: false, error: 'Invalid URL' };
  }
  require('electron').shell.openExternal(posUrl);
  return { success: true };
});

ipcMain.handle('quit-app', async () => {
  app.quit();
});

ipcMain.handle('download-cal-client', async (event, cloudUrl, rootDir) => {
  if (!validateUrl(cloudUrl)) {
    return { success: false, error: 'Invalid cloud URL' };
  }
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }

  const calClientUrl = `${cloudUrl}/downloads/cal-client.exe`;
  const normalizedRoot = path.normalize(rootDir);
  const destPath = path.join(normalizedRoot, 'CalClient', 'cal-client.exe');
  
  try {
    if (mainWindow) mainWindow.webContents.send('download-progress', 0);
    
    await downloadFile(calClientUrl, destPath, (progress) => {
      if (mainWindow) mainWindow.webContents.send('download-progress', progress);
    });
    
    const stats = fs.statSync(destPath);
    if (stats.size < 1000) {
      throw new Error('Downloaded file is too small - likely an error page');
    }
    
    return { success: true, path: destPath, size: stats.size };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-cal-client-config', async (event, rootDir, config) => {
  writeLog('INFO', 'Saving CAL Client configuration', { rootDir });
  
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }
  if (!config || typeof config !== 'object') {
    return { success: false, error: 'Invalid configuration' };
  }

  const normalizedRoot = path.normalize(rootDir);
  const configPath = path.join(normalizedRoot, 'CalClient', 'cal-client-config.json');
  
  try {
    const fullConfig = {
      cloudUrl: config.cloudUrl || '',
      serviceHostUrl: config.serviceHostUrl || null,
      deviceId: config.deviceId || '',
      deviceToken: config.deviceToken || '',
      propertyId: config.propertyId || '',
      calRootDir: normalizedRoot,
      pollIntervalMs: 60000,
      logLevel: 'info',
    };
    
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
    writeLog('INFO', `CAL Client configuration saved to ${configPath}`);
    return { success: true, path: configPath };
  } catch (err) {
    writeLog('ERROR', 'Failed to save CAL Client configuration', { error: err.message });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-cal-client-service', async (event, rootDir, serviceName = 'OPH-POS-CalClient') => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows service installation only available on Windows' };
  }
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }
  
  const sanitizedName = sanitizeServiceName(serviceName);
  const normalizedRoot = path.normalize(rootDir);
  const exePath = path.join(normalizedRoot, 'CalClient', 'cal-client.exe');
  const configPath = path.join(normalizedRoot, 'CalClient', 'cal-client-config.json');
  
  if (!fs.existsSync(exePath)) {
    return { success: false, error: 'CAL Client executable not found' };
  }
  
  return new Promise((resolve) => {
    const cmd = `sc create "${sanitizedName}" binPath= "\\"${exePath}\\" --config \\"${configPath}\\"" start= auto`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        if (stderr && stderr.includes('already exists')) {
          resolve({ success: true, message: 'Service already exists' });
        } else {
          resolve({ success: false, error: stderr || error.message });
        }
      } else {
        exec(`sc start "${sanitizedName}"`, (startErr, startOut, startStderr) => {
          if (startErr) {
            resolve({ success: true, message: 'Service installed but not started', startError: startStderr });
          } else {
            resolve({ success: true, message: 'Service installed and started' });
          }
        });
      }
    });
  });
});

// Download Print Agent software
ipcMain.handle('download-print-agent', async (event, cloudUrl, rootDir) => {
  if (!validateUrl(cloudUrl)) {
    return { success: false, error: 'Invalid cloud URL' };
  }
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }

  const printAgentUrl = `${cloudUrl}/api/print-agents/download`;
  const normalizedRoot = path.normalize(rootDir);
  const destPath = path.join(normalizedRoot, 'PrintAgent', 'print-agent.zip');
  
  try {
    if (mainWindow) mainWindow.webContents.send('download-progress', 0);
    
    await downloadFile(printAgentUrl, destPath, (progress) => {
      if (mainWindow) mainWindow.webContents.send('download-progress', progress);
    });
    
    const stats = fs.statSync(destPath);
    writeLog('INFO', `Print Agent downloaded: ${destPath} (${stats.size} bytes)`);
    
    // Extract the zip file
    const extractDir = path.join(normalizedRoot, 'PrintAgent');
    try {
      const unzipCmd = process.platform === 'win32'
        ? `powershell -command "Expand-Archive -Force -Path '${destPath}' -DestinationPath '${extractDir}'"`
        : `unzip -o "${destPath}" -d "${extractDir}"`;
      
      await new Promise((resolve, reject) => {
        exec(unzipCmd, (err, stdout, stderr) => {
          if (err) {
            writeLog('WARN', `Unzip warning: ${stderr || err.message}`);
          }
          resolve();
        });
      });
      writeLog('INFO', 'Print Agent extracted');
    } catch (extractErr) {
      writeLog('WARN', `Extraction warning: ${extractErr.message}`);
    }
    
    return { success: true, path: extractDir, size: stats.size };
  } catch (err) {
    writeLog('ERROR', `Print Agent download failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Save Print Agent configuration
ipcMain.handle('save-print-agent-config', async (event, rootDir, config) => {
  writeLog('INFO', 'Saving Print Agent configuration', { rootDir, agentName: config?.agentName });
  
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }
  if (!config || typeof config !== 'object') {
    return { success: false, error: 'Invalid configuration' };
  }

  const normalizedRoot = path.normalize(rootDir);
  const configPath = path.join(normalizedRoot, 'PrintAgent', 'config.json');
  
  try {
    const printAgentConfig = {
      server: config.server || '',
      token: config.token || '',
      agentId: config.agentId || '',
      agentName: config.agentName || 'Print Agent',
      reconnectInterval: 5000,
      maxReconnectInterval: 60000,
      heartbeatInterval: 30000,
      printTimeout: 10000,
    };
    
    fs.writeFileSync(configPath, JSON.stringify(printAgentConfig, null, 2));
    writeLog('INFO', `Print Agent configuration saved to ${configPath}`);
    
    return { success: true, path: configPath };
  } catch (err) {
    writeLog('ERROR', 'Failed to save Print Agent configuration', { error: err.message });
    return { success: false, error: err.message };
  }
});

// Start Print Agent as background process
ipcMain.handle('start-print-agent', async (event, rootDir) => {
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }

  const normalizedRoot = path.normalize(rootDir);
  const agentPath = path.join(normalizedRoot, 'PrintAgent', 'print-agent.js');
  const configPath = path.join(normalizedRoot, 'PrintAgent', 'config.json');
  
  if (!fs.existsSync(agentPath)) {
    return { success: false, error: 'Print Agent script not found' };
  }
  
  try {
    const child = spawn('node', [agentPath, '--config', configPath], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(normalizedRoot, 'PrintAgent'),
    });
    child.unref();
    writeLog('INFO', `Print Agent started with PID: ${child.pid}`);
    return { success: true, pid: child.pid };
  } catch (err) {
    writeLog('ERROR', `Failed to start Print Agent: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Save Service Host (CAPS) configuration
ipcMain.handle('save-service-host-config', async (event, rootDir, cloudUrl, config) => {
  writeLog('INFO', 'Saving Service Host configuration', { rootDir, serviceHostId: config?.serviceHostId });
  
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }
  if (!validateUrl(cloudUrl)) {
    return { success: false, error: 'Invalid cloud URL' };
  }
  if (!config || typeof config !== 'object') {
    return { success: false, error: 'Invalid configuration' };
  }

  const normalizedRoot = path.normalize(rootDir);
  const configPath = path.join(normalizedRoot, 'ServiceHost', 'config.json');
  
  try {
    const serviceHostConfig = {
      cloudUrl: cloudUrl,
      serviceHostId: config.serviceHostId || '',
      token: config.serviceHostToken || '',
      propertyId: config.propertyId || '',
      port: config.port || 3001,
      dataDir: config.dataDir || './data',
      services: config.services || ['caps'],
      logLevel: 'info',
      syncIntervalMs: 30000,
      heartbeatIntervalMs: 15000,
    };
    
    fs.writeFileSync(configPath, JSON.stringify(serviceHostConfig, null, 2));
    writeLog('INFO', `Service Host configuration saved to ${configPath}`);
    
    return { success: true, path: configPath };
  } catch (err) {
    writeLog('ERROR', 'Failed to save Service Host configuration', { error: err.message });
    return { success: false, error: err.message };
  }
});

// Download Service Host executable
ipcMain.handle('download-service-host-exe', async (event, cloudUrl, rootDir) => {
  if (!validateUrl(cloudUrl)) {
    return { success: false, error: 'Invalid cloud URL' };
  }
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }

  const serviceHostUrl = `${cloudUrl}/api/service-host/download`;
  const normalizedRoot = path.normalize(rootDir);
  const destPath = path.join(normalizedRoot, 'ServiceHost', 'service-host.exe');
  
  try {
    if (mainWindow) mainWindow.webContents.send('download-progress', 0);
    
    await downloadFile(serviceHostUrl, destPath, (progress) => {
      if (mainWindow) mainWindow.webContents.send('download-progress', progress);
    });
    
    const stats = fs.statSync(destPath);
    writeLog('INFO', `Service Host downloaded: ${destPath} (${stats.size} bytes)`);
    
    return { success: true, path: destPath, size: stats.size };
  } catch (err) {
    writeLog('WARN', `Service Host download skipped: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Save Payment Controller configuration
ipcMain.handle('save-payment-controller-config', async (event, rootDir, config) => {
  writeLog('INFO', 'Saving Payment Controller configuration', { rootDir, gatewayType: config?.gatewayType });
  
  if (!validateRootDir(rootDir)) {
    return { success: false, error: 'Invalid root directory' };
  }
  if (!config || typeof config !== 'object') {
    return { success: false, error: 'Invalid configuration' };
  }

  const normalizedRoot = path.normalize(rootDir);
  const configPath = path.join(normalizedRoot, 'ServiceHost', 'payment-controller.json');
  
  try {
    const paymentConfig = {
      propertyId: config.propertyId || '',
      gatewayType: config.gatewayType || 'stripe',
      enabled: true,
      // Gateway credentials are stored in environment variables on the server
      // This config just tells the controller which gateway to use
    };
    
    fs.writeFileSync(configPath, JSON.stringify(paymentConfig, null, 2));
    writeLog('INFO', `Payment Controller configuration saved to ${configPath}`);
    
    return { success: true, path: configPath };
  } catch (err) {
    writeLog('ERROR', 'Failed to save Payment Controller configuration', { error: err.message });
    return { success: false, error: err.message };
  }
});
