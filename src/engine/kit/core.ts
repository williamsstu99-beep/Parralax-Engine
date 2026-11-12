/**
 * The scene runtime. A scene script is a short piece of JavaScript that uses
 * `world`, `show`, `ui`, `maths` and `fields` to arrange tested building
 * blocks. It never computes physics itself: every number comes from World.
 */

import { Body, Fields, type Num, type Vec, World, val } from "./world";

export type Colour = "white" | "blue" | "warm" | "grey";
type When = { visible?: () => boolean };
type At = Body | Vec | (() => Vec);
const at = (a: At): (() => Vec) => (a instanceof Body ? () => a.pos() : typeof a === "function" ? a : () => a);

export type Drawable =
  | ({ type: "arrow"; vec: () => Vec; from: () => Vec; scale: number; label?: string; colour: Colour } & When)
  | ({ type: "trace"; body: Body; seconds: number; colour: Colour } & When)
  | ({ type: "label"; text: () => string; at: () => Vec; colour: Colour } & When)
  | ({ type: "wave"; amplitude: () => number; wavelength: () => number; speed: () => number; y: number; x: [number, number]; standing: boolean; colour: Colour } & When)
  | ({ type: "line"; points: () => Vec[]; colour: Colour; dashed: boolean } & When);

export type MathItem =
  | ({ type: "plot"; fn: (x: number, t: number) => number; x: [number, number]; y: [number, number]; label?: string; points: { x: () => number; label?: string }[] } & When)
  | ({ type: "numberLine"; min: number; max: number; step: number; value: () => number; label?: string; fractions: boolean } & When)
  | ({ type: "fractionBar"; parts: () => number; shaded: () => number; label?: string } & When)
  | ({ type: "hundredGrid"; value: () => number; label?: string } & When);

export type ControlValue = number | boolean | string;
export interface Control {
  kind: "slider" | "toggle" | "choice" | "steps";
  label: string; value: ControlValue; live: boolean;
  min?: number; max?: number; step?: number; unit?: string; options?: string[];
}

export interface Scene {
  world: World; fields: Fields; drawables: Drawable[]; maths: MathItem[];
  controls: Control[]; caption: (() => string) | null; title: string | null;
}

/** Saved control values, keyed by label, so a restart keeps what the viewer chose. */
export type Values = Record<string, ControlValue>;

const colour = (c: unknown): Colour => (c === "blue" || c === "warm" || c === "grey" ? c : "white");

