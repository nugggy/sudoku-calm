<p align="center"><img src="docs/icon.png" width="120" alt="Mindnook icon"></p>

# Mindnook

A calm corner for your mind.

An ad-free Android puzzle app with 18 games, grouped on one landing page:

- **Sudoku.** Six difficulty levels from Easy to Extreme, notes, smart hints that explain the next move, mistake checking, scoring with row, column and box bonuses, statistics, and light and dark themes with five accent colours.
- **Meowdoku.** Place one cat in every row, column and colour region, with no two cats touching. 1,000 hand-checked levels from 4×4 to 12×12 that get harder as you go, then endless generated levels.
- **Cosy Cat Sort.** Shelves line both sides of a centre aisle. Pick up the cat nearest the aisle (matching neighbours come too), only place cats next to the same outfit, and gather four on one shelf to send them home. 600 pre-checked levels plus endless levels, Hard levels, boosters and a hint button.
- **Crosswords.** 150 freeform crosswords from quick 7×7 minis to 11×11, with clues written in plain Australian English, an on-screen keyboard, and Letter, Check and Reveal helpers.
- **Word Search.** 32 picture themes (Animals, Ocean, Australia, Space and more). Grids grow from 8×8 to 12×12 and words run across and down, then diagonally, then backwards.
- **Kakuro.** 120 sum puzzles from 5×5 to 7×7, each with exactly one answer, with notes and a helper that lists the ways to make each sum.
- **2048.** Slide and merge tiles, with undo and a best score.
- **Minesweeper.** Easy, Medium and Hard boards that can always be cleared without guessing; first tap is always safe.
- **Pipeline.** Join matching dots and fill every square, boards from 5×5 to 9×9.
- **Guesswork.** Find the five-letter word in six tries, with a daily word, unlimited practice and statistics.
- **Word Wheel.** Swipe letters on a wheel to fill a crossword, with bonus words that earn hints. 250 levels.
- **Spider Solitaire.** One, two or four suits, with undo and hints.
- **Mahjong Garden.** Mahjong solitaire on six layouts with cartoon tiles; every deal can be cleared.
- **Nuts & Bolts.** Sort coloured nuts onto bolts; every level is checked solvable.
- **Jigsaw.** Interlocking pieces of 12 cartoon scenes, from 9 to 49 pieces.
- **Solitaire.** Classic Klondike with draw one or draw three. Every deal has been proven winnable by a solver. Tap or drag to move, unlimited undo and hints, auto finish, and the bouncing-cards finale.
- **Treat Twist.** A match-3 game with hand-drawn candies in six shapes and colours. Swap candies to make lines, create striped, wrapped and sprinkle-ball specials, and meet each level's goal (points, collecting treats or clearing jelly) within the move limit.
- **Block Pounce.** Drag blocks onto an 8×8 board and clear full rows and columns. Combos score big; the game ends when nothing fits.

No ads, no accounts, no tracking. Progress stays on the phone.

## Install

1. On your Android phone, open the [latest release](https://github.com/nugggy/sudoku-calm/releases/latest).
2. Download the `.apk` file and open it.
3. If Android asks, allow your browser to install apps, then tap **Install**.

Android 8.0 or newer is required.

## Updates

The app checks this repository's Releases for new versions (at most once an hour, and only if **Settings > Updates** allows it). When there is one, it offers to download and install it. You can also tap **Check for updates now** in Settings.

There are two channels:

- **Stable** gets normal releases.
- **Beta** also gets pre-releases.

## Publishing a new version

Requirements: Node.js, the Android SDK, JDK 17, the GitHub CLI logged in as the repository owner, and the signing key (see below).

```
node tools/release.mjs 1.1.0 --notes "What changed"
node tools/release.mjs 1.2.0-beta.1 --beta --notes "Trying something new"
node tools/release.mjs 1.1.0 --dry-run
```

The script bumps the version, runs the tests, builds a signed APK, tags the commit and creates the GitHub release. Phones pick it up from there.

### Signing key

Updates only install over the existing app if every release is signed with the same key. The key lives in `keystore/` and its password in `android/keystore.properties`. Both are excluded from Git on purpose. **Back them up somewhere safe.** If they are lost, future versions cannot update the installed app, and everyone would need to uninstall and reinstall (losing progress).

## Building and testing locally

```
node tools/test-sudoku.mjs              # Sudoku generator, grader and hints
node tools/test-sort.mjs                # Cat Sort level generator
node tools/gen-meow-levels.mjs          # rebuild the Meowdoku level set
node tools/gen-sort-levels.mjs 600      # rebuild the Cat Sort level set
node tools/gen-solitaire-deals.mjs 500  # find winnable Solitaire deals
node tools/gen-crosswords.mjs 150       # build crosswords from tools/crossword-bank.txt
python tools/build_words.py <scowl>/final # build the word lists from SCOWL
node tools/gen-wordwheel.mjs 250        # build Word Wheel levels
node tools/gen-kakuro.mjs 120           # build unique Kakuro puzzles
cd android && ./gradlew assembleRelease # build the APK
```

The game itself is plain HTML, CSS and JavaScript in `www/`. You can also open it in a desktop browser by serving that folder (for example `python -m http.server` inside `www`).

## Project layout

```
www/                 the game (bundled into the APK as assets)
  js/sudoku-engine.js  generator, solver, difficulty grading, hints
  js/meow-engine.js    Meowdoku generator, logic solver, hints
  js/sort-engine.js    Cat Sort levels and rules
  levels/              pre-built Meowdoku levels
android/             native Android shell (WebView, updates, vibration)
tools/               tests, level generator and release script
```

## Credits

- Word lists: based on SCOWL, copyright Kevin Atkinson and contributors, used under its permissive licence. See `www/levels/WORDLIST-LICENSE.txt`.

- Cat and icon artwork: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), MIT licence, copyright (c) Microsoft Corporation. See `www/img/FLUENT-EMOJI-LICENSE.txt`.
- Word Search themes, Mahjong tiles and Jigsaw scenes use Fluent Emoji pictures. Cat Sort outfits are original drawings made for this app. Treat Twist candies are original drawings too.

Mindnook is an independent project. It is not made by, endorsed by or affiliated with Easybrain, Oakever Games, Easetouch, King, Hungry Studio or any other game maker. Its games are original takes on popular puzzle styles.
