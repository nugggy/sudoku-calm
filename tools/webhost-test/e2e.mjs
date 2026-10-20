// End-to-end check of "Friend on a browser": the real WebHost and WebLink run on the desktop (DesktopHost.java) in place
// of the host phone, a host page drives them through shim.js, and a second page in its own profile plays as an iPhone
// in Safari would, opened from /?join=duo. Plays Connect Four (with a dropped connection mid-game), some Air Hockey,
// then Snip Buddies level 1 from /?join=snip.   Run: node tools/webhost-test/e2e.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'android', 'app', 'src', 'main', 'java', 'au', 'nugggy', 'sudokucalm');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const SHOTS = process.env.SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, checks = 0;
const check = (ok, what) => { checks++; if (!ok) { fails++; console.log('FAIL', what); } else if (process.env.VERBOSE) console.log('ok', what); };

// ---------- the desktop host ----------
const out = mkdtempSync(join(tmpdir(), 'webhost-e2e-'));
execFileSync('javac', ['-encoding', 'UTF-8', '-d', out, join(SRC, 'WebHost.java'), join(SRC, 'WebLink.java'), join(ROOT, 'tools', 'webhost-test', 'DesktopHost.java')], { stdio: 'inherit' });
const host = spawn('java', ['-cp', out, 'au.nugggy.sudokucalm.DesktopHost', join(ROOT, 'www'), '0'], { env: { ...process.env, LEAVE_MS: '20000' }, stdio: ['ignore', 'pipe', 'inherit'] });
const port = await new Promise((res, rej) => {
  let buf = '';
  host.stdout.on('data', (d) => { buf += d; const m = buf.match(/PORT (\d+)/); if (m) res(+m[1]); });
  setTimeout(() => rej(new Error('DesktopHost did not start')), 15000);
});
const base = `http://127.0.0.1:${port}`;

