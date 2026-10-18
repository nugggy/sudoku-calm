// Moto Rush: a 3D three-lane runner through city streets on your own bike (three.js).
// Swipe left/right to change lanes, up to jump, down to slide (or drop fast in the air). Dodge parked and oncoming
// traffic, jump low barriers, slide under high ones, take ramps onto truck roofs, grab coins and power-ups.
// Score = distance + 10 per coin; the coins you grab also go to your wallet.
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/three/addons/utils/SkeletonUtils.js';
import { snd, buzz, clamp, lerp, fmt, roundRect } from '../yeti/kit.js';
import { ride, stat, drawBike, coinIcon } from './kit.js';

const LANE = 3.0;                     // metres between lane centres
const LANES = [-LANE, 0, LANE];
const AHEAD = 120;                    // how far ahead things are spawned (hidden by fog)
const BEHIND = 14;                    // how far behind things are recycled
const G = 30;                         // gravity
const SPAN = 200;                     // length of the recycled scenery strip
// Where the rider sits on each bike (metres; x is forward/back along the bike, y up), matching tools/moto/sprites.mjs.
const FIT = {
  sport: { len: 2.1, yaw: Math.PI, seat: [-0.32, 0.5], lean: -8 },
  cruiser: { len: 2.3, yaw: Math.PI / 2, seat: [-0.32, 0.42], lean: 0 },
  chopper: { len: 2.4, yaw: Math.PI, seat: [-0.42, 0.4], lean: 0 },
  scooter: { len: 1.8, yaw: Math.PI, seat: [-0.3, 0.44], lean: 0 },
  dirt: { len: 2.1, yaw: Math.PI, seat: [-0.22, 0.6], lean: -5 },
};
const M = 'models/moto/';
const PASTEL = ['#ffd9c2', '#cfe6ff', '#d6f2cc', '#fff0b3', '#f2d4f5', '#dcdcff', '#ffdbe3', '#e8e2d6'];
const FILES = {
  sedan: 'car-kit/sedan.glb', taxi: 'car-kit/taxi.glb', van: 'car-kit/van.glb', truck: 'car-kit/truck.glb', delivery: 'car-kit/delivery.glb',
  b1: 'city-kit-commercial/low-detail-building-a.glb', b2: 'city-kit-commercial/low-detail-building-b.glb', b3: 'city-kit-commercial/low-detail-building-c.glb',
  b4: 'city-kit-commercial/low-detail-building-d.glb', b5: 'city-kit-commercial/low-detail-building-e.glb', b6: 'city-kit-commercial/low-detail-building-f.glb',
  b7: 'city-kit-commercial/low-detail-building-wide-a.glb',
  works: 'city-kit-roads/construction-barrier.glb', cone: 'city-kit-roads/construction-cone.glb', lamp: 'city-kit-roads/light-square.glb',
  treeL: 'city-kit-suburban/tree-large.glb', treeS: 'city-kit-suburban/tree-small.glb',
  ramp: 'racing-kit/ramp.glb', barRed: 'racing-kit/barrierRed.glb', barWhite: 'racing-kit/barrierWhite.glb',
};
const loader = new GLTFLoader();
const cache = new Map();
const loadGLB = (url) => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url); };

// Normalises a model: turns it, scales it so `axis` measures `size`, centres it on x/z and stands it on y = 0.
function fitModel(src, { size, axis = 'z', yaw = 0 }) {
  const inner = cloneSkinned(src), turn = new THREE.Group(), out = new THREE.Group();
  turn.add(inner); turn.rotation.y = yaw; out.add(turn);
  out.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(turn);
  const s = box.getSize(new THREE.Vector3());
  turn.scale.setScalar(size / (axis === 'x' ? s.x : axis === 'y' ? s.y : s.z));
  out.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(turn);
  const c = box.getCenter(new THREE.Vector3());
  turn.position.set(-c.x, -box.min.y, -c.z);
  out.userData.size = box.getSize(new THREE.Vector3());
  return out;
}
// Wraps a fitted model so it is exactly h metres tall (keeps its length and width).
function squash(model, h) { const g = new THREE.Group(); model.scale.y = h / model.userData.size.y; g.add(model); g.userData.size = model.userData.size.clone().setY(h); return g; }
// A red and white striped beam texture for the overhead roadworks barrier.
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e8372c'; g.beginPath(); g.moveTo(i * 32, 32); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 32, 32); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Road texture: asphalt with dashed lane lines and solid edge lines (one tile = 16 m).
function roadTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#5b606b'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2); }
  g.fillStyle = '#f2f2f2'; g.fillRect(6, 0, 6, 512); g.fillRect(244, 0, 6, 512);
  g.fillStyle = '#f4d03f';
  for (const x of [256 / 3, 512 / 3]) for (let y = 0; y < 512; y += 128) g.fillRect(x - 3, y + 20, 6, 70);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// Recolours a texture's painted pixels to the paint colour (dark and grey parts stay as they are).
