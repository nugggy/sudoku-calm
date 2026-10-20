// Casino Night chips. Play chips only: nothing here is real money and nothing can be bought.
// Every game goes through this wallet so the balance can never go below zero.
import { store, save } from '../store.js';

export const START_CHIPS = 1000;
export const MIN_BET = 5;
export const TOPUP_TO = 1000;

const CB = () => store.casino || (store.casino = { chips: START_CHIPS, best: START_CHIPS, topups: 0, lastTopup: 0, stats: {}, seenHelp: false });
const subs = new Set();
const notify = () => { const v = CB().chips; subs.forEach((fn) => { try { fn(v); } catch { /* a closed screen */ } }); };
const clean = (n) => Math.max(0, Math.floor(Number(n) || 0));

export const wallet = {
  MIN_BET,
  get: () => clean(CB().chips),
  canAfford: (n) => clean(n) <= clean(CB().chips),
  // Takes n chips if there are enough. Returns false (and takes nothing) when there are not.
  take(n) {
    n = clean(n);
    const c = CB();
    if (n > clean(c.chips)) return false;
    c.chips = clean(c.chips) - n; save(); notify();
    return true;
  },
  give(n) {
    n = clean(n);
    if (!n) return;
    const c = CB();
    c.chips = clean(c.chips) + n;
    if (c.chips > (c.best || 0)) c.best = c.chips;
    save(); notify();
  },
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
};

// Free top-up whenever the balance is below the smallest bet. Always allowed: there is nothing to pay for.
export const canTopUp = () => wallet.get() < MIN_BET;
export function topUp() {
  const c = CB();
  if (!canTopUp()) return 0;
  const add = TOPUP_TO - clean(c.chips);
  c.topups = (c.topups || 0) + 1; c.lastTopup = Date.now();
  wallet.give(add);
  return add;
}

// Per-game results for the hub and the statistics screen.
export function record(id, result, net) {
  const st = CB().stats[id] || (CB().stats[id] = { played: 0, won: 0, lost: 0, pushed: 0, net: 0, biggest: 0 });
  st.played++;
  if (result === 'win') st.won++; else if (result === 'lose') st.lost++; else st.pushed++;
  st.net += Math.round(net || 0);
  if (net > st.biggest) st.biggest = Math.round(net);
  save();
}
