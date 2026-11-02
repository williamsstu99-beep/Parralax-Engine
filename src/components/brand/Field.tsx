"use client";

import { useEffect, useRef } from "react";

/**
 * A living backdrop: particles trace glowing trails through a slowly
 * shifting flow field and swirl around the pointer. Purely decorative.
 * Pauses when the tab is hidden; holds still for reduced-motion users.
 */
export default function Field({ className = "", density = 1 }: { className?: string; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, t = 0;
    const pointer = { x: -9999, y: -9999, active: false };
    type P = { x: number; y: number; life: number; hue: number };
    let ps: P[] = [];

    const seed = (p: P) => { p.x = Math.random() * w; p.y = Math.random() * h; p.life = 80 + Math.random() * 220; p.hue = Math.random(); return p; };
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(1400, (w * h) / 1500) * density);
      ps = Array.from({ length: n }, () => seed({ x: 0, y: 0, life: 0, hue: 0 }));
      ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, w, h);
    };

    // Smooth, slowly evolving angle field (sums of sines: cheap and calm).
    const angle = (x: number, y: number) => {
      const s = 0.0026;
      return Math.sin(x * s + t * 0.00035) * 1.6 + Math.cos(y * s * 1.3 - t * 0.00027) * 1.4 + Math.sin((x + y) * s * 0.6 + t * 0.0002);
    };

    const step = () => {
      t += 16;
      ctx.fillStyle = "rgba(5, 7, 13, 0.05)"; // fade old trails (lower = longer trails)
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 1.25;
      for (const p of ps) {
        let a = angle(p.x, p.y);
        if (pointer.active) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
          if (d2 < 32000) a += Math.atan2(dy, dx) + Math.PI / 2 * (1 - d2 / 32000); // swirl around the pointer
        }
        const nx = p.x + Math.cos(a) * 1.15, ny = p.y + Math.sin(a) * 1.15;
        const cyan = p.hue < 0.72;
        ctx.strokeStyle = cyan ? `rgba(110, 231, 255, ${0.28 + 0.3 * (p.life % 40) / 40})` : "rgba(167, 139, 250, 0.45)";
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
        p.x = nx; p.y = ny; p.life--;
        if (p.life <= 0 || p.x < -5 || p.y < -5 || p.x > w + 5 || p.y > h + 5) seed(p);
      }
    };

    const loop = () => { step(); raf = requestAnimationFrame(loop); };
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) raf = requestAnimationFrame(loop); };
    const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true; };
    const onLeave = () => { pointer.active = false; };

    resize();
    if (reduce) { for (let i = 0; i < 160; i++) step(); }
    else raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [density]);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
