// Update check helpers: version comparison, a strict reader for GitHub's "latest release" JSON, and the
// bundled changelog. Pure (no Electron, no network) so it can be tested with plain Node.
const MAX_NOTES = 1500;
const MAX_ITEM = 300;
const SEMVER = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;
const LANGS = ['en', 'id', 'ja'];

function parseVersion(text) {
  const match = typeof text === 'string' ? SEMVER.exec(text.trim()) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

// True only when both are valid versions and `latest` is higher. Anything odd means "not newer".
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

const isRepo = (repo) => typeof repo === 'string' && /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/.test(repo);
const apiUrl = (repo) => `https://api.github.com/repos/${repo}/releases/latest`;
const repoUrl = (repo) => `https://github.com/${repo}`;

// GitHub's answer is untrusted input. Only a clean version number, a link inside this repository, and
// plain text come out; nothing is ever rendered as HTML or run.
function parseRelease(json, repo) {
  if (!isRepo(repo) || !json || typeof json !== 'object' || json.draft === true || json.prerelease === true) return null;
  const version = parseVersion(json.tag_name);
  if (!version) return null;
  const url = typeof json.html_url === 'string' ? json.html_url : '';
  if (!url.startsWith(`${repoUrl(repo)}/`) || /[\s<>"]/.test(url) || url.length > 300) return null;
  const notes = typeof json.body === 'string' ? json.body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, MAX_NOTES) : '';
  return { version: version.join('.'), url, notes };
}

// The changelog ships with the app. Entries that are malformed are dropped rather than trusted.
function cleanChangelog(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || !parseVersion(entry.version) || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) continue;
    const items = {};
    for (const lang of LANGS) {
      const list = entry.items && Array.isArray(entry.items[lang]) ? entry.items[lang] : [];
      items[lang] = list.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.slice(0, MAX_ITEM));
    }
    if (items.en.length === 0) continue; // English is the fallback, so it is required
    out.push({ version: parseVersion(entry.version).join('.'), date: entry.date, items });
  }
  return out;
}

module.exports = { parseVersion, isNewer, parseRelease, cleanChangelog, apiUrl, repoUrl, isRepo, LANGS, MAX_NOTES };
