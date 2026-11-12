"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { Control, ControlValue, Values } from "@/engine/kit/core";
import { EXAMPLES, type Example } from "@/engine/kit/examples";
import SimFrame, { type SimCommand, type SimEvent } from "./SimFrame";

type Phase = "idle" | "writing" | "checking" | "fixing" | "ready" | "error";
interface Current { title: string; summary: string; code: string; request: string; source: "ai" | "example"; cost?: number }

const YEARS = ["Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13"];

function Logo() {
  return (
    <svg width="28" height="28" viewBox="-64 -64 128 128" aria-hidden="true">
      <circle r="38" fill="none" stroke="#eaf2f2" strokeOpacity="0.45" strokeWidth="3" />
      <circle r="56" fill="none" stroke="#eaf2f2" strokeOpacity="0.3" strokeWidth="3" />
      <circle cx="29" cy="-24" r="5" fill="#eaf2f2" /><circle cx="54" cy="14" r="5" fill="#eaf2f2" fillOpacity="0.8" /><circle cx="-40" cy="40" r="5" fill="#eaf2f2" fillOpacity="0.8" />
      <circle r="25" fill="#5d6876" /><circle r="17" fill="#0b1018" stroke="#8ccaff" strokeWidth="5" />
      <path d="M1.4 -9.9 A10.1 10.1 0 1 1 1.4 9.9 A7.6 7.6 0 1 0 1.4 -9.9 Z" fill="#ffffff" />
    </svg>
  );
}

const STATUS: Record<Phase, string> = {
  idle: "", writing: "Writing the scene", checking: "Checking the physics", fixing: "Fixing a problem the checker found", ready: "", error: "",
};

