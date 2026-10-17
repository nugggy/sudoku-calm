// Draws the cartoon pictures used by Word Search themes, Word Wheel scenes and Jigsaw scenes.
// Flat shapes with a darker half, no outlines, so they sit next to the Kenney CC0 art in www/img/kenney.
// Usage: node tools/gen-scene-art.mjs   (writes www/img/art/things/<name>.svg)
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../www/img/art/things/', import.meta.url);

// Kenney-like palette: [light, dark]
const P = {
  red: ['#e8505b', '#c93b47'], orange: ['#f7953f', '#de7a27'], yellow: ['#ffcf3f', '#f2b02a'],
  green: ['#3fc380', '#2ea566'], teal: ['#1fbc9c', '#17a085'], blue: ['#4aa8e0', '#3689c2'],
  purple: ['#9b7be0', '#7f5fc9'], pink: ['#f58fb5', '#e06d98'], cream: ['#f3e4c0', '#e2cfa1'],
  brown: ['#b06a3b', '#8f532c'], grey: ['#a7c0cc', '#8aa6b4'], white: ['#ffffff', '#e2eaf0'],
  tan: ['#ecc79c', '#d9ad7c'], sky: ['#bfe6f7', '#a3d6ee'],
};
const INK = '#3b4a5a';

// ---------- path helpers ----------
const f = (n) => +n.toFixed(2);
const C = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
const E = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`;
const R = (x, y, w, h, r = 0) => (r
  ? `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}Z`
  : `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`);
const poly = (pts) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
const starPts = (cx, cy, r1, r2, n = 5, rot = -90) => [...Array(n * 2)].map((_, i) => {
  const a = ((rot + (i * 180) / n) * Math.PI) / 180, r = i % 2 ? r2 : r1;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
const spiral = (cx, cy, r, turns = 2.2) => {
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.02) { const a = t * turns * Math.PI * 2; pts.push([cx + Math.cos(a) * r * t, cy + Math.sin(a) * r * t]); }
  return 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
};

// ---------- element helpers ----------
let uid = 0;
const p = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
const line = (d, stroke, w, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;
// a shape with its right side (x > at) in the darker colour, the way Kenney shades things
function split(d, [light, dark], at = 64, extra = '') {
  const id = 'k' + (++uid);
  return `<clipPath id="${id}"><rect x="${at}" y="-999" width="1999" height="1999"/></clipPath>${p(d, light, extra)}${p(d, dark, `clip-path="url(#${id})"${extra ? ' ' + extra : ''}`)}`;
}
// draw `inner` clipped to shape d
function clipTo(d, inner) { const id = 'k' + (++uid); return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`; }
const eye = (cx, cy, r, look = 0.25) => p(C(cx, cy, r), '#fff') + p(C(cx + r * look, cy + r * 0.1, r * 0.62), INK) + p(C(cx + r * look + r * 0.22, cy - r * 0.18, r * 0.2), '#fff');
const dot = (cx, cy, r, fill = INK) => p(C(cx, cy, r), fill);
const rot = (deg, cx, cy, inner) => `<g transform="rotate(${deg} ${cx} ${cy})">${inner}</g>`;
const flipX = (w, inner) => `<g transform="translate(${w} 0) scale(-1 1)">${inner}</g>`;

const T = {}; // name -> [w, h, body] or body (128 square)

// ---------- food and things ----------
T.apple = () => {
  const body = 'M64 42C50 28 16 32 16 68C16 98 40 118 52 116C58 115 60 112 64 112C68 112 70 115 76 116C88 118 112 98 112 68C112 32 78 28 64 42Z';
  return split(body, P.red) + p('M62 44Q59 26 68 14l5 3Q66 28 67 44Z', P.brown[1]) + p('M70 32Q80 12 102 16Q92 36 70 32Z', P.green[0]) + p('M72 31Q86 22 96 19', 'none', `stroke="${P.green[1]}" stroke-width="2.5" stroke-linecap="round"`)
    + p(E(36, 62, 6, 13), '#fff', 'opacity=".35" transform="rotate(20 36 62)"');
};
T.carrot = () => p('M86 42Q78 22 84 6Q96 22 92 42Z', P.green[1]) + p('M92 44Q104 20 122 18Q114 38 96 48Z', P.green[0]) + p('M88 42Q68 24 70 10Q88 22 94 40Z', P.green[0])
  + split('M94 40C103 48 101 58 92 66L32 114C27 118 21 112 25 107L72 42C78 33 87 33 94 40Z', P.orange, 80)
  + line('M58 74l10 7M46 90l8 6M70 56l9 6M38 102l5 4', P.orange[1], 4);
