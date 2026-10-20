// Play Together: two-player games on one phone (pass and play) or two phones over wifi, a hotspot or Bluetooth.
//
// Game module API (full details in www/js/duo/README.md and core.js):
//   www/js/duo/g-<id>.js exports default { id, name, tag, cat: 'board' | 'action' | 'party', realtime, art: () => html, help: [..], create(ctx) }
//   ctx = { root, me: 0 | 1 | null (null on one phone), local, isHost, first, names: [n0, n1], send(obj), onMsg(fn), end({winner, text}),
//           sfx, buzz, toast, rng, alive() };  create returns { destroy() }.
//   Turn-based: both phones run the same rules and send moves. Real-time: the host simulates and sends snapshots, the guest sends input.
//   makePair(game, opts) (from core.js, re-exported here) wires two ctx objects together in one page for tests.
//
// Connection protocol (inside lan messages): {k: 'hello', name} | {k: 'start', id, first, seed} | {k: 'g', d} (game message)
//   | {k: 'quit'} (left the game, back to the picker) | {k: 'bye'} (disconnecting).
import { store, save } from '../store.js';
import { icon } from '../icons.js';
import { el, $, $$, sheet, toast, confetti } from '../ui.js';
import { sfx, buzz } from '../sound.js';
import { lan } from '../lan.js';
import { makeCtx, esc } from './core.js';
import { webJoinPanel } from '../webjoin.js';

export { makePair, makeCtx } from './core.js';

// The single list of games, in hub order. Each loads from g-<id>.js; one that is missing or fails to load is skipped.
const GAME_IDS = [
  'connect4', 'chess', 'draughts', 'reversi', 'ships', 'dots', 'mancala', 'morris', 'gomoku',
  'hockey', 'tanks', 'paddle', 'cycles', 'tug', 'quickdraw', 'sumo', 'penalty',
  'ttt', 'memory', 'wordduel',
];
const GROUPS = [['board', 'Board games'], ['action', 'Action'], ['party', 'Party']];
export const DUO_GAMES = [];
let loading = null;
function loadGames() {
  if (!loading) {
    loading = Promise.allSettled(GAME_IDS.map((id) => import(`./g-${id}.js`))).then((rs) => {
      DUO_GAMES.length = 0;
      rs.forEach((r, k) => {
        if (r.status === 'fulfilled' && r.value.default && r.value.default.create) {
          const g = r.value.default;
          if (!g.cat) g.cat = g.realtime ? 'action' : 'party';
          DUO_GAMES.push(g);
        } else console.warn('Play Together: could not load', GAME_IDS[k], r.reason);
      });
      return DUO_GAMES;
    });
  }
  return loading;
}
const gameById = (id) => DUO_GAMES.find((g) => g.id === id);

const DB = () => store.duo || (store.duo = { name: '', wins: {}, played: {}, seen: {}, via: 'wifi' });
const myName = () => (DB().name || '').trim() || 'Player';

