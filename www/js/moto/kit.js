// Motorbike games: the garage data (bikes, paints, riders, coins) and drawing a bike with its rider.
// Sprites are rendered by tools/moto (see tools/moto/sprites.mjs). The general engine (camera, particles,
// sounds, painted scenery) is shared with the Yeti Games: import it from '../yeti/kit.js'.
import { store, save } from '../store.js';
import { SPR, IMG, loadSprites } from '../yeti/kit.js';

export const loadMoto = () => loadSprites('img/moto');
export const M = () => store.moto;

// Stats are 1 to 5. speed = top speed, power = acceleration and hill climbing, grip = traction and landing
// forgiveness, handling = steering and air control. Games read them through stat(name) (0..1).
export const BIKES = [
  { id: 'scooter', name: 'Zippy Scooter', price: 0, stats: { speed: 2, power: 2, grip: 3, handling: 5 }, model: 'models/moto/bikes/scooter.glb', blurb: 'Light, nimble and free. Great in traffic.' },
  { id: 'dirt', name: 'Mud Hopper', price: 400, stats: { speed: 3, power: 4, grip: 5, handling: 4 }, model: 'models/moto/bikes/dirtbike.glb', blurb: 'Long suspension for hills, jumps and dirt.' },
  { id: 'cruiser', name: 'Midnight Cruiser', price: 700, stats: { speed: 4, power: 4, grip: 4, handling: 2 }, model: 'models/moto/bikes/bike_b.glb', blurb: 'Heavy and steady. Hard to knock over.' },
  { id: 'sport', name: 'Red Rocket', price: 900, stats: { speed: 5, power: 5, grip: 3, handling: 3 }, model: 'models/moto/bikes/bike_a.glb', blurb: 'The fastest bike in the garage.' },
  { id: 'chopper', name: 'Sunset Chopper', price: 1200, stats: { speed: 4, power: 3, grip: 4, handling: 4 }, model: 'models/moto/bikes/bike_c.glb', blurb: 'All-rounder with serious style.' },
];
// tint is the paint colour for 3D bikes (empty = factory colours). Paint tints the whole bike layer (sepia first, so white and grey bikes take the colour too); the rider is untouched.
export const PAINTS = [
  { id: 'factory', name: 'Factory', price: 0, tint: '', filter: '' },
  { id: 'flame', name: 'Flame', price: 150, tint: '#e8452c', filter: 'sepia(1) saturate(5) hue-rotate(-32deg) brightness(.95)' },
  { id: 'lime', name: 'Lime', price: 150, tint: '#6ad13a', filter: 'sepia(1) saturate(4) hue-rotate(55deg) brightness(1.05)' },
  { id: 'ocean', name: 'Ocean', price: 150, tint: '#2f8fd8', filter: 'sepia(1) saturate(4) hue-rotate(165deg) brightness(.95)' },
  { id: 'grape', name: 'Grape', price: 200, tint: '#8e4fc9', filter: 'sepia(1) saturate(4) hue-rotate(230deg) brightness(.9)' },
  { id: 'bubblegum', name: 'Bubblegum', price: 200, tint: '#ff7fc0', filter: 'sepia(1) saturate(3) hue-rotate(285deg) brightness(1.1)' },
  { id: 'gold', name: 'Gold', price: 250, tint: '#f2c230', filter: 'sepia(1) saturate(4) hue-rotate(8deg) brightness(1.1)' },
  { id: 'stealth', name: 'Stealth', price: 300, tint: '#2b2b30', filter: 'grayscale(1) brightness(.5) contrast(1.3)' },
];
export const RIDERS = [
  { id: 'r1', name: 'Max', model: 'models/moto/riders/character-male-a.glb' },
  { id: 'r2', name: 'Ruby', model: 'models/moto/riders/character-female-b.glb' },
  { id: 'r3', name: 'Kai', model: 'models/moto/riders/character-male-c.glb' },
  { id: 'r4', name: 'Zoe', model: 'models/moto/riders/character-female-d.glb' },
];
export const bikeById = (id) => BIKES.find((b) => b.id === id) || BIKES[0];
export const paintById = (id) => PAINTS.find((p) => p.id === id) || PAINTS[0];
// The rider's current choice.
export function ride() {
  const m = M();
  const bike = bikeById(m.bike), paint = paintById(m.paint[bike.id] || 'factory');
  return { bike, paint, rider: RIDERS.find((r) => r.id === m.rider) || RIDERS[0] };
}
// 0..1 version of a stat of the chosen bike (1 -> 0, 5 -> 1).
export const stat = (name, bike = ride().bike) => (bike.stats[name] - 1) / 4;

export function addCoins(n) { const m = M(); m.coins = Math.max(0, (m.coins || 0) + Math.round(n)); save(); return m.coins; }

// Draws the chosen (or given) bike with rider. view 'side' (facing right) or 'top' (facing right, seen from above).
// (x, y) is the ground point under the bike (side) or its centre (top); size = screen pixels per metre.
// Options: rot (radians, clockwise), flip, alpha, rider: false to leave the rider off, bike/paint/riderId overrides.
export function drawBike(g, x, y, size, o = {}) {
  const r = ride();
  const bike = o.bike ? bikeById(o.bike) : r.bike, paint = o.paint ? paintById(o.paint) : (o.bike ? paintById(M().paint[o.bike] || 'factory') : r.paint);
  const riderId = o.riderId || r.rider.id;
  const name = `bike_${bike.id}${o.view === 'top' ? '_top' : ''}`;
  const m = SPR[name]; if (!m) return;
  const k = size / m.px;
  const ax = o.view === 'top' ? m.w / 2 : m.ax, ay = o.view === 'top' ? m.h / 2 : m.ay;
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  if (o.flip) g.scale(-1, 1);
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  if (paint.filter) g.filter = paint.filter;
  g.drawImage(IMG[name], 0, 0, m.w, m.h, -ax * k, -ay * k, m.w * k, m.h * k);
  g.filter = 'none';
  if (o.rider !== false) { const ri = IMG[`${name}__${riderId}`]; if (ri) g.drawImage(ri, 0, 0, m.w, m.h, -ax * k, -ay * k, m.w * k, m.h * k); }
  g.restore();
}
// Wheel centres and radius of the chosen bike's side sprite, in metres relative to its ground point (y up).
export function wheels(bikeId = ride().bike.id) {
  const m = SPR[`bike_${bikeId}`];
  if (!m || !m.wheels) return { rear: { x: -0.7, y: 0.33 }, front: { x: 0.7, y: 0.33 }, r: 0.33 };
  const [[rx, ry, rr], [fx, fy]] = m.wheels;
  return { rear: { x: (rx - m.ax) / m.px, y: (m.ay - ry) / m.px }, front: { x: (fx - m.ax) / m.px, y: (m.ay - fy) / m.px }, r: rr / m.px };
}
// A shiny coin drawn with paths (screen px).
export function coinIcon(g, x, y, r, spin = 0) {
  const sx = Math.max(0.15, Math.abs(Math.cos(spin)));
  g.save(); g.translate(x, y); g.scale(sx, 1);
  g.fillStyle = '#c98a10'; g.beginPath(); g.arc(0, r * 0.08, r, 0, 6.283); g.fill();
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#ffd447'); gr.addColorStop(1, '#f2a91d');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(160,100,10,.6)'; g.lineWidth = Math.max(1, r * 0.12); g.beginPath(); g.arc(0, 0, r * 0.68, 0, 6.283); g.stroke();
  g.restore();
}
