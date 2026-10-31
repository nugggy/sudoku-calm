// Rope Mates: Pip and Bo are tied together. After physics the rope pulls them back within its length: a player
// in the air gives way to one on the ground (so you can dangle off a ledge and swing like a pendulum), two in
// the air share the pull, and walking away from a mate who hangs against a wall hauls them up it.
import { moveX, moveY } from './engine.js';

const ROPE = 4.8;
const mid = (p) => [p.x + p.w / 2, p.y + p.h / 2];

// moves p toward its partner; (nx, ny) points from the partner to p. A pull that a wall blocks sideways
// turns into lift while the anchor walks away (the rope slides over the lip like a pulley).
function pull(w, p, dx, dy, nx, ny, haul) {
  const mx = moveX(w, p, dx), lost = Math.abs(dx) - Math.abs(mx);
  if (haul && lost > 1e-4 && dy < -Math.abs(dx) * 0.2) dy -= lost;
  moveY(w, p, dy);
  const vr = p.vx * nx + p.vy * ny;
  if (vr > 0 && !p.ground) { p.vx -= vr * nx; p.vy -= vr * ny; }
}

function tie(w, dt) {
  const [a, b] = w.players;
  w.data.taut = false;
  if (a.dead || b.dead) { w.data.over = 0; return; }
  const [ax, ay] = mid(a), [bx, by] = mid(b);
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d <= ROPE) { w.data.over = 0; return; }
  w.data.taut = true;
  // stretched far (after a respawn, or wedged behind a wall): the one in the air pops over to the other
  w.data.over = d > ROPE + 1.5 ? (w.data.over || 0) + dt : 0;
  if (w.data.over > 0.5) {
    const [m, o] = !a.ground && b.ground ? [a, b] : [b, a];
    m.x = o.x; m.y = o.y - m.h - 0.02; m.vx = m.vy = 0; m.safe = Math.max(m.safe, 0.6); w.data.over = 0;
    w.emit('warp', m.x + m.w / 2, m.y + m.h / 2, m);
    return;
  }
  const nx = dx / d, ny = dy / d, e = Math.min(d - ROPE, 0.5);
  // share of the pull taken by a (b takes the rest)
  let ka = 0.5;
  if (a.ground !== b.ground) ka = a.ground ? 0 : 1;
  else if (a.ground && Math.abs(dy) > 1) ka = dy < 0 ? 1 : 0; // both standing at different heights: the lower one is lifted
  const away = (q, s) => q.ground && Math.abs(q.vx) > 0.5 && Math.sign(q.vx) === s;
  if (ka > 0) pull(w, a, nx * e * ka, ny * e * ka, -nx, -ny, away(b, Math.sign(dx)));
  if (ka < 1) pull(w, b, -nx * e * (1 - ka), -ny * e * (1 - ka), nx, ny, away(a, -Math.sign(dx)));
}

