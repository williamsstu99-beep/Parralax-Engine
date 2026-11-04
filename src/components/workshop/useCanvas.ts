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
 * A force arrow in an engineering-drawing style: a fine solid shaft, a slim
 * head, a small tracked-out label, and no glow. The colour defaults to near
 * white; the label sits past the tip on whichever side the arrow points.
 */
export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = "rgba(236, 241, 248, 0.95)", label?: string) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 6) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, head = Math.min(10, len * 0.4), wide = head * 0.36;
  const bx = x2 - ux * head, by = y2 - uy * head;
  ctx.save();
  ctx.shadowBlur = 0; ctx.lineCap = "butt"; ctx.lineJoin = "miter";
  // A thin dark keyline underneath keeps it legible over bright particles.
  ctx.strokeStyle = "rgba(4, 6, 12, 0.5)"; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx + ux, by + uy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(bx - uy * wide, by + ux * wide); ctx.lineTo(bx + uy * wide, by - ux * wide); ctx.closePath(); ctx.fill();
  // A short perpendicular tick marks where the force acts.
  ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(x1 - uy * 4, y1 + ux * 4); ctx.lineTo(x1 + uy * 4, y1 - ux * 4); ctx.stroke();
  if (label) {
    ctx.font = font(600, 11); ctx.textBaseline = "middle";
    try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.5px"; } catch { /* older browsers */ }
    const text = label.toUpperCase();
    if (Math.abs(uy) > Math.abs(ux)) { ctx.textAlign = "left"; ctx.fillText(text, x2 + 8, y2 + uy * 4); }
    else { ctx.textAlign = ux > 0 ? "left" : "right"; ctx.fillText(text, x2 + ux * 8, y2 - 10); }
  }
  ctx.restore();
}
