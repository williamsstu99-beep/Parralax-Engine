"use client";

import { useRef, useState } from "react";
import SceneShell from "./SceneShell";
import { Slider, Toggle } from "./controls";
import { approach, font, rng, useCanvas } from "./useCanvas";
import { aerofoil, liftFactor, stallAmount, velocity } from "./wingFlow";

type V = [number, number];
const WING = aerofoil(200);
const N = 1500;
const WEIGHT = 1, LIFT_K = 17.7; // lift balances weight at about half speed and a gentle tilt

interface Air { x: number; y: number; px: number; py: number; age: number }

function caption(speed: number, tilt: number, lifting: boolean) {
  if (speed < 0.04) return "Still air. No air flowing over the wing means no lift. Slide the speed up.";
  if (stallAmount(tilt) > 0.3) return "Too steep! The air can't follow the curved top any more, so it breaks into swirls (turbulence) and the lift collapses. That's a stall.";
  if (tilt < -1) return "Nose down: the wing now pushes air upwards, and loses its lift.";
  if (!lifting) return "Air streams around the wing, a little faster over the curved top. But it's not moving fast enough to lift the wing yet.";
  return "Air rushes faster over the curved top (see the lines squeeze together), so the pressure above drops. Slower air bunches up underneath and pushes up. That push is lift!";
}

