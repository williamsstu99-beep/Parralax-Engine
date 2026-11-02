/**
 * The motion lab's model: which settings a student can change, the objects
 * they can launch, challenge checks, and the lab's preset scenes.
 */
import type { MotionResult, MotionSetup, Planet, ProjectileSetup, RampSetup } from "../../truth/motion/types";

export type ProjectileParam = "speed" | "angle" | "height" | "mass";
export type RampParam = "angle" | "length" | "mass" | "friction" | "force" | "startSpeed";
export type MotionParam = ProjectileParam | RampParam | "planet" | "air" | "body";

export interface ParamDef { label: string; unit: string; min: number; max: number; step: number }

export const PROJECTILE_PARAMS: Record<ProjectileParam, ParamDef> = {
  speed: { label: "Launch speed", unit: "m/s", min: 0, max: 50, step: 0.5 },
  angle: { label: "Launch angle", unit: "°", min: -30, max: 90, step: 1 },
  height: { label: "Launch height", unit: "m", min: 0, max: 100, step: 0.5 },
  mass: { label: "Mass", unit: "kg", min: 0.05, max: 100, step: 0.05 },
};

export const RAMP_PARAMS: Record<RampParam, ParamDef> = {
  angle: { label: "Slope angle", unit: "°", min: 0, max: 60, step: 1 },
  length: { label: "Slope length", unit: "m", min: 1, max: 20, step: 0.5 },
  mass: { label: "Mass", unit: "kg", min: 0.5, max: 50, step: 0.5 },
  friction: { label: "Friction (μ)", unit: "", min: 0, max: 1, step: 0.01 },
  force: { label: "Applied force", unit: "N", min: -200, max: 200, step: 1 },
  startSpeed: { label: "Starting speed", unit: "m/s", min: -10, max: 10, step: 0.5 },
};

export const PLANETS: Record<Planet, string> = { earth: "Earth", moon: "Moon", mars: "Mars", jupiter: "Jupiter" };

/** Objects to launch. dragArea is Cd × frontal area. */
export const BODIES = {
  ball: { label: "Tennis ball", mass: 0.058, dragArea: 0.0019 },
  football: { label: "Football", mass: 0.43, dragArea: 0.0095 },
  shot: { label: "Shot put", mass: 7.26, dragArea: 0.0053 },
  skydiver: { label: "Skydiver", mass: 80, dragArea: 0.7 },
  parachute: { label: "Parachutist", mass: 80, dragArea: 40 },
} as const;
export type BodyKind = keyof typeof BODIES;

/* ---------------- challenges ---------------- */

export type MotionCheckKind =
  | "hit_target" | "distance_between" | "max_height_between" | "time_between" | "final_speed_between"
  | "reaches_top" | "reaches_bottom" | "stays_still";

export interface MotionCheck { kind: MotionCheckKind; min?: number; max?: number }

export interface MotionChallenge {
  title: string;
  goal: string;
  checks: MotionCheck[];
  hint_if_stuck: string;
  success: string;
}

export const RANGED: MotionCheckKind[] = ["distance_between", "max_height_between", "time_between", "final_speed_between"];

const n = (x: number, unit: string) => `${Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)} ${unit}`;

