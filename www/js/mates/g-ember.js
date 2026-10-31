// Ember and Frost: Pip (Ember) walks on lava and Bo (Frost) walks on water. Lava is deadly to Bo, water to Pip
// and green goo to both. Ride on your mate across their pool, collect your own coloured gems and finish in your
// own door. Plates, crates, a key and levers do the rest.
import { drawTile, drawPlayer, COLOURS, DARK } from './draw.js';

const WATER = { water: '#3e9ce0' };
// A pool is solid underfoot for the one who is safe in it (so they walk across the top) and deadly to anyone
// who sinks in. Goo has no safe player.
const pool = (kind, safe) => ({
  kind, pool: safe, solid: safe < 0 ? false : (w, b) => !!b.player && b.id === safe,
  hazard: (w, p, c, r) => p.id !== safe && p.y + p.h > r + 0.4 && p.x + 0.1 < c + 1 && c < p.x + p.w - 0.1,
  draw: (g, c, r, w, cam, t) => drawTile(g, kind, c, r, w, WATER, t),
});
// A gem only its owner can pick up (counted with the ordinary gems, so the star needs both sets).
const gem = (who) => ({
  kind: 'gem', who,
  touch(w, b, c, r) { if (b.player && b.id === who) { w.set(c, r, '.'); w.gems++; w.emit('gem', c + 0.5, r + 0.5, b); } },
  draw(g, c, r, w, cam, t) {
    const y = r + Math.sin(t * 3 + c) * 0.06;
    g.fillStyle = COLOURS[who]; g.strokeStyle = DARK[who]; g.lineWidth = 0.05;
    g.beginPath(); g.moveTo(c + 0.5, y + 0.15); g.lineTo(c + 0.82, y + 0.42); g.lineTo(c + 0.5, y + 0.88); g.lineTo(c + 0.18, y + 0.42); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(c + 0.5, y + 0.15); g.lineTo(c + 0.62, y + 0.42); g.lineTo(c + 0.38, y + 0.42); g.closePath(); g.fill();
  },
});

