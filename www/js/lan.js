// Two-phone link for local multiplayer. In the app it uses the Android shell (wifi or hotspot, no internet).
// In a desktop browser it falls back to BroadcastChannel, so two tabs of the same page can play each other.
// Events: {type: 'hosting', ip, port} | {type: 'found', id, name} | {type: 'lost', id} | {type: 'connected', role, peer}
//         | {type: 'msg', data} | {type: 'closed'} | {type: 'error', msg}
import { lanBridge } from './native.js';

const listeners = new Set();
// a copy, so a screen that opens because of this event does not receive the same event again
const emit = (e) => [...listeners].forEach((fn) => { try { fn(e); } catch (err) { console.error(err); } });

function nativeLink(B) {
  window.__lan = (e) => {
    if (e.type === 'msg') { try { e = { type: 'msg', data: JSON.parse(e.data) }; } catch { return; } }
    emit(e);
  };
  return {
    mode: 'wifi',
    host: (name) => B.host(name || ''), discover: () => B.discover(), stopDiscover: () => B.stopDiscover(),
    join: (id) => B.join(id), joinIp: (ip, port) => B.joinIp(String(ip).trim(), port | 0),
    send: (obj) => B.send(JSON.stringify(obj)), close: () => B.close(), ip: () => B.ip(),
  };
}

// Browser fallback: every tab gets an id; the host advertises once a second until someone joins.
function tabLink() {
  const me = Math.random().toString(36).slice(2, 8);
  let ch = null, role = null, peer = null, advTimer = null, name = '', seen = new Map(), lostTimer = null;
  const post = (m) => ch && ch.postMessage({ ...m, from: me });
  const open = () => {
    if (ch) return;
    ch = new BroadcastChannel('gamehub-lan');
    ch.onmessage = ({ data: m }) => {
      if (!m || m.from === me) return;
      if (m.k === 'adv' && !peer && role === 'seek') {
        if (!seen.has(m.from)) emit({ type: 'found', id: m.from, name: m.name });
        seen.set(m.from, Date.now());
      } else if (m.k === 'join' && m.to === me && role === 'host' && !peer) {
        peer = m.from; clearInterval(advTimer);
        post({ k: 'ok', to: peer }); emit({ type: 'connected', role: 'host', peer: 'another tab' });
      } else if (m.k === 'ok' && m.to === me && role === 'seek') {
        peer = m.from; role = 'guest'; clearInterval(lostTimer);
        emit({ type: 'connected', role: 'guest', peer: 'another tab' });
      } else if (m.k === 'm' && m.to === me && m.from === peer) emit({ type: 'msg', data: m.data });
      else if (m.k === 'bye' && m.to === me && m.from === peer) { peer = null; role = null; emit({ type: 'closed' }); }
    };
  };
  return {
    mode: 'tabs',
    host(n) {
      this.close(); open(); role = 'host'; name = n || 'player';
      advTimer = setInterval(() => post({ k: 'adv', name }), 1000); post({ k: 'adv', name });
      setTimeout(() => emit({ type: 'hosting', ip: 'this browser', port: 0 }), 0);
    },
    discover() {
      open(); role = 'seek'; seen = new Map();
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

export const lan = {
  available: !!link,
  mode: link ? link.mode : 'none',
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  host: (name) => link && link.host(name),
  discover: () => link && link.discover(),
  stopDiscover: () => link && link.stopDiscover(),
  join: (id) => link && link.join(id),
  joinIp: (ip, port) => link && link.joinIp(ip, port),
  send: (obj) => link && link.send(obj),
  close: () => link && link.close(),
  ip: () => (link ? link.ip() : ''),
};
