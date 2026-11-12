/**
 * Draws a scene in the Studio style: a dark teal stage, fine white lines, one
 * blue accent and a warm second accent. Scripts choose what to show; how it
 * looks is decided here, so every generated scene looks the same family.
 */

import type { Bounds, Colour, MathItem, Scene } from "./core";
import type { Body, Vec } from "./world";

export const PALETTE = {
  stage: "#0a2a31",
  white: "rgba(234,242,242,0.92)",
  blue: "#8ccaff",
  warm: "#e9c9a6",
  grey: "rgba(234,242,242,0.45)",
  faint: "rgba(234,242,242,0.16)",
};
const tone = (c: Colour) => PALETTE[c];
const FONT = "Inter, system-ui, -apple-system, sans-serif";

interface Box { x: number; y: number; w: number; h: number }

export class Renderer {
  private arrowRef = 0;
  constructor(private ctx: CanvasRenderingContext2D) {}

  render(scene: Scene, w: number, h: number, bounds: Bounds | null) {
    const c = this.ctx;
    c.save();
    c.fillStyle = PALETTE.stage; c.fillRect(0, 0, w, h);
    const pad = Math.min(36, Math.max(16, w * 0.03));
    const hasWorld = !scene.world.isEmpty() || scene.fields.any() || scene.drawables.some(d => d.type === "wave");
    const maths = scene.maths.filter(m => !m.visible || m.visible());
    const full: Box = { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad };
    if (hasWorld && maths.length) {
      const split = full.w * 0.58;
      this.drawWorld(scene, { ...full, w: split - pad / 2 }, bounds);
      this.drawMaths(maths, { x: full.x + split + pad / 2, y: full.y, w: full.w - split - pad / 2, h: full.h }, scene.world.t);
    } else if (hasWorld) this.drawWorld(scene, full, bounds);
    else this.drawMaths(maths, full, scene.world.t);
    c.restore();
  }

  // ---------- world ----------

  private drawWorld(scene: Scene, box: Box, bounds: Bounds | null) {
    const { world } = scene, c = this.ctx;
    let vx: [number, number], vy: [number, number];
    if (world.view) { vx = world.view.x; vy = world.view.y; }
    else if (bounds) {
      const sx = Math.max(bounds.x[1] - bounds.x[0], 2.5), sy = Math.max(bounds.y[1] - bounds.y[0], 2.5);
      const mx = (bounds.x[0] + bounds.x[1]) / 2, my = (bounds.y[0] + bounds.y[1]) / 2;
      vx = [mx - sx * 0.62, mx + sx * 0.62]; vy = [my - sy * 0.62, my + sy * 0.62];
    } else { vx = [-5, 5]; vy = [-3, 3]; }
    const scale = Math.min(box.w / (vx[1] - vx[0]), box.h / (vy[1] - vy[0]));
    const cx = box.x + box.w / 2 - ((vx[0] + vx[1]) / 2) * scale, cy = box.y + box.h / 2 + ((vy[0] + vy[1]) / 2) * scale;
    const X = (x: number) => cx + x * scale, Y = (y: number) => cy - y * scale;
    const span = Math.max(vx[1] - vx[0], vy[1] - vy[0]);

    if (scene.fields.any()) this.drawField(scene, vx, vy, X, Y);

    if (world.groundY !== null) {
      const gy = Y(world.groundY);
      c.strokeStyle = PALETTE.grey; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(box.x, gy); c.lineTo(box.x + box.w, gy); c.stroke();
      c.strokeStyle = PALETTE.faint; c.lineWidth = 1;
      for (let x = box.x; x < box.x + box.w; x += 14) { c.beginPath(); c.moveTo(x, gy + 1); c.lineTo(x - 8, gy + 9); c.stroke(); }
    }
    for (const s of world.slopes) {
      c.beginPath(); c.moveTo(X(s.top[0]), Y(s.top[1])); c.lineTo(X(s.bottom[0]), Y(s.bottom[1])); c.lineTo(X(s.top[0]), Y(0)); c.closePath();
      c.fillStyle = "rgba(234,242,242,0.04)"; c.fill(); c.strokeStyle = PALETTE.grey; c.lineWidth = 1.2; c.stroke();
    }
    for (const sp of world.springs) {
      const a: Vec = Array.isArray(sp.a) ? sp.a : [sp.a.x, sp.a.y];
      this.zigzag(X(a[0]), Y(a[1]), X(sp.b.x), Y(sp.b.y));
      if (Array.isArray(sp.a)) this.mount(X(a[0]), Y(a[1]));
    }
    for (const p of world.pendulums) {
      this.mount(X(p.pivot[0]), Y(p.pivot[1]));
      c.strokeStyle = "rgba(234,242,242,0.6)"; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(X(p.pivot[0]), Y(p.pivot[1])); c.lineTo(X(p.bob.x), Y(p.bob.y)); c.stroke();
    }
    for (const d of scene.drawables) {
      if (d.visible && !d.visible()) continue;
      if (d.type === "trace") this.trace(d.body, d.seconds, tone(d.colour), X, Y);
      else if (d.type === "wave") this.wave(d.amplitude(), d.wavelength(), d.speed(), d.y, d.x, d.standing, world.t, tone(d.colour), X, Y);
      else if (d.type === "line") {
        const pts = d.points(); if (pts.length < 2) continue;
        c.save(); c.strokeStyle = tone(d.colour); c.lineWidth = 1.2; if (d.dashed) c.setLineDash([5, 5]);
        c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke(); c.restore();
      }
    }
    for (const b of world.allBodies()) this.body(b, X, Y, scale);

    const arrows = scene.drawables.filter(d => d.type === "arrow" && (!d.visible || d.visible()));
    let biggest = 0;
    for (const d of arrows) if (d.type === "arrow") { const v = d.vec(); biggest = Math.max(biggest, Math.hypot(v[0], v[1])); }
    this.arrowRef = Math.max(this.arrowRef, biggest);
    for (const d of arrows) {
      if (d.type !== "arrow") continue;
      const v = d.vec(), m = Math.hypot(v[0], v[1]);
      if (!(m > 1e-9) || !(this.arrowRef > 0)) continue;
      const len = (m / this.arrowRef) * span * 0.22 * d.scale;
      const [fx, fy] = d.from();
      this.arrow(X(fx), Y(fy), X(fx + (v[0] / m) * len), Y(fy + (v[1] / m) * len), tone(d.colour), d.label);
    }
    for (const d of scene.drawables) {
      if (d.type !== "label" || (d.visible && !d.visible())) continue;
      const [lx, ly] = d.at();
      this.text(d.text(), X(lx) + 10, Y(ly) - 10, tone(d.colour), "left");
    }
  }

