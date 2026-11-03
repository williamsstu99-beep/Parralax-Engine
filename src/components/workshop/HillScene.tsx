"use client";

import { useRef, useState } from "react";
import SceneShell from "./SceneShell";
import { Segmented } from "./controls";
import { approach, font, useCanvas } from "./useCanvas";

/**
 * A circuit reimagined as a hill. The battery is a lift that raises each
 * charge up to a height (its voltage); charges roll down through the bulbs,
 * giving up that height as light, and return to the bottom. Same physics as
 * the circuit: current = voltage / resistance, power in a bulb = drop × current.
 */

type Layout = "one" | "series" | "parallel";
type Pt = [number, number];
interface Seg { a: Pt; b: Pt }
interface Bulb { id: number; x: number; y: number; drop: number }
interface Branch { segs: Seg[]; length: number; bulbs: Bulb[] }

const LIFT_X = -4.6, CELL = 1.15;

function branches(layout: Layout, V: number): Branch[] {
  const top = V * CELL, mid = top / 2;
  // Downhill stretches (where the bulbs sit) are smooth slopes rather than straight ramps.
  const mk = (pts: Pt[], bulbs: Record<number, number>): Branch => {
    const segs: Seg[] = [], out: Bulb[] = [];
    pts.slice(1).forEach((b, i) => {
      const a = pts[i];
      if (bulbs[i] === undefined) { segs.push({ a, b }); return; }
      const n = 24;
      for (let k = 0; k < n; k++) {
        const f = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * (1 - Math.cos(Math.PI * t)) / 2];
        segs.push({ a: f(k / n), b: f((k + 1) / n) });
      }
      out.push({ id: bulbs[i], x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, drop: (a[1] - b[1]) / CELL });
    });
    return { segs, length: segs.reduce((n, s) => n + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), 0), bulbs: out };
  };
  if (layout === "one") return [mk([[LIFT_X, 0], [LIFT_X, top], [1.6, top], [3.4, 0], [LIFT_X, 0]], { 2: 0 })];
  if (layout === "series") return [mk([[LIFT_X, 0], [LIFT_X, top], [0.2, top], [1.6, mid], [2.6, mid], [4.0, 0], [LIFT_X, 0]], { 2: 0, 4: 1 })];
  return [
    mk([[LIFT_X, 0], [LIFT_X, top], [0.4, top], [2.0, 0], [LIFT_X, 0]], { 2: 0 }),
    mk([[LIFT_X, 0], [LIFT_X, top], [2.6, top], [4.2, 0], [LIFT_X, 0]], { 2: 1 }),
  ];
}

