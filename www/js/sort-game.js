// Cosy Cat Sort: home tab and game screen.
import { newLevel, move, isWon, isStuck, shuffleCats, freeSlots, clone, recipe, SLOTS } from './sort-engine.js';
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
    <circle cx="50" cy="44" r="35" fill="${c.col}" stroke="${c.dark}" stroke-width="2"/>
    <image href="img/cats/${c.face}.png" x="19" y="15" width="62" height="62"/>
    <ellipse cx="34" cy="97" rx="8" ry="5.5" fill="#fff4e6" stroke="${c.dark}" stroke-width="1.5"/>
    <ellipse cx="66" cy="97" rx="8" ry="5.5" fill="#fff4e6" stroke="${c.dark}" stroke-width="1.5"/>
    ${d.front}
  </svg>`;
  return svgCache[k];
}

const BOOSTER_REWARD = ['undo', 'shuffle', 'slot'];

// ---------- Home tab ----------
export function sortHomeScreen(app) {
  const root = el(`<section class="screen sort-theme with-tabbar">
    <header class="topbar"><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button><div class="title"></div>
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
      <button class="sort-btn" data-act="play">${s.current && s.current.level === s.level ? 'Continue' : 'Play'} level ${s.level + 1}<small>${r.k} outfits · ${r.shelves} shelves</small></button>
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
    if (a === 'play') app.go('sortgame', { level: store.sort.level });
    else if (a === 'help') sortHelp();
    else if (a === 'settings') app.go('settings');
  });
  render();
  return { root, refresh: render };
}

