# Casino Night

Play chips only. No real money is used or won. No purchases, no ads.

## Game module API

Each game is `www/js/casino/g-<id>.js`:

```js
export default { id, name, tag, art: () => html, help: [paragraphs], create(ctx) }
```

`ctx` = `{ root, wallet, ui, sfx, buzz, toast, stats, alive }`

- `root`: HTMLElement to fill (it already sits inside the casino game screen under the top bar, flex column, full height).
- `wallet` (from `wallet.js`): `get()`, `take(n)` returns false when there are not enough chips (nothing is taken), `give(n)`, `canAfford(n)`, `onChange(fn)` returns an unsubscribe function, `MIN_BET` (5). Never touch `store.casino.chips` directly.
- `ui` (all exports of `ui.js`):
  - `chipImg(value)` returns `img/casino/chip_<value>.webp`; `CHIPS` = [5, 25, 100, 500, 1000].
  - `balancePill()` returns an element that keeps itself updated with the wallet.
  - `betPicker({ onPick(value) })` returns an element with tappable chip images; `selected()` gives the current chip value.
  - `chipStack(amount)` returns html of stacked chip images for a bet spot.
  - `cardImg(card)` returns the image path for `{ r, s }` (r: 2..14 where 11 J, 12 Q, 13 K, 14 A; s: 'S' 'H' 'D' 'C'); `cardBack()`.
  - `cardHTML(card, { faceDown, cls })` returns a card element string; `dealCard(container, card, { faceDown, delay })` appends with a deal animation (returns the element); `flipCard(el, card)`.
  - `banner(root, { text, amount, win })` shows a win or lose banner with a counting amount.
  - `button(label, cls)` returns html for a casino action button (`.cs-btn`, add `gold` for the main action).
  - `needChips(ctx, n)` checks the wallet and, if short, offers the free top-up; returns true when the bet can go ahead.
- `stats.record(result, amountWon)`: result is 'win' | 'lose' | 'push'; amountWon is net chips (negative for a loss).
- `alive()`: false after the screen is closed (stop timers and async work).

`create(ctx)` returns `{ destroy() }`.

Registry ids in hub order: blackjack, holdem, roulette, craps, baccarat, videopoker, pokies. A missing or broken game file is skipped.

## Shared images (www/img/casino/)

- Chips: `chip_5.webp`, `chip_25.webp`, `chip_100.webp`, `chip_500.webp`, `chip_1000.webp`
- Cards: `card_<R><S>.webp` with R in A 2 3 4 5 6 7 8 9 T J Q K and S in S H D C, plus `card_back.webp`
- Dice: `die_1.webp` to `die_6.webp` (white dice with black pips)
- Felt: `felt.webp` (tileable green felt)

Game-specific images are prefixed with the game id (for example `roulette_wheel.webp`).
