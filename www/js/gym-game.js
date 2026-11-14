// Tumble Coach: step-by-step gymnastics and freestyle skills with an animated coach figure.
// Each skill plays as a loop or freezes on any step; progress is ticked off by the gymnast.
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, $$, esc, sheet, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { full, mix, place, figureSvg, propsSvg, bounds, stillSvg } from './gym/figure.js';
import { GROUPS, LEVELS, SKILLS, skillById } from './gym/skills.js';

const G = () => store.gym;
const statusOf = (id) => G().status[id] || 0; // 0 new, 1 learning, 2 can do it
const framesOf = (s) => s.frames.map((f) => ({ ...full({ view: s.view, ...f }), d: f.d || 0, p: f.p || 0 }));
// The pose a skill is shown with on its button: the step marked key, or the most interesting middle step.
const keyFrame = (s) => s.frames[s.key ?? s.steps[Math.min(s.steps.length - 1, Math.floor(s.steps.length / 2))].f];
const badge = (s) => `<span class="gym-lvl l${s.level}">${LEVELS[s.level]}</span>${s.coach ? '<span class="gym-coach">With a coach</span>' : ''}`;

export function gymCardArt() {
  return `<div class="art-gym">${stillSvg({ t: 180, a: 0, h: -10, l1: 150, l2: 215 }, { cls: 'gym-card-svg' })}</div>`;
}
export const gymProgress = () => {
  const n = SKILLS.filter((s) => statusOf(s.id) === 2).length;
  return n ? `${n} of ${SKILLS.length} skills learnt` : `${SKILLS.length} skills to learn`;
};

export function gymSafety() {
  sheet(`<h2>Safety first</h2><div class="help-body">
    <p><b>Warm up every time.</b> Five minutes of jogging, star jumps, arm circles and gentle stretches gets muscles ready.</p>
    <p><b>Use soft ground and space.</b> Mats, grass or thick carpet, with nothing hard nearby. Clear the space before you start.</p>
    <p><b>Have a grown-up watching</b> when you practise anything upside down, and ask your coach before trying skills marked With a coach.</p>
    <p><b>Build up one step at a time.</b> Each skill lists what to learn first. Master those, then try the next thing.</p>
    <p><b>Protect your head and neck.</b> In rolls, the back of your head and shoulders touch the mat, never the top of your head.</p>
    <p><b>Stop if it hurts.</b> Stretches should feel like a pull, not pain. Rest and tell a grown-up about any pain that does not go away.</p>
    <p>This app helps you remember the steps and shapes. It does not replace a coach.</p>
  </div><button class="btn gym-btn" data-x>Got it</button>`, { onMount: (n, close) => { $('[data-x]', n).onclick = close; } });
}

// ---------- Skill list ----------
export function gymScreen(app) {
  const root = el(`<section class="screen gym-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">Tumble Coach</div>
      <button class="icon-btn" data-act="safety" aria-label="Safety">${icon.info}</button></header>
    <div class="scroll"></div></section>`);
  const body = $('.scroll', root);
  function render() {
    const done = SKILLS.filter((s) => statusOf(s.id) === 2).length, learning = SKILLS.filter((s) => statusOf(s.id) === 1).length;
    body.innerHTML = `<div class="gym-intro card"><div class="gym-intro-txt"><b>${done} of ${SKILLS.length} skills learnt</b>${learning ? `<small>${learning} you are working on</small>` : '<small>Pick a skill to see it step by step</small>'}</div>
        <div class="gym-meter"><i style="width:${(done / SKILLS.length) * 100}%"></i></div>
        <button class="btn secondary small" data-act="safety">Safety first</button></div>
      ${GROUPS.map((g) => `<div class="section-title">${g.name}</div><p class="gym-blurb">${g.blurb}</p><div class="gym-grid">${SKILLS.filter((s) => s.group === g.id).map((s) => `
        <button class="gym-tile st${statusOf(s.id)}" data-skill="${s.id}">
          ${stillSvg({ view: s.view, ...keyFrame(s) }, { props: s.props, cls: 'gym-thumb' })}
          <span class="gym-tile-name">${esc(s.name)}</span><span class="gym-tile-tags">${badge(s)}</span>
          ${statusOf(s.id) ? `<span class="gym-tick" title="${statusOf(s.id) === 2 ? 'Learnt' : 'Learning'}">${statusOf(s.id) === 2 ? icon.check : ''}</span>` : ''}
        </button>`).join('')}</div>`).join('')}`;
  }
  root.addEventListener('click', (e) => {
    const sk = e.target.closest('[data-skill]');
    if (sk) { sfx.tap(); app.go('gymskill', { id: sk.dataset.skill }); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'safety') gymSafety();
  });
  render();
  if (!G().seenHelp) { G().seenHelp = true; save(); setTimeout(gymSafety, 300); }
  return { root, refresh: render, onShow: render };
}

