/**
 * Runs inside the locked-down simulation frame (a sandboxed iframe with no
 * network access). Receives a scene script, checks it, then animates it and
 * reports controls, captions and errors back to the page.
 */

import { buildScene, validate, type Bounds, type Scene, type Values } from "./core";
import { Renderer } from "./draw";

let scene: Scene | null = null, code = "", values: Values = {}, bounds: Bounds | null = null;
let renderer: Renderer;
let lastCaption = "", lastPaused = false, captionAt = 0, last = 0;

const canvas = document.createElement("canvas");
canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;display:block";
document.body.style.margin = "0";
document.body.style.background = "#0a2a31";
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;
let w = 0, h = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  w = window.innerWidth; h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

type Out =
  | { type: "ready"; controls: Scene["controls"]; title: string | null; warnings: string[] }
  | { type: "error"; errors: string[] }
  | { type: "caption"; text: string }
  | { type: "paused"; paused: boolean };
const post = (m: Out) => parent.postMessage({ source: "parallax-kit", ...m }, "*");

function start() {
  const report = validate(code, values);
  if (!report.ok) { scene = null; post({ type: "error", errors: report.errors }); return; }
  try { scene = buildScene(code, values); }
  catch (e) { scene = null; post({ type: "error", errors: [(e as Error).message] }); return; }
  bounds = report.bounds; renderer = new Renderer(ctx);
  lastCaption = ""; lastPaused = false; last = performance.now();
  post({ type: "ready", controls: scene.controls, title: scene.title, warnings: report.warnings });
}

window.addEventListener("message", e => {
  if (e.source !== parent) return;
  const m = e.data as { type?: string; code?: string; values?: Values; label?: string; value?: number | boolean | string };
  if (m.type === "load" && typeof m.code === "string") { code = m.code; values = { ...(m.values ?? {}) }; start(); }
  else if (m.type === "set" && typeof m.label === "string" && m.value !== undefined) {
    values[m.label] = m.value;
    const c = scene?.controls.find(x => x.label === m.label);
    if (c && c.live) c.value = m.value; else start();
  } else if (m.type === "restart") start();
});

function frame(now: number) {
  requestAnimationFrame(frame);
  if (!scene) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try {
    scene.world.advance(dt);
    renderer.render(scene, w, h, bounds);
    if (now - captionAt > 200) {
      captionAt = now;
      const text = scene.caption?.() ?? "";
      if (text !== lastCaption) { lastCaption = text; post({ type: "caption", text }); }
      if (scene.world.paused !== lastPaused) { lastPaused = scene.world.paused; post({ type: "paused", paused: lastPaused }); }
    }
  } catch (e) {
    scene = null;
    post({ type: "error", errors: [`The simulation stopped: ${(e as Error).message}`] });
  }
}
requestAnimationFrame(frame);
