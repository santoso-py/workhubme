const { app, BaseWindow, WebContentsView, Menu, dialog, session, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { registerTerminal } = require('./terminal');
const store = require('./services-store');

// The user's tabs, read from userData/services.json once the app is ready. Mutated in place.
const services = [];

const TABS_HEIGHT = 52; // tab strip above the pages
const MARGIN = 12; // outer margin around the pages
const GAP = 8; // gap between split panes
const RADIUS = 12; // service view corners
const SLIDE_MS = 260;
const BG = '#eceef1';
const PREFIX_TIMEOUT_MS = 4000;
const OVERLAY_SIZE = { width: 560, height: 150 };

let chromeUA;
let win;
let chrome; // full-window UI view: the tab strip, below the service views
let overlay;
const views = new Map(); // serviceId -> WebContentsView
let primaryId = null; // null while there are no tabs
let secondaryId = null;
let activeId = null; // pane that last had focus; back/reload/home act on it
let tabsVisible = true;

let prefixState = null; // null | 'prefix' | 'split'
let prefixTimer;

// Ctrl+Tab switcher: services ordered by most recently used, like Cmd+Tab.
const SWITCHER_TIMEOUT_MS = 8000;
const recent = [];
let switcher = null; // { index, hold } into recent while Ctrl is held
let switcherTimer;

function hostAllowed(service, url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    if (service.googleLogin && isGoogleAccountsUrl(url)) return true; // any country's Google sign-in page
    return service.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isGoogleAccountsUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && /^accounts\.google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(hostname);
  } catch {
    return false;
  }
}

// Only origin + path are logged; query strings can carry login tokens.
function appendLog(fileName, line) {
  try {
    const dir = app.getPath('logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, fileName), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // logging must never break navigation
  }
}

function safeUrl(url) {
  try {
    const { origin, pathname } = new URL(url);
    return `${origin}${pathname}`;
  } catch {
    return '(invalid url)';
  }
}

function logBlocked(serviceId, url) {
  appendLog('blocked-navigation.log', `${serviceId} ${safeUrl(url)}`);
}

const isTerminal = (id) => services.find((s) => s.id === id)?.type === 'terminal';

// The Terminal tab is a local page (xterm.js) wired to one pty in the main process. It never
// navigates away from terminal.html, because anything it could load could reach the pty.
let terminalView = null;
let terminalLoaded = false;
let terminal = null; // pty controller from registerTerminal

function createTerminalView() {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'terminal-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', (event) => event.preventDefault());
  view.webContents.on('will-redirect', (event) => event.preventDefault());
  view.setBorderRadius(RADIUS);
  view.webContents.on('before-input-event', handleKey);
  view.webContents.on('focus', () => {
    activeId = services.find((s) => s.type === 'terminal').id;
  });
  terminalView = view;
  return view;
}

// The shell starts when the tab is first shown, not at launch.
function ensureTerminalLoaded() {
  if (terminalLoaded || !terminalView) return;
  terminalLoaded = true;
  terminalView.webContents.loadFile('terminal.html');
}

function createServiceView(service) {
  if (service.type === 'terminal') return createTerminalView();
  const ses = session.fromPartition(`persist:${service.partition ?? service.id}`);
  ses.setUserAgent(chromeUA);
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });

  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Links outside the service's own hosts open in the default browser.
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isGoogleAccountsUrl(url) && hostAllowed(service, url)) {
      // Sign in with Google runs as a real popup so the opener keeps its window.opener link.
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700 } };
    }
    if (hostAllowed(service, url)) {
      view.webContents.loadURL(url);
    } else if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  const guardNavigation = (event, url) => {
    if (!hostAllowed(service, url)) {
      event.preventDefault();
      logBlocked(service.id, url);
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  };
  view.webContents.on('will-navigate', guardNavigation);
  // Same guard for the sign-in popup; it shares this service's session and host list.
  view.webContents.on('did-create-window', (popup) => {
    popup.webContents.on('will-navigate', guardNavigation);
    popup.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
      if (event.isMainFrame ?? isMainFrame) guardNavigation(event, url);
    });
  });
  // will-navigate does not fire for server redirects. will-redirect also fires for iframes
  // (ad/tracking pixels), which must not be sent to the browser, so guard the main frame only.
  view.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
    if (event.isMainFrame ?? isMainFrame) guardNavigation(event, url);
  });

  view.setBorderRadius(RADIUS);
  view.webContents.on('before-input-event', handleKey);
  view.webContents.on('focus', () => {
    activeId = service.id;
  });
  view.webContents.loadURL(service.url);
  return view;
}

