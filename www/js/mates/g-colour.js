// Colour Blocks: everything orange is only real for Pip and everything blue only for Bo. Orange blocks are solid
// for Pip and a ghost for Bo (blue the other way round), and coloured spikes only hurt their own player. Crates
// and beetles bump into both colours. Walk through your mate's walls and carry each other over your own bridges.
import { overlap } from './engine.js';
import { COLOURS, DARK } from './draw.js';

const ghostFor = (w, who, c, r) => { const q = w.players[1 - who]; return !q.dead && overlap(q, { x: c, y: r, w: 1, h: 1 }); };
const block = (who) => ({
  kind: 'cblock', who, solid: (w, b) => !b.player || b.id === who,
  draw(g, c, r, w) {
    const same = (x, y) => w.tile(x, y)?.kind === 'cblock' && w.tile(x, y).who === who;
    g.globalAlpha = ghostFor(w, who, c, r) ? 0.35 : 0.92;
    g.fillStyle = COLOURS[who]; g.fillRect(c, r, 1, 1);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(c + 0.14, r + 0.14, 0.72, 0.72);
    g.strokeStyle = DARK[who]; g.lineWidth = 0.07; g.beginPath();
    if (!same(c, r - 1)) { g.moveTo(c, r + 0.035); g.lineTo(c + 1, r + 0.035); }
    if (!same(c, r + 1)) { g.moveTo(c, r + 0.965); g.lineTo(c + 1, r + 0.965); }
    if (!same(c - 1, r)) { g.moveTo(c + 0.035, r); g.lineTo(c + 0.035, r + 1); }
    if (!same(c + 1, r)) { g.moveTo(c + 0.965, r); g.lineTo(c + 0.965, r + 1); }
    g.stroke();
    g.fillStyle = DARK[who]; g.beginPath(); g.arc(c + 0.5, r + 0.5, 0.1, 0, 7); g.fill();
    g.globalAlpha = 1;
  },
});
const spikes = (who) => ({
  kind: 'cspikes', who,
  hazard: (w, p, c, r) => p.id === who && p.x + 0.08 < c + 0.88 && c + 0.12 < p.x + p.w - 0.08 && r + 0.5 < p.y + p.h - 0.08 && p.y + 0.08 < r + 1,
  draw(g, c, r) {
    g.fillStyle = COLOURS[who]; g.strokeStyle = DARK[who]; g.lineWidth = 0.04; g.beginPath();
    for (let k = 0; k < 3; k++) { const x = c + 0.06 + k * 0.3; g.moveTo(x, r + 1); g.lineTo(x + 0.15, r + 0.45); g.lineTo(x + 0.3, r + 1); }
    g.fill(); g.stroke();
  },
});

