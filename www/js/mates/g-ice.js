// Slippery Slopes: a snowy hillside. Ice floors keep you sliding (the engine's slip handling), and ice blocks
// glide on once pushed, one tile at a time, until they hit something or reach an edge, where they drop. A block
// that drops into a hole fills it level with the floor, and a block can rest on a plate in a slot.
import { moveX, overlap } from './engine.js';
import { roundRect } from './draw.js';

const SLIDE = 8; // tiles per second
// Ice blocks are crates one full tile tall (a normal crate is 0.98), so one in a hole sits flush with the floor.
// crate: false means they never shove other crates along (players still push them), so a block dropping into a
// hole cannot be knocked sideways by the one behind it.
const makeBlock = (c, r) => ({ kind: 'crate', crate: false, ice: true, x: c + 0.01, y: r, w: 0.98, h: 1, lx: c + 0.01,
  vx: 0, vy: 0, gdir: 1, ground: false, on: null, dx: 0, dy: 0, alive: true, slide: 0, to: 0 });
const resting = (b) => b.ground && (b.on === 'tile' || !!(b.on && b.on.kind === 'crate'));
// Sets a block sliding towards the next whole tile in direction dir.
function start(w, b, dir) {
  b.slide = dir;
  b.to = (dir > 0 ? Math.floor(b.x - 0.01 + 1e-6) + 1 : Math.ceil(b.x - 0.01 - 1e-6) - 1) + 0.01;
  w.emit('slide', b.x + b.w / 2, b.y + b.h);
}

// Is there something to rest on under column c, just below a block whose bottom is at row rb?
function held(w, b, c, rb) {
  if (w.solidAt(c, rb, b) || w.tile(c, rb)?.oneway) return true;
  const box = { x: c + 0.3, y: rb + 0.05, w: 0.4, h: 0.4 };
  return w.crates.some((o) => o !== b && o.alive && overlap(o, box)) || w.plats.some((pl) => pl.alive && overlap(pl, box));
}
function slide(w, b, dt) {
  let left = SLIDE * dt;
  while (left > 1e-9 && b.slide) {
    if ((b.to - b.x) * b.slide <= 1e-6) { // reached (or was pushed past) the next tile
      const c = Math.round(b.to - 0.01);
      if (!held(w, b, c, Math.round(b.y + b.h))) { b.x = b.to; b.slide = 0; break; }
      b.to += b.slide; continue;
    }
    const step = Math.min(left, Math.abs(b.to - b.x)), nx = b.x + b.slide * step;
    if (w.players.some((p) => !p.dead && p.on !== b && overlap(p, { x: nx, y: b.y + 0.05, w: b.w, h: b.h - 0.1 }))) { b.slide = 0; break; }
    const d = moveX(w, b, b.slide * step);
    if (Math.abs(d) < step - 1e-6) {
      // hitting a resting ice block passes the slide on to it, like a row of marbles
      const edge = b.slide > 0 ? b.x + b.w : b.x;
      const o = w.crates.find((q) => q !== b && q.ice && q.alive && !q.slide && resting(q) && b.y + 0.01 < q.y + q.h && q.y + 0.01 < b.y + b.h && Math.abs((b.slide > 0 ? q.x : q.x + q.w) - edge) < 0.05);
      if (o) start(w, o, b.slide); else w.emit('thunk', b.x + b.w / 2, b.y + b.h);
      b.slide = 0; break;
    }
    left -= step;
  }
}

