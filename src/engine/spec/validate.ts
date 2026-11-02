/**
 * The gatekeeper: nothing reaches a student until it passes here.
 *
 * Checks every scene's circuit geometry, values and connections, then runs
 * it through the Truth solver: no short circuits at the start, demos must
 * actually do something, and challenges must not be already solved.
 * Errors are written to be fed straight back to the AI for repair.
 */
import { CATALOG, buildNetlist, ends, key, type Board, type Part } from "../lens/circuit/board";
import type { Challenge } from "../lens/circuit/samples";
import { solveDC } from "../truth/circuit/solver";
import type { Solution } from "../truth/circuit/types";
import type { ChallengeDef, Check, Lesson, Scene } from "./lesson";
import { validateMotion } from "./motion";
import { validatePopulation } from "./population";
import { validateModelLesson } from "./model";

export const GRID = { w: 22, h: 14 };

export interface ValidationResult { errors: string[]; warnings: string[] }

const inGrid = (x: number, y: number) => x >= 1 && x <= GRID.w - 1 && y >= 1 && y <= GRID.h - 1;

export function sceneBoard(scene: Scene): Board {
  const b = scene.board ?? { parts: [], wires: [] };
  return {
    parts: b.parts.map(p => ({ ...p, rot: (((p.rot % 4) + 4) % 4) as Part["rot"] })),
    wires: b.wires.map(w => ({ id: w.id, points: w.points })),
  };
}

export const partLabel = (board: Board, id: string) => {
  const p = board.parts.find(q => q.id === id);
  if (!p) return id;
  const same = board.parts.filter(q => q.kind === p.kind);
  const label = CATALOG[p.kind].label;
  if (same.length > 1) return `${label} ${same.indexOf(p) + 1}`;
  return p.kind === "led" ? "The LED" : `The ${label.toLowerCase()}`;
};

function evalCheck(c: Check, board: Board, sol: Solution): { pass: boolean; hint: string } {
  const r = c.part_id ? sol.components[c.part_id] : undefined;
  const name = c.part_id ? partLabel(board, c.part_id) : "";
  switch (c.kind) {
    case "current_between": {
      const ma = Math.abs(r?.amps ?? 0) * 1000, lo = c.min_ma ?? 0, hi = c.max_ma ?? Infinity;
      const pass = ma >= lo && ma <= hi;
      return { pass, hint: `${name} has ${ma < 10 ? ma.toFixed(1) : ma.toFixed(0)} mA; aim for ${lo}–${hi} mA.` };
    }
    case "lit": { const pass = (r?.brightness ?? 0) >= 0.15; return { pass, hint: `${name} isn't lit yet.` }; }
    case "not_lit": { const pass = (r?.brightness ?? 0) < 0.05; return { pass, hint: `${name} should be off.` }; }
    case "no_errors": { const bad = sol.diagnostics.find(d => d.severity === "error"); return { pass: !bad, hint: bad?.message ?? "" }; }
  }
}

/** Turns a declarative challenge into the lab's runtime challenge. */
export function toChallenge(def: ChallengeDef): Challenge {
  return {
    title: def.title,
    goal: def.goal,
    check: (board, sol) => {
      if (!sol) return { done: false, hint: def.hint_if_stuck };
      for (const c of def.checks) {
        const r = evalCheck(c, board, sol);
        if (!r.pass) return { done: false, hint: r.hint };
      }
      return { done: true, hint: def.success };
    },
  };
}

