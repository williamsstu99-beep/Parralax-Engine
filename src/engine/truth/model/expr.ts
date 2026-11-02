/**
 * A small, safe maths language for AI-written models.
 *
 * The AI writes rules like `k * (temp - room)` or `if(t > 2, dose, 0)`. They
 * are parsed into a tree and evaluated by this file; nothing is ever run as
 * JavaScript. Supported:
 *   numbers (1, 0.5, 2e-3), names, + - * / ^, parentheses, unary minus,
 *   comparisons (< <= > >= == !=), && || !, cond ? a : b,
 *   functions: min max abs sqrt exp ln log10 sin cos tan pow clamp sign
 *              if(cond, a, b)  step(t0) (0 before t0, 1 after)
 *              pulse(t0, width) (1 between t0 and t0 + width)
 *   constants: pi; the current time is `t`.
 */

export type Node =
  | { k: "num"; v: number }
  | { k: "id"; name: string }
  | { k: "un"; op: "-" | "!"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "tern"; c: Node; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

export class ExprError extends Error {}

const FUNCS: Record<string, { min: number; max: number }> = {
  min: { min: 1, max: 20 }, max: { min: 1, max: 20 }, abs: { min: 1, max: 1 }, sqrt: { min: 1, max: 1 }, exp: { min: 1, max: 1 },
  ln: { min: 1, max: 1 }, log10: { min: 1, max: 1 }, sin: { min: 1, max: 1 }, cos: { min: 1, max: 1 }, tan: { min: 1, max: 1 },
  pow: { min: 2, max: 2 }, clamp: { min: 3, max: 3 }, sign: { min: 1, max: 1 }, if: { min: 3, max: 3 },
  step: { min: 1, max: 1 }, pulse: { min: 2, max: 2 },
};
export const RESERVED = new Set([...Object.keys(FUNCS), "t", "pi"]);

/* ---------------- tokenizer ---------------- */

type Tok = { type: "num"; v: number } | { type: "id"; v: string } | { type: "op"; v: string } | { type: "end" };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ type: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { out.push({ type: "id", v: id[0] }); i += id[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) { out.push({ type: "op", v: two }); i += 2; continue; }
    if ("+-*/^(),<>?:!".includes(c)) { out.push({ type: "op", v: c }); i++; continue; }
    throw new ExprError(`unexpected character "${c}" in "${src}"`);
  }
  out.push({ type: "end" });
  return out;
}

/* ---------------- parser (precedence climbing) ---------------- */

const BIN: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "^": 8 };

export function parse(src: string): Node {
  if (src.length > 500) throw new ExprError("expression is too long (keep it under 500 characters)");
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = peek(); return t.type === "op" && t.v === v; };
  const expect = (v: string) => { if (!isOp(v)) throw new ExprError(`expected "${v}" in "${src}"`); p++; };

  const primary = (): Node => {
    const t = peek();
    if (t.type === "num") { p++; return { k: "num", v: t.v }; }
    if (t.type === "id") {
      p++;
      if (isOp("(")) {
        p++;
        const fn = t.v, spec = FUNCS[fn];
        if (!spec) throw new ExprError(`unknown function "${fn}" in "${src}"`);
        const args: Node[] = [];
        if (!isOp(")")) { do { args.push(ternary()); } while (isOp(",") && ++p); }
        expect(")");
        if (args.length < spec.min || args.length > spec.max) throw new ExprError(`${fn}() takes ${spec.min === spec.max ? spec.min : `${spec.min}-${spec.max}`} argument(s) in "${src}"`);
        return { k: "call", fn, args };
      }
      return { k: "id", name: t.v };
    }
    if (isOp("(")) { p++; const e = ternary(); expect(")"); return e; }
    if (isOp("-")) { p++; return { k: "un", op: "-", a: unaryOperand() }; }
    if (isOp("!")) { p++; return { k: "un", op: "!", a: unaryOperand() }; }
    throw new ExprError(`unexpected ${t.type === "end" ? "end" : `"${(t as { v: unknown }).v}"`} in "${src}"`);
  };
  // Unary minus binds looser than ^ (so -x^2 = -(x^2)) but tighter than * /.
  const unaryOperand = (): Node => binary(7);

  const binary = (minPrec: number): Node => {
    let left = primary();
    for (;;) {
      const t = peek();
      if (t.type !== "op" || !(t.v in BIN) || BIN[t.v] < minPrec) return left;
      p++;
      const prec = BIN[t.v];
      const right = binary(t.v === "^" ? prec : prec + 1); // ^ is right-associative
      left = { k: "bin", op: t.v, a: left, b: right };
    }
  };
  const ternary = (): Node => {
    const c = binary(1);
    if (!isOp("?")) return c;
    p++;
    const a = ternary();
    expect(":");
    return { k: "tern", c, a, b: ternary() };
  };

  const node = ternary();
  if (peek().type !== "end") throw new ExprError(`unexpected "${(peek() as { v: unknown }).v}" in "${src}"`);
  return node;
}

