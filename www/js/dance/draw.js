// Dance Party drawing: the stage (lights, disco ball, floor), the coach, the move cards sliding in along the bottom,
// and the grades. The coach is a Kenney Toon Character (CC0) posed by the Marvel Heroes rig; the glow and sparkles
// are Kenney's Particle Pack (CC0), shared with Slither Snacks.
import { drawHero, loadHero } from '../hero/kit.js';
import { MOVES, idlePose } from './moves.js';

const IMG = {};
let loading = null;
export function loadDance() {
  if (!loading) loading = Promise.all([loadHero(), ...['glow', 'spark'].map((n) => new Promise((ok) => {
    const im = new Image(); im.onload = () => { IMG[n] = im; ok(); }; im.onerror = ok; im.src = `img/snake/${n}.png`;
  }))]);
  return loading;
}

// ---------- Layout ----------
// Everything is placed from the canvas size: HUD on top, the coach in the middle, the move cards at the bottom.
export function layout(W, H) {
  const strip = Math.max(112, Math.min(150, H * 0.2));
  const ground = H - strip - 14;
  const coachH = Math.max(40, Math.min(ground - 96, W * 1.05));
  return { W, H, strip, ground, coachH, cx: W / 2, target: 58, card: Math.min(76, strip - 40), pxBeat: Math.max(34, Math.min(52, W / 9)) };
}

// ---------- Stage ----------
export function drawStage(g, L, song, beat, energy) {
  const [top, bottom, light] = song.colours;
  const pulse = Math.pow(1 - (((beat % 1) + 1) % 1), 3);
  const gr = g.createLinearGradient(0, 0, 0, L.H);
  gr.addColorStop(0, top); gr.addColorStop(0.7, bottom); gr.addColorStop(1, top);
  g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);

  // spotlights sweeping from the top corners
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1, ox = L.W / 2 + side * L.W * (i < 2 ? 0.55 : 0.3), oy = -20;
    const a = Math.PI / 2 + side * (0.35 + 0.28 * Math.sin(beat * Math.PI / (i < 2 ? 4 : 2) + i));
    const len = L.H * 1.1, wdt = 0.13;
    const bg = g.createLinearGradient(ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len);
    bg.addColorStop(0, hexA(i % 2 ? light : '#ffffff', 0.22 + 0.12 * pulse)); bg.addColorStop(1, hexA(light, 0));
    g.fillStyle = bg;
    g.beginPath(); g.moveTo(ox, oy);
    g.lineTo(ox + Math.cos(a - wdt) * len, oy + Math.sin(a - wdt) * len);
    g.lineTo(ox + Math.cos(a + wdt) * len, oy + Math.sin(a + wdt) * len);
    g.closePath(); g.fill();
  }
  g.restore();

  // the floor: tiles in perspective that light up in a pattern on each beat
  const fy = L.ground - L.coachH * 0.08, rows = 5, cols = 7, b = Math.floor(beat);
  for (let r = 0; r < rows; r++) {
    const y0 = fy + (L.H - fy) * Math.pow(r / rows, 1.4), y1 = fy + (L.H - fy) * Math.pow((r + 1) / rows, 1.4);
    const s0 = 0.55 + 0.45 * (r / rows), s1 = 0.55 + 0.45 * ((r + 1) / rows);
    for (let c = 0; c < cols; c++) {
      const on = (c + r + b) % 3 === 0 || (energy > 0.6 && (c * 3 + r + b) % 4 === 0);
      const x = (k, s) => L.W / 2 + (k / cols - 0.5) * L.W * 1.3 * s;
      g.fillStyle = on ? hexA(light, 0.35 + 0.35 * pulse) : 'rgba(255,255,255,.05)';
      g.beginPath(); g.moveTo(x(c, s0) + 1, y0 + 1); g.lineTo(x(c + 1, s0) - 1, y0 + 1); g.lineTo(x(c + 1, s1) - 1, y1 - 1); g.lineTo(x(c, s1) + 1, y1 - 1); g.closePath(); g.fill();
    }
  }

  // disco ball
  const bx = L.W / 2, by = 30 + L.H * 0.06, br = Math.min(28, L.W * 0.07);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx, by - br); g.stroke();
  g.save(); g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#9aa3b5'; g.fillRect(bx - br, by - br, br * 2, br * 2);
  const n = 7, spin = beat * 0.35;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const sh = 0.5 + 0.5 * Math.sin(i * 1.7 + j * 2.3 + spin * 6);
    g.fillStyle = `rgba(${200 + sh * 55 | 0},${205 + sh * 50 | 0},${220 + sh * 35 | 0},${0.5 + sh * 0.5})`;
    g.fillRect(bx + ((i + (spin % 1)) * br) / n * 1.05, by + (j * br) / n, br / n - 1, br / n - 1);
  }
  g.restore();
  glow(g, bx, by, br * (3 + pulse), light, 0.35 + 0.3 * pulse);
}

