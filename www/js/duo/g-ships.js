// Battleships: hide a fleet, then take turns firing at each other's waters. Each phone keeps its own fleet secret
// and answers the other phone's shots. On one phone, a cover screen hides each board while the phone is passed.
import { FLEET, SHIP_NAMES, shipCells, fleetValid, randomFleet, answerShot } from './rules.js';
import { mine, whoName, esc } from './core.js';
import { playerBar, passCover } from './ui.js';

// Ship pictures from the CC0 Sea Warfare set by Lowder2, stretched to the ship's length.
// FLEET is [5, 4, 3, 3, 2]; the second 3 is the submarine.
const SHIP_PIC = { 5: 'carrier', 4: 'battleship', 3: 'cruiser', 2: 'patrol' };
function hullSvg(len, vert, sunk = false, k = -1) {
  const pic = len === 3 && k === 3 ? 'submarine' : SHIP_PIC[len] || 'cruiser';
  return `<img class="sh-ship${sunk ? ' sunk' : ''}" src="img/duo/ship_${pic}_${vert ? 'v' : 'h'}.webp" alt="" draggable="false">`;
}
const MISS = '<img class="sh-miss" src="img/duo/ship_miss.webp" alt="">';
const HIT = '<img class="sh-hit" src="img/duo/ship_hit.webp" alt="">';

