import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { LessonSpec, PartSpec, WireSpec } from "@/engine/spec/lesson";
import { sceneBoard } from "@/engine/spec/validate";
import { boardSnapshot } from "@/engine/tutor/snapshot";
import { TUTOR_SYSTEM, boardMessage, lessonContext, type TutorEvent } from "@/engine/tutor/prompt";

export const maxDuration = 120;

const MODEL = "claude-opus-5-5";

const Body = z.object({
  lesson: LessonSpec,
  sceneIndex: z.number().int().min(0),
  board: z.object({
    parts: z.array(PartSpec).max(40),
    wires: z.array(WireSpec.extend({ points: WireSpec.shape.points.max(40) })).max(120),
  }),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(40),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That tutor request wasn't in the expected format." }, { status: 400 });
  const { lesson, sceneIndex, board, messages } = parsed.data;
  const scene = lesson.scenes[sceneIndex];
  if (!scene) return Response.json({ error: "That scene isn't in the lesson." }, { status: 400 });
  if (messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "The conversation must start and end with the student." }, { status: 400 });
  }

  // Same key lookup as /api/lesson: Claude Code cloud environments reserve ANTHROPIC_API_KEY.
  const apiKey = process.env.PARALLAX_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "The tutor isn't set up yet: the server has no API key." }, { status: 503 });
  const client = new Anthropic({ apiKey, baseURL: process.env.PARALLAX_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com" });

  // Truth: solve the student's board on the server, so the tutor only ever quotes real readings.
  const snap = boardSnapshot(sceneBoard({ ...scene, board }), scene.challenge);

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [
      { type: "text", text: TUTOR_SYSTEM },
      { type: "text", text: lessonContext(lesson), cache_control: { type: "ephemeral" } },
    ],
    messages: [
      ...messages,
      // Operator channel: the student can't spoof these readings by typing them into chat.
      { role: "system", content: boardMessage(sceneIndex, scene.heading, snap.text) },
    ],
  }, { signal: req.signal });

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: TutorEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") send({ t: "text", v: event.delta.text });
        }
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") send({ t: "error", v: "The tutor can't help with that one. Try asking about the circuit." });
        else send({ t: "done" });
      } catch (e) {
        if (req.signal.aborted) { controller.close(); return; }
        const v = e instanceof Anthropic.AuthenticationError ? "The tutor's API key was rejected."
          : e instanceof Anthropic.RateLimitError ? "The tutor is busy right now. Try again in a minute."
          : e instanceof Anthropic.APIError ? `The AI service returned an error (${e.status}).`
          : "Something went wrong talking to the tutor.";
        if (!(e instanceof Anthropic.APIError)) console.error("tutor stream failed", e);
        send({ t: "error", v });
      }
      controller.close();
    },
    cancel() { stream.abort(); },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
