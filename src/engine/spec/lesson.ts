/**
 * The Lesson Spec: the structured format the AI writes and the engine checks.
 *
 * The AI never writes code or physics results. It writes this: which engine,
 * the starting circuit or motion setup, what the student should do, and how to tell when
 * they've done it (declarative checks the engine evaluates against the
 * Truth solver). Numeric ranges and geometry are checked in validate.ts,
 * not in the schema, so the schema stays friendly to structured output.
 */
import { z } from "zod";

export const PartSpec = z.object({
  id: z.string().describe("Unique id, e.g. 'bat', 'r1', 'led1'"),
  kind: z.enum(["battery", "resistor", "bulb", "led", "switch", "capacitor", "diode"]),
  x: z.number().describe("Grid x of the part's centre"),
  y: z.number().describe("Grid y of the part's centre"),
  rot: z.number().describe("0: ends at (x-1,y) and (x+1,y). 1: ends at (x,y-1) and (x,y+1). 2 and 3 are 0 and 1 flipped."),
  volts: z.number().optional().describe("battery only, 1.5 to 12"),
  ohms: z.number().optional().describe("resistor or bulb only"),
  color: z.enum(["red", "green", "blue", "white", "yellow"]).optional().describe("led only"),
  closed: z.boolean().optional().describe("switch only"),
  microfarads: z.number().optional().describe("capacitor only"),
});

export const WireSpec = z.object({
  id: z.string(),
  points: z.array(z.object({ x: z.number(), y: z.number() })).describe("Orthogonal polyline: consecutive points share x or y"),
});

export const CheckSpec = z.object({
  kind: z.enum(["current_between", "lit", "not_lit", "no_errors"]),
  part_id: z.string().optional().describe("Required for current_between, lit and not_lit"),
  min_ma: z.number().optional().describe("current_between only, milliamps"),
  max_ma: z.number().optional().describe("current_between only, milliamps"),
});

export const ChallengeSpec = z.object({
  title: z.string(),
  goal: z.string().describe("One sentence telling the student what to achieve"),
  checks: z.array(CheckSpec).describe("All must pass for the challenge to be complete"),
  hint_if_stuck: z.string(),
  success: z.string().describe("Short message shown when they succeed"),
  allowed_edits: z.array(z.enum(["change_values", "add_parts", "move_parts", "rewire", "toggle_switches"])),
});

export const MotionCheckSpec = z.object({
  kind: z.enum(["hit_target", "distance_between", "max_height_between", "time_between", "final_speed_between", "reaches_top", "reaches_bottom", "stays_still"]),
  min: z.number().optional().describe("For *_between checks: lower bound (m, s or m/s)"),
  max: z.number().optional().describe("For *_between checks: upper bound"),
});

export const MotionSpec = z.object({
  kind: z.enum(["projectile", "ramp"]),
  planet: z.enum(["earth", "moon", "mars", "jupiter"]),
  body: z.enum(["ball", "football", "shot", "skydiver", "parachute"]).optional().describe("projectile only: the object, which sets its mass and air drag"),
  speed: z.number().optional().describe("projectile only: launch speed, m/s"),
  angle: z.number().optional().describe("projectile: launch angle above horizontal, degrees. ramp: slope angle, degrees"),
  height: z.number().optional().describe("projectile only: launch height, m"),
  air: z.boolean().optional().describe("projectile only: whether air resistance acts"),
  target_x: z.number().optional().describe("projectile only: centre of a landing target, m from the launch point"),
  target_width: z.number().optional().describe("projectile only: width of the landing target, m"),
  length: z.number().optional().describe("ramp only: slope length, m"),
  mass: z.number().optional().describe("ramp only: block mass, kg"),
  friction: z.number().optional().describe("ramp only: coefficient of friction"),
  force: z.number().optional().describe("ramp only: applied force along the slope, N; positive pushes up the slope"),
  start: z.enum(["bottom", "top"]).optional().describe("ramp only: where the block starts"),
  start_speed: z.number().optional().describe("ramp only: starting velocity along the slope, m/s; positive is up"),
  editable: z.array(z.enum(["speed", "angle", "height", "body", "air", "planet", "length", "mass", "friction", "force", "startSpeed"])).describe("Settings the student may change"),
  challenge: z.object({
    title: z.string(),
    goal: z.string().describe("One sentence telling the student what to achieve"),
    checks: z.array(MotionCheckSpec).describe("All must pass for the challenge to be complete"),
    hint_if_stuck: z.string(),
    success: z.string().describe("Short message shown when they succeed"),
  }).optional(),
});

