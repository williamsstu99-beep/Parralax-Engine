"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelSceneDef, ModelSpecDef } from "@/engine/spec/lesson";
import { evalModelChallenge, labelsOf, modelDef } from "@/engine/spec/model";
import { compileModel, runModel, type ModelRun } from "@/engine/truth/model/solver";

/* ---------------- helpers ---------------- */

const SPEEDS = [0.5, 1, 2, 4];
const RUN_SECONDS = 10; // a full run takes 10 s at 1×
const PALETTE = ["#7FD8FF", "#FFB547", "#6FD39B", "#FF7A6B", "#9C8CFF", "#FFD84D", "#5AB0FF", "#E8C27A"];
const PARTICLE: Record<string, string> = { blue: "#5AB0FF", orange: "#FFB547", green: "#6FD39B", red: "#FF7A6B", purple: "#9C8CFF", yellow: "#FFD84D" };

const num = (v: number) => {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) return v.toExponential(2);
  return (+v.toPrecision(3)).toLocaleString("en-NZ");
};

function niceStep(span: number, ticks = 4) {
  const raw = span / ticks || 1, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

function valueAt(run: ModelRun, id: string, t: number): number {
  const v = run.series[id], ts = run.t;
  if (!v?.length) return NaN;
  if (t <= ts[0]) return v[0];
  if (t >= ts[ts.length - 1]) return v[v.length - 1];
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
  return v[lo] + ((v[hi] - v[lo]) * (t - ts[lo])) / (ts[hi] - ts[lo] || 1);
}

export interface ModelScene extends ModelSceneDef { id: string; title: string; summary: string }

/* ---------------- component ---------------- */

export default function ModelLab({ model, scene, onValuesChange }: { model: ModelSpecDef; scene: ModelScene; onValuesChange?: (v: Record<string, number>) => void }) {
  const start = useMemo(() => {
    const v: Record<string, number> = Object.fromEntries(model.settings.map(s => [s.id, s.value]));
    for (const a of scene.values) v[a.id] = a.value;
    return v;
  }, [model, scene]);
  const [values, setValues] = useState(start);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ran, setRan] = useState(false);
  const [speed, setSpeed] = useState(1);

  const compiled = useMemo(() => compileModel(modelDef(model)), [model]);
  const run = useMemo(() => runModel(compiled, values), [compiled, values]);
  const labels = useMemo(() => labelsOf(model), [model]);
  const units = useMemo(() => Object.fromEntries([...model.stocks, ...model.variables].map(x => [x.id, x.unit]).concat(model.flows.map(f => [f.id, `per ${model.time_unit.replace(/s$/, "")}`]))), [model]);
  const colors = useMemo(() => Object.fromEntries([...model.stocks, ...model.flows, ...model.variables].map((x, i) => [x.id, PALETTE[i % PALETTE.length]])), [model]);
  useEffect(() => { onValuesChange?.(values); }, [values, onValuesChange]);

  const tRef = useRef(0);
  const [clock, setClock] = useState(0); // real seconds of animation, for flow dots and particles
  useEffect(() => { tRef.current = t; }, [t]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setClock(c => c + dt);
      const next = Math.min(model.duration, tRef.current + (dt * speed * model.duration) / RUN_SECONDS);
      tRef.current = next; setT(next);
      if (next >= model.duration) { setPlaying(false); setRan(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, model.duration]);

  const set = (id: string, v: number) => { setValues(vs => ({ ...vs, [id]: v })); setT(0); setPlaying(false); setRan(false); };
  const go = () => { if (t >= model.duration) setT(0); setRan(false); setPlaying(true); };
  const reset = () => { setValues(start); setT(0); setPlaying(false); setRan(false); };
  const challenge = scene.challenge && ran ? evalModelChallenge(scene.challenge, run, labels, model.time_unit) : null;
  const placed = model.stocks.filter(s => s.x !== null && s.y !== null);
  // Stocks and anything shown on a gauge or graph come first; other helpers fold away.
  const shown = new Set([...model.stocks.map(s => s.id), ...model.gauges.map(g => g.what), ...scene.graph]);
  const main = [...model.stocks, ...model.variables].filter(x => shown.has(x.id));
  const extra = model.variables.filter(x => !shown.has(x.id));
  const unit = model.time_unit;

  return (
    <div className="grid gap-4 text-[var(--fg)] lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-w-0 flex-col gap-3">
        {scene.challenge && (
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 ${challenge?.done ? "border-[var(--good)] bg-[#12291F]" : "border-[var(--line)] bg-[var(--panel)]"}`}>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--volt)]">Challenge</span>
            <span className="font-medium">{scene.challenge.title}</span>
            <span className="text-sm text-[var(--muted)]">{scene.challenge.goal}</span>
            <span className={`ml-auto text-sm font-medium ${challenge?.done ? "text-[var(--good)]" : ""}`}>{challenge ? `${challenge.done ? "✓ " : ""}${challenge.hint}` : "Run it to test your answer."}</span>
          </div>
        )}
        {!run.ok && <div role="alert" className="rounded-xl border border-[var(--bad)] bg-[#2A1517] px-4 py-3 text-sm">These settings push the model outside what it can simulate: {run.error}</div>}

        {placed.length > 0 && <Diagram model={model} run={run} t={t} frame={clock} colors={colors} units={units} />}

        {(model.particles || model.gauges.length > 0) && (
          <div className={`grid gap-3 ${model.particles ? "sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)]" : ""}`}>
            {model.particles && <Particles model={model} run={run} t={t} frame={clock} />}
            {model.gauges.length > 0 && (
              <div className="flex flex-wrap content-start gap-3">
                {model.gauges.map(g => <Gauge key={g.what} label={g.label} value={valueAt(run, g.what, t)} min={g.min} max={g.max} unit={units[g.what] ?? ""} />)}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {playing
            ? <button onClick={() => setPlaying(false)} className="rounded-xl border border-[var(--line)] bg-[var(--raise)] px-5 py-2.5 font-semibold">Pause</button>
            : <button onClick={go} disabled={!run.ok} className="rounded-xl bg-[var(--flow)] px-5 py-2.5 font-semibold text-[var(--ink)] hover:brightness-110 disabled:opacity-50">{t > 0 && t < model.duration ? "Resume" : "Run"}</button>}
          <button onClick={reset} className="rounded-xl border border-[var(--line)] bg-[var(--raise)] px-4 py-2.5 text-sm">Reset</button>
          <span className="font-mono text-sm text-[var(--muted)]">{num(t)} / {num(model.duration)} {unit}</span>
          <div role="group" aria-label="Playback speed" className="ml-auto flex rounded-lg border border-[var(--line)] p-0.5">
            {SPEEDS.map(v => (
              <button key={v} onClick={() => setSpeed(v)} aria-pressed={speed === v}
                className={`rounded-md px-2.5 py-1 font-mono text-xs ${speed === v ? "bg-[var(--raise)] text-[var(--fg)]" : "text-[var(--muted)]"}`}>{v}×</button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {scene.graph.map(id => <MiniGraph key={id} run={run} id={id} t={t} label={labels[id] ?? id} unit={units[id] ?? ""} color={colors[id]} timeUnit={unit} duration={model.duration} />)}
        </div>
        <p className="text-right font-mono text-xs text-[var(--muted)]">Truth · AI-written model, run by the engine · RK4 · checked against {model.facts.length} facts</p>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          {model.settings.map(s => {
            const locked = !scene.editable.includes(s.id);
            const toggle = s.min === 0 && s.max === 1 && s.step === 1;
            return toggle ? (
              <label key={s.id} className={`flex items-center justify-between text-sm ${locked ? "opacity-50" : ""}`}>
                <span>{s.label.replace(/\s*\((1|on)[^)]*\)\s*$/i, "")}{locked && <span className="ml-1.5 text-xs text-[var(--muted)]">(locked)</span>}</span>
                <input type="checkbox" checked={values[s.id] === 1} disabled={locked} onChange={e => set(s.id, e.target.checked ? 1 : 0)} className="h-4 w-4 accent-[#7FD8FF]" />
              </label>
            ) : (
              <div key={s.id} className={`flex flex-col gap-1 ${locked ? "opacity-50" : ""}`}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <label htmlFor={`m-${s.id}`}>{s.label}{locked && <span className="ml-1.5 text-xs text-[var(--muted)]">(locked)</span>}</label>
                  <span className="shrink-0 font-mono tabular-nums text-[var(--volt)]">{num(values[s.id])}{s.unit ? ` ${s.unit}` : ""}</span>
                </div>
                <input id={`m-${s.id}`} type="range" min={s.min} max={s.max} step={s.step} value={values[s.id]} disabled={locked}
                  onChange={e => set(s.id, Number(e.target.value))} className="w-full accent-[#7FD8FF]" />
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Live readings</h2>
          {main.map(x => <Reading key={x.id} label={x.label} value={`${num(valueAt(run, x.id, t))} ${x.unit}`} color={colors[x.id]} />)}
          {extra.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--muted)]">More readings ({extra.length})</summary>
              <div className="mt-2 flex flex-col gap-2">
                {extra.map(x => <Reading key={x.id} label={x.label} value={`${num(valueAt(run, x.id, t))} ${x.unit}`} color={colors[x.id]} />)}
              </div>
            </details>
          )}
        </div>

        <details className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">How this model was checked</summary>
          <p className="mt-2 text-[var(--muted)]">The engine ran the model and confirmed it reproduces these:</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {model.facts.map((f, i) => <li key={i} className="flex gap-2"><span className="text-[var(--good)]">✓</span><span>{f.claim}</span></li>)}
            {model.comparisons.map((f, i) => <li key={`c${i}`} className="flex gap-2"><span className="text-[var(--good)]">✓</span><span>{f.claim}</span></li>)}
          </ul>
          <p className="mt-3 text-[var(--muted)]"><span className="font-medium text-[var(--fg)]">What it leaves out:</span> {model.simplifications}</p>
        </details>
      </aside>
    </div>
  );
}

function Reading({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="shrink-0 font-mono text-[15px] font-medium tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

/* ---------------- diagram ---------------- */

type P = { x: number; y: number };

/** Push overlapping boxes apart (the AI's positions are a sketch, not exact). */
function separate(points: Map<string, P>, bw: number, bh: number, W: number, H: number) {
  const ids = [...points.keys()], gapX = bw + 100, gapY = bh + 76;
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = points.get(ids[i])!, b = points.get(ids[j])!;
      const dx = b.x - a.x, dy = b.y - a.y, ox = gapX - Math.abs(dx), oy = gapY - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        moved = true;
        // Separate along the axis that needs the smaller push.
        if (ox / gapX < oy / gapY) { const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 1); a.x -= s; b.x += s; }
        else { const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 1); a.y -= s; b.y += s; }
      }
    }
    for (const p of points.values()) { p.x = Math.min(W - bw / 2 - 12, Math.max(bw / 2 + 12, p.x)); p.y = Math.min(H - bh / 2 - 12, Math.max(bh / 2 + 12, p.y)); }
    if (!moved) break;
  }
}

function Diagram({ model, run, t, frame, colors, units }: { model: ModelSpecDef; run: ModelRun; t: number; frame: number; colors: Record<string, string>; units: Record<string, string> }) {
  const onDiagram = model.stocks.filter(s => s.x !== null && s.y !== null);
  const n = onDiagram.length;
  const W = 900, H = n > 4 ? 480 : 400;
  const BW = n <= 3 ? 170 : n <= 5 ? 150 : 132, BH = n <= 3 ? 90 : n <= 5 ? 80 : 72;
  const pos = (s: ModelSpecDef["stocks"][number]) => ({ x: 20 + BW / 2 + (s.x! / 100) * (W - 40 - BW), y: 20 + BH / 2 + (s.y! / 100) * (H - 40 - BH) });
  const placed = new Map(onDiagram.map(s => [s.id, pos(s)]));
  separate(placed, BW, BH, W, H);
  const maxFlow = Math.max(1e-12, ...model.flows.flatMap(f => run.series[f.id]?.map(Math.abs) ?? []));

  // Where a flow starts and ends: box edges, or an "outside" point near the box.
  const edge = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    const s = Math.min(Math.abs(dx) > 1e-6 ? (BW / 2 + 6) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? (BH / 2 + 6) / Math.abs(dy) : Infinity);
    return { x: from.x + dx * s, y: from.y + dy * s };
  };
  const outside = (p: P, k: number) => {
    const order = p.y < H / 2 ? [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0.7, y: -0.7 }, { x: -0.7, y: -0.7 }] : [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0.7, y: 0.7 }, { x: -0.7, y: 0.7 }];
    const d = order[k % order.length];
    return { x: Math.min(W - 24, Math.max(24, p.x + d.x * (BW / 2 + 70))), y: Math.min(H - 20, Math.max(20, p.y + d.y * (BH / 2 + 60))) };
  };

  // Each stock's flows to/from outside take turns around it so they don't overlap.
  const outUsed = new Map<string, number>();
  const pairCount = new Map<string, number>(), pairSeen = new Map<string, number>();
  const pairKey = (f: ModelSpecDef["flows"][number]) => [f.from ?? `out:${f.to}`, f.to ?? `out:${f.from}`].sort().join("|");
  for (const f of model.flows) pairCount.set(pairKey(f), (pairCount.get(pairKey(f)) ?? 0) + 1);
  const flows = model.flows.map(f => {
    const a = f.from ? placed.get(f.from) : undefined, b = f.to ? placed.get(f.to) : undefined;
    if ((f.from && !a) || (f.to && !b)) return null; // an end is off the diagram
    const host = (f.from ?? f.to)!, k = outUsed.get(host) ?? 0;
    if (!a || !b) outUsed.set(host, k + 1);
    const pa = a ?? outside(b!, k), pb = b ?? outside(a!, k);
    let p0 = a ? edge(a, pb) : pa, p1 = b ? edge(b, pa) : pb;
    // Fan out flows that share the same two ends.
    const key = pairKey(f), total = pairCount.get(key)!, idx = pairSeen.get(key) ?? 0;
    pairSeen.set(key, idx + 1);
    if (total > 1) {
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, nx = -(p1.y - p0.y) / len, ny = (p1.x - p0.x) / len;
      const off = (idx - (total - 1) / 2) * 30;
      p0 = { x: p0.x + nx * off, y: p0.y + ny * off }; p1 = { x: p1.x + nx * off, y: p1.y + ny * off };
    }
    return { f, p0, p1, cloud0: !a, cloud1: !b };
  }).filter(Boolean) as { f: ModelSpecDef["flows"][number]; p0: P; p1: P; cloud0: boolean; cloud1: boolean }[];
  const crowded = flows.length > 7;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[radial-gradient(120%_90%_at_50%_0%,#152039_0%,var(--ink)_70%)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Diagram at ${num(t)} ${model.time_unit}`}>
        <defs><marker id="m-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#55617D" /></marker></defs>
        {flows.map(({ f, p0, p1, cloud0, cloud1 }) => {
          const r = valueAt(run, f.id, t), mag = Math.abs(r) / maxFlow, dir = r >= 0 ? 1 : -1;
          const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const dots = Math.max(2, Math.round(len / 45));
          const phase = (frame * (0.15 + 0.85 * mag) * 0.8) % 1;
          const color = colors[f.id];
          // Label beside the line, not on it.
          const nx = -(p1.y - p0.y) / (len || 1), ny = (p1.x - p0.x) / (len || 1), side = ny > 0 ? -1 : 1;
          const mid = { x: (p0.x + p1.x) / 2 + nx * 10 * side, y: (p0.y + p1.y) / 2 + ny * 10 * side };
          const opp = { x: (p0.x + p1.x) / 2 - nx * 20 * side, y: (p0.y + p1.y) / 2 - ny * 20 * side + 4 };
          return (
            <g key={f.id}>
              {cloud0 && <circle cx={p0.x} cy={p0.y} r={12} fill="none" stroke="#3A4868" strokeDasharray="3 3" />}
              {cloud1 && <circle cx={p1.x} cy={p1.y} r={12} fill="none" stroke="#3A4868" strokeDasharray="3 3" />}
              <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#3A4868" strokeWidth={2 + 4 * mag} markerEnd="url(#m-arrow)" />
              {mag > 0.002 && Array.from({ length: dots }, (_, i) => {
                let u = (i / dots + phase) % 1; if (dir < 0) u = 1 - u;
                return <circle key={i} cx={p0.x + (p1.x - p0.x) * u} cy={p0.y + (p1.y - p0.y) * u} r={3 + 2 * mag} fill={color} opacity={0.9} />;
              })}
              <title>{`${f.label}: ${num(r)} ${units[f.id]}`}</title>
              <text x={mid.x} y={mid.y - 8} textAnchor="middle" className="text-[11px]" fill={color} stroke="#0a0f1c" strokeWidth={3} paintOrder="stroke">{f.label.length > 20 ? `${f.label.slice(0, 19)}…` : f.label}</text>
              {!crowded && <text x={opp.x} y={opp.y} textAnchor="middle" className="fill-[var(--muted)] font-mono text-[10px]" stroke="#0a0f1c" strokeWidth={3} paintOrder="stroke">{num(r)} {units[f.id]}</text>}
            </g>
          );
        })}
        {model.stocks.filter(s => placed.has(s.id)).map(s => {
          const p = placed.get(s.id)!, v = valueAt(run, s.id, t), series = run.series[s.id] ?? [];
          const lo = Math.min(s.min ?? 0, ...series), hi = s.max ?? Math.max(...series, lo + 1e-9) * 1.1;
          const frac = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)));
          return (
            <g key={s.id}>
              <rect x={p.x - BW / 2} y={p.y - BH / 2} width={BW} height={BH} rx={14} fill="#131B2E" stroke="#3A4868" strokeWidth={1.5} />
              <rect x={p.x - BW / 2 + 3} y={p.y + BH / 2 - 3 - (BH - 6) * frac} width={BW - 6} height={(BH - 6) * frac} rx={11} fill={colors[s.id]} opacity={0.28} />
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="fill-[var(--fg)] text-[12px] font-medium">{s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label}</text>
              <text x={p.x} y={p.y + 16} textAnchor="middle" className="font-mono text-[14px] font-semibold" fill={colors[s.id]}>{num(v)} {s.unit}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------- particles ---------------- */

function Particles({ model, run, t, frame }: { model: ModelSpecDef; run: ModelRun; t: number; frame: number }) {
  const W = 300, H = 240, MAX = 40;
  const p = model.particles!;
  const speedSeries = p.speed ? run.series[p.speed] ?? [] : [];
  const speedNow = p.speed ? valueAt(run, p.speed, t) : 1;
  const speedMax = p.speed ? Math.max(...speedSeries.map(Math.abs), 1e-9) : 1;
  const factor = p.speed ? 0.25 + 0.75 * Math.sqrt(Math.max(0, speedNow) / speedMax) : 0.6;
  // Positions follow from time in closed form (bouncing in a box), so frames stay deterministic.
  const bounce = (x0: number, v: number, L: number) => { const d = ((x0 + v) % (2 * L) + 2 * L) % (2 * L); return d > L ? 2 * L - d : d; };
  const motion = frame * 40 * factor;
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[#0E1526]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Particle view">
        {p.species.map((sp, si) => {
          const series = run.series[sp.what] ?? [];
          const hi = Math.max(...series.map(Math.abs), 1e-9);
          const n = Math.round((Math.max(0, valueAt(run, sp.what, t)) / hi) * MAX);
          return Array.from({ length: n }, (_, i) => {
            const h = (k: number) => { let x = Math.imul(i + 1 + si * 977, 2654435761) ^ Math.imul(k + 7, 40503); x = Math.imul(x ^ (x >>> 15), 2246822519); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };
            const ang = h(3) * Math.PI * 2;
            return <circle key={`${si}-${i}`} cx={6 + bounce(h(1) * (W - 12), Math.cos(ang) * motion * (0.6 + h(4)), W - 12)} cy={6 + bounce(h(2) * (H - 12), Math.sin(ang) * motion * (0.6 + h(4)), H - 12)} r={4.5} fill={PARTICLE[sp.color]} opacity={0.9} />;
          });
        })}
      </svg>
      <div className="flex flex-wrap gap-3 border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
        {p.species.map(sp => <span key={sp.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PARTICLE[sp.color] }} />{sp.label}</span>)}
      </div>
    </div>
  );
}

/* ---------------- gauge & graph ---------------- */

function Gauge({ label, value, min, max, unit }: { label: string; value: number; min: number; max: number; unit: string }) {
  const f = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const a = Math.PI * (1 - f), r = 38, cx = 50, cy = 48;
  return (
    <div className="flex min-w-[140px] flex-1 flex-col items-center rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
      <svg viewBox="0 0 100 58" className="w-full max-w-[160px]" role="img" aria-label={`${label}: ${num(value)} ${unit}`}>
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#243150" strokeWidth={8} strokeLinecap="round" />
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)}`} fill="none" stroke="#7FD8FF" strokeWidth={8} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={cx + (r - 10) * Math.cos(a)} y2={cy - (r - 10) * Math.sin(a)} stroke="#EEF2FA" strokeWidth={2} />
      </svg>
      <span className="font-mono text-base font-semibold tabular-nums">{num(value)} <span className="text-xs text-[var(--muted)]">{unit}</span></span>
      <span className="text-xs text-[var(--muted)]">{label}</span>
    </div>
  );
}

function MiniGraph({ run, id, t, label, unit, color, timeUnit, duration }: { run: ModelRun; id: string; t: number; label: string; unit: string; color: string; timeUnit: string; duration: number }) {
  const GW = 400, GH = 170, m = { l: 46, r: 10, t: 10, b: 24 };
  const v = run.series[id] ?? [], ts = run.t;
  const lo0 = Math.min(...v), hi0 = Math.max(...v);
  const pad = (hi0 - lo0) * 0.08 || Math.abs(hi0) * 0.1 || 1;
  const lo = lo0 >= 0 && lo0 - pad < 0 ? 0 : lo0 - pad, hi = hi0 + pad;
  const gx = (x: number) => m.l + (x / duration) * (GW - m.l - m.r), gy = (y: number) => m.t + (1 - (y - lo) / (hi - lo || 1)) * (GH - m.t - m.b);
  const d = (upto: number) => ts.map((x, i) => (x <= upto ? `${i ? "L" : "M"}${gx(x).toFixed(1)} ${gy(v[i]).toFixed(1)}` : "")).join("");
  const ys = niceStep(hi - lo), xs = niceStep(duration, 4);
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm"><span style={{ color }}>{label}</span><span className="font-mono text-xs text-[var(--muted)]">{unit}</span></div>
      <svg viewBox={`0 0 ${GW} ${GH}`} className="block h-auto w-full" role="img" aria-label={`${label} over time`}>
        {Array.from({ length: Math.floor((hi - lo) / ys) + 2 }, (_, i) => Math.ceil(lo / ys) * ys + i * ys).filter(y => y <= hi).map(y => (
          <g key={y}><line x1={m.l} x2={GW - m.r} y1={gy(y)} y2={gy(y)} stroke="rgba(160,180,220,0.08)" /><text x={m.l - 5} y={gy(y) + 3} textAnchor="end" className="fill-[var(--dim)] font-mono text-[10px]">{num(y)}</text></g>
        ))}
        {Array.from({ length: Math.floor(duration / xs) + 1 }, (_, i) => i * xs).map(x => <text key={x} x={gx(x)} y={GH - 6} textAnchor="middle" className="fill-[var(--dim)] font-mono text-[10px]">{num(x)}</text>)}
        <text x={m.l - 5} y={GH - 6} textAnchor="end" className="fill-[var(--muted)] font-mono text-[9px]">{timeUnit.slice(0, 3)}</text>
        <path d={d(Infinity)} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={2} />
        <path d={d(t)} fill="none" stroke={color} strokeWidth={2.2} />
        <line x1={gx(t)} x2={gx(t)} y1={m.t} y2={GH - m.b} stroke="var(--fg)" strokeOpacity={0.5} strokeDasharray="3 3" />
      </svg>
    </div>
  );
}