function makeApi(scene: Scene, values: Values) {
  const { world, fields } = scene;
  const control = <T extends ControlValue>(c: Control): (() => T) => {
    if (scene.controls.some(x => x.label === c.label)) throw new Error(`Two controls are called "${c.label}". Give each control its own label.`);
    if (scene.controls.length >= 6) throw new Error("Too many controls: use at most 6.");
    if (c.label in values) c.value = values[c.label];
    scene.controls.push(c);
    return () => c.value as T;
  };
  const ui = {
    slider(label: string, o: { min: number; max: number; value?: number; step?: number; unit?: string; live?: boolean }) {
      if (!(o.max > o.min)) throw new Error(`Slider "${label}" needs max greater than min.`);
      const v = Math.min(o.max, Math.max(o.min, o.value ?? o.min));
      return control<number>({ kind: "slider", label, value: v, live: !!o.live, min: o.min, max: o.max, step: o.step ?? (o.max - o.min) / 100, unit: o.unit });
    },
    toggle(label: string, value = false, o: { live?: boolean } = {}) {
      return control<boolean>({ kind: "toggle", label, value, live: o.live ?? true });
    },
    choice(label: string, options: string[], value?: string) {
      if (!options.length) throw new Error(`Choice "${label}" needs at least one option.`);
      return control<string>({ kind: "choice", label, value: value ?? options[0], live: false, options });
    },
    /** A sequence of named steps the teacher moves through. Returns the current step number (0-based). */
    steps(titles: string[]) {
      if (!titles.length) throw new Error("ui.steps needs at least one step title.");
      const get = control<number>({ kind: "steps", label: "Step", value: 0, live: true, options: titles });
      return () => Math.max(0, Math.min(titles.length - 1, Math.round(get())));
    },
  };
  const show = {
    arrow(vec: () => Vec, o: { from: At; scale?: number; label?: string; colour?: Colour } & When) {
      scene.drawables.push({ type: "arrow", vec, from: at(o.from), scale: o.scale ?? 1, label: o.label, colour: colour(o.colour), visible: o.visible });
    },
    trace(body: Body, o: { seconds?: number; colour?: Colour } & When = {}) {
      scene.drawables.push({ type: "trace", body, seconds: o.seconds ?? 3, colour: colour(o.colour ?? "blue"), visible: o.visible });
    },
    label(text: string | (() => string), o: { at: At; colour?: Colour } & When) {
      scene.drawables.push({ type: "label", text: typeof text === "function" ? text : () => text, at: at(o.at), colour: colour(o.colour), visible: o.visible });
    },
    line(points: Vec[] | (() => Vec[]), o: { colour?: Colour; dashed?: boolean } & When = {}) {
      scene.drawables.push({ type: "line", points: typeof points === "function" ? points : () => points, colour: colour(o.colour ?? "grey"), dashed: !!o.dashed, visible: o.visible });
    },
    wave(o: { amplitude: Num; wavelength: Num; speed?: Num; y?: number; x?: [number, number]; standing?: boolean; colour?: Colour } & When) {
      const fn = (n: Num) => () => val(n);
      const wave = { type: "wave" as const, amplitude: fn(o.amplitude), wavelength: fn(o.wavelength), speed: fn(o.speed ?? 1), y: o.y ?? 0, x: o.x ?? [0, 10] as [number, number], standing: !!o.standing, colour: colour(o.colour ?? "blue"), visible: o.visible };
      scene.drawables.push(wave);
      return {
        /** Waves passing a point each second, Hz. */
        frequency: () => wave.speed() / Math.max(1e-9, wave.wavelength()),
        /** Time for one wave to pass, s. */
        period: () => Math.max(1e-9, wave.wavelength()) / Math.max(1e-9, wave.speed()),
      };
    },
    /** One plain-English sentence under the stage; can include live numbers from the world. */
    caption(text: string | (() => string)) { scene.caption = typeof text === "function" ? text : () => text; },
    title(text: string) { scene.title = text; },
  };
  const maths = {
    plot(fn: (x: number, t: number) => number, o: { x: [number, number]; y: [number, number]; label?: string } & When) {
      const item = { type: "plot" as const, fn, x: o.x, y: o.y, label: o.label, points: [] as { x: () => number; label?: string }[], visible: o.visible };
      scene.maths.push(item);
      return { point(x: Num, p: { label?: string } = {}) { item.points.push({ x: () => val(x), label: p.label }); } };
    },
    numberLine(o: { min: number; max: number; step?: number; value?: Num; label?: string; fractions?: boolean } & When) {
      scene.maths.push({ type: "numberLine", min: o.min, max: o.max, step: o.step ?? 1, value: () => (o.value === undefined ? NaN : val(o.value)), label: o.label, fractions: !!o.fractions, visible: o.visible });
    },
    fractionBar(o: { parts: Num; shaded: Num; label?: string } & When) {
      scene.maths.push({ type: "fractionBar", parts: () => val(o.parts), shaded: () => val(o.shaded), label: o.label, visible: o.visible });
    },
    /** A 10 × 10 grid with the given fraction (0 to 1) shaded. */
    hundredGrid(o: { value: Num; label?: string } & When) {
      scene.maths.push({ type: "hundredGrid", value: () => val(o.value), label: o.label, visible: o.visible });
    },
  };
  const fieldApi = {
    charge(o: { x: number; y: number; q: number }) { fields.charges.push({ x: o.x, y: o.y, q: o.q }); },
    uniform(o: { strength: number; angle?: number }) {
      const a = ((o.angle ?? -90) * Math.PI) / 180;
      fields.uniformE = [o.strength * Math.cos(a), o.strength * Math.sin(a)];
    },
    strength(x: number, y: number) { const e = fields.E(x, y); return Math.hypot(e[0], e[1]); },
  };
  return { world, show, ui, maths, fields: fieldApi };
}

