// Small synthesised sounds for Roulette, Craps and Pokies: ball ticks, dice rattles, reel stops and coin chimes.
// Respects the app's Sound effects setting.
import { store } from '../store.js';

let ac = null;
const ctx = () => {
  if (!store.settings.sound) return null;
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { return null; }
  return ac;
};
function tone(freq, dur, { type = 'sine', vol = 0.08, delay = 0, slideTo = null } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.08, delay = 0, freq = 2000, q = 1 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
export const rbSound = {
  tick: (vol = 0.05) => tone(2400 + Math.random() * 600, 0.025, { type: 'square', vol }),
  rattle: () => { for (let i = 0; i < 6; i++) noise(0.05, { delay: i * 0.06 + Math.random() * 0.02, vol: 0.12, freq: 1800 + Math.random() * 1500, q: 3 }); },
  thud: () => { noise(0.08, { vol: 0.18, freq: 400, q: 1 }); tone(120, 0.1, { vol: 0.08 }); },
  reelStop: () => { noise(0.05, { vol: 0.12, freq: 900, q: 2 }); tone(220, 0.06, { type: 'triangle', vol: 0.06 }); },
  spin: () => tone(300, 0.25, { type: 'sawtooth', vol: 0.03, slideTo: 700 }),
  coin: (k = 0) => tone(1568 + k * 120, 0.12, { type: 'triangle', vol: 0.06, delay: k * 0.07 }),
  chime: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.07, delay: i * 0.08 })),
  chip: () => { noise(0.03, { vol: 0.1, freq: 3500, q: 4 }); tone(1800, 0.03, { vol: 0.03 }); },
};
