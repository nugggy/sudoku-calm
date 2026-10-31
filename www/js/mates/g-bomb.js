// Bomb Squad: bomb boxes ('D') hand you a bomb when you press Throw next to them with empty hands. Carry it
// over your head and throw it (a high lob when standing still, a long throw when running). A thrown bomb lands,
// fizzes for 1.5 seconds and goes off: it smashes cracked blocks, beetles and anyone standing too close.
// Your mate can catch a bomb in the air, or grab a fizzing one to reset its fuse.
import { moveX, moveY } from './engine.js';
import { roundRect } from './draw.js';

const R = 0.25, FUSE = 1.5, MAX = 6;
const centre = (b) => [b.x + R, b.y + R];

function burst(w, x, y, colour, n, speed, size, life = 0.6, up = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.9);
    w.data.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, t: 0, life: life * (0.6 + Math.random() * 0.6), colour, size: size * (0.6 + Math.random() * 0.8) });
  }
}

function heldPos(b, p) { b.x = p.x + p.w / 2 - R; b.y = p.y - R * 2 - 0.05; }

function throwBomb(w, p) {
  const b = p.bomb, still = !p.in.x;
  p.bomb = null; heldPos(b, p);
  Object.assign(b, { state: 'fly', by: null, thrower: p, throwT: w.t, on: null, ground: false,
    vx: still ? p.face * 3.5 : p.face * 7 + p.vx * 0.3, vy: still ? -15 : -11 });
  w.emit('throw', b.x + R, b.y + R, p);
}

function explode(w, b) {
  b.dead = true;
  const [x, y] = centre(b);
  for (let r = Math.floor(y - 2); r <= Math.floor(y + 2); r++) for (let c = Math.floor(x - 2); c <= Math.floor(x + 2); c++) {
    if (w.tile(c, r)?.kind === 'crack' && Math.hypot(c + 0.5 - x, r + 0.5 - y) < 1.6) { w.set(c, r, '.'); burst(w, c + 0.5, r + 0.5, '#9c8f84', 8, 5, 0.12, 0.7, 3); }
  }
  for (const e of w.walkers) if (e.alive && Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y) < 1.7) { e.alive = false; e.deadT = 0; }
  for (const p of w.players) {
    if (p.dead) continue;
    const dx = p.x + p.w / 2 - x, d = Math.hypot(dx, p.y + p.h / 2 - y);
    if (d < 1.5) w.kill(p, 'bomb');
    else if (d < 2.8) Object.assign(p, { vx: (dx < 0 ? -1 : 1) * 10, vy: -9, on: null, ground: false, noCut: true });
  }
  for (const o of w.data.bombs) if (!o.dead && o !== b && o.state !== 'held' && Math.hypot(o.x - b.x, o.y - b.y) < 1.7) { o.state = 'lit'; o.fuse = Math.min(o.fuse ?? FUSE, 0.12); }
  burst(w, x, y, '#ffb52e', 22, 9, 0.2, 0.5); burst(w, x, y, '#ff5a2b', 14, 6, 0.16, 0.45); burst(w, x, y, 'rgba(90,90,90,.7)', 12, 2.5, 0.35, 0.9, 1.5);
  w.data.flash.push({ x, y, t: 0 });
  w.emit('boom', x, y);
}

function fizzle(w, b) { b.dead = true; burst(w, b.x + R, b.y + R, 'rgba(255,255,255,.8)', 8, 2, 0.15); w.emit('fizzle', b.x + R, b.y + R); }

