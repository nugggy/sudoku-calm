// Renders the Sticker Studio scenes from Kenney's CC0 3D kits (see server.mjs for how to run it).
// Every scene is a little isometric diorama. For each one we save:
//   base.webp            the empty scene (floor, walls and any decorations that are not stickers)
//   <n>.webp             each sticker, cropped, drawn from the same camera so it fits its spot exactly
//   thumb.webp / blank.webp   small finished and empty previews for the scene picker
// and one www/levels/stickers.json describing where every sticker goes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { KITS, SCENES, GROUPS, STYLES } from './scenes.mjs';
const styleGroup = new Map(STYLES.flatMap((g) => g.map((m) => [m, g])));
// Up to three other models from a sticker's style group, starting after its own place in the list.
const altsFor = (ref) => { const g = styleGroup.get(ref); if (!g) return []; const i = g.indexOf(ref); return [1, 2, 3].map((k) => g[(i + k) % g.length]).filter((m, k, a) => m !== ref && a.indexOf(m) === k); };

const P = new URLSearchParams(location.search);
const logEl = document.getElementById('log');
const log = (m) => { logEl.textContent = m; };
const post = (path, data) => fetch(path, { method: 'POST', body: data });
const remoteLog = (m) => post('/log', m);

const W = 1000;          // output width of a scene in pixels
const SS = 2;            // supersampling
const THUMB = 320;
const ELEV = 0.86;       // camera height for a (1, ELEV, 1) view direction; 1 would be true isometric

const loader = new GLTFLoader();
const cache = new Map();
function modelUrl(ref) {
  const [k, name] = ref.split('/');
  const kit = KITS[k];
  if (!kit) throw new Error(`unknown kit in ${ref}`);
  return `/kenney/${kit.dir}/Models/${kit.fmt || 'GLB format'}/${name}.glb`;
}
async function loadModel(ref) {
  if (!cache.has(ref)) cache.set(ref, loader.loadAsync(modelUrl(ref)).then((g) => g.scene));
  return cloneSkinned(await cache.get(ref)); // keeps skinned characters bound to their own bones
}

