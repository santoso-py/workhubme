const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sheet', {
  add: (form) => ipcRenderer.invoke('site:add', form),
  close: () => ipcRenderer.send('sheet:close'),
  lang: () => ipcRenderer.invoke('i18n:lang'),
  onLang: (cb) => ipcRenderer.on('lang', (_e, lang) => cb(lang)),
  onReset: (cb) => ipcRenderer.on('sheet:reset', () => cb()),
});
