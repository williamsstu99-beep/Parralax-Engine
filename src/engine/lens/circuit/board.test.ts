import { describe, expect, it } from "vitest";
import { buildNetlist, route, terminals, type Board } from "./board";
import { SAMPLES } from "./samples";
import { initialTransientState, solveDC, step } from "../../truth/circuit/solver";

const sample = (id: string) => structuredClone(SAMPLES.find(s => s.id === id)!.board);
const solve = (b: Board) => solveDC(buildNetlist(b).circuit);

describe("board → netlist", () => {
  it("battery terminal mapping: + is t1", () => {
    const [a, b] = terminals({ id: "x", kind: "battery", x: 5, y: 7, rot: 3 });
    expect(a).toEqual({ x: 5, y: 6 });
    expect(b).toEqual({ x: 5, y: 8 });
  });

  it("open switch: no current, then close it and the bulb lights", () => {
    const b = sample("bulb");
    expect(Math.abs(solve(b).components.bulb.amps)).toBeLessThan(1e-9);
    b.parts.find(p => p.id === "sw")!.closed = true;
    const s = solve(b);
    // 9 V / (24 Ω + 0.5 Ω internal + tiny wire/switch resistance)
    expect(s.components.bulb.amps).toBeCloseTo(9 / 24.5, 3);
    expect(s.diagnostics).toEqual([]);
  });

  it("every wire segment carries the loop current", () => {
    const b = sample("bulb");
    b.parts.find(p => p.id === "sw")!.closed = true;
    const s = solve(b);
    const segs = buildNetlist(b).segs;
    for (const seg of segs) expect(Math.abs(s.components[seg.id].amps)).toBeCloseTo(9 / 24.5, 3);
  });

  it("T-junctions split wires so parallel branches share current", () => {
    const s = solve(sample("parallel"));
    expect(s.components.b1.amps).toBeCloseTo(s.components.b2.amps, 3); // b2 also passes through a switch: a few µA less
    expect(Math.abs(s.components.bat.amps)).toBeCloseTo(s.components.b1.amps + s.components.b2.amps, 6);
  });

  it("LED challenge starts in the burnt-out state and is fixed by a 330 Ω resistor", () => {
    const ch = SAMPLES.find(s => s.id === "led")!;
    const b = sample("led");
    expect(ch.challenge!.check(b, solve(b)).done).toBe(false);
    expect(solve(b).diagnostics.map(d => d.code)).toContain("led_overcurrent");
    b.parts.find(p => p.id === "r1")!.ohms = 330;
    expect(ch.challenge!.check(b, solve(b)).done).toBe(true);
  });

  it("RC sample: LED current decays after the switch closes", () => {
    const b = sample("rc");
    b.parts.find(p => p.id === "sw")!.closed = true;
    const c = buildNetlist(b).circuit;
    let st = initialTransientState(c);
    st = step(c, st, 1 / 60);
    const early = st.solution!.components.led.amps;
    for (let i = 0; i < 60 * 6; i++) st = step(c, st, 1 / 60);
    expect(early).toBeGreaterThan(0.008);
    expect(st.solution!.components.led.amps).toBeLessThan(early / 5);
  });

  it("route makes one bend, longer leg first", () => {
    expect(route({ x: 0, y: 0 }, { x: 5, y: 2 })).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2 }]);
    expect(route({ x: 0, y: 0 }, { x: 1, y: 4 })).toEqual([{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 1, y: 4 }]);
  });
});