// ---------- One skill ----------
export function gymSkillScreen(app, { id }) {
  const s = skillById(id), F = framesOf(s), g = G();
  const root = el(`<section class="screen gym-theme">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button><div class="title">${esc(s.name)}</div>
      <button class="icon-btn" data-act="safety" aria-label="Safety">${icon.info}</button></header>
    <div class="scroll gym-skill">
      <div class="gym-stage card"><svg class="gym-svg gym-main" data-el="stage" aria-label="${esc(s.name)} animation"></svg>
        <div class="gym-tags">${badge(s)}</div></div>
      <div class="gym-controls">
        <button class="icon-btn" data-act="prev" aria-label="Previous step">${icon.chevL}</button>
        <button class="btn gym-btn gym-play" data-act="play"></button>
        <button class="icon-btn" data-act="next" aria-label="Next step">${icon.chevR}</button>
      </div>
      <div class="gym-opts"><div class="seg" data-el="speed"><button data-v="1">Normal</button><button data-v="0.5">Slow</button><button data-v="0.25">Very slow</button></div>
        <button class="chip" data-act="mirror">Other side</button></div>
      <div class="gym-step card" data-el="step"></div>
      <div class="gym-strip" data-el="strip">${s.steps.map((st, i) => `<button class="gym-strip-i" data-step="${i}"><span>${i + 1}</span>${stillSvg(F[st.f], { props: s.props })}</button>`).join('')}</div>
      ${s.hold ? `<button class="btn secondary gym-holdbtn" data-act="hold">Hold timer · ${s.hold} seconds</button>` : ''}
      ${s.coach ? `<div class="gym-warn card"><b>Learn with a coach.</b> ${esc(s.safety)}</div>` : ''}
      ${s.ready ? `<div class="section-title">Learn these first</div><div class="gym-ready">${s.ready.map((r) => { const rs = skillById(r); return `<button class="gym-chip st${statusOf(r)}" data-skill="${r}">${statusOf(r) === 2 ? icon.check : ''}${esc(rs.name)}</button>`; }).join('')}</div>` : ''}
      <div class="section-title">Coach says</div>
      <div class="card gym-list"><ul>${s.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
      <div class="section-title">Watch out for</div>
      <div class="card gym-list"><ul>${s.mistakes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
      ${s.coach ? '' : `<div class="section-title">Stay safe</div><div class="card gym-list"><p>${esc(s.safety)}</p></div>`}
      ${s.pic ? `<div class="section-title">The whole skill</div><figure class="card gym-pic"><img src="${s.pic.src}" alt="${esc(s.pic.alt)}" loading="lazy"><figcaption>${esc(s.pic.alt)}. Picture by Kingfiser, Wikimedia Commons, CC BY-SA 4.0.</figcaption></figure>` : ''}
      <div class="section-title">How is it going?</div>
      <div class="gym-status" data-el="status"></div>
    </div></section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const stage = q('stage');

  // A fixed camera that fits the whole skill, including the in-between poses.
  const samples = [];
  F.forEach((f, i) => { samples.push(place(f, s.props)); if (i) for (const u of [0.25, 0.5, 0.75]) samples.push(place(mix(F[i - 1], f, u), s.props)); });
  const b = bounds(samples, s.props, 12);
  const minW = 150, minH = 110;
  if (b.w < minW) { b.x -= (minW - b.w) / 2; b.w = minW; }
  if (b.h < minH) { b.y -= minH - b.h; b.h = minH; }
  stage.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);

  let cur = F[s.steps[0].f], anim = null, playing = false, step = 0, raf = 0, frameAt = 0;
  const speed = () => g.speed || 1;
  function draw(hl = []) {
    const flip = g.mirror ? ` transform="translate(${2 * b.x + b.w},0) scale(-1,1)"` : '';
    stage.innerHTML = `<g${flip}><rect class="gf-ground" x="${b.x - 400}" y="0" width="${b.w + 800}" height="${b.y + b.h + 40}"/>${propsSvg(s.props)}${figureSvg(place(cur, s.props), { hl })}</g>`;
  }
  function tween(to, dur, done) { anim = { from: cur, to, t0: performance.now(), dur: Math.max(1, dur / speed()), done }; }
  function tick(now) {
    if (anim) {
      const u = (now - anim.t0) / anim.dur;
      cur = mix(anim.from, anim.to, Math.min(1, u));
      draw(playing ? [] : (s.steps[step].hl || []));
      if (u >= 1) { const d = anim.done; anim = null; d && d(); }
    }
    raf = requestAnimationFrame(tick);
  }
  // Playing walks through every keyframe, pausing where a keyframe asks to, then loops.
  function playFrom(i) {
    if (!playing) return;
    if (i >= F.length) { tween(cur, 900, () => { if (playing) { cur = F[0]; playFrom(1); } }); return; }
    frameAt = i;
    tween(F[i], F[i].d || 400, () => {
      const si = s.steps.findLastIndex((st) => st.f <= i);
      if (si >= 0 && si !== step) { step = si; renderStep(); }
      tween(F[i], 120 + F[i].p, () => playFrom(i + 1));
    });
  }
  function setPlaying(on) {
    playing = on;
    q('step').classList.toggle('playing', on);
    $('[data-act="play"]', root).innerHTML = on ? `${icon.pause}<span>Pause</span>` : `${icon.play}<span>Play</span>`;
    if (on) { cur = F[0]; step = 0; renderStep(); playFrom(1); }
    else { anim = null; goStep(step); }
  }
  function goStep(i) {
    step = Math.max(0, Math.min(s.steps.length - 1, i));
    renderStep();
    tween(F[s.steps[step].f], 550, () => draw(s.steps[step].hl || []));
  }
  function renderStep() {
    const st = s.steps[step];
    q('step').innerHTML = `<div class="gym-step-n">Step ${step + 1} of ${s.steps.length}</div><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p>`;
    $$('.gym-strip-i', root).forEach((n, k) => n.classList.toggle('on', k === step));
    $(`.gym-strip-i[data-step="${step}"]`, root)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
  function renderStatus() {
    const v = statusOf(id);
    q('status').innerHTML = `<div class="seg gym-seg">${[['0', 'Not yet'], ['1', 'Learning'], ['2', 'I can do it']].map(([k, l]) => `<button data-status="${k}" class="${String(v) === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  function renderOpts() {
    $$('[data-el="speed"] button', root).forEach((n) => n.classList.toggle('on', Number(n.dataset.v) === speed()));
    $('[data-act="mirror"]', root).classList.toggle('active', !!g.mirror);
  }

  root.addEventListener('click', (e) => {
    const st = e.target.closest('[data-step]');
    if (st) { setPlayingQuiet(false); goStep(+st.dataset.step); sfx.tap(); return; }
    const sk = e.target.closest('[data-skill]');
    if (sk) { app.go('gymskill', { id: sk.dataset.skill }); return; }
    const sp = e.target.closest('[data-el="speed"] button');
    if (sp) { g.speed = Number(sp.dataset.v); save(); renderOpts(); return; }
    const ss = e.target.closest('[data-status]');
    if (ss) {
      const v = +ss.dataset.status, was = statusOf(id);
      if (v) g.status[id] = v; else delete g.status[id];
      save(); renderStatus();
      if (v === 2 && was !== 2) { sfx.win(); confetti(1800); } else sfx.tap();
      return;
    }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'safety') gymSafety();
    else if (a === 'play') setPlaying(!playing);
    else if (a === 'prev') { setPlayingQuiet(false); goStep(step - 1); }
    else if (a === 'next') { setPlayingQuiet(false); goStep(step + 1); }
    else if (a === 'mirror') { g.mirror = !g.mirror; save(); renderOpts(); draw(playing ? [] : (s.steps[step].hl || [])); }
    else if (a === 'hold') holdTimer(s);
  });
  // stop playback without jumping back to the current step (the caller picks the step)
  function setPlayingQuiet(on) { if (playing === on) return; playing = on; anim = null; q('step').classList.toggle('playing', on); $('[data-act="play"]', root).innerHTML = `${icon.play}<span>Play</span>`; }

  renderOpts(); renderStatus(); renderStep(); draw(s.steps[0].hl || []);
  $('[data-act="play"]', root).innerHTML = `${icon.play}<span>Play</span>`;
  raf = requestAnimationFrame(tick);
  setTimeout(() => { if (root.isConnected) setPlaying(true); }, 400);
  return {
    root,
    onHide() { setPlayingQuiet(false); },
    destroy() { cancelAnimationFrame(raf); playing = false; },
  };
}

// Counts down a hold (dish, handstand against a wall and so on), with a 3 second get-ready.
function holdTimer(s) {
  let timer = 0;
  sheet(`<h2>${esc(s.name)} hold</h2><div class="gym-hold"><div class="gym-hold-n" data-n>${s.hold}</div><div class="gym-hold-msg" data-m>Get into your ${esc(s.name.toLowerCase().replace(/ \(.*\)/, ''))} shape, then press Start.</div></div>
    <button class="btn gym-btn" data-go>Start</button>`, {
    onMount(n) {
      const N = $('[data-n]', n), M = $('[data-m]', n), go = $('[data-go]', n);
      go.onclick = () => {
        clearInterval(timer);
        let left = 3; N.textContent = left; M.textContent = 'Get ready'; N.classList.add('ready'); go.textContent = 'Restart';
        timer = setInterval(() => {
          left--;
          if (N.classList.contains('ready') && left <= 0) { N.classList.remove('ready'); left = s.hold; M.textContent = 'Hold it. Squeeze tight.'; sfx.place(); buzz(30); }
          else if (!N.classList.contains('ready') && left <= 0) { clearInterval(timer); N.textContent = '0'; M.textContent = 'Great hold!'; sfx.win(); go.textContent = 'Again'; return; }
          else if (!N.classList.contains('ready') && left <= 3) sfx.tap();
          N.textContent = left;
        }, 1000);
      };
    },
    onClose() { clearInterval(timer); },
  });
}