export default function Studio() {
  const [request, setRequest] = useState("");
  const [year, setYear] = useState("Year 10");
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState<Current | null>(null);
  const [controls, setControls] = useState<Control[]>([]);
  const [values, setValues] = useState<Values>({});
  const [caption, setCaption] = useState("");
  const [paused, setPaused] = useState(false);
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null);
  const send = useRef<(c: SimCommand) => void>(() => {});
  const repaired = useRef(false);
  const commands = useCallback((s: (c: SimCommand) => void) => { send.current = s; }, []);

  function load(next: Current) {
    repaired.current = false;
    setValues({}); setControls([]); setCaption(""); setPaused(false); setProblem(null);
    setCurrent(next); setPhase("checking");
  }

  async function callGenerate(body: object) {
    const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Enter the access code on the home page first.");
    if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong."), { details: data.details as string[] | undefined });
    return data as { title: string; summary: string; code: string; cost?: number };
  }

  async function build(e?: React.FormEvent) {
    e?.preventDefault();
    const text = request.trim();
    if (!text || phase === "writing" || phase === "fixing") return;
    setPhase("writing"); setProblem(null);
    try {
      const out = await callGenerate({ request: text, year });
      load({ ...out, request: text, source: "ai" });
    } catch (err) {
      setPhase("error"); setProblem({ message: (err as Error).message, details: (err as { details?: string[] }).details });
    }
  }

  const onEvent = useCallback(async (ev: SimEvent) => {
    if (ev.type === "ready") { setControls(ev.controls); setPhase("ready"); }
    else if (ev.type === "caption") setCaption(ev.text);
    else if (ev.type === "paused") setPaused(ev.paused);
    else if (ev.type === "error") {
      // One automatic repair for AI-written scenes: send the checker's findings back.
      if (current?.source === "ai" && !repaired.current) {
        repaired.current = true; setPhase("fixing");
        try {
          const out = await callGenerate({ request: current.request, year, repair: { code: current.code, errors: ev.errors } });
          setCurrent({ ...current, ...out, cost: (current.cost ?? 0) + (out.cost ?? 0) }); setPhase("checking");
          return;
        } catch { /* fall through to the error below */ }
      }
      setPhase("error"); setProblem({ message: "This one didn't pass the physics checks. Try rewording it, or start from an example.", details: ev.errors });
    }
  }, [current, year]);

  function change(label: string, value: ControlValue) {
    setValues(v => ({ ...v, [label]: value }));
    setControls(cs => cs.map(c => (c.label === label ? { ...c, value } : c)));
    send.current({ type: "set", label, value });
  }

  function reset() { setCurrent(null); setPhase("idle"); setRequest(""); setProblem(null); setControls([]); setCaption(""); }

  const busy = phase === "writing" || phase === "fixing" || phase === "checking";

  return (
    <div className="flex min-h-dvh flex-wrap bg-[#f6f4ef] text-[#13262b]">
      <nav aria-label="Main" className="flex w-full flex-col gap-6 bg-[linear-gradient(180deg,#0f3f48_0%,#155660_100%)] px-4 py-5 text-[#eaf2f2] md:w-[248px] md:min-h-dvh">
        <Link href="/" className="flex items-center gap-3 px-2"><Logo /><span className="font-[Montserrat,var(--font-geist-sans)] text-sm font-medium tracking-[0.28em]">AURACLE</span></Link>
        <button onClick={reset} className="min-h-10 rounded-lg bg-[#eaf2f2] text-sm font-semibold text-[#0b2f37]">New simulation</button>
        <div className="flex flex-col gap-0.5 text-sm">
          <Link href="/" className="rounded-md px-2.5 py-2 text-[#a3bcbf] hover:text-[#eaf2f2]">Home</Link>
          <span aria-current="page" className="rounded-md bg-white/10 px-2.5 py-2 font-medium">Studio</span>
          <span className="px-2.5 py-2 text-[#8fa9ac]">Library · soon</span>
          <span className="px-2.5 py-2 text-[#8fa9ac]">Classes · soon</span>
        </div>
        <div className="flex flex-col gap-0.5 text-sm">
          <p className="px-2.5 pb-1 text-[11px] uppercase tracking-[0.14em] text-[#8fa9ac]">Engines</p>
          <span className="flex justify-between px-2.5 py-2">Physics<span className="h-1.5 w-1.5 self-center rounded-full bg-[#8ccaff]" /></span>
          <span className="flex justify-between px-2.5 py-2">Mathematics<span className="h-1.5 w-1.5 self-center rounded-full bg-[#8ccaff]" /></span>
          <span className="px-2.5 py-2 text-[#8fa9ac]">Chemistry · soon</span>
          <span className="px-2.5 py-2 text-[#8fa9ac]">Biology · soon</span>
        </div>
      </nav>

      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10">
        <form onSubmit={build} className="flex flex-col gap-3 rounded-2xl border border-[#e6e2d9] bg-white p-3.5">
          <label htmlFor="request" className="sr-only">Describe a concept</label>
          <textarea id="request" rows={2} value={request} onChange={e => setRequest(e.target.value)} disabled={busy}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void build(); } }}
            placeholder="Describe a concept: “show how the angle of a ramp changes how fast a block slides”"
            className="resize-none bg-transparent px-2 py-1.5 text-[17px] outline-none placeholder:text-[#8a979a] disabled:opacity-60" />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="year" className="text-[13px] text-[#5a6b6e]">Year level</label>
            <select id="year" value={year} onChange={e => setYear(e.target.value)} className="min-h-9 rounded-md border border-[#e6e2d9] bg-[#f9f8f5] px-2 text-[13px] font-medium">
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
            <button type="submit" disabled={busy || !request.trim()} className="ml-auto min-h-10 rounded-lg bg-[#155660] px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-40">Build</button>
          </div>
        </form>

        <div className="flex flex-wrap gap-5">
          <section aria-label="Simulation" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-[#0f3f48]/20 bg-[#0a2a31]">
              {current && <SimFrame code={current.code} values={values} onEvent={onEvent} commands={commands} title={current.title} />}
              {!current && phase !== "writing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center text-[#a3bcbf]">
                  <p className="text-[15px] text-[#eaf2f2]">Describe a concept above, or open an example below.</p>
                  <p className="text-[13px]">Every simulation runs on the engine&apos;s own physics, checked before you see it.</p>
                </div>
              )}
              {busy && phase !== "checking" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a2a31]/85" aria-live="polite">
                  <span className="relative block h-px w-48 overflow-hidden bg-white/10"><span className="reimagine-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#8ccaff] to-transparent" /></span>
                  <span className="text-[11px] uppercase tracking-[0.22em] text-[#8ccaff]">{STATUS[phase]}…</span>
                </div>
              )}
              {phase === "error" && problem && (
                <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a2a31]/92 p-8 text-center">
                  <p className="max-w-md text-[15px] text-[#eaf2f2]">{problem.message}</p>
                  {problem.details && <ul className="max-w-lg text-left text-[13px] text-[#a3bcbf]">{problem.details.slice(0, 3).map((d, i) => <li key={i}>· {d}</li>)}</ul>}
                </div>
              )}
            </div>
            <p aria-live="polite" className="min-h-[3em] text-[16px] leading-relaxed text-[#13262b]">{phase === "ready" ? caption : ""}</p>
          </section>

          <aside aria-label="Controls" className="flex flex-[1_1_270px] flex-col gap-5 self-start rounded-xl border border-[#e6e2d9] bg-white p-5">
            {current ? (
              <>
                <div className="flex flex-col gap-1">
                  <h1 className="text-[17px] font-semibold leading-snug">{current.title}</h1>
                  {current.summary && <p className="text-[13px] leading-relaxed text-[#5a6b6e]">{current.summary}</p>}
                </div>
                {controls.map(c => <ControlView key={c.label} c={c} onChange={v => change(c.label, v)} />)}
                <button onClick={() => send.current({ type: "restart" })} disabled={phase !== "ready"}
                  className="min-h-10 rounded-lg border border-[#d9d4c9] text-sm font-medium disabled:opacity-40">{paused ? "Run again" : "Restart"}</button>
                <div className="flex flex-col gap-1 border-t border-[#e6e2d9] pt-4 text-[12px] leading-relaxed text-[#5a6b6e]">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b7a7d]">Checked by the engine</p>
                  <p>Motion and numbers come from the engine&apos;s physics, not the AI.{current.source === "ai" && current.cost !== undefined ? ` Built by the fast model for about ${(current.cost * 100).toFixed(2)}¢.` : current.source === "example" ? " Example scene: free to open." : ""}</p>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2 text-[14px] text-[#5a6b6e]">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b7a7d]">Controls</p>
                <p>Sliders and switches for each simulation appear here.</p>
              </div>
            )}
          </aside>
        </div>

        <section aria-labelledby="examples" className="flex flex-col gap-3">
          <h2 id="examples" className="text-[15px] font-semibold">Examples</h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {EXAMPLES.map((ex: Example) => (
              <button key={ex.id} onClick={() => load({ title: ex.title, summary: "", code: ex.code, request: ex.prompt, source: "example" })}
                className="flex flex-col gap-1 rounded-xl border border-[#e6e2d9] bg-white p-4 text-left transition-colors hover:border-[#155660]/40">
                <span className="text-[14px] font-medium">{ex.title}</span>
                <span className="text-[12px] leading-relaxed text-[#5a6b6e]">{ex.prompt}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function ControlView({ c, onChange }: { c: Control; onChange: (v: ControlValue) => void }) {
  if (c.kind === "slider") {
    const v = Number(c.value), step = c.step ?? 1, dp = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
    const fill = ((v - (c.min ?? 0)) / ((c.max ?? 1) - (c.min ?? 0))) * 100;
    const id = `c-${c.label.replace(/\W+/g, "-")}`;
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="flex justify-between text-[14px]"><span>{c.label}</span><span className="tabular-nums text-[#5a6b6e]">{v.toFixed(dp)}{c.unit ? ` ${c.unit}` : ""}</span></label>
        <input id={id} type="range" min={c.min} max={c.max} step={step} value={v} onChange={e => onChange(Number(e.target.value))}
          className="studio-range w-full" style={{ "--fill": `${fill}%` } as React.CSSProperties} />
      </div>
    );
  }
  if (c.kind === "toggle") {
    return (
      <label className="flex min-h-11 items-center gap-3 text-[14px]">
        <input type="checkbox" checked={Boolean(c.value)} onChange={e => onChange(e.target.checked)} className="h-[18px] w-[18px] accent-[#155660]" />
        {c.label}
      </label>
    );
  }
  if (c.kind === "choice") {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[14px]">{c.label}</span>
        <div role="radiogroup" aria-label={c.label} className="flex flex-wrap gap-1.5">
          {(c.options ?? []).map(o => (
            <button key={o} role="radio" aria-checked={c.value === o} onClick={() => onChange(o)}
              className={`min-h-9 rounded-full px-3.5 text-[13px] font-medium ${c.value === o ? "bg-[#155660] text-white" : "border border-[#d9d4c9]"}`}>{o}</button>
          ))}
        </div>
      </div>
    );
  }
  const steps = c.options ?? [], i = Number(c.value);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#6b7a7d]">Step {i + 1} of {steps.length}</span>
      <p className="text-[14px] font-medium">{steps[i]}</p>
      <div className="flex gap-2">
        <button onClick={() => onChange(Math.max(0, i - 1))} disabled={i === 0} className="min-h-9 flex-1 rounded-lg border border-[#d9d4c9] text-[13px] disabled:opacity-40">Back</button>
        <button onClick={() => onChange(Math.min(steps.length - 1, i + 1))} disabled={i >= steps.length - 1} className="min-h-9 flex-1 rounded-lg bg-[#155660] text-[13px] font-semibold text-white disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