export function glow(g, x, y, r, col, a = 1) {
  if (!IMG.glow) return;
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  g.drawImage(tinted('glow', col), x - r, y - r, r * 2, r * 2);
  g.restore();
}
const tints = new Map();
function tinted(name, col) {
  const key = name + col;
  if (!tints.has(key)) {
    const im = IMG[name], c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const t = c.getContext('2d'); t.drawImage(im, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = col; t.fillRect(0, 0, c.width, c.height);
    tints.set(key, c);
  }
  return tints.get(key);
}
function hexA(hex, a) { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; }

// ---------- Coach ----------
// The coach's pose at a song beat: the move playing then, or the idle bob before and after.
export function poseAt(list, beat) {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (beat >= m.beat) return beat < m.beat + m.len + (i === list.length - 1 ? 8 : 0) ? MOVES[m.id].pose(Math.min(beat - m.beat, m.len - 0.05)) : idlePose(beat);
  }
  return idlePose(beat);
}

// Where the glove hand is (the coach's left hand, your right), in canvas pixels.
function handPos(x, y, h, pose, flip) {
  const k = h / 250, la = pose.la;
  let px = 31 + 57 * Math.sin(la), py = -116 + 57 * Math.cos(la);
  if (pose.lean) { const c = Math.cos(pose.lean), s = Math.sin(pose.lean), dy = py + 56; [px, py] = [px * c - dy * s, px * s + dy * c - 56]; }
  py += pose.drop || 0;
  return [x + (flip ? -px : px) * k, y + py * k];
}

export function drawCoach(g, L, song, pose, { flip = false, glowCol, t = 0 } = {}) {
  const x = L.cx + (pose.x || 0) * (L.coachH / 250) * (flip ? -1 : 1), y = L.ground;
  // shadow on the floor
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x, y + 2, L.coachH * 0.17 * (1 + Math.min(0, pose.drop || 0) / 120), L.coachH * 0.03, 0, 0, Math.PI * 2); g.fill();
  // a soft halo in the stage colour behind the coach, then the coach with a coloured outline glow
  glow(g, x, y - L.coachH * 0.5, L.coachH * 0.55, glowCol || song.colours[2], 0.35);
  g.save();
  g.shadowColor = glowCol || song.colours[2]; g.shadowBlur = 16;
  drawHero(g, x, y, L.coachH, { look: song.look, pose, flip });
  g.restore();
  // the glove: the hand holding the phone glows
  const [hx, hy] = handPos(x, y, L.coachH, pose, flip);
  glow(g, hx, hy, L.coachH * 0.11, '#ffffff', 0.9);
  glow(g, hx, hy, L.coachH * 0.16, glowCol || song.colours[2], 0.8);
  if (IMG.spark) { g.save(); g.globalCompositeOperation = 'lighter'; g.translate(hx, hy); g.rotate(t * 2); const s = L.coachH * 0.07; g.drawImage(tinted('spark', '#ffffff'), -s, -s, s * 2, s * 2); g.restore(); }
}

