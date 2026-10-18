// Sticker Studio: peel stickers off the sheet and press them onto 50 cosy isometric scenes.
// Each sticker has a numbered outline to guide you, but it can go anywhere you like, and many
// come in other styles and colours. Scenes are pre-rendered by tools/sticker (Kenney CC0 3D art).
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, confetti, esc } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet } from './kit.js';

const ST = () => store.sticker;
let DATA = null;
export async function loadStickers() {
  if (!DATA) DATA = await (await fetch('levels/stickers.json')).json();
  return DATA;
}
const dir = (id) => `img/stickers/s${String(id).padStart(2, '0')}/`;
const fileOf = (id, n, v = 0) => `${dir(id)}${n}${v ? `-${v}` : ''}.webp`;

// Saved state per scene: { [n]: { v: style, c: colour, x, y } } where x, y (scene pixels, the
// sticker's centre) are only set for stickers placed away from their outline.
function placedOf(id) {
  const p = ST().placed[id];
  if (Array.isArray(p)) return Object.fromEntries(p.map((n) => [n, {}])); // saves from before styles existed
  return p || {};
}
const placedCount = (id) => Object.keys(placedOf(id)).length;
const doneCount = () => DATA.scenes.filter((s) => s && ST().done[s.id]).length;
// The scene to offer next: the last one played if it is unfinished, otherwise the first unfinished one.
function nextScene() {
  const last = DATA.scenes[ST().last - 1];
  if (last && !ST().done[last.id]) return last;
  return DATA.scenes.find((s) => s && !ST().done[s.id]) || DATA.scenes[0];
}

// Pictures of finished scenes that the player decorated their own way. Kept apart from the main
// save so they never crowd it out.
const THUMB_KEY = 'sudokucalm.stickerthumbs';
function myThumbs() { try { return JSON.parse(localStorage.getItem(THUMB_KEY) || '{}'); } catch { return {}; } }
function saveThumb(id, url) {
  const t = myThumbs();
  if (url) t[id] = url; else delete t[id];
  try { localStorage.setItem(THUMB_KEY, JSON.stringify(t)); } catch { /* storage full: keep the stock picture */ }
}

// ---------- colours ----------
export const COLOURS = [null, 0, 28, 50, 125, 175, 212, 268, 322]; // original, then hues
const swatch = (h) => (h == null ? 'conic-gradient(#e8505b, #ffcf3f, #3fc380, #4aa8e0, #9b7be0, #e8505b)' : `hsl(${h} 70% 55%)`);
const imgCache = new Map();
const loadImg = (src) => {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
  return imgCache.get(src);
};
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
// Repaints a sticker's main colour (the most common strong hue) in a new hue, leaving wood,
// metal and the rest alone. Pale stickers with no strong colour get their light parts tinted.
const recolourCache = new Map();
function recolour(src, hue) {
  const key = `${src}|${hue}`;
  if (!recolourCache.has(key)) recolourCache.set(key, (async () => {
    const im = await loadImg(src);
    if (!im) return src;
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height), px = data.data;
    const bins = new Float32Array(36);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const [h, s, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
      if (s > 0.3 && l > 0.15 && l < 0.88) bins[Math.floor(h / 10) % 36] += s;
    }
    let peak = 0, best = 0;
    for (let b = 0; b < 36; b++) { const v = bins[(b + 35) % 36] + bins[b] * 2 + bins[(b + 1) % 36]; if (v > best) { best = v; peak = b; } }
    const opaque = px.length / 4;
    const centre = peak * 10 + 5, pale = best < opaque * 0.02;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 20) continue;
      let [h, s, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
      if (pale) { if (l < 0.35 || s > 0.25) continue; h = hue; s = 0.55; l = l * 0.85; }
      else {
        const dh = ((h - centre + 540) % 360) - 180;
        if (Math.abs(dh) > 28 || s < 0.18) continue;
        h = (hue + dh * 0.5 + 360) % 360; s = Math.min(0.85, Math.max(s * 0.95, 0.42));
      }
      const [r, gg, b] = hsl2rgb(h, s, l);
      px[i] = r; px[i + 1] = gg; px[i + 2] = b;
    }
    g.putImageData(data, 0, 0);
    return c.toDataURL('image/png');
  })());
  return recolourCache.get(key);
}

