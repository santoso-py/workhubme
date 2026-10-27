const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('help', {
  get: () => ipcRenderer.invoke('help:get'),
  check: () => ipcRenderer.invoke('help:check-updates'),
  openRelease: () => ipcRenderer.send('help:open-release'),
  openProject: () => ipcRenderer.send('help:open-project'),
  close: () => ipcRenderer.send('sheet:close'),
  lang: () => ipcRenderer.invoke('i18n:lang'),
  onLang: (cb) => ipcRenderer.on('lang', (_e, lang) => cb(lang)),
  onReset: (cb) => ipcRenderer.on('sheet:reset', () => cb()),
});
