// Side-on motorbike physics shared by Hill Rider and Stunt Park. Pure maths, no drawing, so it can be tested in Node.
// Metres and seconds, y up, angles counter-clockwise (a positive chassis angle lifts the front wheel).
//
// The bike is a rigid chassis (its origin is the ground point under the bike sprite) with two wheels hung on
// springy suspension. Wheels collide with a Terrain polyline, grip through friction, and the rear wheel is driven.
// In the air the throttle tips the bike back and the brake tips it forward. The rider's head is a point on the
// chassis; if it touches the ground the rider has crashed.

// ---------- Terrain ----------
// A polyline with increasing x. Steep or vertical faces are fine (give them a tiny x step).
export class Terrain {
  constructor(points = []) { this.p = points; }
  push(x, y) { this.p.push([x, y]); }
  get lastX() { return this.p.length ? this.p[this.p.length - 1][0] : 0; }
  // index of the last point with x <= v
  find(v) {
    const p = this.p; let lo = 0, hi = p.length - 1;
    if (!p.length || v <= p[0][0]) return 0;
    if (v >= p[hi][0]) return hi;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= v) lo = m; else hi = m; }
    return lo;
  }
  // Ground height at x (the highest surface if there is a vertical face there).
  heightAt(x) {
    const p = this.p; if (!p.length) return 0;
    const i = this.find(x), a = p[i], b = p[Math.min(p.length - 1, i + 1)];
    if (b[0] - a[0] < 1e-6) return Math.max(a[1], b[1]);
    const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
    return a[1] + (b[1] - a[1]) * t;
  }
  slopeAt(x) { const h = 0.25; return (this.heightAt(x + h) - this.heightAt(x - h)) / (2 * h); }
  // Deepest contact of a circle (cx, cy, r) with the ground: { nx, ny, depth } or null.
  // A point under the polyline counts as inside, so a fast wheel cannot tunnel through.
  contact(cx, cy, r) {
    const p = this.p; if (p.length < 2) return null;
    let best = null;
    const i0 = Math.max(0, this.find(cx - r) - 1), i1 = Math.min(p.length - 2, this.find(cx + r) + 1);
    for (let i = i0; i <= i1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey; if (L2 < 1e-9) continue;
      let t = ((cx - ax) * ex + (cy - ay) * ey) / L2; t = Math.max(0, Math.min(1, t));
      const qx = ax + ex * t, qy = ay + ey * t;
      let dx = cx - qx, dy = cy - qy, d = Math.hypot(dx, dy);
      // which side of the segment is the centre on? (the ground is below/right of the left-to-right line)
      const side = ex * (cy - ay) - ey * (cx - ax);
      const L = Math.sqrt(L2);
      let nx, ny, depth;
      // the half-plane test alone is wrong next to a drop-off, so "inside" also needs the centre to be under the ground
      const inside = side < 0 && cy < this.heightAt(cx) - 1e-3;
      if (!inside) { if (d >= r) continue; nx = d > 1e-6 ? dx / d : -ey / L; ny = d > 1e-6 ? dy / d : ex / L; depth = r - d; if (ny < -0.3) continue; }
      else { nx = -ey / L; ny = ex / L; depth = r + d; } // centre is under the surface: push straight out
      if (!best || depth > best.depth) best = { nx, ny, depth };
    }
    return best;
  }
}

