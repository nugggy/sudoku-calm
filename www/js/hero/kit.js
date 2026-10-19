// Marvel Heroes: the hero roster, the hero builder's wardrobe, and drawing a hero.
// Heroes are dressed-up Kenney Toon Characters (CC0): the body parts are recoloured at load time (clothes take the
// suit colours, skin stays unless the hero changes it) and posed by a small rig. Masks, capes, emblems and the
// shield are drawn here. Thor's hammer and the arc reactor are fan-made models rendered by tools/hero (CC-BY).
// The general game engine (camera, particles, sounds) is shared with the Yeti Games: import it from '../yeti/kit.js'.
import { store, save } from '../store.js';

export const H = () => store.hero;

// ---------- Images ----------
export const IMG = {};
const BASES = ['mp', 'fp', 'ma', 'fa'];
const PARTS = ['head', 'body', 'arm', 'hand', 'leg', 'legBend', 'back'];
const HAS_BACK = { fp: 1, fa: 1 };
const ROBOTS = ['blue', 'green', 'red', 'yellow'];
let loading = null;
function img(src) { return new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; }); }
export function loadHero() {
  if (!loading) loading = (async () => {
    const jobs = [];
    for (const b of BASES) for (const p of PARTS) if (p !== 'back' || HAS_BACK[b]) jobs.push(img(`img/hero/parts/${b}/${p}.png`).then((im) => { IMG[`${b}_${p}`] = im; }));
    for (const key of new Set([...POWER_GEMS, ...STONES].map((x) => x.img))) { const [, c, n] = key.split('_'); jobs.push(img(`img/hero/gems/tile${c}_${n}.png`).then((im) => { IMG[key] = im; })); }
    for (const c of ROBOTS) for (const s of ['Body', 'Hurt']) jobs.push(img(`img/hero/robots/robot_${c}${s}.png`).then((im) => { IMG[`robot_${c}${s}`] = im; }));
    for (const k of ['hammer', 'reactor']) jobs.push(img(`img/hero/${k}.webp`).then((im) => { IMG[k] = im; }));
    await Promise.all(jobs);
    for (const b of BASES) palettes[b] = skinPalette(IMG[`${b}_hand`]);
  })();
  return loading;
}

// ---------- Roster ----------
// power words are what Hero HQ matches against emergencies.
export const HEROES = [
  { id: 'spidey', name: 'Spider-Man', powers: ['agility', 'web'], look: { base: 'ma', top: '#d0232a', legs: '#1f4fb0', mask: 'full', maskCol: '#d0232a', pattern: 'web', lens: 'spider', emblem: 'spider', emblemCol: '#1a1a1a', cape: 'none', prop: 'none' } },
  { id: 'cap', name: 'Captain America', powers: ['shield', 'leader'], look: { base: 'ma', top: '#1f4ea3', legs: '#1f4ea3', mask: 'cowl', maskCol: '#1f4ea3', emblem: 'star', emblemCol: '#ffffff', stripes: true, cape: 'none', prop: 'shield' } },
  { id: 'iron', name: 'Iron Man', powers: ['flight', 'tech'], look: { base: 'mp', top: '#b3161b', legs: '#b3161b', mask: 'helmet', maskCol: '#b3161b', emblem: 'reactor', emblemCol: '#bff4ff', cape: 'none', prop: 'none', boots: '#e3b23c' } },
  { id: 'thor', name: 'Thor', powers: ['lightning', 'flight'], look: { base: 'ma', top: '#3a4050', legs: '#262a33', mask: 'none', emblem: 'discs', emblemCol: '#c9ced8', cape: 'long', capeCol: '#c0262d', prop: 'hammer' } },
  { id: 'hulk', name: 'Hulk', powers: ['strength'], look: { base: 'mp', skin: '#62ad3c', top: 'skin', legs: '#6b3fa0', mask: 'none', emblem: 'none', cape: 'none', prop: 'none', scale: 1.22 } },
  { id: 'widow', name: 'Black Widow', powers: ['stealth', 'agility'], look: { base: 'fa', top: '#1d1f26', legs: '#1d1f26', mask: 'none', emblem: 'hourglass', emblemCol: '#d62828', cape: 'none', prop: 'none' } },
  { id: 'panther', name: 'Black Panther', powers: ['speed', 'stealth'], look: { base: 'mp', top: '#1c1b24', legs: '#1c1b24', mask: 'full', maskCol: '#1c1b24', ears: true, lens: 'panther', emblem: 'necklace', emblemCol: '#cfd3e0', cape: 'none', prop: 'none' } },
  { id: 'marvel', name: 'Captain Marvel', powers: ['cosmic', 'flight'], look: { base: 'fp', top: '#c8243a', legs: '#1f3f99', mask: 'none', emblem: 'star8', emblemCol: '#f2c230', sash: '#f2c230', cape: 'none', prop: 'none' } },
];
export const heroById = (id) => HEROES.find((h) => h.id === id);

