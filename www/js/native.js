// Bridge to the Android shell (window.SCNative). Falls back to browser behaviour when run on the web.
export const REPO = 'nugggy/sudoku-calm';

const N = window.SCNative;

export const native = {
  isApp: !!N,
  versionName() { return N ? N.getVersionName() : '0.0.0-web'; },
  versionCode() { return N ? N.getVersionCode() : 0; },
  setBars(color, darkIcons) { try { N && N.setSystemBars(color, darkIcons); } catch { /* older shell */ } },
  vibrate(p) {
    try {
      if (N) N.vibrate(Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p);
      else if (navigator.vibrate) navigator.vibrate(p);
    } catch { /* ignore */ }
  },
  openUrl(url) { if (N) N.openUrl(url); else window.open(url, '_blank', 'noopener'); },
  downloadAndInstall(url, version) {
    if (N) N.downloadAndInstall(url, version);
    else window.open(url, '_blank', 'noopener');
  },
  exit() { if (N) N.exitApp(); },
};

// ---------- Local two-phone games (see LanLink.java) ----------
// Null in a browser or on an older app shell. Events come back through window.__lan.
export const lanBridge = N && N.lanHost ? {
  host: (name) => N.lanHost(name), discover: () => N.lanDiscover(), stopDiscover: () => N.lanStopDiscover(),
  join: (id) => N.lanJoin(id), joinIp: (ip, port) => N.lanJoinIp(ip, port), send: (s) => N.lanSend(s),
  close: () => N.lanClose(), ip: () => N.lanIp(),
} : null;

// ---------- Update channel (GitHub Releases) ----------
const parse = (v) => (String(v).replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0));
export function newer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; }
  return false;
}

// Returns {version, notes, url, size, prerelease} for a newer release, or null.
export async function checkForUpdate(channel = 'stable') {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=15`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  const releases = await res.json();
  const current = native.versionName();
  for (const r of releases) {
    if (r.draft || (r.prerelease && channel !== 'beta')) continue;
    const apk = (r.assets || []).find((a) => a.name.endsWith('.apk'));
    if (!apk) continue;
    if (!newer(r.tag_name, current)) return null;
    return { version: r.tag_name.replace(/^v/i, ''), notes: (r.body || '').trim(), url: apk.browser_download_url, size: apk.size, prerelease: r.prerelease };
  }
  return null;
}
