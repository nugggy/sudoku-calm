// Marvel Heroes picture tool. Serves the repo and tools/hero on localhost, and saves rendered pictures into
// www/img/hero. Usage: node tools/hero/server.mjs, then open http://localhost:8776/tools/hero/render.html in Chrome.
//   First download the models listed in models.txt:  node tools/hero/server.mjs --fetch
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PORT = 8776;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };

if (process.argv.includes('--fetch')) {
  await mkdir(join(HERE, 'models'), { recursive: true });
  for (const line of readFileSync(join(HERE, 'models.txt'), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, file] = line.split('|');
    const res = await fetch(`https://static.poly.pizza/${file}.glb`);
    if (res.ok) await writeFile(join(HERE, 'models', `${key}.glb`), Buffer.from(await res.arrayBuffer()));
    console.log(`${key}: ${res.ok ? 'ok' : res.status}`);
  }
  process.exit(0);
}

const body = (req) => new Promise((ok, bad) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', bad); });
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'POST' && url.pathname === '/save') {
      const rel = url.searchParams.get('file');
      if (!rel || rel.includes('..')) throw new Error('bad path');
      const file = join(ROOT, 'www/img/hero', rel);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, await body(req));
      res.end('ok'); return;
    }
    const file = join(ROOT, decodeURIComponent(url.pathname));
    if (file.includes('..') || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, () => console.log(`http://localhost:${PORT}/tools/hero/render.html`));
