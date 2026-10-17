// Treat Twist artwork: six glossy candies, each with its own colour AND shape so they are easy to tell apart.
export const CANDY_COLOURS = ['#ff3b5c', '#ff9f1a', '#ffd21f', '#2ecc71', '#2f8cff', '#a45cf0'];
export const CANDY_NAMES = ['hearts', 'drops', 'gumdrops', 'chews', 'swirls', 'stars'];

// [light, main, dark] per candy
const TONES = [
  ['#ff9aae', '#ff3b5c', '#b3122f'],
  ['#ffd08a', '#ff9f1a', '#b85f00'],
  ['#fff3a6', '#ffd21f', '#b58a00'],
  ['#9ff0c0', '#2ecc71', '#14804a'],
  ['#9cc9ff', '#2f8cff', '#0f4fb0'],
  ['#d9b3ff', '#a45cf0', '#5f23a8'],
];

// Candy shapes on a 100x100 canvas.
const SHAPES = [
  'M50 88 C18 64 8 46 14 30 C20 14 40 12 50 28 C60 12 80 14 86 30 C92 46 82 64 50 88 Z',                 // heart
  'M50 10 L84 30 L84 70 L50 90 L16 70 L16 30 Z',                                                           // hexagon drop
  'M50 8 C64 30 82 46 82 64 C82 82 68 92 50 92 C32 92 18 82 18 64 C18 46 36 30 50 8 Z',                  // gumdrop / teardrop
  'M24 14 H76 Q86 14 86 24 V76 Q86 86 76 86 H24 Q14 86 14 76 V24 Q14 14 24 14 Z',                        // square chew
  'M50 10 A40 40 0 1 1 49.9 10 Z',                                                                         // swirl disc
  'M50 8 L61 36 L91 38 L68 57 L76 88 L50 71 L24 88 L32 57 L9 38 L39 36 Z',                                // star
];

// Gradients and clip shapes live in one always-present SVG. (Chrome will not paint a gradient whose
// first definition is inside a hidden screen, and every candy would otherwise repeat the same ids.)
function ensureDefs() {
  if (typeof document === 'undefined' || document.getElementById('candy-defs')) return;
  const defs = TONES.map(([lt, mn, dk], t) => `<radialGradient id="cg${t}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${lt}"/><stop offset=".55" stop-color="${mn}"/><stop offset="1" stop-color="${dk}"/></radialGradient><clipPath id="ck${t}"><path d="${SHAPES[t]}"/></clipPath>`).join('')
    + '<radialGradient id="cgbomb" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#8a5a3c"/><stop offset=".6" stop-color="#4e2c18"/><stop offset="1" stop-color="#2a160a"/></radialGradient>';
  const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.id = 'candy-defs';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = `<defs>${defs}</defs>`;
  document.body.appendChild(holder);
}

const cache = new Map();
export function candySvg(t, sp = null) {
  ensureDefs();
  const key = t + ':' + sp;
  if (cache.has(key)) return cache.get(key);
  let svg;
  if (t === 9) svg = bombSvg();
  else {
    const [lt, mn, dk] = TONES[t];
    const extra = t === 4
      ? `<path d="M50 50 m0 -26 a26 26 0 1 1 -22 12 M50 50 m0 -14 a14 14 0 1 1 -12 7" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>`
      : t === 3 ? '<rect x="26" y="26" width="48" height="48" rx="8" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4"/>' : '';
    const stripes = sp === 'h' || sp === 'v'
      ? `<g clip-path="url(#ck${t})"><g transform="${sp === 'v' ? 'rotate(90 50 50)' : ''}">${[22, 38, 54, 70].map((y) => `<rect x="0" y="${y}" width="100" height="7" fill="#fff" fill-opacity=".9"/>`).join('')}</g></g>`
      : '';
    const wrap = sp === 'wrap'
      ? `<path d="M10 50 L-4 36 L-4 64 Z M90 50 L104 36 L104 64 Z" fill="${mn}" stroke="${dk}" stroke-width="3" stroke-linejoin="round"/>
         <rect x="6" y="6" width="88" height="88" rx="22" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="10 7" opacity=".9"/>`
      : '';
    svg = `<svg viewBox="-6 -6 112 112" class="candy">
      ${wrap}
      <path d="${SHAPES[t]}" fill="url(#cg${t})" stroke="${dk}" stroke-width="3" stroke-linejoin="round"/>
      ${extra}${stripes}
      <ellipse cx="36" cy="30" rx="13" ry="7" fill="#fff" fill-opacity=".75" transform="rotate(-25 36 30)"/>
      <circle cx="58" cy="24" r="3" fill="#fff" fill-opacity=".6"/>
    </svg>`;
  }
  cache.set(key, svg);
  return svg;
}

// The five-in-a-row special: a chocolate ball covered in rainbow sprinkles.
function bombSvg() {
  const sprinkles = [[30, 34, 20], [58, 28, -30], [70, 50, 60], [40, 58, -10], [56, 70, 35], [28, 52, 80], [48, 42, -60], [66, 36, 10], [36, 72, 50], [62, 60, -45]];
  return `<svg viewBox="-6 -6 112 112" class="candy bomb">
    <circle cx="50" cy="50" r="42" fill="url(#cgbomb)" stroke="#1d0f06" stroke-width="3"/>
    ${sprinkles.map(([x, y, a], i) => `<rect x="${x - 6}" y="${y - 2.5}" width="12" height="5" rx="2.5" fill="${CANDY_COLOURS[i % 6]}" transform="rotate(${a} ${x} ${y})"/>`).join('')}
    <ellipse cx="36" cy="28" rx="12" ry="6" fill="#fff" fill-opacity=".35" transform="rotate(-25 36 28)"/>
  </svg>`;
}
