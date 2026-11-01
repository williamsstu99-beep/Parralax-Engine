/**
 * Motion Truth: deterministic mechanics.
 *
 * - Projectiles without air resistance are solved exactly.
 * - Projectiles with air resistance (quadratic drag, F = ½ρ·Cd·A·v²) are
 *   integrated with fixed-step RK4, tracking the energy drag removes.
 * - Ramps are solved exactly, phase by phase: within a phase the acceleration
 *   is constant, and phases end when the block stops, reverses, or reaches an
 *   end of the slope.
 */
import {
  AIR_DENSITY, GRAVITY,
  type ForceSet, type MotionDiagnostic, type MotionResult, type ProjectileSetup, type RampSetup, type Sample,
} from "./types";

const MAX_TIME = 120;     // s: stop simulating after this
const MAX_SAMPLES = 1500; // keeps results light enough to send around
const FRAME = 1 / 60;     // s between samples, when that fits under MAX_SAMPLES

const rad = (deg: number) => (deg * Math.PI) / 180;

function decimate(samples: Sample[]): Sample[] {
  if (samples.length <= MAX_SAMPLES) return samples;
  const step = (samples.length - 1) / (MAX_SAMPLES - 1);
  return Array.from({ length: MAX_SAMPLES }, (_, i) => samples[Math.round(i * step)]);
}

/* ---------------- projectiles ---------------- */

export function solveProjectile(s: ProjectileSetup): MotionResult {
  const g = GRAVITY[s.planet];
  const rho = s.air ? AIR_DENSITY[s.planet] : 0;
  const k = (0.5 * rho * s.dragArea) / s.mass; // drag acceleration = k·|v|·v
  const vx0 = s.speed * Math.cos(rad(s.angle));
  const vy0 = s.speed * Math.sin(rad(s.angle));
  const diagnostics: MotionDiagnostic[] = [];
  if (s.air && AIR_DENSITY[s.planet] === 0) {
    diagnostics.push({ code: "no_air", severity: "info", message: "There's no air on the Moon, so there's no air resistance: everything falls the same way." });
  }

  const sample = (t: number, x: number, y: number, vx: number, vy: number, lost: number): Sample => {
    const v2 = vx * vx + vy * vy;
    return { t, x, y, vx, vy, speed: Math.sqrt(v2), ke: 0.5 * s.mass * v2, gpe: s.mass * g * y, lost, work: 0 };
  };

  let samples: Sample[] = [];
  let timedOut = false;

  if (s.height <= 0 && vy0 <= 0) {
    // Nowhere to go: on the ground and not launched upwards.
    samples = [sample(0, 0, 0, vx0, vy0, 0)];
    if (vy0 < 0) diagnostics.push({ code: "underground", severity: "warning", message: "It's launched downwards from ground level, so it hits the ground straight away." });
  } else if (k === 0) {
    // Exact: y = h + vy0·t − ½gt²
    let T = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * s.height)) / g;
    if (T > MAX_TIME) { T = MAX_TIME; timedOut = true; }
    const n = Math.max(2, Math.min(MAX_SAMPLES - 1, Math.ceil(T / FRAME)));
    for (let i = 0; i <= n; i++) {
      const t = (T * i) / n;
      const y = i === n && !timedOut ? 0 : s.height + vy0 * t - 0.5 * g * t * t;
      samples.push(sample(t, vx0 * t, y, vx0, vy0 - g * t, 0));
    }
  } else {
    // RK4 on state [x, y, vx, vy, lost]
    type St = [number, number, number, number, number];
    const deriv = ([, , vx, vy]: St): St => {
      const v = Math.hypot(vx, vy);
      return [vx, vy, -k * v * vx, -g - k * v * vy, k * s.mass * v * v * v];
    };
    const add = (a: St, b: St, h: number): St => [a[0] + b[0] * h, a[1] + b[1] * h, a[2] + b[2] * h, a[3] + b[3] * h, a[4] + b[4] * h];
    const terminal = Math.sqrt(g / k);
    const dt = Math.min(0.002, terminal / g / 50); // resolve the approach to terminal velocity
    const every = Math.max(1, Math.round(FRAME / dt));
    let st: St = [0, s.height, vx0, vy0, 0];
    let t = 0;
    samples.push(sample(0, ...st));
    for (let i = 1; ; i++) {
      const k1 = deriv(st), k2 = deriv(add(st, k1, dt / 2)), k3 = deriv(add(st, k2, dt / 2)), k4 = deriv(add(st, k3, dt));
      const next = st.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])) as St;
      if (next[1] <= 0) {
        const f = st[1] / (st[1] - next[1]);
        const land = st.map((v, j) => v + f * (next[j] - v)) as St;
        samples.push(sample(t + f * dt, land[0], 0, land[2], land[3], land[4]));
        break;
      }
      st = next;
      t += dt;
      if (t >= MAX_TIME) { timedOut = true; samples.push(sample(t, ...st)); break; }
      if (i % every === 0) samples.push(sample(t, ...st));
    }
  }

  samples = decimate(samples);
  const last = samples[samples.length - 1];
  const terminalSpeed = k > 0 ? Math.sqrt(g / k) : undefined;
  if (terminalSpeed && last.speed >= 0.95 * terminalSpeed) {
    diagnostics.push({ code: "terminal_velocity", severity: "info", message: `It reached terminal velocity (about ${terminalSpeed.toFixed(1)} m/s): air resistance grew until it balanced the weight, so it stopped speeding up.` });
  }
  if (timedOut) diagnostics.push({ code: "timed_out", severity: "warning", message: `It was still in the air after ${MAX_TIME} seconds, so the simulation stopped.` });
  const distance = last.x;
  return {
    setup: s,
    samples,
    duration: last.t,
    summary: {
      distance,
      maxHeight: Math.max(...samples.map(p => p.y)),
      finalSpeed: last.speed,
      hitTarget: s.target ? !timedOut && Math.abs(distance - s.target.x) <= s.target.width / 2 : undefined,
      terminalSpeed,
    },
    diagnostics,
  };
}

