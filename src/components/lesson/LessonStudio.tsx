"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CircuitLab from "@/components/lab/CircuitLab";
import MotionLab from "@/components/lab/MotionLab";
import PopulationLab from "@/components/lab/PopulationLab";
import ModelLab, { type ModelScene } from "@/components/lab/ModelLab";
import TutorPanel from "@/components/lesson/TutorPanel";
import { Mark, Wordmark } from "@/components/brand/Mark";
import { EXAMPLE_LESSON, MODEL_EXAMPLE, MOTION_EXAMPLE } from "@/engine/spec/fixture";
import { popScene } from "@/engine/spec/population";
import type { PopulationSetup } from "@/engine/truth/population/solver";
import { motionScene } from "@/engine/spec/motion";
import type { MotionSetup } from "@/engine/truth/motion/types";
import type { Sim } from "@/components/lesson/TutorPanel";
import type { Lesson } from "@/engine/spec/lesson";
import { sceneBoard, toChallenge } from "@/engine/spec/validate";
import type { Sample } from "@/engine/lens/circuit/samples";
import type { Board } from "@/engine/lens/circuit/board";
import type { LessonEvent } from "@/lib/lesson-events";

const EXAMPLES = [
  "Year 10: what happens to blood sugar after a meal?",
  "Year 11: why do reactions go faster when it's hotter?",
  "Year 9: why does a cup of tea cool fast, then slowly?",
  "Year 12: how does the heart pump blood around the body?",
  "Year 9: why do bulbs in series get dimmer?",
  "Year 10: what angle throws a ball furthest?",
];
const STEPS: { key: Stage["stage"]; label: string }[] = [
  { key: "engine", label: "Reading your request" },
  { key: "planning", label: "Working out the science" },
  { key: "writing", label: "Writing the simulation and lesson" },
  { key: "checking", label: "Running it and checking real-world facts" },
];
const ENGINE_LABEL = { circuits: "Circuits", motion: "Motion", populations: "Populations", model: "Simulation" } as const;

type Stage = Extract<LessonEvent, { t: "stage" }>;
type Status = { kind: "idle" } | { kind: "loading"; started: number; stage?: Stage; fixes: string[] } | { kind: "error"; message: string; details?: string[] } | { kind: "ready"; lesson: Lesson; example: boolean };

