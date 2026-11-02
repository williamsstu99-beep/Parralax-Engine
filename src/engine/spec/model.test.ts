import { describe, expect, it } from "vitest";
import { MODEL_EXAMPLE } from "./fixture";
import { LESSON_FORMATS, LessonSpec, type Lesson } from "./lesson";
import { validateLesson } from "./validate";

const clone = (): Lesson => structuredClone(MODEL_EXAMPLE);
const errorsOf = (l: Lesson) => validateLesson(l).errors.join("\n");

describe("general model validation", () => {
  it("the example matches both schemas and passes every check", () => {
    expect(LessonSpec.safeParse(MODEL_EXAMPLE).success).toBe(true);
    expect(LESSON_FORMATS.model.safeParse(MODEL_EXAMPLE).success).toBe(true);
    expect(validateLesson(MODEL_EXAMPLE)).toEqual({ errors: [], warnings: [] });
  });

  it("catches a model that contradicts a real-world fact", () => {
    const l = clone();
    l.model!.flows[0].rate = "0.001 * (temp - room)"; // far too slow: tea would barely cool in an hour
    expect(errorsOf(l)).toMatch(/fact 1 \("A cup of tea left in a 20 °C room.*"\) isn.t reproduced: Tea temperature at the end was 85\.9/);
  });

  it("catches wrong cause and effect", () => {
    const l = clone();
    l.model!.flows[0].rate = "k * (1 + 0.5 * lid) * (temp - room)"; // lid makes it cool faster
    expect(errorsOf(l)).toMatch(/comparison 1 \("A lid keeps tea hotter for longer"\) isn't shown/);
  });

  it("catches models that blow up somewhere in the settings' range", () => {
    const l = clone();
    l.model!.flows[0].rate = "k * (temp - room) / (room - 30)"; // divides by zero at room = 30
    expect(errorsOf(l)).toMatch(/model fails|isn't reproduced|above its max/);
  });

  it("catches undefined names with a fixable message", () => {
    const l = clone();
    l.model!.flows[0].rate = "k * (temp - outside)";
    expect(errorsOf(l)).toMatch(/uses "outside", which isn't defined/);
  });

  it("requires facts to check against", () => {
    const l = clone();
    l.model!.facts = l.model!.facts.slice(0, 1);
    expect(errorsOf(l)).toMatch(/at least 2 facts/);
  });

  it("rejects solved or unsolvable challenges", () => {
    const solved = clone();
    solved.scenes[1].setup!.values = [{ id: "lid", value: 1 }];
    expect(errorsOf(solved)).toMatch(/already complete/);
    const impossible = clone();
    impossible.scenes[1].setup!.editable = ["start_temp"];
    impossible.scenes[1].setup!.challenge!.checks[0].min = 95;
    expect(errorsOf(impossible)).toMatch(/no combination of the editable settings/);
  });

  it("checks conserved totals", () => {
    const l = clone();
    l.model!.conserved = ["temp"];
    expect(errorsOf(l)).toMatch(/should stay constant/);
  });
});
