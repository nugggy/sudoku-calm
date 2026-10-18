// Draws GameHub's original cartoon art as SVG files: dialog pictures, cat faces and Mahjong tile faces.
// Run with: node tools/gen-art.mjs   (writes www/img/art/{ui,cats,mahjong}/*.svg)
// One house style: flat colours, a soft shadow crescent on the lower right, a small shine on the upper left
// and a warm dark outline. Every file has a viewBox plus explicit width and height so it also draws on a canvas.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'img', 'art');
const OL = '#3d2a35'; // outline colour used everywhere
const SW = 5;         // outline width on the 128 grid

// ---------- colour helpers ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const dk = (c, t = 0.22) => mix(c, '#2a1838', t);
const lt = (c, t = 0.45) => mix(c, '#ffffff', t);

// ---------- drawing helpers ----------
let uid = 0;
const withAttrs = (e, a) => e.replace(/\s*\/>$/, ` ${a}/>`);
const stroke = (w = SW, c = OL) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

// A shaded, outlined shape. `e` is one self-closing SVG element without a fill.
// The base colour is drawn shifted up-left inside a clip, which leaves a shadow crescent on the lower right.
function sh(e, base, { shade = dk(base), dx = 5, dy = 6, hi = '', sw = SW, line = true } = {}) {
  const id = 'k' + (++uid);
  return `<clipPath id="${id}">${e}</clipPath><g clip-path="url(#${id})">${withAttrs(e, `fill="${shade}"`)}`
    + `<g transform="translate(${-dx} ${-dy})">${withAttrs(e, `fill="${base}"`)}</g>${hi}</g>`
    + (line ? withAttrs(e, stroke(sw)) : '');
}
// Flat filled shape with outline.
const flat = (e, fill, sw = SW) => withAttrs(e, `fill="${fill}" stroke="${OL}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`);
// A thick outlined line (handles, fuses, legs).
const tube = (d, col, w, sw = SW) => `<path d="${d}" ${stroke(w + sw * 2)}/><path d="${d}" ${stroke(w, col)}/>`;
// White shine stroke.
const shine = (d, w = 5, o = 0.75) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round"/>`;
const dot = (x, y, r, c = '#fff', o = 0.85) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity="${o}"/>`;

// Polygon with rounded corners (radius r at each vertex).
function roundPoly(pts, r) {
  const n = pts.length; let d = '';
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n], [x, y] = pts[i], [nx, ny] = pts[(i + 1) % n];
    const l1 = Math.hypot(px - x, py - y), l2 = Math.hypot(nx - x, ny - y);
    const r1 = Math.min(r, l1 / 2), r2 = Math.min(r, l2 / 2);
    const a = [x + (px - x) / l1 * r1, y + (py - y) / l1 * r1], b = [x + (nx - x) / l2 * r2, y + (ny - y) / l2 * r2];
    d += `${i ? 'L' : 'M'}${f(a[0])} ${f(a[1])} Q${f(x)} ${f(y)} ${f(b[0])} ${f(b[1])} `;
  }
  return d + 'Z';
}
const f = (v) => Math.round(v * 10) / 10;
function starPts(cx, cy, R, r, n = 5, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (rot + i * 180 / n) * Math.PI / 180, rr = i % 2 ? r : R;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}
// Four-point twinkle with concave sides.
const twinkle = (x, y, R) => `M${x} ${y - R} Q${x} ${y} ${x + R} ${y} Q${x} ${y} ${x} ${y + R} Q${x} ${y} ${x - R} ${y} Q${x} ${y} ${x} ${y - R} Z`;

const svg = (body, w = 128, h = 128) => { uid = 0; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>\n`; };
const shadow = (cx = 64, cy = 114, rx = 36, ry = 6) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${OL}" fill-opacity=".14"/>`;

// Hand-drawn digits for number blocks, in a 24 x 24 box.
const DIGIT = {
  1: 'M8 7 L13 4 V21',
  2: 'M6 8 C6 2 19 2 19 8 C19 13 6 16 6 21 H19',
  3: 'M6 4 H18 L11 11 C17 10 20 14 19 17 C18 22 9 23 6 19',
  4: 'M15 21 V3 L4 15 H20',
};

// ---------- UI pictures ----------
const GOLD = '#ffc531', GOLD_D = '#e59a1d';
const UI = {};

UI.trophy = () => svg(
  shadow(64, 116, 34) +
  tube('M38 38 C14 36 16 70 44 68', GOLD_D, 8) + tube('M90 38 C114 36 112 70 84 68', GOLD_D, 8) +
  sh('<rect x="56" y="80" width="16" height="16" rx="3"/>', GOLD_D) +
  sh('<path d="M34 26 H94 V50 C94 72 80 86 64 86 C48 86 34 72 34 50 Z"/>', GOLD, { hi: shine('M44 36 V52 C44 60 47 66 51 70', 6) }) +
  sh('<rect x="30" y="20" width="68" height="12" rx="6"/>', '#ffd75e') +
  sh(`<path d="${roundPoly(starPts(64, 54, 13, 5.5), 1.5)}"/>`, '#fff2b8', { shade: '#ffe27a', dx: 1, dy: 1, sw: 3.5 }) +
  sh('<rect x="38" y="94" width="52" height="20" rx="6"/>', '#a8673f') +
  flat('<rect x="52" y="100" width="24" height="8" rx="3"/>', '#ffd75e', 3));

UI['light-bulb'] = () => svg(
  ['M64 6 V14', 'M24 22 L30 28', 'M104 22 L98 28', 'M12 54 H20', 'M116 54 H108'].map((d) => `<path d="${d}" ${stroke(6, '#ffb52e')}/>`).join('') +
  sh('<path d="M46 82 C46 72 32 66 32 50 A32 32 0 0 1 96 50 C96 66 82 72 82 82 Z"/>', '#ffe066', { shade: '#ffc53a', hi: shine('M44 40 C47 32 53 27 60 25', 6, .9) }) +
  `<path d="M54 76 L57 58 L64 68 L71 58 L74 76" ${stroke(4, '#e8841a')}/>` +
  sh('<rect x="45" y="80" width="38" height="24" rx="7"/>', '#a9b6c4') +
  `<path d="M47 88 H81 M47 96 H81" ${stroke(3.5)}/>` +
  sh('<rect x="54" y="102" width="20" height="10" rx="5"/>', '#6b7787'));

