// Dance Party: dance along with a coach to six songs. The hub lists the songs and the way you play; the play screen
// runs a song. Phone in hand scores your moves from the motion sensor (score.js); Tap along uses a tap, a hold or a
// swipe for each move instead, for when dancing is not an option. Routines are in choreo.js, moves in moves.js.
import { store, save } from '../store.js';
import { icon } from '../icons.js';
import { el, $, $$, sheet, esc, confetti, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { native } from '../native.js';
import { snd, buzz } from '../yeti/kit.js';
import { SONGS, songById, LEVEL_NAMES } from './songs.js';
import { MOVES, idlePose } from './moves.js';
import { routine } from './choreo.js';
import { GRADES, gradeOf, movePoints, maxPoints, MAX_SCORE, STAR_AT, starsFor, makeSensor, judgeMotion, judgeTap, TAP_WINDOW } from './score.js';
import { loadDance, layout, drawStage, drawCoach, drawStrip, drawHud, drawGrade, drawCount, paintCoachThumb, poseAt } from './draw.js';

export { SONGS as DANCE_SONGS };
const D = () => store.dance;

export function danceHelp() {
  const paras = [
    'Dance along with the coach. The coach faces you like a mirror, so copy it as if you were looking in one. Move cards slide in along the bottom and reach the ring when it is time for that move.',
    '<b>Phone in hand.</b> Hold the phone firmly in your right hand (or choose left), like a dance game controller. The glowing hand on the coach is the one holding the phone, and that hand is the one that is scored. Moving it on the beat, the right way and with energy earns Perfect, Super, Good or OK. Hold on tight, or use a wrist strap, and give yourself room to move.',
    '<b>Tap along.</b> Prefer to sit this one out, or the phone has no motion sensor? Each card shows a badge: tap, press and hold, or swipe the way the arrow points, on the beat.',
    'Gold moves end each part of the song and are worth three times as much. Fill the bar to earn up to five stars. Each song keeps the same routine every time, so you can learn it.',
    'If your taps always feel early or late, change the Timing on the Dance Party screen.',
  ];
  return new Promise((done) => sheet(`<h2>Dance Party</h2><div class="help-body">${paras.map((p) => `<p>${p}</p>`).join('')}</div><button class="btn dance-btn" data-x>Let's dance</button>`,
    { onMount: (n, close) => { $('[data-x]', n).onclick = close; }, onClose: done }));
}

// Two coaches mid-move, drawn by tools/dance/render.html.
export const danceCardArt = () => '<div class="art-dance"><img src="img/dance/card.webp" alt=""></div>';
export function danceProgress() {
  const n = Object.keys(D().best).length;
  return n ? `${n} of ${SONGS.length} songs danced` : 'Dance along with a coach';
}

// ---------- Audio ----------
// The songs play through Web Audio so the beat can be followed to the millisecond.
let actx = null;
const buffers = new Map();
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
async function loadSong(song) {
  if (buffers.has(song.id)) return buffers.get(song.id);
  const c = audio(); if (!c) throw new Error('no audio');
  const data = await (await fetch(song.src)).arrayBuffer();
  const buf = await new Promise((ok, bad) => { const p = c.decodeAudioData(data, ok, bad); if (p && p.then) p.then(ok, bad); });
  buffers.clear(); buffers.set(song.id, buf); // keep only the latest song in memory
  return buf;
}

// iPhones ask before sharing motion; Android does not. Must run inside a tap.
async function askMotion() {
  try { if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) return (await DeviceMotionEvent.requestPermission()) === 'granted'; } catch { return false; }
  return typeof DeviceMotionEvent !== 'undefined';
}