  private body(b: Body, X: (x: number) => number, Y: (y: number) => number, scale: number) {
    const c = this.ctx;
    if (b.size) {
      const [bw, bh] = b.size;
      c.save(); c.translate(X(b.x), Y(b.y)); c.rotate(-b.angle);
      c.fillStyle = "rgba(234,242,242,0.14)"; c.strokeStyle = PALETTE.white; c.lineWidth = 1.3;
      c.beginPath(); c.rect((-bw / 2) * scale, (-bh / 2) * scale, bw * scale, bh * scale); c.fill(); c.stroke(); c.restore();
    } else {
      const r = Math.max(4, b.radius * scale);
      const fill = b.charge > 0 ? PALETTE.warm : b.charge < 0 ? PALETTE.blue : b.color === "blue" ? PALETTE.blue : b.color === "warm" ? PALETTE.warm : "#d9e6e8";
      c.fillStyle = fill; c.beginPath(); c.arc(X(b.x), Y(b.y), r, 0, Math.PI * 2); c.fill();
      if (b.charge) { c.fillStyle = PALETTE.stage; c.font = `600 ${Math.round(r * 1.2)}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(b.charge > 0 ? "+" : "−", X(b.x), Y(b.y) + 0.5); }
    }
    if (b.label) this.text(b.label, X(b.x), Y(b.y) - Math.max(14, (b.size?.[1] ?? b.radius) * scale + 10), PALETTE.grey, "center");
  }

  private trace(b: Body, seconds: number, col: string, X: (x: number) => number, Y: (y: number) => number) {
    const pts = b.path.slice(-Math.max(2, Math.round(seconds * 30)));
    const c = this.ctx; c.save(); c.strokeStyle = col; c.lineWidth = 1.4;
    for (let i = 1; i < pts.length; i++) {
      c.globalAlpha = 0.08 + 0.75 * (i / pts.length);
      c.beginPath(); c.moveTo(X(pts[i - 1][0]), Y(pts[i - 1][1])); c.lineTo(X(pts[i][0]), Y(pts[i][1])); c.stroke();
    }
    c.restore();
  }

  private wave(A: number, L: number, v: number, y0: number, xr: [number, number], standing: boolean, t: number, col: string, X: (x: number) => number, Y: (y: number) => number) {
    const c = this.ctx, k = (2 * Math.PI) / Math.max(1e-6, L), w = k * v;
    c.save(); c.strokeStyle = PALETTE.faint; c.lineWidth = 1; c.setLineDash([4, 6]);
    c.beginPath(); c.moveTo(X(xr[0]), Y(y0)); c.lineTo(X(xr[1]), Y(y0)); c.stroke(); c.setLineDash([]);
    c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i <= 240; i++) {
      const x = xr[0] + ((xr[1] - xr[0]) * i) / 240;
      const y = y0 + (standing ? A * Math.sin(k * x) * Math.cos(w * t) : A * Math.sin(k * x - w * t));
      if (i) c.lineTo(X(x), Y(y)); else c.moveTo(X(x), Y(y));
    }
    c.stroke(); c.restore();
  }

  private drawField(scene: Scene, vx: [number, number], vy: [number, number], X: (x: number) => number, Y: (y: number) => number) {
    const c = this.ctx, f = scene.fields, span = Math.max(vx[1] - vx[0], vy[1] - vy[0]);
    const starts: Vec[] = [];
    const pos = f.charges.filter(q => q.q > 0), neg = f.charges.filter(q => q.q < 0);
    const sources = pos.length ? pos : neg;
    const dir = pos.length ? 1 : -1;
    for (const q of sources) for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; starts.push([q.x + Math.cos(a) * span * 0.02, q.y + Math.sin(a) * span * 0.02]); }
    if (!f.charges.length && f.uniformE) {
      const e = f.uniformE, m = Math.hypot(e[0], e[1]) || 1, ux = e[0] / m, uy = e[1] / m;
      for (let i = 0; i < 9; i++) { const s = -0.5 + i / 8; const cxm = (vx[0] + vx[1]) / 2 - ux * span * 0.6, cym = (vy[0] + vy[1]) / 2 - uy * span * 0.6; starts.push([cxm - uy * s * span, cym + ux * s * span]); }
    }
    c.save(); c.strokeStyle = "rgba(140,202,255,0.42)"; c.lineWidth = 1.1;
    for (const s of starts) {
      let [x, y] = s; c.beginPath(); c.moveTo(X(x), Y(y));
      for (let i = 0; i < 400; i++) {
        const e = f.E(x, y), m = Math.hypot(e[0], e[1]); if (!(m > 1e-9)) break;
        const h = span * 0.006; x += dir * (e[0] / m) * h; y += dir * (e[1] / m) * h;
        if (x < vx[0] - span * 0.3 || x > vx[1] + span * 0.3 || y < vy[0] - span * 0.3 || y > vy[1] + span * 0.3) break;
        if (f.charges.some(q => q.q * dir < 0 && Math.hypot(x - q.x, y - q.y) < span * 0.015)) break;
        c.lineTo(X(x), Y(y));
      }
      c.stroke();
    }
    for (const q of f.charges) {
      const r = 11; c.fillStyle = q.q > 0 ? PALETTE.warm : PALETTE.blue; c.beginPath(); c.arc(X(q.x), Y(q.y), r, 0, Math.PI * 2); c.fill();
      c.fillStyle = PALETTE.stage; c.font = `600 15px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(q.q > 0 ? "+" : "−", X(q.x), Y(q.y) + 0.5);
    }
    c.restore();
  }

  // ---------- maths ----------

  private drawMaths(items: MathItem[], box: Box, t: number) {
    const gap = 24, each = (box.h - gap * (items.length - 1)) / Math.max(1, items.length);
    items.forEach((m, i) => {
      const b = { x: box.x, y: box.y + i * (each + gap), w: box.w, h: each };
      if (m.type === "plot") this.plot(m, b, t);
      else if (m.type === "numberLine") this.numberLine(m, b);
      else if (m.type === "fractionBar") this.fractionBar(m, b);
      else this.hundredGrid(m, b);
    });
  }

  private plot(m: Extract<MathItem, { type: "plot" }>, b: Box, t: number) {
    const c = this.ctx, inset = 34, top = m.label ? 26 : 8;
    const px = b.x + inset, py = b.y + top, pw = b.w - inset - 8, ph = b.h - top - 26;
    const X = (x: number) => px + ((x - m.x[0]) / (m.x[1] - m.x[0])) * pw, Y = (y: number) => py + ph - ((y - m.y[0]) / (m.y[1] - m.y[0])) * ph;
    if (m.label) this.text(m.label, b.x, b.y + 12, PALETTE.grey, "left");
    c.strokeStyle = PALETTE.faint; c.lineWidth = 1;
    const tick = (lo: number, hi: number) => { const r = hi - lo, s = Math.pow(10, Math.floor(Math.log10(r / 4))); return r / s > 20 ? s * 5 : r / s > 8 ? s * 2 : s; };
    const sx = tick(m.x[0], m.x[1]), sy = tick(m.y[0], m.y[1]);
    for (let x = Math.ceil(m.x[0] / sx) * sx; x <= m.x[1] + 1e-9; x += sx) { c.beginPath(); c.moveTo(X(x), py); c.lineTo(X(x), py + ph); c.stroke(); this.small(fmt(x), X(x), py + ph + 14, "center"); }
    for (let y = Math.ceil(m.y[0] / sy) * sy; y <= m.y[1] + 1e-9; y += sy) { c.beginPath(); c.moveTo(px, Y(y)); c.lineTo(px + pw, Y(y)); c.stroke(); this.small(fmt(y), px - 6, Y(y) + 4, "right"); }
    c.strokeStyle = PALETTE.grey; c.lineWidth = 1.2;
    if (m.y[0] < 0 && m.y[1] > 0) { c.beginPath(); c.moveTo(px, Y(0)); c.lineTo(px + pw, Y(0)); c.stroke(); }
    if (m.x[0] < 0 && m.x[1] > 0) { c.beginPath(); c.moveTo(X(0), py); c.lineTo(X(0), py + ph); c.stroke(); }
    c.save(); c.beginPath(); c.rect(px, py, pw, ph); c.clip();
    c.strokeStyle = PALETTE.blue; c.lineWidth = 2; c.beginPath();
    let pen = false;
    for (let i = 0; i <= 400; i++) {
      const x = m.x[0] + ((m.x[1] - m.x[0]) * i) / 400, y = m.fn(x, t);
      if (!Number.isFinite(y)) { pen = false; continue; }
      if (pen) c.lineTo(X(x), Y(y)); else { c.moveTo(X(x), Y(y)); pen = true; }
    }
    c.stroke(); c.restore();
    for (const p of m.points) {
      const x = p.x(), y = m.fn(x, t); if (!Number.isFinite(y)) continue;
      c.fillStyle = PALETTE.warm; c.beginPath(); c.arc(X(x), Y(y), 5, 0, Math.PI * 2); c.fill();
      if (p.label) this.text(p.label, X(x) + 9, Y(y) - 9, PALETTE.warm, "left");
    }
  }

  private numberLine(m: Extract<MathItem, { type: "numberLine" }>, b: Box) {
    const c = this.ctx, y = b.y + b.h / 2, x0 = b.x + 16, x1 = b.x + b.w - 16;
    const X = (v: number) => x0 + ((v - m.min) / (m.max - m.min)) * (x1 - x0);
    if (m.label) this.text(m.label, b.x, b.y + 12, PALETTE.grey, "left");
    c.strokeStyle = PALETTE.white; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
    const n = Math.round((m.max - m.min) / m.step);
    const den = Math.round(1 / m.step);
    for (let i = 0; i <= n && n <= 200; i++) {
      const v = m.min + i * m.step, x = X(v);
      c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x, y + 8); c.stroke();
      const lab = m.fractions && den > 1 && Math.abs(v - Math.round(v)) > 1e-9 ? `${Math.round(v * den)}/${den}` : fmt(v);
      if (n <= 24) this.small(lab, x, y + 26, "center");
    }
    const v = m.value();
    if (Number.isFinite(v)) {
      const x = X(Math.max(m.min, Math.min(m.max, v)));
      c.strokeStyle = PALETTE.warm; c.lineWidth = 4; c.beginPath(); c.moveTo(X(Math.max(m.min, 0)), y); c.lineTo(x, y); c.stroke();
      c.fillStyle = PALETTE.warm; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
    }
  }