const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
const game = {
  id: 'ice', name: 'Slippery Slopes', blurb: 'Slide on ice and push sliding blocks', noAct: true,
  how: [
    'Ice is slippery. Once you get going it takes a while to stop, so start braking early and take short hops.',
    'Push an ice block and it keeps sliding until it hits something. At an edge or a hole it drops, and a block in a hole makes the floor whole again.',
    'Blocks can hold down plates, and you can stand on them to reach higher. You can always stand on your mate\'s head too.',
  ],
  theme: { sky: ['#b9d4ee', '#eef6fc'], ground: '#7b8ca3', top: '#f4f9ff', edge: '#56667c', brick: '#8b9bb0', ledge: '#a9b8ca', hills: ['#dde9f5', '#c7d9eb'], deco: 'hills' },
  tiles: {
    '%': { solid: true, ice: true, kind: 'ice',
      draw(g, c, r, w) {
        const open = !w.solidAt(c, r - 1, {});
        g.fillStyle = '#a9d8ef'; g.fillRect(c, r, 1, 1);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(c, r + 0.5, 1, 0.5);
        if (open) { g.fillStyle = '#eefaff'; g.fillRect(c, r, 1, 0.16); }
        g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.05; g.beginPath(); g.moveTo(c + 0.2, r + 0.75); g.lineTo(c + 0.45, r + 0.3); g.moveTo(c + 0.55, r + 0.8); g.lineTo(c + 0.7, r + 0.52); g.stroke();
        g.strokeStyle = 'rgba(60,120,160,.35)'; g.strokeRect(c + 0.025, r + 0.025, 0.95, 0.95);
      } },
  },
  levels: [
    { name: 'First frost', tip: 'Ice is slippery. Brake early',
      rows: [
        '....................................................',
        '....................................................',
        '....................................................',
        '......................o.o...........................',
        '..........o..........%%%%%....o.....................',
        '..............................................EE....',
        '.12..............................^^...........EE....',
        '#####%%%%%%%%%%...########%%%%%%%%%%%%%#############',
        '###############...##################################',
      ] },
    { name: 'Into the slot', tip: 'Push the block. It slides on its own',
      rows: [
        '......................#...........................',
        '......................#...........................',
        '......................#...........................',
        '......................#...........................',
        '..........o.......o...U...........o...............',
        '......................U......................EE...',
        '.12..Z................U........^....^........EE...',
        '##############u###########%%%%%%%%%%%%%###########',
        '##################################################',
      ] },
    { name: 'Fill the gaps', tip: 'A block in a hole fixes the floor',
      rows: [
        '..........###############################.............',
        '..........###############################.............',
        '..........###############################.............',
        '..........###############################.............',
        '.....o....###############################....o........',
        '..........###############################.......EE....',
        '.12.........Z..o......Z..........o..............EE....',
        '#################^##########^#%%%%%%%%%%%#############',
        '######################################################',
      ] },
    // the wall is 5 high: two stacked blocks and a boost, which the reach check cannot stack for itself
    { name: 'Stack up', tip: 'Push the top block down to your mate', reach: { extraUp: 1 },
      rows: [
        '............................................',
        '............................................',
        '............................................',
        '..............................o.......EE....',
        '........................Z.............EE....',
        '....................########################',
        '....................########################',
        '..........o...o.....########################',
        '....................########################',
        '.12...Z.............########################',
        '############################################',
        '############################################',
      ] },
    { name: 'Thin ice', tip: 'Land softly on the ice pillars',
      rows: [
        '........................................................',
        '........................................................',
        '......................o.................................',
        '.....................%%%........o.......................',
        '............o........%%%.......%%%......................',
        '...........%%%.......%%%..%%%..%%%......................',
        '......%%%..%%%..%%%..%%%..%%%..%%%..%%%............EE...',
        '.12...%%%..%%%..%%%..%%%..%%%..%%%..%%%............EE...',
        '####^^%%%^^%%%^^%%%^^%%%^^%%%^^%%%^^%%%^^###############',
        '########################################################',
      ] },
    { name: 'Two slots', tip: 'Push the second block from the right',
      rows: [
        '................#.................#.....................',
        '................#.................#.....................',
        '................#.................#.....................',
        '................#.................#.....................',
        '................#.................#.....................',
        '..........o.....U.....o...........I.........o...........',
        '................U.................I................EE...',
        '.12..Z..........U........Z........I......^.........EE...',
        '############u####i#%%%%%%%%%%%%#####%%%%%%%%%%%#########',
        '########################################################',
      ] },
    { name: 'Three in a row', tip: 'Knock the blocks off the shelves first',
      rows: [
        '......................###################...............',
        '......................###################...............',
        '......................###################...............',
        '......................###################...............',
        '............oZ...oZ...###################...............',
        '............###..###..###################....o..........',
        '......................###################.........EE....',
        '.12.....Z.......................o.................EE....',
        '########################^^^#%%%%%%%%%%%%%###############',
        '########################################################',
      ] },
    { name: 'Avalanche', tip: 'Everything you have learnt', reach: { extraUp: 1 }, // the same 5 high wall
      rows: [
        '....................#.................................................',
        '....................#.................................................',
        '....................#.................................................',
        '....................#................o................................',
        '....................#.............Z.................o.................',
        '....................#.........###########.............................',
        '....................#.........###########..........%%%................',
        '..........o.........U.........###########.....%%%..%%%..%%%...o.......',
        '....................U.........###########.....%%%..%%%..%%%......EE...',
        '.12...Z.............U...Z.....###########...^^%%%^^%%%^^%%%......EE...',
        '####%%%%%%%%%%%%u#####################################################',
        '######################################################################',
      ] },
  ],
  setup(w) {
    for (let r = 0; r < w.H; r++) for (let c = 0; c < w.W; c++) if (w.grid[r][c] === 'Z') { w.crates.push(makeBlock(c, r)); w.grid[r][c] = '.'; }
  },
  update(w, dt) {
    for (const b of w.crates) {
      if (!b.ice || !b.alive) continue;
      // a block that lands on someone's head knocks them aside instead of riding along
      if (b.on && b.on.player) { const p = b.on; b.on = null; moveX(w, p, (p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1) * 3 * dt); }
      const moved = b.x - b.lx;
      if (!b.slide && Math.abs(moved) > 1e-4 && resting(b)) start(w, b, Math.sign(moved));
      if (b.slide) slide(w, b, dt);
      b.lx = b.x;
    }
  },
  drawMid(g, w) {
    for (const b of w.crates) {
      if (!b.ice || !b.alive) continue;
      g.fillStyle = '#c4ecfb'; roundRect(g, b.x, b.y, b.w, b.h, 0.1); g.fill();
      g.strokeStyle = '#6fb4d6'; g.lineWidth = 0.06; roundRect(g, b.x + 0.03, b.y + 0.03, b.w - 0.06, b.h - 0.06, 0.08); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.75)'; roundRect(g, b.x + 0.14, b.y + 0.12, 0.42, 0.14, 0.06); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.05; g.beginPath(); g.moveTo(b.x + 0.3, b.y + 0.8); g.lineTo(b.x + 0.7, b.y + 0.4); g.stroke();
    }
  },
  drawFront(g, w, view, t) {
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 70; i++) {
      const x = view.x + (((hash(i, 1) * view.w + t * 0.4 + Math.sin(t * 0.8 + i) * 0.5) % view.w) + view.w) % view.w;
      const y = view.y + ((hash(i, 2) * view.h + t * (0.8 + hash(i, 3) * 1.2)) % view.h);
      g.beginPath(); g.arc(x, y, 0.04 + hash(i, 4) * 0.06, 0, 7); g.fill();
    }
  },
  sound(e, snd) { if (e.k === 'slide') snd.swoosh(); else if (e.k === 'thunk') snd.thud(); },
  tests(assert, { makeWorld, simulate }) {
    // on ice you keep going after letting go, on ground you stop
    const glide = (floor) => { const w = makeWorld({ rows: ['2...............', '##..............', '1...............', floor] }, game); simulate(w, 0.8, [{ x: 1 }, {}]); simulate(w, 0.25); return w.players[0].vx; };
    assert(glide('%'.repeat(16)) > 3 && glide('#'.repeat(16)) < 0.5, 'ice: players slide on ice');
    // a block keeps sliding after a short push, until the wall
    let w = makeWorld({ rows: ['2.............', '##............', '1.Z...........', '##############'] }, game);
    simulate(w, 0.35, [{ x: 1 }, {}]);
    simulate(w, 2);
    const b = w.crates[0];
    assert(b.x > 12.9 && w.players[0].x < 4, 'ice: a pushed block slides on to the wall');
    // it drops into a hole and fills it flush
    w = makeWorld({ rows: ['2...........', '##..........', '1.Z.........', '######^#####', '############'] }, game);
    simulate(w, 0.35, [{ x: 1 }, {}]);
    simulate(w, 2);
    const h = w.crates[0];
    assert(Math.abs(h.x - 6.01) < 0.01 && Math.abs(h.y - 3) < 0.01, 'ice: a block drops into a hole and fills it');
    simulate(w, 1.6, [{ x: 1 }, {}]);
    assert(w.deaths === 0 && w.players[0].x > 8, 'ice: you can walk over a filled hole');
    // a block stops at a mate standing in its way
    w = makeWorld({ rows: ['............', '1.Z.....2...', '############'] }, game);
    simulate(w, 0.35, [{ x: 1 }, {}]);
    simulate(w, 1.5);
    assert(w.crates[0].x + w.crates[0].w <= w.players[1].x + 0.01, 'ice: a sliding block stops at a player');
  },
};
export default game;
