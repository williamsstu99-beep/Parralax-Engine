"use client";

import Link from "next/link";
import { Mark, Wordmark } from "@/components/brand/Mark";
import { SCENES, type SceneId } from "@/lib/scenes";

/**
 * Every simulation sits in the same frame: a full-bleed living stage, a
 * title, one plain-English sentence that changes with what's happening,
 * and a few big controls. Nothing else.
 */
export default function SceneShell({ id, caption, controls, children, hint, fit = false }: {
  id: SceneId; caption: string; controls: React.ReactNode; children: React.ReactNode; hint?: string;
  /** Let the stage grow to its content (an interactive board) instead of a fixed canvas area. */
  fit?: boolean;
}) {
  const scene = SCENES[id];
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[var(--ink)] text-[var(--fg)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_-10%,rgba(110,231,255,0.10),transparent_65%),radial-gradient(700px_500px_at_90%_110%,rgba(167,139,250,0.08),transparent_60%)]" />

      <header className="relative z-20 flex items-center gap-4 px-4 py-3.5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[18px]"><Mark size={26} /><Wordmark /></Link>
        <nav aria-label="Simulations" className="ml-auto hidden items-center gap-1 text-sm md:flex">
          {Object.values(SCENES).map(s => (
            <Link key={s.id} href={`/workshop/${s.id}`} aria-current={s.id === id ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 transition-colors ${s.id === id ? "bg-white/10 text-[var(--fg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}>{s.short}</Link>
          ))}
        </nav>
      </header>

      <div className="relative z-10 px-4 pt-2 sm:px-8">
        <p className="anim-rise font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--flow)]">{scene.kicker}</p>
        <h1 className="anim-rise mt-2 max-w-3xl text-[clamp(1.9rem,4.4vw,3.4rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance" style={{ animationDelay: "0.06s" }}>{scene.title}</h1>
      </div>

      <main className="relative z-10 flex flex-1 flex-col gap-4 px-2 pt-3 pb-4 sm:px-6">
        <div className={`relative overflow-hidden rounded-[32px] border border-[var(--line)] bg-[radial-gradient(120%_100%_at_50%_0%,#0d1527_0%,#05070d_75%)] shadow-[0_40px_120px_-60px_rgba(110,231,255,0.35)] ${fit ? "p-3 sm:p-5" : "flex-1"}`} style={fit ? undefined : { minHeight: "min(62vh, 640px)" }}>
          {children}
          {hint && <p className="pointer-events-none absolute top-4 right-5 hidden rounded-full bg-black/40 px-3 py-1.5 text-xs text-[var(--muted)] ring-1 ring-white/5 backdrop-blur sm:block">{hint}</p>}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <p aria-live="polite" className="min-h-[3.2em] flex-1 px-2 text-[17px] leading-snug text-[var(--fg)]/90 text-pretty sm:text-lg">{caption}</p>
          <div className="glass flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[24px] px-5 py-3.5">{controls}</div>
        </div>
      </main>
    </div>
  );
}
