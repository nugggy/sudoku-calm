// Jigsaw: drag interlocking pieces of a cartoon scene into place.
import { mulberry32 } from './sudoku-engine.js';
import { store, save, fmtTime } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';

const JG = () => store.jigsaw;
// Each scene is a list of drawing steps, painted in order onto a square (all numbers are 0..1 of the side):
//   ['sky', top, bottom]                       gradient sky
//   ['bg', file]                               a full Kenney background
//   ['layer', file, y, h, tint]                a full-width Kenney layer (hills, clouds), optionally recoloured
//   ['band', colour, y, wave, waves, phase]    ground or sea from y down, with a wavy top edge
//   ['road', y, h], ['rays'], ['stars', count, seed], ['confetti', count, seed]
//   [picture, x, bottom, height, flip]         a picture standing on (x, bottom)
// Pictures with a slash are Kenney PNGs (img/kenney/...), the rest are our SVGs (img/art/things/...).
export const SCENES = [
  { name: 'Beach', hero: 'sandcastle', draw: [
    ['sky', '#4fc0f2', '#d9f4ff'], ['layer', 'backgrounds/cloudLayer1', 0.2, 0.34, '#ffffff'],
    ['sun', 0.83, 0.3, 0.2], ['scenery/cloud1', 0.24, 0.2, 0.1], ['scenery/cloud3', 0.58, 0.14, 0.07],
    ['band', '#3fa9ea', 0.48, 0.004, 3, 0], ['lighthouse', 0.78, 0.5, 0.2], ['band', '#5cbdf2', 0.56, 0.006, 4, 1], ['sailboat', 0.44, 0.62, 0.15],
    ['seagull', 0.38, 0.27, 0.03], ['seagull', 0.47, 0.32, 0.025], ['seagull', 0.64, 0.22, 0.03],
    ['band', '#f7e2a8', 0.7, 0.012, 1.5, 2], ['band', '#f0d48e', 0.9, 0.01, 2, 0],
    ['scenery/treePalm', 0.13, 0.86, 0.44], ['scenery/treePalm', 0.93, 0.8, 0.3, 1], ['beach-umbrella', 0.64, 0.86, 0.24],
    ['sandcastle', 0.36, 0.9, 0.17], ['beach-ball', 0.84, 0.94, 0.09], ['crab', 0.6, 0.99, 0.1], ['shell', 0.18, 0.97, 0.07], ['starfish', 0.45, 0.99, 0.08], ['shell', 0.94, 0.99, 0.05],
  ] },
  { name: 'Farm', hero: 'barn', draw: [
    ['sky', '#69c6f5', '#e6f7ff'], ['sun', 0.86, 0.26, 0.18], ['scenery/cloud2', 0.2, 0.18, 0.1], ['scenery/cloud4', 0.6, 0.12, 0.07],
    ['layer', 'backgrounds/hillsLarge', 0.3, 0.4, '#9ad97a'], ['layer', 'backgrounds/hills', 0.4, 0.34, '#7cc85e'], ['band', '#68bd48', 0.64, 0.01, 1, 1],
    ['scenery/treeLong', 0.05, 0.66, 0.3], ['barn', 0.25, 0.66, 0.3], ['scenery/tree', 0.5, 0.63, 0.24], ['haybale', 0.46, 0.72, 0.08], ['tractor', 0.79, 0.73, 0.21],
    ['animals/cow', 0.18, 0.86, 0.17], ['animals/pig', 0.42, 0.87, 0.14], ['animals/horse', 0.64, 0.85, 0.17], ['animals/chicken', 0.86, 0.87, 0.13],
    ['scenery/fence', 0.08, 0.93, 0.12], ['scenery/fence', 0.24, 0.93, 0.12], ['scenery/fence', 0.4, 0.93, 0.12], ['scenery/fence', 0.56, 0.93, 0.12], ['scenery/fence', 0.72, 0.93, 0.12], ['scenery/fence', 0.88, 0.93, 0.12],
    ['band', '#58ad3a', 0.91, 0.008, 2, 0], ['sunflower', 0.05, 1.01, 0.16], ['animals/chick', 0.36, 0.995, 0.07], ['animals/duck', 0.56, 0.995, 0.08], ['sunflower', 0.95, 1.01, 0.13],
  ] },
  { name: 'Space', hero: 'rocket', draw: [
    ['sky', '#120c38', '#43308f'], ['stars', 110, 7], ['scenery/moonFull', 0.52, 0.22, 0.12], ['globe', 0.2, 0.36, 0.22], ['planet', 0.76, 0.44, 0.32], ['planet-red', 0.6, 0.6, 0.09],
    ['comet', 0.2, 0.62, 0.15], ['star', 0.64, 0.1, 0.05], ['star', 0.93, 0.13, 0.05], ['star', 0.07, 0.12, 0.04], ['star', 0.37, 0.48, 0.04], ['star', 0.93, 0.62, 0.04],
    ['band', '#a9b8c2', 0.8, 0.02, 1.5, 0], ['crater', 0.16, 0.9, 0.04], ['crater', 0.62, 0.97, 0.05], ['crater', 0.88, 0.88, 0.03], ['crater', 0.4, 0.86, 0.025],
    ['rocket', 0.42, 0.78, 0.34], ['ufo', 0.78, 0.68, 0.2],
  ] },
  { name: 'Ocean', hero: 'octopus', draw: [
    ['sky', '#6fd8f7', '#1f6fc2'], ['rays'], ['animals/whale', 0.66, 0.5, 0.3], ['fish', 0.2, 0.4, 0.12], ['fish-blue', 0.86, 0.72, 0.1, 1], ['fish', 0.44, 0.24, 0.07, 1],
    ['animals/narwhal', 0.15, 0.66, 0.14], ['bubbles', 0.36, 0.56, 0.16], ['bubbles', 0.92, 0.4, 0.14], ['turtle', 0.5, 0.78, 0.16],
    ['band', '#f3d9a4', 0.84, 0.02, 1.5, 1], ['seaweed', 0.05, 0.96, 0.28], ['seaweed', 0.95, 0.94, 0.24], ['seaweed', 0.42, 0.97, 0.16],
    ['octopus', 0.24, 0.94, 0.22], ['coral', 0.64, 0.97, 0.2], ['coral', 0.85, 0.99, 0.13], ['crab', 0.76, 1, 0.08], ['shell', 0.5, 0.99, 0.06], ['starfish', 0.36, 0.995, 0.07],
  ] },
  { name: 'Forest', hero: 'fox', draw: [
    ['bg', 'backgrounds/backgroundColorForest'], ['sun', 0.86, 0.2, 0.15], ['scenery/cloud1', 0.3, 0.14, 0.08],
    ['scenery/treePine', 0.08, 0.82, 0.44], ['scenery/treeLong', 0.72, 0.7, 0.3], ['scenery/tree', 0.9, 0.82, 0.4], ['animals/owl', 0.9, 0.56, 0.09],
    ['tent', 0.48, 0.72, 0.2], ['campfire', 0.67, 0.8, 0.1], ['fox', 0.3, 0.92, 0.22],
    ['animals/bear', 0.52, 0.93, 0.12], ['scenery/bush1', 0.52, 0.98, 0.08], ['animals/rabbit', 0.08, 0.97, 0.14], ['scenery/bush3', 0.12, 1.01, 0.09],
    ['hedgehog', 0.82, 0.98, 0.12], ['mushroom', 0.66, 0.97, 0.08], ['mushroom', 0.71, 0.99, 0.05], ['scenery/bushOrange4', 0.96, 1.01, 0.06],
  ] },
  { name: 'Castle', hero: 'hot-air-balloon', draw: [
    ['bg', 'backgrounds/backgroundCastles'], ['sun', 0.12, 0.2, 0.14], ['hot-air-balloon', 0.86, 0.32, 0.18], ['scenery/cloud4', 0.5, 0.14, 0.07],
    ['layer', 'backgrounds/hills', 0.5, 0.28, '#9ad97a'], ['band', '#74c652', 0.7, 0.008, 1, 0],
    ['scenery/castleWall', 0.31, 0.74, 0.13], ['scenery/castleWall', 0.69, 0.74, 0.13], ['scenery/tower', 0.2, 0.75, 0.38], ['scenery/towerAlt', 0.8, 0.75, 0.38],
    ['flag-red', 0.2, 0.42, 0.1], ['flag-blue', 0.8, 0.42, 0.1], ['scenery/castleSmall', 0.5, 0.75, 0.3], ['flag-red', 0.5, 0.48, 0.1],
    ['band', '#4fb2ea', 0.75, 0.004, 3, 0], ['band', '#6cbf4c', 0.81, 0.01, 2, 1],
    ['scenery/treePine', 0.06, 0.92, 0.3], ['scenery/tree', 0.94, 0.94, 0.28], ['animals/horse', 0.62, 0.96, 0.14], ['scenery/bush1', 0.64, 1.01, 0.08],
    ['scenery/houseSmallAlt2', 0.32, 0.96, 0.12], ['scenery/bush2', 0.45, 1, 0.06], ['scenery/fence', 0.8, 1, 0.08],
  ] },
  { name: 'Garden', hero: 'flower-pink', draw: [
    ['bg', 'backgrounds/backgroundColorGrass'], ['sun', 0.86, 0.18, 0.14], ['rainbow', 0.3, 0.42, 0.18],
    ['scenery/house2', 0.74, 0.66, 0.24], ['scenery/bush1', 0.46, 0.68, 0.07],
    ['scenery/fence', 0.08, 0.8, 0.13], ['scenery/fence', 0.25, 0.8, 0.13], ['scenery/fence', 0.42, 0.8, 0.13], ['scenery/fence', 0.59, 0.8, 0.13], ['scenery/fence', 0.76, 0.8, 0.13], ['scenery/fence', 0.93, 0.8, 0.13],
    ['butterfly', 0.58, 0.38, 0.12], ['bee', 0.36, 0.52, 0.08], ['butterfly', 0.12, 0.28, 0.08],
    ['sunflower', 0.12, 0.94, 0.38], ['tulip', 0.33, 0.96, 0.2], ['daisy', 0.48, 0.97, 0.18], ['flower-pink', 0.63, 0.96, 0.22], ['daisy', 0.77, 0.99, 0.15], ['tulip', 0.9, 0.98, 0.17],
    ['ladybird', 0.4, 0.995, 0.05], ['snail', 0.24, 0.995, 0.08], ['mushroom', 0.56, 0.995, 0.05],
  ] },
  { name: 'Winter', hero: 'snowman', draw: [
    ['sky', '#5aa9e8', '#cfe7fa'], ['scenery/cloud2', 0.7, 0.16, 0.08], ['scenery/cloud5', 0.22, 0.24, 0.06], ['scenery/moon', 0.12, 0.14, 0.07],
    ['layer', 'backgrounds/mountains', 0.34, 0.3, '#e3f0fa'], ['layer', 'backgrounds/hillsLarge', 0.44, 0.26, '#c9e1f3'],
    ['band', '#e8f2fa', 0.64, 0.015, 1.5, 0], ['scenery/houseSmall2', 0.5, 0.66, 0.1], ['scenery/treePineFrozen', 0.64, 0.66, 0.2],
    ['scenery/treePineSnow', 0.12, 0.74, 0.36], ['scenery/treeSnow', 0.88, 0.72, 0.34], ['igloo', 0.7, 0.86, 0.2], ['snowman', 0.34, 0.88, 0.3],
    ['animals/penguin', 0.54, 0.97, 0.13], ['animals/penguin', 0.9, 0.98, 0.11, 1], ['animals/walrus', 0.08, 0.98, 0.12], ['band', '#f6fafd', 0.92, 0.01, 2, 2],
    ['snowflake', 0.1, 0.2, 0.06], ['snowflake', 0.42, 0.14, 0.05], ['snowflake', 0.92, 0.3, 0.05], ['snowflake', 0.6, 0.36, 0.04], ['snowflake', 0.26, 0.44, 0.04], ['snowflake', 0.76, 0.5, 0.035],
  ] },
  { name: 'Outback', hero: 'kangaroo', draw: [
    ['sky', '#ff9450', '#ffe3b8'], ['sun', 0.2, 0.32, 0.2], ['scenery/cloud3', 0.72, 0.15, 0.07], ['layer', 'backgrounds/mountains', 0.44, 0.2, '#eba070'],
    ['uluru', 0.62, 0.66, 0.16], ['band', '#d9733f', 0.64, 0.01, 1, 0],
    ['scenery/treeLong', 0.09, 0.72, 0.32], ['windpump', 0.9, 0.7, 0.26], ['scenery/bushOrange1', 0.42, 0.72, 0.06], ['kangaroo', 0.74, 0.82, 0.16, 1],
    ['band', '#c9622f', 0.86, 0.01, 2, 1], ['kangaroo', 0.4, 0.97, 0.32], ['koala', 0.12, 0.98, 0.18], ['scenery/bushOrange2', 0.84, 0.99, 0.09], ['scenery/bushOrange3', 0.64, 1, 0.07],
  ] },
  { name: 'Party', hero: 'cake', draw: [
    ['sky', '#ffc9e6', '#fff1c2'], ['confetti', 70, 3], ['bunting', 0.5, 0.16, 0.14], ['bunting', 0.5, 0.3, 0.1],
    ['balloon-red', 0.1, 0.56, 0.24], ['balloon-blue', 0.24, 0.48, 0.2], ['balloon-yellow', 0.78, 0.5, 0.22], ['balloon-green', 0.91, 0.44, 0.2], ['balloon-purple', 0.6, 0.38, 0.14],
    ['band', '#c98b5a', 0.74, 0, 1, 0], ['band', '#a8703f', 0.78, 0, 1, 0], ['band', '#f7d6e6', 0.86, 0, 1, 0],
    ['gift-blue', 0.13, 0.75, 0.16], ['cupcake', 0.31, 0.75, 0.12], ['cake', 0.5, 0.76, 0.3], ['cupcake', 0.69, 0.75, 0.12], ['gift-red', 0.86, 0.75, 0.14],
    ['animals/bear', 0.2, 0.99, 0.15], ['party-hat', 0.2, 0.86, 0.08], ['gift-green', 0.5, 0.99, 0.11], ['animals/rabbit', 0.8, 0.99, 0.17],
  ] },
  { name: 'Jungle', hero: 'animals/parrot', draw: [
    ['sky', '#83e0c4', '#f1fbdc'], ['sun', 0.5, 0.22, 0.14], ['layer', 'backgrounds/hillsLarge', 0.36, 0.36, '#6fcf7a'], ['layer', 'backgrounds/hills', 0.5, 0.3, '#45ad5e'], ['band', '#2f9a50', 0.74, 0.01, 1, 0],
    ['scenery/treePalm', 0.1, 0.8, 0.46], ['scenery/treePalm', 0.9, 0.78, 0.42, 1], ['animals/parrot', 0.15, 0.36, 0.1], ['animals/monkey', 0.86, 0.42, 0.1], ['butterfly', 0.46, 0.44, 0.07],
    ['animals/elephant', 0.32, 0.8, 0.18], ['animals/giraffe', 0.62, 0.74, 0.2], ['scenery/bushAlt1', 0.32, 0.85, 0.1], ['scenery/bush1', 0.62, 0.85, 0.1],
    ['animals/gorilla', 0.16, 0.97, 0.15], ['animals/zebra', 0.48, 0.98, 0.15], ['animals/crocodile', 0.82, 0.99, 0.13],
    ['scenery/bushAlt1', 0.3, 1.03, 0.09], ['scenery/bush4', 0.66, 1.02, 0.09], ['scenery/bush1', 0.92, 1.03, 0.09], ['banana', 0.97, 0.6, 0.07],
  ] },
  { name: 'City', hero: 'ferris-wheel', draw: [
    ['sky', '#7fcdfb', '#eaf7ff'], ['sun', 0.14, 0.2, 0.14], ['scenery/cloud1', 0.48, 0.14, 0.08], ['hot-air-balloon', 0.56, 0.38, 0.13],
    ['skyline', 0.28, 0.66, 0.3], ['skyline', 0.72, 0.66, 0.26, 1], ['ferris-wheel', 0.82, 0.72, 0.42], ['band', '#8fd16a', 0.65, 0, 1, 0],
    ['scenery/house1', 0.13, 0.75, 0.2], ['scenery/treeSmall_green3', 0.28, 0.75, 0.1], ['scenery/houseAlt2', 0.44, 0.75, 0.17], ['scenery/treeSmall_green2', 0.6, 0.75, 0.11],
    ['road', 0.75, 0.15], ['bus', 0.3, 0.88, 0.17], ['taxi', 0.68, 0.9, 0.12], ['band', '#c9d4db', 0.89, 0, 1, 0],
    ['bicycle', 0.12, 0.995, 0.1], ['car-red', 0.9, 0.85, 0.09, 1], ['balloon-red', 0.5, 0.99, 0.1], ['balloon-yellow', 0.55, 0.985, 0.09], ['scenery/treeSmall_green1', 0.76, 0.99, 0.09],
  ] },
];
const OPS = new Set(['sky', 'bg', 'layer', 'band', 'road', 'rays', 'stars', 'confetti']);
const picSrc = (n) => (n.includes('/') ? `img/kenney/${n}.png` : `img/art/things/${n}.svg`);
export const sceneHero = (scene) => picSrc(scene.hero);

