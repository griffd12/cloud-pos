const { app, BrowserWindow, Menu, ipcMain, shell, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { EMVTerminalManager } = require('./emv-terminal.cjs');
const { PrintAgentService } = require('./print-agent-service.cjs');
const { OfflineDatabase } = require('./offline-database.cjs');
const { OfflineApiInterceptor } = require('./offline-api-interceptor.cjs');

let mainWindow = null;
let appMode = 'pos';
let isKiosk = false;
let offlineDb = null;
let enhancedOfflineDb = null;
let offlineInterceptor = null;
let printAgent = null;
let syncInterval = null;
let isOnline = true;
let emvManager = null;
let dataSyncInterval = null;

const CONFIG_DIR = path.join(app.getPath('userData'), 'config');
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const OFFLINE_DB_PATH = path.join(DATA_DIR, 'offline.db');
const CONFIG_PATH = path.join(CONFIG_DIR, 'settings.json');

function ensureDirectories() {
  [CONFIG_DIR, DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e.message);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e.message);
  }
}

const DEFAULT_SERVER_URL = 'https://bf45f44b-03bc-427b-ac1c-2f61e2b72052-00-3jaa279qam2p9.janeway.replit.dev';

function getServerUrl() {
  const config = loadConfig();
  return process.env.ELECTRON_SERVER_URL || config.serverUrl || DEFAULT_SERVER_URL;
}

function parseArgs() {
  const args = process.argv.slice(1);
  args.forEach(arg => {
    if (arg === '--pos') appMode = 'pos';
    if (arg === '--kds') appMode = 'kds';
    if (arg === '--kiosk') isKiosk = true;
    if (arg.startsWith('--server=')) {
      const url = arg.split('=')[1];
      if (url) {
        const config = loadConfig();
        config.serverUrl = url;
        saveConfig(config);
      }
    }
  });

  const config = loadConfig();
  if (config.mode) appMode = config.mode;
  if (config.kiosk) isKiosk = config.kiosk;
}

