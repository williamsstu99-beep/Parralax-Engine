/**
 * Model Truth: runs any model written as stocks and flows.
 *
 * A model is a set of stocks (quantities that build up or drain: glucose in
 * the blood, heat in a cup, reactant in a beaker), flows that move amounts
 * into, out of, or between stocks (each a rule in the expression language),
 * helper variables, and settings the student can change. Each stock's rate
 * of change is its inflows minus its outflows, so the picture of what flows
 * where is exactly the maths that runs.
 *
 * Integrated with RK4. If a model blows up, the step is shrunk and the run
 * retried; if it still fails, the run reports why instead of showing junk.
 */
import { ExprError, RESERVED, compile, names, parse, type Env, type Fn } from "./expr";

export interface ParamDef { id: string; label: string; unit: string; min: number; max: number; value: number; step: number }
export interface StockDef { id: string; label: string; unit: string; initial: string; min: number | null; max: number | null }
export interface FlowDef { id: string; label: string; from: string | null; to: string | null; rate: string }
export interface VarDef { id: string; label: string; unit: string; expr: string }

export interface ModelDef {
  timeUnit: "seconds" | "minutes" | "hours" | "days" | "years";
  duration: number;
  params: ParamDef[];
  stocks: StockDef[];
  flows: FlowDef[];
  vars: VarDef[];
}

export interface ModelRun {
  ok: boolean;
  error?: string;
  t: number[];
  /** Series for every stock, flow and var, by id. */
  series: Record<string, number[]>;
}

export interface Compiled {
  def: ModelDef;
  initial: { id: string; fn: Fn }[];
  /** Vars and flows in an order where everything an expression needs is computed first. */
  aux: { id: string; fn: Fn }[];
  flows: FlowDef[];
}

const MAX_SAMPLES = 800;

/** Parse and order everything. Throws ExprError with a plain explanation if the model doesn't make sense. */
export function compileModel(def: ModelDef): Compiled {
  const ids = new Map<string, string>();
  const claim = (id: string, what: string) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) throw new ExprError(`"${id}" isn't a valid id; use letters, digits and _ only, starting with a letter`);
    if (RESERVED.has(id)) throw new ExprError(`"${id}" is a reserved word; choose another id`);
    if (ids.has(id)) throw new ExprError(`the id "${id}" is used twice (${ids.get(id)} and ${what})`);
    ids.set(id, what);
  };
  def.params.forEach(p => claim(p.id, "a setting"));
  def.stocks.forEach(s => claim(s.id, "a stock"));
  def.flows.forEach(f => claim(f.id, "a flow"));
  def.vars.forEach(v => claim(v.id, "a variable"));

  const stockIds = new Set(def.stocks.map(s => s.id)), paramIds = new Set(def.params.map(p => p.id));
  const known = new Set([...ids.keys(), "t", "pi"]);
  const check = (src: string, where: string, allowed: Set<string>) => {
    let node;
    try { node = parse(src); } catch (e) { throw new ExprError(`${where}: ${(e as Error).message}`); }
    for (const n of names(node)) {
      if (!known.has(n)) throw new ExprError(`${where} uses "${n}", which isn't defined`);
      if (!allowed.has(n)) throw new ExprError(`${where} can't use "${n}" here`);
    }
    return node;
  };

  const initial = def.stocks.map(s => ({ id: s.id, fn: compile(check(s.initial, `the initial value of ${s.id}`, new Set([...paramIds, "pi"]))) }));
  for (const f of def.flows) {
    if (f.from === null && f.to === null) throw new ExprError(`flow ${f.id} needs a from or a to stock`);
    for (const end of [f.from, f.to]) if (end !== null && !stockIds.has(end)) throw new ExprError(`flow ${f.id} connects to "${end}", which isn't a stock`);
    if (f.from !== null && f.from === f.to) throw new ExprError(`flow ${f.id} goes from ${f.from} to itself`);
  }

  // Order vars and flows so each is computed after what it depends on.
  const auxDefs = [...def.vars.map(v => ({ id: v.id, src: v.expr })), ...def.flows.map(f => ({ id: f.id, src: f.rate }))];
  const auxIds = new Set(auxDefs.map(a => a.id));
  const nodes = new Map(auxDefs.map(a => [a.id, check(a.src, `${a.id}`, known)]));
  const order: string[] = [], state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw new ExprError(`${[...path, id].join(" → ")} go round in a circle; break the loop by making one of them a stock`);
    state.set(id, 1);
    for (const n of names(nodes.get(id)!)) if (auxIds.has(n)) visit(n, [...path, id]);
    state.set(id, 2);
    order.push(id);
  };
  auxDefs.forEach(a => visit(a.id, []));
  return { def, initial, aux: order.map(id => ({ id, fn: compile(nodes.get(id)!) })), flows: def.flows };
}

