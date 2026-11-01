/**
 * The population lab's model: settings, challenge checks and preset scenes.
 */
import type { PopulationResult, PopulationSetup } from "../../truth/population/solver";

export type PopParam = keyof PopulationSetup;

export interface PopParamDef { label: string; unit: string; min: number; max: number; step: number; log?: boolean; percent?: boolean; predatorOnly?: boolean }

export const POP_PARAMS: Record<PopParam, PopParamDef> = {
  prey: { label: "Starting prey", unit: "", min: 1, max: 100000, step: 1, log: true },
  predators: { label: "Starting predators", unit: "", min: 0, max: 10000, step: 1, log: true, predatorOnly: true },
  growth: { label: "Prey growth rate", unit: "per year", min: 0, max: 3, step: 0.05 },
  capacity: { label: "Carrying capacity", unit: "", min: 10, max: 100000, step: 1, log: true },
  hunting: { label: "Prey eaten per predator", unit: "per year", min: 0, max: 500, step: 1, predatorOnly: true },
  conversion: { label: "Predator births per prey eaten", unit: "", min: 0, max: 0.5, step: 0.005, predatorOnly: true },
  predatorDeath: { label: "Predator death rate", unit: "per year", min: 0, max: 2, step: 0.05, predatorOnly: true },
  trapping: { label: "Predators trapped", unit: "per year", min: 0, max: 0.95, step: 0.05, percent: true, predatorOnly: true },
  harvest: { label: "Prey harvested", unit: "per year", min: 0, max: 0.95, step: 0.05, percent: true },
  controlStart: { label: "Control starts in year", unit: "", min: 0, max: 100, step: 1 },
  years: { label: "Years to run", unit: "", min: 5, max: 200, step: 5 },
};

export type Species = "prey" | "predators";
export type PopCheckKind = "final_between" | "never_below" | "max_below" | "survives" | "goes_extinct";
export interface PopCheck { kind: PopCheckKind; species: Species; min?: number; max?: number }
export interface PopChallenge { title: string; goal: string; checks: PopCheck[]; hint_if_stuck: string; success: string }

export interface PopNames { prey: string; predators: string }

const count = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-NZ") : n.toFixed(n < 10 ? 1 : 0));

export function evalPopCheck(c: PopCheck, r: PopulationResult, names: PopNames): { pass: boolean; hint: string } {
  const name = names[c.species], sm = r.summary;
  switch (c.kind) {
    case "final_between": {
      const v = sm.final[c.species], lo = c.min ?? 0, hi = c.max ?? Infinity;
      return { pass: v >= lo && v <= hi, hint: `${cap(name)} ended at ${count(v)}; aim for ${count(lo)} to ${hi === Infinity ? "any number" : count(hi)}.` };
    }
    case "never_below": {
      const v = sm.min[c.species], lo = c.min ?? 0;
      return { pass: v >= lo, hint: `${cap(name)} fell to ${count(v)}; keep them at ${count(lo)} or more the whole time.` };
    }
    case "max_below": {
      const v = sm.max[c.species], hi = c.max ?? Infinity;
      return { pass: v <= hi, hint: `${cap(name)} peaked at ${count(v)}; keep them at ${count(hi)} or fewer.` };
    }
    case "survives": return { pass: sm.extinct[c.species] === undefined, hint: `The ${name} died out in year ${sm.extinct[c.species]?.toFixed(0)}.` };
    case "goes_extinct": return { pass: sm.extinct[c.species] !== undefined, hint: `The ${name} are still hanging on (${count(sm.final[c.species])} left).` };
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function evalPopChallenge(ch: PopChallenge, r: PopulationResult, names: PopNames): { done: boolean; hint: string } {
  for (const c of ch.checks) {
    const res = evalPopCheck(c, r, names);
    if (!res.pass) return { done: false, hint: res.hint };
  }
  return { done: true, hint: ch.success };
}

export interface PopScene {
  id: string;
  title: string;
  summary: string;
  names: PopNames;
  setup: PopulationSetup;
  editable: PopParam[] | "all";
  challenge?: PopChallenge;
}

export const canEditPop = (scene: PopScene, p: PopParam) => scene.editable === "all" || scene.editable.includes(p);

const base: PopulationSetup = {
  prey: 50, predators: 0, growth: 1.2, capacity: 5000, hunting: 150, conversion: 0.02, predatorDeath: 0.6,
  trapping: 0, harvest: 0, controlStart: 0, years: 30,
};

export const POP_SAMPLES: PopScene[] = [
  { id: "rabbits", title: "Rabbits on their own", summary: "Fifty rabbits arrive in a valley that can feed 5,000. Watch the S-shaped curve as food runs short.", names: { prey: "rabbits", predators: "stoats" }, setup: { ...base }, editable: "all" },
  {
    id: "stoats", title: "Rabbits and stoats", summary: "Stoats were brought to New Zealand in the 1880s to control rabbits. Watch the two populations chase each other.",
    names: { prey: "rabbits", predators: "stoats" }, setup: { ...base, prey: 2000, predators: 20, growth: 1, years: 60 }, editable: "all",
  },
  {
    id: "birds", title: "Pest control for native birds", summary: "Stoats are holding a native bird population down. Plan a trapping campaign.",
    names: { prey: "native birds", predators: "stoats" },
    setup: { ...base, prey: 300, predators: 25.5, growth: 0.6, capacity: 2000, hunting: 40, conversion: 0.0833, predatorDeath: 0.5, controlStart: 5, years: 50 },
    editable: ["trapping", "controlStart"],
    challenge: { title: "Bring the birds back", goal: "Get the bird population to at least 900 by year 50.", checks: [{ kind: "final_between", species: "prey", min: 900, max: 2000 }], hint_if_stuck: "Light trapping isn't enough: the stoats breed back. Try trapping most of them each year.", success: "The birds are recovering!" },
  },
];