// ---------- Hero Builder wardrobe ----------
// Everything here can be mixed on "Your hero". Items cost coins, earned in every game.
export const BUILD = {
  base: [{ id: 'mp', name: 'Strong jaw', price: 0 }, { id: 'ma', name: 'Swept hair', price: 0 }, { id: 'fp', name: 'Headband', price: 0 }, { id: 'fa', name: 'Long hair', price: 0 }],
  mask: [{ id: 'none', name: 'No mask', price: 0 }, { id: 'eyes', name: 'Eye mask', price: 0 }, { id: 'cowl', name: 'Cowl', price: 120 }, { id: 'full', name: 'Full mask', price: 150 }, { id: 'helmet', name: 'Armour helmet', price: 250 }],
  cape: [{ id: 'none', name: 'No cape', price: 0 }, { id: 'short', name: 'Short cape', price: 100 }, { id: 'long', name: 'Long cape', price: 200 }],
  emblem: [{ id: 'none', name: 'None', price: 0 }, { id: 'star', name: 'Star', price: 0 }, { id: 'bolt', name: 'Lightning', price: 80 }, { id: 'spider', name: 'Spider', price: 120 }, { id: 'hourglass', name: 'Hourglass', price: 100 }, { id: 'star8', name: 'Starburst', price: 120 }, { id: 'reactor', name: 'Arc reactor', price: 300 }, { id: 'discs', name: 'Armour discs', price: 150 }],
  prop: [{ id: 'none', name: 'Nothing', price: 0 }, { id: 'shield', name: 'Round shield', price: 400 }, { id: 'hammer', name: 'Hammer', price: 500 }],
  colours: ['#d0232a', '#1f4ea3', '#1f4fb0', '#1d1f26', '#62ad3c', '#6b3fa0', '#f2c230', '#e3762b', '#14a3a3', '#ec5fa4', '#c9ced8', '#ffffff'],
};
export const defaultLook = () => ({ base: 'ma', top: '#14a3a3', legs: '#1d1f26', mask: 'eyes', maskCol: '#1d1f26', cape: 'short', capeCol: '#f2c230', emblem: 'star', emblemCol: '#f2c230', prop: 'none' });
// The hero chosen in the builder ('custom' is your own design).
export function chosen() {
  const h = H();
  if (h.pick && h.pick !== 'custom') { const r = heroById(h.pick); if (r) return r; }
  return { id: 'custom', name: h.name || 'Your hero', powers: ['agility', 'strength'], look: { ...defaultLook(), ...(h.look || {}) } };
}
export function addCoins(n) { const h = H(); h.coins = Math.max(0, (h.coins || 0) + Math.round(n)); save(); return h.coins; }

