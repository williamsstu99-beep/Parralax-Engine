"use client";

import { useRef, useState } from "react";
import SceneShell from "./SceneShell";
import { Button, Segmented, Slider, Toggle } from "./controls";
import { approach, font, useCanvas } from "./useCanvas";

type V = [number, number];
const AXIS = 0.75, R = 0.62, COIL_L = -2.5, COIL_R = 0.1;     // coil sits on a horizontal axis
const MAG_HALF = 0.85, MAG_T = 0.24;
const LOOPS = { few: 4, some: 8, lots: 14 } as const;
type Loops = keyof typeof LOOPS;

/** Magnetism passing through one loop at x from the magnet centred at m (poles at m ± 0.6, north to the right when dir = 1). */
function loopFlux(x: number, m: number, dir: number) {
  const through = (d: number) => 0.5 * Math.sign(d) * (1 - Math.abs(d) / Math.sqrt(d * d + R * R));
  return dir * (through(x - (m + 0.6)) - through(x - (m - 0.6)));
}
const coilFlux = (n: number, m: number, dir: number) => {
  let f = 0;
  for (let i = 0; i < n; i++) f += loopFlux(COIL_L + ((i + 0.5) / n) * (COIL_R - COIL_L), m, dir);
  return f;
};

/** The circuit the electrons travel: down from the coil's right end, through the bulb and meter, back to the left end, then through the coil. */
const WIRE: V[] = [[COIL_R, AXIS - R], [COIL_R, -1.25], [2.6, -1.25], [2.6, -2.45], [-2.5, -2.45], [COIL_L, AXIS - R]];
const BULB: V = [2.6, -1.85], METER: V = [-0.6, -2.45];

type Mood = "still" | "in" | "out" | "fast";
const CAPTIONS: Record<Mood, string> = {
  still: "The magnet isn't moving, so nothing happens. A magnet sitting inside a coil makes no electricity at all. Try moving it!",
  in: "Moving the magnet changes how much magnetism passes through the coil. That change pushes electrons round the wire, and the bulb lights up!",
  out: "Pulling it back out pushes the electrons the other way. Watch the needle swing to the other side.",
  fast: "Faster movement means a bigger change, so a bigger push: the bulb glows brighter. More loops of wire add up too.",
};

