// "Friend on a browser": the host phone serves the game (WebHost.java) so a friend without the app, on an iPhone or a
// computer, can play from their browser. This builds the address and a QR code for it.
import qrcode from './vendor/qrcode/qrcode.js';
import { esc } from './ui.js';

export const webJoinUrl = (ip, port, kind) => `http://${ip}${port && port !== 80 ? `:${port}` : ''}/?join=${kind}`;

// A crisp QR code as inline SVG (dark modules on white, with the quiet zone the camera needs).
export function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), m = 4;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg class="webjoin-qr" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" role="img" aria-label="QR code for ${esc(text)}" shape-rendering="crispEdges">
    <rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}

// The panel shown on the host phone. info: {ip, port} from the 'webhost' event, or null while it starts.
export function webJoinPanel(info, kind) {
  if (!info) return '<div class="webjoin"><div class="spinner"></div><p>Getting the game ready for a browser</p></div>';
  if (!info.ip) return '<div class="webjoin"><p class="webjoin-warn">This phone is not on wifi. Connect to wifi or turn on the hotspot, then try again.</p></div>';
  const url = webJoinUrl(info.ip, info.port, kind);
  return `<div class="webjoin">
    <h3>Friend on a browser</h3>
    ${qrSvg(url)}
    <div class="webjoin-url">${esc(url)}</div>
    <ol class="webjoin-steps">
      <li>Same wifi as this phone, or join this phone's hotspot.</li>
      <li>Scan with the camera and open the link (or type the address into Safari or Chrome).</li>
      <li>Keep this app open while you play.</li>
    </ol></div>`;
}