// ---------- Move cards ----------
// A silhouette of the move's key pose, like the pictograms in dance games. Cached per move, colour and side.
const cards = new Map();
function cardImage(id, song, flip, gold) {
  const key = `${id}|${song.id}|${flip}|${gold}`;
  if (cards.has(key)) return cards.get(key);
  const S = 128, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d'), m = MOVES[id];
  const p = m.pose(m.key || 0);
  drawHero(g, S / 2 + (p.x || 0) * 0.4 * (flip ? -1 : 1), S - 8 + Math.min(0, p.drop || 0) * 0.15, S * 0.9, { look: song.look, pose: { ...p, drop: 0 }, flip });
  g.globalCompositeOperation = 'source-in';
  const gr = g.createLinearGradient(0, 0, 0, S);
  if (gold) { gr.addColorStop(0, '#fff6c2'); gr.addColorStop(1, '#ffb703'); } else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, song.colours[2]); }
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  cards.set(key, c);
  return c;
}

const ARROW = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
// Draws the strip of upcoming moves: each card reaches the ring on its first beat.
export function drawStrip(g, L, song, list, beat, { flip = false, tap = false, flash = 0, flashCol = '#fff' } = {}) {
  const y0 = L.H - L.strip, cy = y0 + L.strip / 2 - 6;
  const sg = g.createLinearGradient(0, y0, 0, L.H);
  sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.25, 'rgba(0,0,0,.45)'); sg.addColorStop(1, 'rgba(0,0,0,.6)');
  g.fillStyle = sg; g.fillRect(0, y0, L.W, L.strip);
  // the ring
  const R = L.card * 0.62;
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.75)';
  g.beginPath(); g.arc(L.target, cy, R, 0, Math.PI * 2); g.stroke();
  if (flash > 0) { glow(g, L.target, cy, R * 2.2, flashCol, flash); }
  const pulse = Math.pow(1 - (((beat % 1) + 1) % 1), 4);
  g.strokeStyle = `rgba(255,255,255,${0.25 * pulse})`; g.lineWidth = 10; g.beginPath(); g.arc(L.target, cy, R + 4, 0, Math.PI * 2); g.stroke();

  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i], x = L.target + (m.beat - beat) * L.pxBeat;
    if (x > L.W + L.card || x + m.len * L.pxBeat < L.target - L.card) continue;
    // once a move starts its card stays in the ring until the move ends
    const cx = Math.max(L.target, x), alpha = x < L.target ? Math.max(0, 1 - (L.target - x) / (m.len * L.pxBeat)) * 0.8 + 0.2 : 1;
    const size = L.card * (m.gold ? 1.12 : 1) * (x <= L.target + 1 ? 1 + 0.08 * pulse : 1);
    g.globalAlpha = alpha;
    if (m.gold) glow(g, cx, cy, size * 0.9, '#ffcf3f', 0.5);
    g.drawImage(cardImage(m.id, song, flip, m.gold), cx - size / 2, cy - size / 2, size, size);
    if (tap) drawGesture(g, cx + size * 0.34, cy - size * 0.34, size * 0.2, MOVES[m.id].tap);
    if (x < L.W - 20 && x >= L.target - 1) {
      g.font = `800 ${Math.round(L.card * 0.17)}px system-ui, sans-serif`; g.fillStyle = m.gold ? '#ffd76a' : 'rgba(255,255,255,.9)';
      g.fillText(MOVES[m.id].name, cx, cy + size / 2 + 2, L.pxBeat * m.len + 18);
    }
    g.globalAlpha = 1;
  }
}

