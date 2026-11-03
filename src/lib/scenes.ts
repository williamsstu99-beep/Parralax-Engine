/** The workshop's hand-crafted simulations: what they're called and the words that point to them. */

export type SceneId = "circuits" | "hill" | "wing" | "plane" | "pipe" | "magnets" | "induction" | "battery";

export interface Reimagining { prompt: string; to: SceneId }

export interface SceneInfo {
  id: SceneId; short: string; kicker: string; title: string; blurb: string; keywords: string[];
  /** The headline simulation this one is a re-imagining of (it sits under that tab). */
  family: SceneId;
  /** Ways to see the same idea differently, offered in the "Reimagine" bar. */
  reimagine: Reimagining[];
}

export const SCENES: Record<SceneId, SceneInfo> = {
  circuits: {
    id: "circuits", family: "circuits", short: "Circuits", kicker: "Circuits workshop", title: "Build it, light it up",
    blurb: "Drag batteries, bulbs and switches together and watch the current flow.",
    keywords: ["circuit", "bulb", "battery and bulb", "series", "parallel", "current", "voltage", "resistor", "switch", "led", "electricity", "wire"],
    reimagine: [
      { prompt: "Reimagine voltage as a hill", to: "hill" },
      { prompt: "Show me what's going on inside the battery", to: "battery" },
    ],
  },
  hill: {
    id: "hill", family: "circuits", short: "Voltage hill", kicker: "Circuits, reimagined", title: "Voltage is a hill",
    blurb: "The battery lifts charges up a hill; they roll down through the bulbs, giving up their energy as light. Height is voltage.",
    keywords: ["voltage as a hill", "hill", "gravity", "gravity model", "height", "potential", "potential difference", "voltage drop", "roller coaster", "analogy", "uphill", "downhill"],
    reimagine: [
      { prompt: "Show it as a real circuit", to: "circuits" },
      { prompt: "What's inside the battery doing the lifting?", to: "battery" },
    ],
  },
  wing: {
    id: "wing", family: "wing", short: "Flight", kicker: "Flight", title: "How a wing lifts",
    blurb: "Air streams over a wing. Speed up and watch it lift; tilt too far and it stalls.",
    keywords: ["wing", "lift", "aerofoil", "airfoil", "plane", "aircraft", "flight", "fly", "air flow", "airflow", "stall", "aerodynamic"],
    reimagine: [
      { prompt: "Now show me the forces on a whole plane in flight", to: "plane" },
      { prompt: "Reimagine the airflow as flow in a pipe", to: "pipe" },
    ],
  },
  plane: {
    id: "plane", family: "wing", short: "Whole plane", kicker: "Flight, reimagined", title: "Four forces on a plane",
    blurb: "Lift, weight, thrust and drag on a whole aeroplane. Throttle up, pitch the nose, and watch which forces win.",
    keywords: ["whole plane", "forces on a plane", "forces acting on", "four forces", "thrust", "drag", "take off", "takeoff", "aeroplane in flight", "airplane in flight", "during flight", "jet", "engine", "throttle", "air resistance", "balanced forces", "unbalanced forces"],
    reimagine: [
      { prompt: "Zoom into the wing to see how it makes lift", to: "wing" },
      { prompt: "Reimagine the air as flow in a pipe", to: "pipe" },
    ],
  },
  pipe: {
    id: "pipe", family: "wing", short: "Pipe flow", kicker: "Flow, reimagined", title: "Flow in a pipe",
    blurb: "Squeeze a pipe and the flow speeds up while its pressure drops. Push it faster and smooth flow breaks into turbulence.",
    keywords: ["pipe", "flow in a pipe", "laminar", "turbulent", "turbulence", "bernoulli", "venturi", "fluid", "water flow", "pressure drop", "viscosity", "reynolds", "hose"],
    reimagine: [
      { prompt: "Show me the same idea on a wing", to: "wing" },
      { prompt: "Now show the forces on a whole plane", to: "plane" },
    ],
  },
  magnets: {
    id: "magnets", family: "magnets", short: "Magnets", kicker: "Magnetism", title: "The invisible pull",
    blurb: "Drag magnets around and watch their fields reach out, pull together and push apart.",
    keywords: ["magnet", "magnetism", "magnetic field", "field lines", "poles", "north", "south", "attract", "repel", "compass"],
    reimagine: [
      { prompt: "Use a magnet to make electricity", to: "induction" },
    ],
  },
  induction: {
    id: "induction", family: "induction", short: "Induction", kicker: "Electromagnetic induction", title: "Make electricity with a magnet",
    blurb: "Push a magnet through a coil of wire and light a bulb, but only while it moves.",
    keywords: ["induction", "induce", "generator", "dynamo", "coil", "faraday", "electromagnetic", "magnet and coil", "make electricity", "power station", "alternator"],
    reimagine: [
      { prompt: "Show me the magnet's field", to: "magnets" },
      { prompt: "Show voltage as a hill", to: "hill" },
    ],
  },
  battery: {
    id: "battery", family: "battery", short: "Battery", kicker: "Chemistry meets electricity", title: "Inside a battery",
    blurb: "Zinc gives up electrons, copper takes them, and a bulb lights in between. Then run it backwards to recharge.",
    keywords: ["battery", "batteries", "cell", "galvanic", "voltaic", "electrolytic", "electrolysis", "electrolyte", "zinc", "copper", "electrode", "anode", "cathode", "recharge", "salt bridge", "redox", "electrochemical"],
    reimagine: [
      { prompt: "Reimagine the battery's voltage as a hill", to: "hill" },
      { prompt: "Wire it into a circuit", to: "circuits" },
    ],
  },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

/** The headline simulations shown as tabs; the rest are re-imaginings reached from them. */
export const MAIN_SCENES: SceneId[] = ["circuits", "wing", "magnets", "induction", "battery"];

/**
 * A quick keyword match, used before the AI router. When re-imagining, the
 * current scene is left out, so "show the wing as pipe flow" finds the pipe.
 */
export function matchScene(text: string, exclude?: SceneId): SceneId | null {
  const t = text.toLowerCase();
  let best: { id: SceneId; score: number } | null = null;
  for (const s of Object.values(SCENES)) {
    if (s.id === exclude) continue;
    const score = s.keywords.reduce((n, k) => n + (t.includes(k) ? k.length : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score };
  }
  return best?.id ?? null;
}
