const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wizardAPI', {
  testConnection: (url) => ipcRenderer.invoke('wizard-test-connection', url),
  emcLogin: (serverUrl, email, password) => ipcRenderer.invoke('wizard-emc-login', serverUrl, email, password),
  fetchEnterprises: (serverUrl) => ipcRenderer.invoke('wizard-fetch-enterprises', serverUrl),
  fetchProperties: (serverUrl, enterpriseId) => ipcRenderer.invoke('wizard-fetch-properties', serverUrl, enterpriseId),
  fetchDevices: (serverUrl, enterpriseId, propertyId, mode) =>
    ipcRenderer.invoke('wizard-fetch-devices', serverUrl, enterpriseId, propertyId, mode),
  fetchRvcs: (serverUrl, propertyId) => ipcRenderer.invoke('wizard-fetch-rvcs', serverUrl, propertyId),
  saveConfig: (config) => ipcRenderer.invoke('wizard-save-config', config),
  launchApp: () => ipcRenderer.send('wizard-launch-app'),
  getExistingConfig: () => ipcRenderer.invoke('wizard-get-existing-config'),
});