const tinted = new Map();
function tintTexture(tex, th) {
  const key = tex.uuid + th.h + th.s + th.l;
  if (tinted.has(key)) return tinted.get(key);
  const im = tex.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), px = data.data, col = new THREE.Color(), hsl = {};
  for (let i = 0; i < px.length; i += 4) {
    col.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace); col.getHSL(hsl, THREE.SRGBColorSpace);
    if (hsl.l < 0.16 || (hsl.s < 0.12 && hsl.l < 0.62)) continue;
    col.setHSL(th.h, Math.max(0.25, th.s * 0.95), clamp(th.l * 0.55 + hsl.l * 0.4, 0.08, 0.85), THREE.SRGBColorSpace);
    const o = {}; col.getRGB(o, THREE.SRGBColorSpace);
    px[i] = o.r * 255; px[i + 1] = o.g * 255; px[i + 2] = o.b * 255;
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.colorSpace = tex.colorSpace; t.magFilter = tex.magFilter; t.minFilter = tex.minFilter;
  tinted.set(key, t);
  return t;
}
function tintBike(root, hex) {
  if (!hex) return;
  const t = new THREE.Color(hex), th = {}; t.getHSL(th);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) {
      if (!m.color) continue;
      if (m.map && m.map.image) { try { m.map = tintTexture(m.map, th); } catch { m.color.lerp(t, 0.6); } continue; } // textured: recolour the texture
      const hsl = {}; m.color.getHSL(hsl);
      if (hsl.l < 0.16 || (hsl.s < 0.12 && hsl.l < 0.62)) continue; // tyres, seats and metal stay as they are
      m.color.setHSL(th.h, Math.max(0.25, th.s * 0.95), clamp(th.l * 0.55 + hsl.l * 0.4, 0.08, 0.85));
    }
  });
}

