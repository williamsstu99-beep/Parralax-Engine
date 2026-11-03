"use client";

import { useRef, useState } from "react";
import SceneShell from "./SceneShell";
import { Slider, Toggle } from "./controls";
import { approach, font, rng, useCanvas } from "./useCanvas";

/**
 * Flow in a pipe. The same water has to get through every slice of the pipe,
 * so where it narrows the flow speeds up and its pressure drops (Bernoulli).
 * Push it fast enough and the smooth layers (laminar) break into eddies
 * (turbulent): a thin thread of dye shows the difference at a glance.
 */

const H0 = 1.05;            // half-width of the pipe away from the squeeze
const XL = -5.4, XR = 5.4;  // pipe ends, in pipe units
const N = 1300;
const GAUGES = [-3.3, 0, 3.3];

interface Drop { x: number; e: number; px: number; py: number; dye: boolean; age: number }

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const halfWidth = (x: number, squeeze: number) => H0 * (1 - squeeze * Math.exp(-((x / 1.25) ** 2)));
/** How turbulent the flow is: Reynolds number grows with speed. */
const turbulence = (speed: number) => smooth(0.55, 0.85, speed);

function caption(speed: number, squeeze: number, turb: number) {
  if (speed < 0.04) return "The water is still. Slide the flow speed up to push it through the pipe.";
  if (turb > 0.5) return "Too fast! The smooth layers break up into swirling eddies. This is turbulent flow. See how the dye gets smeared right across the pipe.";
  if (squeeze > 0.2) return "The same water has to squeeze through the narrow part, so it speeds up there. Faster water has lower pressure (see the middle gauge drop). That's Bernoulli's principle.";
  return "Smooth, layered flow (laminar). The water slides along in layers: fastest in the middle, slowest at the walls. The dye stays a neat, straight thread.";
}

