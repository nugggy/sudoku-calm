// Stand-in for the Android bridge (window.SCNative) on a desktop host page, for tools/webhost-test/e2e.mjs.
// The lan* calls go to DesktopHost over /hostctl instead of LanLink; events come back through window.__lan.
(() => {
  const ws = new WebSocket(`ws://${location.host}/hostctl`);
  const queue = [];
  const cmd = (s) => (ws.readyState === 1 ? ws.send(s) : queue.push(s));
  ws.onopen = () => { while (queue.length) ws.send(queue.shift()); };
  ws.onmessage = (e) => { const ev = JSON.parse(e.data); if (window.__lan) window.__lan(ev); };
  window.SCNative = {
    getVersionName: () => '9.9.9', getVersionCode: () => 999, setSystemBars() {}, vibrate() {}, openUrl() {}, downloadAndInstall() {}, exitApp() {},
    lanHost: (name) => cmd('host|' + name), lanDiscover() {}, lanStopDiscover() {}, lanJoin() {}, lanJoinIp() {},
    lanSend: (s) => cmd('send|' + s), lanClose: () => cmd('close|'), lanIp: () => '127.0.0.1', lanWebStart: () => cmd('webstart|'),
  };
})();
