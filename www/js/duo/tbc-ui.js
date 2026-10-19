// Shared screen pieces for fork C's turn-based Play Together games: the player bar, whose turn it is,
// a move queue that plays local and remote moves one at a time, and the end of the game.
export const PCOL = ['#e8604c', '#3b7ddd'];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Builds the frame: a bar with both players (name, score, turn glow), a status line and a body.
export function frame(ctx, cls) {
  ctx.root.innerHTML = `<div class="tbc ${cls}">
    <div class="tbc-bar">${[0, 1].map((p) => `<div class="tbc-pl" data-p="${p}" style="--pc:${PCOL[p]}"><i></i><span class="tbc-nm">${esc(label(ctx, p))}</span><b class="tbc-sc"></b></div>`).join('')}</div>
    <div class="tbc-status" aria-live="polite"></div>
    <div class="tbc-body"></div></div>`;
  const el = ctx.root.firstElementChild;
  const q = (s) => el.querySelector(s);
  return {
    el, body: q('.tbc-body'),
    status(text) { q('.tbc-status').textContent = text; },
    turn(p) { el.querySelectorAll('.tbc-pl').forEach((n) => n.classList.toggle('on', +n.dataset.p === p)); },
    score(sc) { el.querySelectorAll('.tbc-pl').forEach((n) => { n.querySelector('.tbc-sc').textContent = sc == null ? '' : sc[+n.dataset.p]; }); },
  };
}

// "You" on this phone, the player's name otherwise.
export const label = (ctx, p) => (!ctx.local && ctx.me === p ? `${ctx.names[p]} (you)` : ctx.names[p]);
export const canAct = (ctx, p) => ctx.local || ctx.me === p;
export const turnText = (ctx, p, verb = 'turn') => (ctx.local ? `${ctx.names[p]}'s ${verb}` : ctx.me === p ? `Your ${verb}` : `${ctx.names[p]}'s ${verb}`);
// Which player this phone shows at the bottom (player 0 when both share the phone).
export const viewer = (ctx) => (ctx.local || ctx.me == null ? 0 : ctx.me);

// Runs moves one at a time so animations never overlap. Local moves are sent to the other phone first.
// apply(move) may return a promise (for an animation); messages that arrive meanwhile wait their turn.
// idle() runs once the queue is empty, so the screen can offer the next move.
export function mover(ctx, apply, idle) {
  const queue = [];
  let busy = false;
  async function run() {
    if (busy) return;
    busy = true;
    while (queue.length && ctx.alive()) { try { await apply(queue.shift()); } catch (e) { console.error(e); } }
    busy = false;
    if (idle && ctx.alive()) idle();
  }
  return {
    get busy() { return busy || queue.length > 0; },
    local(m) { ctx.send({ t: 'mv', m }); queue.push(m); run(); },
    remote(m) { queue.push(m); run(); },
  };
}

// Ends the game after a short pause so the final position can be seen.
export function finish(ctx, winner, text, ms = 1300) {
  setTimeout(() => { if (ctx.alive()) ctx.end({ winner, text }); }, ms);
}
export const winText = (ctx, w, extra = '') => (w == null ? `It's a draw${extra}` : `${ctx.names[w]} wins${extra}`);

// A full-screen cover used in pass-and-play when something must stay secret.
export function cover(host, html, btn, onGo) {
  const c = document.createElement('div');
  c.className = 'tbc-cover';
  c.innerHTML = `<div class="tbc-cover-in">${html}<button class="btn" type="button">${esc(btn)}</button></div>`;
  c.querySelector('button').onclick = () => { c.remove(); onGo(); };
  host.appendChild(c);
  return c;
}

export function fx(ctx, kind) {
  const s = ctx.sfx || {};
  if (kind === 'move') { s.place && s.place(); ctx.buzz && ctx.buzz(12); }
  else if (kind === 'tap') s.tap && s.tap();
  else if (kind === 'good') { s.unit && s.unit(); ctx.buzz && ctx.buzz(25); }
  else if (kind === 'bad') s.error && s.error();
  else if (kind === 'win') s.win && s.win();
  else if (kind === 'soft') s.note && s.note();
}