/* ---------------- ramps ---------------- */

/** The forces on the block along the slope when it moves at velocity v (for free-body diagrams). */
export function rampForces(s: RampSetup, v: number): ForceSet {
  const g = GRAVITY[s.planet], th = rad(s.angle);
  const N = s.mass * g * Math.cos(th), W = s.mass * g * Math.sin(th), fMax = s.friction * N;
  const tendency = s.force - W;
  const friction = Math.abs(v) > 1e-9 ? -Math.sign(v) * fMax : Math.abs(tendency) <= fMax + 1e-9 ? -tendency : -Math.sign(tendency) * fMax;
  return { weightAlong: -W, normal: N, friction, applied: s.force, net: tendency + friction };
}

interface Phase { t0: number; x0: number; v0: number; a: number; dur: number; lost0: number; work0: number }

const EPS = 1e-9;

/** Smallest τ > 0 with x0 + v0·τ + ½a·τ² = target, or Infinity. */
function reach(x0: number, v0: number, a: number, target: number): number {
  const c = x0 - target;
  if (Math.abs(a) < EPS) return Math.abs(v0) < EPS ? Infinity : (-c / v0 > EPS ? -c / v0 : Infinity);
  const disc = v0 * v0 - 2 * a * c;
  if (disc < 0) return Infinity;
  const r = Math.sqrt(disc);
  const roots = [(-v0 - r) / a, (-v0 + r) / a].filter(τ => τ > EPS).sort((p, q) => p - q);
  return roots[0] ?? Infinity;
}