T.planet = () => {
  const ringBack = `<ellipse cx="64" cy="64" rx="60" ry="15" fill="none" stroke="${P.yellow[1]}" stroke-width="9"/>`;
  const id = 'k' + (++uid);
  const ringFront = `<clipPath id="${id}"><rect x="-10" y="64" width="150" height="80"/></clipPath><ellipse cx="64" cy="64" rx="60" ry="15" fill="none" stroke="${P.yellow[0]}" stroke-width="9" clip-path="url(#${id})"/>`;
  const sphere = C(64, 64, 36);
  return rot(-18, 64, 64, ringBack + split(sphere, P.purple) + clipTo(sphere, p(R(20, 44, 90, 9), '#b9a0f2') + p(R(20, 74, 90, 7), '#6d4fb8', 'opacity=".6"')) + ringFront);
};
T['planet-red'] = () => {
  const s = C(64, 64, 40);
  return split(s, ['#f08a5d', '#d96b3f']) + clipTo(s, p(C(44, 50, 9), '#d96b3f') + p(C(80, 86, 12), '#c45a33') + p(C(84, 40, 6), '#e07a4a') + p(C(40, 88, 5), '#c45a33'));
};
T.globe = () => {
  const s = C(64, 64, 48);
  const land = p('M30 36Q42 22 58 28Q64 40 52 46Q46 58 54 70Q50 84 40 80Q32 66 26 58Q20 46 30 36Z', P.green[0]) + p('M74 22Q92 24 102 38Q98 46 88 44Q78 40 74 30Z', P.green[0])
    + p('M78 60Q92 54 104 62Q110 80 96 98Q84 104 80 92Q86 80 78 72Z', P.green[0]) + p('M46 100Q58 96 66 106Q60 114 48 110Z', P.green[0]);
  return clipTo(s, p(s, P.blue[0]) + land + p(R(64, 0, 80, 128), P.blue[1], 'opacity=".35"')) + p(E(40, 36, 8, 4), '#fff', 'opacity=".35" transform="rotate(-35 40 36)"');
};
T.ball = () => {
  const s = C(64, 64, 50);
  const pent = (cx, cy, r, a) => p(poly(starPts(cx, cy, r, r, 5, a).filter((_, i) => i % 2 === 0)), INK);
  let outer = '';
  for (let k = 0; k < 5; k++) { const a = ((-90 + 36 + k * 72) * Math.PI) / 180; outer += pent(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48, 15, -90 + 36 + k * 72 + 180); }
  let seams = '';
  for (let k = 0; k < 5; k++) { const a = ((-90 + k * 72) * Math.PI) / 180, b = ((-90 + 36 + k * 72) * Math.PI) / 180; seams += `M${f(64 + Math.cos(a) * 15)} ${f(64 + Math.sin(a) * 15)}L${f(64 + Math.cos(b) * 36)} ${f(64 + Math.sin(b) * 36)}`; }
  return clipTo(s, split(s, P.white) + line(seams, '#c3ced6', 3) + outer + pent(64, 64, 16, -90));
};
T['beach-ball'] = () => {
  const s = C(64, 64, 46);
  const cols = [P.red[0], '#fff', P.yellow[0], '#fff', P.blue[0], '#fff'];
  let g = '';
  cols.forEach((c, i) => { const a1 = ((i * 60 - 90) * Math.PI) / 180, a2 = (((i + 1) * 60 - 90) * Math.PI) / 180; g += p(`M64 64L${f(64 + Math.cos(a1) * 80)} ${f(64 + Math.sin(a1) * 80)}L${f(64 + Math.cos(a2) * 80)} ${f(64 + Math.sin(a2) * 80)}Z`, c); });
  return clipTo(s, g + p(R(64, 0, 80, 128), '#000', 'opacity=".08"')) + dot(64, 64, 8, '#fff') + p(E(44, 40, 8, 4), '#fff', 'opacity=".5" transform="rotate(-40 44 40)"');
};
T.guitar = () => {
  const body = 'M64 24C52 24 44 34 46 46C47 54 40 58 38 70C34 92 48 108 64 108C80 108 94 92 90 70C88 58 81 54 82 46C84 34 76 24 64 24Z';
  return rot(-35, 64, 64, `<g transform="translate(64 64) scale(.88) translate(-64 -60)">${p(R(59, -14, 10, 56), P.brown[1])}${p(R(55, -26, 18, 16, 4), INK)}${split(body, P.orange)}${dot(64, 62, 10, '#6b3a1f')}${p(R(52, 86, 24, 6, 2), '#6b3a1f')}${line('M61 -12V88M64 -12V88M67 -12V88', '#f3e4c0', 1.2)}</g>`);
};
T['cooking-pot'] = () => line('M50 22q-6 -6 0 -12q6 -6 0 -12M64 20q-6 -6 0 -12q6 -6 0 -12M78 22q-6 -6 0 -12q6 -6 0 -12', '#b8c9d4', 4)
  + p(R(6, 66, 18, 10, 5), P.red[1]) + p(R(104, 66, 18, 10, 5), P.red[1]) + split(R(22, 58, 84, 56, 12), P.red) + p(R(16, 52, 96, 12, 6), P.red[1])
  + split('M24 52Q64 18 104 52Z', P.grey) + p(R(56, 26, 16, 10, 5), INK);
T.bus = () => p(E(64, 112, 54, 5), '#000', 'opacity=".08"') + split(R(6, 28, 116, 74, 12), P.yellow, 64) + p(R(6, 80, 116, 22, 0), P.yellow[1], 'opacity=".55"')
  + p(R(16, 38, 18, 22, 3), '#bfe6f7') + p(R(40, 38, 18, 22, 3), '#bfe6f7') + p(R(64, 38, 18, 22, 3), '#bfe6f7') + p(R(98, 38, 18, 32, 3), '#bfe6f7') + p(R(86, 38, 8, 50, 2), '#9fd2ea')
  + p(R(6, 68, 78, 6), P.red[0]) + p(R(112, 82, 8, 6, 3), '#fff') + dot(32, 102, 13) + dot(32, 102, 5, P.grey[0]) + dot(96, 102, 13) + dot(96, 102, 5, P.grey[0]);
T.sunflower = () => {
  let petals = '';
  for (let k = 0; k < 14; k++) petals += p(E(64, 24, 7, 15), k % 2 ? P.yellow[1] : P.yellow[0], `transform="rotate(${k * (360 / 14)} 64 50)"`);
  return p(R(60, 66, 8, 60, 4), P.green[1]) + p('M64 104Q40 80 26 92Q42 110 64 104Z', P.green[0]) + p('M64 96Q88 72 104 84Q86 104 64 96Z', P.green[0])
    + petals + dot(64, 50, 17, P.brown[1]) + dot(64, 50, 12, '#7a4424') + dot(59, 46, 2, '#5b321b') + dot(68, 47, 2, '#5b321b') + dot(62, 55, 2, '#5b321b') + dot(70, 54, 2, '#5b321b');
};
T.ladybird = () => line('M56 24Q48 8 40 8M72 24Q80 8 88 8', INK, 3.5) + dot(40, 8, 4) + dot(88, 8, 4) + p(C(64, 36, 20), INK) + dot(56, 30, 4, '#fff') + dot(72, 30, 4, '#fff')
  + split(C(64, 74, 42), P.red) + p(R(62, 34, 4, 82), INK) + dot(44, 60, 8) + dot(84, 60, 8) + dot(40, 88, 7) + dot(88, 88, 7) + dot(56, 104, 5) + dot(72, 104, 5)
  + p(E(44, 52, 6, 3), '#fff', 'opacity=".35" transform="rotate(-30 44 52)"');
T.palette = () => split('M64 14C102 14 122 40 120 66C118 92 98 98 88 94C78 90 72 98 76 106C80 116 68 120 56 118C28 114 8 92 8 66C8 36 30 14 64 14Z', P.cream)
  + dot(38, 44, 10, P.red[0]) + dot(66, 32, 10, P.yellow[0]) + dot(94, 44, 10, P.blue[0]) + dot(30, 72, 10, P.green[0]) + dot(48, 96, 9, P.purple[0])
  + rot(40, 80, 80, p(R(76, 50, 8, 56, 4), P.brown[0]) + p(R(75, 40, 10, 12, 2), P.grey[1]) + p('M75 41Q80 18 85 41Z', INK));
T.toolbox = () => line('M44 50V36Q44 28 52 28H76Q84 28 84 36V50', P.grey[1], 8)
  + rot(-12, 40, 40, p(R(34, 22, 12, 30, 5), P.yellow[0]) + p(R(38, 4, 4, 20), P.grey[1]))
  + rot(15, 92, 40, p(R(88, 20, 9, 34, 2), P.grey[0]) + p('M84 14Q92 6 100 14L98 24H86Z', P.grey[0]) + p(R(90, 10, 5, 8), '#fff'))
  + split(R(12, 50, 104, 64, 8), P.red) + p(R(12, 50, 104, 16, 6), P.red[1]) + p(R(54, 60, 20, 12, 3), P.grey[0]);
