/**
 * Motion scenes in the Lesson Spec: turn the AI's description into a solver
 * setup, and check it before any student sees it.
 *
 * Beyond range checks, every challenge is run through the Truth solver: it
 * must not already be solved at the start, and a search over the settings the
 * student may change must find at least one way to solve it.
 */
import {
  BODIES, PROJECTILE_PARAMS, RAMP_PARAMS, RANGED, evalChallenge,
  type BodyKind, type MotionChallenge, type MotionParam, type MotionScene, type ParamDef,
} from "../lens/motion/model";
import { solveMotion } from "../truth/motion/solver";
import type { MotionSetup, Planet } from "../truth/motion/types";
import type { Lesson, MotionDef, MotionGen } from "./lesson";
import type { ValidationResult } from "./validate";

const PROJECTILE_KEYS = ["speed", "angle", "height", "body", "air", "planet"] as const;
const RAMP_KEYS = ["angle", "length", "mass", "friction", "force", "startSpeed", "planet"] as const;

export function motionSetup(m: MotionDef): MotionSetup {
  if (m.kind === "projectile") {
    const body = BODIES[m.body ?? "ball"];
    return {
      kind: "projectile", speed: m.speed ?? 15, angle: m.angle ?? 45, height: m.height ?? 0, mass: body.mass,
      planet: m.planet, air: m.air ?? false, dragArea: body.dragArea,
      target: m.target_x !== undefined ? { x: m.target_x, width: m.target_width ?? 3 } : undefined,
    };
  }
  const length = m.length ?? 8;
  return {
    kind: "ramp", angle: m.angle ?? 30, length, mass: m.mass ?? 2, friction: m.friction ?? 0.2, force: m.force ?? 0,
    start: m.start === "top" ? length : 0, startSpeed: m.start_speed ?? 0, planet: m.planet,
  };
}

export function motionScene(m: MotionDef, id: string, title: string, summary: string): MotionScene {
  return {
    id, title, summary, setup: motionSetup(m),
    body: m.kind === "projectile" ? (m.body ?? "ball") : undefined,
    editable: m.editable as MotionParam[],
    challenge: m.challenge as MotionChallenge | undefined,
  };
}

/* ---------------- solvability search ---------------- */

type Knob = { key: MotionParam; values: (number | string | boolean)[] };

function grid(def: ParamDef, steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => +(def.min + ((def.max - def.min) * i) / (steps - 1)).toFixed(4));
}

function apply(setup: MotionSetup, key: MotionParam, v: number | string | boolean): MotionSetup {
  if (key === "body") { const b = BODIES[v as BodyKind]; return { ...setup, mass: b.mass, dragArea: b.dragArea } as MotionSetup; }
  if (key === "planet") return { ...setup, planet: v as Planet };
  if (key === "length" && setup.kind === "ramp") return { ...setup, length: v as number, start: setup.start > 0 ? (v as number) : 0 };
  return { ...setup, [key]: v } as MotionSetup;
}

/** Does any combination of the editable settings solve the challenge? */
export function findSolution(setup: MotionSetup, editable: MotionParam[], ch: MotionChallenge): MotionSetup | null {
  const numeric = editable.filter(k => !["body", "air", "planet"].includes(k));
  const steps = numeric.length <= 1 ? 81 : numeric.length === 2 ? 41 : numeric.length === 3 ? 15 : 7;
  const defs = setup.kind === "projectile" ? PROJECTILE_PARAMS : RAMP_PARAMS;
  const knobs: Knob[] = editable.map(k => {
    if (k === "body") return { key: k, values: Object.keys(BODIES) };
    if (k === "air") return { key: k, values: [false, true] };
    if (k === "planet") return { key: k, values: ["earth", "moon", "mars", "jupiter"] };
    return { key: k, values: grid((defs as Record<string, ParamDef>)[k], steps) };
  });
  let tried = 0;
  const walk = (i: number, s: MotionSetup): MotionSetup | null => {
    if (i === knobs.length) { tried++; return evalChallenge(ch, solveMotion(s)).done ? s : null; }
    for (const v of knobs[i].values) {
      if (tried > 6000) return null;
      const found = walk(i + 1, apply(s, knobs[i].key, v));
      if (found) return found;
    }
    return null;
  };
  return walk(0, setup);
}

/* ---------------- validation ---------------- */

