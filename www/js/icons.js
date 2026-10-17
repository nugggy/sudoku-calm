// Inline SVG icons (stroke style, inherit currentColor).
const s = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const icon = {
  back: s('<path d="M15 18l-6-6 6-6"/>'),
  close: s('<path d="M18 6L6 18M6 6l12 12"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  palette: s('<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-1.8a1.5 1.5 0 0 0-1.1 2.5A1.5 1.5 0 0 1 14 21a2 2 0 0 1-2 1z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>'),
  undo: s('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  erase: s('<path d="M20 20H8.5L3.6 15.1a2 2 0 0 1 0-2.8L13.3 2.6a2 2 0 0 1 2.8 0l4.3 4.3a2 2 0 0 1 0 2.8L11 19"/><path d="M8 9l7 7"/>'),
  pencil: s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  bulb: s('<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>'),
  pause: s('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  home: s('<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  calendar: s('<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  chart: s('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  help: s('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
  restart: s('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  chevL: s('<path d="M15 18l-6-6 6-6"/>'),
  chevR: s('<path d="M9 18l6-6-6-6"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  grid: s('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'),
  refresh: s('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  download: s('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: s('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
  info: s('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
};

// Mindnook brand mark: four tiles hinting at the games (numbers, cards, blocks, pictures).
export const brandSvg = `<svg class="brand" viewBox="0 0 120 120" aria-hidden="true">
  <defs><linearGradient id="bg-brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b6cf0"/><stop offset="1" stop-color="#9b5de5"/></linearGradient></defs>
  <rect x="4" y="4" width="112" height="112" rx="28" fill="url(#bg-brand)"/>
  <rect x="20" y="20" width="36" height="36" rx="9" fill="#fff"/>
  <text x="38" y="47" text-anchor="middle" font-family="Roboto, Arial" font-size="26" font-weight="800" fill="#3c6bdc">5</text>
  <rect x="64" y="20" width="36" height="36" rx="9" fill="#fff"/>
  <path d="M82 49 l-10-10 a5.5 5.5 0 0 1 10-7 a5.5 5.5 0 0 1 10 7 z" fill="#e5484d"/>
  <rect x="20" y="64" width="36" height="36" rx="9" fill="#fff" fill-opacity=".18"/>
  <rect x="24" y="68" width="13" height="13" rx="3" fill="#ffd23f"/><rect x="39" y="68" width="13" height="13" rx="3" fill="#3ddc84"/><rect x="24" y="83" width="13" height="13" rx="3" fill="#38b6ff"/>
  <rect x="64" y="64" width="36" height="36" rx="9" fill="#fff"/>
  <g fill="#7a5bd6"><rect x="72" y="72" width="8" height="4"/><rect x="84" y="72" width="8" height="4"/><rect x="69" y="76" width="26" height="8"/><rect x="72" y="84" width="20" height="4"/><rect x="76" y="88" width="12" height="4"/><rect x="80" y="92" width="4" height="3"/></g>
</svg>`;

// Sudoku logo: a mini Sudoku grid with a highlighted cell.
export const logoSvg = `<svg class="logo" viewBox="0 0 120 120" aria-hidden="true">
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--primary)"/><stop offset="1" stop-color="color-mix(in srgb, var(--primary) 70%, #7a5bd6)"/></linearGradient></defs>
  <rect x="4" y="4" width="112" height="112" rx="28" fill="url(#lg)"/>
  <g stroke="#fff" stroke-opacity=".9" fill="none">
    <rect x="22" y="22" width="76" height="76" rx="6" stroke-width="4"/>
    <path d="M47.3 22v76M72.7 22v76M22 47.3h76M22 72.7h76" stroke-width="2.4" stroke-opacity=".7"/>
  </g>
  <rect x="49.5" y="49.5" width="21" height="21" rx="3" fill="#fff" fill-opacity=".95"/>
  <text x="60" y="66" text-anchor="middle" font-family="Roboto, Arial" font-size="17" font-weight="700" fill="var(--primary)">5</text>
  <text x="34.7" y="41" text-anchor="middle" font-family="Roboto, Arial" font-size="15" font-weight="500" fill="#fff">3</text>
  <text x="85.3" y="91.5" text-anchor="middle" font-family="Roboto, Arial" font-size="15" font-weight="500" fill="#fff">8</text>
  <text x="85.3" y="41" text-anchor="middle" font-family="Roboto, Arial" font-size="15" font-weight="500" fill="#fff" fill-opacity=".6">1</text>
</svg>`;
