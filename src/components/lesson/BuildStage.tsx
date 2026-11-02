"use client";

import { useEffect, useState } from "react";
import type { LessonEvent } from "@/lib/lesson-events";

type Stage = Extract<LessonEvent, { t: "stage" }>;

const STEPS: { key: Stage["stage"]; label: string }[] = [
  { key: "engine", label: "Reading" },
  { key: "planning", label: "Working out the science" },
  { key: "writing", label: "Building" },
  { key: "checking", label: "Checking against real-world facts" },
];

/** A simulation skeleton that draws itself, connects up and starts flowing, on a loop. */
function Assembly({ cycle }: { cycle: number }) {
  const boxes = [{ x: 70, y: 70 }, { x: 260, y: 40 }, { x: 260, y: 160 }, { x: 450, y: 100 }];
  const links: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3]];
  const c = (i: number) => ({ x: boxes[i].x + 50, y: boxes[i].y + 28 });
  return (
    <svg key={cycle} viewBox="0 0 570 240" className="w-full max-w-[560px]" aria-hidden="true">
      <defs>
        <linearGradient id="bs-line" x1="0" x2="1"><stop offset="0" stopColor="#6ee7ff" /><stop offset="1" stopColor="#a78bfa" /></linearGradient>
        <filter id="bs-glow"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      {links.map(([a, b], i) => {
        const p = c(a), q = c(b), d = `M${p.x + 50} ${p.y} C${(p.x + q.x) / 2 + 20} ${p.y}, ${(p.x + q.x) / 2 - 20} ${q.y}, ${q.x - 50} ${q.y}`;
        return (
          <g key={i}>
            <path d={d} pathLength={1} fill="none" stroke="url(#bs-line)" strokeWidth={2} className="anim-draw" style={{ animationDelay: `${0.9 + i * 0.18}s` }} />
            {[0, 1, 2].map(k => (
              <circle key={k} r={3.2} fill="#6ee7ff" className="anim-fade" style={{ animationDelay: `${1.9 + i * 0.1}s`, offsetPath: `path("${d}")`, animation: `fade 0.4s ${1.9 + i * 0.1}s both, bs-move 1.6s ${1.9 + k * 0.53}s linear infinite` } as React.CSSProperties} />
            ))}
          </g>
        );
      })}
      {boxes.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={100} height={56} rx={14} pathLength={1} fill="rgba(110,231,255,0.04)" stroke="#6ee7ff" strokeOpacity={0.75} strokeWidth={1.5} className="anim-draw" style={{ animationDelay: `${i * 0.16}s` }} />
          <rect x={b.x + 12} y={b.y + 16} width={48} height={6} rx={3} fill="#f2f5fb" opacity={0.5} className="anim-fade" style={{ animationDelay: `${0.6 + i * 0.16}s` }} />
          <rect x={b.x + 12} y={b.y + 30} width={68} height={9} rx={4} fill="#6ee7ff" opacity={0.35} className="anim-fade" style={{ animationDelay: `${0.7 + i * 0.16}s` }} />
          <rect x={b.x} y={b.y} width={100} height={56} rx={14} fill="none" stroke="#6ee7ff" strokeWidth={3} opacity={0.18} filter="url(#bs-glow)" className="anim-fade" style={{ animationDelay: `${0.4 + i * 0.16}s` }} />
        </g>
      ))}
      <style>{`@keyframes bs-move { from { offset-distance: 0%; } to { offset-distance: 100%; } }`}</style>
    </svg>
  );
}

export default function BuildStage({ request, started, stage, fixes }: { request: string; started: number; stage?: Stage; fixes: string[] }) {
  const [now, setNow] = useState(started);
  const [cycle, setCycle] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setCycle(c => c + 1), 7000); return () => clearInterval(t); }, []);
  const secs = Math.max(0, Math.round((now - started) / 1000));
  const at = !stage ? 0 : stage.stage === "fixing" ? 1 : Math.max(0, STEPS.findIndex(s => s.key === stage.stage));
  const label = stage?.stage === "writing" && stage.words ? `${stage.label} · ${stage.words.toLocaleString("en-NZ")} words` : stage?.label ?? "Reading your request";

  return (
    <div aria-live="polite" className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-[12vh] pb-16 text-center">
      <p className="anim-rise font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Building your simulation</p>
      <h1 className="anim-rise mt-4 max-w-2xl text-[clamp(1.6rem,4vw,2.6rem)] leading-tight font-semibold tracking-[-0.03em] text-balance" style={{ animationDelay: "0.08s" }}>
        {request}
      </h1>

      <div className="anim-fade mt-10 flex w-full justify-center" style={{ animationDelay: "0.2s" }}><Assembly cycle={cycle} /></div>

      <p className="mt-8 text-lg font-medium">
        <span className="relative inline-block overflow-hidden">
          {label}…
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: "sheen 2.2s ease-in-out infinite" }} />
        </span>
      </p>

      <ol className="mt-6 flex w-full max-w-lg items-center" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center last:flex-none">
            <span title={s.label} className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-500 ${i < at ? "bg-[var(--good)]" : i === at ? "anim-breathe bg-[var(--flow)] shadow-[0_0_14px_var(--flow)]" : "bg-[var(--line-strong)]"}`} />
            {i < STEPS.length - 1 && <span className="mx-1.5 h-px flex-1 overflow-hidden bg-[var(--line)]"><span className="block h-full bg-[var(--good)] transition-all duration-700" style={{ width: i < at ? "100%" : "0%" }} /></span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono text-xs text-[var(--dim)]">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} · usually about a minute</p>

      {fixes.length > 0 && (
        <div className="anim-rise mt-6 flex flex-col gap-1 rounded-2xl border border-[var(--volt)]/30 bg-[rgba(255,181,71,0.06)] px-4 py-2.5 text-sm text-[var(--fg)]/90">
          {fixes.map((f, i) => <p key={i}><span className="mr-1.5 text-[var(--volt)]">↻</span>{f}</p>)}
        </div>
      )}
    </div>
  );
}
