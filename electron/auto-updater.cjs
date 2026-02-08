const { autoUpdater } = require('electron-updater');
const { app, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let logger = null;
let updateState = {
  status: 'idle',
  currentVersion: null,
  availableVersion: null,
  downloadProgress: 0,
  lastChecked: null,
  error: null,
  updateReady: false,
};

function initAutoUpdater(updaterLogger) {
  logger = updaterLogger || { info: console.log, warn: console.warn, error: console.error, debug: console.log };

  updateState.currentVersion = app.getVersion();

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.logger = {
    info: (msg) => logger.info('Core', msg),
    warn: (msg) => logger.warn('Core', msg),
    error: (msg) => logger.error('Core', msg),
    debug: (msg) => logger.debug('Core', msg),
  };

  autoUpdater.on('checking-for-update', () => {
    updateState.status = 'checking';
    updateState.error = null;
    logger.info('Check', 'Checking for updates...');
    broadcastUpdateStatus();
  });

  autoUpdater.on('update-available', (info) => {
    updateState.status = 'downloading';
    updateState.availableVersion = info.version;
    logger.info('Found', `Update available: v${info.version} (current: v${updateState.currentVersion})`);
    logger.info('Found', `Release date: ${info.releaseDate || 'unknown'}`);
    if (info.releaseNotes) {
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : JSON.stringify(info.releaseNotes);
      logger.info('Found', `Release notes: ${notes.substring(0, 500)}`);
    }
    broadcastUpdateStatus();
  });

  autoUpdater.on('update-not-available', (info) => {
    updateState.status = 'up-to-date';
    updateState.lastChecked = new Date().toISOString();
    logger.info('Check', `App is up to date (v${info.version})`);
    broadcastUpdateStatus();
  });

  autoUpdater.on('download-progress', (progress) => {
    updateState.status = 'downloading';
    updateState.downloadProgress = Math.round(progress.percent);
    const speed = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
    const transferred = (progress.transferred / 1024 / 1024).toFixed(1);
    const total = (progress.total / 1024 / 1024).toFixed(1);
    logger.info('Download', `Progress: ${updateState.downloadProgress}% | ${transferred}MB / ${total}MB | Speed: ${speed} MB/s`);
    broadcastUpdateStatus();
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateState.status = 'ready';
    updateState.updateReady = true;
    updateState.lastChecked = new Date().toISOString();
    logger.info('Ready', `Update v${info.version} downloaded and ready to install`);
    logger.info('Ready', 'Update will be installed on next app restart, or user can trigger immediate restart');
    broadcastUpdateStatus();
  });

  autoUpdater.on('error', (error) => {
    updateState.status = 'error';
    updateState.error = error.message || String(error);
    logger.error('Error', `Auto-update error: ${updateState.error}`);
    if (error.stack) {
      logger.debug('Error', `Stack trace: ${error.stack}`);
    }
    broadcastUpdateStatus();
  });

  setupIpcHandlers();

  logger.info('Init', `Auto-updater initialized (v${updateState.currentVersion})`);
  logger.info('Init', `Auto-download: ${autoUpdater.autoDownload}, Auto-install on quit: ${autoUpdater.autoInstallOnAppQuit}`);

  setTimeout(() => {
    checkForUpdates();
  }, 15000);

  setInterval(() => {
    checkForUpdates();
  }, 4 * 60 * 60 * 1000);
}

function checkForUpdates() {
  if (updateState.status === 'downloading') {
    logger.info('Check', 'Skipping update check - download already in progress');
    return;
  }
  logger.info('Check', 'Initiating update check...');
  autoUpdater.checkForUpdates().catch((err) => {
    logger.error('Check', `Failed to check for updates: ${err.message}`);
    updateState.status = 'error';
    updateState.error = err.message;
    broadcastUpdateStatus();
  });
}

function installUpdate() {
  if (!updateState.updateReady) {
    logger.warn('Install', 'No update ready to install');
    return false;
  }
  logger.info('Install', 'Installing update and restarting application...');
  autoUpdater.quitAndInstall(false, true);
  return true;
}

function broadcastUpdateStatus() {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    try {
      win.webContents.send('update-status', { ...updateState });
    } catch (e) {}
  }
}

function setupIpcHandlers() {
  ipcMain.handle('updater-get-status', () => {
    return { ...updateState };
  });

  ipcMain.handle('updater-check-now', async () => {
    logger.info('IPC', 'Manual update check requested by user');
    checkForUpdates();
    return { success: true, status: updateState.status };
  });

  ipcMain.handle('updater-install', () => {
    logger.info('IPC', 'Update install requested by user');
    const result = installUpdate();
    return { success: result };
  });

  ipcMain.handle('updater-get-version', () => {
    return {
      current: app.getVersion(),
      available: updateState.availableVersion,
      updateReady: updateState.updateReady,
    };
  });
}

function getUpdateState() {
  return { ...updateState };
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  installUpdate,
  getUpdateState,
};
