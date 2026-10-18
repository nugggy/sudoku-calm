// Renders the motorbike games' sprites (run tools/moto/server.mjs, then open /tool/render.html).
// Bikes are drawn in two layers that share one crop: the bike on its own (so the garage can repaint it with a
// hue filter) and, for each rider, the rider alone with the bike used as an invisible mask, so legs and arms
// that should be hidden behind the bike stay hidden. Everything faces right; 'top' views look straight down.
// Results go to www/img/moto/*.webp and www/img/moto/sprites.json:
//   { w, h, n, ax, ay, px, wheels?: [[x, y, r] rear, [x, y, r] front] }  (pixels in the frame, px = pixels per metre)
//   ?dry shows without saving, ?only=a,b renders just those jobs
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { JOBS } from './sprites.mjs';

const P = new URLSearchParams(location.search);
const logEl = document.getElementById('log'), out = document.getElementById('out');
const log = (m) => { logEl.textContent = m; };
const post = (path, data) => fetch(path, { method: 'POST', body: data });
const SS = 2;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const loader = new GLTFLoader();
const cache = new Map();
// 'm:bike_a' is a downloaded model, 'k:car-kit/taxi' a Kenney kit model in GLB, 'kt:racing-kit/ramp' one in GLTF
function urlOf(ref) {
  const [kind, rest] = ref.split(/:(.*)/s);
  if (kind === 'm') return `/models/${rest}.glb`;
  const [kit, ...name] = rest.split('/');
  return kind === 'kt' ? `/kenney/${kit}/Models/GLTF format/${name.join('/')}.glb` : `/kenney/${kit}/Models/GLB format/${name.join('/')}.glb`;
}
async function load(ref) {
  if (!cache.has(ref)) cache.set(ref, loader.loadAsync(urlOf(ref)));
  const g = await cache.get(ref);
  return { scene: cloneSkinned(g.scene), animations: g.animations };
}
function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8fa8, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(2, 5, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 0.8); rim.position.set(-4, 3, -3); scene.add(rim);
}
const deg = (d) => (d * Math.PI) / 180;

// Scales a model so its length (fit axis) is `size` metres, faces it right (yaw), stands it on y = 0, centred.
async function place(spec) {
  const m = await load(spec.ref);
  const holder = new THREE.Group(), pivot = new THREE.Group();
  pivot.add(m.scene); holder.add(pivot);
  pivot.rotation.y = deg(spec.yaw || 0);
  holder.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(pivot);
  const sz = box.getSize(new THREE.Vector3());
  const k = (spec.size || 1) / (spec.fit === 'y' ? sz.y : spec.fit === 'z' ? sz.z : spec.fit === 'max' ? Math.max(sz.x, sz.y, sz.z) : sz.x);
  pivot.scale.setScalar(k);
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(pivot);
  const c = box.getCenter(new THREE.Vector3());
  pivot.position.set(-c.x, -box.min.y, -c.z);
  return { holder, root: m.scene, animations: m.animations, size: box.getSize(new THREE.Vector3()) };
}
const findClip = (anims, name) => anims.find((a) => a.name === name || a.name.endsWith('|' + name));
function poseAt(model, anim, f) {
  if (!anim) return;
  const clip = findClip(model.animations, anim);
  if (!clip) throw new Error(`no animation ${anim}`);
  const mixer = new THREE.AnimationMixer(model.root); mixer.clipAction(clip).play(); mixer.setTime(f * clip.duration);
}

function camera(view, span) {
  const cam = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, -50, 50);
  if (view === 'icon') { const yaw = deg(35), el = deg(32); cam.position.set(Math.sin(yaw) * Math.cos(el) * 10, Math.sin(el) * 10, Math.cos(yaw) * Math.cos(el) * 10); cam.lookAt(0, 0, 0); cam.top = span * 0.6; cam.bottom = -span * 0.4; }
  else if (view === 'top') { cam.position.set(0, 20, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.top = span / 2; cam.bottom = -span / 2; }
  else { const yaw = deg(14), el = deg(6); cam.position.set(Math.sin(yaw) * 10, Math.sin(el) * 10, Math.cos(yaw) * 10); cam.lookAt(0, 0, 0); cam.top = span * 0.66; cam.bottom = -span * 0.34; }
  cam.updateProjectionMatrix();
  return cam;
}

