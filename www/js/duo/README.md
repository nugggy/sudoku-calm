# Play Together game modules

Each game is `www/js/duo/g-<id>.js` and is listed in the `GAMES` array in `hub.js`.

```js
export default {
  id: 'connect4',               // matches the file name g-<id>.js
  name: 'Connect Four',
  tag: 'Drop discs, line up four',
  cat: 'board',                 // 'board' | 'action' | 'party' (hub groups)
  realtime: false,
  ai: false,                    // optional: true if the game has a computer player (see Playing the computer)
  art: () => '<svg ...>',       // card art, about 96 x 64; real images or drawn SVG, never emoji
  help: ['Paragraph one.', 'Paragraph two.'],
  create(ctx) { /* fill ctx.root */ return { destroy() {} }; },
};
```

The `ctx` object (built by `makeCtx` in `core.js`):

| Field | Meaning |
|---|---|
| `root` | Element to fill. It is the whole game area below the top bar, `display: flex; flex-direction: column`. |
| `me` | `0` or `1`: which player this phone is. `null` in local (pass and play) mode, meaning this phone plays both. |
| `local` | `true` when both players share one phone. |
| `isHost` | `true` on the hosting phone, and always in local mode. |
| `first` | `0` or `1`: who moves first or starts. The hub alternates it on rematch. |
| `names` | `[name0, name1]`. Player 0 is always the host. |
| `send(obj)` | Sends a JSON-safe object to the other phone. Does nothing in local mode. |
| `onMsg(fn)` | `fn(obj)` for each message from the other phone. Returns an unsubscribe function. |
| `end({ winner, text })` | Call once when the game is over. `winner` is `0`, `1` or `null` for a draw. The hub shows the result, scores and rematch. |
| `sfx`, `buzz`, `toast` | The app's sound (`sfx.tap()`, `sfx.place()`, `sfx.error()`, `sfx.win()`, ...), vibration and toast helpers. |
| `rng()` | Seeded random number in `[0, 1)`; both phones get the same seed. |
| `alive()` | `false` once the game screen has gone; stop loops and timers. |
| `ai` | `null`, or `'easy'`, `'medium'` or `'hard'` when one person plays the computer (see below). |

Turn-based games run identical deterministic rules on both phones and send moves (`{ t: 'move', ... }`).
Real-time games: the host is authoritative, simulates at a fixed step and sends snapshots about 20 to 30 times a second; the guest sends its input and draws the latest snapshot (interpolate if you like). Each phone must call `ctx.end` itself (the guest when the host's snapshot says the game is over).

## Playing the computer

A game that sets `ai: true` gets a third choice in the hub's game sheet, Play the computer, which asks for Easy, Medium or Hard (the last choice is remembered in `store.duo.aiLevel`), and a small Solo chip on its hub card. The game then starts on this phone with `ctx.local` true, `ctx.ai` set to the level and names `['You', 'Computer']`. The person is always player 0 and the computer player 1; `ctx.first` still alternates on Play again. The result card says You win or The computer wins, and the running score is kept per level.

The shared helpers already know about the computer: when `ctx.ai` is set, `mine(ctx, p)` and `canAct(ctx, p)` (tbc-ui.js) are only true for player 0, `turnText` says Your turn or The computer is thinking (the player bar pulses that line softly), `winText` says You win or The computer wins, and `who(ctx, p, 'pass', 'passes')` gives You pass, The computer passes or Ann passes for toasts. So taps on the computer's turns are already refused; the game only has to play player 1's turns itself. Anything that would hide a board for pass and play (such as Battleships' cover) should be skipped.

Turn-based games keep their computer players in `ai-board.js`, which has no browser code so `tools/test-duo-ai.mjs` can test it in Node. Each function takes the game's own state, the level and `rng`, and returns a move in the same shape the game sends over the link (`c4Ai`, `tttAi`, `drAi`, `rvAi`, `kalahAi`, `dbAi`, `shipsAi`). Searches deepen one ply at a time under a time cap (about 80 to 260 ms by level), and every level takes a move that wins on the spot. `aiTurn(ctx, think, play)` runs the computer's turn after a short natural pause (400 to 900 ms including the thinking) and does nothing once the screen has gone. The pattern in each game is a `computer()` function, called after every move and once at the start:

```js
function computer() {
  if (ctx.ai && turn === 1 && !over) aiTurn(ctx, () => c4Ai(b, 1, ctx.ai), (c) => play(c, 1));
}
```

8 Ball (`g-pool.js`) is the real-time example: its engine `rt-pool.js` has `aiThink(state, level, rng)`, a generator that simulates candidate shots a few at a time (so the screen keeps moving while it thinks), prefers pots of its own group and avoids fouls, then adds the level's aim and power error.

Helpers in `core.js`: `makePair(game, opts)` wires two ctx objects together in one page for harnesses and tests (`opts.roots` = two elements, `latency` in ms), `makeCtx`, `seededRng`, `turnText`, `mine`, `who`, `esc`.

Messages between the phones are wrapped by the hub (`{ k: 'g', d: obj }`), so games can use any shape they like.