  private fractionBar(m: Extract<MathItem, { type: "fractionBar" }>, b: Box) {
    const c = this.ctx, n = Math.max(1, Math.min(48, Math.round(m.parts()))), k = Math.max(0, Math.min(n, m.shaded()));
    const bh = Math.min(70, b.h * 0.5), y = b.y + (b.h - bh) / 2 + (m.label ? 8 : 0), w = b.w, part = w / n;
    if (m.label) this.text(m.label, b.x, y - 14, PALETTE.grey, "left");
    c.fillStyle = "rgba(140,202,255,0.38)";
    const whole = Math.floor(k);
    for (let i = 0; i < whole; i++) c.fillRect(b.x + i * part + 2, y + 2, part - 4, bh - 4);
    if (k > whole) c.fillRect(b.x + whole * part + 2, y + 2, (part - 4) * (k - whole), bh - 4);
    c.strokeStyle = PALETTE.white; c.lineWidth = 1.3; c.strokeRect(b.x, y, w, bh);
    for (let i = 1; i < n; i++) { c.beginPath(); c.moveTo(b.x + i * part, y); c.lineTo(b.x + i * part, y + bh); c.stroke(); }
    if (n <= 16) for (let i = 0; i < n; i++) this.small(`1/${n}`, b.x + (i + 0.5) * part, y + bh / 2 + 4, "center");
  }

