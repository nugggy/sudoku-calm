// Dance Party songs, easiest first. Music by Kevin MacLeod (incompetech.com), licensed under Creative Commons:
// By Attribution 4.0 (creativecommons.org/licenses/by/4.0). tools/dance/build-songs.mjs trims and encodes them.
// look is the coach's outfit (hero/kit.js drawHero); colours are the stage: [top, bottom, lights].
import { SONG_DATA } from './songs-data.js';

const SONGS_RAW = [
  { id: 'kitsune', title: 'Kawai Kitsune', level: 1, coach: 'Kit',
    look: { base: 'fa', top: '#ff8a3d', legs: '#3b2a6b', emblem: 'star', emblemCol: '#ffe14d' }, colours: ['#2a1356', '#7b2fd0', '#ffb347'] },
  { id: 'medusae', title: 'Disco Medusae', level: 2, coach: 'Mae',
    look: { base: 'fp', top: '#27c9c0', legs: '#1d2a6b', emblem: 'star8', emblemCol: '#ff5fd2' }, colours: ['#08143d', '#1d4fa8', '#5ff3ff'] },
  { id: 'chunk', title: 'Funky Chunk', level: 3, coach: 'Dex',
    look: { base: 'mp', top: '#f2c230', legs: '#6b3fa0', emblem: 'bolt', emblemCol: '#d0232a' }, colours: ['#3a0d2e', '#b2245a', '#ffd23f'] },
  { id: 'cabello', title: 'Electro Cabello', level: 4, coach: 'Rio',
    look: { base: 'ma', top: '#ec5fa4', legs: '#14143a', emblem: 'star', emblemCol: '#7ff0ff' }, colours: ['#0b0b2e', '#3a1f8f', '#ff5fd2'] },
  { id: 'premises', title: 'Exit the Premises', level: 5, coach: 'Zara',
    look: { base: 'fa', top: '#e33b3b', legs: '#16161c', emblem: 'bolt', emblemCol: '#ffd23f' }, colours: ['#1a0606', '#7a1020', '#ff9a3c'] },
  { id: 'done', title: 'Getting it Done', level: 6, coach: 'Max',
    look: { base: 'mp', top: '#39d98a', legs: '#1b1b2f', emblem: 'star8', emblemCol: '#ffffff' }, colours: ['#04201a', '#0f6b52', '#b6ff5f'] },
];

export const LEVEL_NAMES = ['', 'Easy', 'Easy', 'Medium', 'Medium', 'Hard', 'Hard'];
export const SONGS = SONGS_RAW.map((s) => ({
  ...s, artist: 'Kevin MacLeod', src: `audio/dance/${s.id}.mp3`, ...SONG_DATA[s.id],
  look: { mask: 'none', cape: 'none', prop: 'none', ...s.look },
}));
export const songById = (id) => SONGS.find((s) => s.id === id);
