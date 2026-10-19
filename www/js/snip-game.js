// Snip Buddies: two paper buddies snip each other into shape to solve little puzzles together.
// Play on two phones over wifi or a hotspot (one phone hosts and runs the game, the other sends its buttons),
// or both players on one phone with a set of buttons each.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti, sheet, esc, closeTopOverlay } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet, levelHome } from './kit.js';
import { lan } from './lan.js';
import { LEVELS, W, H, K, DT, FILL_WIN, createWorld, step, snip, resetShape, worldRing, shapeOf, applyShape } from './snip-engine.js';

const SB = () => store.snip || (store.snip = { level: 0, done: {}, name: '' });
const COLOURS = ['#ff7a6b', '#4fa8ff'];
const DARKER = ['#d4523f', '#2a7fd6'];
const FACES = ['face_a', 'face_f'];

export const snipHelp = () => helpSheet('How to play Snip Buddies', [
  'You and a friend each control a paper buddy. Work together to solve each little puzzle: fill an outline, pop balloons, roll a ball into place or hold down buttons.',
  'Move, jump, turn and crouch with your buttons. Stand so you overlap your buddy, then press <b>Snip</b> to cut away the part of them that is behind you. Your buddy can snip you too.',
  'Balloons only pop on a sharp point, so snip a corner to make one. The reset button gives you a fresh sheet of paper.',
  '<b>Two phones:</b> both phones need to be on the same wifi, or turn on the hotspot on one phone and join it from the other. One player taps Host, the other taps Join and picks the game. No internet is needed.',
  '<b>One phone:</b> choose Two players on this phone and share the screen, with a set of buttons each.',
], 'snip-btn');

// ---------- images ----------
const IMG = {};
for (const n of ['face_a', 'face_e', 'face_f', 'face_g', 'face_j', 'face_k', 'face_l', 'tile_left', 'tile_center', 'tile_right', 'tile_half_left', 'tile_half_center', 'tile_half_right', 'tile_grey', 'tile_exclamation', 'tile_coin', 'red_body_circle', 'pink_body_circle', 'yellow_body_circle', 'cloud1', 'cloud3', 'tile_background_tree_large', 'shadow']) {
  const im = new Image(); im.src = `img/snip/${n}.png`; IMG[n] = im;
}
const ready = (im) => im && im.complete && im.naturalWidth > 0;

// ---------- picker and home art ----------
export const snipCardArt = (cls = 'art-snip') => `<div class="${cls}"><div class="sb sb-a"><img src="img/snip/face_a.png" alt=""></div><div class="sb sb-b"><img src="img/snip/face_f.png" alt=""></div><svg class="sb-scissors" viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></svg></div>`;

// ---------- the connection, shared by the lobby and the game screen ----------
const net = { role: null, peer: '', inGame: false };
const isNet = () => net.role === 'host' || net.role === 'guest';

export function snipHomeScreen(app) {
  return levelHome({
    app, cls: 'snip-theme', title: 'Snip Buddies', help: snipHelp,
    hero: snipCardArt('snip-hero'),
    play: () => ({ label: 'Play on two phones', sub: 'Same wifi or a hotspot' }),
    onPlay: () => app.go('sniplobby'),
    extra: () => '<button class="btn secondary kit-btn snip-local" data-extra="local">Two players on this phone</button>',
    onExtra: () => app.go('snipgame', { idx: Math.min(SB().level, LEVELS.length - 1), mode: 'local' }),
    levels: () => ({ count: LEVELS.length, current: Math.min(SB().level, LEVELS.length - 1), done: (i) => !!SB().done[i], heading: 'Levels on this phone' }),
    onLevel: (i) => app.go('snipgame', { idx: i, mode: 'local' }),
  });
}

