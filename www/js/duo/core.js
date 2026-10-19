// Play Together: the game module API and helpers shared by the hub, the games and test harnesses.
//
// Each game is www/js/duo/g-<id>.js:
//   export default { id, name, tag, art: () => html, help: [paragraphs], realtime: bool, cat: 'board'|'action'|'party', create(ctx) }
// create(ctx) fills ctx.root and returns { destroy() }.
//
// ctx = {
//   root      HTMLElement to fill (the hub gives it the full game area under the top bar)
//   me        0 | 1, which player this phone is. In local (pass and play) mode me is null: this phone plays both.
//   local     true when both players share this phone
//   isHost    true on the hosting phone (and in local mode)
//   first     0 | 1, who moves first (or who serves / starts on the left in real-time games)
//   names     [name0, name1]
//   send(obj) send a message to the other phone (does nothing in local mode)
//   onMsg(fn) fn(obj) for every message from the other phone; returns an unsubscribe function
//   end({ winner: 0 | 1 | null, text })  call once when the game is over (null winner is a draw)
//   sfx, buzz, toast   the app's sound, vibration and toast helpers
//   rng()     seeded random number in [0, 1), the same sequence on both phones
//   alive()   false once the screen has gone (stop timers and animation loops)
// }
// Turn-based games run the same deterministic rules on both phones and send moves.
// Real-time games: the host simulates and sends snapshots (about 20 to 30 a second); the guest sends input.
import { mulberry32 } from '../sudoku-engine.js';

export const seededRng = (seed) => mulberry32(seed >>> 0 || 1);

const noop = () => {};
const quiet = new Proxy({}, { get: () => noop });

// Builds a ctx. link: { send(obj), listen(fn) -> unsubscribe } or null for local mode.
export function makeCtx({ root, me = null, local = me === null, isHost = true, first = 0, names = ['Player 1', 'Player 2'], seed = 1, link = null, onEnd = noop, sfx = quiet, buzz = noop, toast = noop }) {
  let alive = true, ended = false;
  const subs = [];
  const ctx = {
    root, me, local, isHost, first, names, sfx, buzz, toast,
    rng: seededRng(seed),
    send: (obj) => { if (alive && link && !local) link.send(obj); },
    onMsg(fn) {
      if (!link || local) return noop;
      const off = link.listen((m) => { if (alive) fn(m); });
      subs.push(off);
      return off;
    },
    end(res) { if (!alive || ended) return; ended = true; onEnd({ winner: res?.winner ?? null, text: res?.text || '' }); },
    alive: () => alive,
  };
  ctx._kill = () => { alive = false; subs.forEach((f) => f()); };
  return ctx;
}

// Wires two ctx objects to each other in this page, as if they were two phones. For harnesses and tests.
// opts: { roots: [elA, elB], first, names, seed, latency (ms, default 0: next microtask), onEnd(side, res) }
// Returns { game: [instA, instB], ctx: [ctxA, ctxB], results: [resA, resB], destroy() }.
export function makePair(game, opts = {}) {
  const { first = 0, names = ['Host', 'Guest'], seed = 12345, latency = 0, onEnd = noop } = opts;
  const roots = opts.roots || [0, 1].map(() => (typeof document !== 'undefined' ? document.createElement('div') : null));
  const listeners = [[], []];
  const deliver = (to, m) => {
    const copy = JSON.parse(JSON.stringify(m)); // messages travel as JSON between real phones
    const go = () => listeners[to].slice().forEach((fn) => fn(copy));
    if (latency > 0) setTimeout(go, latency); else queueMicrotask(go);
  };
  const results = [null, null];
  const ctx = [0, 1].map((side) => makeCtx({
    root: roots[side], me: side, local: false, isHost: side === 0, first, names, seed,
    link: {
      send: (m) => deliver(1 - side, m),
      listen: (fn) => { listeners[side].push(fn); return () => { const i = listeners[side].indexOf(fn); if (i >= 0) listeners[side].splice(i, 1); }; },
    },
    onEnd: (res) => { results[side] = res; onEnd(side, res); },
  }));
  const inst = ctx.map((c) => game.create(c));
  return {
    game: inst, ctx, results, roots,
    destroy() { ctx.forEach((c) => c._kill()); inst.forEach((g) => g && g.destroy && g.destroy()); },
  };
}

// Small helpers several games share.
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const whoName = (ctx, p) => esc(ctx.names[p] || `Player ${p + 1}`);
// The text for whose turn it is, from this phone's point of view.
export const turnText = (ctx, p) => (ctx.local ? `${whoName(ctx, p)} to play` : p === ctx.me ? 'Your turn' : `${whoName(ctx, p)} is thinking`);
// True when this phone may act for player p.
export const mine = (ctx, p) => ctx.local || p === ctx.me;
