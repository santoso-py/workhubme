const { contextBridge, ipcRenderer } = require('electron');

// The only surface the terminal page gets: no shell command strings, just bytes in and out.
contextBridge.exposeInMainWorld('term', {
  start: (cols, rows) => ipcRenderer.send('terminal:start', { cols, rows }),
  input: (data) => ipcRenderer.send('terminal:input', data),
  resize: (cols, rows) => ipcRenderer.send('terminal:resize', { cols, rows }),
  onData: (cb) => ipcRenderer.on('terminal:data', (_e, data) => cb(data)),
  onExit: (cb) => ipcRenderer.on('terminal:exit', (_e, code) => cb(code)),
});