export function sortHelp() {
  sheet(`<h2>How to play</h2><div class="help-body">
    <p>Tap a cat to pick it up, then tap a shelf with a free spot to put it there.</p>
    <p>Get four cats in the same outfit onto one shelf and they head home together.</p>
    <p>Grey boxes hide a cat. Move a cat next to a box, or away from it, to open it.</p>
    <p>Some shelves have more cats waiting behind. Clear the shelf and the next row drops in.</p>
    <p>The two baskets at the bottom hold any cat while you make room. Boosters help when you get stuck: Undo, Shuffle and an Extra spot.</p>
  </div><button class="sort-btn" data-x>Let's sort</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// ---------- Game ----------
export function sortGameScreen(app, { level }) {
  const s = store.sort;
  let st = s.current && s.current.level === level ? s.current.state : newLevel(level);
  const history = [];
  let selected = null; // {shelf, slot} or {hold}
  let busy = false;

  const root = el(`<section class="screen sort-theme sort-game">
    <header class="sort-header">
      <button class="sort-round" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="sort-level">Level ${level + 1}</div>
      <button class="sort-round" data-act="help" aria-label="How to play">${icon.help}</button>
    </header>
    <div class="houses" data-el="houses"></div>
    <div class="shelves" data-el="shelves"></div>
    <div class="holds" data-el="holds"></div>
    <div class="boosters">
      <button class="sort-boost" data-act="undo" aria-label="Undo">${icon.undo}<span class="plus" data-b="undo"></span></button>
      <button class="sort-boost" data-act="shuffle" aria-label="Shuffle">${icon.refresh}<span class="plus" data-b="shuffle"></span></button>
      <button class="sort-boost" data-act="slot" aria-label="Extra spot">${icon.plus}<span class="plus" data-b="slot"></span></button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);

  function persist() { s.current = { level, state: st }; save(); }

  const same = (a, b) => a && b && a.hold === b.hold && a.shelf === b.shelf && a.slot === b.slot;
  const catAt = (p) => (p.hold != null ? st.hold[p.hold] : st.shelves[p.shelf].slots[p.slot]);

  function render() {
    // houses: one per outfit in the level, filled when that outfit has gone home
    q('houses').innerHTML = `<div class="house-track">${[...Array(st.k)].map((_, i) => {
      const k = st.home[i];
      return `<div class="house ${k != null ? 'full' : ''}" data-house="${i}"><div class="roof"></div><div class="door">${k != null ? cutie(k) : ''}</div></div>`;
    }).join('')}</div>`;
    const sh = q('shelves');
    sh.style.setProperty('--rows', Math.ceil(st.shelves.length / 2));
    sh.innerHTML = st.shelves.map((shelf, si) => `<div class="shelf" data-shelf="${si}">
        <div class="slots">${shelf.slots.map((c, i) => {
          const p = { shelf: si, slot: i };
          if (c === null) return `<div class="slot empty" data-slot="${i}"></div>`;
          if (shelf.hidden[i]) return `<div class="slot" data-slot="${i}"><div class="mystery">?</div></div>`;
          return `<div class="slot" data-slot="${i}"><div class="cutie ${same(p, selected) ? 'lifted' : ''}">${cutie(c)}</div></div>`;
        }).join('')}</div>
        <div class="plank">${shelf.layers.length ? `<span class="layers">+${shelf.layers.reduce((a, l) => a + l.length, 0)}</span>` : ''}</div>
      </div>`).join('');
    q('holds').innerHTML = st.hold.map((c, i) => `<div class="basket" data-hold="${i}">${c !== null ? `<div class="cutie ${same({ hold: i }, selected) ? 'lifted' : ''}">${cutie(c)}</div>` : ''}</div>`).join('')
      + (st.hold.length < 3 ? '<div class="basket locked" data-act="slot">+</div>' : '');
    $$('[data-b]', root).forEach((b) => { const n = s.boosters[b.dataset.b]; b.textContent = n > 0 ? n : '+'; b.classList.toggle('none', n <= 0); });
  }

  function rectOf(p) {
    const node = p.hold != null ? $(`[data-hold="${p.hold}"]`, root) : $(`[data-shelf="${p.shelf}"] [data-slot="${p.slot}"]`, root);
    return node && node.getBoundingClientRect();
  }

  function ghost(k, rect) {
    const g = el(`<div class="cutie ghost">${cutie(k)}</div>`);
    Object.assign(g.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    document.body.appendChild(g);
    return g;
  }

  async function fly(k, fromRect, toRect, duration = 260) {
    const g = ghost(k, fromRect);
    const dx = toRect.left - fromRect.left, dy = toRect.top - fromRect.top;
    const lift = Math.min(-30, dy / 2 - 40);
    await g.animate([
      { transform: 'translate(0,0) scale(1.05)' },
      { transform: `translate(${dx / 2}px, ${dy / 2 + lift / 2}px) scale(1.12)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)` },
    ], { duration, easing: 'ease-in-out' }).finished;
    g.remove();
  }

  async function doMove(from, to) {
    const cat = catAt(from);
    const fromRect = rectOf(from);
    const before = clone(st);
    const events = move(st, from, to);
    if (!events) { buzz(20); return; }
    busy = true;
    history.push(before);
    if (history.length > 60) history.shift();
    // save the settled board now, before the animation temporarily rearranges things
    store.sort.current = { level, state: clone(st) }; save(true);
    selected = null;
    const mv = events[0];
    const homeEv = events.find((e) => e.type === 'home');
    // draw the destination with the cat present but hidden, so we can fly to it
    const homeShelf = homeEv ? homeEv.shelf : -1;
    const dropped = events.filter((e) => e.type === 'drop').map((e) => e.shelf);
    const savedLayers = dropped.map((si) => ({ si, slots: st.shelves[si].slots.slice() }));
    // hide dropped rows until their moment, and show the completed set until it walks home
    savedLayers.forEach(({ si }) => { st.shelves[si].slots = st.shelves[si].slots.map(() => null); });
    if (homeEv) { st.shelves[homeShelf].slots.fill(homeEv.cat); st.shelves[homeShelf].hidden.fill(false); }
    render();
    const toRect = rectOf(mv.to);
    const dstNode = mv.to.hold != null ? $(`[data-hold="${mv.to.hold}"] .cutie`, root) : $(`[data-shelf="${mv.to.shelf}"] [data-slot="${mv.to.slot}"] .cutie`, root);
    if (dstNode) dstNode.style.visibility = 'hidden';
    sfx.place();
    await fly(cat, fromRect, toRect);
    if (dstNode) dstNode.style.visibility = '';
    if (homeEv) {
      // the four friends hop, then walk home together
      sfx.cat(); buzz(25);
      const slotNodes = $$(`[data-shelf="${homeShelf}"] .cutie`, root);
      slotNodes.forEach((n) => n.classList.add('cheer'));
      await new Promise((r) => setTimeout(r, 450));
      const house = $(`[data-house="${st.home.length - 1}"]`, root).getBoundingClientRect();
      const target = { left: house.left + house.width * 0.2, top: house.top + house.height * 0.35, width: house.width * 0.6, height: house.width * 0.6 };
      const rects = slotNodes.map((n) => n.getBoundingClientRect());
      st.shelves[homeShelf].slots.fill(null);
      const keepHome = st.home.pop();
      render();
      await Promise.all(rects.map((r, i) => new Promise((res) => setTimeout(() => fly(homeEv.cat, r, target, 420).then(res), i * 70))));
      st.home.push(keepHome);
      sfx.unit();
    }
    savedLayers.forEach(({ si, slots }) => { st.shelves[si].slots = slots; });
    render();
    for (const si of dropped) $$(`[data-shelf="${si}"] .cutie`, root).forEach((n, i) => { n.classList.add('drop-in'); n.style.animationDelay = i * 60 + 'ms'; });
    if (homeEv) $(`[data-house="${st.home.length - 1}"]`, root)?.classList.add('pulse');
    busy = false;
    persist();
    if (isWon(st)) win();
    else if (isStuck(st)) stuck();
  }

  async function stuck() {
    const opts = [];
    if (s.boosters.slot > 0 && st.hold.length < 3) opts.push({ label: `Add an extra spot (${s.boosters.slot} left)`, value: 'slot' });
    if (s.boosters.undo > 0) opts.push({ label: `Undo last move (${s.boosters.undo} left)`, value: 'undo' });
    if (s.boosters.shuffle > 0) opts.push({ label: `Shuffle cats (${s.boosters.shuffle} left)`, value: 'shuffle' });
    opts.push({ label: 'Restart level', value: 'restart', cls: opts.length ? 'secondary' : '' });
    const v = await dialog({ hero: 'img/cats/cat08.png', title: 'Out of room', text: 'Every spot is full. Use a booster or start the level again.', buttons: opts, dismissible: false });
    if (v === 'restart') restart(); else useBooster(v);
  }

  function restart() {
    st = newLevel(level); history.length = 0; selected = null;
    persist(); render();
  }

  function useBooster(kind) {
    if (busy) return;
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

  root.addEventListener('click', (e) => {
    if (busy) return;
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return sortHelp();
    if (a === 'undo' || a === 'shuffle' || a === 'slot') return useBooster(a);
    const hold = e.target.closest('[data-hold]');
    const shelfEl = e.target.closest('[data-shelf]');
    const slotEl = e.target.closest('[data-slot]');
    let p = null;
    if (hold) p = { hold: +hold.dataset.hold };
    else if (shelfEl && slotEl) p = { shelf: +shelfEl.dataset.shelf, slot: +slotEl.dataset.slot };
    const c = p ? catAt(p) : null;
    const hidden = p && p.shelf != null && st.shelves[p.shelf].hidden[p.slot];
    if (p && c !== null && !hidden) {
      // tapping a cat picks it up (or puts it back down)
      selected = same(p, selected) ? null : p;
      if (selected) sfx.cat(); else sfx.tap();
      render();
      return;
    }
    if (hidden) { toast('Move a cat next to the box to open it'); return; }
    if (!selected) return;
    if (hold) doMove(selected, { hold: +hold.dataset.hold });
    else if (shelfEl) doMove(selected, slotEl ? { shelf: +shelfEl.dataset.shelf, slot: +slotEl.dataset.slot } : { shelf: +shelfEl.dataset.shelf });
  });

  render();
  persist();
  if (level === 0 && !s.seenHelp) { s.seenHelp = true; save(); setTimeout(sortHelp, 300); }
  return { root, destroy() { $$('.ghost').forEach((g) => g.remove()); save(true); } };
}