// ---------- Recolouring ----------
const palettes = {};
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
// Every colour in the hand picture is skin (its shading included).
function skinPalette(im) {
  if (!im) return [];
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, seen = new Map();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 220) { const k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3); seen.set(k, (seen.get(k) || 0) + 1); }
  return [...seen.entries()].filter(([, n]) => n > 6).map(([k]) => [(k >> 10) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
}
const isSkin = (pal, r, g, b) => pal.some(([a, c, d]) => Math.abs(a - r) + Math.abs(c - g) + Math.abs(d - b) < 34);
// mode: 'clothes' recolours everything that is not skin (and skin too when skinCol is given);
// 'all' recolours every pixel (a full mask over the head). Shading is kept by scaling with brightness.
function recolour(im, base, { clothes = null, skin = null, all = null } = {}) {
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  if (!clothes && !skin && !all) return c;
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data, pal = palettes[base] || [];
  // reference brightness so the most common clothes shade maps to the chosen colour itself
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && (all || !isSkin(pal, d[i], d[i + 1], d[i + 2]))) { const l = lum(d[i], d[i + 1], d[i + 2]); if (l > 40) { sum += l; n++; } }
  const ref = n ? sum / n : 160;
  const C = clothes && hex(clothes), S = skin && hex(skin), A = all && hex(all);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2], l = lum(r, gg, b);
    const sk = isSkin(pal, r, gg, b);
    let to = A || (sk ? S : C);
    if (!to) continue;
    if (l < 45 && !A) continue; // dark outlines and pupils stay
    const k = Math.min(1.6, Math.max(0.35, l / (sk && !A ? 170 : ref)));
    d[i] = Math.min(255, to[0] * k); d[i + 1] = Math.min(255, to[1] * k); d[i + 2] = Math.min(255, to[2] * k);
  }
  g.putImageData(id, 0, 0);
  return c;
}
const cache = new Map();
// The recoloured parts for a look, built once and kept.
function partsFor(look) {
  const key = JSON.stringify([look.base, look.top, look.legs, look.skin, look.mask, look.maskCol]);
  if (cache.has(key)) return cache.get(key);
  const b = look.base, P = {};
  const top = look.top === 'skin' ? look.skin : look.top;
  const suited = ['full', 'helmet'].includes(look.mask);
  const skinTop = look.skin || (suited ? top : null); // a full suit covers the neck and hands too
  for (const p of PARTS) {
    const im = IMG[`${b}_${p}`]; if (!im) continue;
    if (p === 'body' || p === 'arm') P[p] = recolour(im, b, { clothes: top, skin: skinTop });
    else if (p === 'leg' || p === 'legBend') P[p] = recolour(im, b, { clothes: look.legs, skin: look.skin });
    else if (p === 'hand') P[p] = recolour(im, b, { skin: skinTop });
    else if (p === 'head') P[p] = suited ? recolour(IMG.fp_head, 'fp', { all: look.maskCol }) : recolour(im, b, { skin: look.skin });
    else if (p === 'back') P[p] = suited ? null : recolour(im, b, {});
  }
  if (look.mask === 'cowl') { // the top of the head and the sides take the mask colour, the face below the eyes stays
    const full = recolour(IMG[`${b}_head`], b, { all: look.maskCol }), c = P.head, g = c.getContext('2d');
    g.save(); g.beginPath(); g.rect(0, 0, c.width, c.height * 0.5); g.rect(0, 0, c.width * 0.2, c.height); g.rect(c.width * 0.8, 0, c.width * 0.2, c.height); g.clip(); g.drawImage(full, 0, 0); g.restore();
  }
  cache.set(key, P);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return P;
}

// ---------- Poses ----------
// Angles in radians (0 = hanging straight down, positive swings the limb towards the hero's left / screen right).
// lean tilts the whole body, bend uses the bent-leg picture.
export const POSES = {
  stand: { la: 0.12, ra: -0.12, ll: 0.04, rl: -0.04 },
  cheer: { la: 2.7, ra: -2.7, ll: 0.12, rl: -0.12 },
  jump: { la: 2.4, ra: -0.9, ll: 0.5, rl: -0.2, bend: 1 },
  fall: { la: 2.0, ra: -2.0, ll: 0.3, rl: -0.3 },
  swing: { la: 3.0, ra: -0.5, ll: 0.35, rl: 0.1, bend: 1 },
  throw: { la: 0.3, ra: -1.7, ll: 0.25, rl: -0.25 },
  fly: { la: 2.9, ra: 2.9, ll: 0.1, rl: 0.0, lean: 1.35 },
  crouch: { la: 0.6, ra: -0.6, ll: 0.6, rl: -0.6, bend: 1, drop: 18 },
  punch: { la: 1.6, ra: -0.3, ll: 0.3, rl: -0.2 },
};
export function runPose(t) { const s = Math.sin(t * 12); return { la: 0.9 * s, ra: 0.9 * s, ll: -0.7 * s, rl: 0.7 * s, bend: Math.abs(s) > 0.5 ? 1 : 0 }; }

// Rig in part pixels (HD Kenney parts, a hero is about 250 tall), y up from the ground point.
const HIP = 56, SHOULDER = HIP + 60, NECK = HIP + 70;

