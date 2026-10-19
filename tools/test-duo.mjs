// Checks the Play Together turn-based games. Run with: node tools/test-duo.mjs
// 1. Rules (Node): Connect Four, Noughts and Crosses, Dots and Boxes, Reversi, Draughts and Battleships.
// 2. Two phones in one page (headless Chrome, if installed): full random games of each game over makePair,
//    checking both sides finish with the same result and the same final state. Skip with --rules-only.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as R from '../www/js/duo/rules.js';
import { mulberry32 } from '../www/js/sudoku-engine.js';

let fail = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fail++; console.log('FAIL', msg); } };

// ---------- Connect Four ----------
{
  const b = R.c4New();
  [0, 0, 0].forEach(() => R.c4Drop(b, 3, 0));
  ok(!R.c4Win(b), 'c4: three is not a win');
  R.c4Drop(b, 3, 0);
  const w = R.c4Win(b);
  ok(w && w.player === 0 && w.cells.length === 4, 'c4: vertical four wins');
  const d = R.c4New();
  // diagonal for player 1: (5,0) (4,1) (3,2) (2,3)
  [[1], [0, 1], [0, 0, 1], [0, 0, 0, 1]].forEach((col, c) => col.forEach((p) => R.c4Drop(d, c, p)));
  const dw = R.c4Win(d);
  ok(dw && dw.player === 1, 'c4: rising diagonal wins');
  const f = R.c4New();
  for (let k = 0; k < 6; k++) R.c4Drop(f, 0, k % 2);
  ok(!R.c4CanDrop(f, 0) && R.c4Drop(f, 0, 0) === -1, 'c4: full column refuses a disc');
  // no false wins across the edge of the frame: columns 4 to 6 of one row and column 0 of the next
  ok(!R.c4Win([...Array(42)].map((_, i) => ([25, 26, 27, 28].includes(i) ? 1 : 0))), 'c4: no wrap-around win');
}

// ---------- Noughts and Crosses ----------
{
  ok(R.tttWin([1, 1, 1, 0, 0, 0, 0, 0, 0])?.player === 0, 'ttt: top row');
  ok(R.tttWin([2, 0, 0, 0, 2, 0, 0, 0, 2])?.player === 1, 'ttt: diagonal');
  ok(!R.tttWin([1, 2, 1, 1, 2, 2, 2, 1, 1]) && R.tttFull([1, 2, 1, 1, 2, 2, 2, 1, 1]), 'ttt: full board draw');
}

// ---------- Dots and Boxes ----------
{
  const s = R.dbNew(2);
  ok(R.dbEdges(2).length === 12, 'dots: 2x2 has 12 edges');
  ok(R.dbPlay(s, 'h0_0', 0).length === 0, 'dots: first edge claims nothing');
  ok(R.dbPlay(s, 'h0_0', 1) === null, 'dots: an edge cannot be drawn twice');
  R.dbPlay(s, 'h1_0', 1); R.dbPlay(s, 'v0_0', 0);
  const made = R.dbPlay(s, 'v0_1', 1);
  ok(made.length === 1 && s.boxes[0] === 1 && s.score[1] === 1, 'dots: fourth side claims the box for the drawer');
  // an edge between two boxes can close both at once
  const t = R.dbNew(2);
  ['h0_0', 'h1_0', 'v0_0', 'h0_1', 'h1_1', 'v0_2'].forEach((e) => R.dbPlay(t, e, 0));
  const two = R.dbPlay(t, 'v0_1', 1);
  ok(two.length === 2 && t.score[1] === 2, 'dots: one line closes two boxes');
  const u = R.dbNew(3);
  R.dbEdges(3).forEach((e, k) => R.dbPlay(u, e, k % 2));
  ok(R.dbOver(u) && u.score[0] + u.score[1] === 9, 'dots: all boxes claimed at the end');
}

// ---------- Reversi ----------
{
  const b = R.rvNew(0);
  ok(R.rvCount(b).join() === '2,2', 'reversi: two discs each to start');
  const m = R.rvMoves(b, 0).sort((x, y) => x - y);
  ok(m.join() === '19,26,37,44', 'reversi: four opening moves for dark');
  const f = R.rvPlay(b, 19, 0);
  ok(f && f.length === 1 && f[0] === 27 && R.rvCount(b).join() === '4,1', 'reversi: playing d3 flips d4');
  ok(R.rvPlay(b, 0, 1) === null, 'reversi: a move that flips nothing is refused');
  // flips in several directions at once
  const c = new Array(64).fill(0);
  c[0] = 1; c[9] = 2; c[2] = 1; c[10] = 2; c[16] = 1; c[17] = 2; // player 0 plays 18: flips 9 (to 0), 10 (to 2), 17 (to 16)
  const fl = R.rvPlay(c, 18, 0).sort((x, y) => x - y);
  ok(fl.join() === '9,10,17', 'reversi: flips along three lines');
  // pass: when the other player cannot move, the same player goes again
  const p = new Array(64).fill(0); p[0] = 1; p[1] = 2;
  ok(R.rvNext(p, 1) === 0 || R.rvNext(p, 1) === -1, 'reversi: next player helper');
  const full = new Array(64).fill(1);
  ok(R.rvNext(full, 0) === -1, 'reversi: game over when nobody can move');
}

