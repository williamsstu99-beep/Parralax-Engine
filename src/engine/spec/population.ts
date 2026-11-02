/**
 * Population scenes in the Lesson Spec: convert the AI's description into a
 * solver setup, and check it before any student sees it. As with motion,
 * challenges must not be solved at the start, and a search over the settings
 * the student may change must find a way to solve them.
 */
import { POP_PARAMS, evalPopChallenge, type PopChallenge, type PopParam, type PopScene } from "../lens/population/model";
import { solvePopulation, type PopulationSetup } from "../truth/population/solver";
import type { PopulationDef, POP_FIELDS } from "./lesson";
import type { ValidationResult } from "./validate";

type PopField = (typeof POP_FIELDS)[number];

export const FIELD_TO_PARAM: Record<PopField, PopParam> = {
  prey_start: "prey", predator_start: "predators", growth: "growth", capacity: "capacity", hunting: "hunting",
  conversion: "conversion", predator_death: "predatorDeath", trapping: "trapping", harvest: "harvest", control_start: "controlStart", years: "years",
};
const PREDATOR_FIELDS: PopField[] = ["predator_start", "hunting", "conversion", "predator_death", "trapping"];

export function popSetup(d: PopulationDef): PopulationSetup {
  const hasPred = !!d.predator_name && d.predator_start > 0;
  return {
    prey: d.prey_start, predators: hasPred ? d.predator_start : 0, growth: d.growth, capacity: d.capacity,
    hunting: d.hunting, conversion: d.conversion, predatorDeath: d.predator_death,
    trapping: d.trapping, harvest: d.harvest, controlStart: d.control_start, years: d.years,
  };
}

const toChallenge = (c: NonNullable<PopulationDef["challenge"]>): PopChallenge => ({
  ...c, checks: c.checks.map(k => ({ kind: k.kind, species: k.species, min: k.min ?? undefined, max: k.max ?? undefined })),
});

export function popScene(d: PopulationDef, id: string, title: string, summary: string): PopScene {
  return {
    id, title, summary, setup: popSetup(d),
    names: { prey: d.prey_name, predators: d.predator_name ?? "predators" },
    editable: d.editable.map(f => FIELD_TO_PARAM[f]),
    challenge: d.challenge ? toChallenge(d.challenge) : undefined,
  };
}

/** Does any combination of the editable settings solve the challenge? */
export function findPopSolution(setup: PopulationSetup, editable: PopParam[], ch: PopChallenge, names: { prey: string; predators: string }): PopulationSetup | null {
  const steps = editable.length <= 1 ? 61 : editable.length === 2 ? 25 : editable.length === 3 ? 11 : 6;
  const values = (p: PopParam): number[] => {
    const d = POP_PARAMS[p];
    return Array.from({ length: steps }, (_, i) => {
      const f = i / (steps - 1);
      if (d.log) { const lo = Math.max(d.min, 1); return Math.round(lo * (d.max / lo) ** f); }
      return +(d.min + (d.max - d.min) * f).toFixed(4);
    });
  };
  let tried = 0;
  const walk = (i: number, s: PopulationSetup): PopulationSetup | null => {
    if (i === editable.length) { tried++; return evalPopChallenge(ch, solvePopulation(s), names).done ? s : null; }
    for (const v of values(editable[i])) {
      if (tried > 4000) return null;
      const found = walk(i + 1, { ...s, [editable[i]]: v });
      if (found) return found;
    }
    return null;
  };
  return walk(0, setup);
}

export function validatePopulation(d: PopulationDef, where: string, out: ValidationResult) {
  const err = (msg: string) => out.errors.push(`${where}: ${msg}`);
  for (const f of Object.keys(FIELD_TO_PARAM) as PopField[]) {
    const def = POP_PARAMS[FIELD_TO_PARAM[f]], v = d[f];
    if (!Number.isFinite(v) || v < def.min || v > def.max) err(`${f} is ${v}; use ${def.min} to ${def.max}`);
  }
  if (d.prey_start > d.capacity * 3) err("prey_start is far above the carrying capacity; start nearer to or below capacity");
  if (!d.prey_name.trim()) err("prey_name is empty");
  const hasPred = !!d.predator_name;
  if (hasPred && d.predator_start <= 0 && !d.editable.includes("predator_start")) err("there's a predator_name but predator_start is 0 and can't be changed; give it starting numbers");
  if (!hasPred) {
    if (d.predator_start > 0) err("predator_start is above 0 but predator_name is null; name the predator or set predator_start to 0");
    for (const f of d.editable) if (PREDATOR_FIELDS.includes(f)) err(`"${f}" is editable but there's no predator`);
  }
  if (hasPred && d.predator_start > 0 && (d.hunting <= 0 || d.conversion <= 0)) err("with predators, hunting and conversion must be above 0, or the predators can't eat or breed");
  if (out.errors.some(e => e.startsWith(where))) return;

  const ch = d.challenge;
  if (!ch) return;
  if (ch.checks.length === 0) { err("the challenge has no checks, so it can never be completed"); return; }
  for (const c of ch.checks) {
    if (c.species === "predators" && !hasPred) err(`a ${c.kind} check is about predators, but there are none`);
    if (c.kind === "final_between" && !(typeof c.min === "number" && typeof c.max === "number" && c.min < c.max)) err("final_between needs min < max");
    if (c.kind === "never_below" && typeof c.min !== "number") err("never_below needs min");
    if (c.kind === "max_below" && typeof c.max !== "number") err("max_below needs max");
  }
  if (d.editable.length === 0) err("the challenge has nothing the student can change; list settings in editable");
  if (out.errors.some(e => e.startsWith(where))) return;

  const setup = popSetup(d), challenge = toChallenge(ch), names = { prey: d.prey_name, predators: d.predator_name ?? "predators" };
  if (evalPopChallenge(challenge, solvePopulation(setup), names).done) {
    err("the challenge is already complete with the starting settings, so the student has nothing to do; start from settings that miss");
    return;
  }
  if (!findPopSolution(setup, d.editable.map(f => FIELD_TO_PARAM[f]), challenge, names)) {
    err(`no combination of the editable settings (${d.editable.join(", ")}) completes the challenge within the lab's ranges; loosen the goal or let the student change more settings`);
  }
}