// Draws a hero. (x, y) is the ground point under the feet; h is the hero's height on screen in px.
// o: { look, pose (name or object), flip, rot (radians, around the middle), alpha, flow (-1..1 cape blowing), t }
export function drawHero(g, x, y, h, o = {}) {
  const look = o.look || chosen().look;
  const P = partsFor(look);
  if (!P.body) return;
  const pose = typeof o.pose === 'object' ? o.pose : POSES[o.pose || 'stand'];
  const k = (h / 250) * (look.scale || 1);
  g.save();
  g.translate(x, y);
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  g.scale(o.flip ? -k : k, k);
  if (o.rot) { g.translate(0, -125); g.rotate(o.flip ? -o.rot : o.rot); g.translate(0, 125); }
  g.translate(0, pose.drop || 0);
  if (pose.lean) { g.translate(0, -HIP); g.rotate(pose.lean); g.translate(0, HIP); }
  const part = (im, px, py, ang, ax = 0.5, ay = 0) => { if (!im) return; g.save(); g.translate(px, -py); g.rotate(ang); g.drawImage(im, -im.width * ax, -im.height * ay); g.restore(); };
  const leg = (sx, ang) => part(pose.bend ? P.legBend : P.leg, sx, HIP, -ang);
  const arm = (sx, ang) => {
    g.save(); g.translate(sx, -SHOULDER); g.rotate(-ang);
    g.drawImage(P.arm, -P.arm.width / 2, -6);
    g.drawImage(P.hand, -P.hand.width / 2, P.arm.height - 20);
    g.restore();
  };
  // cape behind everything
  if (look.cape && look.cape !== 'none') drawCape(g, look, pose, o.flow ?? 0, o.t ?? 0);
  if (P.back) part(P.back, 0, NECK + 48, 0, 0.5, 0.5);
  leg(-13, pose.ll); leg(13, pose.rl);
  part(P.body, 0, HIP + 74, 0, 0.5, 0);
  if (look.stripes) { g.fillStyle = '#d0232a'; for (let i = 0; i < 3; i++) g.fillRect(-26, -HIP - 24 + i * -9 + 0, 52, 4); }
  if (look.sash) { g.fillStyle = look.sash; g.beginPath(); g.moveTo(-30, -HIP - 62); g.lineTo(30, -HIP - 18); g.lineTo(30, -HIP - 10); g.lineTo(-30, -HIP - 54); g.fill(); }
  drawEmblem(g, look.emblem, look.emblemCol, 0, -HIP - 40, 1);
  if (look.boots) { g.fillStyle = look.boots; g.fillRect(-24, -14, 20, 14); g.fillRect(4, -14, 20, 14); }
  arm(-31, pose.ra); // the hero's right arm, on the screen's left
  part(P.head, 0, NECK + 50, 0, 0.5, 0.5);
  drawMask(g, look, 0, -(NECK + 50), P.head);
  arm(31, pose.la);
  if (look.prop === 'shield') drawShieldProp(g, pose);
  if (look.prop === 'hammer' && IMG.hammer) { g.save(); g.translate(31, -SHOULDER); g.rotate(-pose.la); g.translate(0, 60); g.rotate(Math.PI); g.drawImage(IMG.hammer, -36, -10, 72, 72); g.restore(); }
  g.restore();
}
function drawShieldProp(g, pose) {
  g.save(); g.translate(-31, -SHOULDER); g.rotate(-pose.ra); g.translate(-8, 50);
  shield(g, 0, 0, 34); g.restore();
}

function drawCape(g, look, pose, flow, t) {
  const len = look.cape === 'long' ? 150 : 95, w = 70;
  const wave = Math.sin(t * 6) * 6;
  const lean = (pose.lean ? 0.3 : 0) + flow * 0.6;
  g.save(); g.translate(0, -SHOULDER - 4);
  const ex = Math.sin(lean) * len, ey = Math.cos(lean) * len;
  g.fillStyle = look.capeCol || '#c0262d';
  g.beginPath();
  g.moveTo(-28, 0);
  g.quadraticCurveTo(-w * 0.7 + ex * 0.4 - wave, ey * 0.5, -w * 0.62 + ex, ey);
  g.quadraticCurveTo(ex, ey + 10 + wave, w * 0.62 + ex, ey);
  g.quadraticCurveTo(w * 0.7 + ex * 0.4 + wave, ey * 0.5, 28, 0);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(-10, 4); g.quadraticCurveTo(ex * 0.5, ey * 0.6, ex * 0.9, ey); g.lineTo(ex * 0.9 + 12, ey); g.quadraticCurveTo(ex * 0.5 + 6, ey * 0.6, 4, 4); g.fill();
  g.restore();
}