/** Run a scene script and return the scene it builds. Throws on script errors. */
export function buildScene(code: string, values: Values = {}): Scene {
  const fields = new Fields();
  const scene: Scene = { world: new World(fields), fields, drawables: [], maths: [], controls: [], caption: null, title: null };
  const api = makeApi(scene, values);
  const run = new Function("world", "show", "ui", "maths", "fields", '"use strict";\n' + code);
  run(api.world, api.show, api.ui, api.maths, api.fields);
  return scene;
}

export interface Bounds { x: [number, number]; y: [number, number] }

function finiteBody(b: Body) { return [b.x, b.y, b.vx, b.vy].every(Number.isFinite); }

/** Simulate for `seconds`, returning the region the motion covers. Throws if the physics breaks. */
export function simulate(scene: Scene, seconds: number, dt = 1 / 60): Bounds | null {
  const w = scene.world;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const take = (x: number, y: number, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
  const note = () => {
    for (const b of w.allBodies()) {
      if (!finiteBody(b)) throw new Error(`The simulation broke: ${b.label ?? "a body"} reached an impossible value (NaN). Check masses, springs and starting speeds.`);
      take(b.x, b.y, Math.max(b.radius, ...(b.size ?? [0])));
    }
    for (const p of w.pendulums) take(p.pivot[0], p.pivot[1]);
    for (const s of w.slopes) { take(...s.top); take(...s.bottom); }
    for (const c of scene.fields.charges) take(c.x, c.y, 0.3);
    for (const d of scene.drawables) if (d.type === "wave") { take(d.x[0], d.y - d.amplitude()); take(d.x[1], d.y + d.amplitude()); }
    if (w.groundY !== null && Number.isFinite(x0)) take(x0, w.groundY);
  };
  note();
  for (let t = 0; t < seconds; t += dt) {
    w.advance(dt);
    note();
    const cap = scene.caption?.();
    if (cap !== undefined && typeof cap !== "string") throw new Error("show.caption must return text.");
  }
  if (!Number.isFinite(x0)) return null;
  return { x: [x0, x1], y: [y0, y1] };
}

export interface Report { ok: boolean; errors: string[]; warnings: string[]; bounds: Bounds | null; controls: Control[]; title: string | null }

/** Build and run a scene headlessly to check it works before anyone sees it. */
export function validate(code: string, values: Values = {}, seconds = 8): Report {
  const errors: string[] = [], warnings: string[] = [];
  let scene: Scene;
  try { scene = buildScene(code, values); }
  catch (e) { return { ok: false, errors: [`The script failed while setting up: ${(e as Error).message}`], warnings, bounds: null, controls: [], title: null }; }
  const empty = scene.world.isEmpty() && scene.maths.length === 0 && !scene.fields.any() && !scene.drawables.some(d => d.type === "wave");
  if (empty) errors.push("The scene draws nothing: add bodies, a pendulum, a slope, fields, a wave or a maths item.");
  if (!scene.caption) warnings.push("No caption: add show.caption(...) with one plain sentence about what is happening.");
  let bounds: Bounds | null = null;
  try { bounds = simulate(scene, seconds); }
  catch (e) { errors.push(`The script failed while running: ${(e as Error).message}`); }
  if (bounds) {
    const span = Math.max(bounds.x[1] - bounds.x[0], bounds.y[1] - bounds.y[0]);
    if (span > 1e5) errors.push("Things fly off to enormous distances. Check speeds, forces and the ground, or use world.stopWhen.");
  }
  return { ok: errors.length === 0, errors, warnings, bounds, controls: scene.controls, title: scene.title };
}