export const sizeFor = (level) => Math.min(7, 3 + Math.floor(level / SCENES.length));
export const sceneFor = (level) => SCENES[level % SCENES.length];

export const jigsawHelp = () => helpSheet('How to play Jigsaw', [
  'Drag pieces from the tray onto the board. When a piece is close to its spot it clicks into place.',
  'Tap the grid button at the top to see a faint copy of the picture on the board.',
  'Each new round of pictures has more pieces, from 9 up to 49.',
], 'jig-btn');

const imgCache = new Map();
function loadImg(src) { if (!imgCache.has(src)) imgCache.set(src, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; })); return imgCache.get(src); }

// Paints a scene onto a canvas S wide and H tall (device pixels). Heights of pictures and layers scale with S, positions down the page with H.
export async function paintScene(scene, S, H = S) {
  const c = document.createElement('canvas'); c.width = S; c.height = H;
  const ctx = c.getContext('2d');
  const files = scene.draw.map((d) => (d[0] === 'bg' || d[0] === 'layer' ? picSrc(d[1]) : OPS.has(d[0]) ? null : picSrc(d[0])));
  const imgs = await Promise.all(files.map((src) => src && loadImg(src)));
  scene.draw.forEach((d, k) => {
    const op = d[0], im = imgs[k];
    if (op === 'sky') { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, d[1]); g.addColorStop(1, d[2]); ctx.fillStyle = g; ctx.fillRect(0, 0, S, H); }
    else if (op === 'bg') { if (im) ctx.drawImage(im, 0, H - S, S, S); }
    else if (op === 'layer') {
      if (!im) return;
      const [, , y, h, tint] = d, hh = Math.max(1, Math.round(h * S));
      if (!tint) { ctx.drawImage(im, 0, y * H, S, hh); return; }
      const t = document.createElement('canvas'); t.width = S; t.height = hh; // recolour the pale Kenney layer
      const tc = t.getContext('2d'); tc.drawImage(im, 0, 0, S, hh); tc.globalCompositeOperation = 'source-in'; tc.fillStyle = tint; tc.fillRect(0, 0, S, hh);
      ctx.drawImage(t, 0, y * H);
    } else if (op === 'band') {
      const [, col, y, amp, waves, ph] = d;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
      for (let i = 0; i <= 48; i++) { const t = i / 48; ctx.lineTo(t * S, (y + amp * Math.sin(t * waves * Math.PI * 2 + ph)) * H); }
      ctx.lineTo(S, H); ctx.fill();
    } else if (op === 'road') {
      const [, y, h] = d;
      ctx.fillStyle = '#6f7d88'; ctx.fillRect(0, y * H, S, h * H);
      ctx.fillStyle = '#5d6a74'; ctx.fillRect(0, y * H, S, h * H * 0.12);
      ctx.fillStyle = '#ffffff'; for (let x = 0.02; x < 1; x += 0.12) ctx.fillRect(x * S, (y + h * 0.5) * H, 0.06 * S, 0.012 * S);
    } else if (op === 'rays') {
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      [[0.1, 0.2, -0.1, 0.15], [0.38, 0.46, 0.3, 0.55], [0.62, 0.72, 0.66, 0.92], [0.86, 0.92, 1.0, 1.2]].forEach(([a, b, l, r]) => { ctx.beginPath(); ctx.moveTo(a * S, 0); ctx.lineTo(b * S, 0); ctx.lineTo(r * S, 0.85 * H); ctx.lineTo(l * S, 0.85 * H); ctx.fill(); });
    } else if (op === 'stars' || op === 'confetti') {
      const rng = mulberry32(d[2]), stars = op === 'stars';
      const cols = stars ? ['#ffffff', '#fff4c2', '#cfd8ff'] : ['#e8505b', '#ffcf3f', '#4aa8e0', '#3fc380', '#9b7be0', '#f7953f'];
      for (let i = 0; i < d[1]; i++) {
        const x = rng() * S, y = rng() * H * (stars ? 0.85 : 0.7), r = (stars ? 0.002 + rng() * 0.004 : 0.004 + rng() * 0.004) * S;
        ctx.fillStyle = cols[(rng() * cols.length) | 0];
        if (stars) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.save(); ctx.translate(x, y); ctx.rotate(rng() * Math.PI); ctx.fillRect(-r, -r * 0.45, r * 2, r * 0.9); ctx.restore(); }
      }
    } else if (im) {
      const [, x, y, h, flip] = d, hh = h * S, ww = (hh * im.naturalWidth) / im.naturalHeight;
      ctx.save(); ctx.translate(x * S, y * H); if (flip) ctx.scale(-1, 1);
      ctx.drawImage(im, -ww / 2, -hh, ww, hh); ctx.restore();
    }
  });
  return c;
}

