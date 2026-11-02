/** The workshop's hand-crafted simulations: what they're called and the words that point to them. */

export type SceneId = "circuits" | "wing" | "magnets" | "induction" | "battery";

export interface SceneInfo { id: SceneId; short: string; kicker: string; title: string; blurb: string; keywords: string[] }

export const SCENES: Record<SceneId, SceneInfo> = {
  circuits: {
    id: "circuits", short: "Circuits", kicker: "Circuits workshop", title: "Build it, light it up",
    blurb: "Drag batteries, bulbs and switches together and watch the current flow.",
    keywords: ["circuit", "bulb", "battery and bulb", "series", "parallel", "current", "voltage", "resistor", "switch", "led", "electricity", "wire"],
  },
  wing: {
    id: "wing", short: "Wing lift", kicker: "Flight", title: "How a wing lifts",
    blurb: "Air streams over a wing. Speed up and watch it lift; tilt too far and it stalls.",
    keywords: ["wing", "lift", "aerofoil", "airfoil", "plane", "aircraft", "flight", "fly", "air flow", "airflow", "bernoulli", "stall", "aerodynamic"],
  },
  magnets: {
    id: "magnets", short: "Magnets", kicker: "Magnetism", title: "The invisible pull",
    blurb: "Drag magnets around and watch their fields reach out, pull together and push apart.",
    keywords: ["magnet", "magnetism", "magnetic field", "field lines", "poles", "north", "south", "attract", "repel", "compass"],
  },
  induction: {
    id: "induction", short: "Induction", kicker: "Electromagnetic induction", title: "Make electricity with a magnet",
    blurb: "Push a magnet through a coil of wire and light a bulb, but only while it moves.",
    keywords: ["induction", "induce", "generator", "dynamo", "coil", "faraday", "electromagnetic", "magnet and coil", "make electricity", "power station", "alternator"],
  },
  battery: {
    id: "battery", short: "Battery", kicker: "Chemistry meets electricity", title: "Inside a battery",
    blurb: "Zinc gives up electrons, copper takes them, and a bulb lights in between. Then run it backwards to recharge.",
    keywords: ["battery", "batteries", "cell", "galvanic", "voltaic", "electrolytic", "electrolysis", "electrolyte", "zinc", "copper", "electrode", "anode", "cathode", "recharge", "salt bridge", "redox", "electrochemical"],
  },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

/** A quick keyword match, used when the AI router is unavailable and to double-check it. */
export function matchScene(text: string): SceneId | null {
  const t = text.toLowerCase();
  let best: { id: SceneId; score: number } | null = null;
  for (const s of Object.values(SCENES)) {
    const score = s.keywords.reduce((n, k) => n + (t.includes(k) ? k.length : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score };
  }
  return best?.id ?? null;
}
