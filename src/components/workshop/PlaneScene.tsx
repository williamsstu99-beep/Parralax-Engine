"use client";

import { useRef, useState } from "react";
import SceneShell from "./SceneShell";
import { Slider } from "./controls";
import { approach, arrow, rng, useCanvas } from "./useCanvas";

/**
 * A whole aeroplane in flight with the four forces on it. Thrust against
 * drag sets the speed; lift against weight sets whether it climbs or sinks.
 * Lift grows with speed and nose angle, until the wing stalls.
 */

const W = 1;                         // weight
const LK = 1.35;                     // lift: balances weight at cruise (about half throttle, nose up a little)
const STALL = 15;                    // degrees
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const liftCoef = (a: number) => (0.3 + 0.09 * Math.min(a, 14)) * (1 - 0.72 * smooth(STALL - 1, STALL + 3, a));
const dragOf = (v: number, a: number) => v * v * (0.45 + 0.0025 * a * a + 0.25 * smooth(STALL - 1, STALL + 3, a));

type Mood = "ground" | "stall" | "climb" | "sink" | "faster" | "slower" | "cruise";

function caption(m: Mood) {
  switch (m) {
    case "ground": return "Sitting on the runway. Push the throttle up: thrust shoves the plane forward, and once it's fast enough the wings make enough lift to take off.";
    case "stall": return "Nose too high! The wings stall, lift collapses, and weight wins, so the plane drops. Lower the nose to get the air flowing smoothly again.";
    case "climb": return "Lift is bigger than weight, so the plane climbs. More speed or more nose-up means more lift.";
    case "sink": return "Weight is bigger than lift, so the plane sinks. Add throttle for more speed, or raise the nose a little.";
    case "faster": return "Thrust is bigger than drag, so the plane speeds up. And as it goes faster, the air pushes back harder: drag grows until it matches thrust.";
    case "slower": return "Drag is bigger than thrust, so the plane slows down. Slower air over the wings means less lift too.";
    case "cruise": return "All four forces balance: lift equals weight and thrust equals drag. So the plane cruises along at a steady height and speed.";
  }
}

// The plane, side-on, in plane units: x forward, y up, about 4.2 units nose to tail.
const BODY: [number, number][] = [
  [2.1, -0.02], [2.0, 0.1], [1.75, 0.22], [1.35, 0.3], [0.4, 0.32], [-1.2, 0.32], [-1.55, 0.36],
  [-1.92, 1.08], [-2.18, 1.08], [-2.12, 0.34], [-2.16, 0.16], [-1.7, 0.0], [-1.1, -0.2], [0.2, -0.26], [1.4, -0.24], [1.85, -0.16],
];
const WING: [number, number][] = [[0.95, -0.1], [0.6, -0.02], [-0.1, -0.03], [-0.6, -0.1], [-0.1, -0.15], [0.6, -0.15]];
const TAILPLANE: [number, number][] = [[-1.5, 0.36], [-1.75, 0.41], [-2.25, 0.4], [-1.75, 0.33]];

interface Streak { x: number; y: number; l: number; a: number }

