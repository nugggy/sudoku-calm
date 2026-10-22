// Pressure Point levels. No DOM access here.
//
// Every block of 10 levels (one checkpoint) is planned fresh each time it starts, from a large set of task kinds
// in three tiers, so trying a block again brings different tasks. Kinds the player has seen lately are kept back.
// Memory tasks (remember now, use it a few levels later) and "the next instruction is a lie" are planned as pairs
// inside a block, so the second half always has its first.

export const FIXED = 60; // from here on the clock gets a little shorter every 10 levels

// ---------- Pictures ----------
const CAT = (k) => `img/art/cats/cat${String(k).padStart(2, '0')}.svg`;
const KEN = (n) => `img/kenney/animals/${n}.png`;
const SKY = (n) => `img/kenney/scenery/${n}.png`;
const THING = (n) => `img/art/things/${n}.svg`;
const SPIDER = 'img/art/ui/spider.svg';
const FLYERS = ['owl', 'duck', 'parrot'];                // birds that fly (penguins and chickens are left out on purpose)
const BIRDS = ['owl', 'duck', 'parrot', 'penguin', 'chick', 'chicken'];
const BEASTS = ['dog', 'pig', 'cow', 'bear', 'frog', 'rabbit', 'monkey', 'panda', 'horse', 'goat', 'hippo', 'elephant', 'giraffe', 'zebra'];
const THINGS = { apple: 'apple', banana: 'banana', carrot: 'carrot', cupcake: 'cupcake', mushroom: 'mushroom', snail: 'snail', ladybird: 'ladybird',
  star: 'star', pumpkin: 'pumpkin', sunflower: 'sunflower', bee: 'bee', crab: 'crab', turtle: 'turtle', rocket: 'rocket', tulip: 'tulip',
  shell: 'shell', fish: 'fish', snowflake: 'snowflake', 'beach-ball': 'beach ball', cake: 'cake', octopus: 'octopus', hedgehog: 'hedgehog' };

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cats = (n) => shuffle([...Array(14)].map((_, i) => i + 1)).slice(0, n).map(CAT);
const pics = (srcs) => `<div class="pr-pics ${srcs.length > 5 ? 'many' : ''}">${srcs.map((s) => `<img src="${s}" alt="">`).join('')}</div>`;
const big = (v) => `<div class="pr-big">${v}</div>`;
const one = (src) => `<div class="pr-pics solo"><img src="${src}" alt=""></div>`;
const words = (s) => `<div class="pr-words">${s}</div>`;
function clock(h, cls = 'pr-clock') {
  const a = (h % 12) * 30 * Math.PI / 180;
  const ticks = [...Array(12)].map((_, k) => { const t = k * 30 * Math.PI / 180; return `<line x1="${(Math.sin(t) * 34).toFixed(1)}" y1="${(-Math.cos(t) * 34).toFixed(1)}" x2="${(Math.sin(t) * 40).toFixed(1)}" y2="${(-Math.cos(t) * 40).toFixed(1)}"/>`; }).join('');
  return `<svg class="${cls}" viewBox="-50 -50 100 100"><circle r="46" class="cf"/><g class="ct">${ticks}</g>
    <line x1="0" y1="0" x2="0" y2="-34" class="cm"/><line x1="0" y1="0" x2="${(Math.sin(a) * 23).toFixed(1)}" y2="${(-Math.cos(a) * 23).toFixed(1)}" class="ch"/><circle r="4" class="cc"/></svg>`;
}
// Tap targets: the game sends taps on these to spec.pick(a, t, k). t is what it is, k its position.
const tiles = (items) => `<div class="pr-tiles">${items.map(([t, html], k) => `<button class="pr-tile" data-t="${t}" data-k="${k}">${html}</button>`).join('')}</div>`;
const imgTile = (src) => `<img src="${src}" alt="">`;
const numTile = (n) => `<b>${n}</b>`;
const animalSrc = (x) => (x === 'spider' ? SPIDER : x.startsWith('cat') ? CAT(+x.slice(3)) : KEN(x));
const animals = (list) => pics(list.map(animalSrc));
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 'es'}`;
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

// ---------- Level shapes ----------
// A level is {text, time?, art?, face?, init(a)?, tap(a), up(a)?, bg(a)?, pick(a, t, k)?, end(a), why?}.
// tap/up/bg/pick/end return 'win', 'fail' or nothing. `a` is the live level state (see startLevel in press-game.js).
function press(need, text, o = {}) {
  return { ...o, text, need,
    tap: (a) => (a.need === 0 ? 'fail' : a.n >= a.need ? 'win' : undefined),
    end: (a) => (a.need === 0 ? 'win' : 'fail') };
}
// Press only once something has happened; init calls a.go() when it does.
function when(text, init, o = {}) {
  return { time: 7, ...o, text, init, tap: (a) => (a.flag.go ? 'win' : 'fail'), end: () => 'fail' };
}
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
// Tap one right tile. ok(t, k) says whether a tile is the right one.
function tapOne(text, items, ok, why, o = {}) {
  return { time: 6, ...o, text, art: tiles(items), tap: () => 'fail', pick: (a, t, k) => (ok(t, k) ? 'win' : 'fail'), end: () => 'fail',
    why: why + ' The button was not part of this one.' };
}

// ---------- Timed kinds ----------
function nowLevel() {
  const ws = ['WAIT', 'NOT YET', 'NO', 'NOPE', 'HOLD ON', 'NOT NOW', 'SOON', 'NO!', 'NEARLY', 'KNOW'];
  return when('Press only when the button says NOW', (a) => {
    const at = rnd(3, 6); let k = 0, prev = '';
    a.every(620, () => {
      k++;
      if (k >= at) { a.setText('NOW'); a.go(); return false; }
      let w; do w = pick(ws); while (w === prev); prev = w; a.setText(w);
    });
  }, { time: 7.5, why: 'You had to wait for the button to say NOW. KNOW and SNOW do not count.' });
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
// Press while a test on a changing pair of numbers holds (they add up to 10, or are the same).
function pairWatch(text, good, why) {
  return when(text, (a) => {
    const at = rnd(3, 5); let k = 0;
    const show = () => {
      let x, y;
      if (k === at || k === at + 1) { do { x = rnd(1, 9); y = rnd(1, 9); } while (!good(x, y)); a.flag.go = true; }
      else { do { x = rnd(1, 9); y = rnd(1, 9); } while (good(x, y)); a.flag.go = false; }
      a.setArt(big(`${x} <small>and</small> ${y}`));
    };
    show();
    a.every(750, () => { k++; show(); });
  }, { time: 7.5, why });
}
function spiderAppears() {
  return when('Press when the spider appears', (a) => {
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
function countdown() {
  return when('Press the moment the countdown reaches 0', (a) => {
    let v = rnd(4, 6);
    a.setArt(big(v));
    a.every(650, () => {
      v--;
      a.setArt(big(v));
      if (v === 0) { a.go(); return false; }
    });
  }, { time: 6.8, why: 'You had to wait for 0. Pressing on 1 is too soon.' });
}
function letGoAt() {
  const target = rnd(5, 8);
  return holdRelease(`Hold the button down. Let go when the count reaches ${target}.`, (a) => {
    let v = 0;
    a.setArt(big(v));
    a.every(600, () => {
      v++;
      a.setArt(big(v));
      a.flag.go = v === target;
      if (v > target) return false;
    });
  }, { time: target * 0.6 + 2.6, why: `You had to let go while it showed ${target}.` });
}
// The button flashes; press on the nth flash (not before).
function nthFlash() {
  const nth = rnd(2, 4);
  return when(`Press on the ${['', '', 'second', 'third', 'fourth'][nth]} flash`, (a) => {
    let k = 0;
    const flash = () => {
      k++; a.setFace('blue');
      if (k === nth) a.go();
      a.after(260, () => { if (k !== nth) a.setFace(''); });
      if (k < nth) a.after(rnd(650, 1300), flash);
    };
    a.after(rnd(500, 1000), flash);
  }, { time: 7, why: `You had to press on flash number ${nth}.` });
}
// Count the flashes first, then press that many times (pressing during the flashes is too early).
function countFlashes() {
  const n = rnd(2, 5);
  return { time: 5.5 + n * 0.9, text: 'Count the flashes. Then press that many times.', need: n,
    init: (a) => {
      let k = 0;
      const flash = () => { k++; a.setFace('blue'); a.after(240, () => a.setFace('')); if (k < n) a.after(rnd(450, 800), flash); else a.after(400, () => a.go()); };
      a.after(500, flash);
    },
    tap: (a) => (!a.flag.go ? 'fail' : a.n >= a.need ? 'win' : undefined), end: () => 'fail',
    why: `There were ${n} flashes. Wait for them to finish, then press ${times(n)}.` };
}
// Press once on every beat. Each beat opens a short window; missing a beat or pressing between beats is out.
function rhythm() {
  const beats = rnd(3, 5), gap = pick([700, 800, 900]);
  return { time: (beats * gap) / 1000 + 2.2, text: `Press with every beat. ${beats} beats.`, need: beats,
    init: (a) => {
      let k = 0;
      // people press a touch ahead of a beat, so a press up to a quarter of a second early counts for the coming beat
      const beat = () => {
        if (a.flag.go) { a.flag.missed = true; return; } // the last beat went by without a press
        k++; a.setFace('blue');
        if (a.flag.early) a.flag.early = false; else a.flag.go = true;
        a.after(200, () => a.setFace(''));
        a.flag.nextAt = k < beats ? a.t + gap / 1000 : Infinity;
        if (k < beats) a.after(gap, beat); else a.after(gap, () => { if (a.flag.go) a.flag.missed = true; });
      };
      a.flag.nextAt = a.t + 0.9;
      a.after(900, beat);
    },
    tap: (a) => {
      if (a.flag.missed) return 'fail';
      if (a.flag.go) a.flag.go = false;
      else if (!a.flag.early && a.t >= a.flag.nextAt - 0.25) a.flag.early = true;
      else return 'fail';
      return a.n >= a.need ? 'win' : undefined;
    },
    end: () => 'fail',
    why: `You had to press once on each flash, ${beats} in a row, and not in between.` };
}
// The button slides about; press only when it is on the side asked for.
function sideLevel() {
  const side = pick(['left', 'right']);
  return when(`Press only when the button is on the ${side}`, (a) => {
    const at = rnd(3, 6); let k = 0, prev = 'centre';
    const move = () => {
      let p;
      if (k === at) p = side;
      else do p = pick(['left', 'centre', 'right'].filter((x) => x !== side)); while (p === prev);
      prev = p; a.moveBtn(p === 'left' ? -1 : p === 'right' ? 1 : 0);
      a.flag.go = p === side;
      k++;
    };
    a.every(800, move);
  }, { time: 7.5, why: `You had to wait until the button moved to the ${side}.` });
}
function stopsMoving() {
  return when('Press when the button stops moving', (a) => {
    const moves = rnd(4, 7); let k = 0, prev = 0;
    a.every(420, () => {
      k++;
      if (k > moves) { a.moveBtn(0); a.go(); return false; }
      let p; do p = pick([-1, -0.5, 0.5, 1]); while (p === prev); prev = p; a.moveBtn(p);
    });
  }, { time: 6.5, why: 'You had to wait until the button settled in the middle.' });
}
// Press a number of times, but never while the button is red.
function notWhileRed() {
  const n = rnd(3, 5);
  return { time: 6.5, text: `Press ${n} times, but never while the button is red`, need: n,
    init: (a) => {
      a.flag.go = true;
      a.every(rnd(550, 750), () => { const red = !a.flag.red; a.flag.red = red; a.flag.go = !red; a.setFace(red ? 'red' : ''); });
    },
    tap: (a) => (a.flag.red ? 'fail' : a.n >= a.need ? 'win' : undefined), end: () => 'fail',
    why: `You needed ${n} presses, all while the button was not red.` };
}
function doubleTap() {
  return { time: 7, text: 'When the button says GO, press twice quickly',
    init: (a) => { a.after(rnd(1400, 3400), () => { a.setText('GO'); a.go(); a.flag.at = a.t; }); },
    tap: (a) => {
      if (!a.flag.go) return 'fail';
      a.flag.taps = (a.flag.taps || 0) + 1;
      if (a.flag.taps === 1) { a.flag.first = a.t; return undefined; }
      return a.t - a.flag.first <= 0.6 ? 'win' : 'fail';
    },
    end: () => 'fail', why: 'You had to wait for GO, then press twice within about half a second.' };
}
function matchPair() {
  const pool = shuffle(Object.keys(THINGS)).slice(0, 4);
  return when('Press when the two pictures match', (a) => {
    const at = rnd(3, 5); let k = 0;
    const show = () => {
      let x, y;
      if (k === at || k === at + 1) { x = y = pick(pool); a.flag.go = true; }
      else { x = pick(pool); do y = pick(pool); while (y === x); a.flag.go = false; }
      a.setArt(pics([THING(x), THING(y)]));
    };
    show();
    a.every(780, () => { k++; show(); });
  }, { time: 7.5, why: 'You had to press while both pictures were the same.' });
}
function stroop() {
  // a colour word painted in a colour; press only if they agree
  const cols = { RED: '#ff5a5f', BLUE: '#4aa3ff', GREEN: '#4cd97b', YELLOW: '#ffd23f' };
  const names = Object.keys(cols), word = pick(names), match = Math.random() < 0.5;
  const ink = match ? word : pick(names.filter((n) => n !== word));
  return press(match ? 1 : 0, 'Press once if the word is written in its own colour', {
    art: `<div class="pr-big pr-ink" style="color:${cols[ink]}">${word}</div>`,
    why: match ? `${word} was written in ${word.toLowerCase()}, so one press.` : `${word} was written in ${ink.toLowerCase()}, so no presses.` });
}

// ---------- Counting and knowing ----------
// [what to count, how many, tier]
const FACTS = [
  ['leg on a cow', 4, 1], ['leg on a chicken', 2, 1], ['wheel on a tricycle', 3, 1], ['wheel on a car', 4, 1], ['side of a triangle', 3, 1],
  ['corner of a square', 4, 1], ['finger on one hand', 5, 1], ['eye on a person', 2, 1], ['nose on a face', 1, 1], ['wheel on a bicycle', 2, 1],
  ['season in a year', 4, 1], ['day of the weekend', 2, 1], ['colour in a traffic light', 3, 1], ['wheel on a unicycle', 1, 1],
  ['leg on a spider', 8, 2], ['leg on an ant', 6, 2], ['side of a hexagon', 6, 2], ['side of a pentagon', 5, 2], ['day in a week', 7, 2],
  ['arm on a starfish', 5, 2], ['corner of a cube', 8, 2], ['face of a dice', 6, 2], ['string on a violin', 4, 2], ['state in Australia', 6, 2],
  ['leg on a kangaroo', 2, 2], ['hump on a dromedary camel', 1, 2], ['primary colour', 3, 2], ['zero in one thousand', 3, 2], ['side of a stop sign', 8, 2],
  ['heart an octopus has', 3, 3], ['planet closer to the Sun than Earth', 2, 3], ['month with fewer than 30 days', 1, 3], ['corner of a circle', 0, 1],
  ['month that starts with J', 3, 3], ['month that starts with M', 2, 3], ['vowel in the alphabet (not counting Y)', 5, 2], ['continent', 7, 3],
  ['player on one side in a game of tennis doubles', 2, 3], ['edge of a triangle-based pyramid', 6, 3], ['letter in the word ZERO', 4, 1],
];
const WORDLIST = ['CAT', 'KOALA', 'BUTTON', 'PRESS', 'TIMER', 'APPLE', 'SPIDER', 'GO', 'CALM', 'PUZZLE', 'WOMBAT', 'EMU', 'BEACH', 'ROCKET', 'PIZZA',
  'JELLY', 'TIGER', 'PLANET', 'BANANA', 'SUN', 'GUITAR', 'ISLAND', 'PENGUIN', 'CACTUS', 'DRAGON', 'OCEAN', 'CLOCK', 'MAGIC', 'NOODLE', 'KITE'];
const SENTENCES = ['Cats like naps', 'Keep calm and press on', 'The quick brown fox jumps', 'Read every word', 'Slow and steady wins', 'Tea is nice',
  'Never press too soon', 'The sun is up', 'Big buttons are fun to press', 'Look before you leap', 'Every second counts here'];
const vowels = (w) => [...w].filter((c) => 'AEIOU'.includes(c)).length;

// ---------- Tap the right thing ----------
const SPELL = [['BUTTON', 'BUTON', 'BUTTTON'], ['KOALA', 'KOALLA', 'COALA'], ['BANANA', 'BANNANA', 'BANANNA'], ['PUZZLE', 'PUZLE', 'PUZZEL'],
  ['RHYTHM', 'RYTHM', 'RHYTHEM'], ['SCISSORS', 'SISSORS', 'SCISORS'], ['NECESSARY', 'NECCESARY', 'NECESARY'], ['CALENDAR', 'CALENDER', 'CALLENDAR'],
  ['SEPARATE', 'SEPERATE', 'SEPARRATE'], ['WEDNESDAY', 'WENSDAY', 'WEDNSDAY'], ['BEAUTIFUL', 'BEATIFUL', 'BEAUTYFUL'], ['FRIEND', 'FREIND', 'FRIEN']];

// ---------- The kinds ----------
// id: kept in the player's recent list so the same kinds do not keep coming back. tier: 1 easy, 2 middle, 3 hard.
// colour: needs colour vision (left out in colourblind mode).
const KINDS = [
  // simple presses
  { id: 'pressN', tier: 1, make: () => { const n = rnd(1, 5); return press(n, n === 1 ? 'Press' : `Press ${n} times`); } },
  { id: 'dont', tier: 1, make: () => pick([press(0, "Don't press"), press(0, 'Press 0 times'), press(0, 'Do not touch the button')]) },
  { id: 'dontNot', tier: 2, make: () => pick([press(1, "Don't not press", { why: "Don't not press means press." }),
    press(0, "Don't not not press", { why: 'Three nots cancel down to one: do not press.' })]) },
  { id: 'simon', tier: 2, make: () => {
    const n = rnd(1, 4), says = Math.random() < 0.55;
    const t = says ? `Simon says press ${times(n)}` : `Press ${times(n)}`;
    return press(says ? n : 0, t, { why: says ? `Simon said it, so ${times(n)}.` : 'Simon did not say it, so no presses.' });
  } },
  { id: 'simonDont', tier: 3, make: () => (Math.random() < 0.5 ? press(0, "Simon says don't press", { why: 'Simon said not to.' })
    : press(1, "Don't press. Simon did not say that. Simon says press once.", { why: 'Only what Simon says counts: press once.' })) },
  // facts and counting
  { id: 'fact1', tier: 1, make: () => { const [w, n] = pick(FACTS.filter((f) => f[2] === 1)); return press(n, `Press once for each ${w}`, { why: `The answer was ${n}.` }); } },
  { id: 'fact2', tier: 2, make: () => { const [w, n] = pick(FACTS.filter((f) => f[2] === 2)); return press(n, `Press once for each ${w}`, { why: `The answer was ${n}.` }); } },
  { id: 'fact3', tier: 3, make: () => { const [w, n] = pick(FACTS.filter((f) => f[2] === 3)); return press(n, `Press once for each ${w}`, { why: `The answer was ${n}.` }); } },
  { id: 'add', tier: 1, make: () => { const x = rnd(1, 5), y = rnd(1, 4); return press(x + y, `Press ${x} + ${y} times`); } },
  { id: 'sub', tier: 1, make: () => { const x = rnd(6, 12), y = rnd(x - 6, x - 1); return press(x - y, `Press ${x} − ${y} times`); } },
  { id: 'mul', tier: 2, make: () => { const x = rnd(2, 3), y = rnd(2, 3); return press(x * y, `Press ${x} × ${y} times`); } },
  { id: 'div', tier: 2, make: () => { const y = rnd(2, 4), q = rnd(1, 3); return press(q, `Press ${y * q} ÷ ${y} times`); } },
  { id: 'half', tier: 2, make: () => pick([(() => { const n = rnd(1, 5); return press(n, `Press half of ${n * 2} times`); })(),
    (() => { const n = rnd(1, 4); return press(n * 2, `Press double ${n} times`); })()]) },
  { id: 'order', tier: 3, make: () => { const a = rnd(1, 3), b = rnd(2, 3), c = rnd(1, 2); return press(a + b * c, `Press ${a} + ${b} × ${c} times`, { why: `Multiply first: ${b} × ${c} = ${b * c}, then add ${a}. That makes ${a + b * c}.` }); } },
  { id: 'oneMore', tier: 1, make: () => { const n = rnd(1, 4); return Math.random() < 0.5 ? press(n + 1, `Press one more time than ${n}`) : press(n - 1 + 1, `Press one fewer time than ${n + 1}`); } },
  { id: 'except', tier: 3, make: () => { const top = rnd(4, 6), skip = rnd(2, top - 1); return press(top - 1, `Press once for each number from 1 to ${top}, except ${skip}`, { why: `1 to ${top} is ${top} numbers. Leave out ${skip}: ${top - 1}.` }); } },
  { id: 'letters', tier: 1, make: () => { const w = pick(WORDLIST.filter((x) => x.length <= 6)); return press(w.length, `Press once for each letter in ${w}`); } },
  { id: 'vowels', tier: 2, make: () => { const w = pick(WORDLIST.filter((x) => vowels(x) >= 1 && vowels(x) <= 4)); return press(vowels(w), `Press once for each vowel in ${w}`, { why: `${w} has ${vowels(w)} vowels (A, E, I, O, U).` }); } },
  { id: 'sentence', tier: 2, make: () => { const s = pick(SENTENCES), n = s.split(' ').length; return press(n, 'Press once for each word below', { art: words(s), why: `"${s}" has ${n} words.` }); } },
  { id: 'letterE', tier: 3, make: () => {
    const s = pick(SENTENCES.filter((x) => { const c = [...x.toUpperCase()].filter((ch) => ch === 'E').length; return c >= 1 && c <= 6; }));
    const n = [...s.toUpperCase()].filter((ch) => ch === 'E').length;
    return press(n, 'Press once for each letter E below', { art: words(s), why: `"${s}" has ${n} Es.` });
  } },
  { id: 'things', tier: 1, make: () => {
    const keys = shuffle(Object.keys(THINGS)), want = keys[0], n = rnd(1, 5), others = keys.slice(1, 1 + rnd(1, 3));
    const list = shuffle([...Array(n).fill(want), ...others.flatMap((k) => Array(rnd(1, 2)).fill(k))]).slice(0, 8);
    const count = list.filter((k) => k === want).length;
    return press(count, `Press once for each ${THINGS[want]}`, { art: pics(list.map(THING)) });
  } },
  { id: 'cats', tier: 1, make: () => { const n = rnd(1, 5), d = rnd(1, 3); return press(n, 'Press once for each cat', { art: pics(shuffle([...cats(n), ...Array(d).fill(0).map(() => KEN(pick(BEASTS)))])) }); } },
  { id: 'birds', tier: 2, make: () => {
    const b = rnd(1, 4), list = shuffle([...shuffle(BIRDS).slice(0, b), ...shuffle(BEASTS).slice(0, rnd(1, 3))]);
    return press(b, 'Press once for each bird', { art: animals(list), why: `There were ${b} birds (a penguin and a chicken count too).` });
  } },
  { id: 'evenCats', tier: 2, make: () => { const n = rnd(2, 6); return press(n % 2 ? 0 : 1, 'Press once if there is an even number of cats', { art: pics(cats(n)), why: `There were ${n} cats, so ${n % 2 ? 'no presses' : 'one press'}.` }); } },
  { id: 'spiderSee', tier: 1, make: () => (Math.random() < 0.5 ? press(0, 'Press if you see a spider', { art: animals(shuffle(BEASTS).slice(0, 3)), why: 'There was no spider, so no presses.' })
    : press(1, 'Press if you see a spider', { art: animals(shuffle([...shuffle(BEASTS).slice(0, 3), 'spider'])) })) },
  { id: 'noSpider', tier: 2, make: () => (Math.random() < 0.5 ? press(1, 'Press if there is no spider here', { art: animals(shuffle(BEASTS).slice(0, 3)) })
    : press(0, 'Press if there is no spider here', { art: animals(shuffle([...shuffle(BEASTS).slice(0, 2), 'spider'])), why: 'There was a spider, so no presses.' })) },
  { id: 'clock', tier: 2, make: () => { const h = rnd(1, 8); return press(h, 'Press as many times as the hour on this clock', { art: clock(h), why: `The clock showed ${h} o'clock.` }); } },
  { id: 'levelNo', tier: 2, make: (i) => (Math.random() < 0.5 ? press(1, `Press if this is level ${i + 1}`) : press(0, `Press if this is level ${i + pick([0, 2, 3])}`, { why: `This was level ${i + 1}.` })) },
  { id: 'evenNumber', tier: 1, make: () => { const n = rnd(3, 15); return press(n % 2 ? 0 : 1, `Press if ${n} is an even number`, { why: `${n} is ${n % 2 ? 'odd, so no presses' : 'even, so one press'}.` }); } },
  { id: 'ifElse', tier: 2, make: () => {
    const x = rnd(2, 9); let y; do y = rnd(2, 9); while (y === x);
    const [p, q] = shuffle([1, 2, 3]).slice(0, 2);
    return press(x > y ? p : q, `If ${x} is bigger than ${y}, press ${times(p)}. If not, press ${times(q)}.`, { why: `${x} is ${x > y ? 'bigger' : 'smaller'}, so ${times(x > y ? p : q)}.` });
  } },
  { id: 'ifPics', tier: 3, make: () => {
    const c = rnd(1, 4); let d; do d = rnd(1, 4); while (d === c);
    const [p, q] = shuffle([1, 2, 3]).slice(0, 2);
    const list = shuffle([...cats(c), ...Array(d).fill(KEN('dog'))]);
    return press(c > d ? p : q, `More cats than dogs: press ${times(p)}. More dogs: press ${times(q)}.`, { art: pics(list), why: `${c} cats and ${d} dogs, so ${times(c > d ? p : q)}.` });
  } },
  { id: 'faceLetters', tier: 3, make: () => { const f = pick(['red', 'blue', 'green', 'yellow']); return press(f.length, "Press once for each letter in the button's colour", { face: f, why: `The button was ${f}: ${f.length} letters.` }); } },
  { id: 'blueOrNot', tier: 2, make: () => { const f = pick(['blue', 'green', 'yellow']); return press(f === 'blue' ? 1 : 0, 'Press if the button is blue', { face: f, why: f === 'blue' ? '' : `The button was ${f}, not blue.` }); } },
  { id: 'stroop', tier: 3, colour: true, make: stroop },
  // timing
  { id: 'now', tier: 1, make: nowLevel },
  { id: 'green', tier: 1, make: () => greenLevel(Math.random() < 0.4) },
  { id: 'numberIs', tier: 1, make: () => numberIs(rnd(1, 9)) },
  { id: 'sum10', tier: 3, make: () => pairWatch('Press when the two numbers add up to 10', (x, y) => x + y === 10, 'You had to press while the numbers made 10.') },
  { id: 'samePair', tier: 2, make: () => pairWatch('Press when both numbers are the same', (x, y) => x === y, 'You had to press while the two numbers matched.') },
  { id: 'spiderIn', tier: 1, make: spiderAppears },
  { id: 'spiderOut', tier: 2, make: spiderLeaves },
  { id: 'redLetGo', tier: 2, make: redRelease },
  { id: 'holdEnd', tier: 1, make: () => holdToEnd('Hold the button down until the time runs out') },
  { id: 'holdFor', tier: 3, make: () => { const s = rnd(2, 3); return { time: s + 4, text: `Hold the button for about ${s} seconds, then let go`, hold: true, tap: () => undefined,
    up: (a) => (a.held >= s - 0.6 && a.held <= s + 0.9 ? 'win' : 'fail'), end: () => 'fail', why: `You had to hold for about ${s} seconds.` }; } },
  { id: 'afterHalf', tier: 2, make: () => (Math.random() < 0.5 ? after(0.5, 'Press after half the time has gone') : after(0.75, 'Press after three quarters of the time has gone')) },
  { id: 'countdown', tier: 2, make: countdown },
  { id: 'letGoAt', tier: 3, make: letGoAt },
  { id: 'nthFlash', tier: 2, make: nthFlash },
  { id: 'countFlashes', tier: 3, make: countFlashes },
  { id: 'rhythm', tier: 3, make: rhythm },
  { id: 'side', tier: 2, make: sideLevel },
  { id: 'stops', tier: 2, make: stopsMoving },
  { id: 'notRed', tier: 3, make: notWhileRed },
  { id: 'double', tier: 2, make: doubleTap },
  { id: 'matchPics', tier: 2, make: matchPair },
  { id: 'elsewhere', tier: 1, make: () => { const k = rnd(1, 3); return elsewhere(k, k === 1 ? "Don't press the button. Tap anywhere else." : `Tap anywhere except the button, ${k} times`); } },
  { id: 'quick', tier: 3, make: () => { const n = rnd(10, 14); return press(n, `Quick! Press ${n} times`, { time: 1.8 + n * 0.28 }); } },
  // tap the right thing
  { id: 'oddOne', tier: 1, make: () => {
    const [same, odd] = shuffle(Object.keys(THINGS)).slice(0, 2), at = rnd(0, 3);
    return tapOne('Tap the odd one out', [0, 1, 2, 3].map((k) => (k === at ? [odd, imgTile(THING(odd))] : [same, imgTile(THING(same))])), (t) => t === odd, `The ${THINGS[odd]} was the odd one out.`);
  } },
  { id: 'bigger', tier: 1, make: () => {
    const ns = shuffle([...Array(9)].map((_, k) => k + 1)).slice(0, rnd(2, 4)), small = Math.random() < 0.4, want = small ? Math.min(...ns) : Math.max(...ns);
    return tapOne(`Tap the ${small ? 'smallest' : 'biggest'} number`, ns.map((n) => [n, numTile(n)]), (t) => +t === want, `${want} was the ${small ? 'smallest' : 'biggest'}.`);
  } },
  { id: 'tapEven', tier: 2, make: () => {
    const odd = Math.random() < 0.5, want = odd ? pick([1, 3, 5, 7, 9, 11, 13]) : pick([2, 4, 6, 8, 10, 12, 14]);
    const rest = shuffle([...Array(14)].map((_, k) => k + 1).filter((n) => (n % 2) === (odd ? 0 : 1))).slice(0, 3);
    return tapOne(`Tap the ${odd ? 'odd' : 'even'} number`, shuffle([want, ...rest]).map((n) => [n, numTile(n)]), (t) => +t === want, `${want} was the only ${odd ? 'odd' : 'even'} one.`);
  } },
  { id: 'tapFlyer', tier: 2, make: () => {
    const f = pick(FLYERS), list = shuffle([f, ...shuffle(BEASTS).slice(0, 3)]);
    return tapOne('Tap the animal that can fly', list.map((x) => [x, imgTile(KEN(x))]), (t) => t === f, `The ${f} was the only one that flies.`);
  } },
  { id: 'tapSpider', tier: 1, make: () => {
    const list = shuffle(['spider', ...shuffle([...BEASTS, ...BIRDS]).slice(0, rnd(2, 4))]);
    return tapOne('Tap the spider', list.map((x) => [x, imgTile(animalSrc(x))]), (t) => t === 'spider', 'The spider was the one to tap.', { time: 4.5 });
  } },
  { id: 'spell', tier: 2, make: () => {
    const set = pick(SPELL), right = set[0];
    return tapOne('Tap the word that is spelled right', shuffle(set).map((w) => [w, `<span class="pr-tw">${w}</span>`]), (t) => t === right, `It is spelled ${right}.`, { time: 7 });
  } },
  { id: 'tapClock', tier: 3, make: () => {
    const hs = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(0, 3), want = hs[0];
    return tapOne(`Tap the clock showing ${want} o'clock`, shuffle(hs).map((h) => [h, clock(h, 'pr-clock mini')]), (t) => +t === want, `The clock at ${want} o'clock was the one.`, { time: 7 });
  } },
  { id: 'firstLetter', tier: 2, make: () => {
    const ls = shuffle('ABCDEFGHJKLMNPRSTW'.split('')).slice(0, 4), want = [...ls].sort()[0];
    return tapOne('Tap the letter that comes first in the alphabet', ls.map((l) => [l, numTile(l)]), (t) => t === want, `${want} comes first.`);
  } },
  { id: 'twice', tier: 3, make: () => {
    const ks = shuffle(Object.keys(THINGS)).slice(0, 4), dup = ks[0], list = shuffle([...ks, dup]);
    return tapOne('Tap a picture that appears twice', list.map((x) => [x, imgTile(THING(x))]), (t) => t === dup, `The ${THINGS[dup]} was there twice.`, { time: 6.5 });
  } },
  { id: 'allCats', tier: 2, make: () => {
    const n = rnd(2, 3), list = shuffle([...cats(n).map((s) => ['cat', imgTile(s)]), ...shuffle(BEASTS).slice(0, 5 - n).map((b) => [b, imgTile(KEN(b))])]);
    return { time: 4 + n * 1.2, text: 'Tap every cat, then stop', art: tiles(list), tap: () => 'fail',
      pick: (a, t, k) => { if (t !== 'cat') return 'fail'; a.flag.got = a.flag.got || new Set(); a.flag.got.add(k); return a.flag.got.size >= n ? 'win' : undefined; },
      end: () => 'fail', why: `There were ${n} cats to tap, and nothing else.` };
  } },
  { id: 'inOrder', tier: 2, make: () => {
    const ns = shuffle([...Array(9)].map((_, k) => k + 1)).slice(0, 4), down = Math.random() < 0.4, want = [...ns].sort((x, y) => (down ? y - x : x - y));
    return { time: 7, text: `Tap the numbers from ${down ? 'biggest to smallest' : 'smallest to biggest'}`, art: tiles(ns.map((n) => [n, numTile(n)])), tap: () => 'fail',
      pick: (a, t) => { a.flag.step = a.flag.step || 0; if (+t !== want[a.flag.step]) return 'fail'; a.flag.step++; return a.flag.step === want.length ? 'win' : undefined; },
      end: () => 'fail', why: `The order was ${want.join(', ')}.` };
  } },
  { id: 'whereSpider', tier: 3, make: () => {
    const at = rnd(0, 2), boxes = (show) => tiles([0, 1, 2].map((k) => [k, show && k === at ? imgTile(SPIDER) : '<b class="pr-q">?</b>']));
    return { time: 6.5, text: 'Watch the spider. Then tap where it was.', art: boxes(true), tap: () => 'fail',
      init: (a) => { a.flag.wait = true; a.after(1300, () => { a.setArt(boxes(false)); a.flag.wait = false; }); },
      pick: (a, t) => (a.flag.wait ? undefined : +t === at ? 'win' : 'fail'), end: () => 'fail',
      why: `The spider was in box ${at + 1}.` };
  } },
];

