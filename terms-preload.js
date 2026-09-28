const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('termsAPI', {
  agree: () => ipcRenderer.send('terms-agree'),
  decline: () => ipcRenderer.send('terms-decline')
});