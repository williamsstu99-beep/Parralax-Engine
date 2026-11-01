"use client";

import { useState } from "react";
import { Mark, Wordmark } from "@/components/brand/Mark";
import { safeNext } from "@/lib/safe-next";

export default function CodeForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      if (res.ok) {
        // Full navigation so the new cookie goes with the next request.
        window.location.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "That code isn't right.");
      setCode("");
    } catch {
      setError("Couldn't check the code. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[radial-gradient(1200px_600px_at_50%_-10%,#142242_0%,var(--ink)_60%)] px-4 text-center text-[var(--fg)]">
      <Mark size={72} stroke={2} />
      <h1 className="text-4xl tracking-tight sm:text-5xl"><Wordmark /></h1>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <label htmlFor="code" className="text-lg text-[var(--muted)]">Enter code</label>
        <input id="code" value={code} onChange={e => { setCode(e.target.value); setError(""); }} autoFocus
          inputMode="numeric" autoComplete="off" maxLength={32} disabled={busy} aria-invalid={!!error} aria-describedby={error ? "code-error" : undefined}
          className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] disabled:opacity-60 aria-invalid:border-[var(--bad)]" />
        <button type="submit" disabled={busy || !code.trim()}
          className="rounded-xl bg-[var(--flow)] px-6 py-3 font-semibold text-[var(--ink)] hover:brightness-110 disabled:opacity-50">{busy ? "Checking…" : "Enter"}</button>
        <p id="code-error" role="alert" className="min-h-6 text-sm text-[var(--bad)]">{error}</p>
      </form>
    </main>
  );
}
