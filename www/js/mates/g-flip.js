// Flip Side: Flip turns your own gravity upside down, so you walk on ceilings. You can flip while standing, plus
// once more in the air before you land. Ceiling plates (n opens u gates, m opens i gates) need a flipped player
// pressed against them, so the two work on opposite surfaces holding gates open for each other.
import { overlap } from './engine.js';
import { drawTile, plateColour, roundRect } from './draw.js';

const CEIL = { n: 'u', m: 'i' };
const isOpen = (w, k) => !!w.open[k] || !!w.data.held?.[k];
const gate = (k) => ({
  kind: 'gate', key: k, solid: (w) => !isOpen(w, k),
  draw(g, c, r, w, cam, t) { drawTile(g, 'gate', c, r, { open: { [k]: isOpen(w, k) } }, null, t, { key: k }); },
});
const ceilPlate = (k) => ({
  kind: 'cplate', key: k,
  draw(g, c, r, w) {
    const down = w.data.cdown?.[`${c},${r}`];
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(c + 0.05, r, 0.9, 0.1);
    g.fillStyle = plateColour(k); roundRect(g, c + 0.1, r + 0.04, 0.8, down ? 0.1 : 0.2, 0.05); g.fill();
  },
});

// a flipped player standing on a ceiling counts as standing for the reachability check
const ceilingSpot = (w, c, r) => r >= 2 && w.tile(c, r - 2)?.solid === true;

