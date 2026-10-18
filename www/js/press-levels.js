// Pressure Point levels: 60 hand-made rules, then endless ones made up on the spot. No DOM access here.

export const FIXED = 60; // hand-made levels; after these, levels are made up on the spot

// ---------- Pictures ----------
const CAT = (k) => `img/art/cats/cat${String(k).padStart(2, '0')}.svg`;
const KEN = (n) => `img/kenney/animals/${n}.png`;
const SKY = (n) => `img/kenney/scenery/${n}.png`;
const THING = (n) => `img/art/things/${n}.svg`;
const SPIDER = 'img/art/ui/spider.svg';
const BIRDS = ['owl', 'duck', 'parrot', 'penguin', 'chick', 'chicken'];
const BEASTS = ['dog', 'pig', 'cow', 'bear', 'frog', 'rabbit', 'monkey', 'panda', 'horse', 'goat', 'hippo', 'elephant', 'giraffe', 'zebra'];
const THINGS = { apple: 'apple', banana: 'banana', carrot: 'carrot', cupcake: 'cupcake', mushroom: 'mushroom', snail: 'snail', ladybird: 'ladybird',
  star: 'star', pumpkin: 'pumpkin', sunflower: 'sunflower', bee: 'bee', crab: 'crab', turtle: 'turtle', rocket: 'rocket' };

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cats = (n) => shuffle([...Array(14)].map((_, i) => i + 1)).slice(0, n).map(CAT);
const pics = (srcs) => `<div class="pr-pics ${srcs.length > 5 ? 'many' : ''}">${srcs.map((s) => `<img src="${s}" alt="">`).join('')}</div>`;
const big = (v) => `<div class="pr-big">${v}</div>`;
const one = (src) => `<div class="pr-pics solo"><img src="${src}" alt=""></div>`;
function clock(h) {
  const a = (h % 12) * 30 * Math.PI / 180;
  const ticks = [...Array(12)].map((_, k) => { const t = k * 30 * Math.PI / 180; return `<line x1="${(Math.sin(t) * 34).toFixed(1)}" y1="${(-Math.cos(t) * 34).toFixed(1)}" x2="${(Math.sin(t) * 40).toFixed(1)}" y2="${(-Math.cos(t) * 40).toFixed(1)}"/>`; }).join('');
  return `<svg class="pr-clock" viewBox="-50 -50 100 100"><circle r="46" class="cf"/><g class="ct">${ticks}</g>
    <line x1="0" y1="0" x2="0" y2="-34" class="cm"/><line x1="0" y1="0" x2="${(Math.sin(a) * 23).toFixed(1)}" y2="${(-Math.cos(a) * 23).toFixed(1)}" class="ch"/><circle r="4" class="cc"/></svg>`;
}
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 'es'}`;

// ---------- Level kinds ----------
// A level is {text, time?, art?, face?, init(a)?, tap(a), up(a)?, bg(a)?, end(a), why?}.
// tap/up/bg/end return 'win', 'fail' or nothing. `a` is the live level state (see startLevel).
function press(need, text, o = {}) {
  return { ...o, text, need,
    tap: (a) => (a.need === 0 ? 'fail' : a.n >= a.need ? 'win' : undefined),
    end: (a) => (a.need === 0 ? 'win' : 'fail') };
}
// Press only once something has happened; init calls a.go() when it does.
function when(text, init, o = {}) {
  return { time: 7, ...o, text, init, tap: (a) => (a.flag.go ? 'win' : 'fail'), end: () => 'fail' };
}
// Press while something is showing; init sets a.flag.go true and false again.
const whileShown = when;
function holdRelease(text, init, o = {}) {
  return { time: 7, ...o, text, init, hold: true, tap: () => undefined, up: (a) => (a.flag.go ? 'win' : 'fail'), end: () => 'fail',
    why: o.why || 'You had to keep holding and let go at the right moment.' };
}
function holdToEnd(text, o = {}) {
  return { time: 4.5, ...o, text, hold: true, tap: () => undefined, up: () => 'fail', end: (a) => (a.holding ? 'win' : 'fail'),
    why: 'You had to keep holding the button until the ring ran out.' };
}
function after(f, text, o = {}) {
  return { time: 5, ...o, text, tap: (a) => (a.frac >= f ? 'win' : 'fail'), end: () => 'fail',
    why: o.why || `You had to wait until ${f === 0.5 ? 'half' : 'three quarters'} of the ring was gone, then press.` };
}
function elsewhere(k, text, o = {}) {
  return { time: 4 + k * 0.6, ...o, text, tap: () => 'fail', bg: (a) => (a.bgN >= k ? 'win' : undefined), end: () => 'fail',
    why: `The button was off limits. You had to tap the space around it${k > 1 ? ` ${k} times` : ''}.` };
}
// Face text cycles through "not yet" words, then settles on NOW.
function nowLevel(o = {}) {
  const words = ['WAIT', 'NOT YET', 'NO', 'NOPE', 'HOLD ON', 'NOT NOW', 'SOON', 'NO!'];
  return when('Press only when the button says NOW', (a) => {
    const at = rnd(3, 6); let k = 0, prev = '';
    a.every(620, () => {
      k++;
      if (k >= at) { a.setText('NOW'); a.go(); return false; }
      let w; do w = pick(words); while (w === prev); prev = w; a.setText(w);
    });
  }, { time: 7.5, why: 'You had to wait for the button to say NOW.' });
}
function greenLevel(decoy = false) {
  return when(decoy ? 'Press when the button turns green. Not yellow.' : 'Press when the button turns green', (a) => {
    const t = rnd(1200, 3200);
    if (decoy) a.after(t * 0.55, () => a.setFace('yellow'));
    a.after(t, () => { a.setFace('green'); a.go(); });
  }, { time: decoy ? 7 : 6, why: decoy ? 'Yellow was a trap. You had to wait for green.' : 'You had to wait for the button to turn green.' });
}
function redRelease() {
  return holdRelease('Hold the button down. Let go when it turns red.', (a) => {
    a.after(rnd(1800, 3800), () => { a.setFace('red'); a.go(); });
  }, { time: 7 });
}
function numberIs(target) {
  return when(`Press when the number is ${target}`, (a) => {
    const at = rnd(3, 6); let k = 0, prev = 0;
    const show = () => {
      if (k === at || k === at + 1) { a.setArt(big(target)); a.flag.go = true; prev = target; return; }
      let v; do v = rnd(1, 9); while (v === target || v === prev); prev = v;
      a.flag.go = false; a.setArt(big(v));
    };
    show();
    a.every(650, () => { k++; show(); });
  }, { time: 7.5, why: `You had to press while the number showed ${target}.` });
}
function spiderAppears() {
  return whileShown('Press when the spider appears', (a) => {
    const at = rnd(2, 5); let k = 0, prev = '';
    const show = () => {
      if (k === at || k === at + 1) { a.setArt(one(SPIDER)); a.flag.go = true; return; }
      let b; do b = pick([...BEASTS, ...BIRDS]); while (b === prev); prev = b;
      a.flag.go = false; a.setArt(one(KEN(b)));
    };
    show();
    a.every(720, () => { k++; show(); });
  }, { time: 7.5, why: 'You had to press while the spider was showing.' });
}
function spiderLeaves() {
  return holdRelease('Hold the button down. Let go when the spider leaves.', (a) => {
    a.setArt(one(SPIDER));
    a.after(rnd(2000, 4000), () => { a.setArt(''); a.go(); });
  }, { time: 7 });
}
function remember(key, lo, hi) {
  return press(1, 'Remember this number. Press once to carry on.', {
    init: (a) => { a.mem[key] = rnd(lo, hi); a.setArt(big(a.mem[key])); }, time: 4.5,
  });
}
const animals = (list) => pics(list.map((x) => (x === 'spider' ? SPIDER : x.startsWith('cat') ? CAT(+x.slice(3)) : KEN(x))));

// ---------- The 60 hand-made levels (memory and lies stay inside their block of 10) ----------
const LEVELS = [
  // 1 to 10
  () => press(1, 'Press'),
  () => press(0, "Don't press"),
  () => press(3, 'Press 3 times'),
  () => greenLevel(),
  () => press(3, 'Press once for each cat', { art: pics(cats(3)) }),
  () => press(0, 'Press if you see a spider', { art: animals(['dog', 'pig', 'cow']), why: 'There was no spider, so this one wanted no presses.' }),
  () => remember('a', 2, 5),
  () => press(8, 'Press once for each word in this sentence', { why: 'There are 8 words in "Press once for each word in this sentence".' }),
  () => after(0.5, 'Press after half the time has gone'),
  () => press((a) => a.mem.a ?? 3, 'Press as many times as the number you remembered'),
  // 11 to 20
  () => press(4, 'Press once for each corner of a square'),
  () => redRelease(),
  () => press(0, 'Press if 7 is an even number', { why: '7 is odd, so no presses.' }),
  () => press(3, 'Press once for each bird', { art: animals(shuffle(['owl', 'pig', 'duck', 'dog', 'parrot'])), why: 'The owl, the duck and the parrot are birds. That makes 3.' }),
  () => press(1, "Don't not press", { why: "Don't not press means press." }),
  () => elsewhere(1, "Don't press the button. Tap anywhere else."),
  () => remember('b', 3, 6),
  () => press(3, 'Press 10 − 7 times'),
  () => nowLevel(),
  () => press((a) => (a.mem.b ?? 4) + 1, 'Press the number you just remembered, plus one'),
  // 21 to 30
  () => press(3, 'Press once for each side of a triangle'),
  () => press(1, 'The next instruction is a lie. Press once to carry on.'),
  () => press(1, "Don't press", { why: "Level 22 said this instruction was a lie, so \"Don't press\" really meant press." }),
  () => press(1, 'Press once if there is an even number of cats', { art: pics(cats(4)), why: 'There were 4 cats. 4 is even, so one press.' }),
  () => press(0, 'Press once if there is an even number of cats', { art: pics(cats(5)), why: 'There were 5 cats. 5 is odd, so no presses.' }),
  () => holdToEnd('Hold the button down until the time runs out'),
  () => press(2, 'Press once for each wheel on a bicycle', { art: one(THING('bicycle')) }),
  () => press(4, 'Press as many times as the hour on this clock', { art: clock(4), why: 'The clock showed 4 o\'clock.' }),
  () => spiderAppears(),
  () => press(5, 'Press once for each letter in PRESS'),
  // 31 to 40
  () => press(0, 'Press once for each corner of a circle', { why: 'A circle has no corners.' }),
  () => press(1, 'Press if you see a spider', { art: animals(shuffle(['frog', 'spider', 'rabbit'])) }),
  () => press(2, 'Press once for each animal that is not a cat', { art: animals(shuffle(['cat3', 'dog', 'cat7', 'pig', 'cat11'])), why: 'There were a dog and a pig. That makes 2.' }),
  () => remember('c', 2, 4),
  () => after(0.75, 'Press after three quarters of the time has gone'),
  () => press(2, 'Press once for each day of the weekend'),
  () => spiderLeaves(),
  () => press(1, 'Press if this is level 38'),
  () => press(0, 'Press if this is level 40', { why: 'This was level 39.' }),
  () => press((a) => (a.mem.c ?? 3) * 2, 'Press double the number you remembered'),
  // 41 to 50
  () => press(3, 'Press once for each month that starts with J', { why: 'January, June and July. That makes 3.' }),
  () => numberIs(5),
  () => press(2, 'Press once for each sun', { art: pics(shuffle([SKY('sun'), SKY('moon'), SKY('sun'), SKY('cloud1')])) }),
  () => press(6, 'Press 2 + 2 × 2 times', { why: 'Multiply first: 2 × 2 = 4, then 2 + 4 = 6.' }),
  () => press(12, 'Quick! Press 12 times', { time: 5.5 }),
  () => press(0, 'Press if the button is blue', { face: 'green', why: 'The button was green, not blue.' }),
  () => press(1, 'Press if the button is blue', { face: 'blue' }),
  () => elsewhere(3, 'Tap anywhere except the button, 3 times'),
  () => press(1, 'The next instruction is true. Press once to carry on.'),
  () => press(0, "Don't press", { why: 'Level 49 said this instruction was true. So no presses.' }),
  // 51 to 60
  () => press(8, 'Press once for each leg on a spider', { art: one(SPIDER), why: 'Spiders have 8 legs.' }),
  () => press(2, 'Press once for each cat. Ignore the dogs.', { art: animals(shuffle(['cat2', 'dog', 'cat9', 'dog'])) }),
  () => greenLevel(true),
  () => press(1, 'Remember both numbers. Press once to carry on.', { time: 5,
    init: (a) => { a.mem.d = rnd(2, 4); do a.mem.e = rnd(3, 6); while (a.mem.e === a.mem.d); a.setArt(big(`${a.mem.d} <small>and</small> ${a.mem.e}`)); } }),
  () => press(5, 'Press once for each letter in the name of this animal', { art: one(THING('koala')), why: 'K-O-A-L-A has 5 letters.' }),
  () => press((a) => Math.max(a.mem.d ?? 3, a.mem.e ?? 5), 'Press the bigger number you remembered'),
  () => ({ time: 6.5, text: 'Hold the button for about 2 seconds, then let go', hold: true, tap: () => undefined,
    up: (a) => (a.held >= 1.4 && a.held <= 3 ? 'win' : 'fail'), end: () => 'fail', why: 'You had to hold for about 2 seconds (between 1.5 and 3).' }),
  () => press(1, 'Press if there is no spider here', { art: animals(shuffle(['dog', 'pig', 'frog'])) }),
  () => press((a) => Math.min(a.mem.d ?? 3, a.mem.e ?? 5), 'Press the smaller number you remembered'),
  () => press(5, 'Press once for each point on the star', { art: one(THING('star')) }),
];

// ---------- Endless levels after 60 ----------
const SENTENCES = ['Cats like naps', 'Keep calm and press on', 'The quick brown fox jumps', 'Read every word', 'Slow and steady wins', 'Tea is nice'];
const WORDS = ['CAT', 'KOALA', 'BUTTON', 'PRESS', 'TIMER', 'APPLE', 'SPIDER', 'GO', 'CALM', 'PUZZLE'];
const MAKERS = [
  (i) => { // count one kind of thing among others
    const keys = shuffle(Object.keys(THINGS)), want = keys[0], n = rnd(1, 5), others = keys.slice(1, 1 + rnd(1, 3));
    const list = shuffle([...Array(n).fill(want), ...others.flatMap((k) => Array(rnd(1, 2)).fill(k))]).slice(0, 8);
    const count = list.filter((k) => k === want).length;
    return press(count, `Press once for each ${THINGS[want]}`, { art: pics(list.map(THING)) });
  },
  () => { const n = rnd(1, 5), d = rnd(1, 3); const list = shuffle([...cats(n), ...Array(d).fill(0).map(() => KEN(pick(BEASTS)))]); return press(n, 'Press once for each cat', { art: pics(list) }); },
  () => { const x = rnd(1, 5), y = rnd(1, 4); return press(x + y, `Press ${x} + ${y} times`); },
  () => { const x = rnd(2, 3), y = rnd(2, 3); return press(x * y, `Press ${x} × ${y} times`); },
  () => { const x = rnd(6, 12), y = rnd(x - 6, x - 1); return press(x - y, `Press ${x} − ${y} times`); },
  () => pick([press(0, "Don't press"), press(0, 'Press 0 times'), press(0, 'Press once for each corner of a circle', { why: 'A circle has no corners.' }),
    press(0, `Press if ${pick([3, 5, 7, 9, 11, 13])} is an even number`, { why: 'That number is odd, so no presses.' })]),
  () => press(0, 'Press if you see a spider', { art: animals(shuffle(BEASTS).slice(0, 3)), why: 'There was no spider, so no presses.' }),
  () => press(1, 'Press if you see a spider', { art: animals(shuffle([...shuffle(BEASTS).slice(0, 3), 'spider'])) }),
  (i) => (Math.random() < 0.5 ? press(1, `Press if this is level ${i + 1}`) : press(0, `Press if this is level ${i + pick([0, 2, 3])}`, { why: `This was level ${i + 1}.` })),
  () => greenLevel(Math.random() < 0.5),
  () => nowLevel(),
  () => numberIs(rnd(1, 9)),
  () => spiderAppears(),
  () => redRelease(),
  () => spiderLeaves(),
  () => holdToEnd('Hold the button down until the time runs out'),
  () => (Math.random() < 0.5 ? after(0.5, 'Press after half the time has gone') : after(0.75, 'Press after three quarters of the time has gone')),
  () => { const k = rnd(1, 3); return elsewhere(k, k === 1 ? "Don't press the button. Tap anywhere else." : `Tap anywhere except the button, ${k} times`); },
  () => { const n = rnd(2, 6); return press(n % 2 ? 0 : 1, 'Press once if there is an even number of cats', { art: pics(cats(n)), why: `There were ${n} cats, so ${n % 2 ? 'no presses' : 'one press'}.` }); },
  () => { const h = rnd(1, 8); return press(h, 'Press as many times as the hour on this clock', { art: clock(h), why: `The clock showed ${h} o'clock.` }); },
  () => { const w = pick(WORDS); return press(w.length, `Press once for each letter in ${w}`); },
  () => { const s = pick(SENTENCES), n = s.split(' ').length; return press(n, 'Press once for each word below', { art: `<div class="pr-words">${s}</div>`, why: `"${s}" has ${n} words.` }); },
  () => { const n = rnd(1, 4); return press(n + 1, `Press one more time than ${n}`); },
  () => press(1, "Don't not press", { why: "Don't not press means press." }),
];
let lastMaker = -1;
export const resetLevels = () => { lastMaker = -1; };
export function makeLevel(i) {
  if (i < FIXED) return LEVELS[i]();
  let m; do m = rnd(0, MAKERS.length - 1); while (m === lastMaker);
  lastMaker = m;
  return MAKERS[m](i);
}

// Seconds on the clock: time to read the rule, plus time to press. Endless levels speed up a little every 10.
export function levelTime(spec, text, need, idx) {
  let time = spec.time ?? (1.5 + text.split(/\s+/).length * 0.17 + (need ? 0.9 + need * 0.45 : 1.6));
  if (idx >= FIXED) time *= Math.max(0.7, 1 - Math.floor((idx - FIXED) / 10) * 0.04);
  return time;
}

