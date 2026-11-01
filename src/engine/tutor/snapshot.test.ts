import { describe, expect, it } from "vitest";
import { EXAMPLE_LESSON, MOTION_EXAMPLE } from "../spec/fixture";
import { motionSetup } from "../spec/motion";
import type { MotionChallenge } from "../lens/motion/model";
import { sceneBoard } from "../spec/validate";
import { boardSnapshot, motionSnapshot } from "./snapshot";
import { TUTOR_SYSTEM, lessonContext } from "./prompt";

const scene0 = EXAMPLE_LESSON.scenes[0];

describe("tutor board snapshot", () => {
  it("reports an open switch as no current and no lit bulbs", () => {
    const { text } = boardSnapshot(sceneBoard(scene0));
    expect(text).toMatch(/Switch \[sw, switch\]: open/);
    expect(text).toMatch(/Bulb 1 \[b1, bulb\]: 24 Ω → 0 A/);
    expect(text).toMatch(/off/);
  });

  it("quotes the solver's numbers once the switch is closed", () => {
    const board = sceneBoard(scene0);
    board.parts.find(p => p.id === "sw")!.closed = true;
    const { text } = boardSnapshot(board);
    // 9 V across 24 + 24 + 0.5 Ω internal ≈ 186 mA, ~4.45 V per bulb
    expect(text).toMatch(/Bulb 1 \[b1, bulb\]: 24 Ω → 186 mA, 4\.45 V across it/);
    expect(text).toMatch(/Battery \[bat, battery\]: 9 V → supplying 186 mA/);
    expect(text).toMatch(/Problems the engine sees: none\./);
  });

  it("reports challenge progress from the engine's checks", () => {
    const withChallenge = EXAMPLE_LESSON.scenes.find(s => s.challenge)!;
    const snap = boardSnapshot(sceneBoard(withChallenge), withChallenge.challenge);
    expect(snap.challengeDone).toBe(false);
    expect(snap.text).toMatch(/not solved yet\. Engine feedback:/);
  });

  it("handles an empty board", () => {
    expect(boardSnapshot({ parts: [], wires: [] }).text).toBe("The board is empty.");
  });
});

describe("tutor motion snapshot", () => {
  it("describes a projectile and the solver's result", () => {
    const m = MOTION_EXAMPLE.scenes[0].motion!;
    const { text } = motionSnapshot(motionSetup(m), undefined, m.editable);
    expect(text).toMatch(/Tennis ball \(0\.058 kg\), launch speed 15 m\/s, angle 20°/);
    // R = v² sin 2θ / g = 225 × sin 40° / 9.81 ≈ 14.7 m
    expect(text).toMatch(/range 14\.7 m/);
    expect(text).toMatch(/The student can change: angle\./);
  });

  it("reports what a challenge attempt would do without the student seeing it", () => {
    const m = MOTION_EXAMPLE.scenes[1].motion!;
    const snap = motionSnapshot(motionSetup(m), m.challenge as MotionChallenge, m.editable);
    expect(snap.challengeDone).toBe(false);
    expect(snap.text).toMatch(/would not succeed yet\. Engine feedback: It landed .* short/);
  });

  it("gives ramp forces from the solver", () => {
    const snap = motionSnapshot({ kind: "ramp", angle: 30, length: 8, mass: 2, friction: 0.2, force: 0, start: 8, startSpeed: 0, planet: "earth" });
    expect(snap.text).toMatch(/weight 19\.6 N \(9\.8 N of it acts down the slope\), normal reaction 17 N, friction 3\.4 N up the slope/);
    expect(snap.text).toMatch(/reaches the bottom of the slope/);
  });
});

describe("tutor prompt", () => {
  it("keeps the system prompt byte-stable so it caches", () => {
    expect(TUTOR_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("includes the lesson's scenes and teacher notes", () => {
    const ctx = lessonContext(EXAMPLE_LESSON);
    expect(ctx).toContain(EXAMPLE_LESSON.title);
    expect(ctx).toContain("Scene 1: Two bulbs in series");
    expect(ctx).toContain("Teacher notes");
  });
});
