"use client";

import { useCallback, useState } from "react";
import CircuitLab from "@/components/lab/CircuitLab";
import { SAMPLES, type Sample } from "@/engine/lens/circuit/samples";
import { EXAMPLE_LESSON } from "@/engine/spec/fixture";
import { sceneBoard } from "@/engine/spec/validate";
import SceneShell from "./SceneShell";
import { Segmented } from "./controls";

type Start = "loop" | "two" | "empty";

const STARTS: Record<Start, Sample> = {
  loop: { ...SAMPLES.find(s => s.id === "bulb")!, id: "w-loop", challenge: undefined },
  two: { id: "w-two", title: "Two bulbs", summary: "", board: sceneBoard(EXAMPLE_LESSON.scenes[0]) },
  empty: { id: "w-empty", title: "Empty board", summary: "", board: { parts: [], wires: [] } },
};

export default function CircuitScene() {
  const [start, setStart] = useState<Start>("loop");
  const [caption, setCaption] = useState("Here's a battery, a switch and a bulb, joined in a loop. Tap the switch to close it.");
  const onCaption = useCallback((t: string) => setCaption(t), []);
  return (
    <SceneShell id="circuits" caption={caption} fit
      controls={<Segmented label="Start with" value={start} onChange={setStart} options={[["loop", "A bulb and a switch"], ["two", "Two bulbs"], ["empty", "Empty board"]]} />}>
      <CircuitLab key={start} initial={STARTS[start]} embedded workshop onCaption={onCaption} />
    </SceneShell>
  );
}