T.books = () => {
  const book = (x, y, w, h, c, deg) => rot(deg, x + w / 2, y + h / 2, p(R(x, y, w, h, 3), c[0]) + p(R(x + w - 10, y + 3, 7, h - 6, 2), '#fff8e6') + p(R(x, y, 8, h, 3), c[1]) + p(R(x + 16, y + h / 2 - 2, w - 34, 4, 2), c[1]));
  return book(14, 88, 100, 24, P.blue, 0) + book(22, 63, 86, 24, P.red, -3) + book(16, 38, 90, 24, P.green, 2) + book(32, 15, 70, 22, P.yellow, -4);
};
T.cake = () => {
  const icing = 'M18 60Q18 44 64 44Q110 44 110 60V70Q104 80 98 70Q92 82 84 70Q76 84 68 70Q58 82 50 70Q42 80 34 70Q26 80 18 70Z';
  return p(E(64, 112, 54, 8), P.grey[0]) + split(R(18, 56, 92, 54, 8), P.cream) + p(R(18, 84, 92, 6), P.pink[1]) + split(icing, P.pink)
    + [40, 64, 88].map((x, i) => p(R(x - 3, 22, 6, 24, 2), [P.blue[0], P.yellow[0], P.green[0]][i]) + p(`M${x} 8Q${x + 7} 16 ${x} 22Q${x - 7} 16 ${x} 8Z`, P.orange[0]) + p(`M${x} 13Q${x + 3} 17 ${x} 20Q${x - 3} 17 ${x} 13Z`, P.yellow[0])).join('')
    + dot(28, 100, 3, P.red[0]) + dot(52, 98, 3, P.red[0]) + dot(76, 100, 3, P.red[0]) + dot(100, 98, 3, P.red[0]);
};
T.pancakes = () => {
  let stack = '';
  [96, 82, 68, 54].forEach((y) => { stack += p(R(18, y, 92, 16, 8), '#d9933f') + p(R(18, y - 2, 92, 13, 6.5), '#f2b25c'); });
  return p(E(64, 112, 58, 8), P.grey[0]) + p(E(64, 108, 50, 6), '#fff') + stack + p('M24 56Q24 46 64 46Q104 46 104 56Q104 64 98 62Q96 76 90 64Q80 66 72 62Q70 82 62 62Q44 66 36 62Q34 72 28 62Q24 60 24 56Z', '#b0642c')
    + p(R(52, 34, 26, 16, 3), '#ffe680') + p(R(52, 34, 26, 5, 2), '#fff3b8');
};
T.tent = () => p(R(4, 104, 120, 14, 7), P.green[0]) + line('M64 22L64 12M14 108L4 116M114 108L124 116', P.brown[1], 3) + split('M12 110L64 20L116 110Z', P.orange)
  + p('M64 40L42 110H86Z', '#6b3a1f') + p('M64 40L52 110H60Z', P.orange[1]) + p('M64 40L76 110H68Z', '#9c5a2e');
T['t-shirt'] = () => {
  const d = 'M44 18L20 28L4 54L24 64L32 52V114H96V52L104 64L124 54L108 28L84 18Q64 36 44 18Z';
  return split(d, P.blue) + clipTo(d, p(R(0, 70, 128, 12), '#fff', 'opacity=".9"')) + line('M44 18Q64 36 84 18', P.blue[1], 5);
};
T.shapes = () => p(R(60, 56, 54, 54, 6), P.blue[0], 'transform="rotate(10 87 83)"') + split(C(42, 82, 30), P.red, 42) + p('M64 10L98 66H30Z', P.yellow[0], `stroke="${P.yellow[0]}" stroke-width="8" stroke-linejoin="round"`)
  + p('M64 10L98 66H64Z', P.yellow[1], `stroke="${P.yellow[1]}" stroke-width="8" stroke-linejoin="round"`);
T.cat = () => p('M22 50L26 10L58 34Z', P.orange[0]) + p('M106 50L102 10L70 34Z', P.orange[1]) + p('M30 40L32 22L48 34Z', P.pink[0]) + p('M98 40L96 22L80 34Z', P.pink[0])
  + split(C(64, 72, 46), P.orange) + p('M56 30L60 46L64 30L68 46L72 30', 'none', `stroke="${P.orange[1]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`)
  + p(E(64, 94, 26, 18), '#fff4e6') + eye(44, 70, 11, 0.1) + eye(84, 70, 11, -0.1) + p('M58 84H70L64 92Z', P.pink[1]) + line('M64 92Q60 100 54 98M64 92Q68 100 74 98', INK, 3)
  + line('M30 88L10 84M30 96L12 100M98 88L118 84M98 96L116 100', '#d9b9a0', 2.5);
T.dinosaur = () => {
  const [g, gd] = P.green;
  return p(R(42, 82, 13, 34, 6.5), gd) + p(R(76, 82, 13, 34, 6.5), gd) + p('M32 74Q10 78 2 104Q22 90 40 94Z', g) + split(E(58, 80, 36, 24), P.green, 58)
    + p(R(30, 88, 14, 32, 7), g) + p(R(64, 88, 14, 32, 7), g) + p('M76 70Q94 60 96 30L110 30Q112 68 86 90Z', gd) + p(E(104, 26, 15, 10), g)
    + dot(108, 22, 2.8) + line('M106 31Q112 33 117 29', INK, 2) + dot(48, 66, 5, gd) + dot(64, 62, 4, gd) + dot(38, 76, 4, gd) + dot(70, 74, 3, '#7fd8a6') + p(E(58, 94, 24, 7), '#8fe0b2');
};
T.pumpkin = () => p('M60 30Q58 14 70 8L74 12Q66 18 68 30Z', P.green[1]) + p(E(38, 74, 28, 38), P.orange[1]) + p(E(90, 74, 28, 38), P.orange[1]) + p(E(64, 74, 30, 42), P.orange[0])
  + line('M64 34V114', '#e8842f', 3) + p('M40 62L54 52L54 68Z', '#6b3a1f') + p('M88 62L74 52L74 68Z', '#6b3a1f') + p('M38 84L46 92L54 84L64 94L74 84L82 92L90 84Q86 102 64 104Q42 102 38 84Z', '#6b3a1f');
T.mountain = () => p('M4 112L44 46L84 112Z', P.grey[1]) + p('M44 46L34 62L40 60L46 66L52 60Z', '#eef4f8') + split('M28 112L78 22L128 112Z', P.grey, 78)
  + p('M78 22L64 46L72 42L78 50L84 42L92 46Z', '#fff') + p('M0 104Q32 96 64 104Q96 112 128 104V128H0Z', P.green[0]);
T['beach-umbrella'] = () => p(E(64, 114, 58, 10), '#f6dfa8') + p(R(62, 34, 5, 80, 2), P.brown[0], 'transform="rotate(8 64 74)"')
  + rot(8, 64, 74, clipTo('M8 50Q8 14 64 10Q120 14 120 50Q106 42 92 50Q78 42 64 50Q50 42 36 50Q22 42 8 50Z', p(R(0, 0, 128, 60), P.red[0]) + p('M64 10L36 50H50Z', '#fff') + p('M64 10L78 50H92Z', '#fff') + p(R(64, 0, 64, 60), '#000', 'opacity=".08"')));
