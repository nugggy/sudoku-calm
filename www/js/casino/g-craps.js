// Craps: line bets, come and don't come, odds at true odds, place bets, the field and a few one-roll and hardway bets.
// Tap any bet to place the chosen chip; the strip under the table explains what that bet does.
import { el, $, $$ } from '../ui.js';
import { POINTS, CRAPS_BETS, crapsRoll, crapsCanBet, crapsOddsLimit, makeRng } from './rb-engine.js';
import { rbSound } from './rb-sound.js';
import { store, save } from '../store.js';

const rng = makeRng();
const dieImg = (n) => `img/casino/craps_die${n}.webp`;
const BOXES = [4, 5, 6, 8, 9, 10];
// Which guide entry explains a bet key.
const guideKey = (k) => (/^place/.test(k) ? 'place' : /^hard/.test(k) ? 'hard' : /odds$|o$/.test(k) && k !== 'come' ? 'odds' : /^dcome/.test(k) ? 'dontcome' : /^come/.test(k) ? 'come' : k);
const NAMES = { passodds: 'Pass odds', dontodds: "Don't pass odds" };
const nameOf = (k) => NAMES[k] || (/^place(\d+)/.test(k) ? `Place ${k.slice(5)}` : /^hard(\d+)/.test(k) ? `Hard ${k.slice(4)}` : /^come(\d+)o$/.test(k) ? `Come ${k.slice(4, -1)} odds` : /^dcome(\d+)o$/.test(k) ? `Don't come ${k.slice(5, -1)} odds` : /^come\d+$/.test(k) ? `Come ${k.slice(4)}` : /^dcome\d+$/.test(k) ? `Don't come ${k.slice(5)}` : CRAPS_BETS[k]?.name || k);
// Bets that are locked in once they have a number (they can't be taken back).
const locked = (k, st) => (k === 'pass' && st.point != null) || /^come\d+$/.test(k) || (k === 'dontpass' && false);

