const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  quitApp: () => ipcRenderer.send('quit-app'),

  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getOnlineStatus: () => ipcRenderer.invoke('get-online-status'),

  printRaw: (address, port, data) =>
    ipcRenderer.invoke('print-raw', { address, port, data }),

  printEscPos: (address, port, commands) =>
    ipcRenderer.invoke('print-escpos', { address, port, commands }),

  getLocalPrinters: () => ipcRenderer.invoke('get-local-printers'),

  printToSystemPrinter: (printerName, data, options) =>
    ipcRenderer.invoke('print-to-system-printer', { printerName, data, options }),

  queueOfflineOperation: (type, endpoint, method, body) =>
    ipcRenderer.invoke('queue-offline-operation', { type, endpoint, method, body }),

  getPendingSyncCount: () => ipcRenderer.invoke('get-pending-sync-count'),
  forceSync: () => ipcRenderer.invoke('force-sync'),

  cacheData: (key, data) => ipcRenderer.invoke('cache-data', { key, data }),
  getCachedData: (key) => ipcRenderer.invoke('get-cached-data', { key }),

  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  setServerUrl: (url) => ipcRenderer.invoke('set-server-url', url),

  setAutoLaunch: (enable) => ipcRenderer.invoke('set-auto-launch', enable),

  emvSendPayment: (config) => ipcRenderer.invoke('emv-send-payment', config),
  emvCancel: (address, port) => ipcRenderer.invoke('emv-cancel', { address, port }),
  emvGetPendingPayments: () => ipcRenderer.invoke('emv-get-pending-payments'),
  emvMarkPaymentSynced: (id) => ipcRenderer.invoke('emv-mark-payment-synced', { id }),

  onOnlineStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('online-status', handler);
    return () => ipcRenderer.removeListener('online-status', handler);
  },

  onSyncStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('sync-status', handler);
    return () => ipcRenderer.removeListener('sync-status', handler);
  },
});
