import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EngineChoice, LESSON_FORMATS, LessonSpec, type Engine, type Lesson } from "@/engine/spec/lesson";
import { ENGINE_SYSTEM, LESSON_SYSTEM, lessonRequest, repairRequest } from "@/engine/spec/prompt";
import { validateLesson } from "@/engine/spec/validate";
import { lessonFromGen } from "@/engine/spec/motion";
import { parseLooseJson } from "@/lib/loose-json";
import type { LessonEvent } from "@/lib/lesson-events";

export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
const MAX_ATTEMPTS = 3;
// Low effort measured ~3x faster than medium with the same pass rate on model lessons.
const EFFORT = (process.env.PARALLAX_LESSON_EFFORT ?? "low") as "low" | "medium" | "high";
// Don't start a repair attempt this late: one attempt can take ~90 s and the function stops at maxDuration (300 s).
const LAST_START_MS = 180_000;

// The general model format is too large for strict structured output, so for
// model lessons the AI writes plain JSON against this schema and the engine's
// own checks (schema, then full validation) enforce it, with repair on failure.
const MODEL_SCHEMA = JSON.stringify(z.toJSONSchema(LESSON_FORMATS.model));
const strict = (engine: Engine) => engine !== "model";


export async function POST(req: Request) {
  // Checked here as well as in the proxy, so these paid endpoints never rely on the matcher alone.
  if (!(await hasAccess((await cookies()).get(ACCESS_COOKIE)?.value))) return Response.json({ error: "Enter the access code first." }, { status: 401 });
  const body = await req.json().catch(() => null) as { request?: unknown } | null;
  const request = typeof body?.request === "string" ? body.request.trim() : "";
  if (!request) return Response.json({ error: "Describe what you'd like to learn or teach." }, { status: 400 });
  if (request.length > 1500) return Response.json({ error: "Keep the request under 1,500 characters." }, { status: 400 });
  // PARALLAX_ANTHROPIC_API_KEY first: Claude Code cloud environments reserve ANTHROPIC_API_KEY
  // and don't pass it to sessions. On Vercel either name works.
  const apiKey = process.env.PARALLAX_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Lesson generation isn't set up yet: the server has no PARALLAX_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY." }, { status: 503 });
  }

  // Ignore any ANTHROPIC_BASE_URL in the environment (dev containers set their own); talk to the API directly.
  const client = new Anthropic({ apiKey, baseURL: process.env.PARALLAX_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com" });

  // From here on, stream progress: one JSON object per line (see LessonEvent).
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: LessonEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await generate(client, request, send, req.signal);
      } catch (e) {
        if (!req.signal.aborted) {
          if (e instanceof Anthropic.AuthenticationError) send({ t: "error", error: "The API key was rejected. Check PARALLAX_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY)." });
          else if (e instanceof Anthropic.RateLimitError) send({ t: "error", error: "Too many requests right now. Try again in a minute." });
          else if (e instanceof Anthropic.APIError) { console.error("lesson generation: API error", e.status, e.message); send({ t: "error", error: `The AI service returned an error (${e.status}).` }); }
          else { console.error("lesson generation failed", e); send({ t: "error", error: "Something went wrong building the lesson." }); }
        }
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

const ENGINE_NAMES: Record<Engine, string> = { circuits: "a circuit", motion: "a motion", populations: "a populations", model: "a new" };

/** Friendly summary of the first problem, for the progress panel. */
function fixingDetail(errors: string[]): string {
  const e = errors[0] ?? "";
  if (/^fact \d+/.test(e)) return "A real-world fact check didn't match, so the model is being corrected.";
  if (/^comparison \d+/.test(e)) return "A cause-and-effect check didn't hold, so the model is being corrected.";
  if (/model fails|blew up|infinite/.test(e)) return "The model broke for some settings, so it's being made more robust.";
  if (/already complete|no combination/.test(e)) return "A challenge needed adjusting so it's possible but not already solved.";
  if (/valid JSON|expected|Invalid/.test(e)) return "The lesson came back malformed, so it's being rewritten.";
  return "The engine found a problem, so it's being fixed.";
}

async function generate(client: Anthropic, request: string, send: (e: LessonEvent) => void, signal: AbortSignal) {
  const started = Date.now();
  let lastErrors: string[] = [];
  const engine = await chooseEngine(client, request);
  send({ t: "stage", stage: "engine", label: `Building ${ENGINE_NAMES[engine]} simulation for your request` });
  const content = strict(engine) ? lessonRequest(request, engine)
    : `${lessonRequest(request, engine)}\n\nReply with a single JSON object and nothing else, matching this JSON Schema:\n${MODEL_SCHEMA}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1 && Date.now() - started > LAST_START_MS) break;
    send({ t: "stage", stage: "planning", label: attempt === 1 ? "Working out the science" : "Rethinking the problem", attempt });
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: LESSON_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: strict(engine) ? { effort: EFFORT, format: betaZodOutputFormat(LESSON_FORMATS[engine]) } : { effort: EFFORT },
      messages,
    }, { signal });
    const t0 = Date.now();
    let chars = 0, lastSent = 0;
    for await (const ev of stream) {
      if (ev.type === "content_block_start" && ev.content_block.type === "text") send({ t: "stage", stage: "writing", label: "Writing the lesson", attempt, words: 0 });
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        chars += ev.delta.text.length;
        if (Date.now() - lastSent > 1200) { lastSent = Date.now(); send({ t: "stage", stage: "writing", label: "Writing the lesson", attempt, words: Math.round(chars / 6) }); }
      }
    }
    const msg = await stream.finalMessage();
    console.log(`lesson generation: ${engine} attempt ${attempt} took ${((Date.now() - t0) / 1000).toFixed(1)}s, output ${msg.usage.output_tokens} tokens, input ${msg.usage.input_tokens} (+${msg.usage.cache_read_input_tokens ?? 0} cached)`);
    if (msg.stop_reason === "refusal") { send({ t: "error", error: "That request couldn't be turned into a lesson. Try rephrasing it." }); return; }
    if (msg.stop_reason === "max_tokens") lastErrors = ["the lesson was too long and got cut off; make it shorter"];

    send({ t: "stage", stage: "checking", label: engine === "model" ? "Running the model and checking it against real-world facts" : "Checking every simulation with the solver", attempt });
    const text = msg.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
    let lesson: Lesson | null = null;
    try {
      const raw = lessonFromGen(strict(engine) ? JSON.parse(text) : parseLooseJson(text));
      // Model lessons weren't schema-constrained, so check them against their own format first.
      const shaped = strict(engine) ? { success: true as const } : LESSON_FORMATS.model.safeParse(raw);
      const parsed = shaped.success ? LessonSpec.safeParse(raw) : shaped;
      if (parsed.success) lesson = parsed.data;
      else lastErrors = parsed.error.issues.slice(0, 10).map(i => `${i.path.join(".")}: ${i.message}`);
    } catch (e) {
      if (msg.stop_reason !== "max_tokens") {
        const why = e instanceof Error ? e.message : String(e);
        const at = Number(/position (\d+)/.exec(why)?.[1] ?? 0) + Math.max(0, text.indexOf("{"));
        console.error("lesson generation: unparseable reply", why, "| near:", JSON.stringify(text.slice(Math.max(0, at - 160), at + 80)));
        lastErrors = [`the response wasn't valid JSON (${why}); reply with only the JSON object, using double quotes and no comments or trailing commas`];
      }
    }

    if (lesson) {
      const { errors, warnings } = validateLesson(lesson);
      if (!errors.length) { send({ t: "done", lesson, attempts: attempt, warnings }); return; }
      lastErrors = errors;
    }
    console.log(`lesson generation: attempt ${attempt} failed checks:`, lastErrors.slice(0, 3).join(" | ").slice(0, 400));
    if (attempt < MAX_ATTEMPTS) send({ t: "stage", stage: "fixing", label: `Fixing a problem (attempt ${attempt + 1} of ${MAX_ATTEMPTS})`, detail: fixingDetail(lastErrors), attempt: attempt + 1 });
    messages.push({ role: "assistant", content: msg.content });
    messages.push({ role: "user", content: repairRequest(lastErrors) });
  }
  send({ t: "error", error: "The lesson didn't pass the engine's checks after several tries.", details: lastErrors });
}

/** Quick first step: which engine fits the request? Defaults to the general model engine if anything goes wrong. */
async function chooseEngine(client: Anthropic, request: string): Promise<Engine> {
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: ENGINE_SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(EngineChoice) },
    messages: [{ role: "user", content: request }],
  });
  const text = msg.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
  try { return EngineChoice.parse(JSON.parse(text)).engine; } catch { return "model"; }
}