// ---------- canvas textures for floors and walls ----------
const PX = 256; // texture pixels per tile
function shade(hex, f) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + f)));
  return '#' + c.getHexString();
}
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// spec: 'kind:#colour:#colour2'
function paintPattern(g, spec, w, h, seed = 1) {
  const [kind, c1 = '#dddddd', c2] = spec.split(':');
  const r = rng(seed);
  const T = PX;
  g.fillStyle = c1; g.fillRect(0, 0, w, h);
  const b = c2 || shade(c1, -0.06);
  if (kind === 'planks') {
    const ph = T / 4;
    for (let y = 0, row = 0; y < h; y += ph, row++) {
      let x = -((row * 37) % T);
      while (x < w) {
        const len = T * (1 + r() * 1.5);
        g.fillStyle = shade(c1, (r() - 0.5) * 0.06); g.fillRect(x, y, len, ph);
        g.fillStyle = b; g.fillRect(x, y, 2, ph);
        x += len;
      }
      g.fillStyle = b; g.fillRect(0, y, w, 2);
    }
  } else if (kind === 'tiles' || kind === 'checker') {
    const s = kind === 'tiles' ? T / 2 : T / 2;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      if (kind === 'checker') { g.fillStyle = ((x + y) / s) % 2 ? b : c1; g.fillRect(x, y, s, s); }
      else { g.fillStyle = shade(c1, (r() - 0.5) * 0.03); g.fillRect(x + 1, y + 1, s - 2, s - 2); g.fillStyle = b; g.fillRect(x, y, s, 2); g.fillRect(x, y, 2, s); }
    }
  } else if (kind === 'carpet' || kind === 'plain' || kind === 'sand' || kind === 'snow' || kind === 'dirt' || kind === 'concrete') {
    const n = (w * h) / 60;
    for (let i = 0; i < n; i++) { g.fillStyle = shade(c1, (r() - 0.5) * (kind === 'plain' ? 0.02 : 0.07)); g.fillRect(r() * w, r() * h, 3, 3); }
    if (kind === 'concrete') { g.fillStyle = b; for (let x = 0; x < w; x += T) g.fillRect(x, 0, 2, h); for (let y = 0; y < h; y += T) g.fillRect(0, y, w, 2); }
  } else if (kind === 'grass') {
    const n = (w * h) / 40;
    for (let i = 0; i < n; i++) { g.fillStyle = shade(c1, (r() - 0.5) * 0.1); const x = r() * w, y = r() * h; g.fillRect(x, y, 2, 5); }
    g.fillStyle = shade(c1, 0.06);
    for (let i = 0; i < (w * h) / 4000; i++) { g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 20, 6 + r() * 10, 0, 0, 7); g.fill(); }
  } else if (kind === 'stone') {
    for (let y = 0, row = 0; y < h; y += T / 3, row++) for (let x = -(row % 2) * T / 4; x < w; x += T / 2) {
      g.fillStyle = shade(c1, (r() - 0.5) * 0.08); g.fillRect(x + 2, y + 2, T / 2 - 4, T / 3 - 4);
    }
  } else if (kind === 'stripes') {
    for (let x = 0; x < w; x += T / 2) { g.fillStyle = b; g.fillRect(x, 0, T / 4, h); }
  } else if (kind === 'dots') {
    g.fillStyle = b;
    for (let y = T / 8, row = 0; y < h; y += T / 4, row++) for (let x = (row % 2) * T / 8 + T / 16; x < w; x += T / 4) { g.beginPath(); g.arc(x, y, T / 28, 0, 7); g.fill(); }
  } else if (kind === 'brick') {
    g.fillStyle = b; g.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h; y += T / 6, row++) for (let x = -(row % 2) * T / 6; x < w; x += T / 3) {
      g.fillStyle = shade(c1, (r() - 0.5) * 0.08); g.fillRect(x + 2, y + 2, T / 3 - 4, T / 6 - 4);
    }
  } else if (kind === 'panel') {
    for (let x = 0; x < w; x += T / 3) { g.fillStyle = b; g.fillRect(x, 0, 3, h); }
  } else if (kind === 'metal') {
    g.fillStyle = b;
    for (let x = 0; x < w; x += T / 2) g.fillRect(x, 0, 3, h);
    for (let y = 0; y < h; y += T / 2) g.fillRect(0, y, w, 3);
    g.fillStyle = shade(c1, 0.08);
    for (let y = 6; y < h; y += T / 2) for (let x = 6; x < w; x += T / 2) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  } else if (kind === 'rails') { // sleepers and two rails running along x
    g.fillStyle = '#8a7a66'; g.fillRect(0, 0, w, h);
    for (let x = 6; x < w; x += T / 4) { g.fillStyle = shade('#7a5232', (r() - 0.5) * 0.08); g.fillRect(x, h * 0.12, T / 9, h * 0.76); }
    g.fillStyle = '#c9ced6'; g.fillRect(0, h * 0.26, w, h * 0.07); g.fillRect(0, h * 0.67, w, h * 0.07);
    g.fillStyle = '#7d848f'; g.fillRect(0, h * 0.32, w, h * 0.02); g.fillRect(0, h * 0.73, w, h * 0.02);
  } else if (kind === 'road') { // asphalt with a dashed centre line along x
    g.fillStyle = '#5d6670'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 80; i++) { g.fillStyle = shade('#5d6670', (r() - 0.5) * 0.06); g.fillRect(r() * w, r() * h, 3, 3); }
    g.fillStyle = '#ffffff'; for (let x = T * 0.1; x < w; x += T * 0.5) g.fillRect(x, h / 2 - 4, T * 0.25, 8);
  } else if (kind === 'water') {
    g.strokeStyle = shade(c1, 0.12); g.lineWidth = 3;
    for (let i = 0; i < (w * h) / 3000; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 5, x + 16, y); g.stroke(); }
  }
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// A window painted on a wall: sky, frame and bars, with optional curtains.
function paintWindow(g, x, y, w, h, o = {}) {
  const frame = o.frame || '#ffffff';
  g.save(); g.beginPath(); if (o.round) { g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); } else g.rect(x, y, w, h); g.clip();
  const sky = g.createLinearGradient(0, y, 0, y + h);
  const [s1, s2] = o.night ? ['#1d2a5c', '#4a4f9a'] : ['#7ccdf6', '#d8f1ff'];
  sky.addColorStop(0, s1); sky.addColorStop(1, s2);
  g.fillStyle = sky; g.fillRect(x, y, w, h);
  if (o.night) { g.fillStyle = '#fff6c8'; for (let i = 0; i < 9; i++) g.fillRect(x + ((i * 37) % w), y + ((i * 53) % (h * 0.7)), 3, 3); g.beginPath(); g.arc(x + w * 0.72, y + h * 0.25, w * 0.1, 0, 7); g.fill(); }
  else { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(x + w * 0.3, y + h * 0.3, w * 0.16, h * 0.06, 0, 0, 7); g.ellipse(x + w * 0.42, y + h * 0.27, w * 0.12, h * 0.07, 0, 0, 7); g.fill(); }
  if (o.view === 'hills') { g.fillStyle = '#7cc56a'; g.beginPath(); g.ellipse(x + w * 0.3, y + h, w * 0.6, h * 0.3, 0, 0, 7); g.fill(); g.fillStyle = '#5fb257'; g.beginPath(); g.ellipse(x + w * 0.85, y + h, w * 0.5, h * 0.22, 0, 0, 7); g.fill(); }
  if (o.view === 'sea') { g.fillStyle = '#3d9be0'; g.fillRect(x, y + h * 0.62, w, h * 0.38); g.fillStyle = '#7fc4f0'; g.fillRect(x, y + h * 0.62, w, 4); }
  if (o.view === 'snow') { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x + w * 0.4, y + h, w * 0.7, h * 0.28, 0, 0, 7); g.fill(); }
  if (o.view === 'city') { g.fillStyle = o.night ? '#2c3364' : '#9fb4c8'; [[0.05, 0.5], [0.22, 0.35], [0.42, 0.55], [0.6, 0.3], [0.8, 0.45]].forEach(([a, t]) => g.fillRect(x + w * a, y + h * t, w * 0.16, h)); }
  g.restore();
  const fw = Math.max(5, w * 0.06);
  g.strokeStyle = frame; g.lineWidth = fw;
  if (o.round) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.stroke(); }
  else g.strokeRect(x, y, w, h);
  g.lineWidth = fw * 0.7;
  g.beginPath(); g.moveTo(x + w / 2, y + (o.round ? w * 0.1 : 0)); g.lineTo(x + w / 2, y + h);
  if (!o.tall) { g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); }
  g.stroke();
  g.fillStyle = frame; g.fillRect(x - fw, y + h, w + fw * 2, fw * 1.3); // sill
  if (o.curtains) {
    g.fillStyle = o.curtains;
    const cw = w * 0.22;
    [[x - fw * 1.5, 1], [x + w + fw * 1.5 - cw, -1]].forEach(([cx]) => {
      g.beginPath(); g.moveTo(cx, y - fw * 2); g.lineTo(cx + cw, y - fw * 2); g.quadraticCurveTo(cx + cw * 0.5, y + h * 0.5, cx + cw * 0.9, y + h + fw); g.lineTo(cx, y + h + fw); g.closePath(); g.fill();
    });
    g.fillStyle = shade(o.curtains, -0.25); g.fillRect(x - fw * 2.5, y - fw * 2.6, w + fw * 5, fw);
  }
}

