// Swap Shop: either player presses Swap to trade places with the other in a puff (both must be alive, with a
// short shared cooldown). Glass walls block players but not sight: clear glass (G) stops both, orange glass (P)
// lets only Pip through and blue glass (Q) only Bo. Keys travel with whoever carries them.

const COOL = 0.8;
const TINT = { G: ['rgba(200,240,255,.28)', 'rgba(220,250,255,.9)'], P: ['rgba(255,138,61,.3)', '#ffb27a'], Q: ['rgba(60,156,255,.3)', '#8cc4ff'] };
const glass = (ch, who) => ({
  kind: 'glass', maybe: true, // the swap gets players past glass, so the reachability check treats it as open
  solid: who === undefined ? true : (w, b) => !(b && b.player && b.id === who),
  draw(g, c, r, w) {
    const [fill, edge] = TINT[ch], same = (x, y) => w.get(x, y) === ch;
    g.fillStyle = fill; g.fillRect(c, r, 1, 1);
    g.strokeStyle = edge; g.lineWidth = 0.05; g.beginPath();
    if (!same(c - 1, r)) { g.moveTo(c + 0.03, r); g.lineTo(c + 0.03, r + 1); }
    if (!same(c + 1, r)) { g.moveTo(c + 0.97, r); g.lineTo(c + 0.97, r + 1); }
    if (!same(c, r - 1)) { g.moveTo(c, r + 0.03); g.lineTo(c + 1, r + 0.03); }
    if (!same(c, r + 1)) { g.moveTo(c, r + 0.97); g.lineTo(c + 1, r + 0.97); }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 0.06; g.beginPath(); g.moveTo(c + 0.2, r + 0.75); g.lineTo(c + 0.6, r + 0.25); g.stroke();
  },
});

