// Cosy Cat Sort: home tab and game screen.
import { newLevel, move, isWon, isStuck, shuffleCats, clone, recipe, topRun, topIndex, count, space, canPlace, encodeLevel, decodeLevel, SAVE_VERSION, isValidBoard, stateKey } from './sort-engine.js';
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, confetti, toast, sheet } from './ui.js';
import { sfx, buzz } from './sound.js';

// Ten costumes. Each has its own colour, hood shape and cat face so they are easy to tell apart.
export const COSTUME = [
  { name: 'Frog', col: '#7cc46a', dark: '#4f9a44', face: 'cat03', deco: 'frog' },
  { name: 'Bunny', col: '#f4a6c6', dark: '#d97aa2', face: 'cat04', deco: 'bunny' },
  { name: 'Chick', col: '#f7d04a', dark: '#d9a91e', face: 'cat02', deco: 'chick' },
  { name: 'Bear', col: '#b07a52', dark: '#86553a', face: 'cat01', deco: 'bear' },
  { name: 'Strawberry', col: '#e8504f', dark: '#b8302f', face: 'cat06', deco: 'berry' },
  { name: 'Sailor', col: '#4f8fe0', dark: '#2f66b0', face: 'cat05', deco: 'sailor' },
  { name: 'Wizard', col: '#8e6bd8', dark: '#6447ad', face: 'cat08', deco: 'wizard' },
  { name: 'Panda', col: '#f4f4f2', dark: '#c9c9c4', face: 'cat07', deco: 'panda' },
  { name: 'Dino', col: '#3fb8a8', dark: '#23877a', face: 'cat10', deco: 'dino' },
  { name: 'Pumpkin', col: '#f3923a', dark: '#c96a1c', face: 'cat13', deco: 'pumpkin' },
  { name: 'Unicorn', col: '#e6d4ff', dark: '#a98bd6', face: 'cat02', deco: 'unicorn' },
  { name: 'Bee', col: '#3b3b3b', dark: '#1f1f1f', face: 'cat14', deco: 'bee' },
  { name: 'Penguin', col: '#2c3e66', dark: '#1b2a4a', face: 'cat09', deco: 'penguin' },
  { name: 'Elephant', col: '#9aa5b1', dark: '#6b7785', face: 'cat05', deco: 'elephant' },
];

