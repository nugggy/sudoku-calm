// Renders the Yeti Games sprites from the 3D models (run tools/yeti/server.mjs, then open /tool/render.html).
// Each sprite is a side view on a transparent background. Animated sprites are saved as one horizontal strip
// of frames that all share the same crop, so the character never jitters between frames. We also save
// www/img/yeti/sprites.json with each strip's frame size, the ground point under the model (ax, ay) and,
// where asked, a tracked bone position per frame (for example the yeti's hand).
//
//   ?preview=yeti      shows every animation of one model as a strip of frames, nothing is saved
//   ?only=name,name    renders just these sprites
//   ?dry               shows the sprites on the page without saving them
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SPRITES } from './sprites.mjs';

const P = new URLSearchParams(location.search);
const logEl = document.getElementById('log'), out = document.getElementById('out');
const log = (m) => { logEl.textContent = m; };
const post = (path, data) => fetch(path, { method: 'POST', body: data });
const SS = 2; // supersampling

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const loader = new GLTFLoader();
const cache = new Map();
async function load(key) {
  if (!cache.has(key)) cache.set(key, loader.loadAsync(`/models/${key}.glb`));
  const g = await cache.get(key);
  return { scene: cloneSkinned(g.scene), animations: g.animations };
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8fa8, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 0.9); rim.position.set(-4, 3, -3); scene.add(rim);
}

// Loads a model, scales it to `size` world units tall (or long, for `fit: 'x'`), stands it on y = 0 centred on x = z = 0.
async function place(spec) {
  const m = await load(spec.model);
  const holder = new THREE.Group(), pivot = new THREE.Group();
  pivot.add(m.scene); holder.add(pivot);
  m.scene.rotation.set(...(spec.rot || [0, 0, 0]).map((d) => (d * Math.PI) / 180));
  m.scene.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(m.scene);
  const sz = box.getSize(new THREE.Vector3());
  const k = (spec.size || 1) / (spec.fit === 'x' ? sz.x : spec.fit === 'z' ? sz.z : sz.y);
  pivot.scale.setScalar(k);
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  pivot.position.set(-c.x, -box.min.y, -c.z);
  return { holder, root: m.scene, animations: m.animations };
}

const findClip = (anims, name) => anims.find((a) => a.name === name || a.name.endsWith('|' + name));

// Builds the scene for one sprite and returns a function that poses frame i of n.
async function build(job) {
  const scene = new THREE.Scene(); lights(scene);
  const main = await place(job);
  scene.add(main.holder);
  for (const a of job.attach || []) {
    const part = await place(a);
    let bone = null; main.root.traverse((o) => { if (o.name === a.bone) bone = o; });
    if (!bone) throw new Error(`${job.name}: no bone ${a.bone}`);
    // undo the bone's world scale so the prop keeps its own size in world units
    main.holder.updateMatrixWorld(true);
    const s = new THREE.Vector3(); bone.getWorldScale(s);
    const g = new THREE.Group(); g.add(part.holder);
    g.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    g.position.set(...(a.pos || [0, 0, 0]).map((v, i) => v / [s.x, s.y, s.z][i]));
    part.holder.rotation.set(...(a.prot || [0, 0, 0]).map((d) => (d * Math.PI) / 180));
    bone.add(g);
  }
  main.holder.rotation.y = ((job.yaw ?? 0) * Math.PI) / 180;
  main.holder.rotation.z = ((job.roll ?? 0) * Math.PI) / 180;
  const mixer = new THREE.AnimationMixer(main.root);
  const clip = job.anim ? findClip(main.animations, job.anim) : null;
  if (job.anim && !clip) throw new Error(`${job.name}: no animation ${job.anim}`);
  const action = clip ? mixer.clipAction(clip) : null;
  if (action) { action.play(); }
  const track = {}; for (const b of [].concat(job.track || [])) main.root.traverse((o) => { if (o.name === b) track[b] = o; });
  const pose = (i, n) => {
    if (action) {
      const t0 = job.t0 ?? 0, t1 = job.t1 ?? (job.loop === false ? 1 : 1 - 1 / n);
      const f = n === 1 ? (job.at ?? t0) : t0 + (t1 - t0) * (i / Math.max(1, n - 1));
      mixer.setTime(f * clip.duration);
    }
    scene.updateMatrixWorld(true);
  };
  return { scene, pose, track };
}

// Side camera: looking from +z, a little from above and from the front-right so the shapes read in 3D.
function camera(view = {}) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
  const yaw = ((view.yaw ?? 18) * Math.PI) / 180, el = ((view.el ?? 8) * Math.PI) / 180;
  cam.position.set(Math.sin(yaw) * Math.cos(el) * 10, Math.sin(el) * 10, Math.cos(yaw) * Math.cos(el) * 10);
  cam.lookAt(0, 0, 0);
  return cam;
}

