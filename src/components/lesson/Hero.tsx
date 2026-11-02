"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SCENES } from "@/lib/scenes";

/** Ideas the placeholder types out: proof that anything goes, without a wall of buttons. */
const IDEAS = [
  "Build me a wing and show how it lifts as the plane speeds up",
  "Let's build a circuit with a battery and two bulbs",
  "Show me how magnets attract and repel",
  "How does a generator make electricity from a magnet?",
  "What's going on inside a battery?",
  "Why does a wing stall if it tilts too far?",
  "Why do bulbs get dimmer when you add more?",
  "Show me the magnetic field around a bar magnet",
];

/** Types each idea out, holds it, then deletes it. Pauses while the student is typing. */
function useTypewriter(paused: boolean) {
  const [text, setText] = useState("");
  const [idea, setIdea] = useState(0);
  const state = useRef({ i: 0, ch: 0, dir: 1 as 1 | -1, hold: 0 });
  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setInterval(() => { state.current.i = (state.current.i + 1) % IDEAS.length; setIdea(state.current.i); setText(IDEAS[state.current.i]); }, 3500);
      setText(IDEAS[state.current.i]);
      return () => clearInterval(id);
    }
    const id = setInterval(() => {
      const s = state.current, full = IDEAS[s.i];
      if (s.hold > 0) { s.hold--; return; }
      s.ch += s.dir;
      if (s.ch >= full.length) { s.ch = full.length; s.dir = -1; s.hold = 55; }
      if (s.ch <= 0) { s.ch = 0; s.dir = 1; s.i = (s.i + 1) % IDEAS.length; s.hold = 6; setIdea(s.i); }
      setText(full.slice(0, s.ch));
    }, 34);
    return () => clearInterval(id);
  }, [paused]);
  return { text, full: IDEAS[idea] };
}

export default function Hero({ value, onChange, onSubmit, busy, error }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean;
  error?: { message: string; details?: string[] };
}) {
  const ghost = useTypewriter(value.length > 0 || busy);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-[14vh] pb-16 text-center">
      <span className="anim-rise hairline mb-7 rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]" style={{ animationDelay: "0.05s" }}>
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--flow)] align-middle shadow-[0_0_10px_var(--flow)]" />Powered by the Parallax Engine
      </span>
      <h1 className="anim-rise text-[clamp(2.6rem,7vw,5.2rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance" style={{ animationDelay: "0.12s" }}>
        Teach anything.<br /><span className="text-gradient">Watch it come alive.</span>
      </h1>
      <p className="anim-rise mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted)] text-pretty" style={{ animationDelay: "0.22s" }}>
        Say what you want to teach. Watch it build itself in front of your class, then reach in and play with it.
      </p>

      <form onSubmit={e => { e.preventDefault(); onSubmit(); }} className="anim-rise relative mt-10 w-full" style={{ animationDelay: "0.32s" }}>
        <div className="glass glow-ring relative flex items-end gap-3 rounded-[22px] p-2.5 pl-5 text-left transition-shadow focus-within:shadow-[0_0_0_1px_rgba(110,231,255,0.6),0_0_60px_-8px_rgba(110,231,255,0.55)]">
          <label htmlFor="request" className="sr-only">What do you want to teach?</label>
          <div className="relative min-h-[56px] flex-1 py-3">
            {!value && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 py-3 text-lg leading-relaxed text-[var(--dim)] sm:text-xl">
                {ghost.text}<span className="caret ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-[var(--flow)]" />
              </div>
            )}
            <textarea id="request" ref={input} value={value} onChange={e => onChange(e.target.value)} rows={1} maxLength={1500} disabled={busy}
              onKeyDown={e => {
                if (e.key === "Tab" && !value && !e.shiftKey) { e.preventDefault(); onChange(ghost.full); }
                else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
              }}
              className="relative block max-h-40 min-h-[32px] w-full resize-none bg-transparent text-lg leading-relaxed outline-none [field-sizing:content] disabled:opacity-60 sm:text-xl" />
          </div>
          <button type="submit" disabled={busy || !value.trim()} aria-label="Build the lesson"
            className="btn-primary flex h-12 shrink-0 items-center gap-2 rounded-2xl px-5 text-[15px]">
            Build it
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        <p className="mt-3 text-sm text-[var(--dim)]">
          {value ? "Add a year level for the best fit, e.g. \"Year 10\"." : <><kbd className="hairline rounded-md px-1.5 py-0.5 font-mono text-xs text-[var(--muted)]">Tab</kbd> to use the idea shown, or type your own.</>}
        </p>
      </form>

      {error && (
        <div role="alert" className="anim-rise mt-6 w-full rounded-2xl border border-[var(--bad)]/40 bg-[rgba(255,122,133,0.07)] px-4 py-3 text-left text-sm">
          <p className="font-medium">{error.message}</p>
          {error.details && <ul className="mt-2 list-disc pl-5 text-[var(--muted)]">{error.details.slice(0, 4).map((d, i) => <li key={i}>{d}</li>)}</ul>}
        </div>
      )}

      <div className="anim-fade mt-14 flex flex-col items-center gap-3" style={{ animationDelay: "0.6s" }}>
        <span className="text-sm text-[var(--dim)]">Or jump straight in</span>
        <nav aria-label="Simulations" className="flex flex-wrap justify-center gap-2">
          {Object.values(SCENES).map((sc, i) => (
            <Link key={sc.id} href={`/workshop/${sc.id}`} className="anim-rise glass rounded-full px-4 py-2 text-sm text-[var(--fg)]/90 transition-all hover:border-[var(--flow)]/50 hover:text-[var(--fg)] hover:shadow-[0_0_24px_-6px_rgba(110,231,255,0.6)]" style={{ animationDelay: `${0.7 + i * 0.06}s` }}>{sc.short}</Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