UI.star = () => svg(
  shadow(64, 116, 30, 5) +
  sh(`<path d="${roundPoly(starPts(64, 64, 54, 25), 7)}"/>`, GOLD, { dx: 6, dy: 7, hi: shine('M40 52 L50 51', 6) + dot(56, 40, 3.5) }) +
  `<path d="${twinkle(102, 22, 9)}" fill="#fff4b3" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`);

UI['glowing-star'] = () => svg(
  `<circle cx="64" cy="64" r="58" fill="#ffe680" fill-opacity=".35"/><circle cx="64" cy="64" r="46" fill="#ffe680" fill-opacity=".45"/>` +
  [[64, 4, 64, 14], [64, 114, 64, 124], [4, 64, 14, 64], [114, 64, 124, 64], [20, 20, 27, 27], [108, 20, 101, 27], [20, 108, 27, 101], [108, 108, 101, 101]]
    .map(([a, b, c, d]) => `<path d="M${a} ${b} L${c} ${d}" ${stroke(5, '#ffb52e')}/>`).join('') +
  sh(`<path d="${roundPoly(starPts(64, 66, 44, 20), 6)}"/>`, GOLD, { hi: shine('M44 56 L52 55', 5) + dot(58, 44, 3) }));

UI.sparkles = () => svg(
  sh(`<path d="${twinkle(52, 66, 40)}"/>`, GOLD, { dx: 4, dy: 5, hi: dot(46, 58, 4) }) +
  sh(`<path d="${twinkle(98, 30, 20)}"/>`, '#7fd4ff', { dx: 3, dy: 3 }) +
  sh(`<path d="${twinkle(100, 98, 15)}"/>`, '#ff9ac1', { dx: 2, dy: 3, sw: 4 }) +
  `<circle cx="22" cy="22" r="5" fill="#b69cff" stroke="${OL}" stroke-width="3"/>`);

UI.crown = () => svg(
  shadow(64, 112, 42, 5) +
  sh(`<path d="${roundPoly([[22, 96], [16, 42], [44, 64], [64, 30], [84, 64], [112, 42], [106, 96]], 5)}"/>`, GOLD, { hi: shine('M30 58 L32 80', 6) }) +
  [[16, 40], [64, 26], [112, 40]].map(([x, y]) => sh(`<circle cx="${x}" cy="${y}" r="8"/>`, '#ffe27a', { dx: 2, dy: 2 })).join('') +
  sh('<rect x="20" y="84" width="88" height="20" rx="7"/>', GOLD_D) +
  sh('<circle cx="64" cy="94" r="7"/>', '#ff5d73', { dx: 2, dy: 2, sw: 3.5 }) +
  sh('<circle cx="38" cy="94" r="5"/>', '#4fb3ff', { dx: 1.5, dy: 1.5, sw: 3.5 }) +
  sh('<circle cx="90" cy="94" r="5"/>', '#3ddc84', { dx: 1.5, dy: 1.5, sw: 3.5 }));

UI['party-popper'] = () => {
  const cone = 'M14 116 L40 46 L84 90 Z';
  const id = 'pc';
  return svg(
    `<path d="M58 52 C62 30 80 36 76 18" ${stroke(5, '#4fb3ff')}/>` + `<path d="M74 70 C92 56 104 74 118 60" ${stroke(5, '#ff5d73')}/>` +
    `<path d="M66 60 C80 40 96 44 100 28" ${stroke(5, '#3ddc84')}/>` +
    [[92, 12, '#ffc531', 20], [112, 34, '#b69cff', -25], [104, 84, '#ffc531', 40], [50, 22, '#ff9ac1', 10], [118, 100, '#4fb3ff', -10]]
      .map(([x, y, c, r]) => `<rect x="${x - 5}" y="${y - 3.5}" width="10" height="7" rx="2" fill="${c}" stroke="${OL}" stroke-width="2.5" transform="rotate(${r} ${x} ${y})"/>`).join('') +
    [[84, 20, '#ff5d73'], [36, 30, '#ffc531'], [114, 70, '#3ddc84']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}" stroke="${OL}" stroke-width="2.5"/>`).join('') +
    `<clipPath id="${id}"><path d="${cone}"/></clipPath><g clip-path="url(#${id})"><path d="${cone}" fill="#9a6cf0"/>` +
    `<path d="M10 92 L52 120 M20 70 L72 110 M30 52 L84 96" ${stroke(9, '#ffc531')}/><path d="${cone}" fill="none" stroke="#2a1838" stroke-opacity=".25" stroke-width="14" transform="translate(5 5)"/></g>` +
    `<path d="${cone}" ${stroke()}/>` +
    sh('<ellipse cx="62" cy="68" rx="9" ry="31" transform="rotate(-45 62 68)"/>', '#c9a8ff', { dx: 1, dy: 2 }));
};

UI['sports-medal'] = () => svg(
  sh('<path d="M30 6 H54 L74 56 H54 Z"/>', '#4f8fe0', { dx: 3, dy: 0 }) +
  sh('<path d="M98 6 H74 L54 56 H74 Z"/>', '#ff5d73', { dx: 3, dy: 0 }) +
  sh('<circle cx="64" cy="82" r="36"/>', GOLD, { hi: shine('M40 70 C42 62 46 58 52 54', 6) }) +
  flat('<circle cx="64" cy="82" r="25"/>', '#ffd75e', 3.5) +
  sh(`<path d="${roundPoly(starPts(64, 84, 16, 7), 2)}"/>`, GOLD_D, { dx: 1.5, dy: 1.5, sw: 3 }));

