/**
 * General models in the Lesson Spec: convert the AI's model into a solver
 * definition and check it hard before any student sees it.
 *
 * The AI writes the science (what changes, what drives it); the engine does
 * every calculation. Checks, all fed back to the AI for repair:
 *  - it parses and makes sense (no unknown names, no circular definitions)
 *  - it runs without blowing up, at its defaults and across the settings'
 *    whole range (extremes plus random combinations)
 *  - it reproduces the real-world facts and cause-and-effect the AI stated
 *  - conserved totals stay constant
 *  - every challenge is unsolved at the start but solvable with the settings
 *    the student may change
 */
import { ExprError } from "../truth/model/expr";
import { compileModel, runModel, stat, type Compiled, type ModelDef, type ModelRun, type Stat } from "../truth/model/solver";
import type { ModelSceneDef, ModelSpecDef } from "./lesson";
import type { ValidationResult } from "./validate";

export function modelDef(m: ModelSpecDef): ModelDef {
  return {
    timeUnit: m.time_unit,
    duration: m.duration,
    params: m.settings.map(s => ({ ...s })),
    stocks: m.stocks.map(s => ({ id: s.id, label: s.label, unit: s.unit, initial: s.initial, min: s.min, max: s.max })),
    flows: m.flows.map(f => ({ ...f })),
    vars: m.variables.map(v => ({ ...v })),
  };
}

export const assign = (list: { id: string; value: number }[]) => Object.fromEntries(list.map(a => [a.id, a.value]));

const fmt = (v: number) => (Number.isFinite(v) ? +v.toPrecision(3) : v).toString();

export interface ChallengeCheck { what: string; stat: Stat; at: number | null; min: number | null; max: number | null }

/** Does a run pass a check? Hint names the gap. */
export function evalCheck(c: ChallengeCheck, run: ModelRun, labels: Record<string, string>, timeUnit: string): { pass: boolean; hint: string } {
  const v = stat(run, c.what, c.stat, c.at);
  const lo = c.min ?? -Infinity, hi = c.max ?? Infinity;
  const pass = Number.isFinite(v) && v >= lo && v <= hi;
  const what = c.stat === "time_of_max" ? `${labels[c.what] ?? c.what} peaked at` : c.stat === "time_of_min" ? `${labels[c.what] ?? c.what} was lowest at` : `${labels[c.what] ?? c.what} ${c.stat === "at" ? `at ${c.at} ${timeUnit}` : c.stat === "final" ? "at the end" : c.stat === "max" ? "at its highest" : c.stat === "min" ? "at its lowest" : "on average"} was`;
  const unit = c.stat.startsWith("time_of") ? ` ${timeUnit}` : "";
  const want = c.min !== null && c.max !== null ? `${fmt(lo)} to ${fmt(hi)}` : c.min !== null ? `at least ${fmt(lo)}` : `at most ${fmt(hi)}`;
  return { pass, hint: `${what} ${fmt(v)}${unit}; aim for ${want}${unit}.` };
}

export function evalModelChallenge(ch: NonNullable<ModelSceneDef["challenge"]>, run: ModelRun, labels: Record<string, string>, timeUnit: string) {
  if (!run.ok) return { done: false, hint: run.error ?? "The model couldn't run with these settings." };
  for (const c of ch.checks) { const r = evalCheck(c, run, labels, timeUnit); if (!r.pass) return { done: false, hint: r.hint }; }
  return { done: true, hint: ch.success };
}

export const labelsOf = (m: ModelSpecDef) => Object.fromEntries([...m.stocks, ...m.flows, ...m.variables, ...m.settings].map(x => [x.id, x.label]));

/** Deterministic pseudo-random numbers for the robustness sweep. */
function rng(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }; }

export function findModelSolution(c: Compiled, base: Record<string, number>, editable: string[], check: (run: ModelRun) => boolean): Record<string, number> | null {
  const defs = editable.map(id => c.def.params.find(p => p.id === id)!).filter(Boolean);
  const steps = defs.length <= 1 ? 41 : defs.length === 2 ? 17 : defs.length === 3 ? 8 : 5;
  let tried = 0;
  const walk = (i: number, vals: Record<string, number>): Record<string, number> | null => {
    if (i === defs.length) { tried++; const r = runModel(c, vals); return r.ok && check(r) ? vals : null; }
    for (let k = 0; k < steps; k++) {
      if (tried > 700) return null;
      const d = defs[i];
      const found = walk(i + 1, { ...vals, [d.id]: d.min + ((d.max - d.min) * k) / (steps - 1) });
      if (found) return found;
    }
    return null;
  };
  return walk(0, base);
}

