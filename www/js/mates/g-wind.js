// Updraft: hold the action button to open an umbrella. You fall slowly and drift a long way, and wind columns
// lift you high. Some fans only blow while a plate is held down or a lever is on (wind tiles carry a gate key).
import { drawPlayer as paintPlayer, roundRect, COLOURS, DARK, plateColour } from './draw.js';

const LIFT = 78, WEAK = 6, RISE = 7, FLOAT = 0.12;
// w blows all the time; f, g and h blow while plate u, plate i or lever j is on
const windTile = (key) => ({ kind: 'wind', key, draw: drawWind });
const blowing = (w, t) => t && t.kind === 'wind' && (!t.key || !!w.open[t.key]);
// the lift reaches a tile above the top of a column, so you float clear of a ledge level with the top
const inWind = (w, p) => w.cells(p.x + 0.1, p.y, p.w - 0.2, p.h + 1).some(([c, r]) => blowing(w, w.tile(c, r)));

function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function drawWind(g, c, r, w, cam, t) {
  const tl = w.tile(c, r), on = blowing(w, tl);
  if (tl.key) { g.fillStyle = plateColour(tl.key); g.globalAlpha = on ? 0.1 : 0.05; g.fillRect(c, r, 1, 1); }
  g.strokeStyle = '#fff'; g.lineWidth = 0.05; g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const x = c + 0.2 + k * 0.3 + Math.sin(t * 2 + r + k) * 0.05;
    const y = r + 1 - ((t * (on ? 2.2 : 0) + hash(c * 3 + k, r)) % 1) * 1.3;
    g.globalAlpha = on ? 0.38 : 0.1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (on ? 0.35 : 0.12)); g.stroke();
  }
  g.globalAlpha = 1; g.lineCap = 'butt';
  // a fan sits at the foot of each column
  if (w.solidAt(c, r + 1, null)) {
    g.fillStyle = '#5b6678'; roundRect(g, c + 0.05, r + 0.78, 0.9, 0.22, 0.06); g.fill();
    const a = on ? t * 14 : 0.3;
    g.fillStyle = tl.key ? plateColour(tl.key) : '#c7d2e2';
    for (let k = 0; k < 3; k++) { const s = Math.cos(a + k * 2.1); g.fillRect(c + 0.5 + s * 0.3 - 0.07, r + 0.8, 0.14, 0.08); }
  }
}

function drawUmbrella(g, p, t) {
  const cx = p.x + p.w / 2, top = p.y - 0.62, sway = Math.sin(t * 3 + p.id) * 0.04;
  g.strokeStyle = '#4a3b2a'; g.lineWidth = 0.06;
  g.beginPath(); g.moveTo(cx + sway, top); g.lineTo(cx + p.face * 0.22, p.y + 0.3); g.stroke();
  g.fillStyle = COLOURS[p.id];
  g.beginPath(); g.moveTo(cx - 0.72 + sway, top + 0.18);
  g.quadraticCurveTo(cx + sway, top - 0.6, cx + 0.72 + sway, top + 0.18);
  for (let k = 3; k >= 0; k--) g.quadraticCurveTo(cx - 0.72 + sway + (k + 0.5) * 0.36, top + 0.02, cx - 0.72 + sway + k * 0.36, top + 0.18);
  g.fill();
  g.fillStyle = DARK[p.id]; g.globalAlpha = 0.35;
  g.beginPath(); g.moveTo(cx + sway, top - 0.3); g.lineTo(cx + sway - 0.18, top + 0.12); g.lineTo(cx + sway + 0.18, top + 0.12); g.fill();
  g.globalAlpha = 1;
}