export default {
  id: 'ships', name: 'Battleships', tag: 'Hide your fleet, sink theirs', cat: 'board', realtime: false,
  art: () => `<div class="art-ships">${hullSvg(4, false)}<i class="m1">${MISS}</i><i class="h1">${HIT}</i><i class="m2">${MISS}</i></div>`,
  help: [
    'First place your five ships: drag a ship to move it and tap it to turn it. Shuffle places them at random. Ships may touch but not overlap.',
    'Then take turns firing at your friend\'s waters. A burst marks a hit, a white peg marks a miss. Sink a whole ship and your friend has to tell you which one.',
    'Sink all five ships to win. On one phone, pass the phone when asked so each player\'s fleet stays secret.',
  ],
  create(ctx) {
    // fleets[p] is only known on the phone that owns it (both on one phone)
    const fleets = [null, null], ready = [false, false];
    const shots = [new Map(), new Map()]; // shots[p]: cell -> 'miss' | 'hit' | 'sunk', fired BY player p
    const hitOn = [new Set(), new Set()]; // cells hit on player p's fleet (owner side bookkeeping)
    const sunkShips = [[], []]; // sunkShips[p]: cells of p's ships that the other player has sunk
    let phase = 'place', turn = ctx.first, over = false, waiting = false, placing = ctx.local ? ctx.first : ctx.me;
    let cover = null;
    // whose eyes are on the board: on one phone it only changes behind the pass-the-phone cover
    let viewer = ctx.local ? null : ctx.me;
    const others = (p) => 1 - p;

    ctx.root.innerHTML = '';
    const bar = playerBar(ctx, ['<i class="sh-sw a"></i>', '<i class="sh-sw b"></i>']);
    const area = document.createElement('div');
    area.className = 'dg-area sh-area';
    ctx.root.append(bar.el, area);

    // ---------- placement ----------
    let drag = null;
    function placeView() {
      const p = placing, f = fleets[p] || (fleets[p] = randomFleet(Math.random));
      area.innerHTML = `<div class="sh-place">
        <p class="sh-note">${ctx.local ? `<b>${whoName(ctx, p)}</b>, place` : 'Place'} your fleet. Drag to move, tap to turn.</p>
        <div class="sh-grid big" data-grid="own">${cellsHtml()}${f.map((s, k) => shipHtml(s, k)).join('')}</div>
        <div class="dg-tool-row"><button class="btn ghost" data-act="shuffle">Shuffle</button><button class="btn duo-btn" data-act="ready">Ready</button></div>
        ${!ctx.local && ready[others(p)] ? `<p class="sh-note dim">${whoName(ctx, others(p))} is ready</p>` : ''}</div>`;
      sizeGrids();
      bar.set({ text: 'Place your ships' });
    }
    const cellsHtml = () => [...Array(100)].map((_, i) => `<i class="sh-c" data-i="${i}"></i>`).join('');
    const shipHtml = (s, k, sunk = false) => `<div class="sh-at" data-k="${k}" style="left:calc(${s.c} * var(--g));top:calc(${s.r} * var(--g));width:calc(${s.vert ? 1 : s.len} * var(--g));height:calc(${s.vert ? s.len : 1} * var(--g))">${hullSvg(s.len, s.vert, sunk, k)}</div>`;
    function sizeGrids() {
      area.querySelectorAll('.sh-grid').forEach((g) => {
        const big = g.classList.contains('big');
        const w = area.clientWidth - 24, h = area.clientHeight - (big ? 150 : 0);
        const s = big ? Math.floor(Math.min(w, h * (phase === 'battle' ? 0.62 : 1), 460) / 10) : Math.floor(Math.min(w * 0.5, (area.clientHeight - 24) * 0.3, 230) / 10);
        g.style.setProperty('--g', Math.max(14, s) + 'px');
      });
    }
    function fits(f, k, r, c, vert) {
      const cells = shipCells(r, c, f[k].len, vert);
      if (!cells) return null;
      const taken = new Set(f.filter((_, j) => j !== k).flatMap((s) => s.cells));
      return cells.some((x) => taken.has(x)) ? null : cells;
    }
    area.addEventListener('pointerdown', (e) => {
      if (phase !== 'place') return;
      const sh = e.target.closest('.sh-at');
      const grid = e.target.closest('.sh-grid');
      if (!sh || !grid) return;
      const g = grid.getBoundingClientRect(), gs = g.width / 10, k = +sh.dataset.k, s = fleets[placing][k];
      drag = { k, grid: g, gs, dr: Math.floor((e.clientY - g.top) / gs) - s.r, dc: Math.floor((e.clientX - g.left) / gs) - s.c, moved: false, el: sh };
      sh.setPointerCapture?.(e.pointerId);
    });
    area.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const f = fleets[placing], s = f[drag.k];
      const r = Math.floor((e.clientY - drag.grid.top) / drag.gs) - drag.dr, c = Math.floor((e.clientX - drag.grid.left) / drag.gs) - drag.dc;
      if (r === s.r && c === s.c) return;
      const cells = fits(f, drag.k, r, c, s.vert);
      if (!cells) return;
      Object.assign(s, { r, c, cells }); drag.moved = true;
      drag.el.style.left = `calc(${c} * var(--g))`; drag.el.style.top = `calc(${r} * var(--g))`;
    });
    area.addEventListener('pointerup', () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.moved) { ctx.sfx.place(); return; }
      const f = fleets[placing], s = f[d.k];
      // turn it about its first square, nudging back inside the grid if needed
      for (const [dr, dc] of [[0, 0], [0, -1], [-1, 0], [0, -2], [-2, 0], [0, -3], [-3, 0], [0, -4], [-4, 0]]) {
        const cells = fits(f, d.k, s.r + dr, s.c + dc, !s.vert);
        if (cells) { Object.assign(s, { r: s.r + dr, c: s.c + dc, vert: !s.vert, cells }); ctx.sfx.tap(); placeView(); return; }
      }
      ctx.sfx.error();
    });

    function markReady(p) {
      ready[p] = true;
      if (ready[0] && ready[1]) startBattle();
      else if (!ctx.local && p === ctx.me) { area.innerHTML = `<div class="dg-pick"><div class="spinner"></div><p>Waiting for ${whoName(ctx, others(p))} to place their fleet</p></div>`; bar.set({ text: '' }); }
      else if (!ctx.local) placeView();
    }

    // ---------- battle ----------
    function startBattle() {
      phase = 'battle';
      ctx.sfx.hint();
      if (ctx.local) showTurn(); else battleView();
    }
    // on one phone each turn starts behind a cover so the shooter's own fleet stays hidden from the other player
    function showTurn() {
      area.innerHTML = '';
      viewer = null;
      cover = passCover(area, ctx.names[turn], 'Look away if you are not the one firing.', () => { cover = null; viewer = turn; battleView(); });
      bar.set({ turn });
    }
    function battleView() {
      const me = viewer ?? turn, them = others(me);
      const theirSunk = new Set(sunkShips[them].flat());
      area.innerHTML = `<div class="sh-battle">
        <p class="sh-label">${esc(whoName(ctx, them))}'s waters</p>
        <div class="sh-grid big enemy" data-grid="enemy">${[...Array(100)].map((_, i) => { const r = shots[me].get(i); return `<i class="sh-c ${r ? 'shot ' + r : ''} ${theirSunk.has(i) ? 'sunkc' : ''}" data-i="${i}">${r === 'miss' ? MISS : r ? HIT : ''}</i>`; }).join('')}</div>
        <div class="sh-lower"><div><p class="sh-label">Your fleet</p><div class="sh-grid small" data-grid="own">${[...Array(100)].map((_, i) => { const r = shots[them].get(i); return `<i class="sh-c ${r ? 'shot ' + r : ''}">${r === 'miss' ? MISS : r ? HIT : ''}</i>`; }).join('')}${fleets[me].map((s, k) => shipHtml(s, k, s.cells.every((x) => hitOn[me].has(x)))).join('')}</div></div>
        <div class="sh-left"><p class="sh-label">Still afloat</p>${FLEET.map((len, k) => `<span class="${sunkShips[them].some((c) => c.length === len) && sunkShips[them].filter((c) => c.length === len).length > FLEET.slice(0, k).filter((x) => x === len).length ? 'gone' : ''}">${SHIP_NAMES[len]} (${len})</span>`).join('')}</div></div></div>`;
      sizeGrids();
      bar.set({ turn: over ? -1 : turn, score: [sunkShips[1].length, sunkShips[0].length] });
    }

    function fire(i, p) {
      if (over || phase !== 'battle' || p !== turn || waiting || shots[p].has(i)) return false;
      if (ctx.local) { applyResult(p, i, answerShot(fleets[1 - p], hitOn[1 - p], i)); return true; }
      waiting = true;
      ctx.send({ t: 'shot', i, p });
      const c = area.querySelector(`.enemy [data-i="${i}"]`); c?.classList.add('aim');
      return true;
    }
    // the shooter learns what happened; the defender has already marked its own board
    function applyResult(p, i, res) {
      waiting = false;
      shots[p].set(i, res.r === 'miss' ? 'miss' : 'hit');
      if (res.r === 'sunk') { sunkShips[1 - p].push(res.ship); res.ship.forEach((x) => shots[p].set(x, 'sunk')); }
      if (res.r === 'miss') ctx.sfx.erase(); else if (res.r === 'hit') { ctx.sfx.place(); ctx.buzz(25); } else { ctx.sfx.unit(); ctx.buzz([30, 40, 60]); ctx.toast(`${p === ctx.me || ctx.local ? 'You sank' : `${whoName(ctx, p)} sank`} ${ctx.local || p === ctx.me ? 'their' : 'your'} ${SHIP_NAMES[res.ship.length]}`); }
      if (res.over) {
        over = true; battleView();
        setTimeout(() => ctx.end({ winner: p, text: 'The whole fleet is sunk' }), 1200);
        return;
      }
      turn = 1 - turn;
      if (ctx.local) { battleView(); setTimeout(() => { if (ctx.alive() && !over) showTurn(); }, 1300); }
      else battleView();
    }

    area.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (phase === 'place') {
        if (a === 'shuffle') { fleets[placing] = randomFleet(Math.random); ctx.sfx.tap(); placeView(); }
        else if (a === 'ready') {
          if (!fleetValid(fleets[placing])) { ctx.sfx.error(); return; }
          ctx.sfx.hint();
          const p = placing;
          if (ctx.local && !ready[others(p)]) {
            ready[p] = true; placing = others(p);
            area.innerHTML = '';
            cover = passCover(area, ctx.names[placing], 'Now place the other fleet.', () => { cover = null; placeView(); });
            return;
          }
          if (!ctx.local) ctx.send({ t: 'ready', p });
          markReady(p);
        }
        return;
      }
      const cell = e.target.closest('.enemy [data-i]');
      if (!cell || over) return;
      if (ctx.local ? turn !== viewer : !mine(ctx, turn)) { if (!ctx.local) ctx.toast('Wait for your turn'); return; }
      if (waiting) return;
      const i = +cell.dataset.i;
      if (shots[turn].has(i)) { ctx.sfx.error(); return; }
      fire(i, turn);
    });

    const off = ctx.onMsg((m) => {
      if (m.t === 'ready') markReady(m.p);
      else if (m.t === 'shot' && m.p === turn && m.p !== ctx.me) {
        // the other phone fired at this phone's fleet: answer honestly and mark our own board
        const res = answerShot(fleets[ctx.me], hitOn[ctx.me], m.i);
        ctx.send({ t: 'res', i: m.i, p: m.p, ...res });
        shots[m.p].set(m.i, res.r === 'miss' ? 'miss' : 'hit');
        if (res.r === 'sunk') { sunkShips[ctx.me].push(res.ship); res.ship.forEach((x) => shots[m.p].set(x, 'sunk')); }
        if (res.r === 'miss') ctx.sfx.erase(); else { ctx.sfx.error(); }
        if (res.r === 'sunk') ctx.toast(`${whoName(ctx, m.p)} sank your ${SHIP_NAMES[res.ship.length]}`);
        if (res.over) { over = true; battleView(); setTimeout(() => ctx.end({ winner: m.p, text: 'The whole fleet is sunk' }), 1200); return; }
        turn = 1 - turn; battleView();
      } else if (m.t === 'res' && m.p === ctx.me && waiting) applyResult(m.p, m.i, m);
    });

    const ro = new ResizeObserver(() => sizeGrids());
    ro.observe(area);
    placeView();
    const bot = () => {
      if (cover) { cover.querySelector('[data-ready]').click(); return true; }
      if (phase === 'place') { if (ctx.local || !ready[ctx.me]) { area.querySelector('[data-act="ready"]')?.click(); return true; } return false; }
      if (over || waiting || (ctx.local ? turn !== viewer : !mine(ctx, turn))) return false;
      const free = [...Array(100).keys()].filter((i) => !shots[turn].has(i));
      return fire(free[Math.floor(Math.random() * free.length)], turn);
    };
    return {
      destroy() { off(); ro.disconnect(); },
      state: () => ({ shots: shots.map((s) => [...s].sort((a, b) => a[0] - b[0]).join(';')).join('|'), turn, over }),
      bot,
    };
  },
};
