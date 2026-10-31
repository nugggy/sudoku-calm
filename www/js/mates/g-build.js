// Block Builders: the action button puts a block from a shared pot in front of your feet (or under you in the
// air, so you can jump and build a pillar). Press it while facing a placed block to take it back. Each level
// sets the size of the pot (level.blocks), and loose blocks (Q in the level text) can be picked up too.
import { roundRect, COLOURS, DARK } from './draw.js';

const key = (c, r) => `${c},${r}`;
const bodies = (w) => [...w.players.filter((p) => !p.dead), ...w.crates.filter((b) => b.alive), ...w.walkers.filter((e) => e.alive), ...w.plats.filter((b) => b.alive)];
const blocked = (w, c, r) => bodies(w).some((b) => b.x < c + 1 - 0.02 && c + 0.02 < b.x + b.w && b.y < r + 1 - 0.02 && r + 0.02 < b.y + b.h);
// someone stands on the cell, so taking it away would drop them
const stoodOn = (w, c, r) => bodies(w).some((b) => Math.abs(b.y + b.h - r) < 0.06 && b.x < c + 1 && c < b.x + b.w);

function act(w, p) {
  const fr = Math.floor(p.y + p.h - 0.01), cx = p.x + p.w / 2, mid = Math.floor(cx);
  if (!p.ground) {
    // in the air the block drops onto whatever is below you (so jumping and building stacks a pillar),
    // or stays right under your feet over a deep drop
    let r = Math.ceil(p.y + p.h - 0.001);
    for (let k = 0; k < 6 && w.get(mid, r + k) === '.'; k++) if (w.get(mid, r + k + 1) !== '.') { r += k; break; }
    return place(w, p, mid, r) || w.emit('nope', cx, p.y, p);
  }
  // cf: the column under your toes, cn: the first column clear in front of you
  const cf = Math.floor(p.face > 0 ? p.x + p.w - 0.001 : p.x + 0.001), cn = cf + p.face;
  const picks = [[cn, fr], [cn, fr + 1], [cn, fr - 1], [cn, fr + 2], [cn, fr + 3], [cn, fr + 4], [cn, fr + 5]];
  if (cf !== mid) picks.splice(2, 0, [cf, fr + 1]);
  for (const [c, r] of picks) {
    if (w.get(c, r) !== 'Q') continue;
    if (stoodOn(w, c, r)) { w.emit('nope', c + 0.5, r + 0.5, p); return; }
    w.set(c, r, '.'); delete w.data.owner[key(c, r)]; w.data.pot++;
    w.emit('pick', c + 0.5, r + 0.5, p);
    return;
  }
  // a hole under your toes, then the floor ahead (bridges), then a step at your feet (stairs)
  for (const [c, r] of [[cf, fr + 1], [cn, fr + 1], [cn, fr]]) if (place(w, p, c, r)) return;
  w.emit('nope', cx, p.y, p);
}
function place(w, p, c, r) {
  if (w.get(c, r) !== '.' || c < 0 || c >= w.W || r < 0 || r >= w.H) return false;
  if (!w.data.pot || blocked(w, c, r)) return false;
  w.set(c, r, 'Q'); w.data.owner[key(c, r)] = p.id; w.data.pot--;
  w.emit('build', c + 0.5, r + 0.5, p);
  return true;
}

function drawBlock(g, c, r, w) {
  const id = w.data.owner?.[key(c, r)];
  const col = id === undefined ? '#d9a35b' : COLOURS[id], dark = id === undefined ? '#9a6a2c' : DARK[id];
  g.fillStyle = dark; roundRect(g, c + 0.02, r + 0.02, 0.96, 0.96, 0.12); g.fill();
  g.fillStyle = col; roundRect(g, c + 0.08, r + 0.06, 0.84, 0.78, 0.1); g.fill();
  g.fillStyle = 'rgba(255,255,255,.3)'; roundRect(g, c + 0.16, r + 0.12, 0.4, 0.14, 0.06); g.fill();
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(c + 0.3, r + 0.55, 0.09, 0, 7); g.arc(c + 0.7, r + 0.55, 0.09, 0, 7); g.fill();
}

