const { app, BrowserWindow, Menu, ipcMain, shell, dialog, protocol, net: electronNet } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { EMVTerminalManager } = require('./emv-terminal.cjs');
const { PrintAgentService } = require('./print-agent-service.cjs');
const { OfflineDatabase } = require('./offline-database.cjs');
const { OfflineApiInterceptor } = require('./offline-api-interceptor.cjs');
const { appLogger, printLogger, LOG_DIR } = require('./logger.cjs');

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
let protocolInterceptorRegistered = false;

const APP_DATA_ROOT = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Cloud POS')
  : app.getPath('userData');
const CONFIG_DIR = path.join(APP_DATA_ROOT, 'config');
const DATA_DIR = path.join(APP_DATA_ROOT, 'data');
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
    appLogger.error('Config', 'Failed to load config', e.message);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    appLogger.error('Config', 'Failed to save config', e.message);
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
      appLogger.warn('OfflineDB', 'better-sqlite3 not available, using JSON file storage');
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

    appLogger.info('OfflineDB', 'SQLite database initialized', { path: OFFLINE_DB_PATH });
    return true;
  } catch (e) {
    appLogger.error('OfflineDB', 'SQLite init failed', e.message);
    return initJsonOfflineStorage();
  }
}

function initJsonOfflineStorage() {
  const queuePath = path.join(DATA_DIR, 'offline_queue.json');
  const cachePath = path.join(DATA_DIR, 'cached_data.json');
  if (!fs.existsSync(queuePath)) fs.writeFileSync(queuePath, '[]');
  if (!fs.existsSync(cachePath)) fs.writeFileSync(cachePath, '{}');
  appLogger.info('OfflineDB', 'Using JSON-based offline storage', { path: DATA_DIR });
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
    appLogger.error('Sync', 'Failed to queue offline operation', e.message);
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
    appLogger.error('Sync', 'Failed to get pending operations', e.message);
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
    appLogger.error('Sync', 'Failed to mark operation synced', e.message);
  }
}