// ---------- Pairs planned across levels ----------
// Remember something now, use it two or three levels later. Each returns [first level, second level].
const MEMORY = [
  (key) => [press(1, 'Remember this number. Press once to carry on.', { time: 4.5, init: (a) => { a.mem[key] = rnd(2, 5); a.setArt(big(a.mem[key])); } }),
    pick([press((a) => a.mem[key] ?? 3, 'Press as many times as the number you remembered'),
      press((a) => (a.mem[key] ?? 3) + 1, 'Press the number you remembered, plus one'),
      press((a) => (a.mem[key] ?? 3) - 1, 'Press the number you remembered, minus one')])],
  (key) => [press(1, 'Remember both numbers. Press once to carry on.', { time: 5,
    init: (a) => { const x = rnd(2, 4); let y; do y = rnd(2, 5); while (y === x); a.mem[key] = [x, y]; a.setArt(big(`${x} <small>and</small> ${y}`)); } }),
    pick([press((a) => Math.max(...(a.mem[key] ?? [2, 3])), 'Press the bigger number you remembered'),
      press((a) => Math.min(...(a.mem[key] ?? [2, 3])), 'Press the smaller number you remembered'),
      press((a) => (a.mem[key] ?? [2, 3]).reduce((s, v) => s + v, 0), 'Press the two numbers you remembered, added together')])],
  (key) => [press(1, 'Remember this word. Press once to carry on.', { time: 4.5, init: (a) => { a.mem[key] = pick(WORDLIST.filter((w) => w.length <= 6)); a.setArt(words(a.mem[key])); } }),
    press((a) => (a.mem[key] ?? 'CAT').length, 'Press once for each letter in the word you remembered')],
  (key) => [press(1, 'Count the cats and remember. Press once to carry on.', { time: 5,
    init: (a) => { const n = rnd(2, 5); a.mem[key] = n; a.setArt(pics(shuffle([...cats(n), ...Array(rnd(1, 2)).fill(0).map(() => KEN(pick(BEASTS)))]))); } }),
    press((a) => a.mem[key] ?? 3, 'Press once for each cat you counted earlier')],
  (key) => [press(1, 'Remember where the spider is. Press once to carry on.', { time: 4.5,
    init: (a) => { const at = rnd(0, 2); a.mem[key] = at; a.setArt(pics([0, 1, 2].map((k) => (k === at ? SPIDER : KEN(pick(BEASTS)))))); } }),
    { time: 6, text: 'Tap where the spider was a few levels ago', art: tiles([0, 1, 2].map((k) => [k, '<b class="pr-q">?</b>'])), tap: () => 'fail',
      pick: (a, t) => (+t === (a.mem[key] ?? 0) ? 'win' : 'fail'), end: () => 'fail', why: 'It was in the same spot as before.' }],
];
// A statement about the very next level.
const LIES = [
  () => [press(1, 'The next instruction is a lie. Press once to carry on.'), press(1, "Don't press", { why: 'The last level said this one was a lie, so "Don\'t press" really meant press.' })],
  () => [press(1, 'The next instruction is a lie. Press once to carry on.'), press(0, 'Press once', { why: 'The last level said this one was a lie, so no presses.' })],
  () => [press(1, 'The next instruction is true. Press once to carry on.'), press(0, "Don't press", { why: 'The last level said this one was true. So no presses.' })],
];

