/**
 * Airflow around a wing section, from a Joukowski aerofoil: a circle in one
 * plane maps onto a realistic cambered wing shape, and the classic flow past
 * a spinning cylinder maps onto smooth flow around the wing. The Kutta
 * condition sets the circulation, so air leaves the sharp trailing edge
 * cleanly, and flows faster over the top than underneath, as on a real wing.
 */

type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const abs = (a: C) => Math.hypot(a[0], a[1]);
function csqrt(a: C): C {
  const r = abs(a), re = Math.sqrt((r + a[0]) / 2), im = Math.sqrt(Math.max(0, (r - a[0]) / 2));
  return [re, a[1] < 0 ? -im : im];
}

/** Circle centre (sets thickness and camber) and radius through the trailing edge at ζ = 1. */
export const CENTER: C = [-0.09, 0.11];
export const RADIUS = abs(sub([1, 0], CENTER));
const BETA = Math.atan2(CENTER[1], 1 - CENTER[0]);

/** The wing's outline in wing coordinates (chord along x, about −2.2 to 2). */
export function aerofoil(n = 180): C[] {
  const pts: C[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2;
    const z0: C = [CENTER[0] + RADIUS * Math.cos(th), CENTER[1] + RADIUS * Math.sin(th)];
    pts.push(add(z0, div([1, 0], z0)));
  }
  return pts;
}

/** Map a point near the wing back to the circle plane, picking the root outside the circle. */
function toCircle(z: C): C | null {
  const s = csqrt(sub(mul(z, z), [4, 0]));
  const a: C = [(z[0] + s[0]) / 2, (z[1] + s[1]) / 2], b: C = [(z[0] - s[0]) / 2, (z[1] - s[1]) / 2];
  const ra = abs(sub(a, CENTER)), rb = abs(sub(b, CENTER));
  const best = ra >= rb ? a : b;
  return Math.max(ra, rb) < RADIUS * 1.0005 ? null : best;
}

/** Circulation (per unit speed) that makes air leave the trailing edge smoothly: Γ = 4πR·sin(α + β). */
export const circulation = (alpha: number) => 4 * Math.PI * RADIUS * Math.sin(alpha + BETA);

/**
 * Air velocity at point z (wing coordinates) for unit free-stream speed
 * arriving at angle of attack `alpha`, scaled by `liftScale` (1 for attached
 * flow, less when stalled). Returns null inside the wing.
 */
export function velocity(z: C, alpha: number, liftScale = 1): C | null {
  const zeta = toCircle(z);
  if (!zeta) return null;
  const zp = sub(zeta, CENTER);
  const eia: C = [Math.cos(alpha), Math.sin(alpha)], emia: C = [Math.cos(alpha), -Math.sin(alpha)];
  const gamma = circulation(alpha) * liftScale;
  // dF/dζ = e^{-iα} − R² e^{iα}/ζ'² + iΓ/(2π ζ')   (clockwise circulation: faster over the top, so lift)
  let dF = sub(emia, div(mul([RADIUS * RADIUS, 0], eia), mul(zp, zp)));
  dF = add(dF, div([0, gamma / (2 * Math.PI)], zp));
  const dz = sub([1, 0], div([1, 0], mul(zeta, zeta)));
  if (abs(dz) < 1e-3) return null; // at the sharp trailing edge
  const w = div(dF, dz); // u − i v
  return [w[0], -w[1]];
}

/** Lift coefficient from thin-section theory, cut back when the wing stalls. */
export function liftFactor(alphaDeg: number) {
  const attached = Math.sin((alphaDeg * Math.PI) / 180 + BETA);
  const stall = stallAmount(alphaDeg);
  return attached * (1 - 0.65 * stall);
}

/** 0 when flow is attached, rising to 1 as the wing goes past ~15° and stalls. */
export const stallAmount = (alphaDeg: number) => Math.min(1, Math.max(0, (alphaDeg - 14) / 5));