let slideTimer = null;

function finishSlide() {
  clearInterval(slideTimer);
  slideTimer = null;
}

// Card switch: the incoming view slides in over the outgoing one, which drifts away slower.
function slideViews(fromId, toId, target) {
  const from = views.get(fromId);
  const to = views.get(toId);
  const direction = services.findIndex((s) => s.id === toId) > services.findIndex((s) => s.id === fromId) ? 1 : -1;
  win.contentView.addChildView(to); // re-adding raises it above the outgoing view
  win.contentView.addChildView(overlay); // keep the overlay on top
  from.setVisible(true);
  to.setVisible(true);
  const start = Date.now();
  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / SLIDE_MS);
    const eased = 1 - (1 - t) ** 3;
    to.setBounds({ ...target, x: Math.round(target.x + direction * target.width * (1 - eased)) });
    from.setBounds({ ...target, x: Math.round(target.x - direction * target.width * 0.3 * eased) });
    if (t === 1) {
      finishSlide();
      from.setVisible(false);
      from.setBounds(target);
    }
  };
  slideTimer = setInterval(tick, 16);
  tick();
}

function layout({ slide } = {}) {
  finishSlide();
  const { width, height } = win.getContentBounds();
  chrome.setBounds({ x: 0, y: 0, width, height });
  // Traffic lights sit at the left of the tab strip; hide them with it.
  win.setWindowButtonVisibility(tabsVisible);

  const shown = [primaryId, secondaryId].filter(Boolean);
  const top = tabsVisible ? TABS_HEIGHT : MARGIN;
  const paneWidth = shown.length ? Math.floor((width - MARGIN * 2 - GAP * (shown.length - 1)) / shown.length) : 0;
  const targets = new Map(
    shown.map((id, index) => [
      id,
      { x: MARGIN + index * (paneWidth + GAP), y: top, width: paneWidth, height: height - top - MARGIN },
    ]),
  );
  for (const [id, view] of views) {
    const target = targets.get(id);
    if (!target) {
      view.setVisible(false);
      continue;
    }
    view.setBounds(target);
    view.setVisible(true);
    if (view === terminalView) ensureTerminalLoaded();
  }
  if (slide && targets.has(slide.toId)) slideViews(slide.fromId, slide.toId, targets.get(slide.toId));

  overlay.setBounds({
    x: Math.floor((width - OVERLAY_SIZE.width) / 2),
    y: height - OVERLAY_SIZE.height - 24,
    ...OVERLAY_SIZE,
  });
  if (sheet && sheetOpen) sheet.setBounds({ x: 0, y: 0, width, height });
  chrome.webContents.send('state', { tabsVisible, primaryId, secondaryId });
}

function navigate(action) {
  if (isTerminal(activeId)) return; // no page history to walk
  const view = views.get(activeId);
  if (!view) return;
  const nav = view.webContents.navigationHistory;
  appendLog('actions.log', `${action} ${activeId} from ${safeUrl(view.webContents.getURL())} canGoBack=${nav.canGoBack()}`);
  if (action === 'back' && nav.canGoBack()) nav.goBack();
  else if (action === 'forward' && nav.canGoForward()) nav.goForward();
  else if (action === 'reload') view.webContents.reload();
  else if (action === 'home') view.webContents.loadURL(services.find((s) => s.id === activeId).url);
}

