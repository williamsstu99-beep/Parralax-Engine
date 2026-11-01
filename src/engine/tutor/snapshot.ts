/**
 * What the tutor knows about the student's circuit right now.
 *
 * The tutor never works numbers out itself: the server solves the student's
 * current board with the Truth solver and hands the tutor these readings.
 * Everything here is computed, so the tutor can quote it safely.
 */
import { CATALOG, buildNetlist, type Board, type Part } from "../lens/circuit/board";
import { solveDC } from "../truth/circuit/solver";
import type { ChallengeDef } from "../spec/lesson";
import { partLabel, toChallenge } from "../spec/validate";

const amps = (a: number) => {
  const x = Math.abs(a);
  if (x < 1e-6) return "0 A";
  if (x < 1e-3) return `${(x * 1e6).toFixed(0)} µA`;
  if (x < 1) return `${(x * 1e3).toFixed(x < 0.01 ? 1 : 0)} mA`;
  return `${x.toFixed(2)} A`;
};
const volts = (v: number) => `${Math.abs(v) < 0.005 ? "0.00" : Math.abs(v).toFixed(2)} V`;
const watts = (w: number) => {
  const x = Math.abs(w);
  if (x < 1e-3) return `${(x * 1e6).toFixed(0)} µW`;
  if (x < 1) return `${(x * 1e3).toFixed(0)} mW`;
  return `${x.toFixed(2)} W`;
};

function setting(p: Part): string {
  switch (p.kind) {
    case "battery": return `${p.volts ?? 9} V`;
    case "resistor": case "bulb": return `${p.ohms ?? (p.kind === "bulb" ? 24 : 330)} Ω`;
    case "led": return `${p.color ?? "red"}`;
    case "switch": return p.closed ? "closed" : "open";
    case "capacitor": return `${p.microfarads ?? 1000} µF`;
    case "diode": return "";
  }
}

function brightness(b: number | undefined): string {
  if (b === undefined) return "";
  if (b < 0.05) return ", off";
  if (b < 0.15) return ", barely glowing";
  if (b < 0.5) return ", dim";
  if (b < 0.85) return ", fairly bright";
  return ", bright";
}

export interface Snapshot { text: string; challengeDone: boolean | null }

/** Solve the board and describe it in plain text for the tutor. */
export function boardSnapshot(board: Board, challenge?: ChallengeDef): Snapshot {
  if (!board.parts.length) return { text: "The board is empty.", challengeDone: challenge ? false : null };
  const { circuit } = buildNetlist(board);
  const sol = solveDC(circuit);
  const lines: string[] = [];

  lines.push("Parts (label [id]: setting → solver reading):");
  for (const p of board.parts) {
    const r = sol.components[p.id];
    const s = setting(p);
    const label = partLabel(board, p.id).replace(/^The /, "");
    const head = `- ${label[0].toUpperCase()}${label.slice(1)} [${p.id}, ${CATALOG[p.kind].label.toLowerCase()}]${s ? `: ${s}` : ""}`;
    if (!r || p.kind === "switch") { lines.push(`${head}${r ? `, ${amps(r.amps)} through it` : ""}`); continue; }
    if (p.kind === "battery") { lines.push(`${head} → supplying ${amps(r.amps)}, ${watts(r.watts)}`); continue; }
    if (p.kind === "capacitor") { lines.push(`${head} → ${volts(r.volts)} across it, blocking steady current`); continue; }
    lines.push(`${head} → ${amps(r.amps)}, ${volts(r.volts)} across it, ${watts(r.watts)}${brightness(r.brightness)}`);
  }

  if (board.parts.some(p => p.kind === "capacitor")) {
    lines.push("Note: these are steady-state readings, after every capacitor has finished charging. While charging, the student sees current that dies away over time.");
  }

  const issues = sol.diagnostics.filter(d => d.severity !== "info");
  lines.push(issues.length ? "Problems the engine sees:" : "Problems the engine sees: none.");
  for (const d of issues) lines.push(`- (${d.severity}) ${d.message}`);
  if (!sol.converged) lines.push("- The solver didn't settle, so treat these readings with caution.");

  let challengeDone: boolean | null = null;
  if (challenge) {
    const res = toChallenge(challenge).check(board, sol);
    challengeDone = res.done;
    lines.push(`Challenge "${challenge.title}" (${challenge.goal}): ${res.done ? "SOLVED" : `not solved yet. Engine feedback: ${res.hint}`}`);
  }
  return { text: lines.join("\n"), challengeDone };
}
