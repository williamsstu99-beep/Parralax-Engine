/**
 * Motion Truth: types for the mechanics solver.
 *
 * Two setups cover most school mechanics:
 *  - projectile: something launched (or dropped) from a height, with optional
 *    air resistance. Covers free fall, projectiles and terminal velocity.
 *  - ramp: a block on a slope (angle 0 is a flat track) with friction and an
 *    applied force along the slope. Covers forces, F = ma, friction and energy.
 *
 * SI units throughout: metres, seconds, kilograms, newtons, degrees for angles.
 */

export type Planet = "earth" | "moon" | "mars" | "jupiter";

export const GRAVITY: Record<Planet, number> = { earth: 9.81, moon: 1.62, mars: 3.71, jupiter: 24.79 };
/** Air density near the surface (kg/m³). The Moon has none; Jupiter has no surface, so we use cloud-top air. */
export const AIR_DENSITY: Record<Planet, number> = { earth: 1.2, moon: 0, mars: 0.02, jupiter: 0.16 };

export interface ProjectileSetup {
  kind: "projectile";
  /** Launch speed, m/s. */
  speed: number;
  /** Launch angle above the horizontal, degrees (-90 straight down to 90 straight up). */
  angle: number;
  /** Launch height above the ground, m. */
  height: number;
  /** Mass, kg. */
  mass: number;
  planet: Planet;
  /** Whether air resistance acts (it can't on the Moon). */
  air: boolean;
  /** Drag coefficient × frontal area (Cd·A), m². A tennis ball is ~0.002, a skydiver ~0.7, an open parachute ~25. */
  dragArea: number;
  /** Optional landing zone for challenges: centre x and full width, m. */
  target?: { x: number; width: number };
}

export interface RampSetup {
  kind: "ramp";
  /** Slope angle, degrees (0 = flat). The slope rises to the right. */
  angle: number;
  /** Length of the slope, m. Position 0 is the bottom, `length` the top. */
  length: number;
  /** Mass of the block, kg. */
  mass: number;
  /** Coefficient of friction (one value for static and sliding, a common school simplification). */
  friction: number;
  /** Applied force along the slope, N. Positive pushes up the slope. */
  force: number;
  /** Starting position along the slope, m. */
  start: number;
  /** Starting velocity along the slope, m/s. Positive is up the slope. */
  startSpeed: number;
  planet: Planet;
}

export type MotionSetup = ProjectileSetup | RampSetup;

/** One moment of the motion. Positions in m, velocities in m/s, energies in J. */
export interface Sample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  ke: number;
  gpe: number;
  /** Energy turned to heat so far (friction or air resistance). */
  lost: number;
  /** Work done on the body by the applied force so far. */
  work: number;
}

export interface MotionDiagnostic {
  code:
    | "no_air"             // air resistance asked for where there is no air
    | "held_by_friction"   // the block never moves
    | "terminal_velocity"  // drag balanced weight
    | "slid_back"          // pushed up, came back down
    | "timed_out"          // still moving when the simulation stopped
    | "underground";       // launched downwards from ground level
  severity: "info" | "warning";
  message: string;
}

export interface ForceSet {
  /** Weight component along the slope (negative = down the slope), N. */
  weightAlong: number;
  /** Normal reaction, N. */
  normal: number;
  /** Friction acting now (sign opposes motion or tendency), N. */
  friction: number;
  /** Applied force, N. */
  applied: number;
  /** Net force along the slope, N. */
  net: number;
}

export interface MotionResult {
  setup: MotionSetup;
  samples: Sample[];
  /** Total simulated time, s. */
  duration: number;
  summary: {
    /** projectile: horizontal distance at landing, m. ramp: distance travelled along the slope, m. */
    distance: number;
    /** projectile: highest point above the ground, m. ramp: highest position on the slope, m. */
    maxHeight: number;
    /** Speed at the end (landing, or reaching the end of the slope), m/s. */
    finalSpeed: number;
    /** projectile only: did it land inside the target zone? */
    hitTarget?: boolean;
    /** projectile with air: terminal velocity, m/s. */
    terminalSpeed?: number;
    /** ramp only: where it finished. */
    ending?: "top" | "bottom" | "stopped" | "held";
    /** ramp only: acceleration during the first phase of motion, m/s² (positive up the slope). */
    acceleration?: number;
    /** ramp only: forces at the start (before it moves). */
    forces?: ForceSet;
  };
  diagnostics: MotionDiagnostic[];
}