function stepBomb(w, b, dt) {
  if (b.state === 'held') return;
  if (b.on?.kind === 'plat') { b.x += b.on.dx || 0; b.y += b.on.dy || 0; }
  b.vy = Math.min(w.P.fall, b.vy + w.P.g * dt);
  b.ground = false; b.on = null;
  const want = b.vx * dt, moved = moveX(w, b, want);
  if (Math.abs(moved) < Math.abs(want) - 1e-6) b.vx = -b.vx * 0.3; // knock back off walls
  moveY(w, b, b.vy * dt);
  if (b.ground) { b.vx = 0; if (b.state === 'fly') { b.state = 'lit'; b.fuse = FUSE; w.emit('bombLand', b.x + R, b.y + R * 2); } }
  const t = w.tile(Math.floor(b.x + R), Math.floor(b.y + R));
  if (b.y > w.H + 2 || t?.kind === 'water' || t?.kind === 'lava') { fizzle(w, b); return; }
  if (b.state === 'fly') {
    for (const p of w.players) {
      if (p.dead || p.bomb || (p === b.thrower && w.t - b.throwT < 0.35)) continue;
      if (Math.abs(b.x + R - (p.x + p.w / 2)) < 0.7 && Math.abs(b.y + R - (p.y + p.h / 2)) < 0.85) { b.state = 'held'; b.by = p; p.bomb = b; w.emit('catch', b.x + R, b.y, p); return; }
    }
  } else {
    b.fuse -= dt;
    if (Math.random() < dt * 30) burst(w, b.x + R + 0.12, b.y - 0.12, b.fuse < 0.5 ? '#ff4040' : '#ffd23f', 1, 1.5, 0.06, 0.3, 1);
    if (b.fuse <= 0) explode(w, b);
  }
}

