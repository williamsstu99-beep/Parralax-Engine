"use client";

import { useEffect, useRef } from "react";

export interface Frame {
  ctx: CanvasRenderingContext2D;
  /** Canvas size in CSS pixels. */
  w: number;
  h: number;
  /** Seconds since the last frame (capped, so a background tab doesn't jump). */
  dt: number;
  /** Seconds since the scene started. */
  time: number;
}

/**
 * Runs `draw` every animation frame on a crisp, DPR-aware canvas that fills
 * its parent. `draw` is read through a ref, so it can use the latest props
 * without restarting the loop. Pauses while the tab is hidden.
 */
export function useCanvas(draw: (f: Frame) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0, last = performance.now(), time = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; time += dt;
      if (w > 0 && h > 0) drawRef.current({ ctx, w, h, dt, time });
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return ref;
}

/** Ease towards a target: frame-rate independent smoothing. */
export const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Seeded random numbers, so scenes look the same every time they open. */
export function rng(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

/** A canvas font string using the page's own typeface (canvas can't read CSS variables). */
let family = "";
export function font(weight: number, px: number) {
  if (!family && typeof document !== "undefined") family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  return `${weight} ${px}px ${family || "system-ui, sans-serif"}`;
}

/**
 * A crisp force arrow: thin solid shaft, slim head, a dark under-stroke so it
 * reads on busy backgrounds without any glow. Draws from (x1,y1) to (x2,y2).
 */
export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, label?: string) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 6) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, head = Math.min(12, len * 0.45), wide = head * 0.42;
  const bx = x2 - ux * head, by = y2 - uy * head;
  const shape = () => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx + ux * 1.5, by + uy * 1.5);
  };
  const tip = () => {
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(bx - uy * wide, by + ux * wide); ctx.lineTo(bx + uy * wide, by - ux * wide); ctx.closePath();
  };
  ctx.save();
  ctx.shadowBlur = 0; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(5, 7, 13, 0.55)"; ctx.lineWidth = 5; shape(); ctx.stroke(); tip(); ctx.stroke();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; shape(); ctx.stroke(); tip(); ctx.fill();
  ctx.beginPath(); ctx.arc(x1, y1, 2.5, 0, Math.PI * 2); ctx.fill();
  if (label) {
    ctx.font = font(600, 13); ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(label, x2 + 10, y2 + uy * 2);
  }
  ctx.restore();
}
