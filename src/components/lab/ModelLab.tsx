"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelSceneDef, ModelSpecDef } from "@/engine/spec/lesson";
import { evalModelChallenge, labelsOf, modelDef } from "@/engine/spec/model";
import { compileModel, runModel, type ModelRun } from "@/engine/truth/model/solver";
import ChallengeBanner from "./ChallengeBanner";

/* ---------------- helpers ---------------- */

const SPEEDS = [0.5, 1, 2, 4];
const RUN_SECONDS = 10; // a full run takes 10 s at 1×
const PALETTE = ["#6EE7FF", "#FFB547", "#5EEAD4", "#FF7A85", "#A78BFA", "#FDE047", "#60A5FA", "#F0ABFC"];
const PARTICLE: Record<string, string> = { blue: "#60A5FA", orange: "#FFB547", green: "#5EEAD4", red: "#FF7A85", purple: "#A78BFA", yellow: "#FDE047" };

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

/** The element's rendered width, so SVGs can draw at real pixel size (crisp, readable text on phones). */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
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
  const scrub = (v: number) => { setPlaying(false); setT(v); if (v >= model.duration) setRan(true); };
  const challenge = scene.challenge && ran ? evalModelChallenge(scene.challenge, run, labels, model.time_unit) : null;
  const placed = model.stocks.filter(s => s.x !== null && s.y !== null);
  const views = [...(placed.length ? ["system" as const] : []), ...(model.particles ? ["particles" as const] : [])];
  const [view, setView] = useState<"system" | "particles">(views[0] ?? "system");
  // Readouts: gauges if the model has them, otherwise the first stocks.
  const stats = (model.gauges.length ? model.gauges.map(g => ({ id: g.what, label: g.label, min: g.min, max: g.max })) : model.stocks.slice(0, 3).map(s => ({ id: s.id, label: s.label, min: s.min ?? 0, max: s.max ?? Math.max(...(run.series[s.id] ?? [1])) }))).slice(0, 3);
  const editable = model.settings.filter(s => scene.editable.includes(s.id));
  const locked = model.settings.filter(s => !scene.editable.includes(s.id));
  // Readings list only what isn't already on screen (diagram boxes and readouts show the rest).
  const onStage = new Set([...(view === "system" ? placed.map(s => s.id) : []), ...stats.map(g => g.id)]);
  const readings = [...model.stocks, ...model.variables].filter(x => (model.stocks.includes(x as ModelSpecDef["stocks"][number]) || scene.graph.includes(x.id)) && !onStage.has(x.id));
  const unit = model.time_unit;

  return (
    <div className="grid gap-5 text-[var(--fg)] lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-w-0 flex-col gap-5">
        {scene.challenge && (
          <ChallengeBanner title={scene.challenge.title} goal={scene.challenge.goal} done={!!challenge?.done} message={challenge ? challenge.hint : "Run it to test your answer."} />
        )}

        <div className="glass relative overflow-hidden rounded-[28px]">
          <div className="flex flex-wrap items-start gap-3 px-4 pt-4 sm:px-5">
            {views.length > 1 && (
              <div role="tablist" aria-label="View" className="hairline flex rounded-full p-1">
                {views.map(v => (
                  <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${view === v ? "bg-white/10 text-[var(--fg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}>{v === "system" ? "System" : "Particles"}</button>
                ))}
              </div>
            )}
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {stats.map((g, i) => <Stat key={g.id} label={g.label} value={valueAt(run, g.id, t)} min={g.min} max={g.max} unit={units[g.id] ?? ""} color={colors[g.id]} delay={0.5 + i * 0.1} />)}
            </div>
          </div>

          {!run.ok && <div role="alert" className="mx-5 mt-3 rounded-xl border border-[var(--bad)]/40 bg-[rgba(255,122,133,0.08)] px-4 py-2.5 text-sm">These settings push the model outside what it can simulate: {run.error}</div>}

          <div className="px-2 sm:px-4">
            {view === "particles" && model.particles ? <Particles model={model} run={run} t={t} frame={clock} />
              : placed.length > 0 ? <Diagram model={model} run={run} t={t} frame={clock} colors={colors} units={units} />
              : <div className="p-2"><MiniGraph run={run} id={scene.graph[0]} t={t} label={labels[scene.graph[0]] ?? scene.graph[0]} unit={units[scene.graph[0]] ?? ""} color={colors[scene.graph[0]]} timeUnit={unit} duration={model.duration} bare /></div>}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-black/20 px-4 py-3 sm:px-5">
            {playing
              ? <button onClick={() => setPlaying(false)} aria-label="Pause" className="btn-ghost flex h-11 w-11 items-center justify-center rounded-full"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg></button>
              : <button onClick={go} disabled={!run.ok} aria-label={t > 0 && t < model.duration ? "Resume" : "Run"} className="btn-primary flex h-11 items-center gap-2 rounded-full pr-5 pl-4"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>{t > 0 && t < model.duration ? "Resume" : "Run"}</button>}
            <button onClick={reset} aria-label="Reset" title="Reset" className="btn-ghost flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4" /></svg></button>
            <div className="flex min-w-[160px] flex-1 items-center gap-3">
              <label htmlFor="scrub" className="sr-only">Time</label>
              <input id="scrub" type="range" min={0} max={model.duration} step={model.duration / 400} value={t} onChange={e => scrub(Number(e.target.value))}
                className="w-full" style={{ "--fill": `${(t / model.duration) * 100}%` } as React.CSSProperties} />
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--muted)]">{num(t)}<span className="text-[var(--dim)]"> / {num(model.duration)} {unit}</span></span>
            </div>
            <div role="group" aria-label="Playback speed" className="hairline flex rounded-full p-0.5">
              {SPEEDS.map(v => (
                <button key={v} onClick={() => setSpeed(v)} aria-pressed={speed === v}
                  className={`rounded-full px-2.5 py-1 font-mono text-xs ${speed === v ? "bg-white/10 text-[var(--fg)]" : "text-[var(--muted)]"}`}>{v}×</button>
              ))}
            </div>
          </div>
        </div>

        <GraphCard run={run} ids={scene.graph} t={t} labels={labels} units={units} colors={colors} timeUnit={unit} duration={model.duration} />
      </section>

      <aside className="glass flex h-fit flex-col gap-5 rounded-[28px] p-5 lg:sticky lg:top-20">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Your controls</p>
          {editable.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">Nothing to change in this step: run it and watch.</p>}
        </div>
        {editable.map(s => <Control key={s.id} s={s} value={values[s.id]} onChange={v => set(s.id, v)} />)}

        {locked.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-[var(--muted)] hover:text-[var(--fg)]">
              Fixed for this step ({locked.length})<span className="transition-transform group-open:rotate-45">+</span>
            </summary>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {locked.map(s => <li key={s.id} className="flex justify-between gap-3"><span className="text-[var(--muted)]">{toggleLabel(s.label)}</span><span className="shrink-0 font-mono tabular-nums">{isToggle(s) ? (values[s.id] === 1 ? "On" : "Off") : `${num(values[s.id])} ${s.unit}`}</span></li>)}
            </ul>
          </details>
        )}

        {readings.length > 0 && <div className="border-t border-[var(--line)] pt-5">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Readings</p>
          <div className="flex flex-col gap-2.5">
            {readings.map(x => <Reading key={x.id} label={x.label} value={`${num(valueAt(run, x.id, t))} ${x.unit}`} color={colors[x.id]} />)}
          </div>
        </div>}
      </aside>
    </div>
  );
}