UI['gem-stone'] = () => {
  const out = 'M30 44 L46 22 H82 L98 44 L64 108 Z';
  return svg(shadow(64, 116, 28, 5) +
    `<path d="M30 44 H98 L64 108 Z" fill="#3bb6e8"/>` +
    `<path d="M46 22 H82 L98 44 H30 Z" fill="#8fe0ff"/>` +
    `<path d="M46 22 L56 44 H72 L82 22 Z" fill="#c8f1ff"/>` +
    `<path d="M56 44 L64 108 L72 44 Z" fill="#5ccbf2"/>` +
    `<path d="M98 44 L64 108 L84 44 Z" fill="#1f8fc4"/>` +
    `<path d="M30 44 H98 M46 22 L56 44 L64 108 M82 22 L72 44 L64 108 M56 44 L64 22 L72 44" ${stroke(3)}/>` +
    `<path d="${out}" ${stroke()}/>` + shine('M40 40 L48 30', 4, .9) + `<path d="${twinkle(100, 22, 9)}" fill="#fff" stroke="${OL}" stroke-width="2.5"/>`);
};

UI.fire = () => svg(
  sh('<path d="M64 118 C36 118 22 98 26 76 C30 58 46 52 44 30 C58 38 64 50 62 62 C70 52 72 38 68 14 C90 30 106 56 102 84 C100 104 86 118 64 118 Z"/>', '#ff7a2f', { shade: '#e8501f', hi: shine('M38 78 C38 70 42 64 46 60', 5, .6) }) +
  sh('<path d="M64 114 C50 114 42 104 44 92 C46 82 54 78 56 68 C64 76 68 82 66 90 C72 86 76 80 76 74 C86 84 86 98 82 106 C78 112 72 114 64 114 Z"/>', '#ffd23f', { shade: '#ffb42e', dx: 3, dy: 3, sw: 4 }));

UI.calendar = () => svg(
  shadow(64, 118, 40, 5) +
  sh('<rect x="18" y="22" width="92" height="90" rx="12"/>', '#fffaf0', { shade: '#eadfcb' }) +
  sh('<path d="M18 50 V34 A12 12 0 0 1 30 22 H98 A12 12 0 0 1 110 34 V50 Z"/>', '#ff5d5d', { dx: 3, dy: 3 }) +
  [42, 64, 86].map((x) => tube(`M${x} 14 V30`, '#a9b6c4', 5, 3.5)).join('') +
  [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => {
    const x = 32 + c * 21, y = 60 + r * 16;
    return r === 1 && c === 2 ? `<circle cx="${x + 4}" cy="${y + 4}" r="9" fill="#ffc531" stroke="${OL}" stroke-width="3"/>` : `<rect x="${x}" y="${y}" width="9" height="8" rx="2.5" fill="#c9bba6"/>`;
  }).join('')).join(''));

UI['bar-chart'] = () => svg(
  sh('<rect x="12" y="14" width="104" height="100" rx="14"/>', '#fffaf0', { shade: '#eadfcb' }) +
  sh('<rect x="26" y="66" width="20" height="36" rx="5"/>', '#4fb3ff', { dx: 3, dy: 3, sw: 4 }) +
  sh('<rect x="54" y="48" width="20" height="54" rx="5"/>', '#3ddc84', { dx: 3, dy: 3, sw: 4 }) +
  sh('<rect x="82" y="30" width="20" height="72" rx="5"/>', '#ff7a6b', { dx: 3, dy: 3, sw: 4 }) +
  `<path d="M22 102 H106" ${stroke(4.5)}/>`);

UI['puzzle-piece'] = () => svg(
  shadow(66, 116, 36, 5) +
  sh('<path d="M24 40 H48 C44 34 44 20 60 20 C76 20 76 34 72 40 H96 V62 C102 58 116 58 116 74 C116 90 102 90 96 86 V108 H24 V86 C30 90 44 90 44 74 C44 58 30 58 24 62 Z"/>', '#4fb3ff', { hi: shine('M34 52 V66', 6) }));

UI.magnifier = () => svg(
  shadow(70, 118, 34, 5) +
  tube('M80 80 L108 108', '#9a6440', 16) +
  `<circle cx="54" cy="54" r="36" fill="#d6f1ff"/>` + shine('M34 46 C36 38 42 32 50 30', 6, .95) +
  `<circle cx="54" cy="54" r="36" ${stroke(18)}/><circle cx="54" cy="54" r="36" ${stroke(8, '#ff7a6b')}/>` +
  `<path d="M40 30 A28 28 0 0 1 72 28" fill="none" stroke="#ffb3a8" stroke-width="3" stroke-linecap="round" transform="rotate(-8 54 54) translate(0 -8)"/>`);

UI.pencil = () => svg(shadow(64, 116, 34, 5) + `<g transform="rotate(-45 64 64)">` +
  sh('<path d="M34 52 H92 V76 H34 Z"/>', '#ffc531', { dx: 0, dy: 6 }) +
  `<path d="M34 60 H92 M34 68 H92" ${stroke(2.5, GOLD_D)}/>` + shine('M38 55 H88', 3, .6) +
  sh('<path d="M34 52 L12 64 L34 76 Z"/>', '#f6d3a1', { dx: 0, dy: 4 }) +
  flat('<path d="M20 60 L12 64 L20 68 Z"/>', OL, 2) +
  sh('<rect x="92" y="50" width="12" height="28" rx="2"/>', '#b9c4d0', { dx: 0, dy: 5 }) +
  sh('<path d="M104 50 H110 A8 8 0 0 1 118 58 V70 A8 8 0 0 1 110 78 H104 Z"/>', '#ff8fb1', { dx: 0, dy: 5 }) + '</g>');

UI.newspaper = () => svg(
  shadow(64, 116, 42, 5) +
  `<g transform="rotate(-6 64 64)">` +
  sh('<rect x="26" y="22" width="84" height="88" rx="6"/>', '#e6dccb', { dx: 3, dy: 3 }) +
  sh('<rect x="16" y="16" width="84" height="90" rx="6"/>', '#fffdf6', { shade: '#ece2d0' }) +
  `<rect x="26" y="26" width="64" height="12" rx="3" fill="${OL}"/>` +
  sh('<rect x="26" y="46" width="28" height="26" rx="3"/>', '#7fd4ff', { dx: 2, dy: 2, sw: 3 }) +
  `<path d="M28 68 L36 58 L42 64 L46 60 L52 68" fill="none" stroke="#2f8f4e" stroke-width="3" stroke-linejoin="round"/>` +
  [48, 56, 64, 72].map((y) => `<path d="M62 ${y} H88" ${stroke(3.5, '#b7a98f')}/>`).join('') +
  [82, 90, 98].map((y, i) => `<path d="M28 ${y} H${i === 2 ? 66 : 88}" ${stroke(3.5, '#b7a98f')}/>`).join('') + '</g>');

