// Two-phone link for local multiplayer, over wifi (same network or a phone hotspot, no internet) or Bluetooth.
// In the app it uses the Android shell (LanLink.java and BtLink.java). In a desktop browser it falls back to
// BroadcastChannel, so two tabs of the same page can play each other (both "wifi" and "bt" use it there).
// Events: {type: 'hosting', ip, port, via} | {type: 'found', id, name, via} | {type: 'lost', id} | {type: 'connected', role, peer, via}
//         | {type: 'msg', data} | {type: 'closed'} | {type: 'error', msg, code}
// Listen with lan.on(fn) for every event, or lan.on('msg', fn) for one type. Both return an unsubscribe function.
import { lanBridge } from './native.js';

const listeners = new Set();
// a copy, so a screen that opens because of this event does not receive the same event again
const emit = (e) => [...listeners].forEach((fn) => { try { fn(e); } catch (err) { console.error(err); } });

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

const link = lanBridge ? nativeLink(lanBridge) : typeof BroadcastChannel !== 'undefined' ? tabLink() : null;

// host and discover take either a name / nothing (wifi, as Snip Buddies uses them) or an options object {via, name}.
const opt = (a) => (a && typeof a === 'object' ? a : { name: a });
export const lan = {
  available: !!link,
  mode: link ? link.mode : 'none',
  btAvailable: !!(link && link.bt),
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