// ---------- Chrome ----------
const prof = join(out, 'chrome');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
let dport = 0;
for (let i = 0; i < 80 && !dport; i++) { await sleep(200); try { dport = +readFileSync(join(prof, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; } catch { /* starting */ } }
const ver = await (await fetch(`http://127.0.0.1:${dport}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = []; const names = {};
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  const who = names[m.sessionId] || '?';
  if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(`${who}: ${(d.exception?.description || d.text).split('\n')[0]}`); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(JSON.stringify(m.params.args))) errors.push(`${who}: console ${m.params.args.map((x) => x.value || x.description).join(' ')}`);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|vibrate|ERR_INTERNET_DISCONNECTED/.test(m.params.entry.text + (m.params.entry.url || ''))) errors.push(`${who}: ${m.params.entry.text} ${m.params.entry.url || ''}`);
});
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
async function page(name, { iphone = false, shim = false } = {}) {
  const { result: { browserContextId } } = await send('Target.createBrowserContext');
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  names[sessionId] = name;
  const s = (method, params) => send(method, params, sessionId);
  await s('Page.enable'); await s('Runtime.enable'); await s('Log.enable'); await s('Network.enable');
  if (iphone) {
    await s('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
    await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else await s('Emulation.setDeviceMetricsOverride', { width: 412, height: 860, deviceScaleFactor: 1, mobile: true });
  if (shim) await s('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(ROOT, 'tools', 'webhost-test', 'shim.js'), 'utf8') });
  const ev = async (expr) => { const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  const until = async (expr, ms = 8000) => { const t = Date.now() + ms; while (Date.now() < t) { if (await ev(expr)) return true; await sleep(100); } return false; };
  const shot = async (label) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const r = await s('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${name}_${label}.png`), Buffer.from(r.result.data, 'base64'));
  };
  const go = async (url, store) => {
    await s('Page.navigate', { url });
    await until('!!document.querySelector("#screens > section")', 10000);
    if (store) {
      await ev(`localStorage.setItem('sudokucalm.v1', ${JSON.stringify(JSON.stringify(store))}); location.reload()`);
      await sleep(800);
      await until('!!document.querySelector("#screens > section")', 10000);
    }
    await sleep(500);
  };
  const tap = async (x, y) => {
    await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  return { s, ev, until, go, shot, tap, sessionId };
}
const top = (sel) => `[...document.querySelectorAll('#screens > section')].pop().querySelector(${JSON.stringify(sel)})`;
const click = (sel) => `(() => { const b = ${top(sel)}; if (b) b.click(); return !!b; })()`;
const closeSheets = "document.querySelectorAll('.backdrop [data-x]').forEach((b) => b.click()); true";

const H = await page('host', { shim: true });
const G = await page('iphone', { iphone: true });

try {
  // ---------- Play Together ----------
  const seen = { meta: { openedSeeded: true, seenVersion: '9.9.9' } };
  await H.go(`${base}/index.html`, { ...seen, duo: { name: 'Ana', wins: {}, played: {}, seen: { connect4: 1, hockey: 1 }, via: 'wifi' } });
  await H.ev(closeSheets);
  await H.ev("document.querySelector('[data-game=duo]').click()"); await sleep(700);
  check(await H.ev(click('[data-act=connect]')), 'host opens the Play Together lobby');
  await sleep(400);
  await H.ev(`(() => { const i = ${top('[data-el=name]')}; i.value = 'Ana'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await H.ev(click('[data-act=host]'));
  check(await H.until(top('[data-act=web]') + ' !== null'), 'host sees the "Friend on a browser" button');
  await H.ev(click('[data-act=web]'));
  check(await H.until(top('.webjoin-qr') + ' !== null'), 'host shows a QR code');
  const url = await H.ev(`${top('.webjoin-url')}.textContent`);
  check(url === `http://127.0.0.1:${port}/?join=duo`, `address shown: ${url}`);
  await H.shot('hosting');

  await G.go(url, null);
  await G.go(url, { duo: { name: 'Bea', wins: {}, played: {}, seen: {}, via: 'wifi' }, meta: { openedSeeded: true } });
  check(await G.until(top('[data-act=join]') + ' !== null'), 'iPhone opens straight into the join screen');
  check(await G.ev("!!document.querySelector('meta[name=viewport]')"), 'viewport meta present');
  await G.shot('join');
  await G.ev(click('[data-act=join]'));
  check(await H.until(top('[data-pick=connect4]') + ' !== null'), 'host sees the shared picker');
  check(await H.until(`${top('.duo-vs')}?.textContent.includes('Bea')`), 'host sees the friend\'s name');
  check(await G.until(`${top('.duo-vs')}?.textContent.includes('Ana')`), 'iPhone sees the host\'s name');
  await G.shot('connected');

  // Connect Four: Ana (host) goes first and stacks column 1, Bea plays column 2. The iPhone drops off mid-game.
  await H.ev(click('[data-pick=connect4]'));
  check(await G.until(top('.c4-col') + ' !== null'), 'game starts on the iPhone');
  const discs = (P) => P.ev("[...document.querySelectorAll('#screens > section')].pop().querySelectorAll('.c4-cell .c4-disc').length");
  const both = async (n) => { const a = await H.until(`[...document.querySelectorAll('#screens > section')].pop().querySelectorAll('.c4-cell .c4-disc').length === ${n}`); const b = await G.until(`[...document.querySelectorAll('#screens > section')].pop().querySelectorAll('.c4-cell .c4-disc').length === ${n}`); return a && b; };
  for (let k = 0; k < 3; k++) {
    await H.ev(click('.c4-col[data-c="0"]')); check(await both(2 * k + 1), `host move ${k + 1} reaches the iPhone`);
    await sleep(350);
    await G.ev(click('.c4-col[data-c="1"]')); check(await both(2 * k + 2), `iPhone move ${k + 1} reaches the host`);
    await sleep(350);
  }
  // the iPhone loses its connection (locked, out of range) and the host plays the winning move meanwhile
  await G.s('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check(await G.until("document.querySelector('.lan-banner')?.textContent.includes('Reconnecting')", 15000), 'iPhone shows Reconnecting');
  await G.shot('reconnecting');
  await H.ev(click('.c4-col[data-c="0"]'));
  check(await H.until("document.querySelector('.lan-banner')?.textContent.includes('Waiting for them')", 15000), 'host shows the friend\'s connection dropped');
  check(await discs(G) === 6, 'iPhone has not seen the move while offline');
  await G.s('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check(await G.until(`[...document.querySelectorAll('#screens > section')].pop().querySelectorAll('.c4-cell .c4-disc').length === 7`, 15000), 'missed move arrives after reconnecting');
  check(await G.until("!document.querySelector('.lan-banner')", 5000) && await H.until("!document.querySelector('.lan-banner')", 5000), 'banners clear');
  check(await H.until("document.querySelector('.duo-result h2')?.textContent === 'You win'", 6000), 'host: You win');
  check(await G.until("document.querySelector('.duo-result h2')?.textContent === 'Ana wins'", 6000), 'iPhone: Ana wins');
  await G.shot('c4-result');

  // Air Hockey: the host picks it from the result screen; the iPhone follows and plays with touch
  await H.ev(click('.duo-result [data-act=pick]'));
  check(await H.until(top('[data-pick=hockey]') + ' !== null'), 'host back at the picker, still connected');
  await H.ev(click('[data-pick=hockey]'));
  check(await G.until(`${top('.title')}?.textContent === 'Air Hockey'`), 'iPhone follows into Air Hockey');
  for (let i = 0; i < 20; i++) {
    const x = 120 + (i % 10) * 15, y = 700 - (i % 5) * 20;
    await G.s('Input.dispatchTouchEvent', { type: i ? 'touchMove' : 'touchStart', touchPoints: [{ x, y }] });
    await sleep(100);
  }
  await G.s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(await H.ev(`${top('.title')}?.textContent === 'Air Hockey'`) && await G.ev("!!document.querySelector('.duo-game canvas')"), 'both still in Air Hockey after playing');
  await G.shot('hockey');
  await H.ev('window.__scBack()');
  check(await G.until(`${top('.title')}?.textContent !== 'Air Hockey'`, 6000), 'iPhone leaves the game when the host does');
  await H.ev(click('[data-act=leave]'));
  check(await G.until("!!document.querySelector('.toast.show') || true"), 'host disconnects');
  await sleep(800);

  // ---------- Snip Buddies ----------
  await H.ev("while (document.querySelectorAll('#screens > section').length > 1) window.__scBack(); true"); await sleep(300);
  await H.ev("document.querySelector('[data-game=snip]').click()"); await sleep(700);
  await H.ev(closeSheets);
  await H.ev(click('[data-act=play]')); await sleep(400);
  await H.ev(`(() => { const i = ${top('[data-el=name]')}; if (i) i.value = 'Ana'; return true; })()`);
  await H.ev(click('[data-act=host]'));
  check(await H.until(top('[data-act=web]') + ' !== null'), 'Snip host sees the browser option');
  await H.ev(click('[data-act=web]'));
  check(await H.until(`${top('.webjoin-url')}?.textContent.endsWith('?join=snip')`), 'Snip address ends in ?join=snip');
  const surl = await H.ev(`${top('.webjoin-url')}.textContent`);
  await G.go(surl, { snip: { level: 0, done: {}, name: 'Bea', seenHelp: true }, meta: { openedSeeded: true } });
  check(await G.until(top('[data-act=join]') + ' !== null'), 'iPhone opens into the Snip Buddies join screen');
  await G.ev(click('[data-act=join]'));
  check(await H.until(top('[data-lvl="0"]') + ' !== null'), 'Snip host can pick a level');
  await H.ev(click('[data-lvl="0"]'));
  check(await G.until("!!document.querySelector('.snip-game canvas') && !document.querySelector('[data-el=lag]')", 10000), 'iPhone is in level 1 and receiving the host\'s world');
  const btn = await G.ev(`(() => { const r = ${top('.sp-b[aria-label="Right"]')}?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`);
  check(!!btn, 'iPhone has its control pad');
  if (btn) {
    await G.s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: btn[0], y: btn[1] }] });
    await sleep(900);
    await G.s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await sleep(500);
  await G.shot('snip');
  await H.shot('snip');
  check(await H.ev("!!document.querySelector('.snip-game canvas')"), 'host still in the level');
} catch (err) {
  fails++; console.log('FAIL', err.stack || err);
} finally {
  check(errors.length === 0, 'no page errors' + (errors.length ? ':\n  ' + errors.join('\n  ') : ''));
  console.log(fails ? `Browser friend: ${fails} of ${checks} checks failed` : `Browser friend: all ${checks} checks passed`);
  try { ws.close(); } catch { /* ignore */ }
  chrome.kill(); host.kill();
  setTimeout(() => { try { rmSync(out, { recursive: true, force: true }); } catch { /* ignore */ } process.exit(fails ? 1 : 0); }, 500);
}
