import { describe, expect, it } from "vitest";
import { ExprError, compileSrc, parse } from "./expr";
import { compileModel, runModel, stat, type ModelDef } from "./solver";

describe("expression language", () => {
  const ev = (src: string, env: Record<string, number> = {}) => compileSrc(src)({ t: 0, ...env });
  it("follows normal maths precedence", () => {
    expect(ev("2 + 3 * 4")).toBe(14);
    expect(ev("-2^2")).toBe(-4);
    expect(ev("2^3^2")).toBe(512);
    expect(ev("(1 + 2) * -3")).toBe(-9);
    expect(ev("10 / 4 / 5")).toBeCloseTo(0.5);
  });
  it("supports functions, conditions and time switches", () => {
    expect(ev("max(1, 5, 3) + min(2, -1)")).toBe(4);
    expect(ev("x > 2 ? 10 : 20", { x: 3 })).toBe(10);
    expect(ev("if(x <= 2 && x > 0, 1, 0)", { x: 2 })).toBe(1);
    expect(ev("step(5)", { t: 4 })).toBe(0);
    expect(ev("step(5)", { t: 5 })).toBe(1);
    expect(ev("pulse(1, 2)", { t: 2.5 })).toBe(1);
    expect(ev("pulse(1, 2)", { t: 3 })).toBe(0);
    expect(ev("clamp(x, 0, 1)", { x: 7 })).toBe(1);
    expect(ev("ln(exp(2)) + log10(1000) + sqrt(16)")).toBeCloseTo(9);
  });
  it("rejects anything that isn't maths", () => {
    expect(() => parse("alert(1)")).toThrow(ExprError);
    expect(() => parse("x; y")).toThrow(ExprError);
    expect(() => parse("constructor.prototype")).toThrow(ExprError);
    expect(() => parse("max()")).toThrow(/takes/);
    expect(() => parse("(1 + 2")).toThrow(/expected/);
  });
});

const tea: ModelDef = {
  timeUnit: "minutes", duration: 60,
  params: [
    { id: "room", label: "Room temperature", unit: "°C", min: 0, max: 40, value: 20, step: 1 },
    { id: "k", label: "Cooling constant", unit: "per min", min: 0.01, max: 0.2, value: 0.05, step: 0.01 },
  ],
  stocks: [{ id: "temp", label: "Tea temperature", unit: "°C", initial: "90", min: null, max: null }],
  flows: [{ id: "cooling", label: "Heat loss", from: "temp", to: null, rate: "k * (temp - room)" }],
  vars: [{ id: "gap", label: "Difference from room", unit: "°C", expr: "temp - room" }],
};

describe("model solver", () => {
  it("matches Newton's law of cooling exactly", () => {
    const run = runModel(compileModel(tea));
    expect(run.ok).toBe(true);
    run.t.forEach((t, i) => expect(run.series.temp[i]).toBeCloseTo(20 + 70 * Math.exp(-0.05 * t), 6));
    expect(stat(run, "gap", "final")).toBeCloseTo(70 * Math.exp(-3), 6);
  });

  it("applies setting overrides", () => {
    const run = runModel(compileModel(tea), { room: 0 });
    expect(stat(run, "temp", "final")).toBeCloseTo(90 * Math.exp(-3), 6);
  });

  it("moves amounts between stocks and conserves the total", () => {
    // A → B at rate k·A: A = A0·e^(−kt), and A + B stays constant.
    const m: ModelDef = {
      timeUnit: "seconds", duration: 10,
      params: [{ id: "k", label: "k", unit: "/s", min: 0, max: 2, value: 0.3, step: 0.1 }],
      stocks: [
        { id: "A", label: "A", unit: "mol/L", initial: "1", min: 0, max: null },
        { id: "B", label: "B", unit: "mol/L", initial: "0", min: 0, max: null },
      ],
      flows: [{ id: "react", label: "reaction", from: "A", to: "B", rate: "k * A" }],
      vars: [],
    };
    const run = runModel(compileModel(m));
    expect(stat(run, "A", "final")).toBeCloseTo(Math.exp(-3), 6);
    run.t.forEach((_, i) => expect(run.series.A[i] + run.series.B[i]).toBeCloseTo(1, 9));
  });

  it("solves a pendulum-like oscillator (two stocks feeding each other)", () => {
    const m: ModelDef = {
      timeUnit: "seconds", duration: 2 * Math.PI,
      params: [],
      stocks: [
        { id: "x", label: "x", unit: "m", initial: "1", min: null, max: null },
        { id: "v", label: "v", unit: "m/s", initial: "0", min: null, max: null },
      ],
      flows: [
        { id: "move", label: "", from: null, to: "x", rate: "v" },
        { id: "pull", label: "", from: null, to: "v", rate: "-x" },
      ],
      vars: [],
    };
    const run = runModel(compileModel(m));
    expect(stat(run, "x", "final")).toBeCloseTo(1, 6); // one full period of cos t
    expect(stat(run, "x", "time_of_min")).toBeCloseTo(Math.PI, 2);
  });

  it("explains broken models instead of running them", () => {
    const bad = (patch: Partial<ModelDef>) => () => compileModel({ ...tea, ...patch });
    expect(bad({ flows: [{ id: "cooling", label: "", from: "temp", to: null, rate: "k * (temp - outside)" }] })).toThrow(/"outside", which isn't defined/);
    expect(bad({ vars: [{ id: "a", label: "", unit: "", expr: "b + 1" }, { id: "b", label: "", unit: "", expr: "a * 2" }] })).toThrow(/go round in a circle/);
    expect(bad({ flows: [{ id: "f", label: "", from: "temp", to: "cup", rate: "1" }] })).toThrow(/"cup", which isn't a stock/);
    expect(bad({ params: [{ ...tea.params[0], id: "t" }, tea.params[1]] })).toThrow(/reserved/);
    expect(bad({ stocks: [{ ...tea.stocks[0], initial: "temp + 1" }] })).toThrow(/can't use "temp" here/);
  });

  it("reports a model that blows up", () => {
    const run = runModel(compileModel({ ...tea, flows: [{ id: "cooling", label: "", from: null, to: "temp", rate: "temp * temp" }] }));
    expect(run.ok).toBe(false);
    expect(run.error).toMatch(/temp blew up/);
  });

  it("keeps the minimum for amounts that can't go negative", () => {
    const run = runModel(compileModel({ ...tea, stocks: [{ ...tea.stocks[0], min: 50 }] }));
    expect(stat(run, "temp", "min")).toBeGreaterThanOrEqual(50);
  });
});
