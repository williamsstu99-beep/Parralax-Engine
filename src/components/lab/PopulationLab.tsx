"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mark, Wordmark } from "@/components/brand/Mark";
import {
  POP_PARAMS, POP_SAMPLES, canEditPop, evalPopChallenge,
  type PopParam, type PopParamDef, type PopScene,
} from "@/engine/lens/population/model";
import { solvePopulation, type PopSample, type PopulationResult, type PopulationSetup } from "@/engine/truth/population/solver";

const SPEEDS = [2, 5, 10, 20]; // years per second
const PREY = "#E8C27A", PRED = "#FF7A6B";

const count = (n: number) => (n >= 1000 ? Math.round(n).toLocaleString("en-NZ") : n >= 10 ? n.toFixed(0) : n.toFixed(1));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function niceStep(span: number, ticks = 5) {
  const raw = span / ticks, p = 10 ** Math.floor(Math.log10(raw || 1)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

function at(r: PopulationResult, t: number): PopSample {
  const s = r.samples;
  if (t <= 0) return s[0];
  if (t >= s[s.length - 1].t) return s[s.length - 1];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid].t <= t) lo = mid; else hi = mid; }
  const a = s[lo], b = s[hi], f = (t - a.t) / (b.t - a.t || 1);
  return { t, prey: a.prey + (b.prey - a.prey) * f, predators: a.predators + (b.predators - a.predators) * f };
}

/* ---------------- component ---------------- */