export default {
  id: 'rush', name: 'Moto Rush', blurb: 'Weave through city traffic in 3D, grab coins and power-ups', unit: 'pts',
  theme: ['#7cc6f5', '#cde9ff', '#f3e3c8'],
  how: [
    'Swipe left or right to change lanes. Swipe up to jump and swipe down to slide under barriers (or drop fast in the air).',
    'Jump the low striped barriers and slide under the high roadworks barriers. Parked and oncoming cars must be dodged, but ramps launch you onto truck roofs for a coin run.',
    'Power-ups: magnet pulls in coins, the shield saves you from one crash and nitro is a burst of speed that smashes through everything.',
    'Brushing a car from the side is a close call. Two close calls in a row and you are down. Score is distance plus 10 per coin, and every coin goes to your garage wallet.',
  ],
  thumb(g, w, h) {
    // a little perspective road with the bike riding up it
    g.fillStyle = '#8fcf72'; g.fillRect(0, h * 0.45, w, h);
    g.fillStyle = '#5b606b'; g.beginPath(); g.moveTo(w * 0.43, h * 0.45); g.lineTo(w * 0.57, h * 0.45); g.lineTo(w * 0.95, h); g.lineTo(w * 0.05, h); g.closePath(); g.fill();
    g.strokeStyle = '#f4d03f'; g.lineWidth = 2; g.setLineDash([6, 6]);
    for (const k of [-1, 1]) { g.beginPath(); g.moveTo(w * 0.5 + k * w * 0.023, h * 0.45); g.lineTo(w * 0.5 + k * w * 0.15, h); g.stroke(); }
    g.setLineDash([]);
    for (let i = 0; i < 3; i++) coinIcon(g, w * 0.5, h * (0.52 + i * 0.1), 3 + i * 1.5, i);
    drawBike(g, w * 0.72, h * 0.97, h * 0.24);
  },

  create(ctx) {
    const { bike, paint, rider: riderInfo } = ride();
    const fit = FIT[bike.id] || FIT.scooter;
    const SP = stat('speed'), PW = stat('power'), GR = stat('grip'), HD = stat('handling');
    // ---------- three.js setup ----------
    const canvas = document.createElement('canvas'); canvas.className = 'moto-gl';
    ctx.stage.insertBefore(canvas, ctx.stage.firstChild);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const SKY = new THREE.Color('#a9dcff');
    scene.background = SKY; scene.fog = new THREE.Fog(SKY, 45, AHEAD - 5);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a6a, 1.9));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2); sun.position.set(6, 12, 5); scene.add(sun);
    const resize = () => { renderer.setSize(Math.max(1, ctx.W), Math.max(1, ctx.H)); camera.aspect = ctx.W / Math.max(1, ctx.H); camera.updateProjectionMatrix(); };
    resize();

    const disposables = [];
    const own = (x) => { disposables.push(x); return x; };
    // road, pavement and grass
    const roadTex = own(roadTexture());
    roadTex.repeat.set(1, SPAN / 16);
    const road = new THREE.Mesh(own(new THREE.PlaneGeometry(LANE * 3 + 0.6, SPAN)), own(new THREE.MeshLambertMaterial({ map: roadTex })));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -SPAN / 2 + BEHIND); scene.add(road);
    const walkMat = own(new THREE.MeshLambertMaterial({ color: '#d9d2c4' })), curbMat = own(new THREE.MeshLambertMaterial({ color: '#b9b2a6' }));
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(own(new THREE.BoxGeometry(3.4, 0.18, SPAN)), walkMat); walk.position.set(s * (LANE * 1.5 + 0.3 + 1.7), 0.09, -SPAN / 2 + BEHIND); scene.add(walk);
      const curb = new THREE.Mesh(own(new THREE.BoxGeometry(0.25, 0.22, SPAN)), curbMat); curb.position.set(s * (LANE * 1.5 + 0.42), 0.11, -SPAN / 2 + BEHIND); scene.add(curb);
    }
    const grass = new THREE.Mesh(own(new THREE.PlaneGeometry(160, SPAN + 60)), own(new THREE.MeshLambertMaterial({ color: '#94cf74' })));
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.02, -SPAN / 2); scene.add(grass);

    // ---------- state ----------
    let ready = false, failed = false;
    let d = 0, speed = 0, t = 0, coins = 0, bonus = 0, over = false, overT = 0, started = false, introT = 0;
    const P = { lane: 1, tx: 0, x: 0, y: 0, vy: 0, air: false, duck: 0, prevLane: 1, laneT: 0, stumbleT: -9, lean: 0 };
    const power = { magnet: 0, nitro: 0, shield: false };
    const objs = [];         // active obstacles, coins and power-ups: {kind, s, lane, x, mesh, ...}
    const pools = {};        // kind -> spare meshes
    const scenery = [];      // buildings, trees, lamps
    const floaters = [];     // 2D floating texts {x, y, z, s, t, color}
    let spawnS = 70, nextPower = 260 + Math.random() * 200, flash = 0;
    let rig = null, bikeObj = null, riderObj = null, mixer = null, clips = {}, tumble = null, shieldMesh = null, shadow = null;
    const templates = {};
    const coinGeo = own(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20)); coinGeo.rotateX(Math.PI / 2);
    const coinMat = own(new THREE.MeshLambertMaterial({ color: '#ffd34d', emissive: '#b37800', emissiveIntensity: 0.55 }));

    // ---------- loading ----------
    ctx.prompt('Loading the city…');
    (async () => {
      try {
        const entries = await Promise.all(Object.entries(FILES).map(async ([k, f]) => [k, (await loadGLB(M + f)).scene]));
        const src = Object.fromEntries(entries);
        const [bk, rd] = await Promise.all([loadGLB(bike.model), loadGLB(riderInfo.model)]);
        if (over === 'destroyed') return;
        // vehicles face the player's direction of travel (native front is +z, travel is -z)
        const CAR_LEN = { sedan: 4.2, taxi: 4.2, van: 4.4, truck: 4.8, delivery: 5.2 };
        for (const k of Object.keys(CAR_LEN)) templates[k] = fitModel(src[k], { size: CAR_LEN[k], yaw: Math.PI });
        for (const k of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']) templates[k] = fitModel(src[k], { size: 13 + Math.random() * 7, axis: 'y', yaw: Math.PI / 2 });
        templates.works = fitModel(src.works, { size: LANE - 0.3, axis: 'x', yaw: Math.PI / 2 });
        templates.cone = fitModel(src.cone, { size: 0.75, axis: 'y' });
        templates.lamp = fitModel(src.lamp, { size: 6, axis: 'y' });
        templates.treeL = fitModel(src.treeL, { size: 6.5, axis: 'y' });
        templates.treeS = fitModel(src.treeS, { size: 4.5, axis: 'y' });
        templates.bar = [squash(fitModel(src.barRed, { size: LANE - 0.3, axis: 'x' }), 0.85), squash(fitModel(src.barWhite, { size: LANE - 0.3, axis: 'x' }), 0.85)];
        // the ramp: find which end is high so it rises away from the rider
        let ramp = fitModel(src.ramp, { size: 3.6 });
        const pos = []; ramp.traverse((o) => { if (o.isMesh) { o.updateMatrixWorld(true); const a = o.geometry.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); pos.push([v.y, v.z]); } } });
        const zs = pos.map((p) => p[1]), zMid = (Math.min(...zs) + Math.max(...zs)) / 2;
        const hiFront = pos.filter((p) => p[1] < zMid).reduce((a, p) => Math.max(a, p[0]), 0), hiBack = pos.filter((p) => p[1] >= zMid).reduce((a, p) => Math.max(a, p[0]), 0);
        if (hiBack > hiFront) ramp = fitModel(src.ramp, { size: 3.6, yaw: Math.PI });
        templates.ramp = ramp;
        templates.rampH = Math.max(hiFront, hiBack);
        // overhead roadworks barrier: a striped beam up on two poles with flashing lights
        const ovh = new THREE.Group();
        const beam = new THREE.Mesh(own(new THREE.BoxGeometry(LANE - 0.3, 0.55, 0.22)), own(new THREE.MeshLambertMaterial({ map: own(stripeTexture()) })));
        beam.position.y = 1.45; ovh.add(beam);
        const poleMat = own(new THREE.MeshLambertMaterial({ color: '#e8e8e8' })), poleGeo = own(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 8));
        for (const s of [-1, 1]) { const p = new THREE.Mesh(poleGeo, poleMat); p.position.set(s * (LANE / 2 - 0.25), 0.95, 0); ovh.add(p); }
        const lightMat = own(new THREE.MeshBasicMaterial({ color: '#ffb000' })), lightGeo = own(new THREE.SphereGeometry(0.11, 10, 8));
        for (const s of [-1, 1]) { const l = new THREE.Mesh(lightGeo, lightMat); l.position.set(s * (LANE / 2 - 0.25), 1.95, 0); ovh.add(l); }
        templates.overhead = ovh;
        buildPlayer(bk, rd);
        buildScenery();
        // the first stretch is clear with a line of coins to get going
        for (let i = 0; i < 6; i++) addCoin(30 + i * 3, 1, 0.9);
        ready = true; started = true;
        camera.position.set(0, 4.9, 8.2);
        ctx.prompt('Swipe left or right to change lanes');
      } catch (e) {
        failed = true; console.error(e); ctx.prompt('Could not load the 3D city');
      }
    })();

    function buildPlayer(bk, rd) {
      rig = new THREE.Group(); scene.add(rig);
      const lean = new THREE.Group(); rig.add(lean); rig.userData.lean = lean;
      bikeObj = fitModel(bk.scene, { size: fit.len, yaw: fit.yaw });
      tintBike(bikeObj, paint.tint);
      lean.add(bikeObj);
      // the rider sits at the seat, facing down the road, in the 'drive' pose
      riderObj = fitModel(rd.scene, { size: 1.2, axis: 'y', yaw: Math.PI });
      riderObj.position.set(0, fit.seat[1], -fit.seat[0]);
      riderObj.rotation.x = THREE.MathUtils.degToRad(fit.lean);
      lean.add(riderObj);
      mixer = new THREE.AnimationMixer(riderObj);
      for (const c of rd.animations) clips[c.name] = c;
      if (clips.drive) mixer.clipAction(clips.drive).play();
      // blob shadow and shield bubble
      shadow = new THREE.Mesh(own(new THREE.CircleGeometry(0.9, 24)), own(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false })));
      shadow.rotation.x = -Math.PI / 2; shadow.scale.set(0.7, 1.4, 1); scene.add(shadow);
      shieldMesh = new THREE.Mesh(own(new THREE.SphereGeometry(1.5, 24, 16)), own(new THREE.MeshBasicMaterial({ color: '#5ad1ff', transparent: true, opacity: 0.22, depthWrite: false })));
      shieldMesh.position.y = 1; shieldMesh.visible = false; rig.add(shieldMesh);
    }
    function buildScenery() {
      const kinds = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'];
      for (const side of [-1, 1]) {
        // buildings set back behind the pavement, trees and lamps along the kerb
        for (let s = -BEHIND; s < SPAN - BEHIND; s += 10 + Math.random() * 4) {
          const k = kinds[(Math.random() * kinds.length) | 0];
          const m = templates[k].clone(); const sz = templates[k].userData.size;
          const tint = PASTEL[(Math.random() * PASTEL.length) | 0];
          m.traverse((o) => { if (o.isMesh) { o.material = own(o.material.clone()); o.material.color.set(tint); } });
          m.userData.half = sz.x / 2;
          m.position.x = side * (LANE * 1.5 + 4.2 + sz.x / 2 + Math.random() * 1.5);
          m.rotation.y = side > 0 ? Math.PI : 0;
          scene.add(m); scenery.push({ m, s, span: SPAN });
        }
        for (let s = 0; s < SPAN; s += 20) {
          const lamp = templates.lamp.clone(); lamp.position.x = side * (LANE * 1.5 + 0.9); lamp.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; lamp.position.y = 0.18;
          scene.add(lamp); scenery.push({ m: lamp, s: s + (side > 0 ? 10 : 0), span: SPAN });
          const tree = (Math.random() < 0.5 ? templates.treeL : templates.treeS).clone(); tree.position.x = side * (LANE * 1.5 + 2.6); tree.position.y = 0.18; tree.rotation.y = Math.random() * 6;
          scene.add(tree); scenery.push({ m: tree, s: s + 5 + (side > 0 ? 10 : 0), span: SPAN });
        }
      }
    }

    // ---------- spawning ----------
    function take(kind, make) {
      const pool = pools[kind] || (pools[kind] = []);
      const m = pool.pop() || make();
      m.visible = true; m.rotation.set(0, 0, 0); m.scale.setScalar(1); m.position.set(0, 0, 0);
      if (!m.parent) scene.add(m);
      return m;
    }
    function free(o) { o.mesh.visible = false; (pools[o.pool] || (pools[o.pool] = [])).push(o.mesh); }
    function add(o) { o.x = LANES[o.lane]; objs.push(o); return o; }
    function addCoin(s, lane, y) { add({ kind: 'coin', pool: 'coin', mesh: take('coin', () => new THREE.Mesh(coinGeo, coinMat)), s, lane, y, r: 0.8 }); }
    function addCar(s, lane, { oncoming = false, kind = null } = {}) {
      const k = kind || ['sedan', 'taxi', 'van', 'sedan', 'taxi', 'delivery'][(Math.random() * 6) | 0];
      const mesh = take(k, () => templates[k].clone());
      if (oncoming) mesh.rotation.y = Math.PI;
      const sz = templates[k].userData.size;
      return add({ kind: 'car', pool: k, mesh, s, lane, len: sz.z, w: sz.x, top: sz.y, oncoming, wheels: [] });
    }
    function addBarrier(s, lane, high) {
      if (high) return add({ kind: 'overhead', pool: 'overhead', mesh: take('overhead', () => templates.overhead.clone()), s, lane, len: 0.4, w: LANE - 0.3, bottom: 1.15, top: 1.75 });
      const v = (Math.random() * 2) | 0;
      return add({ kind: 'low', pool: `bar${v}`, mesh: take(`bar${v}`, () => templates.bar[v].clone()), s, lane, len: 0.5, w: LANE - 0.3, top: 0.85 });
    }
    function addRamp(s, lane) { return add({ kind: 'ramp', pool: 'ramp', mesh: take('ramp', () => templates.ramp.clone()), s, lane, len: 3.6, w: LANE - 0.5, top: templates.rampH }); }
    function addCone(s, x) { const o = add({ kind: 'cone', pool: 'cone', mesh: take('cone', () => templates.cone.clone()), s, lane: 1, len: 0.5, w: 0.5, top: 0.7 }); o.x = x; return o; }
    const PU = { magnet: '#4aa8ff', shield: '#59e08a', nitro: '#ff8a2a' };
    function addPower(s, lane, type) {
      const mesh = take(`pu_${type}`, () => {
        const g = new THREE.Group();
        const mat = own(new THREE.MeshStandardMaterial({ color: PU[type], emissive: PU[type], emissiveIntensity: 0.5, roughness: 0.35 }));
        let geo;
        if (type === 'magnet') geo = own(new THREE.TorusGeometry(0.45, 0.16, 10, 24, Math.PI * 1.25));
        else if (type === 'shield') geo = own(new THREE.IcosahedronGeometry(0.5, 0));
        else geo = own(new THREE.ConeGeometry(0.38, 0.95, 12));
        g.add(new THREE.Mesh(geo, mat));
        const halo = new THREE.Mesh(own(new THREE.RingGeometry(0.7, 0.85, 32)), own(new THREE.MeshBasicMaterial({ color: PU[type], transparent: true, opacity: 0.6, side: THREE.DoubleSide })));
        g.add(halo);
        return g;
      });
      return add({ kind: 'power', pool: `pu_${type}`, type, mesh, s, lane, y: 1.2, r: 1.2 });
    }
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    function coinLine(s, lane, n = 6, y = 0.9) { for (let i = 0; i < n; i++) addCoin(s + i * 2.6, lane, y); }
    // One row of trouble at track position s. Every pattern leaves at least one way through.
    function spawnPattern(s) {
      const f = clamp(d / 2500, 0, 1);
      const lanes = shuffle([0, 1, 2]);
      const r = Math.random();
      if (r < 0.2) { // parked cars in one or two lanes
        const n = Math.random() < 0.35 + f * 0.4 ? 2 : 1;
        for (let i = 0; i < n; i++) addCar(s + rnd(-1.5, 1.5), lanes[i]);
        coinLine(s - 4, lanes[2], 5);
      } else if (r < 0.35) { // low barriers to jump, with a coin arc over one of them
        const n = Math.random() < 0.5 + f * 0.3 ? 3 : 2;
        for (let i = 0; i < n; i++) addBarrier(s, lanes[i], false);
        for (let i = 0; i < 7; i++) addCoin(s - 6 + i * 2, lanes[0], 0.9 + Math.sin((i / 6) * Math.PI) * 1.4);
      } else if (r < 0.5) { // overhead roadworks to slide under
        const n = Math.random() < 0.45 + f * 0.3 ? 3 : 2;
        for (let i = 0; i < n; i++) addBarrier(s, lanes[i], true);
        coinLine(s - 4, lanes[0], 4, 0.6);
      } else if (r < 0.64) { // ramp onto a line of trucks with coins on the roofs
        const lane = lanes[0];
        addRamp(s, lane);
        const kinds = Math.random() < 0.5 ? ['truck', 'van'] : ['van', 'truck', 'truck'];
        // the vehicles start just past the ramp's lip, nose to tail, with coins along their roofs
        let z = s + 3.6 / 2 + 3.2;
        for (const k of kinds) { const len = templates[k].userData.size.z; const c = addCar(z + len / 2, lane, { kind: k }); for (let i = 0; i < 2; i++) addCoin(z + len * (0.25 + i * 0.5), lane, c.top + 0.8); z += len + 0.3; }
        addCar(s + rnd(-4, 0), lanes[1]);
        coinLine(s - 2, lanes[2], 4);
      } else if (r < 0.76 && d > 250) { // an oncoming car, only in a lane that stays clear all the way to where it meets you
        const s0 = s + 10, vc = 10 + d / 400, v = Math.max(speed, 12), meet = s0 - vc * ((s0 - d) / (v + vc));
        const clear = [0, 1, 2].filter((l) => !objs.some((o) => !o.dead && o.kind !== 'coin' && Math.abs(o.x - LANES[l]) < 1.6 && o.s > meet - 8 && o.s < s0 + 8));
        if (clear.length) {
          const l = pick(clear);
          for (const o of objs) if (o.kind === 'coin' && !o.dead && Math.abs(o.x - LANES[l]) < 1 && o.s > meet - 8 && o.s < s0) { o.dead = true; o.mesh.visible = false; }
          addCar(s0, l, { oncoming: true });
          const others = [0, 1, 2].filter((x) => x !== l);
          if (Math.random() < f) addCar(s + 4, others[0]);
          coinLine(s - 3, others[1], 5);
        } else { addCar(s, lanes[0]); coinLine(s - 4, lanes[1], 5); }
      } else if (r < 0.86) { // a mixed row: one jump, one slide, one car
        addBarrier(s, lanes[0], false); addBarrier(s, lanes[1], true); if (Math.random() < 0.5 + f * 0.4) addCar(s, lanes[2]);
        else coinLine(s - 3, lanes[2], 4);
      } else { // a slalom of cones (harmless, fun to knock) and a coin line
        for (let i = 0; i < 5; i++) addCone(s - i * 2.2, LANES[lanes[0]] + rnd(-0.8, 0.8));
        coinLine(s - 8, lanes[1], 6);
      }
      if (s > nextPower) { nextPower = s + 380 + Math.random() * 320; addPower(s - 10, lanes[2], pick(['magnet', 'shield', 'nitro'])); }
    }

    // ---------- input ----------
    let touch = null;
    function act(dir) {
      if (!ready || over) return;
      if (introT >= 0) { introT = -1; ctx.prompt(''); }
      if (dir === 'left' || dir === 'right') {
        const nl = clamp(P.lane + (dir === 'left' ? -1 : 1), 0, 2);
        if (nl !== P.lane) { P.prevLane = P.lane; P.lane = nl; P.laneT = 0; snd.swoosh(); }
        else { buzz(8); }
      } else if (dir === 'up') {
        if (!P.air) { P.vy = 10.2 + PW * 1.2; P.air = true; P.duck = 0; snd.swoosh(); }
      } else if (dir === 'down') {
        if (P.air) P.vy = Math.min(P.vy, -16);
        else { P.duck = 0.75; snd.crunch(); }
      }
    }
    const onKey = (e) => { const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }[e.key]; if (k) { e.preventDefault(); act(k); } };
    window.addEventListener('keydown', onKey);
    function down(x, y) { touch = { x, y, done: false }; }
    function move(x, y) {
      if (!touch || touch.done) return;
      const dx = x - touch.x, dy = y - touch.y;
      if (Math.hypot(dx, dy) < 26) return;
      touch.done = true;
      act(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
    }
    function up(x, y) { if (touch && !touch.done) move(x, y); touch = null; }

    // ---------- crash and effects ----------
    function floatText(text, color = '#fff', y = 2.6) { floaters.push({ x: P.x, y: P.y + y, z: -2, s: text, t: 0, color }); }
    function smash(o) {
      // knocked flying (nitro, shield or cones)
      o.fly = { vx: (o.x - P.x || rnd(-1, 1)) * 4, vy: rnd(5, 9), vz: -rnd(6, 12), spin: rnd(-6, 6) };
      o.dead = true;
    }
    function crash(o) {
      if (power.nitro > 0) { smash(o); snd.whack(1); buzz(30); floatText('Smash!', '#ffb347'); return false; }
      if (power.shield) {
        power.shield = false; shieldMesh.visible = false; smash(o); snd.boing(0.8); buzz([30, 30, 30]); flash = 0.5; floatText('Shield saved you!', '#7fe0ff');
        return false;
      }
      over = true; overT = 0;
      snd.whack(1); snd.fail(); buzz([80, 40, 120]);
      flash = 1;
      // the rider flies off forwards, the bike skids and tips
      tumble = { vy: 7, vz: -Math.max(6, speed * 0.4), spin: 9, bikeVz: -speed * 0.25 };
      if (clips.fall || clips.die) { mixer.stopAllAction(); mixer.clipAction(clips.fall || clips.die).play(); }
      return true;
    }
    function sideScrape(o) {
      // a glancing blow while changing lanes: bounce back, and a second one soon after is a crash
      if (t - P.stumbleT < 2.6 && power.nitro <= 0 && !power.shield) return crash(o);
      P.stumbleT = t; P.lane = P.prevLane; snd.thud(); buzz(40); flash = 0.35; floatText('Close call!', '#ffd447');
      return false;
    }

    // ---------- update ----------
    function update(dt) {
      if (!ready) return;
      t += dt;
      if (mixer) mixer.update(dt);
      if (introT >= 0) { introT += dt; if (introT > 4.5) { introT = -1; ctx.prompt(''); } }
      if (over) {
        overT += dt;
        speed *= Math.max(0, 1 - dt * 2.5);
        if (tumble) {
          riderObj.position.y += tumble.vy * dt; riderObj.position.z += tumble.vz * dt; tumble.vy -= G * dt;
          if (riderObj.position.y < 0.2) { riderObj.position.y = 0.2; tumble.vy = Math.abs(tumble.vy) * 0.3; tumble.vz *= 0.6; tumble.spin *= 0.6; }
          riderObj.rotation.x += tumble.spin * dt;
          bikeObj.position.z += tumble.bikeVz * dt; tumble.bikeVz *= Math.max(0, 1 - dt * 2);
          bikeObj.rotation.z = Math.min(Math.PI / 2, bikeObj.rotation.z + dt * 4);
        }
        if (overT > 1.4 && overT - dt <= 1.4) finish();
      } else if (started) {
        const ramp = clamp(t * (0.5 + PW * 0.5), 0, 1);
        const base = (13 + SP * 6) * (1 + 0.85 * clamp(d / 3200, 0, 1));
        speed = lerp(speed, base * (0.55 + 0.45 * ramp) * (power.nitro > 0 ? 1.6 : 1), Math.min(1, dt * 3));
      }
      d += speed * dt;
      // lanes and lean
      const prevX = P.x;
      P.tx = LANES[P.lane]; P.laneT += dt;
      P.x += (P.tx - P.x) * Math.min(1, dt * (8 + HD * 9));
      P.lean = lerp(P.lean, (P.x - prevX) / Math.max(dt, 1e-3) * -0.035, Math.min(1, dt * 10));
      // support under the bike: road or a vehicle roof
      let ground = 0;
      for (const o of objs) {
        if (o.dead || (o.kind !== 'car' && o.kind !== 'ramp')) continue;
        if (Math.abs(o.x - P.x) >= o.w / 2 || Math.abs(o.s - d) >= o.len / 2 + (o.kind === 'car' ? 0.5 : 0)) continue;
        if (o.kind === 'car' && P.y >= o.top - 0.45) ground = Math.max(ground, o.top);
        if (o.kind === 'ramp') { const h = clamp((d - (o.s - o.len / 2)) / o.len, 0, 1) * o.top; if (P.y >= h - 0.6) ground = Math.max(ground, h); }
      }
      if (!P.air && P.y < ground) P.y = ground; // riding up a ramp
      if (P.air || P.y > ground + 0.01) {
        P.vy -= G * dt; P.y += P.vy * dt;
        if (P.y <= ground) {
          const hard = P.vy < -12;
          P.y = ground; P.vy = 0;
          if (P.air) { if (hard) { snd.thud(); buzz(15); } else snd.crunch(); }
          P.air = false;
        } else P.air = true;
      } else P.y = ground;
      if (P.duck > 0) P.duck -= dt;
      if (power.magnet > 0) power.magnet -= dt;
      if (power.nitro > 0) { power.nitro -= dt; if (power.nitro <= 0) floatText('Nitro over', '#ffb347'); }
      flash = Math.max(0, flash - dt * 2);

      // spawn ahead
      while (ready && !over && spawnS < d + AHEAD) {
        spawnPattern(spawnS);
        spawnS += lerp(32, 18, clamp(d / 3000, 0, 1)) + Math.random() * 8;
      }
      // move, collide and recycle
      const hw = 0.42 - GR * 0.12; // grip makes the bike a little more forgiving to brush past things
      const pTop = P.y + (P.duck > 0 ? 0.85 : 1.85);
      for (const o of objs) {
        if (o.kind === 'car' && o.oncoming && !o.dead) o.s -= (10 + d / 400) * dt;
        if (o.fly) { o.fly.vy -= G * dt; o.mesh.position.y += o.fly.vy * dt; o.mesh.position.x += o.fly.vx * dt; o.s += (speed + 6) * dt; o.mesh.rotation.x += o.fly.spin * dt; o.mesh.rotation.z += o.fly.spin * 0.7 * dt; }
        const z = -(o.s - d);
        if (!o.fly) o.mesh.position.set(o.x, o.y || 0, z);
        else o.mesh.position.z = z;
        if (o.dead) continue;
        if (o.kind === 'coin') {
          o.mesh.rotation.y = t * 4 + o.s;
          if (power.magnet > 0 && Math.abs(o.s - d) < 16) { o.x += (P.x - o.x) * Math.min(1, dt * 8); o.y += (P.y + 1 - o.y) * Math.min(1, dt * 8); o.s += (d - o.s) * Math.min(1, dt * 6); }
          if (Math.abs(o.s - d) < o.r && Math.abs(o.x - P.x) < o.r && Math.abs((o.y || 0) - (P.y + 0.9)) < 1.3) { o.dead = true; o.mesh.visible = false; coins++; if (coins % 5 === 0) snd.ding(coins % 15 / 5); else snd.tick(); }
          continue;
        }
        if (o.kind === 'power') {
          o.mesh.rotation.y = t * 2.5; o.mesh.position.y = o.y + Math.sin(t * 4) * 0.15;
          if (Math.abs(o.s - d) < o.r && Math.abs(o.x - P.x) < o.r + 0.4 && P.y < 3) {
            o.dead = true; o.mesh.visible = false; snd.ding(4); buzz(25);
            if (o.type === 'magnet') { power.magnet = 9; floatText('Coin magnet!', PU.magnet); }
            else if (o.type === 'shield') { power.shield = true; shieldMesh.visible = true; floatText('Shield!', PU.shield); }
            else { power.nitro = 4.5; floatText('Nitro!', PU.nitro); snd.whack(0.5); }
          }
          continue;
        }
        if (over) continue;
        // overlap in all three directions?
        const ds = Math.abs(o.s - d), ow = o.w / 2 + hw;
        // only things ahead of or alongside the bike can be hit (not something it has just ridden off the back of)
        if (ds > o.len / 2 + 0.9 || o.s - d < -(o.len / 2 + 0.2) || Math.abs(o.x - P.x) > ow) continue;
        if (o.kind === 'cone') { smash(o); snd.pop(); bonus += 5; floatText('+5', '#ffd447', 1.8); continue; }
        if (o.kind === 'ramp') {
          if (P.y < o.top + 0.2 && ds < o.len / 2) {
            // the ramp is ridden as ground (see the support check); at its lip, launch
            const k = clamp((d - (o.s - o.len / 2)) / o.len, 0, 1);
            if (k > 0.85 && !o.used) { o.used = true; P.vy = 14 + PW * 1.5; P.air = true; snd.boing(1); buzz(20); floatText('Big air!', '#9fe7ff'); }
          }
          continue;
        }
        if (o.kind === 'low') { if (P.y >= o.top - 0.05) continue; }
        else if (o.kind === 'overhead') { if (pTop <= o.bottom + 0.05 || P.y >= o.top) continue; }
        else if (o.kind === 'car') { if (P.y >= o.top - 0.45) continue; }
        // hit: from the side (while changing lanes into it) or head on
        const lateral = Math.abs(o.x - prevX) > ow - 0.02 && ds < o.len / 2 + 0.5;
        if (lateral && o.kind === 'car') { sideScrape(o); continue; }
        if (crash(o)) break;
      }
      for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (o.s < d - BEHIND || (o.fly && o.mesh.position.y < -20) || (o.dead && !o.fly && o.kind !== 'car')) { free(o); objs.splice(i, 1); }
      }
      for (const sc of scenery) { if (sc.s < d - BEHIND) sc.s += sc.span; sc.m.position.z = -(sc.s - d); }
      roadTex.offset.y = (d / 16) % 1;
      // the rig follows the player
      if (rig) {
        rig.position.set(P.x, P.y, 0);
        const lean = rig.userData.lean;
        if (!over) {
          lean.rotation.z = clamp(P.lean, -0.45, 0.45) + (P.duck > 0 ? -0.9 * Math.sign(P.x - LANES[1] || 1) * Math.min(1, P.duck * 4) : 0);
          lean.rotation.x = P.air ? clamp(-P.vy * 0.02, -0.35, 0.35) : Math.sin(t * 18) * 0.008;
          lean.position.y = P.duck > 0 ? -0.15 : 0;
          riderObj.scale.y = lerp(riderObj.scale.y, P.duck > 0 ? 0.55 : 1, Math.min(1, dt * 14));
        }
        shadow.position.set(P.x, 0.03 + (P.y > 0.1 ? 0 : 0), 0); shadow.material.opacity = clamp(0.28 - P.y * 0.04, 0.08, 0.28);
        shieldMesh.material.opacity = 0.18 + Math.sin(t * 6) * 0.06;
      }
      // floating texts
      for (const f of floaters) f.t += dt;
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t > 1.1) floaters.splice(i, 1);
      // camera: behind and above, easing sideways with the bike, wider at nitro speed
      const cx = P.x * 0.55, cy = 4.9 + P.y * 0.55;
      camera.position.x = lerp(camera.position.x, cx, Math.min(1, dt * 6));
      camera.position.y = lerp(camera.position.y || cy, cy, Math.min(1, dt * 5));
      camera.position.z = 8.2;
      const fov = power.nitro > 0 ? 74 : 60 + clamp(speed / 40, 0, 1) * 6;
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 4)); camera.updateProjectionMatrix(); }
      const shake = flash > 0.3 ? (Math.random() - 0.5) * flash * 0.3 : 0;
      camera.lookAt(P.x * 0.7 + shake, 1.2 + P.y * 0.6, -10);
      const score = Math.floor(d) + coins * 10 + bonus;
      ctx.hud({ left: `${fmt(d)} m`, center: `${fmt(score)} pts`, right: ctx.best ? `Best ${fmt(ctx.best)}` : '' });
    }
    function finish() {
      const score = Math.floor(d) + coins * 10 + bonus;
      const line = d > 2000 ? 'Legendary ride!' : d > 900 ? 'What a run!' : d > 300 ? 'Nice riding.' : 'Keep at it, it gets easier.';
      ctx.finish(score, `${line} ${fmt(d)} m and ${coins} coins.`, { coins });
    }

    // ---------- draw ----------
    const v3 = new THREE.Vector3();
    function draw(g) {
      if (ready) renderer.render(scene, camera);
      g.clearRect(0, 0, ctx.W, ctx.H);
      if (!ready) { if (!failed) { g.fillStyle = 'rgba(0,0,0,0)'; } return; }
      // nitro speed lines
      if (power.nitro > 0) {
        g.save(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + t * 3, r0 = ctx.W * 0.35 + ((t * 900 + i * 97) % (ctx.W * 0.5)); g.beginPath(); g.moveTo(ctx.W / 2 + Math.cos(a) * r0, ctx.H * 0.45 + Math.sin(a) * r0 * 0.8); g.lineTo(ctx.W / 2 + Math.cos(a) * (r0 + 40), ctx.H * 0.45 + Math.sin(a) * (r0 + 40) * 0.8); g.stroke(); }
        g.restore();
      }
      // coins collected badge
      g.save();
      g.fillStyle = 'rgba(40,22,10,.6)'; roundRect(g, 10, 44, 86, 28, 14); g.fill();
      coinIcon(g, 26, 58, 8, t * 3); g.fillStyle = '#fff'; g.font = '800 15px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(`${coins}`, 40, 63);
      // power-up timers
      let py = 80;
      const bar = (label, frac, col) => {
        g.fillStyle = 'rgba(40,22,10,.6)'; roundRect(g, 10, py, 112, 24, 12); g.fill();
        g.fillStyle = col; roundRect(g, 14, py + 4, 104 * clamp(frac, 0, 1), 16, 8); g.fill();
        g.fillStyle = '#fff'; g.font = '800 12px system-ui, sans-serif'; g.fillText(label, 20, py + 16.5); py += 30;
      };
      if (power.magnet > 0) bar('Magnet', power.magnet / 9, PU.magnet);
      if (power.nitro > 0) bar('Nitro', power.nitro / 4.5, PU.nitro);
      if (power.shield) bar('Shield', 1, PU.shield);
      // floating texts at the rider
      g.textAlign = 'center'; g.lineJoin = 'round';
      for (const f of floaters) {
        v3.set(f.x, f.y + f.t * 1.2, f.z).project(camera);
        const x = (v3.x + 1) / 2 * ctx.W, y = (1 - v3.y) / 2 * ctx.H;
        g.globalAlpha = clamp((1.1 - f.t) * 3, 0, 1);
        g.font = `900 ${22 * (1 + Math.max(0, 0.2 - f.t) * 2)}px system-ui, sans-serif`;
        g.strokeStyle = 'rgba(30,15,5,.8)'; g.lineWidth = 5; g.strokeText(f.s, x, y); g.fillStyle = f.color; g.fillText(f.s, x, y);
      }
      g.globalAlpha = 1;
      // red flash on a hit
      if (flash > 0) { g.fillStyle = `rgba(255,60,40,${flash * 0.35})`; g.fillRect(0, 0, ctx.W, ctx.H); }
      g.restore();
    }

    function destroy() {
      over = 'destroyed';
      window.removeEventListener('keydown', onKey);
      for (const x of disposables) x.dispose?.();
      renderer.dispose(); renderer.forceContextLoss?.();
      canvas.remove();
    }
    return { update, draw, down, move, up, resize, destroy };
  },
};