T.tractor = () => p(R(20, 64, 72, 32, 6), P.red[0]) + p(R(20, 82, 72, 14, 0), P.red[1]) + split(R(62, 22, 40, 48, 6), P.red, 82) + p(R(68, 28, 28, 22, 3), '#bfe6f7') + p(R(28, 44, 6, 22, 2), INK)
  + p(R(10, 74, 14, 10, 3), P.grey[1]) + dot(88, 92, 26) + dot(88, 92, 11, P.yellow[0]) + dot(88, 92, 4, P.yellow[1]) + dot(32, 102, 15) + dot(32, 102, 6, P.yellow[0]);
T.barn = () => split('M14 56L64 18L114 56V120H14Z', P.red) + p('M8 60L64 14L120 60L114 66L64 26L14 66Z', '#8f2f38') + p(R(42, 72, 44, 48), '#fff') + p(R(46, 76, 36, 44), P.red[1])
  + line('M46 76L82 120M82 76L46 120', '#fff', 4) + p(R(54, 38, 20, 16, 2), '#fff') + p(R(57, 41, 14, 10), '#6b3a1f');
T.haybale = () => split(R(10, 50, 108, 66, 14), P.yellow) + line('M24 60V106M44 56V112M64 56V112M84 56V112M104 60V106', P.yellow[1], 3) + p(R(10, 50, 108, 66, 14), 'none', `stroke="${P.yellow[1]}" stroke-width="3"`);
T.sailboat = () => p('M68 8V86', 'none', `stroke="${P.brown[1]}" stroke-width="4"`) + p('M68 8L84 14L68 20Z', P.red[0]) + split('M71 22Q110 50 112 84H71Z', P.white, 92) + p('M64 30Q36 56 20 84H64Z', P.yellow[0])
  + split('M8 88H120L104 112H26Z', P.brown) + p(R(8, 88, 112, 6), P.red[0]);
T.crab = () => {
  const [r, rd] = P.red;
  return line('M40 74L14 66M38 82L12 84M42 90L18 102M88 74L114 66M90 82L116 84M86 90L110 102', rd, 6) + line('M44 66Q30 56 28 44M84 66Q98 56 100 44', r, 8)
    + p('M28 44L18 28A18 18 0 1 0 38 30Z', r) + p('M100 44L110 28A18 18 0 1 1 90 30Z', r) + line('M54 60V44M74 60V44', rd, 4) + eye(54, 42, 8, 0) + eye(74, 42, 8, 0)
    + split(E(64, 80, 36, 24), P.red) + line('M54 86Q64 94 74 86', '#8f2f38', 3) + dot(46, 76, 3, '#f7a5ab') + dot(82, 76, 3, '#f7a5ab');
};
T.shell = () => {
  let ribs = '';
  for (let k = -3; k <= 3; k++) { const a = ((k * 22 - 90) * Math.PI) / 180; ribs += `M64 108L${f(64 + Math.cos(a) * 80)} ${f(108 + Math.sin(a) * 80)}`; }
  const fan = 'M64 108L16 56Q14 38 26 32Q34 18 50 22Q58 12 64 14Q70 12 78 22Q94 18 102 32Q114 38 112 56Z';
  return p(R(50, 100, 28, 16, 4), '#e8a17a') + clipTo(fan, split(fan, ['#f9bf98', '#ee9f78']) + line(ribs, '#e0896a', 3.5));
};
T.starfish = () => { const d = poly(starPts(64, 66, 54, 22)); return p(d, P.orange[0], `stroke="${P.orange[0]}" stroke-width="12" stroke-linejoin="round"`) + p(d, P.orange[1], `transform="translate(64 66) scale(.5) translate(-64 -66)" opacity=".55"`) + dot(64, 30, 3, '#ffd2a0') + dot(98, 56, 3, '#ffd2a0') + dot(30, 56, 3, '#ffd2a0') + dot(48, 96, 3, '#ffd2a0') + dot(80, 96, 3, '#ffd2a0'); };
T.star = () => { const d = poly(starPts(64, 68, 56, 24)); return split(d, P.yellow, 64, `stroke-linejoin="round"`) + p(d, 'none', `stroke="${P.yellow[0]}" stroke-width="8" stroke-linejoin="round" opacity=".6"`); };
T.sun = () => {
  let rays = '';
  for (let k = 0; k < 12; k++) rays += p(R(60, 2, 8, 22, 4), k % 2 ? '#ffc23a' : '#ffb02e', `transform="rotate(${k * 30} 64 64)"`);
  return rays + p(C(64, 64, 36), '#ffd84a') + p(C(64, 64, 36), '#ffc23a', 'clip-path="url(#sunR)"') + '<clipPath id="sunR"><rect x="64" y="0" width="64" height="128"/></clipPath>' + p(C(64, 64, 26), '#ffe27a', 'opacity=".5"');
};
T.rocket = () => rot(30, 64, 64, p('M54 96Q64 128 74 96Z', P.orange[0]) + p('M58 96Q64 116 70 96Z', P.yellow[0])
  + p('M44 70L26 98L46 94Z', P.red[1]) + p('M84 70L102 98L82 94Z', P.red[1])
  + clipTo('M64 6C88 26 90 62 84 96H44C38 62 40 26 64 6Z', split('M64 6C88 26 90 62 84 96H44C38 62 40 26 64 6Z', P.white) + p(R(0, 0, 128, 30), P.red[0]) + p(R(64, 0, 64, 30), P.red[1]) + p(R(0, 86, 128, 12), P.grey[1]))
  + dot(64, 52, 13, P.grey[0]) + dot(64, 52, 9, P.blue[0]) + p(E(61, 49, 3, 2), '#fff', 'opacity=".7"') + p(R(61, 66, 6, 30), P.red[0]));
T.ufo = () => p(E(64, 50, 26, 24), '#bfe6f7') + p(E(64, 48, 10, 11), '#7ad46a') + eye(60, 46, 3.5, 0) + eye(69, 46, 3.5, 0)
  + p(E(56, 38, 5, 3), '#fff', 'opacity=".7"') + split(E(64, 66, 58, 16), P.grey) + p(E(64, 62, 58, 6), '#c4d6df') + dot(26, 70, 4, P.yellow[0]) + dot(46, 76, 4, P.pink[0]) + dot(64, 78, 4, P.yellow[0]) + dot(82, 76, 4, P.pink[0]) + dot(102, 70, 4, P.yellow[0]);
T.comet = () => p('M96 36L14 92L30 104Z', '#fff', 'opacity=".25"') + p('M96 36L26 82L36 92Z', '#fff', 'opacity=".4"') + split(poly(starPts(96, 38, 24, 11)), P.yellow, 96);
T.fish = () => p('M28 64L4 42V86Z', P.orange[1]) + p('M60 34Q74 18 86 36Z', P.orange[1]) + p('M60 94Q74 110 86 92Z', P.orange[1]) + clipTo(E(70, 64, 46, 32), p(E(70, 64, 46, 32), P.orange[0]) + p(R(52, 0, 12, 128), '#fff') + p(R(84, 0, 10, 128), '#fff') + p(R(70, 0, 60, 128), '#000', 'opacity=".06"'))
  + eye(98, 56, 8, 0.2) + line('M108 74Q112 76 114 72', INK, 2.5);