const game = {
  id: 'colour', name: 'Colour Blocks', blurb: 'Orange is real for Pip, blue is real for Bo', noAct: true,
  how: [
    'Everything orange is only real for Pip, and everything blue is only real for Bo. Pip stands on orange blocks and walks straight through blue ones. Bo is the other way round.',
    'Coloured spikes only hurt the player of the same colour. Crates bump into both colours.',
    'If your mate cannot cross your colour, let them stand on your head and carry them over.',
  ],
  theme: { sky: ['#ffe3ef', '#e3f2ff'], hills: ['#f5c8dc', '#c3dbf5'], top: '#7fcf6a' },
  tiles: { P: block(0), Q: block(1), p: spikes(0), q: spikes(1) },
  // coloured spikes are safe for one of you
  reach: { safe: (w, c, r) => 'pq'.includes(w.get(c, r)) },
  levels: [
    { name: 'See-through', tip: 'Your colour is solid. The other is a ghost',
      rows: [
        '................................................',
        '................................................',
        '................................................',
        '..........oo.......oo...........................',
        '..........PP.......QQ...........................',
        '..........PP.......QQ.......o.......o.......EE..',
        '.12.......PP.......QQ.......................EE..',
        '###########################PPPP####QQQ##########',
        '###########################....####...##########',
      ] },
    { name: 'Give us a lift', tip: 'Ride your mate over their bridge',
      rows: [
        '....................................................',
        '....................................................',
        '....................................................',
        '....................................................',
        '............o.o..............o.o....................',
        '........................................o.....EE....',
        '.12...........................................EE....',
        '#########QQQQQQQQQ########PPPPPPPPP#################',
        '#########^^^^^^^^^########^^^^^^^^^#################',
      ] },
    { name: 'Two rooms', tip: 'Only one of you fits in each room',
      rows: [
        '..................#...............................',
        '..................#...............................',
        '..................#...............................',
        '..#######.........#...............................',
        '..#.....P.........U.............o.o...............',
        '..#..o..P.........U.........................EE....',
        '..#..u..P..12.....U.........................EE....',
        '#######################QQQQ#######################',
        '#######################o.u.#######################',
        '##################################################',
      ] },
    { name: 'Spike tunnels', tip: 'Coloured spikes only hurt their own colour',
      rows: [
        '........############........############................',
        '........############........############................',
        '........############........############................',
        '........############........############................',
        '.......................o.o..............................',
        '.............o...................o..............EE......',
        '.12.......pppppppp............qqqqqqqq..........EE......',
        '########################################################',
        '########################################################',
      ] },
    { name: 'Push and shove', tip: 'Crates bump into both colours',
      rows: [
        '.........................#.....................#............',
        '.........................#.....................#............',
        '.........................#.....................#............',
        '.........................#.....................#............',
        '.........................U.....................I............',
        '............o.........o..U........o............I............',
        '....................#....U................#....I.....EE.....',
        '.12...C............u#....U..C............i#....I.....EE.....',
        '########QQQQQQQQQ#############PPPPPPPPP#####################',
        '########^^^^^^^^^#############^^^^^^^^^#####################',
      ] },
    { name: 'Climb together', tip: 'Pip makes a step for Bo at the top',
      rows: [
        '........................................',
        '...............o........o...............',
        '...................EE...................',
        '...................EE...................',
        '..............############..............',
        '........................................',
        '.........o..............................',
        '........PPP................PP..o........',
        '..............................QQQ.......',
        '........................................',
        '...PPP............................QQQ...',
        '........................................',
        '..................1..2..................',
        '########################################',
      ] },
    { name: 'Swap over', tip: 'Change places where the colours meet',
      rows: [
        '........#############################...................',
        '........#############################...................',
        '........#############################...................',
        '........#############################...................',
        '..........................................o.o...........',
        '.............o......o......o....o..............EE.......',
        '.12........ppppppqqqqqq..qqqqqppppp............EE.......',
        '########################################################',
        '########################################################',
      ] },
    { name: 'Rainbow road', tip: 'Everything you have learnt',
      rows: [
        '.....................................................#............',
        '.....................................................#............',
        '.................................o...................#............',
        '.....................................................#............',
        '...............................qqqqqq................#............',
        '.......oo..................##################........#............',
        '.......PP.....o............##################..#####.U............',
        '.......PP...............PP.##################..P.o.#.U........EE..',
        '.12....PP..................##################..P.u.#.U........EE..',
        '############QQQQQQ######################################QQQ#######',
        '############^^^^^^######################################ou.#######',
        '##################################################################',
      ] },
  ],
  tests(assert, { makeWorld, simulate }) {
    let w = makeWorld({ rows: ['..........', '.12..Q....', '##########'] }, game);
    simulate(w, 1, [{ x: 1 }, { x: 1 }]);
    assert(w.players[0].x > 6 && w.players[1].x + w.players[1].w <= 5.01, 'colour: Pip walks through blue, Bo is stopped');
    w = simulate(makeWorld({ rows: ['C12.', 'PPPP', '....', '####'] }, game), 1);
    assert(w.players[0].y < 1 && w.players[1].y > 2 && w.crates[0].y < 1, 'colour: orange holds Pip and crates, Bo falls through');
    w = simulate(makeWorld({ rows: ['1..2', 'pppp', '####'] }, game), 0.5);
    assert(w.players[0].dead && !w.players[1].dead && w.deaths === 1, 'colour: orange spikes only hurt Pip');
    // Pip rides on Bo across a blue bridge
    w = makeWorld({ rows: ['...........', '.1.........', '.2.........', '###QQQQQ###', '...........'] }, game);
    simulate(w, 0.6);
    simulate(w, 1.3, [{}, { x: 1 }]);
    assert(w.deaths === 0 && w.players[0].x > 8 && w.players[0].on === w.players[1], 'colour: Bo carries Pip over blue');
  },
};
export default game;
