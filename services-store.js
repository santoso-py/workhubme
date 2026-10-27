// The user's tab list: validation, defaults, and reading/writing services.json.
// Kept free of Electron imports so it can be tested with plain Node.
const fs = require('node:fs');
const path = require('node:path');
const { isValidPattern } = require('./badge');

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const COLORS = ['#4ca25a', '#d93a31', '#3a63e0', '#8b3fe0', '#e8742c', '#1f9d8f', '#d6336c', '#7a5af8'];
const MAX_NAME = 30;
const MAX_EXTRA_HOSTS = 10;

// "Login with Google" adds these hosts and one shared session, so Gmail, Drive and others
// signed in through Google share a single login.
const GOOGLE = { hosts: ['google.com', 'gstatic.com', 'googleusercontent.com', 'youtube.com'], partition: 'google' };

// A validation failure with a stable code; the main process turns it into a message in the user's language.
class UserError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

const isHostname = (value) => typeof value === 'string' && HOSTNAME.test(value);

function parseHttpsUrl(raw) {
  let text = String(raw ?? '').trim();
  if (!text) throw new UserError('urlRequired');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new UserError('urlInvalid');
  }
  if (url.protocol !== 'https:') throw new UserError('httpsOnly');
  if (!isHostname(url.hostname)) throw new UserError('domainOnly');
  return url;
}

const slug = (name) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'tab';

function uniqueId(base, existing) {
  const taken = new Set(existing.map((s) => s.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Turns the add-site form into a service entry, or throws a UserError.
function createEntry(form, existing) {
  if (!form || typeof form !== 'object') throw new UserError('dataInvalid');
  const name = String(form.name ?? '').trim();
  if (!name) throw new UserError('nameRequired');
  if (name.length > MAX_NAME) throw new UserError('nameTooLong', { max: MAX_NAME });

  const color = typeof form.color === 'string' && /^#[0-9a-f]{6}$/i.test(form.color) ? form.color : COLORS[existing.length % COLORS.length];

  if (form.type === 'terminal') {
    if (existing.some((s) => s.type === 'terminal')) throw new UserError('terminalExists');
    return { id: uniqueId('terminal', existing), name, type: 'terminal', icon: 'terminal.svg', color };
  }

  const url = parseHttpsUrl(form.url);
  const extras = String(form.extraHosts ?? '')
    .split(/[\s,]+/)
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (extras.length > MAX_EXTRA_HOSTS) throw new UserError('extraTooMany', { max: MAX_EXTRA_HOSTS });
  const bad = extras.find((h) => !isHostname(h));
  if (bad) throw new UserError('extraInvalid', { host: bad });

  // Badge: empty/'auto' = automatic (stored as nothing), 'off', or a custom pattern.
  const badgeInput = String(form.badge ?? '').trim();
  if (badgeInput && badgeInput !== 'auto' && badgeInput !== 'off' && !isValidPattern(badgeInput)) throw new UserError('badgeInvalid');

  const googleLogin = form.googleLogin === true;
  const hosts = [...new Set([url.hostname.toLowerCase(), ...extras, ...(googleLogin ? GOOGLE.hosts : [])])];
  const entry = { id: uniqueId(slug(name), existing), name, url: url.href, hosts, color };
  if (googleLogin) Object.assign(entry, { partition: GOOGLE.partition, googleLogin: true });
  if (badgeInput && badgeInput !== 'auto') entry.badge = badgeInput;
  return entry;
}

// Re-validates an entry read from disk. Hand-edited files must not be able to widen what a view may do.
function normalizeStored(raw) {
  try {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(raw.id)) return null;
    const name = String(raw.name ?? '').trim().slice(0, MAX_NAME);
    if (!name) return null;
    const entry = { id: raw.id, name };
    if (typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)) entry.color = raw.color;
    if (typeof raw.icon === 'string' && /^[a-z0-9._-]+\.(svg|png)$/i.test(raw.icon)) entry.icon = raw.icon;
    if (raw.type === 'terminal') return { ...entry, type: 'terminal' };
    const url = parseHttpsUrl(raw.url);
    const hosts = Array.isArray(raw.hosts) ? raw.hosts.map((h) => String(h).toLowerCase()).filter(isHostname) : [];
    Object.assign(entry, { url: url.href, hosts: [...new Set([url.hostname.toLowerCase(), ...hosts])] });
    if (typeof raw.partition === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.partition)) entry.partition = raw.partition;
    if (raw.googleLogin === true) entry.googleLogin = true;
    if (raw.badge === 'off' || (typeof raw.badge === 'string' && raw.badge !== 'auto' && isValidPattern(raw.badge))) entry.badge = raw.badge; // anything else falls back to automatic
    return entry;
  } catch {
    return null;
  }
}

function load(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return []; // missing or unreadable: start empty
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const list = [];
  for (const raw of parsed) {
    const entry = normalizeStored(raw);
    if (!entry || seen.has(entry.id)) continue;
    if (entry.type === 'terminal' && list.some((s) => s.type === 'terminal')) continue;
    seen.add(entry.id);
    list.push(entry);
  }
  return list;
}

function save(file, list) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`);
  fs.renameSync(tmp, file); // replace in one step so a crash cannot leave half a file
}

module.exports = { createEntry, load, save, GOOGLE, UserError };
