const { app, BaseWindow, WebContentsView, Menu, dialog, net, session, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { registerTerminal } = require('./terminal');
const store = require('./services-store');
const settingsStore = require('./settings-store');
const I18N = require('./i18n');
const { createSwipeDetector } = require('./gesture');
const { parseBadge, formatBadge } = require('./badge');
const updates = require('./updates');
const blur = require('./blur');
const pkg = require('./package.json');

// The user's tabs, read from userData/services.json once the app is ready. Mutated in place.
const services = [];

const TABS_HEIGHT = 52; // tab strip above the pages
const MARGIN = 12; // outer margin around the pages
const GAP = 8; // gap between split panes
const RADIUS = 12; // service view corners
const SLIDE_MS = 260;
const BG = '#eceef1';
const PREFIX_TIMEOUT_MS = 4000;
const OVERLAY_SIZE = { width: 560, height: 172 };

let chromeUA;
let win;
let chrome; // full-window UI view: the tab strip, below the service views
let overlay;
const views = new Map(); // serviceId -> WebContentsView
let primaryId = null; // null while there are no tabs
let secondaryId = null;
let activeId = null; // pane that last had focus; back/reload/home act on it
let tabsVisible = true;

// Preferences (settings.json) and the active UI language. `lang` follows the system locale until the user picks one.
let settings = { ...settingsStore.DEFAULTS };
let lang = 'en';
const T = (key, params) => I18N.t(lang, key, params);
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const DEBUG_SWIPE = process.env.WORKHUB_DEBUG_SWIPE === '1';
const NO_OPEN = process.env.WORKHUB_NO_OPEN === '1'; // tests: record links instead of opening the browser
const NO_DOCK = process.env.WORKHUB_NO_DOCK === '1'; // tests: record the Dock label instead of touching the real Dock icon

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
      preload: path.join(__dirname, 'wheel-preload.js'), // forwards scroll amounts only, see that file
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  websiteContents.add(view.webContents);

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
  // Unread counts come from the page title, so nothing is injected into the page.
  view.webContents.on('page-title-updated', (_event, title) => updateBadge(service, title));
  view.webContents.on('dom-ready', () => applyBlur(service)); // the stylesheet is gone after every page load
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

// Unread badges: the count parsed from each tab's page title, shown on the tab and summed on the Dock icon.
const badgeCounts = new Map(); // serviceId -> count (only tabs with a non-zero count)

let lastDockLabel = null;

function setDockBadge(label) {
  if (label === lastDockLabel) return; // the Dock only needs to hear about changes
  lastDockLabel = label;
  if (NO_DOCK) {
    appendLog('actions.log', `dock-badge "${label}"`); // lets tests see the label without touching the real Dock tile
    return;
  }
  app.dock?.setBadge(label);
}

function publishBadges() {
  const labels = {};
  if (settings.badges) for (const [id, count] of badgeCounts) labels[id] = formatBadge(count);
  chrome?.webContents.send('badges', labels);
  const total = settings.badges && settings.dockBadge ? [...badgeCounts.values()].reduce((sum, n) => sum + n, 0) : 0;
  setDockBadge(total ? formatBadge(total, 999) : '');
}

function updateBadge(service, title) {
  let count = 0;
  try {
    count = parseBadge(service.badge, title);
  } catch {
    count = 0; // a pattern that fails to compile is treated as "no count", never as a crash
  }
  if ((badgeCounts.get(service.id) ?? 0) === count) return;
  if (count) badgeCounts.set(service.id, count);
  else badgeCounts.delete(service.id);
  publishBadges();
}

// Privacy blur: a stylesheet inserted into tabs that have blur selectors (WhatsApp has a built-in preset).
const blurKeys = new Map(); // serviceId -> key of the inserted stylesheet, so it can be removed again

async function applyBlur(service) {
  const view = views.get(service.id);
  if (!view || service.type === 'terminal' || view.webContents.isDestroyed()) return;
  const contents = view.webContents;
  const previous = blurKeys.get(service.id);
  if (previous) {
    blurKeys.delete(service.id);
    await contents.removeInsertedCSS(previous).catch(() => {}); // already gone after a reload
  }
  const selectors = blur.selectorsFor(service);
  if (!settings.chatBlur || selectors.length === 0) return;
  try {
    blurKeys.set(service.id, await contents.insertCSS(blur.buildCss(selectors, settings.chatBlurLevel)));
  } catch {
    // the page was closed while the stylesheet was being added
  }
}

const applyBlurAll = () => services.forEach((service) => applyBlur(service));

// Two-finger swipe moves to the neighbouring tab. It reads wheel events natively (no script is
// injected into pages) and is off unless the user turns it on in Settings.
const swipeDetector = createSwipeDetector();
const websiteContents = new Set(); // webContents of website tabs, the only senders of swipe:wheel
let wheelSeen = false;
let debugSwipeLines = 0;

function stepTab(step) {
  const index = services.findIndex((s) => s.id === primaryId);
  const next = services[index + step];
  if (index === -1 || !next) return; // no wrap-around: the ends stay put
  appendLog('actions.log', `swipe ${step > 0 ? 'next' : 'previous'} ${primaryId} -> ${next.id}`);
  selectService(next.id, false);
}

function onWheel(mouse) {
  if (mouse.type !== 'mouseWheel') return;
  if (settings.swipe && !wheelSeen) {
    wheelSeen = true; // proof in actions.log that scroll events reach the app at all
    appendLog('actions.log', `wheel events are arriving (first: dx=${mouse.deltaX} dy=${mouse.deltaY})`);
  }
  if (DEBUG_SWIPE && debugSwipeLines < 400) {
    debugSwipeLines += 1;
    appendLog('swipe-debug.log', `dx=${mouse.deltaX} dy=${mouse.deltaY} ticksX=${mouse.wheelTicksX} precise=${mouse.hasPreciseScrollingDeltas}`);
  }
  if (!settings.swipe || sheets.some((s) => s.open)) return;
  const direction = swipeDetector.feed(mouse.deltaX ?? 0, mouse.deltaY ?? 0, Date.now());
  if (!direction) return;
  // Negative x is the fingers moving right with natural scrolling: that goes to the next tab.
  const toNext = (direction === 'left') !== settings.swipeInvert;
  stepTab(toNext ? 1 : -1);
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
  for (const s of sheets) if (s.view && s.open) s.view.setBounds({ x: 0, y: 0, width, height });
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
    buttons: [T('reset.cancel'), T('reset.confirm')],
    defaultId: 0,
    cancelId: 0,
    message: T('reset.message', { names: affected.map((s) => s.name).join(', ') }),
    detail: T('reset.detail'),
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
let overlayMode = null; // 'prefix' | 'split' | 'switch' | 'updated' while the overlay is showing

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
  overlayMode = payload.mode;
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
  overlayMode = null;
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
// x (close split), 1-9 (switch primary), p/n (back/forward), r (reload), h (home), c (reset login),
// , (settings), ? (help and what's new), Esc (cancel).
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
  } else if (key === ',') {
    setPrefix(null);
    openSheet(settingsSheet);
  } else if (key === 'v') {
    setPrefix(null);
    applySettings({ chatBlur: !settings.chatBlur });
  } else if (key === '?') {
    setPrefix(null);
    openSheet(helpSheet);
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

  buildMenu();

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
    setTimeout(announceUpdate, 1200);
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

  terminal = registerTerminal(() => terminalView?.webContents, T);
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
  publishBadges();
}

function addService(entry) {
  services.push(entry);
  recent.push(entry.id);
  const view = createServiceView(entry);
  views.set(entry.id, view);
  win.contentView.addChildView(view);
  win.contentView.addChildView(overlay); // keep the overlay above the new view
  for (const s of sheets) if (s.view) win.contentView.addChildView(s.view);
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
  websiteContents.delete(view.webContents);
  badgeCounts.delete(id);
  blurKeys.delete(id);
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

// Sheets (add-site form, settings) are views over the whole window, created the first time they are needed.
const makeSheet = (file, preload) => ({ file, preload, view: null, open: false });
const addSheet = makeSheet('add-site.html', 'sheet-preload.js');
const settingsSheet = makeSheet('settings.html', 'settings-preload.js');
const helpSheet = makeSheet('help.html', 'help-preload.js');
const sheets = [addSheet, settingsSheet, helpSheet];

function openSheet(target) {
  for (const other of sheets) if (other !== target && other.open) closeSheet(other, false);
  if (!target.view) {
    target.view = new WebContentsView({
      webPreferences: { preload: path.join(__dirname, target.preload), nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    target.view.setBackgroundColor('#00000000');
    target.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    target.view.webContents.on('will-navigate', (event) => event.preventDefault());
    target.view.webContents.loadFile(target.file);
  }
  win.contentView.addChildView(target.view); // raises it above everything else
  target.open = true;
  target.view.setVisible(true);
  layout();
  target.view.webContents.send('sheet:reset');
  target.view.webContents.focus();
}

function closeSheet(target, refocus = true) {
  if (!target.view || !target.open) return;
  target.open = false;
  target.view.setVisible(false);
  if (refocus) views.get(activeId)?.webContents.focus();
}

function showTabMenu(id) {
  if (!views.has(id)) return;
  Menu.buildFromTemplate([
    { label: T('menu.reload'), click: () => views.get(id)?.webContents.reload() },
    { type: 'separator' },
    { label: T('menu.remove'), click: () => removeService(id) },
  ]).popup();
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: T('menu.settings'), accelerator: 'Command+,', click: () => openSheet(settingsSheet) },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      { role: 'windowMenu' },
      { role: 'help', submenu: [{ label: T('menu.help'), click: () => openSheet(helpSheet) }] },
    ]),
  );
}

// Every UI view that shows text; they all receive the language and its changes.
const uiViews = () => [chrome, overlay, terminalView, ...sheets.map((s) => s.view)].filter(Boolean);

function applySettings(patch) {
  settings = settingsStore.merge(settings, patch);
  settingsStore.save(settingsFile(), settings);
  lang = settings.language ?? I18N.pick(app.getLocale());
  buildMenu();
  publishBadges(); // the badge switches may have changed
  applyBlurAll();
  for (const view of uiViews()) if (!view.webContents.isDestroyed()) view.webContents.send('lang', lang);
}

const settingsSnapshot = () => ({ language: lang, languages: I18N.LANGS, swipe: settings.swipe, swipeInvert: settings.swipeInvert, badges: settings.badges, dockBadge: settings.dockBadge, chatBlur: settings.chatBlur, chatBlurLevel: settings.chatBlurLevel });

// Turns a validation failure into a message in the active language.
const userMessage = (error) => (error instanceof store.UserError ? T(`err.${error.code}`, error.params) : T('err.dataInvalid'));

// ---- Help sheet, release notes and the update check ------------------------------------------------
// The check is the only network request the app makes on its own behalf, and only when the user presses
// "Check for updates". Nothing is downloaded or run: the reply is reduced to a version, a link inside this
// repository, and plain text (see updates.js).
const UPDATE_REPO = (() => {
  const url = String(pkg.repository?.url ?? pkg.repository ?? '');
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  return match && updates.isRepo(match[1]) ? match[1] : 'santoso-py/workhubme';
})();
const changelog = updates.cleanChangelog(require('./changelog.json'));
let lastRelease = null; // the release found by the last check; the only link the Help sheet may open

async function checkForUpdates() {
  const url = process.env.WORKHUB_UPDATE_URL || updates.apiUrl(UPDATE_REPO); // the override is for tests
  const timeoutMs = Number(process.env.WORKHUB_UPDATE_TIMEOUT_MS) || 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const current = app.getVersion();
  try {
    const response = await net.fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `${app.name}/${current}`, 'Accept-Language': 'en' }, // a fixed language, so the system locale is not sent
      signal: controller.signal,
    });
    if (response.status === 404) return { status: 'none', current };
    if (!response.ok) return { status: 'error' };
    const text = await response.text();
    if (text.length > 200_000) return { status: 'error' };
    const release = updates.parseRelease(JSON.parse(text), UPDATE_REPO);
    if (!release) return { status: 'error' };
    lastRelease = release;
    return updates.isNewer(release.version, current)
      ? { status: 'available', current, latest: release.version, notes: release.notes }
      : { status: 'current', current };
  } catch {
    return { status: 'error' }; // offline, timed out, or an unreadable reply: say so and carry on
  } finally {
    clearTimeout(timer);
  }
}