// Wipes the cookies and site data of the focused service's session, after confirmation.
// Services that share a session (Gmail, Drive, monday) are all signed out together.
async function resetSession() {
  if (isTerminal(activeId)) return;
  const partition = services.find((s) => s.id === activeId);
  if (!partition) return;
  const key = partition.partition ?? partition.id;
  const affected = services.filter((s) => (s.partition ?? s.id) === key);
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Batal', 'Hapus login'],
    defaultId: 0,
    cancelId: 0,
    message: `Hapus login ${affected.map((s) => s.name).join(', ')}?`,
    detail: 'Cookie dan data situs untuk layanan ini dihapus, lalu halaman dimuat ulang. Layanan dengan sesi lain tidak terpengaruh.',
  });
  if (response !== 1) return;
  await session.fromPartition(`persist:${key}`).clearStorageData();
  appendLog('actions.log', `reset-session ${affected.map((s) => s.id).join(',')}`);
  for (const s of affected) views.get(s.id).webContents.loadURL(s.url);
}

// Snapshot of the pixels behind the overlay. The panel blurs it with CSS, because
// backdrop-filter cannot see other views. Cleared whenever the overlay hides.
let backdrop = null;
let overlayToken = 0;

async function captureBackdrop() {
  const o = overlay.getBounds();
  const tiles = [];
  for (const [id, view] of views) {
    if (id !== primaryId && id !== secondaryId) continue;
    const b = view.getBounds();
    const x1 = Math.max(o.x, b.x);
    const y1 = Math.max(o.y, b.y);
    const x2 = Math.min(o.x + o.width, b.x + b.width);
    const y2 = Math.min(o.y + o.height, b.y + b.height);
    if (x2 <= x1 || y2 <= y1) continue;
    const image = await view.webContents.capturePage({
      x: x1 - b.x,
      y: y1 - b.y,
      width: x2 - x1,
      height: y2 - y1,
    });
    tiles.push({ src: image.toDataURL(), left: x1 - o.x, top: y1 - o.y, width: x2 - x1, height: y2 - y1 });
  }
  return tiles;
}

async function showOverlay(payload) {
  const token = ++overlayToken;
  let fresh;
  if (!backdrop) {
    const tiles = await captureBackdrop().catch(() => []);
    if (token !== overlayToken) return; // hidden or replaced while capturing
    backdrop = tiles;
    fresh = tiles;
  }
  overlay.webContents.send('overlay', { ...payload, backdrop: fresh });
  overlay.setVisible(true);
}

function hideOverlay() {
  overlayToken++;
  backdrop = null;
  overlay.setVisible(false);
}

function setPrefix(state) {
  prefixState = state;
  clearTimeout(prefixTimer);
  if (!state) {
    if (!switcher) hideOverlay();
    return;
  }
  prefixTimer = setTimeout(() => setPrefix(null), PREFIX_TIMEOUT_MS);
  showOverlay({ mode: state, services: services.map(({ id, name }) => ({ id, name })) });
}

function selectService(id, split) {
  if (!views.has(id)) return;
  const previousId = primaryId;
  const wasSingle = !secondaryId;
  if (split && id !== primaryId) {
    secondaryId = secondaryId === id ? null : id;
  } else {
    primaryId = id;
    if (secondaryId === id) secondaryId = null;
    recent.splice(recent.indexOf(id), 1);
    recent.unshift(id);
  }
  const slide = !split && wasSingle && !secondaryId && previousId && previousId !== id ? { fromId: previousId, toId: id } : null;
  layout({ slide });
  // Hiding a view leaves keyboard focus nowhere, so hand it to the pane the user just picked.
  const focusId = split && secondaryId ? secondaryId : primaryId;
  activeId = focusId;
  views.get(focusId).webContents.focus();
}

function showSwitcher() {
  const byId = new Map(services.map((s) => [s.id, s]));
  showOverlay({
    mode: 'switch',
    selectedId: recent[switcher.index],
    services: recent.map((id) => ({ id, name: byId.get(id).name })),
  });
  clearTimeout(switcherTimer);
  switcherTimer = setTimeout(closeSwitcher, SWITCHER_TIMEOUT_MS);
}