function drawMask(g, look, cx, cy, head) {
  const m = look.mask, W = head.width, Hh = head.height;
  const ey = cy + Hh * 0.06; // eye line
  if (m === 'eyes') {
    g.fillStyle = look.maskCol || '#1d1f26';
    g.beginPath(); g.moveTo(cx - W * 0.43, ey - 10); g.quadraticCurveTo(cx, ey - 22, cx + W * 0.43, ey - 10); g.lineTo(cx + W * 0.38, ey + 12); g.quadraticCurveTo(cx + W * 0.2, ey + 18, cx + 6, ey + 8); g.lineTo(cx - 6, ey + 8); g.quadraticCurveTo(cx - W * 0.2, ey + 18, cx - W * 0.38, ey + 12); g.closePath(); g.fill();
    g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * W * 0.2, ey, 9, 6, 0, 0, 6.283); g.fill(); }
  } else if (m === 'cowl') {
    g.fillStyle = '#fff'; g.font = '900 26px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('A', cx, cy - Hh * 0.22);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * W * 0.36, cy - Hh * 0.18); g.lineTo(cx + s * W * 0.45, cy - Hh * 0.26); g.lineTo(cx + s * W * 0.4, cy - Hh * 0.08); g.stroke(); }
  } else if (m === 'full') {
    if (look.pattern === 'web') {
      g.save(); g.strokeStyle = 'rgba(20,10,10,.55)'; g.lineWidth = 1.6;
      const r = Math.min(W, Hh) * 0.5;
      for (let a = 0; a < 12; a++) { const t = (a / 12) * 6.283; g.beginPath(); g.moveTo(cx, cy + 4); g.lineTo(cx + Math.cos(t) * r, cy + 4 + Math.sin(t) * r); g.stroke(); }
      for (let q = 1; q <= 3; q++) { g.beginPath(); for (let a = 0; a <= 12; a++) { const t = (a / 12) * 6.283, rr = (q / 3.3) * r; const px = cx + Math.cos(t) * rr, py = cy + 4 + Math.sin(t) * rr; if (a) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke(); }
      g.restore();
    }
    if (look.ears) { g.fillStyle = look.maskCol; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * W * 0.22, cy - Hh * 0.42); g.lineTo(cx + s * W * 0.38, cy - Hh * 0.62); g.lineTo(cx + s * W * 0.44, cy - Hh * 0.32); g.fill(); } g.strokeStyle = '#cfd3e0'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - W * 0.3, ey - 16); g.lineTo(cx, ey - 30); g.lineTo(cx + W * 0.3, ey - 16); g.stroke(); }
    for (const s of [-1, 1]) {
      g.save(); g.translate(cx + s * W * 0.19, ey); g.scale(s, 1);
      g.fillStyle = '#16181f'; g.beginPath(); g.moveTo(-14, -12); g.quadraticCurveTo(16, -18, 18, 4); g.quadraticCurveTo(4, 18, -12, 8); g.closePath(); g.fill();
      g.fillStyle = look.lens === 'panther' ? '#e9ecf5' : '#ffffff';
      g.beginPath(); g.moveTo(-10, -8); g.quadraticCurveTo(13, -13, 14, 3); g.quadraticCurveTo(3, 13, -9, 5); g.closePath(); g.fill();
      g.restore();
    }
  } else if (m === 'helmet') {
    g.fillStyle = '#e3b23c';
    g.beginPath(); g.moveTo(cx - W * 0.33, ey - 18); g.lineTo(cx + W * 0.33, ey - 18); g.lineTo(cx + W * 0.3, ey + 22); g.quadraticCurveTo(cx, ey + 40, cx - W * 0.3, ey + 22); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,70,10,.45)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#d8fbff'; g.shadowColor = '#7ff0ff'; g.shadowBlur = 8;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 6, ey - 4); g.lineTo(cx + s * W * 0.27, ey - 8); g.lineTo(cx + s * W * 0.25, ey + 1); g.lineTo(cx + s * 7, ey + 3); g.closePath(); g.fill(); }
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(120,70,10,.6)'; g.beginPath(); g.moveTo(cx - 14, ey + 22); g.lineTo(cx + 14, ey + 22); g.stroke();
  }
}