const paw = (x, y, s, rot, col) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
  sh('<path d="M0 -2 C10 -2 18 8 16 15 C14 21 6 19 0 19 C-6 19 -14 21 -16 15 C-18 8 -10 -2 0 -2 Z"/>', col, { dx: 2, dy: 2, sw: 3.5 }) +
  [[-16, -10, 6], [-6, -20, 6.5], [6, -20, 6.5], [16, -10, 6]].map(([a, b, r]) => sh(`<ellipse cx="${a}" cy="${b}" rx="${r - 0.8}" ry="${r}"/>`, col, { dx: 1.5, dy: 1.5, sw: 3.5 })).join('') + '</g>';
UI['paw-prints'] = () => svg(paw(42, 82, 1.25, -18, '#ff9ac1') + paw(90, 40, 1.05, 12, '#ff9ac1'));

UI['triangular-flag'] = () => svg(
  `<ellipse cx="46" cy="112" rx="26" ry="8" fill="#7a5a3c"/><ellipse cx="46" cy="112" rx="26" ry="8" ${stroke(4)}/>` +
  tube('M40 112 V14', '#8b95a3', 6) +
  sh('<path d="M44 16 C64 12 84 30 108 34 C88 44 70 52 44 64 Z"/>', '#ff4d5e', { hi: shine('M52 26 C60 24 66 26 72 29', 4, .7) }) +
  sh('<circle cx="40" cy="12" r="7"/>', GOLD, { dx: 2, dy: 2, sw: 4 }));

UI.bomb = () => svg(
  shadow(58, 118, 36, 5) +
  `<path d="M78 30 C84 16 96 14 102 22" ${stroke(10)}/><path d="M78 30 C84 16 96 14 102 22" ${stroke(4, '#c99a5a')}/>` +
  sh('<rect x="64" y="26" width="22" height="18" rx="4" transform="rotate(35 75 35)"/>', '#7a8696', { dx: 2, dy: 3 }) +
  sh('<circle cx="56" cy="74" r="40"/>', '#3e4558', { shade: '#262a38', hi: shine('M30 62 C32 52 38 46 46 42', 8, .45) + dot(30, 76, 3.5, '#fff', .35) }) +
  `<path d="${roundPoly(starPts(106, 18, 15, 6, 6), 1.5)}" fill="#ffd23f" stroke="${OL}" stroke-width="3.5" stroke-linejoin="round"/>` +
  `<circle cx="106" cy="18" r="4.5" fill="#ff7a2f"/>`);

UI.collision = () => svg(
  sh(`<path d="${roundPoly(starPts(64, 64, 58, 34, 9, -80), 4)}"/>`, '#ff7a2f', { shade: '#e8501f' }) +
  sh(`<path d="${roundPoly(starPts(64, 64, 38, 22, 9, -60), 3)}"/>`, '#ffd23f', { shade: '#ffb42e', dx: 3, dy: 3, sw: 4 }) +
  `<circle cx="64" cy="64" r="11" fill="#fff8d0"/>`);

UI.spider = () => {
  const legs = [[-1, 0], [1, 0]].flatMap(([s]) => [
    `M${64 + s * 20} 62 C${64 + s * 38} 44 ${64 + s * 50} 50 ${64 + s * 56} 66`,
    `M${64 + s * 22} 72 C${64 + s * 42} 62 ${64 + s * 52} 72 ${64 + s * 58} 88`,
    `M${64 + s * 20} 82 C${64 + s * 38} 82 ${64 + s * 46} 94 ${64 + s * 48} 108`,
    `M${64 + s * 14} 88 C${64 + s * 24} 96 ${64 + s * 28} 106 ${64 + s * 26} 116`,
  ]);
  return svg(
    `<path d="M64 0 V34" stroke="${OL}" stroke-width="2.5" stroke-dasharray="1 0"/>` +
    legs.map((d) => tube(d, '#6b4fa8', 5, 3.5)).join('') +
    sh('<ellipse cx="64" cy="70" rx="30" ry="28"/>', '#7a5cc0', { shade: '#56408f', hi: shine('M42 60 C44 54 48 50 54 48', 5, .5) }) +
    `<ellipse cx="53" cy="68" rx="9" ry="10" fill="#fff" stroke="${OL}" stroke-width="3"/><ellipse cx="75" cy="68" rx="9" ry="10" fill="#fff" stroke="${OL}" stroke-width="3"/>` +
    `<circle cx="55" cy="70" r="5" fill="${OL}"/><circle cx="77" cy="70" r="5" fill="${OL}"/>${dot(57, 67, 1.8, '#fff', 1)}${dot(79, 67, 1.8, '#fff', 1)}` +
    `<path d="M58 84 Q64 90 70 84" ${stroke(3.5)}/>` +
    `<ellipse cx="44" cy="82" rx="5" ry="3" fill="#ff9ac1" fill-opacity=".7"/><ellipse cx="84" cy="82" rx="5" ry="3" fill="#ff9ac1" fill-opacity=".7"/>`);
};