export default {
  id: 'build', name: 'Block Builders', blurb: 'Share a pot of blocks to bridge gaps and build stairs', actLabel: 'Build',
  how: [
    'Press Build to put a block down in front of your feet. At the edge of a gap it goes into the gap, so you can bridge it one block at a time.',
    'Jump and press Build to put a block under you. Do it again to build a pillar.',
    'You share one pot of blocks, shown at the top. Press Build while facing a placed or loose block to take it back. Stand on one block and lift the one behind you to carry a bridge along with you.',
  ],
  theme: { sky: ['#ffd9a8', '#fff3df'], hills: ['#e7c79a', '#cfa774'] },
  tiles: { Q: { solid: true, kind: 'block', maybe: true, draw: drawBlock } },
  // blocks can fill any gap and stack up a little, so the reach check may stand over pits
  reach: { extraUp: 3, gap: 7, floor: (w, c, r) => !!w.tile(c, r)?.hazard },
  setup(w) { w.data.pot = w.level.blocks ?? 3; w.data.owner = {}; },
  act,
  hud(w) { return { center: `Blocks ${w.data.pot}` }; },
  sound(e, snd) {
    if (e.k === 'build') snd.thud();
    else if (e.k === 'pick') snd.pop();
    else if (e.k === 'nope') snd.tick();
  },
  tests(assert, { makeWorld, simulate }) {
    const press = (w, who, extra = {}) => simulate(w, 0.02, [0, 1].map((k) => (k === who ? (w, p, i) => ({ act: i === 0, actP: i === 0, ...extra }) : {})));
    // Pip faces right on flat ground with a pot of one
    let w = makeWorld({ blocks: 1, rows: ['..........', '..........', '..........', '.1......2.', '##########'] }, this);
    press(w, 0);
    assert(w.get(2, 3) === 'Q' && w.data.pot === 0, 'build: a block goes in front of your feet and leaves the pot');
    simulate(w, 0.3);
    press(w, 0);
    assert(w.get(2, 3) === '.' && w.data.pot === 1, 'build: pressing again while facing it picks it back up');
    w.data.pot = 0; press(w, 0);
    assert(w.get(2, 3) === '.', 'build: an empty pot builds nothing');
    // never inside a body: Bo stands right in front of Pip
    w = makeWorld({ blocks: 2, rows: ['..........', '..........', '..........', '.12.......', '##########'] }, this);
    press(w, 0);
    assert(w.get(2, 3) === '.' && w.data.pot === 2, 'build: no block inside your mate');
    // at the edge of a pit the block goes into the gap
    w = makeWorld({ blocks: 2, rows: ['..........', '..........', '..........', '..1.....2.', '###...####'] }, this);
    press(w, 0);
    assert(w.get(3, 4) === 'Q', 'build: at an edge the block bridges the gap');
    // jump and build: the block lands on the ground under you
    w = makeWorld({ blocks: 2, rows: ['..........', '..........', '..........', '..........', '..........', '..1.....2.', '##########'] }, this);
    simulate(w, 0.8, [(w, p, i) => ({ jump: true, jumpP: i === 0, act: i === 40, actP: i === 40 }), {}]);
    assert(w.get(2, 5) === 'Q' && w.players[0].y + w.players[0].h < 5.05, 'build: jumping and building makes a pillar to stand on');
  },
  levels: [
    { name: 'First blocks', tip: 'Build at the edge to bridge the gap', blocks: 3, rows: [
      '.',
      '.',
      '.',
      '..............................oo......EE',
      '......................................EE',
      '..........................##################',
      '............oo......o.....##################',
      '..........................##################',
      '.12.......................##################',
      '##########......############################',
      '##########^^^^^^############################',
    ] },
    { name: 'Stairs', tip: 'Build a step, climb on and build the next', blocks: 4, rows: [
      '.',
      '.',
      '...................oo.....o.......EE',
      '..................................EE',
      '................########.....###########',
      '................########.....###########',
      '................########.....###########',
      '.....oo.........########.....###########',
      '................########.....###########',
      '.12.............########^^^^^###########',
      '########################################',
      '########################################',
    ] },
    { name: 'Take it with you', tip: 'Stand on one block and lift the one behind', blocks: 2, rows: [
      '.',
      '.',
      '.',
      '.',
      '.',
      '.',
      '............oo........o.........oo',
      '...............................................EE',
      '.12............................................EE',
      '##########......##############......################',
      '##########^^^^^^##############^^^^^^################',
    ] },
    { name: 'Pillar power', tip: 'Build against the cliff so you can take it back', blocks: 2, rows: [
      '.',
      '.',
      '..........................oo',
      '..................oo.....................EE',
      '.........................................EE',
      '..............##########......################',
      '..............##########......################',
      '.....oo.......##########......################',
      '..............##########......################',
      '.12...........##########^^^^^^################',
      '##############################################',
      '##############################################',
    ] },
    { name: 'Gate keeper', tip: 'Hold the gate open for your builder', blocks: 3, rows: [
      '..........B',
      '..........B',
      '..........B.....................oo.........EE',
      '..........B...............j................EE',
      '........o.B...........##########################',
      '..........J...........##########################',
      '...o......J...........##########################',
      '.......###B....oo.....##########################',
      '..........U...........##########################',
      '.12..u....U...........##########################',
      '################################################',
      '################################################',
    ] },
    { name: 'Loose blocks', tip: 'Face a loose block and press Build to pick it up', blocks: 0, rows: [
      '........................BBBBBBB',
      '........................BBBBBBB',
      '........................BBBBBBB',
      '........................BBBBBBB..............oo..EE',
      '........................BBBBBBB..................EE',
      '........................BBBBBBB.........##############',
      '........................BBBBBBB.........##############',
      '...o..........oo........BBBBBBB.........##############',
      '......QQ................BBBBBBB.........##############',
      '.12...QQ................Q..oo...........##############',
      '############......####################################',
      '############^^^^^^####################################',
    ] },
    { name: 'Bridge relay', tip: 'Carry the bridge across together', blocks: 3, rows: [
      '.',
      '.',
      '.',
      '..............................................o....EE',
      '...................................................EE',
      '........................................################',
      '................o...o...o.........o.....################',
      '........................................################',
      '.12.....................................################',
      '############................############################',
      '############^^^^^^^^^^^^^^^^############################',
    ] },
    { name: 'Top of the tower', tip: 'Bring your blocks with you', blocks: 3, rows: [
      '..................................................o.......EE',
      '..........................................................EE',
      '............................................####################',
      '............................................####################',
      '.................................o....oo....####################',
      '............................................####################',
      '...............................F............####################',
      '............................########......######################',
      '............................########......######################',
      '............oo.....o........########......######################',
      '............................########......######################',
      '.12...................Q.....########^^^^^^######################',
      '##########......################################################',
      '##########^^^^^^################################################',
    ] },
  ],
};
