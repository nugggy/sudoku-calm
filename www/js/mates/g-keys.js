// Key Keepers: keys and locks everywhere, and the key is always on the wrong side. Throw the key you carry
// (a high lob when standing still, a long throw when running) over walls, through bars and up shafts; your
// mate catches it in the air or picks it up where it lands. Red and green keys only fit locks of their colour.
import { moveX, moveY } from './engine.js';

const KC = { r: ['#ff6b6b', '#a52a2a'], g: ['#5fdc6e', '#1f8a35'] };
const OPEN = { kind: 'bars' };
const HALF = 0.18; // half the size of a key's collision box

// a lock that only takes keys of its colour (gold keys have no colour)
const lockTile = (col) => ({
  solid: true, kind: 'lock',
  bump(w, b, c, r) { if (b.player && b.key && (b.key.col || null) === col) { w.useKey(b); w.set(c, r, '.'); w.emit('unlock', c + 0.5, r + 0.5, b); } },
  draw: col ? (g, c, r) => {
    g.fillStyle = KC[col][0]; g.fillRect(c, r, 1, 1); g.strokeStyle = KC[col][1]; g.lineWidth = 0.06; g.strokeRect(c + 0.03, r + 0.03, 0.94, 0.94);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(c + 0.5, r + 0.42, 0.12, 0, 7); g.fill(); g.fillRect(c + 0.45, r + 0.45, 0.1, 0.28);
  } : undefined,
});

function keyShape(g, x, y, s, fill, line) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = fill; g.strokeStyle = line; g.lineWidth = 0.1;
  g.beginPath(); g.arc(-0.35, 0, 0.3, 0, 7); g.fill(); g.stroke();
  g.fillRect(-0.1, -0.08, 0.75, 0.16); g.fillRect(0.4, 0.05, 0.12, 0.22); g.fillRect(0.58, 0.05, 0.1, 0.16);
  g.fillStyle = line; g.beginPath(); g.arc(-0.35, 0, 0.1, 0, 7); g.fill();
  g.restore();
}

function goHome(w, k) {
  Object.assign(k, { x: k.hx, y: k.hy, vx: 0, vy: 0, by: null, loose: false, idle: 0 });
  w.emit('keyHome', k.x, k.y);
}

// While a thrown key is in the air its `by` is a stand-in that holds it still for the engine's follow code,
// so the engine does not hand it straight back to the thrower. Catches are handled here instead.
function flyer(k) { return { fly: true, x: k.x, y: k.y + 0.1, w: 0, face: 0 }; }

function throwKey(w, p) {
  const k = w.keys.find((q) => q.by === p); if (!k) return;
  const still = !p.in.x;
  p.key = null;
  k.x = p.x + p.w / 2; k.y = p.y - 0.2;
  k.vx = still ? p.face * 2.5 : p.face * 8 + p.vx * 0.3;
  k.vy = still ? -18 : -12;
  Object.assign(k, { by: flyer(k), loose: true, idle: 0, thrower: p, throwT: w.t });
  w.emit('throw', k.x, k.y, p);
}

function stepKey(w, k, dt) {
  const b = k.body ||= { x: 0, y: 0, w: HALF * 2, h: HALF * 2, vx: 0, vy: 0, gdir: 1, ground: false, on: null, isKey: true };
  if (b.on && b.on.kind === 'plat') { k.x += b.on.dx || 0; k.y += b.on.dy || 0; }
  b.x = k.x - HALF; b.y = k.y - HALF; b.vy = Math.min(w.P.fall, k.vy + w.P.g * dt);
  b.ground = false; b.on = null;
  const bars = w.tiles[':']; w.tiles[':'] = OPEN; // keys fly through bars
  moveX(w, b, k.vx * dt); moveY(w, b, b.vy * dt);
  w.tiles[':'] = bars;
  k.x = b.x + HALF; k.y = b.y + HALF; k.vy = b.vy;
  if (b.ground) {
    // a key that comes to rest inside bars slips on through
    k.vx = w.get(Math.floor(k.x), Math.floor(k.y)) === ':' ? (k.vx < 0 ? -2 : 2) : 0;
    if (k.by?.fly) { k.by = null; w.emit('keyLand', k.x, k.y + HALF); }
    k.idle += dt;
  } else k.idle = 0;
  const t = w.tile(Math.floor(k.x), Math.floor(k.y));
  // a key lost in water or spikes, out of the level or left somewhere for ages goes back to where it started
  if ((t && t.hazard) || k.y > w.H + 1 || k.idle > 20) goHome(w, k);
  else if (k.by?.fly) {
    Object.assign(k.by, flyer(k));
    for (const p of w.players) {
      if (p.dead || p.key || (p === k.thrower && w.t - k.throwT < 0.35)) continue;
      if (Math.abs(k.x - (p.x + p.w / 2)) < 0.75 && Math.abs(k.y - (p.y + p.h / 2)) < 0.85) { k.by = p; p.key = k; w.emit('key', k.x, k.y, p); w.emit('catch', k.x, k.y - 0.5, p); break; }
    }
  }
}

