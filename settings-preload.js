const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.invoke('settings:set', patch),
  close: () => ipcRenderer.send('sheet:close'),
  openHelp: () => ipcRenderer.send('sheet:open-help'),
  lang: () => ipcRenderer.invoke('i18n:lang'),
  onLang: (cb) => ipcRenderer.on('lang', (_e, lang) => cb(lang)),
  onReset: (cb) => ipcRenderer.on('sheet:reset', () => cb()),
});