// Transparent pixels should not catch taps, so placed stickers are tested against their pictures.
const alphaCache = new Map();
async function alphaMap(src) {
  if (!alphaCache.has(src)) alphaCache.set(src, loadImg(src).then((im) => {
    if (!im) return null;
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
  }));
  return alphaCache.get(src);
}

const ICON = {
  numbers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M10 8.5l2.2-1.5V17M9.5 17h5"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6"/></svg>',
  unzoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M7.5 10.5h6"/></svg>',
};

export const stickerHelp = () => helpSheet('How to play Sticker Studio', [
  'Every scene starts empty, with a numbered outline showing where each sticker was made to go.',
  'Drag a sticker up from the sheet and drop it on the scene. Near its outline it presses neatly into place, but you can leave it anywhere you like.',
  'Prefer tapping? Tap a sticker to pick it up, then tap where it should go.',
  'Tap a sticker on the scene to change it. Many come in other styles, and every one can be recoloured. Drag a sticker to move it, or drag it back to the sheet to take it off.',
  'The light bulb shows where a sticker belongs, the number button hides the numbers, and the magnifier zooms in on busy scenes.',
  'A scene is finished once every sticker is on it. There is no timer and no score, so take your time.',
], 'st-btn');

// ---------- Scene picker ----------
export function stickerHomeScreen(app) {
  const root = el(`<section class="screen st-theme st-home">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Sticker Studio</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  async function render() {
    await loadStickers();
    const mine = myThumbs();
    const pic = (s) => (ST().done[s.id] ? mine[s.id] || `${dir(s.id)}thumb.webp` : `${dir(s.id)}${placedCount(s.id) ? 'thumb' : 'blank'}.webp`);
    const nx = nextScene(), np = placedCount(nx.id), total = DATA.scenes.filter(Boolean).length;
    const card = (s) => {
      const p = placedCount(s.id), done = !!ST().done[s.id];
      return `<button class="st-card ${done ? 'done' : ''}" data-id="${s.id}">
        <img src="${done ? pic(s) : `${dir(s.id)}blank.webp`}" alt="" loading="lazy">
        <span class="st-card-name">${esc(s.name)}</span>
        ${done ? '<span class="st-tick" aria-label="Finished"></span>' : p ? `<span class="st-bar"><i style="width:${(100 * p) / s.s.length}%"></i></span>` : `<span class="st-card-count">${s.s.length} stickers</span>`}
      </button>`;
    };
    body.innerHTML = `
      <div class="st-hero" data-id="${nx.id}"><img src="${np ? `${dir(nx.id)}thumb.webp` : `${dir(nx.id)}blank.webp`}" alt=""></div>
      <button class="btn st-btn kit-btn" data-id="${nx.id}">${np ? 'Carry on' : doneCount() ? 'Next scene' : 'Start'}: ${esc(nx.name)}<small>${np ? `${np} of ${nx.s.length} stickers placed` : `${nx.s.length} stickers to place`}</small></button>
      <p class="st-total">${doneCount()} of ${total} scenes finished</p>
      ${DATA.groups.map((g, gi) => {
        const list = DATA.scenes.filter((s) => s && s.group === gi);
        if (!list.length) return '';
        const fin = list.filter((s) => ST().done[s.id]).length;
        return `<div class="st-group"><h2>${esc(g)}</h2><span>${fin}/${list.length}</span></div><div class="st-grid">${list.map(card).join('')}</div>`;
      }).join('')}`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return stickerHelp();
    const c = e.target.closest('[data-id]');
    if (c) { sfx.tap(); app.go('stickergame', { id: +c.dataset.id }); }
  });
  render();
  return { root, refresh: render };
}

// ---------- Playing a scene ----------
export function stickerGameScreen(app, { id }) {
  const st = ST();
  const root = el(`<section class="screen st-theme st-game ${st.numbers === false ? 'no-nums' : ''}">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title" data-el="title"></div><span class="st-count" data-el="count"></span>
      <button class="icon-btn" data-act="numbers" aria-label="Show or hide numbers">${ICON.numbers}</button>
      <button class="icon-btn" data-act="zoom" aria-label="Zoom" data-el="zoombtn">${ICON.zoom}</button></header>
    <div class="st-stage" data-el="stage"><div class="st-scene" data-el="scene"></div></div>
    <div class="st-sheet" data-el="sheet">
      <div class="st-tray" data-el="tray"></div>
      <button class="st-hint" data-act="hint" aria-label="Show me where a sticker goes"><img src="img/art/ui/light-bulb.svg" alt=""></button>
    </div>
    <div class="st-opts hidden" data-el="opts"></div>
    <div class="st-again hidden" data-el="again"><button class="btn ghost" data-act="again">Start this scene again</button></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let sc, placed = {}, rank = new Map(), spots = new Map(), pieces = new Map(), items = new Map(), badges = new Map();
  let sel = null, picked = null, zoom = 1, k = 1, done = false, suppressClick = false;

  async function build() {
    await loadStickers();
    sc = DATA.scenes[id - 1];
    if (!sc) { app.back(); return; }
    st.last = id; save();
    q('title').textContent = sc.name;
    placed = structuredClone(placedOf(id));
    done = !!st.done[id];
    const scene = q('scene');
    const pct = (v, of) => `${(100 * v) / of}%`;
    scene.innerHTML = `<img class="st-base" src="${dir(id)}base.webp" alt="">`;
    sc.s.forEach(([n, x, y, w, h, cx, cy, alts], i) => {
      rank.set(n, i + 1);
      const spot = el(`<div class="st-spot" data-n="${n}" style="left:${pct(x, sc.w)};top:${pct(y, sc.h)};width:${pct(w, sc.w)};height:${pct(h, sc.h)};z-index:${i + 1}"><img src="${fileOf(id, n)}" alt="" draggable="false"></div>`);
      scene.appendChild(spot);
      spots.set(n, { el: spot, n, x, y, w, h, cx, cy, boxes: [[x, y, w, h], ...(alts || [])] });
    });
    const nums = el('<div class="st-nums"></div>');
    for (const s of [...spots.values()].sort((a, b) => a.n - b.n)) {
      const b = el(`<span class="st-num" data-n="${s.n}">${s.n}</span>`);
      nums.appendChild(b); badges.set(s.n, b);
    }
    scene.appendChild(nums);
    for (const s of [...spots.values()].sort((a, b) => a.n - b.n)) addToTray(s.n);
    await Promise.all($$('img', root).map((i) => (i.complete ? null : i.decode().catch(() => null))));
    for (const n of Object.keys(placed).map(Number)) if (spots.has(n)) { removeFromTray(n, false); await drawPiece(n); }
    refreshState();
    layout();
    if (!st.seenHelp2) { st.seenHelp2 = true; save(); setTimeout(stickerHelp, 350); }
  }

  function addToTray(n) {
    const it = el(`<button class="st-item" data-n="${n}" aria-label="Sticker ${n}"><img src="${fileOf(id, n)}" alt="" draggable="false"><b>${n}</b></button>`);
    const after = [...items.keys()].filter((m) => m < n).sort((a, b) => b - a)[0];
    if (after != null) items.get(after).after(it); else q('tray').prepend(it);
    items.set(n, it);
  }
  function removeFromTray(n, animate = true) {
    const it = items.get(n); if (!it) return;
    items.delete(n);
    if (animate) { it.classList.add('used'); setTimeout(() => it.remove(), 260); } else it.remove();
  }

  // Where a placed sticker sits, in scene pixels.
  function boxOf(n) {
    const s = spots.get(n), p = placed[n];
    const [bx, by, bw, bh] = s.boxes[p.v || 0] || s.boxes[0];
    if (p.x == null) return { x: bx, y: by, w: bw, h: bh, free: false };
    return { x: p.x - bw / 2, y: p.y - bh / 2, w: bw, h: bh, free: true };
  }
  async function srcOf(n) {
    const p = placed[n], src = fileOf(id, n, p.v || 0);
    return p.c ? recolour(src, COLOURS[p.c]) : src;
  }
  async function drawPiece(n) {
    let pc = pieces.get(n);
    if (!pc) { pc = el(`<img class="st-piece" data-n="${n}" alt="" draggable="false">`); q('scene').insertBefore(pc, $('.st-nums', q('scene'))); pieces.set(n, pc); }
    const b = boxOf(n), pct = (v, of) => `${(100 * v) / of}%`;
    Object.assign(pc.style, { left: pct(b.x, sc.w), top: pct(b.y, sc.h), width: pct(b.w, sc.w), height: pct(b.h, sc.h), zIndex: b.free ? 1000 + Math.round(b.y + b.h) : rank.get(n) });
    pc.classList.toggle('free', b.free);
    pc.src = await srcOf(n);
    alphaMap(fileOf(id, n, placed[n].v || 0)); // ready for hit tests
    spots.get(n).el.classList.add('placed');
    badges.get(n).classList.add('gone');
  }

  function refreshState() {
    const total = sc.s.length, count = Object.keys(placed).length;
    q('count').textContent = `${count}/${total}`;
    const showOpts = picked != null;
    q('opts').classList.toggle('hidden', !showOpts);
    q('sheet').classList.toggle('hidden', showOpts || !items.size);
    q('again').classList.toggle('hidden', showOpts || !done || items.size > 0);
    q('scene').classList.toggle('complete', done && !items.size);
  }

  // Fit the scene to the stage, then spread out any number badges that would sit on top of each other.
  function layout() {
    if (!sc) return;
    const stage = q('stage');
    const sw = stage.clientWidth - 8, sh = stage.clientHeight - 8;
    k = Math.min(sw / sc.w, sh / sc.h) * zoom;
    const scene = q('scene');
    scene.style.width = sc.w * k + 'px'; scene.style.height = sc.h * k + 'px';
    stage.classList.toggle('zoomed', zoom > 1);
    const pts = [...spots.values()].filter((s) => !placed[s.n]).map((s) => ({ n: s.n, x: s.cx * k, y: s.cy * k, ox: s.cx * k, oy: s.cy * k }));
    const R = 22;
    for (let it = 0; it < 40; it++) {
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        if (d < R) { const p = (R - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * p; a.y -= uy * p; b.x += ux * p; b.y += uy * p; }
      }
      for (const p of pts) { p.x += (p.ox - p.x) * 0.05; p.y += (p.oy - p.y) * 0.05; }
    }
    for (const p of pts) { const b = badges.get(p.n); b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; }
  }

  function sparkle(cx, cy) {
    const scene = q('scene');
    const cols = ['#ffd54a', '#ff8fb1', '#7fd3ff', '#9be27a', '#ffffff'];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5, r = 26 + Math.random() * 30;
      const p = el(`<i class="st-spark" style="left:${cx * k}px;top:${cy * k}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;background:${cols[i % cols.length]}"></i>`);
      scene.appendChild(p); setTimeout(() => p.remove(), 700);
    }
  }

  // Put sticker n on the scene: on its outline (at == null) or centred on scene point at.
  async function put(n, at, keep = {}) {
    const fresh = !placed[n];
    placed[n] = { v: keep.v || 0, c: keep.c || 0, ...(at ? { x: Math.round(at.x), y: Math.round(at.y) } : {}) };
    persist();
    removeFromTray(n);
    select(null);
    await drawPiece(n);
    const pc = pieces.get(n);
    pc.classList.remove('press'); void pc.offsetWidth; pc.classList.add('press');
    const b = boxOf(n);
    if (!at) { pc.classList.add('shine'); setTimeout(() => pc.classList.remove('shine'), 900); sparkle(b.x + b.w / 2, b.y + b.h / 2); sfx.place(); buzz(12); }
    else { sfx.tap(); buzz(8); }
    refreshState(); layout();
    if (fresh && !items.size && !done) finish();
  }
  function takeOff(n) {
    const pc = pieces.get(n);
    delete placed[n];
    persist();
    pc?.remove(); pieces.delete(n);
    spots.get(n).el.classList.remove('placed');
    badges.get(n).classList.remove('gone');
    addToTray(n);
    if (picked === n) pick(null);
    sfx.erase();
    refreshState(); layout();
  }
  function persist() { st.placed[id] = placed; save(); }

  async function finish() {
    done = true;
    st.done[id] = true; save(true);
    refreshState();
    [...pieces.values()].forEach((pc, i) => setTimeout(() => { pc.classList.add('shine'); setTimeout(() => pc.classList.remove('shine'), 800); }, 70 * i));
    setTimeout(() => { sfx.win(); confetti(3000); }, 300);
    const thumb = await snapshot();
    await new Promise((r) => setTimeout(r, 1300));
    const next = DATA.scenes.find((s) => s && s.id > id && !st.done[s.id]) || DATA.scenes.find((s) => s && !st.done[s.id]);
    const fin = doneCount(), total = DATA.scenes.filter(Boolean).length;
    const v = await dialog({
      hero: thumb || `${dir(id)}thumb.webp`, title: 'Scene finished!',
      text: fin === total ? `You have finished all ${total} scenes. What a collection!` : `${sc.name} is complete. That's ${fin} of ${total} scenes.`,
      buttons: [...(next ? [{ label: `Next: ${next.name}`, value: 'next', cls: 'st-btn' }] : []), { label: 'Keep decorating', value: 'stay', cls: 'ghost' }, { label: 'All scenes', value: 'back', cls: 'ghost' }],
    });
    if (v === 'next') app.replace('stickergame', { id: next.id });
    else if (v === 'back') app.back();
  }

  // A small picture of the scene as the player made it, saved when it differs from the stock one.
  async function snapshot() {
    const custom = Object.values(placed).some((p) => p.v || p.c || p.x != null);
    if (!custom) { saveThumb(id, null); return null; }
    const W = 320, s = W / sc.w, c = document.createElement('canvas');
    c.width = W; c.height = Math.round(sc.h * s);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    const base = await loadImg(`${dir(id)}base.webp`); if (base) g.drawImage(base, 0, 0, c.width, c.height);
    const order = Object.keys(placed).map(Number).map((n) => ({ n, b: boxOf(n) }))
      .sort((a, b) => (a.b.free ? 1000 + a.b.y + a.b.h : rank.get(a.n)) - (b.b.free ? 1000 + b.b.y + b.b.h : rank.get(b.n)));
    for (const { n, b } of order) { const im = await loadImg(await srcOf(n)); if (im) g.drawImage(im, b.x * s, b.y * s, b.w * s, b.h * s); }
    const url = c.toDataURL('image/webp', 0.75);
    saveThumb(id, url);
    return url;
  }

  // ---------- choosing and picking ----------
  function select(n) { // a sticker on the sheet, ready to tap onto the scene
    if (sel != null) { items.get(sel)?.classList.remove('sel'); spots.get(sel)?.el.classList.remove('want'); }
    sel = n;
    if (n != null) { items.get(n)?.classList.add('sel'); spots.get(n).el.classList.add('want'); pick(null); }
  }
  function pick(n) { // a sticker on the scene, showing its options
    if (picked != null) pieces.get(picked)?.classList.remove('picked');
    picked = n;
    if (n != null) { select(null); pieces.get(n).classList.add('picked'); renderOpts(); }
    refreshState();
  }
  function renderOpts() {
    const n = picked, p = placed[n], s = spots.get(n);
    const styles = s.boxes.length > 1 ? `<div class="st-opt-row">${s.boxes.map((_, v) => `<button class="st-style ${(p.v || 0) === v ? 'on' : ''}" data-style="${v}" aria-label="Style ${v + 1}"><img src="${fileOf(id, n, v)}" alt=""></button>`).join('')}</div>` : '';
    q('opts').innerHTML = `
      <div class="st-opt-head"><b>${s.boxes.length > 1 ? 'Style and colour' : 'Colour'}</b>
        <button class="st-opt-btn" data-act="putback">Back to sheet</button><button class="st-opt-btn done" data-act="optsdone">Done</button></div>
      ${styles}
      <div class="st-opt-row st-swatches">${COLOURS.map((h, c) => `<button class="st-sw ${(p.c || 0) === c ? 'on' : ''}" data-colour="${c}" style="background:${swatch(h)}" aria-label="${c ? 'Colour ' + c : 'Original colour'}"></button>`).join('')}</div>`;
  }

  // Screen-space centre of sticker n's outline, and how close a drop has to be to snap.
  function target(n, v = 0) {
    const s = spots.get(n), [bx, by, bw, bh] = s.boxes[v] || s.boxes[0], r = q('scene').getBoundingClientRect();
    return { x: r.left + (bx + bw / 2) * k, y: r.top + (by + bh / 2) * k, tol: Math.max(30, Math.min(bw, bh) * k * 0.6), w: bw * k, h: bh * k };
  }
  const toScene = (x, y) => { const r = q('scene').getBoundingClientRect(); return { x: (x - r.left) / k, y: (y - r.top) / k, inside: x >= r.left && x <= r.right && y >= r.top && y <= r.bottom }; };

  // Topmost placed sticker with a solid pixel under the point.
  async function pieceAt(x, y) {
    const list = [...pieces.entries()].sort((a, b) => +b[1].style.zIndex - +a[1].style.zIndex);
    for (const [n, pc] of list) {
      const r = pc.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const m = await alphaMap(fileOf(id, n, placed[n].v || 0));
      if (!m) continue;
      const ix = Math.floor(((x - r.left) / r.width) * m.w), iy = Math.floor(((y - r.top) / r.height) * m.h);
      if (m.d[(iy * m.w + ix) * 4 + 3] > 40) return n;
    }
    return null;
  }

  // ---------- dragging ----------
  let pend = null, drag = null;
  q('tray').addEventListener('pointerdown', (e) => {
    const it = e.target.closest('.st-item'); if (!it) return;
    pend = { n: +it.dataset.n, x: e.clientX, y: e.clientY, id: e.pointerId, from: 'tray' };
  });
  q('stage').addEventListener('pointerdown', async (e) => {
    if (!sc || drag) return;
    const n = await pieceAt(e.clientX, e.clientY);
    if (n != null) pend = { n, x: e.clientX, y: e.clientY, id: e.pointerId, from: 'scene' };
  });
  root.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) return moveDrag(e);
    if (!pend || e.pointerId !== pend.id) return;
    const dx = e.clientX - pend.x, dy = e.clientY - pend.y;
    if (pend.from === 'scene') { if (Math.hypot(dx, dy) > 8) startDrag(e); return; }
    if (dy < -10 && Math.abs(dy) > Math.abs(dx) * 0.8) startDrag(e);
    else if (Math.abs(dx) > 12) pend = null; // the sheet is being scrolled
  });
  function startDrag(e) {
    const { n, from } = pend; pend = null;
    const p = placed[n], v = from === 'scene' ? p.v || 0 : 0;
    const s = spots.get(n), [, , bw, bh] = s.boxes[v] || s.boxes[0];
    const w = bw * k, h = bh * k;
    const lift = Math.max(1, 46 / Math.max(w, h)); // tiny stickers grow a little while carried
    const src = from === 'scene' ? pieces.get(n).src : fileOf(id, n);
    const g = el(`<img class="st-ghost" src="${src}" alt="">`);
    g.style.width = w + 'px'; g.style.height = h + 'px';
    root.appendChild(g);
    let grab = { x: 0, y: -34 - (h * lift) / 2 }; // from the sheet the sticker rides above the finger
    if (from === 'scene') { // from the scene it stays where the finger caught it
      const r = pieces.get(n).getBoundingClientRect();
      grab = { x: r.left + r.width / 2 - e.clientX, y: r.top + r.height / 2 - e.clientY };
      pieces.get(n).classList.add('lifted');
    } else items.get(n)?.classList.add('lifted');
    drag = { n, from, g, id: e.pointerId, w, h, lift: from === 'scene' ? 1.06 : lift, grab, keep: from === 'scene' ? { v: p.v, c: p.c } : {} };
    try { root.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    select(null); pick(null);
    sfx.tap(); buzz(8);
    moveDrag(e);
    requestAnimationFrame(() => g.classList.add('up'));
  }
  function moveDrag(e) {
    const d = drag;
    d.cx = e.clientX + d.grab.x; d.cy = e.clientY + d.grab.y;
    d.g.style.transform = `translate(${d.cx - d.w / 2}px, ${d.cy - d.h / 2}px) scale(${d.lift})`;
    const t = target(d.n, d.keep.v || 0);
    const near = Math.hypot(d.cx - t.x, d.cy - t.y) < t.tol;
    if (near !== d.near) { d.near = near; spots.get(d.n).el.classList.toggle('near', near); }
  }
  function endDrag(cancelled) {
    const d = drag; drag = null;
    const { n, g, from } = d;
    spots.get(n).el.classList.remove('near');
    const t = target(n, d.keep.v || 0), sp = toScene(d.cx, d.cy);
    const overSheet = d.cy > q('stage').getBoundingClientRect().bottom;
    const land = (x, y, then) => {
      g.classList.add('land');
      g.style.transform = `translate(${x - d.w / 2}px, ${y - d.h / 2}px) scale(1)`;
      setTimeout(() => { g.remove(); then(); }, 140);
    };
    if (!cancelled && Math.hypot(d.cx - t.x, d.cy - t.y) < t.tol) {
      land(t.x, t.y, () => { pieces.get(n)?.classList.remove('lifted'); put(n, null, d.keep); });
    } else if (!cancelled && sp.inside && !overSheet) {
      land(d.cx, d.cy, () => { pieces.get(n)?.classList.remove('lifted'); put(n, sp, d.keep); });
    } else if (from === 'scene' && !cancelled) { // dragged off the scene: back onto the sheet
      g.classList.add('home'); g.style.opacity = '0';
      g.style.transform = `translate(${d.cx - d.w / 2}px, ${d.cy - d.h / 2 + 60}px) scale(0.4)`;
      setTimeout(() => { g.remove(); takeOff(n); }, 240);
    } else {
      const back = from === 'scene' ? pieces.get(n) : items.get(n);
      const r = back.getBoundingClientRect();
      g.classList.add('home');
      g.style.transform = `translate(${r.left + r.width / 2 - d.w / 2}px, ${r.top + r.height / 2 - d.h / 2}px) scale(${from === 'scene' ? 1 : 0.4})`;
      if (from !== 'scene') g.style.opacity = '0';
      setTimeout(() => { g.remove(); back.classList.remove('lifted'); }, 240);
    }
  }
  root.addEventListener('pointerup', (e) => {
    if (drag && e.pointerId === drag.id) return endDrag(false);
    if (pend && e.pointerId === pend.id) {
      const { n, from } = pend; pend = null;
      if (from === 'tray') { if (sel === n) select(null); else { select(n); sfx.tap(); } }
      else { if (picked === n) pick(null); else { pick(n); sfx.tap(); } suppressClick = true; } // the click that follows is ours
    }
  });
  root.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) endDrag(true);
    if (pend && e.pointerId === pend.id) pend = null;
  });

  // ---------- tapping the scene ----------
  q('stage').addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    if (!sc) return;
    if (sel != null) {
      const n = sel, t = target(n), sp = toScene(e.clientX, e.clientY);
      const onSpot = Math.abs(e.clientX - t.x) < Math.max(t.w / 2 + 10, t.tol) && Math.abs(e.clientY - t.y) < Math.max(t.h / 2 + 10, t.tol);
      if (!onSpot && !sp.inside) return;
      const dest = onSpot ? { x: t.x, y: t.y } : { x: e.clientX, y: e.clientY };
      // fly the sticker from the sheet to where it goes
      const it = items.get(n), ir = it.getBoundingClientRect();
      const g = el(`<img class="st-ghost up land" src="${fileOf(id, n)}" alt="">`);
      g.style.width = t.w + 'px'; g.style.height = t.h + 'px';
      g.style.transform = `translate(${ir.left + ir.width / 2 - t.w / 2}px, ${ir.top + ir.height / 2 - t.h / 2}px) scale(0.6)`;
      root.appendChild(g); it.classList.add('lifted');
      requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transform = `translate(${dest.x - t.w / 2}px, ${dest.y - t.h / 2}px) scale(1)`; }));
      setTimeout(() => { g.remove(); put(n, onSpot ? null : sp); }, 300);
      return;
    }
    if (picked != null) { pick(null); return; }
    // nothing in hand: tapping an outline makes its number wave
    const sp = e.target.closest('.st-spot:not(.placed)');
    if (sp) { const b = badges.get(+sp.dataset.n); b.classList.remove('wave'); void b.offsetWidth; b.classList.add('wave'); }
  });

  function hint() {
    const n = sel ?? [...items.keys()].sort((a, b) => a - b)[0];
    if (n == null) return;
    select(n);
    items.get(n)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    const s = spots.get(n).el;
    s.classList.remove('hint'); void s.offsetWidth; s.classList.add('hint');
    setTimeout(() => s.classList.remove('hint'), 2600);
    if (zoom > 1) s.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    sfx.hint();
  }

  function setZoom(z) {
    const stage = q('stage');
    const cx = (stage.scrollLeft + stage.clientWidth / 2) / (stage.scrollWidth || 1), cy = (stage.scrollTop + stage.clientHeight / 2) / (stage.scrollHeight || 1);
    zoom = z;
    q('zoombtn').innerHTML = zoom > 1 ? ICON.unzoom : ICON.zoom;
    layout();
    stage.scrollLeft = cx * stage.scrollWidth - stage.clientWidth / 2;
    stage.scrollTop = cy * stage.scrollHeight - stage.clientHeight / 2;
  }

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'hint') hint();
    else if (a === 'numbers') { st.numbers = st.numbers === false; save(); root.classList.toggle('no-nums', st.numbers === false); sfx.tap(); }
    else if (a === 'zoom') { setZoom(zoom === 1 ? 1.7 : zoom < 2.4 ? 2.5 : 1); sfx.tap(); }
    else if (a === 'optsdone') { pick(null); sfx.tap(); }
    else if (a === 'putback' && picked != null) takeOff(picked);
    else if (a === 'again') {
      st.placed[id] = {}; delete st.done[id]; save(); saveThumb(id, null);
      app.replace('stickergame', { id });
    }
    const sty = e.target.closest('[data-style]'), col = e.target.closest('[data-colour]');
    if ((sty || col) && picked != null) {
      const n = picked, p = placed[n];
      if (sty) {
        const v = +sty.dataset.style, s = spots.get(n);
        if (p.x != null) { // keep a moved sticker standing on the same ground point
          const [ox, oy, ow, oh] = s.boxes[p.v || 0], [nx, ny, nw, nh] = s.boxes[v];
          p.x += nx + nw / 2 - (ox + ow / 2);
          p.y += oh / 2 + (ny + nh - oy - oh) - nh / 2;
        }
        p.v = v;
      } else p.c = +col.dataset.colour;
      persist();
      await drawPiece(n);
      const pc = pieces.get(n); pc.classList.remove('press'); void pc.offsetWidth; pc.classList.add('press');
      renderOpts(); sfx.tap();
      if (done) snapshot();
    }
  });

  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => build());
  return { root, destroy: () => window.removeEventListener('resize', onResize) };
}

export const stickerCardArt = () => '<div class="art-sticker"><img src="img/stickers/s01/thumb.webp" alt=""><img src="img/stickers/s46/thumb.webp" alt=""></div>';
