/**
 * What the tutor knows about the student's simulation right now.
 *
 * The tutor never works numbers out itself: the server solves the student's
 * current circuit or motion setup with the Truth solvers and hands the tutor these readings.
 * Everything here is computed, so the tutor can quote it safely.
 */
import { CATALOG, buildNetlist, type Board, type Part } from "../lens/circuit/board";
import { solveDC } from "../truth/circuit/solver";
import type { ChallengeDef } from "../spec/lesson";
import { partLabel, toChallenge } from "../spec/validate";
import { BODIES, evalChallenge, type MotionChallenge } from "../lens/motion/model";
import { rampForces, solveMotion } from "../truth/motion/solver";
import { GRAVITY, type MotionSetup, type Planet } from "../truth/motion/types";
import { solvePopulation, type PopulationSetup } from "../truth/population/solver";
import { evalPopChallenge, type PopChallenge, type PopNames } from "../lens/population/model";
import type { ModelSceneDef, ModelSpecDef } from "../spec/lesson";
import { evalModelChallenge, labelsOf, modelDef } from "../spec/model";
import { compileModel, runModel, stat } from "../truth/model/solver";

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

/* ---------------- motion ---------------- */

const PLANET_NAMES: Record<Planet, string> = { earth: "Earth", moon: "the Moon", mars: "Mars", jupiter: "Jupiter" };
const num = (v: number, unit: string, dp = 2) => `${+v.toFixed(dp)} ${unit}`;

/** Solve the student's current motion settings and describe them for the tutor. */
export function motionSnapshot(setup: MotionSetup, challenge?: MotionChallenge, editable?: string[]): Snapshot {
  const r = solveMotion(setup);
  const sm = r.summary;
  const g = GRAVITY[setup.planet];
  const lines: string[] = [];
  if (setup.kind === "projectile") {
    const body = (Object.values(BODIES) as { label: string; mass: number; dragArea: number }[]).find(b => b.mass === setup.mass && b.dragArea === setup.dragArea);
    lines.push(`Motion lab, projectile. Settings: ${body ? `${body.label} (${setup.mass} kg)` : `object of ${setup.mass} kg`}, launch speed ${setup.speed} m/s, angle ${setup.angle}°, launch height ${setup.height} m, on ${PLANET_NAMES[setup.planet]} (g = ${g} m/s²), air resistance ${setup.air ? "on" : "off"}.`);
    if (setup.target) lines.push(`Target zone: centred ${setup.target.x} m from the launch point, ${setup.target.width} m wide.`);
    lines.push(`Solver result for these settings: range ${num(sm.distance, "m", 1)}, highest point ${num(sm.maxHeight, "m", 1)}, time in the air ${num(r.duration, "s")}, landing speed ${num(sm.finalSpeed, "m/s", 1)}${sm.terminalSpeed ? `, terminal velocity ${num(sm.terminalSpeed, "m/s", 1)}` : ""}.`);
    const first = r.samples[0], last = r.samples[r.samples.length - 1];
    lines.push(`Energy: at launch ${num(first.ke, "J")} kinetic + ${num(first.gpe, "J")} gravitational; at landing ${num(last.ke, "J")} kinetic${last.lost > 0 ? `, ${num(last.lost, "J")} turned to heat by air resistance` : ""}.`);
  } else {
    const f = rampForces(setup, setup.startSpeed);
    const endings = { top: "reaches the top of the slope", bottom: "reaches the bottom of the slope", stopped: "comes to a stop on the slope", held: "is held still by friction and never moves" };
    lines.push(`Motion lab, ramp. Settings: ${setup.mass} kg block on a ${setup.angle}° slope ${setup.length} m long, friction coefficient ${setup.friction}, applied force ${setup.force} N along the slope (positive = up), starting at the ${setup.start > 0 ? "top" : "bottom"} with velocity ${setup.startSpeed} m/s, on ${PLANET_NAMES[setup.planet]} (g = ${g} m/s²).`);
    lines.push(`Forces at the start: weight ${num(setup.mass * g, "N", 1)} (${num(-f.weightAlong, "N", 1)} of it acts down the slope), normal reaction ${num(f.normal, "N", 1)}, friction ${num(Math.abs(f.friction), "N", 1)} ${f.friction > 0 ? "up" : f.friction < 0 ? "down" : "along"} the slope, net force ${num(f.net, "N", 1)} along the slope.`);
    lines.push(`Solver result: acceleration ${num(sm.acceleration ?? 0, "m/s²")} (positive = up the slope); the block ${endings[sm.ending ?? "stopped"]}${sm.ending === "held" ? "" : ` after ${num(r.duration, "s")}, final speed ${num(sm.finalSpeed, "m/s")}`}.`);
    const last = r.samples[r.samples.length - 1];
    if (sm.ending !== "held") lines.push(`Energy at the end: ${num(last.ke, "J")} kinetic, ${num(last.gpe, "J")} gravitational, ${num(last.lost, "J")} turned to heat by friction${last.work ? `, ${num(last.work, "J")} of work done by the applied force` : ""}.`);
  }
  if (editable?.length) lines.push(`The student can change: ${editable.join(", ")}.`);
  lines.push(r.diagnostics.length ? `Engine notes: ${r.diagnostics.map(d => d.message).join(" ")}` : "Engine notes: none.");
  let challengeDone: boolean | null = null;
  if (challenge) {
    const res = evalChallenge(challenge, r);
    challengeDone = res.done;
    lines.push(`Challenge "${challenge.title}" (${challenge.goal}): if they ran these settings now it would ${res.done ? "SUCCEED" : `not succeed yet. Engine feedback: ${res.hint}`} (the student only sees the result after they run it, so don't give the outcome away).`);
  }
  return { text: lines.join("\n"), challengeDone };
}

