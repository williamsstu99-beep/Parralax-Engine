"use client";

import { useRef, useState } from "react";
import SceneShell from "./SceneShell";
import { Button, Segmented, Toggle } from "./controls";
import { approach, font, rng, useCanvas } from "./useCanvas";

type V = [number, number];
type Metal = "magnesium" | "zinc" | "iron";
type Mode = "battery" | "recharge";

/** The left metal: how hard it pushes electrons (cell voltage against copper), and how it looks. */
const METALS: Record<Metal, { name: string; ion: string; volts: number; plate: string; ionColor: string }> = {
  magnesium: { name: "Magnesium", ion: "Mg²⁺", volts: 2.7, plate: "#eef1f7", ionColor: "#f4f6fb" },
  zinc: { name: "Zinc", ion: "Zn²⁺", volts: 1.1, plate: "#b9c0cc", ionColor: "#d6dbe5" },
  iron: { name: "Iron", ion: "Fe²⁺", volts: 0.78, plate: "#7f8691", ionColor: "#c9b28f" },
};

const LEFT = -2.7, RIGHT = 2.7, BEAKER_W = 3.1, BOTTOM = -2.55, LIQUID = 0, PLATE_TOP = 1.35, PLATE_BOT = -1.95, WIRE_Y = 2.45;
const BRIDGE: V[] = [[-1.45, -1.0], [-1.45, 1.05], [1.45, 1.05], [1.45, -1.0]];
const WIRE: V[] = [[LEFT, PLATE_TOP], [LEFT, WIRE_Y], [RIGHT, WIRE_Y], [RIGHT, PLATE_TOP]];

interface Ion { x: number; y: number; vx: number; vy: number; life: number }

