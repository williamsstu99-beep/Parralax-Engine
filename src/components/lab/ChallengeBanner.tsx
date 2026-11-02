/** The challenge strip shown above every lab: goal, then live feedback, then a tick when it's solved. */
export default function ChallengeBanner({ title, goal, done, message }: { title: string; goal: string; done: boolean; message: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-5 py-3.5 transition-colors ${done ? "border-[var(--good)]/50 bg-[rgba(94,234,212,0.08)]" : "glass"}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-[var(--good)] text-[#04120f]" : "bg-[rgba(255,181,71,0.14)] text-[var(--volt)]"}`}>
        {done ? "✓" : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-[var(--muted)]">{goal}</p>
      </div>
      <span role="status" className={`ml-auto text-sm ${done ? "font-medium text-[var(--good)]" : "text-[var(--fg)]/85"}`}>{message}</span>
    </div>
  );
}