// Jigsaw edge: a classic tab drawn along the edge from (x0,y0) to (x1,y1); dir is +1 (out) or -1 (in), 0 for flat.
function edge(p, x0, y0, x1, y1, dir) {
  if (!dir) { p.lineTo(x1, y1); return; }
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy * dir, ny = ux * dir; // normal pointing out of the piece when dir = 1
  const P = (a, b) => [x0 + ux * a * len + nx * b * len, y0 + uy * a * len + ny * b * len];
  const pts = [[0.35, 0], [0.38, -0.02], [0.36, 0.18], [0.5, 0.22], [0.64, 0.18], [0.62, -0.02], [0.65, 0]];
  p.lineTo(...P(...pts[0]));
  p.bezierCurveTo(...P(...pts[1]), ...P(...pts[2]), ...P(...pts[3]));
  p.bezierCurveTo(...P(...pts[4]), ...P(...pts[5]), ...P(...pts[6]));
  p.lineTo(x1, y1);
}

export function jigsawHomeScreen(app) {
  return levelHome({
    app, cls: 'jig-theme', title: 'Jigsaw', help: jigsawHelp,
    hero: '<div class="jig-hero"><img src="img/art/ui/puzzle-piece.svg" alt=""></div>',
    play: () => ({ label: `Play puzzle ${JG().level + 1}`, sub: `${sceneFor(JG().level).name} · ${sizeFor(JG().level) ** 2} pieces` }),
    onPlay: () => app.go('jiggame', { level: JG().level }),
    levels: () => ({ heading: 'Pictures', count: Math.max(SCENES.length * 2, Math.ceil((JG().level + 12) / 12) * 12), current: JG().level, done: (i) => i < JG().level, label: (i) => `<span class="jl">${sizeFor(i) ** 2}</span>${i + 1}` }),
    onLevel: (i) => app.go('jiggame', { level: i }),
  });
}

