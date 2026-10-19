# Play Together game modules

Each game is `www/js/duo/g-<id>.js` and is listed in the `GAMES` array in `hub.js`.

```js
export default {
  id: 'connect4',               // matches the file name g-<id>.js
  name: 'Connect Four',
  tag: 'Drop discs, line up four',
  cat: 'board',                 // 'board' | 'action' | 'party' (hub groups)
  realtime: false,
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

Turn-based games run identical deterministic rules on both phones and send moves (`{ t: 'move', ... }`).
Real-time games: the host is authoritative, simulates at a fixed step and sends snapshots about 20 to 30 times a second; the guest sends its input and draws the latest snapshot (interpolate if you like). Each phone must call `ctx.end` itself (the guest when the host's snapshot says the game is over).

Helpers in `core.js`: `makePair(game, opts)` wires two ctx objects together in one page for harnesses and tests (`opts.roots` = two elements, `latency` in ms), `makeCtx`, `seededRng`, `turnText`, `mine`, `esc`.

Messages between the phones are wrapped by the hub (`{ k: 'g', d: obj }`), so games can use any shape they like.