// ---------- Planning ----------
// recent: kind ids the player has had lately (oldest first). cb: colourblind mode, which leaves out colour-only kinds.
export function createRun({ recent = [], cb = false } = {}) {
  const plans = new Map();
  const seen = recent.slice(-40);
  function plan(b) {
    const maxTier = b === 0 ? 1 : b <= 2 ? 2 : 3;
    const out = new Array(10).fill(null);
    // memory pair and a lie pair, from the second block on
    if (maxTier >= 2 && Math.random() < 0.85) {
      const s = rnd(0, 6), gap = rnd(2, 3), [first, second] = pick(MEMORY)(`m${b}`);
      out[s] = { id: 'remember', spec: first }; out[Math.min(9, s + gap)] = { id: 'recall', spec: second };
    }
    if (maxTier >= 2 && Math.random() < 0.5) {
      const free = [...Array(9).keys()].filter((k) => !out[k] && !out[k + 1]);
      if (free.length) { const s = pick(free), [x, y] = pick(LIES)(); out[s] = { id: 'lie', spec: x }; out[s + 1] = { id: 'lie2', spec: y }; }
    }
    const used = new Set();
    for (let k = 0; k < 10; k++) {
      if (out[k]) continue;
      const pool = KINDS.filter((kd) => kd.tier <= maxTier && !(cb && kd.colour) && !used.has(kd.id));
      // newer, harder kinds come up more; kinds seen lately hardly at all
      const w = pool.map((kd) => (kd.tier === maxTier ? 2 : 1) * (seen.includes(kd.id) ? 0.08 : 1));
      let r = Math.random() * w.reduce((s, v) => s + v, 0), kd = pool[0];
      for (let j = 0; j < pool.length; j++) { r -= w[j]; if (r <= 0) { kd = pool[j]; break; } }
      used.add(kd.id); seen.push(kd.id);
      out[k] = { id: kd.id, make: kd.make };
    }
    return out;
  }
  return {
    // trying a block again: plan it afresh, keeping back what the last try had
    replan(b) { plans.delete(b); },
    level(i) {
      const b = Math.floor(i / 10);
      if (!plans.has(b)) plans.set(b, plan(b));
      const slot = plans.get(b)[i % 10];
      const spec = slot.spec || slot.make(i);
      return { ...spec, kind: slot.id };
    },
  };
}

// The old single-level entry point, for the tests: one run shared until resetLevels().
let shared = createRun();
export const resetLevels = () => { shared = createRun(); };
export const makeLevel = (i) => shared.level(i);

// Seconds on the clock: time to read the rule, plus time to press. Later levels speed up a little every 10.
export function levelTime(spec, text, need, idx) {
  let time = spec.time ?? (1.5 + text.split(/\s+/).length * 0.17 + (need ? 0.9 + need * 0.45 : 1.6));
  if (idx >= FIXED) time *= Math.max(0.7, 1 - Math.floor((idx - FIXED) / 10) * 0.04);
  return time;
}