export function validateModelLesson(model: ModelSpecDef | undefined, scenes: { heading: string; setup?: ModelSceneDef }[], out: ValidationResult) {
  const err = (m: string) => out.errors.push(m);
  if (!model) { err("model lessons need a top-level \"model\""); return; }

  // Settings and ranges
  if (!(model.duration > 0 && model.duration <= 1e6)) err(`duration is ${model.duration}; use a positive number of ${model.time_unit}`);
  for (const s of model.settings) {
    if (!(s.min < s.max)) err(`setting ${s.id}: min must be below max`);
    else if (s.value < s.min || s.value > s.max) err(`setting ${s.id}: value ${s.value} is outside ${s.min} to ${s.max}`);
    if (!(s.step > 0) || s.step > s.max - s.min) err(`setting ${s.id}: step must be positive and smaller than the range`);
  }
  for (const s of model.stocks) {
    if ((s.x === null) !== (s.y === null)) err(`stock ${s.id}: give both x and y, or neither`);
    if (s.x !== null && (s.x < 0 || s.x > 100 || s.y! < 0 || s.y! > 100)) err(`stock ${s.id}: x and y must be between 0 and 100`);
    if (s.min !== null && s.max !== null && s.min >= s.max) err(`stock ${s.id}: min must be below max`);
  }
  if (model.facts.length < 2) err("include at least 2 facts: real-world values the model must reproduce, so the engine can check it");
  if (out.errors.length) return;

  let c: Compiled;
  try { c = compileModel(modelDef(model)); } catch (e) {
    if (e instanceof ExprError) { err(`the model doesn't make sense: ${e.message}`); return; }
    throw e;
  }
  const ids = new Set([...model.stocks, ...model.flows, ...model.variables].map(x => x.id));
  const settingIds = new Set(model.settings.map(s => s.id));
  const refs = (what: string, where: string) => { if (!ids.has(what)) err(`${where} refers to "${what}", which isn't a stock, flow or variable`); };
  const setRefs = (list: { id: string; value: number }[], where: string) => {
    for (const a of list) {
      const s = model.settings.find(x => x.id === a.id);
      if (!s) err(`${where} sets "${a.id}", which isn't a setting`);
      else if (a.value < s.min || a.value > s.max) err(`${where} sets ${a.id} to ${a.value}, outside its range ${s.min} to ${s.max}`);
    }
  };
  model.facts.forEach((f, i) => { refs(f.what, `fact ${i + 1}`); setRefs(f.settings, `fact ${i + 1}`); if (f.min === null && f.max === null) err(`fact ${i + 1} ("${f.claim}") needs a min or max`); });
  model.comparisons.forEach((f, i) => { refs(f.what, `comparison ${i + 1}`); setRefs(f.low, `comparison ${i + 1}`); setRefs(f.high, `comparison ${i + 1}`); });
  model.conserved.forEach(id => { if (!model.stocks.some(s => s.id === id)) err(`conserved lists "${id}", which isn't a stock`); });
  model.gauges.forEach(g => { refs(g.what, `gauge "${g.label}"`); if (!(g.min < g.max)) err(`gauge "${g.label}" needs min below max`); });
  if (model.particles) {
    model.particles.species.forEach(sp => refs(sp.what, `particle species "${sp.label}"`));
    if (model.particles.speed) refs(model.particles.speed, "particle speed");
  }
  if (out.errors.length) return;

  const labels = labelsOf(model);
  const exceeds = (run: ModelRun) => {
    for (const s of model.stocks) if (s.max !== null) {
      const peak = Math.max(...run.series[s.id]);
      if (peak > s.max * (1 + 1e-6) + 1e-9) return `${s.id} reached ${fmt(peak)} ${s.unit}, above its max of ${s.max}`;
    }
    return null;
  };

  // Runs at defaults, then across the whole range of every setting.
  const dflt = runModel(c);
  if (!dflt.ok) { err(`with the default settings the model fails: ${dflt.error}`); return; }
  const over = exceeds(dflt);
  if (over) { err(`with the default settings, ${over}; fix the rates or the max`); return; }
  const rand = rng(12345);
  const trials: Record<string, number>[] = [];
  for (const s of model.settings) { trials.push({ [s.id]: s.min }, { [s.id]: s.max }); }
  for (let i = 0; i < 8 && model.settings.length; i++) trials.push(Object.fromEntries(model.settings.map(s => [s.id, s.min + (s.max - s.min) * rand()])));
  for (const tr of trials) {
    const r = runModel(c, tr);
    const desc = Object.entries(tr).map(([k, v]) => `${k} = ${fmt(v)}`).join(", ");
    if (!r.ok) { err(`with ${desc} the model fails: ${r.error}. Every setting combination within the ranges must work; adjust the rules or narrow the ranges`); return; }
    const o = exceeds(r);
    if (o) { err(`with ${desc}, ${o}. Every setting combination within the ranges must stay realistic`); return; }
  }

  // Facts and cause-and-effect
  model.facts.forEach((f, i) => {
    const r = f.settings.length ? runModel(c, assign(f.settings)) : dflt;
    const res = evalCheck(f, r, labels, model.time_unit);
    if (!res.pass) err(`fact ${i + 1} ("${f.claim}") isn't reproduced: ${res.hint} Fix the model's rules or numbers so it matches reality (don't just change the fact)`);
  });
  model.comparisons.forEach((cmp, i) => {
    const a = runModel(c, assign(cmp.low)), b = runModel(c, assign(cmp.high));
    const va = stat(a, cmp.what, cmp.stat, cmp.at), vb = stat(b, cmp.what, cmp.stat, cmp.at);
    if (!(vb > va + 1e-9 * Math.max(1, Math.abs(va)))) err(`comparison ${i + 1} ("${cmp.claim}") isn't shown: ${cmp.what} was ${fmt(va)} in the low case and ${fmt(vb)} in the high case`);
  });
  if (model.conserved.length) {
    const total = (k: number) => model.conserved.reduce((s, id) => s + dflt.series[id][k], 0);
    const t0 = total(0), worst = Math.max(...dflt.t.map((_, k) => Math.abs(total(k) - t0)));
    if (worst > 0.005 * Math.max(Math.abs(t0), 1e-9)) err(`the total of ${model.conserved.join(" + ")} should stay constant but changes by ${fmt(worst)}; check flows to or from outside`);
  }

  // Scenes
  scenes.forEach((sc, i) => {
    const where = `scene ${i + 1} ("${sc.heading}")`;
    const s = sc.setup;
    if (!s) { err(`${where}: model scenes need "setup"`); return; }
    setRefs(s.values, where);
    s.editable.forEach(id => { if (!settingIds.has(id)) err(`${where}: "${id}" is editable but isn't a setting`); });
    if (s.graph.length < 1 || s.graph.length > 3) err(`${where}: graph needs 1 to 3 ids`);
    s.graph.forEach(id => refs(id, `${where} graph`));
    if (!s.challenge) return;
    if (!s.challenge.checks.length) { err(`${where}: the challenge has no checks`); return; }
    s.challenge.checks.forEach(ch => { refs(ch.what, `${where} challenge`); if (ch.min === null && ch.max === null) err(`${where}: each challenge check needs a min or max`); });
    if (!s.editable.length) err(`${where}: the challenge has nothing the student can change`);
    if (out.errors.some(e => e.startsWith(where))) return;
    const base = assign(s.values);
    const startRun = runModel(c, base);
    if (evalModelChallenge(s.challenge, startRun, labels, model.time_unit).done) { err(`${where}: the challenge is already complete with the starting values; start from values that miss`); return; }
    const sol = findModelSolution(c, base, s.editable, r => evalModelChallenge(s.challenge!, r, labels, model.time_unit).done);
    if (!sol) err(`${where}: no combination of the editable settings (${s.editable.join(", ")}) completes the challenge within their ranges; loosen the goal or let the student change more`);
  });
}
