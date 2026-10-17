// Shared UI helpers: element builder, sheets, dialogs, toast and confetti.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Overlay stack, so the Android back button closes the top-most sheet or dialog first.
const overlays = [];
// Returns true when the back press is fully handled. Blocking dialogs (game over and the like)
// close and let the back press carry on, so the player leaves the game as expected.
export function closeTopOverlay() {
  const top = overlays[overlays.length - 1];
  if (!top) return false;
  top.close();
  return top.dismissible !== false;
}

function mountOverlay(node, { dismissible = true, backdrop = dismissible, onClose } = {}) {
  const root = document.getElementById('overlay-root');
  root.appendChild(node);
  const entry = {
    dismissible,
    close() {
      const i = overlays.indexOf(entry);
      if (i >= 0) overlays.splice(i, 1);
      node.remove();
      onClose && onClose();
    },
  };
  overlays.push(entry);
  if (backdrop) node.addEventListener('click', (e) => { if (e.target === node) entry.close(); });
  return entry;
}

export function sheet(innerHtml, { onMount, onClose } = {}) {
  const node = el(`<div class="backdrop"><div class="sheet">${innerHtml}</div></div>`);
  const o = mountOverlay(node, { onClose });
  onMount && onMount(node.firstElementChild, o.close);
  return o.close;
}

// buttons: [{label, value, cls}] -> resolves with the chosen value (or null if dismissed)
export function dialog({ hero = '', title = '', text = '', notes = '', buttons = [{ label: 'OK', value: true }], dismissible = true, backdrop = dismissible }) {
  return new Promise((resolve) => {
    let chosen = null;
    const node = el(`<div class="backdrop center"><div class="dialog">
      ${hero ? `<img class="hero" src="${hero}" alt="">` : ''}
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${notes ? `<div class="dlg-notes">${esc(notes)}</div>` : ''}
      <div class="stack">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div></div>`);
    const o = mountOverlay(node, { dismissible, backdrop, onClose: () => resolve(chosen) });
    node.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      chosen = buttons[+b.dataset.i].value;
      o.close();
    }));
  });
}

let toastTimer;
export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function confetti(duration = 2600) {
  const c = document.getElementById('confetti');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colours = ['#f2b631', '#3c6bdc', '#e55c6c', '#3fae6a', '#9a7cf0', '#f08a4b'];
  const parts = [...Array(140)].map(() => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 14 - 4,
    r: Math.random() * 6 + 4, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
    col: colours[(Math.random() * colours.length) | 0],
  }));
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.globalAlpha = Math.max(0, 1 - t / duration);
      ctx.fillStyle = p.col; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
}
