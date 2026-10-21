// Guesswork: find the five-letter word in six tries. A daily word plus unlimited practice.
import { hashString, mulberry32 } from './sudoku-engine.js';
import { store, save, todayKey } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { helpSheet } from './kit.js';
import { loadWords } from './words.js';
import { cbOn } from './cb.js';

const G = () => store.guess;
export const guessHelp = () => helpSheet('How to play Guesswork', [
  'Guess the hidden five-letter word in six tries. Each guess must be a real word.',
  cbOn()
    ? 'Orange with a bar <span class="gw-demo g">G</span> means the letter is in the word and in the right spot. Blue with a dot <span class="gw-demo y">Y</span> means it is in the word but somewhere else. Grey <span class="gw-demo x">X</span> means it is not in the word.'
    : '<span class="gw-demo g">G</span> means the letter is in the word and in the right spot. <span class="gw-demo y">Y</span> means it is in the word but somewhere else. <span class="gw-demo x">X</span> means it is not in the word.',
  'There is a new daily word each day, and as many practice words as you like.',
], 'guess-btn');

// Scores a guess: 2 right place, 1 elsewhere, 0 not in word (handles repeated letters properly).
export function score(guess, answer) {
  const res = new Array(5).fill(0), left = {};
  for (let i = 0; i < 5; i++) { if (guess[i] === answer[i]) res[i] = 2; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
  for (let i = 0; i < 5; i++) if (res[i] !== 2 && left[guess[i]]) { res[i] = 1; left[guess[i]]--; }
  return res;
}

function dailyAnswer(answers, key) { return answers[hashString('guess-' + key) % answers.length]; }

// ---------- Home ----------
export function guessHomeScreen(app) {
  const root = el(`<section class="screen guess-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title"></div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const g = G(), st = g.stats;
    const today = todayKey();
    const dailyDone = g.daily[today];
    const max = Math.max(1, ...st.dist);
    body.innerHTML = `<div class="gw-hero">${'GUESS'.split('').map((ch, i) => `<i class="${['g', 'y', 'x', 'g', 'g'][i]}" style="animation-delay:${i * 0.1}s">${ch}</i>`).join('')}</div>
      <h1 class="kit-title">Guesswork</h1>
      <button class="btn guess-btn" data-act="daily">${dailyDone ? (dailyDone.won ? 'Daily word solved' : 'Daily word finished') : 'Daily word'}<small>${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}${dailyDone ? ` · ${dailyDone.won ? dailyDone.tries + '/6' : 'X/6'}` : ''}</small></button>
      <button class="btn secondary guess-sec" data-act="practice">Practice<small>As many words as you like</small></button>
      <div class="section-title">Statistics</div>
      <div class="card gw-stats"><div><b>${st.played}</b>Played</div><div><b>${st.played ? Math.round((st.won / st.played) * 100) : 0}</b>Win %</div><div><b>${st.streak}</b>Streak</div><div><b>${st.best}</b>Best</div></div>
      <div class="section-title">Guesses</div>
      <div class="card gw-dist">${st.dist.map((n, i) => `<div><span>${i + 1}</span><i style="width:${Math.max(8, (n / max) * 100)}%">${n}</i></div>`).join('')}</div>`;
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') return app.back();
    if (a === 'help') return guessHelp();
    if (a === 'daily') return app.go('guessgame', { mode: 'daily' });
    if (a === 'practice') return app.go('guessgame', { mode: 'practice' });
  });
  render();
  return { root, refresh: render };
}

// ---------- Game ----------
export function guessGameScreen(app, { mode }) {
  const g = G();
  const key = todayKey();
  const root = el(`<section class="screen guess-theme guess-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${mode === 'daily' ? 'Daily word' : 'Practice'}</div><button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="gw-board-wrap"><div class="gw-board" data-el="board">${[...Array(6)].map(() => `<div class="gw-row">${'<div class="gw-tile"></div>'.repeat(5)}</div>`).join('')}</div></div>
    <div class="cross-keys gw-keys">${['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row, ri) => `<div class="krow">${ri === 2 ? '<button class="wide" data-key="ENTER">Enter</button>' : ''}${[...row].map((k) => `<button data-key="${k}">${k}</button>`).join('')}${ri === 2 ? '<button class="wide" data-key="DEL" aria-label="Delete">⌫</button>' : ''}</div>`).join('')}</div>
  </section>`);
  const rows = $$('.gw-row', root);
  let W, answer, guesses = [], cur = '', over = false, busy = false;

  function persist() {
    if (mode === 'daily') g.dailyState = { key, guesses };
    else g.practice = { answer, guesses };
    save();
  }

  function paintRow(r, word, res, animate) {
    const tiles = rows[r].children;
    for (let i = 0; i < 5; i++) {
      const t = tiles[i];
      t.textContent = word[i] || '';
      t.classList.toggle('filled', !!word[i]);
      if (res) {
        const cls = ['x', 'y', 'g'][res[i]];
        if (animate) setTimeout(() => { t.classList.add('flip'); setTimeout(() => t.classList.add(cls), 230); }, i * 260);
        else t.classList.add(cls);
      }
    }
  }
  function paintKeys() {
    const best = {};
    for (const w of guesses) score(w, answer).forEach((v, i) => { best[w[i]] = Math.max(best[w[i]] ?? -1, v); });
    $$('[data-key]', root).forEach((b) => { const v = best[b.dataset.key.toLowerCase()]; b.classList.remove('g', 'y', 'x'); if (v !== undefined) b.classList.add(['x', 'y', 'g'][v]); });
  }

  async function submit() {
    if (cur.length < 5) { shake('Not enough letters'); return; }
    if (!W.valid.has(cur)) { shake('Not in the word list'); return; }
    busy = true;
    const res = score(cur, answer);
    const r = guesses.length;
    guesses.push(cur);
    paintRow(r, cur.toUpperCase(), res, true);
    sfx.place();
    cur = '';
    persist();
    await new Promise((x) => setTimeout(x, 5 * 260 + 250));
    paintKeys();
    busy = false;
    if (res.every((v) => v === 2)) return finish(true);
    if (guesses.length === 6) return finish(false);
  }
  function shake(msg) {
    const row = rows[guesses.length];
    row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
    toast(msg); buzz(30); sfx.error();
  }

  async function finish(won) {
    over = true;
    const st = g.stats;
    {
      st.played++;
      if (won) { st.won++; st.streak++; st.best = Math.max(st.best, st.streak); st.dist[guesses.length - 1]++; } else st.streak = 0;
    }
    if (mode === 'daily') g.daily[key] = { won, tries: guesses.length };
    else g.practice = null;
    save(true);
    if (won) {
      const tiles = rows[guesses.length - 1].children;
      [...tiles].forEach((t, i) => setTimeout(() => t.classList.add('bounce'), i * 90));
      sfx.win(); setTimeout(confetti, 400);
    } else sfx.error();
    await new Promise((x) => setTimeout(x, 900));
    const words = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
    const v = await dialog({ hero: won ? 'img/art/ui/trophy.svg' : 'img/art/ui/thinking-face.svg', title: won ? words[guesses.length - 1] : 'Out of guesses', dismissible: false,
      text: `The word was ${answer.toUpperCase()}.${won ? `\nSolved in ${guesses.length} of 6.` : ''}`,
      buttons: [...(mode === 'practice' ? [{ label: 'Next word', value: 'next' }] : []), { label: 'Back', value: 'back', cls: mode === 'practice' ? 'ghost' : '' }] });
    if (v === 'next') app.replace('guessgame', { mode: 'practice' }); else app.back();
  }

  function type(k) {
    if (over || busy) return;
    if (k === 'ENTER') return submit();
    if (k === 'DEL') { cur = cur.slice(0, -1); sfx.erase(); }
    else if (cur.length < 5) { cur += k.toLowerCase(); sfx.note(); const t = rows[guesses.length].children[cur.length - 1]; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
    paintRow(guesses.length, cur.toUpperCase(), null, false);
  }

  const onKey = (e) => { if (e.key === 'Enter') type('ENTER'); else if (e.key === 'Backspace') type('DEL'); else if (/^[a-z]$/i.test(e.key)) type(e.key.toUpperCase()); };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => {
    const k = e.target.closest('[data-key]');
    if (k) { type(k.dataset.key); buzz(5); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') guessHelp();
  });

  (async () => {
    W = await loadWords();
    if (mode === 'daily') {
      answer = dailyAnswer(W.answers, key);
      if (g.dailyState && g.dailyState.key === key) guesses = g.dailyState.guesses;
      if (g.daily[key]) over = true;
    } else {
      if (g.practice && g.practice.answer) { answer = g.practice.answer; guesses = g.practice.guesses; }
      else { answer = W.answers[(Math.random() * W.answers.length) | 0]; guesses = []; persist(); }
    }
    guesses.forEach((w, r) => paintRow(r, w.toUpperCase(), score(w, answer), false));
    paintKeys();
    if (over) toast(`Today's word was ${answer.toUpperCase()}. Come back tomorrow.`, 3500);
    if (!g.seenHelp) { g.seenHelp = true; save(); setTimeout(guessHelp, 300); }
  })();
  return { root, destroy() { document.removeEventListener('keydown', onKey); save(true); } };
}
