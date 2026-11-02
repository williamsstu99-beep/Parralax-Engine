"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark, Wordmark } from "@/components/brand/Mark";
import Field from "@/components/brand/Field";
import Hero from "@/components/lesson/Hero";
import BuildStage from "@/components/lesson/BuildStage";
import LessonView from "@/components/lesson/LessonView";
import type { Lesson } from "@/engine/spec/lesson";
import type { LessonEvent } from "@/lib/lesson-events";
import { SCENES } from "@/lib/scenes";

type Stage = Extract<LessonEvent, { t: "stage" }>;
type Status =
  | { kind: "idle"; error?: { message: string; details?: string[] }; needsCode?: boolean }
  | { kind: "loading"; started: number; request: string; stage?: Stage; fixes: string[] }
  | { kind: "ready"; lesson: Lesson; example: boolean };


export default function LessonStudio() {
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const router = useRouter();
  // Whether this browser still needs the access code (null until we know).
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/access", { cache: "no-store" }).then(r => r.json()).then((d: { ok?: boolean }) => setLocked(!d.ok)).catch(() => setLocked(null));
  }, []);

  function generate(text: string) {
    if (!text.trim() || status.kind === "loading") return;
    // Ask for the code straight away rather than flashing the build screen first.
    if (locked) { setStatus({ kind: "idle", needsCode: true }); return; }
    void generateUnlocked(text);
  }

  async function generateUnlocked(text: string) {
    if (!text.trim()) return;
    const fail = (message: string, details?: string[]) => setStatus({ kind: "idle", error: { message, details } });
    setStatus({ kind: "loading", started: Date.now(), request: text.trim(), fixes: [] });
    try {
      // First: is this one of the hand-crafted simulations? If so, go straight there.
      const pick = await fetch("/api/scene", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: text }) })
        .then(r => (r.status === 401 ? { scene: "locked" } : r.ok ? r.json() : { scene: "other" })).catch(() => ({ scene: "other" })) as { scene: string };
      if (pick.scene === "locked") { setLocked(true); setStatus({ kind: "idle", needsCode: true }); return; }
      if (pick.scene !== "other") {
        setStatus(st => st.kind === "loading" ? { ...st, stage: { t: "stage", stage: "writing", label: "Building your simulation" } } : st);
        await new Promise(r => setTimeout(r, 1400)); // let the build animation play for a beat
        router.push(`/workshop/${pick.scene}`);
        return;
      }
      const res = await fetch("/api/lesson", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: text }) });
      if (res.status === 401) { setLocked(true); setStatus({ kind: "idle", needsCode: true }); return; }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        fail(data.error ?? "Something went wrong.", data.details);
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
          else if (e.t === "done") { finished = true; setStatus({ kind: "ready", lesson: e.lesson, example: false }); window.scrollTo({ top: 0 }); }
          else { finished = true; fail(e.error, e.details); }
        }
        if (done) break;
      }
      if (!finished) fail("The connection closed before the lesson was ready. Try again.");
    } catch {
      fail("Couldn't reach the server. Check your connection and try again.");
    }
  }

  /** Checks the access code; on success, carries straight on with the request. */
  async function unlock(code: string): Promise<string | null> {
    try {
      const res = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That code isn't right.";
    } catch { return "Couldn't check the code. Check your connection and try again."; }
    setLocked(false);
    void generateUnlocked(request);
    return null;
  }

  const ready = status.kind === "ready";
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--ink)] text-[var(--fg)]">
      {/* The living field sits behind the prompt and the build; lessons get a calmer glow. */}
      {!ready
        ? <Field className="fixed inset-0 h-full w-full opacity-90" />
        : <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(900px_500px_at_15%_-10%,rgba(110,231,255,0.10),transparent_60%),radial-gradient(800px_500px_at_95%_0%,rgba(167,139,250,0.08),transparent_60%)]" />}
      {!ready && <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,7,13,0.35)_0%,rgba(5,7,13,0.15)_45%,rgba(5,7,13,0.85)_100%)]" />}

      <header className="sticky top-0 z-30 flex items-center gap-4 px-4 py-3.5 sm:px-8">
        <div aria-hidden="true" className={`absolute inset-0 -z-10 transition-opacity ${ready ? "border-b border-[var(--line)] bg-[rgba(5,7,13,0.7)] backdrop-blur-xl" : "opacity-0"}`} />
        <button onClick={() => setStatus({ kind: "idle" })} className="flex items-center gap-2.5 text-[18px]" aria-label="Dynamic Learning, start a new lesson"><Mark size={26} /><Wordmark /></button>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {Object.values(SCENES).map(sc => <Link key={sc.id} href={`/workshop/${sc.id}`} className="hidden rounded-full px-3 py-2 text-[var(--muted)] hover:text-[var(--fg)] md:block">{sc.short}</Link>)}
          {ready && <button onClick={() => { setRequest(""); setStatus({ kind: "idle" }); }} className="btn-ghost ml-2 rounded-full px-4 py-2">New lesson</button>}
        </nav>
      </header>

      {status.kind === "ready" ? <LessonView lesson={status.lesson} example={status.example} />
        : status.kind === "loading" ? <BuildStage request={status.request} started={status.started} stage={status.stage} fixes={status.fixes} />
        : <Hero value={request} onChange={setRequest} onSubmit={() => generate(request)} busy={false} error={status.error} needsCode={!!status.needsCode} onUnlock={unlock} />}
    </div>
  );
}