const isToggle = (s: { min: number; max: number; step: number }) => s.min === 0 && s.max === 1 && s.step === 1;
const toggleLabel = (label: string) => label.replace(/\s*\((1|on)[^)]*\)\s*$/i, "").replace(/\s*\(\d[^)]*\)\s*or\s.*$/i, "");

function Control({ s, value, onChange }: { s: ModelSpecDef["settings"][number]; value: number; onChange: (v: number) => void }) {
  if (isToggle(s)) {
    const on = value === 1;
    return (
      <button role="switch" aria-checked={on} onClick={() => onChange(on ? 0 : 1)} className="flex items-center justify-between gap-3 text-left text-sm">
        <span>{toggleLabel(s.label)}</span>
        <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--flow)] shadow-[0_0_14px_rgba(110,231,255,0.6)]" : "bg-white/10"}`}>
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
        </span>
      </button>
    );
  }
  const fill = ((value - s.min) / (s.max - s.min || 1)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={`m-${s.id}`}>{s.label}</label>
        <span className="shrink-0 font-mono text-[15px] tabular-nums text-[var(--flow)]">{num(value)}<span className="ml-1 text-xs text-[var(--muted)]">{s.unit}</span></span>
      </div>
      <input id={`m-${s.id}`} type="range" min={s.min} max={s.max} step={s.step} value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full" style={{ "--fill": `${fill}%` } as React.CSSProperties} />
    </div>
  );
}