function initOfflineDatabase() {
  try {
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch (e) {
      console.warn('better-sqlite3 not available, offline storage will use JSON files');
      return initJsonOfflineStorage();
    }

    offlineDb = new Database(OFFLINE_DB_PATH);
    offlineDb.pragma('journal_mode = WAL');

    offlineDb.exec(`
      CREATE TABLE IF NOT EXISTS offline_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT DEFAULT 'POST',
        body TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0,
        synced_at TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_checks (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_payments (
        id TEXT PRIMARY KEY,
        check_id TEXT,
        amount INTEGER,
        method TEXT,
        terminal_response TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS cached_data (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    console.log('Offline SQLite database initialized at:', OFFLINE_DB_PATH);
    return true;
  } catch (e) {
    console.error('Failed to init offline database:', e.message);
    return initJsonOfflineStorage();
  }
}

function initJsonOfflineStorage() {
  const queuePath = path.join(DATA_DIR, 'offline_queue.json');
  const cachePath = path.join(DATA_DIR, 'cached_data.json');
  if (!fs.existsSync(queuePath)) fs.writeFileSync(queuePath, '[]');
  if (!fs.existsSync(cachePath)) fs.writeFileSync(cachePath, '{}');
  console.log('Using JSON-based offline storage at:', DATA_DIR);
  return true;
}

function queueOfflineOperation(type, endpoint, method, body) {
  try {
    if (offlineDb) {
      offlineDb.prepare(
        'INSERT INTO offline_queue (type, endpoint, method, body) VALUES (?, ?, ?, ?)'
      ).run(type, endpoint, method, JSON.stringify(body));
    } else {
      const queuePath = path.join(DATA_DIR, 'offline_queue.json');
      const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      queue.push({
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        type, endpoint, method,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        created_at: new Date().toISOString(),
        synced: false
      });
      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    }
  } catch (e) {
    console.error('Failed to queue offline operation:', e.message);
  }
}

function getPendingOperations() {
  try {
    if (offlineDb) {
      return offlineDb.prepare('SELECT * FROM offline_queue WHERE synced = 0 ORDER BY created_at').all();
    } else {
      const queuePath = path.join(DATA_DIR, 'offline_queue.json');
      const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      return queue.filter(op => !op.synced);
    }
  } catch (e) {
    console.error('Failed to get pending operations:', e.message);
    return [];
  }
}

function markOperationSynced(id) {
  try {
    if (offlineDb) {
      offlineDb.prepare("UPDATE offline_queue SET synced = 1, synced_at = datetime('now') WHERE id = ?").run(id);
    } else {
      const queuePath = path.join(DATA_DIR, 'offline_queue.json');
      const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      const op = queue.find(o => o.id === id || o.created_at === id);
      if (op) op.synced = true;
      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    }
  } catch (e) {
    console.error('Failed to mark operation synced:', e.message);
  }
}

async function syncOfflineData() {
  if (!isOnline) return;
  const pending = getPendingOperations();
  if (pending.length === 0) return;

  console.log(`Syncing ${pending.length} offline operations...`);
  const serverUrl = getServerUrl();

  for (const op of pending) {
    try {
      const response = await fetch(`${serverUrl}${op.endpoint}`, {
        method: op.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: op.body,
      });

      if (response.ok) {
        markOperationSynced(op.id || op.created_at);
        console.log(`Synced: ${op.type} -> ${op.endpoint}`);
      } else {
        console.warn(`Sync failed for ${op.endpoint}: ${response.status}`);
      }
    } catch (e) {
      console.warn(`Sync error for ${op.endpoint}: ${e.message}`);
      break;
    }
  }

  if (mainWindow) {
    mainWindow.webContents.send('sync-status', {
      pending: getPendingOperations().length,
      lastSync: new Date().toISOString(),
    });
  }
}

async function checkConnectivity() {
  try {
    const serverUrl = getServerUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${serverUrl}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const wasOffline = !isOnline;
    isOnline = response.ok;

    if (offlineInterceptor) {
      offlineInterceptor.setOffline(!isOnline);
    }

    if (wasOffline && isOnline) {
      console.log('Connection restored, syncing offline data...');
      syncOfflineData();
      if (enhancedOfflineDb) {
        enhancedOfflineDb.syncToCloud(serverUrl).then(result => {
          console.log(`[OfflineDB] Cloud sync: ${result.synced} synced, ${result.failed} failed`);
        }).catch(e => {
          console.warn('[OfflineDB] Cloud sync error:', e.message);
        });
      }
    }
  } catch (e) {
    isOnline = false;
    if (offlineInterceptor) {
      offlineInterceptor.setOffline(true);
    }
  }

  if (mainWindow) {
    mainWindow.webContents.send('online-status', isOnline);
  }
}

function createWindow() {
  const config = loadConfig();
  const needsSetup = !config.setupComplete;

  const windowConfig = {
    width: needsSetup ? 620 : 1280,
    height: needsSetup ? 640 : 1024,
    minWidth: needsSetup ? 580 : 1024,
    minHeight: needsSetup ? 500 : 768,
    title: needsSetup ? 'Cloud POS - Terminal Setup' : (appMode === 'kds' ? 'Cloud POS - Kitchen Display' : 'Cloud POS'),
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: needsSetup
        ? path.join(__dirname, 'setup-wizard-preload.cjs')
        : path.join(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
    fullscreenable: !needsSetup,
    backgroundColor: '#0f1729',
    kiosk: needsSetup ? false : isKiosk,
    fullscreen: needsSetup ? false : isKiosk,
    resizable: true,
  };

  mainWindow = new BrowserWindow(windowConfig);

  if (needsSetup) {
    mainWindow.loadFile(path.join(__dirname, 'setup-wizard.html'));
  } else {
    const serverUrl = getServerUrl();
    const startPath = appMode === 'kds' ? '/kds' : '/pos';
    mainWindow.loadURL(`${serverUrl}${startPath}`);
  }

  if (process.env.NODE_ENV !== 'production' && !isKiosk) {
    const menuTemplate = [
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          {
            label: 'Toggle Fullscreen',
            accelerator: 'F11',
            click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()),
          },
        ],
      },
      {
        label: 'Mode',
        submenu: [
          {
            label: 'POS Mode',
            type: 'radio',
            checked: appMode === 'pos',
            click: () => switchMode('pos'),
          },
          {
            label: 'KDS Mode',
            type: 'radio',
            checked: appMode === 'kds',
            click: () => switchMode('kds'),
          },
        ],
      },
      {
        label: 'Settings',
        submenu: [
          {
            label: 'Configure Server URL...',
            click: () => showServerConfig(),
          },
          {
            label: 'Reconfigure Terminal...',
            click: async () => {
              const result = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'Reconfigure Terminal',
                message: 'This will open the Terminal Setup Wizard to change the enterprise, property, or device assignment.\n\nContinue?',
                buttons: ['Cancel', 'Reconfigure'],
                defaultId: 0,
              });
              if (result.response === 1) {
                const cfg = loadConfig();
                cfg.setupComplete = false;
                saveConfig(cfg);
                app.relaunch();
                app.exit(0);
              }
            },
          },
          {
            label: 'Toggle Kiosk Mode',
            click: () => {
              isKiosk = !isKiosk;
              mainWindow.setKiosk(isKiosk);
              const config = loadConfig();
              config.kiosk = isKiosk;
              saveConfig(config);
            },
          },
          { type: 'separator' },
          {
            label: 'Clear Browser Data',
            click: async () => {
              const result = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'Clear Browser Data',
                message: 'This will clear saved login sessions and enterprise selection. You will need to log in again.\n\nContinue?',
                buttons: ['Cancel', 'Clear'],
                defaultId: 0,
              });
              if (result.response === 1) {
                await mainWindow.webContents.session.clearStorageData();
                const startPath = appMode === 'kds' ? '/kds' : '/pos';
                mainWindow.loadURL(`${getServerUrl()}${startPath}`);
              }
            },
          },
          {
            label: 'Reset Everything...',
            click: () => resetAllData(),
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  } else {
    Menu.setApplicationMenu(null);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentURL = mainWindow.webContents.getURL();
    try {
      const currentOrigin = new URL(currentURL).origin;
      const newOrigin = new URL(url).origin;
      if (currentOrigin !== newOrigin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch (e) {
      // ignore invalid URLs
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Page load failed: ${errorDescription} (${errorCode})`);
    if (errorCode === -106 || errorCode === -105 || errorCode === -2) {
      isOnline = false;
      mainWindow.loadFile(path.join(__dirname, 'offline.html'));
    }
  });
}