export default {
  id: 'keys', name: 'Key Keepers', blurb: 'Throw keys to each other over walls and through bars', actLabel: 'Throw',
  how: [
    'Every lock needs a key, and the key is always on the wrong side. Walk into a key to pick it up and bump a lock to open it.',
    'Press Throw to toss the key you carry. Stand still for a high lob straight up, or run for a long throw. Throw at the top of a jump to go higher.',
    'Your mate can catch a key in the air or pick it up where it lands. Keys fly through bars, but you cannot. Red and green keys only fit locks of their colour.',
  ],
  theme: { sky: ['#ffd9a0', '#fff3dc'], hills: ['#e8c48a', '#d4a866'], brick: '#b3745a' },
  tiles: {
    K: lockTile(null), R: lockTile('r'), G: lockTile('g'),
    ':': { solid: true, kind: 'bars', draw(g, c, r) {
      g.fillStyle = '#5b6474'; g.fillRect(c, r + 0.02, 1, 0.1); g.fillRect(c, r + 0.88, 1, 0.1);
      for (let k = 0; k < 3; k++) { g.fillRect(c + 0.12 + k * 0.32, r, 0.1, 1); }
      g.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 0; k < 3; k++) g.fillRect(c + 0.13 + k * 0.32, r, 0.03, 1);
    } },
  },
  setup(w) {
    for (let r = 0; r < w.H; r++) for (let c = 0; c < w.W; c++) {
      const ch = w.grid[r][c];
      if (ch === 'r' || ch === 'g') { w.keys.push({ x: c + 0.5, y: r + 0.5, hx: c + 0.5, hy: r + 0.5, by: null, col: ch }); w.grid[r][c] = '.'; }
    }
    for (const k of w.keys) Object.assign(k, { vx: 0, vy: 0, loose: false, idle: 0 });
  },
  act(w, p) { if (p.key) throwKey(w, p); },
  update(w, dt) { for (const k of w.keys) if (!k.used && k.loose && (!k.by || k.by.fly)) stepKey(w, k, dt); },
  // the engine puts a dead player's key back at its start, where it floats again
  onDie(w) { for (const k of w.keys) if (!k.by && k.x === k.hx && k.y === k.hy) Object.assign(k, { loose: false, vx: 0, vy: 0 }); },
  drawMid(g, w, view, t) {
    for (const k of w.keys) {
      if (k.used) continue;
      // drawn exactly over the engine's gold key
      if (k.col) keyShape(g, k.x, k.y + (k.by ? 0 : Math.sin(t * 3) * 0.08), 0.5, KC[k.col][0], KC[k.col][1]);
    }
  },
  drawFront(g, w) {
    // a ring under a flying key so the catcher can see where it is going
    for (const k of w.keys) if (k.by?.fly) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.05; g.beginPath(); g.arc(k.x, k.y, 0.38, 0, 7); g.stroke(); }
  },
  sound(e, snd) {
    if (e.k === 'throw') snd.swoosh();
    else if (e.k === 'keyLand') snd.tick();
    else if (e.k === 'catch') snd.ding(5);
    else if (e.k === 'keyHome') snd.pop();
  },
  levels: [
    { name: 'Through the bars', tip: 'Press Throw to pass the key through the bars', rows: [
      '............................................',
      '..............BBBBBBBBBBB...................',
      '..............B.........B...................',
      '..............:.........B...................',
      '..............:...o.o...B............o......',
      '..............:.........B...................',
      '..2.k.........U...1.....K..u....o.o.....EE..',
      '############################################',
    ] },
    { name: 'Over the top', tip: 'Jump, then throw at the top of the jump', rows: [
      '.....................................B........',
      '.....................................B........',
      '.....................................B........',
      '.....................B...............B........',
      '...........o.........B......o.o......B........',
      '.....................B...............B........',
      '.....................B......====.....B.....EE.',
      '..2.k................U.....1.........K..u..EE.',
      '##############################################',
    ] },
    { name: 'Up the shaft', tip: 'Stand still, jump and throw for a high lob', rows: [
      '......B.............:.........................',
      '......B.............:.........................',
      '......B.............:.........................',
      '......B...o.o.......:.....................EE..',
      '..j.o.K.......2.....J...................o.EE..',
      '#####################.......J.........########',
      '#####################.......J.........########',
      '#####################.......J.....o...########',
      '#####################...o...J....===..########',
      '#####################.......J.........########',
      '#####################..1.k..J.........########',
      '##############################################',
    ] },
    { name: 'Swap', tip: 'Coloured keys only fit locks of the same colour', rows: [
      '....B...........................B....',
      '....B...........................B....',
      '....B...........................B....',
      '....B...........................B....',
      '....B...o...................o...B....',
      '.a..B...........................B..b.',
      '.a..R.....1.g...........r.2.....G..b.',
      '##############~~~~~~~~###############',
      '##############~~~~~~~~###############',
    ] },
    { name: 'Back and forth', tip: 'Send a key over, then get one back', rows: [
      '....................:........B............B.......',
      '....................:........B............B.......',
      '....................:........B............B.......',
      '....................:........B.......k....B.......',
      '....................:........B............B.......',
      '............BBBBB...:........B......===...B.......',
      '........o...B...B...:....o...B...o........B..o....',
      '............B..oB...:........B............B...EE..',
      '...2...r....G.j.B...J...1....R..g.........K...EE..',
      '##################################################',
    ] },
    { name: 'Hand it up', tip: 'Boost your mate, then throw the key up', rows: [
      '...............................B........',
      '...............................B........',
      '...............................B........',
      '...............................B........',
      '...............................B........',
      '...........................o.o.B.....EE.',
      '........................u......K..j..EE.',
      '......................##################',
      'BBBBB.......o.o.......##################',
      'B..oB.................##################',
      'B.k.U..1.2............##################',
      '#####################J##################',
      '#####################s##################',
      '########################################',
    ] },
    { name: 'Upstairs downstairs', tip: 'Stand on the bars to catch a key thrown up', rows: [
      '......................B.............B.......',
      '......................B.............B.......',
      '......o...............B..o..........B.......',
      '.............o........B.........o...B.......',
      '..2.k.................R..g..........B.......',
      '########::::####::::#######::::###JJ########',
      '..............B.................B...........',
      '..............B.................B...........',
      '..............B.................B...........',
      '.......o......B......o.....o....B......o....',
      '..............B.................B.......EE..',
      '...1..........K...r.............G.....j.EE..',
      '############################################',
    ] },
    { name: 'Key master', tip: 'Every key has a job. Pass them up and down', rows: [
      '...........B..................B..................B..........',
      '...........B..................B..................B..........',
      '....o......B.........o........B.....o............B..........',
      '...........B..................B.............o....B..........',
      '..2........R..g...............K..r...............B..........',
      '######::::#####::::######::::######::::########JJ###########',
      '....................B...................B...................',
      '....................B...................B...................',
      '....................B...................B...................',
      '.........o.....o....B.......o......o....B...........o.......',
      '....................B...................B...............EE..',
      '..1..r..............G..k................R..j............EE..',
      '############################################################',
    ] },
  ],
  tests(assert, { makeWorld, simulate }) {
    const game = this;
    // a long throw over a wall lands on the far side and the other player picks it up
    const lv = { rows: [
      '..............................',
      '..............................',
      '..............B...............',
      '..............B...............',
      '..............B...............',
      '..2k..........B.............1.',
      '##############################',
    ] };
    let w = makeWorld(lv, game);
    const [pip, bo] = w.players;
    simulate(w, 0.2, [{}, { x: 1 }]);
    assert(bo.key, 'keys: Bo picks up the key');
    simulate(w, 1.1, [{}, { x: 1 }]);
    simulate(w, 0.05, [{}, { x: 1, jump: true, jumpP: true }]);
    simulate(w, 0.35, [{}, { x: 1, jump: true }]);
    simulate(w, 0.02, [{}, { x: 1, act: true, actP: true }]);
    const k = w.keys[0];
    assert(!bo.key && k.by?.fly, 'keys: Throw lets go of the key');
    simulate(w, 1.5);
    assert(!k.by && k.x > 15 && k.y > 5 && k.y < 6, `keys: thrown key lands past the wall (${k.x.toFixed(2)}, ${k.y.toFixed(2)})`);
    simulate(w, 3, [(ww, p) => ({ x: Math.sign(k.x - (p.x + p.w / 2)) }), {}]);
    assert(pip.key === k, 'keys: Pip picks up the key where it landed');
    // a lob goes up through bars, and a partner standing on the bars catches it
    w = makeWorld({ rows: [
      '..........',
      '....2.....',
      '###:::####',
      '..........',
      '..........',
      '..........',
      '...1k.....',
      '##########',
    ] }, game);
    simulate(w, 0.15, [{ x: 1 }, {}]);
    assert(w.players[0].key, 'keys: Pip holds the key');
    simulate(w, 0.05, [{ jump: true, jumpP: true }, {}]);
    simulate(w, 0.35, [{ jump: true }, {}]);
    simulate(w, 0.02, [{ act: true, actP: true }, {}]);
    simulate(w, 1);
    assert(w.players[1].key && !w.players[0].key, 'keys: Bo catches a key lobbed up through the bars');
    // coloured keys only fit their own locks
    w = makeWorld({ rows: ['........', '.1rR.G..', '########', '.......2', '########'] }, game);
    simulate(w, 1.5, [{ x: 1 }, {}]);
    assert(w.get(3, 1) === '.' && w.get(5, 1) === 'G', 'keys: the red key opens the red lock and not the green one');
  },
};