function validateBoard(scene: Scene & { board: NonNullable<Scene["board"]> }, where: string, out: ValidationResult) {
  const board = sceneBoard(scene);
  const err = (m: string) => out.errors.push(`${where}: ${m}`);
  const ids = new Set<string>();
  const ch = scene.challenge;
  const construction = !!ch && ch.allowed_edits.some(e => e === "add_parts" || e === "rewire");

  const whole = (n: number) => Number.isInteger(n);
  for (const p of scene.board.parts) {
    if (![p.x, p.y, p.rot].every(whole)) err(`part "${p.id}" must use whole numbers for x, y and rot`);
    if (ids.has(p.id)) err(`duplicate id "${p.id}"`);
    ids.add(p.id);
    if (p.rot < 0 || p.rot > 3) err(`part "${p.id}" has rot ${p.rot}; use 0-3`);
    const [t0, t1] = ends({ ...p, rot: (((p.rot % 4) + 4) % 4) as Part["rot"] });
    if (!inGrid(t0.x, t0.y) || !inGrid(t1.x, t1.y)) err(`part "${p.id}" at (${p.x},${p.y}) runs off the board; both ends must be within x 1-${GRID.w - 1}, y 1-${GRID.h - 1}`);
    if (p.kind === "battery" && (p.volts === undefined || p.volts < 1.5 || p.volts > 12)) err(`battery "${p.id}" needs volts between 1.5 and 12`);
    if ((p.kind === "resistor" || p.kind === "bulb") && (p.ohms === undefined || p.ohms < 1 || p.ohms > 1e6)) err(`${p.kind} "${p.id}" needs ohms between 1 and 1,000,000`);
    if (p.kind === "capacitor" && (p.microfarads === undefined || p.microfarads < 1 || p.microfarads > 100000)) err(`capacitor "${p.id}" needs microfarads between 1 and 100,000`);
    if (p.kind === "led" && !p.color) err(`led "${p.id}" needs a color`);
  }
  // overlapping bodies
  for (let i = 0; i < board.parts.length; i++) for (let j = i + 1; j < board.parts.length; j++) {
    const a = board.parts[i], b = board.parts[j];
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if ((dx === 0 && dy === 0) || (a.rot % 2 === b.rot % 2 && ((a.rot % 2 === 0 && dy === 0 && dx < 2) || (a.rot % 2 === 1 && dx === 0 && dy < 2)))) {
      err(`parts "${a.id}" and "${b.id}" overlap`);
    }
  }
  for (const w of scene.board.wires) {
    if (ids.has(w.id)) err(`duplicate id "${w.id}"`);
    ids.add(w.id);
    if (w.points.length < 2) err(`wire "${w.id}" needs at least 2 points`);
    for (let i = 0; i < w.points.length; i++) {
      const p = w.points[i];
      if (!whole(p.x) || !whole(p.y)) err(`wire "${w.id}" point (${p.x},${p.y}) must use whole numbers`);
      if (!inGrid(p.x, p.y)) err(`wire "${w.id}" point (${p.x},${p.y}) is off the board`);
      const q = w.points[i + 1];
      if (q && p.x !== q.x && p.y !== q.y) err(`wire "${w.id}" goes diagonally from (${p.x},${p.y}) to (${q.x},${q.y}); add a corner point so each step is horizontal or vertical`);
    }
  }
  if (out.errors.some(e => e.startsWith(where))) return; // geometry broken: skip the electrical checks

  // every terminal touches something
  const net = buildNetlist(board);
  const degree = new Map<string, number>();
  for (const c of net.circuit.components) for (const n of [c.a, c.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
  if (!construction) for (const p of board.parts) for (const t of ends(p)) {
    if ((degree.get(key(t)) ?? 0) < 2) err(`part "${p.id}" has an end at (${t.x},${t.y}) that isn't connected to anything; run a wire to exactly that point`);
  }
  if (!board.parts.some(p => p.kind === "battery") && !construction) err("there is no battery");

  const sol = solveDC(net.circuit);
  if (sol.diagnostics.some(d => d.code === "short_circuit")) err("the starting circuit is a short circuit");

  if (ch) {
    for (const c of ch.checks) {
      if (c.kind !== "no_errors") {
        const p = board.parts.find(q => q.id === c.part_id);
        if (!c.part_id || !p) { err(`challenge check "${c.kind}" refers to part "${c.part_id}", which doesn't exist`); continue; }
        if ((c.kind === "lit" || c.kind === "not_lit") && p.kind !== "bulb" && p.kind !== "led") err(`challenge check "${c.kind}" needs a bulb or LED, not a ${p.kind}`);
      }
      if (c.kind === "current_between" && !(typeof c.min_ma === "number" && typeof c.max_ma === "number" && c.min_ma < c.max_ma)) err("current_between needs min_ma < max_ma");
    }
    if (ch.checks.length === 0) err("the challenge has no checks, so it can never be completed");
    if (!out.errors.some(e => e.startsWith(where)) && toChallenge(ch).check(board, sol).done) {
      err("the challenge is already complete at the start, so the student has nothing to do; start the circuit in a state that needs fixing");
    }
  } else {
    const flowing = board.parts.filter(p => p.kind === "battery").some(p => Math.abs(sol.components[p.id]?.amps ?? 0) > 1e-5);
    const closable = board.parts.some(p => p.kind === "switch" && !p.closed);
    if (!flowing && !closable) err("this demo scene has no current flowing and no switch to close, so nothing happens");
  }
  for (const d of sol.diagnostics) if (d.code === "led_overcurrent" && !ch) out.warnings.push(`${where}: an LED starts over its current limit`);
}

export function validateLesson(lesson: Lesson): ValidationResult {
  const out: ValidationResult = { errors: [], warnings: [] };
  if (!Number.isInteger(lesson.year_level)) out.errors.push("year_level must be a whole number");
  if (lesson.year_level < 6 || lesson.year_level > 13) out.errors.push("year_level must be between 6 and 13");
  if (lesson.scenes.length < 1 || lesson.scenes.length > 4) out.errors.push("include 1 to 4 scenes");
  if (lesson.questions.length < 2 || lesson.questions.length > 5) out.errors.push("include 2 to 5 questions");
  lesson.questions.forEach((q, i) => {
    if (q.choices.length !== 4) out.errors.push(`question ${i + 1} must have exactly 4 choices`);
    if (!Number.isInteger(q.answer_index)) out.errors.push(`question ${i + 1} answer_index must be a whole number`);
    if (q.answer_index < 0 || q.answer_index >= q.choices.length) out.errors.push(`question ${i + 1} has an answer_index outside its choices`);
  });
  if (lesson.engine === "model") {
    lesson.scenes.forEach((s, i) => {
      if (s.board || s.challenge || s.motion || s.population) out.errors.push(`scene ${i + 1} ("${s.heading}"): this is a model lesson, so scenes only need "setup"`);
    });
    validateModelLesson(lesson.model, lesson.scenes, out);
    return out;
  }
  if (lesson.model) out.errors.push(`only model lessons have a top-level "model"`);
  lesson.scenes.forEach((s, i) => {
    const where = `scene ${i + 1} ("${s.heading}")`;
    if (lesson.engine === "circuits") {
      if (s.motion || s.population) out.errors.push(`${where}: this is a circuits lesson, so remove "motion" and "population"`);
      if (!s.board) out.errors.push(`${where}: circuits scenes need a board`);
      else validateBoard({ ...s, board: s.board }, where, out);
    } else if (lesson.engine === "motion") {
      if (s.board || s.challenge || s.population) out.errors.push(`${where}: this is a motion lesson, so remove "board", "challenge" and "population" (put challenges inside "motion")`);
      if (!s.motion) out.errors.push(`${where}: motion scenes need "motion"`);
      else validateMotion(s.motion, where, out);
    } else {
      if (s.board || s.challenge || s.motion) out.errors.push(`${where}: this is a populations lesson, so remove "board", "challenge" and "motion" (put challenges inside "population")`);
      if (!s.population) out.errors.push(`${where}: populations scenes need "population"`);
      else validatePopulation(s.population, where, out);
    }
  });
  return out;
}