function switchMode(mode) {
  appMode = mode;
  const config = loadConfig();
  config.mode = mode;
  saveConfig(config);
  const serverUrl = getServerUrl();
  const startPath = mode === 'kds' ? '/kds' : '/pos';
  mainWindow.loadURL(`${serverUrl}${startPath}`);
}

async function showServerConfig() {
  const config = loadConfig();
  const currentUrl = getServerUrl();

  const { response, returnValue } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Server Configuration',
    message: `Current server:\n${currentUrl}\n\nCurrent mode: ${appMode.toUpperCase()}`,
    detail: 'Choose an action below:',
    buttons: ['Cancel', 'Change Server URL', 'Reset to Default'],
    defaultId: 0,
    cancelId: 0,
  });

  if (response === 1) {
    const newUrlWin = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 460,
      height: 200,
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'settings-preload.cjs'),
      },
    });
    newUrlWin.setMenuBarVisibility(false);

    ipcMain.handleOnce('settings-get-data', () => ({
      currentUrl,
      defaultUrl: DEFAULT_SERVER_URL,
      mode: appMode,
    }));

    ipcMain.once('settings-save-url', (event, newUrl) => {
      if (newUrl && newUrl.trim()) {
        const cleanUrl = newUrl.trim().replace(/\/+$/, '');
        config.serverUrl = cleanUrl;
        saveConfig(config);
        const startPath = appMode === 'kds' ? '/kds' : '/pos';
        mainWindow.loadURL(`${cleanUrl}${startPath}`);
      }
      newUrlWin.close();
    });

    newUrlWin.on('closed', () => {
      ipcMain.removeHandler('settings-get-data');
      ipcMain.removeAllListeners('settings-save-url');
    });

    newUrlWin.loadFile(path.join(__dirname, 'settings-url.html'));
  } else if (response === 2) {
    delete config.serverUrl;
    saveConfig(config);
    const startPath = appMode === 'kds' ? '/kds' : '/pos';
    mainWindow.loadURL(`${getServerUrl()}${startPath}`);
  }
}