export function jigsawGameScreen(app, { level }) {
  const jg = JG();
  const scene = sceneFor(level), n = sizeFor(level);
  const root = el(`<section class="screen jig-theme jig-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${scene.name}</div><span class="cross-time" data-el="count"></span>
      <button class="icon-btn" data-act="ghost" aria-label="Show picture">${icon.grid}</button></header>
    <div class="jig-play" data-el="play"><div class="jig-board" data-el="board"><canvas class="jig-ghost" data-el="ghost"></canvas></div><div class="jig-tray" data-el="tray"></div></div>
    <div class="jig-bar"><button class="sort-boost hint-btn" data-act="hint" aria-label="Hint"><img src="img/art/ui/light-bulb.svg" alt=""></button></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let S, cell, pieces = [], placed, done = false, start = Date.now();
  const rng = mulberry32(1234 + level * 99);
  const TRAY_SCALE = 0.62;

  async function build() {
    const play = q('play').getBoundingClientRect();
    S = Math.floor(Math.min(play.width - 20, (play.height - 20) * 0.62, 520));
    cell = S / n;
    const board = q('board');
    board.style.width = board.style.height = S + 'px';
    const dpr = window.devicePixelRatio || 1;
    const pic = await paintScene(scene, Math.round(S * dpr));
    const ghost = q('ghost'); ghost.width = ghost.height = pic.width; ghost.style.width = ghost.style.height = S + 'px';
    ghost.getContext('2d').drawImage(pic, 0, 0);
    ghost.classList.toggle('on', !!jg.ghost);
    // random tab directions for inside edges
    const hEdge = [...Array(n)].map(() => [...Array(n + 1)].map((_, k) => (k === 0 || k === n ? 0 : rng() < 0.5 ? 1 : -1)));
    const vEdge = [...Array(n + 1)].map((_, k) => [...Array(n)].map(() => (k === 0 || k === n ? 0 : rng() < 0.5 ? 1 : -1)));
    const pad = cell * 0.25;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const cv = document.createElement('canvas');
      const w = cell + pad * 2;
      cv.width = cv.height = Math.ceil(w * dpr);
      cv.style.width = cv.style.height = w + 'px';
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      const p = new Path2D();
      const x0 = pad, y0 = pad, x1 = pad + cell, y1 = pad + cell;
      p.moveTo(x0, y0);
      edge(p, x0, y0, x1, y0, -vEdge[r][c] || 0);          // top: the edge belongs to the row above, flipped
      edge(p, x1, y0, x1, y1, hEdge[r][c + 1]);             // right
      edge(p, x1, y1, x0, y1, vEdge[r + 1][c]);             // bottom
      edge(p, x0, y1, x0, y0, -hEdge[r][c] || 0);           // left
      p.closePath();
      ctx.save(); ctx.clip(p);
      ctx.drawImage(pic, (c * cell - pad) * dpr, (r * cell - pad) * dpr, w * dpr, w * dpr, 0, 0, w, w);
      ctx.restore();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke(p);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.translate(0.8, 0.8); ctx.stroke(p);
      const wrap = el('<div class="jig-piece"></div>');
      wrap.appendChild(cv);
      wrap.dataset.k = r * n + c;
      pieces.push({ k: r * n + c, r, c, el: wrap, w, pad });
    }
    layoutPieces();
  }

  function layoutPieces() {
    const board = q('board'), tray = q('tray');
    const play = q('play');
    pieces.forEach((pc) => {
      if (placed.has(pc.k)) {
        board.appendChild(pc.el);
        Object.assign(pc.el.style, { left: pc.c * cell - pc.pad + 'px', top: pc.r * cell - pc.pad + 'px', transform: 'none' });
        pc.el.classList.add('locked');
      }
    });
    // shuffle the rest into the tray
    const loose = pieces.filter((pc) => !placed.has(pc.k)).sort(() => rng() - 0.5);
    const tr = tray.getBoundingClientRect(), pr = play.getBoundingClientRect();
    const sw = pieces[0].w * TRAY_SCALE;
    const cols = Math.max(1, Math.floor((tr.width - 10) / (sw * 0.78)));
    loose.forEach((pc, i) => {
      play.appendChild(pc.el);
      const col = i % cols, row = Math.floor(i / cols);
      pc.x = tr.left - pr.left + 6 + col * sw * 0.78 + (rng() - 0.5) * 6;
      pc.y = tr.top - pr.top + 6 + (row % Math.max(1, Math.floor((tr.height - sw) / (sw * 0.55)) + 1)) * sw * 0.55 + (rng() - 0.5) * 6;
      Object.assign(pc.el.style, { left: pc.x + 'px', top: pc.y + 'px', transform: `scale(${TRAY_SCALE})`, transformOrigin: '0 0' });
      pc.el.style.zIndex = 10 + i;
    });
    q('count').textContent = `${placed.size}/${n * n}`;
  }

  // ---------- Drag ----------
  let drag = null, z = 1000;
  const play = q('play');
  play.addEventListener('pointerdown', (e) => {
    const pe = e.target.closest('.jig-piece'); if (!pe || pe.classList.contains('locked') || done) return;
    const pc = pieces.find((p) => p.k === +pe.dataset.k);
    play.setPointerCapture(e.pointerId);
    const pr = play.getBoundingClientRect();
    // lift to full size under the finger
    const rect = pe.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    pe.style.transform = 'scale(1)'; pe.style.zIndex = ++z; pe.classList.add('dragging');
    drag = { pc, fx, fy, pr };
    move(e);
    sfx.tap();
  });
  function move(e) {
    const { pc, fx, fy, pr } = drag;
    pc.x = e.clientX - pr.left - fx * pc.w; pc.y = e.clientY - pr.top - fy * pc.w - 30;
    pc.el.style.left = pc.x + 'px'; pc.el.style.top = pc.y + 'px';
  }
  play.addEventListener('pointermove', (e) => { if (drag) move(e); });
  const end = () => {
    if (!drag) return;
    const { pc, pr } = drag; drag = null;
    pc.el.classList.remove('dragging');
    const br = q('board').getBoundingClientRect();
    const tx = br.left - pr.left + pc.c * cell - pc.pad, ty = br.top - pr.top + pc.r * cell - pc.pad;
    if (Math.hypot(pc.x - tx, pc.y - ty) < cell * 0.32) snap(pc);
    else if (pc.y > br.bottom - pr.top - 10) { pc.el.style.transform = `scale(${TRAY_SCALE})`; } // dropped back in the tray
  };
  play.addEventListener('pointerup', end);
  play.addEventListener('pointercancel', end);

  function snap(pc) {
    placed.add(pc.k);
    q('board').appendChild(pc.el);
    Object.assign(pc.el.style, { left: pc.c * cell - pc.pad + 'px', top: pc.r * cell - pc.pad + 'px', transform: 'none', zIndex: 1 });
    pc.el.classList.add('locked', 'snap');
    sfx.place(); buzz(12);
    jg.current = { level, placed: [...placed] }; save();
    q('count').textContent = `${placed.size}/${n * n}`;
    if (placed.size === n * n) win();
  }

  async function win() {
    done = true;
    if (level >= jg.level) jg.level = level + 1;
    jg.current = null; save(true);
    q('board').classList.add('complete');
    sfx.win(); confetti(3000);
    await new Promise((r) => setTimeout(r, 1100));
    const v = await dialog({ hero: sceneHero(scene), title: 'Picture complete!', dismissible: false, text: `${scene.name}, ${n * n} pieces in ${fmtTime((Date.now() - start) / 1000)}`, buttons: [{ label: 'Next puzzle', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }] });
    if (v === 'next') app.replace('jiggame', { level: level + 1 }); else app.back();
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'ghost') { jg.ghost = !jg.ghost; save(); q('ghost').classList.toggle('on', jg.ghost); sfx.tap(); }
    else if (a === 'hint' && !done) { const pc = pieces.find((p) => !placed.has(p.k)); if (pc) { sfx.hint(); snap(pc); } }
  });

  placed = new Set(jg.current && jg.current.level === level ? jg.current.placed : []);
  requestAnimationFrame(() => { build(); if (!jg.seenHelp) { jg.seenHelp = true; save(); setTimeout(jigsawHelp, 300); } });
  return { root };
}
