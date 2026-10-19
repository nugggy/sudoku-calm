// Word Duel: one player picks a secret word, the other guesses it a letter at a time before the balloons
// run out. Six rounds, three each way; a solved word scores the balloons left plus one.
//
// On two phones the setter's word is sent to the guesser's phone as soon as it is chosen, so the guesser's
// phone can check letters without a round trip. It is kept in memory only and never drawn until the round
// ends; this is a friendly game, and keeping it simple makes it work well over a slow link.
import { wordNew, wordSet, wordGuess, wordNext, wordGuesser, wordPattern, wordClean, wordOkShape, WORD } from './tbc-rules.js';
import { frame, mover, canAct, turnText, finish, winText, fx, cover, esc, sleep } from './tbc-ui.js';
import { loadWords } from '../words.js';

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const BAL = ['#e8604c', '#f2b631', '#3fae6a', '#3b7ddd', '#9a7cf0', '#f08a4b', '#e85d9c'];
const SPOTS = [[50, 22], [30, 30], [70, 30], [16, 48], [42, 46], [64, 48], [86, 46]];

// A bunch of balloons tied to a little parcel. One pops for every wrong letter.
function balloons(left, popAt = -1) {
  let g = '';
  SPOTS.forEach(([x, y], k) => {
    const alive = k < left;
    g += `<path d="M${x},${y + 13}Q${(x + 50) / 2 + (k % 2 ? 4 : -4)},${(y + 100) / 2} 50,104" class="wd-str ${alive ? '' : 'gone'}"/>`;
  });
  SPOTS.forEach(([x, y], k) => {
    if (k < left) g += `<image href="img/duo/balloon_${k}.webp" x="${x - 12}" y="${y - 14}" width="24" height="34.7"/>`;
    else if (k === popAt) g += `<g transform="translate(${x} ${y})" class="wd-pop">${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M0,-6L2,-16L-2,-16Z" transform="rotate(${a})" fill="${BAL[k]}"/>`).join('')}</g>`;
  });
  g += '<rect x="38" y="102" width="24" height="18" rx="3" class="wd-box"/><path d="M50,102v18M38,110h24" class="wd-ribbon"/>';
  return `<svg class="wd-balloons" viewBox="0 0 100 122" aria-hidden="true">${g}</svg>`;
}

export default {
  id: 'wordduel', name: 'Word Duel', tag: 'Guess the secret word, save the balloons', realtime: false, cat: 'party',
  art: () => `<div class="tbc-art-word">${balloons(5)}<div class="wd-art-word"><i>W</i><i>_</i><i>R</i><i>_</i></div></div>`,
  help: [
    'Players take turns choosing a secret word of 4 to 8 letters for the other to guess. There are six rounds, three each way.',
    'The guesser picks letters one at a time. Every letter that is not in the word pops a balloon. Seven balloons, seven misses.',
    'Solve the word to score the balloons still flying plus one. If the balloons run out, you score nothing for that round.',
    'On one phone, the guesser looks away while the word is typed in. Highest score after six rounds wins.',
  ],
  create(ctx) {
    const s = wordNew(ctx.first);
    const ui = frame(ctx, 'tbc-wordduel');
    let words = null, typed = '', popAt = -1, coverOn = false, lastSeenRound = -1, revealing = null;
    loadWords().then((d) => { words = d; render(); }).catch(() => { words = { valid: null }; render(); });

    const validWord = (w) => wordOkShape(w) && (!words || !words.valid || words.valid.has(w));
    const keys = (mode) => `<div class="wd-keys">${ROWS.map((r) => `<div>${[...r].map((c) => {
      const used = s.guessed.includes(c), cls = mode === 'guess' && used ? (s.word.includes(c) ? 'hit' : 'miss') : '';
      return `<button type="button" class="wd-key ${cls}" data-k="${c}" ${mode === 'guess' && used ? 'disabled' : ''}>${c}</button>`;
    }).join('')}</div>`).join('')}${mode === 'set' ? '<div><button type="button" class="wd-key wide" data-k="del">Delete</button><button type="button" class="wd-key wide go" data-k="ok">Done</button></div>' : ''}</div>`;
    const tiles = (pat, reveal = '') => `<div class="wd-word">${[...pat].map((c, k) => `<i class="${c === '_' ? (reveal ? 'shown' : '') : 'got'}">${c === '_' ? (reveal ? reveal[k] : '') : c}</i>`).join('')}</div>`;
    const lastRound = () => {
      const h = revealing || s.history[s.history.length - 1];
      if (!h) return '';
      const g = 1 - h.setter;
      return `<div class="wd-last ${h.solved ? 'ok' : 'no'}">${esc(ctx.names[g])} ${h.solved ? `solved <b>${esc(h.word.toUpperCase())}</b> for ${h.points} point${h.points === 1 ? '' : 's'}` : `ran out of balloons. It was <b>${esc(h.word.toUpperCase())}</b>`}</div>`;
    };

    function render() {
      ui.score(s.score);
      const roundTxt = `Round ${Math.min(s.round + 1, WORD.ROUNDS)} of ${WORD.ROUNDS}`;
      if (s.over) { ui.turn(-1); ui.body.innerHTML = `${lastRound()}<div class="wd-final">${esc(winText(ctx, s.winner, `, ${Math.max(...s.score)} to ${Math.min(...s.score)}`))}</div>`; return; }
      const g = wordGuesser(s);
      if (revealing) {
        // the round just ended: show the whole word for a moment on both phones
        ui.turn(-1);
        ui.status(roundTxt);
        ui.body.innerHTML = `${balloons(WORD.BALLOONS - revealing.misses, popAt)}${tiles(revealing.pattern, revealing.word)}${lastRound()}`;
        return;
      }
      if (!s.word) {
        ui.turn(s.setter);
        const mine = canAct(ctx, s.setter);
        ui.status(`${roundTxt}: ${turnText(ctx, s.setter, 'word to choose')}`);
        if (!mine) { ui.body.innerHTML = `${lastRound()}<div class="wd-wait"><div class="spinner"></div>${esc(ctx.names[s.setter])} is choosing a word for you</div>`; return; }
        if (ctx.local && lastSeenRound !== s.round && !coverOn) {
          coverOn = true;
          ui.body.innerHTML = lastRound();
          cover(ui.el, `<h2>Pass the phone to ${esc(ctx.names[s.setter])}</h2><p>${esc(ctx.names[g])}, look away while the secret word goes in.</p>`, `I'm ${ctx.names[s.setter]}`, () => { coverOn = false; lastSeenRound = s.round; render(); });
          return;
        }
        if (coverOn) return;
        const ok = validWord(typed);
        ui.body.innerHTML = `${lastRound()}<div class="wd-set"><p>Choose a word of ${WORD.MIN} to ${WORD.MAX} letters for ${esc(ctx.names[g])} to guess</p>
          <div class="wd-typed">${[...typed.padEnd(WORD.MIN, ' ')].map((c) => `<i>${c.trim()}</i>`).join('')}</div>
          <div class="wd-note ${typed.length >= WORD.MIN && !ok ? 'bad' : ''}">${!words ? 'Loading the word list' : typed.length < WORD.MIN ? '' : ok ? 'Good word' : 'Not a word we know'}</div></div>${keys('set')}`;
        return;
      }
      ui.turn(g);
      const guessing = canAct(ctx, g);
      ui.status(`${roundTxt}: ${turnText(ctx, g, 'guess')}`);
      // on two phones the setter sees their own word, with the letters found so far highlighted
      const pat = wordPattern(s);
      ui.body.innerHTML = `${balloons(WORD.BALLOONS - s.misses, popAt)}${!ctx.local && ctx.me === s.setter ? `<div class="wd-word setter">${[...s.word].map((c) => `<i class="${s.guessed.includes(c) ? 'got' : ''}">${c}</i>`).join('')}</div>` : tiles(pat)}
        <div class="wd-misses">${s.guessed.filter((c) => !s.word.includes(c)).map((c) => `<i>${c}</i>`).join('') || '&nbsp;'}</div>
        ${guessing ? keys('guess') : `<div class="wd-wait">${esc(ctx.names[g])} is guessing</div>`}`;
    }

    const m = mover(ctx, async (mv) => {
      if (mv.k === 'set') { if (wordSet(s, mv.w)) { typed = ''; fx(ctx, 'good'); render(); } return; }
      if (mv.k !== 'guess') return;
      const misses = s.misses, pat = () => wordPattern(s);
      const r = wordGuess(s, mv.l);
      if (!r) return;
      if (!r.hit) { popAt = misses; fx(ctx, 'bad'); setTimeout(() => { if (popAt === misses) popAt = -1; }, 500); } else fx(ctx, 'move');
      if (!r.roundOver) { render(); return; }
      revealing = { ...s.history[s.history.length - 1], pattern: pat(), misses: s.misses };
      render();
      fx(ctx, r.solved ? 'good' : 'bad');
      await sleep(2200);
      if (!ctx.alive()) return;
      revealing = null;
      wordNext(s);
      render();
      if (s.over) { const t = winText(ctx, s.winner, `, ${Math.max(...s.score)} to ${Math.min(...s.score)}`); fx(ctx, 'win'); finish(ctx, s.winner, t, 1600); }
    }, () => render());

    ui.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || m.busy || s.over) return;
      const k = b.dataset.k;
      if (!s.word) {
        if (!canAct(ctx, s.setter) || coverOn) return;
        if (k === 'del') typed = typed.slice(0, -1);
        else if (k === 'ok') {
          const w = wordClean(typed);
          if (!validWord(w)) { fx(ctx, 'bad'); ctx.toast && ctx.toast(w.length < WORD.MIN ? `Use at least ${WORD.MIN} letters` : 'That word is not in our list'); return; }
          if (ctx.local) {
            // hand the phone over before the guessing screen appears
            coverOn = true;
            cover(ui.el, `<h2>Now pass the phone to ${esc(ctx.names[wordGuesser(s)])}</h2><p>The word is locked in. Good luck.</p>`, `I'm ${ctx.names[wordGuesser(s)]}`, () => { coverOn = false; m.local({ k: 'set', w }); });
            typed = ''; ui.body.innerHTML = ''; return;
          }
          m.local({ k: 'set', w }); return;
        } else if (typed.length < WORD.MAX) typed += k;
        fx(ctx, 'tap'); render(); return;
      }
      if (!canAct(ctx, wordGuesser(s)) || b.disabled) return;
      m.local({ k: 'guess', l: k });
    });
    ctx.onMsg((msg) => { if (msg.t === 'mv') m.remote(msg.m); });
    render();
    return { destroy() { ctx.root.innerHTML = ''; } };
  },
};