export function solveRamp(s: RampSetup): MotionResult {
  const g = GRAVITY[s.planet];
  const th = rad(s.angle);
  const N = s.mass * g * Math.cos(th);
  const W = s.mass * g * Math.sin(th); // weight component down the slope
  const fMax = s.friction * N;
  const L = s.length;
  const diagnostics: MotionDiagnostic[] = [];

  const accel = (v: number): { a: number; held: boolean } => {
    if (v > EPS) return { a: (s.force - W - fMax) / s.mass, held: false };
    if (v < -EPS) return { a: (s.force - W + fMax) / s.mass, held: false };
    const net = s.force - W;
    if (Math.abs(net) <= fMax + 1e-9) return { a: 0, held: true };
    return { a: (net - Math.sign(net) * fMax) / s.mass, held: false };
  };

  const forces = rampForces(s, s.startSpeed);

  const phases: Phase[] = [];
  let t = 0, x = Math.min(L, Math.max(0, s.start)), v = s.startSpeed, lost = 0, work = 0;
  let ending: "top" | "bottom" | "stopped" | "held" = "stopped";
  let firstAccel: number | undefined;
  let wentUp = false, slidBack = false, timedOut = false;

  for (let guard = 0; guard < 50; guard++) {
    const { a, held } = accel(v);
    if (held) { v = 0; ending = phases.length ? "stopped" : "held"; break; }
    const movingDown = v < -EPS || (Math.abs(v) <= EPS && a < 0);
    const movingUp = v > EPS || (Math.abs(v) <= EPS && a > 0);
    if (movingDown && x <= EPS) { ending = "bottom"; break; }
    if (movingUp && x >= L - EPS) { ending = "top"; break; }
    if (firstAccel === undefined) firstAccel = a;
    if (movingUp) wentUp = true;
    if (movingDown && wentUp) slidBack = true;

    const tStop = Math.abs(v) > EPS && Math.sign(a) === -Math.sign(v) ? -v / a : Infinity;
    const tTop = movingUp ? reach(x, v, a, L) : Infinity;
    const tBottom = movingDown ? reach(x, v, a, 0) : Infinity;
    const tLeft = MAX_TIME - t;
    const dur = Math.min(tStop, tTop, tBottom, tLeft);
    phases.push({ t0: t, x0: x, v0: v, a, dur, lost0: lost, work0: work });

    const nx = dur === tTop ? L : dur === tBottom ? 0 : x + v * dur + 0.5 * a * dur * dur;
    lost += fMax * Math.abs(nx - x);
    work += s.force * (nx - x);
    x = nx;
    v = dur === tStop ? 0 : v + a * dur;
    t += dur;
    if (dur === tTop) { ending = "top"; break; }
    if (dur === tBottom) { ending = "bottom"; break; }
    if (dur === tLeft) { timedOut = true; ending = "stopped"; break; }
  }

  // Sample the phases at a steady frame rate.
  const duration = t;
  const frame = Math.max(FRAME, duration / (MAX_SAMPLES - 1));
  const sinT = Math.sin(th);
  const at = (time: number): Sample => {
    const p = phases.find(ph => time <= ph.t0 + ph.dur + 1e-12) ?? phases[phases.length - 1];
    let px = x, pv = v, pl = lost, pw = work;
    if (p) {
      const τ = Math.min(Math.max(0, time - p.t0), p.dur);
      px = p.x0 + p.v0 * τ + 0.5 * p.a * τ * τ;
      pv = p.v0 + p.a * τ;
      pl = p.lost0 + fMax * Math.abs(px - p.x0);
      pw = p.work0 + s.force * (px - p.x0);
    }
    const y = px * sinT;
    return { t: time, x: px, y, vx: pv, vy: 0, speed: Math.abs(pv), ke: 0.5 * s.mass * pv * pv, gpe: s.mass * g * y, lost: pl, work: pw };
  };
  const samples: Sample[] = [];
  if (phases.length === 0) samples.push(at(0));
  else {
    for (let tm = 0; tm < duration - 1e-9; tm += frame) samples.push(at(tm));
    samples.push({ ...at(duration), x, y: x * sinT, vx: v, speed: Math.abs(v), ke: 0.5 * s.mass * v * v, gpe: s.mass * g * x * sinT, lost, work });
  }

  if (ending === "held") diagnostics.push({ code: "held_by_friction", severity: "info", message: `Friction can push back with up to ${fMax.toFixed(1)} N, which is enough to stop the block sliding, so it stays put.` });
  if (slidBack) diagnostics.push({ code: "slid_back", severity: "info", message: "It moved up the slope, stopped, then slid back down: the pull down the slope beat friction and the applied force." });
  if (timedOut) diagnostics.push({ code: "timed_out", severity: "warning", message: `It was still moving after ${MAX_TIME} seconds, so the simulation stopped.` });

  const startX = Math.min(L, Math.max(0, s.start));
  return {
    setup: s,
    samples,
    duration,
    summary: {
      distance: phases.reduce((d, p) => {
        const end = p.x0 + p.v0 * p.dur + 0.5 * p.a * p.dur * p.dur;
        return d + Math.abs(Math.min(L, Math.max(0, end)) - p.x0);
      }, 0),
      // Peaks happen where a phase ends (the block stops), so phase boundaries give the exact maximum.
      maxHeight: Math.max(startX, x, ...phases.map(p => Math.min(L, Math.max(0, p.x0 + p.v0 * p.dur + 0.5 * p.a * p.dur * p.dur)))) * sinT,
      finalSpeed: Math.abs(v),
      ending,
      acceleration: firstAccel ?? 0,
      forces,
    },
    diagnostics,
  };
}

export function solveMotion(setup: ProjectileSetup | RampSetup): MotionResult {
  return setup.kind === "projectile" ? solveProjectile(setup) : solveRamp(setup);
}