export function validateMotion(m: MotionDef, where: string, out: ValidationResult) {
  const err = (msg: string) => out.errors.push(`${where}: ${msg}`);
  const inRange = (v: number | undefined, def: ParamDef, name: string, required: boolean) => {
    if (v === undefined) { if (required) err(`${m.kind} needs ${name}`); return; }
    if (!Number.isFinite(v) || v < def.min || v > def.max) err(`${name} is ${v}; use ${def.min} to ${def.max}${def.unit ? ` ${def.unit}` : ""}`);
  };

  const allowed: readonly string[] = m.kind === "projectile" ? PROJECTILE_KEYS : RAMP_KEYS;
  for (const e of m.editable) if (!allowed.includes(e)) err(`"${e}" can't be edited in a ${m.kind} scene; choose from ${allowed.join(", ")}`);

  if (m.kind === "projectile") {
    inRange(m.speed, PROJECTILE_PARAMS.speed, "speed", true);
    inRange(m.angle, PROJECTILE_PARAMS.angle, "angle", true);
    inRange(m.height, PROJECTILE_PARAMS.height, "height", true);
    if (m.target_x !== undefined && (m.target_x <= 0 || m.target_x > 300)) err("target_x must be between 0 and 300 m");
    if (m.target_width !== undefined && (m.target_width < 0.5 || m.target_width > 30)) err("target_width must be between 0.5 and 30 m");
    for (const k of ["length", "mass", "friction", "force", "start", "start_speed"] as const) if (m[k] !== undefined) err(`${k} is for ramp scenes only`);
  } else {
    inRange(m.angle, RAMP_PARAMS.angle, "angle", true);
    inRange(m.length, RAMP_PARAMS.length, "length", true);
    inRange(m.mass, RAMP_PARAMS.mass, "mass", true);
    inRange(m.friction, RAMP_PARAMS.friction, "friction", true);
    inRange(m.force, RAMP_PARAMS.force, "force", false);
    inRange(m.start_speed, RAMP_PARAMS.startSpeed, "start_speed", false);
    if (!m.start) err("ramp needs start: \"bottom\" or \"top\"");
    for (const k of ["speed", "height", "body", "air", "target_x", "target_width"] as const) if (m[k] !== undefined) err(`${k} is for projectile scenes only`);
  }
  if (out.errors.some(e => e.startsWith(where))) return;

  const setup = motionSetup(m);
  const result = solveMotion(setup);
  if (result.diagnostics.some(d => d.code === "underground")) err("the projectile is launched downwards from ground level, so nothing happens; add height or aim upwards");

  const ch = m.challenge;
  if (!ch) return;
  if (ch.checks.length === 0) { err("the challenge has no checks, so it can never be completed"); return; }
  for (const c of ch.checks) {
    if (RANGED.includes(c.kind) && !(typeof c.min === "number" && typeof c.max === "number" && c.min < c.max)) err(`${c.kind} needs min < max`);
    if (c.kind === "hit_target" && (m.kind !== "projectile" || m.target_x === undefined)) err("hit_target needs a projectile scene with target_x");
    if (["reaches_top", "reaches_bottom", "stays_still"].includes(c.kind) && m.kind !== "ramp") err(`${c.kind} is for ramp scenes only`);
  }
  if (m.editable.length === 0) err("the challenge has nothing the student can change; list settings in editable");
  if (out.errors.some(e => e.startsWith(where))) return;

  const challenge = ch as MotionChallenge;
  if (evalChallenge(challenge, result).done) {
    err("the challenge is already complete with the starting settings, so the student has nothing to do; start from settings that miss");
    return;
  }
  if (!findSolution(setup, m.editable as MotionParam[], challenge)) {
    err(`no combination of the editable settings (${m.editable.join(", ")}) completes the challenge within the lab's ranges; widen the target or check ranges, or let the student change more settings`);
  }
}

/* ---------------- generation format ---------------- */

type MotionCheckDef = NonNullable<MotionDef["challenge"]>["checks"][number];

const dropNull = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

/** The AI's all-required motion format → the flat MotionSpec the engine uses. */
export function fromGen(g: MotionGen): MotionDef {
  const kindFields = g.kind === "projectile" ? (g.projectile ? dropNull(g.projectile) : {}) : (g.ramp ? dropNull(g.ramp) : {});
  return {
    kind: g.kind, planet: g.planet, ...kindFields, editable: g.editable,
    challenge: g.challenge ? { ...g.challenge, checks: g.challenge.checks.map(c => dropNull(c) as MotionCheckDef) } : undefined,
  } as MotionDef;
}

/** MotionSpec → the AI's format, for showing the worked example in the prompt. */
export function toGen(m: MotionDef): MotionGen {
  return {
    kind: m.kind, planet: m.planet,
    projectile: m.kind === "projectile" ? { body: m.body ?? "ball", speed: m.speed ?? 0, angle: m.angle ?? 0, height: m.height ?? 0, air: m.air ?? false, target_x: m.target_x ?? null, target_width: m.target_width ?? null } : null,
    ramp: m.kind === "ramp" ? { angle: m.angle ?? 0, length: m.length ?? 8, mass: m.mass ?? 2, friction: m.friction ?? 0, force: m.force ?? 0, start: m.start ?? "bottom", start_speed: m.start_speed ?? 0 } : null,
    editable: m.editable,
    challenge: m.challenge ? { ...m.challenge, checks: m.challenge.checks.map(c => ({ kind: c.kind, min: c.min ?? null, max: c.max ?? null })) } : null,
  };
}

/** A generated lesson (in its engine's generation format) → a Lesson, ready for LessonSpec and validation. */
export function lessonFromGen(raw: unknown): unknown {
  const l = raw as { engine?: string; scenes?: { motion?: MotionGen }[] };
  if (l?.engine !== "motion" || !Array.isArray(l.scenes)) return raw;
  return { ...l, scenes: l.scenes.map(s => (s.motion ? { ...s, motion: fromGen(s.motion) } : s)) };
}

/** The example lesson in the AI's format. */
export const genExample = (lesson: Lesson) => ({ ...lesson, scenes: lesson.scenes.map(s => (s.motion ? { ...s, motion: toGen(s.motion) } : s)) });
