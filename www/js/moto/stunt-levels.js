// Stunt Park tracks: 20 hand-made levels as data, and the builder that turns them into a terrain polyline plus the
// objects on it. Pure data and maths (no drawing), so tools can test every level.
//
// Pieces (metres): ['flat', len], ['kick', len, height] a curved take-off ramp with a drop behind it,
// ['land', len, height] a landing ramp that starts high and curves down, ['gap', width] a pit,
// ['cars', [names]] parked cars to jump or ride over, ['table', up, top, down, height] a tabletop,
// ['hill', len, height], ['bumps', n], ['step', dy] raise or lower the ground, ['crates', n] crates to smash,
// ['cp'] checkpoint flag, ['finish'].
import { Terrain } from './bikephys.js';

// Collision boxes for the side-view car sprites: length and roof height in metres.
export const CARS = {
  sedan: [4.3, 1.9], taxi: [4.3, 2.0], van: [4.5, 2.1], truck: [4.8, 2.0], police: [4.2, 1.6],
  suv: [4.3, 2.0], firetruck: [5.5, 2.6], 'garbage-truck': [5.4, 2.4],
};

export const LEVELS = [
  { name: 'First gear', flips: 0, track: [['flat', 30], ['bumps', 4], ['flat', 12], ['hill', 16, 2], ['flat', 14], ['kick', 6, 1.2], ['flat', 22], ['cp'], ['flat', 10], ['table', 7, 8, 7, 2], ['flat', 14], ['crates', 3], ['finish']] },
  { name: 'Over the sedan', flips: 0, track: [['flat', 32], ['kick', 7, 1.8], ['flat', 2], ['cars', ['sedan']], ['flat', 3], ['land', 9, 1.4], ['flat', 10], ['cp'], ['flat', 10], ['hill', 16, 2], ['flat', 24], ['kick', 7, 1.8], ['flat', 2], ['cars', ['taxi']], ['flat', 3], ['land', 9, 1.4], ['flat', 12], ['finish']] },
  { name: 'Mind the gap', flips: 0, track: [['flat', 30], ['kick', 7, 1.6], ['gap', 7], ['land', 8, 1.2], ['flat', 10], ['cp'], ['flat', 8], ['bumps', 5], ['flat', 24], ['kick', 7, 1.8], ['gap', 9], ['land', 9, 1.4], ['flat', 14], ['crates', 4], ['finish']] },
  { name: 'Rooftop run', flips: 0, track: [['flat', 32], ['kick', 6, 1.5], ['flat', 1], ['cars', ['van', 'van']], ['flat', 1], ['land', 9, 1.6], ['flat', 8], ['cp'], ['flat', 10], ['table', 8, 10, 8, 2.4], ['flat', 26], ['kick', 7, 2], ['flat', 2], ['cars', ['sedan', 'police']], ['flat', 2], ['land', 10, 1.6], ['flat', 12], ['finish']] },
  { name: 'Up and over', flips: 1, track: [['flat', 30], ['step', 3], ['flat', 30], ['kick', 8, 2.6], ['flat', 18], ['step', -3], ['flat', 8], ['cp'], ['flat', 10], ['hill', 18, 3], ['flat', 26], ['kick', 8, 2.4], ['gap', 8], ['land', 10, 1.6], ['flat', 12], ['crates', 4], ['finish']] },
  { name: 'Bus stop', flips: 1, track: [['flat', 34], ['kick', 8, 2.4], ['flat', 2], ['cars', ['firetruck']], ['flat', 2], ['land', 11, 2], ['flat', 8], ['cp'], ['flat', 8], ['bumps', 6], ['flat', 26], ['kick', 8, 2.4], ['flat', 2], ['cars', ['garbage-truck', 'sedan']], ['flat', 2], ['land', 11, 1.8], ['flat', 12], ['finish']] },
  { name: 'Hill hop', flips: 1, track: [['flat', 26], ['hill', 16, 2], ['flat', 4], ['hill', 18, 2.5], ['flat', 4], ['hill', 20, 3], ['flat', 8], ['cp'], ['flat', 32], ['kick', 8, 2.8], ['gap', 10], ['land', 12, 2.2], ['flat', 10], ['table', 8, 6, 8, 3], ['flat', 10], ['crates', 5], ['finish']] },
  { name: 'Car park chaos', flips: 1, track: [['flat', 30], ['kick', 7, 2], ['flat', 1], ['cars', ['sedan', 'taxi']], ['flat', 1], ['land', 9, 1.8], ['flat', 26], ['kick', 7, 2], ['flat', 1], ['cars', ['suv', 'police']], ['flat', 1], ['land', 9, 1.8], ['flat', 6], ['cp'], ['flat', 30], ['kick', 8, 2.6], ['flat', 1], ['cars', ['van', 'truck']], ['flat', 1], ['land', 10, 1.8], ['flat', 12], ['finish']] },
  { name: 'Step ladder', flips: 1, track: [['flat', 28], ['step', 2], ['flat', 8], ['step', 2], ['flat', 8], ['step', 2], ['flat', 14], ['kick', 7, 2], ['flat', 18], ['step', -6], ['flat', 6], ['cp'], ['flat', 32], ['kick', 8, 2.6], ['gap', 10], ['land', 12, 2], ['flat', 12], ['finish']] },
  { name: 'Big air', flips: 2, track: [['flat', 40], ['kick', 10, 3.6], ['gap', 11], ['land', 16, 3], ['flat', 8], ['cp'], ['flat', 8], ['hill', 18, 2.5], ['flat', 30], ['kick', 10, 3.6], ['flat', 2], ['cars', ['firetruck', 'garbage-truck']], ['flat', 2], ['land', 16, 2.6], ['flat', 12], ['crates', 5], ['finish']] },
  { name: 'Whoops', flips: 1, track: [['flat', 26], ['bumps', 10], ['flat', 26], ['kick', 8, 2.4], ['gap', 9], ['land', 10, 1.8], ['flat', 8], ['cp'], ['bumps', 8], ['flat', 10], ['table', 8, 6, 8, 2.6], ['flat', 10], ['bumps', 6], ['flat', 10], ['finish']] },
  { name: 'Traffic jam', flips: 1, track: [['flat', 36], ['kick', 9, 3], ['flat', 1], ['cars', ['sedan', 'taxi', 'police']], ['flat', 1], ['land', 12, 2.2], ['flat', 8], ['cp'], ['flat', 32], ['kick', 9, 3], ['flat', 1], ['cars', ['van', 'suv', 'sedan']], ['flat', 1], ['land', 12, 2.2], ['flat', 12], ['crates', 4], ['finish']] },
  { name: 'Canyon', flips: 2, track: [['flat', 36], ['kick', 9, 3], ['gap', 11], ['land', 14, 2.6], ['flat', 8], ['cp'], ['step', 3], ['flat', 32], ['kick', 9, 2.6], ['gap', 10], ['land', 14, 2], ['flat', 10], ['step', -3], ['flat', 12], ['finish']] },
  { name: 'Roller coaster', flips: 2, track: [['flat', 26], ['hill', 18, 2.5], ['flat', 4], ['hill', 20, 3], ['flat', 26], ['kick', 8, 2.6], ['flat', 20], ['cp'], ['flat', 10], ['hill', 22, 3], ['flat', 30], ['kick', 10, 3.4], ['gap', 10], ['land', 14, 2.6], ['flat', 12], ['crates', 6], ['finish']] },
  { name: 'Double decker', flips: 2, track: [['flat', 38], ['kick', 10, 3.4], ['flat', 1], ['cars', ['firetruck', 'garbage-truck']], ['flat', 1], ['land', 14, 2.4], ['flat', 8], ['cp'], ['flat', 8], ['table', 10, 12, 10, 3], ['flat', 32], ['kick', 10, 3.4], ['gap', 10], ['land', 14, 2.4], ['flat', 12], ['finish']] },
  { name: 'Staircase', flips: 2, track: [['flat', 28], ['step', 2.5], ['flat', 7], ['step', 2.5], ['flat', 7], ['step', 2.5], ['flat', 14], ['kick', 8, 2.6], ['gap', 8], ['land', 10, 1.6], ['flat', 6], ['step', -7.5], ['flat', 6], ['cp'], ['flat', 32], ['kick', 10, 3.4], ['flat', 1], ['cars', ['sedan', 'van']], ['flat', 1], ['land', 13, 2.2], ['flat', 12], ['finish']] },
  { name: 'Leap of faith', flips: 2, track: [['flat', 46], ['kick', 12, 4.2], ['gap', 12], ['land', 18, 3.4], ['flat', 8], ['cp'], ['bumps', 4], ['flat', 32], ['kick', 12, 4.2], ['gap', 12], ['land', 18, 3.2], ['flat', 12], ['crates', 6], ['finish']] },
  { name: 'Obstacle course', flips: 2, track: [['flat', 28], ['bumps', 6], ['flat', 24], ['kick', 8, 2.6], ['flat', 1], ['cars', ['police', 'sedan']], ['flat', 1], ['land', 10, 1.8], ['flat', 6], ['cp'], ['flat', 32], ['kick', 9, 3], ['gap', 10], ['land', 12, 2.2], ['flat', 6], ['cp'], ['flat', 10], ['table', 9, 6, 9, 3], ['flat', 6], ['bumps', 6], ['flat', 10], ['finish']] },
  { name: 'Sky high', flips: 3, track: [['flat', 40], ['step', 3], ['flat', 32], ['kick', 12, 4.4], ['gap', 12], ['land', 20, 3.8], ['flat', 8], ['step', -3], ['flat', 6], ['cp'], ['flat', 32], ['kick', 12, 4.2], ['flat', 1], ['cars', ['firetruck', 'garbage-truck']], ['flat', 1], ['land', 18, 3.2], ['flat', 12], ['crates', 6], ['finish']] },
  { name: 'Grand finale', flips: 3, track: [['flat', 42], ['kick', 11, 4], ['gap', 12], ['land', 16, 3.2], ['flat', 8], ['cp'], ['flat', 32], ['kick', 10, 3.6], ['flat', 1], ['cars', ['taxi', 'police', 'sedan']], ['flat', 1], ['land', 16, 2.8], ['flat', 8], ['cp'], ['bumps', 4], ['flat', 32], ['kick', 12, 4.4], ['gap', 13], ['land', 20, 3.6], ['flat', 12], ['crates', 8], ['finish']] },
];

