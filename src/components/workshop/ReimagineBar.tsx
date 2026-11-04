"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SCENES, type SceneId } from "@/lib/scenes";

/**
 * "Reimagine it": ask for the same idea seen a different way. The engine picks
 * (or builds) the new picture, the current one dissolves, and the new one
 * draws itself in.
 */
export default function ReimagineBar({ id, onLeave }: { id: SceneId; onLeave: (label: string) => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const ideas = SCENES[id].reimagine;

  async function go(request: string, direct?: SceneId) {
    if (!request.trim() || busy) return;
    setBusy(true); setNote(""); setText(request);
    onLeave("Reimagining");
    const started = Date.now();
    let to: string = direct ?? "other";
    if (!direct) {
      try {
        const res = await fetch("/api/scene", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request, from: id }) });
        to = res.ok ? ((await res.json()) as { scene: string }).scene : "other";
      } catch { to = "other"; }
    }
    await new Promise(r => setTimeout(r, Math.max(0, 1100 - (Date.now() - started)))); // let the dissolve play
    if (to === id) { setBusy(false); onLeave(""); setNote("That's what you're looking at. Try asking for it a different way."); return; }
    router.push(to === "other" ? `/engine/${SCENES[id].engine}?build=${encodeURIComponent(request)}` : `/workshop/${to}`);
  }

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <form onSubmit={e => { e.preventDefault(); void go(text); }}
        className="glass group flex min-w-0 flex-1 items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4 transition-shadow focus-within:shadow-[0_0_0_1px_rgba(110,231,255,0.5),0_0_40px_-12px_rgba(110,231,255,0.6)]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--flow)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        </svg>
        <label htmlFor="reimagine" className="sr-only">Reimagine this simulation</label>
        <input id="reimagine" value={text} onChange={e => { setText(e.target.value); setNote(""); }} disabled={busy} maxLength={400} autoComplete="off"
          placeholder={`Reimagine it… “${ideas[0]?.prompt ?? "show it another way"}”`}
          onKeyDown={e => { if (e.key === "Tab" && !text && ideas[0] && !e.shiftKey) { e.preventDefault(); setText(ideas[0].prompt); } }}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-[var(--dim)] disabled:opacity-60" />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm">
          {busy ? "Reimagining…" : "Reimagine"}
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {ideas.map(r => (
          <button key={r.to} onClick={() => void go(r.prompt, r.to)} disabled={busy}
            className="hairline rounded-full px-3.5 py-2 text-[13px] text-[var(--muted)] transition-colors hover:border-[var(--flow)]/50 hover:text-[var(--fg)] disabled:opacity-50">
            {r.prompt}
          </button>
        ))}
      </div>
      {note && <p role="status" className="text-sm text-[var(--muted)]">{note}</p>}
    </div>
  );
}