const WORLD = 6; // world units visible across the render area before cropping
async function renderJob(job, { preview = false } = {}) {
  const { scene, pose, track } = await build(job);
  const n = job.frames || 1;
  const px = job.px || 60; // output pixels per world unit
  const span = Math.max(WORLD, (job.size || 1) * 2.4);
  const S = Math.ceil(span * px * SS);
  renderer.setSize(S, S, false);
  const cam = camera(job.view); cam.left = -span / 2; cam.right = span / 2; cam.top = span * 0.62; cam.bottom = -span * 0.38; cam.updateProjectionMatrix();
  // first pass: render each frame and find the union of the opaque pixels
  const frames = [], marks = Object.fromEntries(Object.keys(track).map((b) => [b, []]));
  let x0 = S, y0 = S, x1 = 0, y1 = 0;
  const gl = renderer.getContext();
  for (let i = 0; i < n; i++) {
    pose(i, n);
    renderer.render(scene, cam);
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, S, S).data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    frames.push(c);
    for (const [b, o] of Object.entries(track)) { const p = new THREE.Vector3(); o.getWorldPosition(p); p.project(cam); marks[b].push([(p.x + 1) / 2 * S, (1 - p.y) / 2 * S]); }
  }
  const pad = 2 * SS;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(S - 1, x1 + pad); y1 = Math.min(S - 1, y1 + pad);
  const w = Math.ceil((x1 - x0 + 1) / SS), h = Math.ceil((y1 - y0 + 1) / SS);
  const strip = document.createElement('canvas'); strip.width = w * n; strip.height = h;
  const g = strip.getContext('2d'); g.imageSmoothingQuality = 'high';
  frames.forEach((c, i) => g.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, i * w, 0, w, h));
  // ground point: where world (0, 0, 0) lands in the cropped frame
  const o = new THREE.Vector3(0, 0, 0).project(cam);
  const ax = +(((o.x + 1) / 2 * S - x0) / SS).toFixed(1), ay = +(((1 - o.y) / 2 * S - y0) / SS).toFixed(1);
  const meta = { w, h, n, ax, ay, px: job.px || 60 }; // px: pixels per world unit, so games can size sprites in world units
  if (Object.keys(marks).length) meta.track = Object.fromEntries(Object.entries(marks).map(([b, list]) => [b, list.map(([x, y]) => [+((x - x0) / SS).toFixed(1), +((y - y0) / SS).toFixed(1)])]));
  if (preview) {
    const div = document.createElement('div'); div.innerHTML = `<b>${job.name}</b> ${w}×${h}×${n}`;
    const s = document.createElement('div'); s.className = 'strip';
    frames.forEach((_, i) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const cg = c.getContext('2d');
      cg.drawImage(strip, i * w, 0, w, h, 0, 0, w, h);
      // tracked bones as coloured dots, and the ground point as a cross
      Object.values(meta.track || {}).forEach((list, k) => { cg.fillStyle = ['#e00', '#00f', '#0a0'][k % 3]; cg.beginPath(); cg.arc(list[i][0], list[i][1], 2.5, 0, 7); cg.fill(); });
      cg.strokeStyle = '#f0f'; cg.beginPath(); cg.moveTo(ax - 4, ay); cg.lineTo(ax + 4, ay); cg.moveTo(ax, ay - 4); cg.lineTo(ax, ay + 4); cg.stroke();
      const im = new Image(); im.src = c.toDataURL(); s.appendChild(im);
    });
    div.appendChild(s); out.appendChild(div);
    return meta;
  }
  const blob = await new Promise((r) => strip.toBlob(r, 'image/webp', 0.92));
  await post(`/save?file=img/${job.name}.webp`, blob);
  const im = new Image(); im.src = URL.createObjectURL(blob); im.style.cssText = 'height:90px;background:#fff;margin:2px'; im.title = job.name; out.appendChild(im);
  return meta;
}

(async () => {
  try {
    if (P.get('preview')) {
      const key = P.get('preview');
      const { animations } = await load(key);
      const anims = P.get('anims') ? P.get('anims').split(',') : animations.map((a) => a.name.split('|').pop()).filter((v, i, a) => a.indexOf(v) === i);
      for (const a of anims) { log(a); await renderJob({ name: `${key} ${a}`, model: key, anim: a, frames: +(P.get('frames') || 8), size: +(P.get('size') || 2.4), yaw: +(P.get('yaw') || 90), px: 40, loop: false }, { preview: true }); }
      log('done'); window.done = true; return;
    }
    const only = P.get('only') ? P.get('only').split(',') : null;
    let meta = {};
    if (only) { try { meta = await (await fetch('/www/img/yeti/sprites.json')).json(); } catch { meta = {}; } }
    for (const job of SPRITES) {
      if (only && !only.includes(job.name)) continue;
      log(job.name);
      meta[job.name] = await renderJob(job, { preview: P.has('dry') });
    }
    if (!P.has('dry')) await post('/save?file=img/sprites.json', JSON.stringify(meta));
    log('done'); window.done = true; post('/done', '');
  } catch (e) { log('ERROR ' + e.message); post('/log', 'ERROR ' + e.stack); window.done = 'error'; }
})();