UI['nut-and-bolt'] = () => {
  const hexPts = (cx, cy, r, rot = 0) => [...Array(6)].map((_, i) => { const a = (rot + i * 60) * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  return svg(
    shadow(64, 116, 44, 5) +
    `<g transform="rotate(-35 50 60)">` +
    sh('<rect x="38" y="44" width="24" height="64" rx="4"/>', '#b9c4d0', { dx: 4, dy: 0 }) +
    [56, 66, 76, 86, 96].map((y) => `<path d="M38 ${y} L62 ${y - 5}" ${stroke(3)}/>`).join('') +
    sh(`<path d="${roundPoly([[22, 30], [78, 30], [78, 48], [22, 48]], 4)}"/>`, '#9aa7b6') +
    sh(`<path d="${roundPoly([[28, 16], [72, 16], [78, 30], [22, 30]], 4)}"/>`, '#d3dbe4', { dx: 2, dy: 2 }) + '</g>' +
    sh(`<path d="${roundPoly(hexPts(90, 84, 26, 30), 4)}"/>`, '#c7d0da', { hi: shine('M74 76 L80 68', 5, .8) }) +
    flat('<circle cx="90" cy="84" r="10"/>', '#6b7787', 4));
};

UI.shovel = () => svg(`<g transform="rotate(40 64 64)">` +
  tube('M64 12 V70', '#b07a52', 10) +
  sh('<rect x="48" y="6" width="32" height="12" rx="6"/>', '#b07a52', { dx: 2, dy: 2 }) +
  sh('<path d="M42 70 H86 V92 C86 108 76 120 64 124 C52 120 42 108 42 92 Z"/>', '#b9c4d0', { hi: shine('M50 80 V96', 5, .8) }) + '</g>');

UI['input-numbers'] = () => {
  const cols = ['#ff5d73', '#4fb3ff', '#3ddc84', '#ffb52e'];
  return svg([[12, 12], [68, 12], [12, 68], [68, 68]].map(([x, y], i) =>
    sh(`<rect x="${x}" y="${y}" width="48" height="48" rx="10"/>`, cols[i], { dx: 3, dy: 4 }) +
    `<g transform="translate(${x + 8} ${y + 8}) scale(1.35)"><path d="${DIGIT[i + 1]}" ${stroke(4.2, '#fff')}/></g>`).join(''));
};

// ---------- Cats ----------
// One parametric cat head. Used for the Meowdoku collection, Cat Sort costumes, card faces and the puzzled cat.
function catHead(c) {
  const fur = c.fur, furD = c.furD || dk(fur, 0.28);
  const earIn = c.earIn || '#ffadc4';
  const head = 'M64 36 C94 36 112 52 112 76 C112 100 92 114 64 114 C36 114 16 100 16 76 C16 52 34 36 64 36 Z';
  let s = '';
  if (c.ruff) s += sh(`<path d="${roundPoly(starPts(64, 78, 57, 49, 18, -90), 6)}"/>`, c.ruff);
  // ears
  for (const sx of [-1, 1]) {
    const pts = [[64 + sx * 46, 66], [64 + sx * 42, 12], [64 + sx * 10, 44]];
    const earCol = c.earFur || fur;
    s += sh(`<path d="${roundPoly(pts, 8)}"/>`, earCol, { dx: sx * 3, dy: 3 });
    s += `<path d="${roundPoly([[64 + sx * 40, 56], [64 + sx * 39, 24], [64 + sx * 18, 44]], 6)}" fill="${earIn}"/>`;
  }
  // head with pattern clipped inside
  const id = 'head';
  s += `<clipPath id="${id}"><path d="${head}"/></clipPath><g clip-path="url(#${id})"><path d="${head}" fill="${fur}"/>${c.pattern ? c.pattern(furD) : ''}`;
  // shadow crescent: everything outside a copy of the head shifted up-left
  const shifted = head.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, a, b) => `${+a - 6} ${+b - 7}`);
  s += `<path d="M0 0 H128 V128 H0 Z ${shifted}" fill="#2a1838" fill-opacity=".14" fill-rule="evenodd"/></g>`;
  if (c.muzzle) s += `<path d="M64 76 C78 76 88 84 88 94 C88 106 76 110 64 110 C52 110 40 106 40 94 C40 84 50 76 64 76 Z" fill="${c.muzzle}"/>`;
  s += `<path d="${head}" ${stroke()}/>`;
  // cheeks
  if (c.blush !== false) s += `<ellipse cx="34" cy="92" rx="8" ry="5" fill="#ff7fa6" fill-opacity=".45"/><ellipse cx="94" cy="92" rx="8" ry="5" fill="#ff7fa6" fill-opacity=".45"/>`;
  s += eyes(c);
  // nose and mouth
  s += `<path d="M58 86 H70 Q70 90 64 93 Q58 90 58 86 Z" fill="${c.nose || '#ff8fa8'}" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/>`;
  s += mouth(c.mouth);
  // whiskers
  const wc = c.whisker || OL;
  s += `<path d="M26 86 L8 82 M26 94 L9 97 M102 86 L120 82 M102 94 L119 97" stroke="${wc}" stroke-width="2.6" stroke-linecap="round" stroke-opacity=".75"/>`;
  if (c.extra) s += c.extra;
  return s;
}

function eyes(c) {
  const L = 44, R = 84, Y = 74, iris = c.iris;
  const open = (x, big = 1) => {
    const rx = 8.5 * big, ry = 10.5 * big;
    if (iris) {
      return `<ellipse cx="${x}" cy="${Y}" rx="${rx}" ry="${ry}" fill="${iris}" stroke="${OL}" stroke-width="3"/>` +
        `<ellipse cx="${x}" cy="${Y + 1}" rx="${rx * 0.42}" ry="${ry * 0.82}" fill="${OL}"/>` + dot(x + 3, Y - 4, 2.6 * big, '#fff', 1);
    }
    return `<ellipse cx="${x}" cy="${Y}" rx="${rx}" ry="${ry}" fill="${OL}"/>` + dot(x + 2.5, Y - 4, 3.4 * big, '#fff', 1) + dot(x - 3, Y + 4, 1.6 * big, '#fff', 1);
  };
  const arcUp = (x) => `<path d="M${x - 9} ${Y + 3} Q${x} ${Y - 9} ${x + 9} ${Y + 3}" ${stroke(4.5)}/>`;   // happy ^
  const arcDown = (x) => `<path d="M${x - 9} ${Y - 1} Q${x} ${Y + 9} ${x + 9} ${Y - 1}" ${stroke(4.5)}/>`; // content u
  const lidded = (x) => `<clipPath id="lid${x}"><rect x="${x - 12}" y="${Y - 2}" width="24" height="20"/></clipPath><g clip-path="url(#lid${x})">${open(x)}</g><path d="M${x - 10} ${Y - 2} H${x + 10}" ${stroke(4)}/>`;
  switch (c.eyes) {
    case 'happy': return arcUp(L) + arcUp(R);
    case 'content': return arcDown(L) + arcDown(R);
    case 'wink': return open(L) + arcUp(R);
    case 'big': return open(L, 1.18) + open(R, 1.18) + dot(L - 4, Y - 7, 1.6, '#fff', 1) + dot(R - 4, Y - 7, 1.6, '#fff', 1);
    case 'smug': return lidded(L) + lidded(R);
    case 'grumpy': return lidded(L) + lidded(R) + `<path d="M34 60 L52 65 M94 60 L76 65" ${stroke(4)}/>`;
    case 'sad': return open(L) + open(R) + `<path d="M36 61 L50 57 M92 61 L78 57" ${stroke(3.5)}/>` +
      `<path d="M92 82 C88 90 88 94 92 96 C96 94 96 90 92 82 Z" fill="#7fd4ff" stroke="${OL}" stroke-width="2.5"/>`;
    case 'surprised': {
      const s = (x) => `<circle cx="${x}" cy="${Y}" r="9" fill="#fff" stroke="${OL}" stroke-width="3"/><circle cx="${x}" cy="${Y + 1}" r="5" fill="${iris ? OL : OL}"/>` + dot(x + 2, Y - 1, 1.6, '#fff', 1);
      return iris ? `<circle cx="${L}" cy="${Y}" r="10" fill="${iris}" stroke="${OL}" stroke-width="3"/><circle cx="${R}" cy="${Y}" r="10" fill="${iris}" stroke="${OL}" stroke-width="3"/><circle cx="${L}" cy="${Y}" r="4.5" fill="${OL}"/><circle cx="${R}" cy="${Y}" r="4.5" fill="${OL}"/>${dot(L + 3, Y - 3, 2.2, '#fff', 1)}${dot(R + 3, Y - 3, 2.2, '#fff', 1)}` : s(L) + s(R);
    }
    case 'up': return [L, R].map((x) => `<ellipse cx="${x}" cy="${Y}" rx="8" ry="10" fill="${OL}"/>` + dot(x + 2, Y - 5, 3.2, '#fff', 1)).join('');
    default: return open(L) + open(R);
  }
}