export default function InductionScene() {
  const [auto, setAuto] = useState(false);
  const [rate, setRate] = useState(0.5);
  const [loops, setLoops] = useState<Loops>("some");
  const [mood, setMood] = useState<Mood>("still");
  const S = useRef({ mx: 5.2, prevMx: NaN, vel: 0, current: 0, glow: 0, dir: 1, drag: null as null | { dx: number }, phase: 0, electrons: 0, lastMove: 0, entered: false, s: 80, cx: 0, cy: 0, k: 0 });

  const ref = useCanvas(({ ctx, w, h, dt, time }) => {
    const st = S.current, n = LOOPS[loops];
    const s = Math.min(w / 11.5, h / 6.6); st.s = s;
    const cx = w * 0.42, cy = h * 0.47; st.cx = cx; st.cy = cy;
    const X = (x: number) => cx + x * s, Y = (y: number) => cy - y * s;
    if (!st.k) { // calibrate so a brisk push gives a bright bulb with the middle number of loops
      let max = 0;
      for (let m = -4; m < 4; m += 0.05) max = Math.max(max, Math.abs(coilFlux(LOOPS.some, m + 0.05, 1) - coilFlux(LOOPS.some, m, 1)) / 0.05);
      st.k = 1 / (max * 1.5);
    }

    // Move the magnet: slide in at the start, then follow the pointer or wave on its own.
    const xmin = -4.6, xmax = 4.2;
    if (!st.entered) { st.mx = approach(st.mx, 2.6, 2.2, dt); if (time > 2.4) st.entered = true; }
    else if (auto && !st.drag) { st.phase += dt * (0.8 + rate * 4.2); st.mx = -0.9 + 2.6 * Math.sin(st.phase); }
    st.mx = Math.max(xmin, Math.min(xmax, st.mx));

    // Induction: current follows how fast the magnetism through the coil is changing:
    // (how much it changes per step of the magnet) × (how fast the magnet moves).
    // The magnet's speed is smoothed, because pointer events don't arrive every frame.
    const raw = Number.isNaN(st.prevMx) || dt === 0 ? 0 : (st.mx - st.prevMx) / dt;
    st.prevMx = st.mx;
    st.vel = approach(st.vel, raw, 14, dt);
    const slope = (coilFlux(n, st.mx + 0.02, st.dir) - coilFlux(n, st.mx - 0.02, st.dir)) / 0.04;
    const emf = -slope * st.vel;
    st.current = approach(st.current, Math.max(-1.8, Math.min(1.8, emf * st.k)), 18, dt);
    st.glow = approach(st.glow, Math.min(1, Math.sqrt(Math.abs(st.current))), Math.abs(st.current) > st.glow ? 20 : 4, dt);
    st.electrons += st.current * dt * 1.6;

    const I = st.current, mag = Math.abs(I);
    // "In" or "out" is about what the student does: moving towards the coil's middle, or away from it.
    const towards = st.vel * (st.mx - (COIL_L + COIL_R) / 2) < 0;
    const nextMood: Mood = mag < 0.06 ? "still" : mag > 0.9 ? "fast" : towards ? "in" : "out";
    if (time > 2.6 && nextMood !== mood) { if (nextMood !== "still" || time - st.lastMove > 1.2) setMood(nextMood); }
    if (nextMood !== "still") st.lastMove = time;

    ctx.clearRect(0, 0, w, h);
    const reveal = (t0: number, d = 0.6) => Math.min(1, Math.max(0, (time - t0) / d));

    // Wires (draw in), with electrons flowing when there's a current.
    const wireCol = `rgba(${Math.round(150 + 105 * st.glow)}, ${Math.round(170 + 70 * st.glow)}, ${Math.round(200 + 55 * st.glow)}, 0.9)`;
    const segLens = WIRE.slice(1).map((p, i) => Math.hypot(p[0] - WIRE[i][0], p[1] - WIRE[i][1]));
    const wireLen = segLens.reduce((a, b) => a + b, 0);
    const wr = reveal(0.6, 0.9);
    ctx.save(); ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = wireCol;
    if (st.glow > 0.05) { ctx.shadowColor = "rgba(110,231,255,0.8)"; ctx.shadowBlur = 14 * st.glow; }
    ctx.beginPath(); let drawn = 0;
    WIRE.forEach(([x, y], i) => {
      if (i === 0) { ctx.moveTo(X(x), Y(y)); return; }
      const [px, py] = WIRE[i - 1], L = segLens[i - 1], left = wr * wireLen - drawn;
      if (left <= 0) return;
      const f = Math.min(1, left / L);
      ctx.lineTo(X(px + (x - px) * f), Y(py + (y - py) * f)); drawn += L;
    });
    ctx.stroke(); ctx.restore();

    // The coil, back half first (behind the magnet).
    const pitch = (COIL_R - COIL_L) / n;
    const helix = (i: number, th: number): [number, number, number] => [COIL_L + pitch * (i + th / (Math.PI * 2)), AXIS - R * Math.cos(th), Math.sin(th)];
    const drawCoil = (front: boolean) => {
      for (let i = 0; i < n; i++) {
        const show = reveal(0.1 + i * (0.6 / n), 0.35);
        if (show <= 0) continue;
        ctx.beginPath();
        let started = false;
        for (let k = 0; k <= 40 * show; k++) {
          const th = (k / 40) * Math.PI * 2, [x, y, z] = helix(i, th);
          if ((z >= 0) !== front) { started = false; continue; }
          if (!started) { ctx.moveTo(X(x), Y(y)); started = true; } else ctx.lineTo(X(x), Y(y));
        }
        ctx.lineWidth = front ? 5 : 4;
        ctx.strokeStyle = front ? `rgb(${Math.round(214 + 41 * st.glow)}, ${Math.round(130 + 110 * st.glow)}, ${Math.round(70 + 170 * st.glow)})` : "rgba(120, 72, 40, 0.75)";
        ctx.shadowColor = "rgba(110, 231, 255, 0.9)"; ctx.shadowBlur = front ? 16 * st.glow : 0;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };
    ctx.lineCap = "round";
    drawCoil(false);

    // The magnet and its field, gliding along the axis (inside the coil when it passes through).
    if (time > 1.1) {
      const mx = st.mx, ma = Math.min(1, (time - 1.1) * 2);
      ctx.save(); ctx.globalAlpha = ma;
      for (let k = 1; k <= 4; k++) { // field loops from N round to S, with flowing dashes
        const rx = MAG_HALF + 0.35 * k, ry = 0.3 + 0.32 * k;
        ctx.beginPath(); ctx.ellipse(X(mx), Y(AXIS), rx * s, ry * s, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(167, 139, 250, ${0.38 - k * 0.06})`; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.setLineDash([2, 18]); ctx.lineDashOffset = st.dir * time * 30 * (k % 2 ? 1 : -1);
        ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      }
      const L = MAG_HALF * s, T = MAG_T * s, x0 = X(mx), y0 = Y(AXIS);
      const nRight = st.dir > 0;
      ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 16;
      const gN = ctx.createLinearGradient(0, y0 - T, 0, y0 + T); gN.addColorStop(0, "#ff8f99"); gN.addColorStop(1, "#d4485a");
      const gS = ctx.createLinearGradient(0, y0 - T, 0, y0 + T); gS.addColorStop(0, "#8fb4ff"); gS.addColorStop(1, "#4a6fd4");
      ctx.beginPath(); ctx.roundRect(nRight ? x0 : x0 - L, y0 - T, L, T * 2, nRight ? [0, 9, 9, 0] : [9, 0, 0, 9]); ctx.fillStyle = gN; ctx.fill();
      ctx.beginPath(); ctx.roundRect(nRight ? x0 - L : x0, y0 - T, L, T * 2, nRight ? [9, 0, 0, 9] : [0, 9, 9, 0]); ctx.fillStyle = gS; ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.font = font(700, Math.round(T * 0.95)); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("N", x0 + (nRight ? 1 : -1) * L * 0.5, y0 + 1); ctx.fillText("S", x0 - (nRight ? 1 : -1) * L * 0.5, y0 + 1);
      if (!st.drag && !auto && time > 2.4 && time < 9) { // a gentle nudge to grab it
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 4); ctx.font = font(500, 14); ctx.fillStyle = "#cfe9ff";
        ctx.fillText("← drag me through the coil →", x0, y0 - T - 26);
      }
      ctx.restore();
    }

    drawCoil(true);

    // Electrons: little glowing dots carried round the circuit by the current.
    if (time > 1.5) {
      const coilLen = n * 2.2, total = wireLen + coilLen, count = 46;
      ctx.fillStyle = "#fde68a"; ctx.shadowColor = "#fde68a"; ctx.shadowBlur = 8;
      for (let j = 0; j < count; j++) {
        let u = (((j / count) * total + st.electrons * 2.2) % total + total) % total;
        let p: V;
        if (u < wireLen) {
          let seg = 0; while (seg < segLens.length - 1 && u > segLens[seg]) { u -= segLens[seg]; seg++; }
          const a = WIRE[seg], b = WIRE[seg + 1], f = Math.min(1, u / segLens[seg]);
          p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        } else {
          const f = (u - wireLen) / coilLen, th = f * n * Math.PI * 2, [x, y, z] = helix(Math.floor(f * n), th % (Math.PI * 2));
          if (z < 0) continue; p = [x, y];
        }
        ctx.globalAlpha = 0.25 + 0.75 * st.glow;
        ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // The bulb.
    const bl = reveal(1.2);
    if (bl > 0) {
      const bx = X(BULB[0]), by = Y(BULB[1]), r = 0.36 * s;
      ctx.save(); ctx.globalAlpha = bl;
      if (st.glow > 0.02) {
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, r * (2 + 5 * st.glow));
        g.addColorStop(0, `rgba(255, 220, 140, ${0.9 * st.glow})`); g.addColorStop(1, "rgba(255, 180, 70, 0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r * (2 + 5 * st.glow), 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.round(30 + 225 * st.glow)}, ${Math.round(38 + 200 * st.glow)}, ${Math.round(58 + 110 * st.glow)}, 0.95)`; ctx.fill();
      ctx.strokeStyle = "#9aa8c7"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - r * 0.5, by - r * 0.5); ctx.lineTo(bx + r * 0.5, by + r * 0.5); ctx.moveTo(bx + r * 0.5, by - r * 0.5); ctx.lineTo(bx - r * 0.5, by + r * 0.5);
      ctx.strokeStyle = st.glow > 0.2 ? "#fff6dc" : "#9aa8c7"; ctx.stroke();
      ctx.restore();
    }

    // The meter: a needle that swings one way pushing in, the other pulling out.
    const ml = reveal(1.3);
    if (ml > 0) {
      const mx0 = X(METER[0]), my0 = Y(METER[1]), r = 0.62 * s;
      ctx.save(); ctx.globalAlpha = ml;
      ctx.beginPath(); ctx.arc(mx0, my0, r, Math.PI, 0); ctx.closePath();
      ctx.fillStyle = "#0e1526"; ctx.fill(); ctx.strokeStyle = "rgba(150,175,230,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
      for (let k = -4; k <= 4; k++) { const a = -Math.PI / 2 + (k / 4) * 1.05; ctx.beginPath(); ctx.moveTo(mx0 + Math.cos(a) * r * 0.82, my0 + Math.sin(a) * r * 0.82); ctx.lineTo(mx0 + Math.cos(a) * r * 0.92, my0 + Math.sin(a) * r * 0.92); ctx.strokeStyle = k === 0 ? "#cfe9ff" : "rgba(150,175,230,0.5)"; ctx.stroke(); }
      const a = -Math.PI / 2 + Math.max(-1, Math.min(1, I)) * 1.05;
      ctx.beginPath(); ctx.moveTo(mx0, my0); ctx.lineTo(mx0 + Math.cos(a) * r * 0.85, my0 + Math.sin(a) * r * 0.85);
      ctx.strokeStyle = "#ff8a94"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx0, my0, 4, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
      ctx.shadowBlur = 0; ctx.font = font(600, 12); ctx.fillStyle = "rgba(200,212,235,0.75)"; ctx.textAlign = "center";
      ctx.fillText("−", mx0 - r * 0.72, my0 - 6); ctx.fillText("+", mx0 + r * 0.72, my0 - 6);
      ctx.restore();
    }
  });

  // Drag the magnet along the axis.
  const worldX = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), st = S.current; return (e.clientX - r.left - st.cx) / st.s; };
  const worldY = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), st = S.current; return -(e.clientY - r.top - st.cy) / st.s; };
  const onDown = (e: React.PointerEvent) => {
    const st = S.current, x = worldX(e), y = worldY(e);
    if (Math.abs(x - st.mx) < MAG_HALF + 0.4 && Math.abs(y - AXIS) < 0.8) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      st.drag = { dx: x - st.mx }; st.entered = true; setAuto(false);
    }
  };
  const onMove = (e: React.PointerEvent) => { const st = S.current; if (st.drag) st.mx = worldX(e) - st.drag.dx; };
  const onUp = () => { S.current.drag = null; };

  return (
    <SceneShell id="induction" caption={CAPTIONS[mood]} hint="Drag the magnet through the coil, fast and slow"
      controls={<>
        <Toggle label="Wave it for me" on={auto} onChange={v => { S.current.entered = true; setAuto(v); }} />
        <Slider label="How fast" value={rate} onChange={setRate} left="Slow" right="Fast" width={160} />
        <Segmented label="Loops of wire" value={loops} onChange={setLoops} options={[["few", "Few"], ["some", "Some"], ["lots", "Lots"]]} />
        <Button onClick={() => { S.current.dir *= -1; }}>Flip the magnet</Button>
      </>}>
      <canvas ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className="absolute inset-0 h-full w-full touch-none" role="img" aria-label="A magnet moving through a coil of wire connected to a bulb and a meter" />
    </SceneShell>
  );
}