export const duoHelp = () => sheet(`<h2>How to play together</h2><div class="help-body">
  <p><b>On one phone.</b> Pick a game and choose On this phone. You take turns, or share the screen in the action games.</p>
  <p><b>On two phones.</b> Both of you open Play Together. One taps Host and the other taps Join, using the same connection type.</p>
  <p><b>Wifi or hotspot</b> works when both phones are on the same wifi. No wifi? Turn on the hotspot on one phone and connect the other phone to it. No internet is needed.</p>
  <p><b>Bluetooth</b> works anywhere. The host's phone asks to be visible for two minutes, and the joining phone lists nearby phones. Allow Nearby devices when Android asks.</p>
  <p>Once connected you stay connected: the host picks a game, and after each game you can have a rematch or pick another.</p>
  </div><button class="btn duo-btn" data-x>Got it</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });

// Two pieces facing off over a link line.
export const duoCardArt = () => `<svg class="art-duo" viewBox="0 0 120 80" aria-hidden="true">
  <rect x="8" y="16" width="34" height="56" rx="7" class="ph a"/><rect x="78" y="16" width="34" height="56" rx="7" class="ph b"/>
  <rect x="13" y="23" width="24" height="38" rx="3" class="scr"/><rect x="83" y="23" width="24" height="38" rx="3" class="scr"/>
  <circle cx="25" cy="42" r="7" class="pc a"/><circle cx="95" cy="42" r="7" class="pc b"/>
  <path d="M46 30q14-14 28 0M50 36q10-9 20 0" class="wave"/><circle cx="60" cy="40" r="2.6" class="dotc"/></svg>`;

// ---------- Connection session (survives screen changes while connected) ----------
const session = { connected: false, role: null, via: 'wifi', peer: '', names: ['', ''], score: [0, 0], played: 0, lastId: null, first: 0, off: null };
const localScore = { key: '', score: [0, 0] };
let appRef = null;

function sendRaw(m) { lan.send(m); }
function resetSession() {
  if (session.off) session.off();
  Object.assign(session, { connected: false, role: null, peer: '', names: ['', ''], score: [0, 0], played: 0, lastId: null, first: 0, off: null });
}
function disconnect() { if (session.connected) sendRaw({ k: 'bye' }); lan.close(); resetSession(); }

// Listens for session-level messages for as long as we are connected.
function watchSession() {
  if (session.off) session.off();
  session.off = lan.on((e) => {
    if (e.type === 'closed' || (e.type === 'msg' && e.data && e.data.k === 'bye')) {
      if (!session.connected) return;
      resetSession(); lan.close();
      toast('Your friend has left', 3000);
      if (appRef) appRef.backTo('duo');
    } else if (e.type === 'msg' && e.data && e.data.k === 'start' && session.role === 'guest') {
      const m = e.data;
      session.first = m.first; session.lastId = m.id;
      const top = $$('#screens > section').pop();
      const inGame = top && top.classList.contains('duo-game');
      if (appRef) (inGame ? appRef.replace : appRef.go)('duogame', { id: m.id, net: true, first: m.first, seed: m.seed });
    }
  });
}

// Host only: start (or restart) a game on both phones.
function hostStart(app, id, first = session.lastId === id ? 1 - session.first : 0, replace = false) {
  const seed = (Math.random() * 2 ** 31) >>> 0;
  session.first = first; session.lastId = id;
  sendRaw({ k: 'start', id, first, seed });
  (replace ? app.replace : app.go)('duogame', { id, net: true, first, seed });
}

// ---------- Hub ----------
export function duoHubScreen(app) {
  appRef = app;
  const root = el(`<section class="screen duo-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Play Together</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  async function render() {
    if (!DUO_GAMES.length) body.innerHTML = '<div class="duo-loading"><div class="spinner"></div></div>';
    await loadGames();
    const conn = session.connected;
    body.innerHTML = `<div class="duo-hero">${duoCardArt()}</div>
      <button class="btn duo-btn duo-connect" data-act="connect">${conn ? `Connected to ${esc(session.peer || 'your friend')}<small>Tap to choose a game together</small>` : 'Connect to a friend\'s phone<small>Wifi, hotspot or Bluetooth. Connect once, play them all</small>'}</button>
      ${GROUPS.map(([cat, title]) => {
        const gs = DUO_GAMES.filter((g) => g.cat === cat);
        if (!gs.length) return '';
        return `<div class="section-title">${title}</div><div class="duo-grid">${gs.map((g) => `<button class="duo-card" data-id="${g.id}">
          <div class="duo-art">${g.art()}</div><div class="duo-name">${esc(g.name)}</div><div class="duo-tag">${esc(g.tag)}</div>
          ${DB().played[g.id] ? `<div class="duo-played">Played ${DB().played[g.id]}</div>` : '<span class="new-badge">New</span>'}</button>`).join('')}</div>`;
      }).join('')}`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return duoHelp();
    if (a === 'connect') return app.go('duolobby', {});
    const c = e.target.closest('[data-id]');
    if (!c) return;
    sfx.tap();
    const g = gameById(c.dataset.id);
    if (session.connected) {
      if (session.role === 'host') hostStart(app, g.id, 0);
      else toast(`${session.names[0] || 'The host'} picks the game`);
      return;
    }
    sheet(`<h2>${esc(g.name)}</h2><p class="duo-sheet-tag">${esc(g.tag)}</p>
      <button class="sheet-item" data-m="local"><b>On this phone</b><small>${g.realtime ? 'Share the screen, one side each' : 'Take turns passing the phone'}</small></button>
      <button class="sheet-item" data-m="net"><b>Two phones</b><small>Connect over wifi, a hotspot or Bluetooth</small></button>
      <button class="sheet-item" data-m="help"><b>How to play</b></button>`, {
      onMount(node, close) {
        node.addEventListener('click', (ev) => {
          const m = ev.target.closest('[data-m]')?.dataset.m;
          if (!m) return;
          close();
          if (m === 'local') app.go('duogame', { id: g.id, local: true });
          else if (m === 'net') app.go('duolobby', { id: g.id });
          else gameHelp(g);
        });
      },
    });
  });
  render();
  return { root, refresh: render };
}