function mouth(m) {
  const w = `<path d="M54 95 Q59 101 64 95 Q69 101 74 95" ${stroke(3.5)}/>`;
  switch (m) {
    case 'open': return `<path d="M54 96 Q64 98 74 96 Q73 110 64 110 Q55 110 54 96 Z" fill="#a8364e" stroke="${OL}" stroke-width="3.2" stroke-linejoin="round"/><path d="M58 105 Q64 101 70 105 Q68 109 64 109 Q60 109 58 105 Z" fill="#ff8fa8"/>`;
    case 'tongue': return `<path d="M61 98 V104 A3.5 3.5 0 0 0 68 104 V98 Z" fill="#ff8fa8" stroke="${OL}" stroke-width="2.5"/>` + w;
    case 'o': return `<ellipse cx="64" cy="102" rx="5" ry="6" fill="#a8364e" stroke="${OL}" stroke-width="3"/>`;
    case 'flat': return `<path d="M55 101 Q64 96 73 101" ${stroke(3.5)}/>`;
    case 'small': return `<path d="M58 97 Q64 101 70 97" ${stroke(3.2)}/>`;
    case 'wavy': return `<path d="M54 100 Q57 96 60 100 Q63 104 66 100 Q69 96 72 100" ${stroke(3.2)}/>`;
    default: return w;
  }
}

// fur patterns (drawn inside the head clip)
const tabby = (col) => (d) => `<path d="M64 38 V50 M52 40 L54 50 M76 40 L74 50 M18 72 H32 M16 82 H30 M110 72 H96 M112 82 H98" ${stroke(6, col || d)}/>`;
const CATS = [
  { name: 'Mango', fur: '#ffa24a', pattern: tabby(), muzzle: '#fff1dd', eyes: 'open', mouth: 'w' },
  { name: 'Biscuit', fur: '#f2d3a2', furD: '#d8ad6e', pattern: tabby('#e0b779'), muzzle: '#fffaf0', eyes: 'happy', mouth: 'open' },
  { name: 'Pepper', fur: '#9aa3ad', pattern: tabby('#6d7680'), muzzle: '#ffffff', eyes: 'wink', mouth: 'tongue' },
  { name: 'Rosie', fur: '#fffaf6', earIn: '#ffb3c8', eyes: 'big', mouth: 'small', whisker: '#b9a7b0',
    extra: `<path d="M92 38 C86 30 96 24 100 32 C104 24 114 30 108 38 L100 46 Z" fill="#ff7fa6" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="36" r="3" fill="#ffd1df"/>` },
  { name: 'Smudge', fur: '#3a3a48', earIn: '#ff9fbc', iris: '#b6e35a', eyes: 'smug', mouth: 'w', whisker: '#e8e4ee',
    pattern: () => '<path d="M64 52 C70 64 92 70 96 84 C100 112 28 112 32 84 C36 70 58 64 64 52 Z" fill="#fffaf6"/>' },
  { name: 'Patches', fur: '#fffaf6', earFur: '#ffa24a', eyes: 'open', mouth: 'tongue',
    pattern: () => '<path d="M14 40 C40 30 56 44 52 62 C48 76 26 74 14 70 Z" fill="#ffa24a"/><path d="M114 44 C92 34 74 46 80 62 C86 74 104 72 114 74 Z" fill="#3a3a48"/><circle cx="96" cy="106" r="10" fill="#ffa24a"/>' },
  { name: 'Ziggy', fur: '#f8ead6', earFur: '#7a5240', earIn: '#b58873', iris: '#6fc3ff', eyes: 'open', mouth: 'small', blush: false,
    pattern: () => '<ellipse cx="64" cy="96" rx="26" ry="20" fill="#9a6a52"/><path d="M50 38 C56 46 72 46 78 38" fill="#c9a183"/>' },
  { name: 'Shadow', fur: '#3a3a48', earIn: '#ff9fbc', iris: '#ffd23f', eyes: 'surprised', mouth: 'o', whisker: '#e8e4ee' },
  { name: 'Misty', fur: '#a8b4cc', pattern: () => '<path d="M64 38 V48" stroke="#8592ad" stroke-width="6" stroke-linecap="round"/>', muzzle: '#eef1f8', eyes: 'sad', mouth: 'flat' },
  { name: 'Grumbles', fur: '#a07a5a', pattern: tabby('#6e4e38'), muzzle: '#f3e3cf', eyes: 'grumpy', mouth: 'flat', blush: false },
  { name: 'Toffee', fur: '#4a3a3a', earFur: '#d9822b', iris: '#ffb52e', eyes: 'open', mouth: 'w', whisker: '#f3e3cf',
    pattern: () => '<path d="M64 36 C76 50 70 70 60 80 C52 90 40 84 34 74 C26 60 40 40 64 36 Z" fill="#d9822b"/><circle cx="96" cy="96" r="14" fill="#d9822b"/><circle cx="84" cy="50" r="7" fill="#f2b26b"/>' },
  { name: 'Cocoa', fur: '#7a4e36', pattern: () => '<path d="M64 60 C74 70 92 76 92 92 C92 112 36 112 36 92 C36 76 54 70 64 60 Z" fill="#fff4e4"/>', eyes: 'content', mouth: 'w' },
  { name: 'Tiger', fur: '#ff9a3c', muzzle: '#fff1dd', eyes: 'happy', mouth: 'open',
    pattern: (d) => `<path d="M64 36 V54 M48 38 L52 54 M80 38 L76 54 M14 66 L34 70 M14 80 L32 80 M14 94 L30 90 M114 66 L94 70 M114 80 L96 80 M114 94 L98 90" ${stroke(7, '#a8461c')}/>` },
  { name: 'Leo', fur: '#ffcf6b', earFur: '#e8a43a', ruff: '#e8a43a', muzzle: '#fff4dc', eyes: 'open', mouth: 'w',
    pattern: () => '<path d="M58 40 L64 52 L70 40" fill="#e8a43a"/>' },
];