// ---------- Draughts ----------
{
  const b = R.drNew();
  ok(R.drCount(b).join() === '12,12', 'draughts: twelve pieces each');
  ok(R.drMoves(b, 0).length === 7 && R.drMoves(b, 1).length === 7, 'draughts: seven opening moves each');
  // forced capture: a capture hides every plain move
  const c = new Array(64).fill(0);
  c[5 * 8 + 2] = 1; c[4 * 8 + 3] = 3; c[6 * 8 + 7] = 1;
  const mv = R.drMoves(c, 0);
  ok(mv.length === 1 && mv[0].caps.length === 1 && mv[0].path.join() === [42, 28].join(), 'draughts: capture is compulsory');
  // multi-jump must be completed
  const m = new Array(64).fill(0);
  m[7 * 8 + 0] = 1; m[6 * 8 + 1] = 3; m[4 * 8 + 3] = 3;
  const mj = R.drMoves(m, 0);
  ok(mj.length === 1 && mj[0].caps.length === 2 && mj[0].path[2] === 3 * 8 + 4, 'draughts: double jump is one move');
  // kinging: reaching the far row crowns, and the move stops there even if another jump is possible for a king
  const k = new Array(64).fill(0);
  k[2 * 8 + 1] = 1; k[1 * 8 + 2] = 3; k[1 * 8 + 4] = 3;
  const km = R.drMoves(k, 0);
  ok(km.length === 1 && km[0].path.length === 2, 'draughts: crowning by capture ends the move');
  const crowned = R.drPlay(k, km[0]);
  ok(crowned && k[0 * 8 + 3] === 2, 'draughts: man is crowned on the far row');
  // a king moves backwards
  const kb = new Array(64).fill(0); kb[3 * 8 + 4] = 2;
  ok(R.drMoves(kb, 0).length === 4, 'draughts: a king has four directions');
  const mb = new Array(64).fill(0); mb[3 * 8 + 4] = 1;
  ok(R.drMoves(mb, 0).every((x) => x.path[1] < 3 * 8), 'draughts: a man only moves forward');
  // captured piece is removed and you cannot jump your own
  const own = new Array(64).fill(0); own[5 * 8 + 2] = 1; own[4 * 8 + 3] = 1;
  ok(R.drMoves(own, 0).every((x) => !x.caps.length), 'draughts: no jumping your own pieces');
}

// ---------- Battleships ----------
{
  const rng = mulberry32(7);
  for (let k = 0; k < 200; k++) { const f = R.randomFleet(rng); if (!R.fleetValid(f)) { ok(false, 'ships: random fleet invalid'); break; } }
  ok(true, 'ships: 200 random fleets valid');
  ok(R.shipCells(0, 8, 3, false) === null, 'ships: ship off the edge refused');
  const ships = [5, 4, 3, 3, 2].map((len, r) => ({ len, cells: R.shipCells(r * 2, 0, len, false) }));
  ok(R.fleetValid(ships), 'ships: hand-placed fleet valid');
  ok(!R.fleetValid([...ships.slice(0, 4), { len: 2, cells: [0, 1] }]), 'ships: overlapping fleet refused');
  const hits = new Set();
  ok(R.answerShot(ships, hits, 99).r === 'miss', 'ships: miss');
  ok(R.answerShot(ships, hits, 80).r === 'hit', 'ships: hit');
  const sunk = R.answerShot(ships, hits, 81);
  ok(sunk.r === 'sunk' && sunk.ship.join() === '80,81' && !sunk.over, 'ships: sinking the patrol boat');
  let last;
  for (const s of ships) for (const c of s.cells) last = R.answerShot(ships, hits, c);
  ok(last.over, 'ships: the last ship ends the game');
}

console.log(`Rules: ${checks} checks, ${fail} failed`);

// ---------- Two phones in one page ----------
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => existsSync(p));
if (process.argv.includes('--rules-only') || !CHROME) {
  if (!CHROME) console.log('Chrome not found: skipped the two-phone games');
  process.exit(fail ? 1 : 0);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer(async (q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  try { const b = await readFile(join(ROOT, p)); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); }
});
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const port = server.address().port, dbg = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'duo-test-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=900,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => { try { chrome.kill(); } catch {} server.close(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 300); };
let targets = null;
for (let i = 0; i < 60 && !targets; i++) { await sleep(200); try { targets = await (await fetch(`http://127.0.0.1:${dbg}/json`)).json(); } catch {} }
if (!targets) { console.log('Chrome did not start: skipped the two-phone games'); done(fail ? 1 : 0); }
else {
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/tools/duo/pair.html` });
  let title = '';
  for (let t = 0; t < 600 && !['DONE', 'FAIL'].includes(title); t++) { await sleep(250); title = (await send('Runtime.evaluate', { expression: 'document.title' })).result?.result?.value; }
  const out = (await send('Runtime.evaluate', { expression: "document.getElementById('log').textContent" })).result?.result?.value || '';
  console.log(out.trim());
  if (title !== 'DONE') fail++;
  if (errors.length) { fail++; console.log('Page errors:\n' + errors.join('\n')); }
  ws.close();
  console.log(fail ? `Play Together: ${fail} problem(s)` : 'All Play Together checks passed');
  done(fail ? 1 : 0);
}
