// Builds the Treat Twist pictures in www/img/treat from the CC0 sources in tools/treat/art-src.
//   node tools/treat/build-art.mjs
// Needs Chrome (for the drawing in build-art.html) and ffmpeg (to save .webp). Sources are listed in art.txt.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'www', 'img', 'treat');
mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer(async (q, r) => {
  try { const p = decodeURIComponent(q.url.split('?')[0]); const b = await readFile(join(HERE, p)); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port, profile = mkdtempSync(join(tmpdir(), 'treat-art-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null, dbg = 0;
for (let i = 0; i < 60 && !targets; i++) { await sleep(200); try { dbg = dbg || +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; if (dbg) targets = await (await fetch(`http://127.0.0.1:${dbg}/json`)).json(); } catch { /* starting */ } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/build-art.html` });
let title = '';
for (let t = 0; t < 100 && title !== 'DONE'; t++) { await sleep(150); title = (await send('Runtime.evaluate', { expression: 'document.title' })).result?.result?.value; }
const json = (await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__out)' })).result?.result?.value;
ws.close(); chrome.kill(); server.close();
const out = JSON.parse(json || '{}');
const webp = (src, dst, q = 88, extra = []) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, ...extra, '-c:v', 'libwebp', '-quality', String(q), dst]);
let n = 0;
for (const [name, url] of Object.entries(out)) {
  const tmp = join(OUT, name + '.png');
  writeFileSync(tmp, Buffer.from(url.split(',')[1], 'base64'));
  webp(tmp, join(OUT, name + '.webp'), 90);
  unlinkSync(tmp); n++;
}
// backgrounds and the burst animation straight from the sources
webp(join(HERE, 'art-src', 'background_29.png'), join(OUT, 'map.webp'), 78);
webp(join(HERE, 'art-src', 'background_blur.png'), join(OUT, 'board.webp'), 70, ['-vf', 'scale=512:384']);
webp(join(HERE, 'art-src', 'explotion.png'), join(OUT, 'burst.webp'), 85);
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* still closing */ } }, 500);
console.log(`Wrote ${n + 3} pictures to www/img/treat`);
