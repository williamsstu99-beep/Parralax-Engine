/**
 * Modified Nodal Analysis (MNA) circuit solver.
 *
 * - DC operating point with Newton–Raphson for diodes and LEDs.
 * - Transient analysis with backward-Euler companion models for
 *   capacitors and inductors, steppable one frame at a time so a
 *   simulation can run live in the browser.
 * - Student-facing diagnostics (short circuits, open circuits, floating
 *   parts, reversed or overdriven LEDs) instead of numerical failure.
 */
import type {
  Circuit, Component, ComponentResult, Diagnostic, NodeId, Solution, TransientState,
} from "./types";

const VT = 0.025852;          // thermal voltage at 300 K
const GMIN = 1e-12;           // tiny conductance to ground on every node: keeps the matrix solvable
const WIRE_OHMS = 1e-3;
const SWITCH_ON_OHMS = 1e-3;
const SHORT_CIRCUIT_AMPS = 5;
const DEFAULT_INTERNAL_OHMS = 0.05;

const LED_FORWARD: Record<string, number> = { red: 1.9, yellow: 2.0, green: 2.1, blue: 3.0, white: 3.0 };

/* ---------------- linear algebra ---------------- */

/** Solves A x = b in place with partial pivoting. Returns null if singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-18) return null;
    if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; }
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/* ---------------- device helpers ---------------- */

function diodeParams(c: Component): { Is: number; n: number } {
  if (c.kind === "diode") return { Is: c.saturationAmps ?? 2.52e-9, n: c.ideality ?? 1.752 };
  if (c.kind === "led") {
    const n = 2;
    const vf = c.forwardVolts ?? LED_FORWARD[c.color];
    const iref = c.referenceAmps ?? 0.02;
    return { Is: iref / Math.exp(vf / (n * VT)), n };
  }
  throw new Error("not a diode");
}

const isJunction = (c: Component) => c.kind === "diode" || c.kind === "led";

/** SPICE-style junction voltage limiting so Newton steps cannot overflow exp(). */
function limitJunction(vNew: number, vOld: number, nVt: number, Is: number): number {
  const vcrit = nVt * Math.log(nVt / (Math.SQRT2 * Is));
  if (vNew > vcrit && Math.abs(vNew - vOld) > 2 * nVt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / nVt;
      return arg > 0 ? vOld + nVt * Math.log(arg) : vcrit;
    }
    return nVt * Math.log(vNew / nVt);
  }
  return vNew;
}

/* ---------------- topology checks ---------------- */

/** Components that conduct at DC (used for the open-circuit and floating checks). */
function conductsDC(c: Component): boolean {
  if (c.kind === "capacitor") return false;
  if (c.kind === "switch") return c.closed;
  return true;
}

function components(adj: Map<NodeId, NodeId[]>, start: NodeId): Set<NodeId> {
  const seen = new Set<NodeId>([start]);
  const stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  return seen;
}

/* ---------------- the solver ---------------- */

interface Companion { capG: Record<string, number>; capI: Record<string, number>; indG: Record<string, number>; indI: Record<string, number> }

interface Prepared {
  nodes: NodeId[];               // non-ground nodes in matrix order
  index: Map<NodeId, number>;
  ground: NodeId;
  vsources: Component[];         // components needing a branch-current unknown
}

function prepare(circuit: Circuit): Prepared {
  const all = new Set<NodeId>();
  for (const c of circuit.components) { all.add(c.a); all.add(c.b); }
  const firstSource = circuit.components.find(c => c.kind === "vsource" || c.kind === "isource");
  const ground = circuit.ground ?? firstSource?.b ?? circuit.components[0]?.b ?? "0";
  const nodes = [...all].filter(n => n !== ground).sort();
  const index = new Map(nodes.map((n, i) => [n, i] as const));
  const vsources = circuit.components.filter(c => c.kind === "vsource");
  return { nodes, index, ground, vsources };
}

