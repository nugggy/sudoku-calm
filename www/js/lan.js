// Two-phone link for local multiplayer, over wifi (same network or a phone hotspot, no internet) or Bluetooth.
// In the app it uses the Android shell (LanLink.java and BtLink.java). A friend without the app (an iPhone, say) can
// join from a browser: the host phone serves the game (WebHost.java) and the browser opens http://ip:port/?join=duo,
// which uses the WebSocket link below. In a desktop browser it otherwise falls back to BroadcastChannel, so two tabs
// of the same page can play each other (both "wifi" and "bt" use it there).
// Events: {type: 'hosting', ip, port, via} | {type: 'found', id, name, via} | {type: 'lost', id} | {type: 'connected', role, peer, via}
//         | {type: 'msg', data} | {type: 'closed'} | {type: 'error', msg, code}
//         | {type: 'webhost', ip, port} (serving the game to a browser) | {type: 'reconnecting'} | {type: 'resumed'}
// Listen with lan.on(fn) for every event, or lan.on('msg', fn) for one type. Both return an unsubscribe function.
import { lanBridge } from './native.js';

const listeners = new Set();
// a copy, so a screen that opens because of this event does not receive the same event again
const emit = (e) => { banner(e); [...listeners].forEach((fn) => { try { fn(e); } catch (err) { console.error(err); } }); };

// A strip across the top while a dropped connection is being restored, on whichever screen is showing.
let bannerEl = null;
function banner(e) {
  if (!['reconnecting', 'resumed', 'closed', 'connected'].includes(e.type) || typeof document === 'undefined') return;
  if (e.type !== 'reconnecting') { if (bannerEl) { bannerEl.remove(); bannerEl = null; } return; }
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'lan-banner';
    bannerEl.setAttribute('role', 'status');
    bannerEl.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 8px);transform:translateX(-50%);z-index:95;'
      + 'background:rgba(30,30,44,.92);color:#fff;font:600 14px/1.3 system-ui,sans-serif;padding:9px 16px;border-radius:18px;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.3);max-width:88vw;text-align:center;pointer-events:none';
    document.body.appendChild(bannerEl);
  }
  bannerEl.textContent = e.who === 'me' ? 'Reconnecting to the game' : 'Your friend\'s connection dropped. Waiting for them to come back';
}

function nativeLink(B) {
  let via = 'wifi';
  window.__lan = (e) => {
    if (e.type === 'msg') { try { e = { type: 'msg', data: JSON.parse(e.data), via: e.via || 'wifi' }; } catch { return; } }
    else if (!e.via) e.via = 'wifi';
    emit(e);
  };
  const bt = B.bt && B.bt.available() ? B.bt : null;
  const pick = (v) => (v === 'bt' && bt ? bt : B);
  return {
    mode: 'app', bt: !!bt,
    host(name, v = 'wifi') { this.close(); via = v; pick(v).host(name || ''); },
    discover(v = 'wifi') { via = v; pick(v).discover(); },
    stopDiscover() { B.stopDiscover(); if (bt) bt.stopDiscover(); },
    join(id) { pick(via).join(id); },
    joinIp(ip, port) { via = 'wifi'; B.joinIp(String(ip).trim(), port | 0); },
    send(obj) { pick(via).send(JSON.stringify(obj)); },
    close() { B.close(); if (bt) bt.close(); },
    ip: () => B.ip(),
    webStart: B.webStart ? () => B.webStart() : null,
  };
}

