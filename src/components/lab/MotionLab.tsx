"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mark, Wordmark } from "@/components/brand/Mark";
import ChallengeBanner from "./ChallengeBanner";
import {
  BODIES, MOTION_SAMPLES, PLANETS, PROJECTILE_PARAMS, RAMP_PARAMS, canEdit, evalChallenge,
  type BodyKind, type MotionParam, type MotionScene, type ParamDef,
} from "@/engine/lens/motion/model";
import { rampForces, solveMotion } from "@/engine/truth/motion/solver";
import { GRAVITY, type MotionResult, type MotionSetup, type Planet, type Sample } from "@/engine/truth/motion/types";

/* ---------------- helpers ---------------- */

const RATES = [0.5, 1, 2, 5, 10];
const W = 800, H = 400, M = { l: 52, r: 20, t: 18, b: 34 };
const PW = W - M.l - M.r, PH = H - M.t - M.b;

function niceStep(span: number, ticks = 6) {
  const raw = span / ticks, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
const fmt = (v: number, unit: string, dp = 1) => `${Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(dp)}${unit ? ` ${unit}` : ""}`;
const fmtJ = (j: number) => (Math.abs(j) >= 10000 ? `${(j / 1000).toFixed(1)} kJ` : `${j.toFixed(Math.abs(j) < 10 ? 2 : 0)} J`);

/** Linear interpolation between samples at time t. */
function sampleAt(r: MotionResult, t: number): Sample {
  const s = r.samples;
  if (t <= s[0].t) return s[0];
  if (t >= s[s.length - 1].t) return s[s.length - 1];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid].t <= t) lo = mid; else hi = mid; }
  const a = s[lo], b = s[hi], f = (t - a.t) / (b.t - a.t || 1);
  const mix = (k: keyof Sample) => a[k] + (b[k] - a[k]) * f;
  return { t, x: mix("x"), y: mix("y"), vx: mix("vx"), vy: mix("vy"), speed: mix("speed"), ke: mix("ke"), gpe: mix("gpe"), lost: mix("lost"), work: mix("work") };
}

interface Trail { pts: [number, number][]; label: string }

/* ---------------- component ---------------- */