export default function PopulationLab({ initial, embedded = false, onSetupChange }: { initial?: PopScene; embedded?: boolean; onSetupChange?: (s: PopulationSetup) => void }) {
  const [sceneId, setSceneId] = useState(initial?.id ?? POP_SAMPLES[0].id);
  const scene = initial ?? POP_SAMPLES.find(s => s.id === sceneId)!;
  const [setup, setSetup] = useState<PopulationSetup>(() => ({ ...scene.setup }));
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ran, setRan] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [view, setView] = useState<"time" | "phase">("time");

  const result = useMemo(() => solvePopulation(setup), [setup]);
  const cur = at(result, t);
  const names = scene.names;
  const hasPred = setup.predators > 0;
  useEffect(() => { onSetupChange?.(setup); }, [setup, onSetupChange]);

  const tRef = useRef(0);
  useEffect(() => { tRef.current = t; }, [t]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(setup.years, tRef.current + ((now - last) / 1000) * speed);
      last = now; tRef.current = next; setT(next);
      if (next >= setup.years) { setPlaying(false); setRan(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, setup.years]);

  const change = (patch: Partial<PopulationSetup>) => { setSetup(s => ({ ...s, ...patch })); setT(0); setPlaying(false); setRan(false); };
  const run = () => { if (t >= setup.years) setT(0); setRan(false); setPlaying(true); };
  const reset = () => { setSetup({ ...scene.setup }); setT(0); setPlaying(false); setRan(false); };
  const load = (id: string) => { const sc = POP_SAMPLES.find(s => s.id === id)!; setSceneId(id); setSetup({ ...sc.setup }); setT(0); setPlaying(false); setRan(false); };
  const challenge = scene.challenge && ran ? evalPopChallenge(scene.challenge, result, names) : null;

  return (
    <div className={`flex flex-col text-[var(--fg)] ${embedded ? "" : "min-h-screen bg-[var(--ink)]"}`}>
      {!embedded && (
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--line)] px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-[19px]"><Mark size={28} /><Wordmark /></Link>
          <span className="hidden text-[var(--muted)] sm:inline">/</span>
          <span className="font-medium">Populations lab</span>
          <div className="ml-auto">
            <label htmlFor="pop-sample" className="sr-only">Load a scene</label>
            <select id="pop-sample" value={sceneId} onChange={e => load(e.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--raise)] px-3 py-2 text-sm">
              {POP_SAMPLES.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
        </header>
      )}

      <div className={`grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] ${embedded ? "" : "p-4 sm:p-6"}`}>
        <section className="flex min-w-0 flex-col gap-3">
          {scene.challenge && (
            <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 ${challenge?.done ? "border-[var(--good)] bg-[#12291F]" : "border-[var(--line)] bg-[var(--panel)]"}`}>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--volt)]">Challenge</span>
              <span className="font-medium">{scene.challenge.title}</span>
              <span className="text-sm text-[var(--muted)]">{scene.challenge.goal}</span>
              <span className={`ml-auto text-sm font-medium ${challenge?.done ? "text-[var(--good)]" : ""}`}>{challenge ? `${challenge.done ? "✓ " : ""}${challenge.hint}` : "Run it to test your plan."}</span>
            </div>
          )}

          <Habitat result={result} cur={cur} names={names} hasPred={hasPred} />

          <div className="flex flex-wrap items-center gap-2">
            {playing
              ? <button onClick={() => setPlaying(false)} className="rounded-xl border border-[var(--line)] bg-[var(--raise)] px-5 py-2.5 font-semibold">Pause</button>
              : <button onClick={run} className="rounded-xl bg-[var(--flow)] px-5 py-2.5 font-semibold text-[var(--ink)] hover:brightness-110">{t > 0 && t < setup.years ? "Resume" : "Run"}</button>}
            <button onClick={reset} className="rounded-xl border border-[var(--line)] bg-[var(--raise)] px-4 py-2.5 text-sm">Reset</button>
            <div role="group" aria-label="Years per second" className="ml-auto flex items-center rounded-lg border border-[var(--line)] p-0.5">
              <span className="px-2 text-xs text-[var(--muted)]">years/s</span>
              {SPEEDS.map(v => (
                <button key={v} onClick={() => setSpeed(v)} aria-pressed={speed === v}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs ${speed === v ? "bg-[var(--raise)] text-[var(--fg)]" : "text-[var(--muted)]"}`}>{v}</button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Graph" className="flex rounded-lg border border-[var(--line)] p-0.5">
                {(["time", "phase"] as const).map(v => (
                  <button key={v} onClick={() => setView(v)} aria-pressed={view === v} disabled={v === "phase" && !hasPred}
                    className={`rounded-md px-3 py-1 text-sm disabled:opacity-40 ${view === v ? "bg-[var(--raise)] text-[var(--fg)]" : "text-[var(--muted)]"}`}>{v === "time" ? "Over time" : `${cap(names.prey)} vs ${names.predators}`}</button>
                ))}
              </div>
              <div className="ml-auto flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: PREY }} />{names.prey}</span>
                {hasPred && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: PRED }} />{names.predators}</span>}
              </div>
            </div>
            {view === "phase" && hasPred ? <PhasePlot result={result} t={t} names={names} /> : <TimeGraph result={result} t={t} hasPred={hasPred} />}
          </div>
          <p className="text-right font-mono text-xs text-[var(--muted)]">Truth · logistic growth{hasPred ? " + Lotka–Volterra predation" : ""} · RK4 · {result.samples.length} samples</p>
        </section>

        <aside className="flex flex-col gap-4">
          <Controls scene={scene} setup={setup} names={names} onChange={change} />
          <div className="flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Live counts</h2>
            <Row label="Year" value={cur.t.toFixed(1)} />
            <Row label={cap(names.prey)} value={count(cur.prey)} color={PREY} />
            {hasPred && <Row label={cap(names.predators)} value={count(cur.predators)} color={PRED} />}
            {ran && (
              <div className="mt-2 flex flex-col gap-2 border-t border-[var(--line)] pt-3">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Result</h3>
                <Row label={`Most ${names.prey}`} value={count(result.summary.max.prey)} />
                <Row label={`Fewest ${names.prey}`} value={count(result.summary.min.prey)} />
                {hasPred && <Row label={`Most ${names.predators}`} value={count(result.summary.max.predators)} />}
                {result.summary.cycleYears !== undefined && <Row label="Cycle length" value={`${result.summary.cycleYears.toFixed(1)} years`} />}
                {result.summary.equilibrium && setup.trapping === 0 && setup.harvest === 0 && <Row label="Balance point" value={`${count(result.summary.equilibrium.prey)} / ${count(result.summary.equilibrium.predators)}`} />}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">What&apos;s happening</h2>
            {ran && result.diagnostics.length ? (
              <ul className="flex flex-col gap-2">
                {result.diagnostics.map((d, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-snug">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.severity === "warning" ? "bg-[var(--volt)]" : "bg-[var(--flow)]"}`} />
                    <span>{d.message.replace(/\bprey\b/g, names.prey).replace(/\bpredators\b/g, names.predators)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[var(--muted)]">{scene.summary}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- habitat ---------------- */

/**
 * Deterministic scatter so dots don't jump around between frames. Integer
 * hashing (not Math.sin) so server and browser agree exactly, avoiding
 * hydration mismatches.
 */
const spot = (i: number, salt: number) => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(salt + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

function Habitat({ result, cur, names, hasPred }: { result: PopulationResult; cur: PopSample; names: { prey: string; predators: string }; hasPred: boolean }) {
  const W = 800, H = 230;
  const preyPer = Math.max(1, Math.ceil(Math.max(result.summary.max.prey, result.setup.capacity) / 250));
  const predPer = Math.max(1, Math.ceil(result.summary.max.predators / 50));
  const nPrey = Math.round(cur.prey / preyPer), nPred = Math.round(cur.predators / predPer);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--line)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Year ${cur.t.toFixed(0)}: ${count(cur.prey)} ${names.prey}${hasPred ? `, ${count(cur.predators)} ${names.predators}` : ""}`}>
        <defs>
          <linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#14301F" /><stop offset="1" stopColor="#0E2216" /></linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#field)" />
        {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${spot(i, 9) * W} ${H - 6} q4 -14 8 0`} stroke="#22482F" strokeWidth={2} fill="none" />)}
        {Array.from({ length: nPrey }, (_, i) => <circle key={`p${i}`} cx={16 + spot(i, 1) * (W - 32)} cy={16 + spot(i, 2) * (H - 32)} r={4} fill={PREY} opacity={0.9} />)}
        {Array.from({ length: nPred }, (_, i) => {
          const x = 20 + spot(i, 3) * (W - 40), y = 20 + spot(i, 4) * (H - 40);
          return <path key={`q${i}`} d={`M${x} ${y - 6} L${x + 6} ${y + 5} L${x - 6} ${y + 5}Z`} fill={PRED} stroke="#0a0f1c" strokeWidth={1} />;
        })}
      </svg>
      <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-[rgba(10,15,28,0.75)] px-3 py-2 font-mono text-sm">
        <div className="text-lg font-semibold">Year {cur.t.toFixed(0)}</div>
        <div style={{ color: PREY }}>● {count(cur.prey)} {names.prey}</div>
        {hasPred && <div style={{ color: PRED }}>▲ {count(cur.predators)} {names.predators}</div>}
      </div>
      <div className="pointer-events-none absolute right-3 bottom-2 rounded bg-[rgba(10,15,28,0.6)] px-2 py-1 text-xs text-[var(--muted)]">
        each ● = {preyPer.toLocaleString("en-NZ")} {names.prey}{hasPred ? ` · each ▲ = ${predPer.toLocaleString("en-NZ")} ${names.predators}` : ""}
      </div>
    </div>
  );
}

/* ---------------- graphs ---------------- */

function TimeGraph({ result, t, hasPred }: { result: PopulationResult; t: number; hasPred: boolean }) {
  const GW = 800, GH = 230, m = { l: 56, r: hasPred ? 52 : 16, t: 12, b: 26 };
  const s = result.setup;
  const preyMax = Math.max(result.summary.max.prey, 1) * 1.08, predMax = Math.max(result.summary.max.predators, 1) * 1.08;
  const gx = (tt: number) => m.l + (tt / s.years) * (GW - m.l - m.r);
  const gy = (v: number, max: number) => m.t + (1 - v / max) * (GH - m.t - m.b);
  const path = (get: (p: PopSample) => number, max: number, upto = Infinity) =>
    result.samples.filter(p => p.t <= upto).map((p, i) => `${i ? "L" : "M"}${gx(p.t).toFixed(1)} ${gy(get(p), max).toFixed(1)}`).join("");
  const ps = niceStep(preyMax, 4), qs = niceStep(predMax, 4), ts = niceStep(s.years, 6);
  const controlOn = (s.trapping > 0 || s.harvest > 0) && s.controlStart < s.years;
  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} className="block h-auto w-full" role="img" aria-label="Population numbers over time">
      {controlOn && <>
        <rect x={gx(s.controlStart)} y={m.t} width={gx(s.years) - gx(s.controlStart)} height={GH - m.t - m.b} fill="#6FD39B" opacity={0.06} />
        <text x={gx(s.controlStart) + 6} y={m.t + 12} className="fill-[var(--good)] text-[11px]">control on</text>
      </>}
      {Array.from({ length: Math.floor(preyMax / ps) + 1 }, (_, i) => i * ps).map(v => (
        <g key={`p${v}`}><line x1={m.l} x2={GW - m.r} y1={gy(v, preyMax)} y2={gy(v, preyMax)} stroke="rgba(160,180,220,0.08)" />
          <text x={m.l - 6} y={gy(v, preyMax) + 4} textAnchor="end" className="font-mono text-[10px]" fill={PREY}>{v >= 10000 ? `${+(v / 1000).toFixed(1)}k` : +v.toFixed(2)}</text></g>
      ))}
      {hasPred && Array.from({ length: Math.floor(predMax / qs) + 1 }, (_, i) => i * qs).map(v => (
        <text key={`q${v}`} x={GW - m.r + 6} y={gy(v, predMax) + 4} className="font-mono text-[10px]" fill={PRED}>{v >= 10000 ? `${+(v / 1000).toFixed(1)}k` : +v.toFixed(2)}</text>
      ))}
      {Array.from({ length: Math.floor(s.years / ts) + 1 }, (_, i) => i * ts).map(tt => (
        <text key={tt} x={gx(tt)} y={GH - 8} textAnchor="middle" className="fill-[var(--dim)] font-mono text-[10px]">{tt}</text>
      ))}
      <text x={m.l - 6} y={GH - 8} textAnchor="end" className="fill-[var(--muted)] font-mono text-[10px]">yr</text>
      <path d={path(p => p.prey, preyMax)} fill="none" stroke={PREY} strokeOpacity={0.22} strokeWidth={2} />
      <path d={path(p => p.prey, preyMax, t)} fill="none" stroke={PREY} strokeWidth={2.4} />
      {hasPred && <>
        <path d={path(p => p.predators, predMax)} fill="none" stroke={PRED} strokeOpacity={0.22} strokeWidth={2} />
        <path d={path(p => p.predators, predMax, t)} fill="none" stroke={PRED} strokeWidth={2.4} />
      </>}
      <line x1={gx(t)} x2={gx(t)} y1={m.t} y2={GH - m.b} stroke="var(--fg)" strokeOpacity={0.5} strokeDasharray="3 3" />
    </svg>
  );
}

function PhasePlot({ result, t, names }: { result: PopulationResult; t: number; names: { prey: string; predators: string } }) {
  const GW = 800, GH = 300, m = { l: 60, r: 20, t: 14, b: 34 };
  const xMax = Math.max(result.summary.max.prey, 1) * 1.08, yMax = Math.max(result.summary.max.predators, 1) * 1.08;
  const gx = (v: number) => m.l + (v / xMax) * (GW - m.l - m.r), gy = (v: number) => m.t + (1 - v / yMax) * (GH - m.t - m.b);
  const pts = result.samples.filter(p => p.t <= t);
  const d = (ps: PopSample[]) => ps.map((p, i) => `${i ? "L" : "M"}${gx(p.prey).toFixed(1)} ${gy(p.predators).toFixed(1)}`).join("");
  const here = at(result, t), eq = result.summary.equilibrium;
  const xs = niceStep(xMax, 5), ys = niceStep(yMax, 4);
  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} className="block h-auto w-full" role="img" aria-label={`${names.predators} against ${names.prey}`}>
      {Array.from({ length: Math.floor(xMax / xs) + 1 }, (_, i) => i * xs).map(v => <text key={v} x={gx(v)} y={GH - 14} textAnchor="middle" className="font-mono text-[10px]" fill={PREY}>{v >= 10000 ? `${+(v / 1000).toFixed(1)}k` : +v.toFixed(2)}</text>)}
      {Array.from({ length: Math.floor(yMax / ys) + 1 }, (_, i) => i * ys).map(v => <g key={v}><line x1={m.l} x2={GW - m.r} y1={gy(v)} y2={gy(v)} stroke="rgba(160,180,220,0.08)" /><text x={m.l - 6} y={gy(v) + 4} textAnchor="end" className="font-mono text-[10px]" fill={PRED}>{+v.toFixed(2)}</text></g>)}
      <text x={(GW + m.l) / 2} y={GH - 2} textAnchor="middle" className="fill-[var(--muted)] text-[11px]">{names.prey}</text>
      <text x={14} y={GH / 2} transform={`rotate(-90 14 ${GH / 2})`} textAnchor="middle" className="fill-[var(--muted)] text-[11px]">{names.predators}</text>
      <path d={d(result.samples)} fill="none" stroke="#9C8CFF" strokeOpacity={0.2} strokeWidth={2} />
      <path d={d(pts)} fill="none" stroke="#9C8CFF" strokeWidth={2.2} />
      {eq && <g><circle cx={gx(eq.prey)} cy={gy(eq.predators)} r={5} fill="none" stroke="var(--good)" strokeWidth={2} /><text x={gx(eq.prey) + 9} y={gy(eq.predators) - 7} className="fill-[var(--good)] text-[11px]">balance point</text></g>}
      <circle cx={gx(here.prey)} cy={gy(here.predators)} r={6} fill="#FFD678" stroke="#0a0f1c" />
    </svg>
  );
}