const game = {
  id: 'ember', name: 'Ember and Frost', blurb: 'Pip walks on lava, Bo walks on water', actLabel: 'Use',
  how: [
    'Pip is Ember and can walk across lava, but water puts out the flame. Bo is Frost and can walk across water, but lava melts the ice. Green goo is bad for both of you.',
    'Too wide to jump? Stand on your mate\'s head and let them carry you across their pool.',
    'Orange gems are for Pip and blue gems are for Bo. Each of you finishes in your own door. Pressure plates hold gates open, and the Use button pulls levers.',
  ],
  theme: { sky: ['#2a1f3d', '#a0566a'], ground: '#6b4f3f', top: '#c08a4a', edge: '#3e2a20', brick: '#8a5a4a', hills: ['#5a3550', '#46283f'], deco: 'stars' },
  tiles: { L: pool('lava', 0), '~': pool('water', 1), g: pool('goo', -1), r: gem(0), w: gem(1) },
  levels: [
    { name: 'Warm and cool', tip: 'Pip walks on lava. Bo walks on water',
      rows: [
        '..............................................',
        '..............................................',
        '..............................................',
        '.........................o.o..................',
        '...........r..........#######.....w...........',
        '..............................................',
        '.12....o..............................o..a.b..',
        '#########LLL#####################~~~##########',
        '##############################################',
      ] },
    { name: 'Piggyback', tip: 'Stand on your mate to ride across',
      rows: [
        '....................................................',
        '....................................................',
        '....................................................',
        '..........o.o.o......................o.o.o..........',
        '....................................................',
        '...........r............................w...........',
        '.12............................................a.b..',
        '#######LLLLLLLLL#########gg########~~~~~~~~~~#######',
        '####################################################',
      ] },
    { name: 'Take turns', tip: 'Only Bo can reach the first plate',
      rows: [
        '...................#................................',
        '...................#................................',
        '...................#................................',
        '...................#................................',
        '.....w........o.o..U........r.......................',
        '...................U..................o.o...........',
        '..u.......12.......U..u......................a.b....',
        '###~~~~~~################LLLLLLLL###################',
        '####################################################',
      ] },
    { name: 'Pull the lever', tip: 'Boost up to the lever to make a bridge', open: { j: true },
      rows: [
        '........................................................',
        '........................................................',
        '........................................................',
        '.....rjw................................................',
        '.....###................................................',
        '...............o.o.........o.......o....................',
        '........................................................',
        '.12...............................................a.b...',
        '#############JJJJJJJ######LLL#####~~~####gg#############',
        '#############ggggggg####################################',
      ] },
    { name: 'Two lanes', tip: 'Each plate opens the other lane',
      rows: [
        '..........########################################',
        '..........########################################',
        '..........................I.......................',
        '..................r.......I............o.o........',
        '............y.............I..................a....',
        '.....o....####LLLLLLLL#########LLLLL##############',
        '..........########################################',
        '..........########################################',
        '....====......Y...................................',
        '..............Y.....w..................o.o........',
        '..12..........Y.............i................b....',
        '#################~~~~~~~~######~~~~~##############',
        '##################################################',
      ] },
    { name: 'Change over', tip: 'Swap places where lava meets water',
      rows: [
        '...................#..................................',
        '...................#..................................',
        '...................#..................................',
        '.........C.........#..................................',
        '......####....o.o..U......r......w......o.............',
        '...................U..................................',
        '.12.......uu.......U............................a.b...',
        '########################LLLLLL~~~~~~####ggg###########',
        '######################################################',
      ] },
    { name: 'Key keeper', tip: 'Bo fetches the key. Pip gives Bo a ride',
      rows: [
        '...........................#............................',
        '...........................#............................',
        '...........................#............................',
        '...........................#....................j...a.b.',
        '...........................#.................###########',
        '.......w......o....r.......#...o.............###########',
        '...........................#..........o.o....###########',
        '.12......k.................K..............J..###########',
        '######~~~~~~~###LLLLLLLL#######ggg########s#############',
        '########################################################',
      ] },
    { name: 'Hot and cold', tip: 'Pip pulls the lever. Then hold the gate', open: { j: true },
      rows: [
        '................................................#...............',
        '................................................#...............',
        '................................................#...............',
        '................................................#...............',
        '.......................rj.......................#...............',
        '..........w....o.o.....##...........o.o.........U...............',
        '................................................U......o........',
        '.12.........................................u...U..u......a.b...',
        '######~~~~~~~~####LLLLLLLLLLLL####JJJJJJJ#######################',
        '##################################ggggggg#######################',
      ] },
  ],
  setup(w) {
    for (const row of w.grid) for (const ch of row) if (ch === 'r' || ch === 'w') w.gemsTotal++;
    Object.assign(w.open, w.level.open || {}); // levels can start with a lever bridge open
  },
  // standing on your own pool you sink in a little (just for looks)
  update(w, dt) {
    for (const p of w.players) {
      const t = p.ground && p.on === 'tile' ? w.tile(Math.floor(p.x + p.w / 2), Math.floor(p.y + p.h + 0.05)) : null;
      p.wade = (p.wade || 0) + ((t && t.pool === p.id ? 1 : 0) - (p.wade || 0)) * Math.min(1, dt * 12);
    }
  },
  drawPlayer(g, p, t) {
    const sink = 0.22 * ((p.wade || 0) + (p.on && p.on.player ? p.on.wade || 0 : 0));
    g.save(); g.translate(0, sink); drawPlayer(g, p, t); g.restore();
  },
  tests(assert, { makeWorld, simulate }) {

    // Bo sinks in lava, Pip stands on it
    let w = simulate(makeWorld({ rows: ['......', '.1..2.', '#LLLL#', '######'] }, game), 0.5);
    assert(!w.players[0].dead && w.players[1].dead && w.deaths === 1, 'ember: lava is deadly to Bo only');
    w = simulate(makeWorld({ rows: ['......', '.1..2.', '#~~~~#', '######'] }, game), 0.5);
    assert(w.players[0].dead && !w.players[1].dead && w.deaths === 1, 'ember: water is deadly to Pip only');
    w = simulate(makeWorld({ rows: ['......', '.1..2.', '#gggg#', '######'] }, game), 0.5);
    assert(w.deaths === 2, 'ember: goo is deadly to both');
    // gems: Bo walks through Pip's gem without taking it
    w = makeWorld({ rows: ['2.r.w.1', '#######'] }, game);
    assert(w.gemsTotal === 2, 'ember: own gems count towards the gem star');
    simulate(w, 1, [{ x: -1 }, { x: 1 }]);
    assert(w.gems === 2 && w.players[1].x > 5 && w.players[0].x < 1, 'ember: each player collects only their own gems');
    // Pip carries Bo over lava
    w = makeWorld({ rows: ['............', '.2..........', '.1..........', '###LLLLLL###', '############'] }, game);
    simulate(w, 0.6);
    simulate(w, 1.3, [{ x: 1 }, {}]);
    const [pip, bo] = w.players;
    assert(!bo.dead && w.deaths === 0 && bo.x > 8 && bo.on === pip, 'ember: Bo rides across lava on Pip');
    // a lever closes a bridge that starts open
    w = makeWorld({ name: 't', open: { j: true }, rows: ['.12j..', '##JJ##', '..gg..'] }, game);
    assert(!w.solidAt(2, 1, w.players[0]), 'ember: a level can start with a lever bridge open');
  },
};
export default game;