export default {
  id: 'wind', name: 'Updraft', blurb: 'Open your umbrellas and ride the wind', actLabel: 'Umbrella',
  how: [
    'Hold Umbrella to open it. You fall slowly and can drift a long way, so jump first and glide over gaps.',
    'Wind columns blow you up high, but only with your umbrella open. Float off the top onto a ledge.',
    'Some fans only blow while a plate is held down or a lever is on. Take turns: one holds the fan on while the other rides up.',
  ],
  theme: { sky: ['#9fd8ff', '#f0f9ff'], hills: ['#bfe3c0', '#94cf98'], deco: 'clouds' },
  tiles: { w: windTile(null), f: windTile('u'), g: windTile('i'), h: windTile('j') },
  // gliding crosses long pits, so the reach check may treat water and spikes as somewhere to be
  reach: { extraUp: 4, gap: 9, floor: (w, c, r) => !!w.tile(c, r)?.hazard },
  setup(w) { w.players.forEach((p) => { p.umb = false; }); },
  control(w, p, dt) {
    if (p.in.act && !p.umb) w.emit('umbrella', p.x + p.w / 2, p.y, p);
    p.umb = !!p.in.act;
    if (p.vy > -RISE && inWind(w, p)) p.vy = Math.max(-RISE, p.vy - (p.umb ? LIFT : WEAK) * dt);
    p.fallK = p.umb ? FLOAT : 1;
  },
  onRespawn(w, p) { p.umb = false; },
  drawPlayer(g, p, t) { paintPlayer(g, p, t); if (p.umb && !p.dead) drawUmbrella(g, p, t); },
  sound(e, snd) { if (e.k === 'umbrella') snd.flap(); },
  tests(assert, { makeWorld, simulate }) {
    const feet = (p) => p.y + p.h;
    // a long drop: the umbrella falls much more slowly
    const drop = { rows: ['1.2', ...Array(14).fill('...'), '###'] };
    let w = makeWorld(drop, this);
    simulate(w, 1, [{ act: true }, {}]);
    const slow = feet(w.players[0]), fast = feet(w.players[1]);
    assert(slow < 5 && fast > 12, `wind: the umbrella slows a fall (${slow.toFixed(1)} against ${fast.toFixed(1)})`);
    // a wind column lifts an umbrella but hardly moves a closed one
    const col = { rows: ['......', '......', '......', '......', '......', '..w...', '..w...', '..w...', '..1...', '..w..2', '######'] };
    w = makeWorld(col, this);
    simulate(w, 1.5);
    assert(feet(w.players[0]) > 9.9, 'wind: without the umbrella you stay on the ground');
    simulate(w, 2, [{ act: true }, {}]);
    assert(feet(w.players[0]) < 5, `wind: the column lifts an open umbrella (feet at ${feet(w.players[0]).toFixed(1)})`);
    // a fan on a plate only blows while someone stands on the plate
    const fan = { rows: ['......', '......', '..f...', '..f...', '..1...', '..f.u2', '######'] };
    w = makeWorld(fan, this);
    simulate(w, 1, [{ act: true }, {}]);
    assert(feet(w.players[0]) > 5.9, 'wind: a fan stays off with nobody on its plate');
    simulate(w, 0.15, [{ act: true }, { x: -1 }]);
    simulate(w, 1.5, [{ act: true }, {}]);
    assert(w.open.u && feet(w.players[0]) < 3, 'wind: standing on the plate turns the fan on');
  },
  levels: [
    { name: 'Brolly up', tip: 'Jump, then hold Umbrella to glide', rows: [
      '.',
      '.',
      '.',
      '....................................oo....EE',
      '....................................ww....EE',
      '............o.......................ww########',
      '..............o.o........oo.........ww########',
      '....................................ww########',
      '.12......................##.........ww########',
      '##########~~~~~~~~############################',
    ] },
    { name: 'Step up', tip: 'Ride each column to the next ledge', rows: [
      '..............o',
      '..............ww#######',
      '..............ww#######',
      '..............ww#######',
      '..............ww#######',
      '........o.....ww#######.....o',
      '.......ww##############',
      '.......ww##############.........o',
      '...oo..ww##############',
      '.......ww##############.............o.........EE',
      '.12....ww##############.......................EE',
      '#######################^^^^^^^^^^^^^^^^###########',
    ] },
    { name: 'Fan duty', tip: 'Stand on the plate to start the fan', rows: [
      '.',
      '.',
      '........o...o',
      '........hh.ff.........j..ooo',
      '........hh.ff######################',
      '........hh.ff..................####',
      '........hh.ff..................####',
      '........hh.ff..................####',
      '........hh.ff..................####',
      '........hh.ff..................####....o....EE',
      '.12..u..hh.ff..................####.........EE',
      '#####################################~~~~~######',
    ] },
    { name: 'Long glide', tip: 'Close up to drop, open up to drift', rows: [
      '.',
      '.',
      '.',
      '..12',
      '#########',
      '#########........o....................................o.....EE',
      '#########............................................ww.....EE',
      '#########.............o..............................ww#########',
      '#########............................................ww#########',
      '#########..................o.........................ww#########',
      '#########...........##.........o...............o.....ww#########',
      '#########...........##...............................ww#########',
      '#########...........##...........###########.......#############',
      '#########^^^^^^^^^^^##^^^^^^^^^^^###########~~~~~~~#############',
    ] },
    { name: 'Into the gust', tip: 'Glide into the wind and let go of right', reach: {up: 7}, rows: [
      '.',
      '...................................EE',
      '..................o.....o....ooo...EE',
      '..................ww########....########',
      '..................ww',
      '..................ww',
      '..................ww',
      '..................ww',
      '......o...........ww',
      '.....ww########...ww',
      '.....ww...........ww',
      '.....ww...........ww',
      '.....ww...........ww',
      '.....ww...o.......ww',
      '.12..ww.........^^^^^^^^^^^^^^^^^^^^^^^^',
      '########################################',
    ] },
    { name: 'Lift your mate', tip: 'Stand on your mate, then ride up together', reach: {extraUp: 6}, rows: [
      '.',
      '.............ooo',
      '........................................EE',
      '..................j..o........ooo.......EE',
      '..........###########hh######.....##########',
      '.....................hh',
      '.....................hh',
      '.........o...........hh',
      '........ww...........hh',
      '........ww...........hh',
      '........ww...........hh',
      '........ww...........hh',
      '..12....ww...........hh',
      '############################################',
    ] },
    { name: 'Fans for two', tip: 'Hold the plate while your mate flies, then swap', reach: {extraUp: 5}, rows: [
      '.',
      '.',
      '............o...o',
      '............gg.ff...oo',
      '............gg.ff#######',
      '............gg.ff',
      '............gg.ff.............o',
      '............gg.ff',
      '............gg.ff.................o',
      '............gg.ff......................................EE',
      '.12..u......gg.ff...........................i..........EE',
      '##########..gg.ff.......................####################',
      '##########~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~####################',
    ] },
    { name: 'Storm summit', tip: 'Flags save your place', reach: {up: 5}, rows: [
      '.',
      '........................................o...oo.j',
      '.....................................hhff#########',
      '.....................................hhff',
      '.....................................hhff',
      '...........................o.....u...hhff',
      '...........................ww########hhff',
      '...........................ww........hhff',
      '...........................ww........hhff..............o',
      '...........................ww........hhff',
      '...........................ww........hhff................o',
      '................o.o........ww........hhff.........................EE',
      '...........................ww........hhff.........................EE',
      '..12...................F...ww........hhff.................############',
      '############.........#############...hhff.................############',
      '############^^^^^^^^^#############^^^^^^^^^^^^^^^^^^^^^^^^############',
    ] },
  ],
};
