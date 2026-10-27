// User preferences (settings.json). Free of Electron imports so it can be tested with plain Node.
const fs = require('node:fs');
const path = require('node:path');
const { parseVersion } = require('./updates');

const DEFAULTS = { language: null, swipe: false, swipeInvert: false, badges: true, dockBadge: true, lastSeenVersion: null };
const LANGUAGES = ['id', 'en', 'ja'];

// Anything unknown or malformed falls back to the default; the file can be hand-edited.
function normalize(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    language: LANGUAGES.includes(input.language) ? input.language : DEFAULTS.language,
    swipe: input.swipe === true,
    swipeInvert: input.swipeInvert === true,
    badges: input.badges !== false, // on unless explicitly switched off
    dockBadge: input.dockBadge !== false,
    lastSeenVersion: parseVersion(input.lastSeenVersion)?.join('.') ?? null, // set by the app, used for the "updated" notice
  };
}

function load(file) {
  try {
    return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return { ...DEFAULTS };
  }
}

function save(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(normalize(settings), null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// Applies a partial update from the settings page; unknown keys and bad values are ignored.
function merge(current, patch) {
  const next = { ...current };
  if (patch && typeof patch === 'object') {
    if (LANGUAGES.includes(patch.language)) next.language = patch.language;
    if (typeof patch.swipe === 'boolean') next.swipe = patch.swipe;
    if (typeof patch.swipeInvert === 'boolean') next.swipeInvert = patch.swipeInvert;
    if (typeof patch.badges === 'boolean') next.badges = patch.badges;
    if (typeof patch.dockBadge === 'boolean') next.dockBadge = patch.dockBadge;
    if (parseVersion(patch.lastSeenVersion)) next.lastSeenVersion = parseVersion(patch.lastSeenVersion).join('.');
  }
  return next;
}

module.exports = { DEFAULTS, LANGUAGES, load, save, merge, normalize };
