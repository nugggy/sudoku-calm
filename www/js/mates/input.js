// Jump Mates controls. Two players share one device: each has a set of on-screen buttons, a side of the
// keyboard and (if plugged in or paired) a game controller. poll() merges them into one state per player.
//
// Keyboard: player 1 uses A and D to move, W or Space to jump, S for down and E, F or Q for their action.
// Player 2 uses the arrow keys and Enter, / or right Shift for their action.
// Controllers (standard mapping): stick or d-pad to move, A to jump, B, X or a shoulder button for the
// action, Start to pause. The first controller is player 1 and the second is player 2. With one controller,
// `swap` hands it to player 2 instead.

const KEYS = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['KeyW', 'Space'], act: ['KeyE', 'KeyF', 'KeyQ'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['ArrowUp'], act: ['Enter', 'NumpadEnter', 'Slash', 'ShiftRight', 'Numpad0', 'Period'] },
];
const ALL_KEYS = new Set(KEYS.flatMap((k) => Object.values(k).flat()));
const DEAD = 0.3;

const blank = () => ({ x: 0, up: false, down: false, jump: false, act: false, jumpP: false, actP: false });

export function createInput(root, { swap = () => false } = {}) {
  const keys = new Set();
  const touch = [new Map(), new Map()]; // pointerId -> button kind, per player
  const prev = [blank(), blank()];
  let prevPause = false, prevPads = '';
  let padIds = [];
  const listeners = { pads: null };

  const kd = (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!ALL_KEYS.has(e.code)) return;
    e.preventDefault(); keys.add(e.code);
  };
  const ku = (e) => { keys.delete(e.code); };
  const blur = () => { keys.clear(); touch.forEach((m) => m.clear()); syncButtons(); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);

  // ----- on-screen buttons: [data-mp="0|1"] holds buttons [data-mk="l|r|j|a"] -----
  function buttonAt(x, y) { const b = document.elementFromPoint(x, y); return b && b.closest ? b.closest('[data-mk]') : null; }
  function syncButtons() {
    root.querySelectorAll('[data-mk]').forEach((b) => {
      const p = +b.closest('[data-mp]').dataset.mp;
      b.classList.toggle('on', [...touch[p].values()].includes(b.dataset.mk));
    });
  }
  const pd = (e) => {
    const b = e.target.closest && e.target.closest('[data-mk]'); if (!b) return;
    e.preventDefault();
    const p = +b.closest('[data-mp]').dataset.mp;
    touch[p].set(e.pointerId, b.dataset.mk);
    try { b.releasePointerCapture?.(e.pointerId); } catch { /* fine */ }
    syncButtons();
  };
  // sliding a thumb from left to right (or onto jump) switches buttons without lifting
  const pm = (e) => {
    for (let p = 0; p < 2; p++) {
      if (!touch[p].has(e.pointerId)) continue;
      const b = buttonAt(e.clientX, e.clientY);
      if (b && +b.closest('[data-mp]').dataset.mp === p && b.dataset.mk !== touch[p].get(e.pointerId)) {
        const was = touch[p].get(e.pointerId);
        // only the move buttons hand over on a slide; jump and action stay put so they cannot repeat by accident
        if ((was === 'l' || was === 'r') && (b.dataset.mk === 'l' || b.dataset.mk === 'r')) { touch[p].set(e.pointerId, b.dataset.mk); syncButtons(); }
      }
    }
  };
  const pu = (e) => { let hit = false; for (const m of touch) if (m.delete(e.pointerId)) hit = true; if (hit) syncButtons(); };
  root.addEventListener('pointerdown', pd);
  window.addEventListener('pointermove', pm);
  window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);

  // ----- controllers -----
  function pads() {
    let list = [];
    try { list = [...(navigator.getGamepads?.() || [])].filter((g) => g && g.connected); } catch { /* not allowed */ }
    return list.sort((a, b) => a.index - b.index);
  }
  function readPad(g) {
    const b = (i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    let x = Math.abs(ax) > DEAD ? Math.max(-1, Math.min(1, (ax - Math.sign(ax) * DEAD) / (1 - DEAD) * 1.25)) : 0;
    if (b(14)) x = -1; if (b(15)) x = 1;
    return {
      x, up: b(12) || ay < -0.55, down: b(13) || ay > 0.55,
      jump: b(0) || b(3), act: b(1) || b(2) || b(4) || b(5) || b(6) || b(7), pause: b(9),
    };
  }

  // Who has a controller right now: [player 1, player 2] -> true or false.
  function assign(list) {
    if (list.length >= 2) return [list[0], list[1]];
    if (list.length === 1) return swap() ? [null, list[0]] : [list[0], null];
    return [null, null];
  }

  function poll() {
    const list = pads(), mine = assign(list);
    const ids = mine.map((g) => (g ? g.index : '-')).join(',');
    if (ids !== prevPads) { prevPads = ids; padIds = mine.map((g) => !!g); listeners.pads?.(padIds, list.length); }
    let pause = false;
    const out = [0, 1].map((p) => {
      const K = KEYS[p], k = (list2) => list2.some((c) => keys.has(c));
      const t = [...touch[p].values()];
      const s = blank();
      s.x = (k(K.right) || t.includes('r') ? 1 : 0) - (k(K.left) || t.includes('l') ? 1 : 0);
      s.up = k(K.up); s.down = k(K.down);
      s.jump = k(K.jump) || t.includes('j');
      s.act = k(K.act) || t.includes('a');
      if (mine[p]) {
        const g = readPad(mine[p]);
        if (g.x) s.x = g.x;
        s.up ||= g.up; s.down ||= g.down; s.jump ||= g.jump; s.act ||= g.act; pause ||= g.pause;
      }
      s.jumpP = s.jump && !prev[p].jump;
      s.actP = s.act && !prev[p].act;
      prev[p] = s;
      return s;
    });
    const pauseP = pause && !prevPause; prevPause = pause;
    return { players: out, pauseP };
  }

  return {
    poll,
    // Called with ([p1HasPad, p2HasPad], controllersConnected) when controllers come or go.
    onPads(fn) { listeners.pads = fn; },
    hasPad: () => padIds,
    destroy() {
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
      root.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu);
    },
  };
}

// Reads any connected controller's buttons for menus: { a, b, start } pressed this frame.
export function menuPad() {
  let last = { a: true, b: true, start: true, up: true, down: true };
  return () => {
    let a = false, b = false, start = false, up = false, down = false;
    try {
      for (const g of navigator.getGamepads?.() || []) {
        if (!g || !g.connected) continue;
        const btn = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
        a ||= btn(0); b ||= btn(1); start ||= btn(9); up ||= btn(12) || (g.axes[1] || 0) < -0.6; down ||= btn(13) || (g.axes[1] || 0) > 0.6;
      }
    } catch { /* fine */ }
    const now = { a, b, start, up, down };
    const edge = { a: a && !last.a, b: b && !last.b, start: start && !last.start, up: up && !last.up, down: down && !last.down };
    last = now;
    return edge;
  };
}
