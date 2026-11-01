/**
 * Circuit Truth layer: component and result types.
 *
 * Every number a student sees in a circuit lesson comes from this solver,
 * never from a language model. Nodes are plain string ids; a component
 * connects two of them (`a` -> `b`). Positive current flows from `a` to `b`
 * through the component (for sources: out of `a`, the positive terminal,
 * around the external circuit, back into `b`).
 */

export type NodeId = string;

interface Base {
  id: string;
  a: NodeId;
  b: NodeId;
}

/** Ideal resistor. */
export interface Resistor extends Base { kind: "resistor"; ohms: number }

/** Battery / DC voltage source with optional internal resistance (default 0.05 Ω). */
export interface VoltageSource extends Base { kind: "vsource"; volts: number; internalOhms?: number }

/** Ideal DC current source, pushing `amps` out of `a` through the external circuit into `b`. */
export interface CurrentSource extends Base { kind: "isource"; amps: number }

/** Capacitor. Open circuit at DC; companion model in transient analysis. */
export interface Capacitor extends Base { kind: "capacitor"; farads: number; initialVolts?: number }

/** Inductor. Short circuit at DC; companion model in transient analysis. */
export interface Inductor extends Base { kind: "inductor"; henries: number; initialAmps?: number }

/**
 * Diode (Shockley model). `a` is the anode, `b` the cathode.
 * Defaults model a 1N4148-like silicon diode.
 */
export interface Diode extends Base { kind: "diode"; saturationAmps?: number; ideality?: number }

/**
 * LED: a diode parameterised by its forward voltage at a reference current,
 * plus a maximum current above which it is reported as damaged.
 */
export interface LED extends Base {
  kind: "led";
  color: "red" | "green" | "blue" | "white" | "yellow";
  forwardVolts?: number;   // at referenceAmps; default depends on colour
  referenceAmps?: number;  // default 20 mA
  maxAmps?: number;        // default 30 mA
}

/** Incandescent bulb, modelled as a resistor with a power rating for brightness. */
export interface Bulb extends Base { kind: "bulb"; ohms: number; ratedWatts?: number }

/** Switch: a near-zero resistance when closed, an open circuit when open. */
export interface Switch extends Base { kind: "switch"; closed: boolean }

/** Connecting wire (a tiny resistance so its current can be read and animated). */
export interface Wire extends Base { kind: "wire" }

export type Component =
  | Resistor | VoltageSource | CurrentSource | Capacitor | Inductor
  | Diode | LED | Bulb | Switch | Wire;

export type ComponentKind = Component["kind"];

export interface Circuit {
  components: Component[];
  /** Reference node (0 V). Defaults to the negative terminal of the first source. */
  ground?: NodeId;
}

export type DiagnosticCode =
  | "short_circuit"       // a source is delivering a dangerous current
  | "floating"            // components not connected to the rest of the circuit
  | "open_circuit"        // no closed loop through a source: nothing flows
  | "led_overcurrent"     // an LED is above its maximum current
  | "led_reverse"         // an LED is connected backwards to a source
  | "bulb_overpower"      // a bulb is dissipating far above its rating
  | "no_source"           // there is nothing to drive the circuit
  | "no_convergence";     // the non-linear solve did not settle

export interface Diagnostic {
  code: DiagnosticCode;
  severity: "info" | "warning" | "error";
  /** Component or node ids involved, so a Lens can highlight them. */
  targets: string[];
  /** Plain-English explanation suitable for a student. */
  message: string;
}

export interface ComponentResult {
  /** Current from `a` to `b` through the component, in amps. */
  amps: number;
  /** Voltage V(a) - V(b), in volts. */
  volts: number;
  /** Power absorbed (positive) or delivered (negative), in watts. */
  watts: number;
  /** 0..1 brightness for bulbs and LEDs; undefined for other parts. */
  brightness?: number;
}

export interface Solution {
  nodeVolts: Record<NodeId, number>;
  components: Record<string, ComponentResult>;
  diagnostics: Diagnostic[];
  converged: boolean;
  iterations: number;
}

/** Per-component memory carried between transient steps. */
export interface TransientState {
  time: number;
  capVolts: Record<string, number>;
  indAmps: Record<string, number>;
  solution: Solution | null;
}