export default function PipeScene() {
  const [speed, setSpeed] = useState(0.32);
  const [squeeze, setSqueeze] = useState(0.45);
  const [dye, setDye] = useState(true);

  const sim = useRef({ drops: [] as Drop[], started: false, rand: rng(11), gauge: GAUGES.map(() => 1), sq: 0.45, trail: null as HTMLCanvasElement | null });

  const ref = useCanvas(({ ctx, w, h, dt, time }) => {
    const S = sim.current, U = speed;
    S.sq = approach(S.sq, squeeze, 5, dt);
    const sq = S.sq, turb = turbulence(U);
    const s = Math.min(w / (XR - XL + 0.4), h / 5.4);
    const cx = w / 2, cy = h * 0.64;
    const X = (x: number) => cx + x * s, Y = (y: number) => cy - y * s;

    // Trails live on their own canvas so the pipe, gauges and labels stay crisp.
    const dpr = ctx.getTransform().a || 1;
    if (!S.trail || S.trail.width !== Math.round(w * dpr) || S.trail.height !== Math.round(h * dpr)) {
      S.trail = document.createElement("canvas"); S.trail.width = Math.round(w * dpr); S.trail.height = Math.round(h * dpr);
    }
    const tc = S.trail.getContext("2d")!;
    tc.setTransform(dpr, 0, 0, dpr, 0, 0);
    tc.globalCompositeOperation = "destination-out";
    tc.fillStyle = `rgba(0,0,0,${0.16 + 0.1 * turb})`; tc.fillRect(0, 0, w, h);
    tc.globalCompositeOperation = "source-over";

    const seed = (d: Drop, anywhere: boolean) => {
      d.dye = S.rand() < 0.14;
      d.x = anywhere ? XL + S.rand() * (XR - XL) : XL - S.rand() * 0.3;
      d.e = d.dye ? (S.rand() - 0.5) * 0.06 : (S.rand() * 2 - 1) * 0.97;
      d.px = NaN; d.py = NaN; d.age = 0;
    };
    if (!S.started) { S.drops = Array.from({ length: N }, () => { const d = { x: 0, e: 0, px: 0, py: 0, dye: false, age: 0 }; seed(d, true); if (d.dye && d.x > XL + 0.5) d.dye = false; return d; }); S.started = true; }

    // Swirling eddies, carried downstream with the flow. ψ = 0 on both walls, so nothing leaks out.
    const eddy = (x: number, e: number, um: number): [number, number] => {
      if (turb <= 0) return [0, 0];
      let u = 0, v = 0;
      const modes = [[1.7, 1, 0.0, 1.0], [2.9, 2, 1.7, 0.7], [4.3, 3, 3.1, 0.5]];
      for (const [k, m, ph, A] of modes) {
        const a = k * x - time * k * 0.9 * um * 2.2 + ph, b = (m * Math.PI * (e + 1)) / 2;
        u += A * Math.sin(a) * Math.cos(b) * (m * Math.PI) / 2;   // ∂ψ/∂e
        v += -A * k * Math.cos(a) * Math.sin(b);                   // −∂ψ/∂x
      }
      return [u * 0.22 * turb, v * 0.22 * turb];
    };

    const drawn = Math.min(1, time / 0.9);
    const build = smooth(0.8, 2, time);
    const active = Math.floor(N * build);
    tc.lineCap = "round";
    for (let i = 0; i < active; i++) {
      const d = S.drops[i];
      const hw = halfWidth(d.x, sq), um = U * H0 / hw;
      if (dye || !d.dye) d.age += dt;
      // Laminar: a smooth curved profile. Turbulent: flatter, with eddies on top.
      const profile = (1 - turb) * 1.5 * (1 - d.e * d.e) + turb * 1.12 * (1 - Math.abs(d.e) ** 7);
      const [eu, ev] = eddy(d.x, d.e, Math.max(0.15, um));
      const u = um * (profile + eu), ve = (ev * um) / hw + turb * (S.rand() - 0.5) * 1.2 * um * dt * 8;
      const step = dt * 2.4;
      d.x += Math.max(0.02 * U, u) * step;
      d.e = Math.max(-0.985, Math.min(0.985, d.e + ve * step));
      if (U < 0.01) d.e += (S.rand() - 0.5) * 0.002;
      if (d.x > XR + 0.2) { seed(d, false); continue; }
      const x = X(d.x), y = Y(d.e * halfWidth(d.x, sq));
      if (!Number.isNaN(d.px) && (dye || !d.dye) && d.x > XL && d.x < XR) {
        const r = u / Math.max(1e-3, U);
        const fade = Math.min(1, d.age * 3);
        tc.strokeStyle = d.dye ? `rgba(255, 120, 214, ${0.95 * fade})` : r < 0.75 ? `rgba(255, 186, 90, ${0.7 * fade})` : r > 1.9 ? `rgba(230, 250, 255, ${0.95 * fade})` : `rgba(110, 231, 255, ${0.7 * fade})`;
        tc.lineWidth = d.dye ? 2 : 1.3;
        tc.beginPath(); tc.moveTo(d.px, d.py); tc.lineTo(x + 0.01, y); tc.stroke();
      }
      d.px = x; d.py = y;
    }

    // Frame: clear, glass interior, the trails, then the walls on top.
    ctx.clearRect(0, 0, w, h);
    const top: [number, number][] = [], bot: [number, number][] = [];
    const upto = XL + (XR - XL) * drawn;
    for (let x = XL; x <= upto + 1e-6; x += 0.05) { const hw = halfWidth(x, sq); top.push([X(x), Y(hw)]); bot.push([X(x), Y(-hw)]); }
    if (drawn >= 1) {
      ctx.save(); ctx.beginPath();
      top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, Y(H0), 0, Y(-H0));
      g.addColorStop(0, "rgba(110, 231, 255, 0.07)"); g.addColorStop(0.5, "rgba(110, 231, 255, 0.02)"); g.addColorStop(1, "rgba(110, 231, 255, 0.07)");
      ctx.globalAlpha = Math.min(1, (time - 0.9) * 2); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    }
    ctx.drawImage(S.trail, 0, 0, w, h);

    // Gauges: little open tubes standing on the pipe. Higher water = higher pressure.
    const gl = smooth(1.2, 1.8, time);
    GAUGES.forEach((gx, k) => {
      const hw = halfWidth(gx, sq), um = U * H0 / hw;
      const p = 1.15 - 0.62 * um * um - 0.06 * (gx - XL) * U * (0.3 + turb);
      S.gauge[k] = approach(S.gauge[k], Math.max(0.08, p), 3, dt);
      if (gl <= 0) return;
      const x = X(gx), y0 = Y(hw), tubeH = 1.35 * s, wT = 0.26 * s;
      ctx.save(); ctx.globalAlpha = gl;
      ctx.fillStyle = "rgba(110, 231, 255, 0.04)"; ctx.fillRect(x - wT / 2, y0 - tubeH, wT, tubeH);
      const lh = Math.min(tubeH, S.gauge[k] * s);
      const lg = ctx.createLinearGradient(0, y0 - lh, 0, y0);
      lg.addColorStop(0, "rgba(140, 236, 255, 0.85)"); lg.addColorStop(1, "rgba(60, 150, 220, 0.5)");
      ctx.fillStyle = lg; ctx.fillRect(x - wT / 2 + 2, y0 - lh, wT - 4, lh);
      ctx.fillStyle = "rgba(230, 250, 255, 0.95)"; ctx.fillRect(x - wT / 2 + 2, y0 - lh, wT - 4, 1.5);
      ctx.strokeStyle = "rgba(190, 225, 255, 0.55)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - wT / 2, y0 + 1); ctx.lineTo(x - wT / 2, y0 - tubeH); ctx.moveTo(x + wT / 2, y0 + 1); ctx.lineTo(x + wT / 2, y0 - tubeH); ctx.stroke();
      ctx.restore();
    });

    // Walls.
    ctx.save();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(190, 230, 255, 0.85)"; ctx.lineCap = "round";
    for (const line of [top, bot]) { ctx.beginPath(); line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(110, 231, 255, 0.06)";
    for (const line of [top, bot]) { ctx.beginPath(); line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.restore();

    // A few quiet labels.
    if (gl > 0) {
      ctx.save(); ctx.globalAlpha = gl * 0.85; ctx.font = font(500, 13); ctx.textAlign = "center"; ctx.fillStyle = "rgba(200, 215, 240, 0.75)";
      ctx.fillText("pressure", X(GAUGES[0]), Y(halfWidth(GAUGES[0], sq)) - 1.35 * s - 10);
      if (sq > 0.2 && U > 0.08) {
        ctx.fillStyle = "rgba(230, 250, 255, 0.9)"; ctx.fillText("faster, lower pressure", X(0), Y(-halfWidth(0, sq)) + 26);
        ctx.fillStyle = "rgba(255, 195, 120, 0.85)"; ctx.fillText("slower, higher pressure", X(GAUGES[0]), Y(-H0) + 26);
      }
      ctx.restore();
    }
  });

  const turb = turbulence(speed);
  return (
    <SceneShell id="pipe" caption={caption(speed, squeeze, turb)} hint="Squeeze the pipe, then push the speed right up"
      controls={<>
        <Slider label="Flow speed" value={speed} onChange={setSpeed} left="Still" right="Fast" />
        <Slider label="Squeeze the pipe" value={squeeze} onChange={setSqueeze} min={0} max={0.62} left="Wide" right="Narrow" />
        <Toggle label="Dye" on={dye} onChange={setDye} />
      </>}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-label="Water flowing through a pipe that narrows in the middle" role="img" />
    </SceneShell>
  );
}
