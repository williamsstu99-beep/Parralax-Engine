import { describe, expect, it } from "vitest";
import { solveProjectile, solveRamp } from "./solver";
import type { ProjectileSetup, RampSetup, Sample } from "./types";

const proj = (p: Partial<ProjectileSetup> = {}): ProjectileSetup =>
  ({ kind: "projectile", speed: 20, angle: 45, height: 0, mass: 1, planet: "earth", air: false, dragArea: 0.002, ...p });
const ramp = (p: Partial<RampSetup> = {}): RampSetup =>
  ({ kind: "ramp", angle: 30, length: 10, mass: 1, friction: 0, force: 0, start: 10, startSpeed: 0, planet: "earth", ...p });

const energy = (s: Sample) => s.ke + s.gpe + s.lost - s.work;
const g = 9.81;

describe("projectiles without air", () => {
  it("matches the range, height and flight-time formulas", () => {
    const r = solveProjectile(proj());
    expect(r.summary.distance).toBeCloseTo(400 / g, 6);              // v² sin 2θ / g
    expect(r.summary.maxHeight).toBeCloseTo(100 / g, 2);             // v² sin²θ / 2g
    expect(r.duration).toBeCloseTo((2 * 20 * Math.SQRT1_2) / g, 6);  // 2v sinθ / g
    expect(r.summary.finalSpeed).toBeCloseTo(20, 6);
  });

  it("drops from a height in √(2h/g) and lands at √(2gh)", () => {
    const r = solveProjectile(proj({ speed: 0, height: 20 }));
    expect(r.duration).toBeCloseTo(Math.sqrt(40 / g), 6);
    expect(r.summary.finalSpeed).toBeCloseTo(Math.sqrt(2 * g * 20), 6);
    expect(r.summary.distance).toBeCloseTo(0, 9);
  });

  it("conserves energy", () => {
    const r = solveProjectile(proj({ height: 12, angle: 30 }));
    const e0 = energy(r.samples[0]);
    for (const s of r.samples) expect(energy(s)).toBeCloseTo(e0, 6);
  });

  it("scores the target zone", () => {
    expect(solveProjectile(proj({ target: { x: 40.8, width: 2 } })).summary.hitTarget).toBe(true);
    expect(solveProjectile(proj({ target: { x: 30, width: 2 } })).summary.hitTarget).toBe(false);
  });

  it("falls slower on the Moon and ignores 'air' there", () => {
    const moon = solveProjectile(proj({ planet: "moon", air: true }));
    expect(moon.summary.distance).toBeCloseTo(400 / 1.62, 6);
    expect(moon.diagnostics.map(d => d.code)).toContain("no_air");
  });

  it("flags a downward launch from the ground", () => {
    const r = solveProjectile(proj({ angle: -20 }));
    expect(r.diagnostics.map(d => d.code)).toContain("underground");
    expect(r.summary.distance).toBe(0);
  });
});

describe("projectiles with air resistance", () => {
  it("a skydiver reaches terminal velocity √(2mg/ρCdA) and energy balances", () => {
    const r = solveProjectile(proj({ speed: 0, height: 3000, mass: 80, air: true, dragArea: 0.7 }));
    const vt = Math.sqrt((2 * 80 * g) / (1.2 * 0.7));
    expect(r.summary.terminalSpeed).toBeCloseTo(vt, 6);
    expect(r.summary.finalSpeed).toBeCloseTo(vt, 1);
    expect(r.diagnostics.map(d => d.code)).toContain("terminal_velocity");
    const last = r.samples[r.samples.length - 1];
    expect(energy(last) / energy(r.samples[0])).toBeCloseTo(1, 4);
  });

  it("cuts the range of a fast ball", () => {
    const vacuum = solveProjectile(proj({ speed: 30, mass: 0.058 }));
    const air = solveProjectile(proj({ speed: 30, mass: 0.058, air: true, dragArea: 0.0019 }));
    expect(air.summary.distance).toBeLessThan(vacuum.summary.distance * 0.9);
    // A tennis ball's terminal velocity is ~22 m/s, so at 30 m/s drag is strong: real throws lose about half their range.
    expect(air.summary.distance).toBeGreaterThan(vacuum.summary.distance * 0.35);
  });

  it("keeps results small", () => {
    const r = solveProjectile(proj({ speed: 0, height: 4000, mass: 80, air: true, dragArea: 25 }));
    expect(r.samples.length).toBeLessThanOrEqual(1500);
    expect(r.diagnostics.map(d => d.code)).toContain("timed_out"); // a parachute from 4 km takes > 2 min
  });
});

describe("ramps", () => {
  it("a frictionless slide matches s = ½at² and v² = 2as", () => {
    const r = solveRamp(ramp());
    const a = g * 0.5;
    expect(r.summary.ending).toBe("bottom");
    expect(r.summary.acceleration).toBeCloseTo(-a, 9);
    expect(r.duration).toBeCloseTo(Math.sqrt(20 / a), 9);
    expect(r.summary.finalSpeed).toBeCloseTo(Math.sqrt(2 * a * 10), 9);
  });

  it("friction holds the block when tan θ ≤ μ", () => {
    const r = solveRamp(ramp({ angle: 20, friction: 0.5, start: 5 }));
    expect(r.summary.ending).toBe("held");
    expect(r.summary.forces!.net).toBeCloseTo(0, 9);
    expect(r.diagnostics.map(d => d.code)).toContain("held_by_friction");
  });

  it("a pushed cart on a flat track follows F − μmg = ma", () => {
    const r = solveRamp(ramp({ angle: 0, mass: 2, friction: 0.1, force: 10, start: 0 }));
    const a = (10 - 0.1 * 2 * g) / 2;
    expect(r.summary.ending).toBe("top");
    expect(r.summary.acceleration).toBeCloseTo(a, 9);
    expect(r.duration).toBeCloseTo(Math.sqrt(20 / a), 9);
  });

  it("a block pushed up a rough slope stops, slides back, and energy balances", () => {
    const r = solveRamp(ramp({ friction: 0.1, start: 0, startSpeed: 5 }));
    expect(r.summary.ending).toBe("bottom");
    expect(r.diagnostics.map(d => d.code)).toContain("slid_back");
    const up = g * 0.5 + 0.1 * g * Math.cos(Math.PI / 6), down = g * 0.5 - 0.1 * g * Math.cos(Math.PI / 6);
    const peak = 25 / (2 * up);
    expect(r.summary.maxHeight).toBeCloseTo(peak * 0.5, 6);
    expect(r.summary.finalSpeed).toBeCloseTo(Math.sqrt(2 * down * peak), 6);
    const e0 = energy(r.samples[0]);
    for (const s of r.samples) expect(energy(s)).toBeCloseTo(e0, 6);
  });

  it("a block resting at the bottom stays at the bottom", () => {
    const r = solveRamp(ramp({ start: 0 }));
    expect(r.summary.ending).toBe("bottom");
    expect(r.summary.finalSpeed).toBe(0);
  });
});