export default {
  id: 'bomb', name: 'Bomb Squad', blurb: 'Blast through cracked walls with bombs. Stand well back', actLabel: 'Throw',
  how: [
    'Stand next to a bomb box and press Throw to take a bomb. Press Throw again to toss it: stand still for a high lob, or run for a long throw.',
    'A bomb fizzes for a moment after it lands, then goes off. It smashes cracked blocks and beetles, and it will knock you out if you are too close, so stand well back.',
    'Your mate can catch a bomb in the air. Press Throw next to a fizzing bomb to pick it up again before it goes off.',
  ],
  theme: { sky: ['#ffc59a', '#fff0df'], hills: ['#e0a878', '#c98a5e'], ground: '#80583d', brick: '#9a5a48' },
  tiles: {
    D: { solid: true, kind: 'dispenser', draw(g, c, r, w, cam, t) {
      g.fillStyle = '#4a4f5c'; g.fillRect(c, r, 1, 1);
      g.fillStyle = '#ffcf3f'; for (let k = 0; k < 4; k++) g.fillRect(c + k * 0.25, r, 0.13, 0.12);
      g.fillStyle = '#2a2d35'; roundRect(g, c + 0.15, r + 0.25, 0.7, 0.6, 0.1); g.fill();
      g.fillStyle = '#16181d'; g.beginPath(); g.arc(c + 0.5, r + 0.6, 0.2, 0, 7); g.fill();
      g.fillStyle = '#ff7a2b'; g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5 + c); g.beginPath(); g.arc(c + 0.62, r + 0.38, 0.05, 0, 7); g.fill(); g.globalAlpha = 1;
    } },
  },
  setup(w) { w.data.bombs = []; w.data.fx = []; w.data.flash = []; },
  act(w, p) {
    if (p.bomb) { throwBomb(w, p); return; }
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const near = w.data.bombs.find((b) => !b.dead && b.state === 'lit' && Math.abs(b.x + R - cx) < 0.9 && Math.abs(b.y + R - cy) < 1);
    if (near) { Object.assign(near, { state: 'held', by: p, fuse: FUSE }); p.bomb = near; heldPos(near, p); w.emit('grab', cx, p.y, p); return; }
    const box = w.cells(p.x - 0.4, p.y, p.w + 0.8, p.h).some(([c, r]) => w.tile(c, r)?.kind === 'dispenser');
    if (box && w.data.bombs.filter((b) => !b.dead).length < MAX) {
      const b = { x: 0, y: 0, w: R * 2, h: R * 2, vx: 0, vy: 0, gdir: 1, on: null, ground: false, state: 'held', by: p, bomb: true };
      w.data.bombs.push(b); p.bomb = b; heldPos(b, p); w.emit('grab', cx, p.y, p);
    }
  },
  update(w, dt) {
    for (const p of w.players) if (p.bomb) heldPos(p.bomb, p);
    for (const b of w.data.bombs) if (!b.dead) stepBomb(w, b, dt);
    w.data.bombs = w.data.bombs.filter((b) => !b.dead);
    for (const f of w.data.fx) { f.t += dt; f.vy += 12 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.98; }
    w.data.fx = w.data.fx.filter((f) => f.t < f.life);
    for (const f of w.data.flash) f.t += dt;
    w.data.flash = w.data.flash.filter((f) => f.t < 0.4);
  },
  onDie(w, p) { if (p.bomb) { fizzle(w, p.bomb); p.bomb = null; } },
  drawMid(g, w, view, t) {
    for (const b of w.data.bombs) {
      if (b.dead) continue;
      const [x, y] = centre(b), warn = b.state === 'lit' && b.fuse < 0.6 && Math.floor(t * 12) % 2 === 0;
      g.fillStyle = warn ? '#d83a2e' : '#22252c'; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - 0.08, y - 0.08, 0.07, 0, 7); g.fill();
      g.fillStyle = '#6c7686'; g.fillRect(x + 0.04, y - R - 0.06, 0.12, 0.1);
      g.strokeStyle = '#c9a36b'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(x + 0.1, y - R - 0.05); g.quadraticCurveTo(x + 0.18, y - R - 0.2, x + 0.12, y - R - 0.24); g.stroke();
      if (b.state === 'lit') { g.fillStyle = Math.floor(t * 20) % 2 ? '#ffd23f' : '#ff7a2b'; g.beginPath(); g.arc(x + 0.12, y - R - 0.25, 0.07, 0, 7); g.fill(); }
    }
  },
  drawFront(g, w) {
    for (const f of w.data.flash) {
      const k = f.t / 0.4;
      g.globalAlpha = (1 - k) * 0.8; g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(f.x, f.y, 0.4 + k * 1.4, 0, 7); g.fill();
      g.globalAlpha = (1 - k) * 0.6; g.strokeStyle = '#ffb52e'; g.lineWidth = 0.12; g.beginPath(); g.arc(f.x, f.y, 0.6 + k * 1.8, 0, 7); g.stroke();
    }
    g.globalAlpha = 1;
    for (const f of w.data.fx) {
      g.globalAlpha = Math.max(0, 1 - f.t / f.life); g.fillStyle = f.colour;
      g.beginPath(); g.arc(f.x, f.y, f.size, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  },
  drawScreen(g, w, cam) {
    const f = w.data.flash[w.data.flash.length - 1];
    if (f && f.t < 0.12) { g.fillStyle = `rgba(255,250,230,${0.35 * (1 - f.t / 0.12)})`; g.fillRect(0, 0, cam.W, cam.H); }
  },
  sound(e, snd) {
    if (e.k === 'boom') { snd.whack(1.6); snd.thud(); }
    else if (e.k === 'throw') snd.swoosh();
    else if (e.k === 'grab') snd.pop();
    else if (e.k === 'catch') snd.ding(5);
    else if (e.k === 'bombLand') snd.tick();
    else if (e.k === 'fizzle') snd.spit();
  },
  levels: [
    { name: 'Boom', tip: 'Take a bomb from the box and throw it at the cracked wall', rows: [
      '..............B.........B...............',
      '..............B.........B...............',
      '..............B.........B...............',
      '..............B.........B...............',
      '..............B.........B...............',
      '..............B.........B...............',
      '.........o....B....o....B....o..........',
      '..............x.........x.........EE....',
      '..12..D.......x.........x.........EE....',
      '########################################',
    ] },
    { name: 'Stand clear', tip: 'Bombs clear beetles too. Keep your distance', rows: [
      '............................B...............',
      '............................B...............',
      '............................B...............',
      '............................B...............',
      '............................B...............',
      '....................o.......B...............',
      '............................B......o........',
      '............B...............x...........EE..',
      '..12.D......B.....e....e....x...........EE..',
      '############################################',
    ] },
    { name: 'Cover me', tip: 'One holds the plate while the other fetches a bomb', rows: [
      '......................B.....................',
      '......................B.....................',
      '......................B.....................',
      '......................B.....................',
      '......................B.....................',
      '...........BBBBB......B.....................',
      '...........B...B..o...B...........o.........',
      '...........B...B......x.................EE..',
      '..1.2...u..U..DB......x.......e.........EE..',
      '############################################',
    ] },
    { name: 'Special delivery', tip: 'Jump and throw a bomb up to your mate', rows: [
      '......................B.....................',
      '......................B.....................',
      '......................B.....................',
      '......................B.....................',
      '.................o....x.......o.............',
      '......................x....u................',
      '............BBBBBBBBBBBBBBBBBBBBBB..........',
      '.......o....BBBBBBBBBBBBBBBBBBBBBB..........',
      '............BBBBBBBBBBBBBBBBBBBBBB......EE..',
      '..1.D.2.............U...................EE..',
      '############################################',
    ] },
    { name: 'Going down', tip: 'Blast a hole in the cracked floor', rows: [
      '............................................',
      '............................................',
      '..........o.................................',
      '............................................',
      '..12...D....................................',
      '##############xxx###########################',
      '..........................B.................',
      '..........................B.................',
      '...................o......B......o..........',
      '..........................x.............EE..',
      '..........D.........e.....x.............EE..',
      '############################################',
    ] },
    { name: 'Over the wall', tip: 'Lob the bomb over. Grab it before it goes off', rows: [
      '........................B...................',
      '........................B...................',
      '........................B...................',
      '........................B...................',
      '...............B........B...................',
      '...............B...o....B...................',
      '........o......B........B........o..........',
      '...............B........x...............EE..',
      '..1..D.........U.....2..x...u...........EE..',
      '############################################',
    ] },
    { name: 'Upstairs', tip: 'Bombs fly up through the ledges', rows: [
      '............B...........B...................',
      '............B...........B...................',
      '......o.....B...........B....o..............',
      '............x...........x...................',
      '..1.........x....e......x.....u.............',
      '########===########===##############........',
      '.................................B..........',
      '.................................B..........',
      '...............o.................B..o.......',
      '.................................B......EE..',
      '..2..D...........................U......EE..',
      '############################################',
    ] },
    { name: 'Demolition', tip: 'Blast, boost and deliver', rows: [
      '......................................B.....................',
      '......................................B.....................',
      '........o.............................B.....................',
      '......................................B.....................',
      '..1.2.D...............................B.....................',
      '############xxx###########............B.....................',
      '......................B...........o...x.....................',
      '......................B...............x...u.................',
      '..................o...B.......BBBBBBBBBBBBBBBB..............',
      '......................B.......BBBBBBBBBBBBBBBB....o.........',
      '......................x.......BBBBBBBBBBBBBBBB.........EE...',
      '.................e....x....D..........U................EE...',
      '############################################################',
    ] },
  ],
  tests(assert, { makeWorld, simulate }) {
    const game = this;
    const press = (w, i, extra = {}) => { const a = [{}, {}]; a[i] = { act: true, actP: true, ...extra }; simulate(w, 1 / 120, a); };
    // take a bomb, throw it at a cracked block: the block breaks and the thrower is safe
    let w = makeWorld({ rows: ['..........', '..........', '.1D...x..2', '##########'] }, game);
    press(w, 0);
    assert(w.players[0].bomb, 'bomb: the box hands out a bomb');
    press(w, 0, { x: 1 });
    assert(!w.players[0].bomb && w.data.bombs[0]?.state === 'fly', 'bomb: Throw sends it flying');
    simulate(w, 0.8);
    assert(w.data.bombs[0]?.state === 'lit' && w.get(6, 2) === 'x', 'bomb: it lands and fizzes before going off');
    simulate(w, 1.5);
    assert(w.get(6, 2) === '.', 'bomb: the blast breaks the cracked block');
    assert(!w.players[0].dead && !w.data.bombs.length, 'bomb: the thrower is out of range and the bomb is gone');
    // a bomb knocks out a player standing next to it
    w = makeWorld({ rows: ['............', '............', '1D...2......', '############'] }, game);
    press(w, 0);
    press(w, 0, { x: 1 });
    simulate(w, 2.5);
    assert(w.deaths === 1 && w.players[1].dead, 'bomb: the blast knocks out a player next to it');
    // the partner catches a thrown bomb in the air
    w = makeWorld({ rows: ['..........', '..........', '1D..2.....', '##########'] }, game);
    press(w, 0);
    press(w, 0, { x: 1 });
    simulate(w, 0.6);
    assert(w.players[1].bomb, 'bomb: the partner catches it');
  },
};
