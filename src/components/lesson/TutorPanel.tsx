"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import type { Board } from "@/engine/lens/circuit/board";
import type { Lesson } from "@/engine/spec/lesson";
import type { TutorEvent } from "@/engine/tutor/prompt";

interface Msg { role: "user" | "assistant"; content: string; error?: boolean }

const STARTERS = ["I'm stuck. Can I have a hint?", "Why did that happen?", "Can you explain this another way?"];
const MAX_SENT = 40; // matches the route's limit

/** **bold** is the only formatting the tutor uses; render that and keep line breaks. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>)}</>;
}

export default function TutorPanel({ lesson, sceneIdx, getBoard }: { lesson: Lesson; sceneIdx: number; getBoard: () => Board }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => () => abort.current?.abort(), []);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    // Failed turns aren't part of the real conversation.
    const history = [...msgs.filter(m => !m.error), { role: "user" as const, content: q }];
    let sent = history.slice(-MAX_SENT);
    while (sent.length && sent[0].role !== "user") sent = sent.slice(1);
    setMsgs([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const patch = (fn: (m: Msg) => Msg) => setMsgs(ms => [...ms.slice(0, -1), fn(ms[ms.length - 1])]);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ lesson, sceneIndex: sceneIdx, board: getBoard(), messages: sent.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        patch(m => ({ ...m, content: data.error ?? "The tutor couldn't answer just now.", error: true }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const e = JSON.parse(line) as TutorEvent;
          if (e.t === "text") patch(m => ({ ...m, content: m.content + e.v }));
          else if (e.t === "error") patch(m => ({ ...m, content: m.content ? `${m.content}\n\n${e.v}` : e.v, error: true }));
        }
      }
    } catch {
      if (!ctrl.signal.aborted) patch(m => ({ ...m, content: "Couldn't reach the tutor. Check your connection and try again.", error: true }));
    } finally {
      // A stopped reply with no text yet shouldn't linger as an empty bubble.
      setMsgs(ms => (ms[ms.length - 1]?.role === "assistant" && !ms[ms.length - 1].content ? ms.slice(0, -1) : ms));
      setBusy(false);
      abort.current = null;
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--panel)] py-3 pr-5 pl-4 font-medium shadow-[0_8px_30px_rgba(0,0,0,0.45)] hover:border-[var(--flow)]">
        <Mark size={24} /> Ask the tutor
      </button>
    );
  }

  return (
    <aside aria-label="AI tutor"
      className="fixed right-4 bottom-4 z-40 flex h-[min(620px,calc(100dvh-32px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
      <header className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3">
        <Mark size={24} />
        <div className="flex flex-col leading-tight">
          <span className="font-semibold">Tutor</span>
          <span className="text-xs text-[var(--muted)]">Sees your circuit · numbers come from the solver</span>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close tutor" className="ml-auto rounded-lg px-2 py-1 text-xl leading-none text-[var(--muted)] hover:bg-[var(--raise)] hover:text-[var(--fg)]">×</button>
      </header>

      <div ref={list} aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] leading-relaxed text-[var(--muted)]">Kia ora! Ask me anything about this lesson. I can see your circuit as you change it, so try something and ask me what happened.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map(s => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-left text-sm text-[var(--muted)] hover:border-[var(--flow)] hover:text-[var(--fg)]">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
            m.role === "user" ? "self-end bg-[#16294A]" : m.error ? "self-start border border-[var(--bad)] bg-[#2A1517]" : "self-start bg-[var(--raise)]"}`}>
            {m.content ? <Rich text={m.content} /> : <span className="inline-flex gap-1 py-1" aria-label="Tutor is thinking">
              {[0, 1, 2].map(d => <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)]" style={{ animationDelay: `${d * 150}ms` }} />)}
            </span>}
          </div>
        ))}
      </div>

      <form onSubmit={e => { e.preventDefault(); send(draft); }} className="flex items-end gap-2 border-t border-[var(--line)] p-3">
        <label htmlFor="tutor-input" className="sr-only">Message the tutor</label>
        <textarea id="tutor-input" ref={input} value={draft} onChange={e => setDraft(e.target.value)} rows={1} maxLength={1000}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          placeholder="Ask a question…"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-[15px] placeholder:text-[var(--dim)]" />
        {busy
          ? <button type="button" onClick={() => abort.current?.abort()} className="h-[44px] rounded-xl border border-[var(--line)] px-4 text-sm">Stop</button>
          : <button type="submit" disabled={!draft.trim()} className="h-[44px] rounded-xl bg-[var(--flow)] px-4 text-sm font-semibold text-[var(--ink)] disabled:opacity-40">Send</button>}
      </form>
    </aside>
  );
}