/* ---------------- controls ---------------- */

function LogSlider({ id, def, value, disabled, onChange }: { id: string; def: PopParamDef; value: number; disabled: boolean; onChange: (v: number) => void }) {
  // Position 0..1000 maps onto min..max logarithmically; a zero minimum gets its own notch at 0.
  const lo = Math.max(def.min, 1), span = Math.log(def.max / lo);
  const zero = def.min === 0;
  const toPos = (v: number) => (zero && v <= 0 ? 0 : Math.round((zero ? 10 : 0) + (Math.log(Math.max(v, lo) / lo) / span) * (zero ? 990 : 1000)));
  const fromPos = (p: number) => (zero && p < 10 ? 0 : Math.round(lo * Math.exp((((p - (zero ? 10 : 0)) / (zero ? 990 : 1000))) * span)));
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id}>{def.label}{disabled && <span className="ml-1.5 text-xs text-[var(--muted)]">(locked)</span>}</label>
        <span className="font-mono tabular-nums text-[var(--volt)]">{count(value)}</span>
      </div>
      <input id={id} type="range" min={0} max={1000} step={1} value={toPos(value)} disabled={disabled} onChange={e => onChange(fromPos(Number(e.target.value)))} className="w-full accent-[#7FD8FF]" />
    </div>
  );
}

