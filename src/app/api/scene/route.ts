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
const Choice = z.object({ scene: z.enum(["circuits", "wing", "magnets", "induction", "battery", "other"]) });
const _check: readonly (SceneId | "other")[] = Choice.shape.scene.options; void _check; // stays in step with SCENES
const SYSTEM = `You route a teacher's or student's request to one of these interactive science simulations, or "other" if none fits well.
${Object.values(SCENES).map(s => `- ${s.id}: ${s.blurb}`).join("\n")}
Pick the one a teacher would open to teach this. Requests about planes, flight or birds flying go to wing; generators and making electricity from motion go to induction; cells, electrolysis and electrochemistry go to battery. Reply with the choice only.`;

export async function POST(req: Request) {
  if (!(await hasAccess((await cookies()).get(ACCESS_COOKIE)?.value))) return Response.json({ error: "Enter the access code first." }, { status: 401 });
  const body = await req.json().catch(() => null) as { request?: unknown } | null;
  const request = typeof body?.request === "string" ? body.request.trim().slice(0, 1500) : "";
  if (!request) return Response.json({ scene: "other" });

  const quick = matchScene(request);
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
      messages: [{ role: "user", content: request }],
    });
    const text = msg.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
    return Response.json({ scene: Choice.parse(JSON.parse(text)).scene, via: "model" });
  } catch (e) {
    console.error("scene routing failed", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return Response.json({ scene: "other" });
  }
}