function assembleAndSolve(
  circuit: Circuit, P: Prepared, junctionV: Record<string, number>, comp: Companion | null,
): number[] | null {
  const N = P.nodes.length, M = P.vsources.length, size = N + M;
  const A = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const z = new Array<number>(size).fill(0);
  const ix = (n: NodeId) => P.index.get(n) ?? -1;
  const stampG = (a: number, b: number, g: number) => {
    if (a >= 0) A[a][a] += g;
    if (b >= 0) A[b][b] += g;
    if (a >= 0 && b >= 0) { A[a][b] -= g; A[b][a] -= g; }
  };
  /** current source of `i` amps flowing from node a to node b through the element */
  const stampI = (a: number, b: number, i: number) => { if (a >= 0) z[a] -= i; if (b >= 0) z[b] += i; };

  for (let k = 0; k < N; k++) A[k][k] += GMIN;

  for (const c of circuit.components) {
    const a = ix(c.a), b = ix(c.b);
    switch (c.kind) {
      case "resistor": case "bulb": stampG(a, b, 1 / Math.max(c.ohms, 1e-6)); break;
      case "wire": stampG(a, b, 1 / WIRE_OHMS); break;
      case "switch": if (c.closed) stampG(a, b, 1 / SWITCH_ON_OHMS); break;
      case "isource": stampI(b, a, c.amps); break; // pushes current out of a into the external circuit
      case "capacitor":
        if (comp) { stampG(a, b, comp.capG[c.id]); stampI(b, a, comp.capI[c.id]); }
        break; // open at DC
      case "inductor":
        if (comp) { stampG(a, b, comp.indG[c.id]); stampI(a, b, comp.indI[c.id]); }
        else stampG(a, b, 1 / WIRE_OHMS); // short at DC
        break;
      case "diode": case "led": {
        const { Is, n } = diodeParams(c), nVt = n * VT, vd = junctionV[c.id] ?? 0;
        const e = Math.exp(Math.min(vd / nVt, 80));
        const id = Is * (e - 1), gd = Is / nVt * e + GMIN;
        stampG(a, b, gd); stampI(a, b, id - gd * vd);
        break;
      }
      case "vsource": break;
    }
  }
  P.vsources.forEach((c, k) => {
    if (c.kind !== "vsource") return;
    const row = N + k, a = ix(c.a), b = ix(c.b);
    if (a >= 0) { A[a][row] += 1; A[row][a] += 1; }
    if (b >= 0) { A[b][row] -= 1; A[row][b] -= 1; }
    // internal resistance in series: V(a) - V(b) + R_int * I_branch = V
    A[row][row] -= (c.internalOhms ?? DEFAULT_INTERNAL_OHMS);
    z[row] = c.volts;
  });
  return solveLinear(A, z);
}

function solveCore(circuit: Circuit, comp: Companion | null, guess?: Record<string, number>): Solution {
  const P = prepare(circuit);
  const diagnostics: Diagnostic[] = [];
  const junctions = circuit.components.filter(isJunction);
  const jv: Record<string, number> = { ...(guess ?? {}) };
  for (const j of junctions) jv[j.id] ??= 0.6;

  let x: number[] | null = null, iterations = 0, converged = false;
  const volt = (sol: number[], n: NodeId) => (n === P.ground ? 0 : sol[P.index.get(n)!]);
  for (; iterations < 200; iterations++) {
    x = assembleAndSolve(circuit, P, jv, comp);
    if (!x) break;
    if (junctions.length === 0) { converged = true; break; }
    let maxDelta = 0;
    for (const j of junctions) {
      const { Is, n } = diodeParams(j);
      const raw = volt(x, j.a) - volt(x, j.b);
      const lim = limitJunction(raw, jv[j.id], n * VT, Is);
      maxDelta = Math.max(maxDelta, Math.abs(lim - jv[j.id]));
      jv[j.id] = lim;
    }
    if (maxDelta < 1e-9) { converged = true; break; }
  }

  const nodeVolts: Record<NodeId, number> = { [P.ground]: 0 };
  for (const n of P.nodes) nodeVolts[n] = x ? volt(x, n) : 0;
  const results: Record<string, ComponentResult> = {};
  const vOf = (n: NodeId) => nodeVolts[n] ?? 0;

  for (const c of circuit.components) {
    const v = vOf(c.a) - vOf(c.b);
    let i = 0;
    switch (c.kind) {
      case "resistor": case "bulb": i = v / Math.max(c.ohms, 1e-6); break;
      case "wire": i = v / WIRE_OHMS; break;
      case "switch": i = c.closed ? v / SWITCH_ON_OHMS : 0; break;
      case "isource": i = -c.amps; break;
      case "capacitor": i = comp ? comp.capG[c.id] * v - comp.capI[c.id] : 0; break;
      case "inductor": i = comp ? comp.indG[c.id] * v + comp.indI[c.id] : v / WIRE_OHMS; break;
      case "diode": case "led": { const { Is, n } = diodeParams(c); i = Is * (Math.exp(Math.min(v / (n * VT), 80)) - 1); break; }
      case "vsource": { const k = P.vsources.indexOf(c); i = x ? x[P.nodes.length + k] : 0; break; }
    }
    const r: ComponentResult = { amps: i, volts: v, watts: v * i };
    if (c.kind === "bulb") r.brightness = Math.min(1, Math.max(0, r.watts) / (c.ratedWatts ?? 5));
    if (c.kind === "led") r.brightness = Math.min(1, Math.max(0, i) / (c.referenceAmps ?? 0.02));
    results[c.id] = r;
  }

  diagnose(circuit, P, results, diagnostics);
  if (!converged && x) diagnostics.push({ code: "no_convergence", severity: "warning", targets: junctions.map(j => j.id), message: "The circuit is hard to solve exactly; the values shown are approximate." });
  return { nodeVolts, components: results, diagnostics, converged, iterations: iterations + 1 };
}

