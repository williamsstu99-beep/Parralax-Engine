"use client";

import { useRef, useState } from "react";
import SceneShell from "./SceneShell";
import { Button, Segmented } from "./controls";
import { font, useCanvas } from "./useCanvas";

type V = [number, number];
interface Magnet { x: number; y: number; a: number; vx: number; vy: number; va: number; born: number }
type View = "lines" | "filings" | "compass";

const HALF = 0.9, THICK = 0.26, POLE = 0.62; // magnet half-length, half-thickness, pole offset from centre

const poles = (m: Magnet): { p: V; q: number }[] => {
  const c = Math.cos(m.a), s = Math.sin(m.a);
  return [{ p: [m.x + c * POLE, m.y + s * POLE], q: 1 }, { p: [m.x - c * POLE, m.y - s * POLE], q: -1 }];
};

/** Field at p from every magnet (each pole acts like a point source or sink), optionally skipping one magnet. */
function field(ms: Magnet[], p: V, skip?: Magnet): V {
  let bx = 0, by = 0;
  for (const m of ms) {
    if (m === skip) continue;
    for (const { p: q, q: sgn } of poles(m)) {
      const dx = p[0] - q[0], dy = p[1] - q[1], r2 = dx * dx + dy * dy + 0.004, r3 = r2 * Math.sqrt(r2);
      bx += (sgn * dx) / r3; by += (sgn * dy) / r3;
    }
  }
  return [bx, by];
}

function caption(ms: Magnet[], view: View) {
  if (view === "filings") return "Iron filings line up along the magnetic field, just like sprinkling them on paper over a real magnet. They crowd together at the poles, where the field is strongest.";
  if (view === "compass") return "Each compass needle turns to point along the field: its red end points away from north poles and towards south poles.";
  if (ms.length < 2) return "Field lines leave the north pole and curve round into the south pole. They're packed closest together where the pull is strongest: at the poles.";
  const [A, B] = ms;
  const near = (m: Magnet, o: Magnet) => poles(m).reduce((best, pl) => (Math.hypot(pl.p[0] - o.x, pl.p[1] - o.y) < Math.hypot(best.p[0] - o.x, best.p[1] - o.y) ? pl : best));
  const attract = near(A, B).q !== near(B, A).q;
  return attract
    ? "Opposite poles attract! Field lines run straight from one magnet's north into the other's south, and pull the magnets together."
    : "Like poles repel! The field lines can't join up, so they bend away from each other and push the magnets apart.";
}