function gameHelp(g) {
  sheet(`<h2>How to play ${esc(g.name)}</h2><div class="help-body">${(g.help || []).map((p) => `<p>${p}</p>`).join('')}</div><button class="btn duo-btn" data-x>Got it</button>`,
    { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// ---------- Lobby: connect, then the shared game picker ----------
export function duoLobbyScreen(app, { id = null } = {}) {
  appRef = app;
  let state = session.connected ? 'connected' : 'start', via = DB().via || 'wifi', found = new Map(), hostInfo = null, err = '';
  // web: this page is a friend's browser opened from the host phone; webAsked/webInfo: the host is also serving a browser friend
  const web = lan.mode === 'web';
  let webAsked = false, webInfo = null;
  if (web) via = 'wifi';
  const root = el(`<section class="screen duo-theme duo-lobby">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Two phones</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  const viaSeg = () => `<div class="seg duo-via">${[['wifi', 'Wifi or hotspot'], ['bt', 'Bluetooth']].map(([v, l]) => `<button data-via="${v}" class="${via === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

  async function render() {
    await loadGames();
    const want = id && gameById(id);
    if (state === 'start' && web) {
      body.innerHTML = `<div class="duo-hero">${duoCardArt()}</div>
        <p class="duo-for">Join the game on <b>${esc(lan.ip())}</b></p>
        <label class="duo-label">Your name</label>
        <input class="duo-input" data-el="name" maxlength="14" placeholder="Player" value="${esc(DB().name || '')}">
        <button class="btn duo-btn" data-act="join">Join the game<small>Your friend picks what to play</small></button>
        <p class="duo-note">Keep this page open while you play. If your phone locks, unlock it and the game carries on.</p>
        ${err ? `<p class="duo-warn">${esc(err)}</p>` : ''}`;
    } else if (state === 'start') {
      body.innerHTML = `<div class="duo-hero">${duoCardArt()}</div>
        ${want ? `<p class="duo-for">Connecting to play <b>${esc(want.name)}</b></p>` : ''}
        <label class="duo-label">Your name</label>
        <input class="duo-input" data-el="name" maxlength="14" placeholder="Player" value="${esc(DB().name || '')}">
        <label class="duo-label">Connect using</label>${viaSeg()}
        ${via === 'bt' && !lan.btAvailable ? '<p class="duo-warn">Bluetooth needs the latest version of the app.</p>' : ''}
        <button class="btn duo-btn" data-act="host">Host a game<small>Your friend joins you</small></button>
        <button class="btn secondary" data-act="join">Join a game<small>Find a friend who is hosting</small></button>
        <p class="duo-note">${via === 'wifi' ? 'Both phones need to be on the same wifi. No wifi? Turn on the hotspot on one phone and connect the other phone to it.' : 'Both phones need Bluetooth on. Android may ask to allow Nearby devices and to make this phone visible.'}</p>
        ${err ? `<p class="duo-warn">${esc(err)}</p>` : ''}`;
    } else if (state === 'hosting') {
      body.innerHTML = `<div class="duo-wait"><div class="spinner"></div><h2>Waiting for a friend</h2>
        <p>Ask your friend to open Play Together on their phone, choose ${via === 'bt' ? 'Bluetooth' : 'Wifi or hotspot'}, and tap Join.</p>
        <p class="duo-me">You appear as <b>${esc(via === 'bt' && hostInfo?.device ? hostInfo.device : myName())}</b></p>
        ${via === 'wifi' && hostInfo?.ip ? `<p class="duo-ip">Or join by address: <b>${esc(hostInfo.ip)}</b></p>` : ''}
        ${via === 'wifi' && lan.webHostAvailable ? (webAsked ? webJoinPanel(webInfo, 'duo') : '<button class="btn secondary duo-webbtn" data-act="web">Friend on a browser<small>iPhone or computer, no app needed</small></button>') : ''}
        <button class="btn ghost" data-act="cancel">Cancel</button></div>`;
    } else if (state === 'joining') {
      body.innerHTML = `<div class="duo-join"><h2>${via === 'bt' ? 'Nearby phones' : 'Games nearby'}</h2>
        <div class="duo-found">${found.size ? [...found].map(([fid, f]) => `<button class="sheet-item" data-join="${esc(fid)}"><b>${esc(f.name)}</b>${f.paired ? '<small>Paired</small>' : ''}</button>`).join('') : `<div class="duo-searching"><div class="spinner"></div><p>Looking${via === 'bt' ? ' for phones. Your friend should tap Host first' : ' for games on this network'}</p></div>`}</div>
        ${via === 'wifi' ? `<p class="duo-note">Not showing? Type the address shown on your friend's phone.</p><div class="duo-ipjoin"><input class="duo-input" data-el="ip" inputmode="decimal" placeholder="192.168.0.10" autocomplete="off"><button class="btn duo-btn" data-act="joinip">Join</button></div>` : ''}
        <button class="btn ghost" data-act="cancel">Cancel</button></div>`;
    } else if (state === 'connecting') {
      body.innerHTML = '<div class="duo-wait"><div class="spinner"></div><h2>Connecting</h2><button class="btn ghost" data-act="cancel">Cancel</button></div>';
    } else if (state === 'connected') {
      const host = session.role === 'host';
      body.innerHTML = `<div class="duo-pair"><div class="duo-vs"><span class="a">${esc(session.names[0] || 'Host')}</span><b>${session.score[0]} : ${session.score[1]}</b><span class="b">${esc(session.names[1] || 'Guest')}</span></div>
        <p class="duo-note">${host ? 'Pick a game to play together.' : `Connected. ${esc(session.names[0] || 'The host')} picks the game.`}</p></div>
        ${host ? GROUPS.map(([cat, title]) => {
          const gs = DUO_GAMES.filter((g) => g.cat === cat);
          return gs.length ? `<div class="section-title">${title}</div><div class="duo-grid">${gs.map((g) => `<button class="duo-card" data-pick="${g.id}"><div class="duo-art">${g.art()}</div><div class="duo-name">${esc(g.name)}</div><div class="duo-tag">${esc(g.tag)}</div></button>`).join('')}</div>` : '';
        }).join('') : '<div class="duo-wait"><div class="spinner"></div></div>'}
        <button class="btn ghost duo-leave" data-act="leave">Disconnect</button>`;
    }
  }

  const off = lan.on((e) => {
    if (e.type === 'hosting' && state === 'hosting') { hostInfo = e; render(); }
    else if (e.type === 'webhost' && state === 'hosting') { webInfo = e; render(); }
    else if (e.type === 'found' && state === 'joining') { found.set(e.id, e); render(); }
    else if (e.type === 'lost' && state === 'joining') { found.delete(e.id); render(); }
    else if (e.type === 'error') { err = e.msg || 'Something went wrong'; if (state !== 'connected') { state = 'start'; lan.close(); } render(); toast(err, 3500); }
    else if (e.type === 'connected') {
      Object.assign(session, { connected: true, role: e.role, via, peer: '', score: [0, 0], played: 0, lastId: null });
      session.names = e.role === 'host' ? [myName(), ''] : ['', myName()];
      watchSession();
      sendRaw({ k: 'hello', name: myName() });
      state = 'connected'; sfx.hint(); buzz(30); render();
    } else if (e.type === 'msg' && e.data?.k === 'hello') {
      session.peer = e.data.name || 'Friend';
      session.names[session.role === 'host' ? 1 : 0] = session.peer;
      render();
      // the host came here for a particular game: start it as soon as the friend has said hello
      if (session.role === 'host' && id && gameById(id) && !session.lastId) hostStart(app, id, 0);
    }
  });

  root.addEventListener('input', (e) => { if (e.target.dataset.el === 'name') { DB().name = e.target.value.trim().slice(0, 14); save(); } });
  root.addEventListener('click', (e) => {
    const vb = e.target.closest('[data-via]');
    if (vb) { via = vb.dataset.via; DB().via = via; save(); err = ''; render(); return; }
    const j = e.target.closest('[data-join]');
    if (j) { state = 'connecting'; render(); lan.join(j.dataset.join); return; }
    const pk = e.target.closest('[data-pick]');
    if (pk && session.role === 'host') { sfx.tap(); hostStart(app, pk.dataset.pick, session.lastId === pk.dataset.pick ? 1 - session.first : 0); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') duoHelp();
    else if (a === 'host') { err = ''; state = 'hosting'; hostInfo = null; webAsked = false; webInfo = null; render(); lan.host({ via, name: myName() }); }
    else if (a === 'join' && web) { err = ''; state = 'connecting'; render(); lan.join('web'); }
    else if (a === 'join') { err = ''; state = 'joining'; found = new Map(); render(); lan.discover({ via }); }
    else if (a === 'web') { webAsked = true; webInfo = null; render(); lan.webStart(); }
    else if (a === 'joinip') { const ip = $('[data-el="ip"]', root).value.trim(); if (!ip) return; state = 'connecting'; render(); lan.joinIp(ip, 0); }
    else if (a === 'cancel') { lan.close(); state = 'start'; render(); }
    else if (a === 'leave') { disconnect(); state = 'start'; render(); }
  });
  render();
  return {
    root,
    onShow() { state = session.connected ? 'connected' : state === 'connected' ? 'start' : state; render(); },
    destroy() {
      off();
      // leaving the lobby without a connection stops hosting or searching
      if (!session.connected) lan.close();
    },
  };
}

// ---------- Game screen ----------
export function duoGameScreen(app, { id, local = false, net = false, first = 0, seed = 1 }) {
  appRef = app;
  const root = el(`<section class="screen duo-theme duo-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="duo-stage"></div></section>`);
  const stage = $('.duo-stage', root);
  let inst = null, ctx = null, alive = true, result = null, offMsg = null, offSession = null;
  const isNet = net && session.connected;
  const names = isNet ? [session.names[0] || 'Host', session.names[1] || 'Guest'] : ['Player 1', 'Player 2'];
  const me = isNet ? (session.role === 'host' ? 0 : 1) : null;
  const score = isNet ? session.score : (localScore.key === id ? localScore.score : (localScore.key = id, localScore.score = [0, 0]));

  function begin(g, f, sd) {
    stage.innerHTML = '';
    $('.duo-result', root)?.remove();
    result = null;
    const link = isNet ? {
      send: (d) => sendRaw({ k: 'g', d }),
      listen: (fn) => lan.on('msg', (m) => { if (m && m.k === 'g') fn(m.d); }),
    } : null;
    ctx = makeCtx({ root: stage, me, local: !isNet, isHost: !isNet || session.role === 'host', first: f, names, seed: sd, link, onEnd: finish, sfx, buzz, toast });
    try { inst = g.create(ctx); } catch (err) { console.error(err); stage.innerHTML = '<p class="duo-note">This game could not start.</p>'; }
    DB().played[g.id] = (DB().played[g.id] || 0) + 1; save();
  }

  function finish(res) {
    if (!alive) return;
    result = res;
    const g = gameById(id);
    if (res.winner === 0 || res.winner === 1) score[res.winner]++;
    const won = isNet && res.winner === me;
    if (won) DB().wins[id] = (DB().wins[id] || 0) + 1;
    save();
    if (res.winner === null) sfx.unit(); else if (!isNet || won) { sfx.win(); confetti(); } else sfx.error();
    const head = res.winner === null ? 'It\'s a draw' : isNet ? (won ? 'You win' : `${esc(names[res.winner])} wins`) : `${esc(names[res.winner])} wins`;
    const host = !isNet || session.role === 'host';
    const box = el(`<div class="duo-result"><div class="duo-result-box">
      <h2>${head}</h2>${res.text ? `<p>${esc(res.text)}</p>` : ''}
      <div class="duo-vs small"><span class="a">${esc(names[0])}</span><b>${score[0]} : ${score[1]}</b><span class="b">${esc(names[1])}</span></div>
      ${host ? `<button class="btn duo-btn" data-act="again">${isNet ? 'Rematch' : 'Play again'}<small>${esc(names[1 - ctx.first])} goes first</small></button>
        <button class="btn secondary" data-act="pick">${isNet ? 'Choose another game' : 'Back to the games'}</button>`
        : `<p class="duo-note">Waiting for ${esc(names[0])} to choose a rematch or another game</p><button class="btn secondary" data-act="pick">Back to the game list</button>`}
      </div></div>`);
    root.appendChild(box);
    void g;
  }

  function stop() { if (ctx) ctx._kill(); if (inst && inst.destroy) { try { inst.destroy(); } catch (err) { console.error(err); } } inst = null; ctx = null; }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') { const g = gameById(id); if (g) gameHelp(g); }
    else if (a === 'again') {
      const nf = 1 - (ctx ? ctx.first : first);
      if (isNet) { stop(); hostStart(app, id, nf, true); }
      else { stop(); begin(gameById(id), nf, (Math.random() * 2 ** 31) >>> 0); }
    } else if (a === 'pick') app.back();
  });

  if (isNet) {
    // the other phone left this game (but is still connected): back to the picker
    offSession = lan.on('msg', (m) => {
      if (m && m.k === 'quit' && alive) { toast(`${names[1 - me]} left the game`, 2600); app.back(); }
    });
  }

  loadGames().then(() => {
    if (!alive) return;
    const g = gameById(id);
    if (!g) { stage.innerHTML = '<p class="duo-note">This game is not available.</p>'; return; }
    $('.title', root).textContent = g.name;
    begin(g, first, seed);
    if (!DB().seen?.[g.id] && !isNet) { DB().seen = { ...(DB().seen || {}), [g.id]: 1 }; save(); setTimeout(() => alive && gameHelp(g), 300); }
  });

  return {
    root,
    destroy() {
      alive = false;
      // leaving a game that is still going on: tell the other phone
      if (isNet && session.connected && !result) sendRaw({ k: 'quit' });
      if (offMsg) offMsg();
      if (offSession) offSession();
      stop();
    },
  };
}