// Chest emblems (own drawings), centred at (x, y), s = scale (1 = chest size).
export function drawEmblem(g, kind, col, x, y, s = 1) {
  if (!kind || kind === 'none') return;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = col || '#fff'; g.strokeStyle = col || '#fff';
  if (kind === 'star') starPath(g, 0, 0, 14, 6, 5), g.fill();
  else if (kind === 'star8') { starPath(g, 0, 0, 15, 7, 8); g.fill(); g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.arc(0, 0, 4, 0, 6.283); g.fill(); }
  else if (kind === 'bolt') { g.beginPath(); g.moveTo(4, -16); g.lineTo(-9, 2); g.lineTo(0, 2); g.lineTo(-4, 16); g.lineTo(9, -3); g.lineTo(0, -3); g.closePath(); g.fill(); }
  else if (kind === 'hourglass') { g.beginPath(); g.moveTo(-10, -12); g.lineTo(10, -12); g.lineTo(2, 0); g.lineTo(10, 12); g.lineTo(-10, 12); g.lineTo(-2, 0); g.closePath(); g.fill(); }
  else if (kind === 'spider') {
    g.beginPath(); g.ellipse(0, -5, 4, 5, 0, 0, 6.283); g.ellipse(0, 6, 5, 8, 0, 0, 6.283); g.fill();
    g.lineWidth = 2; g.lineCap = 'round';
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const yy = -6 + i * 4; g.beginPath(); g.moveTo(0, yy); g.lineTo(sx * 10, yy - 6 + i * 3); g.lineTo(sx * 15, yy + (i < 2 ? -10 : 8)); g.stroke(); }
  } else if (kind === 'reactor') {
    g.shadowColor = '#7ff0ff'; g.shadowBlur = 14;
    if (IMG.reactor) g.drawImage(IMG.reactor, -17, -17, 34, 34); else { g.fillStyle = '#bff4ff'; g.beginPath(); g.arc(0, 0, 13, 0, 6.283); g.fill(); }
    g.fillStyle = 'rgba(200,250,255,.85)'; g.beginPath(); g.arc(0, 0, 6, 0, 6.283); g.fill();
    g.shadowBlur = 0;
  } else if (kind === 'discs') { for (const [dx, dy] of [[-12, -8], [12, -8], [-12, 8], [12, 8]]) { g.beginPath(); g.arc(dx, dy, 6, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; g.stroke(); } }
  else if (kind === 'necklace') { g.lineWidth = 3; g.beginPath(); g.arc(0, -22, 22, 0.5, Math.PI - 0.5); g.stroke(); for (let i = -3; i <= 3; i++) { const a = Math.PI / 2 + i * 0.22; g.beginPath(); g.moveTo(Math.cos(a) * 22, -22 + Math.sin(a) * 22); g.lineTo(Math.cos(a) * 30, -22 + Math.sin(a) * 30); g.stroke(); } }
  g.restore();
}
export function starPath(g, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
  g.closePath();
}
// The round shield (drawn), centre (x, y), radius r, spin = rotation for a thrown shield.
export function shield(g, x, y, r, spin = 0, squash = 1) {
  g.save(); g.translate(x, y); g.rotate(spin); g.scale(1, squash);
  const ring = (rr, c) => { g.fillStyle = c; g.beginPath(); g.arc(0, 0, rr, 0, 6.283); g.fill(); };
  ring(r, '#b7141c'); ring(r * 0.78, '#f2f2f2'); ring(r * 0.56, '#b7141c'); ring(r * 0.36, '#1f4ea3');
  g.fillStyle = '#fff'; starPath(g, 0, 0, r * 0.32, r * 0.13); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = Math.max(1, r * 0.06); g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.35, r * 0.4, r * 0.18, -0.6, 0, 6.283); g.fill();
  g.restore();
}

