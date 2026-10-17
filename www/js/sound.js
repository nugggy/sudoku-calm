// Small synthesised sounds (no audio files) and haptics.
import { store } from './store.js';
import { native } from './native.js';

let ctx = null;
function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', vol = 0.12, delay = 0, slideTo = null } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

// A soft "mew": a sawtooth with a pitch arc through a vowel-like filter.
function mew(delay = 0, pitch = 1) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(520 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(900 * pitch, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(480 * pitch, t + 0.42);
  f.type = 'bandpass'; f.Q.value = 6;
  f.frequency.setValueAtTime(900, t);
  f.frequency.linearRampToValueAtTime(1800, t + 0.12);
  f.frequency.linearRampToValueAtTime(700, t + 0.42);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(f).connect(g).connect(c.destination);
  o.start(t); o.stop(t + 0.5);
}

const on = () => store.settings.sound;

export const sfx = {
  tap() { if (on()) tone(880, 0.05, { vol: 0.05, type: 'triangle' }); },
  place() { if (on()) tone(660, 0.09, { vol: 0.09, type: 'triangle', slideTo: 990 }); },
  note() { if (on()) tone(1200, 0.04, { vol: 0.04 }); },
  erase() { if (on()) tone(500, 0.08, { vol: 0.06, slideTo: 300 }); },
  error() { if (on()) { tone(180, 0.18, { type: 'square', vol: 0.05 }); } buzz(60); },
  unit() { if (on()) [784, 988, 1175].forEach((f, i) => tone(f, 0.18, { delay: i * 0.06, vol: 0.07, type: 'triangle' })); },
  win() {
    if (on()) [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, { delay: i * 0.1, vol: 0.09, type: 'triangle' }));
    buzz([40, 60, 40]);
  },
  hint() { if (on()) [880, 1320].forEach((f, i) => tone(f, 0.15, { delay: i * 0.08, vol: 0.06 })); },
  cross() { if (on()) tone(420, 0.05, { vol: 0.05, type: 'triangle' }); },
  cat() { if (on()) mew(0, 0.9 + Math.random() * 0.25); },
  meowWin() { if (on()) { mew(0, 1); mew(0.35, 1.25); [784, 988, 1319].forEach((f, i) => tone(f, 0.3, { delay: 0.7 + i * 0.09, vol: 0.07, type: 'triangle' })); } buzz([40, 60, 40]); },
};

export function buzz(pattern = 15) {
  if (!store.settings.vibrate) return;
  native.vibrate(pattern);
}