// ---------- Hub ----------
const modeName = { motion: 'Phone in hand', tap: 'Tap along' };
export function danceHubScreen(app) {
  const root = el(`<section class="screen dance-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Dance Party</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const d = D();
    body.innerHTML = `<div class="dance-hero"><canvas data-hero></canvas></div>
      <div class="dance-opts">
        <div class="seg" role="group" aria-label="How to play">${['motion', 'tap'].map((m) => `<button class="${d.mode === m ? 'on' : ''}" data-mode="${m}">${modeName[m]}</button>`).join('')}</div>
        <div class="dance-row">
          ${d.mode === 'motion' ? `<button class="chip" data-act="hand">Phone in ${d.hand === 'left' ? 'left' : 'right'} hand</button>` : ''}
          <button class="chip" data-act="timing">Timing ${d.offset ? `${d.offset > 0 ? '+' : ''}${d.offset} ms` : 'normal'}</button>
        </div>
      </div>
      <div class="dance-list">${SONGS.map((s) => {
        const best = d.best[s.id] || 0, st = starsFor(best);
        return `<button class="dance-card" data-s="${s.id}">
          <canvas class="dance-thumb" data-thumb="${s.id}"></canvas>
          <div class="dance-info"><b>${esc(s.title)}</b><span>${esc(s.artist)} · ${Math.round(s.bpm)} bpm · coach ${esc(s.coach)}</span>
          <span class="lvl lvl${s.level}">${LEVEL_NAMES[s.level]}</span>
          <em>${best ? `<i class="stars">${'★'.repeat(st)}<s>${'★'.repeat(5 - st)}</s></i> Best ${best.toLocaleString('en-AU')}` : 'Not danced yet'}</em></div>
        </button>`;
      }).join('')}</div>
      <p class="dance-credit">Music by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0. Coaches are Kenney's Toon Characters (CC0).</p>`;
    loadDance().then(() => {
      const hero = $('[data-hero]', body);
      if (hero) paintCoachThumb(hero, SONGS[1], 'star', 0.6);
      $$('[data-thumb]', body).forEach((c, i) => paintCoachThumb(c, songById(c.dataset.thumb), ['point', 'wave', 'disco', 'jump', 'punch', 'lasso'][i % 6], 0.1));
    });
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act, d = D();
    if (a === 'back') return app.back();
    if (a === 'help') return danceHelp();
    if (a === 'hand') { d.hand = d.hand === 'left' ? 'right' : 'left'; save(); sfx.tap(); return render(); }
    if (a === 'timing') return timingSheet(render);
    const m = e.target.closest('[data-mode]')?.dataset.mode;
    if (m) { d.mode = m; save(); sfx.tap(); return render(); }
    const s = e.target.closest('[data-s]');
    if (s) { audio(); app.go('dancegame', { id: s.dataset.s }); }
  });
  render();
  if (!D().seenHelp) { D().seenHelp = true; save(); setTimeout(danceHelp, 300); }
  return { root, refresh: render };
}

function timingSheet(done) {
  const show = (v) => (v ? `${v > 0 ? '+' : ''}${v} ms` : 'Normal');
  sheet(`<h2>Timing</h2><div class="help-body"><p>If moves are always judged early or late on your phone, nudge this. Later helps when your taps feel on the beat but score late.</p></div>
    <div class="dance-timing"><button class="btn ghost" data-d="-20">Earlier</button><b data-v>${show(D().offset)}</b><button class="btn ghost" data-d="20">Later</button></div>
    <button class="btn dance-btn" data-x>Done</button>`, {
    onMount(n, close) {
      n.addEventListener('click', (e) => {
        const b = e.target.closest('[data-d]');
        if (b) { const d = D(); d.offset = Math.max(-300, Math.min(300, (d.offset || 0) + +b.dataset.d)); save(); $('[data-v]', n).textContent = show(d.offset); sfx.tap(); }
        if (e.target.closest('[data-x]')) close();
      });
    },
    onClose: done,
  });
}

