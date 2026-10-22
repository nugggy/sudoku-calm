// Pressure Point: one big button, one rule per level, and a timer ring that runs down.
// Read the rule, then press, don't press, hold or wait. One slip ends the run; checkpoints every 10 levels.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, dialog, toast } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { createRun, levelTime, plural } from './press-levels.js';
import { cbOn } from './cb.js';

const PB = () => store.press;
const SEGS = 40;      // segments in the timer ring
export const pressHelp = (onClose) => helpSheet('How to play Pressure Point', [
  'Each level shows one instruction on the big button. Do exactly what it says before the ring runs out.',
  'Sometimes you press once, sometimes several times, and sometimes not at all. Some levels ask you to hold the button, wait for something to appear, tap a picture instead, keep to a beat, or remember something for a few levels later.',
  'Read carefully. Instructions can be tricky, and one wrong press ends the run.',
  'Every 10 levels you reach a checkpoint, so you can start your next run from there. The tasks change every time you try a block again.',
], 'press-btn', onClose);

// ---------- Button drawing ----------
const ringSVG = (lit = SEGS) => `<svg class="pr-ring" viewBox="-100 -100 200 200" aria-hidden="true"><circle r="98" class="pr-bezel"/><circle r="80" class="pr-groove"/>
  ${[...Array(SEGS)].map((_, k) => `<rect x="-4.6" y="-95" width="9.2" height="17" rx="3" transform="rotate(${k * (360 / SEGS)})" class="${k < lit ? 'on' : ''}"/>`).join('')}</svg>`;
const miniButton = (cls, text, lit) => `<div class="pr-mini ${cls}">${ringSVG(lit)}<div class="pr-face"><span>${text}</span></div></div>`;
export const pressCardArt = () => miniButton('art-press', 'PRESS', 29);

// ---------- Home ----------
export function pressHomeScreen(app) {
  const cps = () => Math.floor(PB().reached / 10);
  return levelHome({
    app, cls: 'press-theme press-home', title: 'Pressure Point', help: () => pressHelp(),
    hero: miniButton('pr-hero', "DON'T<br>PRESS", 31),
    play: () => ({ label: cps() ? `Play from level ${cps() * 10 + 1}` : 'Play', sub: PB().reached ? `Best: level ${PB().reached}` : 'One rule per level' }),
    onPlay: () => app.go('pressgame', { idx: cps() * 10 }),
    levels: () => ({ heading: 'Checkpoints', count: Math.max(6, cps() + 2), current: cps(), done: (i) => i < cps(), label: (i) => i * 10 + 1 }),
    onLevel: (i) => app.go('pressgame', { idx: i * 10 }),
  });
}

