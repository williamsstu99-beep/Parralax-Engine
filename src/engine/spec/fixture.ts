import type { Lesson } from "./lesson";

/**
 * A hand-checked example lesson. Used by tests, by the UI without an API key,
 * and as the worked example in the generation prompt.
 */
export const EXAMPLE_LESSON: Lesson = {
  title: "Series vs parallel: where does the brightness go?",
  year_level: 10,
  objective: "Explain why bulbs in series share the battery's voltage while bulbs in parallel each get all of it.",
  key_ideas: [
    "Current is the same everywhere in a series loop.",
    "In series, the battery's voltage is shared between the bulbs.",
    "In parallel, each branch gets the full battery voltage.",
  ],
  scenes: [
    {
      heading: "Two bulbs in series",
      intro: "Here are two identical bulbs in one loop with a 9 V battery. Before you close the switch, predict: will they be as bright as one bulb on its own?",
      board: {
        parts: [
          { id: "bat", kind: "battery", x: 4, y: 7, rot: 3, volts: 9 },
          { id: "sw", kind: "switch", x: 8, y: 3, rot: 0, closed: false },
          { id: "b1", kind: "bulb", x: 13, y: 3, rot: 0, ohms: 24 },
          { id: "b2", kind: "bulb", x: 17, y: 7, rot: 1, ohms: 24 },
        ],
        wires: [
          { id: "w1", points: [{ x: 4, y: 6 }, { x: 4, y: 3 }, { x: 7, y: 3 }] },
          { id: "w2", points: [{ x: 9, y: 3 }, { x: 12, y: 3 }] },
          { id: "w3", points: [{ x: 14, y: 3 }, { x: 17, y: 3 }, { x: 17, y: 6 }] },
          { id: "w4", points: [{ x: 17, y: 8 }, { x: 17, y: 11 }, { x: 4, y: 11 }, { x: 4, y: 8 }] },
        ],
      },
      explain: {
        simple: "Think of the battery as giving each bit of charge a fixed amount of energy. With two bulbs in a row, that energy gets split between them, so each one glows less.",
        intermediate: "The current is the same through both bulbs. The battery's 9 V is shared, so each identical bulb has about half the voltage across it and transfers less energy each second.",
        advanced: "With R_total = R1 + R2, I = V / (R1 + R2). Each bulb's power is P = I²R, so two equal bulbs in series each dissipate a quarter of what one bulb alone would.",
      },
      try_this: ["Close the switch and click each bulb to compare voltages.", "Change one bulb to 48 Ω. Which one is brighter now?"],
    },
    {
      heading: "Make both bulbs full brightness",
      intro: "Now the bulbs are in series again. Your job: rewire them so each one gets the full 9 V and glows brightly.",
      board: {
        parts: [
          { id: "bat", kind: "battery", x: 4, y: 7, rot: 3, volts: 9 },
          { id: "b1", kind: "bulb", x: 11, y: 5, rot: 0, ohms: 24 },
          { id: "b2", kind: "bulb", x: 11, y: 9, rot: 0, ohms: 24 },
        ],
        wires: [
          { id: "w1", points: [{ x: 4, y: 6 }, { x: 4, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 5 }, { x: 10, y: 5 }] },
          { id: "w2", points: [{ x: 12, y: 5 }, { x: 14, y: 5 }, { x: 14, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 9 }, { x: 10, y: 9 }] },
          { id: "w3", points: [{ x: 12, y: 9 }, { x: 16, y: 9 }, { x: 16, y: 11 }, { x: 4, y: 11 }, { x: 4, y: 8 }] },
        ],
      },
      challenge: {
        title: "Full brightness for both",
        goal: "Get at least 300 mA through each bulb.",
        checks: [
          { kind: "current_between", part_id: "b1", min_ma: 300, max_ma: 450 },
          { kind: "current_between", part_id: "b2", min_ma: 300, max_ma: 450 },
        ],
        hint_if_stuck: "Each bulb needs its own path from the + side of the battery to the − side.",
        success: "Both bulbs at full brightness. That's a parallel circuit.",
        allowed_edits: ["rewire", "move_parts"],
      },
      explain: {
        simple: "Give each bulb its own road back to the battery, and each gets the battery's full push.",
        intermediate: "In parallel, each branch is connected directly across the battery, so each bulb has the full 9 V. The battery supplies the sum of the branch currents.",
        advanced: "Branch currents are I = V/R each, so I_total = V/R1 + V/R2. Equivalent resistance is 1/R_eq = 1/R1 + 1/R2: adding a branch lowers it.",
      },
      try_this: ["Delete one bulb's wire. Does the other one change?", "Watch the battery's current as you add the second branch."],
    },
  ],
  questions: [
    {
      question: "Two identical bulbs are in series with a 9 V battery. About how much voltage is across each bulb?",
      choices: ["9 V", "4.5 V", "18 V", "0 V"],
      answer_index: 1,
      explanation: "In series the battery's voltage is shared, so identical bulbs get about half each.",
    },
    {
      question: "You add a third bulb in parallel. What happens to the current from the battery?",
      choices: ["It goes down", "It stays the same", "It goes up", "It becomes zero"],
      answer_index: 2,
      explanation: "Each new parallel branch draws its own current, so the total from the battery rises.",
    },
  ],
  teacher_notes: "Common misconception: current gets 'used up' by the first bulb. Ask students to click both series bulbs and compare currents. Extension: what happens to the battery's life with more parallel bulbs?",
};