async function resetAllData() {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Reset Application',
    message: 'This will clear all saved settings, cached data, offline transactions, and stored credentials. The app will restart fresh.\n\nAre you sure?',
    buttons: ['Cancel', 'Reset Everything'],
    defaultId: 0,
    cancelId: 0,
  });

  if (result.response === 1) {
    try {
      await mainWindow.webContents.session.clearStorageData();

      saveConfig({});

      if (offlineDb) {
        try {
          offlineDb.exec('DELETE FROM cached_data');
          offlineDb.exec('DELETE FROM offline_queue');
          offlineDb.exec('DELETE FROM offline_payments');
          offlineDb.exec('DELETE FROM offline_checks');
        } catch (e) {
          console.warn('Some offline tables may not exist:', e.message);
        }
      }

      const jsonResets = { 'cached_data.json': '{}', 'offline_queue.json': '[]' };
      Object.entries(jsonResets).forEach(([file, empty]) => {
        const filePath = path.join(DATA_DIR, file);
        if (fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, empty);
        }
      });

      app.relaunch();
      app.exit(0);
    } catch (e) {
      console.error('Reset failed:', e.message);
      dialog.showErrorBox('Reset Failed', 'Could not reset application data: ' + e.message);
    }
  }
}

function sendRawToPrinter(address, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Printer connection timed out'));
    }, 10000);

    client.connect(port || 9100, address, () => {
      client.write(Buffer.from(data), (err) => {
        clearTimeout(timeout);
        if (err) {
          client.destroy();
          reject(err);
        } else {
          client.end();
          resolve({ success: true });
        }
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    client.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

function setupIpcHandlers() {
  ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });

  ipcMain.handle('get-app-info', () => {
    const config = loadConfig();
    return {
      mode: appMode,
      isKiosk,
      isOnline,
      serverUrl: getServerUrl(),
      platform: process.platform,
      version: app.getVersion(),
      dataDir: DATA_DIR,
      pendingSync: getPendingOperations().length,
      enterpriseId: config.enterpriseId || null,
      enterpriseName: config.enterpriseName || null,
      propertyId: config.propertyId || null,
      propertyName: config.propertyName || null,
      rvcId: config.rvcId || null,
      rvcName: config.rvcName || null,
      deviceId: config.deviceId || null,
      deviceName: config.deviceName || null,
      deviceType: config.deviceType || null,
      setupComplete: config.setupComplete || false,
    };
  });

  ipcMain.handle('get-online-status', () => isOnline);

  ipcMain.handle('print-raw', async (event, { address, port, data }) => {
    try {
      const result = await sendRawToPrinter(address, port || 9100, data);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('print-escpos', async (event, { address, port, commands }) => {
    try {
      const buffer = buildEscPosBuffer(commands);
      const result = await sendRawToPrinter(address, port || 9100, buffer);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-local-printers', async () => {
    try {
      if (mainWindow) {
        const printers = await mainWindow.webContents.getPrintersAsync();
        return printers.map(p => ({
          name: p.name,
          displayName: p.displayName,
          status: p.status,
          isDefault: p.isDefault,
        }));
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('print-to-system-printer', async (event, { printerName, data, options }) => {
    try {
      if (!mainWindow) return { success: false, error: 'No window available' };
      mainWindow.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: printerName || undefined,
        ...options,
      }, (success, errorType) => {
        // callback-based, can't easily return
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('queue-offline-operation', async (event, { type, endpoint, method, body }) => {
    queueOfflineOperation(type, endpoint, method, body);
    return { success: true, pending: getPendingOperations().length };
  });

  ipcMain.handle('get-pending-sync-count', () => getPendingOperations().length);

  ipcMain.handle('force-sync', async () => {
    await syncOfflineData();
    return { pending: getPendingOperations().length };
  });

  ipcMain.handle('cache-data', async (event, { key, data }) => {
    try {
      if (offlineDb) {
        offlineDb.prepare(
          "INSERT OR REPLACE INTO cached_data (key, data, updated_at) VALUES (?, ?, datetime('now'))"
        ).run(key, JSON.stringify(data));
      } else {
        const cachePath = path.join(DATA_DIR, 'cached_data.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        cache[key] = { data, updated_at: new Date().toISOString() };
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-cached-data', async (event, { key }) => {
    try {
      if (offlineDb) {
        const row = offlineDb.prepare('SELECT data FROM cached_data WHERE key = ?').get(key);
        return row ? JSON.parse(row.data) : null;
      } else {
        const cachePath = path.join(DATA_DIR, 'cached_data.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        return cache[key]?.data || null;
      }
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('set-mode', async (event, mode) => {
    switchMode(mode);
    return { success: true, mode };
  });

  ipcMain.handle('set-server-url', async (event, url) => {
    const config = loadConfig();
    config.serverUrl = url;
    saveConfig(config);
    return { success: true };
  });

  ipcMain.handle('set-auto-launch', async (event, enable) => {
    const config = loadConfig();
    config.autoLaunch = enable;
    saveConfig(config);
    setupAutoLaunch(enable);
    return { success: true };
  });

  // === Print Agent IPC Handlers ===
  ipcMain.handle('print-agent-get-status', async () => {
    if (!printAgent) return { isRunning: false };
    return printAgent.getStatus();
  });

  ipcMain.handle('print-agent-start', async () => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    printAgent.start();
    return { success: true };
  });

  ipcMain.handle('print-agent-stop', async () => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    printAgent.stop();
    return { success: true };
  });

  ipcMain.handle('print-agent-add-printer', async (event, config) => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    printAgent.addPrinter(config);
    return { success: true };
  });

  ipcMain.handle('print-agent-remove-printer', async (event, key) => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    printAgent.removePrinter(key);
    return { success: true };
  });

  ipcMain.handle('print-agent-get-printers', async () => {
    if (!printAgent) return [];
    return printAgent.getPrinters();
  });

  ipcMain.handle('print-agent-configure', async (event, config) => {
    const appConfig = loadConfig();
    if (config.agentId) appConfig.printAgentId = config.agentId;
    if (config.agentToken) appConfig.printAgentToken = config.agentToken;
    saveConfig(appConfig);

    if (printAgent) {
      if (config.agentId) printAgent.agentId = config.agentId;
      if (config.agentToken) printAgent.agentToken = config.agentToken;
      printAgent.stop();
      printAgent.start();
    }
    return { success: true };
  });

  ipcMain.handle('print-agent-test-printer', async (event, { ipAddress, port }) => {
    try {
      const testData = Buffer.from([0x1B, 0x40, 0x1B, 0x61, 0x01]); // init + center
      const text = Buffer.from('*** PRINT TEST ***\nCloud POS Print Agent\nPrinter Connected OK\n\n\n', 'utf-8');
      const cut = Buffer.from([0x1D, 0x56, 0x01]); // partial cut
      const fullData = Buffer.concat([testData, text, cut]);

      await printAgent.sendToPrinter(ipAddress, port || 9100, fullData);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('print-agent-local-print', async (event, { printerIp, printerPort, data, printerId }) => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    const jobId = printAgent.queueLocalPrintJob({
      printerIp,
      printerPort: printerPort || 9100,
      data,
      printerId,
    });
    return { success: true, jobId };
  });

  // === Enhanced Offline Database IPC Handlers ===
  ipcMain.handle('offline-db-sync', async (event, { enterpriseId, propertyId, rvcId }) => {
    if (!enhancedOfflineDb) return { success: false, error: 'Offline DB not initialized' };
    const serverUrl = getServerUrl();
    const result = await enhancedOfflineDb.syncFromCloud(serverUrl, enterpriseId, propertyId, rvcId);
    return result;
  });

  ipcMain.handle('offline-db-get-stats', async () => {
    if (!enhancedOfflineDb) return {};
    return enhancedOfflineDb.getStats();
  });

  ipcMain.handle('offline-db-get-entity', async (event, { table, id }) => {
    if (!enhancedOfflineDb) return null;
    return enhancedOfflineDb.getEntity(table, id);
  });

  ipcMain.handle('offline-db-get-entity-list', async (event, { table, enterpriseId }) => {
    if (!enhancedOfflineDb) return [];
    return enhancedOfflineDb.getEntityList(table, enterpriseId);
  });

  ipcMain.handle('offline-db-get-sales-data', async (event, { businessDate, rvcId }) => {
    if (!enhancedOfflineDb) return null;
    return enhancedOfflineDb.getLocalSalesData(businessDate, rvcId);
  });

  ipcMain.handle('offline-db-sync-to-cloud', async () => {
    if (!enhancedOfflineDb) return { synced: 0, failed: 0 };
    const serverUrl = getServerUrl();
    return enhancedOfflineDb.syncToCloud(serverUrl);
  });

  ipcMain.handle('offline-db-get-checks', async (event, { rvcId, status }) => {
    if (!enhancedOfflineDb) return [];
    return enhancedOfflineDb.getOfflineChecks(rvcId, status);
  });

  ipcMain.handle('offline-db-save-check', async (event, check) => {
    if (!enhancedOfflineDb) return { success: false };
    enhancedOfflineDb.saveOfflineCheck(check);
    return { success: true };
  });

  ipcMain.handle('get-offline-mode', async () => {
    return {
      isOffline: !isOnline,
      lastSync: enhancedOfflineDb?.getSyncMetadata('lastFullSync'),
      pendingOps: enhancedOfflineDb?.getPendingOperations().length || 0,
      stats: enhancedOfflineDb?.getStats() || {},
    };
  });

  ipcMain.handle('emv-send-payment', async (event, { address, port, amount, transactionType, timeout }) => {
    if (!emvManager) return { success: false, error: 'EMV manager not initialized' };
    try {
      const result = await emvManager.sendPaymentToTerminal({ address, port, amount, transactionType, timeout });
      if (result.approved) {
        emvManager.storeOfflinePayment({
          amount,
          transactionType,
          authCode: result.authCode,
          transactionId: result.transactionId,
          cardType: result.cardType,
          lastFour: result.lastFour,
          entryMethod: result.entryMethod,
          tipAmount: result.tipAmount,
          approved: true,
        });
      }
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('emv-cancel', async (event, { address, port }) => {
    if (!emvManager) return { success: false, error: 'EMV manager not initialized' };
    return emvManager.cancelTerminalAction(address, port);
  });

  ipcMain.handle('emv-get-pending-payments', async () => {
    if (!emvManager) return [];
    return emvManager.getPendingPayments();
  });

  ipcMain.handle('emv-mark-payment-synced', async (event, { id }) => {
    if (!emvManager) return { success: false };
    emvManager.markPaymentSynced(id);
    return { success: true };
  });

  // === Setup Wizard IPC Handlers ===
  ipcMain.handle('wizard-test-connection', async (event, url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${url}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        return { success: true };
      }
      return { success: false, error: `Server responded with status ${response.status}` };
    } catch (e) {
      return { success: false, error: e.name === 'AbortError' ? 'Connection timed out' : e.message };
    }
  });

  ipcMain.handle('wizard-fetch-enterprises', async (event, serverUrl) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/enterprises`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-fetch-properties', async (event, serverUrl, enterpriseId) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/properties?enterpriseId=${enterpriseId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-fetch-devices', async (event, serverUrl, enterpriseId, propertyId, mode) => {
    try {
      const endpoint = mode === 'kds' ? 'kds-devices' : 'workstations';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/${endpoint}?propertyId=${propertyId}&enterpriseId=${enterpriseId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-fetch-rvcs', async (event, serverUrl, propertyId) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/rvcs?propertyId=${propertyId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-save-config', async (event, wizardConfig) => {
    try {
      const config = loadConfig();
      config.serverUrl = wizardConfig.serverUrl;
      config.enterpriseId = wizardConfig.enterpriseId;
      config.enterpriseName = wizardConfig.enterpriseName;
      config.enterpriseCode = wizardConfig.enterpriseCode;
      config.propertyId = wizardConfig.propertyId;
      config.propertyName = wizardConfig.propertyName;
      config.rvcId = wizardConfig.rvcId;
      config.rvcName = wizardConfig.rvcName;
      config.mode = wizardConfig.mode;
      config.deviceId = wizardConfig.deviceId;
      config.deviceName = wizardConfig.deviceName;
      config.deviceType = wizardConfig.deviceType;
      config.setupComplete = true;
      config.setupDate = wizardConfig.setupDate;
      saveConfig(config);
      appMode = wizardConfig.mode;
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-get-existing-config', async () => {
    return loadConfig();
  });

  ipcMain.on('wizard-launch-app', () => {
    const config = loadConfig();
    if (mainWindow) {
      mainWindow.close();
      mainWindow = null;
    }

    const windowConfig = {
      width: 1280,
      height: 1024,
      minWidth: 1024,
      minHeight: 768,
      title: appMode === 'kds' ? 'Cloud POS - Kitchen Display' : 'Cloud POS',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, 'preload.cjs'),
      },
      autoHideMenuBar: true,
      fullscreenable: true,
      backgroundColor: '#0f1729',
      kiosk: isKiosk,
      fullscreen: isKiosk,
    };

    mainWindow = new BrowserWindow(windowConfig);

    const serverUrl = config.serverUrl || getServerUrl();
    const startPath = appMode === 'kds' ? '/kds' : '/pos';
    mainWindow.loadURL(`${serverUrl}${startPath}`);

    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`Page load failed: ${errorDescription} (${errorCode})`);
      if (errorCode === -106 || errorCode === -105 || errorCode === -2) {
        isOnline = false;
        mainWindow.loadFile(path.join(__dirname, 'offline.html'));
      }
    });

    if (enhancedOfflineDb) {
      performInitialDataSync().catch(e => {
        console.warn('[OfflineDB] Post-wizard sync failed:', e.message);
      });
    }
  });
}

function buildEscPosBuffer(commands) {
  const parts = [];
  const ESC = 0x1B;
  const GS = 0x1D;
  const LF = 0x0A;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'init':
        parts.push(Buffer.from([ESC, 0x40]));
        break;
      case 'text':
        parts.push(Buffer.from(cmd.value, 'utf-8'));
        break;
      case 'newline':
        parts.push(Buffer.from([LF]));
        break;
      case 'cut':
        parts.push(Buffer.from([GS, 0x56, 0x00]));
        break;
      case 'partial-cut':
        parts.push(Buffer.from([GS, 0x56, 0x01]));
        break;
      case 'bold-on':
        parts.push(Buffer.from([ESC, 0x45, 0x01]));
        break;
      case 'bold-off':
        parts.push(Buffer.from([ESC, 0x45, 0x00]));
        break;
      case 'align-left':
        parts.push(Buffer.from([ESC, 0x61, 0x00]));
        break;
      case 'align-center':
        parts.push(Buffer.from([ESC, 0x61, 0x01]));
        break;
      case 'align-right':
        parts.push(Buffer.from([ESC, 0x61, 0x02]));
        break;
      case 'double-height':
        parts.push(Buffer.from([ESC, 0x21, 0x10]));
        break;
      case 'double-width':
        parts.push(Buffer.from([ESC, 0x21, 0x20]));
        break;
      case 'double-size':
        parts.push(Buffer.from([ESC, 0x21, 0x30]));
        break;
      case 'normal-size':
        parts.push(Buffer.from([ESC, 0x21, 0x00]));
        break;
      case 'feed':
        const lines = cmd.lines || 1;
        parts.push(Buffer.from([ESC, 0x64, lines]));
        break;
      case 'open-drawer':
        parts.push(Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]));
        break;
      case 'separator':
        parts.push(Buffer.from('-'.repeat(cmd.width || 42), 'utf-8'));
        parts.push(Buffer.from([LF]));
        break;
      case 'raw':
        parts.push(Buffer.from(cmd.bytes));
        break;
    }
  }

  return Buffer.concat(parts);
}

function setupAutoLaunch(enable) {
  if (process.platform !== 'win32') return;
  const appPath = process.execPath;
  const appArgs = appMode === 'kds' ? '--kds' : '--pos';
  const kioskArg = isKiosk ? ' --kiosk' : '';
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const regValue = 'CloudPOS';

  const { execSync } = require('child_process');
  try {
    if (enable) {
      execSync(`reg add "${regKey}" /v "${regValue}" /t REG_SZ /d "\\"${appPath}\\" ${appArgs}${kioskArg}" /f`, { windowsHide: true });
      console.log('Auto-launch enabled');
    } else {
      execSync(`reg delete "${regKey}" /v "${regValue}" /f`, { windowsHide: true });
      console.log('Auto-launch disabled');
    }
  } catch (e) {
    console.warn('Could not set auto-launch:', e.message);
  }
}

function initPrintAgent() {
  const config = loadConfig();
  printAgent = new PrintAgentService({
    serverUrl: getServerUrl(),
    agentId: config.printAgentId || null,
    agentToken: config.printAgentToken || null,
    configDir: CONFIG_DIR,
    dataDir: DATA_DIR,
    heartbeatMs: 30000,
  });

  printAgent.on('status', (status) => {
    if (mainWindow) {
      mainWindow.webContents.send('print-agent-status', status);
    }
    console.log(`[PrintAgent] Status: connected=${status.connected}, auth=${status.authenticated}`);
  });

  printAgent.on('jobCompleted', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('print-agent-job-completed', info);
    }
  });

  printAgent.on('jobFailed', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('print-agent-job-failed', info);
    }
  });

  if (config.printAgentId || config.printAgentToken) {
    printAgent.start();
  } else {
    console.log('[PrintAgent] No agent ID/token configured. Print agent will start after configuration.');
  }
}

async function initEnhancedOfflineDb() {
  enhancedOfflineDb = new OfflineDatabase({
    dataDir: DATA_DIR,
  });
  await enhancedOfflineDb.initialize();

  offlineInterceptor = new OfflineApiInterceptor(enhancedOfflineDb);
  console.log('[OfflineDB] Enhanced offline database initialized');
}

async function performInitialDataSync() {
  const config = loadConfig();
  const enterpriseId = config.enterpriseId;
  const propertyId = config.propertyId;
  const rvcId = config.rvcId;

  if (!enterpriseId) {
    console.log('[OfflineDB] No enterprise configured yet, skipping initial sync');
    return;
  }

  try {
    const serverUrl = getServerUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${serverUrl}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok && enhancedOfflineDb) {
      console.log('[OfflineDB] Cloud reachable, starting initial data sync...');
      const result = await enhancedOfflineDb.syncFromCloud(serverUrl, enterpriseId, propertyId, rvcId);
      console.log(`[OfflineDB] Initial sync: ${result.synced?.length || 0} tables, ${result.errors?.length || 0} errors`);
    }
  } catch (e) {
    console.log('[OfflineDB] Cloud not reachable for initial sync, using cached data');
  }
}

app.whenReady().then(async () => {
  ensureDirectories();
  parseArgs();
  initOfflineDatabase();
  await initEnhancedOfflineDb();
  emvManager = new EMVTerminalManager(DATA_DIR);
  initPrintAgent();
  setupIpcHandlers();

  // Register protocol interceptor for offline API handling
  protocol.interceptHttpProtocol && (() => {
    // Protocol interceptor not needed for external URLs
    // Offline interception happens via IPC from renderer
  })();

  createWindow();

  const config = loadConfig();
  if (config.autoLaunch) {
    setupAutoLaunch(true);
  }

  // Connectivity monitoring
  syncInterval = setInterval(checkConnectivity, 30000);
  checkConnectivity();

  // Sync offline operations every 60 seconds
  const syncTimer = setInterval(syncOfflineData, 60000);

  // Periodic data cache sync every 5 minutes when online
  dataSyncInterval = setInterval(async () => {
    if (isOnline && enhancedOfflineDb) {
      const cfg = loadConfig();
      if (cfg.enterpriseId) {
        try {
          await enhancedOfflineDb.syncFromCloud(getServerUrl(), cfg.enterpriseId, cfg.propertyId, cfg.rvcId);
        } catch (e) {
          console.warn('[OfflineDB] Periodic sync failed:', e.message);
        }
      }
    }
  }, 300000);

  // Initial data sync
  await performInitialDataSync();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (syncInterval) clearInterval(syncInterval);
  if (dataSyncInterval) clearInterval(dataSyncInterval);
  if (printAgent) {
    printAgent.stop();
  }
  if (enhancedOfflineDb) {
    try { enhancedOfflineDb.close(); } catch (e) {}
  }
  if (offlineDb) {
    try { offlineDb.close(); } catch (e) {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navigationEvent, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      const serverUrl = getServerUrl();
      const serverHost = new URL(serverUrl).hostname;
      const trustedHosts = ['localhost', '127.0.0.1', serverHost];
      const trustedDomains = ['repl.co', 'replit.dev', 'replit.app'];

      const isTrusted = trustedHosts.includes(parsedUrl.hostname) ||
        trustedDomains.some(d => parsedUrl.hostname.endsWith('.' + d));

      if (!isTrusted) {
        navigationEvent.preventDefault();
      }
    } catch (e) {
      navigationEvent.preventDefault();
    }
  });
});