// ---------- Gems and stones ----------
// Puzzle Pack 2 tiles (Kenney, CC0). Power Match uses six kinds; each has a colour and a shape so they read without colour.
export const POWER_GEMS = [
  { name: 'Energy', img: 'gem_Orange_44', col: '#ff8a1f' },
  { name: 'Ice', img: 'gem_Blue_40', col: '#3aa6f0' },
  { name: 'Lightning', img: 'gem_Yellow_44', col: '#ffd23f' },
  { name: 'Cosmic', img: 'gem_Pink_46', col: '#ff6fb5' },
  { name: 'Life', img: 'gem_Green_48', col: '#4cc24c' },
  { name: 'Force', img: 'gem_Red_42', col: '#e5383b' },
];
// The six Infinity Stones: a cut gem picture tinted to the stone's colour (purple is tinted from pink).
export const STONES = [
  { id: 'space', name: 'Space Stone', img: 'gem_Blue_46', col: '#2f7dff' },
  { id: 'mind', name: 'Mind Stone', img: 'gem_Yellow_46', col: '#ffd23f' },
  { id: 'reality', name: 'Reality Stone', img: 'gem_Red_46', col: '#e5383b' },
  { id: 'power', name: 'Power Stone', img: 'gem_Pink_46', col: '#9b51e0', filter: 'hue-rotate(-50deg) saturate(1.4) brightness(.85)' },
  { id: 'time', name: 'Time Stone', img: 'gem_Green_46', col: '#3bb54a' },
  { id: 'soul', name: 'Soul Stone', img: 'gem_Orange_45', col: '#ff8c1a' },
];
export function drawGem(g, key, x, y, size, { filter = '', glow = '' } = {}) {
  const im = IMG[key]; if (!im) return;
  g.save();
  if (filter) g.filter = filter;
  if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.4; }
  g.drawImage(im, x - size / 2, y - size / 2, size, size);
  g.restore();
}
export const drawStone = (g, st, x, y, size, glow = true) => drawGem(g, st.img, x, y, size, { filter: st.filter || '', glow: glow ? st.col : '' });

// ---------- Robots ----------
// Robot Pack (Kenney, CC0) robots, greyed for Ultron's drones. state: 'Body' | 'Hurt'.
export function drawRobot(g, x, y, h, { colour = 'blue', state = 'Body', flip = false, drone = true, rot = 0, alpha = 1 } = {}) {
  const im = IMG[`robot_${colour}${state}`]; if (!im) return;
  const w = (im.width / im.height) * h;
  g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flip) g.scale(-1, 1); g.globalAlpha *= alpha;
  if (drone) g.filter = 'grayscale(1) brightness(1.15) contrast(1.05)';
  g.drawImage(im, -w / 2, -h / 2, w, h);
  g.filter = 'none';
  if (drone && state !== 'Hurt') { g.fillStyle = '#ff2b2b'; g.shadowColor = '#ff2b2b'; g.shadowBlur = h * 0.15; g.beginPath(); g.arc(w * 0.28, -h * 0.18, h * 0.06, 0, 6.283); g.arc(w * 0.12, -h * 0.18, h * 0.06, 0, 6.283); g.fill(); }
  g.restore();
}

