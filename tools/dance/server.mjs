// Dance Party picture tool. Serves the repo on localhost and saves the card picture drawn by render.html into
// www/img/dance. Usage: node tools/dance/server.mjs, then open http://localhost:8777/tools/dance/render.html in Chrome.
// (The app itself can be tried at http://localhost:8777/www/index.html.)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PORT = 8777;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

const body = (req) => new Promise((ok, bad) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', bad); });
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'POST' && url.pathname === '/save') {
      const rel = url.searchParams.get('file');
      if (!rel || rel.includes('..')) throw new Error('bad path');
      const file = join(ROOT, 'www/img/dance', rel);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, await body(req));
      res.end('ok'); return;
    }
    const file = join(ROOT, decodeURIComponent(url.pathname));
    if (file.includes('..') || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, () => console.log(`http://localhost:${PORT}/tools/dance/render.html`));
