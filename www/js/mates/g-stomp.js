// Bug Stomp: a one-screen arena with pipes in the roof that drop waves of beetles. Stomp every beetle to clear the
// wave. Each wave brings more and faster beetles, then red ones that take two stomps and green ones that hop.
// Bumping a beetle any other way costs one of 5 shared hearts. Score: waves cleared.
import { mulberry, moveY } from './engine.js';
import { roundRect } from './draw.js';
import { reachable } from './g-lava.js';

const W = 26, H = 14, HEARTS = 5, PAUSE = 2;
const KINDS = { plain: '#8a4fd8', tough: '#e0533d', hop: '#3fae5a' };

// Mirrored rows of platforms 3 apart, two or three pipes in the roof. Pieces nobody could reach are removed.
function gen(seed) {
  const rng = mulberry(seed), ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (c, r, ch) => { g[r][c] = ch; g[r][W - 1 - c] = ch; };
  for (let r = 0; r < H; r++) put(0, r, 'B');
  g[H - 1].fill('#');
  const side = ri(3, 7);
  for (const r of [0, 1]) { put(side, r, 'P'); put(side + 1, r, 'P'); }
  if (rng() < 0.6) for (const r of [0, 1]) put(12, r, 'P');
  for (const r of [10, 7, 4]) {
    let c = ri(1, 3);
    while (c <= 12) {
      const len = ri(3, 5), ch = r < 10 && rng() < 0.25 ? '#' : '=';
      for (let k = 0; k < len && c + k <= 12; k++) put(c + k, r, ch);
      c += len + ri(2, 4);
    }
  }
  g[H - 2][11] = '1'; g[H - 2][14] = '2';
  const rr = reachable(g.map((row) => row.join('')));
  for (const [c, r] of rr.all) if (!rr.has(c, r) && r + 1 < H - 1 && g[r + 1][c] !== 'P') g[r + 1][c] = '.';
  return { name: 'Bug Stomp', rows: g.map((row) => row.join('')) };
}

