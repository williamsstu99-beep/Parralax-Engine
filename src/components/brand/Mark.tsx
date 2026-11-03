/**
 * The Parallax mark: an iris (deep blue, a bright cyan ring, a dark pupil with
 * a crescent glint) held in a thin pair of eyelids. The all-seeing eye, quietly.
 */
export function Mark({ size = 28, className }: { size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size * 1.3} height={(size * 1.3 * 30) / 44} viewBox="-22 -15 44 30" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="px-iris" cx="0" cy="0" r="11" gradientUnits="userSpaceOnUse">
          <stop offset="0.45" stopColor="#1f5bff" />
          <stop offset="1" stopColor="#0b2fd8" />
        </radialGradient>
        <linearGradient id="px-lid" x1="-21" y1="0" x2="21" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6ee7ff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#6ee7ff" stopOpacity="0.9" />
          <stop offset="0.7" stopColor="#6ee7ff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#6ee7ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="px-glint" x1="0" y1="-5" x2="0" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#bfefff" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* Eyelids */}
      <path d="M-21 0 Q0 -19 21 0" fill="none" stroke="url(#px-lid)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M-21 0 Q0 19 21 0" fill="none" stroke="url(#px-lid)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Iris, ring, pupil */}
      <circle r="11" fill="url(#px-iris)" />
      <circle r="7.6" fill="none" stroke="#38c8ff" strokeWidth="2.4" />
      <circle r="5.6" fill="#07101f" />
      {/* Crescent glint */}
      <path d="M0.6 -4.1 A4.2 4.2 0 1 1 0.6 4.1 A3.2 3.2 0 1 0 0.6 -4.1 Z" fill="url(#px-glint)" />
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