// ---------- A friend's browser, opened from the host phone's address ----------
// Same protocol as WebLink.java: "m|seq|json" messages, "a|n" acknowledgements (and a heartbeat once a second),
// "h|n" from the host when we (re)connect, "x|" when we leave on purpose. Messages are kept until acknowledged,
// so a dropped connection (phone locked, tab asleep, wifi blip) picks up where it left off.
function wsLink() {
  const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  let ws = null, sendSeq = 0, recvSeq = 0, unacked = [], everConnected = false, wanted = false, lastHeard = 0, downSince = 0, beat = null, retry = null;
  const GIVE_UP_MS = 30000, SILENT_MS = 6000;
  const url = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?t=${token}&r=${recvSeq}`;
  const raw = (t) => { try { if (ws && ws.readyState === 1) ws.send(t); } catch { /* reconnect will resend */ } };
  function open() {
    clearTimeout(retry);
    let sock;
    try { sock = new WebSocket(url()); } catch { lost(); return; }
    ws = sock;
    sock.onmessage = (ev) => {
      if (sock !== ws) return;
      lastHeard = Date.now();
      const t = String(ev.data);
      if (t.startsWith('m|')) {
        const bar = t.indexOf('|', 2), seq = +t.slice(2, bar);
        if (!(seq > recvSeq)) return;
        recvSeq = seq;
        let data; try { data = JSON.parse(t.slice(bar + 1)); } catch { return; }
        emit({ type: 'msg', data, via: 'wifi' });
      } else if (t.startsWith('a|')) prune(+t.slice(2));
      else if (t.startsWith('h|')) {
        prune(+t.slice(2));
        unacked.forEach(([seq, d]) => raw(`m|${seq}|${d}`)); // send again whatever the host missed
        const was = downSince; downSince = 0;
        if (!everConnected) { everConnected = true; emit({ type: 'connected', role: 'guest', peer: location.hostname, via: 'wifi', web: true }); }
        else if (was) emit({ type: 'resumed', who: 'me' });
      }
    };
    sock.onclose = (ev) => {
      if (sock !== ws) return;
      ws = null;
      if (ev.code === 4009) { wanted = false; stopBeat(); emit({ type: 'error', msg: 'Someone is already playing with that phone' }); return; }
      lost();
    };
    sock.onerror = () => { /* onclose follows */ };
  }
  function lost() {
    if (!wanted) return;
    if (!everConnected) { wanted = false; stopBeat(); emit({ type: 'error', msg: 'Could not reach the host phone. Check you are on the same wifi.' }); return; }
    if (!downSince) { downSince = Date.now(); emit({ type: 'reconnecting', who: 'me' }); }
    if (Date.now() - downSince > GIVE_UP_MS) { wanted = false; stopBeat(); emit({ type: 'closed', via: 'wifi' }); return; }
    clearTimeout(retry);
    retry = setTimeout(open, 1500);
  }
  const prune = (n) => { unacked = unacked.filter(([seq]) => seq > n); };
  function stopBeat() { clearInterval(beat); beat = null; clearTimeout(retry); }
  function startBeat() {
    stopBeat();
    beat = setInterval(() => {
      if (!wanted) return;
      if (ws && ws.readyState === 1) {
        raw(`a|${recvSeq}`);
        // nothing from the host for a while: assume the connection is dead and dial again
        if (Date.now() - lastHeard > SILENT_MS) { const old = ws; ws = null; try { old.close(); } catch { /* ignore */ } lost(); }
      }
    }, 1000);
  }
  // an iPhone that wakes up after being locked usually has a dead socket: check straight away
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !wanted || !everConnected) return;
      if (!ws || ws.readyState !== 1 || Date.now() - lastHeard > 2500) { const old = ws; ws = null; try { if (old) old.close(); } catch { /* ignore */ } lost(); }
    });
  }
  return {
    mode: 'web', bt: false,
    host() { emit({ type: 'error', msg: 'Hosting needs the app. Join your friend\'s game instead.' }); },
    discover() { setTimeout(() => emit({ type: 'found', id: 'web', name: location.hostname, via: 'wifi' }), 0); },
    stopDiscover() {},
    join() { if (wanted) return; wanted = true; lastHeard = Date.now(); open(); startBeat(); },
    joinIp() { this.join(); },
    send(obj) {
      const d = JSON.stringify(obj), seq = ++sendSeq;
      unacked.push([seq, d]);
      if (unacked.length > 6000) unacked.shift();
      raw(`m|${seq}|${d}`);
    },
    close() {
      if (wanted) raw('x|');
      wanted = false; stopBeat();
      const old = ws; ws = null;
      setTimeout(() => { try { if (old) old.close(); } catch { /* ignore */ } }, 50);
      // a fresh session next time
      sendSeq = 0; recvSeq = 0; unacked = []; everConnected = false; downSince = 0;
    },
    ip: () => location.hostname,
  };
}

// Browser fallback: every tab gets an id; the host advertises once a second until someone joins.
function tabLink() {
  const me = Math.random().toString(36).slice(2, 8);
  let ch = null, role = null, peer = null, advTimer = null, name = '', seen = new Map(), lostTimer = null, via = 'wifi';
  const post = (m) => ch && ch.postMessage({ ...m, from: me });
  const open = () => {
    if (ch) return;
    ch = new BroadcastChannel('gamehub-lan');
    ch.onmessage = ({ data: m }) => {
      if (!m || m.from === me) return;
      if (m.k === 'adv' && !peer && role === 'seek' && (m.via || 'wifi') === via) {
        if (!seen.has(m.from)) emit({ type: 'found', id: m.from, name: m.name, via });
        seen.set(m.from, Date.now());
      } else if (m.k === 'join' && m.to === me && role === 'host' && !peer) {
        peer = m.from; clearInterval(advTimer);
        post({ k: 'ok', to: peer }); emit({ type: 'connected', role: 'host', peer: 'another tab', via });
      } else if (m.k === 'ok' && m.to === me && role === 'seek') {
        peer = m.from; role = 'guest'; clearInterval(lostTimer);
        emit({ type: 'connected', role: 'guest', peer: 'another tab', via });
      } else if (m.k === 'm' && m.to === me && m.from === peer) emit({ type: 'msg', data: m.data, via });
      else if (m.k === 'bye' && m.to === me && m.from === peer) { peer = null; role = null; emit({ type: 'closed', via }); }
    };
  };
  return {
    mode: 'tabs', bt: true,
    host(n, v = 'wifi') {
      this.close(); open(); role = 'host'; name = n || 'player'; via = v;
      advTimer = setInterval(() => post({ k: 'adv', name, via }), 1000); post({ k: 'adv', name, via });
      setTimeout(() => emit({ type: 'hosting', ip: 'this browser', port: 0, via }), 0);
    },
    discover(v = 'wifi') {
      open(); role = 'seek'; seen = new Map(); via = v;
      clearInterval(lostTimer);
      lostTimer = setInterval(() => { for (const [id, t] of seen) if (Date.now() - t > 3500) { seen.delete(id); emit({ type: 'lost', id }); } }, 1000);
    },
    stopDiscover() { clearInterval(lostTimer); },
    join(id) { post({ k: 'join', to: id }); },
    joinIp() { emit({ type: 'error', msg: 'Joining by address only works in the app' }); },
    send(obj) { if (peer) post({ k: 'm', to: peer, data: obj }); },
    close() {
      clearInterval(advTimer); clearInterval(lostTimer);
      if (peer) post({ k: 'bye', to: peer });
      peer = null; role = null;
    },
    ip: () => 'this browser',
  };
}

// Opened from a host phone's address (http://ip:port/?join=duo or ?join=snip): play as that phone's guest.
const joinKind = (() => { try { const q = new URLSearchParams(location.search); return q.has('join') ? (q.get('join') || 'duo') : ''; } catch { return ''; } })();
const link = lanBridge ? nativeLink(lanBridge) : joinKind && typeof WebSocket !== 'undefined' ? wsLink() : typeof BroadcastChannel !== 'undefined' ? tabLink() : null;

// host and discover take either a name / nothing (wifi, as Snip Buddies uses them) or an options object {via, name}.
const opt = (a) => (a && typeof a === 'object' ? a : { name: a });
export const lan = {
  available: !!link,
  mode: link ? link.mode : 'none',
  btAvailable: !!(link && link.bt),
  // this page is a browser guest of a host phone: 'duo' (Play Together) or 'snip' (Snip Buddies), else ''
  webGuest: link && link.mode === 'web' ? joinKind : '',
  // the host can also serve the game to a friend's browser (app shells from this version on)
  webHostAvailable: !!(link && link.webStart),
  webStart: () => link && link.webStart && link.webStart(),
  on(type, fn) {
    const f = typeof type === 'function' ? type : (e) => { if (e.type === type) fn(type === 'msg' ? e.data : e); };
    listeners.add(f); return () => listeners.delete(f);
  },
  host: (a) => { const o = opt(a); return link && link.host(o.name, o.via || 'wifi'); },
  discover: (a) => { const o = opt(a); return link && link.discover(o.via || 'wifi'); },
  stopDiscover: () => link && link.stopDiscover(),
  join: (id) => link && link.join(id),
  joinIp: (ip, port) => link && link.joinIp(ip, port),
  send: (obj) => link && link.send(obj),
  close: () => link && link.close(),
  ip: () => (link ? link.ip() : ''),
};