// ---------- Mahjong ----------
const MJ = { blue: '#1f5fae', green: '#1f8a4c', red: '#d2322d', ink: '#1d2433' };
const CJK = `font-family="'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Noto Sans SC','Source Han Sans SC','Hiragino Sans GB',sans-serif" font-weight="700" paint-order="stroke" stroke-linejoin="round"`;
const mjSvg = (body) => { uid = 0; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128" width="96" height="128">${body}</svg>\n`; };

function coin(x, y, r, c) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * 0.74}" fill="#fffaf0"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.52}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="#fffaf0"/>` +
    `<circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * 0.1}" fill="#fff" fill-opacity=".6"/>`;
}
function dotsFace(n) {
  const C = [MJ.blue, MJ.green, MJ.red];
  if (n === 1) {
    let s = `<circle cx="48" cy="64" r="36" fill="${MJ.green}"/><circle cx="48" cy="64" r="30" fill="#fffaf0"/>`;
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; s += `<circle cx="${f(48 + Math.cos(a) * 24)}" cy="${f(64 + Math.sin(a) * 24)}" r="4" fill="${MJ.blue}"/>`; }
    return s + `<circle cx="48" cy="64" r="16" fill="${MJ.red}"/><circle cx="48" cy="64" r="11" fill="#fffaf0"/><circle cx="48" cy="64" r="7" fill="${MJ.red}"/>` + `<path d="${twinkle(48, 64, 5)}" fill="#fffaf0"/>`;
  }
  const L = {
    2: [[48, 34, 1], [48, 94, 0]],
    3: [[22, 28, 0], [48, 64, 2], [74, 100, 1]],
    4: [[26, 36, 0], [70, 36, 1], [26, 92, 1], [70, 92, 0]],
    5: [[24, 30, 0], [72, 30, 1], [48, 64, 2], [24, 98, 1], [72, 98, 0]],
    6: [[28, 26, 1], [68, 26, 1], [28, 64, 2], [68, 64, 2], [28, 102, 2], [68, 102, 2]],
    7: [[20, 18, 1], [48, 32, 1], [76, 46, 1], [28, 78, 2], [68, 78, 2], [28, 108, 2], [68, 108, 2]],
    8: [[28, 18, 0], [68, 18, 0], [28, 48, 0], [68, 48, 0], [28, 80, 0], [68, 80, 0], [28, 110, 0], [68, 110, 0]],
    9: [[20, 24, 0], [48, 24, 0], [76, 24, 0], [20, 64, 2], [48, 64, 2], [76, 64, 2], [20, 104, 1], [48, 104, 1], [76, 104, 1]],
  }[n];
  const r = { 2: 22, 3: 17, 4: 18, 5: 17, 6: 15, 7: 12, 8: 13, 9: 13 }[n];
  return L.map(([x, y, c]) => coin(x, y, r, C[c])).join('');
}
function stick(x, y, h, c = MJ.green, w = 12) {
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="5" fill="${c}"/>` +
    `<path d="M${x - w / 2} ${y} H${x + w / 2}" stroke="#fffaf0" stroke-width="2.4"/>` +
    `<path d="M${x - 1.6} ${y - h / 2 + 4} V${y - 3} M${x - 1.6} ${y + 3} V${y + h / 2 - 4}" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>` +
    `<rect x="${x - w / 2 - 1.5}" y="${y - h / 2}" width="${w + 3}" height="4" rx="2" fill="${dk(c, .3)}"/><rect x="${x - w / 2 - 1.5}" y="${y + h / 2 - 4}" width="${w + 3}" height="4" rx="2" fill="${dk(c, .3)}"/>`;
}
function bambooFace(n) {
  const G = MJ.green, R = MJ.red, B = MJ.blue;
  if (n === 1) { // a little bamboo bird
    return `<path d="M30 92 C14 100 10 116 14 120 C24 116 34 106 40 96 Z" fill="${G}"/><path d="M36 96 C30 110 32 122 38 124 C44 116 46 106 46 96 Z" fill="${B}"/>` +
      `<path d="M48 104 C26 104 22 78 34 64 C42 54 58 54 66 62 C74 70 74 90 64 98 C60 102 54 104 48 104 Z" fill="${G}"/>` +
      `<path d="M44 96 C36 90 36 76 46 72 C54 70 62 78 60 88 C58 94 52 98 44 96 Z" fill="${R}"/>` +
      `<circle cx="62" cy="40" r="17" fill="${G}"/><path d="M76 36 L90 42 L76 46 Z" fill="#e8a43a"/><circle cx="66" cy="36" r="5" fill="#fffaf0"/><circle cx="67" cy="36" r="2.6" fill="${MJ.ink}"/>` +
      `<path d="M56 24 C54 14 60 8 66 12 M62 23 C64 14 72 12 74 18" stroke="${R}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<path d="M40 112 V124 M52 110 V124" stroke="#e8a43a" stroke-width="3" stroke-linecap="round"/>`;
  }
  const P = {
    2: [[48, 36, G], [48, 92, B]],
    3: [[48, 36, G], [30, 92, B], [66, 92, B]],
    4: [[30, 36, B], [66, 36, G], [30, 92, G], [66, 92, B]],
    5: [[24, 36, G], [72, 36, B], [48, 64, R], [24, 92, B], [72, 92, G]],
    6: [[22, 36, G], [48, 36, G], [74, 36, G], [22, 92, B], [48, 92, B], [74, 92, B]],
    7: [[48, 22, R], [22, 64, G], [48, 64, G], [74, 64, G], [22, 106, B], [48, 106, B], [74, 106, B]],
    8: [[15, 36, G], [37, 36, G], [59, 36, G], [81, 36, G], [15, 92, B], [37, 92, B], [59, 92, B], [81, 92, B]],
    9: [[22, 22, G], [48, 22, R], [74, 22, B], [22, 64, G], [48, 64, R], [74, 64, B], [22, 106, G], [48, 106, R], [74, 106, B]],
  }[n];
  const h = n >= 7 ? 38 : 52;
  return P.map(([x, y, c]) => stick(x, y, h, c, n === 8 ? 11 : n >= 6 ? 13 : 15)).join('');
}
const NUMS = '一二三四五六七八九';
const charFace = (n) => `<text x="48" y="56" text-anchor="middle" font-size="50" fill="${MJ.ink}" stroke="${MJ.ink}" stroke-width="2" ${CJK}>${NUMS[n - 1]}</text>` +
  `<text x="48" y="116" text-anchor="middle" font-size="54" fill="${MJ.red}" stroke="${MJ.red}" stroke-width="0.8" ${CJK}>萬</text>`;
