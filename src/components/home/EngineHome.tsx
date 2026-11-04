import Link from "next/link";
import Field from "@/components/brand/Field";
import { Wordmark } from "@/components/brand/Mark";

/**
 * The front door: pick an engine, then ask it anything. Physics and
 * Mathematics are live for the preview; the others are shown, greyed, as TBC.
 */

interface Engine { id: string; name: string; blurb: string; tag: string; href?: string; icon: React.ReactNode }

const INK = "#9aa6bd", WARM = "#f2a65a";

const ENGINES: Engine[] = [
  {
    id: "circuits", name: "Circuits", blurb: "Current, voltage and components", tag: "Circuit solver",
    icon: (
      <svg viewBox="0 0 120 80" className="h-full w-auto" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M30 20h18l4-6 6 12 6-12 6 12 4-6h16v40H30z" />
        <circle cx="90" cy="40" r="7" stroke={WARM} />
        <circle cx="30" cy="40" r="2.5" fill={INK} stroke="none" />
      </svg>
    ),
  },
  {
    id: "physics", name: "Physics", blurb: "Fields, forces, flight and flow", tag: "Field + motion", href: "/engine/physics",
    icon: (
      <svg viewBox="0 0 120 80" className="h-full w-auto" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <ellipse cx="60" cy="40" rx="44" ry="22" opacity="0.55" />
        <ellipse cx="60" cy="40" rx="30" ry="14" />
        <path d="M44 40h32" strokeWidth="5" stroke={WARM} />
        <path d="M60 40h16" strokeWidth="5" stroke="#cfd8e6" />
        <circle cx="101" cy="31" r="2.6" fill={INK} stroke="none" />
      </svg>
    ),
  },
  {
    id: "chemistry", name: "Chemistry", blurb: "Atoms, bonds and reactions", tag: "Molecular model",
    icon: (
      <svg viewBox="0 0 120 80" className="h-full w-auto" fill="none" stroke={INK} strokeWidth="1.6" aria-hidden="true">
        <path d="M40 24l20 16M60 40l20-12M60 40v18" />
        <circle cx="60" cy="40" r="10" fill="#1a2030" stroke={WARM} />
        <circle cx="38" cy="22" r="6" fill="#1a2030" />
        <circle cx="82" cy="26" r="6" fill="#1a2030" />
        <circle cx="60" cy="62" r="6" fill="#1a2030" />
      </svg>
    ),
  },
  {
    id: "maths", name: "Mathematics", blurb: "Fractions, functions and geometry", tag: "Symbolic + numeric", href: "/engine/maths",
    icon: (
      <svg viewBox="0 0 120 80" className="h-full w-auto" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M24 10v58h76" opacity="0.6" />
        <path d="M26 54c10-2 14-28 26-30s16 26 28 26 14-18 18-22" stroke="#cfd8e6" />
        <path d="M44 18l26 12" stroke={WARM} />
        <circle cx="56" cy="23.5" r="3" fill={WARM} stroke="none" />
      </svg>
    ),
  },
  {
    id: "biology", name: "Biology", blurb: "Cells, DNA and living systems", tag: "Systems model",
    icon: (
      <svg viewBox="0 0 120 80" className="h-full w-auto" fill="none" stroke={INK} strokeWidth="1.6" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => {
          const x = 24 + i * 9, a = Math.sin(i * 0.8) * 18;
          return <g key={i}><path d={`M${x} ${40 - a}V${40 + a}`} opacity="0.45" /><circle cx={x} cy={40 - a} r="2.6" fill={INK} stroke="none" /><circle cx={x} cy={40 + a} r="2.6" fill={i % 3 ? INK : WARM} stroke="none" /></g>;
        })}
      </svg>
    ),
  },
];

function Card({ e, i }: { e: Engine; i: number }) {
  const live = !!e.href;
  const body = (
    <>
      <div className="flex items-start justify-between">
        <div className="h-20">{e.icon}</div>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${live ? "text-[var(--volt)] ring-1 ring-[var(--volt)]/30" : "text-[var(--dim)] ring-1 ring-white/10"}`}>{live ? "Live" : "TBC"}</span>
      </div>
      <h2 className="mt-7 text-[21px] font-semibold tracking-[-0.02em]">{e.name}</h2>
      <p className="mt-1.5 text-[14px] leading-snug text-[var(--muted)]">{e.blurb}</p>
      <div className="mt-5 flex items-center justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--dim)]">{e.tag}</span>
        {live && <span aria-hidden="true" className="text-[var(--muted)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--fg)]">→</span>}
      </div>
    </>
  );
  const base = "anim-rise relative flex flex-col rounded-[20px] border p-6 text-left";
  const style = { animationDelay: `${0.25 + i * 0.07}s` };
  return live
    ? <Link href={e.href!} className={`${base} group border-white/[0.09] bg-white/[0.03] transition-all hover:-translate-y-0.5 hover:border-[var(--volt)]/35 hover:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-[var(--volt)]`} style={style}>{body}</Link>
    : <div aria-disabled="true" className={`${base} cursor-not-allowed border-white/[0.05] bg-white/[0.015] opacity-45 grayscale`} style={style}>{body}</div>;
}

export default function EngineHome() {
  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bg-[var(--ink)] text-[var(--fg)]">
      <Field className="fixed inset-0 h-full w-full opacity-40" />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,7,13,0.55)_0%,rgba(5,7,13,0.35)_45%,rgba(5,7,13,0.9)_100%)]" />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />

      <header className="relative z-10 flex items-center gap-4 px-4 py-4 sm:px-8">
        <Link href="/" className="text-[17px]"><Wordmark /></Link>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]">Parallax Engine · Preview</span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-4 pt-[11vh] pb-20 sm:px-8">
        <p className="anim-rise font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--volt)]">The Parallax Engine</p>
        <h1 className="anim-rise mt-4 text-center text-[clamp(2.3rem,5.4vw,4rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance" style={{ animationDelay: "0.06s" }}>
          What do you want to explore?
        </h1>
        <p className="anim-rise mt-4 text-center text-lg text-[var(--muted)]" style={{ animationDelay: "0.12s" }}>Pick an engine. Then ask for anything.</p>

        <div className="mt-14 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ENGINES.map((e, i) => <Card key={e.id} e={e} i={i} />)}
        </div>

        <p className="anim-fade mt-10 text-center text-sm text-[var(--dim)]" style={{ animationDelay: "0.8s" }}>
          Physics and Mathematics are live in this preview. More engines are on the way.
        </p>
      </main>
    </div>
  );
}
