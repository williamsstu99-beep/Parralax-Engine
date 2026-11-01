/**
 * The circuit board model: what the student sees and edits.
 *
 * Parts sit on integer grid points and span two grid units, with a terminal
 * at each end. Wires are orthogonal polylines between grid points. This
 * module turns a board into a solver netlist: every terminal and wire
 * vertex is a node, and wires are split wherever another terminal or wire
 * end touches them (T-junctions), so every wire segment gets its own
 * current for the flow animation.
 */
import type { Circuit, Component, LED } from "../../truth/circuit/types";

export type PartKind = "battery" | "resistor" | "bulb" | "led" | "switch" | "capacitor" | "diode";
export type Rot = 0 | 1 | 2 | 3;
export interface Pt { x: number; y: number }

export interface Part {
  id: string;
  kind: PartKind;
  x: number;
  y: number;
  rot: Rot;
  volts?: number;        // battery
  ohms?: number;         // resistor, bulb
  color?: LED["color"];  // led
  closed?: boolean;      // switch
  microfarads?: number;  // capacitor
}

export interface Wire { id: string; points: Pt[] }

export interface Board { parts: Part[]; wires: Wire[] }

export const DIRS: readonly Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

export interface PartInfo { label: string; blurb: string; defaults: Partial<Part> }
export const CATALOG: Record<PartKind, PartInfo> = {
  battery: { label: "Battery", blurb: "Pushes charge around the circuit.", defaults: { volts: 9 } },
  resistor: { label: "Resistor", blurb: "Limits how much current flows.", defaults: { ohms: 330 } },
  bulb: { label: "Bulb", blurb: "Glows when current flows through it.", defaults: { ohms: 24 } },
  led: { label: "LED", blurb: "Lights up, but only one way round. Needs a resistor.", defaults: { color: "red" } },
  switch: { label: "Switch", blurb: "Click to open or close the circuit.", defaults: { closed: false } },
  capacitor: { label: "Capacitor", blurb: "Stores charge, then lets it go.", defaults: { microfarads: 1000 } },
  diode: { label: "Diode", blurb: "Lets current through in one direction only.", defaults: {} },
};

export const BATTERY_INTERNAL_OHMS = 0.5;
export const BULB_RATED_WATTS = 3;

export const key = (p: Pt) => `${p.x},${p.y}`;
export const samePt = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;

/** The two ends of a part: [t0, t1] = centre minus / plus its direction. */
export function ends(p: Part): [Pt, Pt] {
  const d = DIRS[p.rot];
  return [{ x: p.x - d.x, y: p.y - d.y }, { x: p.x + d.x, y: p.y + d.y }];
}

/**
 * Which end is which electrically. Batteries have + on t1; LEDs and diodes
 * have the anode on t0. Returns [a, b] in solver convention.
 */
export function terminals(p: Part): [Pt, Pt] {
  const [t0, t1] = ends(p);
  return p.kind === "battery" ? [t1, t0] : [t0, t1];
}

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  return false;
}

export interface WireSeg { id: string; wireId: string; a: Pt; b: Pt }

export interface Netlist { circuit: Circuit; segs: WireSeg[] }

export function toComponent(p: Part): Component {
  const [ta, tb] = terminals(p);
  const a = key(ta), b = key(tb), id = p.id;
  switch (p.kind) {
    case "battery": return { id, kind: "vsource", a, b, volts: p.volts ?? 9, internalOhms: BATTERY_INTERNAL_OHMS };
    case "resistor": return { id, kind: "resistor", a, b, ohms: p.ohms ?? 330 };
    case "bulb": return { id, kind: "bulb", a, b, ohms: p.ohms ?? 24, ratedWatts: BULB_RATED_WATTS };
    case "led": return { id, kind: "led", a, b, color: p.color ?? "red" };
    case "switch": return { id, kind: "switch", a, b, closed: !!p.closed };
    case "capacitor": return { id, kind: "capacitor", a, b, farads: (p.microfarads ?? 1000) * 1e-6 };
    case "diode": return { id, kind: "diode", a, b };
  }
}

export function buildNetlist(board: Board): Netlist {
  // every point something can connect at
  const junctions: Pt[] = [];
  const seen = new Set<string>();
  const addPt = (p: Pt) => { const k = key(p); if (!seen.has(k)) { seen.add(k); junctions.push(p); } };
  for (const p of board.parts) for (const t of ends(p)) addPt(t);
  for (const w of board.wires) for (const pt of w.points) addPt(pt);

  const segs: WireSeg[] = [];
  for (const w of board.wires) {
    let n = 0;
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1];
      if (samePt(a, b)) continue;
      const along = junctions
        .filter(p => onSegment(p, a, b))
        .sort((p, q) => (Math.abs(p.x - a.x) + Math.abs(p.y - a.y)) - (Math.abs(q.x - a.x) + Math.abs(q.y - a.y)));
      for (let k = 0; k + 1 < along.length; k++) {
        if (samePt(along[k], along[k + 1])) continue;
        segs.push({ id: `${w.id}#${n++}`, wireId: w.id, a: along[k], b: along[k + 1] });
      }
    }
  }

  const components: Component[] = board.parts.map(toComponent);
  for (const s of segs) components.push({ id: s.id, kind: "wire", a: key(s.a), b: key(s.b) });
  return { circuit: { components }, segs };
}

/** Map a solver target id (part id or wire segment id) back to the board item it belongs to. */
export const boardIdOf = (solverId: string) => solverId.split("#")[0];

/** Orthogonal route between two grid points: one bend, longer leg first. */
export function route(a: Pt, b: Pt): Pt[] {
  if (a.x === b.x || a.y === b.y) return [a, b];
  const corner = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [a, corner, b];
}

export const hasDynamics = (board: Board) => board.parts.some(p => p.kind === "capacitor");

let counter = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;