function snap(scene, cam, S) {
  renderer.render(scene, cam);
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  c.getContext('2d').drawImage(renderer.domElement, 0, 0);
  return c;
}
function bounds(c, S, b) {
  const d = c.getContext('2d').getImageData(0, 0, S, S).data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 8) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
}

// Renders one job into one or more layers (each a list of frames) sharing a crop.
async function renderJob(job, { preview }) {
  const view = job.view || 'side', px = job.px || 80;
  const span = Math.max(4, (job.size || 2) * 1.8);
  const S = Math.ceil(span * px * SS);
  renderer.setSize(S, S, false);
  const cam = camera(view, span);
  const layers = []; // {name, frames: [canvas]}
  const b = { x0: S, y0: S, x1: 0, y1: 0 };
  const n = job.frames || 1;

  const scene = new THREE.Scene(); lights(scene);
  const main = await place(job);
  if (job.roll) main.holder.rotation.z = deg(job.roll);
  scene.add(main.holder);
  const frameAt = (i) => (n === 1 ? (job.at ?? 0) : (job.t0 ?? 0) + ((job.t1 ?? 1) - (job.t0 ?? 0)) * (i / Math.max(1, n - 1)));
  // main layer (the bike, a car, a prop or an animated rider)
  const mainFrames = [];
  for (let i = 0; i < n; i++) { poseAt(main, job.anim, frameAt(i)); scene.updateMatrixWorld(true); const c = snap(scene, cam, S); bounds(c, S, b); mainFrames.push(c); }
  layers.push({ name: job.name, frames: mainFrames });

  // rider layers: the bike stays in the scene but only writes depth, so it hides the far side of the rider
  for (const r of job.riders || []) {
    const rider = await place({ ref: r.ref, size: job.rider.size, fit: 'y', yaw: job.rider.yaw ?? 90 });
    poseAt(rider, job.rider.anim || 'drive', job.rider.at ?? 0.3);
    rider.holder.position.set(...job.rider.seat);
    rider.holder.rotation.z = deg(job.rider.lean || 0);
    if (job.roll) { const g = new THREE.Group(); g.rotation.z = deg(job.roll); g.add(rider.holder); scene.add(g); } else scene.add(rider.holder);
    const mats = [];
    main.holder.traverse((o) => { if (o.isMesh) { mats.push([o, o.material]); o.material = new THREE.MeshBasicMaterial({ colorWrite: false }); } });
    scene.updateMatrixWorld(true);
    const c = snap(scene, cam, S); bounds(c, S, b);
    layers.push({ name: `${job.name}__${r.id}`, frames: [c] });
    for (const [o, m] of mats) o.material = m;
    rider.holder.parent.remove(rider.holder);
  }

  const pad = 2 * SS;
  b.x0 = Math.max(0, b.x0 - pad); b.y0 = Math.max(0, b.y0 - pad); b.x1 = Math.min(S - 1, b.x1 + pad); b.y1 = Math.min(S - 1, b.y1 + pad);
  const w = Math.ceil((b.x1 - b.x0 + 1) / SS), h = Math.ceil((b.y1 - b.y0 + 1) / SS);
  const o = new THREE.Vector3(0, 0, 0).project(cam);
  const ax = +(((o.x + 1) / 2 * S - b.x0) / SS).toFixed(1), ay = +(((1 - o.y) / 2 * S - b.y0) / SS).toFixed(1);
  const metas = {};
  for (const L of layers) {
    const strip = document.createElement('canvas'); strip.width = w * L.frames.length; strip.height = h;
    const g = strip.getContext('2d'); g.imageSmoothingQuality = 'high';
    L.frames.forEach((c, i) => g.drawImage(c, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, i * w, 0, w, h));
    const meta = { w, h, n: L.frames.length, ax, ay, px };
    if (L === layers[0] && job.wheels && view === 'side') meta.wheels = findWheels(strip, w, h, job.wheels);
    metas[L.name] = meta;
    if (preview) {
      const c2 = document.createElement('canvas'); c2.width = strip.width; c2.height = h; const g2 = c2.getContext('2d');
      if (L !== layers[0]) { const base = layers[0]; g2.globalAlpha = 1; } // rider layers are shown composed below
      g2.drawImage(strip, 0, 0);
      const im = new Image(); im.src = c2.toDataURL(); im.title = L.name; im.style.cssText = 'max-height:140px;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px;margin:2px';
      out.appendChild(im);
    } else {
      const blob = await new Promise((r) => strip.toBlob(r, 'image/webp', 0.92));
      await post(`/save?file=img/${L.name}.webp`, blob);
    }
  }
  if (preview && layers.length > 1) { // composed preview: bike, then each rider on top
    for (const L of layers.slice(1)) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.drawImage(layers[0].frames[0], b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, 0, 0, w, h);
      g.drawImage(L.frames[0], b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, 0, 0, w, h);
      const wl = metas[layers[0].name].wheels; if (wl) { g.strokeStyle = '#e00'; for (const [x, y, r] of wl) { g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); } }
      const im = new Image(); im.src = c.toDataURL(); im.title = L.name + ' composed'; im.style.cssText = 'max-height:180px;background:#cfe6f5;margin:2px;outline:2px solid #39f'; out.appendChild(im);
    }
  }
  return metas;
}

