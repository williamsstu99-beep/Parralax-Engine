import { describe, expect, it } from "vitest";
import { initialTransientState, solveDC, step } from "./solver";
import type { Circuit } from "./types";

const battery = (volts: number, internalOhms = 0) => ({ id: "bat", kind: "vsource" as const, a: "p", b: "0", volts, internalOhms });

describe("DC: linear circuits", () => {
  it("voltage divider", () => {
    const c: Circuit = { components: [battery(12), { id: "r1", kind: "resistor", a: "p", b: "m", ohms: 1000 }, { id: "r2", kind: "resistor", a: "m", b: "0", ohms: 2000 }] };
    const s = solveDC(c);
    expect(s.nodeVolts.m).toBeCloseTo(8, 6);
    expect(s.components.r1.amps).toBeCloseTo(0.004, 8);
    expect(s.diagnostics).toEqual([]);
  });

  it("series bulbs share the voltage and dim", () => {
    const one = solveDC({ components: [battery(9), { id: "b1", kind: "bulb", a: "p", b: "0", ohms: 12 }] });
    const two = solveDC({ components: [battery(9), { id: "b1", kind: "bulb", a: "p", b: "m", ohms: 12 }, { id: "b2", kind: "bulb", a: "m", b: "0", ohms: 12 }] });
    expect(one.components.b1.amps).toBeCloseTo(0.75, 6);
    expect(two.components.b1.amps).toBeCloseTo(0.375, 6);
    expect(two.components.b1.watts).toBeCloseTo(one.components.b1.watts / 4, 6);
  });

  it("parallel branches add currents", () => {
    const s = solveDC({ components: [battery(6), { id: "r1", kind: "resistor", a: "p", b: "0", ohms: 3 }, { id: "r2", kind: "resistor", a: "p", b: "0", ohms: 6 }] });
    expect(-s.components.bat.amps).toBeCloseTo(3, 6);  // source current flows out of + terminal
  });

  it("battery internal resistance sags the terminal voltage", () => {
    const s = solveDC({ components: [battery(9, 1), { id: "r", kind: "resistor", a: "p", b: "0", ohms: 8 }] });
    expect(s.nodeVolts.p).toBeCloseTo(8, 6);
  });

  it("open switch stops the current and says why", () => {
    const s = solveDC({ components: [battery(9), { id: "sw", kind: "switch", a: "p", b: "m", closed: false }, { id: "b", kind: "bulb", a: "m", b: "0", ohms: 12 }] });
    expect(Math.abs(s.components.b.amps)).toBeLessThan(1e-9);
    expect(s.diagnostics.map(d => d.code)).toContain("open_circuit");
  });
});

describe("DC: semiconductors", () => {
  it("red LED with a 330 Ω resistor on 9 V draws about 21 mA", () => {
    const s = solveDC({ components: [battery(9), { id: "r", kind: "resistor", a: "p", b: "m", ohms: 330 }, { id: "led", kind: "led", color: "red", a: "m", b: "0" }] });
    expect(s.converged).toBe(true);
    expect(s.components.led.amps).toBeGreaterThan(0.0205);
    expect(s.components.led.amps).toBeLessThan(0.0218);
    expect(s.components.led.volts).toBeGreaterThan(1.85);
    expect(s.components.led.volts).toBeLessThan(1.95);
    expect(s.diagnostics).toEqual([]);
  });

  it("LED without a resistor is flagged as overcurrent", () => {
    const s = solveDC({ components: [{ ...battery(9), internalOhms: 1 }, { id: "led", kind: "led", color: "red", a: "p", b: "0" }] });
    expect(s.diagnostics.map(d => d.code)).toContain("led_overcurrent");
  });

  it("reversed LED blocks current and is explained", () => {
    const s = solveDC({ components: [battery(5), { id: "r", kind: "resistor", a: "p", b: "m", ohms: 220 }, { id: "led", kind: "led", color: "green", a: "0", b: "m" }] });
    expect(Math.abs(s.components.led.amps)).toBeLessThan(1e-6);
    expect(s.diagnostics.map(d => d.code)).toContain("led_reverse");
  });

  it("silicon diode drops roughly 0.6–0.75 V", () => {
    const s = solveDC({ components: [battery(5), { id: "r", kind: "resistor", a: "p", b: "m", ohms: 1000 }, { id: "d", kind: "diode", a: "m", b: "0" }] });
    expect(s.components.d.volts).toBeGreaterThan(0.6);
    expect(s.components.d.volts).toBeLessThan(0.75);
  });
});

describe("DC: problems a student will create", () => {
  it("short circuit is detected, not a crash", () => {
    const s = solveDC({ components: [battery(9, 0.05), { id: "w", kind: "wire", a: "p", b: "0" }] });
    expect(s.diagnostics.map(d => d.code)).toContain("short_circuit");
  });

  it("floating parts are reported", () => {
    const s = solveDC({ components: [battery(9), { id: "r", kind: "resistor", a: "p", b: "0", ohms: 100 }, { id: "lonely", kind: "resistor", a: "x", b: "y", ohms: 100 }] });
    const d = s.diagnostics.find(d => d.code === "floating");
    expect(d?.targets).toEqual(["lonely"]);
  });

  it("no battery is an info message", () => {
    const s = solveDC({ components: [{ id: "r", kind: "resistor", a: "x", b: "y", ohms: 10 }] });
    expect(s.diagnostics[0].code).toBe("no_source");
  });
});

describe("Transient", () => {
  it("RC circuit reaches 63.2% at one time constant", () => {
    const c: Circuit = { components: [battery(10), { id: "r", kind: "resistor", a: "p", b: "m", ohms: 1000 }, { id: "c", kind: "capacitor", a: "m", b: "0", farads: 1e-3 }] };
    let st = initialTransientState(c);
    const dt = 1e-4; // tau = 1 s
    for (let i = 0; i < 10000; i++) st = step(c, st, dt);
    expect(st.time).toBeCloseTo(1, 6);
    expect(st.capVolts.c).toBeGreaterThan(6.30);
    expect(st.capVolts.c).toBeLessThan(6.34);
  });

  it("RL circuit current rises with tau = L/R", () => {
    const c: Circuit = { components: [battery(10), { id: "r", kind: "resistor", a: "p", b: "m", ohms: 10 }, { id: "l", kind: "inductor", a: "m", b: "0", henries: 1 }] };
    let st = initialTransientState(c);
    for (let i = 0; i < 1000; i++) st = step(c, st, 1e-4); // 0.1 s = 1 tau
    expect(st.indAmps.l).toBeGreaterThan(0.630);
    expect(st.indAmps.l).toBeLessThan(0.634);
  });

  it("capacitor discharging through an LED keeps it lit then fades", () => {
    const c: Circuit = { components: [{ id: "c", kind: "capacitor", a: "p", b: "0", farads: 1e-3, initialVolts: 5 }, { id: "r", kind: "resistor", a: "p", b: "m", ohms: 100 }, { id: "led", kind: "led", color: "blue", a: "m", b: "0" }, { id: "src", kind: "isource", a: "0", b: "0", amps: 0 }] };
    let st = initialTransientState(c);
    st = step(c, st, 1e-3);
    const early = st.solution!.components.led.amps;
    for (let i = 0; i < 500; i++) st = step(c, st, 1e-3);
    const late = st.solution!.components.led.amps;
    expect(early).toBeGreaterThan(0.005);
    expect(late).toBeLessThan(early / 3);
  });
});