function stepSwitcher(step, hold) {
  setPrefix(null);
  if (!recent.length) return;
  switcher = switcher ?? { index: 0, hold };
  switcher.index = (switcher.index + step + recent.length) % recent.length;
  showSwitcher();
}

function closeSwitcher() {
  clearTimeout(switcherTimer);
  switcher = null;
  hideOverlay();
}

function commitSwitcher() {
  const id = recent[switcher.index];
  closeSwitcher();
  selectService(id, false);
}

const MODIFIER_KEYS = new Set(['Meta', 'Shift', 'Control', 'Alt']);
// Prefix + key acts on the focused pane's page.
const PREFIX_NAV = { p: 'back', n: 'forward', r: 'reload', h: 'home' };

// tmux-style prefix: Cmd+R, then b (toggle tab bar), s (split, then pick a number),
// x (close split), 1-9 (switch primary), p/n (back/forward), r (reload), h (home), c (reset login), Esc (cancel).
function handleKey(event, input) {
  // Releasing Ctrl confirms the Ctrl+Tab switcher.
  if (input.type === 'keyUp') {
    if (switcher && input.key === switcher.hold) commitSwitcher();
    return;
  }
  if (input.type !== 'keyDown') return;

  // Cmd+` never reaches the app (macOS "Move focus to next window" takes it), so Ctrl+Tab is used.
  if (input.control && !input.alt && !input.meta && input.code === 'Tab') {
    event.preventDefault();
    stepSwitcher(input.shift ? -1 : 1, 'Control');
    return;
  }
  if (switcher && input.key === 'Escape') {
    event.preventDefault();
    closeSwitcher();
    return;
  }
  if (MODIFIER_KEYS.has(input.key)) return;

  const isPrefixKey =
    input.meta && !input.shift && !input.alt && !input.control && input.key.toLowerCase() === 'r';
  if (isPrefixKey) {
    event.preventDefault();
    setPrefix(prefixState ? null : 'prefix');
    return;
  }
  if (!prefixState) return;

  event.preventDefault();
  const key = input.key.toLowerCase();
  const number = /^[1-9]$/.test(key) ? Number(key) : null;
  const target = number ? services[number - 1] : null;

  if (prefixState === 'split') {
    if (target) selectService(target.id, true);
    setPrefix(null);
    return;
  }

  if (key === 'b') {
    tabsVisible = !tabsVisible;
    layout();
    setPrefix(null);
  } else if (key === 's') {
    setPrefix('split');
  } else if (key === 'x') {
    secondaryId = null;
    layout();
    setPrefix(null);
  } else if (PREFIX_NAV[key]) {
    navigate(PREFIX_NAV[key]);
    setPrefix(null);
  } else if (key === 'c') {
    setPrefix(null);
    resetSession();
  } else if (target) {
    selectService(target.id, false);
    setPrefix(null);
  } else {
    setPrefix(null);
  }
}

function createUiView(file) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  view.webContents.on('before-input-event', handleKey);
  view.webContents.loadFile(file);
  return view;
}

function createWindow() {
  chromeUA = session.defaultSession
    .getUserAgent()
    .replace(/\sElectron\/\S+/, '')
    .replace(new RegExp(`\\s${app.getName()}/\\S+`), '');

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  );

  win = new BaseWindow({
    width: 1400,
    height: 900,
    title: 'WorkHub',
    backgroundColor: BG,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 14, y: 16 },
  });

  chrome = createUiView('tabs.html');
  win.contentView.addChildView(chrome);
  chrome.webContents.once('did-finish-load', () => {
    sendServices();
    layout();
  });

  for (const service of services) {
    const view = createServiceView(service);
    views.set(service.id, view);
    win.contentView.addChildView(view);
  }
  if (recent.length) {
    primaryId = recent[0];
    activeId = primaryId;
  }

  terminal = registerTerminal(() => terminalView?.webContents);
  app.on('before-quit', () => terminal.kill());

  // Added last so it stays above the service views.
  overlay = createUiView('overlay.html');
  overlay.setBackgroundColor('#00000000'); // transparent so the glass panel's rounded edge and shadow show
  overlay.setVisible(false);
  win.contentView.addChildView(overlay);

  win.on('resize', () => layout());
  layout();
}

