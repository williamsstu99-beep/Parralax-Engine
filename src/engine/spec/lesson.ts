/**
 * The Lesson Spec: the structured format the AI writes and the engine checks.
 *
 * The AI never writes code or physics results. It writes this: which engine,
 * the starting circuit, what the student should do, and how to tell when
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

export const SceneSpec = z.object({
  heading: z.string(),
  intro: z.string().describe("2-3 sentences to the student before they start"),
  board: z.object({ parts: z.array(PartSpec), wires: z.array(WireSpec) }),
  challenge: ChallengeSpec.optional(),
  explain: z.object({
    simple: z.string().describe("Everyday analogy, no jargon"),
    intermediate: z.string().describe("Scientific terms appropriate to the year level"),
    advanced: z.string().describe("Equations and underlying principles"),
  }),
  try_this: z.array(z.string()).describe("2-3 short experiments to try on this board"),
});

export const QuestionSpec = z.object({
  question: z.string(),
  choices: z.array(z.string()).describe("Exactly 4 choices"),
  answer_index: z.number(),
  explanation: z.string(),
});

export const LessonSpec = z.object({
  title: z.string(),
  year_level: z.number().describe("New Zealand year level, 6 to 13"),
  objective: z.string(),
  key_ideas: z.array(z.string()),
  scenes: z.array(SceneSpec).describe("1 to 4 scenes, building up"),
  questions: z.array(QuestionSpec).describe("2 to 5 check-for-understanding questions"),
  teacher_notes: z.string().describe("Misconceptions to watch for and how to extend the lesson"),
});

export type Lesson = z.infer<typeof LessonSpec>;
export type Scene = z.infer<typeof SceneSpec>;
export type ChallengeDef = z.infer<typeof ChallengeSpec>;
export type Check = z.infer<typeof CheckSpec>;
