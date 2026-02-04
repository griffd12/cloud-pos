const { contextBridge, ipcRenderer } = require('electron');

// Expose limited APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Fullscreen control
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  
  // App control
  quitApp: () => ipcRenderer.send('quit-app'),
  
  // Platform detection
  platform: process.platform,
  
  // Version info
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  
  // Check if running in Electron
  isElectron: true,
});