export default {
  id: 'craps', name: 'Craps', tag: 'Roll the dice, back the shooter',
  art: () => `<div class="rb-art-dice"><img src="${dieImg(5)}" alt=""><img src="${dieImg(6)}" alt=""></div>`,
  help: [
    'Start with the Pass line, then tap Roll. On the first roll (the come-out) 7 or 11 wins and 2, 3 or 12 loses. Any other number becomes the point, marked by the ON puck. Keep rolling: the point again wins, a 7 loses.',
    "Don't pass is the opposite bet. Once a point is set you can add Odds behind your line bet: they pay true odds, so the casino has no edge on them.",
    'Come and Don\'t come work like the line bets but start on the next roll. Place bets back one number to roll before a 7. The Field, Any seven and Any craps are settled on the very next roll. Hardways win when a number rolls as a pair.',
    'Tap any bet to place the chip you picked; the strip under the table explains that bet. Clear takes back every bet that is not locked in. These are play chips only.',
  ],
  create(ctx) {
    const { root, wallet, ui } = ctx;
    const C = store.casino || {};
    const saved = C.crapsTable;
    let st = saved && typeof saved === 'object' ? { point: saved.point ?? null, bets: { ...saved.bets } } : { point: null, bets: {} };
    let rolling = false, alive = true, dice = [6, 1];
    root.innerHTML = '';
    const node = el(`<div class="rb cr">
      <div class="rb-top"><div class="cr-puck" data-el="puck"></div></div>
      <div class="cr-table">
        <div class="cr-boxes">${BOXES.map((n) => `<div class="cr-box" data-box="${n}"><button class="cr-boxnum" data-bet="place${n}"><b>${n === 6 ? 'SIX' : n === 9 ? 'NINE' : n}</b><small>${n === 4 || n === 10 ? '9:5' : n === 5 || n === 9 ? '7:5' : '7:6'}</small></button><div class="cr-come" data-come="${n}"></div></div>`).join('')}</div>
        <button class="cr-area cr-dc" data-bet="dontcome">Don't come bar 12</button>
        <button class="cr-area cr-comearea" data-bet="come"><b>COME</b></button>
        <button class="cr-area cr-field" data-bet="field"><span>2 <small>pays 2x</small></span> 3 · 4 · 9 · 10 · 11 <span>12 <small>pays 3x</small></span><b>FIELD</b></button>
        <div class="cr-row"><button class="cr-area cr-dp" data-bet="dontpass">Don't pass bar 12</button><button class="cr-area cr-dpodds" data-bet="dontodds">Lay odds</button></div>
        <div class="cr-row"><button class="cr-area cr-pass" data-bet="pass"><b>PASS LINE</b></button><button class="cr-area cr-podds" data-bet="passodds">Odds</button></div>
        <div class="cr-props"><button class="cr-prop" data-bet="any7">Any seven <small>4:1</small></button><button class="cr-prop" data-bet="anycraps">Any craps <small>7:1</small></button>
          ${[4, 6, 8, 10].map((n) => `<button class="cr-prop hw" data-bet="hard${n}"><em>Hard ${n}</em><span><img src="${dieImg(n / 2)}" alt=""><img src="${dieImg(n / 2)}" alt=""></span><small>${n === 4 || n === 10 ? '7:1' : '9:1'}</small></button>`).join('')}</div>
        <div class="cr-dice" data-el="dice"><img src="${dieImg(6)}" alt="" class="d0"><img src="${dieImg(1)}" alt="" class="d1"></div>
      </div>
      <div class="cr-guide" data-el="guide">Tap the Pass line to make your first bet, then Roll.</div>
      <div class="rb-bar"><div data-el="picker"></div>
        <div class="rb-actions"><button class="cs-btn" data-act="clear">Clear</button><button class="cs-btn gold" data-act="roll">Roll</button></div>
        <div class="rb-total" data-el="total"></div></div>
    </div>`);
    root.appendChild(node);
    const q = (k) => $(`[data-el="${k}"]`, node);
    const picker = ui.betPicker({}); q('picker').appendChild(picker);

    function persist() { C.crapsTable = { point: st.point, bets: st.bets }; save(); }
    const total = () => Object.values(st.bets).reduce((a, b) => a + b, 0);
    function render() {
      q('puck').innerHTML = st.point ? `<span class="cr-on">ON</span><b>Point ${st.point}</b>` : '<span class="cr-off">OFF</span><b>Come-out roll</b>';
      $$('.cr-box', node).forEach((b) => b.classList.toggle('point', +b.dataset.box === st.point));
      // chips on every bet spot
      $$('[data-bet]', node).forEach((b) => {
        b.querySelector('.rl-chip')?.remove();
        const k = b.dataset.bet, v = st.bets[k];
        b.classList.toggle('off', !crapsCanBet(st, k) && !v);
        if (v) b.insertAdjacentHTML('beforeend', `<div class="rl-chip in">${chipHTML(v)}</div>`);
      });
      $$('[data-come]', node).forEach((d) => {
        const n = +d.dataset.come, c = st.bets[`come${n}`], co = st.bets[`come${n}o`], dc = st.bets[`dcome${n}`], dco = st.bets[`dcome${n}o`];
        d.innerHTML = `${c ? `<button class="cr-mini" data-bet="come${n}o" title="Add odds"><span class="rl-chip in">${chipHTML(c)}</span><small>${co ? `odds ${ui.fmt(co)}` : '+ odds'}</small></button>` : ''}${dc ? `<button class="cr-mini dark" data-bet="dcome${n}o"><span class="rl-chip in">${chipHTML(dc)}</span><small>${dco ? `lay ${ui.fmt(dco)}` : '+ lay'}</small></button>` : ''}`;
      });
      q('total').textContent = total() ? `On the table ${ui.fmt(total())}` : '';
    }
    function chipHTML(v) {
      const top = [...ui.CHIPS].reverse().find((c) => c <= v) || ui.CHIPS[0];
      return `<img src="${ui.chipImg(top)}" alt=""><b>${v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'K' : v}</b>`;
    }
    function guide(k, extra = '') {
      const g = CRAPS_BETS[guideKey(k)];
      q('guide').innerHTML = `<b>${nameOf(k)}.</b> ${g ? g.help : ''}${extra ? ` <em>${extra}</em>` : ''}`;
    }
    async function place(k) {
      if (rolling) return;
      if (!crapsCanBet(st, k)) {
        guide(k, k === 'come' || k === 'dontcome' || /^place|^hard/.test(k) ? 'Available once a point is set.' : k === 'pass' || k === 'dontpass' ? 'Line bets are made before the come-out roll.' : 'Make the line or come bet first.');
        ctx.sfx.error(); return;
      }
      let v = picker.selected();
      const lim = crapsOddsLimit(st, k);
      if (lim !== Infinity) { v = Math.min(v, lim - (st.bets[k] || 0)); if (v <= 0) { guide(k, 'That is the most odds allowed here.'); ctx.sfx.error(); return; } }
      if (!(await ui.needChips(ctx, v))) return;
      if (!wallet.take(v)) return;
      st.bets[k] = (st.bets[k] || 0) + v;
      rbSound.chip(); ctx.buzz(8); guide(k); persist(); render();
    }
    function clearBets() {
      let back = 0;
      for (const k of Object.keys(st.bets)) if (!locked(k, st)) { back += st.bets[k]; delete st.bets[k]; }
      if (back) { wallet.give(back); ctx.sfx.erase(); q('guide').textContent = `Took back ${ui.fmt(back)}. Bets with a number stay on the table.`; }
      else q('guide').textContent = 'Nothing to take back. Pass and come bets stay once they have a number.';
      persist(); render();
    }
    async function roll() {
      if (rolling) return;
      if (!total()) { ctx.toast('Place a bet first'); return; }
      rolling = true; node.classList.add('rolling');
      const d1 = rng.int(6) + 1, d2 = rng.int(6) + 1; // drawn now; the tumble just shows them
      await tumble(d1, d2);
      if (!alive) return;
      const before = st;
      const res = crapsRoll(before, d1, d2);
      st = { point: res.point, bets: res.bets };
      let back = 0, staked = 0;
      for (const r of res.results) { back += r.ret; staked += r.amount; }
      if (back) wallet.give(back);
      const net = back - staked;
      if (res.results.length) ctx.stats.record(net > 0 ? 'win' : net < 0 ? 'lose' : 'push', net);
      // what happened, in words
      const sum = res.sum;
      let call = `${sum}${res.hard && [4, 6, 8, 10].includes(sum) ? ' the hard way' : ''}`;
      if (before.point == null && res.point != null) call += `. The point is ${res.point}`;
      else if (before.point != null && sum === before.point) call += '. Point made';
      else if (before.point != null && sum === 7) call += '. Seven out';
      else if (before.point == null && (sum === 7 || sum === 11)) call += '. Natural';
      else if (before.point == null && [2, 3, 12].includes(sum)) call += '. Craps';
      const lines = res.results.map((r) => `${nameOf(r.key)} ${r.outcome === 'win' ? `wins ${ui.fmt(r.ret - r.amount)}` : r.outcome === 'push' ? 'is a tie' : 'loses'}`);
      q('guide').innerHTML = `<b>${call}.</b> ${lines.join(', ') || 'No bets settled.'}`;
      if (net > 0) { ui.banner(root, { text: call.split('.')[0] + (call.includes('Point made') ? ', point made' : ''), amount: net, win: true }); rbSound.chime(); }
      else if (net < 0) ui.banner(root, { text: call.includes('Seven out') ? 'Seven out' : `${sum}`, win: false, ms: 1100 });
      persist(); render();
      rolling = false; node.classList.remove('rolling');
    }
    function tumble(d1, d2) {
      return new Promise((resolve) => {
        const box = q('dice'), imgs = $$('img', box);
        rbSound.rattle(); ctx.buzz([10, 30, 10]);
        const t0 = performance.now(), T = 1100;
        const path = imgs.map((_, i) => ({ x0: 85 + i * 6, y0: 20 + i * 30, x1: 30 + i * 22 + Math.random() * 10, y1: 30 + i * 12 + Math.random() * 18, spin: (2 + Math.random() * 2) * (i ? -1 : 1) }));
        const step = (now) => {
          if (!alive) return resolve();
          const t = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - t, 3);
          imgs.forEach((im, i) => {
            const p = path[i], bounce = Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 18;
            im.style.left = `${p.x0 + (p.x1 - p.x0) * e}%`; im.style.top = `calc(${p.y0 + (p.y1 - p.y0) * e}% - ${bounce}px)`;
            im.style.transform = `rotate(${p.spin * 360 * (1 - e)}deg)`;
            if (t < 0.85 && Math.floor(now / 70) % 2 === 0) im.src = dieImg(rng.int(6) + 1);
          });
          if (t < 1) requestAnimationFrame(step);
          else { imgs[0].src = dieImg(d1); imgs[1].src = dieImg(d2); imgs.forEach((im) => { im.style.transform = 'none'; }); rbSound.thud(); setTimeout(resolve, 250); }
        };
        requestAnimationFrame(step);
        setTimeout(() => { imgs[0].src = dieImg(d1); imgs[1].src = dieImg(d2); resolve(); }, T + 1200);
      });
    }

    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bet]'); if (b) return place(b.dataset.bet);
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'clear') clearBets(); else if (a === 'roll') roll();
    });
    render();
    if (st.point) q('guide').innerHTML = `<b>Welcome back.</b> The point is ${st.point} and your bets are still on the table.`;
    return { destroy() { alive = false; persist(); } };
  },
};