// Little framed pictures, shelves and clocks painted straight onto the wallpaper.
function paintDecor(g, d, x, y, w, h) {
  if (d.type === 'frame') {
    g.fillStyle = d.frame || '#8a5a35'; g.fillRect(x, y, w, h);
    g.fillStyle = d.bg || '#fdf3d8'; g.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8);
    g.fillStyle = d.c || '#6bbf6b';
    g.beginPath(); g.moveTo(x + w * 0.1, y + h * 0.9); g.lineTo(x + w * 0.4, y + h * 0.45); g.lineTo(x + w * 0.6, y + h * 0.7); g.lineTo(x + w * 0.75, y + h * 0.55); g.lineTo(x + w * 0.9, y + h * 0.9); g.fill();
    g.fillStyle = '#ffcf3f'; g.beginPath(); g.arc(x + w * 0.7, y + h * 0.3, w * 0.08, 0, 7); g.fill();
  } else if (d.type === 'clock') {
    g.fillStyle = d.frame || '#5b4636'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2, 0, 7); g.fill();
    g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.42, 0, 7); g.fill();
    g.strokeStyle = '#333'; g.lineWidth = w * 0.05; g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w / 2, y + h * 0.2); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w * 0.72, y + h / 2); g.stroke();
  } else if (d.type === 'shelf') {
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y + h + 2, w, 6);
    g.fillStyle = d.c || '#a8743f'; g.fillRect(x, y, w, h);
  } else if (d.type === 'board') {
    g.fillStyle = d.frame || '#b07a45'; g.fillRect(x, y, w, h);
    g.fillStyle = d.c || '#2f4f43'; g.fillRect(x + w * 0.05, y + h * 0.08, w * 0.9, h * 0.84);
    if (d.text) { g.fillStyle = '#ffffff'; g.font = `bold ${h * 0.22}px sans-serif`; g.textAlign = 'center'; g.fillText(d.text, x + w / 2, y + h * 0.42); g.font = `${h * 0.14}px sans-serif`; (d.lines || []).forEach((l, i) => g.fillText(l, x + w / 2, y + h * (0.62 + i * 0.16))); }
  } else if (d.type === 'sign') {
    g.fillStyle = d.c || '#e8505b'; const rr = h * 0.25;
    g.beginPath(); g.roundRect(x, y, w, h, rr); g.fill();
    g.fillStyle = '#fff'; g.font = `bold ${h * 0.55}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.text || '', x + w / 2, y + h * 0.54);
  } else if (d.type === 'bunting') {
    const cols = d.cols || ['#e8505b', '#ffcf3f', '#4aa8e0', '#3fc380', '#9b7be0'];
    g.strokeStyle = '#7a5a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y + h * 0.5, x + w, y); g.stroke();
    const n = Math.max(3, Math.round(w / 36));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, px = x + w * t, py = y + h * 0.5 * 4 * t * (1 - t) * 0.5;
      g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(px - 12, py); g.lineTo(px + 12, py); g.lineTo(px, py + h * 0.6); g.fill();
    }
  } else if (d.type === 'rect') {
    g.fillStyle = d.c; g.fillRect(x, y, w, h);
  } else if (d.type === 'arch') { // a doorway or opening
    g.fillStyle = d.c || '#3a2a20'; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.fill();
  }
}

function wallTexture(sc, len, side) {
  const H = sc.wallH;
  return canvasTex(Math.round(len * PX), Math.round(H * PX), (g, w, h) => {
    paintPattern(g, sc.wall, w, h, side === 'L' ? 3 : 4);
    if (sc.wainscot) { // lower panel
      const wh = h * sc.wainscot[1];
      g.save(); g.translate(0, h - wh); paintPattern(g, sc.wainscot[0], w, wh, 9); g.restore();
      g.fillStyle = shade(sc.wainscot[0].split(':')[1] || '#ccc', -0.12); g.fillRect(0, h - wh - 5, w, 8);
    }
    const sk = sc.skirting === false ? 0 : PX * 0.1;
    if (sk) { g.fillStyle = sc.skirting || shade(sc.wall.split(':')[1] || '#ddd', -0.25); g.fillRect(0, h - sk, w, sk); }
    // windows and decor: 'at' is measured from the back corner along the wall, in tiles
    const items = [...(sc.windows || []).map((o) => ({ ...o, win: true })), ...(sc.decor || [])].filter((o) => (o.wall || 'R') === side);
    for (const o of items) {
      const ww = o.w * PX, hh = o.h * PX;
      const at = o.at * PX;
      const x = side === 'R' ? at : w - at - ww;
      const y = h - (o.y + o.h) * PX;
      if (o.win) paintWindow(g, x, y, ww, hh, o); else paintDecor(g, o, x, y, ww, hh);
    }
    // gentle shading toward the corner
    const grad = side === 'R' ? g.createLinearGradient(0, 0, w * 0.25, 0) : g.createLinearGradient(w, 0, w * 0.75, 0);
    grad.addColorStop(0, 'rgba(0,0,0,.08)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
}

const lambert = (c, map) => new THREE.MeshLambertMaterial(map ? { map } : { color: new THREE.Color(c) });

// The diorama base: a slab with a patterned top, plus two back walls for rooms.
function buildBase(sc) {
  const g = new THREE.Group();
  const Wd = sc.w, Dp = sc.d, T = sc.slab ?? 0.35, t = 0.14;
  const floorCol = sc.floor.split(':')[1] || '#cccccc';
  const edge = sc.edge || shade(floorCol, -0.12);
  const soil = sc.soil || (sc.walls === false ? '#a3683d' : shade(floorCol, -0.17));
  const ext = sc.walls === false ? 0 : t;
  const box = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x + w / 2, y + h / 2, z + d / 2); g.add(m); return m; };
  // slab: a thin coloured lip over a deeper soil layer
  box(Wd + ext, 0.09, Dp + ext, -ext, -0.09, -ext, lambert(edge));
  box(Wd + ext, T - 0.09, Dp + ext, -ext, -T, -ext, lambert(soil));
  if (sc.under) box(Wd + ext - 0.3, 0.2, Dp + ext - 0.3, -ext + 0.15, -T - 0.2, -ext + 0.15, lambert(shade(soil, -0.1)));
  // patterned floor
  const ft = canvasTex(Math.round(Wd * PX), Math.round(Dp * PX), (c, w, h) => {
    paintPattern(c, sc.floor, w, h, 7);
    for (const p of sc.patches || []) { // [spec, x, z, w, d, round]
      const [spec, px, pz, pw, pd, round] = p;
      c.save(); c.beginPath();
      if (round) c.ellipse((px + pw / 2) * PX, (pz + pd / 2) * PX, (pw / 2) * PX, (pd / 2) * PX, 0, 0, 7); else c.rect(px * PX, pz * PX, pw * PX, pd * PX);
      c.clip(); c.translate(px * PX, pz * PX); paintPattern(c, spec, pw * PX, pd * PX, 11); c.restore();
      if (round) { // a soft rim so ponds and rugs read as separate shapes
        c.save(); c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 6; c.beginPath();
        c.ellipse((px + pw / 2) * PX, (pz + pd / 2) * PX, (pw / 2) * PX - 3, (pd / 2) * PX - 3, 0, 0, 7); c.stroke(); c.restore();
      }
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Dp), lambert(null, ft));
  floor.rotation.x = -Math.PI / 2; floor.position.set(Wd / 2, 0.002, Dp / 2);
  g.add(floor);
  if (sc.walls !== false) {
    const H = sc.wallH;
    const cap = lambert(sc.wallCap || shade(sc.wall.split(':')[1] || '#ddd', -0.18));
    box(t, H, Dp + t, -t, 0, -t, cap);   // left wall (along z)
    box(Wd, H, t, 0, 0, -t, cap);        // right wall (along x)
    const lw = new THREE.Mesh(new THREE.PlaneGeometry(Dp, H), lambert(null, wallTexture(sc, Dp, 'L')));
    lw.rotation.y = Math.PI / 2; lw.position.set(0.003, H / 2, Dp / 2); g.add(lw);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(Wd, H), lambert(null, wallTexture(sc, Wd, 'R')));
    rw.position.set(Wd / 2, H / 2, 0.003); g.add(rw);
  }
  return g;
}

// Places a model so its footprint is centred on (x, z), standing on y, turned r quarter-turns (or r degrees if > 3).
async function place(item, sc) {
  const [ref, x, z, r = 0, o = {}] = item;
  const kit = KITS[ref.split('/')[0]];
  const m = await loadModel(ref);
  const s = o.s ?? (kit.s || 1) * (sc.scale?.[ref.split('/')[0]] || 1); // an item's own scale replaces the kit's
  const holder = new THREE.Group();
  holder.add(m);
  m.scale.setScalar(s);
  holder.rotation.y = (Math.abs(r) <= 3 ? r * 90 : r) * Math.PI / 180;
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(holder);
  holder.position.set(x - (bb.min.x + bb.max.x) / 2, (o.y || 0) - bb.min.y, z - (bb.min.z + bb.max.z) / 2);
  if (o.at === 'L') holder.position.x = x - bb.min.x + 0.01;   // pushed against the left wall at x
  if (o.at === 'R') holder.position.z = z - bb.min.z + 0.01;   // pushed against the right wall at z
  holder.updateMatrixWorld(true);
  return holder;
}

// ---------- rendering ----------
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });

function lights(scene, o = {}) {
  scene.add(new THREE.HemisphereLight(0xffffff, o.ground || 0xc9b8a0, o.hemi ?? 1.05));
  const d = new THREE.DirectionalLight(o.sun || 0xffffff, o.sunI ?? 1.75);
  d.position.set(0.55, 1, 0.95); scene.add(d);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(1, 0.3, -0.2); scene.add(fill);
}

function makeCamera(objects) {
  const dir = new THREE.Vector3(1, ELEV, 1).normalize();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  cam.position.copy(dir.clone().multiplyScalar(30));
  cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const o of objects) {
    o.updateMatrixWorld(true);
    o.traverse((n) => {
      if (!n.isMesh) return;
      const pos = n.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld).applyMatrix4(inv);
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x; if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      }
    });
  }
  const pad = (maxX - minX) * 0.03;
  cam.left = minX - pad; cam.right = maxX + pad; cam.top = maxY + pad; cam.bottom = minY - pad;
  cam.updateProjectionMatrix();
  const H = Math.round((W * (cam.top - cam.bottom)) / (cam.right - cam.left));
  return { cam, H, dir };
}

// Copies the WebGL canvas down to W x H, returns a 2D canvas.
function grab(H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(renderer.domElement, 0, 0, W, H);
  return c;
}
function alphaBox(c) {
  const { width: w, height: h } = c;
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, sx = 0, sy = 0, sa = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = d[(y * w + x) * 4 + 3];
    if (a > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; sx += x * a; sy += y * a; sa += a; }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: sx / sa, cy: sy / sa, area: sa / 255 };
}
function crop(c, b, pad = 1) {
  const o = document.createElement('canvas');
  o.width = b.w + pad * 2; o.height = b.h + pad * 2;
  o.getContext('2d').drawImage(c, b.x - pad, b.y - pad, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
const webp = (c, q = 0.86) => new Promise((ok) => c.toBlob(ok, 'image/webp', q));
const save = async (file, c, q) => post(`/save?file=${encodeURIComponent(file)}`, await webp(c, q));

async function renderScene(sc, idx) {
  const id = String(idx + 1).padStart(2, '0');
  const scene = new THREE.Scene();
  lights(scene, sc.light || {});
  const base = buildBase(sc);
  scene.add(base);
  const baseItems = [], stickers = [];
  for (const it of sc.items) {
    const o = it[4] || {};
    const obj = await place(it, sc);
    scene.add(obj);
    if (o.b) baseItems.push(obj); else stickers.push({ obj, it });
  }
  // decorations scattered over open ground (grass tufts, pebbles), kept clear of everything else
  if (sc.scatter) {
    const r = rng(idx * 7919 + 17);
    const boxes = [...baseItems, ...stickers.map((s) => s.obj)].map((o) => new THREE.Box3().setFromObject(o).expandByScalar(0.14));
    const avoid = (sc.patches || []).filter((p) => /^(water|road|rails|checker|stripes)/.test(p[0]));
    const taken = [];
    for (const [ref, count, s] of sc.scatter) {
      for (let i = 0, tries = 0; i < count && tries < 400; tries++) {
        const x = 0.15 + r() * (sc.w - 0.3), z = 0.15 + r() * (sc.d - 0.3);
        if (boxes.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z)) continue;
        if (avoid.some(([, px, pz, pw, pd]) => x > px - 0.12 && x < px + pw + 0.12 && z > pz - 0.12 && z < pz + pd + 0.12)) continue;
        if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 0.32)) continue;
        taken.push([x, z]); i++;
        const obj = await place([ref, x, z, r() * 360, { s: s ?? undefined, b: 1 }], sc);
        scene.add(obj); baseItems.push(obj);
      }
    }
  }
  const { cam, H, dir } = makeCamera([base, ...baseItems, ...stickers.map((s) => s.obj)]);
  renderer.setSize(W * SS, H * SS, false);
  renderer.autoClear = false;

  const show = (list) => { [base, ...baseItems, ...stickers.map((s) => s.obj)].forEach((o) => { o.visible = list.includes(o); }); };
  // empty scene
  show([base, ...baseItems]);
  renderer.clear(); renderer.render(scene, cam);
  const baseC = grab(H);
  await save(`img/s${id}/base.webp`, baseC, 0.88);
  // each sticker, hidden where base pieces stand in front of it
  const out = [];
  const shoot = (obj) => {
    obj.visible = false;
    renderer.clear();
    show([base, ...baseItems]); scene.overrideMaterial = depthOnly; renderer.render(scene, cam);
    scene.overrideMaterial = null; show([]); obj.visible = true; renderer.render(scene, cam); obj.visible = false;
    const c = grab(H), b = alphaBox(c);
    return b && { c: crop(c, b), b };
  };
  for (let i = 0; i < stickers.length; i++) {
    const s = stickers[i];
    const shot = shoot(s.obj);
    if (!shot) { remoteLog(`scene ${id}: sticker ${s.it[0]} is not visible`); continue; }
    const bb = new THREE.Box3().setFromObject(s.obj), ctr = bb.getCenter(new THREE.Vector3());
    // other styles, standing on the same spot
    const alts = [];
    for (const ref of altsFor(s.it[0])) {
      const obj = await place([ref, ...s.it.slice(1)], sc);
      scene.add(obj);
      const a = shoot(obj);
      scene.remove(obj);
      if (a) alts.push(a);
    }
    out.push({ ref: s.it[0], ...shot, alts, depth: ctr.dot(dir) + ((s.it[4] || {}).z || 0) });
  }
  // number in reading order (top to bottom in bands, then left to right)
  const band = H / 7;
  const order = [...out].sort((a, b) => (Math.floor(a.b.cy / band) - Math.floor(b.b.cy / band)) || (a.b.cx - b.b.cx));
  order.forEach((s, k) => { s.n = k + 1; });
  // draw order back to front
  out.sort((a, b) => a.depth - b.depth);
  const small = [];
  for (const s of out) {
    await save(`img/s${id}/${s.n}.webp`, s.c);
    for (let a = 0; a < s.alts.length; a++) await save(`img/s${id}/${s.n}-${a + 1}.webp`, s.alts[a].c);
    if (s.b.w < 60 && s.b.h < 60) small.push(`${s.n}:${s.ref}`);
  }
  if (small.length) remoteLog(`scene ${id} ${sc.name}: small stickers ${small.join(', ')}`);
  // authoring checks: stickers off the slab, and stickers hiding most of another
  for (const s of stickers) {
    const bb = new THREE.Box3().setFromObject(s.obj);
    if (bb.min.x < -0.2 || bb.min.z < -0.2 || bb.max.x > sc.w + 0.2 || bb.max.z > sc.d + 0.2) remoteLog(`scene ${id}: ${s.it[0]} hangs off the edge`);
  }
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i].b, b = out[j].b;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 0 && oy > 0 && (ox * oy) / Math.min(a.w * a.h, b.w * b.h) > 0.6) remoteLog(`scene ${id}: ${out[i].n}:${out[i].ref} and ${out[j].n}:${out[j].ref} overlap a lot`);
  }
  // previews
  const thumbH = Math.round((THUMB * H) / W), k = THUMB / W;
  const full = document.createElement('canvas'); full.width = THUMB; full.height = thumbH;
  const fg = full.getContext('2d'); fg.imageSmoothingQuality = 'high';
  fg.drawImage(baseC, 0, 0, THUMB, thumbH);
  const blank = document.createElement('canvas'); blank.width = THUMB; blank.height = thumbH;
  const bg = blank.getContext('2d'); bg.imageSmoothingQuality = 'high';
  bg.drawImage(baseC, 0, 0, THUMB, thumbH);
  for (const s of out) {
    const x = (s.b.x - 1) * k, y = (s.b.y - 1) * k, w = s.c.width * k, h = s.c.height * k;
    fg.drawImage(s.c, x, y, w, h);
    bg.filter = 'brightness(0) invert(1) opacity(0.75)'; bg.drawImage(s.c, x, y, w, h); bg.filter = 'none';
  }
  await save(`img/s${id}/thumb.webp`, full, 0.85);
  await save(`img/s${id}/blank.webp`, blank, 0.85);
  // show the finished scene on screen while working
  const view = baseC.getContext('2d');
  for (const s of out) view.drawImage(s.c, s.b.x - 1, s.b.y - 1);
  document.body.style.backgroundImage = `url(${baseC.toDataURL()})`; document.body.style.backgroundSize = 'contain'; document.body.style.backgroundRepeat = 'no-repeat'; document.body.style.backgroundPosition = 'center';
  scene.traverse((n) => { if (n.isMesh && n.material?.map?.isCanvasTexture) n.material.map.dispose(); });
  return {
    id: idx + 1, name: sc.name, group: sc.group, w: W, h: H, bg: sc.bg || null,
    s: out.map((s) => [s.n, s.b.x - 1, s.b.y - 1, s.c.width, s.c.height, Math.round(s.b.cx), Math.round(s.b.cy),
      ...(s.alts.length ? [s.alts.map((a) => [a.b.x - 1, a.b.y - 1, a.c.width, a.c.height])] : [])]),
  };
}

async function catalog() {
  const out = {};
  for (const [k, kit] of Object.entries(KITS)) {
    const names = await (await fetch(`/list?kit=${kit.dir}`)).json();
    for (const n of names) {
      if (/^(coaster-(?!train)|track-|spline-|railroad-|support|cliff_|monorail_track|corridor|pipe_|bowl-)/.test(n)) continue;
      log(`${k}/${n}`);
      try {
        const m = await loadModel(`${k}/${n}`);
        const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3());
        out[`${k}/${n}`] = [sz.x, sz.y, sz.z].map((v) => +(v * (kit.s || 1)).toFixed(2));
      } catch (e) { remoteLog(`failed ${k}/${n}: ${e}`); }
    }
    cache.clear();
  }
  await post('/save?file=tool/catalog.json', JSON.stringify(out, null, 0).replace(/\],/g, '],\n'));
  log('Catalog saved.');
  await post('/done', '');
}

async function scenes() {
  const only = (P.get('only') || '').split(',').filter(Boolean).map(Number);
  const result = [];
  let prev = null;
  try { prev = await (await fetch('/tool/last-stickers.json')).json(); } catch { /* first run */ }
  for (let i = 0; i < SCENES.length; i++) {
    if (only.length && !only.includes(i + 1)) { result.push(prev?.scenes?.[i] || null); continue; }
    log(`Scene ${i + 1}/${SCENES.length}: ${SCENES[i].name}`);
    try { result.push(await renderScene(SCENES[i], i)); }
    catch (e) { remoteLog(`scene ${i + 1} failed: ${e.stack || e}`); result.push(null); }
  }
  const json = JSON.stringify({ groups: GROUPS, scenes: result });
  await post('/save?file=levels/stickers.json', json);
  await post('/save?file=tool/last-stickers.json', json);
  log(`Done: ${result.filter(Boolean).length} scenes.`);
  await post('/done', '');
}

if (P.get('mode') === 'idle') Object.assign(window, { THREE, loadModel, place });
else (P.get('mode') === 'catalog' ? catalog() : scenes()).catch((e) => { log(String(e)); remoteLog(String(e.stack || e)); });
