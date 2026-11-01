/** The Lissajous mark: a 3:2 oscilloscope figure. */
export function Mark({ size = 28, stroke = 2.4, className }: { size?: number; stroke?: number; className?: string }) {
  let d = "";
  for (let i = 0; i <= 120; i++) {
    const s = (i / 120) * Math.PI * 2;
    const x = 13 * Math.sin(3 * s + Math.PI / 2), y = 11.2 * Math.sin(2 * s);
    d += `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return (
    <svg width={size} height={(size * 30) / 34} viewBox="-17 -15 34 30" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="dl-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7FD8FF" />
          <stop offset=".55" stopColor="#9C8CFF" />
          <stop offset="1" stopColor="#FFB547" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#dl-mark)" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`tracking-[-0.03em] ${className ?? ""}`}>
      <b className="font-semibold">Dynamic</b> <span className="font-normal text-[#A9B6D3]">Learning</span>
    </span>
  );
}
