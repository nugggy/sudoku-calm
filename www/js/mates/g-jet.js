// Jetpack Pals: hold the action button to fly. A tank lasts about 1.2 seconds. It tops up slowly while you stand
// on grass, and all at once when you touch your mate while one of you is standing (a high five). Bricks and
// ledges do not refill, so tall brick shafts are climbed as a relay: one flies up and lands, the other follows.
import { drawPlayer as paintPlayer, roundRect, COLOURS } from './draw.js';

const THRUST = 80, RISE = 7, TANK = 1.2, REFILL = 0.45;
const onGrass = (w, p) => p.ground && p.on === 'tile' && w.tile(Math.floor(p.x + p.w / 2), Math.floor(p.y + p.h + 0.05))?.kind === 'ground';
const touching = (a, b) => !a.dead && !b.dead && Math.abs(a.x - b.x) < a.w + 0.2 && Math.abs(a.y - b.y) < a.h + 0.2;

function fx(w, x, y, colour, n, speed, life = 0.5) {
  for (let i = 0; i < n; i++) { const a = w.rng() * Math.PI * 2, v = speed * (0.3 + w.rng()); w.data.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: life * (0.6 + w.rng() * 0.6), colour }); }
}

export default {
  id: 'jet', name: 'Jetpack Pals', blurb: 'Fly up tall shafts and refuel with a high five', actLabel: 'Jet',
  how: [
    'Hold Jet to fly. The tank empties in about a second, so jump first and save fuel for the climb.',
    'Fuel tops up slowly while you stand on grass. Bricks and wooden ledges do not refill it.',
    'Touch your mate while one of you is standing and you both refill at once. Take turns: one flies up and lands, the other flies up to meet them for a high five.',
  ],
  theme: { sky: ['#7cc4ff', '#e6f4ff'], hills: ['#b9dcb0', '#8ec987'] },
  // flying crosses long pits, so the reach check may treat spikes as somewhere to be
  reach: { up: 9, extraUp: 8, gap: 15, floor: (w, c, r) => !!w.tile(c, r)?.hazard },
  setup(w) { w.data.fx = []; w.players.forEach((p) => { p.fuel = 1; p.jet = false; }); },
  control(w, p, dt) {
    const fly = p.in.act && p.fuel > 0;
    if (fly) {
      if (!p.jet && w.t - (p.jetT ?? -1) > 0.3) { w.emit('jetOn', p.x + p.w / 2, p.y + p.h, p); p.jetT = w.t; }
      if (p.vy > -RISE) p.vy = Math.max(-RISE, p.vy - THRUST * dt);
      p.fuel = Math.max(0, p.fuel - dt / TANK);
      if (!p.fuel) w.emit('empty', p.x + p.w / 2, p.y, p);
    } else if (onGrass(w, p)) p.fuel = Math.min(1, p.fuel + REFILL * dt);
    p.jet = fly;
  },
  update(w, dt) {
    const [a, b] = w.players;
    const near = touching(a, b) && (a.ground || b.ground);
    if (near && !w.data.near && (a.fuel < 0.95 || b.fuel < 0.95)) {
      const x = (a.x + b.x + a.w) / 2, y = Math.min(a.y, b.y) + 0.2;
      w.emit('five', x, y); fx(w, x, y, '#ffd23f', 14, 4); fx(w, x, y, '#fff', 6, 3);
    }
    if (near) a.fuel = b.fuel = 1;
    w.data.near = near;
    for (const p of w.players) if (p.jet && !p.dead && w.rng() < 0.6) w.data.fx.push({ x: p.x + p.w / 2 - p.face * 0.3 + (w.rng() - 0.5) * 0.15, y: p.y + p.h - 0.3, vx: (w.rng() - 0.5) * 1.5, vy: 4 + w.rng() * 3, t: 0, life: 0.25, colour: w.rng() < 0.5 ? '#ffb23f' : '#ff6a2b' });
    for (const f of w.data.fx) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    if (w.data.fx.length > 200 || w.data.fx.some((f) => f.t > f.life)) w.data.fx = w.data.fx.filter((f) => f.t < f.life).slice(-200);
  },
  onRespawn(w, p) { p.fuel = 1; p.jet = false; },
  drawPlayer(g, p, t) {
    if (!p.dead) {
      // the pack sits behind the body
      const x = p.x + p.w / 2 - p.face * 0.38, y = p.y + 0.15;
      g.fillStyle = '#7d8aa0'; roundRect(g, x - 0.14, y, 0.28, 0.5, 0.08); g.fill();
      g.fillStyle = '#4c566a'; g.fillRect(x - 0.1, y + 0.48, 0.2, 0.08);
    }
    paintPlayer(g, p, t);
  },
  drawFront(g, w) {
    for (const f of w.data.fx) { g.globalAlpha = Math.max(0, 1 - f.t / f.life); g.fillStyle = f.colour; g.beginPath(); g.arc(f.x, f.y, 0.09, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    for (const p of w.players) {
      if (p.dead) continue;
      const x = p.x + p.w / 2 - 0.4, y = p.y - 0.95;
      g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, x - 0.04, y - 0.04, 0.88, 0.2, 0.08); g.fill();
      g.fillStyle = p.fuel > 0.3 ? COLOURS[p.id] : '#ff4f6d'; if (p.fuel > 0.01) { roundRect(g, x, y, 0.8 * p.fuel, 0.12, 0.05); g.fill(); }
    }
  },
  sound(e, snd) {
    if (e.k === 'five') { snd.pop(); snd.ding(4); }
    else if (e.k === 'jetOn') snd.swoosh();
    else if (e.k === 'empty') snd.tick();
  },
  tests(assert, { makeWorld, simulate }) {
    const open = Array(12).fill('..............');
    let w = makeWorld({ rows: [...open, '.1.........2..', '##############'] }, this);
    const [a, b] = w.players;
    simulate(w, 0.6, [{ act: true }, {}]);
    assert(a.y + a.h < 10, `jet: holding Jet lifts you (feet at ${(a.y + a.h).toFixed(1)})`);
    simulate(w, 0.8, [{ act: true }, {}]);
    assert(a.fuel === 0, 'jet: the tank runs dry after about 1.2 seconds');
    simulate(w, 2, [{ act: true }, {}]);
    assert(a.ground && a.y + a.h > 12.9, 'jet: with no fuel you fall back down');
    simulate(w, 1);
    assert(a.fuel > 0.3 && a.fuel < 1, 'jet: grass refills the tank slowly');
    // bricks do not refill, but touching your mate does, at once
    w = makeWorld({ rows: [...open, '.1.......2....', 'BBBBBBBBBBBBBB'] }, this);
    const [p, q] = w.players;
    simulate(w, 1.4, [{ act: true }, {}]);
    simulate(w, 2);
    assert(p.fuel === 0 && p.ground, 'jet: bricks do not refill the tank');
    w.ev.length = 0;
    simulate(w, 1.5, [(w, p) => ({ x: q.x - p.x > 0.8 ? 1 : 0 }), {}]);
    assert(p.fuel === 1 && w.ev.some((e) => e.k === 'five'), 'jet: touching your mate refills you with a high five');
  },
  levels: [
    { name: 'Lift off', tip: 'Jump, then hold Jet', rows: [
      '.',
      '.',
      '............................oo.....o',
      '.......................................EE',
      '.........o.............................EE',
      '........o.....############......############',
      '..............############......############',
      '..............############......############',
      '..............############......############',
      '..............############......############',
      '..............############......############',
      '.12...........############^^^^^^############',
      '############################################',
      '############################################',
    ] },
    { name: 'Grass is fuel', tip: 'Wait on the grass until your tank is full', rows: [
      '.',
      '.',
      '.',
      '.',
      '...............o.............o..o.............o..o',
      '............o.....o',
      '.',
      '..........................................................EE',
      '.12.......................................................EE',
      '########..............###..............###..............######',
      '########..............###..............###..............######',
      '########^^^^^^^^^^^^^^###^^^^^^^^^^^^^^###^^^^^^^^^^^^^^######',
    ] },
    { name: 'High five', tip: 'Meet your mate on the bricks to refill', rows: [
      '.',
      '.',
      '.',
      '.',
      '.',
      '.............o...o............o...o............o...o',
      '.',
      '.................................................................EE',
      '.12..............................................................EE',
      '########..............BBB..............BBB..............##############',
      '########..............BBB..............BBB..............##############',
      '########^^^^^^^^^^^^^^BBB^^^^^^^^^^^^^^BBB^^^^^^^^^^^^^^##############',
    ] },
    { name: 'Shaft relay', tip: 'One flies up, the other follows', rows: [
      '.',
      '.',
      '.',
      '...............................o..o..........o.....EE',
      '.....oo............................................EE',
      '..........BBBBBBBBBBBBBBBBB............#################',
      '.........................BB............BBBBBBBBBBBBBBBBB',
      '.........................BB............BBBBBBBBBBBBBBBBB',
      '.........................BB............BBBBBBBBBBBBBBBBB',
      '..................o......BB............BBBBBBBBBBBBBBBBB',
      '.........................BB............BBBBBBBBBBBBBBBBB',
      '.........................BB............BBBBBBBBBBBBBBBBB',
      '.........................BB............BBBBBBBBBBBBBBBBB',
      '.........................BB............BBBBBBBBBBBBBBBBB',
      '..12.....................BB............BBBBBBBBBBBBBBBBB',
      '###########################^^^^^^^^^^^^BBBBBBBBBBBBBBBBB',
    ] },
    { name: 'Special delivery', tip: 'Carry the key to the lock', rows: [
      '..........................................BBBBBBBBBBBBBB',
      '..........................................B',
      '..........................................B',
      '.........................o..o........o....B...o...EE',
      '..................k.......................K.......EE',
      '..............BBBBBBB............#######################',
      '.................................BBBBBBBBBBBBBBBBBBBBBBB',
      '.................................BBBBBBBBBBBBBBBBBBBBBBB',
      '.................................BBBBBBBBBBBBBBBBBBBBBBB',
      '..........o......................BBBBBBBBBBBBBBBBBBBBBBB',
      '.................................BBBBBBBBBBBBBBBBBBBBBBB',
      '.................................BBBBBBBBBBBBBBBBBBBBBBB',
      '.....o...........................BBBBBBBBBBBBBBBBBBBBBBB',
      '.................................BBBBBBBBBBBBBBBBBBBBBBB',
      '..12.............................BBBBBBBBBBBBBBBBBBBBBBB',
      '#################^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
    ] },
    { name: 'Mind your head', tip: 'Tap Jet to skim along', rows: [
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '........vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
      '.',
      '.',
      '................o......o........o',
      '............o.......o.......o.......o',
      '.',
      '......................BBB..........................EE',
      '.12...................BBB..........................EE',
      '########..............BBB..............#################',
      '########^^^^^^^^^^^^^^BBB^^^^^^^^^^^^^^#################',
    ] },
    { name: 'All bricks', tip: 'No grass here. Only a high five refills', rows: [
      '.',
      '.',
      '...........................o.........o...EE',
      '.................o.....o.................EE',
      '................................##############',
      '................................BBBBBBBBBBBBBB',
      '................................BBBBBBBBBBBBBB',
      '...............BBBBB............BBBBBBBBBBBBBB',
      '................................BBBBBBBBBBBBBB',
      '......o.........................BBBBBBBBBBBBBB',
      '................................BBBBBBBBBBBBBB',
      '................................BBBBBBBBBBBBBB',
      '................................BBBBBBBBBBBBBB',
      '................................BBBBBBBBBBBBBB',
      '..12............................BBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBB^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
    ] },
    { name: 'Sky high', tip: 'Flags save your place', rows: [
      '.',
      '.',
      '.........................................................o',
      '.',
      '....EE......o.......o',
      '....EE..............................j',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBJJJBBBBBUUUBBBBB',
      '.',
      '.',
      '...............o...o',
      '...............................o...o',
      '.........................F',
      '........................BBB',
      '.12.....................BBB..................u',
      '##########..............BBB.............########################',
      '##########^^^^^^^^^^^^^^BBB^^^^^^^^^^^^^########################',
    ] },
  ],
};
