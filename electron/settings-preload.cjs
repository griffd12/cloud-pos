const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  getData: () => ipcRenderer.invoke('settings-get-data'),
  saveUrl: (url) => ipcRenderer.send('settings-save-url', url),
});