export default function PlaneScene() {
  const [throttle, setThrottle] = useState(0.55);
  const [nose, setNose] = useState(4);
  const [mood, setMood] = useState<Mood>("cruise");

  const sim = useRef({ v: 1.06, alt: 2.2, vy: 0, a: 4, lift: 1, drag: 0.55, thrust: 0.55, scroll: 0, streaks: [] as Streak[], clouds: [] as { x: number; y: number; r: number; d: number }[], started: false, rand: rng(5), shake: 0 });

  const ref = useCanvas(({ ctx, w, h, dt, time }) => {
    const S = sim.current;
    if (!S.started) {
      for (let i = 0; i < 220; i++) S.streaks.push({ x: S.rand(), y: S.rand(), l: 0.4 + S.rand() * 0.6, a: 0.25 + S.rand() * 0.5 });
      for (let i = 0; i < 9; i++) S.clouds.push({ x: S.rand(), y: S.rand() * 0.8, r: 0.06 + S.rand() * 0.1, d: 0.15 + S.rand() * 0.35 });
      S.started = true;
    }
    S.a = approach(S.a, nose, 2.5, dt);
    const T = throttle, onGround = S.alt <= 0.0001;
    const L = LK * S.v * S.v * liftCoef(S.a), D = dragOf(S.v, S.a) + (onGround ? 0.06 : 0);
    S.thrust = approach(S.thrust, T, 6, dt); S.lift = approach(S.lift, L, 6, dt); S.drag = approach(S.drag, D, 6, dt);
    S.v = Math.max(0, S.v + (T - D - 0.5 * S.vy) * 0.7 * dt);
    if (onGround && L < W) S.vy = 0;
    else S.vy += ((L - W) * 1.5 - 1.3 * S.vy) * dt;
    S.alt = Math.max(0, S.alt + S.vy * 0.32 * dt);
    if (S.alt === 0 && S.vy < 0) S.vy = 0;
    const stalled = S.a > STALL && !onGround;
    S.shake = approach(S.shake, stalled ? 1 : 0, 4, dt);

    const next: Mood = onGround && L < W ? "ground" : stalled ? "stall" : S.vy > 0.07 ? "climb" : S.vy < -0.07 ? "sink"
      : S.thrust - S.drag > 0.04 ? "faster" : S.drag - S.thrust > 0.04 ? "slower" : "cruise";
    if (next !== mood) setMood(next);

    // Camera: the plane stays put; the world moves past it.
    const s = Math.min(w / 11, h / 6.2);
    const px = w * 0.46, py = h * 0.44 - Math.max(-1, Math.min(1, S.vy * 1.4)) * s * 0.5;
    const groundY = py + (S.alt * 0.42 + 0.36) * s * 2.2;
    S.scroll += S.v * dt;

    // Sky.
    ctx.clearRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#04070f"); sky.addColorStop(1, "#0b1530");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // Distant clouds drift by slowly (parallax).
    for (const c of S.clouds) {
      const x = ((c.x - S.scroll * c.d * 0.08) % 1.2 + 1.2) % 1.2 - 0.1;
      const y = c.y * h + (groundY - h) * c.d * 0.4;
      const g = ctx.createRadialGradient(x * w, y, 0, x * w, y, c.r * w);
      g.addColorStop(0, `rgba(140, 170, 230, ${0.05 + c.d * 0.05})`); g.addColorStop(1, "rgba(140,170,230,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x * w, y, c.r * w, c.r * w * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }

    // The ground: a horizon glow and a grid rushing underneath.
    if (groundY < h + 40) {
      const gy = Math.max(groundY, -10);
      const hg = ctx.createLinearGradient(0, gy - 60, 0, gy + 4);
      hg.addColorStop(0, "rgba(255, 170, 90, 0)"); hg.addColorStop(1, "rgba(255, 170, 90, 0.07)");
      ctx.fillStyle = hg; ctx.fillRect(0, gy - 60, w, 64);
      ctx.fillStyle = "#050a15"; ctx.fillRect(0, gy, w, h - gy + 10);
      ctx.strokeStyle = "rgba(200, 214, 235, 0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      ctx.strokeStyle = "rgba(200, 214, 235, 0.07)"; ctx.lineWidth = 1;
      const gap = s * 1.4, off = (S.scroll * s * 2.2) % gap;
      for (let x = -off; x < w + gap * 4; x += gap) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x - (x - px) * 1.6 - gap * 2, h + 10); ctx.stroke(); }
      for (let k = 1; k < 6; k++) { const y = gy + (h - gy) * (k / 6) ** 1.6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      if (S.alt < 0.6) { // runway markings
        ctx.fillStyle = "rgba(230, 245, 255, 0.35)";
        const dash = s * 0.9, doff = (S.scroll * s * 2.2) % (dash * 2);
        for (let x = -doff; x < w; x += dash * 2) ctx.fillRect(x, gy + 6, dash, 2);
      }
    }

    // Air rushing past, bent down a little behind the wing (that's the air the wing pushes down).
    const build = smooth(0.6, 1.6, time);
    ctx.lineCap = "round";
    for (const st of S.streaks) {
      st.x -= S.v * dt * 0.55 * (0.8 + st.l * 0.4);
      if (st.x < -0.1) { st.x = 1.1; st.y = S.rand(); }
      const x = st.x * w, y0 = st.y * h;
      const rel = (x - px) / s, near = Math.exp(-(((y0 - py) / (s * 1.3)) ** 2));
      const down = rel < 0 ? Math.min(1, -rel / 3) * near * S.lift * 0.35 * s : 0;
      const len = (0.15 + S.v * 0.6) * s * st.l;
      ctx.strokeStyle = `rgba(150, 225, 255, ${st.a * build * Math.min(1, S.v * 1.2) * 0.6})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y0 + down); ctx.lineTo(x + len, y0 + down * 0.9); ctx.stroke();
    }

    // The plane: outline draws in, then fills. Pitch follows the nose angle (plus a little climb).
    const pitch = ((S.a - 2) * Math.PI) / 180 + Math.atan2(S.vy * 0.3, Math.max(0.3, S.v)) + S.shake * Math.sin(time * 30) * 0.012;
    const ps = s * 0.78;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const P = ([x, y]: [number, number]): [number, number] => [px + (x * cp - y * sp) * ps, py - (x * sp + y * cp) * ps];
    const shape = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); };
    const drawn = Math.min(1, time / 1);
    // Exhaust glow behind the engine: longer with more throttle.
    if (time > 1) {
      const [ex, ey] = P([0.05, -0.38]), [tx, ty] = P([0.05 - 0.6 - S.thrust * 1.6, -0.38]);
      const eg = ctx.createLinearGradient(ex, ey, tx, ty);
      eg.addColorStop(0, `rgba(255, 190, 110, ${0.55 * S.thrust})`); eg.addColorStop(1, "rgba(255, 140, 60, 0)");
      ctx.strokeStyle = eg; ctx.lineWidth = 0.16 * ps; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke();
    }
    ctx.save();
    ctx.lineJoin = "round";
    const body = ctx.createLinearGradient(0, py - ps * 0.4, 0, py + ps * 0.4);
    body.addColorStop(0, "#2d3648"); body.addColorStop(1, "#121722");
    ctx.setLineDash([ps * 12 * drawn, ps * 12]);
    shape(TAILPLANE); if (drawn >= 1) { ctx.fillStyle = "#1c2230"; ctx.fill(); } ctx.strokeStyle = "rgba(214, 224, 238, 0.55)"; ctx.lineWidth = 1.2; ctx.stroke();
    shape(BODY); if (drawn >= 1) { ctx.fillStyle = body; ctx.fill(); } ctx.strokeStyle = "rgba(214, 224, 238, 0.9)"; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.setLineDash([]);
    if (drawn >= 1) {
      // Engine pod, wing slice, windows.
      const [e1x, e1y] = P([0.95, -0.3]), [e2x, e2y] = P([0.05, -0.46]);
      ctx.beginPath(); ctx.ellipse((e1x + e2x) / 2, (e1y + e2y) / 2, 0.46 * ps, 0.1 * ps, -pitch, 0, Math.PI * 2);
      ctx.fillStyle = "#171c27"; ctx.fill(); ctx.strokeStyle = "rgba(214, 224, 238, 0.55)"; ctx.lineWidth = 1.2; ctx.stroke();
      shape(WING); ctx.fillStyle = "#353f54"; ctx.fill(); ctx.strokeStyle = "rgba(214, 224, 238, 0.7)"; ctx.stroke();
      ctx.fillStyle = "rgba(220, 228, 240, 0.45)";
      for (let i = 0; i < 9; i++) { const [wx, wy] = P([1.15 - i * 0.26, 0.15]); ctx.beginPath(); ctx.arc(wx, wy, 0.035 * ps, 0, Math.PI * 2); ctx.fill(); }
      const [c1x, c1y] = P([1.78, 0.16]), [c2x, c2y] = P([1.52, 0.24]);
      ctx.strokeStyle = "rgba(220, 228, 240, 0.7)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(c1x, c1y); ctx.lineTo(c2x, c2y); ctx.stroke();
    }
    ctx.restore();

    // The four forces. Each arrow's length shows how big that force is.
    const show = smooth(1.2, 1.7, time);
    if (show > 0) {
      const k = s * 1.05;
      ctx.save(); ctx.globalAlpha = show;
      const [lx, ly] = P([0.2, 0.35]);
      arrow(ctx, lx, ly, lx, ly - Math.min(s * 2.4, S.lift * k), undefined, "Lift");
      const [wx, wy] = P([0.2, -0.3]);
      arrow(ctx, wx, wy, wx, wy + W * k, undefined, "Weight");
      const [tx, ty] = P([1.0, -0.38]), tl = Math.min(s * 2.6, S.thrust * k * 1.8);
      if (tl > 6) arrow(ctx, tx, ty, tx + cp * tl, ty - sp * tl, undefined, "Thrust");
      const [dx, dy] = P([-2.2, 0.18]), dl = Math.min(s * 2.6, S.drag * k * 1.8);
      if (dl > 6) {
        arrow(ctx, dx, dy, dx - dl, dy, undefined, "Drag");
      }
      ctx.restore();
    }
  });

  return (
    <SceneShell id="plane" caption={caption(mood)} hint="Pull the throttle back and watch it sink"
      controls={<>
        <Slider label="Throttle" value={throttle} onChange={setThrottle} left="Idle" right="Full" />
        <Slider label="Nose angle" value={nose} onChange={setNose} min={-3} max={19} step={0.5} left="Down" right="Up" />
      </>}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-label="An aeroplane in flight with lift, weight, thrust and drag arrows" role="img" />
    </SceneShell>
  );
}
