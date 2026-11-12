/**
 * The physics world: real units (metres, seconds, kilograms, newtons), y up.
 * Everything here is deterministic and tested; scene scripts only arrange it.
 */

export type Vec = [number, number];
export type Num = number | (() => number);
export const val = (x: Num): number => (typeof x === "function" ? x() : x);

const deg = (d: number) => (d * Math.PI) / 180;

export class Body {
  x: number; y: number; vx: number; vy: number;
  mass: number; radius: number; charge: number;
  fixed: boolean; label?: string; color?: string;
  /** Forces acting on the body during the last step, by name (gravity, spring, drag, normal, electric, tension, ...). */
  forces: Record<string, Vec> = {};
  /** Recent positions, newest last, for traces. */
  path: Vec[] = [];
  /** Width/height when drawn as a block instead of a ball. */
  size?: [number, number];
  angle = 0;

  constructor(o: { x?: number; y?: number; vx?: number; vy?: number; mass?: number; radius?: number; charge?: number; fixed?: boolean; label?: string; color?: string }) {
    this.x = o.x ?? 0; this.y = o.y ?? 0; this.vx = o.vx ?? 0; this.vy = o.vy ?? 0;
    this.mass = Math.max(1e-6, o.mass ?? 1); this.radius = o.radius ?? 0.1; this.charge = o.charge ?? 0;
    this.fixed = !!o.fixed; this.label = o.label; this.color = o.color;
  }
  pos(): Vec { return [this.x, this.y]; }
  vel(): Vec { return [this.vx, this.vy]; }
  speed() { return Math.hypot(this.vx, this.vy); }
  /** Kinetic energy, J. */
  ke() { return 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy); }
  /** A named force from the last step, or zero. */
  force(name: string): Vec { return this.forces[name] ?? [0, 0]; }
  /** Sum of all forces from the last step. */
  netForce(): Vec {
    let fx = 0, fy = 0;
    for (const f of Object.values(this.forces)) { fx += f[0]; fy += f[1]; }
    return [fx, fy];
  }
}

interface Spring { a: Body | Vec; b: Body; k: number; rest: number; damping: number; period: () => number; stretch: () => number }