// ---------- Game ----------
export function pressGameScreen(app, { idx: startIdx = 0 }) {
  const pb = PB();
  const root = el(`<section class="screen press-theme press-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title" data-el="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="pr-info"><span data-el="best"></span><span data-el="run"></span></div>
    <div class="pr-stage" data-el="stage">
      <div class="pr-art" data-el="art"></div>
      <button class="pr-btn" data-el="btn" aria-label="The button">${ringSVG()}<div class="pr-face" data-el="face"><span data-el="text"></span></div></button>
      <div class="pr-msg" data-el="msg"></div>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const btn = q('btn'), face = q('face'), txt = q('text'), art = q('art'), segs = [...btn.querySelectorAll('.pr-ring rect')];
  let idx = startIdx, spec = null, a = null, state = 'idle', raf = 0, timers = [], alive = true, lit = SEGS;
  const mem = {};   // numbers to remember and the like, for this run
  // each block of 10 is planned afresh when it starts, keeping back kinds of task the player has had lately
  const run = createRun({ recent: pb.recent || [], cb: cbOn() });

  function sizeText(t) {
    const len = t.replace(/<[^>]+>/g, '').length;
    txt.style.fontSize = len <= 8 ? '34px' : len <= 16 ? '27px' : len <= 34 ? '21px' : len <= 52 ? '18px' : '16px';
  }
  function setText(t) { txt.innerHTML = t; sizeText(t); }
  // data-col feeds the colour name pill shown in colourblind mode (press.css)
  function setFace(c) { face.className = 'pr-face' + (c ? ' ' + c : ''); if (c) face.dataset.col = c.toUpperCase(); else delete face.dataset.col; }
  function setLit(n) {
    if (n === lit) return;
    lit = n;
    const frac = n / SEGS, cls = frac > 0.5 ? 'on' : frac > 0.25 ? 'on warn' : 'on low';
    segs.forEach((r, k) => r.setAttribute('class', k < n ? cls : ''));
  }
  function clearTimers() { timers.forEach((t) => clearInterval(t)); timers = []; cancelAnimationFrame(raf); }

  function startLevel() {
    clearTimers();
    spec = run.level(idx);
    pb.recent = [...(pb.recent || []).filter((k) => k !== spec.kind), spec.kind].slice(-60);
    btn.style.translate = '';
    a = {
      n: 0, bgN: 0, t: 0, frac: 0, held: 0, holding: false, flag: {}, mem, level: idx + 1,
      go() { a.flag.go = true; },
      setText, setFace, setArt: (h) => { art.innerHTML = h; },
      // slide the button sideways: -1 far left, 0 middle, 1 far right
      moveBtn: (p) => { const room = Math.max(0, (q('stage').clientWidth - btn.offsetWidth) / 2 - 8); btn.style.translate = `${Math.round(p * room)}px 0`; },
      after: (ms, fn) => { timers.push(setTimeout(() => { if (state === 'play' && alive) fn(); }, ms)); },
      every: (ms, fn) => { const id = setInterval(() => { if (state !== 'play' || !alive || fn() === false) clearInterval(id); }, ms); timers.push(id); },
    };
    a.need = typeof spec.need === 'function' ? spec.need(a) : spec.need;
    const text = typeof spec.text === 'function' ? spec.text(a) : spec.text;
    a.time = levelTime(spec, text, a.need, idx);
    q('title').textContent = `Level ${idx + 1}`;
    q('best').textContent = pb.reached ? `Best: level ${pb.reached}` : 'First run';
    q('run').textContent = `Started at ${startIdx + 1}`;
    q('msg').textContent = '';
    btn.classList.remove('down', 'won', 'lost');
    setFace(spec.face || '');
    setText(text);
    art.innerHTML = typeof spec.art === 'function' ? spec.art(a) : spec.art || '';
    setLit(SEGS);
    state = 'play';
    if (spec.init) spec.init(a);
    const t0 = performance.now() + 120; // a short beat so a late tap from the last level doesn't count
    const frame = (now) => {
      if (state !== 'play' || !alive) return;
      a.t = Math.max(0, (now - t0) / 1000); a.frac = Math.min(1, a.t / a.time);
      if (a.holding) a.held = (now - a.downAt) / 1000;
      setLit(Math.ceil((1 - a.frac) * SEGS));
      if (a.frac >= 1) return result(spec.end(a), true);
      raf = requestAnimationFrame(frame);
    };
    a.t0 = t0;
    raf = requestAnimationFrame(frame);
  }

  function result(r, timeout = false) {
    if (r === 'win') win();
    else if (r === 'fail') lose(timeout);
  }

  function win() {
    state = 'won'; clearTimers();
    btn.classList.remove('down'); btn.classList.add('won'); setFace('green');
    setText(`<svg class="pr-tick" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`);
    const done = idx + 1;
    if (done > pb.reached) { pb.reached = done; save(); }
    if (done % 10 === 0) { sfx.unit(); buzz(25); q('msg').textContent = `Checkpoint: level ${done + 1}`; }
    else { sfx.place(); buzz(12); }
    setTimeout(() => { if (!alive || state !== 'won') return; idx++; startLevel(); }, done % 10 === 0 ? 1100 : 650);
  }

  async function lose(timeout) {
    state = 'lost'; clearTimers();
    btn.classList.remove('down'); btn.classList.add('lost'); setFace('red');
    setText(`<svg class="pr-tick" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`);
    sfx.error(); buzz([60, 40, 60]);
    let why = typeof spec.why === 'function' ? spec.why(a) : spec.why;
    if (!why && a.need !== undefined) why = a.need === 0 ? 'This one wanted no presses at all.' : `This one needed ${plural(a.need, 'press')}.`;
    if (timeout && a.need > 0 && a.n < a.need && !spec.why) why = `Time ran out. This one needed ${plural(a.need, 'press')} and you pressed ${a.n}.`;
    else if (timeout && !why) why = 'Time ran out.';
    save(true);
    await new Promise((r) => setTimeout(r, 700));
    if (!alive) return;
    const cp = Math.floor(idx / 10) * 10;
    const v = await dialog({
      hero: 'img/art/ui/collision.svg', title: `Out at level ${idx + 1}`, dismissible: false, text: why || '',
      notes: pb.reached ? `Best: level ${pb.reached}` : '',
      buttons: [{ label: `Try again from level ${cp + 1}`, value: 'retry' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (!alive) return;
    if (v === 'retry') { idx = cp; run.replan(cp / 10); startLevel(); } else app.back();
  }

  // Input: the button counts on touch-down so fast tapping feels right; releases matter for hold levels.
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (state !== 'play' || performance.now() < a.t0) return;
    try { btn.setPointerCapture(e.pointerId); } catch { /* not needed */ }
    a.n++; a.holding = true; a.downAt = performance.now(); a.held = 0;
    btn.classList.add('down'); sfx.tap(); buzz(8);
    result(spec.tap(a));
  });
  const release = () => {
    btn.classList.remove('down');
    if (state !== 'play' || !a.holding) { if (a) a.holding = false; return; }
    a.holding = false; a.held = (performance.now() - a.downAt) / 1000;
    if (spec.up) result(spec.up(a));
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  q('stage').addEventListener('pointerdown', (e) => {
    if (state !== 'play' || e.target.closest('.pr-btn') || performance.now() < a.t0) return;
    // a picture or number to tap
    const tile = e.target.closest('.pr-tile');
    if (tile && spec.pick) {
      e.preventDefault();
      const r = spec.pick(a, tile.dataset.t, +tile.dataset.k);
      if (r === undefined && a.flag.wait) return; // not ready yet: ignore the tap
      tile.classList.add('picked'); sfx.tap(); buzz(8);
      result(r);
      return;
    }
    if (!spec.bg) return; // taps away from the button only matter on levels that ask for them
    a.bgN++; sfx.note(); buzz(6);
    const dot = el(`<i class="pr-tapdot" style="left:${e.clientX}px;top:${e.clientY}px"></i>`);
    root.appendChild(dot); setTimeout(() => dot.remove(), 450);
    result(spec.bg(a));
  });

  // Leaving the app or opening help mid-level would be unfair, so the level starts over afterwards.
  function pauseAndRestart(fn) {
    if (state !== 'play') return fn(() => {});
    state = 'paused'; clearTimers();
    fn(() => { if (alive && state === 'paused') startLevel(); });
  }
  const onVis = () => { if (document.hidden && state === 'play') { state = 'paused'; clearTimers(); } else if (!document.hidden && state === 'paused' && alive) startLevel(); };
  document.addEventListener('visibilitychange', onVis);

  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') app.back();
    else if (act === 'help') pauseAndRestart((resume) => pressHelp(resume));
  });

  const first = !pb.seenHelp;
  if (first) { pb.seenHelp = true; save(); state = 'paused'; setTimeout(() => pressHelp(() => { if (alive) startLevel(); }), 300); }
  else startLevel();
  if (startIdx > 0) toast(`Starting from level ${startIdx + 1}`);
  return { root, destroy() { alive = false; clearTimers(); document.removeEventListener('visibilitychange', onVis); save(true); } };
}