const userFile = () => path.join(app.getPath('userData'), 'services.json');

function sendServices() {
  chrome.webContents.send(
    'services',
    services.map(({ id, name, icon, color }) => ({ id, name, icon, color })),
  );
}

function addService(entry) {
  services.push(entry);
  recent.push(entry.id);
  const view = createServiceView(entry);
  views.set(entry.id, view);
  win.contentView.addChildView(view);
  win.contentView.addChildView(overlay); // keep the overlay above the new view
  if (sheet) win.contentView.addChildView(sheet);
  store.save(userFile(), services);
  sendServices();
  selectService(entry.id, false);
}

function removeService(id) {
  const index = services.findIndex((s) => s.id === id);
  if (index === -1) return;
  const view = views.get(id);
  if (view === terminalView) {
    terminal.kill();
    terminalView = null;
    terminalLoaded = false;
  }
  win.contentView.removeChildView(view);
  view.webContents.close();
  views.delete(id);
  services.splice(index, 1);
  recent.splice(recent.indexOf(id), 1);
  if (secondaryId === id) secondaryId = null;
  if (primaryId === id) {
    primaryId = recent[0] ?? null;
    secondaryId = secondaryId === primaryId ? null : secondaryId;
  }
  if (activeId === id) activeId = primaryId;
  store.save(userFile(), services);
  sendServices();
  layout();
  if (primaryId) views.get(primaryId).webContents.focus();
}

// The add-site form is a sheet over the whole window, created the first time it is needed.
let sheet = null;
let sheetOpen = false;

function openSheet() {
  if (!sheet) {
    sheet = new WebContentsView({
      webPreferences: { preload: path.join(__dirname, 'sheet-preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    sheet.setBackgroundColor('#00000000');
    sheet.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    sheet.webContents.on('will-navigate', (event) => event.preventDefault());
    sheet.webContents.loadFile('add-site.html');
  }
  win.contentView.addChildView(sheet); // raises it above everything else
  sheetOpen = true;
  sheet.setVisible(true);
  layout();
  sheet.webContents.send('sheet:reset');
  sheet.webContents.focus();
}

function closeSheet() {
  if (!sheet || !sheetOpen) return;
  sheetOpen = false;
  sheet.setVisible(false);
  const view = views.get(activeId);
  if (view) view.webContents.focus();
}

function showTabMenu(id) {
  if (!views.has(id)) return;
  Menu.buildFromTemplate([
    { label: 'Muat ulang', click: () => views.get(id)?.webContents.reload() },
    { type: 'separator' },
    { label: 'Hapus tab', click: () => removeService(id) },
  ]).popup();
}

// Anything that can reach these handlers can add tabs or run a shell, so each one checks the sender.
const fromView = (view, event) => Boolean(view) && event.sender === view.webContents && event.senderFrame === view.webContents.mainFrame;

// Click = open as primary. Shift-click = open beside the primary (split).
ipcMain.on('select', (event, payload) => {
  if (!fromView(chrome, event) || !payload || typeof payload.id !== 'string') return;
  selectService(payload.id, payload.split === true);
});
ipcMain.on('ui:add-site', (event) => {
  if (fromView(chrome, event)) openSheet();
});
ipcMain.on('tab:context', (event, id) => {
  if (fromView(chrome, event) && typeof id === 'string') showTabMenu(id);
});
ipcMain.on('sheet:close', (event) => {
  if (fromView(sheet, event)) closeSheet();
});
ipcMain.handle('site:add', (event, form) => {
  if (!fromView(sheet, event)) return { ok: false, error: 'Tidak diizinkan.' };
  try {
    addService(store.createEntry(form, services));
    closeSheet();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

app.whenReady().then(() => {
  services.push(...store.load(userFile()));
  recent.push(...services.map((s) => s.id));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
