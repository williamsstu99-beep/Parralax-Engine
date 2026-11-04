export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`tracking-[-0.03em] ${className ?? ""}`}>
      <b className="font-semibold">Dynamic</b> <span className="font-normal text-[#A9B6D3]">Learning</span>
    </span>
  );
}