T['fish-blue'] = () => p('M28 64L6 40Q14 64 6 88Z', P.yellow[0]) + p('M50 36Q72 14 94 38Z', P.blue[1]) + p('M54 92Q72 108 90 90Z', P.blue[1]) + clipTo(E(72, 64, 46, 30), p(E(72, 64, 46, 30), P.blue[0]) + p('M40 50Q70 40 92 58Q70 50 50 70Z', '#2a5f9e') + p(R(72, 0, 60, 128), '#000', 'opacity=".06"'))
  + eye(100, 58, 8, 0.2);
T.octopus = () => {
  const [c, cd] = P.purple;
  let legs = '';
  [[-46, 0], [-28, 1], [-10, 0], [10, 1], [28, 0], [46, 1]].forEach(([dx, s], i) => {
    const x = 64 + dx * 0.9, ex = 64 + dx * 1.25, curl = s ? 1 : -1;
    legs += line(`M${f(x)} 66Q${f(x + dx * 0.3)} 96 ${f(ex)} 104Q${f(ex + 10 * curl)} 112 ${f(ex + 6 * curl)} 120`, i % 2 ? cd : c, 11);
  });
  return legs + split('M24 66Q22 18 64 16Q106 18 104 66Q64 80 24 66Z', P.purple) + eye(50, 46, 10, 0) + eye(78, 46, 10, 0) + dot(40, 62, 5, P.pink[0]) + dot(88, 62, 5, P.pink[0]) + line('M58 64Q64 70 70 64', INK, 3);
};
T.turtle = () => {
  const [g] = P.green;
  return p('M36 40Q12 22 8 40Q22 52 40 54Z', '#8fd16a') + p('M92 40Q116 22 120 40Q106 52 88 54Z', '#8fd16a') + p('M40 88Q22 104 26 116Q40 106 48 94Z', '#8fd16a') + p('M88 88Q106 104 102 116Q88 106 80 94Z', '#8fd16a')
    + p(E(64, 20, 13, 15), '#8fd16a') + dot(58, 16, 2.6) + dot(70, 16, 2.6) + split(E(64, 68, 36, 42), P.green)
    + line('M64 34L52 50L58 70L50 88M64 34L76 50L70 70L78 88M52 50H40M76 50H88M58 70H70M50 88L64 102L78 88M58 70L50 88', '#26905a', 3) + p(E(64, 68, 36, 42), 'none', `stroke="${g}" stroke-width="0"`);
};
T.seaweed = () => [64, 128, (s) => line('M20 128Q8 104 20 84Q32 64 18 40Q10 24 20 6', P.green[1], 9) + line('M38 128Q50 110 40 92Q30 74 42 56Q50 42 44 28', P.teal[0], 9) + line('M50 128Q58 116 52 104', P.green[0], 8)];
T.coral = () => line('M64 124V80M64 96L40 70V44M40 70L24 56V36M64 88L88 62V30M88 62L106 48V28M88 76L104 72M64 80L60 50', P.pink[0], 11) + line('M40 44V40M24 36V32M88 30V26M106 28V24M60 50V46', '#ffb3cf', 11);
T.bubbles = () => [64, 128, () => [[30, 110, 10], [40, 80, 7], [26, 56, 9], [38, 30, 6], [30, 12, 4]].map(([x, y, r]) => p(C(x, y, r), 'none', `stroke="#fff" stroke-width="3" opacity=".8"`) + dot(x - r * 0.35, y - r * 0.35, r * 0.25, '#fff')).join('')];
T.snowman = () => p(E(64, 122, 34, 5), '#9fb8c8', 'opacity=".35"') + p(C(64, 92, 33), '#d3e3ee') + p(C(64, 50, 23), '#d3e3ee') + p(C(64, 92, 32), P.white[0]) + p(C(64, 92, 32), P.white[1], 'clip-path="url(#snR)"') + '<clipPath id="snR"><rect x="64" y="0" width="64" height="128"/></clipPath>'
  + p(C(64, 50, 22), P.white[0]) + p(C(64, 50, 22), P.white[1], 'clip-path="url(#snR)"') + line('M36 72L14 56M14 56L8 58M14 56L12 48M92 72L114 56M114 56L120 58M114 56L116 48', P.brown[1], 4)
  + p('M40 62Q64 74 88 62L88 70Q64 82 40 70Z', P.red[0]) + p(R(74, 66, 10, 22, 3), P.red[1]) + p(R(40, 26, 48, 6, 3), INK) + p(R(48, 4, 32, 24, 3), INK) + p(R(48, 20, 32, 5), P.red[0])
  + dot(56, 46, 3.5) + dot(72, 46, 3.5) + p('M64 52L84 58L64 58Z', P.orange[0]) + dot(64, 84, 3.5) + dot(64, 96, 3.5) + dot(64, 108, 3.5);
