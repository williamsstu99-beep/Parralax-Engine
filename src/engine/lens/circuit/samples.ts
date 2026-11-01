import type { Board } from "./board";
import type { Solution } from "../../truth/circuit/types";

export interface Challenge {
  title: string;
  goal: string;
  check: (board: Board, sol: Solution | null) => { done: boolean; hint: string };
}

export interface Sample { id: string; title: string; summary: string; board: Board; challenge?: Challenge }

const w = (id: string, ...pts: [number, number][]) => ({ id, points: pts.map(([x, y]) => ({ x, y })) });

export const SAMPLES: Sample[] = [
  {
    id: "bulb",
    title: "Battery and bulb",
    summary: "The simplest circuit. Close the switch to complete the loop.",
    board: {
      parts: [
        { id: "bat", kind: "battery", x: 5, y: 7, rot: 3, volts: 9 },
        { id: "sw", kind: "switch", x: 10, y: 3, rot: 0, closed: false },
        { id: "bulb", kind: "bulb", x: 15, y: 7, rot: 1, ohms: 24 },
      ],
      wires: [w("w1", [5, 6], [5, 3], [9, 3]), w("w2", [11, 3], [15, 3], [15, 6]), w("w3", [15, 8], [15, 11], [5, 11], [5, 8])],
    },
  },
  {
    id: "led",
    title: "LED challenge",
    summary: "Light the LED without burning it out.",
    board: {
      parts: [
        { id: "bat", kind: "battery", x: 5, y: 7, rot: 3, volts: 9 },
        { id: "r1", kind: "resistor", x: 10, y: 3, rot: 0, ohms: 100 },
        { id: "led", kind: "led", x: 15, y: 7, rot: 1, color: "red" },
      ],
      wires: [w("w1", [5, 6], [5, 3], [9, 3]), w("w2", [11, 3], [15, 3], [15, 6]), w("w3", [15, 8], [15, 11], [5, 11], [5, 8])],
    },
    challenge: {
      title: "Light the LED safely",
      goal: "Get 10–25 mA through the LED. Too little and it's dim; too much and it burns out.",
      check: (board, sol) => {
        const led = board.parts.find(p => p.kind === "led");
        if (!led || !sol) return { done: false, hint: "You need an LED in the circuit." };
        const ma = (sol.components[led.id]?.amps ?? 0) * 1000;
        if (ma > 25) return { done: false, hint: `${ma.toFixed(0)} mA is too much. Try a bigger resistor.` };
        if (ma < 0.5) return { done: false, hint: "No current through the LED. Is the loop complete, and is it the right way round?" };
        if (ma < 10) return { done: false, hint: `${ma.toFixed(1)} mA: it's on, but dim. Try a smaller resistor.` };
        return { done: true, hint: `${ma.toFixed(1)} mA. Bright and safe.` };
      },
    },
  },
  {
    id: "parallel",
    title: "Bulbs in parallel",
    summary: "Each bulb gets the full battery voltage. Open one path and watch the other.",
    board: {
      parts: [
        { id: "bat", kind: "battery", x: 4, y: 7, rot: 3, volts: 9 },
        { id: "b1", kind: "bulb", x: 11, y: 5, rot: 0, ohms: 24 },
        { id: "b2", kind: "bulb", x: 11, y: 9, rot: 0, ohms: 24 },
        { id: "sw", kind: "switch", x: 15, y: 9, rot: 0, closed: true },
      ],
      wires: [
        w("w1", [4, 6], [4, 3], [8, 3], [8, 9], [10, 9]),
        w("w2", [8, 5], [10, 5]),
        w("w3", [12, 5], [18, 5], [18, 11], [4, 11], [4, 8]),
        w("w4", [12, 9], [14, 9]),
        w("w5", [16, 9], [18, 9]),
      ],
    },
  },
  {
    id: "rc",
    title: "Capacitor charging",
    summary: "Close the switch: the LED flashes on, then fades as the capacitor fills up.",
    board: {
      parts: [
        { id: "bat", kind: "battery", x: 4, y: 7, rot: 3, volts: 9 },
        { id: "sw", kind: "switch", x: 8, y: 3, rot: 0, closed: false },
        { id: "r1", kind: "resistor", x: 13, y: 3, rot: 0, ohms: 470 },
        { id: "led", kind: "led", x: 18, y: 6, rot: 1, color: "blue" },
        { id: "c1", kind: "capacitor", x: 11, y: 11, rot: 2, microfarads: 4700 },
      ],
      wires: [
        w("w1", [4, 6], [4, 3], [7, 3]),
        w("w2", [9, 3], [12, 3]),
        w("w3", [14, 3], [18, 3], [18, 5]),
        w("w4", [18, 7], [18, 11], [12, 11]),
        w("w5", [10, 11], [4, 11], [4, 8]),
      ],
    },
  },
  { id: "blank", title: "Blank board", summary: "Build anything. Drag parts in from the tray.", board: { parts: [], wires: [] } },
];
