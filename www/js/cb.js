// Colourblind mode: one setting for the whole app (Settings > Appearance).
// When it is on, games where colour carries meaning add a second cue (a symbol, a pattern or a label)
// and swap red/green signals for colours that are easier to tell apart.
// It is also set as data-cb="1" on <html>, so stylesheets can use :root[data-cb="1"].
import { store } from './store.js';

export const cbOn = () => !!store.settings.colourblind;

// Symbol shapes on a 12 by 12 box centred on 0,0 (the same set Potion Pour uses).
export const SYMBOLS = {
  circle: 'M-4.4,0A4.4,4.4,0,1,0,4.4,0A4.4,4.4,0,1,0,-4.4,0Z',
  square: 'M-4-4H4V4H-4Z',
  tri: 'M0-5L5.2,4.2L-5.2,4.2Z',
  diamond: 'M0-5.6L4.4,0L0,5.6L-4.4,0Z',
  star: 'M0-5.5L1.6-1.8L5.4-1.6L2.5,0.9L3.4,4.8L0,2.7L-3.4,4.8L-2.5,0.9L-5.4-1.6L-1.6-1.8Z',
  heart: 'M0,4.5C-6.5,0-5.5-5-2.6-5C-1.2-5,0-3.8,0-3C0-3.8,1.2-5,2.6-5C5.5-5,6.5,0,0,4.5Z',
  plus: 'M-1.7-5H1.7V-1.7H5V1.7H1.7V5H-1.7V1.7H-5V-1.7H-1.7Z',
  moon: 'M1.5-5.2A5.2,5.2,0,1,0,5.2,2A4.2,4.2,0,1,1,1.5-5.2Z',
  drop: 'M0-5.5C2.6-1.8,4.2,0.4,4.2,2A4.2,4.2,0,0,1-4.2,2C-4.2,0.4-2.6-1.8,0-5.5Z',
  bolt: 'M1.2-5.8L-4.2,0.8H-0.3L-1.2,5.8L4.2-0.8H0.3Z',
  ring: 'M-4.8,0A4.8,4.8,0,1,0,4.8,0A4.8,4.8,0,1,0,-4.8,0ZM-2.1,0A2.1,2.1,0,1,1,2.1,0A2.1,2.1,0,1,1,-2.1,0Z',
  leaf: 'M-4.5,4.5C-4.5-2,-0.5-5,5-5C5,0.5,1.5,4.5,-4.5,4.5Z',
  cross: 'M-4.2-2.6L-2.6-4.2L0-1.6L2.6-4.2L4.2-2.6L1.6,0L4.2,2.6L2.6,4.2L0,1.6L-2.6,4.2L-4.2,2.6L-1.6,0Z',
  hex: 'M-2.6-4.5H2.6L5.2,0L2.6,4.5H-2.6L-5.2,0Z',
};
// a fixed order, so colour number i always gets the same symbol
export const SYMBOL_ORDER = ['circle', 'square', 'tri', 'diamond', 'star', 'heart', 'plus', 'moon', 'drop', 'bolt', 'ring', 'leaf', 'cross', 'hex'];
export const symbolFor = (i) => SYMBOL_ORDER[((i % SYMBOL_ORDER.length) + SYMBOL_ORDER.length) % SYMBOL_ORDER.length];

// An inline SVG of one symbol. size in px; fill and an optional outline for contrast on any background.
export function symbolSvg(name, { size = 14, fill = '#fff', stroke = 'rgba(0,0,0,.45)', cls = 'cb-sym' } = {}) {
  return `<svg class="${cls}" viewBox="-6 -6 12 12" width="${size}" height="${size}" aria-hidden="true"><path d="${SYMBOLS[name]}" fill="${fill}" stroke="${stroke}" stroke-width="0.9" paint-order="stroke"/></svg>`;
}

// Draw a symbol on a canvas, centred on x,y, r = half its size.
const paths = {};
export function drawSymbol(ctx, name, x, y, r, fill = '#fff', stroke = 'rgba(0,0,0,.45)') {
  const p = paths[name] || (paths[name] = new Path2D(SYMBOLS[name]));
  ctx.save();
  ctx.translate(x, y); ctx.scale(r / 6, r / 6);
  if (stroke) { ctx.lineWidth = 1.8; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(p); }
  ctx.fillStyle = fill; ctx.fill(p);
  ctx.restore();
}

// Colours most people can tell apart, including the common red-green and blue-yellow colour blindness
// (Okabe and Ito's set, with a few extras). Use in place of red and green for good and bad.
export const SAFE = {
  orange: '#e69f00', sky: '#56b4e9', green: '#009e73', yellow: '#f0e442', blue: '#0072b2', vermilion: '#d55e00', purple: '#cc79a7', black: '#000000',
  good: '#0072b2', bad: '#d55e00',
};