export default {
  id: 'rope', name: 'Rope Mates', blurb: 'Tied together. Hold on, swing and haul each other up', noAct: true,
  how: [
    'Pip and Bo are tied together by a short rope. Get both of you to the purple door.',
    'If one of you steps off a ledge while the other stands still, the rope holds them. Hanging on the rope, move left and right to swing.',
    'Walk away from a mate who is hanging against a wall to haul them up. Boost each other up high walls, then pull the other one after you.',
  ],
  theme: { sky: ['#9fd8c8', '#eefaf4'], hills: ['#a9d9a0', '#83c27a'] },
  preStep(w) {
    w.sepX = w.sepY = Infinity; // the rope is the leash
    for (const p of w.players) {
      const q = w.partner(p);
      p.speed = w.data.taut && p.ground && !q.ground && q.y > p.y + 1 ? 0.6 : 1; // hauling is slower
    }
  },
  // hanging on a taut rope: no air brakes, so the swing keeps going, and left or right pumps it
  control(w, p, dt) {
    if (!w.data.taut || p.ground || w.partner(p).dead) return true;
    p.vx = p.vx * (1 - 0.3 * dt) + p.in.x * 14 * dt;
    if (p.in.x) p.face = Math.sign(p.in.x);
    p.vy = Math.min(w.P.fall, p.vy + w.P.g * dt);
    p.buffer = 0;
    return false;
  },
  update(w, dt) { tie(w, dt); },
  onRespawn(w, p) {
    const q = w.partner(p);
    if (q.dead) return;
    const [px, py] = mid(p), [qx, qy] = mid(q);
    if (Math.hypot(px - qx, py - qy) > ROPE && q.ground && !w.cells(q.x, q.y - p.h - 0.02, p.w, p.h).some(([c, r]) => w.solidAt(c, r, p))) { p.x = q.x; p.y = q.y - p.h - 0.02; }
  },
  drawMid(g, w, view) {
    const [a, b] = w.players;
    if (a.dead || b.dead) return;
    const [ax, ay] = mid(a), [bx, by] = mid(b), d = Math.hypot(bx - ax, by - ay);
    const sag = Math.max(0, ROPE - d) * 0.55;
    const cx = (ax + bx) / 2, cy = (ay + by) / 2 + sag + 0.1;
    g.lineCap = 'round';
    g.strokeStyle = '#7a5a30'; g.lineWidth = 0.11; g.beginPath(); g.moveTo(ax, ay + 0.1); g.quadraticCurveTo(cx, cy, bx, by + 0.1); g.stroke();
    g.strokeStyle = '#d2ac6e'; g.lineWidth = 0.05; g.setLineDash([0.12, 0.1]); g.beginPath(); g.moveTo(ax, ay + 0.1); g.quadraticCurveTo(cx, cy, bx, by + 0.1); g.stroke();
    g.setLineDash([]); g.lineCap = 'butt';
  },
  levels: [
    { name: 'Tied together', tip: 'The rope keeps you close', rows: [
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................ooo.............',
      '..............................===.............',
      '........ooo.............####.............EE...',
      '..12....................####.............EE...',
      '###############~~~############################',
    ] },
    { name: 'Haul away', tip: 'Boost up, then walk away to pull your mate up', rows: [
      '..............................ooo......EE...',
      '.......................................EE...',
      '..........................##################',
      '..........................##################',
      '..................ooo.....##################',
      '..........................##################',
      '..............##############################',
      '..............##############################',
      '......ooo.....##############################',
      '..12..........##############################',
      '############################################',
    ] },
    { name: 'Hold on', tip: 'Step off the edge while your mate holds you', rows: [
      '..............................#.............',
      '..............................#.............',
      '......................ooo.....#.............',
      '........ooo...................#.......EE....',
      '...12.........................K.......EE....',
      '################...#########################',
      '################...#########################',
      '################...#########################',
      '################...#########################',
      '################k..#########################',
      '################~~~#########################',
      '################~~~#########################',
    ] },
    { name: 'Deep end', tip: 'Hold on from the very edge, then swing in', rows: [
      '................................#.............',
      '........................ooo.....#.............',
      '.......ooo......................#.......EE....',
      '...12...........................K.......EE....',
      '################..############################',
      '################..############################',
      '################..############################',
      '################..k.##########################',
      '################....##########################',
      '################..############################',
      '################..############################',
      '################..############################',
      '################^^############################',
      '##############################################',
    ] },
    { name: 'Climbing frame', tip: 'Take turns going first', rows: [
      '..................................................oo..EE..',
      '..............................................############',
      '..............................................############',
      '................................ooo...........############',
      '........................................^^....############',
      '..............................############################',
      '..............................############################',
      '..............ooo.............############################',
      '......................^^^.....############################',
      '..........################################################',
      '..........################################################',
      '.....ooo..################################################',
      '..12......################################################',
      '##########################################################',
    ] },
    { name: 'Doorway', tip: 'Stand in the gate so it stays open', rows: [
      '..................#..........#................',
      '..................#..........#................',
      '..................U..ooo.....I...ooo..........',
      '..................U..........I..........EE....',
      '..12..............U..........I..........EE....',
      '##############..#########..###################',
      '##############o.#########o.###################',
      '##############.u#########.i###################',
      '##############################################',
      '##############################################',
    ] },
    { name: 'Raft', tip: 'Ride together and stay on board', rows: [
      '..............................................................',
      '..........................................................EE..',
      '....................................................o.....EE..',
      '...............................................###############',
      '..................ooo...........ooo............###############',
      '...............................................###############',
      '...12....|MMM............................|.....###############',
      '##########..............oo...............#####################',
      '##########..............##...............#####################',
      '##########~~~~~~~~~~~~~~##~~~~~~~~~~~~~~~#####################',
      '##########~~~~~~~~~~~~~~##~~~~~~~~~~~~~~~#####################',
    ] },
    { name: 'All tied up', tip: 'Everything you know, together', rows: [
      '...................................#........#...............',
      '...................................#........#...............',
      '...................................#........#...ooo.........',
      '..................ooo.........ooo..#........U...............',
      '...................................#........U.........EE....',
      '.................F.................K........U.........EE....',
      '.............############...############..##################',
      '.............############...############o.##################',
      '......ooo....############...############.u##################',
      '..12.........############...################################',
      '#########################k..################################',
      '#########################~~~################################',
      '#########################~~~################################',
    ] },
  ],
  tests(assert, { makeWorld, simulate }) {
    const dist = (w) => { const [a, b] = w.players.map(mid); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    // walking away drags the other along, and the rope never stretches
    let w = makeWorld({ rows: ['..............................', '..............................', '.12...........................', '##############################'] }, this);
    let most = 0;
    const x0 = w.players[1].x;
    simulate(w, 3, [{}, (ww) => { most = Math.max(most, dist(ww)); return { x: 1 }; }]);
    assert(most < ROPE + 0.06, `rope: never stretches past its length (${most.toFixed(2)})`);
    assert(w.players[0].x > 4 && w.players[1].x > x0 + 8, 'rope: walking away drags your mate along');
    // a mate who steps off a ledge over water is held
    w = makeWorld({ rows: ['................', '......1.........', '#########2......', '#########.......', '#########.......', '#########.......', '#########.......', '#########.......', '#########~~~~~~~', '################'] }, this);
    const [a, b] = w.players;
    a.x = 8.2; b.x = 9.1; b.y = 2.2;
    most = 0;
    simulate(w, 2, [{}, (ww) => { most = Math.max(most, dist(ww)); return {}; }]);
    assert(!b.dead && b.y > 4 && b.y < 7, `rope: a dangling mate is held (y ${b.y.toFixed(2)})`);
    assert(most < ROPE + 0.06, 'rope: holds without stretching');
    // walking away hauls them up the wall
    simulate(w, 3, [{ x: -1 }, {}]);
    assert(!b.dead && b.y < 1.5 && b.x < 9, `rope: walking away hauls your mate up (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);
    // a mate let go to the side swings under the anchor to the far side
    w = makeWorld({ rows: ['..................', '........1.........', '........#.........', '..................', '..................', '..................', '..................', '..................', '..................', '..2...............'] }, this);
    const [p, q] = w.players;
    q.x = p.x - ROPE + 0.1; q.y = p.y; q.vx = q.vy = 0;
    let far = q.x;
    simulate(w, 1.6, [{}, (ww, pl) => { far = Math.max(far, pl.x); return {}; }]);
    assert(far > p.x + 2.5, `rope: a hanging mate swings like a pendulum (reached ${(far - p.x).toFixed(2)})`);
  },
};