function deco(c) {
  const { col, dark } = c;
  switch (c.deco) {
    case 'frog': return { back: '', front: `<circle cx="30" cy="16" r="11" fill="${col}"/><circle cx="70" cy="16" r="11" fill="${col}"/><circle cx="30" cy="15" r="6.5" fill="#fff"/><circle cx="70" cy="15" r="6.5" fill="#fff"/><circle cx="31" cy="16" r="3.5" fill="#2b2b2b"/><circle cx="69" cy="16" r="3.5" fill="#2b2b2b"/>` };
    case 'bunny': return { back: `<ellipse cx="34" cy="10" rx="8" ry="20" fill="${col}" transform="rotate(-12 34 10)"/><ellipse cx="66" cy="10" rx="8" ry="20" fill="${col}" transform="rotate(12 66 10)"/><ellipse cx="34" cy="10" rx="4" ry="14" fill="#ffd9e8" transform="rotate(-12 34 10)"/><ellipse cx="66" cy="10" rx="4" ry="14" fill="#ffd9e8" transform="rotate(12 66 10)"/>`, front: '' };
    case 'chick': return { back: '', front: `<path d="M44 12 Q48 0 50 10 Q53 -1 56 12 Z" fill="${dark}"/>` };
    case 'bear': return { back: `<circle cx="24" cy="20" r="10" fill="${col}"/><circle cx="76" cy="20" r="10" fill="${col}"/><circle cx="24" cy="20" r="5" fill="${dark}"/><circle cx="76" cy="20" r="5" fill="${dark}"/>`, front: '' };
    case 'berry': return { back: '', front: `<path d="M50 14 L38 6 L45 15 L34 14 L46 19 L50 22 L54 19 L66 14 L55 15 L62 6 Z" fill="#4caf50"/><circle cx="24" cy="44" r="1.6" fill="#ffe08a"/><circle cx="22" cy="58" r="1.6" fill="#ffe08a"/><circle cx="76" cy="44" r="1.6" fill="#ffe08a"/><circle cx="78" cy="58" r="1.6" fill="#ffe08a"/>` };
    case 'sailor': return { back: '', front: `<ellipse cx="50" cy="13" rx="20" ry="7" fill="#fff"/><rect x="34" y="6" width="32" height="8" rx="3" fill="#fff"/><rect x="34" y="11" width="32" height="3" fill="${dark}"/>` };
    case 'wizard': return { back: '', front: `<path d="M30 18 L54 -6 L70 18 Z" fill="${dark}"/><ellipse cx="50" cy="18" rx="24" ry="5" fill="${dark}"/><path d="M54 5 l1.5 3 3 .5 -2.2 2 .6 3 -2.9-1.5 -2.9 1.5 .6-3 -2.2-2 3-.5z" fill="#ffd54a"/>` };
    case 'panda': return { back: `<circle cx="24" cy="20" r="10" fill="#2b2b2b"/><circle cx="76" cy="20" r="10" fill="#2b2b2b"/>`, front: '' };
    case 'dino': return { back: `<path d="M30 14 l6 -12 6 10 M44 9 l6 -12 6 12 M58 10 l6 -10 6 12" fill="${dark}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>`, front: '' };
    case 'pumpkin': return { back: '', front: `<rect x="47" y="2" width="6" height="12" rx="2" fill="#6d4c2f"/><path d="M53 6 Q64 0 66 8 Q58 10 53 9 Z" fill="#4caf50"/>` };
    case 'unicorn': return { back: `<circle cx="18" cy="34" r="7" fill="#ff9ccf"/><circle cx="16" cy="48" r="6" fill="#8fd3ff"/><circle cx="82" cy="34" r="7" fill="#ffe08a"/><circle cx="84" cy="48" r="6" fill="#a5e8b5"/>`, front: `<path d="M44 14 L50 -8 L56 14 Z" fill="#ffd54a" stroke="#e0a91e" stroke-width="1.5"/><path d="M46 7 L54 5 M45 11 L55 9" stroke="#e0a91e" stroke-width="1.5"/>` };
    case 'bee': return { back: `<path d="M38 12 Q32 0 26 -2" stroke="#1f1f1f" stroke-width="2.5" fill="none"/><path d="M62 12 Q68 0 74 -2" stroke="#1f1f1f" stroke-width="2.5" fill="none"/><circle cx="26" cy="-2" r="5" fill="#ffd43b"/><circle cx="74" cy="-2" r="5" fill="#ffd43b"/>`, mid: `<path d="M18 78 Q50 70 82 78 L83 85 Q50 77 17 85 Z" fill="#ffd43b"/><path d="M16 91 Q50 83 84 91 L84 97 Q50 89 16 97 Z" fill="#ffd43b"/>`, front: '' };
    case 'penguin': return { back: '', mid: `<ellipse cx="50" cy="84" rx="20" ry="14" fill="#fff"/>`, front: `<path d="M44 12 Q50 2 56 12 Z" fill="#ff9f2e"/><circle cx="50" cy="5" r="4" fill="#ff5a5a"/>` };
    case 'elephant': return { back: `<ellipse cx="14" cy="46" rx="14" ry="20" fill="${col}" stroke="${dark}" stroke-width="2"/><ellipse cx="86" cy="46" rx="14" ry="20" fill="${col}" stroke="${dark}" stroke-width="2"/><ellipse cx="14" cy="46" rx="8" ry="13" fill="#f4b8c8"/><ellipse cx="86" cy="46" rx="8" ry="13" fill="#f4b8c8"/>`, front: '' };
  }
  return { back: '', front: '' };
}

const svgCache = {};
export function cutie(k) {
  if (svgCache[k]) return svgCache[k];
  const c = COSTUME[k], d = deco(c);
  svgCache[k] = `<svg viewBox="0 -8 100 108" class="cutie-svg" aria-label="${c.name} cat">
    ${d.back}
    <path d="M16 100 Q14 64 50 62 Q86 64 84 100 Z" fill="${c.col}" stroke="${c.dark}" stroke-width="2"/>
    <ellipse cx="50" cy="86" rx="16" ry="12" fill="#fff" fill-opacity=".35"/>
    ${d.mid || ''}
    <circle cx="50" cy="44" r="35" fill="${c.col}" stroke="${c.dark}" stroke-width="2"/>
    <image href="img/cats/${c.face}.png" x="19" y="15" width="62" height="62"/>
    <ellipse cx="34" cy="97" rx="8" ry="5.5" fill="#fff4e6" stroke="${c.dark}" stroke-width="1.5"/>
    <ellipse cx="66" cy="97" rx="8" ry="5.5" fill="#fff4e6" stroke="${c.dark}" stroke-width="1.5"/>
    ${d.front}
  </svg>`;
  return svgCache[k];
}