export class Pendulum {
  theta: number; omega = 0; readonly bob: Body; readonly pivot: Vec;
  constructor(private world: World, readonly length: number, angle: number, mass: number, readonly damping: number, pivot: Vec, readonly amplitude = Math.abs(angle)) {
    this.theta = angle; this.pivot = pivot;
    this.bob = new Body({ mass, radius: 0.06 + 0.04 * Math.cbrt(mass) });
    this.place();
  }
  private g() { return this.world.g || 9.8; }
  /** Current angle from the vertical, degrees. */
  angle() { return (this.theta * 180) / Math.PI; }
  /** Time for one full swing at this amplitude (exact, not the small-angle shortcut), s. */
  period() {
    const k = Math.cos(this.amplitude / 2);
    let a = 1, b = k;
    for (let i = 0; i < 12; i++) { const an = (a + b) / 2; b = Math.sqrt(a * b); a = an; }
    return (2 * Math.PI * Math.sqrt(this.length / this.g())) / a;
  }
  /** Height of the bob above its lowest point, m. */
  height() { return this.length * (1 - Math.cos(this.theta)); }
  step(h: number) {
    const g = this.g(), L = this.length, c = this.damping;
    const f = (th: number, om: number): [number, number] => [om, -(g / L) * Math.sin(th) - c * om];
    const [k1a, k1b] = f(this.theta, this.omega);
    const [k2a, k2b] = f(this.theta + (h / 2) * k1a, this.omega + (h / 2) * k1b);
    const [k3a, k3b] = f(this.theta + (h / 2) * k2a, this.omega + (h / 2) * k2b);
    const [k4a, k4b] = f(this.theta + h * k3a, this.omega + h * k3b);
    this.theta += (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
    this.omega += (h / 6) * (k1b + 2 * k2b + 2 * k3b + k4b);
    this.place();
  }
  place() {
    const L = this.length, m = this.bob.mass, g = this.g();
    const s = Math.sin(this.theta), co = Math.cos(this.theta);
    this.bob.x = this.pivot[0] + L * s; this.bob.y = this.pivot[1] - L * co;
    this.bob.vx = L * this.omega * co; this.bob.vy = L * this.omega * s;
    const T = m * (g * co + L * this.omega * this.omega);
    this.bob.forces = { gravity: [0, -m * g], tension: [-T * s, T * co] };
  }
}

export class Slope {
  s: number; v = 0; readonly block: Body; readonly top: Vec; readonly bottom: Vec;
  constructor(private world: World, readonly angleDeg: number, readonly length: number, readonly friction: number, mass: number, start: number) {
    const a = deg(angleDeg);
    this.top = [0, length * Math.sin(a)]; this.bottom = [length * Math.cos(a), 0];
    this.s = Math.max(0, Math.min(1, start)) * length;
    const side = Math.max(0.12, Math.min(0.12 * length, 0.4));
    this.block = new Body({ mass }); this.block.size = [side * 1.3, side]; this.block.angle = -a;
    this.place();
  }
  private g() { return this.world.g || 9.8; }
  /** Acceleration down the slope right now, m/s². */
  acceleration() {
    const a = deg(this.angleDeg), g = this.g();
    const drive = g * Math.sin(a), grip = this.friction * g * Math.cos(a);
    if (this.v <= 1e-9 && drive <= grip) return 0;
    return drive - grip;
  }
  speed() { return this.v; }
  distance() { return this.s; }
  atBottom() { return this.s >= this.length - 1e-9; }
  step(h: number) {
    if (this.atBottom()) { this.v = 0; this.place(); return; }
    this.v = Math.max(0, this.v + this.acceleration() * h);
    this.s = Math.min(this.length, this.s + this.v * h);
    this.place();
  }
  place() {
    const a = deg(this.angleDeg), m = this.block.mass, g = this.g();
    const ux = Math.cos(a), uy = -Math.sin(a);          // down the slope
    const nx = Math.sin(a), ny = Math.cos(a);           // out of the surface
    const half = (this.block.size?.[1] ?? 0.2) / 2;
    this.block.x = this.top[0] + ux * this.s + nx * half;
    this.block.y = this.top[1] + uy * this.s + ny * half;
    this.block.vx = ux * this.v; this.block.vy = uy * this.v;
    const N = m * g * Math.cos(a);
    const moving = this.v > 1e-9 || g * Math.sin(a) > this.friction * g * Math.cos(a);
    const fr = this.atBottom() ? 0 : moving ? this.friction * N : Math.min(m * g * Math.sin(a), this.friction * N);
    this.block.forces = { gravity: [0, -m * g], normal: [nx * N, ny * N], friction: [-ux * fr, -uy * fr] };
  }
}

export interface Charge { x: number; y: number; q: number }

/** Electric fields from point charges and uniform plates. Arbitrary units (k = 1): shapes, not numbers. */
export class Fields {
  charges: Charge[] = [];
  uniformE: Vec | null = null;
  E(x: number, y: number): Vec {
    let ex = this.uniformE?.[0] ?? 0, ey = this.uniformE?.[1] ?? 0;
    for (const c of this.charges) {
      const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy + 1e-4, r3 = r2 * Math.sqrt(r2);
      ex += (c.q * dx) / r3; ey += (c.q * dy) / r3;
    }
    return [ex, ey];
  }
  any() { return this.charges.length > 0 || this.uniformE !== null; }
}

export class World {
  g = 0; t = 0; dragK = 0; G = 0;
  groundY: number | null = null; bounce = 0.6; groundFriction = 0;
  bodies: Body[] = []; springs: Spring[] = []; pendulums: Pendulum[] = []; slopes: Slope[] = [];
  view: { x: [number, number]; y: [number, number] } | null = null;
  timeScale = 1; paused = false;
  stopCondition: (() => boolean) | null = null;
  private stepHooks: ((t: number) => void)[] = [];
  private sinceTrace = 0;
  constructor(readonly fields: Fields) {}

