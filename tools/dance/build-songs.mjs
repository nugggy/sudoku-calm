// Builds the Dance Party songs: trims each Kevin MacLeod track (incompetech.com, CC-BY 4.0) to a routine of about
// two minutes, fades it out, encodes a small MP3 into www/audio/dance, and finds the beat grid so the moves land on
// the beat. Writes www/js/dance/songs-data.js. Needs ffmpeg on the PATH.
//   node tools/dance/build-songs.mjs <folder with the original MP3s>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// bpm is incompetech's figure; the script refines it and finds where the first beat falls.
const SONGS = [
  { id: 'kitsune', file: 'Kawai Kitsune.mp3', bpm: 116, from: 0, len: 120 },
  { id: 'medusae', file: 'Disco Medusae.mp3', bpm: 115, from: 0, len: 120 },
  { id: 'chunk', file: 'Funky Chunk.mp3', bpm: 115, from: 0, len: 120 },
  { id: 'cabello', file: 'Electro Cabello.mp3', bpm: 117, from: 0, len: 120 },
  { id: 'premises', file: 'Exit the Premises.mp3', bpm: 128, from: 0, len: 120 },
  { id: 'done', file: 'Getting it Done.mp3', bpm: 135, from: 0, len: 120 },
];
const RATE = 11025, HOP = 110; // about 10 ms per frame

const src = process.argv[2];
if (!src) { console.error('usage: node tools/dance/build-songs.mjs <folder with the original MP3s>'); process.exit(1); }
const outDir = 'www/audio/dance';
mkdirSync(outDir, { recursive: true });

function decode(file, from, len) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-t', String(len), '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

// Onset strength: rise in log energy frame to frame, with the low end (kick and bass) counted twice.
function onsets(x) {
  const n = Math.floor(x.length / HOP), env = new Float32Array(n);
  let lp = 0, prevA = 0, prevB = 0;
  for (let i = 0; i < n; i++) {
    let a = 0, b = 0;
    for (let k = i * HOP; k < (i + 1) * HOP; k++) { lp += 0.06 * (x[k] - lp); a += x[k] * x[k]; b += lp * lp; }
    a = Math.log(1e-6 + a); b = Math.log(1e-6 + b);
    env[i] = Math.max(0, a - prevA) + 2 * Math.max(0, b - prevB);
    prevA = a; prevB = b;
  }
  return env;
}

// Best beat period and phase near the given tempo, by summing onset strength on a beat grid.
function beatGrid(env, bpm) {
  const fps = RATE / HOP;
  let best = { score: -1 };
  for (let b = bpm - 1.5; b <= bpm + 1.5; b += 0.01) {
    const period = (60 / b) * fps;
    for (let ph = 0; ph < period; ph += 0.5) {
      let s = 0;
      for (let t = ph; t < env.length - 1; t += period) { const i = Math.floor(t), f = t - i; s += env[i] * (1 - f) + env[i + 1] * f; }
      if (s > best.score) best = { score: s, bpm: b, phase: ph / fps };
    }
  }
  return best;
}

const out = [];
for (const s of SONGS) {
  const file = join(src, s.file);
  const x = decode(file, s.from, s.len);
  const g = beatGrid(onsets(x), s.bpm);
  const beat = 60 / g.bpm;
  // end on a whole bar after the first beat, then fade over the last two bars
  const bars = Math.floor((s.len - g.phase) / (beat * 4));
  const end = g.phase + bars * beat * 4, fade = beat * 8;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(s.from), '-t', end.toFixed(3), '-i', file,
    '-af', `afade=t=out:st=${(end - fade).toFixed(3)}:d=${fade.toFixed(3)}`, '-ac', '2', '-ar', '44100', '-b:a', '112k', join(outDir, `${s.id}.mp3`)]);
  out.push({ id: s.id, bpm: +g.bpm.toFixed(3), first: +g.phase.toFixed(3), beats: bars * 4 });
  console.log(`${s.id}: ${g.bpm.toFixed(2)} bpm, first beat ${g.phase.toFixed(3)} s, ${bars} bars (${end.toFixed(1)} s)`);
}

writeFileSync('www/js/dance/songs-data.js', `// Built by tools/dance/build-songs.mjs: the beat grid of each song in www/audio/dance (first beat in seconds).
export const SONG_DATA = ${JSON.stringify(Object.fromEntries(out.map((o) => [o.id, { bpm: o.bpm, first: o.first, beats: o.beats }])), null, 0).replace(/},/g, '},\n  ').replace('{"', '{\n  "').replace(/}}$/, '},\n}')};
`);
