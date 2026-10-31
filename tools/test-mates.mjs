// Checks every Jump Mates game: levels are well formed, both players can (optimistically) reach the exit and
// every coin, the engine survives random input without errors, endless games generate playable starts, and
// each game's own tests pass. Run with: node tools/test-mates.mjs [game-id ...]
import { makeWorld, simulate, STEP, PHYS } from '../www/js/mates/engine.js';

// games.js imports nothing from the browser, so it loads straight into Node
const { MATES_GAMES } = await import('../www/js/mates/games.js');
const only = process.argv.slice(2);

let fail = 0, checks = 0;
const assert = (ok, msg) => { checks++; if (!ok) { fail++; console.log('FAIL', msg); } };

// ---------- Optimistic reachability ----------
// Treats anything a game might open (gates, locks, coloured blocks) as both a floor and a doorway, ignores ceilings
// and assumes the partner is always there to boost. It catches doors in walls, coins nobody can get to and
// ledges that are simply too high, not subtler puzzles.
function reach(level, game, R) {
  const w = makeWorld(level, game, { seed: 1 });
  const up = R.up ?? 3, boost = R.boost ?? 4, gap = R.gap ?? 5, spring = R.spring ?? 7;
  const kind = (c, r) => w.tile(c, r)?.kind;
  // gates, locks, cracked blocks and anything a game marks maybe: true can open up during play
  const opens = (t) => !!t && (typeof t.solid === 'function' || !!t.bump || !!t.maybe || t.kind === 'crack');
  const maybe = (c, r) => opens(w.tile(c, r));
  const solid = (c, r) => { if (r < 0) return false; if (c < 0 || c >= w.W) return true; const t = w.tile(c, r); return !!t && t.solid === true && !opens(t); };
  const floorish = new Set();
  // platform paths count as floors
  for (const pl of w.plats) {
    const c0 = Math.floor(pl.x), r0 = Math.floor(pl.y);
    if (pl.vx) { for (let c = c0; c >= 0 && w.get(c, r0) !== '|' && !solid(c, r0); c--) floorish.add(`${c},${r0}`); for (let c = c0; c < w.W && w.get(c, r0) !== '|' && !solid(c, r0); c++) floorish.add(`${c},${r0}`); }
    if (pl.vy) for (let k = 0; k < pl.w; k++) { const c = c0 + k; for (let r = r0; r >= 0 && w.get(c, r) !== '|' && !solid(c, r); r--) floorish.add(`${c},${r}`); for (let r = r0; r < w.H && !solid(c, r); r++) floorish.add(`${c},${r}`); }
  }
  for (const b of w.crates) floorish.add(`${Math.floor(b.x + 0.5)},${Math.floor(b.y + 0.5)}`);
  const isFloor = (c, r) => solid(c, r) || maybe(c, r) || w.tile(c, r)?.oneway || floorish.has(`${c},${r}`) || (R.floor && R.floor(w, c, r));
  const hazard = (c, r) => { const t = w.tile(c, r); return !!t && !!t.hazard && !(R.safe && R.safe(w, c, r)); };
  const open = (c, r) => !solid(c, r) && !hazard(c, r);
  const stand = (c, r) => open(c, r) && isFloor(c, r + 1) && !floorish.has(`${c},${r}`) || (open(c, r) && floorish.has(`${c},${r + 1}`));
  const start = (p) => [Math.floor(p.x + p.w / 2), Math.floor(p.y + p.h - 0.01)];
  const seen = new Set(), q = [];
  const push = (c, r) => { const k = `${c},${r}`; if (!seen.has(k) && stand(c, r)) { seen.add(k); q.push([c, r]); } };
  for (const p of w.players) { const [c, r] = start(p); seen.add(`${c},${r}`); q.push([c, r]); }
  // a jump is allowed if some arc gets there: straight up from (c, r) to row h, across to c2, then down to r2,
  // through cells that are not solid for certain
  const clear = (c, r) => r < 0 || !solid(c, r);
  const arc = (c, r, c2, r2, top) => {
    for (let h = Math.min(r, r2); h >= top; h--) {
      let ok = true;
      for (let y = r; y >= h && ok; y--) ok = clear(c, y);
      for (let x = Math.min(c, c2); x <= Math.max(c, c2) && ok; x++) ok = clear(x, h);
      for (let y = h; y <= r2 && ok; y++) ok = clear(c2, y);
      if (ok) return true;
      if (!clear(c, h)) return false; // hit a ceiling going up
    }
    return false;
  };
  while (q.length) {
    const [c, r] = q.shift();
    const jump = (kind(c, r) === 'spring' || kind(c, r + 1) === 'spring' ? spring : boost) + (R.extraUp || 0);
    for (let r2 = Math.max(0, r - jump); r2 < w.H; r2++) {
      const dy = r - r2; // positive = higher
      const dxMax = dy > up ? 2 : dy > 0 ? gap : gap + Math.min(6, -dy);
      for (let c2 = Math.max(0, c - dxMax); c2 <= Math.min(w.W - 1, c + dxMax); c2++) if (stand(c2, r2) && !seen.has(`${c2},${r2}`) && arc(c, r, c2, r2, r - jump)) push(c2, r2);
    }
  }
  const standing = [...seen].map((k) => k.split(',').map(Number));
  const touches = (c, r, rise = 1) => standing.some(([c2, r2]) => Math.abs(c2 - c) <= 1 && r <= r2 && r >= r2 - rise);
  const exits = [];
  for (let r = 0; r < w.H; r++) for (let c = 0; c < w.W; c++) { const k = kind(c, r); if (k === 'exit' || k === 'exit1' || k === 'exit2') exits.push([c, r, k]); }
  const coins = [];
  for (let r = 0; r < w.H; r++) for (let c = 0; c < w.W; c++) { const k = kind(c, r); if (k === 'coin' || k === 'gem') coins.push([c, r]); }
  return {
    exitOk: (k) => exits.filter((e) => e[2] === k).some(([c, r]) => touches(c, r)),
    hasExit: (k) => exits.some((e) => e[2] === k),
    coinsMissed: coins.filter(([c, r]) => !touches(c, r, up + 1 + (R.extraUp || 0))),
  };
}