// ---------- Bike ----------
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export class Bike {
  // geom: { rear: {x, y}, front: {x, y}, r } (from wheels() in moto/kit.js); stats: 0..1 { speed, power, grip, handling }
  constructor(x, y, geom, stats, { gravity = 9.8 } = {}) {
    this.g = gravity;
    this.x = x; this.y = y; this.a = 0; this.vx = 0; this.vy = 0; this.va = 0;
    this.m = 1; this.I = 0.42;
    this.r = geom.r;
    this.mw = 0.2; this.Iw = 0.5 * this.mw * this.r * this.r * 1.6;
    this.wheels = [geom.rear, geom.front].map((g0) => ({ ax: g0.x, ay: g0.y, x: x + g0.x, y: y + g0.y, vx: 0, vy: 0, w: 0, spin: 0, touch: false, touchT: 1, load: 0, hit: 0 }));
    this.head = { x: -0.12, y: 1.32, r: 0.26 };
    this.setStats(stats);
    this.crashed = false; this.airT = 0; this.airRot = 0; this.flips = 0; this.lastLanding = null; this.gas = false; this.brake = false;
  }
  setStats(s) {
    this.topSpeed = 13 + 10 * s.speed;          // m/s
    this.torque = 3.2 + 1.8 * s.power;           // on the rear wheel
    this.mu = 0.95 + 0.65 * s.grip;             // tyre grip
    this.airTurn = 4.2 + 3.6 * s.handling;        // rad/s^2 in the air
    this.lean = 2.6 + 1.2 * s.power;              // throttle lifts the front on the ground
  }
  get onGround() { return this.wheels.some((w) => w.touch); }
  get speed() { return Math.hypot(this.vx, this.vy); }
  // world position of a chassis-local point
  world(lx, ly) { const [rx, ry] = rot(lx, ly, this.a); return [this.x + rx, this.y + ry]; }
  headPos() { return this.world(this.head.x, this.head.y); }
  centre() { return this.world(0, 0.75); }

  // Advances by dt seconds (sub-stepped). input: { gas, brake }. Returns events for sounds and effects.
  step(dt, terrain, input = {}) {
    const ev = { landed: 0, flips: 0, airT: 0, crashed: false, bump: 0 };
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let k = 0; k < n; k++) this.sub(h, terrain, this.crashed ? {} : input, ev);
    return ev;
  }
  sub(h, terrain, input, ev) {
    const g = this.g, wasAir = !this.onGround;
    // gravity
    this.vy -= g * h;
    for (const w of this.wheels) w.vy -= g * h;
    // suspension: soft along the chassis' up axis, stiff sideways
    const ux = -Math.sin(this.a), uy = Math.cos(this.a), sx = Math.cos(this.a), sy = Math.sin(this.a);
    for (const w of this.wheels) {
      const [rx, ry] = rot(w.ax, w.ay, this.a);
      const Ax = this.x + rx, Ay = this.y + ry;
      const avx = this.vx - this.va * ry, avy = this.vy + this.va * rx;
      const dx = w.x - Ax, dy = w.y - Ay, rvx = w.vx - avx, rvy = w.vy - avy;
      const du = dx * ux + dy * uy, ds = dx * sx + dy * sy, vu = rvx * ux + rvy * uy, vs = rvx * sx + rvy * sy;
      const fu = -(420 * du + 20 * vu), fs = -(1500 * ds + 26 * vs);
      const fx = fu * ux + fs * sx, fy = fu * uy + fs * sy;
      w.vx += (fx / this.mw) * h; w.vy += (fy / this.mw) * h;
      this.vx -= (fx / this.m) * h; this.vy -= (fy / this.m) * h;
      this.va -= ((rx * fy - ry * fx) / this.I) * h;
      w.load = Math.max(0, -fu); // how hard the chassis presses on this wheel
    }
    // drive and brakes
    const rear = this.wheels[0], front = this.wheels[1];
    const wmax = this.topSpeed / this.r;
    if (input.gas) { if (rear.w < wmax) rear.w = Math.min(wmax, rear.w + (this.torque / this.Iw) * h * (1 - 0.6 * Math.max(0, rear.w / wmax))); }
    else if (input.brake) {
      for (const w of this.wheels) {
        if (!w.touch) continue; // in the air the brake only tips the bike forward
        if (w.w > 0.5) w.w = Math.max(0, w.w - (this.torque * 2.2 / this.Iw) * h);
        else if (w === rear) w.w = Math.max(-wmax * 0.3, w.w - (this.torque * 0.5 / this.Iw) * h);
      }
    }
    for (const w of this.wheels) w.w *= 1 - 0.15 * h;
    // ground contact
    for (const w of this.wheels) {
      const c = terrain.contact(w.x, w.y, this.r);
      // a short grace period, so tiny bounces on a slope don't count as being in the air
      w.touchT = c ? 0 : w.touchT + h; w.touch = w.touchT < 0.07;
      if (!c) continue;
      w.x += c.nx * c.depth; w.y += c.ny * c.depth;
      const vn = w.vx * c.nx + w.vy * c.ny;
      let Jn = 0;
      if (vn < 0) { Jn = -vn * this.mw; w.vx -= c.nx * vn; w.vy -= c.ny * vn; if (-vn > 3) ev.bump = Math.max(ev.bump, -vn); }
      const tx = c.ny, ty = -c.nx;
      const vt = w.vx * tx + w.vy * ty;
      const slip = vt - w.w * this.r;
      const N = Jn + (w.load + this.mw * g * Math.max(0, c.ny)) * h;
      let Jt = -slip / (1 / this.mw + (this.r * this.r) / this.Iw);
      const lim = this.mu * N; Jt = Math.max(-lim, Math.min(lim, Jt));
      w.vx += (tx * Jt) / this.mw; w.vy += (ty * Jt) / this.mw;
      w.w -= (Jt * this.r) / this.Iw;
    }
    // throttle lifts the front a little on the ground (wheelies); in the air gas and brake rotate the bike
    // air control fades in after the first moments in the air, so little hops over bumps don't flip the bike
    if (this.onGround) { if (input.gas && rear.touch) this.va += this.lean * h * (front.touch ? 0.6 : 1); if (rear.touch && front.touch) this.va *= 1 - 3 * h; }
    else { const k = Math.max(0, Math.min(1, (this.airT - 0.15) / 0.35)); if (input.gas) this.va += this.airTurn * k * h; else if (input.brake) this.va -= this.airTurn * k * h; }
    this.va = Math.max(-8, Math.min(8, this.va)) * (1 - 0.4 * h);
    // integrate
    this.x += this.vx * h; this.y += this.vy * h; this.a += this.va * h;
    for (const w of this.wheels) { w.x += w.vx * h; w.y += w.vy * h; w.spin += w.w * h; }
    // air time and flips
    const air = !this.onGround;
    if (air) { this.airT += h; this.airRot += this.va * h; }
    else if (wasAir) {
      const flips = Math.floor(Math.abs(this.airRot) / (Math.PI * 2) + 0.15);
      if (this.airT > 0.25) { ev.landed = 1; ev.airT = this.airT; ev.flips = flips; ev.back = this.airRot > 0; }
      this.airT = 0; this.airRot = 0;
    }
    // the rider's head
    if (!this.crashed) {
      const [hx, hy] = this.headPos();
      if (terrain.contact(hx, hy, this.head.r)) { this.crashed = true; ev.crashed = true; }
    }
  }
  // Puts the bike back upright on the ground at x (after a crash in Stunt Park).
  reset(x, terrain) {
    const y = terrain.heightAt(x) + 0.05;
    this.x = x; this.y = y; this.a = Math.atan(terrain.slopeAt(x)); this.vx = this.vy = this.va = 0;
    for (const w of this.wheels) { const [wx, wy] = this.world(w.ax, w.ay); w.x = wx; w.y = wy + 0.02; w.vx = w.vy = 0; w.w = 0; w.touch = false; w.touchT = 1; }
    this.crashed = false; this.airT = 0; this.airRot = 0;
  }
}
