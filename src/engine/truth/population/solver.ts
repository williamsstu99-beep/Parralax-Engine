/**
 * Population Truth: deterministic population dynamics.
 *
 * Prey grow logistically towards a carrying capacity. An optional predator
 * eats them (Lotka–Volterra, scaled so `hunting` is the number of prey one
 * predator eats per year when prey are at carrying capacity), turns some of
 * what it eats into new predators, and dies at a steady rate. Trapping
 * (predators) and harvesting (prey) remove a fraction of the population each
 * year, starting in a chosen year.
 *
 *   dN/dt = r·N·(1 − N/K) − (h/K)·N·P − H(t)·N
 *   dP/dt = b·(h/K)·N·P − m·P − T(t)·P
 *
 * Integrated with fixed-step RK4. A population that falls below half an
 * animal is extinct and stays at zero. Time is in years.
 */

export interface PopulationSetup {
  /** Starting prey numbers. */
  prey: number;
  /** Starting predator numbers (0 for prey only). */
  predators: number;
  /** Prey growth rate r: births minus natural deaths per animal per year when there's plenty of room. */
  growth: number;
  /** Carrying capacity K: how many prey the habitat can support. */
  capacity: number;
  /** Prey eaten per predator per year when prey are at carrying capacity. */
  hunting: number;
  /** New predators born per prey eaten (conversion efficiency). */
  conversion: number;
  /** Predator death rate per year. */
  predatorDeath: number;
  /** Fraction of predators trapped each year once control starts (0 to 0.99). */
  trapping: number;
  /** Fraction of prey harvested each year once control starts (0 to 0.99). */
  harvest: number;
  /** Year trapping and harvesting start. */
  controlStart: number;
  /** How many years to simulate. */
  years: number;
}

export interface PopSample { t: number; prey: number; predators: number }

export interface PopDiagnostic {
  code: "prey_extinct" | "predators_extinct" | "oscillating" | "steady" | "over_capacity";
  severity: "info" | "warning";
  message: string;
}

export interface PopulationResult {
  setup: PopulationSetup;
  samples: PopSample[];
  summary: {
    final: { prey: number; predators: number };
    max: { prey: number; predators: number };
    min: { prey: number; predators: number };
    /** Year each species died out, if it did. */
    extinct: { prey?: number; predators?: number };
    /** Equilibrium the populations would settle around with no control (if both can coexist). */
    equilibrium?: { prey: number; predators: number };
    /** Average time between prey peaks, years, if the populations cycle. */
    cycleYears?: number;
  };
  diagnostics: PopDiagnostic[];
}

const MAX_SAMPLES = 1000;
const EXTINCT = 0.5;

const yearlyToRate = (fraction: number) => (fraction <= 0 ? 0 : -Math.log(1 - Math.min(fraction, 0.99)));

export function solvePopulation(s: PopulationSetup): PopulationResult {
  const r = s.growth, K = s.capacity, a = s.hunting / K, b = s.conversion, m = s.predatorDeath;
  const T = yearlyToRate(s.trapping), H = yearlyToRate(s.harvest);
  const fastest = Math.max(r, m + T, H, b * s.hunting, 0.1);
  const dt = Math.min(0.01, 0.02 / fastest);
  const steps = Math.ceil(s.years / dt);
  const every = Math.max(1, Math.ceil(steps / (MAX_SAMPLES - 1)));

  const deriv = (t: number, N: number, P: number): [number, number] => {
    const on = t >= s.controlStart;
    return [
      r * N * (1 - N / K) - a * N * P - (on ? H : 0) * N,
      b * a * N * P - m * P - (on ? T : 0) * P,
    ];
  };

  let N = s.prey, P = s.predators, t = 0;
  const extinct: { prey?: number; predators?: number } = {};
  if (N < EXTINCT) { N = 0; extinct.prey = 0; }
  if (P < EXTINCT && s.predators > 0) { P = 0; extinct.predators = 0; }
  if (s.predators <= 0) P = 0;
  const samples: PopSample[] = [{ t: 0, prey: N, predators: P }];

  for (let i = 1; i <= steps; i++) {
    const h = Math.min(dt, s.years - t);
    const [k1n, k1p] = deriv(t, N, P);
    const [k2n, k2p] = deriv(t + h / 2, N + (h / 2) * k1n, P + (h / 2) * k1p);
    const [k3n, k3p] = deriv(t + h / 2, N + (h / 2) * k2n, P + (h / 2) * k2p);
    const [k4n, k4p] = deriv(t + h, N + h * k3n, P + h * k3p);
    N = Math.max(0, N + (h / 6) * (k1n + 2 * k2n + 2 * k3n + k4n));
    P = Math.max(0, P + (h / 6) * (k1p + 2 * k2p + 2 * k3p + k4p));
    t += h;
    if (N > 0 && N < EXTINCT) { N = 0; extinct.prey ??= t; }
    if (P > 0 && P < EXTINCT) { P = 0; extinct.predators ??= t; }
    if (i % every === 0 || i === steps) samples.push({ t, prey: N, predators: P });
  }

  const diagnostics: PopDiagnostic[] = [];
  const has = s.predators > 0;
  if (extinct.prey !== undefined) diagnostics.push({ code: "prey_extinct", severity: "warning", message: `The prey died out in year ${extinct.prey.toFixed(1)}.${has ? " With nothing to eat, the predators can't survive either." : ""}` });
  if (has && extinct.predators !== undefined) diagnostics.push({ code: "predators_extinct", severity: "info", message: `The predators died out in year ${extinct.predators.toFixed(1)}. Without them, the prey grow towards the carrying capacity.` });
  if (s.prey > K * 1.05) diagnostics.push({ code: "over_capacity", severity: "info", message: "There are more prey than the habitat can support at the start, so their numbers fall at first." });

  // Equilibrium with no control: N* = mK/(b·h), P* = r(1 − N*/K)·K/h, if both are positive.
  let equilibrium: { prey: number; predators: number } | undefined;
  if (has && b > 0 && s.hunting > 0) {
    const Ne = (m * K) / (b * s.hunting);
    if (Ne < K) equilibrium = { prey: Ne, predators: (r * (1 - Ne / K) * K) / s.hunting };
  }

  // Cycles: count prey peaks in the second half of the run.
  let cycleYears: number | undefined;
  if (has && extinct.prey === undefined && extinct.predators === undefined) {
    const half = samples.filter(p => p.t >= s.years / 2);
    const peaks: number[] = [];
    for (let i = 1; i + 1 < half.length; i++) if (half[i].prey > half[i - 1].prey && half[i].prey >= half[i + 1].prey) peaks.push(half[i].t);
    const tail = half.map(p => p.prey), spread = (Math.max(...tail) - Math.min(...tail)) / Math.max(1, Math.max(...tail));
    if (peaks.length >= 2 && spread > 0.05) {
      cycleYears = (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1);
      diagnostics.push({ code: "oscillating", severity: "info", message: `The populations rise and fall in a cycle about every ${cycleYears.toFixed(1)} years: more prey feeds more predators, which then eat the prey down.` });
    } else if (spread <= 0.05) {
      diagnostics.push({ code: "steady", severity: "info", message: "The populations have settled to a steady balance." });
    }
  }

  const prey = samples.map(p => p.prey), preds = samples.map(p => p.predators);
  return {
    setup: s,
    samples,
    summary: {
      final: { prey: N, predators: P },
      max: { prey: Math.max(...prey), predators: Math.max(...preds) },
      min: { prey: Math.min(...prey), predators: Math.min(...preds) },
      extinct,
      equilibrium,
      cycleYears,
    },
    diagnostics,
  };
}
