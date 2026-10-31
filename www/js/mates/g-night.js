// Night Lights: every level is dark. Pip starts with a lantern that lights a wide circle, and each mate glows a
// little on their own. The Lantern button puts it down or picks it up (or takes it from your mate), so whoever
// needs the light can carry it. Lamp posts stay lit once touched. Spikes only show up in the light, while
// fireflies (the coins), doors and beetle eyes glow faintly in the dark.
import { BASE_TILES, moveY } from './engine.js';
import { roundRect } from './draw.js';

const LANTERN = 5, GLOW = 2, LAMP = 4;
const lanternAt = (L) => [L.x + L.w / 2, L.y + L.h / 2];

// Every light in the world as { x, y, r } in tiles.
export function lights(w) {
  const out = w.players.filter((p) => !p.dead).map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2, r: GLOW }));
  const L = w.data.lan;
  if (L && !(L.by && L.by.dead)) { const [x, y] = lanternAt(L); out.push({ x, y, r: LANTERN }); }
  for (const k of Object.keys(w.data.lit || {})) { const [c, r] = k.split(',').map(Number); out.push({ x: c + 0.5, y: r + 0.2, r: LAMP }); }
  return out;
}

function drawLantern(g, x, y, t, lit = true) {
  g.fillStyle = '#4a3b2a'; g.fillRect(x - 0.03, y - 0.42, 0.06, 0.12);
  g.strokeStyle = '#4a3b2a'; g.lineWidth = 0.04; g.beginPath(); g.arc(x, y - 0.42, 0.08, Math.PI, 0); g.stroke();
  g.fillStyle = '#5c4a36'; roundRect(g, x - 0.17, y - 0.32, 0.34, 0.08, 0.03); g.fill(); roundRect(g, x - 0.17, y + 0.12, 0.34, 0.08, 0.03); g.fill();
  g.fillStyle = lit ? `rgba(255,${200 + Math.sin(t * 9) * 20 | 0},90,.95)` : '#8a7a5a';
  roundRect(g, x - 0.13, y - 0.24, 0.26, 0.36, 0.06); g.fill();
}