function along(path: V[], f: number): V {
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let u = f * lens.reduce((a, b) => a + b, 0), i = 0;
  while (i < lens.length - 1 && u > lens[i]) { u -= lens[i]; i++; }
  const a = path[i], b = path[i + 1], t = Math.min(1, u / lens[i]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function caption(on: boolean, mode: Mode, level: number, metal: Metal) {
  const m = METALS[metal];
  if (!on) return `${m.name} and copper sit in their solutions, joined by a salt bridge. Nothing happens until you connect the circuit.`;
  if (mode === "recharge") return level > 0.97
    ? "Fully recharged! The charger forced everything back where it started. Switch back to Battery to use it again."
    : `Recharging runs it backwards: the charger pushes electrons the other way, rebuilding the ${m.name.toLowerCase()} and putting copper back into the solution. Using electricity to drive a reaction is electrolysis.`;
  if (level < 0.03) return `Flat! The ${m.name.toLowerCase()} is used up and the blue copper ions are gone, so there's nothing left to push electrons. Switch to Recharge to run it backwards.`;
  if (metal === "magnesium") return "Magnesium gives up its electrons even more eagerly than zinc, so it pushes harder: a brighter bulb, but it gets used up faster.";
  if (metal === "iron") return "Iron gives up its electrons less eagerly than zinc, so the push is weaker and the bulb is dimmer.";
  return "Zinc atoms give up two electrons each and dissolve as zinc ions. The electrons race through the wire, lighting the bulb, to the copper, where blue copper ions grab them and become solid copper.";
}

export default function BatteryScene() {
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<Mode>("battery");
  const [metal, setMetal] = useState<Metal>("zinc");
  const [levelShown, setLevelShown] = useState(1);
  const S = useRef({
    level: 1, electrons: 0, bridge: 0, glow: 0, current: 0, flash: [] as { x: number; y: number; t: number }[],
    left: [] as Ion[], right: [] as Ion[], rand: rng(11), seeded: false, spawnL: 0, spawnR: 0,
  });

  const ref = useCanvas(({ ctx, w, h, dt, time }) => {
    const st = S.current, m = METALS[metal];
    const s = Math.min(w / 11.8, h / 6.4);
    const X = (x: number) => w / 2 + x * s, Y = (y: number) => h * 0.47 - y * s;
    const rand = st.rand;
    const inLeft = (x: number) => Math.abs(x - LEFT) < BEAKER_W / 2 - 0.12, inRight = (x: number) => Math.abs(x - RIGHT) < BEAKER_W / 2 - 0.12;

    if (!st.seeded) {
      for (let i = 0; i < 46; i++) st.right.push({ x: RIGHT + (rand() - 0.5) * (BEAKER_W - 0.5), y: BOTTOM + 0.2 + rand() * (LIQUID - BOTTOM - 0.4), vx: 0, vy: 0, life: 1 });
      for (let i = 0; i < 10; i++) st.left.push({ x: LEFT + (rand() - 0.5) * (BEAKER_W - 0.5), y: BOTTOM + 0.2 + rand() * (LIQUID - BOTTOM - 0.4), vx: 0, vy: 0, life: 1 });
      st.seeded = true;
    }

    // The chemistry: current flows while connected and there's something left to react.
    const sign = mode === "battery" ? 1 : -1;
    const fuel = mode === "battery" ? Math.min(1, st.level / 0.15) : (st.level < 0.995 ? 1 : 0);
    const target = on && time > 2.2 ? sign * fuel * (mode === "battery" ? m.volts / 1.1 : 1.1) : 0;
    st.current = approach(st.current, target, 6, dt);
    st.level = Math.max(0, Math.min(1, st.level - st.current * dt * (mode === "battery" ? 0.024 : 0.03)));
    st.glow = approach(st.glow, mode === "battery" ? Math.min(1, Math.max(0, st.current) / 1.6) ** 0.7 : 0, 8, dt);
    st.electrons += st.current * dt * 0.22;
    st.bridge += st.current * dt * 0.08;
    if (Math.abs(st.level - levelShown) > 0.02 || (st.level < 0.03) !== (levelShown < 0.03) || (st.level > 0.97) !== (levelShown > 0.97)) setLevelShown(st.level);

    // Ions: metal dissolves into the left beaker; copper ions in the right are plated out (and the reverse when recharging).
    const I = st.current, Lplate = 0.38 * (0.3 + 0.7 * st.level), Rplate = 0.32 * (0.85 + 0.6 * (1 - st.level));
    st.spawnL += Math.max(0, I) * dt * 9; st.spawnR += Math.max(0, -I) * dt * 9;
    while (st.spawnL >= 1) { st.spawnL--; st.left.push({ x: LEFT + Lplate / 2 + 0.05, y: PLATE_BOT + rand() * (LIQUID - PLATE_BOT - 0.1), vx: 0.9 + rand() * 0.8, vy: (rand() - 0.5) * 0.9, life: 1 }); }
    while (st.spawnR >= 1) { st.spawnR--; st.right.push({ x: RIGHT - Rplate / 2 - 0.05, y: PLATE_BOT + rand() * (LIQUID - PLATE_BOT - 0.1), vx: -0.9 - rand() * 0.8, vy: (rand() - 0.5) * 0.9, life: 1 }); }
    const wander = (p: Ion, cx: number) => {
      p.vx += (rand() - 0.5) * 4 * dt; p.vy += (rand() - 0.5) * 4 * dt; p.vx *= Math.exp(-0.9 * dt); p.vy *= Math.exp(-0.9 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      const half = BEAKER_W / 2 - 0.18;
      if (p.x < cx - half) { p.x = cx - half; p.vx = Math.abs(p.vx); } if (p.x > cx + half) { p.x = cx + half; p.vx = -Math.abs(p.vx); }
      if (p.y < BOTTOM + 0.15) { p.y = BOTTOM + 0.15; p.vy = Math.abs(p.vy); } if (p.y > LIQUID - 0.12) { p.y = LIQUID - 0.12; p.vy = -Math.abs(p.vy); }
    };
    // Copper ions get pulled to the copper plate and plated out (battery); metal ions get pulled back onto the left plate (recharge).
    const capture = (list: Ion[], plateX: number, half: number, pull: number, quota: number) => {
      let taken = 0;
      for (const p of list) {
        if (pull > 0.02 && taken < quota) {
          const dx = plateX - p.x; p.vx += Math.sign(dx) * pull * 1.6 * dt;
        }
        if (pull > 0.02 && Math.abs(p.x - plateX) < half + 0.06 && p.y > PLATE_BOT && p.y < LIQUID) { p.life = 0; st.flash.push({ x: p.x, y: p.y, t: time }); taken++; }
      }
      return list.filter(p => p.life > 0);
    };
    const keep = Math.round(10 + 40 * st.level), copper = Math.round(46 * st.level);
    st.right = capture(st.right, RIGHT, Rplate / 2, I > 0 && st.right.length > copper ? I : 0, 99);
    st.left = capture(st.left, LEFT, Lplate / 2, I < 0 && st.left.length > keep ? -I : 0, 99);
    for (const p of st.left) wander(p, LEFT);
    for (const p of st.right) wander(p, RIGHT);
    if (st.left.length > 70) st.left.splice(0, st.left.length - 70);
    if (st.right.length > 60) st.right.splice(0, st.right.length - 60);

    ctx.clearRect(0, 0, w, h);
    const reveal = (t0: number, d = 0.6) => Math.min(1, Math.max(0, (time - t0) / d));

    // Beakers and their solutions (copper sulfate is blue; it fades as copper ions are used up).
    const beaker = (cx: number, tint: string, k: number) => {
      const x0 = X(cx - BEAKER_W / 2), x1 = X(cx + BEAKER_W / 2), yb = Y(BOTTOM), yt = Y(LIQUID + 0.75);
      const fill = reveal(0.5, 0.8), ly = Y(BOTTOM + (LIQUID - BOTTOM) * fill);
      ctx.fillStyle = tint; ctx.beginPath(); ctx.roundRect(x0 + 3, ly, x1 - x0 - 6, yb - ly - 3, [0, 0, 16, 16]); ctx.fill();
      ctx.strokeStyle = "rgba(200, 220, 255, 0.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, yt); ctx.lineTo(x0, yb - 18); ctx.quadraticCurveTo(x0, yb, x0 + 18, yb); ctx.lineTo(x1 - 18, yb); ctx.quadraticCurveTo(x1, yb, x1, yb - 18); ctx.lineTo(x1, yt);
      ctx.save(); ctx.globalAlpha = k; ctx.stroke(); ctx.restore();
      ctx.strokeStyle = "rgba(220,235,255,0.25)"; ctx.beginPath(); ctx.moveTo(x0 + 3, ly); ctx.lineTo(x1 - 3, ly); ctx.stroke();
    };
    const blue = 0.08 + 0.32 * Math.min(1, st.right.length / 46);
    beaker(LEFT, "rgba(190, 200, 220, 0.08)", reveal(0.1));
    beaker(RIGHT, `rgba(70, 140, 255, ${blue})`, reveal(0.25));

    // Salt bridge: a glass tube with ions drifting each way to keep both sides balanced.
    const br = reveal(1.1, 0.7);
    if (br > 0) {
      ctx.save(); ctx.globalAlpha = br; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); BRIDGE.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.strokeStyle = "rgba(200, 220, 255, 0.28)"; ctx.lineWidth = 0.34 * s; ctx.stroke();
      ctx.strokeStyle = "rgba(10, 16, 30, 0.95)"; ctx.lineWidth = 0.34 * s - 4; ctx.stroke();
      for (let k = 0; k < 14; k++) {
        const neg = k % 2 === 0, f = (((k / 14) + (neg ? -1 : 1) * st.bridge) % 1 + 1) % 1, [x, y] = along(BRIDGE, f);
        ctx.fillStyle = neg ? "#c4a5ff" : "#7ef0c8"; ctx.beginPath(); ctx.arc(X(x), Y(y), 3.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = font(500, 12); ctx.fillStyle = "rgba(200,212,235,0.7)"; ctx.textAlign = "center"; ctx.fillText("salt bridge", X(0), Y(1.05) - 0.3 * s);
      ctx.restore();
    }

    // Ions in solution.
    const dot = (p: Ion, color: string, r: number) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2); ctx.fill(); };
    if (time > 1.2) {
      ctx.save(); ctx.globalAlpha = reveal(1.2);
      ctx.shadowColor = "#5aa0ff"; ctx.shadowBlur = 8; for (const p of st.right) if (inRight(p.x)) dot(p, "#6fb0ff", 4.2);
      ctx.shadowColor = m.ionColor; ctx.shadowBlur = 6; for (const p of st.left) if (inLeft(p.x)) dot(p, m.ionColor, 4);
      ctx.restore();
    }
    st.flash = st.flash.filter(f => time - f.t < 0.5);
    for (const f of st.flash) { const k = 1 - (time - f.t) / 0.5; ctx.strokeStyle = `rgba(255, 220, 160, ${k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(f.x), Y(f.y), 4 + 10 * (1 - k), 0, Math.PI * 2); ctx.stroke(); }

    // Electrodes: lowered in, then the metal one thins and the copper one thickens as they react.
    const plate = (cx: number, width: number, color: string, label: string, t0: number) => {
      const k = reveal(t0, 0.6), drop = (1 - k) * 1.2;
      const x0 = X(cx - width / 2), x1 = X(cx + width / 2), y0 = Y(PLATE_TOP + drop), y1 = Y(PLATE_BOT + drop);
      const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, color); g.addColorStop(0.5, "#ffffff"); g.addColorStop(1, color);
      ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = g; ctx.globalAlpha = k * 0.92;
      ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 3); ctx.fill();
      ctx.globalAlpha = k; ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 3); ctx.globalAlpha = k * 0.55; ctx.fill();
      ctx.globalAlpha = k; ctx.font = font(600, 14); ctx.fillStyle = "#e8edf8"; ctx.textAlign = "center"; ctx.fillText(label, (x0 + x1) / 2, Y(BOTTOM) + 24);
      ctx.restore();
    };
    plate(LEFT, Lplate, m.plate, m.name, 0.7);
    plate(RIGHT, Rplate, "#e08a52", "Copper", 0.85);

    // Wire across the top, with the bulb (battery) or the charger (recharge), and electrons flowing.
    const wr = reveal(1.6, 0.8);
    if (wr > 0) {
      const lit = st.glow;
      ctx.save(); ctx.globalAlpha = wr; ctx.lineWidth = 3.5; ctx.lineJoin = "round"; ctx.strokeStyle = `rgba(${150 + 100 * lit}, ${175 + 70 * lit}, ${210 + 40 * lit}, 0.9)`;
      ctx.beginPath(); WIRE.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
      // switch
      const sx = X(-1.35), sy = Y(WIRE_Y);
      ctx.fillStyle = "#05070d"; ctx.fillRect(sx - 18, sy - 6, 36, 12);
      ctx.strokeStyle = "#cdd6ea"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - 18, sy); ctx.lineTo(sx + 16, on ? sy : sy - 16); ctx.stroke();
      ctx.fillStyle = "#cdd6ea"; ctx.beginPath(); ctx.arc(sx - 18, sy, 3.5, 0, Math.PI * 2); ctx.arc(sx + 18, sy, 3.5, 0, Math.PI * 2); ctx.fill();
      if (Math.abs(st.current) > 0.02) {
        ctx.fillStyle = "#fde68a"; ctx.shadowColor = "#fde68a"; ctx.shadowBlur = 8;
        for (let k = 0; k < 22; k++) {
          const f = (((k / 22) + st.electrons) % 1 + 1) % 1, [x, y] = along(WIRE, f);
          ctx.beginPath(); ctx.arc(X(x), Y(y), 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      const bx = X(0.9), by = Y(WIRE_Y), r = 0.34 * s;
      if (mode === "battery") {
        if (lit > 0.02) { const g = ctx.createRadialGradient(bx, by, 0, bx, by, r * (2 + 5 * lit)); g.addColorStop(0, `rgba(255,225,150,${0.9 * lit})`); g.addColorStop(1, "rgba(255,180,70,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r * (2 + 5 * lit), 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = `rgb(${Math.round(30 + 225 * lit)}, ${Math.round(38 + 200 * lit)}, ${Math.round(58 + 110 * lit)})`;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#9aa8c7"; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - r * 0.5, by - r * 0.5); ctx.lineTo(bx + r * 0.5, by + r * 0.5); ctx.moveTo(bx + r * 0.5, by - r * 0.5); ctx.lineTo(bx - r * 0.5, by + r * 0.5); ctx.stroke();
        ctx.font = font(600, 13); ctx.fillStyle = "rgba(220,230,250,0.85)"; ctx.textAlign = "center"; ctx.fillText(`${m.name} + copper ≈ ${m.volts} V`, bx, by + r + 22);
      } else {
        ctx.fillStyle = "#0e1526"; ctx.strokeStyle = "#7ef0c8"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(bx - r * 1.4, by - r * 0.85, r * 2.8, r * 1.7, 8); ctx.fill(); ctx.stroke();
        ctx.font = font(700, 13); ctx.fillStyle = "#7ef0c8"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("⚡ Charger", bx, by + 1); ctx.textBaseline = "alphabetic";
      }
      ctx.restore();
    }

    // Legend: what the dots are.
    if (time > 2) {
      const items: [string, string][] = [["#fde68a", "electron"], [m.ionColor, `${m.name.toLowerCase()} ion (${m.ion})`], ["#6fb0ff", "copper ion (Cu²⁺)"], ["#c4a5ff", "negative ion"], ["#7ef0c8", "positive ion (salt bridge)"]];
      ctx.save(); ctx.globalAlpha = reveal(2); ctx.font = font(500, 12); ctx.textAlign = "left"; ctx.textBaseline = "middle";
      let x = 18; const y = h - 18;
      for (const [c, label] of items) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 4, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(200,212,235,0.75)"; ctx.fillText(label, x + 13, y); x += ctx.measureText(label).width + 30;
      }
      ctx.restore();
    }
  });

  const reset = () => { const st = S.current; st.level = 1; st.left = []; st.right = []; st.seeded = false; st.current = 0; setLevelShown(1); setMode("battery"); };

  return (
    <SceneShell id="battery" caption={caption(on, mode, levelShown, metal)} hint="Connect it, let it run flat, then recharge it"
      controls={<>
        <Toggle label="Connect the circuit" on={on} onChange={setOn} />
        <Segmented label="Mode" value={mode} onChange={setMode} options={[["battery", "Battery (galvanic)"], ["recharge", "Recharge (electrolytic)"]]} />
        <Segmented label="Metal" value={metal} onChange={v => { setMetal(v); }} options={[["magnesium", "Magnesium"], ["zinc", "Zinc"], ["iron", "Iron"]]} />
        <Button onClick={reset}>Start again</Button>
      </>}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" role="img" aria-label="A zinc and copper cell with a salt bridge, lighting a bulb" />
    </SceneShell>
  );
}
