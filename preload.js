const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  select: (id, split) => ipcRenderer.send('select', { id, split }),
  addSite: () => ipcRenderer.send('ui:add-site'),
  tabMenu: (id) => ipcRenderer.send('tab:context', id),
  onServices: (cb) => ipcRenderer.on('services', (_e, data) => cb(data)),
  onState: (cb) => ipcRenderer.on('state', (_e, data) => cb(data)),
  onOverlay: (cb) => ipcRenderer.on('overlay', (_e, data) => cb(data)),
});
