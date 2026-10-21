// Arrow Away on a 3D shape. Same rules, hearts and hints as the flat levels (arrow-game.js), drawn with three.js.
// Drag to turn the shape; tap an arrow to send it along the surface and off at an open edge.
import * as THREE from './vendor/three/three.module.min.js';
import { store, save } from './store.js';
import { icon } from './icons.js';
import { el, $, dialog, toast, confetti } from './ui.js';
import { sfx, buzz } from './sound.js';
import { arrowHelp, heartSVG } from './arrow-game.js';
import { canExit3d, occupancy3d, hint3d, track3d, SHAPE_NAMES } from './arrow3d-engine.js';

const AB = () => store.arrow;
const HEARTS = 3, HINTS = 3, SPEED = 14; // cells per second
const HW = 0.1, LIFT = 0.03;             // half the line width, and how far lines sit above the tiles
// a starting view for each shape that shows most of it
const VIEW = { corner: [0.55, -0.6], channel: [0.75, -0.5], cube: [0.5, -0.65], box: [1.15, -0.55], steps: [0.45, -0.85], peak: [0.45, -0.7] };

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function arrow3dGameScreen(app, { idx, L }) {
  const ab = AB();
  const { surf, arrows } = L;
  let removed = arrows.map(() => false), hearts = HEARTS, hints = HINTS, done = false, alive = true;
  const moving = new Set();
  const cur = ab.current && ab.current.idx === idx ? ab.current : null;
  if (cur && cur.removed?.length === arrows.length) { removed = cur.removed.slice(); hearts = cur.hearts; hints = cur.hints; }

  const root = el(`<section class="screen arrow-theme arrow-game">
    <header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon.back}</button>
      <div class="title">Level ${idx + 1} · ${SHAPE_NAMES[L.shape]}</div>
      <button class="icon-btn" data-act="help" aria-label="How to play">${icon.help}</button></header>
    <div class="ar-info"><span class="ar-hearts" data-el="hearts"></span><span data-el="left"></span></div>
    <div class="ar-wrap ar-3d" data-el="wrap"><canvas data-el="cv"></canvas><div class="ar-turn" data-el="turn">Drag to turn</div></div>
    <div class="ar-bar">
      <button class="ar-tool" data-act="hint"><span class="ar-round">${icon.bulb}<b data-el="hints"></b></span>Hint</button>
      <button class="ar-tool" data-act="restart"><span class="ar-round">${icon.restart}</span>Restart</button>
    </div>
  </section>`);
  const q = (k) => $(`[data-el="${k}"]`, root);
  const wrap = q('wrap'), canvas = q('cv');

  // ---------- scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 2.3));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(1, 3, 4); scene.add(sun);
  const model = new THREE.Group(); scene.add(model);
  // centre the shape on the origin
  const box = new THREE.Box3(); surf.cells.forEach((c) => box.expandByPoint(V(c.c)));
  const mid = box.getCenter(new THREE.Vector3()), radius = box.getSize(new THREE.Vector3()).length() / 2 + 0.6;
  const inner = new THREE.Group(); inner.position.copy(mid).negate(); model.add(inner);

  const dark = () => document.documentElement.dataset.theme === 'dark';
  const tileMat = new THREE.MeshLambertMaterial({ side: THREE.FrontSide });
  const backMat = new THREE.MeshLambertMaterial({ side: THREE.BackSide });
  const gapMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }); // also hides arrows from behind
  const dotMat = new THREE.MeshBasicMaterial({ transparent: true });
  let tiles = null;
  function themeColours() {
    const d = dark();
    tileMat.color.set(d ? '#24304f' : '#ffffff'); backMat.color.set(d ? '#141b30' : '#c7d0e4'); gapMat.color.set(d ? '#141b30' : '#cfd8ea');
    dotMat.color.set(d ? '#c8d7ff' : '#24304d'); dotMat.opacity = d ? 0.25 : 0.22;
  }

  // tiles: two triangles each, in cell order, so a hit's face index tells us the cell
  {
    const pos = [], nor = [], dots = [];
    for (const cl of surf.cells) {
      const c = V(cl.c), u = V(cl.dirs[0]).multiplyScalar(0.47), v = V(cl.dirs[1]).multiplyScalar(0.47), n = V(cl.n);
      const a = c.clone().sub(u).sub(v), b = c.clone().add(u).sub(v), cc = c.clone().add(u).add(v), dd = c.clone().sub(u).add(v);
      for (const p of [a, b, cc, a, cc, dd]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); }
      // a small dot in the middle, like the flat boards
      const o = c.clone().addScaledVector(n, 0.004), r = 0.07;
      for (let k = 0; k < 8; k++) {
        const a1 = (k / 8) * Math.PI * 2, a2 = ((k + 1) / 8) * Math.PI * 2;
        const p1 = o.clone().addScaledVector(V(cl.dirs[0]), Math.cos(a1) * r).addScaledVector(V(cl.dirs[1]), Math.sin(a1) * r);
        const p2 = o.clone().addScaledVector(V(cl.dirs[0]), Math.cos(a2) * r).addScaledVector(V(cl.dirs[1]), Math.sin(a2) * r);
        dots.push(o.x, o.y, o.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    tiles = new THREE.Mesh(g, tileMat);
    inner.add(tiles, new THREE.Mesh(g, backMat));
    const gd = new THREE.BufferGeometry(); gd.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
    inner.add(new THREE.Mesh(gd, dotMat));
  }
  // a darker slab just under the tiles, so the joins between tiles read as thin lines
  {
    const pos = [], nor = [];
    for (const cl of surf.cells) {
      const n = V(cl.n), c = V(cl.c).addScaledVector(n, -0.01), u = V(cl.dirs[0]).multiplyScalar(0.5), v = V(cl.dirs[1]).multiplyScalar(0.5);
      const a = c.clone().sub(u).sub(v), b = c.clone().add(u).sub(v), cc = c.clone().add(u).add(v), dd = c.clone().sub(u).add(v);
      for (const p of [a, b, cc, a, cc, dd]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    inner.add(new THREE.Mesh(g, gapMat));
  }

  // ---------- arrows ----------
  const meshes = arrows.map((a, id) => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    m.userData = { id, flash: 0, bad: 0 };
    inner.add(m);
    return m;
  });
  const tracks = arrows.map((_, id) => track3d(L, id, 3));
  function colours() {
    const cs = getComputedStyle(root);
    meshes.forEach((m, id) => { m.userData.base = new THREE.Color(cs.getPropertyValue(`--ac${arrows[id].c}`).trim() || '#3a6fe0'); m.material.color.copy(m.userData.base); });
  }

  // Cut the piece of track from s to s + len (in cells; track points are half a cell apart) and build a flat
  // ribbon along it, lifted off the tiles, with an arrow head at the front.
  function pose(id, s, len) {
    const { pts, nrm } = tracks[id], N = pts.length;
    const at = (u) => { // u in half cells
      const i = Math.min(N - 2, Math.max(0, Math.floor(u))), f = u - i;
      const p = V(pts[i]).lerp(V(pts[i + 1]), f), n = V(nrm[i]).lerp(V(nrm[i + 1]), f).normalize();
      return { p, n };
    };
    const u0 = s * 2, u1 = (s + len) * 2, P = [at(u0)];
    for (let i = Math.floor(u0) + 1; i < u1; i++) P.push({ p: V(pts[Math.min(N - 1, i)]), n: V(nrm[Math.min(N - 1, i)]) });
    P.push(at(u1));
    const pos = [];
    const sideAt = (k) => {
      const a = P[Math.max(0, k - 1)].p, b = P[Math.min(P.length - 1, k + 1)].p;
      const t = b.clone().sub(a); if (t.lengthSq() < 1e-8) t.set(1, 0, 0);
      t.normalize();
      return { t, s: new THREE.Vector3().crossVectors(P[k].n, t).normalize().multiplyScalar(HW) };
    };
    for (let k = 0; k + 1 < P.length; k++) {
      const A = P[k].p.clone().addScaledVector(P[k].n, LIFT), B = P[k + 1].p.clone().addScaledVector(P[k + 1].n, LIFT);
      const sa = sideAt(k).s, sb = sideAt(k + 1).s;
      const a1 = A.clone().add(sa), a2 = A.clone().sub(sa), b1 = B.clone().add(sb), b2 = B.clone().sub(sb);
      pos.push(...a1.toArray(), ...b1.toArray(), ...b2.toArray(), ...a1.toArray(), ...b2.toArray(), ...a2.toArray());
    }
    // round the tail with a small fan
    {
      const k = 0, { t, s: sd } = sideAt(k), c = P[0].p.clone().addScaledVector(P[0].n, LIFT);
      for (let j = 0; j < 6; j++) {
        const a1 = Math.PI / 2 + (j / 6) * Math.PI, a2 = Math.PI / 2 + ((j + 1) / 6) * Math.PI;
        const p1 = c.clone().addScaledVector(sd, Math.sin(a1)).addScaledVector(t, Math.cos(a1) * HW);
        const p2 = c.clone().addScaledVector(sd, Math.sin(a2)).addScaledVector(t, Math.cos(a2) * HW);
        pos.push(...c.toArray(), ...p1.toArray(), ...p2.toArray());
      }
    }
    // the head: a notched triangle, as on the flat boards
    {
      const k = P.length - 1, { t, s: sd } = sideAt(k), n = P[k].n, c = P[k].p.clone().addScaledVector(n, LIFT * 1.3);
      const side = sd.clone().normalize();
      const tip = c.clone().addScaledVector(t, 0.36), l = c.clone().addScaledVector(t, -0.14).addScaledVector(side, 0.3);
      const r = c.clone().addScaledVector(t, -0.14).addScaledVector(side, -0.3), notch = c.clone().addScaledVector(t, -0.06);
      pos.push(...tip.toArray(), ...l.toArray(), ...notch.toArray(), ...tip.toArray(), ...notch.toArray(), ...r.toArray());
    }
    const g = meshes[id].geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeBoundingSphere();
  }
  const restPose = (id) => pose(id, 0, arrows[id].cells.length - 1);

  // ---------- view ----------
  let yaw = (VIEW[L.shape] || [0.6, -0.6])[1], pitch = (VIEW[L.shape] || [0.6, -0.6])[0];
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  function orient() { euler.set(pitch, yaw, 0); model.quaternion.setFromEuler(euler); }
  let W = 0, H = 0;
  function fit() {
    W = wrap.clientWidth; H = wrap.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    camera.aspect = W / H;
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
    camera.position.set(0, 0, (radius / Math.sin(Math.min(vf, hf))) * 1.02);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  let raf = 0, lastTheme = null;
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (dark() !== lastTheme) { lastTheme = dark(); themeColours(); colours(); }
    for (const m of meshes) {
      if (!m.userData.base) continue;
      const u = m.userData;
      if (u.bad > 0) m.material.color.copy(u.base).lerp(new THREE.Color('#ff3b3b'), 0.6);
      else if (u.hint) m.material.color.copy(u.base).lerp(new THREE.Color(dark() ? '#ffffff' : '#ffffff'), 0.35 + 0.35 * Math.sin(now / 160));
      else m.material.color.copy(u.base);
    }
    renderer.render(scene, camera);
  }

  // ---------- play ----------
  function persist() { if (!done) { ab.current = { idx, removed, hearts, hints }; save(); } }
  function hud() {
    q('hearts').innerHTML = [...Array(HEARTS)].map((_, i) => heartSVG(i < hearts)).join('');
    q('left').textContent = `${removed.filter((r) => !r).length} arrows left`;
    q('hints').textContent = hints;
    q('hints').classList.toggle('none', !hints);
  }
  function layout() { arrows.forEach((_, id) => { meshes[id].visible = !removed[id]; if (!removed[id]) restPose(id); }); hud(); }
  function slide(ms, fn) {
    return new Promise((resolve) => {
      const t0 = performance.now(); let end = false;
      const finish = () => { if (end) return; end = true; fn(1); resolve(); };
      const step = (now) => { if (end || !alive) return; const t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) requestAnimationFrame(step); else finish(); };
      requestAnimationFrame(step);
      setTimeout(finish, ms + 400);
    });
  }
  const clearHints = () => meshes.forEach((m) => { m.userData.hint = false; });

  async function fire(id) {
    if (done || removed[id] || moving.has(id)) return;
    const a = arrows[id], len = a.cells.length - 1;
    clearHints();
    const r = canExit3d(L, removed, id);
    moving.add(id);
    if (r.ok) {
      removed[id] = true; persist(); hud();
      sfx.place(); buzz(8);
      const dist = r.edgeSteps + len + 1;
      await slide(Math.max(300, (dist / SPEED) * 1000), (t) => pose(id, dist * t * (0.55 + 0.45 * t), len));
      meshes[id].visible = false; moving.delete(id);
      if (alive && removed.every(Boolean) && !moving.size) win();
      return;
    }
    const reach = r.blockSteps - 1 + 0.32;
    await slide(Math.max(140, (reach / SPEED) * 1000), (t) => pose(id, reach * t * t, len));
    if (!alive) return;
    sfx.error();
    meshes[id].userData.bad = 1; meshes[r.blocker].userData.bad = 1;
    hearts = Math.max(0, hearts - 1); persist(); hud();
    q('hearts').children[hearts]?.classList.add('pop');
    await slide(Math.max(160, (reach / SPEED) * 1400), (t) => pose(id, reach * (1 - t), len));
    if (!alive) return;
    restPose(id);
    setTimeout(() => { meshes[id].userData.bad = 0; meshes[r.blocker].userData.bad = 0; }, 380);
    moving.delete(id);
    if (!hearts) lose();
  }

  async function lose() {
    if (done) return;
    done = true; ab.current = null; save(true);
    const v = await dialog({
      hero: 'img/art/ui/collision.svg', title: 'Out of hearts', dismissible: false,
      text: 'Arrows bumped into each other three times. Have another go.',
      buttons: [{ label: 'Try again', value: 'again' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (v === 'again') app.replace('arrowgame', { idx }); else app.back();
  }
  async function win() {
    done = true;
    if (idx >= ab.level) ab.level = idx + 1;
    ab.current = null; save(true);
    sfx.win(); confetti();
    await new Promise((r) => setTimeout(r, 900));
    if (!alive) return;
    const v = await dialog({
      hero: 'img/art/ui/trophy.svg', title: 'All clear', dismissible: false,
      text: `Level ${idx + 1} done${hearts === HEARTS ? ' without a single bump' : ''}.`,
      buttons: [{ label: 'Next level', value: 'next' }, { label: 'Back', value: 'back', cls: 'ghost' }],
    });
    if (v === 'next') app.replace('arrowgame', { idx: idx + 1 }); else app.back();
  }

  // ---------- input: drag to turn, tap to send ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not needed */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) { drag.moved = true; q('turn').classList.add('gone'); }
    if (!drag.moved) return;
    yaw += (e.clientX - drag.x) * 0.009;
    pitch = Math.max(-1.45, Math.min(1.45, pitch + (e.clientY - drag.y) * 0.009));
    drag.x = e.clientX; drag.y = e.clientY;
    orient();
  });
  const end = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const tap = !drag.moved; drag = null;
    if (tap && e.type === 'pointerup') pick(e);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function pick(e) {
    if (done) return;
    const rc = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(tiles, false)[0];
    if (!hit) return;
    const cell = Math.floor(hit.faceIndex / 2), occ = occupancy3d(L, removed.map((r, i) => r || moving.has(i)));
    if (occ[cell] >= 0) { fire(occ[cell]); return; }
    // a near miss: the closest arrow on a neighbouring tile
    const local = inner.worldToLocal(hit.point.clone());
    let best = -1, bd = 0.8;
    for (let d = 0; d < 4; d++) {
      const s = surf.next[cell * 4 + d]; if (s < 0) continue;
      const c = s >> 2, o = occ[c]; if (o < 0) continue;
      const dist = local.distanceTo(V(surf.cells[c].c));
      if (dist < bd) { bd = dist; best = o; }
    }
    if (best >= 0) fire(best);
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'back') app.back();
    else if (a === 'help') arrowHelp();
    else if (done) return;
    else if (a === 'restart') {
      if (moving.size) return;
      removed = arrows.map(() => false); hearts = HEARTS; hints = HINTS; persist(); layout();
    } else if (a === 'hint') {
      if (meshes.some((m) => m.userData.hint)) return;
      if (!hints) { toast('No hints left for this level'); return; }
      const id = hint3d(L, removed.map((r, i) => r || moving.has(i)));
      if (id < 0) return;
      hints--; persist(); hud(); sfx.hint();
      meshes[id].userData.hint = true;
    }
  });

  const ro = new ResizeObserver(fit);
  ro.observe(wrap);
  orient(); layout();
  requestAnimationFrame(() => { fit(); raf = requestAnimationFrame(frame); });
  setTimeout(() => q('turn')?.classList.add('gone'), 3500);
  if (!ab.seen3d) { ab.seen3d = true; save(); setTimeout(() => toast('A 3D level. Drag to turn it, and watch arrows follow the surface round corners.', 4200), 400); }
  return {
    root,
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); persist(); save(true);
      meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      renderer.dispose();
    },
  };
}