// Wheel centres from the bike's silhouette: the lowest opaque pixel in the back and front thirds is where each
// tyre touches the ground; the radius comes from the job (fraction of the bike's pixel length).
function findWheels(strip, w, h, rFrac) {
  const d = strip.getContext('2d').getImageData(0, 0, w, h).data;
  const lowest = (xa, xb) => { let best = [0, -1]; for (let x = xa; x < xb; x++) for (let y = h - 1; y >= 0; y--) { if (d[(y * w + x) * 4 + 3] > 40) { if (y > best[1]) best = [x, y]; break; } } return best; };
  // average the columns that reach the lowest row, to find the middle of each tyre's contact patch
  const centre = (xa, xb) => { const [, yl] = lowest(xa, xb); const xs = []; for (let x = xa; x < xb; x++) for (let y = h - 1; y >= yl - 1; y--) if (d[(y * w + x) * 4 + 3] > 40) { xs.push(x); break; } return [xs.reduce((a, v) => a + v, 0) / xs.length, yl]; };
  const r = rFrac * w;
  const [xr, yr] = centre(0, Math.floor(w * 0.42)), [xf, yf] = centre(Math.ceil(w * 0.58), w);
  return [[+xr.toFixed(1), +(yr - r).toFixed(1), +r.toFixed(1)], [+xf.toFixed(1), +(yf - r).toFixed(1), +r.toFixed(1)]];
}

(async () => {
  try {
    const only = P.get('only') ? P.get('only').split(',') : null;
    let meta = {};
    if (only && !P.has('dry')) { try { meta = await (await fetch('/www/img/moto/sprites.json')).json(); } catch { meta = {}; } }
    for (const job of JOBS) {
      if (only && !only.includes(job.name)) continue;
      log(job.name);
      Object.assign(meta, await renderJob(job, { preview: P.has('dry') }));
    }
    if (!P.has('dry')) await post('/save?file=img/sprites.json', JSON.stringify(meta));
    log('done'); window.done = true; if (!P.has('dry')) post('/done', '');
  } catch (e) { log('ERROR ' + e.message); post('/log', 'ERROR ' + e.stack); window.done = 'error'; }
})();
