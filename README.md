<p align="center"><img src="docs/icon.png" width="120" alt="Sudoku Calm icon"></p>

# Sudoku Calm

An ad-free Android puzzle app with three games:

- **Sudoku.** Six difficulty levels from Easy to Extreme, notes, smart hints that explain the next move, mistake checking, scoring with row, column and box bonuses, statistics, and light and dark themes with five accent colours.
- **Meowdoku.** Place one cat in every row, column and colour region, with no two cats touching. 1,000 hand-checked levels from 4×4 to 12×12 that get harder as you go, then endless generated levels. Hints teach the logic rather than just giving answers. Collect 14 cats as you progress.
- **Cosy Cat Sort.** Shelves line both sides of a centre aisle. Pick up the cat nearest the aisle (matching neighbours come too) and gather four in the same outfit on one shelf to send them home. 14 outfits, 600 pre-checked levels and endless levels after that, a Hard level every tenth, a level map for replays, mystery boxes, hidden back rows, holding baskets, and Undo, Shuffle and Extra spot boosters that you earn by playing.

No ads, no accounts, no tracking. Progress stays on the phone.

## Install

1. On your Android phone, open the [latest release](https://github.com/nugggy/sudoku-calm/releases/latest).
2. Download the `.apk` file and open it.
3. If Android asks, allow your browser to install apps, then tap **Install**.

Android 8.0 or newer is required.

## Updates

The app checks this repository's Releases for new versions (at most every six hours, and only if **Settings > Updates** allows it). When there is one, it offers to download and install it. You can also tap **Check for updates now** in Settings.

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

- Cat and icon artwork: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), MIT licence, copyright (c) Microsoft Corporation. See `www/img/FLUENT-EMOJI-LICENSE.txt`.
- Cat Sort outfits are original drawings made for this app.

Sudoku Calm is an independent project. It is not made by, endorsed by or affiliated with Easybrain, Oakever Games or Easetouch. Meowdoku and Cosy Cat Sort are original takes on those puzzle styles.