T.snowflake = () => {
  let arms = '';
  for (let k = 0; k < 6; k++) arms += `<g transform="rotate(${k * 60} 64 64)"><path d="M64 64V10M64 28L52 18M64 28L76 18M64 44L54 36M64 44L74 36"/></g>`;
  return `<g fill="none" stroke-linecap="round" stroke="#9fd2ee" stroke-width="12">${arms}</g><g fill="none" stroke-linecap="round" stroke="#fff" stroke-width="7">${arms}</g>`;
};
T.igloo = () => {
  const dome = 'M8 112Q8 36 64 36Q120 36 120 112Z';
  return clipTo(dome, split(dome, P.white) + line('M0 60H128M0 86H128M44 36V60M84 36V60M28 60V86M64 60V86M100 60V86M44 86V112M84 86V112', '#c7d9e4', 3)) + p('M46 112V92Q46 74 64 74Q82 74 82 112Z', '#7fa6bd') + p('M52 112V94Q52 82 64 82Q76 82 76 112Z', '#4d7590');
};
T.kangaroo = () => {
  const b = '#d4834a', d = '#b0663a';
  return p('M54 96C36 100 18 108 4 124C22 118 42 112 60 108Z', d) + p(E(58, 92, 22, 18), d) + p(R(48, 110, 46, 9, 4.5), d)
    + p(E(70, 72, 18, 30), b, 'transform="rotate(20 70 72)"') + p(E(76, 80, 9, 19), '#f3d1a2', 'transform="rotate(20 76 80)"')
    + p('M78 32C70 18 70 8 75 8C81 12 84 22 84 32Z', d) + p('M82 30C76 14 78 4 84 4C90 8 90 20 88 30Z', b) + p('M83 26C80 16 81 10 84 9C87 12 87 20 86 26Z', '#e8a07a')
    + p(E(90, 36, 14, 11), b, 'transform="rotate(10 90 36)"') + p(E(102, 41, 11, 8), b) + eye(93, 32, 4, 0.2) + p(E(111, 39, 3, 2.4), INK)
    + line('M84 60Q94 64 97 74', d, 6);
};
T.koala = () => {
  const g = '#9fb0bb', gd = '#8798a4';
  return p(E(64, 94, 32, 28), g) + p(E(64, 94, 32, 28), gd, 'clip-path="url(#koR)"') + '<clipPath id="koR"><rect x="64" y="0" width="64" height="128"/></clipPath>' + p(E(64, 100, 18, 18), '#dbe3e8')
    + p(E(42, 116, 13, 8), gd) + p(E(86, 116, 13, 8), gd) + p(E(38, 88, 9, 16), gd, 'transform="rotate(-20 38 88)"') + p(E(90, 88, 9, 16), gd, 'transform="rotate(20 90 88)"')
    + p(C(28, 38, 19), g) + p(C(28, 40, 11), '#e8eef2') + p(C(100, 38, 19), gd) + p(C(100, 40, 11), '#e8eef2') + p(E(64, 54, 34, 29), g) + p(E(64, 54, 34, 29), gd, 'clip-path="url(#koR)"')
    + p(E(64, 60, 10, 13), INK) + p(E(61, 54, 3, 4), '#fff', 'opacity=".35"') + dot(48, 50, 4.5) + dot(80, 50, 4.5) + dot(49.5, 48.5, 1.5, '#fff') + dot(81.5, 48.5, 1.5, '#fff') + line('M58 76Q64 80 70 76', INK, 2.5);
};
T.fox = () => {
  const o = P.orange[0], od = P.orange[1];
  return p('M84 118Q126 116 120 80Q114 64 104 74Q114 96 84 106Z', od) + clipTo('M84 118Q126 116 120 80Q114 64 104 74Q114 96 84 106Z', p(C(116, 76, 12), '#fff'))
    + p('M38 122Q34 84 64 70Q94 84 90 122Z', o) + p('M52 122Q52 92 64 82Q76 92 76 122Z', '#fff4e6') + p(E(48, 120, 9, 5), INK) + p(E(80, 120, 9, 5), INK)
    + p('M28 40L30 6L58 28Z', o) + p('M100 40L98 6L70 28Z', od) + p('M33 32L34 14L49 27Z', '#6b3a1f') + p('M95 32L94 14L79 27Z', '#6b3a1f')
    + p('M24 34Q30 64 64 86Q98 64 104 34Q64 18 24 34Z', o) + p('M64 18Q98 22 104 34Q98 64 64 86Z', od, 'opacity=".45"') + p('M28 42Q40 66 64 86Q52 62 54 52Z', '#fff4e6') + p('M100 42Q88 66 64 86Q76 62 74 52Z', '#fff4e6')
    + eye(48, 46, 6, 0.2) + eye(80, 46, 6, -0.2) + p(E(64, 80, 6, 4.5), INK);
};
T.hedgehog = () => {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = Math.PI + (i / 24) * Math.PI, r = i % 2 ? 1.22 : 1; pts.push([56 + Math.cos(a) * 46 * r, 96 + Math.sin(a) * 40 * r]); }
  return p(poly(pts), P.brown[1]) + p(poly(pts.map(([x, y]) => [56 + (x - 56) * 0.78, 96 + (y - 96) * 0.78])), P.brown[0]) + p(E(56, 98, 46, 14), '#e8c39a')
    + p(E(96, 92, 22, 16), '#ecc79c') + p('M110 84L124 92L110 98Z', '#ecc79c') + dot(123, 92, 4.5) + eye(100, 86, 4.5, 0.3) + dot(104, 98, 3, '#f2a7a0')
    + p(E(40, 110, 8, 5), P.brown[1]) + p(E(78, 110, 8, 5), P.brown[1]);
};
T.snail = () => p('M12 110Q12 98 30 98H94Q106 98 110 84L114 68Q122 70 120 86Q118 110 98 110Z', '#ecc79c') + line('M110 74L104 54M116 72L120 52', '#d9ad7c', 4) + dot(104, 52, 4.5) + dot(120, 50, 4.5)
  + split(C(58, 70, 32), P.orange, 58) + line(spiral(58, 70, 26, 2.3), '#c4621e', 5) + line('M108 90Q112 94 116 90', INK, 2.5);
T.mushroom = () => split(R(48, 62, 32, 54, 12), P.cream) + split('M10 70Q10 18 64 16Q118 18 118 70Q64 82 10 70Z', P.red) + dot(40, 42, 8, '#fff') + dot(72, 30, 7, '#fff') + dot(92, 54, 8, '#fff') + dot(60, 58, 5, '#fff') + dot(24, 62, 4, '#fff');
T.butterfly = () => {
  const wing = (c, cd) => p('M64 60Q30 6 12 26Q2 50 40 66Z', c) + p('M64 66Q24 72 22 96Q34 116 60 82Z', cd) + dot(32, 36, 7, '#fff7c2') + dot(36, 92, 5, '#fff7c2');
  return wing(P.orange[0], P.purple[0]) + flipX(128, wing(P.orange[1], P.purple[1])) + p(R(59, 46, 10, 52, 5), INK) + dot(64, 42, 7) + line('M61 37Q54 20 46 16M67 37Q74 20 82 16', INK, 3) + dot(46, 16, 3) + dot(82, 16, 3);
};
T.bee = () => p(E(50, 42, 18, 24), '#e6f6ff', 'opacity=".95" transform="rotate(-25 50 42)"') + p(E(76, 40, 16, 22), '#cfeafa', 'opacity=".95" transform="rotate(20 76 40)"')
  + p('M18 76L4 74L18 82Z', INK) + clipTo(E(62, 78, 44, 32), p(E(62, 78, 44, 32), P.yellow[0]) + p(R(34, 40, 12, 80), INK) + p(R(58, 40, 12, 80), INK) + p(R(62, 40, 70, 80), '#000', 'opacity=".07"'))
  + eye(92, 70, 7, 0.2) + line('M90 88Q96 92 102 86', INK, 3) + line('M96 50Q100 34 110 30M90 50Q90 34 96 26', INK, 3);
T.tulip = () => p(R(61, 56, 6, 70, 3), P.green[1]) + p('M64 116Q38 88 40 66Q58 84 64 106Z', P.green[0]) + p('M64 110Q88 84 92 70Q72 82 64 100Z', P.green[0])
  + p('M38 24Q34 56 64 64Q94 56 90 24L76 36L64 18L52 36Z', P.red[0]) + p('M64 18L76 36L90 24Q94 56 64 64Z', P.red[1]);
