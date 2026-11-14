// Builds the Tumble Coach sequence pictures in www/img/gym/ from Wikimedia Commons.
// All are by Kingfiser, CC BY-SA 4.0 (credited in About and under each picture in the app).
// Needs ffmpeg and internet access. Run from the repository root: node tools/gym/build-art.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OUT = 'www/img/gym';
const UA = 'GameHub-build/1.0 (https://github.com/nugggy/sudoku-calm)';
// Commons file name -> picture name in the app
export const ART = {
  'Forward roll.png': 'forward_roll',
  'Backward roll.png': 'backward_roll',
  '伸膝前転.png': 'straight_leg_roll',
  '開脚後転.png': 'straddle_back_roll',
  'Bridge (exercise).png': 'bridge',
  'Handstand.png': 'handstand',
  '側方倒立回転.png': 'cartwheel',
  'Roundoff.png': 'roundoff',
  '倒立ブリッジ.png': 'handstand_bridge',
  'Handspring.png': 'handspring',
  '片足正面水平立ち.png': 'scale',
};

mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), 'gym-art.png');
for (const [file, name] of Object.entries(ART)) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=1400&titles=${encodeURIComponent('File:' + file)}`;
  const info = await (await fetch(api, { headers: { 'User-Agent': UA } })).json();
  const ii = Object.values(info.query.pages)[0].imageinfo[0];
  const png = Buffer.from(await (await fetch(ii.thumburl || ii.url, { headers: { 'User-Agent': UA } })).arrayBuffer());
  writeFileSync(tmp, png);
  // longest side at most 1400; keep transparency
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-vf', 'scale=1400:1400:force_original_aspect_ratio=decrease,format=rgba', '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', join(OUT, name + '.webp')]);
  console.log(`${file} -> ${name}.webp`);
}
rmSync(tmp, { force: true });