  private hundredGrid(m: Extract<MathItem, { type: "hundredGrid" }>, b: Box) {
    const c = this.ctx, top = m.label ? 22 : 0, size = Math.min(b.w, b.h - top), cell = size / 10, x0 = b.x + (b.w - size) / 2, y0 = b.y + top;
    if (m.label) this.text(m.label, b.x, b.y + 12, PALETTE.grey, "left");
    const filled = Math.max(0, Math.min(100, m.value() * 100));
    for (let i = 0; i < 100; i++) {
      const x = x0 + (i % 10) * cell, y = y0 + Math.floor(i / 10) * cell;
      c.strokeStyle = PALETTE.faint; c.lineWidth = 1; c.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      const f = Math.max(0, Math.min(1, filled - i));
      if (f > 0) { c.fillStyle = "rgba(140,202,255,0.55)"; c.fillRect(x + 1.5, y + 1.5, (cell - 3) * f, cell - 3); }
    }
  }

  // ---------- pieces ----------

  private arrow(x1: number, y1: number, x2: number, y2: number, col: string, label?: string) {
    const c = this.ctx, len = Math.hypot(x2 - x1, y2 - y1); if (len < 4) return;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len, head = Math.min(10, len * 0.4), wide = head * 0.36;
    const bx = x2 - ux * head, by = y2 - uy * head;
    c.save();
    c.strokeStyle = "rgba(4,16,20,0.55)"; c.lineWidth = 3.5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(bx, by); c.stroke();
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(bx + ux, by + uy); c.stroke();
    c.beginPath(); c.moveTo(x2, y2); c.lineTo(bx - uy * wide, by + ux * wide); c.lineTo(bx + uy * wide, by - ux * wide); c.closePath(); c.fill();
    c.restore();
    if (label) {
      const side = Math.abs(uy) > Math.abs(ux);
      this.text(label, side ? x2 + 8 : x2 + ux * 8, side ? y2 + uy * 4 : y2 - 10, col, side ? "left" : ux > 0 ? "left" : "right");
    }
  }

