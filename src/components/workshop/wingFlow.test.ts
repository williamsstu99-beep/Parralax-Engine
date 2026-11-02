import { describe, expect, it } from "vitest";
import { aerofoil, liftFactor, stallAmount, velocity } from "./wingFlow";

const a5 = (5 * Math.PI) / 180;
const speed = (v: [number, number] | null) => (v ? Math.hypot(v[0], v[1]) : NaN);

describe("wing airflow", () => {
  it("is a wing-shaped outline about 4 units long", () => {
    const xs = aerofoil().map(p => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3.8);
  });

  it("flows faster over the top than underneath", () => {
    const top = speed(velocity([0, 0.6], a5)), bottom = speed(velocity([0, -0.45], a5));
    expect(top).toBeGreaterThan(1.1);
    expect(bottom).toBeLessThan(1);
  });

  it("returns to the free stream far away", () => {
    const v = velocity([-30, 0], a5)!;
    expect(v[0]).toBeCloseTo(Math.cos(a5), 1);
    expect(v[1]).toBeCloseTo(Math.sin(a5), 1);
  });

  it("has no flow inside the wing", () => {
    expect(velocity([0, 0.1], a5)).toBeNull();
  });

  it("lifts more with more tilt, until it stalls", () => {
    expect(liftFactor(8)).toBeGreaterThan(liftFactor(2));
    expect(liftFactor(22)).toBeLessThan(liftFactor(14));
    expect(stallAmount(10)).toBe(0);
    expect(stallAmount(20)).toBe(1);
  });
});
