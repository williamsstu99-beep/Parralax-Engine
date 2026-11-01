import { describe, expect, it } from "vitest";
import { EXAMPLE_LESSON } from "./fixture";
import { LessonSpec, type Lesson } from "./lesson";
import { sceneBoard, toChallenge, validateLesson } from "./validate";
import { buildNetlist } from "../lens/circuit/board";
import { solveDC } from "../truth/circuit/solver";

const clone = (): Lesson => structuredClone(EXAMPLE_LESSON);
const errorsOf = (l: Lesson) => validateLesson(l).errors.join("\n");

describe("lesson validation", () => {
  it("the example lesson matches the schema and passes", () => {
    expect(LessonSpec.safeParse(EXAMPLE_LESSON).success).toBe(true);
    expect(validateLesson(EXAMPLE_LESSON)).toEqual({ errors: [], warnings: [] });
  });

  it("catches diagonal wires and explains how to fix them", () => {
    const l = clone();
    l.scenes[0].board!.wires[0].points = [{ x: 4, y: 6 }, { x: 7, y: 3 }];
    expect(errorsOf(l)).toMatch(/diagonally.*add a corner point/);
  });

  it("catches a part end that isn't connected", () => {
    const l = clone();
    l.scenes[0].board!.wires.pop();
    expect(errorsOf(l)).toMatch(/isn't connected to anything/);
  });

  it("catches parts that run off the board", () => {
    const l = clone();
    l.scenes[0].board!.parts[2].x = 21; // horizontal bulb: right end lands at x = 22
    expect(errorsOf(l)).toMatch(/runs off the board/);
  });

  it("rejects a challenge that is already solved", () => {
    const l = clone();
    l.scenes[1].challenge!.checks = [{ kind: "lit", part_id: "b1" }];
    expect(errorsOf(l)).toMatch(/already complete/);
  });

  it("rejects checks that point at parts that don't exist", () => {
    const l = clone();
    l.scenes[1].challenge!.checks[0].part_id = "nope";
    expect(errorsOf(l)).toMatch(/doesn't exist/);
  });

  it("rejects a short circuit", () => {
    const l = clone();
    const s = l.scenes[0];
    s.board!.parts = s.board!.parts.filter(p => p.id === "bat");
    s.board!.wires = [{ id: "w", points: [{ x: 4, y: 6 }, { x: 4, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 11 }, { x: 4, y: 11 }, { x: 4, y: 8 }] }];
    expect(errorsOf(l)).toMatch(/short circuit/);
  });

  it("rejects bad question shapes", () => {
    const l = clone();
    l.questions[0].choices.pop();
    l.questions[1].answer_index = 7;
    const e = errorsOf(l);
    expect(e).toMatch(/exactly 4 choices/);
    expect(e).toMatch(/answer_index/);
  });

  it("the parallel challenge is solvable: rewiring in parallel completes it", () => {
    const scene = EXAMPLE_LESSON.scenes[1];
    const board = sceneBoard(scene);
    board.wires = [
      { id: "a", points: [{ x: 4, y: 6 }, { x: 4, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 9 }, { x: 10, y: 9 }] },
      { id: "b", points: [{ x: 8, y: 5 }, { x: 10, y: 5 }] },
      { id: "c", points: [{ x: 12, y: 5 }, { x: 16, y: 5 }, { x: 16, y: 11 }, { x: 4, y: 11 }, { x: 4, y: 8 }] },
      { id: "d", points: [{ x: 12, y: 9 }, { x: 16, y: 9 }] },
    ];
    const sol = solveDC(buildNetlist(board).circuit);
    const r = toChallenge(scene.challenge!).check(board, sol);
    expect(r).toEqual({ done: true, hint: scene.challenge!.success });
  });

  it("hints use live numbers from the solver", () => {
    const scene = EXAMPLE_LESSON.scenes[1];
    const board = sceneBoard(scene);
    const sol = solveDC(buildNetlist(board).circuit);
    expect(toChallenge(scene.challenge!).check(board, sol).hint).toMatch(/^Bulb 1 has 18\d mA; aim for 300–450 mA\.$/);
  });
});