// ---------- lobby: host or join a game on another phone ----------
export function snipLobbyScreen(app) {
  const sb = SB();
  let state = 'idle', found = new Map(), hostInfo = null, alive = true;
  const root = el(`<section class="screen snip-theme snip-lobby">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Play on two phones</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  const myName = () => (sb.name || '').trim() || 'Player';

  function render() {
    if (!lan.available) { body.innerHTML = '<p class="snip-note">Playing on two phones is not available here.</p>'; return; }
    if (state === 'idle') {
      body.innerHTML = `<div class="snip-hero-wrap">${snipCardArt('snip-hero')}</div>
        <label class="snip-field"><span>Your name</span><input data-el="name" maxlength="14" value="${esc(sb.name || '')}" placeholder="Player" autocomplete="off"></label>
        <button class="btn snip-btn" data-act="host">Host a game<small>Your friend joins you</small></button>
        <button class="btn secondary" data-act="join">Join a game<small>Find a friend who is hosting</small></button>
        <p class="snip-note">Both phones need to be on the same wifi. No wifi? Turn on the hotspot on one phone and connect the other phone to it.</p>`;
    } else if (state === 'hosting') {
      body.innerHTML = `<div class="snip-wait"><div class="spinner"></div><h2>Waiting for your friend</h2>
        <p>Ask them to open Snip Buddies, tap <b>Play on two phones</b>, then <b>Join a game</b> and pick <b>${esc(myName())}</b>.</p>
        ${hostInfo && hostInfo.ip && lan.mode === 'wifi' ? `<div class="snip-ip"><small>If your game does not show up, they can type this address</small><b>${esc(hostInfo.ip)}</b></div>` : ''}
        <button class="btn ghost" data-act="cancel">Cancel</button></div>`;
    } else if (state === 'joining') {
      body.innerHTML = `<div class="section-title">Games nearby</div>
        <div class="snip-found">${found.size ? [...found].map(([id, n]) => `<button class="sheet-item" data-join="${esc(id)}">${esc(n)}<small>Tap to join</small></button>`).join('') : '<div class="snip-searching"><div class="spinner"></div>Looking for games on this network</div>'}</div>
        ${lan.mode === 'wifi' ? `<div class="section-title">Or join by address</div>
        <div class="snip-ipjoin"><input data-el="ip" inputmode="decimal" placeholder="192.168.0.10" autocomplete="off"><button class="btn snip-btn" data-act="joinip">Join</button></div>` : ''}
        <button class="btn ghost" data-act="cancel">Cancel</button>`;
    } else if (state === 'connecting') {
      body.innerHTML = '<div class="snip-wait"><div class="spinner"></div><h2>Connecting</h2><button class="btn ghost" data-act="cancel">Cancel</button></div>';
    } else if (state === 'connected') {
      const L = SB();
      body.innerHTML = net.role === 'host'
        ? `<div class="snip-partner"><span class="dot"></span>Playing with <b>${esc(net.peer || 'your friend')}</b></div>
          <div class="section-title">Pick a level</div>
          <div class="kit-levels">${LEVELS.map((lv, i) => `<button class="kit-level ${L.done[i] ? 'done' : ''}" data-lvl="${i}">${i + 1}</button>`).join('')}</div>
          <button class="btn ghost" data-act="cancel">Leave</button>`
        : `<div class="snip-wait"><div class="snip-partner"><span class="dot"></span>Connected to <b>${esc(net.peer || 'your friend')}</b></div>
          <h2>Waiting for ${esc(net.peer || 'your friend')} to pick a level</h2><button class="btn ghost" data-act="cancel">Leave</button></div>`;
    }
  }
  function reset(msg) {
    lan.close(); net.role = null; net.peer = ''; net.inGame = false; state = 'idle'; found = new Map();
    if (msg) toast(msg, 3000);
    render();
  }
  const off = lan.on((e) => {
    if (!alive) return;
    if (e.type === 'hosting') { hostInfo = e; if (state === 'hosting') render(); }
    else if (e.type === 'found') { found.set(e.id, e.name); if (state === 'joining') render(); }
    else if (e.type === 'lost') { found.delete(e.id); if (state === 'joining') render(); }
    else if (e.type === 'connected') {
      net.role = e.role; state = 'connected'; lan.stopDiscover();
      lan.send({ t: 'hi', name: myName(), v: 1 });
      sfx.unit(); buzz(30); render();
    } else if (e.type === 'error') { toast(e.msg, 3000); if (state === 'connecting') { state = 'joining'; render(); } }
    else if (e.type === 'closed') { if (net.inGame) return; reset('Your friend has left'); }
    else if (e.type === 'msg') {
      const m = e.data;
      if (m.t === 'hi') { net.peer = String(m.name || '').slice(0, 14); render(); }
      else if (m.t === 'level' && net.role === 'guest' && !net.inGame) { net.inGame = true; app.go('snipgame', { idx: m.i, mode: 'guest' }); }
    }
  });
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return snipHelp();
    if (a === 'host') { sb.name = $('[data-el="name"]', root).value.trim().slice(0, 14); save(); state = 'hosting'; hostInfo = null; lan.host(myName()); render(); }
    else if (a === 'join') { sb.name = $('[data-el="name"]', root).value.trim().slice(0, 14); save(); state = 'joining'; found = new Map(); lan.discover(); render(); }
    else if (a === 'joinip') { const ip = $('[data-el="ip"]', root).value.trim(); if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { toast('Type the address shown on the host phone'); return; } state = 'connecting'; render(); lan.joinIp(ip, 0); }
    else if (a === 'cancel') reset();
    const j = e.target.closest('[data-join]');
    if (j) { state = 'connecting'; render(); lan.join(j.dataset.join); }
    const l = e.target.closest('[data-lvl]');
    if (l && net.role === 'host') { const i = +l.dataset.lvl; net.inGame = true; lan.send({ t: 'level', i }); app.go('snipgame', { idx: i, mode: 'host' }); }
  });
  render();
  return {
    root,
    onShow() { net.inGame = false; if (!isNet() && state === 'connected') state = 'idle'; render(); },
    destroy() { alive = false; off(); lan.close(); net.role = null; net.peer = ''; net.inGame = false; },
  };
}

// ---------- controls ----------
const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  L: SVG('<path d="M15 5l-7 7 7 7"/>'), R: SVG('<path d="M9 5l7 7-7 7"/>'),
  RL: SVG('<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>'), RR: SVG('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>'),
  C: SVG('<path d="M6 9l6 6 6-6"/><path d="M5 19h14"/>'), J: SVG('<path d="M6 15l6-6 6 6"/><path d="M5 5h14"/>'),
  snip: SVG('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>'),
  reset: SVG('<rect x="6" y="4" width="12" height="16" rx="1.5"/><path d="M9 9h6M9 13h6"/>'),
};
const btn = (k, label, cls = '') => `<button class="sp-b ${cls}" ${K[k] ? `data-k="${K[k]}"` : `data-a="${k}"`} aria-label="${label}">${ICONS[k]}${cls.includes('big') ? `<span>${label}</span>` : ''}</button>`;
function padHTML(p, compact) {
  if (compact) return `<div class="sp-pad sp-c p${p}" data-pad="${p}">
    <div class="sp-row">${btn('L', 'Left')}${btn('R', 'Right')}${btn('RL', 'Turn left')}${btn('RR', 'Turn right')}</div>
    <div class="sp-row">${btn('C', 'Crouch')}${btn('J', 'Jump', 'jump')}${btn('snip', 'Snip', 'snip')}${btn('reset', 'New paper')}</div></div>`;
  return `<div class="sp-pad sp-full p${p}" data-pad="${p}">
    <div class="sp-move">${btn('L', 'Left', 'mv')}${btn('R', 'Right', 'mv')}</div>
    <div class="sp-mid">${btn('RL', 'Turn left')}${btn('RR', 'Turn right')}${btn('C', 'Crouch')}</div>
    <div class="sp-act">${btn('J', 'Jump', 'big jump')}${btn('snip', 'Snip', 'big snip')}</div></div>`;
}
const KEYS = [
  { KeyA: K.L, KeyD: K.R, KeyW: K.J, KeyS: K.C, KeyQ: K.RL, KeyE: K.RR, KeyF: 'snip', KeyR: 'reset' },
  { ArrowLeft: K.L, ArrowRight: K.R, ArrowUp: K.J, ArrowDown: K.C, KeyK: K.RL, KeyL: K.RR, Enter: 'snip', Backspace: 'reset' },
];

// ---------- game ----------
export function snipGameScreen(app, { idx, mode = 'local' }) {
  const sb = SB(), lv = LEVELS[idx];
  const me = mode === 'guest' ? 1 : 0;          // which buddy this phone controls (local mode controls both)
  let w = createWorld(idx), alive = true, raf = 0, last = 0, acc = 0, moving = false, done = false;
  const bits = [0, 0];                            // buttons held on this phone, per buddy
  let remoteBits = 0, sentBits = -1, sentAt = 0;  // host: the guest's buttons; guest: last sent
  const faceT = [{ n: '', t: 0 }, { n: '', t: 0 }];
  const parts = [];
  let snaps = [];                                 // guest: recent snapshots for smooth movement
  const root = el(`<section class="screen snip-theme snip-game ${mode === 'local' ? 'local' : 'netmode'}">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${idx + 1}. ${esc(lv.name)}</div>
      ${mode === 'local' ? '' : `<button class="icon-btn" data-a="reset" aria-label="New paper">${ICONS.reset}</button>`}
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="sp-info"><span class="sp-hint">${esc(lv.hint)}</span><b data-el="prog"></b></div>
    <div class="sp-stage" data-el="stage"><canvas></canvas>${mode === 'guest' ? '<div class="sp-lag" data-el="lag">Connecting</div>' : ''}</div>
    <div class="sp-pads">${mode === 'local' ? padHTML(0, true) + padHTML(1, true) : padHTML(me, false)}</div>
  </section>`);
  const stage = $('[data-el="stage"]', root), cv = $('canvas', stage), ctx = cv.getContext('2d');
  const prog = $('[data-el="prog"]', root);
  let view = { s: 30, ox: 0, oy: 0, dpr: 1 };
  // Show from a little above the highest thing in the level down to the bottom, so the play area is as big as it can be.
  const viewTop = (() => {
    const ys = [...lv.spawn.map(([, y]) => y - 0.85), ...w.balloons.map((b) => b.y - b.r), ...w.buttons.map((b) => b.y), ...(w.goal ? [w.goal[1]] : []),
      ...(w.target ? w.target.ring.map((q) => q[1]) : []), ...w.statics.filter((st) => st.bb[2] > 0.01 && st.bb[0] < W - 0.01).map((st) => st.bb[1])];
    return Math.max(0, Math.min(...ys) - 3.6);
  })();

  function fit() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    const vh = H - viewTop, s = Math.min(r.width / W, r.height / vh);
    // centre the visible band, so a wide level on a tall phone does not leave a gap above it
    view = { s, ox: (r.width - W * s) / 2, oy: (r.height + vh * s) / 2 - H * s, dpr };
  }

  // ----- actions -----
  function face(p, n, t) { faceT[p] = { n, t }; }
  function doSnip(p) {
    const res = snip(w, p);
    if (res === 'ok') { sfx.place(); buzz(20); face(p, 'face_g', 0.45); face(1 - p, 'face_e', 0.6); burst(w.buddies[1 - p], COLOURS[1 - p]); }
    else { sfx.error(); face(p, 'face_j', 0.6); if (mode !== 'local' && p !== me) lan.send({ t: 'fx', k: res }); else toast(res === 'small' ? 'That would leave too little paper' : 'Overlap your buddy to snip them'); }
    if (res === 'ok' && mode === 'host') lan.send({ t: 'shape', p: 1 - p, d: shapeOf(w.buddies[1 - p]) });
  }
  function doReset(p) {
    resetShape(w, p); sfx.erase();
    if (mode === 'host') lan.send({ t: 'shape', p, d: shapeOf(w.buddies[p]) });
  }
  function action(p, a) {
    if (done) return;
    if (mode === 'guest') { lan.send({ t: a }); if (a === 'snip') face(me, 'face_g', 0.3); return; }
    if (a === 'snip') doSnip(p); else if (a === 'reset') doReset(p);
  }

  // ----- input -----
  const held = new Map(); // pointerId -> {p, k}
  function press(b, pid) {
    const pad = b.closest('[data-pad]'), p = +pad.dataset.pad;
    b.classList.add('on');
    if (b.dataset.k) { held.set(pid, { p, k: +b.dataset.k, b }); bits[p] |= +b.dataset.k; }
    else action(p, b.dataset.a);
  }
  function release(pid) {
    const h = held.get(pid); if (!h) return;
    held.delete(pid); h.b.classList.remove('on');
    bits[h.p] = 0; for (const o of held.values()) if (o.p === h.p) bits[h.p] |= o.k;
  }
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.sp-b'); if (!b) return;
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    press(b, e.pointerId);
    if (!b.dataset.k) setTimeout(() => b.classList.remove('on'), 120);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => root.addEventListener(t, (e) => release(e.pointerId)));
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  const onKey = (e, down) => {
    if (e.target.tagName === 'INPUT') return;
    for (let p = 0; p < 2; p++) {
      const v = KEYS[mode === 'local' ? p : 0][e.code]; if (v === undefined) continue;
      const who = mode === 'local' ? p : me;
      e.preventDefault();
      if (typeof v === 'number') bits[who] = down ? bits[who] | v : bits[who] & ~v;
      else if (down && !e.repeat) action(who, v);
    }
  };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') snipHelp();
    else if (e.target.closest('.topbar [data-a="reset"]')) action(me, 'reset');
  });

  // ----- network -----
  const off = lan.on((e) => {
    if (!alive) return;
    if (e.type === 'closed') { toast('Your friend has left', 3000); net.role = null; moving = true; app.backTo('snip'); return; }
    if (e.type !== 'msg') return;
    const m = e.data;
    if (mode === 'host') {
      if (m.t === 'in') remoteBits = m.k | 0;
      else if (m.t === 'snip') doSnip(1);
      else if (m.t === 'reset') doReset(1);
      else if (m.t === 'menu') { toast(`${net.peer || 'Your friend'} went back to the levels`); moving = true; app.back(); }
    } else if (mode === 'guest') {
      if (m.t === 's') { snaps.push({ at: performance.now(), m }); if (snaps.length > 8) snaps.shift(); const lag = $('[data-el="lag"]', root); if (lag) lag.remove(); }
      else if (m.t === 'shape') applyShape(w.buddies[m.p], m.d);
      else if (m.t === 'ev') m.e.forEach(react);
      else if (m.t === 'fx') toast(m.k === 'small' ? 'That would leave too little paper' : 'Overlap your buddy to snip them');
      else if (m.t === 'win') onWin();
      else if (m.t === 'level' && m.i !== idx) { closeTopOverlay(); moving = true; app.replace('snipgame', { idx: m.i, mode: 'guest' }); }
      else if (m.t === 'menu') { moving = true; app.back(); }
    }
  });
  // compact snapshot: buddy and prop poses, balloon and button states, score
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function snapshot() {
    return { t: 's', f: w.frame, b: w.buddies.map((b) => [r3(b.x), r3(b.y), r3(b.a), r3(b.c)]), o: w.props.map((b) => [r3(b.x), r3(b.y), r3(b.a)]),
      p: w.balloons.reduce((s, b, i) => s | (b.popped ? 1 << i : 0), 0), n: w.buttons.reduce((s, b, i) => s | (b.on ? 1 << i : 0), 0), sc: r3(w.score) };
  }
  function applySnap(m, m2, t) {
    const L = (a, b) => (m2 ? a + (b - a) * t : a);
    m.b.forEach((v, i) => { const b = w.buddies[i], v2 = m2 ? m2.b[i] : v; b.x = L(v[0], v2[0]); b.y = L(v[1], v2[1]); b.a = L(v[2], v2[2]); b.c = L(v[3], v2[3]); });
    m.o.forEach((v, i) => { const b = w.props[i], v2 = m2 ? m2.o[i] : v; b.x = L(v[0], v2[0]); b.y = L(v[1], v2[1]); b.a = L(v[2], v2[2]); });
    const s = m2 || m;
    w.balloons.forEach((b, i) => { b.popped = !!(s.p & (1 << i)); });
    w.buttons.forEach((b, i) => { b.on = !!(s.n & (1 << i)); });
    w.score = s.sc;
  }

  // ----- effects -----
  function burst(b, colour, n = 14) {
    for (let i = 0; i < n; i++) parts.push({ x: b.x, y: b.y, vx: Math.cos(i * 2.4) * (2 + (i % 4)), vy: Math.sin(i * 2.4) * (2 + (i % 3)) - 3, life: 0.9, c: colour, r: 0.06 + (i % 3) * 0.03 });
  }
  function react(ev) {
    if (ev.k === 'pop') { sfx.unit(); buzz(25); for (let i = 0; i < 18; i++) parts.push({ x: ev.x, y: ev.y, vx: Math.cos(i * 0.35) * 5, vy: Math.sin(i * 0.35) * 5, life: 0.6, c: i % 2 ? '#ff5d6c' : '#ffd1d6', r: 0.07 }); }
    else if (ev.k === 'press') sfx.tap();
    else if (ev.k === 'snip' && mode === 'guest') { sfx.place(); face(ev.by, 'face_g', 0.45); face(1 - ev.by, 'face_e', 0.6); burst(w.buddies[1 - ev.by], COLOURS[1 - ev.by]); }
    else if (ev.k === 'respawn') sfx.erase();
  }

  async function onWin() {
    if (done) return;
    done = true;
    if (!sb.done[idx]) sb.done[idx] = true;
    sb.level = Math.max(sb.level, Math.min(LEVELS.length - 1, idx + 1)); save(true);
    sfx.win(); confetti(); face(0, 'face_k', 99); face(1, 'face_k', 99);
    if (mode === 'host') lan.send({ t: 'win' });
    await new Promise((r) => setTimeout(r, 900));
    if (!alive || moving) return;
    const last = idx + 1 >= LEVELS.length;
    if (mode === 'guest') {
      const v = await dialog({ hero: 'img/art/ui/trophy.svg', title: 'Nicely done', text: `Waiting for ${net.peer || 'your friend'} to choose what is next.`, buttons: [{ label: 'Back to the levels', value: 'back', cls: 'ghost' }], dismissible: false });
      if (v === 'back' && alive && !moving) app.back();
      return;
    }
    const v = await dialog({
      hero: 'img/art/ui/trophy.svg', title: last ? 'Every puzzle solved' : 'Nicely done', dismissible: false,
      text: last ? `You finished all ${LEVELS.length} levels together.` : `Level ${idx + 1} complete.`,
      buttons: last ? [{ label: 'Back', value: 'back' }] : [{ label: 'Next level', value: 'next' }, { label: 'Levels', value: 'back', cls: 'ghost' }],
    });
    if (!alive || moving) return;
    if (v === 'next') { moving = true; if (mode === 'host') lan.send({ t: 'level', i: idx + 1 }); app.replace('snipgame', { idx: idx + 1, mode }); }
    else app.back();
  }

  // ----- loop -----
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (mode === 'guest') {
      const k = bits[me];
      if (k !== sentBits || now - sentAt > 150) { lan.send({ t: 'in', k }); sentBits = k; sentAt = now; }
      // show the host's world a little in the past so movement stays smooth between snapshots
      const t = now - 70;
      let a = null, b = null;
      for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].at <= t) { a = snaps[i]; b = snaps[i + 1] || null; break; }
      if (!a && snaps.length) a = snaps[0];
      if (a) applySnap(a.m, b && b.m, b ? Math.min(1, (t - a.at) / Math.max(1, b.at - a.at)) : 0);
    } else if (!done || mode === 'local' || mode === 'host') {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 6) {
        step(w, mode === 'host' ? [bits[0], remoteBits] : [bits[0], bits[1]]);
        acc -= DT; n++;
        if (mode === 'host' && w.frame % 2 === 0) lan.send(snapshot());
      }
      if (n === 6) acc = 0;
      if (w.events.length) {
        const evs = w.events; w.events = [];
        if (mode === 'host') { const send = evs.filter((e) => e.k !== 'win'); if (send.length) lan.send({ t: 'ev', e: send }); }
        evs.forEach((e) => (e.k === 'win' ? onWin() : react(e)));
      }
    }
    for (const f of faceT) f.t = Math.max(0, f.t - dt);
    for (const p of parts) { p.vy += 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    draw(now / 1000);
  }

  // ----- drawing -----
  const dark = () => document.documentElement.dataset.theme === 'dark';
  function img(n, x, y, wd, ht) { if (ready(IMG[n])) ctx.drawImage(IMG[n], x, y, wd, ht); }
  function path(r) { ctx.beginPath(); r.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
  function drawStatic(st) {
    if (st.r) {
      const [x, y, wd, ht] = st.r;
      if (x >= W || x + wd <= 0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, wd, ht); ctx.clip();
      const half = ht <= 0.6, rh = half ? ht : Math.min(1, ht), n = Math.max(1, Math.round(wd / (half ? rh * 2 : rh))), cw = wd / n;
      for (let i = 0; i < n; i++) {
        const nm = half ? (n === 1 ? 'tile_half_center' : i === 0 ? 'tile_half_left' : i === n - 1 ? 'tile_half_right' : 'tile_half_center') : n === 1 ? 'tile_center' : i === 0 ? 'tile_left' : i === n - 1 ? 'tile_right' : 'tile_center';
        img(nm, x + i * cw - 0.01, y, cw + 0.02, rh + 0.01);
      }
      for (let yy = y + rh; yy < Math.min(y + ht, H); yy += 1) for (let i = 0; i < Math.ceil(wd); i++) img('tile_grey', x + i - 0.005, yy - 0.005, 1.01, 1.01);
      ctx.restore();
    } else {
      ctx.save(); path(st.ring); ctx.clip();
      const [x0, y0, x1, y1] = st.bb;
      for (let yy = Math.floor(y0); yy < y1; yy++) for (let xx = Math.floor(x0); xx < x1; xx++) img('tile_grey', xx, yy, 1.01, 1.01);
      ctx.restore();
      // a sunny edge along the slope
      ctx.save(); ctx.strokeStyle = '#f7b733'; ctx.lineWidth = 0.14; ctx.lineCap = 'round';
      const r = st.ring; ctx.beginPath();
      for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if (b[0] - a[0] > 0.2 && Math.abs(b[1] - a[1]) < (b[0] - a[0]) * 1.5 && Math.min(a[1], b[1]) < y1 - 0.01) { ctx.moveTo(a[0], a[1] + 0.07); ctx.lineTo(b[0], b[1] + 0.07); } }
      ctx.stroke(); ctx.restore();
    }
  }
  function drawBuddy(b, t) {
    const k = 1 - 0.35 * b.c, p = b.i;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.scale(1, k);
    // paper shadow, fill and white edge
    ctx.save(); ctx.translate(0.06, 0.08 / k); path(b.shape); ctx.fillStyle = 'rgba(30,40,70,.18)'; ctx.fill(); ctx.restore();
    path(b.shape); ctx.fillStyle = COLOURS[p]; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(-2, -2, 4, 1.55); // soft light from above
    const f = faceT[p], nm = f.t > 0 ? f.n : FACES[p], im = IMG[nm];
    if (ready(im)) { const fw = 0.86, fh = (fw * im.naturalHeight) / im.naturalWidth; const blink = !f.t && Math.sin(t * 1.3 + p * 2) > 0.995; ctx.drawImage(blink ? IMG.face_k : im, b.face[0] - fw / 2, b.face[1] - fh / 2, fw, fh); }
    ctx.restore();
    path(b.shape); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.07; ctx.lineJoin = 'round'; ctx.stroke();
    path(b.shape); ctx.strokeStyle = DARKER[p]; ctx.lineWidth = 0.02; ctx.stroke();
    // sharp points sparkle on balloon levels
    if (lv.type === 'pop') for (const i of b.sharp) { const [x, y] = b.shape[i]; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 0.06 + 0.02 * Math.sin(t * 8), 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function draw(t) {
    const { s, ox, oy, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.translate(ox, oy); ctx.scale(s, s);
    ctx.save(); ctx.beginPath(); ctx.rect(0, viewTop, W, H - viewTop); ctx.clip();
    // sky, clouds and trees
    const g = ctx.createLinearGradient(0, viewTop, 0, H);
    if (dark()) { g.addColorStop(0, '#1c2440'); g.addColorStop(1, '#3a4570'); } else { g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#e4f6ff'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = dark() ? 0.35 : 0.95;
    img('cloud1', ((t * 0.15) % 14) - 3, viewTop + 0.6, 2.6, 1.74); img('cloud3', ((t * 0.1 + 7) % 14) - 3, viewTop + 1.9, 2.2, 1.5);
    ctx.globalAlpha = dark() ? 0.25 : 0.6;
    img('tile_background_tree_large', 0.4, 9.2, 1.9, 2.9); img('tile_background_tree_large', 7.8, 8.6, 2.3, 3.5);
    ctx.globalAlpha = 1;
    // target outline
    if (w.target) {
      path(w.target.ring); ctx.fillStyle = dark() ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.55)'; ctx.fill();
      ctx.setLineDash([0.16, 0.12]); ctx.lineDashOffset = -t * 0.3; ctx.strokeStyle = w.score >= FILL_WIN ? '#2fbf71' : dark() ? '#cfd8ff' : '#3d5a99'; ctx.lineWidth = 0.06; ctx.stroke(); ctx.setLineDash([]);
    }
    // goal area: a glowing pocket with a coin bobbing above it
    if (w.goal) {
      const [x, y, gw, gh] = w.goal;
      ctx.fillStyle = 'rgba(255,214,64,.28)'; ctx.fillRect(x, y, gw, gh);
      img('tile_coin', x + gw / 2 - 0.3, y - 0.9 + Math.sin(t * 3) * 0.1, 0.6, 0.6);
    }
    w.statics.forEach(drawStatic);
    // buttons
    for (const bt of w.buttons) {
      const sink = bt.on ? 0.06 : 0, vert = bt.h > bt.w;
      ctx.fillStyle = '#5b6478'; ctx.fillRect(bt.x - 0.05, bt.y + bt.h - 0.06, bt.w + 0.1, 0.08);
      ctx.fillStyle = bt.on ? '#33c46b' : '#ffb636'; ctx.fillRect(bt.x, bt.y + sink, bt.w, bt.h - sink);
      if (!vert) img('tile_exclamation', bt.x + bt.w / 2 - 0.2, bt.y - 0.5 + (bt.on ? 0 : Math.sin(t * 4) * 0.05), 0.4, 0.4);
    }
    // balloons
    w.balloons.forEach((bl, i) => {
      if (bl.popped) return;
      const bob = Math.sin(t * 2 + i) * 0.03;
      ctx.strokeStyle = dark() ? '#c9cbe0' : '#6b6f80'; ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.moveTo(bl.x, bl.y + bl.r + bob); ctx.quadraticCurveTo(bl.x + 0.15, bl.y + bl.r + 0.4, bl.x, bl.y + bl.r + 0.8); ctx.stroke();
      img(i % 2 ? 'pink_body_circle' : 'red_body_circle', bl.x - bl.r, bl.y - bl.r * 1.08 + bob, bl.r * 2, bl.r * 2.16);
    });
    // ball
    for (const b of w.props) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      img('yellow_body_circle', -b.r, -b.r, b.r * 2, b.r * 2);
      if (ready(IMG.face_l)) ctx.drawImage(IMG.face_l, -b.r * 0.6, -b.r * 0.35, b.r * 1.2, b.r * 0.84);
      ctx.restore();
    }
    w.buddies.forEach((b) => drawBuddy(b, t));
    for (const p of parts) { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
    ctx.globalAlpha = 1;
    ctx.restore();
    // progress text
    let txt = '';
    if (lv.type === 'fill') txt = `${Math.round(Math.min(1, w.score) * 100)}% of ${Math.round(FILL_WIN * 100)}%`;
    else if (lv.type === 'pop') txt = `${w.balloons.filter((b) => b.popped).length} of ${w.balloons.length} popped`;
    else if (lv.type === 'press') txt = `${w.buttons.filter((b) => b.on).length} of ${w.buttons.length} pressed`;
    else txt = w.score ? 'In!' : 'Ball to the coin';
    if (prog.textContent !== txt) prog.textContent = txt;
  }

  const ro = new ResizeObserver(() => fit());
  requestAnimationFrame(() => { if (!alive) return; fit(); ro.observe(stage); raf = requestAnimationFrame(frame); });
  if (mode !== 'local') net.inGame = true;
  if (!sb.seenHelp) { sb.seenHelp = true; save(); setTimeout(snipHelp, 350); }
  return {
    root, _world: () => w,
    onHide() { bits[0] = bits[1] = 0; },
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); off();
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      if (isNet() && !moving) lan.send({ t: 'menu' });
    },
  };
}
