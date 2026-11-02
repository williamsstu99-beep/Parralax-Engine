import { describe, expect, it } from "vitest";
import { POP_EXAMPLE } from "./fixture";
import { LESSON_FORMATS, LessonSpec, type Lesson, type PopulationDef } from "./lesson";
import { validateLesson } from "./validate";

const clone = (): Lesson => structuredClone(POP_EXAMPLE);
const errorsOf = (l: Lesson) => validateLesson(l).errors.join("\n");
const pop = (l: Lesson, i: number) => l.scenes[i].population as PopulationDef;

describe("populations lesson validation", () => {
  it("the example matches both schemas and passes", () => {
    expect(LessonSpec.safeParse(POP_EXAMPLE).success).toBe(true);
    expect(LESSON_FORMATS.populations.safeParse(POP_EXAMPLE).success).toBe(true);
    expect(validateLesson(POP_EXAMPLE)).toEqual({ errors: [], warnings: [] });
  });

  it("rejects a challenge that's already solved", () => {
    const l = clone();
    pop(l, 2).trapping = 0.8;
    expect(errorsOf(l)).toMatch(/already complete/);
  });

  it("rejects a challenge no allowed setting can solve", () => {
    const l = clone();
    pop(l, 2).editable = ["control_start"]; // timing alone can't help without trapping
    expect(errorsOf(l)).toMatch(/no combination of the editable settings/);
  });

  it("catches predator settings without a predator", () => {
    const l = clone();
    Object.assign(pop(l, 0), { predator_start: 10, editable: ["growth", "hunting"] });
    expect(errorsOf(l)).toMatch(/predator_name is null/);
    expect(errorsOf(l)).toMatch(/"hunting" is editable but there's no predator/);
  });

  it("catches out-of-range values", () => {
    const l = clone();
    pop(l, 0).growth = 9;
    expect(errorsOf(l)).toMatch(/growth is 9; use 0 to 3/);
  });
});
