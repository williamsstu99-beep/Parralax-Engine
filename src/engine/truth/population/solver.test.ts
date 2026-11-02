import { describe, expect, it } from "vitest";
import { solvePopulation, type PopulationSetup } from "./solver";

const base = (p: Partial<PopulationSetup> = {}): PopulationSetup => ({
  prey: 100, predators: 0, growth: 0.8, capacity: 1000, hunting: 50, conversion: 0.1, predatorDeath: 0.5,
  trapping: 0, harvest: 0, controlStart: 0, years: 30, ...p,
});

describe("prey on their own", () => {
  it("follow the logistic curve N = K / (1 + ((K − N₀)/N₀)·e^(−rt))", () => {
    const r = solvePopulation(base({ years: 10 }));
    for (const s of r.samples) {
      const exact = 1000 / (1 + 9 * Math.exp(-0.8 * s.t));
      expect(s.prey).toBeCloseTo(exact, 3);
    }
  });

  it("settle at the carrying capacity", () => {
    expect(solvePopulation(base({ years: 60 })).summary.final.prey).toBeCloseTo(1000, 2);
  });

  it("harvesting lowers the settled level to K·(1 − H/r)", () => {
    const r = solvePopulation(base({ years: 80, harvest: 0.2 }));
    const H = -Math.log(0.8);
    expect(r.summary.final.prey).toBeCloseTo(1000 * (1 - H / 0.8), 1);
  });

  it("over-harvesting drives them extinct", () => {
    const r = solvePopulation(base({ years: 100, harvest: 0.6 })); // removal rate 0.92 > growth 0.8
    expect(r.summary.extinct.prey).toBeDefined();
    expect(r.diagnostics.map(d => d.code)).toContain("prey_extinct");
  });
});

describe("predators and prey", () => {
  it("stay put when they start at equilibrium", () => {
    const eq = solvePopulation(base({ predators: 1 })).summary.equilibrium!;
    expect(eq.prey).toBeCloseTo((0.5 * 1000) / (0.1 * 50), 9); // N* = mK/(b·h) = 100
    expect(eq.predators).toBeCloseTo((0.8 * (1 - 0.1) * 1000) / 50, 9); // P* = r(1 − N*/K)K/h = 14.4
    const r = solvePopulation(base({ prey: eq.prey, predators: eq.predators }));
    for (const s of r.samples) {
      expect(s.prey).toBeCloseTo(eq.prey, 6);
      expect(s.predators).toBeCloseTo(eq.predators, 6);
    }
  });

  it("cycle when disturbed, and the cycles damp towards equilibrium", () => {
    const r = solvePopulation(base({ prey: 400, predators: 5, years: 80, capacity: 5000 }));
    expect(r.summary.cycleYears).toBeGreaterThan(3);
    expect(r.diagnostics.map(d => d.code)).toContain("oscillating");
    const early = r.samples.filter(s => s.t < 20).map(s => s.prey), late = r.samples.filter(s => s.t > 60).map(s => s.prey);
    expect(Math.max(...late) - Math.min(...late)).toBeLessThan(Math.max(...early) - Math.min(...early));
  });

  it("trapping from year 10 knocks the predators out and lets the prey recover", () => {
    const r = solvePopulation(base({ prey: 100, predators: 14.4, trapping: 0.9, controlStart: 10, years: 40 }));
    expect(r.summary.extinct.predators).toBeGreaterThan(10);
    expect(r.samples.find(s => s.t >= 9.9)!.predators).toBeGreaterThan(10); // untouched before control starts
    expect(r.summary.final.prey).toBeGreaterThan(900);
  });

  it("predators starve without enough food", () => {
    // N* = mK/(bh) = 2500 > K: even with prey at capacity, births (b·h = 0.2/yr) can't beat deaths (0.5/yr).
    const r = solvePopulation(base({ predators: 10, hunting: 2 }));
    expect(r.summary.equilibrium).toBeUndefined();
    expect(r.summary.final.predators).toBeLessThan(1);
  });

  it("keeps results small for long runs", () => {
    expect(solvePopulation(base({ predators: 5, years: 200 })).samples.length).toBeLessThanOrEqual(1000);
  });
});