/** Every name an expression refers to (excluding functions). */
export function names(n: Node, out = new Set<string>()): Set<string> {
  switch (n.k) {
    case "id": out.add(n.name); break;
    case "un": names(n.a, out); break;
    case "bin": names(n.a, out); names(n.b, out); break;
    case "tern": names(n.c, out); names(n.a, out); names(n.b, out); break;
    case "call": n.args.forEach(a => names(a, out)); break;
  }
  return out;
}

/* ---------------- compiler ---------------- */

export type Env = Record<string, number>;
export type Fn = (env: Env) => number;

export function compile(n: Node): Fn {
  switch (n.k) {
    case "num": { const v = n.v; return () => v; }
    case "id": {
      const name = n.name;
      if (name === "pi") return () => Math.PI;
      return env => env[name];
    }
    case "un": { const a = compile(n.a); return n.op === "-" ? env => -a(env) : env => (a(env) ? 0 : 1); }
    case "tern": { const c = compile(n.c), a = compile(n.a), b = compile(n.b); return env => (c(env) ? a(env) : b(env)); }
    case "bin": {
      const a = compile(n.a), b = compile(n.b);
      switch (n.op) {
        case "+": return env => a(env) + b(env);
        case "-": return env => a(env) - b(env);
        case "*": return env => a(env) * b(env);
        case "/": return env => a(env) / b(env);
        case "^": return env => Math.pow(a(env), b(env));
        case "<": return env => +(a(env) < b(env));
        case "<=": return env => +(a(env) <= b(env));
        case ">": return env => +(a(env) > b(env));
        case ">=": return env => +(a(env) >= b(env));
        case "==": return env => +(a(env) === b(env));
        case "!=": return env => +(a(env) !== b(env));
        case "&&": return env => +(!!a(env) && !!b(env));
        case "||": return env => +(!!a(env) || !!b(env));
      }
      throw new ExprError(`unknown operator ${n.op}`);
    }
    case "call": {
      const f = n.args.map(compile);
      const [x, y, z] = f;
      switch (n.fn) {
        case "min": return env => Math.min(...f.map(g => g(env)));
        case "max": return env => Math.max(...f.map(g => g(env)));
        case "abs": return env => Math.abs(x(env));
        case "sqrt": return env => Math.sqrt(x(env));
        case "exp": return env => Math.exp(x(env));
        case "ln": return env => Math.log(x(env));
        case "log10": return env => Math.log10(x(env));
        case "sin": return env => Math.sin(x(env));
        case "cos": return env => Math.cos(x(env));
        case "tan": return env => Math.tan(x(env));
        case "sign": return env => Math.sign(x(env));
        case "pow": return env => Math.pow(x(env), y(env));
        case "clamp": return env => Math.min(Math.max(x(env), y(env)), z(env));
        case "if": return env => (x(env) ? y(env) : z(env));
        case "step": return env => +(env.t >= x(env));
        case "pulse": return env => { const t0 = x(env); return +(env.t >= t0 && env.t < t0 + y(env)); };
      }
      throw new ExprError(`unknown function ${n.fn}`);
    }
  }
}

export const compileSrc = (src: string): Fn => compile(parse(src));