const BOOSTER_REWARD = ['undo', 'shuffle', 'slot'];

// Only resume a saved board made under the current rules (older saves could have gaps between cats).
function resumable(level) {
  const c = store.sort.current;
  return !!c && c.level === level && c.v === SAVE_VERSION && isValidBoard(c.state);
}

// ---------- Home tab ----------
export function sortHomeScreen(app) {
  const root = el(`<section class="screen sort-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${icon.gear}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const s = store.sort, r = recipe(s.level);
    body.innerHTML = `
      <div class="sort-hero">
        <div class="sort-hero-cats">${[0, 1, 2, 3, 4].map((k) => `<div class="cutie bob" style="animation-delay:${k * 0.15}s">${cutie((k + s.level) % 10)}</div>`).join('')}</div>
        <div class="sort-plank"></div>
        <h1 class="sort-title">Cosy Cat Sort</h1>
        <p>Match four cats in the same outfit and send them home</p>
      </div>
      <button class="sort-btn ${r.hard ? 'hard' : ''}" data-act="play">${resumable(s.level) ? 'Continue' : 'Play'} level ${s.level + 1}<small>${r.hard ? 'Hard level · ' : ''}${r.k} outfits · ${r.shelves} shelves</small></button>
      <button class="meow-btn alt" data-act="levels" style="margin-top:12px">Levels<small>Replay any finished level</small></button>
      <div class="sort-card">
        <div class="boost-row">
          <div><span class="boost-ic">${icon.undo}</span><b>${s.boosters.undo}</b>Undo</div>
          <div><span class="boost-ic">${icon.refresh}</span><b>${s.boosters.shuffle}</b>Shuffle</div>
          <div><span class="boost-ic">${icon.plus}</span><b>${s.boosters.slot}</b>Extra spot</div>
        </div>
        <p class="sort-note">You earn a free booster for every level you finish. No ads, no shop.</p>
      </div>
      <div class="sort-card"><div class="stat-row" style="border:0"><img src="img/ui/trophy.png" alt=""><span class="k">Levels finished</span><span class="v">${s.level}</span></div></div>`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'play') app.go('sortgame', { level: store.sort.level });
    else if (a === 'levels') app.go('sortlevels');
    else if (a === 'help') sortHelp();
    else if (a === 'settings') app.go('settings');
  });
  render();
  return { root, refresh: render };
}

export function sortHelp() {
  sheet(`<h2>How to play</h2><div class="help-body">
    <p>Shelves face the aisle down the middle. You can only pick up the cat nearest the aisle. If the cats next to it wear the same outfit, they come along too.</p>
    <p>Tap a shelf to pick up its cats, then tap where they should go. Cats only sit on an empty shelf or next to a cat in the same outfit. The baskets take any cat.</p>
    <p>Get four cats in the same outfit onto one shelf and they head home together.</p>
    <p>Grey boxes hide a cat. A box opens once it is the cat nearest the aisle.</p>
    <p>Some shelves have more cats waiting behind. Clear the shelf and the next row drops in.</p>
    <p>The two baskets at the bottom hold any cat while you make room. Boosters help when you get stuck: Undo, Shuffle and an Extra spot. The light bulb shows you a good next move, as often as you like.</p>
  </div><button class="sort-btn" data-x>Let's sort</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// ---------- Level supply (pre-built file, then a background worker for endless levels) ----------
let levelList = null;
async function loadSortLevels() {
  if (levelList) return levelList;
  try { levelList = (await (await fetch('levels/sort-levels.json')).json()).levels; } catch { levelList = []; }
  return levelList;
}
let worker = null, wid = 0;
const waiting = new Map(), built = new Map();
function askWorker(msg) {
  if (!worker) {
    worker = new Worker(new URL('./sort-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const r = waiting.get(e.data.id); if (r) { waiting.delete(e.data.id); r(e.data); } };
  }
  return new Promise((res) => { const id = ++wid; waiting.set(id, res); worker.postMessage({ id, ...msg }); });
}
function buildInWorker(level) {
  if (built.has(level)) return Promise.resolve(built.get(level));
  try {
    return askWorker({ level }).then((r) => { built.set(level, r.data); return r.data; });
  } catch {
    return Promise.resolve(encodeLevel(newLevel(level)));
  }
}
function findPlan(state) {
  try { return askWorker({ type: 'hint', state }).then((r) => r.path); }
  catch { return import('./sort-engine.js').then((m) => m.solvePath(state)); }
}
async function getLevel(level) {
  const list = await loadSortLevels();
  if (level < list.length) return decodeLevel(level, list[level]);
  return decodeLevel(level, await buildInWorker(level));
}
// Warm up the next endless level while the current one is played.
function prefetchLevel(level) { loadSortLevels().then((list) => { if (level >= list.length) buildInWorker(level); }); }

// ---------- Game ----------
export function sortGameScreen(app, { level }) {
  const s = store.sort;
  let st = null;
  const history = [];
  let selected = null; // {shelf} or {hold}
  let busy = true;
  let hinted = false;

  const root = el(`<section class="screen sort-theme sort-game">
    <header class="sort-header">
      <button class="sort-round" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="sort-level" data-el="title">Level ${level + 1}</div>
      <button class="sort-round" data-act="help" aria-label="How to play">${icon.help}</button>
    </header>
    <div class="houses" data-el="houses"></div>
    <div class="shelves" data-el="shelves"><div class="sort-loading"><div class="spinner"></div>Setting up the shelves</div></div>
    <div class="holds" data-el="holds"></div>
    <div class="boosters">
      <button class="sort-boost" data-act="undo" aria-label="Undo">${icon.undo}<span class="plus" data-b="undo"></span></button>
      <button class="sort-boost" data-act="shuffle" aria-label="Shuffle">${icon.refresh}<span class="plus" data-b="shuffle"></span></button>
      <button class="sort-boost" data-act="slot" aria-label="Extra spot">${icon.plus}<span class="plus" data-b="slot"></span></button>
      <button class="sort-boost hint-btn" data-act="hint" aria-label="Hint"><img src="img/ui/light-bulb.png" alt=""></button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  let plan = null;      // {path, idx, expect}: a known way to finish, followed step by step
  let hintDst = null;   // where the hinted cats should go

  function persist() { s.current = { level, v: SAVE_VERSION, state: st }; save(); }
  const sameSel = (p) => selected && p && selected.hold === p.hold && selected.shelf === p.shelf;
  const side = (si) => (si % 2 === 0 ? 'left' : 'right');

  function render() {
    q('title').innerHTML = `Level ${level + 1}${st.hard ? '<span class="hard-badge">Hard</span>' : ''}`;
    q('houses').innerHTML = `<div class="house-track">${[...Array(st.k)].map((_, i) => {
      const k = st.home[i];
      return `<div class="house ${k != null ? 'full' : ''}" data-house="${i}"><div class="roof"></div><div class="door">${k != null ? cutie(k) : ''}</div></div>`;
    }).join('')}</div>`;
    const sh = q('shelves');
    sh.style.setProperty('--rows', Math.ceil(st.shelves.length / 2));
    sh.innerHTML = st.shelves.map((shelf, si) => {
      const run = sameSel({ shelf: si }) ? topRun(shelf) : { n: 0 };
      const top = topIndex(shelf);
      return `<div class="shelf ${side(si)} ${hintDst && hintDst.shelf === si ? 'hint-dst' : ''}" data-shelf="${si}">
        <div class="slots">${shelf.slots.map((c, i) => {
          if (c === null) return `<div class="slot empty" data-slot="${i}"></div>`;
          if (shelf.hidden[i]) return `<div class="slot" data-slot="${i}"><div class="mystery">?</div></div>`;
          const lifted = run.n && i > top - run.n;
          return `<div class="slot" data-slot="${i}"><div class="cutie ${lifted ? 'lifted' : ''}">${cutie(c)}</div></div>`;
        }).join('')}</div>
        <div class="plank">${shelf.layers.length ? `<span class="layers">+${shelf.layers.reduce((a, l) => a + l.length, 0)}</span>` : ''}</div>
      </div>`;
    }).join('');
    q('holds').innerHTML = st.hold.map((c, i) => `<div class="basket ${hintDst && hintDst.hold != null && st.hold[i] === null && i === firstFreeHold() ? 'hint-dst' : ''}" data-hold="${i}">${c !== null ? `<div class="cutie ${sameSel({ hold: i }) ? 'lifted' : ''}">${cutie(c)}</div>` : ''}</div>`).join('')
      + (st.hold.length < 3 ? '<div class="basket locked" data-act="slot">+</div>' : '');
    $$('[data-b]', root).forEach((b) => { const n = s.boosters[b.dataset.b]; b.textContent = n > 0 ? n : '+'; b.classList.toggle('none', n <= 0); });
  }

  const nodeAt = (p) => (p.hold != null ? $(`[data-hold="${p.hold}"]`, root) : $(`[data-shelf="${p.shelf}"] [data-slot="${p.slot}"]`, root));
  const rectOf = (p) => nodeAt(p)?.getBoundingClientRect();

  async function fly(k, fromRect, toRect, duration = 280) {
    const g = el(`<div class="cutie ghost">${cutie(k)}</div>`);
    Object.assign(g.style, { left: fromRect.left + 'px', top: fromRect.top + 'px', width: fromRect.width + 'px', height: fromRect.height + 'px' });
    document.body.appendChild(g);
    const dx = toRect.left - fromRect.left, dy = toRect.top - fromRect.top;
    const lift = Math.min(-30, dy / 2 - 40);
    const anim = g.animate([
      { transform: 'translate(0,0) scale(1.05)' },
      { transform: `translate(${dx / 2}px, ${dy / 2 + lift / 2}px) scale(1.12)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)` },
    ], { duration, easing: 'ease-in-out' });
    // never leave the board locked if the animation is paused (for example, the app goes to the background)
    await Promise.race([anim.finished, new Promise((r) => setTimeout(r, duration + 150))]).catch(() => {});
    g.remove();
  }

  async function doMove(from, to) {
    const before = clone(st);
    const preview = clone(st);
    const events = move(preview, from, to);
    if (!events) return false;
    busy = true;
    selected = null;
    hintDst = null;
    // keep following the hint plan if this was its next step, otherwise forget it
    const step = plan && stateKey(st) === plan.expect ? plan.path[plan.idx] : null;
    const sameEnd = (a, b) => (a.hold != null && b.hold != null) || (a.shelf != null && a.shelf === b.shelf);
    if (step && sameEnd(step.from, from) && sameEnd(step.to, to)) { plan.idx++; plan.expect = stateKey(preview); } else plan = null;
    const mv = events[0];
    const fromRects = mv.moves.map((m) => rectOf(m.from));
    st = preview;
    history.push(before);
    if (history.length > 60) history.shift();
    // save the settled board now, before the animation temporarily rearranges things
    s.current = { level, v: SAVE_VERSION, state: clone(st) }; save(true);

    const homeEv = events.find((e) => e.type === 'home');
    const homeShelf = homeEv ? homeEv.shelf : -1;
    const dropped = events.filter((e) => e.type === 'drop').map((e) => e.shelf);
    const saved = dropped.map((si) => ({ si, slots: st.shelves[si].slots.slice(), hidden: st.shelves[si].hidden.slice() }));
    saved.forEach(({ si }) => { st.shelves[si].slots = st.shelves[si].slots.map(() => null); });
    if (homeEv) { st.shelves[homeShelf].slots.fill(homeEv.cat); st.shelves[homeShelf].hidden.fill(false); st.home.pop(); }
    render();
    const targets = mv.moves.map((m) => nodeAt(m.to)?.querySelector('.cutie'));
    targets.forEach((n) => n && (n.style.visibility = 'hidden'));
    sfx.place();
    await Promise.all(mv.moves.map((m, i) => new Promise((res) => setTimeout(() => {
      fly(mv.cat, fromRects[i], rectOf(m.to)).then(() => { if (targets[i]) targets[i].style.visibility = ''; res(); });
    }, i * 70))));
    if (homeEv) {
      sfx.cat(); buzz(25);
      const nodes = $$(`[data-shelf="${homeShelf}"] .cutie`, root);
      nodes.forEach((n) => n.classList.add('cheer'));
      await new Promise((r) => setTimeout(r, 450));
      const house = $(`[data-house="${st.home.length}"]`, root).getBoundingClientRect();
      const target = { left: house.left + house.width * 0.2, top: house.top + house.height * 0.35, width: house.width * 0.6, height: house.width * 0.6 };
      const rects = nodes.map((n) => n.getBoundingClientRect());
      st.shelves[homeShelf].slots.fill(null);
      render();
      await Promise.all(rects.map((r, i) => new Promise((res) => setTimeout(() => fly(homeEv.cat, r, target, 420).then(res), i * 70))));
      st.home.push(homeEv.cat);
      sfx.unit();
    }
    saved.forEach(({ si, slots, hidden }) => { st.shelves[si].slots = slots; st.shelves[si].hidden = hidden; });
    render();
    for (const si of dropped) $$(`[data-shelf="${si}"] .cutie`, root).forEach((n, i) => { n.classList.add('drop-in'); n.style.animationDelay = i * 60 + 'ms'; });
    for (const e of events) if (e.type === 'reveal') nodeAt({ shelf: e.shelf, slot: e.slot })?.querySelector('.cutie')?.classList.add('drop-in');
    if (homeEv) $(`[data-house="${st.home.length - 1}"]`, root)?.classList.add('pulse');
    busy = false;
    persist();
    if (isWon(st)) win();
    else if (isStuck(st)) stuck();
    return true;
  }

  async function stuck() {
    const opts = [];
    if (s.boosters.slot > 0 && st.hold.length < 3) opts.push({ label: `Add an extra spot (${s.boosters.slot} left)`, value: 'slot' });
    if (s.boosters.undo > 0 && history.length) opts.push({ label: `Undo last move (${s.boosters.undo} left)`, value: 'undo' });
    if (s.boosters.shuffle > 0) opts.push({ label: `Shuffle cats (${s.boosters.shuffle} left)`, value: 'shuffle' });
    opts.push({ label: 'Restart level', value: 'restart', cls: opts.length ? 'secondary' : '' });
    const v = await dialog({ hero: 'img/cats/cat08.png', title: 'No moves left', text: 'Every cat is blocked. Use a booster or start the level again.', buttons: opts, dismissible: false });
    if (v === 'restart') restart(); else if (v) useBooster(v); // no choice means back was pressed
  }

  async function restart() {
    busy = true;
    plan = null; hintDst = null;
    st = await getLevel(level); history.length = 0; selected = null;
    busy = false;
    persist(); render();
  }

  function useBooster(kind) {
    if (busy) return;
    plan = null; hintDst = null;
    if (s.boosters[kind] <= 0) { toast('Finish a level to earn more boosters'); return; }
    if (kind === 'undo') {
      if (!history.length) { toast('Nothing to undo'); return; }
      st = history.pop(); sfx.erase();
    } else if (kind === 'shuffle') {
      history.push(clone(st)); shuffleCats(st); sfx.cross();
      $$('.cutie', q('shelves')).forEach((n) => n.classList.add('spin'));
    } else if (kind === 'slot') {
      if (st.hold.length >= 3) { toast('You already have the extra spot'); return; }
      st.hold.push(null); sfx.hint();
    }
    s.boosters[kind]--;
    selected = null;
    persist();
    setTimeout(render, kind === 'shuffle' ? 250 : 0);
  }

  function win() {
    const reward = BOOSTER_REWARD[level % 3];
    s.boosters[reward]++;
    if (level >= s.level) s.level = level + 1;
    s.current = null;
    save(true);
    prefetchLevel(level + 1);
    sfx.meowWin();
    confetti();
    const names = { undo: 'Undo', shuffle: 'Shuffle', slot: 'Extra spot' };
    setTimeout(() => {
      const node = el(`<div class="meow-win"><div class="box sort-win">
        <div class="sort-hero-cats">${st.home.slice(0, 5).map((k, i) => `<div class="cutie bob" style="animation-delay:${i * 0.12}s">${cutie(k)}</div>`).join('')}</div>
        <h2>Everyone's home</h2>
        <p>Level ${level + 1} sorted in ${st.moves} moves</p>
        <div class="unlock"><span class="boost-ic">${reward === 'undo' ? icon.undo : reward === 'shuffle' ? icon.refresh : icon.plus}</span><div>Reward<br><span style="font-weight:400;opacity:.75">+1 ${names[reward]}</span></div></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="sort-btn" data-act="next">Next level</button>
          <button class="meow-btn alt" data-act="home">Back</button>
        </div></div></div>`);
      document.getElementById('overlay-root').appendChild(node);
      node.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
        node.remove();
        if (a === 'next') app.replace('sortgame', { level: level + 1 }); else app.back();
      });
    }, 500);
  }

  const firstFreeHold = () => st.hold.indexOf(null);

  async function showHint() {
    hintDst = null;
    if (!plan || stateKey(st) !== plan.expect) {
      busy = true;
      const slow = setTimeout(() => toast('Thinking'), 400);
      const path = await findPlan(clone(st));
      clearTimeout(slow);
      busy = false;
      if (!path || !path.length) { plan = null; toast('No way forward from here. Try Undo or a booster.', 3500); sfx.error(); return; }
      plan = { path, idx: 0, expect: stateKey(st) };
    }
    const m = plan.path[plan.idx];
    selected = m.from;
    hintDst = m.to;
    sfx.hint();
    render();
    const n = m.from.hold != null ? 1 : topRun(st.shelves[m.from.shelf]).n;
    toast(`Move ${n > 1 ? 'the lifted cats' : 'the lifted cat'} ${m.to.hold != null ? 'into a basket' : 'to the glowing shelf'}`, 3000);
  }

  function shake(node) { if (!node) return; node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); buzz(20); }

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return sortHelp();
    if (busy) return;
    if (a === 'undo' || a === 'shuffle' || a === 'slot') return useBooster(a);
    if (a === 'hint') return showHint();
    const holdEl = e.target.closest('[data-hold]');
    const shelfEl = e.target.closest('[data-shelf]');
    const p = holdEl ? { hold: +holdEl.dataset.hold } : shelfEl ? { shelf: +shelfEl.dataset.shelf } : null;
    if (!p) { if (selected) { selected = null; render(); } return; }
    const canPick = p.hold != null ? st.hold[p.hold] !== null : topRun(st.shelves[p.shelf]).n > 0;
    if (sameSel(p)) { selected = null; sfx.tap(); render(); return; }
    if (selected) {
      if (await doMove(selected, p)) return;
      const cat = selected.hold != null ? st.hold[selected.hold] : topRun(st.shelves[selected.shelf]).cat;
      if (p.shelf != null && space(st.shelves[p.shelf]) > 0 && !canPlace(st.shelves[p.shelf], cat)) {
        // room, but the wrong outfit at the aisle end
        shake(shelfEl);
        if (!hinted) { hinted = true; toast('Cats only sit next to a cat in the same outfit, or on an empty shelf'); }
        return;
      }
      // the destination is full: pick up from it instead, if possible
      if (canPick) { selected = p; sfx.cat(); render(); } else shake(shelfEl || holdEl);
      return;
    }
    if (canPick) { selected = p; sfx.cat(); render(); return; }
    if (p.shelf != null && count(st.shelves[p.shelf]) > 0) toast('That box opens when it is the cat nearest the aisle');
  });

  (async () => {
    st = resumable(level) ? s.current.state : await getLevel(level);
    root.style.setProperty('--hcount', st.k > 10 ? Math.ceil(st.k / 2) : st.k);
    root.style.setProperty('--hrows', st.k > 10 ? 2 : 1);
    busy = false;
    render();
    persist();
    prefetchLevel(level + 1);
    if (level === 0 && !s.seenHelp) { s.seenHelp = true; save(); setTimeout(sortHelp, 300); }
  })();

  return { root, destroy() { $$('.ghost').forEach((g) => g.remove()); save(true); } };
}

// ---------- Level map ----------
export function sortLevelsScreen(app) {
  const root = el(`<section class="screen sort-theme">
    <header class="sort-header"><button class="sort-round" data-act="back" aria-label="Back">${icon.back}</button><div class="sort-level">Levels</div><div class="spacer"></div></header>
    <div class="scroll"><div class="level-grid"></div></div></section>`);
  const done = store.sort.level;
  const show = Math.max(30, Math.ceil((done + 20) / 5) * 5);
  let html = '';
  for (let i = 0; i < show; i++) {
    const r = recipe(i);
    html += `<button class="level-dot ${i < done ? 'done' : ''} ${i === done ? 'current' : ''} ${r.hard ? 'hard' : ''}" data-idx="${i}" ${i > done ? 'disabled' : ''}>${i + 1}</button>`;
  }
  $('.level-grid', root).innerHTML = html;
  setTimeout(() => $('.level-dot.current', root)?.scrollIntoView({ block: 'center' }), 0);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="back"]')) return app.back();
    const b = e.target.closest('[data-idx]');
    if (b) app.go('sortgame', { level: +b.dataset.idx });
  });
  return { root };
}