export default function LessonStudio() {
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function generate(text: string) {
    if (!text.trim()) return;
    const started = Date.now();
    setStatus({ kind: "loading", started, fixes: [] });
    try {
      const res = await fetch("/api/lesson", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: text }) });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setStatus({ kind: "error", message: data.error ?? "Something went wrong.", details: data.details });
        return;
      }
      // The server streams progress, then the lesson (one JSON object per line).
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "", finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        buf += done ? "\n" : value; // flush a last line with no newline
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const e = JSON.parse(line) as LessonEvent;
          if (e.t === "stage") setStatus(st => st.kind === "loading" ? { ...st, stage: e, fixes: e.stage === "fixing" && e.detail ? [...st.fixes, e.detail] : st.fixes } : st);
          else if (e.t === "done") { finished = true; setStatus({ kind: "ready", lesson: e.lesson, example: false }); }
          else { finished = true; setStatus({ kind: "error", message: e.error, details: e.details }); }
        }
        if (done) break;
      }
      if (!finished) setStatus({ kind: "error", message: "The connection closed before the lesson was ready. Try again." });
    } catch {
      setStatus({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--fg)]">
      <header className="flex items-center gap-4 border-b border-[var(--line)] px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-[19px]"><Mark size={28} /><Wordmark /></Link>
        <span className="hidden text-[var(--muted)] sm:inline">/</span>
        <span className="font-medium">Lesson studio</span>
        {status.kind === "ready" && (
          <button onClick={() => setStatus({ kind: "idle" })} className="ml-auto rounded-lg border border-[var(--line)] bg-[var(--raise)] px-3 py-2 text-sm">New lesson</button>
        )}
      </header>

      {status.kind === "ready" ? (
        <LessonView lesson={status.lesson} example={status.example} />
      ) : (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 sm:py-24">
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl">What do you want to teach?</h1>
            <p className="text-lg text-[var(--muted)]">Describe a concept and a year level. Any science concept: human biology, chemistry or physics. You&apos;ll get an interactive simulation built for it, challenges, explanations at three levels, and questions. Every number comes from the engine, and every model is checked against real-world facts.</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); generate(request); }} className="flex flex-col gap-3">
            <label htmlFor="request" className="sr-only">Lesson request</label>
            <textarea id="request" value={request} onChange={e => setRequest(e.target.value)} rows={3} maxLength={1500} disabled={status.kind === "loading"}
              placeholder="e.g. I want my Year 10s to understand why parallel bulbs stay bright"
              className="w-full resize-none rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-lg leading-relaxed placeholder:text-[var(--dim)] disabled:opacity-60"
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(request); }} />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map(x => (
                <button key={x} type="button" onClick={() => setRequest(x)} disabled={status.kind === "loading"}
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] hover:border-[var(--flow)] hover:text-[var(--fg)]">{x}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button type="submit" disabled={status.kind === "loading" || !request.trim()}
                className="rounded-xl bg-[var(--flow)] px-6 py-3 font-semibold text-[var(--ink)] hover:brightness-110 disabled:opacity-50">Build the lesson</button>
              <button type="button" onClick={() => setStatus({ kind: "ready", lesson: EXAMPLE_LESSON, example: true })} disabled={status.kind === "loading"}
                className="text-sm text-[var(--muted)] underline underline-offset-4 hover:text-[var(--fg)]">See a pre-made example lesson</button>
              <button type="button" onClick={() => setStatus({ kind: "ready", lesson: MOTION_EXAMPLE, example: true })} disabled={status.kind === "loading"}
                className="text-sm text-[var(--muted)] underline underline-offset-4 hover:text-[var(--fg)]">a motion example</button>
              <button type="button" onClick={() => setStatus({ kind: "ready", lesson: MODEL_EXAMPLE, example: true })} disabled={status.kind === "loading"}
                className="text-sm text-[var(--muted)] underline underline-offset-4 hover:text-[var(--fg)]">or a heat example</button>
            </div>
          </form>
          {status.kind === "loading" && <Progress started={status.started} stage={status.stage} fixes={status.fixes} />}
          {status.kind === "error" && (
            <div role="alert" className="rounded-xl border border-[var(--bad)] bg-[#2A1517] px-4 py-3 text-sm">
              <p className="font-medium">{status.message}</p>
              {status.details && <ul className="mt-2 list-disc pl-5 text-[var(--muted)]">{status.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function Progress({ started, stage, fixes }: { started: number; stage?: Stage; fixes: string[] }) {
  const [now, setNow] = useState(started);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const secs = Math.max(0, Math.round((now - started) / 1000));
  // A repair loops back to "working out the science".
  const at = !stage ? 0 : stage.stage === "fixing" ? 1 : Math.max(0, STEPS.findIndex(st => st.key === stage.stage));
  return (
    <div aria-live="polite" className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-center gap-3">
        <Mark size={26} className="animate-pulse" />
        <span className="font-medium">{stage?.label ?? "Reading your request"}…</span>
        <span className="ml-auto font-mono text-sm text-[var(--muted)]">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
      </div>
      <ol className="flex flex-col gap-2">
        {STEPS.map((st, i) => (
          <li key={st.key} className={`flex items-center gap-2.5 text-sm ${i < at ? "text-[var(--muted)]" : i === at ? "text-[var(--fg)]" : "text-[var(--dim)]"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${i < at ? "border-[var(--good)] text-[var(--good)]" : i === at ? "border-[var(--flow)] text-[var(--flow)]" : "border-[var(--line)]"}`}>{i < at ? "✓" : i + 1}</span>
            {st.label}
            {i === at && stage?.stage === "writing" && !!stage.words && <span className="font-mono text-xs text-[var(--muted)]">{stage.words.toLocaleString("en-NZ")} words</span>}
          </li>
        ))}
      </ol>
      {fixes.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-[var(--volt)]/40 bg-[#2A2414] px-3 py-2 text-sm">
          {fixes.map((f, i) => <li key={i}>↻ {f}</li>)}
        </ul>
      )}
      <p className="text-sm text-[var(--muted)]">Usually 1–2 minutes. The simulation is built for your request, then the engine runs it and checks it against real-world facts. Anything that fails is sent back to be fixed automatically.</p>
    </div>
  );
}

const LEVELS = [["simple", "Simple"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]] as const;

function LessonView({ lesson, example }: { lesson: Lesson; example: boolean }) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [level, setLevel] = useState<(typeof LEVELS)[number][0]>("simple");
  const scene = lesson.scenes[sceneIdx];
  const sample: Sample = useMemo(() => ({
    id: `scene-${sceneIdx}`, title: scene.heading, summary: scene.intro, board: sceneBoard(scene),
    challenge: scene.challenge ? toChallenge(scene.challenge) : undefined,
  }), [scene, sceneIdx]);
  const motion = useMemo(() => (scene.motion ? motionScene(scene.motion, `scene-${sceneIdx}`, scene.heading, scene.intro) : null), [scene, sceneIdx]);
  const population = useMemo(() => (scene.population ? popScene(scene.population, `scene-${sceneIdx}`, scene.heading, scene.intro) : null), [scene, sceneIdx]);
  const modelScene: ModelScene | null = useMemo(() => (scene.setup ? { ...scene.setup, id: `scene-${sceneIdx}`, title: scene.heading, summary: scene.intro } : null), [scene, sceneIdx]);
  // The student's live simulation, read by the tutor when they send a message.
  const sim = useRef<Sim>({});
  const onBoardChange = useCallback((b: Board) => { sim.current = { board: b }; }, []);
  const onSetupChange = useCallback((m: MotionSetup) => { sim.current = { motion: m }; }, []);
  const onPopChange = useCallback((p: PopulationSetup) => { sim.current = { population: p }; }, []);
  const onValuesChange = useCallback((v: Record<string, number>) => { sim.current = { values: v }; }, []);
  const getSim = useCallback(() => sim.current, []);

  return (
    <main className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--raise)] px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Year {lesson.year_level}</span>
          <span className="rounded-full bg-[var(--raise)] px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[var(--muted)]">{ENGINE_LABEL[lesson.engine]}</span>
          {example && <span className="rounded-full border border-[var(--volt)] px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[var(--volt)]">Pre-made example</span>}
        </div>
        <h1 className="max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{lesson.title}</h1>
        <p className="max-w-3xl text-lg text-[var(--muted)]">{lesson.objective}</p>
      </section>

      <nav aria-label="Lesson steps" className="flex flex-wrap gap-2">
        {lesson.scenes.map((s, i) => (
          <button key={i} onClick={() => setSceneIdx(i)} aria-current={i === sceneIdx ? "step" : undefined}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${i === sceneIdx ? "border-[var(--flow)] bg-[#16294A]" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]"}`}>
            <span className="font-mono text-xs">{i + 1}</span>{s.heading}
          </button>
        ))}
        <a href="#questions" className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">Check your understanding</a>
      </nav>

      <section className="flex flex-col gap-4">
        <p className="max-w-3xl text-[17px] leading-relaxed">{scene.intro}</p>
        {lesson.engine === "model" && lesson.model && modelScene ? <ModelLab key={modelScene.id} model={lesson.model} scene={modelScene} onValuesChange={onValuesChange} />
          : lesson.engine === "motion" && motion ? <MotionLab key={motion.id} initial={motion} embedded onSetupChange={onSetupChange} />
          : lesson.engine === "populations" && population ? <PopulationLab key={population.id} initial={population} embedded onSetupChange={onPopChange} />
          : <CircuitLab key={sample.id} initial={sample} embedded onBoardChange={onBoardChange} />}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Why it happens</h2>
            <div role="group" aria-label="Explanation level" className="flex rounded-lg border border-[var(--line)] p-0.5">
              {LEVELS.map(([k, label]) => (
                <button key={k} onClick={() => setLevel(k)} aria-pressed={level === k}
                  className={`rounded-md px-3 py-1.5 text-sm ${level === k ? "bg-[var(--raise)] text-[var(--fg)]" : "text-[var(--muted)]"}`}>{label}</button>
              ))}
            </div>
          </div>
          <p className="max-w-3xl text-[17px] leading-relaxed">{scene.explain[level]}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <h2 className="mb-3 text-lg font-semibold">Try this</h2>
          <ul className="flex flex-col gap-2 text-[15px] leading-snug">
            {scene.try_this.map((t, i) => <li key={i} className="flex gap-2"><span className="text-[var(--flow)]">→</span><span>{t}</span></li>)}
          </ul>
        </div>
      </section>

      <Questions lesson={lesson} />

      <TutorPanel lesson={lesson} sceneIdx={sceneIdx} getSim={getSim} />

      <details className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <summary className="cursor-pointer text-lg font-semibold">Teacher notes</summary>
        <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-[var(--muted)]">
          <p>{lesson.teacher_notes}</p>
          <div>
            <p className="font-medium text-[var(--fg)]">Key ideas</p>
            <ul className="list-disc pl-5">{lesson.key_ideas.map((k, i) => <li key={i}>{k}</li>)}</ul>
          </div>
          <p className="text-sm">Curriculum alignment isn&apos;t checked against official NZ curriculum documents yet. Review the content before using it with a class.</p>
        </div>
      </details>
    </main>
  );
}

function Questions({ lesson }: { lesson: Lesson }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const score = lesson.questions.filter((q, i) => picked[i] === q.answer_index).length;
  const answered = Object.keys(picked).length;
  return (
    <section id="questions" className="flex flex-col gap-4 scroll-mt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">Check your understanding</h2>
        {answered > 0 && <span className="font-mono text-sm text-[var(--muted)]">{score} / {lesson.questions.length} correct</span>}
      </div>
      <ol className="grid gap-4 md:grid-cols-2">
        {lesson.questions.map((q, i) => {
          const chosen = picked[i];
          return (
            <li key={i} className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
              <p className="font-medium leading-snug"><span className="mr-2 font-mono text-sm text-[var(--muted)]">{i + 1}</span>{q.question}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.choices.map((c, j) => {
                  const state = chosen === undefined ? "" : j === q.answer_index ? "border-[var(--good)] bg-[#12291F]" : j === chosen ? "border-[var(--bad)] bg-[#2A1517]" : "opacity-60";
                  return (
                    <button key={j} disabled={chosen !== undefined} onClick={() => setPicked(p => ({ ...p, [i]: j }))}
                      className={`rounded-lg border border-[var(--line)] px-3 py-2 text-left text-sm ${state}`}>{c}</button>
                  );
                })}
              </div>
              {chosen !== undefined && <p className="text-sm leading-relaxed text-[var(--muted)]"><b className={chosen === q.answer_index ? "text-[var(--good)]" : "text-[var(--bad)]"}>{chosen === q.answer_index ? "Correct. " : "Not quite. "}</b>{q.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
