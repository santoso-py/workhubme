const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sheet', {
  add: (form) => ipcRenderer.invoke('site:add', form),
  close: () => ipcRenderer.send('sheet:close'),
  onReset: (cb) => ipcRenderer.on('sheet:reset', () => cb()),
});
