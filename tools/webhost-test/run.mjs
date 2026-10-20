// Compiles and runs the desktop tests for WebHost.java and WebLink.java (needs a JDK on the path).
// Run: node tools/webhost-test/run.mjs   (the browser end-to-end check is e2e.mjs in this folder)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'android', 'app', 'src', 'main', 'java', 'au', 'nugggy', 'sudokucalm');
const out = mkdtempSync(join(tmpdir(), 'webhost-test-'));
try {
  execFileSync('javac', ['-encoding', 'UTF-8', '-d', out, join(SRC, 'WebHost.java'), join(SRC, 'WebLink.java'), join(ROOT, 'tools', 'webhost-test', 'WebHostTest.java')], { stdio: 'inherit' });
  execFileSync('java', ['-cp', out, 'au.nugggy.sudokucalm.WebHostTest'], { stdio: 'inherit', timeout: 60000 });
} catch (e) {
  process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