// The Tap along gesture as a small badge: an arrow to swipe, a dot to tap, a ring to hold.
export function drawGesture(g, x, y, r, kind) {
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(20,10,40,.85)'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = Math.max(2, r * 0.18); g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind in ARROW) {
    g.rotate(ARROW[kind]);
    g.beginPath(); g.moveTo(-r * 0.5, 0); g.lineTo(r * 0.45, 0); g.moveTo(r * 0.1, -r * 0.4); g.lineTo(r * 0.5, 0); g.lineTo(r * 0.1, r * 0.4); g.stroke();
  } else if (kind === 'hold') {
    g.beginPath(); g.arc(0, 0, r * 0.5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.22, 0, Math.PI * 2); g.fill();
  } else { g.beginPath(); g.arc(0, 0, r * 0.32, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

// ---------- HUD ----------
export function drawHud(g, L, song, score, stars, starAt, maxScore) {
  const pad = 12, barY = 40, barW = L.W - pad * 2;
  g.textBaseline = 'alphabetic';
  g.font = '800 15px system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.92)';
  g.fillText(song.title, pad, 26, L.W * 0.55);
  g.textAlign = 'right'; g.font = '900 20px system-ui, sans-serif'; g.fillStyle = '#fff';
  g.fillText(Math.round(score).toLocaleString('en-AU'), L.W - pad, 27);
  // the score bar with its five star marks
  g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, pad, barY, barW, 10, 5); g.fill();
  const f = Math.min(1, score / maxScore);
  const bg = g.createLinearGradient(pad, 0, pad + barW, 0); bg.addColorStop(0, song.colours[2]); bg.addColorStop(1, '#ffffff');
  g.fillStyle = bg; roundRect(g, pad, barY, Math.max(10, barW * f), 10, 5); g.fill();
  starAt.forEach((s, i) => { const x = pad + barW * (s / maxScore); star(g, x, barY + 5, 9, i < stars ? '#ffd23f' : 'rgba(255,255,255,.35)', i < stars ? '#a86b00' : 'rgba(0,0,0,.25)'); });
}
export function star(g, x, y, r, fill, line) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = fill; g.fill(); if (line) { g.strokeStyle = line; g.lineWidth = 1.5; g.stroke(); }
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// A grade popping up over the coach. age in seconds since it was given.
export function drawGrade(g, L, grade, age, gold) {
  if (age > 0.9) return;
  const k = age < 0.12 ? 0.6 + (age / 0.12) * 0.5 : 1.1 - Math.min(0.1, (age - 0.12)), a = age < 0.6 ? 1 : 1 - (age - 0.6) / 0.3;
  const y = L.ground - L.coachH * 1.02 - age * 18;
  g.save(); g.globalAlpha = a; g.translate(L.cx, y); g.scale(k, k);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(Math.min(44, L.W * 0.11))}px system-ui, sans-serif`;
  g.lineWidth = 7; g.strokeStyle = 'rgba(20,10,40,.75)'; g.lineJoin = 'round';
  const txt = gold && grade.id !== 'x' ? `${grade.name} ×3` : grade.name;
  g.strokeText(txt, 0, 0); g.fillStyle = grade.col; g.fillText(txt, 0, 0);
  g.restore();
}

// The count-in before the first move.
export function drawCount(g, L, text, f) {
  g.save(); g.globalAlpha = Math.max(0, 1 - f); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(Math.min(90, L.W * 0.22) * (1.25 - f * 0.25))}px system-ui, sans-serif`;
  g.lineWidth = 8; g.strokeStyle = 'rgba(20,10,40,.7)'; g.lineJoin = 'round';
  g.strokeText(text, L.cx, L.ground - L.coachH * 0.55); g.fillStyle = '#fff'; g.fillText(text, L.cx, L.ground - L.coachH * 0.55);
  g.restore();
}

// A still of the coach for song cards and the hub.
export function paintCoachThumb(canvas, song, poseId = 'point', t = 0) {
  const w = canvas.clientWidth || 112, h = canvas.clientHeight || 76, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  const L = { ...layout(w, h * 3), W: w, H: h, ground: h - 4, coachH: h * 0.92, cx: w / 2 };
  drawStage(g, L, song, 0.2, 0);
  drawCoach(g, L, song, MOVES[poseId].pose(t), {});
}
