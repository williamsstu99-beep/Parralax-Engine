"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import CircuitLab from "@/components/lab/CircuitLab";
import MotionLab from "@/components/lab/MotionLab";
import PopulationLab from "@/components/lab/PopulationLab";
import ModelLab, { type ModelScene } from "@/components/lab/ModelLab";
import TutorPanel, { type Sim } from "@/components/lesson/TutorPanel";
import type { Lesson } from "@/engine/spec/lesson";
import { sceneBoard, toChallenge } from "@/engine/spec/validate";
import { motionScene } from "@/engine/spec/motion";
import { popScene } from "@/engine/spec/population";
import type { Sample } from "@/engine/lens/circuit/samples";
import type { Board } from "@/engine/lens/circuit/board";
import type { MotionSetup } from "@/engine/truth/motion/types";
import type { PopulationSetup } from "@/engine/truth/population/solver";

const ENGINE_LABEL = { circuits: "Circuits", motion: "Forces & motion", populations: "Populations", model: "Live model" } as const;
const LEVELS = [["simple", "Simple"], ["intermediate", "Deeper"], ["advanced", "Advanced"]] as const;

export default function LessonView({ lesson, example }: { lesson: Lesson; example: boolean }) {
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
  const checks = lesson.model ? lesson.model.facts.length + lesson.model.comparisons.length : 0;
  const go = (i: number) => { setSceneIdx(i); document.getElementById("scene-top")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-4 pt-8 pb-28 sm:px-8">
      <header className="flex flex-col gap-4">
        <div className="anim-rise flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          <span>Year {lesson.year_level}</span><span className="text-[var(--dim)]">/</span><span>{ENGINE_LABEL[lesson.engine]}</span>
          {example && <><span className="text-[var(--dim)]">/</span><span className="text-[var(--volt)]">Ready-made example</span></>}
          {checks > 0 && (
            <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-[var(--good)]/30 bg-[rgba(94,234,212,0.07)] px-2.5 py-1 normal-case tracking-normal text-[var(--good)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>
              Checked against {checks} real-world facts
            </span>
          )}
        </div>
        <h1 className="anim-rise max-w-4xl text-[clamp(2rem,4.6vw,3.6rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance" style={{ animationDelay: "0.06s" }}>{lesson.title}</h1>
        <p className="anim-rise max-w-3xl text-lg leading-relaxed text-[var(--muted)] text-pretty" style={{ animationDelay: "0.12s" }}>{lesson.objective}</p>
      </header>

      <nav id="scene-top" aria-label="Lesson steps" className="anim-rise -mx-1 flex scroll-mt-20 gap-1 overflow-x-auto pb-1" style={{ animationDelay: "0.18s" }}>
        {lesson.scenes.map((s, i) => {
          const active = i === sceneIdx, done = i < sceneIdx;
          return (
            <button key={i} onClick={() => go(i)} aria-current={active ? "step" : undefined}
              className={`group relative flex min-w-[180px] flex-1 flex-col gap-1.5 rounded-2xl px-4 py-3 text-left transition-colors ${active ? "bg-[rgba(110,231,255,0.07)]" : "hover:bg-white/[0.03]"}`}>
              <span className={`font-mono text-[11px] tracking-[0.14em] ${active ? "text-[var(--flow)]" : done ? "text-[var(--good)]" : "text-[var(--dim)]"}`}>{done ? "✓ " : ""}0{i + 1}</span>
              <span className={`text-[15px] leading-snug ${active ? "text-[var(--fg)]" : "text-[var(--muted)] group-hover:text-[var(--fg)]"}`}>{s.heading}</span>
              <span className={`absolute inset-x-4 bottom-0 h-[2px] rounded-full transition-all ${active ? "bg-[var(--flow)] shadow-[0_0_12px_var(--flow)]" : done ? "bg-[var(--good)]/50" : "bg-[var(--line)]"}`} />
            </button>
          );
        })}
        <a href="#questions" className="flex min-w-[150px] flex-col justify-center gap-1.5 rounded-2xl px-4 py-3 text-left text-[var(--muted)] hover:bg-white/[0.03] hover:text-[var(--fg)]">
          <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--dim)]">QUIZ</span>
          <span className="text-[15px]">Check your understanding</span>
        </a>
      </nav>

      <section key={sceneIdx} className="flex flex-col gap-6">
        <p className="anim-rise max-w-3xl border-l-2 border-[var(--flow)] pl-4 text-[18px] leading-relaxed text-[var(--fg)]/90 text-pretty">{scene.intro}</p>
        <div className="anim-rise" style={{ animationDelay: "0.08s" }}>
          {lesson.engine === "model" && lesson.model && modelScene ? <ModelLab key={modelScene.id} model={lesson.model} scene={modelScene} onValuesChange={onValuesChange} />
            : lesson.engine === "motion" && motion ? <MotionLab key={motion.id} initial={motion} embedded onSetupChange={onSetupChange} />
            : lesson.engine === "populations" && population ? <PopulationLab key={population.id} initial={population} embedded onSetupChange={onPopChange} />
            : <CircuitLab key={sample.id} initial={sample} embedded onBoardChange={onBoardChange} />}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <article className="glass rounded-3xl p-6 sm:p-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Why it happens</h2>
              <div role="group" aria-label="Explanation level" className="hairline flex rounded-full p-1">
                {LEVELS.map(([k, label]) => (
                  <button key={k} onClick={() => setLevel(k)} aria-pressed={level === k}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${level === k ? "bg-white/10 text-[var(--fg)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}>{label}</button>
                ))}
              </div>
            </div>
            <p key={level} className="anim-fade max-w-3xl text-[17px] leading-relaxed text-[var(--fg)]/90 text-pretty">{scene.explain[level]}</p>
          </article>
          <aside className="glass rounded-3xl p-6 sm:p-7">
            <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em]">Try this</h2>
            <ul className="flex flex-col gap-3 text-[15px] leading-snug">
              {scene.try_this.map((t, i) => (
                <li key={i} className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(110,231,255,0.12)] font-mono text-[11px] text-[var(--flow)]">{i + 1}</span><span className="text-[var(--fg)]/90">{t}</span></li>
              ))}
            </ul>
          </aside>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button onClick={() => go(sceneIdx - 1)} disabled={sceneIdx === 0} className="btn-ghost rounded-full px-5 py-2.5 text-sm disabled:invisible">← {lesson.scenes[sceneIdx - 1]?.heading ?? "Back"}</button>
          {sceneIdx < lesson.scenes.length - 1
            ? <button onClick={() => go(sceneIdx + 1)} className="btn-primary rounded-full px-5 py-2.5 text-sm">Next: {lesson.scenes[sceneIdx + 1].heading} →</button>
            : <a href="#questions" className="btn-primary rounded-full px-5 py-2.5 text-sm">Check your understanding →</a>}
        </div>
      </section>

      <Questions lesson={lesson} />

      <details className="glass group rounded-3xl p-6 sm:p-7">
        <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold">
          For the teacher
          <span className="text-[var(--muted)] transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="mt-4 flex flex-col gap-4 text-[15px] leading-relaxed text-[var(--muted)]">
          <p>{lesson.teacher_notes}</p>
          {lesson.model && <p><span className="text-[var(--fg)]">What the model leaves out: </span>{lesson.model.simplifications}</p>}
          <div>
            <p className="font-medium text-[var(--fg)]">Key ideas</p>
            <ul className="mt-1 list-disc pl-5">{lesson.key_ideas.map((k, i) => <li key={i}>{k}</li>)}</ul>
          </div>
          <p className="text-sm text-[var(--dim)]">Curriculum alignment isn&apos;t checked against official NZ curriculum documents yet. Review the content before using it with a class.</p>
        </div>
      </details>

      <TutorPanel lesson={lesson} sceneIdx={sceneIdx} getSim={getSim} />
    </main>
  );
}