function Slider({ id, def, value, disabled, onChange }: { id: string; def: PopParamDef; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id}>{def.label}{disabled && <span className="ml-1.5 text-xs text-[var(--muted)]">(locked)</span>}</label>
        <span className="font-mono tabular-nums text-[var(--volt)]">{def.percent ? `${Math.round(value * 100)}%` : +value.toFixed(3)}{def.unit && !def.percent ? ` ${def.unit}` : def.percent ? " a year" : ""}</span>
      </div>
      <input id={id} type="range" min={def.min} max={def.max} step={def.step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} className="w-full accent-[#7FD8FF]" />
    </div>
  );
}

const ORDER: PopParam[] = ["prey", "growth", "capacity", "predators", "hunting", "conversion", "predatorDeath", "harvest", "trapping", "controlStart", "years"];

function Controls({ scene, setup, names, onChange }: { scene: PopScene; setup: PopulationSetup; names: { prey: string; predators: string }; onChange: (p: Partial<PopulationSetup>) => void }) {
  const label = (p: PopParam, def: PopParamDef): PopParamDef => ({
    ...def,
    label: def.label.replace("prey", names.prey).replace("Prey", cap(names.prey)).replace("predators", names.predators).replace("Predators", cap(names.predators)).replace("predator", names.predators.replace(/s$/, "")).replace("Predator", cap(names.predators.replace(/s$/, ""))),
  });
  const shown = ORDER.filter(p => !(POP_PARAMS[p].predatorOnly && setup.predators <= 0 && p !== "predators" && !canEditPop(scene, "predators")));
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 className="text-lg font-semibold">Settings</h2>
      {shown.map(p => {
        const def = label(p, POP_PARAMS[p]);
        const Comp = def.log ? LogSlider : Slider;
        return <Comp key={p} id={`pop-${p}`} def={def} value={setup[p]} disabled={!canEditPop(scene, p)} onChange={v => onChange({ [p]: v })} />;
      })}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="font-mono text-[15px] font-medium tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}