T.daisy = () => {
  let petals = '';
  for (let k = 0; k < 12; k++) petals += p(E(64, 20, 8, 16), k % 2 ? '#eef4f8' : '#fff', `transform="rotate(${k * 30} 64 44)"`);
  return p(R(61, 56, 6, 70, 3), P.green[1]) + p('M64 108Q40 88 34 96Q48 114 64 108Z', P.green[0]) + petals + dot(64, 44, 13, P.yellow[0]) + dot(68, 48, 7, P.yellow[1]);
};
T['flower-pink'] = () => {
  let petals = '';
  for (let k = 0; k < 5; k++) petals += p(C(64, 24, 16), k % 2 ? P.pink[1] : P.pink[0], `transform="rotate(${k * 72} 64 46)"`);
  return p(R(61, 60, 6, 66, 3), P.green[1]) + p('M64 100Q88 82 98 90Q84 108 64 100Z', P.green[0]) + petals + dot(64, 46, 11, P.yellow[0]);
};
T.balloon = (c = P.red) => () => line('M64 92Q56 106 66 116Q74 124 64 128', '#7b8a96', 2) + p('M58 96L64 86L70 96Z', c[1]) + split('M64 6C86 6 98 24 98 44C98 70 78 88 64 90C50 88 30 70 30 44C30 24 42 6 64 6Z', c) + p(E(48, 32, 6, 12), '#fff', 'opacity=".4" transform="rotate(20 48 32)"');
T['balloon-red'] = T.balloon(P.red); T['balloon-blue'] = T.balloon(P.blue); T['balloon-yellow'] = T.balloon(P.yellow); T['balloon-green'] = T.balloon(P.green); T['balloon-purple'] = T.balloon(P.purple);
delete T.balloon;
T.gift = (box, rib) => () => split(R(16, 56, 96, 62, 6), box) + p(R(10, 42, 108, 20, 5), box[1]) + p(R(56, 42, 16, 76), rib[0]) + p('M64 42Q36 14 30 30Q32 42 64 42Z', rib[0]) + p('M64 42Q92 14 98 30Q96 42 64 42Z', rib[1]) + dot(64, 40, 7, rib[1]);
T['gift-red'] = T.gift(P.red, P.yellow); T['gift-blue'] = T.gift(P.blue, P.pink); T['gift-green'] = T.gift(P.green, P.red);
delete T.gift;
T['party-hat'] = () => clipTo('M64 8L100 112H28Z', split('M64 8L100 112H28Z', P.purple) + line('M20 96L110 64M20 70L110 38M20 44L110 12', P.yellow[0], 7)) + p(R(24, 106, 80, 10, 5), P.pink[0]) + dot(64, 10, 9, P.yellow[0]);
T.cupcake = () => p('M28 66H100L90 118H38Z', P.blue[0]) + p('M64 66H100L90 118H64Z', P.blue[1]) + line('M44 70L48 116M58 70L59 116M70 70L69 116M84 70L80 116', '#fff', 2.5, 'opacity=".5"')
  + split('M22 68Q16 50 34 46Q34 26 56 28Q64 12 78 26Q98 26 96 46Q114 50 106 68Z', P.pink) + dot(64, 18, 9, P.red[0]) + line('M64 10Q68 2 74 4', P.green[1], 3)
  + p(R(40, 44, 8, 3, 1.5), P.yellow[0]) + p(R(70, 38, 8, 3, 1.5), P.blue[0], 'transform="rotate(40 74 40)"') + p(R(80, 54, 8, 3, 1.5), P.green[0]) + p(R(50, 56, 8, 3, 1.5), '#fff');
T['ferris-wheel'] = () => {
  let spokes = '', cars = '';
  const cols = [P.red, P.yellow, P.blue, P.green, P.pink, P.orange, P.purple, P.teal];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, x = 64 + Math.cos(a) * 46, y = 56 + Math.sin(a) * 46;
    spokes += `M64 56L${f(x)} ${f(y)}`;
    cars += p(R(x - 9, y, 18, 14, 4), cols[k][0]) + p(R(x - 9, y, 18, 5, 2), cols[k][1]) + line(`M${f(x)} ${f(y)}V${f(y + 2)}`, INK, 2);
  }
  return line('M64 56L32 124M64 56L96 124', P.grey[1], 7) + line(spokes, '#d6e2e8', 3) + `<circle cx="64" cy="56" r="46" fill="none" stroke="${P.red[0]}" stroke-width="6"/><circle cx="64" cy="56" r="34" fill="none" stroke="${P.red[1]}" stroke-width="2.5"/>`
    + dot(64, 56, 7, P.grey[1]) + cars + p(R(22, 120, 84, 8, 3), P.grey[1]);
};
T.car = (c, taxi) => () => p('M30 56Q36 34 52 32H80Q92 32 100 56Z', c[1]) + p('M38 56Q42 40 54 38H64V56Z', '#bfe6f7') + p('M70 38H80Q88 38 92 56H70Z', '#bfe6f7')
  + split(R(8, 54, 112, 34, 12), c) + p(R(108, 62, 10, 7, 3), '#fff4b8') + p(R(10, 64, 8, 6, 3), P.red[1]) + p(R(60, 64, 10, 3, 1.5), c[1])
  + (taxi ? p(R(52, 22, 26, 10, 3), INK) + p(R(56, 24, 18, 6, 2), '#fff') + p(R(8, 72, 112, 6), INK, 'opacity=".75"') : '')
  + dot(34, 88, 14) + dot(34, 88, 6, P.grey[0]) + dot(94, 88, 14) + dot(94, 88, 6, P.grey[0]);
T['car-red'] = T.car(P.red); T['car-blue'] = T.car(P.blue); T.taxi = T.car(P.yellow, true);
delete T.car;
T.bicycle = () => {
  const wheel = (x) => `<circle cx="${x}" cy="86" r="24" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="${x}" cy="86" r="4" fill="${P.grey[1]}"/>`;
  return wheel(30) + wheel(98) + line('M30 86L52 52H88L98 86M52 52L64 86L88 52M64 86H30M84 40L88 52', P.red[0], 6) + line('M44 44H60M78 38H92', INK, 6);
};
T.rainbow = () => [128, 80, () => [P.red[0], P.orange[0], P.yellow[0], P.green[0], P.blue[0], P.purple[0]].map((c, i) => `<path d="M${10 + i * 8} 72A${54 - i * 8} ${54 - i * 8} 0 0 1 ${118 - i * 8} 72" fill="none" stroke="${c}" stroke-width="8.5"/>`).join('')
  + p(C(14, 66, 10) + C(26, 62, 13) + C(38, 68, 9), '#fff') + p(C(90, 68, 9) + C(102, 62, 13) + C(114, 66, 10), '#fff')];
T.lighthouse = () => [64, 128, () => p('M0 128Q2 112 14 108Q32 102 50 108Q62 112 64 128Z', P.grey[1]) + clipTo('M20 110L26 34H38L44 110Z', p(R(0, 0, 64, 128), '#fff') + p(R(0, 44, 64, 14), P.red[0]) + p(R(0, 72, 64, 14), P.red[0]) + p(R(0, 98, 64, 14), P.red[0]) + p(R(32, 0, 32, 128), '#000', 'opacity=".08"'))
  + p(R(18, 30, 28, 6, 2), INK) + p(R(23, 14, 18, 16, 2), '#fff3a0') + line('M23 14V30M41 14V30M32 14V30', INK, 2) + p('M18 15L32 2L46 15Z', P.red[1])];