// ---------- Villain portraits (own drawings) ----------
export const VILLAINS = [
  { id: 'loki', name: 'Loki' }, { id: 'ultron', name: 'Ultron' }, { id: 'thanos', name: 'Thanos' },
  { id: 'goblin', name: 'Green Goblin' }, { id: 'skull', name: 'Red Skull' }, { id: 'hela', name: 'Hela' },
];
export function drawVillain(g, id, x, y, r) {
  g.save(); g.translate(x, y); g.scale(r / 50, r / 50);
  const face = (c) => { g.fillStyle = c; g.beginPath(); g.ellipse(0, 6, 30, 36, 0, 0, 6.283); g.fill(); };
  const eyes = (c, mean = true) => { g.fillStyle = c; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 6, 0); g.lineTo(s * 20, mean ? -5 : 0); g.lineTo(s * 18, 5); g.lineTo(s * 6, 5); g.closePath(); g.fill(); } };
  const mouth = (c) => { g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(-10, 24); g.quadraticCurveTo(0, 20, 10, 24); g.stroke(); };
  if (id === 'loki') {
    g.fillStyle = '#1f6b3a'; g.beginPath(); g.ellipse(0, 4, 36, 40, 0, 0, 6.283); g.fill();
    face('#f1d2b8'); g.fillStyle = '#d9a520';
    g.beginPath(); g.moveTo(-26, -14); g.quadraticCurveTo(-36, -44, -14, -62); g.quadraticCurveTo(-24, -40, -14, -20); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(26, -14); g.quadraticCurveTo(36, -44, 14, -62); g.quadraticCurveTo(24, -40, 14, -20); g.closePath(); g.fill();
    g.fillRect(-28, -22, 56, 12); eyes('#1d3b2a'); mouth('#7a3b3b');
  } else if (id === 'ultron') {
    face('#c3c8d2'); g.fillStyle = '#9aa1ad'; g.beginPath(); g.moveTo(-30, -6); g.lineTo(0, -40); g.lineTo(30, -6); g.closePath(); g.fill();
    g.shadowColor = '#ff2020'; g.shadowBlur = 10; eyes('#ff3030'); g.shadowBlur = 0;
    g.fillStyle = '#ff3030'; g.fillRect(-12, 20, 24, 5); g.strokeStyle = '#7d8592'; g.lineWidth = 2; g.beginPath(); g.moveTo(-26, 12); g.lineTo(-14, 36); g.moveTo(26, 12); g.lineTo(14, 36); g.stroke();
  } else if (id === 'thanos') {
    face('#8a5bb5'); g.strokeStyle = '#6a3f92'; g.lineWidth = 3; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 5, 30); g.lineTo(i * 5, 40); g.stroke(); }
    g.fillStyle = '#d9a520'; g.beginPath(); g.moveTo(-34, 0); g.quadraticCurveTo(-34, -46, 0, -46); g.quadraticCurveTo(34, -46, 34, 0); g.lineTo(24, 0); g.quadraticCurveTo(22, -24, 0, -26); g.quadraticCurveTo(-22, -24, -24, 0); g.closePath(); g.fill();
    eyes('#2a1838', false); mouth('#4a2a63');
  } else if (id === 'goblin') {
    face('#5aa83a'); g.fillStyle = '#6a3f92'; g.beginPath(); g.moveTo(-30, -14); g.lineTo(0, -64); g.lineTo(30, -14); g.closePath(); g.fill();
    g.fillStyle = '#ffd23f'; eyes('#ffd23f'); g.fillStyle = '#2b1f1f'; g.beginPath(); g.moveTo(-16, 18); g.quadraticCurveTo(0, 34, 16, 18); g.closePath(); g.fill();
    g.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) g.fillRect(i * 6 - 2, 18, 4, 5);
    for (const s of [-1, 1]) { g.fillStyle = '#5aa83a'; g.beginPath(); g.moveTo(s * 28, 0); g.lineTo(s * 44, -16); g.lineTo(s * 30, 14); g.fill(); }
  } else if (id === 'skull') {
    face('#c9302c'); g.fillStyle = '#5a1412'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 13, 2, 10, 9, 0, 0, 6.283); g.fill(); }
    g.beginPath(); g.moveTo(-4, 14); g.lineTo(4, 14); g.lineTo(0, 22); g.fill(); g.fillStyle = '#5a1412'; g.fillRect(-14, 28, 28, 4);
  } else if (id === 'hela') {
    g.fillStyle = '#1f2a22'; g.beginPath(); g.moveTo(0, -20); for (let i = -4; i <= 4; i++) { g.lineTo(i * 12, -60 - Math.abs(i % 2) * 14 + Math.abs(i) * 6); g.lineTo(i * 12 + 6, -24); } g.closePath(); g.fill();
    face('#e8e2dc'); g.fillStyle = '#1f2a22'; g.fillRect(-30, -20, 60, 14); eyes('#1d4b2a'); mouth('#3a1a1a');
    g.fillStyle = 'rgba(30,40,35,.6)'; for (const s of [-1, 1]) g.fillRect(s * 13 - 2, 6, 4, 12);
  }
  g.restore();
}

// ---------- City drawing ----------
// A parallax row of skyscrapers. par = how much it moves with the camera; seed changes the skyline.
export function skyline(g, W, H, camX, { par = 0.3, base = 0.8, tall = 0.5, col = '#2b3a5c', win = 'rgba(255,230,150,.55)', seed = 1, width = 60 } = {}) {
  const off = camX * par;
  const first = Math.floor(off / width) - 1;
  for (let i = first; i < first + W / width + 3; i++) {
    const r = Math.abs(Math.sin(i * 127.1 + seed * 311.7) * 43758.5453) % 1;
    const bw = width * (0.7 + r * 0.5), bh = H * tall * (0.35 + r * 0.65);
    const x = i * width - off, y = H * base - bh;
    g.fillStyle = col; g.fillRect(x, y, bw, bh + H);
    if (win) {
      g.fillStyle = win;
      for (let wy = y + 8; wy < H * base - 6; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 12) if (((wx * 7 + wy * 13 + i) | 0) % 5) g.fillRect(wx, wy, 5, 7);
    }
  }
}