  private zigzag(x1: number, y1: number, x2: number, y2: number) {
    const c = this.ctx, len = Math.hypot(x2 - x1, y2 - y1); if (len < 2) return;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len, n = 14, amp = 7, lead = Math.min(10, len * 0.15);
    c.strokeStyle = "rgba(234,242,242,0.6)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x1, y1);
    c.lineTo(x1 + ux * lead, y1 + uy * lead);
    for (let i = 1; i < n; i++) {
      const d = lead + ((len - 2 * lead) * i) / n, s = i % 2 ? amp : -amp;
      c.lineTo(x1 + ux * d - uy * s, y1 + uy * d + ux * s);
    }
    c.lineTo(x2 - ux * lead, y2 - uy * lead); c.lineTo(x2, y2); c.stroke();
  }

  private mount(x: number, y: number) {
    const c = this.ctx; c.strokeStyle = PALETTE.grey; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x + 16, y); c.stroke();
    c.fillStyle = PALETTE.white; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
  }

  private text(s: string, x: number, y: number, col: string, align: CanvasTextAlign) {
    const c = this.ctx; c.save(); c.font = `600 11px ${FONT}`; c.fillStyle = col; c.textAlign = align; c.textBaseline = "alphabetic";
    try { (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.4px"; } catch { /* older browsers */ }
    c.fillText(s.toUpperCase(), x, y); c.restore();
  }

  private small(s: string, x: number, y: number, align: CanvasTextAlign) {
    const c = this.ctx; c.save(); c.font = `500 11px ${FONT}`; c.fillStyle = PALETTE.grey; c.textAlign = align; c.fillText(s, x, y); c.restore();
  }
}

function fmt(v: number) {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}