// Wave n: more beetles, a little faster each time; red two-stompers from wave 3, hoppers from wave 5.
function waveOf(w, n) {
  const count = Math.min(14, 2 + n), tough = n >= 3 ? Math.min(4, Math.floor((n - 1) / 2)) : 0, hop = n >= 5 ? Math.min(4, Math.floor((n - 3) / 2)) : 0;
  const list = [...Array(tough).fill('tough'), ...Array(hop).fill('hop')];
  while (list.length < count) list.push('plain');
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(w.rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
function spawn(w, kind) {
  const d = w.data, [c] = d.pipes[Math.floor(w.rng() * d.pipes.length)];
  const e = { kind: 'walker', x: c + 0.6, y: 2.05, w: 0.8, h: 0.65, dir: w.rng() < 0.5 ? -1 : 1, vx: 0, vy: 0, gdir: 1, ground: false, on: null, dx: 0, dy: 0, alive: true,
    beetle: kind, colour: KINDS[kind], hp: kind === 'tough' ? 2 : 1, drop: true, hopT: 1, speed: Math.min(4.2, w.P.walker * (1 + 0.07 * d.waves)) };
  w.walkers.push(e);
  w.emit('drop', e.x + 0.4, 2);
  return e;
}

export default {
  id: 'stomp', name: 'Bug Stomp', blurb: 'Stomp every beetle the pipes drop', noAct: true,
  how: [
    'Beetles drop out of the pipes in the roof. Jump on them from above to stomp them. Stomp every beetle to clear the wave.',
    'Each wave brings more beetles, and they get quicker. Red beetles take two stomps, and green ones hop about.',
    'Bumping into a beetle any other way costs one of your 5 shared hearts. Your score is the number of waves you clear.',
  ],
  theme: { sky: ['#4a5d8f', '#c7a6c9'], hills: ['#6d7fa6', '#56688f'], ground: '#6b5a48', top: '#6fbf5a' },
  endless: { unit: 'waves', unit1: 'wave', gen },
  tiles: {
    P: { solid: true, kind: 'pipe', draw(g, c, r, w) {
      const L = w.get(c + 1, r) === 'P' && w.get(c - 1, r) !== 'P', mouth = w.get(c, r + 1) !== 'P';
      g.fillStyle = '#3f9a4e'; g.fillRect(L ? c + 0.12 : c, r, 0.88, 1);
      g.fillStyle = 'rgba(255,255,255,.22)'; if (L) g.fillRect(c + 0.25, r, 0.16, 1);
      if (mouth) { g.fillStyle = '#4fb85e'; roundRect(g, L ? c : c - 0.02, r + 0.5, 1.02, 0.5, 0.08); g.fill(); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(c, r + 0.9, 1, 0.1); }
      if (mouth && L) { g.fillStyle = '#1d2a22'; g.beginPath(); g.ellipse(c + 1, r + 1, 0.62, 0.1, 0, 0, 7); g.fill(); }
    } },
  },
  setup(w) {
    const pipes = [];
    for (let c = 0; c < w.W; c++) if (w.get(c, 1) === 'P' && w.get(c + 1, 1) === 'P' && w.get(c - 1, 1) !== 'P') pipes.push([c]);
    Object.assign(w.data, { pipes, hearts: HEARTS, waves: 0, stomped: 0, queue: [], state: 'wait', pause: 1.5, spawnT: 0, bannerT: 0 });
  },
  update(w, dt) {
    const d = w.data;
    w.walkers = w.walkers.filter((e) => e.alive || (e.deadT || 0) < 0.5);
    if (d.state === 'wait') {
      if ((d.pause -= dt) <= 0) { d.queue = waveOf(w, d.waves + 1); d.state = 'wave'; d.spawnT = 0; d.bannerT = 1.6; }
    } else {
      if (d.queue.length && (d.spawnT -= dt) <= 0) { spawn(w, d.queue.shift()); d.spawnT = Math.max(0.35, 0.9 - d.waves * 0.04); }
      if (!d.queue.length && !w.walkers.some((e) => e.alive)) { d.waves++; d.state = 'wait'; d.pause = PAUSE; w.emit('cleared', W / 2, 3); }
    }
    d.bannerT -= dt;
  },
  walker(w, e, dt) {
    // still falling out of a pipe: harmless until it lands
    if (e.drop) { e.vy = Math.min(w.P.fall, e.vy + w.P.g * dt); e.ground = false; e.on = null; moveY(w, e, e.vy * dt); if (e.ground) e.drop = false; return false; }
    if (e.stun > 0) { e.stun -= dt; if (e.stun <= 0) e.colour = KINDS.plain; return false; }
    if (e.beetle === 'hop' && e.ground && (e.hopT -= dt) <= 0) { e.vy = -12; e.hopT = 1.1 + w.rng() * 1.3; }
  },
  onStomp(w, e) {
    const d = w.data;
    // a red beetle shrugs off the first stomp (stunned for a moment so the bounce cannot hurt you)
    if (--e.hp > 0) { e.alive = true; e.stun = 0.5; e.colour = '#f2a3d0'; return; }
    d.stomped++;
  },
  onDie(w, p) {
    const d = w.data;
    d.hearts = Math.max(0, d.hearts - 1);
    if (!d.hearts) w.finish(d.waves, `${d.stomped} ${d.stomped === 1 ? 'beetle' : 'beetles'} stomped.`);
  },
  camera(w, cam) { const s = Math.min(cam.W / w.W, cam.H / (w.H + 0.5)); return { x: w.W / 2, y: w.H / 2, s: Math.max(s, cam.sMin * 0.7) }; },
  hud(w) {
    const d = w.data, n = d.state === 'wave' ? d.waves + 1 : d.waves;
    return { left: '♥'.repeat(d.hearts) + '♡'.repeat(HEARTS - d.hearts), center: n ? `Wave ${n}` : 'Get ready', right: `${d.waves} cleared` };
  },
  sound(e, snd) { if (e.k === 'cleared') snd.ding?.(8); else if (e.k === 'drop') snd.pop?.(); },
  drawScreen(g, w, cam) {
    const d = w.data;
    if (d.bannerT <= 0) return;
    const k = Math.min(1, d.bannerT * 2);
    g.globalAlpha = k; g.font = `900 ${Math.round(Math.min(cam.H * 0.14, 48))}px system-ui, sans-serif`; g.textAlign = 'center';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.35)'; g.fillStyle = '#fff';
    const txt = `Wave ${d.waves + 1}`;
    g.strokeText(txt, cam.W / 2, cam.H * 0.42); g.fillText(txt, cam.W / 2, cam.H * 0.42);
    g.globalAlpha = 1;
  },
  tests(assert, { makeWorld, simulate }) {
    const game = this;
    assert(JSON.stringify(gen(6)) === JSON.stringify(gen(6)), 'stomp: generation follows the seed');
    for (const seed of [1, 2, 3, 99, 4242, 12345]) {
      const lv = gen(seed), rr = reachable(lv.rows);
      assert(rr.all.every(([c, r]) => rr.has(c, r)), `stomp seed ${seed}: every platform can be reached`);
      assert(lv.rows.length === H && lv.rows[0].length === W && (lv.rows[1].match(/P/g) || []).length >= 4, `stomp seed ${seed}: one screen with pipes`);
    }
    const stompAll = (w) => {
      const p = w.players[0];
      for (let n = 0; n < 40 && w.walkers.some((e) => e.alive); n++) {
        const e = w.walkers.find((x) => x.alive);
        if (e.stun > 0 || e.drop) { simulate(w, 0.1); continue; }
        p.x = e.x + 0.04; p.y = e.y - p.h + 0.15; p.vy = 4; p.vx = 0;
        w.step();
      }
    };
    // wave 1 drops 3 beetles; stomping them all clears the wave
    let w = makeWorld(gen(4), game, { seed: 4 });
    w.players.forEach((p) => { p.safe = 1e9; });
    simulate(w, 1.6 + 3 + 2);
    assert(!w.data.queue.length && w.walkers.filter((e) => e.alive && !e.drop).length === 3 && w.data.waves === 0, 'stomp: wave 1 drops three beetles');
    stompAll(w); simulate(w, 0.1);
    assert(w.data.waves === 1 && w.data.stomped === 3, 'stomp: stomping every beetle clears the wave');
    // a red beetle needs two stomps
    w = makeWorld(gen(4), game, { seed: 4 });
    w.players.forEach((p) => { p.safe = 1e9; });
    w.data.pause = 1e9;
    const e = spawn(w, 'tough');
    simulate(w, 2);
    const p = w.players[0];
    p.x = e.x + 0.04; p.y = e.y - p.h + 0.15; p.vy = 4; w.step();
    assert(e.alive && e.hp === 1, 'stomp: a red beetle survives one stomp');
    simulate(w, 0.7); stompAll(w);
    assert(!e.alive && w.data.stomped === 1, 'stomp: a second stomp finishes it');
    // later waves are bigger, with tougher beetles
    const later = waveOf(w, 7);
    assert(later.length === 9 && later.includes('tough') && later.includes('hop'), 'stomp: later waves bring red and hopping beetles');
    // five knocks and the game is over
    w = makeWorld(gen(4), game, { seed: 4 }); w.data.pause = 1e9;
    for (let i = 0; i < HEARTS; i++) { const q = w.players[0]; q.safe = 0; w.kill(q, 'walker'); simulate(w, 1); }
    assert(!!w.over && w.over.score === 0 && /stomped/.test(w.over.line), 'stomp: losing all 5 hearts ends the game');
  },
};
