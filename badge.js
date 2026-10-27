// Reads an unread count from a page title ("(3) Chat", "Inbox (12) - me@example.com"). Pure: no Electron,
// so it can be tested with plain Node. A tab's `badge` setting is 'auto' (default), 'off', or a custom pattern.
const MAX_TITLE = 200; // page titles are untrusted input; never run a pattern over more than this
const MAX_PATTERN = 80;

// Automatic mode only knows two conventions, on purpose: a leading "(N)" and a mail inbox heading.
// Anything broader would turn "Report (2)" or "Chapter (3)" into a fake unread count.
const AUTO_PATTERNS = [/^\((\d{1,3})\+?\)/, /^(?:Inbox|Kotak Masuk|受信トレイ) \((\d{1,3})\)/];

const compiled = new Map();

class BadgePatternError extends Error {}

// A custom pattern must be small, have a capture group, and avoid shapes that can backtrack forever.
function compilePattern(source) {
  if (compiled.has(source)) return compiled.get(source);
  if (typeof source !== 'string' || source.length === 0 || source.length > MAX_PATTERN) throw new BadgePatternError('length');
  if (/\)[+*]|\)\{|\)\?[+*{]|\\[1-9]|\(\?[<=!]/.test(source)) throw new BadgePatternError('unsafe');
  let regex;
  try {
    regex = new RegExp(source);
  } catch {
    throw new BadgePatternError('syntax');
  }
  if (new RegExp(`${source}|`).exec('').length < 2) throw new BadgePatternError('group');
  compiled.set(source, regex);
  return regex;
}

const isValidPattern = (source) => {
  try {
    compilePattern(source);
    return true;
  } catch {
    return false;
  }
};

// mode: undefined | 'auto' | 'off' | custom pattern string. Returns a whole number >= 0.
function parseBadge(mode, title) {
  if (mode === 'off' || typeof title !== 'string') return 0;
  const text = title.slice(0, MAX_TITLE);
  const patterns = mode === undefined || mode === 'auto' ? AUTO_PATTERNS : [compilePattern(mode)];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1] !== undefined && /^\d{1,6}$/.test(match[1])) return Number(match[1]);
  }
  return 0;
}

// "99+" style label; the Dock tile has room for more digits than a tab pill.
const formatBadge = (count, max = 99) => (count > max ? `${max}+` : String(count));

module.exports = { parseBadge, formatBadge, isValidPattern, BadgePatternError, MAX_PATTERN };