export default {
  id: 'swap', name: 'Swap Shop', blurb: 'Trade places in a puff of smoke', actLabel: 'Swap',
  how: [
    'Get Pip and Bo to the door. When there are numbered doors, Pip goes in door 1 and Bo in door 2.',
    'Either of you can press Swap to trade places with your mate instantly. It needs a moment to recharge.',
    'Clear glass stops you both. Orange glass lets only Pip through and blue glass lets only Bo through. A key stays with whoever is carrying it.',
  ],
  theme: { sky: ['#f7b8d2', '#fff0f6'], hills: ['#e7a6c8', '#d487b0'] },
  tiles: { G: glass('G'), P: glass('P', 0), Q: glass('Q', 1) },
  preStep(w, dt) { w.sepY = Infinity; w.data.cd = Math.max(0, (w.data.cd || 0) - dt); },
  act(w, p) {
    const q = w.partner(p);
    if (q.dead || w.data.cd > 0) return;
    for (const b of [p, q]) w.emit('warp', b.x + b.w / 2, b.y + b.h / 2, b);
    [p.x, q.x] = [q.x, p.x]; [p.y, q.y] = [q.y, p.y]; [p.gdir, q.gdir] = [q.gdir, p.gdir];
    for (const b of [p, q]) { b.vx = b.vy = 0; b.on = null; b.ground = false; b.coyote = 0; b.buffer = 0; b.squash = 0.6; }
    w.data.cd = COOL;
  },
  // a little ring over each head fills up while the swap recharges
  drawFront(g, w) {
    const k = (w.data.cd || 0) / COOL;
    if (k <= 0) return;
    for (const p of w.players) {
      if (p.dead) continue;
      const x = p.x + p.w / 2, y = p.y - 0.45;
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 0.07; g.beginPath(); g.arc(x, y, 0.16, 0, 7); g.stroke();
      g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, 0.16, -Math.PI / 2, -Math.PI / 2 + (1 - k) * Math.PI * 2); g.stroke();
    }
  },
  levels: [
    { name: 'Trade places', tip: 'Press Swap to trade places', rows: [
      '....................G...................',
      '....................G...................',
      '....................G...................',
      '............oo......G.....oo............',
      '....................G...................',
      '........b...##......G.....##...a........',
      '...1....b...##......G.....##...a....2...',
      '########################################',
    ] },
    { name: 'Orange and blue', tip: 'Orange glass lets Pip through. Blue lets Bo through', rows: [
      '..............P.............Q...............',
      '..............P.............Q...............',
      '..............P.............Q...............',
      '..............P....o.o......Q...............',
      '..............P.............Q...............',
      '........oo....P.............Q....ooo...EE...',
      '...1.2........P....^^^......Q..........EE...',
      '############################################',
    ] },
    { name: 'High seat', tip: 'Hold the plate, then swap down', rows: [
      '.................G......................',
      '.................G.o....................',
      '.................G......................',
      '.................Gu2....................',
      '..................##....................',
      '..................##....................',
      '..................##....................',
      '..................##....................',
      '.......ooo........##....................',
      '..................UU..............EE....',
      '...1..............UU.....ooo......EE....',
      '########################################',
    ] },
    { name: 'The cage', tip: 'Swap your mate into the cage', rows: [
      '................U...........................',
      '................U...........................',
      '................U...........................',
      '................U............GGGGGGG........',
      '................U............G.....G........',
      '........o.o.....U............G.o...G........',
      '................U...ooo......G.....G........',
      '................U......b.....G....aG........',
      '...1....^^^.....U......b.....G2.u.aG........',
      '############################################',
    ] },
    { name: 'Wrong rooms', tip: 'Your door is behind the glass you cannot pass', rows: [
      '.........P..........................Q.........',
      '.........P..........................Q.........',
      '.........P....................oo....Q.........',
      '.........P..........................Q.........',
      '.........P..o..o..............##....Q.........',
      '.........P....................##....Q.........',
      '...b.....P....................##....Q.....a...',
      '...b.oo..P..^^^^.....1.2......##....Q..oo.a...',
      '##############################################',
    ] },
    { name: 'Spring swap', tip: 'One goes up, then swap and go again', rows: [
      '..................P.............Q...........',
      '..................P.............Q..oo.......',
      '..................P.......ooo...Q......EE...',
      '..................P.............Q......EE...',
      '..................P...######################',
      '..................P...######################',
      '..................P...######################',
      '..................P...######################',
      '........ooo.......P...######################',
      '..................P...######################',
      '...1.2............P.s.######################',
      '############################################',
    ] },
    { name: 'Key exchange', tip: 'The key goes where its carrier goes', rows: [
      '............Q.....P...........#.................',
      '............Q.....P...........#.................',
      '............Q.....P...........#.................',
      '............Q.....P...........#.................',
      '............Q.....P...........#.................',
      '............Q.oo..P...ooooo...#.....ooo.........',
      '............Q.....P...........#.............EE..',
      '...1.2......Q...k.P...........K.............EE..',
      '################################################',
    ] },
    { name: 'Swap shop', tip: 'Every trick in the shop', rows: [
      '.............P......Q....P.....#................................',
      '.............P......Qoo..P.ooo.#................................',
      '.............P......Q....P.....#................................',
      '.............P...F..Q..k.P.....K................................',
      '.............P..###################.............................',
      '.............P..###################.............................',
      '.............P..###################.............................',
      '.............P..###################............o..o.............',
      '......ooo....P..###################.....ooooo...................',
      '.............P..###################.......................EE....',
      '...1.2.......P.s###################............^^^^.......EE....',
      '################################################################',
    ] },
  ],
  tests(assert, { makeWorld, simulate }) {
    const room = { rows: ['..........', '..........', '.1....G2..', '##########'] };
    const w = makeWorld(room, this);
    simulate(w, 0.3);
    const [a, b] = w.players, ax = a.x, bx = b.x;
    simulate(w, 0.05, [(ww, p, i) => ({ actP: i === 0 }), {}]);
    assert(Math.abs(a.x - bx) < 0.01 && Math.abs(b.x - ax) < 0.01, 'swap: Swap exchanges positions');
    simulate(w, 0.3, [{}, (ww, p, i) => ({ actP: i === 0 })]);
    assert(Math.abs(a.x - bx) < 0.01, 'swap: the cooldown stops a second swap straight away');
    simulate(w, 0.6);
    simulate(w, 0.05, [{}, (ww, p, i) => ({ actP: i === 0 })]);
    assert(Math.abs(a.x - ax) < 0.01 && Math.abs(b.x - bx) < 0.01, 'swap: Bo can swap back after the cooldown');
    // glass: clear stops both, orange only Bo
    assert(w.solidAt(6, 2, a) && w.solidAt(6, 2, b), 'swap: clear glass blocks both');
    w.set(6, 2, 'P');
    assert(!w.solidAt(6, 2, a) && w.solidAt(6, 2, b), 'swap: orange glass lets only Pip through');
    // no swap while your mate is down
    w.kill(b); simulate(w, 0.5);
    const x1 = a.x;
    simulate(w, 0.05, [(ww, p, i) => ({ actP: i === 0 }), {}]);
    assert(Math.abs(a.x - x1) < 0.01, 'swap: no swap while your mate is respawning');
  },
};
