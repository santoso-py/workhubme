// Optional privacy blur for chat apps: a stylesheet that blurs the chat list and the messages, and lifts the blur
// on the item under the mouse. Display only: nothing is hidden from the page, and no script is injected.
// The WhatsApp selectors live here, in one place, because WhatsApp changes its page now and then; a tab can
// also carry its own "blurSelectors" in services.json, which win over the built-in preset.
const PRESETS = {
  // Chat list rows and conversation rows. Unverified against the live page: if a part stays sharp, WhatsApp changed.
  'web.whatsapp.com': ['#pane-side [role="listitem"]', '#pane-side [role="row"]', '#main [role="row"]'],
};
const LEVELS = { light: 4, medium: 8, strong: 14 };
const MAX_SELECTORS = 10;
const MAX_SELECTOR_LENGTH = 120;

// Selectors end up inside a stylesheet, so only a plain CSS selector alphabet is accepted: no braces, semicolons,
// backslashes, comments, at-rules or commas.
const isSafeSelector = (s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_SELECTOR_LENGTH && /^[#.\w\s>\[\]="':*~+()-]+$/.test(s);

function selectorsFor(service) {
  const own = Array.isArray(service.blurSelectors) ? service.blurSelectors.filter(isSafeSelector).slice(0, MAX_SELECTORS) : [];
  if (own.length) return own;
  try {
    return PRESETS[new URL(service.url).hostname] ?? [];
  } catch {
    return [];
  }
}

function buildCss(selectors, level) {
  const px = LEVELS[level] ?? LEVELS.medium;
  const safe = selectors.filter(isSafeSelector);
  if (!safe.length) return '';
  return `${safe.join(',\n')} { filter: blur(${px}px) !important; transition: filter .15s ease !important; }\n${safe.map((s) => `${s}:hover`).join(',\n')} { filter: none !important; }\n`;
}

module.exports = { PRESETS, LEVELS, MAX_SELECTORS, isSafeSelector, selectorsFor, buildCss };