function caption(layout: Layout, cells: number) {
  const tall = cells === 3 ? " A bigger battery builds a taller hill, so each charge has more energy to give." : cells === 1 ? " Try a bigger battery: a taller hill." : "";
  if (layout === "series") return "Two bulbs in a row share the hill: each charge drops only half the height in each bulb, so both glow dimmer. The longer path also slows the flow." + (cells < 3 ? " Try a bigger battery." : "");
  if (layout === "parallel") return "Side by side, each path drops the whole height, so each bulb gets the full voltage and glows as bright as one alone. The battery has to lift twice as many charges, so it works harder.";
  return "The battery is a lift: it raises each charge up the hill, giving it energy. Height is voltage. Charges roll down through the bulb, giving that energy up as light, then go round again." + tall;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function HillScene() {
  const [cells, setCells] = useState<"1" | "2" | "3">("2");
  const [layout, setLayout] = useState<Layout>("one");

  const sim = useRef({ key: "", born: 0, pos: [] as number[][], height: 2 * CELL, glow: [0, 0], lift: 0 });

  const ref = useCanvas(({ ctx, w, h, dt, time }) => {
    const S = sim.current, V = Number(cells);
    const key = `${layout}${cells}`;
    const bs = branches(layout, V);
    const R = layout === "one" ? 1 : layout === "series" ? 2 : 0.5;
    const total = V / R, perBranch = layout === "parallel" ? total / 2 : total;
    const GAP = 0.55;
    if (S.key !== key) {
      S.key = key; S.born = time;
      S.pos = bs.map((b, k) => Array.from({ length: Math.floor(b.length / GAP) }, (_, i) => i * GAP + (k ? GAP / 2 : 0)));
    }
    S.height = approach(S.height, V * CELL, 4, dt);
    S.lift += total * dt;

    const s = Math.min(w / 13, h / 5.6);             // leave room for the labels either side
    const ox = w * 0.5 + 0.2 * s, oy = h * 0.82;
    const X = (x: number) => ox + x * s, Y = (y: number) => oy - y * s;
    ctx.clearRect(0, 0, w, h);

    const drawn = Math.min(1, time / 1.1);
    const fresh = Math.min(1, (time - S.born) * 2.5);

    // The hill itself: a soft landform under the highest track.
    const outline = bs[bs.length - 1].segs.slice(1, -1);
    ctx.save(); ctx.globalAlpha = drawn;
    ctx.beginPath(); ctx.moveTo(X(LIFT_X), Y(0));
    for (const sg of outline) { ctx.lineTo(X(sg.a[0]), Y(sg.a[1])); ctx.lineTo(X(sg.b[0]), Y(sg.b[1])); }
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, Y(V * CELL), 0, Y(0));
    hg.addColorStop(0, "rgba(255, 190, 110, 0.2)"); hg.addColorStop(0.55, "rgba(150, 140, 255, 0.08)"); hg.addColorStop(1, "rgba(80, 130, 255, 0.03)");
    ctx.fillStyle = hg; ctx.fill();
    // Faint contour lines across the hill, like a map.
    ctx.clip(); ctx.strokeStyle = "rgba(255, 220, 170, 0.06)"; ctx.lineWidth = 1;
    for (let y = 0.3; y < V * CELL; y += 0.3) { ctx.beginPath(); ctx.moveTo(X(LIFT_X), Y(y)); ctx.lineTo(X(5), Y(y)); ctx.stroke(); }
    ctx.restore();

    // Height lines: each is one battery cell's worth of voltage.
    ctx.save(); ctx.font = font(500, 12); ctx.textBaseline = "middle"; ctx.textAlign = "left";
    for (let c = 0; c <= 3; c++) {
      const y = Y(c * CELL), on = c <= V;
      ctx.strokeStyle = `rgba(160, 185, 235, ${on ? 0.14 : 0.05})`; ctx.setLineDash([2, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(LIFT_X - 0.3), y); ctx.lineTo(X(5.2), y); ctx.stroke();
      ctx.fillStyle = `rgba(190, 205, 235, ${on ? 0.6 : 0.2})`; ctx.fillText(c === 0 ? "0 V" : `${(c * 1.5).toFixed(1)} V`, X(5.3), y);
    }
    ctx.restore();

    // The track: draws itself in, left to right.
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const b of bs) {
      ctx.setLineDash([b.length * s * drawn, b.length * s * 2]);
      ctx.beginPath(); ctx.moveTo(X(b.segs[0].a[0]), Y(b.segs[0].a[1]));
      for (const sg of b.segs) ctx.lineTo(X(sg.b[0]), Y(sg.b[1]));
      ctx.strokeStyle = "rgba(5, 7, 13, 0.7)"; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = "rgba(175, 215, 255, 0.55)"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();

    // The battery: a lift, with chevrons climbing as it works.
    const top = S.height;
    {
      const x = X(LIFT_X), y0 = Y(0), y1 = Y(top), wd = 0.5 * s;
      ctx.save(); ctx.globalAlpha = drawn;
      const lg = ctx.createLinearGradient(0, y1, 0, y0);
      lg.addColorStop(0, "rgba(255, 190, 110, 0.28)"); lg.addColorStop(1, "rgba(110, 160, 255, 0.12)");
      ctx.fillStyle = lg; ctx.beginPath(); ctx.roundRect(x - wd / 2, y1 - 6, wd, y0 - y1 + 12, 10); ctx.fill();
      ctx.strokeStyle = "rgba(255, 210, 150, 0.6)"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x - wd / 2, y1 - 6, wd, y0 - y1 + 12, 10); ctx.clip();
      ctx.strokeStyle = "rgba(255, 225, 180, 0.5)"; ctx.lineWidth = 1.6;
      const step = 0.42 * s, off = (S.lift * s * 0.9) % step;
      for (let y = y0 + step - off; y > y1 - step; y -= step) { ctx.beginPath(); ctx.moveTo(x - wd * 0.22, y + 4); ctx.lineTo(x, y - 3); ctx.lineTo(x + wd * 0.22, y + 4); ctx.stroke(); }
      ctx.restore();
      ctx.save(); ctx.globalAlpha = drawn; ctx.font = font(600, 13); ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255, 215, 160, 0.9)"; ctx.fillText("Battery", x - wd / 2 - 12, (y0 + y1) / 2 - 9);
      ctx.font = font(500, 12); ctx.fillStyle = "rgba(200, 212, 235, 0.65)"; ctx.fillText("lifts charges up", x - wd / 2 - 12, (y0 + y1) / 2 + 9);
      ctx.restore();
    }

    // Bulbs sit on the downhill stretches. Brightness = height dropped × how fast charges flow.
    const bulbs: (Bulb & { I: number })[] = [];
    for (const b of bs) for (const bl of b.bulbs) bulbs[bl.id] = { ...bl, I: perBranch };
    bulbs.forEach((bl, k) => {
      const P = bl.drop * bl.I;
      S.glow[k] = approach(S.glow[k] ?? 0, 1 - Math.exp(-P / 2.2), 5, dt);
      const g = S.glow[k] * fresh * drawn, x = X(bl.x) + 0.42 * s, y = Y(bl.y) - 0.42 * s, r = 0.26 * s;
      if (g > 0.02) {
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r * (1.5 + 5 * g));
        rg.addColorStop(0, `rgba(255, 226, 150, ${0.75 * g})`); rg.addColorStop(1, "rgba(255, 190, 90, 0)");
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r * (1.5 + 5 * g), 0, Math.PI * 2); ctx.fill();
      }
      ctx.save(); ctx.globalAlpha = drawn;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.round(lerp(22, 255, g))}, ${Math.round(lerp(30, 236, g))}, ${Math.round(lerp(50, 180, g))}, 0.95)`; ctx.fill();
      ctx.strokeStyle = g > 0.3 ? "rgba(255, 246, 220, 0.9)" : "rgba(160, 180, 220, 0.6)"; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = "rgba(160, 180, 220, 0.7)"; ctx.fillRect(x - r * 0.45, y + r * 0.95, r * 0.9, r * 0.45);
      ctx.strokeStyle = g > 0.3 ? "rgba(140, 90, 20, 0.8)" : "rgba(200, 215, 240, 0.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - r * 0.4, y + r * 0.2); ctx.lineTo(x - r * 0.15, y - r * 0.25); ctx.lineTo(x + r * 0.1, y + r * 0.2); ctx.lineTo(x + r * 0.4, y - r * 0.25); ctx.stroke();
      ctx.restore();
    });

    // Charges: bright and warm when high up (lots of energy), dim and cool once they've rolled down.
    const at = (b: Branch, d: number): Pt => {
      d = ((d % b.length) + b.length) % b.length;
      for (const sg of b.segs) {
        const L = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]);
        if (d <= L) { const t = d / L; return [lerp(sg.a[0], sg.b[0], t), lerp(sg.a[1], sg.b[1], t)]; }
        d -= L;
      }
      return b.segs[0].a;
    };
    const speed = perBranch * 0.55;
    const show = Math.min(1, Math.max(0, (time - 1.1) * 2)) * fresh;
    if (show > 0) {
      ctx.save();
      bs.forEach((b, k) => {
        S.pos[k] = S.pos[k].map(d => d + speed * dt);
        for (const d of S.pos[k]) {
          const [x, y] = at(b, d), e = Math.min(1, y / (3 * CELL)) ** 0.8;
          ctx.globalAlpha = show;
          ctx.fillStyle = `rgb(${Math.round(lerp(90, 255, e))}, ${Math.round(lerp(140, 214, e))}, ${Math.round(lerp(230, 120, e))})`;
          ctx.beginPath(); ctx.arc(X(x), Y(y), 3.2 + 1.6 * e, 0, Math.PI * 2); ctx.fill();
        }
      });
      ctx.restore();
    }

    // Quiet labels.
    if (drawn >= 1) {
      ctx.save(); ctx.font = font(500, 12); ctx.textAlign = "center"; ctx.fillStyle = "rgba(200, 212, 235, 0.6)";
      ctx.fillText("charges roll back to the battery", X(-0.6), Y(0) + 22);
      if (layout === "series") ctx.fillText("half-way down", X(2.1), Y(V * CELL / 2) - 16);
      ctx.restore();
    }
  });

  return (
    <SceneShell id="hill" caption={caption(layout, Number(cells))} hint="Put two bulbs in a row, then side by side"
      controls={<>
        <Segmented label="Battery" value={cells} onChange={setCells} options={[["1", "1 cell"], ["2", "2 cells"], ["3", "3 cells"]]} />
        <Segmented label="Bulbs" value={layout} onChange={setLayout} options={[["one", "One"], ["series", "Two in a row"], ["parallel", "Side by side"]]} />
      </>}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-label="A circuit pictured as a hill: the battery lifts charges up and they roll down through the bulbs" role="img" />
    </SceneShell>
  );
}