// ---------- Play ----------
export function danceGameScreen(app, { id }) {
  const song = songById(id), d = D();
  const list = routine(song), maxPts = maxPoints(list);
  const beatLen = 60 / song.bpm;
  const flip = d.hand === 'left';
  const root = el(`<section class="screen dance-play">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">${esc(song.title)}</div>
      <button class="icon-btn" data-act="pause" aria-label="Pause">${icon.pause}</button></header>
    <div class="dance-stage" data-el="stage"><canvas data-el="cv"></canvas><div class="dance-over" data-el="over"></div></div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const cv = q('cv'), stage = q('stage'), over = q('over'), g = cv.getContext('2d');
  let L = null, raf = 0, alive = true, buf = null, srcNode = null, startAt = 0, state = 'loading', mode = d.mode;
  let next = 0, pts = 0, grades = {}, lastGrade = null, sensor = null, tapDown = null, sawMotion = false, flash = 0, flashCol = '#fff';

  // Song time in seconds: the audio clock, less the speaker delay, plus the player's timing nudge.
  const lat = () => (actx ? (actx.outputLatency || actx.baseLatency || 0) : 0);
  const songTime = () => (actx && state !== 'loading' ? actx.currentTime - startAt - lat() - (d.offset || 0) / 1000 : 0);
  const beatAt = (t) => (t - song.first) / beatLen;
  const timeOf = (beat) => song.first + beat * beatLen;
  const score = () => Math.round((pts / maxPts) * MAX_SCORE);

  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    L = layout(r.width, r.height);
  }

  // ---------- grading ----------
  function give(i, q) {
    const m = list[i], gr = gradeOf(q);
    pts += movePoints(gr, m.gold);
    grades[gr.id] = (grades[gr.id] || 0) + 1;
    lastGrade = { gr, at: performance.now(), gold: m.gold };
    flash = 1; flashCol = gr.col;
    if (gr.id === 'perfect' || (m.gold && gr.pts >= 50)) buzz(m.gold ? [20, 40, 20] : 12);
  }
  function judgeDue(t) {
    while (next < list.length) {
      const m = list[next], end = timeOf(m.beat + m.len);
      if (mode === 'motion') {
        if (t < end + 0.12) break;
        give(next, judgeMotion(MOVES[m.id].sig, sensor.between(timeOf(m.beat) - 0.08, end + 0.08), timeOf(m.beat), beatLen));
        next++;
      } else {
        const hitAt = timeOf(m.beat);
        if (t < hitAt + TAP_WINDOW) break;
        if (tapDown && tapDown.move === next) break; // a hold or swipe still deciding
        give(next, 0); next++;
      }
    }
  }

  // ---------- motion ----------
  const onMotion = (e) => {
    if (state !== 'play') return;
    sawMotion = true;
    sensor.feed(songTime(), e.acceleration, e.accelerationIncludingGravity, e.rotationRate);
  };

  // ---------- tap along ----------
  // A gesture is judged by when the finger went down; what it was (tap, hold or swipe) is settled as it moves or lifts.
  function nearestOpen(t) {
    for (let i = next; i < list.length; i++) { const dt = t - timeOf(list[i].beat); if (dt < -TAP_WINDOW) return -1; if (Math.abs(dt) <= TAP_WINDOW) return i; }
    return -1;
  }
  function settle(kind) {
    if (!tapDown) return;
    const { move, dt } = tapDown; tapDown = null;
    if (move < 0 || move < next) return;
    while (next < move) { give(next, 0); next++; } // skipped moves are misses
    give(move, judgeTap(dt, MOVES[list[move].id].tap === kind)); next = move + 1;
  }
  const pos = (e) => [e.clientX, e.clientY];
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state !== 'play' || mode !== 'tap') return;
    const t = songTime(), i = nearestOpen(t);
    if (i < 0) { sfx.tap(); return; }
    tapDown = { move: i, dt: t - timeOf(list[i].beat), at: performance.now(), p: pos(e), id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch { /* fine */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!tapDown || e.pointerId !== tapDown.id) return;
    const [x, y] = pos(e), dx = x - tapDown.p[0], dy = y - tapDown.p[1];
    if (Math.hypot(dx, dy) > 28) settle(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const lift = (e) => { if (tapDown && e.pointerId === tapDown.id) settle(performance.now() - tapDown.at >= 300 ? 'hold' : 'tap'); };
  cv.addEventListener('pointerup', lift); cv.addEventListener('pointercancel', lift);
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const onKey = (e) => {
    if (state !== 'play' || mode !== 'tap' || e.repeat) return;
    const kind = KEYMAP[e.key] || (e.key === ' ' || e.key === 'Enter' ? 'space' : null);
    if (!kind) return;
    e.preventDefault();
    const t = songTime(), i = nearestOpen(t);
    if (i < 0) return;
    tapDown = { move: i, dt: t - timeOf(list[i].beat), at: performance.now(), id: 'key', key: e.key };
    if (kind !== 'space') settle(kind);
  };
  const onKeyUp = (e) => { if (tapDown && tapDown.id === 'key' && e.key === tapDown.key) settle(performance.now() - tapDown.at >= 300 ? 'hold' : 'tap'); };

  // ---------- frame ----------
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!L || L.H < 120) return; // not laid out yet
    const t = songTime(), beat = state === 'play' || state === 'paused' || state === 'done' ? beatAt(t) : performance.now() / 1000 / beatLen;
    if (state === 'play') {
      judgeDue(t);
      if (tapDown && tapDown.id !== 'key' && performance.now() - tapDown.at >= 300 && mode === 'tap') settle('hold');
      if (mode === 'motion' && !sawMotion && t > 3) { mode = 'tap'; toast('No motion sensor found, so this song is Tap along'); }
      if (t > timeOf(song.beats) + 0.3 || (buf && t > buf.duration)) finish();
    }
    const cur = list[Math.max(0, next - 1)];
    drawStage(g, L, song, beat, cur && list[next] ? 0.7 : 0.3);
    drawCoach(g, L, song, state === 'ready' || state === 'loading' ? idlePose(beat) : poseAt(list, beat), { flip, t: performance.now() / 1000 });
    drawStrip(g, L, song, list, state === 'ready' || state === 'loading' ? -4 : beat, { flip, tap: mode === 'tap', flash, flashCol });
    flash = Math.max(0, flash - 0.06);
    drawHud(g, L, song, score(), starsFor(score()), STAR_AT, MAX_SCORE);
    if (lastGrade) drawGrade(g, L, lastGrade.gr, (performance.now() - lastGrade.at) / 1000, lastGrade.gold);
    if (state === 'play' && beat >= 4 && beat < list[0].beat) {
      const k = Math.floor(beat) - 4, f = beat % 1;
      drawCount(g, L, ['3', '2', '1', 'Dance'][k] || '', f);
    }
  }
  // ---------- flow ----------
  function card(html) { over.innerHTML = html ? `<div class="dance-card-box">${html}</div>` : ''; over.classList.toggle('show', !!html); }
  function readyCard() {
    state = 'ready';
    const motion = mode === 'motion';
    card(`<h3>${esc(song.title)}</h3><p class="sub">${esc(song.artist)} · ${LEVEL_NAMES[song.level]} · coach ${esc(song.coach)}</p>
      <p>${motion ? `Hold the phone firmly in your <b>${flip ? 'left' : 'right'} hand</b> and copy the coach's glowing hand. Give yourself room to move.` : 'Tap, hold or swipe the way each card shows, as it reaches the ring.'}</p>
      <button class="btn dance-btn" data-go="start">Start</button>
      <button class="btn ghost" data-go="switch">${motion ? 'Tap along instead' : 'Use phone in hand instead'}</button>`);
  }
  async function start() {
    const c = audio(); if (!c || !buf) return;
    if (mode === 'motion') { const ok = await askMotion(); if (!ok) { mode = 'tap'; toast('Motion was not allowed, so this song is Tap along'); } }
    if (!alive) return;
    sensor = makeSensor(); sawMotion = false; next = 0; pts = 0; grades = {}; lastGrade = null; tapDown = null;
    srcNode?.stop?.(); srcNode = c.createBufferSource(); srcNode.buffer = buf; srcNode.connect(c.destination);
    startAt = c.currentTime + 0.25; srcNode.start(startAt);
    state = 'play'; card('');
    native.keepAwake(true);
  }
  function stopAudio() { try { srcNode?.stop(); } catch { /* already stopped */ } srcNode = null; }
  function pause() {
    if (state !== 'play') return;
    state = 'paused'; actx?.suspend(); native.keepAwake(false);
    card(`<h3>Paused</h3><button class="btn dance-btn" data-go="resume">Resume</button><button class="btn ghost" data-go="restart">Start again</button><button class="btn ghost" data-go="quit">Back to songs</button>`);
  }
  function resume() { if (state !== 'paused') return; actx?.resume(); state = 'play'; card(''); native.keepAwake(true); }
  function finish() {
    if (state !== 'play') return;
    state = 'done'; native.keepAwake(false); stopAudio();
    const s = score(), st = starsFor(s), prev = d.best[id] || 0, isBest = s > prev;
    if (isBest) d.best[id] = s;
    d.played[id] = (d.played[id] || 0) + 1;
    save(true);
    if (st >= 3 || isBest) { snd.cheer(); confetti(); buzz([30, 50, 30]); } else sfx.tap();
    card(`${isBest && s > 0 ? '<div class="badge">New best</div>' : ''}
      <div class="dance-stars">${[0, 1, 2, 3, 4].map((i) => `<span class="${i < st ? 'on' : ''}">★</span>`).join('')}</div>
      <div class="big">${s.toLocaleString('en-AU')}</div>
      <div class="dance-grades">${GRADES.map((gr) => `<span style="--c:${gr.col}"><b>${grades[gr.id] || 0}</b>${gr.name}</span>`).join('')}</div>
      <p class="sub">${isBest || !prev ? (prev ? `Previous best ${prev.toLocaleString('en-AU')}` : 'First score for this song') : `Best ${prev.toLocaleString('en-AU')}`}</p>
      <button class="btn dance-btn" data-go="restart">Dance again</button><button class="btn ghost" data-go="quit">Back to songs</button>`);
  }

  over.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]')?.dataset.go; if (!go) return;
    if (go === 'start') start();
    else if (go === 'switch') { mode = mode === 'motion' ? 'tap' : 'motion'; d.mode = mode; save(); readyCard(); }
    else if (go === 'resume') resume();
    else if (go === 'restart') { if (state === 'paused') actx?.resume(); stopAudio(); start(); }
    else if (go === 'quit') app.back();
  });
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'pause') { if (state === 'play') pause(); else if (state === 'paused') resume(); }
  });
  const onVis = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('devicemotion', onMotion);
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp);
  const ro = new ResizeObserver(() => resize());

  (async () => {
    resize(); ro.observe(stage);
    raf = requestAnimationFrame(frame);
    card('<p class="sub">Loading the song</p>');
    try { await Promise.all([loadDance(), loadSong(song).then((b) => { buf = b; })]); } catch { if (alive) card('<h3>The song would not load</h3><button class="btn ghost" data-go="quit">Back to songs</button>'); return; }
    if (alive) readyCard();
  })();
  return {
    root,
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); stopAudio(); native.keepAwake(false);
      if (actx && actx.state === 'suspended') actx.resume();
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp);
    },
    onHide() { pause(); },
  };
}

