import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { cookies } from "next/headers";
import { z } from "zod";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { SCENES, matchScene, type SceneId } from "@/lib/scenes";

/**
 * Picks which hand-crafted simulation a request is about. Obvious requests
 * are matched by keyword instantly; anything else is a quick call to the
 * fastest model. "other" means none fits, so the page falls back to building
 * a general lesson.
 */

const MODEL = "claude-haiku-5-5";
const Choice = z.object({ scene: z.enum(["circuits", "hill", "wing", "plane", "pipe", "magnets", "induction", "battery", "fractions", "other"]) });
const _check: readonly (SceneId | "other")[] = Choice.shape.scene.options; void _check; // stays in step with SCENES
const SYSTEM = `You route a teacher's or student's request to one of these interactive science simulations, or "other" if none fits well.
${Object.values(SCENES).map(s => `- ${s.id} (${s.engine}): ${s.blurb}`).join("\n")}
Pick the one a teacher would open to teach this. How a wing or aerofoil makes lift, or why planes fly, goes to wing; forces on a whole aeroplane (thrust, drag, take-off) go to plane; fluids, pipes, Bernoulli, laminar or turbulent flow go to pipe; generators and making electricity from motion go to induction; cells, electrolysis and electrochemistry go to battery; voltage pictured as height or gravity goes to hill.
When the user is already looking at one simulation and asks to reimagine it or show it another way, pick a different one that shows the idea they describe. Reply with the choice only.`;

export async function POST(req: Request) {
  if (!(await hasAccess((await cookies()).get(ACCESS_COOKIE)?.value))) return Response.json({ error: "Enter the access code first." }, { status: 401 });
  const body = await req.json().catch(() => null) as { request?: unknown; from?: unknown; engine?: unknown } | null;
  const request = typeof body?.request === "string" ? body.request.trim().slice(0, 1500) : "";
  if (!request) return Response.json({ scene: "other" });
  const from = typeof body?.from === "string" && body.from in SCENES ? (body.from as SceneId) : undefined;
  const engine = body?.engine === "physics" || body?.engine === "maths" ? body.engine : from ? SCENES[from].engine : undefined;

  const quick = matchScene(request, from, engine);
  if (quick) return Response.json({ scene: quick, via: "keywords" });

  const apiKey = process.env.PARALLAX_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ scene: "other" });
  try {
    const client = new Anthropic({ apiKey, baseURL: process.env.PARALLAX_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com" });
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Choice) },
      messages: [{ role: "user", content: (engine ? `[${engine} engine: only pick a ${engine} simulation, or "other".] ` : "") + (from ? `I'm looking at the "${SCENES[from].title}" simulation (${from}). ${request}` : request) }],
    });
    const text = msg.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
    const scene = Choice.parse(JSON.parse(text)).scene;
    return Response.json({ scene: scene !== "other" && engine && SCENES[scene].engine !== engine ? "other" : scene, via: "model" });
  } catch (e) {
    console.error("scene routing failed", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return Response.json({ scene: "other" });
  }
}