async function syncOfflineData() {
  if (!isOnline) return;
  const pending = getPendingOperations();
  if (pending.length === 0) return;

  appLogger.info('Sync', `Syncing ${pending.length} offline operations`);
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
        appLogger.info('Sync', `Synced: ${op.type} -> ${op.endpoint}`);
      } else {
        appLogger.warn('Sync', `Sync failed: ${op.endpoint}`, { status: response.status });
      }
    } catch (e) {
      appLogger.warn('Sync', `Sync error: ${op.endpoint}`, e.message);
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
      appLogger.info('Network', 'Connection restored, syncing offline data');
      syncOfflineData();
      if (enhancedOfflineDb) {
        enhancedOfflineDb.syncToCloud(serverUrl).then(result => {
          appLogger.info('OfflineDB', `Cloud sync completed`, { synced: result.synced, failed: result.failed });
        }).catch(e => {
          appLogger.warn('OfflineDB', 'Cloud sync error', e.message);
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
  appLogger.info('Window', needsSetup ? 'Opening setup wizard' : `Launching ${appMode.toUpperCase()} mode`, { kiosk: isKiosk });

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
            label: 'View Logs...',
            click: () => {
              appLogger.info('App', 'User opened log directory');
              shell.openPath(LOG_DIR);
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
    appLogger.error('Window', `Page load failed: ${errorDescription}`, { errorCode });
    if (errorCode === -106 || errorCode === -105 || errorCode === -2) {
      isOnline = false;
      if (offlineInterceptor) offlineInterceptor.setOffline(true);
      appLogger.warn('Window', 'Load failed, protocol interceptor should handle offline serving');
    }
  });
}

function switchMode(mode) {
  appMode = mode;
  const config = loadConfig();
  config.mode = mode;
  saveConfig(config);
  appLogger.info('App', `Mode switched to ${mode}`);
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
    appLogger.info('App', 'Reset all data requested');
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
          appLogger.warn('App', 'Some offline tables may not exist during reset', e.message);
        }
      }

      const jsonResets = { 'cached_data.json': '{}', 'offline_queue.json': '[]' };
      Object.entries(jsonResets).forEach(([file, empty]) => {
        const filePath = path.join(DATA_DIR, file);
        if (fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, empty);
        }
      });

      appLogger.warn('App', 'All data cleared, app will relaunch');
      app.relaunch();
      app.exit(0);
    } catch (e) {
      appLogger.error('App', 'Reset failed', e.message);
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

  ipcMain.handle('open-log-directory', () => {
    appLogger.info('App', 'Opening log directory via IPC');
    shell.openPath(LOG_DIR);
    return { success: true, path: LOG_DIR };
  });

  ipcMain.handle('get-log-content', async (event, { logName, lines }) => {
    try {
      if (logName === 'system') {
        const { UNIFIED_LOG_FILE } = require('./logger.cjs');
        const fs = require('fs');
        if (fs.existsSync(UNIFIED_LOG_FILE)) {
          const content = fs.readFileSync(UNIFIED_LOG_FILE, 'utf8');
          const allLines = content.split('\n');
          return { success: true, content: allLines.slice(-(lines || 300)).join('\n'), path: UNIFIED_LOG_FILE };
        }
        return { success: true, content: '', path: UNIFIED_LOG_FILE };
      }
      const allowedLogs = ['app', 'print-agent', 'offline-db', 'installer'];
      const safeName = allowedLogs.includes(logName) ? logName : 'app';
      const { Logger } = require('./logger.cjs');
      const logger = new Logger(safeName);
      return { success: true, content: logger.readRecentLines(lines || 200), path: logger.getLogPath() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('renderer-log', (event, payload) => {
    try {
      if (!payload || typeof payload !== 'object') return { success: false };
      const allowedLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      const allowedSubsystems = ['RENDERER', 'NETWORK', 'POS', 'KDS', 'SYNC', 'UI', 'AUTH'];
      const safeLevel = allowedLevels.includes(payload.level) ? payload.level : 'INFO';
      const safeSubsystem = allowedSubsystems.includes(payload.subsystem)
        ? payload.subsystem : 'RENDERER';
      const safeCategory = String(payload.category || 'General').substring(0, 32).replace(/[\r\n]/g, '');
      const safeMessage = String(payload.message || '').substring(0, 1000).replace(/[\r\n]/g, ' ');
      let safeData = payload.data;
      if (safeData !== undefined && safeData !== null) {
        try {
          const serialized = JSON.stringify(safeData);
          if (serialized.length > 2000) safeData = serialized.substring(0, 2000) + '...(truncated)';
        } catch { safeData = '[unserializable]'; }
      }
      const { Logger } = require('./logger.cjs');
      const rendererLogger = new Logger('app');
      rendererLogger.write(safeLevel, `R:${safeSubsystem}:${safeCategory}`, safeMessage, safeData);
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle('print-raw', async (event, { address, port, data }) => {
    try {
      printLogger.info('RawPrint', `Sending raw data to ${address}:${port || 9100}`);
      const result = await sendRawToPrinter(address, port || 9100, data);
      printLogger.info('RawPrint', 'Raw print successful');
      return { success: true };
    } catch (e) {
      printLogger.error('RawPrint', `Raw print failed: ${e.message}`, { address, port });
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('print-escpos', async (event, { address, port, commands }) => {
    try {
      printLogger.info('EscPos', `Sending ESC/POS commands to ${address}:${port || 9100}`, { commandCount: commands.length });
      const buffer = buildEscPosBuffer(commands);
      const result = await sendRawToPrinter(address, port || 9100, buffer);
      printLogger.info('EscPos', 'ESC/POS print successful');
      return { success: true };
    } catch (e) {
      printLogger.error('EscPos', `ESC/POS print failed: ${e.message}`, { address, port });
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
      printLogger.info('Test', `Testing printer at ${ipAddress}:${port || 9100}`);
      const testData = Buffer.from([0x1B, 0x40, 0x1B, 0x61, 0x01]); // init + center
      const text = Buffer.from('*** PRINT TEST ***\nCloud POS Print Agent\nPrinter Connected OK\n\n\n', 'utf-8');
      const cut = Buffer.from([0x1D, 0x56, 0x01]); // partial cut
      const fullData = Buffer.concat([testData, text, cut]);

      await printAgent.sendToPrinter(ipAddress, port || 9100, fullData);
      printLogger.info('Test', 'Printer test successful');
      return { success: true };
    } catch (e) {
      printLogger.error('Test', `Printer test failed: ${e.message}`, { ipAddress, port });
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
    printLogger.info('LocalPrint', `Print job queued`, { printerIp, printerPort, printerId, jobId });
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

  ipcMain.handle('offline-self-test', async () => {
    const results = {
      timestamp: new Date().toISOString(),
      protocolInterceptorActive: protocolInterceptorRegistered,
      isOnline,
      offlineInterceptorInitialized: !!offlineInterceptor,
      enhancedOfflineDbInitialized: !!enhancedOfflineDb,
      tests: [],
    };

    if (enhancedOfflineDb) {
      try {
        const stats = enhancedOfflineDb.getStats();
        results.dbStats = stats;
        results.tests.push({
          name: 'SQLite database accessible',
          pass: stats.usingSqlite === true,
          detail: stats.usingSqlite ? 'SQLite active' : 'Using JSON fallback',
        });
        results.tests.push({
          name: 'Employees cached',
          pass: (stats.cachedEmployees || 0) > 0,
          detail: `${stats.cachedEmployees || 0} employees in cache`,
        });
        results.tests.push({
          name: 'Menu items cached',
          pass: (stats.cachedMenuItems || 0) > 0,
          detail: `${stats.cachedMenuItems || 0} menu items in cache`,
        });
        results.tests.push({
          name: 'Last sync completed',
          pass: !!stats.lastSync,
          detail: stats.lastSync || 'Never synced',
        });
      } catch (e) {
        results.tests.push({ name: 'Database check', pass: false, detail: e.message });
      }
    } else {
      results.tests.push({ name: 'Database check', pass: false, detail: 'enhancedOfflineDb not initialized' });
    }

    if (offlineInterceptor) {
      try {
        const canHandlePinAuth = offlineInterceptor.canHandleOffline('POST', '/api/auth/pin');
        results.tests.push({
          name: 'PIN auth endpoint registered',
          pass: canHandlePinAuth,
          detail: canHandlePinAuth ? 'POST /api/auth/pin is handled' : 'NOT handled - auth will fail offline',
        });

        const canHandleMenuItems = offlineInterceptor.canHandleOffline('GET', '/api/menu-items');
        results.tests.push({
          name: 'Menu items endpoint registered',
          pass: canHandleMenuItems,
          detail: canHandleMenuItems ? 'GET /api/menu-items is handled' : 'NOT handled',
        });

        const canHandleHealth = offlineInterceptor.canHandleOffline('GET', '/api/health');
        results.tests.push({
          name: 'Health endpoint registered',
          pass: canHandleHealth,
          detail: canHandleHealth ? 'GET /api/health is handled' : 'NOT handled',
        });
      } catch (e) {
        results.tests.push({ name: 'Interceptor check', pass: false, detail: e.message });
      }
    } else {
      results.tests.push({ name: 'Interceptor check', pass: false, detail: 'offlineInterceptor not initialized' });
    }

    results.tests.push({
      name: 'Protocol interceptor registered',
      pass: protocolInterceptorRegistered,
      detail: protocolInterceptorRegistered ? 'HTTPS protocol handler active' : 'NOT registered - offline will not work',
    });

    const pageCacheExists = fs.existsSync(PAGE_CACHE_DIR);
    let cachedPages = 0;
    if (pageCacheExists) {
      try {
        const walkDir = (dir) => {
          let count = 0;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && !entry.name.endsWith('.meta')) count++;
            else if (entry.isDirectory()) count += walkDir(path.join(dir, entry.name));
          }
          return count;
        };
        cachedPages = walkDir(PAGE_CACHE_DIR);
      } catch {}
    }
    results.tests.push({
      name: 'Page cache populated',
      pass: cachedPages > 0,
      detail: `${cachedPages} pages/assets cached for cold start`,
    });

    const allPass = results.tests.every(t => t.pass);
    results.overallStatus = allPass ? 'READY FOR OFFLINE' : 'NOT READY - see failing tests';

    appLogger.info('SelfTest', `Offline self-test: ${results.overallStatus}`, {
      passed: results.tests.filter(t => t.pass).length,
      failed: results.tests.filter(t => !t.pass).length,
    });

    return results;
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

  ipcMain.handle('wizard-emc-login', async (event, serverUrl, email, password) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/emc/wizard-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || `HTTP ${response.status}` };
      }
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.name === 'AbortError' ? 'Login timed out' : e.message };
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
      appLogger.info('Wizard', 'Setup wizard completed', { enterprise: wizardConfig.enterpriseName, property: wizardConfig.propertyName, mode: wizardConfig.mode, device: wizardConfig.deviceName });
      appMode = wizardConfig.mode;
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-get-existing-config', async () => {
    return loadConfig();
  });

  ipcMain.on('wizard-launch-app', async () => {
    appLogger.info('Wizard', 'Launching app after wizard completion');
    const config = loadConfig();

    appLogger.info('Wizard', 'Initializing all services after setup completion');
    await initAllServices();

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
      appLogger.error('Window', `Page load failed after wizard: ${errorDescription}`, { errorCode });
      if (errorCode === -106 || errorCode === -105 || errorCode === -2) {
        isOnline = false;
        if (offlineInterceptor) offlineInterceptor.setOffline(true);
        appLogger.warn('Window', 'Post-wizard load failed, protocol interceptor handles offline');
      }
    });
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
      appLogger.info('Config', 'Auto-launch enabled');
    } else {
      execSync(`reg delete "${regKey}" /v "${regValue}" /f`, { windowsHide: true });
      appLogger.info('Config', 'Auto-launch disabled');
    }
  } catch (e) {
    appLogger.warn('Config', 'Could not set auto-launch', e.message);
  }
}

async function autoRegisterPrintAgent(config) {
  try {
    const serverUrl = getServerUrl();
    const deviceName = config.deviceName || os.hostname();
    const propertyId = config.propertyId || null;

    printLogger.info('AutoRegister', `Registering embedded print agent for device: ${deviceName}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${serverUrl}/api/print-agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: propertyId ? Number(propertyId) : null,
        name: `${deviceName} (Embedded Agent)`,
        description: `Auto-registered embedded print agent for ${deviceName}`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      printLogger.error('AutoRegister', `Server returned ${response.status}: ${errText}`);
      return null;
    }

    const result = await response.json();
    printLogger.info('AutoRegister', `Print agent registered: ${result.name} (${result.id})`);

    config.printAgentId = result.id;
    config.printAgentToken = result.agentToken;
    saveConfig(config);

    return { agentId: result.id, agentToken: result.agentToken };
  } catch (e) {
    printLogger.error('AutoRegister', `Auto-registration failed: ${e.message}`);
    return null;
  }
}

async function initPrintAgent() {
  const config = loadConfig();

  if (!config.printAgentId && !config.printAgentToken) {
    printLogger.info('Init', 'No agent ID/token configured, attempting auto-registration');
    const registered = await autoRegisterPrintAgent(config);
    if (registered) {
      config.printAgentId = registered.agentId;
      config.printAgentToken = registered.agentToken;
    }
  }

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
    printLogger.info('Status', `connected=${status.connected}, auth=${status.authenticated}`);
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
    printLogger.info('Init', 'No agent ID/token configured and auto-registration failed, print agent awaiting manual configuration');
  }
}

async function initEnhancedOfflineDb() {
  enhancedOfflineDb = new OfflineDatabase({
    dataDir: DATA_DIR,
  });
  await enhancedOfflineDb.initialize();

  offlineInterceptor = new OfflineApiInterceptor(enhancedOfflineDb);
  const config = loadConfig();
  offlineInterceptor.setConfig({
    enterpriseId: config.enterpriseId || null,
    propertyId: config.propertyId || null,
    rvcId: config.rvcId || null,
  });
  appLogger.info('OfflineDB', 'Enhanced offline database initialized');
}

async function performInitialDataSync() {
  const config = loadConfig();
  if (!config.setupComplete) {
    return;
  }

  const enterpriseId = config.enterpriseId;
  const propertyId = config.propertyId;
  const rvcId = config.rvcId;

  if (!enterpriseId) {
    appLogger.info('OfflineDB', 'No enterprise configured, skipping initial sync');
    return;
  }

  try {
    const serverUrl = getServerUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${serverUrl}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok && enhancedOfflineDb) {
      appLogger.info('OfflineDB', 'Cloud reachable, starting initial data sync');
      const result = await enhancedOfflineDb.syncFromCloud(serverUrl, enterpriseId, propertyId, rvcId);
      appLogger.info('OfflineDB', 'Initial sync completed', { tables: result.synced?.length || 0, errors: result.errors?.length || 0 });
    }
  } catch (e) {
    appLogger.warn('OfflineDB', 'Cloud not reachable for initial sync, using cached data');
  }
}

const PAGE_CACHE_DIR = path.join(DATA_DIR, 'page-cache');

function ensurePageCacheDir() {
  if (!fs.existsSync(PAGE_CACHE_DIR)) {
    fs.mkdirSync(PAGE_CACHE_DIR, { recursive: true });
  }
}

function getCachePath(pathname) {
  let safePath = pathname.replace(/[^a-zA-Z0-9._\/-]/g, '_');
  if (safePath === '/' || safePath === '') safePath = '__root__';
  if (safePath.startsWith('/')) safePath = safePath.substring(1);
  return path.join(PAGE_CACHE_DIR, safePath);
}

async function cacheResponseToDisk(pathname, response) {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.match(/html|javascript|css|json|text|font|svg|icon/)) return;

    const cachePath = getCachePath(pathname);
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(cachePath, buffer);
    fs.writeFileSync(cachePath + '.meta', JSON.stringify({
      contentType,
      cachedAt: new Date().toISOString(),
      pathname,
    }));
  } catch (e) {
    appLogger.debug('PageCache', `Cache write error for ${pathname}`, e.message);
  }
}

function getCachedResponseFromDisk(pathname) {
  try {
    const cachePath = getCachePath(pathname);
    if (fs.existsSync(cachePath)) {
      const buffer = fs.readFileSync(cachePath);
      let contentType = 'text/html';
      const metaPath = cachePath + '.meta';
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          contentType = meta.contentType || 'text/html';
        } catch {}
      }
      appLogger.debug('PageCache', `Serving cached: ${pathname}`);
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': contentType, 'X-Offline-Cache': 'true' },
      });
    }

    if (!pathname.includes('.') && pathname !== '/api') {
      const posPath = getCachePath('/pos');
      if (fs.existsSync(posPath)) {
        const buffer = fs.readFileSync(posPath);
        appLogger.debug('PageCache', `Serving cached /pos for SPA route: ${pathname}`);
        return new Response(buffer, {
          status: 200,
          headers: { 'Content-Type': 'text/html', 'X-Offline-Cache': 'true' },
        });
      }
    }

    return null;
  } catch (e) {
    appLogger.debug('PageCache', `Cache read error for ${pathname}`, e.message);
    return null;
  }
}

async function parseRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  try {
    const buf = await req.arrayBuffer();
    const text = new TextDecoder().decode(buf);
    if (!text || text.length === 0) return null;
    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  }
}

function routeToOfflineInterceptor(method, url, body) {
  const queryParams = Object.fromEntries(url.searchParams);
  if (offlineInterceptor.canHandleOffline(method, url.pathname)) {
    const result = offlineInterceptor.handleRequest(method, url.pathname, queryParams, body);
    if (result) {
      appLogger.info('Interceptor', `OFFLINE -> ${method} ${url.pathname} -> ${result.status}`);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', 'X-Offline-Mode': 'true' },
      });
    }
  }
  appLogger.warn('Interceptor', `No offline handler for: ${method} ${url.pathname}`);
  return new Response(JSON.stringify({ error: 'Not available offline', offline: true }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Offline-Mode': 'true' },
  });
}

function registerProtocolInterceptor() {
  if (protocolInterceptorRegistered) return;
  protocolInterceptorRegistered = true;
  ensurePageCacheDir();

  protocol.handle('https', async (request) => {
    const url = new URL(request.url);
    const serverUrl = getServerUrl();
    let serverHost;
    try { serverHost = new URL(serverUrl).hostname; } catch { return electronNet.fetch(request); }

    if (url.hostname !== serverHost) {
      return electronNet.fetch(request);
    }

    const isApiRequest = url.pathname.startsWith('/api/');

    if (!isOnline && isApiRequest && offlineInterceptor) {
      appLogger.info('Interceptor', `OFFLINE API: ${request.method} ${url.pathname}`);
      const body = await parseRequestBody(request);
      return routeToOfflineInterceptor(request.method, url, body);
    }

    const failoverClone = isApiRequest ? request.clone() : null;

    try {
      const response = await electronNet.fetch(request);

      if (response.ok && request.method === 'GET') {
        const cloned = response.clone();
        cacheResponseToDisk(url.pathname, cloned).catch(() => {});
      }

      if (!isOnline && response.ok) {
        isOnline = true;
        if (offlineInterceptor) offlineInterceptor.setOffline(false);
        if (mainWindow) mainWindow.webContents.send('online-status', true);
        appLogger.info('Network', 'Connection restored via protocol handler');
        syncOfflineData();
      }

      return response;
    } catch (networkError) {
      if (isOnline) {
        isOnline = false;
        if (offlineInterceptor) offlineInterceptor.setOffline(true);
        if (mainWindow) mainWindow.webContents.send('online-status', false);
        appLogger.warn('Network', `Connection lost: ${networkError.message}`);
      }

      if (isApiRequest && offlineInterceptor && failoverClone) {
        appLogger.info('Interceptor', `FAILOVER API: ${request.method} ${url.pathname}`);
        const body = await parseRequestBody(failoverClone);
        return routeToOfflineInterceptor(request.method, url, body);
      }

      const cached = getCachedResponseFromDisk(url.pathname);
      if (cached) return cached;

      if (!url.pathname.includes('.')) {
        appLogger.warn('PageCache', `No cached page for: ${url.pathname}, serving offline fallback`);
        return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cloud POS - Offline</title>
<style>body{font-family:system-ui;background:#0f1729;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.c{max-width:480px;padding:40px}h1{margin-bottom:12px}p{opacity:0.8;line-height:1.6;margin-bottom:20px}
button{padding:12px 32px;font-size:16px;border:1px solid #4a4a6a;border-radius:8px;background:#2a2a4a;color:#fff;cursor:pointer}
button:hover{background:#3a3a5a}.info{margin-top:20px;font-size:13px;opacity:0.5}</style></head>
<body><div class="c"><h1>Cloud POS Offline</h1>
<p>The server is unreachable and no cached pages are available. Please connect to the internet at least once to cache the POS application.</p>
<button onclick="location.reload()">Retry Connection</button>
<p class="info">Once connected, the app will automatically cache itself for offline use.</p></div></body></html>`, {
          status: 503,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return new Response('', { status: 503 });
    }
  });

  appLogger.info('Interceptor', 'HTTPS protocol interceptor registered for offline support');
}

let servicesInitialized = false;
let syncTimer = null;

async function initAllServices() {
  if (servicesInitialized) {
    appLogger.info('App', 'Services already initialized, skipping');
    return;
  }

  const config = loadConfig();
  if (!config.setupComplete) {
    appLogger.info('App', 'Setup not complete, deferring service initialization');
    return;
  }

  appLogger.info('App', 'Initializing services after setup verification');

  initOfflineDatabase();
  await initEnhancedOfflineDb();
  emvManager = new EMVTerminalManager(DATA_DIR);
  await initPrintAgent();

  if (config.autoLaunch) {
    setupAutoLaunch(true);
  }

  syncInterval = setInterval(checkConnectivity, 30000);
  checkConnectivity();

  syncTimer = setInterval(syncOfflineData, 60000);

  dataSyncInterval = setInterval(async () => {
    if (isOnline && enhancedOfflineDb) {
      const cfg = loadConfig();
      if (cfg.enterpriseId) {
        try {
          await enhancedOfflineDb.syncFromCloud(getServerUrl(), cfg.enterpriseId, cfg.propertyId, cfg.rvcId);
        } catch (e) {
          appLogger.warn('OfflineDB', 'Periodic sync failed', e.message);
        }
      }
    }
  }, 300000);

  await performInitialDataSync();

  servicesInitialized = true;
  appLogger.info('App', 'All services initialized successfully');
}

app.whenReady().then(async () => {
  ensureDirectories();
  parseArgs();
  appLogger.separator('APPLICATION STARTUP');
  appLogger.info('App', 'Cloud POS starting', { version: app.getVersion(), mode: appMode, kiosk: isKiosk, platform: process.platform });
  appLogger.info('App', 'Directories', { config: CONFIG_DIR, data: DATA_DIR, logs: LOG_DIR });

  const config = loadConfig();

  setupIpcHandlers();

  if (config.setupComplete) {
    appLogger.info('App', 'Setup previously completed, initializing all services');
    await initAllServices();
  } else {
    appLogger.info('App', 'Setup not yet completed, launching Setup Wizard only (no services initialized)');
  }

  registerProtocolInterceptor();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  appLogger.info('App', 'Application shutting down');
  if (syncInterval) clearInterval(syncInterval);
  if (syncTimer) clearInterval(syncTimer);
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
