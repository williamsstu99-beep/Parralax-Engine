import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EngineChoice, LESSON_FORMATS, LessonSpec, type Engine, type Lesson } from "@/engine/spec/lesson";
import { ENGINE_SYSTEM, LESSON_SYSTEM, lessonRequest, repairRequest } from "@/engine/spec/prompt";
import { validateLesson } from "@/engine/spec/validate";
import { lessonFromGen } from "@/engine/spec/motion";

export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
const MAX_ATTEMPTS = 3;

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
  let lastErrors: string[] = [];

  try {
    const engine = await chooseEngine(client, request);
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: lessonRequest(request, engine) }];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: LESSON_SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "medium", format: betaZodOutputFormat(LESSON_FORMATS[engine]) },
        messages,
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") return Response.json({ error: "That request couldn't be turned into a lesson. Try rephrasing it." }, { status: 422 });
      if (msg.stop_reason === "max_tokens") lastErrors = ["the lesson was too long and got cut off; make it shorter"];

      const text = msg.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
      let lesson: Lesson | null = null;
      try {
        const parsed = LessonSpec.safeParse(lessonFromGen(JSON.parse(text)));
        if (parsed.success) lesson = parsed.data;
        else lastErrors = parsed.error.issues.slice(0, 10).map(i => `${i.path.join(".")}: ${i.message}`);
      } catch {
        if (msg.stop_reason !== "max_tokens") lastErrors = ["the response wasn't valid JSON"];
      }

      if (lesson) {
        const { errors, warnings } = validateLesson(lesson);
        if (!errors.length) return Response.json({ lesson, attempts: attempt, warnings });
        lastErrors = errors;
      }
      messages.push({ role: "assistant", content: msg.content });
      messages.push({ role: "user", content: repairRequest(lastErrors) });
    }
    return Response.json({ error: "The lesson didn't pass the engine's checks after several tries.", details: lastErrors }, { status: 422 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "The API key was rejected. Check PARALLAX_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY)." }, { status: 500 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Too many requests right now. Try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.APIError) {
      console.error("lesson generation: API error", e.status, e.message);
      return Response.json({ error: `The AI service returned an error (${e.status}).` }, { status: 502 });
    }
    throw e;
  }
}

/** Quick first step: which engine fits the request? Defaults to circuits if anything goes wrong. */
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
  try { return EngineChoice.parse(JSON.parse(text)).engine; } catch { return "circuits"; }
}
