// Paint Pixels board: draws a puzzle on a canvas and handles zoom, pan and painting.
// A puzzle is {w, h, palette: ['#rrggbb'], cells: Uint8Array of palette indexes (EMPTY for background), total, counts}.
export const EMPTY = 255;

const NUMBER_ZOOM = 15; // CSS px per cell before numbers appear
const GRID_ZOOM = 7;
const MAX_ZOOM = 64;
const LONG_PRESS_MS = 420;

export const hexToRgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// cb: {onFill(colour, filled), onColourDone(colour), onComplete(), onWrong(), onPick(colour)}
export class Board {
  constructor(host, puzzle, filled, cb) {
    this.host = host; this.puzzle = puzzle; this.filled = filled; this.cb = cb;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.baseCtx = this.base.getContext('2d');
    this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.viewW = 0; this.viewH = 0;
    this.scale = 1; this.tx = 0; this.ty = 0; this.minScale = 1;
    this.selected = 0; this.filledCount = 0;
    this.dirty = true; this.raf = 0;
    this.pointers = new Map();
    this.gesture = { kind: 'none' };
    this.lastTap = { t: 0, x: 0, y: 0 };
    this.pulse = null; this.anim = null;
    this.showGrid = true;
    const { w, h, palette, cells } = puzzle;
    this.rgb = palette.map(hexToRgb);
    // Unpainted cells show a pale grey version of the picture so the shape is readable.
    this.grey = this.rgb.map((c) => Math.round(172 + (luminance(c) / 255) * 78));
    this.base.width = w; this.base.height = h;
    this.img = this.baseCtx.createImageData(w, h);
    this.doneByColour = new Array(palette.length).fill(0);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== EMPTY && filled[i]) { this.filledCount++; this.doneByColour[cells[i]]++; }
    }
    this.canvas.className = 'px-canvas';
    this.canvas.style.touchAction = 'none';
    host.appendChild(this.canvas);
    this.readTheme();
    this.bind();
    this.resizeObs = new ResizeObserver(() => this.resize(false));
    this.resizeObs.observe(host);
    this.resize(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.canvas.remove();
  }

  // Board colours come from CSS variables on the game screen, so they follow the light and dark themes.
  readTheme() {
    const s = getComputedStyle(this.host);
    const v = (n, f) => s.getPropertyValue(n).trim() || f;
    this.colours = { bg: v('--px-board', '#f1ebe1'), gridLine: v('--px-grid', 'rgba(0,0,0,0.12)'), text: v('--px-num', '#5b5560'), selText: '#ffffff', sel: v('--px-sel', '#8a84a8') };
    this.selRgb = hexToRgb(this.colours.sel.startsWith('#') ? this.colours.sel : '#8a84a8');
    this.rebuildBase();
  }

  cellRgb(i) {
    const v = this.puzzle.cells[i];
    if (v === EMPTY) return [0, 0, 0, 0];
    if (this.filled[i]) return [...this.rgb[v], 255];
    if (v === this.selected) return [...this.selRgb, 255];
    const g = this.grey[v];
    return [g, g, g, 255];
  }

  rebuildBase() {
    const d = this.img.data;
    for (let i = 0; i < this.puzzle.cells.length; i++) d.set(this.cellRgb(i), i * 4);
    this.baseCtx.putImageData(this.img, 0, 0);
    this.invalidate();
  }

  updateCell(i) {
    this.img.data.set(this.cellRgb(i), i * 4);
    const x = i % this.puzzle.w, y = (i / this.puzzle.w) | 0;
    this.baseCtx.putImageData(this.img, 0, 0, x, y, 1, 1);
    this.invalidate();
  }

  select(colour) { this.selected = colour; this.rebuildBase(); }

  invalidate() {
    if (this.dirty && this.raf) return;
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.draw());
  }

  resize(initial) {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const oldW = this.viewW, oldH = this.viewH;
    this.viewW = r.width; this.viewH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    const fit = Math.min(r.width / this.puzzle.w, r.height / this.puzzle.h) * 0.92;
    this.minScale = fit * 0.6;
    if (initial || !oldW) {
      this.scale = fit;
      this.tx = (r.width - this.puzzle.w * fit) / 2;
      this.ty = (r.height - this.puzzle.h * fit) / 2;
    } else {
      this.tx += (r.width - oldW) / 2;
      this.ty += (r.height - oldH) / 2;
    }
    this.clamp();
    this.invalidate();
  }

  fit() {
    const s = Math.min(this.viewW / this.puzzle.w, this.viewH / this.puzzle.h) * 0.92;
    this.animateTo(s, (this.viewW - this.puzzle.w * s) / 2, (this.viewH - this.puzzle.h * s) / 2);
  }

  clamp() {
    const W = this.puzzle.w * this.scale, H = this.puzzle.h * this.scale, m = 60;
    this.tx = Math.min(this.viewW - m, Math.max(m - W, this.tx));
    this.ty = Math.min(this.viewH - m, Math.max(m - H, this.ty));
  }

  draw() {
    this.raf = 0;
    const now = performance.now();
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.start) / this.anim.dur);
      const e = 1 - Math.pow(1 - t, 3);
      [this.scale, this.tx, this.ty] = this.anim.from.map((f, k) => f + (this.anim.to[k] - f) * e);
      if (t >= 1) this.anim = null;
    }
    this.dirty = false;
    const { ctx, dpr, scale, tx, ty } = this;
    const { w, h, cells } = this.puzzle;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.colours.bg;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, tx, ty, w * scale, h * scale);

    const x0 = Math.max(0, Math.floor(-tx / scale)), y0 = Math.max(0, Math.floor(-ty / scale));
    const x1 = Math.min(w - 1, Math.floor((this.viewW - tx) / scale)), y1 = Math.min(h - 1, Math.floor((this.viewH - ty) / scale));

    if (this.showGrid && scale >= GRID_ZOOM) {
      ctx.strokeStyle = this.colours.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          if (cells[i] === EMPTY || this.filled[i]) continue;
          ctx.rect(Math.round(tx + x * scale) + 0.5, Math.round(ty + y * scale) + 0.5, Math.round(scale), Math.round(scale));
        }
      }
      ctx.stroke();
    }

    if (scale >= NUMBER_ZOOM) {
      ctx.font = `600 ${Math.min(22, scale * 0.48)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x, v = cells[i];
          if (v === EMPTY || this.filled[i]) continue;
          ctx.fillStyle = v === this.selected ? this.colours.selText : this.colours.text;
          ctx.fillText(String(v + 1), tx + (x + 0.5) * scale, ty + (y + 0.54) * scale);
        }
      }
    }

    if (this.pulse) {
      const t = (now - this.pulse.start) / 1600;
      if (t < 1) {
        const x = this.pulse.cell % w, y = (this.pulse.cell / w) | 0;
        const cx = tx + (x + 0.5) * scale, cy = ty + (y + 0.5) * scale;
        for (const k of [0, 0.33]) {
          const p = (t * 2 + k) % 1;
          ctx.strokeStyle = `rgba(255,120,80,${1 - p})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, scale * 0.6 + p * scale * 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        this.invalidate();
      } else this.pulse = null;
    }
    if (this.anim) this.invalidate();
  }

  // ---------- coordinates ----------
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  cellAt(x, y) {
    const cx = Math.floor((x - this.tx) / this.scale), cy = Math.floor((y - this.ty) / this.scale);
    if (cx < 0 || cy < 0 || cx >= this.puzzle.w || cy >= this.puzzle.h) return -1;
    return cy * this.puzzle.w + cx;
  }

  zoomAt(x, y, newScale) {
    const s = Math.max(this.minScale, Math.min(MAX_ZOOM, newScale));
    const gx = (x - this.tx) / this.scale, gy = (y - this.ty) / this.scale;
    this.scale = s;
    this.tx = x - gx * s;
    this.ty = y - gy * s;
    this.clamp();
    this.anim = null;
    this.invalidate();
  }

  zoomBy(factor) { this.zoomAt(this.viewW / 2, this.viewH / 2, this.scale * factor); }

  animateTo(scale, tx, ty, dur = 380) {
    this.anim = { from: [this.scale, this.tx, this.ty], to: [scale, tx, ty], start: performance.now(), dur };
    this.invalidate();
  }

  // Zoom to the nearest unpainted cell of the selected colour and pulse it.
  hint() {
    const { w, cells } = this.puzzle;
    const cx = (this.viewW / 2 - this.tx) / this.scale, cy = (this.viewH / 2 - this.ty) / this.scale;
    let best = -1, bd = Infinity;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== this.selected || this.filled[i]) continue;
      const d = (i % w + 0.5 - cx) ** 2 + (((i / w) | 0) + 0.5 - cy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return false;
    const s = Math.max(this.scale, 26), x = best % w, y = (best / w) | 0;
    this.animateTo(s, this.viewW / 2 - (x + 0.5) * s, this.viewH / 2 - (y + 0.5) * s, 500);
    this.pulse = { cell: best, start: performance.now() + 300 };
    return true;
  }

  // ---------- painting ----------
  paint(i) {
    if (i < 0) return false;
    const v = this.puzzle.cells[i];
    if (v === EMPTY || this.filled[i] || v !== this.selected) return false;
    this.filled[i] = 1;
    this.filledCount++;
    this.doneByColour[v]++;
    this.updateCell(i);
    this.cb.onFill(v, this.filledCount);
    if (this.doneByColour[v] >= this.puzzle.counts[v]) this.cb.onColourDone(v);
    if (this.filledCount >= this.puzzle.total) this.cb.onComplete();
    return true;
  }

  paintLine(x0, y0, x1, y1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (this.scale * 0.4)));
    for (let s = 1; s <= steps; s++) this.paint(this.cellAt(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps));
  }

  // ---------- input ----------
  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e, true));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.local(e);
      this.zoomAt(p.x, p.y, this.scale * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  cancelPending() { if (this.gesture.kind === 'pending') clearTimeout(this.gesture.timer); }

  down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.anim = null;
    if (this.pointers.size === 2) {
      this.cancelPending();
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: this.scale, gx: (mid.x - this.tx) / this.scale, gy: (mid.y - this.ty) / this.scale };
      return;
    }
    if (this.pointers.size > 2) return;
    if (e.button === 1 || e.button === 2) { this.gesture = { kind: 'pan', x: p.x, y: p.y }; return; }
    const cell = this.cellAt(p.x, p.y);
    const v = cell >= 0 ? this.puzzle.cells[cell] : EMPTY;
    // Starting on a paintable cell of the selected colour paints; anything else pans.
    if (cell >= 0 && v === this.selected && !this.filled[cell] && this.scale >= GRID_ZOOM * 0.8) {
      this.paint(cell);
      this.gesture = { kind: 'paint', lastX: p.x, lastY: p.y };
      return;
    }
    const timer = setTimeout(() => {
      // Long press on an unpainted cell picks up its colour.
      if (this.gesture.kind === 'pending' && cell >= 0 && v !== EMPTY && !this.filled[cell]) {
        this.cb.onPick(v);
        this.gesture = { kind: 'none' };
      }
    }, LONG_PRESS_MS);
    this.gesture = { kind: 'pending', x: p.x, y: p.y, cell, timer };
  }

  move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (g.kind === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = Math.max(this.minScale, Math.min(MAX_ZOOM, (g.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist));
      this.scale = s;
      this.tx = mid.x - g.gx * s;
      this.ty = mid.y - g.gy * s;
      this.clamp();
      this.invalidate();
    } else if (g.kind === 'paint') {
      this.paintLine(g.lastX, g.lastY, p.x, p.y);
      g.lastX = p.x; g.lastY = p.y;
    } else if (g.kind === 'pending') {
      if (Math.hypot(p.x - g.x, p.y - g.y) > 8) { clearTimeout(g.timer); this.gesture = { kind: 'pan', x: p.x, y: p.y }; }
    } else if (g.kind === 'pan') {
      this.tx += p.x - g.x; this.ty += p.y - g.y;
      g.x = p.x; g.y = p.y;
      this.clamp();
      this.invalidate();
    }
  }

  up(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (g.kind === 'pinch') {
      // Lifting one finger of a pinch carries on as a pan with the other.
      const rest = [...this.pointers.values()][0];
      this.gesture = rest ? { kind: 'pan', x: rest.x, y: rest.y } : { kind: 'none' };
      return;
    }
    if (g.kind === 'pending' && !cancelled) {
      clearTimeout(g.timer);
      const now = performance.now(), p = this.local(e);
      if (now - this.lastTap.t < 300 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30) {
        // Double tap: zoom in to read numbers, or back out to fit.
        if (this.scale < NUMBER_ZOOM * 1.2) {
          const s = NUMBER_ZOOM * 1.8, gx = (p.x - this.tx) / this.scale, gy = (p.y - this.ty) / this.scale;
          this.animateTo(s, p.x - gx * s, p.y - gy * s);
        } else this.fit();
        this.lastTap.t = 0;
      } else {
        this.lastTap = { t: now, x: p.x, y: p.y };
        const v = g.cell >= 0 ? this.puzzle.cells[g.cell] : EMPTY;
        if (g.cell >= 0 && v !== EMPTY && !this.filled[g.cell] && v !== this.selected && this.scale >= GRID_ZOOM) this.cb.onWrong();
      }
    }
    if (this.pointers.size === 0) this.gesture = { kind: 'none' };
  }

  // Full-colour picture for sharing; empty cells stay transparent.
  snapshot(cellPx = 16, complete = false) {
    const { w, h, cells } = this.puzzle;
    const out = document.createElement('canvas');
    out.width = w * cellPx; out.height = h * cellPx;
    const ctx = out.getContext('2d');
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i];
      if (v === EMPTY) continue;
      if (!complete && !this.filled[i]) { const g = this.grey[v]; ctx.fillStyle = `rgb(${g},${g},${g})`; } else ctx.fillStyle = this.puzzle.palette[v];
      ctx.fillRect((i % w) * cellPx, ((i / w) | 0) * cellPx, cellPx, cellPx);
    }
    return out;
  }
}

// Small preview for cards: grey, with painted cells in colour.
export function renderThumb(canvas, meta, cells, filled, complete) {
  canvas.width = meta.w; canvas.height = meta.h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(meta.w, meta.h);
  const rgb = meta.palette.map(hexToRgb);
  const grey = rgb.map((c) => Math.round(110 + (luminance(c) / 255) * 135));
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v === EMPTY) continue;
    if (complete || (filled && filled[i])) img.data.set([...rgb[v], 255], i * 4);
    else img.data.set([grey[v], grey[v], grey[v], 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
}
