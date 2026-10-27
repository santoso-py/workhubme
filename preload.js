const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  select: (id, split) => ipcRenderer.send('select', { id, split }),
  addSite: () => ipcRenderer.send('ui:add-site'),
  setLanguage: (code) => ipcRenderer.send('ui:set-language', code),
  tabMenu: (id) => ipcRenderer.send('tab:context', id),
  onServices: (cb) => ipcRenderer.on('services', (_e, data) => cb(data)),
  onState: (cb) => ipcRenderer.on('state', (_e, data) => cb(data)),
  lang: () => ipcRenderer.invoke('i18n:lang'),
  onLang: (cb) => ipcRenderer.on('lang', (_e, lang) => cb(lang)),
  onBadges: (cb) => ipcRenderer.on('badges', (_e, labels) => cb(labels)),
  onOverlay: (cb) => ipcRenderer.on('overlay', (_e, data) => cb(data)),
});
