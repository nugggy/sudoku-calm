// Builds the Sticker Studio scenes. Serves the Kenney 3D kits and render.html on localhost; open the
// printed address in Chrome and the page renders every scene in tools/sticker/scenes.mjs with three.js,
// posting each picture back here to be written into www/img/stickers and www/levels/stickers.json.
//
// Usage: node tools/sticker/server.mjs [kenney-dir] [--only=3,7] [--catalog]
//   kenney-dir holds the unzipped Kenney kits (furniture-kit/, food-kit/ ...), default tools/sticker/kenney.
//   Download each kit named in scenes.mjs (KITS) from https://kenney.nl/assets/<name>, e.g. /assets/furniture-kit.
//   --only re-renders some scenes (by number), --catalog writes tools/sticker/catalog.json (model sizes),
//   --stay keeps serving afterwards (open /tool/sheet.html to review every scene)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const KENNEY = resolve(args.find((a) => !a.startsWith('--')) || join(HERE, 'kenney'));
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const mode = args.includes('--catalog') ? 'catalog' : 'scenes';
const PORT = 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };

// Only these places may be written to.
const OUT = { img: join(ROOT, 'www/img/stickers'), levels: join(ROOT, 'www/levels'), tool: HERE };

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
    if (url.pathname === '/list') { // model files in one kit, for the catalog
      const kit = url.searchParams.get('kit');
      const dir = ['GLB format', 'GLTF format'].map((d) => join(KENNEY, kit, 'Models', d)).find(existsSync);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(dir ? (await readdir(dir)).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)) : []));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/log') { console.log(String(await body(req))); res.end('ok'); return; }
    if (req.method === 'POST' && url.pathname === '/done') { console.log('Finished.'); res.end('ok'); if (!args.includes('--stay')) setTimeout(() => process.exit(0), 200); return; }
    let file;
    if (url.pathname === '/') { res.writeHead(302, { location: `/tool/render.html?mode=${mode}${only ? `&only=${only}` : ''}` }); res.end(); return; }
    if (url.pathname.startsWith('/kenney/')) file = join(KENNEY, decodeURIComponent(url.pathname.slice(8)));
    else if (url.pathname.startsWith('/www/')) file = join(ROOT, 'www', decodeURIComponent(url.pathname.slice(5)));
    else if (url.pathname.startsWith('/tool/')) file = join(HERE, decodeURIComponent(url.pathname.slice(6)));
    if (!file || file.includes('..') || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Open http://localhost:${PORT}/ in Chrome (kits from ${KENNEY})`));