/* ---------------- populations ---------------- */

const pc = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-NZ") : +n.toFixed(1)).toString();

/** Solve the student's current population settings and describe them for the tutor. */
export function populationSnapshot(setup: PopulationSetup, names: PopNames, challenge?: PopChallenge, editable?: string[]): Snapshot {
  const r = solvePopulation(setup), sm = r.summary, hasPred = setup.predators > 0;
  const lines: string[] = [];
  lines.push(`Populations lab. Settings: ${pc(setup.prey)} ${names.prey} to start, growth rate ${setup.growth} per year, carrying capacity ${pc(setup.capacity)}.`);
  if (hasPred) lines.push(`Predators: ${pc(setup.predators)} ${names.predators} to start; each eats ${setup.hunting} ${names.prey} a year at full prey numbers; ${setup.conversion} new ${names.predators} per ${names.prey.replace(/s$/, "")} eaten; death rate ${setup.predatorDeath} per year.`);
  else lines.push(`No predators.`);
  if (setup.trapping > 0 || setup.harvest > 0) lines.push(`Control from year ${setup.controlStart}: ${Math.round(setup.trapping * 100)}% of ${names.predators} trapped and ${Math.round(setup.harvest * 100)}% of ${names.prey} harvested each year.`);
  lines.push(`Solver result over ${setup.years} years: ${names.prey} end at ${pc(sm.final.prey)} (range ${pc(sm.min.prey)} to ${pc(sm.max.prey)})${hasPred ? `; ${names.predators} end at ${pc(sm.final.predators)} (range ${pc(sm.min.predators)} to ${pc(sm.max.predators)})` : ""}.`);
  if (sm.extinct.prey !== undefined) lines.push(`The ${names.prey} die out in year ${sm.extinct.prey.toFixed(1)}.`);
  if (hasPred && sm.extinct.predators !== undefined) lines.push(`The ${names.predators} die out in year ${sm.extinct.predators.toFixed(1)}.`);
  if (sm.equilibrium) lines.push(`Without control, the populations balance around ${pc(sm.equilibrium.prey)} ${names.prey} and ${pc(sm.equilibrium.predators)} ${names.predators}.`);
  if (sm.cycleYears !== undefined) lines.push(`They cycle with a period of about ${sm.cycleYears.toFixed(1)} years.`);
  if (editable?.length) lines.push(`The student can change: ${editable.join(", ")}.`);
  let challengeDone: boolean | null = null;
  if (challenge) {
    const res = evalPopChallenge(challenge, r, names);
    challengeDone = res.done;
    lines.push(`Challenge "${challenge.title}" (${challenge.goal}): if they ran these settings now it would ${res.done ? "SUCCEED" : `not succeed yet. Engine feedback: ${res.hint}`} (the student only sees the result after they run it, so don't give the outcome away).`);
  }
  return { text: lines.join("\n"), challengeDone };
}

/* ---------------- general models ---------------- */

const n3 = (v: number) => (Number.isFinite(v) ? (+v.toPrecision(3)).toString() : "not a number");

/** Run the student's current settings through the lesson's model and describe the results for the tutor. */
export function modelSnapshot(model: ModelSpecDef, values: Record<string, number>, setup: ModelSceneDef): Snapshot {
  const run = runModel(compileModel(modelDef(model)), values);
  const labels = labelsOf(model), tu = model.time_unit;
  const lines: string[] = [];
  lines.push(`Settings now: ${model.settings.map(s => `${s.label} = ${n3(values[s.id] ?? s.value)}${s.unit ? ` ${s.unit}` : ""}`).join("; ")}.`);
  if (setup.editable.length) lines.push(`The student can change: ${setup.editable.map(id => labels[id] ?? id).join(", ")}.`);
  if (!run.ok) lines.push(`With these settings the model can't run: ${run.error}`);
  else {
    lines.push(`Solver results over ${n3(model.duration)} ${tu}:`);
    for (const x of [...model.stocks, ...model.variables]) {
      lines.push(`- ${x.label}: starts ${n3(stat(run, x.id, "at", 0))}, ends ${n3(stat(run, x.id, "final"))}, highest ${n3(stat(run, x.id, "max"))} (at ${n3(stat(run, x.id, "time_of_max"))} ${tu}), lowest ${n3(stat(run, x.id, "min"))} ${x.unit}`);
    }
    for (const f of model.flows) lines.push(`- ${f.label} (rate): starts ${n3(stat(run, f.id, "at", 0))}, peaks ${n3(stat(run, f.id, "max"))} per ${tu.replace(/s$/, "")}`);
    const marks = [0.25, 0.5, 0.75].map(q => q * model.duration);
    lines.push(`Snapshots: ${marks.map(m => `at ${n3(m)} ${tu}: ${model.stocks.map(s => `${s.label} ${n3(stat(run, s.id, "at", m))} ${s.unit}`).join(", ")}`).join("; ")}.`);
  }
  let challengeDone: boolean | null = null;
  if (setup.challenge) {
    const res = evalModelChallenge(setup.challenge, run, labels, tu);
    challengeDone = res.done;
    lines.push(`Challenge "${setup.challenge.title}" (${setup.challenge.goal}): if they ran these settings now it would ${res.done ? "SUCCEED" : `not succeed yet. Engine feedback: ${res.hint}`} (the student only sees the result after they run it, so don't give the outcome away).`);
  }
  return { text: lines.join("\n"), challengeDone };
}