  /** Turn on gravity pulling everything down (default Earth, 9.8 m/s²). */
  gravity(g = 9.8) { this.g = g; return this; }
  /** A floor at height y that bodies land on and bounce off. */
  ground(o: { y?: number; bounce?: number; friction?: number } = {}) {
    this.groundY = o.y ?? 0; this.bounce = o.bounce ?? 0.6; this.groundFriction = o.friction ?? 0.2; return this;
  }
  /** Air resistance proportional to speed squared, on every moving body. */
  drag(k = 0.05) { this.dragK = k; return this; }
  /** Every body pulls every other body (orbits). G in scene units. */
  gravitation(G = 1) { this.G = G; return this; }
  ball(o: { x?: Num; y?: Num; vx?: Num; vy?: Num; speed?: Num; angle?: Num; mass?: Num; radius?: Num; charge?: Num; fixed?: boolean; label?: string; color?: string } = {}) {
    let vx = o.vx !== undefined ? val(o.vx) : 0, vy = o.vy !== undefined ? val(o.vy) : 0;
    if (o.speed !== undefined) { const a = deg(o.angle !== undefined ? val(o.angle) : 0), sp = val(o.speed); vx = sp * Math.cos(a); vy = sp * Math.sin(a); }
    const b = new Body({
      x: o.x !== undefined ? val(o.x) : 0, y: o.y !== undefined ? val(o.y) : 0, vx, vy,
      mass: o.mass !== undefined ? val(o.mass) : 1, radius: o.radius !== undefined ? val(o.radius) : undefined,
      charge: o.charge !== undefined ? val(o.charge) : 0, fixed: o.fixed, label: o.label, color: o.color,
    });
    this.bodies.push(b); return b;
  }
  /** A spring from a body or fixed point a to body b. rest defaults to the starting distance. */
  spring(a: Body | Vec, b: Body, o: { k?: Num; rest?: Num; damping?: Num } = {}) {
    const ax = Array.isArray(a) ? a[0] : a.x, ay = Array.isArray(a) ? a[1] : a.y;
    const rest = o.rest !== undefined ? val(o.rest) : Math.hypot(b.x - ax, b.y - ay);
    const k = o.k !== undefined ? val(o.k) : 20;
    const s: Spring = {
      a, b, k, rest, damping: o.damping !== undefined ? val(o.damping) : 0,
      /** Time for one full bounce of body b, s. */
      period: () => 2 * Math.PI * Math.sqrt(b.mass / k),
      /** How far the spring is stretched past its natural length right now, m (negative = squashed). */
      stretch: () => Math.hypot(b.x - (Array.isArray(a) ? a[0] : a.x), b.y - (Array.isArray(a) ? a[1] : a.y)) - rest,
    };
    this.springs.push(s); return s;
  }
  /** A pendulum hanging from (x, y). angle in degrees from the vertical. */
  pendulum(o: { x?: Num; y?: Num; length?: Num; angle?: Num; mass?: Num; damping?: Num } = {}) {
    const p = new Pendulum(this, Math.max(0.01, o.length !== undefined ? val(o.length) : 1), deg(o.angle !== undefined ? val(o.angle) : 20),
      o.mass !== undefined ? val(o.mass) : 1, o.damping !== undefined ? val(o.damping) : 0,
      [o.x !== undefined ? val(o.x) : 0, o.y !== undefined ? val(o.y) : 0]);
    this.pendulums.push(p); return p;
  }
  /** A block sliding down a ramp. angle in degrees, start = 0 (top) to 1 (bottom). */
  slope(o: { angle?: Num; length?: Num; friction?: Num; mass?: Num; start?: Num } = {}) {
    const s = new Slope(this, o.angle !== undefined ? val(o.angle) : 30, o.length !== undefined ? val(o.length) : 3,
      Math.max(0, o.friction !== undefined ? val(o.friction) : 0), o.mass !== undefined ? val(o.mass) : 1, o.start !== undefined ? val(o.start) : 0);
    this.slopes.push(s); return s;
  }
  /** Fix the camera to this region (metres). Otherwise it frames the whole motion automatically. */
  setView(x: [number, number], y: [number, number]) { this.view = { x, y }; return this; }
  slowMotion(scale = 0.25) { this.timeScale = scale; return this; }
  /** Freeze the simulation when this becomes true (e.g. a ball lands). */
  stopWhen(fn: () => boolean) { this.stopCondition = fn; return this; }
  onStep(fn: (t: number) => void) { this.stepHooks.push(fn); return this; }
  time() { return this.t; }

