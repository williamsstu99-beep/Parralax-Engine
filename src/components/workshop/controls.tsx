"use client";

/** Big, friendly controls for the workshop: no units, no decimals, just "more" and "less". */

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, left, right, width = 200 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; left?: string; right?: string; width?: number;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-2.5 text-xs text-[var(--muted)]">
        {left && <span>{left}</span>}
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
          aria-label={label} style={{ width, "--fill": `${fill}%` } as React.CSSProperties} />
        {right && <span>{right}</span>}
      </span>
    </label>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-3 text-sm font-medium">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--flow)] shadow-[0_0_14px_rgba(110,231,255,0.6)]" : "bg-white/10"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
      {label}
    </button>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm font-medium">{label}</span>}
      <div role="radiogroup" aria-label={label} className="hairline flex rounded-full p-1">
        {options.map(([v, text]) => (
          <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${value === v ? "bg-white/12 bg-white/10 text-[var(--fg)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}>{text}</button>
        ))}
      </div>
    </div>
  );
}

export function Button({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return <button onClick={onClick} className={`${primary ? "btn-primary" : "btn-ghost"} rounded-full px-4 py-2 text-sm`}>{children}</button>;
}

/** A number with − and + buttons, for small whole-number choices. */
export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = "flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-[var(--fg)] ring-1 ring-white/10 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <button className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer: ${label}`}>−</button>
        <output aria-live="polite" className="w-8 text-center font-mono text-lg tabular-nums">{value}</output>
        <button className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More: ${label}`}>+</button>
      </div>
    </div>
  );
}
