// Publishes a new version to the update channel (GitHub Releases).
//
//   node tools/release.mjs 1.1.0 --notes "What changed"          stable release
//   node tools/release.mjs 1.1.0-beta.1 --beta --notes "..."      beta (pre-release)
//   node tools/release.mjs 1.1.0 --dry-run                        build only, publish nothing
//
// Phones running the app check GitHub for releases and offer the update.
// Stable users only see stable releases. Users on the Beta channel see both.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const version = args.find((a) => /^\d+\.\d+\.\d+/.test(a));
const beta = args.includes('--beta');
const dry = args.includes('--dry-run');
const ni = args.indexOf('--notes');
const notes = ni >= 0 ? args[ni + 1] : '';

const run = (cmd, opts = {}) => { console.log('> ' + cmd); return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts }); };
const out = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
const fail = (msg) => { console.error('\n' + msg); process.exit(1); };

if (!version) fail('Give a version number, for example: node tools/release.mjs 1.1.0 --notes "New levels"');
if (!existsSync(join(ROOT, 'android', 'keystore.properties'))) fail('android/keystore.properties is missing, so the APK cannot be signed. Restore it from your backup.');
if (!dry) {
  if (out('git status --porcelain')) fail('You have uncommitted changes. Commit them first, then run the release again.');
  if (out(`git tag -l v${version}`)) fail(`v${version} already exists. Pick a higher version number.`);
}

// 1. bump the version inside the app
const propsPath = join(ROOT, 'android', 'gradle.properties');
let props = readFileSync(propsPath, 'utf8');
const code = Number(props.match(/VERSION_CODE=(\d+)/)[1]) + 1;
props = props.replace(/VERSION_NAME=.*/, `VERSION_NAME=${version}`).replace(/VERSION_CODE=\d+/, `VERSION_CODE=${code}`);
writeFileSync(propsPath, props);
console.log(`Version ${version} (build ${code})`);

// 2. tests, then a signed release build
for (const t of ['test-sudoku.mjs', 'test-sort.mjs', 'test-press.mjs', 'test-arrow.mjs', 'test-chess.mjs', 'test-rope.mjs', 'test-snip.mjs', 'test-turtle.mjs', 'test-hero.mjs', 'test-duo.mjs', 'test-duo-rt.mjs', 'test-duo-c.mjs', 'test-duo-d.mjs']) run(`node tools/${t}`);
const gradlew = join(ROOT, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
run(`"${gradlew}" assembleRelease --console=plain -q`, { cwd: join(ROOT, 'android') });
mkdirSync(join(ROOT, 'dist'), { recursive: true });
const apk = join(ROOT, 'dist', `sudoku-calm-${version}.apk`);
copyFileSync(join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), apk);
console.log('Built ' + apk);
if (dry) { console.log('Dry run: nothing committed or published.'); process.exit(0); }

// 3. commit, tag and publish
run(`git add android/gradle.properties`);
run(`git commit -m "Release v${version}"`);
run(`git tag v${version}`);
run('git push');
run(`git push origin v${version}`);
const notesFile = join(ROOT, 'dist', 'notes.txt');
writeFileSync(notesFile, notes || `GameHub ${version}`);
run(`gh release create v${version} "${apk}" --title "GameHub ${version}" --notes-file "${notesFile}"${beta ? ' --prerelease' : ' --latest'}`);
console.log(`\nPublished v${version}${beta ? ' (beta)' : ''}. Phones will offer the update next time the app checks.`);