function Questions({ lesson }: { lesson: Lesson }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const score = lesson.questions.filter((q, i) => picked[i] === q.answer_index).length;
  const answered = Object.keys(picked).length;
  return (
    <section id="questions" className="flex scroll-mt-8 flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Quiz</p>
          <h2 className="mt-1 text-[clamp(1.5rem,3vw,2.2rem)] font-semibold tracking-[-0.03em]">Check your understanding</h2>
        </div>
        {answered > 0 && (
          <span className="hairline rounded-full px-3 py-1.5 font-mono text-sm">
            <span className={score === answered ? "text-[var(--good)]" : "text-[var(--fg)]"}>{score}</span><span className="text-[var(--muted)]"> / {lesson.questions.length}</span>
          </span>
        )}
      </div>
      <ol className="grid gap-5 md:grid-cols-2">
        {lesson.questions.map((q, i) => {
          const chosen = picked[i];
          return (
            <li key={i} className="glass flex flex-col gap-4 rounded-3xl p-6">
              <p className="text-[17px] leading-snug font-medium text-pretty"><span className="mr-2 font-mono text-sm text-[var(--flow)]">{String(i + 1).padStart(2, "0")}</span>{q.question}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.choices.map((c, j) => {
                  const right = j === q.answer_index, mine = j === chosen;
                  const state = chosen === undefined ? "hover:border-[var(--flow)]/60 hover:bg-[rgba(110,231,255,0.05)]"
                    : right ? "border-[var(--good)]/70 bg-[rgba(94,234,212,0.08)] text-[var(--fg)]" : mine ? "border-[var(--bad)]/70 bg-[rgba(255,122,133,0.08)]" : "opacity-45";
                  return (
                    <button key={j} disabled={chosen !== undefined} onClick={() => setPicked(p => ({ ...p, [i]: j }))}
                      className={`rounded-2xl border border-[var(--line)] px-4 py-3 text-left text-[15px] leading-snug transition-all ${state}`}>{c}</button>
                  );
                })}
              </div>
              {chosen !== undefined && (
                <p className="anim-rise text-[15px] leading-relaxed text-[var(--muted)]">
                  <b className={chosen === q.answer_index ? "text-[var(--good)]" : "text-[var(--bad)]"}>{chosen === q.answer_index ? "Correct. " : "Not quite. "}</b>{q.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