T['hot-air-balloon'] = () => {
  const env = 'M64 4C94 4 110 26 108 48C106 70 82 82 78 92H50C46 82 22 70 20 48C18 26 34 4 64 4Z';
  return line('M50 92L54 106M78 92L74 106', '#7b8a96', 2) + p(R(50, 104, 28, 18, 4), P.brown[0]) + p(R(50, 104, 28, 5, 2), P.brown[1])
    + clipTo(env, p(R(0, 0, 128, 128), P.red[0]) + p('M64 0Q40 40 56 100H72Q88 40 64 0Z', P.yellow[0]) + p('M28 0Q2 50 44 100H50Q32 50 40 0Z', P.yellow[0]) + p('M100 0Q126 50 84 100H78Q96 50 88 0Z', P.yellow[0]) + p(R(64, 0, 64, 128), '#000', 'opacity=".09"'));
};
T.campfire = () => p('M64 14Q90 44 86 74Q84 92 64 94Q44 92 42 74Q38 44 64 14Z', P.orange[0]) + p('M64 42Q78 60 76 78Q74 90 64 90Q54 90 52 78Q50 60 64 42Z', P.yellow[0])
  + rot(-18, 64, 104, p(R(18, 96, 92, 16, 8), P.brown[0]) + p(C(102, 104, 7), P.tan[0])) + rot(18, 64, 104, p(R(18, 96, 92, 16, 8), P.brown[1]) + p(C(26, 104, 7), P.tan[1]));
T.sandcastle = () => {
  const s = ['#f0cf8a', '#ddb56c'];
  return split(R(14, 70, 100, 46), s) + split(R(10, 40, 30, 76), s, 26) + split(R(88, 40, 30, 76), s, 104) + split(R(44, 30, 40, 50), s)
    + p('M10 40V32H16V40H22V32H28V40H34V32H40V40Z', s[0]) + p('M88 40V32H94V40H100V32H106V40H112V32H118V40Z', s[1]) + p('M44 30V22H52V30H60V22H68V30H76V22H84V30Z', s[0])
    + p('M54 116V96Q64 84 74 96V116Z', '#b8894a') + line('M64 22V4', INK, 2.5) + p('M65 4L82 9L65 14Z', P.red[0]) + dot(25, 60, 4, '#b8894a') + dot(103, 60, 4, '#b8894a');
};
T.seagull = () => [64, 32, () => line('M4 22Q18 4 32 20Q46 4 60 22', '#fff', 5)];
T['flag-red'] = () => [48, 128, () => line('M8 124V6', P.grey[1], 4) + p('M10 8L46 22L10 36Z', P.red[0]) + dot(8, 6, 4, P.yellow[0])];
T['flag-blue'] = () => [48, 128, () => line('M8 124V6', P.grey[1], 4) + p('M10 8L46 22L10 36Z', P.blue[0]) + dot(8, 6, 4, P.yellow[0])];
T.bunting = () => [256, 48, () => {
  let g = line('M0 6Q128 30 256 6', '#7b8a96', 2);
  const cols = [P.red[0], P.yellow[0], P.blue[0], P.green[0], P.pink[0], P.purple[0], P.orange[0]];
  for (let k = 0; k < 9; k++) { const x = 8 + k * 28, y = 6 + 24 * (1 - Math.pow((x - 128) / 128, 2)) * 0.98; g += p(`M${f(x)} ${f(y - 2)}L${f(x + 22)} ${f(y - 1)}L${f(x + 11)} ${f(y + 24)}Z`, cols[k % cols.length]); }
  return g;
}];
T.skyline = () => [256, 128, () => {
  const b = [[0, 50, 34, P.grey[1]], [30, 30, 30, '#7fa6bd'], [56, 64, 28, P.blue[1]], [80, 20, 36, P.grey[0]], [112, 44, 24, '#7fa6bd'], [132, 10, 32, P.blue[0]], [160, 54, 30, P.grey[1]], [186, 34, 26, '#7fa6bd'], [208, 60, 22, P.blue[1]], [226, 24, 30, P.grey[0]]];
  let g = '';
  b.forEach(([x, top, w, c]) => {
    g += p(R(x, top, w, 128 - top), c);
    for (let y = top + 8; y < 120; y += 12) for (let wx = x + 5; wx < x + w - 6; wx += 9) g += p(R(wx, y, 5, 6, 1), '#e8f5fb', 'opacity=".75"');
  });
  return g;
}];
T.windpump = () => line('M52 124L64 50L76 124M56 100H72M58 80H70M60 64H68M54 112L74 88M74 112L54 88', '#7b8a96', 3.5) + rot(0, 64, 40, [...Array(12)].map((_, k) => p('M64 40L60 10H68Z', k % 2 ? '#c4d6df' : '#e2ecf1', `transform="rotate(${k * 30} 64 40)"`)).join('')) + dot(64, 40, 5, INK) + p('M70 38H100L104 32V48L100 42H70Z', P.red[0]);
T.uluru = () => [128, 56, () => split('M2 56Q8 22 30 14Q64 4 100 12Q122 20 126 56Z', ['#e0703f', '#c4582f']) + line('M30 22Q34 40 30 56M52 12Q58 34 52 56M76 10Q80 34 78 56M100 16Q100 36 104 56', '#b04c27', 3, 'opacity=".7"')];
T.crater = () => [64, 24, () => p(E(32, 12, 30, 10), '#8fa0ac') + p(E(32, 14, 24, 7), '#a9b8c2')];
T.banana = () => rot(-20, 64, 64, p('M24 40Q30 100 96 98Q104 96 100 90Q48 86 40 36Z', P.yellow[0]) + p('M24 40Q28 70 54 88Q36 64 36 38Z', P.yellow[1]) + p(R(20, 30, 14, 12, 3), P.brown[1]));
T.cloud = () => [128, 80, () => p(C(36, 48, 22) + C(64, 34, 28) + C(94, 46, 22) + R(14, 46, 104, 26, 13), '#fff') + p(R(14, 58, 104, 14, 7), '#e4eff6')];
T['weather'] = () => {
  let rays = '';
  for (let k = 0; k < 8; k++) rays += p(R(83, 8, 6, 14, 3), '#ffb02e', `transform="rotate(${k * 45} 86 42)"`);
  return rays + p(C(86, 42, 22), '#ffd84a') + p(C(40, 74, 20) + C(64, 62, 26) + C(90, 76, 18) + R(20, 72, 88, 26, 13), '#fff') + p(R(20, 84, 88, 14, 7), '#e2eaf0')
    + p(C(40, 74, 20) + C(64, 62, 26) + C(90, 76, 18) + R(20, 72, 88, 26, 13), 'none', 'stroke="#d3e0e8" stroke-width="2"')
    + [[40, 108], [62, 114], [84, 108]].map(([x, y]) => p(`M${x} ${y - 9}Q${x + 6} ${y} ${x} ${y + 4}Q${x - 6} ${y} ${x} ${y - 9}Z`, P.blue[0])).join('');
};

// ---------- write ----------
mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [name, fn] of Object.entries(T)) {
  uid = 0;
  let out = fn();
  let w = 128, h = 128;
  if (Array.isArray(out)) { [w, h] = out; out = out[2](); }
  // width and height are set so the picture has a size when drawn onto a canvas
  writeFileSync(new URL(`${name}.svg`, OUT), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}">${out}</svg>\n`);
  n++;
}
console.log(`wrote ${n} pictures to www/img/art/things/`);
