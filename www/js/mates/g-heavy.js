// Heavy Lifting: crate puzzles. Push crates onto plates, into spike pits and onto moving platforms. A heavy
// crate only moves when both of you push it the same way. A crate that falls out of the level (or into water)
// comes back to where it started.
import { overlap, moveX } from './engine.js';

// The engine counts a heavy crate's pushers with add / size / clear / delete. This stand-in for its Set also
// notes which side each player pushes from, so two players pushing against each other count as one.
function pushers(w, c) {
  let side = {};
  return {
    add(id) { const p = w.players[id]; if (p) side[id] = p.x + p.w / 2 < c.x + c.w / 2 ? 1 : -1; },
    delete(id) { delete side[id]; },
    clear() { side = {}; },
    get size() { return side[0] && side[0] === side[1] ? 2 : side[0] || side[1] ? 1 : 0; },
  };
}

export default {
  id: 'heavy', name: 'Heavy Lifting', blurb: 'Push crates together onto plates and into place', noAct: true,
  how: [
    'Walk into a crate to push it. Crates hold plates down, fill spike pits and make handy steps.',
    'Grey crates marked 2 are heavy. They only move when both of you push the same way at once.',
    'Crates ride on moving platforms, and a light crate can ride on a heavy one. A crate that falls out of the level comes back to where it started.',
  ],
  theme: { sky: ['#c9d6e8', '#eef3fa'], hills: ['#b6c3a4', '#93a785'], ground: '#7b5c45', brick: '#a8735a' },
  setup(w) {
    for (const c of w.crates) Object.assign(c, { hx: c.x, hy: c.y, pushers: c.heavy ? pushers(w, c) : undefined });
  },
  preStep(w) {
    // a crate shoves crates in front of it, but a light crate up against a heavy one only does when both of
    // you push it together
    const heavy = w.crates.filter((h) => h.heavy && h.alive), [a, b] = w.players;
    const near = (p, c) => !p.dead && Math.abs(p.x + p.w / 2 - c.x - c.w / 2) < 1.6 && p.y + 0.01 < c.y + c.h && c.y + 0.01 < p.y + p.h;
    for (const c of w.crates) {
      if (c.heavy) continue;
      const touching = heavy.some((h) => c.y + 0.01 < h.y + h.h && h.y + 0.01 < c.y + c.h && (Math.abs(c.x + c.w - h.x) < 0.1 || Math.abs(h.x + h.w - c.x) < 0.1));
      c.crate = !touching || (a.in.x && a.in.x === b.in.x && near(a, c) && near(b, c));
    }
  },
  update(w) {
    const bodies = [...w.players.filter((p) => !p.dead), ...w.crates.filter((c) => c.alive)];
    for (const c of w.crates) {
      // a crate never sits on someone's head (it could trap them in a pit); it slides off
      if (c.alive && c.on?.player) moveX(w, c, (c.x + c.w / 2 < c.on.x + c.on.w / 2 ? -1 : 1) * 0.04);
      const t = c.alive && w.tile(Math.floor(c.x + c.w / 2), Math.floor(c.y + c.h * 0.7));
      if (c.alive && t?.kind !== 'water') continue;
      const home = { x: c.hx, y: c.hy, w: c.w, h: c.h };
      if (bodies.some((o) => o !== c && overlap(o, home))) continue; // wait until the spot is clear
      Object.assign(c, { alive: true, x: c.hx, y: c.hy, vx: 0, vy: 0, on: null });
      w.emit('spawn', c.x + c.w / 2, c.y + c.h / 2, null, { crate: true });
    }
  },
  sound(e, snd) { if (e.k === 'spawn' && e.crate) snd.pop(); },
  levels: [
    { name: 'Push it', tip: 'Push the crate onto the plate', rows: [
      '................B.......................',
      '................B.......................',
      '................B.......................',
      '................B.......................',
      '................B.......................',
      '................B........o..............',
      '................B.......BB..............',
      '..........o.....B.......BB..............',
      '................B.......BB.........EE...',
      '..12.C..........U..C....BB....o....EE...',
      '###########uu###########################',
      '########################################',
    ] },
    { name: 'Two to push', tip: 'The heavy crate needs you both pushing', rows: [
      '..............B.............B...............',
      '..............B.............B...............',
      '..............B.............B...............',
      '..............B.............B...............',
      '..............B.............B...............',
      '..............B.............B...............',
      '..............B.............B...............',
      '..............B.............B...............',
      '..............B.....o...o...B...............',
      '..............B.............B.........EE....',
      '..1.2H........U..H..........I.........EE....',
      '##########uu##########ii####################',
      '############################################',
    ] },
    { name: 'Swap the plate', tip: 'Hold the plate, then let a crate take over', rows: [
      '..............B...............B.........',
      '..............B...............B.........',
      '..............B...............B.........',
      '..............B...............B.........',
      '..............B...............B.........',
      '..............B...............B.........',
      '........o.....B.........o.....B.........',
      '..............B...............B.........',
      '..............B...............B.....EE..',
      '...1.2........U...C..H........I.....EE..',
      '###########uu#############ii############',
      '########################################',
    ] },
    { name: 'Crate bridge', tip: 'Fill the spikes with crates', reach: { floor: (w, c, r) => w.get(c, r) === '^' }, rows: [
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '...............o.............o..............',
      '............................................',
      '........................................EE..',
      '..1.2.C.C............H.C................EE..',
      '############^^^^^^########^^^^^^############',
      '############################################',
    ] },
    { name: 'Ferry', tip: 'Ride the crate across on the platform', rows: [
      '.....................................B......',
      '.....................................B......',
      '.....................................B......',
      '.....................................B......',
      '.....................................B......',
      '.....................................B......',
      '....................o.o..............B......',
      '.....................................B..EE..',
      '..1.2.....C..........................U..EE..',
      '##############MMM...........####uu##########',
      '##############..............################',
      '##############..............################',
    ] },
    { name: 'Order matters', tip: 'The light crate first, then the heavy one', rows: [
      '..................B.........B...........',
      '..................B.........B...........',
      '..................B.........B...........',
      '..................B.........B...........',
      '..................B.........B...........',
      '..................B.........B...........',
      '............o.....B...o.....B...........',
      '..................B.........B...........',
      '..................B.........B.....EE....',
      '..1.2.C.......H...I.........U.....EE....',
      '##########ii###########uu###############',
      '########################################',
    ] },
    { name: 'Passenger', tip: 'Push the heavy crate and its passenger into the gap', rows: [
      '..................................B.........',
      '..................................B.........',
      '..................................B.........',
      '....................o.............B.........',
      '..................................B.........',
      '....................B.............B.........',
      '....................B.............B.........',
      '.................C..B.............B.........',
      '.................H..B.............B.....EE..',
      '...1.2.........BBBB.B....C........U.....EE..',
      '##############################uu############',
      '############################################',
    ] },
    { name: 'Heavy lifting', tip: 'Everything you have learnt, all at once', reach: { floor: (w, c, r) => w.get(c, r) === '^' }, rows: [
      '..............B....................................B................',
      '..............B....................................B................',
      '..............B....................................B................',
      '..............B....................................B................',
      '..............B....................................B................',
      '..............B....................................B........B.......',
      '..............B....................................B........B.......',
      '..............B..........o...............o.........B.....C..B.......',
      '..............B....................................B.....H..B..o.EE.',
      '..1.2..H......U..C.C............C..................I...BBBB.B....EE.',
      '##########uu###########^^^^^^#######MMM.......#ii###################',
      '####################################..........######################',
    ] },
  ],
  tests(assert, { makeWorld, simulate }) {
    const game = this;
    // one player cannot move a heavy crate, two pushing the same way can, and a light crate cannot shove it
    let w = makeWorld({ rows: ['..............', '.12.H.........', '##############'] }, game);
    const h = w.crates[0], x0 = h.x;
    simulate(w, 1.5, [{ x: 1 }, {}]);
    assert(Math.abs(h.x - x0) < 0.01, 'heavy: one player cannot move a heavy crate');
    simulate(w, 1.5, [{ x: 1 }, { x: 1 }]);
    assert(h.x - x0 > 2, `heavy: two players push a heavy crate (${(h.x - x0).toFixed(2)} tiles)`);
    w = makeWorld({ rows: ['..............', '.12C.H........', '##############'] }, game);
    simulate(w, 1.5, [{ x: 1 }, {}]);
    assert(Math.abs(w.crates[1].x - 5.01) < 0.01, 'heavy: a light crate pushed by one player does not shove a heavy crate');
    w = makeWorld({ rows: ['..........', '.1.H.2....', '##########'] }, game);
    simulate(w, 1.5, [{ x: 1 }, { x: -1 }]);
    assert(Math.abs(w.crates[0].x - 3.01) < 0.01, 'heavy: pushing from both sides does nothing');
    // a crate pushed into a bottomless gap comes back to its start
    w = makeWorld({ rows: ['..........', '..........', '.1C.......', '####...###', '.........2', '.........#'] }, game);
    const c = w.crates[0];
    let low = 0;
    simulate(w, 1, [(ww) => { low = Math.max(low, c.y); return { x: 1 }; }, {}]);
    assert(low > 3, 'heavy: the crate falls into the gap');
    simulate(w, 2);
    assert(c.alive && Math.abs(c.x - 2.01) < 0.01 && Math.abs(c.y - 2.02) < 0.05, 'heavy: the lost crate comes back to its start');
  },
};
