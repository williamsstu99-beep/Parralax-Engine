import { describe, expect, it } from "vitest";
import { MOTION_EXAMPLE } from "./fixture";
import { LessonSpec, type Lesson, type MotionDef } from "./lesson";
import { findSolution, fromGen, lessonFromGen, motionSetup, toGen, genExample } from "./motion";
import { LESSON_FORMATS } from "./lesson";
import { validateLesson } from "./validate";
import type { MotionChallenge } from "../lens/motion/model";

const clone = (): Lesson => structuredClone(MOTION_EXAMPLE);
const errorsOf = (l: Lesson) => validateLesson(l).errors.join("\n");
const motion = (l: Lesson, i: number) => l.scenes[i].motion as MotionDef;

describe("motion lesson validation", () => {
  it("the example motion lesson matches the schema and passes", () => {
    expect(LessonSpec.safeParse(MOTION_EXAMPLE).success).toBe(true);
    expect(validateLesson(MOTION_EXAMPLE)).toEqual({ errors: [], warnings: [] });
  });

  it("rejects a challenge that's already solved at the start", () => {
    const l = clone();
    Object.assign(motion(l, 1), { speed: 14.7, angle: 45 });
    expect(errorsOf(l)).toMatch(/already complete/);
  });

  it("rejects a challenge no allowed setting can solve", () => {
    const l = clone();
    motion(l, 1).target_x = 280; // beyond the furthest possible throw at 50 m/s
    expect(errorsOf(l)).toMatch(/no combination of the editable settings/);
  });

  it("finds a solution when one exists", () => {
    const m = motion(clone(), 1);
    const s = findSolution(motionSetup(m), ["speed", "angle"], m.challenge as MotionChallenge);
    expect(s).not.toBeNull();
  });

  it("catches out-of-range values and fields from the wrong kind of scene", () => {
    const l = clone();
    Object.assign(motion(l, 0), { speed: 80, friction: 0.3 });
    expect(errorsOf(l)).toMatch(/speed is 80; use 0 to 50/);
    expect(errorsOf(l)).toMatch(/friction is for ramp scenes only/);
  });

  it("catches a circuit board in a motion lesson and a missing simulation", () => {
    const l = clone();
    l.scenes[0].board = { parts: [], wires: [] };
    delete l.scenes[1].motion;
    expect(errorsOf(l)).toMatch(/remove "board"/);
    expect(errorsOf(l)).toMatch(/motion scenes need "motion"/);
  });

  it("validates ramp challenges", () => {
    const l = clone();
    l.scenes[2].motion = {
      kind: "ramp", planet: "earth", angle: 25, length: 6, mass: 2, friction: 0.6, start: "top", editable: ["friction"],
      challenge: { title: "Slide!", goal: "Make the block slide to the bottom.", checks: [{ kind: "reaches_bottom" }], hint_if_stuck: "Less friction.", success: "Whoosh." },
    };
    expect(errorsOf(l)).toBe("");
    motion(l, 2).friction = 0.1; // already slides
    expect(errorsOf(l)).toMatch(/already complete/);
  });

  it("round-trips through the AI's generation format", () => {
    const gen = genExample(MOTION_EXAMPLE);
    expect(LESSON_FORMATS.motion.safeParse(gen).success).toBe(true);
    expect(lessonFromGen(gen)).toEqual(MOTION_EXAMPLE);
    for (const sc of MOTION_EXAMPLE.scenes) expect(fromGen(toGen(sc.motion!))).toEqual(sc.motion);
  });
});