function checkLevel(game, level, label) {
  const rows = level.rows;
  assert(Array.isArray(rows) && rows.length >= 4, `${label}: has rows`);
  const text = rows.join('\n');
  assert((text.match(/1/g) || []).length === 1 && (text.match(/2/g) || []).length === 1, `${label}: exactly one 1 and one 2`);
  const W = Math.max(...rows.map((r) => r.length));
  assert(W <= 400 && rows.length <= 300, `${label}: a sensible size (${W} x ${rows.length})`);
  let w;
  try { w = makeWorld(level, game, { seed: 3 }); } catch (e) { assert(false, `${label}: makeWorld threw ${e.message}`); return; }
  const unknown = new Set();
  for (const row of w.grid) for (const ch of row) if (ch !== '.' && !w.tiles[ch]) unknown.add(ch);
  assert(!unknown.size, `${label}: unknown tiles ${[...unknown].join(' ')}`);
  if (!game.endless && !game.won) {
    const R = game.reach === false ? null : { ...(game.reach || {}), ...(level.reach || {}) };
    if (R && level.reach !== false) {
      const rr = reach(level, game, R);
      if (rr.hasExit('exit1') || rr.hasExit('exit2')) {
        assert(rr.exitOk('exit1') || rr.exitOk('exit'), `${label}: Pip can reach a door`);
        assert(rr.exitOk('exit2') || rr.exitOk('exit'), `${label}: Bo can reach a door`);
      } else {
        assert(rr.hasExit('exit'), `${label}: has an exit door`);
        assert(rr.exitOk('exit'), `${label}: the exit can be reached`);
      }
      assert(!rr.coinsMissed.length, `${label}: coins out of reach at ${rr.coinsMissed.map(([c, r]) => `(${c},${r})`).join(' ')}`);
    }
  }
  // random button mashing for 20 seconds must not throw or produce NaN positions
  try {
    let seed = 7;
    const R = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
    const mash = () => ({ x: [-1, 0, 1][(R() * 3) | 0], jump: R() < 0.5, jumpP: R() < 0.08, act: R() < 0.3, actP: R() < 0.05, down: R() < 0.1, up: R() < 0.1 });
    simulate(w, 20, [mash, mash]);
    assert(w.players.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `${label}: positions stay finite`);
  } catch (e) { assert(false, `${label}: crashed under random input: ${e.stack}`); }
}

const games = MATES_GAMES.filter((g) => !only.length || only.includes(g.id));
assert(only.length || MATES_GAMES.length === 20, `20 games (found ${MATES_GAMES.length})`);
assert(new Set(MATES_GAMES.map((g) => g.id)).size === MATES_GAMES.length, 'game ids are unique');
let levels = 0;
for (const game of games) {
  assert(game.id && game.name && game.blurb && Array.isArray(game.how) && game.how.length, `${game.id}: has id, name, blurb and how`);
  const words = [game.name, game.blurb, ...game.how, game.actLabel || '', ...(game.levels || []).flatMap((l) => [l.name || '', l.tip || ''])].join(' ');
  assert(!/—/.test(words), `${game.id}: no em dashes in player-facing text`);
  assert(!/\b(color|center|favorite|behavior|gray)\b/i.test(words), `${game.id}: Australian spelling`);
  if (game.endless) {
    assert(typeof game.endless.gen === 'function' && game.endless.unit, `${game.id}: endless games have gen() and a unit`);
    for (const seed of [1, 2, 99, 12345]) { const lv = game.endless.gen(seed); checkLevel(game, lv, `${game.id} seed ${seed}`); }
  } else {
    assert(Array.isArray(game.levels) && game.levels.length >= 6, `${game.id}: at least 6 levels (found ${game.levels?.length})`);
    game.levels.forEach((lv, i) => { levels++; checkLevel(game, lv, `${game.id} level ${i + 1}`); });
  }
  if (game.tests) {
    try { await game.tests(assert, { makeWorld, simulate, STEP, PHYS }); } catch (e) { assert(false, `${game.id}: tests threw ${e.stack}`); }
  }
}

console.log(fail ? `${fail} of ${checks} check(s) failed` : `All Jump Mates checks passed (${games.length} games, ${levels} levels, ${checks} checks)`);
process.exit(fail ? 1 : 0);