export default function MotionLab({ initial, embedded = false, onSetupChange }: { initial?: MotionScene; embedded?: boolean; onSetupChange?: (s: MotionSetup) => void }) {
  const [sceneId, setSceneId] = useState(initial?.id ?? MOTION_SAMPLES[0].id);
  const scene = initial ?? MOTION_SAMPLES.find(s => s.id === sceneId)!;
  const [setup, setSetup] = useState<MotionSetup>(() => structuredClone(scene.setup));
  const [body, setBody] = useState<BodyKind | undefined>(scene.body);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ran, setRan] = useState(false);
  const [rateChoice, setRate] = useState<number | null>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [graph, setGraph] = useState<"height" | "speed" | "energy">("height");

  const result = useMemo(() => solveMotion(setup), [setup]);
  const cur = sampleAt(result, t);
  useEffect(() => { onSetupChange?.(setup); }, [setup, onSetupChange]);

  // Long falls play faster unless the student picks a speed.
  const rate = rateChoice ?? (result.duration > 20 ? 5 : 1);

  /* ---- playback ---- */
  const tRef = useRef(0);
  useEffect(() => { tRef.current = t; }, [t]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(result.duration, tRef.current + ((now - last) / 1000) * rate);
      tRef.current = next;
      last = now;
      setT(next);
      if (next >= result.duration) {
        setPlaying(false);
        setRan(true);
        if (setup.kind === "projectile") {
          const label = `${setup.speed} m/s at ${setup.angle}°${setup.air ? ", air" : ""}${setup.planet !== "earth" ? `, ${PLANETS[setup.planet]}` : ""}`;
          setTrails(ts => [...ts.slice(-2), { pts: result.samples.map(s => [s.x, s.y]), label }]);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, result, setup]);

  const launch = () => { if (t >= result.duration) setT(0); setRan(false); setPlaying(true); };
  const change = (patch: Partial<MotionSetup>) => {
    setSetup(s => ({ ...s, ...patch }) as MotionSetup);
    setT(0); setPlaying(false); setRan(false);
  };
  const pickBody = (b: BodyKind) => { setBody(b); change({ mass: BODIES[b].mass, dragArea: BODIES[b].dragArea }); };
  const reset = () => { setSetup(structuredClone(scene.setup)); setBody(scene.body); setT(0); setPlaying(false); setRan(false); setTrails([]); };
  const load = (id: string) => {
    const sc = MOTION_SAMPLES.find(s => s.id === id)!;
    setSceneId(id); setSetup(structuredClone(sc.setup)); setBody(sc.body); setT(0); setPlaying(false); setRan(false); setTrails([]); setRate(null);
  };

  const challenge = scene.challenge ? (ran ? evalChallenge(scene.challenge, result) : null) : null;
  const verb = setup.kind === "projectile" ? (setup.speed === 0 ? "Drop" : "Launch") : "Release";

  return (
    <div className={`flex flex-col text-[var(--fg)] ${embedded ? "" : "min-h-screen bg-[var(--ink)]"}`}>
      {!embedded && (
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--line)] px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-[19px]"><Mark size={28} /><Wordmark /></Link>
          <span className="hidden text-[var(--muted)] sm:inline">/</span>
          <span className="font-medium">Motion lab</span>
          <div className="ml-auto">
            <label htmlFor="motion-sample" className="sr-only">Load a scene</label>
            <select id="motion-sample" value={sceneId} onChange={e => load(e.target.value)} className="rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm">
              {MOTION_SAMPLES.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
        </header>
      )}

      <div className={`grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] ${embedded ? "" : "p-4 sm:p-6"}`}>
        <section className="flex min-w-0 flex-col gap-3">
          {scene.challenge && (
            <ChallengeBanner title={scene.challenge.title} goal={scene.challenge.goal} done={!!challenge?.done} message={challenge ? challenge.hint : `${verb} to test your answer.`} />
          )}

          <div className="glass anim-fade relative w-full overflow-hidden rounded-[28px]">
            {setup.kind === "projectile"
              ? <ProjectileView result={result} cur={cur} trails={trails} showFull={ran} body={body} />
              : <RampView result={result} cur={cur} />}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {playing
              ? <button onClick={() => setPlaying(false)} className="btn-ghost rounded-full px-5 py-2.5 font-semibold">Pause</button>
              : <button onClick={launch} className="btn-primary rounded-full px-6 py-2.5">{t > 0 && t < result.duration ? "Resume" : verb}</button>}
            <button onClick={reset} className="btn-ghost rounded-full px-4 py-2.5 text-sm">Reset</button>
            <div role="group" aria-label="Playback speed" className="hairline ml-auto flex rounded-full p-0.5">
              {RATES.map(r => (
                <button key={r} onClick={() => setRate(r)} aria-pressed={rate === r}
                  className={`rounded-full px-2.5 py-1 font-mono text-xs ${rate === r ? "bg-white/10 text-[var(--fg)]" : "text-[var(--muted)]"}`}>{r}×</button>
              ))}
            </div>
          </div>

          <Graph result={result} t={t} kind={graph} onKind={setGraph} />
          <p className="text-right font-mono text-xs text-[var(--muted)]">
            Truth · {setup.kind === "projectile" ? (setup.air && result.summary.terminalSpeed ? "RK4 with air resistance" : "exact projectile motion") : "exact constant-acceleration phases"} · {result.samples.length} samples
          </p>
        </section>

        <aside className="flex flex-col gap-4">
          <Controls scene={scene} setup={setup} body={body} onChange={change} onBody={pickBody} />
          <Readouts result={result} cur={cur} ran={ran} />
          <div className="glass rounded-[28px] p-4">
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">What&apos;s happening</h2>
            {result.diagnostics.length ? (
              <ul className="flex flex-col gap-2">
                {result.diagnostics.map((d, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-snug">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.severity === "warning" ? "bg-[var(--volt)]" : "bg-[var(--flow)]"}`} />
                    <span>{d.message}</span>
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

/* ---------------- projectile view ---------------- */

function ProjectileView({ result, cur, trails, showFull, body }: { result: MotionResult; cur: Sample; trails: Trail[]; showFull: boolean; body?: BodyKind }) {
  const s = result.setup.kind === "projectile" ? result.setup : null;
  if (!s) return null;
  const target = s.target;
  const trailMax = Math.max(0, ...trails.flatMap(tr => tr.pts.map(p => p[0])));
  const trailTop = Math.max(0, ...trails.flatMap(tr => tr.pts.map(p => p[1])));
  const xNeed = Math.max(result.summary.distance, target ? target.x + target.width : 0, trailMax, 4) * 1.08;
  const yNeed = Math.max(result.summary.maxHeight, s.height, trailTop, 2) * 1.12;
  const avail = W - M.r - (M.l + 26);
  const scale = Math.min(avail / xNeed, PH / yNeed); // equal scale keeps the true shape of the path
  // Mostly-vertical motion (a drop) would hug the left edge: centre it instead.
  const spare = avail - xNeed * scale;
  const x0 = M.l + 26 + (spare > avail * 0.5 ? spare / 2 : 0);
  const px = (x: number) => x0 + x * scale, py = (y: number) => M.t + PH - y * scale;
  const xSpan = (W - M.r - x0) / scale, ySpan = PH / scale;
  const xs = niceStep(xSpan, 7), ys = niceStep(ySpan, 5);
  const upto = result.samples.filter(p => p.t <= cur.t);
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join("");
  const vmax = Math.max(...result.samples.map(p => p.speed), 1);
  const arrow = 70 / vmax;
  const big = body === "skydiver" || body === "parachute";
  const bx = px(cur.x), by = py(cur.y) - (big ? 10 : 7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Projectile at ${cur.x.toFixed(1)} m across and ${cur.y.toFixed(1)} m high`}>
      {/* grid */}
      {Array.from({ length: Math.floor(xSpan / xs) + 1 }, (_, i) => i * xs).map(x => (
        <g key={`x${x}`}>
          <line x1={px(x)} x2={px(x)} y1={M.t} y2={M.t + PH} stroke="rgba(160,180,220,0.08)" />
          <text x={px(x)} y={H - 12} textAnchor="middle" className="fill-[var(--dim)] font-mono text-[11px]">{+x.toFixed(3)}</text>
        </g>
      ))}
      {Array.from({ length: Math.floor(ySpan / ys) + 1 }, (_, i) => i * ys).map(y => (
        <g key={`y${y}`}>
          <line x1={x0} x2={W - M.r} y1={py(y)} y2={py(y)} stroke="rgba(160,180,220,0.08)" />
          <text x={M.l + 2} y={py(y) + 4} textAnchor="end" className="fill-[var(--dim)] font-mono text-[11px]">{+y.toFixed(3)}</text>
        </g>
      ))}
      <text x={M.l + 2} y={H - 12} textAnchor="end" className="fill-[var(--muted)] font-mono text-[11px]">m</text>
      {/* ground, tower, target */}
      <line x1={x0 - 30} x2={W} y1={py(0)} y2={py(0)} stroke="#3A4868" strokeWidth={2} />
      {s.height > 0 && <rect x={px(0) - 16} y={py(s.height)} width={16} height={s.height * scale} fill="#1D2944" stroke="#3A4868" />}
      {target && (
        <g>
          <rect x={px(target.x - target.width / 2)} y={py(0) - 5} width={Math.max(4, target.width * scale)} height={7} rx={2} fill="var(--good)" opacity={0.85} />
          <line x1={px(target.x)} x2={px(target.x)} y1={py(0) - 5} y2={py(0) - 34} stroke="var(--good)" strokeWidth={2} />
          <path d={`M${px(target.x)} ${py(0) - 34} l16 6 l-16 6z`} fill="var(--good)" />
        </g>
      )}
      {/* earlier runs, then this run */}
      {trails.map((tr, i) => <path key={i} d={path(tr.pts)} fill="none" stroke="#9C8CFF" strokeOpacity={0.25 + 0.15 * i} strokeWidth={2} strokeDasharray="4 5" />)}
      {showFull && <path d={path(result.samples.map(p => [p.x, p.y]))} fill="none" stroke="var(--volt)" strokeOpacity={0.35} strokeWidth={2} />}
      <path d={path(upto.map(p => [p.x, p.y]))} fill="none" stroke="var(--volt)" strokeWidth={2.8} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px rgba(255,181,71,0.8))" }} />
      {/* velocity arrow */}
      {cur.speed > 0.05 && cur.y > 0 && (
        <g stroke="var(--flow)" strokeWidth={2.5} strokeLinecap="round">
          <line x1={bx} y1={by} x2={bx + cur.vx * arrow} y2={by - cur.vy * arrow} />
          <circle cx={bx + cur.vx * arrow} cy={by - cur.vy * arrow} r={3} fill="var(--flow)" />
        </g>
      )}
      <circle cx={bx} cy={by} r={big ? 10 : 7} fill={big ? "#9C8CFF" : "#FFD678"} stroke="#0a0f1c" strokeWidth={1.5} />
      {body === "parachute" && <path d={`M${bx - 16} ${by - 14} Q${bx} ${by - 40} ${bx + 16} ${by - 14} Z`} fill="#FFB547" opacity={0.9} />}
      {trails.length > 0 && (
        <g>{trails.map((tr, i) => <text key={i} x={W - M.r - 4} y={M.t + 14 + i * 16} textAnchor="end" className="fill-[#9C8CFF] text-[11px]" opacity={0.5 + 0.2 * i}>- - {tr.label}</text>)}</g>
      )}
    </svg>
  );
}

/* ---------------- ramp view ---------------- */

function RampView({ result, cur }: { result: MotionResult; cur: Sample }) {
  const s = result.setup.kind === "ramp" ? result.setup : null;
  if (!s) return null;
  const th = (s.angle * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
  const run = s.length * c, rise = s.length * sn;
  const scale = Math.min((PW - 80) / run, (PH - 90) / Math.max(rise, s.length * 0.12));
  const ox = M.l + 30, oy = M.t + PH - 10;
  const P = (x: number, y: number) => [ox + x * scale, oy - y * scale] as const;
  const [bx, by] = P(cur.x * c, cur.x * sn);
  const size = 34;
  const deg = -s.angle;
  // block centre sits half a block above the slope surface
  const cx = bx - sn * (size / 2), cy = by - c * (size / 2);
  const f = rampForces(s, cur.vx);
  const weight = s.mass * GRAVITY[s.planet];
  const fmax = Math.max(Math.abs(weight), Math.abs(f.normal), Math.abs(f.applied), Math.abs(f.friction), 1);
  const len = (N: number) => (Math.abs(N) / fmax) * 90;
  const arrows: { label: string; N: number; dx: number; dy: number; color: string }[] = [
    { label: "Weight", N: weight, dx: 0, dy: 1, color: "#FFB547" },
    { label: "Normal", N: f.normal, dx: -sn, dy: -c, color: "#7FD8FF" },
    { label: "Friction", N: f.friction, dx: c * Math.sign(f.friction), dy: -sn * Math.sign(f.friction), color: "#FF7A6B" },
    { label: "Push", N: f.applied, dx: c * Math.sign(f.applied), dy: -sn * Math.sign(f.applied), color: "#6FD39B" },
  ].filter(a => Math.abs(a.N) > 1e-6);
  const [rx, ry] = P(run, 0), [tx, ty] = P(run, rise);
  const xs = niceStep(s.length, 5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Block ${cur.x.toFixed(2)} m up a ${s.angle}° slope, moving at ${cur.speed.toFixed(2)} m/s`}>
      <defs>
        {arrows.map(a => (
          <marker key={a.label} id={`ah-${a.label}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={a.color} />
          </marker>
        ))}
      </defs>
      <path d={`M${ox} ${oy} L${rx} ${ry} L${tx} ${ty} Z`} fill="#16203A" stroke="#3A4868" strokeWidth={2} />
      <line x1={ox - 30} x2={W} y1={oy} y2={oy} stroke="#3A4868" strokeWidth={2} />
      {/* distance marks along the slope */}
      {Array.from({ length: Math.floor(s.length / xs) + 1 }, (_, i) => i * xs).map(d => {
        const [mx, my] = P(d * c, d * sn);
        return <g key={d}><line x1={mx} y1={my} x2={mx + sn * 8} y2={my + c * 8} stroke="#55617D" /><text x={mx + sn * 20} y={my + c * 20 + 4} textAnchor="middle" className="fill-[var(--dim)] font-mono text-[11px]">{+d.toFixed(2)}</text></g>;
      })}
      {s.angle > 0 && <text x={ox + 46} y={oy - 8} className="fill-[var(--muted)] font-mono text-xs">{s.angle}°</text>}
      <g transform={`rotate(${deg} ${cx} ${cy})`}>
        <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} rx={4} fill="#2B3A60" stroke="#9AA8C7" strokeWidth={1.5} />
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-[var(--fg)] font-mono text-[10px]">{s.mass}kg</text>
      </g>
      {arrows.map(a => {
        // Start each arrow at the block's edge so it isn't hidden under the block.
        const L = Math.max(16, len(a.N)), x1 = cx + a.dx * size * 0.55, y1 = cy + a.dy * size * 0.55;
        return (
          <g key={a.label}>
            <line x1={x1} y1={y1} x2={x1 + a.dx * L} y2={y1 + a.dy * L} stroke={a.color} strokeWidth={2.5} markerEnd={`url(#ah-${a.label})`} />
            <text x={x1 + a.dx * (L + 16)} y={y1 + a.dy * (L + 16) + 4} textAnchor="middle" className="text-[11px]" fill={a.color}>{a.label} {Math.abs(a.N).toFixed(1)} N</text>
          </g>
        );
      })}
      <text x={W - M.r} y={M.t + 14} textAnchor="end" className="fill-[var(--muted)] font-mono text-xs">net force {f.net >= 0 ? "+" : "−"}{Math.abs(f.net).toFixed(1)} N along the slope</text>
    </svg>
  );
}

/* ---------------- graph ---------------- */

function Graph({ result, t, kind, onKind }: { result: MotionResult; t: number; kind: "height" | "speed" | "energy"; onKind: (k: "height" | "speed" | "energy") => void }) {
  const ramp = result.setup.kind === "ramp";
  const GW = 800, GH = 190, gm = { l: 52, r: 16, t: 14, b: 28 };
  const series: { key: string; label: string; color: string; get: (s: Sample) => number }[] =
    kind === "height" ? [ramp ? { key: "x", label: "position up the slope (m)", color: "var(--volt)", get: s => s.x } : { key: "y", label: "height (m)", color: "var(--volt)", get: s => s.y }]
    : kind === "speed" ? [ramp ? { key: "v", label: "velocity up the slope (m/s)", color: "var(--flow)", get: s => s.vx } : { key: "v", label: "speed (m/s)", color: "var(--flow)", get: s => s.speed }]
    : [
      { key: "ke", label: "kinetic", color: "#7FD8FF", get: s => s.ke },
      { key: "gpe", label: "gravitational", color: "#FFB547", get: s => s.gpe },
      { key: "lost", label: ramp ? "heat (friction)" : "heat (air)", color: "#FF7A6B", get: s => s.lost },
      ...(ramp && result.samples.some(s => s.work !== 0) ? [{ key: "work", label: "work by push", color: "#6FD39B", get: (s: Sample) => s.work }] : []),
    ];
  const vals = result.samples.flatMap(s => series.map(se => se.get(s)));
  const lo = Math.min(0, ...vals), hi = Math.max(...vals, lo + 1e-6);
  const T = Math.max(result.duration, 1e-6);
  const gx = (tt: number) => gm.l + (tt / T) * (GW - gm.l - gm.r);
  const gy = (v: number) => gm.t + (1 - (v - lo) / (hi - lo)) * (GH - gm.t - gm.b);
  const ys = niceStep(hi - lo, 4), ts = niceStep(T, 6);
  return (
    <div className="glass rounded-[28px] p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Graph" className="hairline flex rounded-full p-0.5">
          {(["height", "speed", "energy"] as const).map(k => (
            <button key={k} onClick={() => onKind(k)} aria-pressed={kind === k}
              className={`rounded-full px-3.5 py-1.5 text-sm ${kind === k ? "bg-white/10 text-[var(--fg)]" : "text-[var(--muted)]"}`}>
              {k === "height" ? (ramp ? "Position" : "Height") : k === "speed" ? (ramp ? "Velocity" : "Speed") : "Energy"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-3 text-xs">
          {series.map(se => <span key={se.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: se.color }} />{se.label}</span>)}
        </div>
      </div>
      <svg viewBox={`0 0 ${GW} ${GH}`} className="block h-auto w-full" role="img" aria-label={`Graph of ${series.map(s => s.label).join(", ")} against time`}>
        {Array.from({ length: Math.floor((hi - lo) / ys) + 2 }, (_, i) => Math.ceil(lo / ys) * ys + i * ys).filter(v => v <= hi + 1e-9).map(v => (
          <g key={v}><line x1={gm.l} x2={GW - gm.r} y1={gy(v)} y2={gy(v)} stroke={v === 0 ? "#3A4868" : "rgba(160,180,220,0.08)"} />
            <text x={gm.l - 6} y={gy(v) + 4} textAnchor="end" className="fill-[var(--dim)] font-mono text-[10px]">{kind === "energy" && Math.abs(v) >= 10000 ? `${+(v / 1000).toFixed(1)}k` : +v.toFixed(3)}</text></g>
        ))}
        {Array.from({ length: Math.floor(T / ts) + 1 }, (_, i) => i * ts).map(tt => (
          <text key={tt} x={gx(tt)} y={GH - 8} textAnchor="middle" className="fill-[var(--dim)] font-mono text-[10px]">{+tt.toFixed(3)}s</text>
        ))}
        {series.map(se => {
          const d = result.samples.map((s, i) => `${i ? "L" : "M"}${gx(s.t).toFixed(1)} ${gy(se.get(s)).toFixed(1)}`).join("");
          const done = result.samples.filter(s => s.t <= t).map((s, i) => `${i ? "L" : "M"}${gx(s.t).toFixed(1)} ${gy(se.get(s)).toFixed(1)}`).join("");
          return <g key={se.key}><path d={d} fill="none" stroke={se.color} strokeOpacity={0.22} strokeWidth={2} /><path d={done} fill="none" stroke={se.color} strokeWidth={2.6} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 5px ${se.color})` }} /></g>;
        })}
        <line x1={gx(t)} x2={gx(t)} y1={gm.t} y2={GH - gm.b} stroke="var(--fg)" strokeOpacity={0.5} strokeDasharray="3 3" />
      </svg>
    </div>
  );
}

/* ---------------- controls & readouts ---------------- */

function Slider({ id, def, value, disabled, onChange }: { id: string; def: ParamDef; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id}>{def.label}{disabled && <span className="ml-1.5 text-xs text-[var(--muted)]">(locked)</span>}</label>
        <span className="font-mono tabular-nums text-[var(--volt)]">{+value.toFixed(2)}{def.unit ? ` ${def.unit}` : ""}</span>
      </div>
      <input id={id} type="range" min={def.min} max={def.max} step={def.step} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))} className="w-full" style={{ "--fill": `${((value - def.min) / (def.max - def.min || 1)) * 100}%` } as React.CSSProperties} />
    </div>
  );
}

function Controls({ scene, setup, body, onChange, onBody }: { scene: MotionScene; setup: MotionSetup; body?: BodyKind; onChange: (p: Partial<MotionSetup>) => void; onBody: (b: BodyKind) => void }) {
  const ed = (p: MotionParam) => canEdit(scene, p);
  return (
    <div className="flex flex-col gap-4 glass rounded-[28px] p-4">
      <h2 className="text-lg font-semibold">{setup.kind === "projectile" ? "Launch settings" : "Slope settings"}</h2>
      {setup.kind === "projectile" ? (
        <>
          <div className={`flex flex-col gap-1 ${ed("body") ? "" : "opacity-50"}`}>
            <label htmlFor="body" className="text-sm">Object</label>
            <select id="body" value={body ?? ""} disabled={!ed("body")} onChange={e => onBody(e.target.value as BodyKind)}
              className="rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm">
              {!body && <option value="">Custom</option>}
              {(Object.keys(BODIES) as BodyKind[]).map(b => <option key={b} value={b}>{BODIES[b].label} ({BODIES[b].mass} kg)</option>)}
            </select>
          </div>
          {(["speed", "angle", "height"] as const).map(p => <Slider key={p} id={`p-${p}`} def={PROJECTILE_PARAMS[p]} value={setup[p]} disabled={!ed(p)} onChange={v => onChange({ [p]: v })} />)}
          <label className={`flex items-center justify-between text-sm ${ed("air") ? "" : "opacity-50"}`}>
            Air resistance
            <input type="checkbox" checked={setup.air} disabled={!ed("air")} onChange={e => onChange({ air: e.target.checked })} className="h-4 w-4 accent-[#7FD8FF]" />
          </label>
        </>
      ) : (
        (["angle", "friction", "force", "mass", "length", "startSpeed"] as const).map(p => (
          <Slider key={p} id={`r-${p}`} def={RAMP_PARAMS[p]} value={setup[p]} disabled={!ed(p)}
            onChange={v => onChange(p === "length" ? { length: v, start: Math.min(setup.start === setup.length ? v : setup.start, v) } : { [p]: v })} />
        ))
      )}
      <div className={`flex flex-col gap-1 ${ed("planet") ? "" : "opacity-50"}`}>
        <label htmlFor="planet" className="text-sm">Planet</label>
        <select id="planet" value={setup.planet} disabled={!ed("planet")} onChange={e => onChange({ planet: e.target.value as Planet })}
          className="rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm">
          {(Object.keys(PLANETS) as Planet[]).map(p => <option key={p} value={p}>{PLANETS[p]}</option>)}
        </select>
      </div>
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

function Readouts({ result, cur, ran }: { result: MotionResult; cur: Sample; ran: boolean }) {
  const ramp = result.setup.kind === "ramp";
  const sm = result.summary;
  const endings = { top: "Reached the top", bottom: "Reached the bottom", stopped: "Came to a stop", held: "Held still by friction" };
  return (
    <div className="flex flex-col gap-2 glass rounded-[28px] p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Live readings</h2>
      <Row label="Time" value={fmt(cur.t, "s", 2)} />
      {ramp ? <Row label="Position up the slope" value={fmt(cur.x, "m", 2)} color="var(--volt)" />
        : <><Row label="Across" value={fmt(cur.x, "m")} color="var(--volt)" /><Row label="Height" value={fmt(cur.y, "m")} color="var(--volt)" /></>}
      <Row label={ramp ? "Velocity" : "Speed"} value={fmt(ramp ? cur.vx : cur.speed, "m/s", 2)} color="var(--flow)" />
      <Row label="Kinetic energy" value={fmtJ(cur.ke)} color="#7FD8FF" />
      <Row label="Gravitational energy" value={fmtJ(cur.gpe)} color="#FFB547" />
      <Row label={ramp ? "Heat from friction" : "Heat from air"} value={fmtJ(cur.lost)} color="#FF7A6B" />
      {ramp && result.samples.some(s => s.work !== 0) && <Row label="Work by push" value={fmtJ(cur.work)} color="#6FD39B" />}
      {ran && (
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--line)] pt-3">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Result</h3>
          {ramp ? <>
            <Row label="Outcome" value={endings[sm.ending ?? "stopped"]} />
            <Row label="Acceleration" value={fmt(sm.acceleration ?? 0, "m/s²", 2)} />
            <Row label="Time" value={fmt(result.duration, "s", 2)} />
            <Row label="Final speed" value={fmt(sm.finalSpeed, "m/s", 2)} />
          </> : <>
            <Row label="Range" value={fmt(sm.distance, "m")} />
            <Row label="Highest point" value={fmt(sm.maxHeight, "m")} />
            <Row label="Time in the air" value={fmt(result.duration, "s", 2)} />
            <Row label="Landing speed" value={fmt(sm.finalSpeed, "m/s")} />
            {sm.terminalSpeed !== undefined && <Row label="Terminal velocity" value={fmt(sm.terminalSpeed, "m/s")} />}
          </>}
        </div>
      )}
    </div>
  );
}