const shade = {}; // the offscreen darkness layer, made on first draw
const game = {
  id: 'night', name: 'Night Lights', blurb: 'Share one lantern through the dark', actLabel: 'Lantern',
  how: [
    'It is night, and only Pip\'s lantern lights up much of anything. You each glow a little, enough to see right around you.',
    'Press Lantern to put it down where you stand, or to pick it up when you are close. You can also take it from your mate. Whoever goes first through the dark usually wants it.',
    'Touch a lamp post to light it for good. Spikes only show up in the light, but fireflies, doors and beetle eyes glow in the dark.',
  ],
  theme: { sky: ['#070a1e', '#1b2350'], ground: '#3d3852', top: '#58708f', edge: '#221e30', brick: '#4a3f5e', ledge: '#6a5a7a', hills: ['#141a38', '#10152e'], deco: 'stars', night: true, water: '#2a5a8a' },
  tiles: {
    o: { ...BASE_TILES.o, draw() {} }, // fireflies are drawn over the darkness
    l: { kind: 'lamp', touch(w, b, c, r) { const k = `${c},${r}`; if (b.player && !w.data.lit[k]) { w.data.lit[k] = true; w.emit('lamp', c + 0.5, r + 0.2, b); } },
      draw(g, c, r, w, cam, t) {
        g.fillStyle = '#2d2a3a'; g.fillRect(c + 0.44, r - 0.4, 0.12, 1.4); g.fillRect(c + 0.3, r + 0.9, 0.4, 0.1);
        drawLantern(g, c + 0.5, r - 0.3, t, !!w.data.lit[`${c},${r}`]);
      } },
  },
  levels: [
    { name: 'Lights out', tip: 'Pip has the lantern. Stay close',
      rows: [
        '................................................',
        '................................................',
        '................................................',
        '........................oo......................',
        '.............o.........####.....................',
        '.........................................o..EE..',
        '.12......^^...................^^^...........EE..',
        '################...#################...#########',
        '################...#################...#########',
      ] },
    { name: 'Pass the light', tip: 'Hand the lantern over at the gate',
      rows: [
        '............#.......................................',
        '............#.......................................',
        '............#.......................................',
        '............#.......................................',
        '............#.......................................',
        '............#......o................................',
        '............U................o..............o.......',
        '............U........###......................EE....',
        '.12.....u...U...^^...###.^^^...u.........^....EE....',
        '###################################...##############',
        '###################################...##############',
      ] },
    { name: 'Lamp posts', tip: 'Touch a lamp post to light it',
      rows: [
        '..........................................#.............',
        '..........................................#.............',
        '..........................................#.............',
        '..................o.l.o...................#.............',
        '...........o.....######...................U.............',
        '..........................................U.............',
        '..........................................U........EE...',
        '.12.l....^^...#................l..^^^.u...U..u..l..EE...',
        '#########################....###########################',
        '#########################....###########################',
      ] },
    { name: 'Key in the dark', tip: 'The key is up high. Give your mate a boost',
      rows: [
        '..............................#...........................',
        '..............................#...........................',
        '..............................#...........................',
        '..............................#...........................',
        '..........o.k.................#...........................',
        '.........#####................#...........................',
        '...........................o..#.........o.................',
        '..............................#......................EE...',
        '.12..............^^...........K..l....e.....^^.......EE...',
        '######################...#################################',
        '######################...#################################',
      ] },
    { name: 'Night crawlers', tip: 'Watch for glowing eyes',
      rows: [
        '............................................................',
        '............................................................',
        '............................................................',
        '............................................................',
        '............o..............o.o..............................',
        '..........................#####.............................',
        '........................................................EE..',
        '.12..l....e...........e..........F........l.e...^^......EE..',
        '###############...###################....###################',
        '###############...###################....###################',
      ] },
    { name: 'Hold the light', tip: 'Knock the crate down onto the plate',
      rows: [
        '.................#........................................',
        '.................#...............o........................',
        '.................#........................................',
        '.................#.................i......................',
        '.........oC......#..............#####.....................',
        '........###......U......o.......#####.....................',
        '.................U..............#####...............EE....',
        '.12........uu....U...^^...l.....I.......l...^^......EE....',
        '##########################################################',
        '##########################################################',
      ] },
    { name: 'Bounce and ride', tip: 'Leave the lantern where it helps',
      rows: [
        '............................................................',
        '..................................................o....EE...',
        '............o.o.............................||.........EE...',
        '..........######...............................#############',
        '............................................................',
        '..............................o..o..........................',
        '............................................................',
        '............................................................',
        '...................|MMM...............|.....................',
        '.12.l...s................................l..NN..............',
        '###################^^^^^^^^^^^^^^^^^^^######################',
        '############################################################',
      ] },
    { name: 'Long night', tip: 'Flags save your place',
      rows: [
        '........................................#.............................',
        '........................................#.........................EE..',
        '........................................#.....................o...EE..',
        '........................................#................#############',
        '........................................#.............................',
        '.............................oo.........#.............................',
        '............o...............####........#........o....................',
        '........................................U.............................',
        '........................................U.............................',
        '.12..l....^^........F.....e.....e.l..u..U..u..l..^^^.l.s..............',
        '###############...####################################################',
        '###############...####################################################',
      ] },
  ],
  setup(w) {
    const p = w.players[0];
    w.data.lit = {};
    w.data.lan = { x: p.x, y: p.y, w: 0.4, h: 0.5, vx: 0, vy: 0, gdir: 1, ground: false, on: null, by: p, last: p };
  },
  act(w, p) {
    const L = w.data.lan, [lx, ly] = lanternAt(L);
    if (L.by === p) { L.by = null; L.x = p.x + p.w / 2 - L.w / 2; L.y = p.y + p.h - L.h; L.vy = 0; w.emit('drop', lx, ly, p); }
    else if (Math.hypot(lx - (p.x + p.w / 2), ly - (p.y + p.h / 2)) < 1.4) { L.by = p; L.last = p; w.emit('grab', lx, ly, p); }
  },
  update(w, dt) {
    const L = w.data.lan;
    if (L.by) { const p = L.by; L.x = p.x + p.w / 2 - L.w / 2 + p.face * 0.32; L.y = p.y + 0.05; L.vy = 0; return; }
    L.vy = Math.min(w.P.fall, L.vy + w.P.g * dt);
    L.ground = false; moveY(w, L, L.vy * dt);
    if (L.y > w.H + 2) L.by = L.last; // dropped down a hole: back to whoever had it last
  },
  drawMid(g, w, view, t) {
    const L = w.data.lan;
    if (!(L.by && L.by.dead)) drawLantern(g, L.x + L.w / 2, L.y + 0.32, t);
  },
  drawScreen(g, w, cam, t) {
    if (typeof document === 'undefined') return;
    const W = Math.ceil(cam.W), H = Math.ceil(cam.H);
    const cv = shade.cv || (shade.cv = document.createElement('canvas'));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const s = cv.getContext('2d');
    s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, W, H);
    s.fillStyle = 'rgba(4,6,20,.95)'; s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = 'destination-out';
    for (const l of lights(w)) {
      const x = (l.x - cam.x) * cam.s, y = (l.y - cam.y) * cam.s, r = (l.r + Math.sin(t * 7 + l.x) * 0.06) * cam.s;
      const gr = s.createRadialGradient(x, y, r * 0.3, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      s.fillStyle = gr; s.beginPath(); s.arc(x, y, r, 0, 7); s.fill();
    }
    g.drawImage(cv, 0, 0, cam.W, cam.H);
    // things that glow on their own, drawn over the dark in tile units
    g.save(); g.scale(cam.s, cam.s); g.translate(-cam.x, -cam.y);
    const c0 = Math.max(0, Math.floor(cam.x)), c1 = Math.min(w.W, Math.ceil(cam.x + cam.vw) + 1);
    const r0 = Math.max(0, Math.floor(cam.y)), r1 = Math.min(w.H, Math.ceil(cam.y + cam.vh) + 1);
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      const k = w.tile(c, r)?.kind;
      if (k === 'coin') {
        const x = c + 0.5 + Math.sin(t * 1.3 + c * 2.1) * 0.15, y = r + 0.5 + Math.sin(t * 1.7 + r * 1.3) * 0.12, a = 0.55 + 0.45 * Math.sin(t * 4 + c + r);
        g.globalAlpha = 0.35 * a; g.fillStyle = '#d8ff7a'; g.beginPath(); g.arc(x, y, 0.32, 0, 7); g.fill();
        g.globalAlpha = 0.6 + 0.4 * a; g.fillStyle = '#f4ffb0'; g.beginPath(); g.arc(x, y, 0.1, 0, 7); g.fill();
      } else if ((k === 'exit' || k === 'exit1' || k === 'exit2') && w.tile(c, r + 1)?.kind !== k && w.tile(c - 1, r)?.kind !== k) {
        let top = r; while (w.tile(c, top - 1)?.kind === k) top--;
        let wd = 1; while (w.tile(c + wd, r)?.kind === k) wd++;
        const h = Math.max(1.4, r + 1 - top);
        g.globalAlpha = 0.3 + 0.1 * Math.sin(t * 2); g.strokeStyle = '#c9a8ff'; g.lineWidth = 0.06;
        roundRect(g, c + 0.14, r + 1 - h + 0.06, wd - 0.28, h - 0.06, Math.min(0.45, wd / 2 - 0.15)); g.stroke();
      } else if (k === 'lamp' && w.data.lit[`${c},${r}`]) {
        g.globalAlpha = 0.9; g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(c + 0.5, r - 0.24, 0.1, 0, 7); g.fill();
      }
    }
    g.globalAlpha = 0.85; g.fillStyle = '#ffe14a';
    for (const e of w.walkers) if (e.alive) { const x = e.x + e.w / 2 + e.dir * 0.15, y = e.y + e.h - 0.3; g.beginPath(); g.arc(x - 0.09, y, 0.05, 0, 7); g.arc(x + 0.09, y, 0.05, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    g.restore();
  },
  sound(e, snd) { if (e.k === 'lamp') snd.ding(4); else if (e.k === 'grab' || e.k === 'drop') snd.pop(); },
  tests(assert, { makeWorld, simulate }) {
    const press = (w2, p, i) => (i === 0 ? { actP: true } : {});
    let w = makeWorld({ rows: ['..........', '.1....2..l', '##########'] }, game);
    const [pip, bo] = w.players, L = w.data.lan;
    assert(L.by === pip, 'night: Pip starts with the lantern');
    const ls = lights(w).map((l) => l.r).sort();
    assert(ls.join() === [GLOW, GLOW, LANTERN].sort().join() && LANTERN >= 4.5 && GLOW <= 2.5, 'night: a big lantern light and a small glow each');
    simulate(w, 0.6, [press, {}]);
    assert(!L.by && Math.abs(L.y + L.h - 2) < 0.01, 'night: Lantern drops it at your feet');
    simulate(w, 0.6, [{}, { x: -1 }]);
    simulate(w, 0.1, [{}, press]);
    assert(L.by === bo, 'night: Bo picks it up when close');
    simulate(w, 1, [{}, { x: 1 }]);
    assert(Math.abs(lanternAt(L)[0] - (bo.x + bo.w / 2)) < 0.6 && bo.x > 6, 'night: the lantern follows whoever carries it');
    assert(Object.keys(w.data.lit).length === 1 && lights(w).some((l) => l.r === LAMP), 'night: touching a lamp post lights it');
    simulate(w, 0.1, [{}, press]);
    simulate(w, 0.1, [{}, press]);
    assert(L.by === bo, 'night: picking up again works');
  },
};
export default game;