/** Run the model with its settings (optionally overridden). */
export function runModel(c: Compiled, overrides: Record<string, number> = {}): ModelRun {
  const { def } = c;
  const base: Env = { t: 0 };
  for (const p of def.params) base[p.id] = overrides[p.id] ?? p.value;
  const stocks = def.stocks;
  const y0 = c.initial.map(s => s.fn(base));
  const lo = stocks.map(s => (s.min === null ? -Infinity : s.min));

  // Evaluate every var and flow for state y at time t; returns d(stock)/dt.
  const evalAt = (t: number, y: number[], env: Env): number[] => {
    env.t = t;
    for (let i = 0; i < stocks.length; i++) env[stocks[i].id] = Math.max(lo[i], y[i]);
    for (const a of c.aux) env[a.id] = a.fn(env);
    const d = new Array(stocks.length).fill(0);
    for (const f of c.flows) {
      const r = env[f.id];
      if (f.from !== null) d[stockIndex.get(f.from)!] -= r;
      if (f.to !== null) d[stockIndex.get(f.to)!] += r;
    }
    return d;
  };
  const stockIndex = new Map(stocks.map((s, i) => [s.id, i]));

  const attempt = (steps: number): ModelRun => {
    const dt = def.duration / steps;
    const every = Math.max(1, Math.ceil(steps / (MAX_SAMPLES - 1)));
    const env: Env = { ...base };
    const series: Record<string, number[]> = {};
    for (const s of stocks) series[s.id] = [];
    for (const a of c.aux) series[a.id] = [];
    const t: number[] = [];
    const record = (time: number, y: number[]) => {
      evalAt(time, y, env); // fills env with vars and flows at this state
      t.push(time);
      stocks.forEach((s, i) => series[s.id].push(Math.max(lo[i], y[i])));
      for (const a of c.aux) series[a.id].push(env[a.id]);
    };
    let y = y0.map((v, i) => Math.max(lo[i], v));
    record(0, y);
    const scratch: Env = { ...base };
    for (let i = 1; i <= steps; i++) {
      const time = (i - 1) * dt;
      const k1 = evalAt(time, y, scratch);
      const k2 = evalAt(time + dt / 2, y.map((v, j) => v + (dt / 2) * k1[j]), scratch);
      const k3 = evalAt(time + dt / 2, y.map((v, j) => v + (dt / 2) * k2[j]), scratch);
      const k4 = evalAt(time + dt, y.map((v, j) => v + dt * k3[j]), scratch);
      y = y.map((v, j) => Math.max(lo[j], v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])));
      if (y.some(v => !Number.isFinite(v) || Math.abs(v) > 1e12)) {
        const bad = stocks[y.findIndex(v => !Number.isFinite(v) || Math.abs(v) > 1e12)];
        return { ok: false, error: `${bad.id} blew up (became infinite or not a number) at t = ${+(time + dt).toPrecision(3)} ${def.timeUnit}`, t, series };
      }
      if (i % every === 0 || i === steps) record(i * dt, y);
    }
    const badAux = c.aux.find(a => series[a.id].some(v => !Number.isFinite(v)));
    if (badAux) return { ok: false, error: `${badAux.id} became infinite or not a number (check for dividing by zero, or the log or square root of a negative)`, t, series };
    return { ok: true, t, series };
  };

  let run = attempt(4000);
  for (const steps of [40000, 200000]) { if (run.ok) break; run = attempt(steps); }
  return run;
}

/* ---------------- statistics used by facts, challenges and the tutor ---------------- */

export type Stat = "final" | "max" | "min" | "mean" | "at" | "time_of_max" | "time_of_min";

export function stat(run: ModelRun, id: string, s: Stat, at?: number | null): number {
  const v = run.series[id], t = run.t;
  if (!v || v.length === 0) return NaN;
  switch (s) {
    case "final": return v[v.length - 1];
    case "max": return Math.max(...v);
    case "min": return Math.min(...v);
    case "mean": return v.reduce((a, b) => a + b, 0) / v.length;
    case "time_of_max": return t[v.indexOf(Math.max(...v))];
    case "time_of_min": return t[v.indexOf(Math.min(...v))];
    case "at": {
      const x = at ?? 0;
      if (x <= t[0]) return v[0];
      for (let i = 1; i < t.length; i++) if (t[i] >= x) return v[i - 1] + ((v[i] - v[i - 1]) * (x - t[i - 1])) / (t[i] - t[i - 1]);
      return v[v.length - 1];
    }
  }
}

export const STAT_LABEL: Record<Stat, string> = {
  final: "at the end", max: "at its highest", min: "at its lowest", mean: "on average", at: "at", time_of_max: "peaked at time", time_of_min: "bottomed out at time",
};
