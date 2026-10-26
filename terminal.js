// Main-process side of the Terminal tab: one pty, driven only by the terminal view.
const { ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pty = require('node-pty');

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_DIMENSION = 1000;
const FLUSH_MS = 8; // output is coalesced so a burst does not flood IPC with tiny messages

// The prebuilt spawn-helper ships without the executable bit (posix_spawnp fails otherwise).
function ensureHelperExecutable() {
  const helper = path.join(
    path.dirname(require.resolve('node-pty/package.json')),
    'prebuilds',
    `${process.platform}-${process.arch}`,
    'spawn-helper',
  );
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}

const isDimension = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_DIMENSION;

// getWebContents() returns the terminal view's webContents. Every handler checks that the
// message came from exactly that page's main frame, because anything that can write to the
// pty can run commands as the user.
function registerTerminal(getWebContents) {
  let proc = null;
  let pending = '';
  let flushTimer = null;

  const fromTerminal = (event) => {
    const wc = getWebContents();
    return Boolean(wc) && event.sender === wc && event.senderFrame === wc.mainFrame;
  };

  const flush = () => {
    flushTimer = null;
    const wc = getWebContents();
    if (pending && wc && !wc.isDestroyed()) wc.send('terminal:data', pending);
    pending = '';
  };

  function start(cols, rows) {
    if (proc) return;
    ensureHelperExecutable();
    proc = pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
    const current = proc;
    current.onData((data) => {
      pending += data;
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    });
    current.onExit(({ exitCode }) => {
      if (proc === current) proc = null;
      flush();
      const wc = getWebContents();
      if (wc && !wc.isDestroyed()) wc.send('terminal:exit', exitCode);
    });
  }

  ipcMain.on('terminal:start', (event, size) => {
    if (!fromTerminal(event) || !size || !isDimension(size.cols) || !isDimension(size.rows)) return;
    try {
      start(size.cols, size.rows);
    } catch (error) {
      const wc = getWebContents();
      if (wc) wc.send('terminal:data', `\r\n[terminal failed to start: ${error.message}]\r\n`);
    }
  });
  ipcMain.on('terminal:input', (event, data) => {
    if (!fromTerminal(event) || typeof data !== 'string' || data.length > MAX_INPUT_BYTES) return;
    if (proc) proc.write(data);
  });
  ipcMain.on('terminal:resize', (event, size) => {
    if (!fromTerminal(event) || !size || !isDimension(size.cols) || !isDimension(size.rows)) return;
    if (proc) proc.resize(size.cols, size.rows);
  });

  return { kill: () => proc && proc.kill() };
}

module.exports = { registerTerminal };
