# Jump Mates

Twenty co-op platform games for two players on one device (touch buttons, keyboard or game controllers).

- `engine.js` is the physics and the shared level pieces (pure logic, runs in Node for tests).
- `draw.js` paints a world: camera, background, tiles, bodies, players, particles.
- `input.js` merges on-screen buttons, keyboard and controllers into one state per player.
- `hub.js` is the list of games and the play screen (levels, stars, pause, results).
- `games.js` lists the game modules in hub order. Each game is `g-<id>.js`.
- `net.js` is two-phone play: the host runs the world and sends generic snapshots (every list of bodies, `w.data`, the grid
  when it changes) about 30 times a second; the guest builds the same level from the same seed, plays the snapshots back
  a little behind with smoothing, and sends its buttons. Keep game state in the world (not in module variables) so it travels.
- `tools/test-mates.mjs` checks every game: levels parse, both players can reach the exit (optimistically), the
  engine runs with random input without throwing, and each game's own `tests` pass.

## Units and movement

Tiles. x runs right, y runs **down** (like the level text). Tile (c, r) covers [c, c+1) x [r, r+1).
A player is 0.72 wide and 0.9 tall. With the default physics a player:

- jumps 3.37 tiles high, so a ledge 3 tiles above their feet is reachable and 4 is not;
- standing on their partner's head can reach 4 tiles up (4.27);
- clears a gap of 4 tiles comfortably at the same height (5 is a stretch, 6 is not possible);
- can hold jump for a full jump or let go early for a hop.

Design levels so that anything required stays inside those limits (3 up solo, 4 up with a boost, gaps of 4).

## Level text legend (engine.js BASE_TILES)

| ch | meaning |
| -- | ------- |
| `.` or space | empty |
| `#` | ground (solid, grass on top) |
| `B` | brick (solid) |
| `x` | cracked block (solid; games may break it) |
| `=` | one-way ledge (jump up through it, stand on it; hold down to drop) |
| `^` / `v` | spikes pointing up (on a floor) / down (from a ceiling) |
| `~` | water (deadly) |
| `1` `2` | where Pip (player 1) and Bo (player 2) start. Required, exactly one each |
| `E` | shared exit door. Stack two vertically for a taller door. Both players inside wins |
| `a` `b` | Pip's own door and Bo's own door (if a level has these, each must be in their own door or an `E`) |
| `o` | coin; `*` gem. A star for collecting all of them |
| `k` | key (picked up by touching, follows the carrier); `K` lock block that opens when the carrier bumps it |
| `s` | spring (stand a spring on a floor tile; bounces up about 7 tiles) |
| `F` | checkpoint flag (both players respawn there once touched) |
| `u` `i` `y` | pressure plates; `U` `I` `Y` the gates they hold open (a gate never shuts on someone) |
| `j` | lever (press action next to it); `J` the gate it toggles |
| `C` | crate (pushable, can be stood on, holds plates down); `H` heavy crate (moves only with both pushing) |
| `e` | walker enemy (stomp it from above; touching it otherwise costs a fall) |
| `M` / `N` | moving platform, horizontal / vertical. A run of letters is one platform. It reverses at solid tiles or `|` |
| `|` | invisible platform stopper |

Falling below the level, spikes, water and walkers send a player back to the last checkpoint (or their start).

## A game module

```js
export default {
  id: 'trek', name: 'Twin Trek', blurb: 'One line for the hub card',
  how: ['Paragraph shown in How to play (plain Australian English, no em dashes).', '...'],
  actLabel: 'Throw',          // label for the action button (omit with noAct: true if the game has no action)
  noAct: false,
  theme: { sky: [top, bottom], ground, top, edge, brick, ledge, hills: [far, near], deco: 'hills' | 'clouds' | 'stars' | 'cave', water },
  phys: { ... },              // override any of engine PHYS for every level
  tiles: { ch: { solid, oneway, hazard, touch, bump, kind, draw(g, c, r, world, cam, t) } }, // new or replaced tiles
  levels: [{ name, rows: [...], tip: 'shown after the name', theme: {...}, phys: {...} }],
  // or, for an endless game (score instead of levels):
  endless: { unit: 'metres', unit1: 'metre', gen(seed) { return { name, rows } } },

  // hooks, all optional (w is the world, p a player):
  setup(w), preStep(w, dt), update(w, dt),
  act(w, p),                  // p pressed their action button this step
  control(w, p, dt),          // return false to take over the player's movement entirely this step
  canJump(w, p),              // return false to stop a jump
  won(w),                     // replace the default exit rule
  canExit(w),                 // extra condition before both-in-the-door counts
  onDie(w, p, why), onRespawn(w, p), onStomp(w, walker, p), walker(w, e, dt) (return false to move it yourself),
  tops(w, body) -> extra boxes a body can land on from above,
  hud(w) -> { left, center, right } strings for the top chips,
  camera(w, cam, dt) -> { x, y, s } to steer the camera; follow: true to always follow; camTop
  drawBack(g, w, view, t), drawMid(...), drawFront(...)  // in tile units; view = { x, y, w, h, px, s, theme }
  drawPlayer(g, p, t, w),     // replace player drawing (call draw.js drawPlayer for the default)
  drawScreen(g, w, cam, t),   // in screen pixels, after the world
  sound(e, snd),              // for custom events from w.emit()
  reach: { up, boost, gap } or false,  // tell test-mates how to check levels (false skips the reachability check)
  tests(assert, lib),         // extra checks run by tools/test-mates.mjs
}
```

World helpers: `w.get(c, r)`, `w.set(c, r, ch)`, `w.tile(c, r)`, `w.solidAt(c, r, body)`, `w.emit(kind, x, y, body)`,
`w.kill(p, why)`, `w.finish(score, line)` (endless games), `w.partner(p)`, `w.cells(x, y, w, h)`, `w.rescan()` after
adding plates or gates, `w.rng()` (seeded), `w.data` (free space for the game), `w.t` (seconds).
Engine exports: `moveX`, `moveY`, `overlap`, `clamp`, `simulate`, `mulberry`, `PW`, `PH`, `PHYS`, `STEP`.
Draw exports: `drawPlayer`, `drawTile`, `drawKey`, `drawWalker`, `roundRect`, `star`, `COLOURS`, `DARK`, `NAMES`, `plateColour`.
