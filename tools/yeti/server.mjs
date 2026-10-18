// Builds the Yeti Games pictures. Serves the 3D models (tools/yeti/models, see models.txt for where each
// comes from) and the tool pages on localhost. Open the printed address in Chrome: render.html draws every
// sprite with three.js and posts it back here to be written into www/img/yeti.
//
// Usage: node tools/yeti/server.mjs [--stay]
//   First download the models:  node tools/yeti/server.mjs --fetch
//   /tool/view.html shows every model with its animation names; /tool/render.html renders the sprites.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const PORT = 8767;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain', '.glb': 'model/gltf-binary' };
const OUT = { img: join(ROOT, 'www/img/yeti') };

if (args.includes('--fetch')) {
  await mkdir(join(HERE, 'models'), { recursive: true });
  for (const line of readFileSync(join(HERE, 'models.txt'), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, file] = line.split('|');
    const res = await fetch(`https://static.poly.pizza/${file}.glb`);
    if (!res.ok) { console.log(`${key}: failed (${res.status})`); continue; }
    await writeFile(join(HERE, 'models', `${key}.glb`), Buffer.from(await res.arrayBuffer()));
    console.log(`${key}: ok`);
  }
  process.exit(0);
}

const body = (req) => new Promise((ok, bad) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', bad); });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'POST' && url.pathname === '/save') {
      const [area, ...rest] = url.searchParams.get('file').split('/');
      const rel = rest.join('/');
      if (!OUT[area] || rel.includes('..')) throw new Error('bad path');
      const file = join(OUT[area], rel);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, await body(req));
      res.end('ok');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/log') { console.log(String(await body(req))); res.end('ok'); return; }
    if (req.method === 'POST' && url.pathname === '/done') { console.log('Finished.'); res.end('ok'); if (!args.includes('--stay')) setTimeout(() => process.exit(0), 200); return; }
    if (url.pathname === '/') { res.writeHead(302, { location: '/tool/render.html' }); res.end(); return; }
    let file;
    if (url.pathname.startsWith('/models/')) file = join(HERE, 'models', decodeURIComponent(url.pathname.slice(8)));
    else if (url.pathname.startsWith('/www/')) file = join(ROOT, 'www', decodeURIComponent(url.pathname.slice(5)));
    else if (url.pathname.startsWith('/tool/')) file = join(HERE, decodeURIComponent(url.pathname.slice(6)));
    if (!file || file.includes('..') || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Open http://localhost:${PORT}/ in Chrome`));