// Builds level i: { T (Terrain), cars, crates, cps, finish, pits, length, decor }.
export function buildLevel(i) {
  const lv = LEVELS[i];
  const T = new Terrain([[-40, 0]]);
  const cars = [], crates = [], cps = [0], pits = [], decor = [];
  let x = 0, y = 0, finish = 0;
  const P = (px, py) => T.push(px, py);
  P(0, 0);
  for (const [kind, a, b, c, d] of lv.track) {
    if (kind === 'flat') { x += a; P(x, y); }
    else if (kind === 'kick') { for (let k = 1; k <= 12; k++) { const t = k / 12; P(x + a * t, y + b * t * t); } x += a; P(x + 0.03, y); x += 0.03; }
    else if (kind === 'land') { const back = Math.max(2.5, b * 1.8); P(x + back, y + b); for (let k = 1; k <= 12; k++) { const t = k / 12; P(x + back + a * t, y + b * (1 - t) * (1 - t)); } x += a + back; } // a rideable back slope, so falling short is not a wall
    else if (kind === 'gap') { pits.push([x, x + a, y]); P(x + 0.03, y - 30); P(x + a - 0.03, y - 30); P(x + a, y); x += a; }
    else if (kind === 'cars') {
      for (const name of a) {
        const [L, H] = CARS[name] || [4.3, 1.9], box = name.includes('truck');
        const prof = box ? [[0.01, H * 0.62], [0.12, H], [0.97, H], [1, H * 0.55]] : [[0.01, H * 0.42], [0.1, H * 0.52], [0.27, H], [0.75, H], [0.88, H * 0.58], [0.99, H * 0.48]];
        for (const [u, h] of prof) P(x + L * u, y + h);
        P(x + L, y);
        cars.push({ name, x: x + L / 2, y, L, H });
        x += L + 0.25; P(x, y);
      }
    } else if (kind === 'table') { x += a; P(x, y + d); x += b; P(x, y + d); x += c; P(x, y); }
    else if (kind === 'hill') { for (let k = 1; k <= 16; k++) { const t = k / 16; P(x + a * t, y + b * Math.sin(Math.PI * t)); } x += a; }
    else if (kind === 'bumps') { for (let k = 0; k < a; k++) { for (let s = 1; s <= 6; s++) { const t = s / 6; P(x + 2.6 * t, y + 0.4 * Math.sin(Math.PI * t)); } x += 2.6; } }
    else if (kind === 'step') { const len = Math.max(6, Math.abs(a) * 3); for (let k = 1; k <= 12; k++) { const t = k / 12; P(x + len * t, y + a * (t * t * (3 - 2 * t))); } x += len; y += a; }
    else if (kind === 'crates') { for (let k = 0; k < a; k++) crates.push({ x: x + 3 + k * 1.15, y, vx: 0, vy: 0, rot: 0, vr: 0, hit: false, stack: k % 3 === 2 }); x += 6 + a * 1.15; P(x, y); }
    else if (kind === 'cp') { cps.push(x); x += 2; P(x, y); }
    else if (kind === 'finish') { x += 4; P(x, y); finish = x; x += 40; P(x, y); }
  }
  // scenery on the flat bits: grandstands, tents and cones
  for (let k = 0, dx = 18; dx < x - 20; k++, dx += 26 + (k * 13) % 17) decor.push({ x: dx, kind: ['tent', 'tree_round', 'flag_checkers', 'tree_oak', 'tyre', 'tree_pine'][k % 6] });
  // par: a brisk but fair time, checked against test rides on the slowest and fastest bikes
  return { T, cars, crates, cps, finish, pits, length: finish, decor, lv, par: Math.round(finish / 13 + 3) };
}