export default function MagnetScene() {
  const [view, setView] = useState<View>("lines");
  const [text, setText] = useState(""); // the live caption, updated as magnets move and settle
  const [count, setCount] = useState(2);
  const S = useRef<{ ms: Magnet[]; drag: { m: Magnet; dx: number; dy: number } | null; sel: Magnet | null; s: number; cx: number; cy: number; lastCaption: string }>({
    ms: [
      { x: -2.3, y: 0, a: 0, vx: 0, vy: 0, va: 0, born: 0 },
      { x: 2.3, y: 0.15, a: 0, vx: 0, vy: 0, va: 0, born: 0.25 },
    ],
    drag: null, sel: null, s: 80, cx: 0, cy: 0, lastCaption: "",
  });

  const ref = useCanvas(({ ctx, w, h, dt, time }) => {
    const st = S.current, ms = st.ms;
    const s = Math.min(w / 10, h / 6.2); st.s = s; st.cx = w / 2; st.cy = h / 2;
    const X = (x: number) => w / 2 + x * s, Y = (y: number) => h / 2 - y * s;
    const bx = w / 2 / s - HALF, by = h / 2 / s - THICK;

    // Physics: each magnet feels the others' fields on its poles; it slides, turns, and sticks on contact.
    for (const m of ms) {
      if (st.drag?.m === m || time < 1.2) continue;
      let fx = 0, fy = 0, tq = 0;
      for (const { p, q } of poles(m)) {
        const b = field(ms, p, m);
        fx += q * b[0]; fy += q * b[1];
        tq += (p[0] - m.x) * q * b[1] - (p[1] - m.y) * q * b[0];
      }
      const cap = (v: number, c: number) => Math.max(-c, Math.min(c, v));
      // Strong enough to watch them glide together (faster as they close in), with friction so they settle.
      m.vx = (m.vx + cap(fx * 14, 60) * dt) * Math.exp(-2.2 * dt);
      m.vy = (m.vy + cap(fy * 14, 60) * dt) * Math.exp(-2.2 * dt);
      m.va = (m.va + cap(tq * 6, 40) * dt) * Math.exp(-3.5 * dt);
      const sp = Math.hypot(m.vx, m.vy); if (sp > 6) { m.vx *= 6 / sp; m.vy *= 6 / sp; }
      m.x += m.vx * dt; m.y += m.vy * dt; m.a += m.va * dt;
      m.x = Math.max(-bx, Math.min(bx, m.x)); m.y = Math.max(-by, Math.min(by, m.y));
    }
    // Keep magnets from passing through each other: push overlapping pairs apart and stop them.
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
      const min = HALF * 2 * 0.98 * (0.55 + 0.45 * Math.abs(Math.cos(Math.atan2(dy, dx) - a.a)));
      if (d < min) {
        const push = (min - d) / 2, ux = dx / d, uy = dy / d;
        if (st.drag?.m !== a) { a.x -= ux * push; a.y -= uy * push; a.vx = a.vy = 0; }
        if (st.drag?.m !== b) { b.x += ux * push; b.y += uy * push; b.vx = b.vy = 0; }
      }
    }

    ctx.clearRect(0, 0, w, h);
    const grow = (m: Magnet) => Math.min(1, Math.max(0, (time - m.born) / 0.5));

    if (view === "lines") {
      // Trace field lines out of every north pole until they reach a south pole or leave the stage.
      const reveal = Math.min(1, Math.max(0, (time - 0.5) / 1.2));
      ctx.lineWidth = 1.6; ctx.lineCap = "round";
      for (const m of ms) {
        const [north] = poles(m);
        const LINES = 18;
        for (let k = 0; k < LINES; k++) {
          const th = m.a + ((k + 0.5) / LINES) * Math.PI * 2;
          let p: V = [north.p[0] + Math.cos(th) * 0.14, north.p[1] + Math.sin(th) * 0.14];
          const pts: V[] = [p];
          for (let i = 0; i < 700 * reveal; i++) {
            const b = field(ms, p), mag = Math.hypot(b[0], b[1]);
            if (mag < 1e-6) break;
            p = [p[0] + (b[0] / mag) * 0.035, p[1] + (b[1] / mag) * 0.035];
            pts.push(p);
            if (Math.abs(p[0]) > bx + 2 || Math.abs(p[1]) > by + 2) break;
            if (ms.some(o => poles(o)[1] && Math.hypot(p[0] - poles(o)[1].p[0], p[1] - poles(o)[1].p[1]) < 0.1)) break;
          }
          const g = ctx.createLinearGradient(X(pts[0][0]), Y(pts[0][1]), X(pts[pts.length - 1][0]), Y(pts[pts.length - 1][1]));
          g.addColorStop(0, "rgba(255, 122, 133, 0.75)"); g.addColorStop(0.5, "rgba(167, 139, 250, 0.6)"); g.addColorStop(1, "rgba(110, 231, 255, 0.75)");
          ctx.strokeStyle = g;
          ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
          // Energy flowing along the line, north to south.
          ctx.save(); ctx.setLineDash([2, 22]); ctx.lineDashOffset = -time * 40; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2.4;
          ctx.stroke(); ctx.restore();
        }
      }
    } else {
      // A grid of iron filings or compass needles, each lined up with the field where it sits.
      const gap = view === "filings" ? 0.24 : 0.78;
      for (let gx = -bx - HALF; gx <= bx + HALF; gx += gap) for (let gy = -by - THICK; gy <= by + THICK; gy += gap) {
        const jx = view === "filings" ? Math.sin(gx * 91.7 + gy * 13.1) * 0.07 : 0, jy = view === "filings" ? Math.cos(gx * 17.3 - gy * 71.9) * 0.07 : 0;
        const p: V = [gx + jx, gy + jy];
        if (ms.some(m => Math.abs((p[0] - m.x) * Math.cos(m.a) + (p[1] - m.y) * Math.sin(m.a)) < HALF + 0.05 && Math.abs(-(p[0] - m.x) * Math.sin(m.a) + (p[1] - m.y) * Math.cos(m.a)) < THICK + 0.05)) continue;
        const b = field(ms, p), mag = Math.hypot(b[0], b[1]);
        if (mag < 1e-4) continue;
        const ux = b[0] / mag, uy = b[1] / mag, strength = Math.min(1, mag / 1.2);
        const reveal = Math.min(1, Math.max(0, (time - 0.4 - Math.hypot(gx, gy) * 0.08) * 2));
        if (view === "filings") {
          const L = 0.07 + 0.06 * strength;
          ctx.strokeStyle = `rgba(200, 215, 240, ${(0.15 + 0.75 * strength) * reveal})`; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(X(p[0] - ux * L), Y(p[1] - uy * L)); ctx.lineTo(X(p[0] + ux * L), Y(p[1] + uy * L)); ctx.stroke();
        } else {
          const L = 0.17, x0 = X(p[0]), y0 = Y(p[1]), nx = ux * L * s, ny = -uy * L * s, px = -ny * 0.28, py = nx * 0.28;
          ctx.globalAlpha = reveal * (0.25 + 0.75 * Math.min(1, mag / 0.25)); // needles far from the magnets fade back
          ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.beginPath(); ctx.arc(x0, y0, L * s * 1.15, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ff7a85"; ctx.beginPath(); ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x0 + px, y0 + py); ctx.lineTo(x0 - px, y0 - py); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#cdd6ea"; ctx.beginPath(); ctx.moveTo(x0 - nx, y0 - ny); ctx.lineTo(x0 + px, y0 + py); ctx.lineTo(x0 - px, y0 - py); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // The magnets themselves.
    for (const m of ms) {
      const k = grow(m);
      if (k <= 0) continue;
      ctx.save();
      ctx.translate(X(m.x), Y(m.y)); ctx.rotate(-m.a); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); ctx.globalAlpha = k;
      const L = HALF * s, T = THICK * s;
      ctx.shadowColor = st.sel === m ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)"; ctx.shadowBlur = st.sel === m ? 24 : 18;
      const r = 10;
      ctx.beginPath(); ctx.roundRect(-L, -T, L * 2, T * 2, r); ctx.fillStyle = "#1a2236"; ctx.fill();
      ctx.shadowBlur = 0;
      const gN = ctx.createLinearGradient(0, -T, 0, T); gN.addColorStop(0, "#ff8f99"); gN.addColorStop(1, "#d4485a");
      const gS = ctx.createLinearGradient(0, -T, 0, T); gS.addColorStop(0, "#8fb4ff"); gS.addColorStop(1, "#4a6fd4");
      ctx.beginPath(); ctx.roundRect(0, -T, L, T * 2, [0, r, r, 0]); ctx.fillStyle = gN; ctx.fill();
      ctx.beginPath(); ctx.roundRect(-L, -T, L, T * 2, [r, 0, 0, r]); ctx.fillStyle = gS; ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.font = font(700, Math.round(T * 0.95)); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("N", L * 0.55, 1); ctx.fillText("S", -L * 0.55, 1);
      if (st.sel === m) { ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-L - 4, -T - 4, L * 2 + 8, T * 2 + 8, r + 4); ctx.stroke(); }
      ctx.restore();
    }

    const c = caption(ms, view);
    if (c !== st.lastCaption) { st.lastCaption = c; setText(c); }
  });

  // Dragging: grab a magnet anywhere on its body.
  const toWorld = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), st = S.current;
    return [(e.clientX - r.left - st.cx) / st.s, -(e.clientY - r.top - st.cy) / st.s] as V;
  };
  const hit = (p: V) => S.current.ms.slice().reverse().find(m => {
    const dx = p[0] - m.x, dy = p[1] - m.y, c = Math.cos(m.a), s = Math.sin(m.a);
    return Math.abs(dx * c + dy * s) < HALF + 0.1 && Math.abs(-dx * s + dy * c) < THICK + 0.15;
  });
  const onDown = (e: React.PointerEvent) => {
    const p = toWorld(e), m = hit(p);
    if (!m) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    S.current.drag = { m, dx: p[0] - m.x, dy: p[1] - m.y }; S.current.sel = m; m.vx = m.vy = m.va = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = S.current.drag; if (!d) return;
    const p = toWorld(e); d.m.x = p[0] - d.dx; d.m.y = p[1] - d.dy;
  };
  const onUp = () => { S.current.drag = null; };
  const flip = () => { const st = S.current, m = st.sel ?? st.ms[st.ms.length - 1]; m.a += Math.PI; st.sel = m; };
  const turn = () => { const st = S.current, m = st.sel ?? st.ms[st.ms.length - 1]; m.a += Math.PI / 2; st.sel = m; };
  const addOrRemove = () => {
    const st = S.current;
    if (st.ms.length < 3) st.ms.push({ x: 0, y: 1.6, a: Math.PI / 2, vx: 0, vy: 0, va: 0, born: 0 });
    else { st.ms = st.ms.slice(0, 1); st.sel = null; }
    setCount(st.ms.length);
  };

  return (
    <SceneShell id="magnets" caption={text || "Two bar magnets, with their north poles facing the same way. Watch what the field does."} hint="Drag a magnet. Tap one, then flip it."
      controls={<>
        <Segmented value={view} onChange={setView} options={[["lines", "Field lines"], ["filings", "Iron filings"], ["compass", "Compasses"]]} />
        <Button onClick={flip} primary>Flip a magnet</Button>
        <Button onClick={turn}>Turn it</Button>
        <Button onClick={addOrRemove}>{count < 3 ? "Add a magnet" : "Just one"}</Button>
      </>}>
      <canvas ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className="absolute inset-0 h-full w-full touch-none" role="img" aria-label="Bar magnets and their magnetic field" />
    </SceneShell>
  );
}