function diagnose(circuit: Circuit, P: Prepared, r: Record<string, ComponentResult>, out: Diagnostic[]) {
  const sources = circuit.components.filter(c => c.kind === "vsource" || c.kind === "isource");
  if (sources.length === 0) {
    out.push({ code: "no_source", severity: "info", targets: [], message: "Nothing is powering this circuit yet. Add a battery." });
    return;
  }
  // floating parts: not DC-connected to any source terminal
  const adj = new Map<NodeId, NodeId[]>();
  const link = (a: NodeId, b: NodeId) => { adj.set(a, [...(adj.get(a) ?? []), b]); adj.set(b, [...(adj.get(b) ?? []), a]); };
  for (const c of circuit.components) if (conductsDC(c) || c.kind === "capacitor") link(c.a, c.b);
  const reach = new Set<NodeId>();
  for (const s of sources) for (const n of components(adj, s.a)) reach.add(n);
  const floating = circuit.components.filter(c => !reach.has(c.a) && !reach.has(c.b)).map(c => c.id);
  if (floating.length) out.push({ code: "floating", severity: "warning", targets: floating, message: "Some parts aren't connected to the battery, so nothing flows through them." });

  for (const s of sources) {
    const i = Math.abs(r[s.id].amps);
    if (s.kind === "vsource" && i > SHORT_CIRCUIT_AMPS) {
      out.push({ code: "short_circuit", severity: "error", targets: [s.id], message: `Short circuit: ${i.toFixed(1)} A is flowing straight back into the battery. In real life the wires would get hot fast. Add a resistor or a bulb.` });
    }
  }
  const anyFlow = sources.some(s => Math.abs(r[s.id].amps) > 1e-6);
  if (!anyFlow) out.push({ code: "open_circuit", severity: "info", targets: sources.map(s => s.id), message: "There's a gap somewhere, so the loop isn't complete and no current flows." });

  for (const c of circuit.components) {
    const res = r[c.id];
    if (c.kind === "led") {
      if (res.amps > (c.maxAmps ?? 0.03)) out.push({ code: "led_overcurrent", severity: "error", targets: [c.id], message: `The LED is getting ${(res.amps * 1000).toFixed(0)} mA, above its ${((c.maxAmps ?? 0.03) * 1000).toFixed(0)} mA limit, and would burn out. Use a bigger resistor.` });
      if (res.volts < -0.5) out.push({ code: "led_reverse", severity: "info", targets: [c.id], message: "The LED is in backwards. LEDs only let current through one way: flip it round." });
    }
    if (c.kind === "bulb" && res.watts > 2 * (c.ratedWatts ?? 5)) {
      out.push({ code: "bulb_overpower", severity: "warning", targets: [c.id], message: "This bulb is running at more than twice its rated power and would blow." });
    }
  }
}

/* ---------------- public API ---------------- */

/** DC operating point: capacitors open, inductors shorted. */
export function solveDC(circuit: Circuit): Solution {
  return solveCore(circuit, null);
}

export function initialTransientState(circuit: Circuit): TransientState {
  const capVolts: Record<string, number> = {}, indAmps: Record<string, number> = {};
  for (const c of circuit.components) {
    if (c.kind === "capacitor") capVolts[c.id] = c.initialVolts ?? 0;
    if (c.kind === "inductor") indAmps[c.id] = c.initialAmps ?? 0;
  }
  return { time: 0, capVolts, indAmps, solution: null };
}

/** Advance a transient simulation by `dt` seconds (backward Euler). Pure: returns a new state. */
export function step(circuit: Circuit, state: TransientState, dt: number): TransientState {
  const comp: Companion = { capG: {}, capI: {}, indG: {}, indI: {} };
  for (const c of circuit.components) {
    if (c.kind === "capacitor") { const g = c.farads / dt; comp.capG[c.id] = g; comp.capI[c.id] = g * (state.capVolts[c.id] ?? 0); }
    if (c.kind === "inductor") { comp.indG[c.id] = dt / c.henries; comp.indI[c.id] = state.indAmps[c.id] ?? 0; }
  }
  const guess: Record<string, number> = {};
  if (state.solution) for (const c of circuit.components) if (isJunction(c)) guess[c.id] = state.solution.components[c.id]?.volts ?? 0.6;
  const solution = solveCore(circuit, comp, guess);
  const capVolts: Record<string, number> = {}, indAmps: Record<string, number> = {};
  for (const c of circuit.components) {
    if (c.kind === "capacitor") capVolts[c.id] = solution.components[c.id].volts;
    if (c.kind === "inductor") indAmps[c.id] = solution.components[c.id].amps;
  }
  return { time: state.time + dt, capVolts, indAmps, solution };
}