  /** Advance by dt seconds of simulated time, in small sub-steps. */
  advance(dt: number) {
    if (this.paused) return;
    const total = dt * this.timeScale, n = Math.max(1, Math.ceil(total / 0.002)), h = total / n;
    for (let i = 0; i < n; i++) {
      this.substep(h);
      if (this.stopCondition?.()) { this.paused = true; break; }
    }
  }

  private substep(h: number) {
    const free = this.bodies;
    for (const b of free) b.forces = {};
    const add = (b: Body, name: string, f: Vec) => { const o = b.forces[name] ?? [0, 0]; b.forces[name] = [o[0] + f[0], o[1] + f[1]]; };
    for (const b of free) {
      if (b.fixed) continue;
      if (this.g) add(b, "gravity", [0, -b.mass * this.g]);
      if (this.dragK) { const sp = b.speed(); add(b, "drag", [-this.dragK * sp * b.vx, -this.dragK * sp * b.vy]); }
      if (b.charge && this.fields.any()) { const e = this.fields.E(b.x, b.y); add(b, "electric", [b.charge * e[0], b.charge * e[1]]); }
    }
    if (this.G) {
      for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
        const a = free[i], b = free[j], dx = b.x - a.x, dy = b.y - a.y, r2 = dx * dx + dy * dy + 1e-6, r = Math.sqrt(r2);
        const F = (this.G * a.mass * b.mass) / r2, fx = (F * dx) / r, fy = (F * dy) / r;
        add(a, "gravity", [fx, fy]); add(b, "gravity", [-fx, -fy]);
      }
    }
    for (const s of this.springs) {
      const ax = Array.isArray(s.a) ? s.a[0] : s.a.x, ay = Array.isArray(s.a) ? s.a[1] : s.a.y;
      const dx = s.b.x - ax, dy = s.b.y - ay, L = Math.hypot(dx, dy) || 1e-9, ux = dx / L, uy = dy / L;
      const avx = Array.isArray(s.a) ? 0 : s.a.vx, avy = Array.isArray(s.a) ? 0 : s.a.vy;
      const rel = (s.b.vx - avx) * ux + (s.b.vy - avy) * uy;
      const F = -s.k * (L - s.rest) - s.damping * rel;
      add(s.b, "spring", [F * ux, F * uy]);
      if (!Array.isArray(s.a)) add(s.a, "spring", [-F * ux, -F * uy]);
    }
    for (const b of free) {
      if (b.fixed) continue;
      let fx = 0, fy = 0;
      for (const f of Object.values(b.forces)) { fx += f[0]; fy += f[1]; }
      b.vx += (fx / b.mass) * h; b.vy += (fy / b.mass) * h;
      b.x += b.vx * h; b.y += b.vy * h;
      if (this.groundY !== null && b.y - b.radius < this.groundY) {
        b.y = this.groundY + b.radius;
        if (b.vy < 0) b.vy = Math.abs(b.vy) < 0.05 ? 0 : -b.vy * this.bounce;
        b.vx *= Math.max(0, 1 - this.groundFriction * h * 10);
        if (this.g) add(b, "normal", [0, b.mass * this.g]);
      }
    }
    for (const p of this.pendulums) p.step(h);
    for (const s of this.slopes) s.step(h);
    this.t += h;
    for (const fn of this.stepHooks) fn(this.t);
    this.sinceTrace += h;
    if (this.sinceTrace >= 1 / 30) {
      this.sinceTrace = 0;
      for (const b of this.allBodies()) { b.path.push([b.x, b.y]); if (b.path.length > 600) b.path.shift(); }
    }
  }

  /** Every body that is drawn: free bodies, pendulum bobs and slope blocks. */
  allBodies(): Body[] { return [...this.bodies, ...this.pendulums.map(p => p.bob), ...this.slopes.map(s => s.block)]; }
  isEmpty() { return this.bodies.length + this.pendulums.length + this.slopes.length === 0; }
}
