const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  createDirectories: (rootDir) => ipcRenderer.invoke('create-directories', rootDir),
  
  downloadServiceHost: (cloudUrl, rootDir) => 
    ipcRenderer.invoke('download-service-host', cloudUrl, rootDir),
  
  saveConfig: (rootDir, config) => 
    ipcRenderer.invoke('save-config', rootDir, config),
  
  startServiceHost: (rootDir) => 
    ipcRenderer.invoke('start-service-host', rootDir),
  
  installWindowsService: (rootDir, serviceName) => 
    ipcRenderer.invoke('install-windows-service', rootDir, serviceName),
  
  downloadCalPackage: (cloudUrl, packageName, rootDir) => 
    ipcRenderer.invoke('download-cal-package', cloudUrl, packageName, rootDir),
  
  openPos: (posUrl) => ipcRenderer.invoke('open-pos', posUrl),
  
  quitApp: () => ipcRenderer.invoke('quit-app'),
  
  writeLog: (level, message, data) => ipcRenderer.invoke('write-log', level, message, data),
  
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, progress) => callback(progress));
  },
});