const bigChar = (ch, col) => `<text x="48" y="90" text-anchor="middle" font-size="74" fill="${col}" stroke="${col}" stroke-width="2.4" ${CJK}>${ch}</text>`;
function flowerFace() {
  const bloom = (x, y, r, c) => [...Array(5)].map((_, i) => { const a = (i * 72 - 90) * Math.PI / 180; return `<circle cx="${f(x + Math.cos(a) * r)}" cy="${f(y + Math.sin(a) * r)}" r="${f(r * 0.72)}" fill="${c}"/>`; }).join('') +
    `<circle cx="${x}" cy="${y}" r="${f(r * .5)}" fill="#ffd23f"/><circle cx="${x}" cy="${y}" r="${f(r * .22)}" fill="${MJ.red}"/>`;
  return `<path d="M30 122 C34 96 44 82 62 66 M42 92 C52 88 62 92 70 98 M50 78 C42 70 34 66 24 64" stroke="#7a5240" stroke-width="5" fill="none" stroke-linecap="round"/>` +
    `<path d="M70 98 C78 92 86 96 84 104 C78 106 72 104 70 98 Z" fill="${MJ.green}"/><path d="M24 64 C18 56 22 50 28 52 C30 58 28 62 24 64 Z" fill="${MJ.green}"/>` +
    bloom(62, 50, 14, '#ff7fa6') + bloom(28, 40, 10, '#ff9ac1') + bloom(76, 22, 8, '#ff7fa6') + bloom(44, 100, 8, '#ffb3c8');
}
function seasonFace() { // an autumn maple leaf
  const pts = [[48, 12], [56, 34], [72, 26], [68, 46], [88, 44], [78, 60], [90, 70], [64, 76], [66, 92], [50, 82], [48, 82], [46, 82], [30, 92], [32, 76], [6, 70], [18, 60], [8, 44], [28, 46], [24, 26], [40, 34]];
  return `<path d="M48 80 V122" stroke="#9a4a22" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="${roundPoly(pts, 2.5)}" fill="#e8562a"/>` +
    `<path d="M48 80 V24 M48 62 L72 42 M48 62 L24 42 M48 72 L76 66 M48 72 L20 66" stroke="#ffb05a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
}
function mjFace(i) {
  if (i < 9) return dotsFace(i + 1);
  if (i < 18) return bambooFace(i - 8);
  if (i < 27) return charFace(i - 17);
  if (i < 31) return bigChar('東南西北'[i - 27], MJ.ink);
  if (i === 31) return bigChar('中', MJ.red);
  if (i === 32) return bigChar('發', MJ.green);
  if (i === 33) return `<rect x="16" y="22" width="64" height="84" rx="6" fill="none" stroke="${MJ.blue}" stroke-width="7"/><rect x="26" y="32" width="44" height="64" rx="3" fill="none" stroke="${MJ.blue}" stroke-width="3" stroke-dasharray="6 4"/>`;
  if (i === 34) return flowerFace();
  return seasonFace();
}

// ---------- puzzled cat (needs catHead) ----------
UI['thinking-face'] = () => svg(
  `<g transform="translate(-6 10) scale(.86) rotate(-8 64 76)">${catHead({ fur: '#9aa3ad', pattern: tabby('#6d7680'), muzzle: '#ffffff', eyes: 'up', mouth: 'wavy' })}</g>` +
  `<g transform="translate(86 4)">${tube('M4 14 C4 2 28 2 28 14 C28 24 16 24 16 34 V38', '#ffc531', 7, 4)}${sh('<circle cx="16" cy="50" r="5.5"/>', GOLD, { dx: 1.5, dy: 1.5, sw: 4 })}</g>`);

// ---------- write ----------
function write(sub, name, data) {
  const p = join(ROOT, sub, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
}
for (const [name, fn] of Object.entries(UI)) write('ui', `${name}.svg`, fn());
CATS.forEach((c, i) => write('cats', `cat${String(i + 1).padStart(2, '0')}.svg`, svg(catHead(c))));
for (let i = 0; i < 36; i++) write('mahjong', `m${String(i).padStart(2, '0')}.svg`, mjSvg(mjFace(i)));
console.log(`Wrote ${Object.keys(UI).length} ui, ${CATS.length} cats, 36 mahjong faces to ${ROOT}`);
console.log('Cat names in order:', CATS.map((c) => c.name).join(', '));
