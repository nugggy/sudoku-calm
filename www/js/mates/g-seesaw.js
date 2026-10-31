// Seesaw Hop: seesaws ('S' marks the pivot, the plank is three tiles wide). Land hard on the high end and
// whoever (or whatever) stands on the low end is thrown into the air: about 5 tiles from a hop, up to 8 from a
// big drop. Launch each other onto ledges, bounce back and forth to go higher, and drop crates to fling a mate.
import { clamp } from './engine.js';

const AMP = 0.42, HALF_W = 1.5;

function makeSeesaw(c, r) {
  const s = { c, r, y0: r + 0.32, tilt: 0, target: 0, rate: 3 };
  s.L = { kind: 'plank', ss: s, side: -1, x: c - 1, y: s.y0, w: HALF_W, h: 0.25 };
  s.R = { kind: 'plank', ss: s, side: 1, x: c + 0.5, y: s.y0, w: HALF_W, h: 0.25 };
  return s;
}
const bodiesOf = (w) => [...w.players.filter((p) => !p.dead), ...w.crates.filter((b) => b.alive)];
const overlapX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);

function launch(w, s, half, impact, bodies) {
  const other = half === s.L ? s.R : s.L;
  const v = clamp(20.5 + (impact - 12) * 0.55, 19, 26);
  s.target = half.side; s.rate = 14;
  for (const b of bodies) {
    if (b.on !== other) continue;
    Object.assign(b, { vy: -v, on: null, ground: false, noCut: true, coyote: 0, buffer: 0, _ssOn: null });
    b.y -= 0.02;
  }
  w.emit('launch', other.x + other.w / 2, other.y, null, { v });
}

