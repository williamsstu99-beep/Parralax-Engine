import Link from "next/link";
import { Mark, Wordmark } from "@/components/brand/Mark";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[radial-gradient(1200px_600px_at_50%_-10%,#142242_0%,var(--ink)_60%)] px-4 text-center text-[var(--fg)]">
      <Mark size={88} stroke={2} />
      <div className="flex flex-col gap-3">
        <h1 className="text-5xl tracking-tight sm:text-6xl"><Wordmark /></h1>
        <p className="text-lg text-[var(--muted)]">Make the invisible visible.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/lesson" className="rounded-xl bg-[var(--flow)] px-6 py-3 font-semibold text-[var(--ink)] hover:brightness-110">Build a lesson</Link>
        <Link href="/lab/circuits" className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-3 font-semibold hover:bg-[var(--raise)]">Open the circuits lab</Link>
        <Link href="/lab/motion" className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-3 font-semibold hover:bg-[var(--raise)]">Open the motion lab</Link>
        <Link href="/lab/populations" className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-3 font-semibold hover:bg-[var(--raise)]">Open the populations lab</Link>
      </div>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--dim)]">Powered by the Parallax Engine</p>
    </main>
  );
}