export const POP_FIELDS = ["prey_start", "predator_start", "growth", "capacity", "hunting", "conversion", "predator_death", "trapping", "harvest", "control_start", "years"] as const;

/** A population simulation. Every field is required (null where unused) so it stays small for structured output. */
export const PopulationSpec = z.object({
  prey_name: z.string().describe("Plural, lower case, e.g. 'rabbits' or 'native birds'"),
  predator_name: z.string().nullable().describe("Plural, lower case, e.g. 'stoats'; null for prey on their own"),
  prey_start: z.number().describe("Starting prey numbers"),
  predator_start: z.number().describe("Starting predator numbers; 0 for prey on their own"),
  growth: z.number().describe("Prey growth rate per year when there's plenty of room"),
  capacity: z.number().describe("Carrying capacity: how many prey the habitat supports"),
  hunting: z.number().describe("Prey eaten per predator per year when prey are at carrying capacity; 0 without predators"),
  conversion: z.number().describe("New predators born per prey eaten; 0 without predators"),
  predator_death: z.number().describe("Predator death rate per year; 0 without predators"),
  trapping: z.number().describe("Fraction of predators trapped each year once control starts, 0 to 0.95"),
  harvest: z.number().describe("Fraction of prey harvested each year once control starts, 0 to 0.95"),
  control_start: z.number().describe("Year trapping and harvesting start"),
  years: z.number().describe("How many years to simulate"),
  editable: z.array(z.enum(POP_FIELDS)).describe("Settings the student may change"),
  challenge: z.object({
    title: z.string(),
    goal: z.string().describe("One sentence telling the student what to achieve"),
    checks: z.array(z.object({
      kind: z.enum(["final_between", "never_below", "max_below", "survives", "goes_extinct"]),
      species: z.enum(["prey", "predators"]),
      min: z.number().nullable().describe("final_between and never_below: lower bound; otherwise null"),
      max: z.number().nullable().describe("final_between and max_below: upper bound; otherwise null"),
    })).describe("All must pass for the challenge to be complete"),
    hint_if_stuck: z.string(),
    success: z.string().describe("Short message shown when they succeed"),
  }).nullable().describe("A challenge, or null for a demo scene"),
});

export const SceneSpec = z.object({
  heading: z.string(),
  intro: z.string().describe("2-3 sentences to the student before they start"),
  board: z.object({ parts: z.array(PartSpec), wires: z.array(WireSpec) }).optional().describe("circuits lessons only: the circuit"),
  challenge: ChallengeSpec.optional().describe("circuits lessons only"),
  motion: MotionSpec.optional().describe("motion lessons only: the simulation"),
  population: PopulationSpec.optional().describe("populations lessons only: the simulation"),
  explain: z.object({
    simple: z.string().describe("Everyday analogy, no jargon"),
    intermediate: z.string().describe("Scientific terms appropriate to the year level"),
    advanced: z.string().describe("Equations and underlying principles"),
  }),
  try_this: z.array(z.string()).describe("2-3 short experiments to try in this scene"),
});

export const QuestionSpec = z.object({
  question: z.string(),
  choices: z.array(z.string()).describe("Exactly 4 choices"),
  answer_index: z.number(),
  explanation: z.string(),
});

export const LessonSpec = z.object({
  engine: z.enum(["circuits", "motion", "populations"]).describe("Which simulation engine every scene uses"),
  title: z.string(),
  year_level: z.number().describe("New Zealand year level, 6 to 13"),
  objective: z.string(),
  key_ideas: z.array(z.string()),
  scenes: z.array(SceneSpec).describe("1 to 4 scenes, building up"),
  questions: z.array(QuestionSpec).describe("2 to 5 check-for-understanding questions"),
  teacher_notes: z.string().describe("Misconceptions to watch for and how to extend the lesson"),
});