export default {
  id: 'seesaw', name: 'Seesaw Hop', blurb: 'Bounce each other sky high on seesaws', noAct: true,
  how: [
    'One of you stands on the low end of a seesaw. The other lands on the high end, and up goes your mate.',
    'The harder you land, the higher they fly. A hop gives about 5 tiles. Jump down from a ledge for up to 8.',
    'Land back on the seesaw to throw your mate even higher. Crates work too: drop one on the high end, or launch one onto a ledge.',
  ],
  theme: { sky: ['#9fe3d6', '#eafaf5'], hills: ['#9dd99a', '#6fc07a'], brick: '#c98a5a' },
  reach: { extraUp: 4 }, // launches reach up to 8 tiles, which the reachability check cannot model
  tiles: { S: { kind: 'seesaw', draw() {} } },
  setup(w) {
    w.data.ss = [];
    for (let r = 0; r < w.H; r++) for (let c = 0; c < w.W; c++) if (w.grid[r][c] === 'S') w.data.ss.push(makeSeesaw(c, r));
  },
  tops(w) { return w.data.ss.flatMap((s) => [s.L, s.R]); },
  preStep(w) { for (const b of bodiesOf(w)) b._vy = b.vy; },
  update(w, dt) {
    const bodies = bodiesOf(w);
    for (const b of bodies) if (b.on?.kind !== 'plank') b._ssOn = null;
    for (const s of w.data.ss) {
      const halves = [s.L, s.R];
      // walking into a low or level end steps up onto it
      for (const b of bodies) for (const h of halves) {
        const below = b.y + b.h - h.y;
        if (b.ground && b.on !== h && overlapX(b, h) > 0.3 && below > 0 && below < 0.75) { b.y = h.y - b.h; b.on = h; b._ssOn = h; }
      }
      let launched = false;
      for (const h of halves) for (const b of bodies) {
        if (b.on !== h || b._ssOn === h) continue;
        b._ssOn = h;
        if (!launched && (b._vy || 0) > 7 && s.tilt * h.side < 0.3) { launch(w, s, h, b._vy, bodies); launched = true; }
        else if ((b._vy || 0) > 4) w.emit('plank', b.x + b.w / 2, h.y);
      }
      // weight: with one end loaded the seesaw settles that way
      if (s.rate < 14 || Math.abs(s.tilt - s.target) < 0.001) {
        const l = bodies.some((b) => b.on === s.L), r = bodies.some((b) => b.on === s.R);
        if (l !== r) s.target = l ? -1 : 1;
        s.rate = 3;
      }
      s.tilt += clamp(s.target - s.tilt, -s.rate * dt, s.rate * dt);
      s.L.y = s.y0 - s.tilt * AMP; s.R.y = s.y0 + s.tilt * AMP;
      for (const b of bodies) if (b.on === s.L || b.on === s.R) b.y = b.on.y - b.h;
    }
  },
  drawBack(g, w) {
    for (const s of w.data.ss) {
      const cx = s.c + 0.5, a = Math.atan2(2 * s.tilt * AMP, HALF_W);
      g.fillStyle = '#6c7686'; g.beginPath(); g.moveTo(cx, s.y0 + 0.1); g.lineTo(cx + 0.42, s.r + 1); g.lineTo(cx - 0.42, s.r + 1); g.closePath(); g.fill();
      g.fillStyle = '#8e99ab'; g.beginPath(); g.moveTo(cx, s.y0 + 0.2); g.lineTo(cx + 0.24, s.r + 0.95); g.lineTo(cx - 0.24, s.r + 0.95); g.closePath(); g.fill();
      g.save(); g.translate(cx, s.y0); g.rotate(a);
      g.fillStyle = '#b8743c'; g.fillRect(-1.55, 0, 3.1, 0.24);
      g.fillStyle = '#d99a5c'; g.fillRect(-1.55, 0, 3.1, 0.08);
      g.fillStyle = '#ff5f6d'; g.fillRect(-1.55, -0.04, 0.3, 0.12); g.fillRect(1.25, -0.04, 0.3, 0.12);
      g.fillStyle = '#4a3b2a'; g.beginPath(); g.arc(0, 0.12, 0.08, 0, 7); g.fill();
      g.restore();
    }
  },
  sound(e, snd) {
    if (e.k === 'launch') snd.boing(0.7 + (e.v - 19) * 0.08);
    else if (e.k === 'plank') snd.thud();
  },
  levels: [
    { name: 'First flight', tip: 'Stand on the low end. Your mate jumps on the high end', rows: [
      '............................B...........',
      '............................B...........',
      '............................B...........',
      '..........oo................B...........',
      '.............k.....o.o......B...........',
      '.........=====..............B...........',
      '............................B...........',
      '............................B...........',
      '............................B..o..EE....',
      '....2...S1.^^^......S.......K.....EE....',
      '########################################',
    ] },
    { name: 'Jump from high', tip: 'Jump down from the step for a bigger launch', rows: [
      '....................B.......................',
      '....................B.......................',
      '....................B.......................',
      '...........k........B.......................',
      '..........===.......B.......................',
      '....................B........oo.............',
      '....................B.......................',
      '....................B.......................',
      '....BB..............B.......................',
      '....BB..............B....o..............EE..',
      '..2.BB..S1..........K.......S...........EE..',
      '############################################',
    ] },
    { name: 'Ping pong', tip: 'Land back on the seesaw to send your mate higher', rows: [
      '....................B...............B.......',
      '....................B...............B.......',
      '....................B...............B.......',
      '........k...........B.........k.....B.......',
      '........==..........B........==.....B.......',
      '...........o........B.......o.......B.......',
      '....................B...............B.......',
      '....................B...............B.......',
      '....................B...............B.......',
      '....................B...............B...EE..',
      '.....2....S1........K.......S.......K...EE..',
      '############################################',
    ] },
    { name: 'Crate drop', tip: 'Stand on the plate to drop the crate on the high end', rows: [
      '........................................',
      '.....................C..................',
      '.....................U..................',
      '........................................',
      '..............................o.o....EE.',
      '.....................o...u...........EE.',
      '......................BBBBBBBBBBBBBBBBBB',
      '.......o..............BBBBBBBBBBBBBBBBBB',
      '....o...o.............BBBBBBBBBBBBBBBBBB',
      '......................BBBBBBBBBBBBBBBBBB',
      '................2...S1BBBBBBBBBBBBBBBBBB',
      '########################################',
    ] },
    { name: 'Over the wall', tip: 'Fly over the wall, then hold the gate open', rows: [
      '............................................',
      '............................................',
      '............................................',
      '..........o.............o...................',
      '...........B..............B.................',
      '...........B..............B.................',
      '...........B..............B.................',
      '...........B..............B.................',
      '...BB......B......BB......B.................',
      '...BB......B......BB......B.............EE..',
      '.2.BB..S1..U..u...BB..S...I..i..........EE..',
      '############################################',
    ] },
    { name: 'Crate catapult', tip: 'Launch the crate onto the plate', rows: [
      '..............B...............B.............',
      '..............B...............B.............',
      '..............B...............B.............',
      '..............B.........o.....B.............',
      '........o.....B........i......B.............',
      '.........u....B.......===.....B.............',
      '........===...B...............B.............',
      '..............B...............B.............',
      '..............B...............B....o........',
      '.........C....B..BB....C......B.........EE..',
      '..2.1...S.....U..BB...S.......I.........EE..',
      '############################################',
    ] },
    { name: 'Tower', tip: 'Whoever is up top drops a crate for the other', rows: [
      '.....................C..................',
      '.....................I..................',
      '........................................',
      '..............................o.o....EE.',
      '.........................i...........EE.',
      '.........C............BBBBBBBBBBBBBBBBBB',
      '.........U...........oBBBBBBBBBBBBBBBBBB',
      '......................BBBBBBBBBBBBBBBBBB',
      '......................BBBBBBBBBBBBBBBBBB',
      '............u.......S.BBBBBBBBBBBBBBBBBB',
      '..........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '.........oBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '....o.....BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '..........BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '....2...S1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '########################################',
    ] },
    { name: 'Summit', tip: 'Catapult, ping pong, then a crate drop', rows: [
      '............B...............B...........................',
      '............B...............B...........................',
      '............B...............B...........................',
      '............B...............B.......C...................',
      '............B...............B.......I...................',
      '............B.....k.........B...........................',
      '............B.....==........B........................EE.',
      '.......u....B...............B...........i............EE.',
      '......===...B.......o.......B.......BBBBBBBBBBBBBBBBBBBB',
      '............B...............B.......BBBBBBBBBBBBBBBBBBBB',
      '............Bo.o............B..o....BBBBBBBBBBBBBBBBBBBB',
      '.......C....B...............B.......BBBBBBBBBBBBBBBBBBBB',
      '..2.1.S.....U.......S.......K.....S.BBBBBBBBBBBBBBBBBBBB',
      '########################################################',
    ] },
  ],
  tests(assert, { makeWorld, simulate }) {
    const game = this;
    const lv = { rows: ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '2....S1...', '##########'] };
    // dropping onto the high end from 2.3 tiles (a hop) launches the partner about 5 tiles, from 5.3 tiles about 8
    for (const [name, fall, lo, hi] of [['hop', 2.34, 4.8, 6.2], ['big drop', 5.34, 7.3, 8.3]]) {
      const w = makeWorld(lv, game), [pip, bo] = w.players, s = w.data.ss[0];
      simulate(w, 0.6);
      assert(pip.on === s.R && s.tilt > 0.99, `seesaw: Pip rests on the low end (${name})`);
      Object.assign(bo, { x: 4.3, y: s.L.y - fall - bo.h, vy: 0 });
      const ground = pip.y + pip.h; let top = ground;
      const track = [(ww, p) => { top = Math.min(top, p.y + p.h); return {}; }, {}];
      simulate(w, 0.7, track);
      assert(s.tilt < -0.99 && bo.on === s.L, `seesaw: the lander ends on the low end (${name})`);
      simulate(w, 0.8, track);
      assert(top < ground - lo && top > ground - hi, `seesaw: a ${name} launches the partner (${(ground - top).toFixed(2)} tiles)`);
    }
    // a crate pushed off a ledge onto the high end launches whoever is on the low end
    const w = makeWorld({ rows: ['........', '.....C.2', '.....###', '.....###', '.....###', '.....###', '.....###', '.....###', '..1S.###', '########'] }, game);
    const pip = w.players[0];
    simulate(w, 0.5);
    assert(pip.on?.kind === 'plank', 'seesaw: Pip stands on the left end');
    let top = pip.y;
    simulate(w, 2.5, [(ww, p) => { top = Math.min(top, p.y); return {}; }, { x: -1 }]);
    assert(pip.y - top > 6, `seesaw: a dropped crate launches Pip (${(pip.y - top).toFixed(2)} tiles)`);
  },
};
