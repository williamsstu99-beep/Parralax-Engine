import { describe, expect, it } from "vitest";
import { buildScene, simulate, validate } from "./core";
import { EXAMPLES } from "./examples";
import { Fields, World } from "./world";

const near = (a: number, b: number, rel = 0.01) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe("physics", () => {
  it("pendulum period matches 2π√(L/g) for small swings, measured from the motion", () => {
    const w = new World(new Fields()).gravity(9.8);
    const p = w.pendulum({ length: 1.5, angle: 3 });
    const crossings: number[] = [];
    let prev = p.theta;
    for (let i = 0; i < 6000; i++) { w.advance(1 / 600); if (prev < 0 && p.theta >= 0) crossings.push(w.t); prev = p.theta; }
    const measured = crossings[2] - crossings[1];
    near(measured, 2 * Math.PI * Math.sqrt(1.5 / 9.8), 0.005);
    near(p.period(), measured, 0.005);
  });

  it("large swings take longer than the small-angle formula, as they should", () => {
    const w = new World(new Fields()).gravity(9.8);
    expect(w.pendulum({ length: 1, angle: 70 }).period()).toBeGreaterThan(2 * Math.PI * Math.sqrt(1 / 9.8) * 1.08);
  });

  it("projectile range matches v² sin 2θ / g without air", () => {
    const w = new World(new Fields()).gravity(9.8);
    const b = w.ball({ x: 0, y: 0, speed: 20, angle: 35 });
    w.stopWhen(() => w.t > 0.1 && b.y <= 0);
    for (let i = 0; i < 600 && !w.paused; i++) w.advance(1 / 60);
    near(b.x, (20 * 20 * Math.sin((70 * Math.PI) / 180)) / 9.8, 0.01);
  });

  it("air resistance shortens the range", () => {
    const run = (drag: number) => {
      const w = new World(new Fields()).gravity(9.8); if (drag) w.drag(drag);
      const b = w.ball({ x: 0, y: 0, speed: 20, angle: 45 }); w.stopWhen(() => w.t > 0.1 && b.y <= 0);
      for (let i = 0; i < 600 && !w.paused; i++) w.advance(1 / 60);
      return b.x;
    };
    expect(run(0.05)).toBeLessThan(run(0) * 0.8);
  });

  it("a spring conserves energy and bounces with period 2π√(m/k)", () => {
    const w = new World(new Fields());
    const b = w.ball({ x: 1.5, y: 0, mass: 2 });
    const s = w.spring([0, 0], b, { k: 18, rest: 1 });
    const energy = () => b.ke() + 0.5 * 18 * s.stretch() ** 2;
    const e0 = energy();
    let prevV = b.vx; const turns: number[] = [];
    for (let i = 0; i < 6000; i++) { w.advance(1 / 600); if (prevV < 0 && b.vx >= 0) turns.push(w.t); prevV = b.vx; }
    near(energy(), e0, 0.01);
    near(turns[2] - turns[1], s.period(), 0.01);
  });

  it("block on a slope accelerates at g(sin θ − μ cos θ)", () => {
    const w = new World(new Fields()).gravity(9.8);
    const s = w.slope({ angle: 30, friction: 0.2, length: 100 });
    w.advance(2);
    const a = 9.8 * (Math.sin(Math.PI / 6) - 0.2 * Math.cos(Math.PI / 6));
    near(s.speed(), a * 2, 0.01);
  });

  it("friction holds a block still on a gentle slope", () => {
    const w = new World(new Fields()).gravity(9.8);
    const s = w.slope({ angle: 10, friction: 0.5, length: 3 });
    w.advance(3);
    expect(s.distance()).toBe(0);
    expect(s.acceleration()).toBe(0);
  });

  it("a circular orbit stays circular", () => {
    const w = new World(new Fields()).gravitation(1);
    w.ball({ x: 0, y: 0, mass: 1000, fixed: true });
    const p = w.ball({ x: 10, y: 0, vy: 10 });
    for (let i = 0; i < 1200; i++) w.advance(1 / 60);
    near(Math.hypot(p.x, p.y), 10, 0.01);
  });
});

describe("scene runtime", () => {
  it.each(EXAMPLES.map(e => [e.id, e.code] as const))("example %s passes the checker", (_id, code) => {
    const r = validate(code);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("controls keep the viewer's values across a rebuild", () => {
    const code = EXAMPLES.find(e => e.id === "pendulum")!.code;
    const s = buildScene(code, { Length: 2 });
    expect(s.world.pendulums[0].length).toBe(2);
  });

  it("catches scripts that throw, draw nothing, or blow up", () => {
    expect(validate("world.ball({ x: undefinedThing });").ok).toBe(false);
    expect(validate("show.caption('hi');").errors[0]).toMatch(/draws nothing/);
    const nan = validate("const b = world.ball({ x: 1, mass: 0.000001 }); world.spring([0,0], b, { k: 1e30, rest: 0.5 });");
    expect(nan.ok).toBe(false);
  });

  it("does not let scripts reach the page", () => {
    expect(validate("document.body.innerHTML = '';").ok).toBe(false);
  });

  it("reports the region the motion covers", () => {
    const s = buildScene(EXAMPLES.find(e => e.id === "projectile")!.code);
    const b = simulate(s, 6)!;
    expect(b.x[1]).toBeGreaterThan(25);
  });
});
