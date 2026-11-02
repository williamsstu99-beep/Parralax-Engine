import type { Lesson } from "@/engine/spec/lesson";

/**
 * /api/lesson streams one JSON object per line so the page can show real
 * progress: stages as they happen, then the lesson or an error.
 */
export type LessonEvent =
  | { t: "stage"; stage: "engine" | "planning" | "writing" | "checking" | "fixing"; label: string; detail?: string; attempt?: number; words?: number }
  | { t: "done"; lesson: Lesson; attempts: number; warnings: string[] }
  | { t: "error"; error: string; details?: string[] };