export default {
  id: 'flip', name: 'Flip Side', blurb: 'Flip your gravity and walk on the ceiling', actLabel: 'Flip',
  how: [
    'Get Pip and Bo to the purple door together.',
    'Press Flip to turn your gravity upside down and fall up to the ceiling. Press it again to fall back down. You can flip whenever you are standing, and once more in the air before you land.',
    'Plates on the ceiling only work for someone standing upside down. Spikes on the ceiling hurt too.',
  ],
  theme: { sky: ['#3b3f7a', '#8a7fd0'], hills: ['#5b5aa8', '#4a478f'], deco: 'stars', ground: '#5d4a7a', top: '#9b7fe0', edge: '#3b2d55' },
  tiles: { U: gate('u'), I: gate('i'), n: ceilPlate('u'), m: ceilPlate('i') },
  // a flip reaches any height under a roof; ceilings count as floors
  reach: { extraUp: 8, floor: (w, c, r) => ceilingSpot(w, c, r) },
  preStep(w) { w.sepY = Infinity; },
  act(w, p) {
    if (!p.ground && p.flipUsed) return;
    if (!p.ground) p.flipUsed = true;
    const q = w.partner(p);
    if (q.on === p) q.on = null;
    p.gdir = -p.gdir; if (p.ground) p.vy = p.gdir * 2; // in the air you keep your speed and start slowing
    p.ground = false; p.on = null; p.coyote = 0; p.buffer = 0; p.squash = -1;
    w.emit('flip', p.x + p.w / 2, p.y + p.h / 2, p);
  },
  update(w) {
    w.data.held = w.data.held || {}; w.data.cdown = w.data.cdown || {};
    const alive = w.players.filter((p) => !p.dead);
    for (const p of w.players) if (p.ground) p.flipUsed = false;
    const want = {};
    for (let r = 0; r < w.H; r++) for (let c = 0; c < w.W; c++) {
      const k = CEIL[w.grid[r][c]]; if (!k) continue;
      const down = alive.some((p) => overlap(p, { x: c + 0.05, y: r, w: 0.9, h: 0.4 }));
      if (down !== !!w.data.cdown[`${c},${r}`]) { w.data.cdown[`${c},${r}`] = down; w.emit(down ? 'plate' : 'plateUp', c + 0.5, r); }
      if (down) want[k] = true;
    }
    for (const k of ['u', 'i']) {
      const inside = w.gateCells.some(([c, r, key]) => key === k && alive.some((p) => overlap(p, { x: c, y: r, w: 1, h: 1 }, 0.02)));
      const next = !!want[k] || (!!w.data.held[k] && inside); // never shut on someone
      if (next !== !!w.data.held[k] && !w.open[k]) w.emit(next ? 'gateOpen' : 'gateShut', 0, 0, null, { key: k });
      w.data.held[k] = next;
    }
  },
  sound(e, snd) { if (e.k === 'flip') snd.swoosh(); },
  // levels 5 and 8 cross 6 tiles of water with two flips, so they allow a wider gap
  levels: [
    { name: 'Upside down', tip: 'Press Flip to walk on the ceiling', rows: [
      '############################################',
      '................oooooo......................',
      '............................................',
      '............................................',
      '............................................',
      '......ooo...................................',
      '.......................................EE...',
      '..12..........^^^^^^^^^^...............EE...',
      '############################################',
    ] },
    { name: 'From above', tip: 'Ceiling plates need someone upside down', rows: [
      '############################################',
      '....................U.....n...ooo...........',
      '....................U.......................',
      '....................U.......................',
      '........ooo.........U.......................',
      '....................U.......................',
      '....................U..................EE...',
      '..12..........u.....U..................EE...',
      '############################################',
    ] },
    { name: 'Spike sandwich', tip: 'Up, down, up, down', rows: [
      '####################################################',
      '...........oooo.....vvvvvv...oooo.......vvvvvv......',
      '....................................................',
      '....................................................',
      '....................................................',
      '....................................................',
      '................................................EE..',
      '..12......^^^^^^.....oooo...^^^^^^.......oooo...EE..',
      '####################################################',
    ] },
    { name: 'Two floors', tip: 'One above, one below', rows: [
      '################################################',
      '.........ooo..n.............I...................',
      '............................I...................',
      '............................I...................',
      '............................I..ooo..............',
      '###..#################################..########',
      '###..#################################..########',
      '....................U...m......ooo..............',
      '....................U...........................',
      '....................U.......................EE..',
      '.1....2..ooo........U.......................EE..',
      '################################################',
    ] },
    { name: 'Float', tip: 'Flip, then flip again in the air', reach: { gap: 7 }, rows: [
      '##############################################',
      '............vvvvvvvvvvvvvvvv....ooooo.........',
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................................',
      '................o......o......................',
      '..............................................',
      '..........................................EE..',
      '..12...........................^^^^^^^....EE..',
      '#################~~~~~~#######################',
    ] },
    { name: 'Key under the roof', tip: 'The lock is up top', rows: [
      '################################################',
      '...........vvvkvvv...ooo......K.......U...n.....',
      '..............................#.......U.........',
      '..............................#.......U.........',
      '..............................#.......U.........',
      '..............................#.......U.....oo..',
      '......ooo.....................#.......U.........',
      '..............................#.......U.........',
      '..............................#.......U......EE.',
      '..12..........................#...u...U......EE.',
      '################################################',
    ] },
    { name: 'Over the top', tip: 'The only way through is along the roof', rows: [
      '##############################################',
      '........vvv...ooo......vvvvvvvvm..I.....oo....',
      '....................##............I...........',
      '....................##............I...........',
      '....................##............I...........',
      '....................##............I...........',
      '....................##............I...........',
      '....................##............I...........',
      '....................##..oooo......I.......EE..',
      '..12................##............I...i...EE..',
      '##############################################',
    ] },
    { name: 'Flip side', tip: 'Every trick, both ways up', reach: { gap: 7 }, rows: [
      '############################################################',
      '.....vvvvvvvvvvvv.......n.........I.oo........vvkvv...#.....',
      '..................................I...................#.....',
      '..................................I...................#.....',
      '......................oo..........I...................#.....',
      '....................#####################.............#.....',
      '.......o......o.....#####################.............#.....',
      '......................oo....U..m......................#.....',
      '............................U.........................#.....',
      '............................U.........................#..EE.',
      '..12..............F.........U.......oo................K..EE.',
      '########~~~~~~##############################################',
    ] },
  ],
  tests(assert, { makeWorld, simulate }) {
    const room = { rows: ['##########', '..........', '..........', '..........', '..........', '..........', '.1.....2..', '##########'] };
    let w = makeWorld(room, this);
    const [a] = w.players;
    simulate(w, 0.3);
    simulate(w, 1, [(ww, p, i) => ({ actP: i === 0 }), {}]);
    assert(a.gdir === -1 && a.ground && Math.abs(a.y - 1) < 0.01, `flip: flipping lands you on the ceiling (y ${a.y.toFixed(2)})`);
    simulate(w, 1, [(ww, p, i) => ({ actP: i === 0 }), {}]);
    assert(a.gdir === 1 && a.ground && Math.abs(a.y + a.h - 7) < 0.01, 'flip: flipping again lands you back on the floor');
    // one flip in the air, not two
    w = makeWorld(room, this);
    simulate(w, 0.3);
    simulate(w, 0.2, [(ww, p, i) => ({ actP: i === 0 }), {}]);
    simulate(w, 0.05, [(ww, p, i) => ({ actP: i === 0 }), {}]);
    simulate(w, 0.05, [(ww, p, i) => ({ actP: i === 0 }), {}]);
    assert(w.players[0].gdir === 1, 'flip: only one flip in the air');
    // a ceiling plate opens its gate only for someone upside down
    w = makeWorld({ rows: ['##########', '....n.....', '.......U..', '.......U..', '.1.2...U..', '##########'] }, this);
    simulate(w, 0.3);
    assert(w.solidAt(7, 3, null), 'flip: gate starts shut');
    w.players[0].x = 4.14;
    simulate(w, 1, [(ww, p, i) => ({ actP: i === 0 }), {}]);
    assert(!w.solidAt(7, 3, null), 'flip: ceiling plate opens the gate');
  },
};