function openExternalChecked(url) {
  if (typeof url !== 'string' || !url.startsWith(`${updates.repoUrl(UPDATE_REPO)}`)) return;
  if (NO_OPEN) appendLog('actions.log', `open-external ${url}`);
  else shell.openExternal(url);
}

// After an upgrade, a short notice points to what's new. A first run only records the version.
function announceUpdate() {
  const current = app.getVersion();
  const seen = settings.lastSeenVersion;
  if (seen === current) return;
  settings = settingsStore.merge(settings, { lastSeenVersion: current });
  settingsStore.save(settingsFile(), settings);
  if (!seen) return;
  showOverlay({ mode: 'updated', version: current, services: [] });
  setTimeout(() => {
    if (overlayMode === 'updated') hideOverlay();
  }, 8000);
}

// Anything that can reach these handlers can add tabs or run a shell, so each one checks the sender.
const fromView = (view, event) => Boolean(view) && event.sender === view.webContents && event.senderFrame === view.webContents.mainFrame;

// Click = open as primary. Shift-click = open beside the primary (split).
ipcMain.on('select', (event, payload) => {
  if (!fromView(chrome, event) || !payload || typeof payload.id !== 'string') return;
  selectService(payload.id, payload.split === true);
});
ipcMain.on('swipe:wheel', (event, dx, dy) => {
  // Numbers only, from a website tab's own page.
  if (!websiteContents.has(event.sender) || event.senderFrame !== event.sender.mainFrame) return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const clamp = (n) => Math.max(-5000, Math.min(5000, n));
  onWheel({ type: 'mouseWheel', deltaX: clamp(dx), deltaY: clamp(dy) });
});
ipcMain.on('ui:add-site', (event) => {
  if (fromView(chrome, event)) openSheet(addSheet);
});
ipcMain.on('ui:set-language', (event, code) => {
  // The first-run screen lets the user pick the language; settingsStore.merge ignores anything but id/en/ja.
  if (fromView(chrome, event) && typeof code === 'string') applySettings({ language: code });
});
ipcMain.on('tab:context', (event, id) => {
  if (fromView(chrome, event) && typeof id === 'string') showTabMenu(id);
});
ipcMain.on('sheet:close', (event) => {
  const target = sheets.find((s) => fromView(s.view, event));
  if (target) closeSheet(target);
});
ipcMain.handle('site:add', (event, form) => {
  if (!fromView(addSheet.view, event)) return { ok: false, error: T('err.notAllowed') };
  try {
    addService(store.createEntry(form, services));
    closeSheet(addSheet);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
});
ipcMain.handle('settings:get', (event) => (fromView(settingsSheet.view, event) ? settingsSnapshot() : null));
ipcMain.handle('settings:set', (event, patch) => {
  if (!fromView(settingsSheet.view, event)) return { ok: false };
  applySettings(patch);
  return { ok: true, settings: settingsSnapshot() };
});
ipcMain.on('sheet:open-help', (event) => {
  if (fromView(settingsSheet.view, event)) openSheet(helpSheet);
});
ipcMain.handle('help:get', (event) => (fromView(helpSheet.view, event) ? { version: app.getVersion(), changelog, repoUrl: updates.repoUrl(UPDATE_REPO) } : null));
ipcMain.handle('help:check-updates', (event) => (fromView(helpSheet.view, event) ? checkForUpdates() : { status: 'error' }));
ipcMain.on('help:open-release', (event) => {
  if (fromView(helpSheet.view, event) && lastRelease) openExternalChecked(lastRelease.url);
});
ipcMain.on('help:open-project', (event) => {
  if (fromView(helpSheet.view, event)) openExternalChecked(updates.repoUrl(UPDATE_REPO));
});
ipcMain.handle('i18n:lang', (event) => (uiViews().some((v) => fromView(v, event)) ? lang : null));

app.whenReady().then(() => {
  settings = settingsStore.load(settingsFile());
  lang = settings.language ?? I18N.pick(app.getLocale());
  services.push(...store.load(userFile()));
  recent.push(...services.map((s) => s.id));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