export function evalMotionCheck(c: MotionCheck, r: MotionResult): { pass: boolean; hint: string } {
  const lo = c.min ?? -Infinity, hi = c.max ?? Infinity;
  const between = (v: number, what: string, unit: string) =>
    ({ pass: v >= lo && v <= hi, hint: `${what} was ${n(v, unit)}; aim for ${n(lo, unit)} to ${n(hi, unit)}.` });
  const ramp = r.setup.kind === "ramp";
  switch (c.kind) {
    case "hit_target": {
      const t = r.setup.kind === "projectile" ? r.setup.target : undefined;
      if (!t) return { pass: false, hint: "There's no target." };
      const off = r.summary.distance - t.x;
      return { pass: !!r.summary.hitTarget, hint: `It landed ${n(Math.abs(off), "m")} ${off < 0 ? "short of" : "past"} the target's centre.` };
    }
    case "distance_between": return between(r.summary.distance, ramp ? "The distance travelled" : "The range", "m");
    case "max_height_between": return between(r.summary.maxHeight, "The highest point", "m");
    case "time_between": return between(r.duration, "The time taken", "s");
    case "final_speed_between": return between(r.summary.finalSpeed, ramp ? "The final speed" : "The landing speed", "m/s");
    case "reaches_top": return { pass: r.summary.ending === "top", hint: "The block didn't reach the top of the slope." };
    case "reaches_bottom": return { pass: r.summary.ending === "bottom", hint: "The block didn't reach the bottom of the slope." };
    case "stays_still": return { pass: r.summary.ending === "held", hint: "The block moved; it needs to stay still." };
  }
}

export function evalChallenge(ch: MotionChallenge, r: MotionResult): { done: boolean; hint: string } {
  for (const c of ch.checks) {
    const res = evalMotionCheck(c, r);
    if (!res.pass) return { done: false, hint: res.hint };
  }
  return { done: true, hint: ch.success };
}

/* ---------------- scenes ---------------- */

export interface MotionScene {
  id: string;
  title: string;
  summary: string;
  setup: MotionSetup;
  /** Selected object for projectiles (sets mass and drag). */
  body?: BodyKind;
  /** Settings the student may change; "all" in the free lab. */
  editable: MotionParam[] | "all";
  challenge?: MotionChallenge;
}

export const canEdit = (scene: MotionScene, p: MotionParam) => scene.editable === "all" || scene.editable.includes(p);

const projectile = (p: Partial<ProjectileSetup>): ProjectileSetup =>
  ({ kind: "projectile", speed: 15, angle: 40, height: 1.5, mass: BODIES.ball.mass, planet: "earth", air: false, dragArea: BODIES.ball.dragArea, ...p });
const ramp = (p: Partial<RampSetup>): RampSetup =>
  ({ kind: "ramp", angle: 30, length: 8, mass: 2, friction: 0.2, force: 0, start: 8, startSpeed: 0, planet: "earth", ...p });

export const MOTION_SAMPLES: MotionScene[] = [
  { id: "throw", title: "Throw a ball", summary: "Change the speed and angle, then launch. Which angle throws furthest?", setup: projectile({}), body: "ball", editable: "all" },
  {
    id: "target", title: "Hit the target", summary: "Land the ball in the green zone.",
    setup: projectile({ speed: 12, angle: 30, target: { x: 25, width: 3 } }), body: "ball", editable: ["speed", "angle"],
    challenge: { title: "Hit the target", goal: "Land the ball in the green zone 25 m away.", checks: [{ kind: "hit_target" }], hint_if_stuck: "Try 45° first, then change the speed.", success: "Bullseye!" },
  },
  { id: "skydiver", title: "Skydiver: terminal velocity", summary: "Watch the speed graph level off as air resistance catches up with weight.", setup: projectile({ speed: 0, angle: 0, height: 1000, mass: 80, air: true, dragArea: BODIES.skydiver.dragArea }), body: "skydiver", editable: "all" },
  { id: "slope", title: "Block on a ramp", summary: "Change the angle and friction. When does the block start to slide?", setup: ramp({}), editable: "all" },
  {
    id: "push", title: "Push a cart", summary: "Push a 10 kg cart along a 10 m track.",
    setup: ramp({ angle: 0, length: 10, mass: 10, friction: 0.15, force: 10, start: 0 }), editable: ["force"],
    challenge: { title: "Beat the clock", goal: "Get the cart to the end of the track in under 3 seconds.", checks: [{ kind: "reaches_top" }, { kind: "time_between", min: 0, max: 3 }], hint_if_stuck: "Friction takes about 15 N before the cart even starts to speed up.", success: "Made it in time!" },
  },
];