export type Lesson = z.infer<typeof LessonSpec>;

/**
 * Per-engine schemas for generation. One schema covering every engine is too
 * large for structured output, so the route picks the engine first and asks
 * for a lesson in that engine's shape. Results still parse as LessonSpec.
 */
const SceneCommon = SceneSpec.omit({ board: true, challenge: true, motion: true, population: true });
export const LESSON_FORMATS = {
  circuits: LessonSpec.extend({
    engine: z.literal("circuits"),
    scenes: z.array(SceneCommon.extend({ board: SceneSpec.shape.board.unwrap(), challenge: SceneSpec.shape.challenge })).describe("1 to 4 scenes, building up"),
  }),
  motion: LessonSpec.extend({
    engine: z.literal("motion"),
    scenes: z.array(SceneCommon.extend({ motion: z.lazy(() => MotionGenSpec) })).describe("1 to 4 scenes, building up"),
  }),
  populations: LessonSpec.extend({
    engine: z.literal("populations"),
    scenes: z.array(SceneCommon.extend({ population: PopulationSpec })).describe("1 to 4 scenes, building up"),
  }),
};

/**
 * The motion simulation as the AI writes it. Many optional fields make the
 * structured-output grammar too large, so every field is required and the
 * kind-specific settings sit in a block that is null for the other kind.
 * spec/motion.ts converts this to MotionSpec.
 */
export const MotionGenSpec = z.object({
  kind: z.enum(["projectile", "ramp"]),
  planet: z.enum(["earth", "moon", "mars", "jupiter"]),
  projectile: z.object({
    body: z.enum(["ball", "football", "shot", "skydiver", "parachute"]).describe("Sets mass and air drag"),
    speed: z.number().describe("Launch speed, m/s"),
    angle: z.number().describe("Launch angle above horizontal, degrees"),
    height: z.number().describe("Launch height, m"),
    air: z.boolean().describe("Whether air resistance acts"),
    target_x: z.number().nullable().describe("Centre of a landing target, m from the launch point, or null"),
    target_width: z.number().nullable().describe("Width of the landing target, m, or null"),
  }).nullable().describe("Settings for kind projectile; null for ramps"),
  ramp: z.object({
    angle: z.number().describe("Slope angle, degrees"),
    length: z.number().describe("Slope length, m"),
    mass: z.number().describe("Block mass, kg"),
    friction: z.number().describe("Coefficient of friction"),
    force: z.number().describe("Applied force along the slope, N; positive pushes up the slope"),
    start: z.enum(["bottom", "top"]),
    start_speed: z.number().describe("Starting velocity along the slope, m/s; positive is up"),
  }).nullable().describe("Settings for kind ramp; null for projectiles"),
  editable: MotionSpec.shape.editable,
  challenge: z.object({
    title: z.string(),
    goal: z.string().describe("One sentence telling the student what to achieve"),
    checks: z.array(z.object({
      kind: MotionCheckSpec.shape.kind,
      min: z.number().nullable().describe("For *_between checks: lower bound; otherwise null"),
      max: z.number().nullable().describe("For *_between checks: upper bound; otherwise null"),
    })).describe("All must pass for the challenge to be complete"),
    hint_if_stuck: z.string(),
    success: z.string().describe("Short message shown when they succeed"),
  }).nullable().describe("A challenge, or null for a demo scene"),
});
export type MotionGen = z.infer<typeof MotionGenSpec>;

/** Schema for the quick first step that picks the engine. */
export const EngineChoice = z.object({ engine: z.enum(["circuits", "motion", "populations"]) });
export type Scene = z.infer<typeof SceneSpec>;
export type ChallengeDef = z.infer<typeof ChallengeSpec>;
export type Check = z.infer<typeof CheckSpec>;
export type MotionDef = z.infer<typeof MotionSpec>;
export type PopulationDef = z.infer<typeof PopulationSpec>;
export type Engine = Lesson["engine"];