export default function WingScene() {
  const [speed, setSpeed] = useState(0.35);
  const [tilt, setTilt] = useState(6);
  const [pressure, setPressure] = useState(true);
  const [lifting, setLifting] = useState(false);

  const sim = useRef<{ air: Air[]; height: number; lift: number; a: number; started: boolean; rand: () => number }>({ air: [], height: 0, lift: 0, a: 6, started: false, rand: rng(7) });

  const ref = useCanvas(({ ctx, w, h, dt, time }) => {
    const S = sim.current, U = speed, tiltDeg = tilt, showP = pressure;
    const s = Math.min(w / 10.5, h / 6.2);              // pixels per wing unit
    const cx = w * 0.46, rest = h * 0.6;
    S.a = approach(S.a, tiltDeg, 4, dt);
    const alpha = (S.a * Math.PI) / 180;
    const stall = stallAmount(S.a);
    const lift = U * U * LIFT_K * liftFactor(S.a);
    S.lift = approach(S.lift, lift, 3, dt);
    const targetH = Math.max(0, Math.min(1.5, (S.lift - WEIGHT) * 0.55));
    S.height = approach(S.height, targetH, 1.6, dt);
    const nowLifting = S.lift > WEIGHT * 1.02 && U > 0.04;
    if (nowLifting !== lifting) setLifting(nowLifting);

    const left = -cx / s - 0.4, right = (w - cx) / s + 0.4, top = rest / s + 0.4, bottom = -(h - rest) / s - 0.4;
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    // World (flow frame, x downstream, y up) ⇄ wing frame (wing fixed, flow arriving at angle α).
    const toWing = (x: number, y: number): V => { const yy = y - S.height; return [x * ca - yy * sa, x * sa + yy * ca]; };
    const fromWingVel = (v: V): V => [v[0] * ca + v[1] * sa, -v[0] * sa + v[1] * ca];
    const sx = (x: number) => cx + x * s, sy = (y: number) => rest - y * s;

    // Separated, swirling air above and behind a stalled wing: a train of eddies shed downstream.
    const swirl = (x: number, y: number): V => {
      if (stall <= 0) return [0, 0];
      let u = 0, v = 0;
      for (let k = 0; k < 5; k++) {
        const ex = -0.6 + ((time * 1.4 + k * 1.35) % 6.5), ey = S.height + 0.55 + 0.35 * Math.sin(k * 2.1 + time * 0.7);
        // A compact eddy: spins fast near its core and fades out within about half a wing-thickness.
        const dx = x - ex, dy = y - ey, r2 = dx * dx + dy * dy;
        const g = (k % 2 ? 1 : -1) * 0.55 * stall * (1 - Math.exp(-r2 / 0.04)) / (r2 + 1e-4) * Math.exp(-r2 / 0.35);
        u += -dy * g; v += dx * g;
      }
      return [u, v];
    };
    const vel = (x: number, y: number): V | null => {
      const vw = velocity(toWing(x, y), alpha, 1 - 0.65 * stall);
      if (!vw) return null;
      const v = fromWingVel(vw);
      const sw = swirl(x, y);
      const inWake = stall > 0 && x > -0.8 && y > S.height - 0.1 && y < S.height + 2.2;
      return inWake ? [v[0] * (1 - 0.5 * stall) + sw[0], v[1] * (1 - 0.5 * stall) + sw[1]] : v;
    };

    const seed = (a: Air, anywhere: boolean) => {
      a.x = anywhere ? left + S.rand() * (right - left) : left - S.rand() * 0.6;
      a.y = bottom + S.rand() * (top - bottom);
      a.px = a.x; a.py = a.y; a.age = 0;
    };
    if (!S.started) { S.air = Array.from({ length: N }, () => { const a = { x: 0, y: 0, px: 0, py: 0, age: 0 }; seed(a, true); return a; }); S.started = true; }

    // Background: fade the last frame to leave streaks behind each bit of air.
    ctx.fillStyle = "rgba(6, 9, 17, 0.2)";
    ctx.fillRect(0, 0, w, h);

    // Pressure: warm, bunched-up air below; cool, thinner air above.
    const wingC = { x: sx(0), y: sy(S.height) };
    const p = Math.min(1, Math.max(0, (S.lift / 4))) * (1 - 0.6 * stall);
    if (showP && U > 0.05) {
      const below = ctx.createRadialGradient(wingC.x, wingC.y + s * 0.6, 0, wingC.x, wingC.y + s * 0.6, s * 2.6);
      below.addColorStop(0, `rgba(255, 170, 70, ${0.16 * p + 0.02})`); below.addColorStop(1, "rgba(255,170,70,0)");
      ctx.fillStyle = below; ctx.fillRect(0, 0, w, h);
      const above = ctx.createRadialGradient(wingC.x, wingC.y - s * 0.7, 0, wingC.x, wingC.y - s * 0.7, s * 2.6);
      above.addColorStop(0, `rgba(120, 140, 255, ${0.14 * p + 0.02})`); above.addColorStop(1, "rgba(120,140,255,0)");
      ctx.fillStyle = above; ctx.fillRect(0, 0, w, h);
    }

    // The air.
    const build = Math.min(1, Math.max(0, (time - 0.9) / 1.4)); // air fades in after the wing draws
    const active = Math.floor(N * build);
    const step = U * 2.8 * dt;
    ctx.lineCap = "round";
    for (let i = 0; i < active; i++) {
      const a = S.air[i];
      a.px = a.x; a.py = a.y; a.age += dt;
      let spd = 1;
      if (U > 0.01) {
        const v1 = vel(a.x, a.y);
        if (!v1) { seed(a, false); continue; }
        const mx = a.x + v1[0] * step * 0.5, my = a.y + v1[1] * step * 0.5;
        const v2 = vel(mx, my) ?? v1;
        a.x += v2[0] * step; a.y += v2[1] * step;
        spd = Math.hypot(v2[0], v2[1]);
      } else {
        a.x += (S.rand() - 0.5) * 0.01; a.y += (S.rand() - 0.5) * 0.01; // still air just jiggles
      }
      if (a.x > right || a.y > top + 1 || a.y < bottom - 1) { seed(a, false); continue; }
      const fadeIn = Math.min(1, a.age * 3);
      // Colour by local speed: slow air warm, normal air cyan, fast air bright white.
      const col = spd < 0.85 ? `rgba(255, 186, 90, ${0.75 * fadeIn})` : spd > 1.18 ? `rgba(225, 250, 255, ${0.95 * fadeIn})` : `rgba(110, 231, 255, ${0.7 * fadeIn})`;
      ctx.strokeStyle = col;
      ctx.lineWidth = spd > 1.18 ? 1.6 : 1.3;
      ctx.beginPath(); ctx.moveTo(sx(a.px), sy(a.py)); ctx.lineTo(sx(a.x) + 0.01, sy(a.y)); ctx.stroke();
    }

    // Where the wing started: a faint ghost, so you can see how far it has climbed.
    if (S.height > 0.06) {
      ctx.save();
      ctx.setLineDash([5, 6]); ctx.strokeStyle = "rgba(160, 240, 255, 0.28)"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      WING.forEach(([x, y], i) => { const X = x * ca + y * sa, Y = -x * sa + y * ca; if (i) ctx.lineTo(sx(X), sy(Y)); else ctx.moveTo(sx(X), sy(Y)); });
      ctx.closePath(); ctx.stroke();
      ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.moveTo(sx(-2.6), sy(0)); ctx.lineTo(sx(-2.6), sy(S.height)); ctx.stroke();
      ctx.restore();
    }

    // The wing: outline draws itself first, then fills in.
    const drawn = Math.min(1, time / 0.9);
    const pts = WING.map(([x, y]) => { const X = x * ca + y * sa, Y = -x * sa + y * ca; return [sx(X), sy(Y + S.height)] as V; });
    ctx.save();
    ctx.beginPath();
    const upto = Math.max(2, Math.floor(pts.length * drawn));
    pts.slice(0, upto).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (drawn >= 1) {
      ctx.closePath();
      const g = ctx.createLinearGradient(0, wingC.y - s * 0.4, 0, wingC.y + s * 0.4);
      g.addColorStop(0, "#22304f"); g.addColorStop(1, "#0d1424");
      ctx.globalAlpha = Math.min(1, (time - 0.9) * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = "rgba(110, 231, 255, 0.9)"; ctx.shadowBlur = 16;
    ctx.strokeStyle = "rgba(160, 240, 255, 0.95)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    // Forces: lift up, weight down. Lift bigger than weight → the wing rises.
    if (time > 1.4) {
      const arrow = (x: number, y: number, len: number, color: string, label: string) => {
        if (Math.abs(len) < 4) return;
        const dir = Math.sign(len), y2 = y - len;
        ctx.save();
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4; ctx.shadowColor = color; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y2 + dir * 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x - 9, y2 + dir * 14); ctx.lineTo(x + 9, y2 + dir * 14); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.font = font(600, 15); ctx.textAlign = "left";
        ctx.fillText(label, x + 14, y2 + dir * 6);
        ctx.restore();
      };
      arrow(wingC.x, wingC.y - s * 0.25, Math.min(s * 2.2, S.lift * s * 0.42), "#5eead4", "Lift");
      arrow(wingC.x + s * 0.5, wingC.y + s * 0.2, -WEIGHT * s * 0.42, "#ff9db0", "Weight");
      if (showP && U > 0.25 && stall < 0.5) {
        ctx.font = font(500, 14); ctx.textAlign = "center";
        ctx.fillStyle = "rgba(170, 185, 255, 0.85)"; ctx.fillText("lower pressure", wingC.x - s * 1.2, wingC.y - s * 1.15);
        ctx.fillStyle = "rgba(255, 195, 120, 0.85)"; ctx.fillText("higher pressure", wingC.x - s * 1.0, wingC.y + s * 1.05);
      }
    }
  });

  return (
    <SceneShell id="wing" caption={caption(speed, tilt, lifting)} hint="Try full speed, then tilt the nose right up"
      controls={<>
        <Slider label="Air speed" value={speed} onChange={setSpeed} left="Still" right="Fast" />
        <Slider label="Tilt the wing" value={tilt} onChange={setTilt} min={-4} max={22} step={0.5} left="Nose down" right="Nose up" />
        <Toggle label="Show pressure" on={pressure} onChange={setPressure} />
      </>}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-label="Air flowing around a wing" role="img" />
    </SceneShell>
  );
}