function Stat({ label, value, min, max, unit, color, delay }: { label: string; value: number; min: number; max: number; unit: string; color: string; delay: number }) {
  const f = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  return (
    <div className="anim-rise min-w-[120px] rounded-2xl bg-black/25 px-3.5 py-2 ring-1 ring-white/5" style={{ animationDelay: `${delay}s` }}>
      <p className="truncate text-[11px] text-[var(--muted)]">{label}</p>
      <p className="font-mono text-lg leading-tight font-semibold tabular-nums" style={{ color }}>{num(value)}<span className="ml-1 text-xs font-normal text-[var(--muted)]">{unit}</span></p>
      <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${f * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }} /></div>
    </div>
  );
}

function GraphCard({ run, ids, t, labels, units, colors, timeUnit, duration }: { run: ModelRun; ids: string[]; t: number; labels: Record<string, string>; units: Record<string, string>; colors: Record<string, string>; timeUnit: string; duration: number }) {
  const [sel, setSel] = useState(ids[0]);
  const id = ids.includes(sel) ? sel : ids[0];
  if (!id) return null;
  return (
    <div className="glass rounded-[28px] p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2 overflow-x-auto">
        <p className="mr-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Over time</p>
        {ids.length > 1 && ids.map(x => (
          <button key={x} onClick={() => setSel(x)} aria-pressed={x === id}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-all ${x === id ? "bg-white/10 text-[var(--fg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: colors[x], boxShadow: x === id ? `0 0 8px ${colors[x]}` : undefined }} />{labels[x] ?? x}
          </button>
        ))}
      </div>
      <MiniGraph key={id} run={run} id={id} t={t} label={labels[id] ?? id} unit={units[id] ?? ""} color={colors[id]} timeUnit={timeUnit} duration={duration} bare />
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
  const [box, width] = useWidth<HTMLDivElement>(900);
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
  // Crop to what's drawn, so a small model doesn't float in empty space.
  const ys = [...[...placed.values()].flatMap(p => [p.y - BH / 2, p.y + BH / 2]), ...flows.flatMap(f => [f.p0.y - 26, f.p1.y + 26, f.p0.y + 26, f.p1.y - 26])];
  const top = Math.max(0, Math.min(...ys) - 24), bottom = Math.min(H, Math.max(...ys) + 24);
  const vbH = Math.max(200, bottom - top), vbY = (top + bottom) / 2 - vbH / 2;

  return (
    <div ref={box} className="overflow-x-auto">
      <svg viewBox={`0 ${vbY} ${W} ${vbH}`} className="block h-auto" style={{ width: Math.max(width, 620) }} role="img" aria-label={`Diagram at ${num(t)} ${model.time_unit}`}>
        <defs>
          <marker id="m-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#7d8aa5" /></marker>
          <filter id="m-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        {/* Build-in: boxes pop in one by one, then the flows draw between them, then things start moving. */}
        {flows.map(({ f, p0, p1, cloud0, cloud1 }, fi) => {
          const delay = 0.25 + n * 0.12 + fi * 0.08;
          const r = valueAt(run, f.id, t), mag = Math.abs(r) / maxFlow, dir = r >= 0 ? 1 : -1;
          const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const dots = Math.max(2, Math.round(len / 45));
          const phase = (frame * (0.15 + 0.85 * mag) * 0.8) % 1;
          const color = colors[f.id];
          // Label beside the line, not on it.
          const nx = -(p1.y - p0.y) / (len || 1), ny = (p1.x - p0.x) / (len || 1), side = ny > 0 ? -1 : 1;
          const mid = { x: (p0.x + p1.x) / 2 + nx * 10 * side, y: (p0.y + p1.y) / 2 + ny * 10 * side };
          const opp = { x: (p0.x + p1.x) / 2 - nx * 20 * side, y: (p0.y + p1.y) / 2 - ny * 20 * side + 4 };
          // On steep lines, put text beside the line rather than centred over it.
          const steep = Math.abs(nx) > 0.6, anchor = (dx: number) => (!steep ? "middle" : dx > 0 ? "start" : "end");
          return (
            <g key={f.id}>
              {cloud0 && <circle cx={p0.x} cy={p0.y} r={11} fill="rgba(255,255,255,0.02)" stroke="#56627c" strokeDasharray="2 4" className="anim-fade" style={{ animationDelay: `${delay}s` }} />}
              {cloud1 && <circle cx={p1.x} cy={p1.y} r={11} fill="rgba(255,255,255,0.02)" stroke="#56627c" strokeDasharray="2 4" className="anim-fade" style={{ animationDelay: `${delay}s` }} />}
              <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} pathLength={1} stroke={color} strokeOpacity={0.18 + 0.4 * mag} strokeWidth={1.5 + 4 * mag} strokeLinecap="round" className="anim-draw" style={{ animationDelay: `${delay}s` }} />
              <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="transparent" markerEnd="url(#m-arrow)" className="anim-fade" style={{ animationDelay: `${delay + 0.6}s` }} />
              <g className="anim-fade" style={{ animationDelay: `${delay + 0.7}s` }}>
                {mag > 0.002 && Array.from({ length: dots }, (_, i) => {
                  let u = (i / dots + phase) % 1; if (dir < 0) u = 1 - u;
                  return <circle key={i} cx={p0.x + (p1.x - p0.x) * u} cy={p0.y + (p1.y - p0.y) * u} r={2.6 + 2.2 * mag} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />;
                })}
                <title>{`${f.label}: ${num(r)} ${units[f.id]}`}</title>
                <text x={mid.x} y={steep ? mid.y + 4 : mid.y - 8} textAnchor={anchor(mid.x - (p0.x + p1.x) / 2)} className="text-[11px] font-medium" fill={color} stroke="#070a12" strokeWidth={4} paintOrder="stroke">{f.label.length > 22 ? `${f.label.slice(0, 21)}…` : f.label}</text>
                {!crowded && <text x={opp.x} y={opp.y} textAnchor={anchor(opp.x - (p0.x + p1.x) / 2)} className="fill-[var(--muted)] font-mono text-[10px]" stroke="#070a12" strokeWidth={4} paintOrder="stroke">{num(r)} {units[f.id]}</text>}
              </g>
            </g>
          );
        })}
        {model.stocks.filter(s => placed.has(s.id)).map((s, si) => {
          const p = placed.get(s.id)!, v = valueAt(run, s.id, t), series = run.series[s.id] ?? [];
          const lo = Math.min(s.min ?? 0, ...series), hi = s.max ?? Math.max(...series, lo + 1e-9) * 1.1;
          const frac = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)));
          const c = colors[s.id], x0 = p.x - BW / 2, y0 = p.y - BH / 2, clip = `clip-${s.id}`;
          return (
            <g key={s.id} className="anim-pop" style={{ animationDelay: `${0.1 + si * 0.12}s` }}>
              <clipPath id={clip}><rect x={x0} y={y0} width={BW} height={BH} rx={16} /></clipPath>
              <rect x={x0} y={y0} width={BW} height={BH} rx={16} fill={c} opacity={0.08 + 0.22 * frac} filter="url(#m-glow)" />
              <rect x={x0} y={y0} width={BW} height={BH} rx={16} fill="#0b111d" />
              {/* The fill level rises and falls with the amount, like liquid in a tank. */}
              <rect x={x0} y={y0 + BH * (1 - frac)} width={BW} height={BH * frac} fill={c} opacity={0.2} clipPath={`url(#${clip})`} />
              <rect x={x0} y={y0 + BH * (1 - frac)} width={BW} height={2} fill={c} opacity={0.7} clipPath={`url(#${clip})`} />
              <rect x={x0} y={y0} width={BW} height={BH} rx={16} fill="none" stroke={c} strokeOpacity={0.35 + 0.35 * frac} strokeWidth={1.2} />
              <text x={p.x} y={p.y - 9} textAnchor="middle" className="fill-[var(--fg)] text-[12px] font-medium" opacity={0.92} stroke="#0b111d" strokeWidth={4} paintOrder="stroke">{s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label}</text>
              <text x={p.x} y={p.y + 17} textAnchor="middle" className="font-mono text-[16px] font-semibold" fill={c} stroke="#0b111d" strokeWidth={4} paintOrder="stroke">{num(v)}<tspan className="fill-[var(--muted)] text-[11px] font-normal"> {s.unit}</tspan></text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------- particles ---------------- */

function Particles({ model, run, t, frame }: { model: ModelSpecDef; run: ModelRun; t: number; frame: number }) {
  const W = 900, H = 380, MAX = 70;
  const p = model.particles!;
  const speedSeries = p.speed ? run.series[p.speed] ?? [] : [];
  const speedNow = p.speed ? valueAt(run, p.speed, t) : 1;
  const speedMax = p.speed ? Math.max(...speedSeries.map(Math.abs), 1e-9) : 1;
  const factor = p.speed ? 0.25 + 0.75 * Math.sqrt(Math.max(0, speedNow) / speedMax) : 0.6;
  // Positions follow from time in closed form (bouncing in a box), so frames stay deterministic.
  const bounce = (x0: number, v: number, L: number) => { const d = ((x0 + v) % (2 * L) + 2 * L) % (2 * L); return d > L ? 2 * L - d : d; };
  const motion = frame * 40 * factor;
  return (
    <div className="anim-fade overflow-hidden rounded-2xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Particle view">
        {p.species.map((sp, si) => {
          const series = run.series[sp.what] ?? [];
          const hi = Math.max(...series.map(Math.abs), 1e-9);
          const n = Math.round((Math.max(0, valueAt(run, sp.what, t)) / hi) * MAX);
          return Array.from({ length: n }, (_, i) => {
            const h = (k: number) => { let x = Math.imul(i + 1 + si * 977, 2654435761) ^ Math.imul(k + 7, 40503); x = Math.imul(x ^ (x >>> 15), 2246822519); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };
            const ang = h(3) * Math.PI * 2;
            return <circle key={`${si}-${i}`} cx={6 + bounce(h(1) * (W - 12), Math.cos(ang) * motion * (0.6 + h(4)), W - 12)} cy={6 + bounce(h(2) * (H - 12), Math.sin(ang) * motion * (0.6 + h(4)), H - 12)} r={5.5} fill={PARTICLE[sp.color]} style={{ filter: `drop-shadow(0 0 5px ${PARTICLE[sp.color]})` }} />;
          });
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-4 px-3 pb-3 text-xs text-[var(--muted)]">
        {p.species.map(sp => <span key={sp.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PARTICLE[sp.color] }} />{sp.label}</span>)}
      </div>
    </div>
  );
}

/* ---------------- graph ---------------- */

function MiniGraph({ run, id, t, label, unit, color, timeUnit, duration }: { run: ModelRun; id: string; t: number; label: string; unit: string; color: string; timeUnit: string; duration: number; bare?: boolean }) {
  const [box, width] = useWidth<HTMLDivElement>(900);
  const GW = Math.max(280, width), GH = Math.round(Math.min(280, Math.max(190, GW * 0.3))), m = { l: 48, r: 12, t: 16, b: 28 };
  const v = run.series[id] ?? [], ts = run.t;
  const lo0 = Math.min(...v), hi0 = Math.max(...v);
  const pad = (hi0 - lo0) * 0.1 || Math.abs(hi0) * 0.1 || 1;
  const lo = lo0 >= 0 && lo0 - pad < 0 ? 0 : lo0 - pad, hi = hi0 + pad;
  const gx = (x: number) => m.l + (x / duration) * (GW - m.l - m.r), gy = (y: number) => m.t + (1 - (y - lo) / (hi - lo || 1)) * (GH - m.t - m.b);
  const pts = ts.map((x, i) => [gx(x), gy(v[i])] as const);
  const upto = pts.filter((_, i) => ts[i] <= t);
  const line = (ps: readonly (readonly [number, number])[]) => ps.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const area = (ps: readonly (readonly [number, number])[]) => ps.length ? `${line(ps)}L${ps[ps.length - 1][0].toFixed(1)} ${GH - m.b}L${ps[0][0].toFixed(1)} ${GH - m.b}Z` : "";
  const ys = niceStep(hi - lo), xs = niceStep(duration, GW < 500 ? 3 : 6);
  const here = { x: gx(Math.min(t, duration)), y: gy(valueAt(run, id, t)) };
  const gid = `g-${id}`;
  return (
    <div ref={box}>
    <svg viewBox={`0 0 ${GW} ${GH}`} className="block h-auto w-full" role="img" aria-label={`${label} over time, in ${unit}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.32} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient>
      </defs>
      {Array.from({ length: Math.floor((hi - lo) / ys) + 2 }, (_, i) => Math.ceil(lo / ys) * ys + i * ys).filter(y => y <= hi).map(y => (
        <g key={y}><line x1={m.l} x2={GW - m.r} y1={gy(y)} y2={gy(y)} stroke="rgba(150,175,230,0.07)" /><text x={m.l - 8} y={gy(y) + 4} textAnchor="end" className="fill-[var(--dim)] font-mono text-[11px]">{num(y)}</text></g>
      ))}
      {Array.from({ length: Math.floor(duration / xs) + 1 }, (_, i) => i * xs).map(x => <text key={x} x={gx(x)} y={GH - 8} textAnchor="middle" className="fill-[var(--dim)] font-mono text-[11px]">{num(x)}</text>)}
      <text x={m.l - 8} y={GH - 8} textAnchor="end" className="fill-[var(--muted)] font-mono text-[10px]">{timeUnit.slice(0, 3)}</text>
      <text x={GW - m.r} y={m.t + 4} textAnchor="end" className="fill-[var(--muted)] font-mono text-[11px]">{unit}</text>
      <path d={line(pts)} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={2} strokeDasharray="4 6" />
      <path d={area(upto)} fill={`url(#${gid})`} />
      <path d={line(upto)} fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      {t > 0 && Number.isFinite(here.y) && <>
        <line x1={here.x} x2={here.x} y1={m.t} y2={GH - m.b} stroke="rgba(255,255,255,0.18)" />
        <circle cx={here.x} cy={here.y} r={5} fill="#fff" style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      </>}
    </svg>
    </div>
  );
}
