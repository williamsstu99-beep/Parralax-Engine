import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { cookies } from "next/headers";
import { z } from "zod";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { KIT_GUIDE } from "@/engine/kit/guide";

/**
 * Writes a scene script for the Parallax toolkit. The cheap model writes it;
 * the script is syntax-checked here (never run on the server) and fully
 * checked in the browser's sandbox. Repairs come back through `repair`.
 */

const MODEL = "claude-haiku-5-5";
const Out = z.object({ title: z.string(), summary: z.string(), code: z.string() });
const BANNED = /\b(document|window|globalThis|fetch|XMLHttpRequest|WebSocket|importScripts|localStorage|sessionStorage|indexedDB|setTimeout|setInterval|eval|Function)\b|\bimport\s*\(/;

/** Compile without running, to catch syntax errors and forbidden calls. */
function staticCheck(code: string): string | null {
  // Ignore words inside strings ("the window", "a document") when looking for forbidden calls.
  const m = code.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""').match(BANNED);
  if (m) return `The script uses "${m[0]}", which is not available. Use only world, show, ui, maths and fields.`;
  try { new Function("world", "show", "ui", "maths", "fields", code); }
  catch (e) { return `The script has a syntax error: ${(e as Error).message}`; }
  return null;
}

interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }

async function write(client: Anthropic, content: string, usage: Usage) {
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: KIT_GUIDE, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: betaZodOutputFormat(Out) },
    messages: [{ role: "user", content }],
  });
  usage.input += msg.usage.input_tokens; usage.output += msg.usage.output_tokens;
  usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0; usage.cacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
  if (msg.stop_reason === "refusal") throw new Error("refused");
  const text = msg.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
  return Out.parse(JSON.parse(text));
}

const repairPrompt = (request: string, code: string, errors: string[]) =>
  `Request: ${request}\n\nThis scene script failed the checks:\n${errors.map(e => `- ${e}`).join("\n")}\n\nScript:\n\`\`\`js\n${code}\n\`\`\`\n\nFix it so it passes, keeping the same idea.`;

export async function POST(req: Request) {
  if (!(await hasAccess((await cookies()).get(ACCESS_COOKIE)?.value))) return Response.json({ error: "Enter the access code first." }, { status: 401 });
  const body = await req.json().catch(() => null) as { request?: unknown; year?: unknown; repair?: { code?: unknown; errors?: unknown } } | null;
  const request = typeof body?.request === "string" ? body.request.trim().slice(0, 1200) : "";
  if (!request) return Response.json({ error: "Describe what you want to show." }, { status: 400 });
  const year = typeof body?.year === "string" ? body.year.slice(0, 20) : "";

  const apiKey = process.env.PARALLAX_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "The engine isn't connected to the AI yet." }, { status: 503 });
  const client = new Anthropic({ apiKey, baseURL: process.env.PARALLAX_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com" });

  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const started = Date.now();
  try {
    const repair = body?.repair;
    const first = repair && typeof repair.code === "string" && Array.isArray(repair.errors)
      ? repairPrompt(request, repair.code, repair.errors.filter((e): e is string => typeof e === "string").slice(0, 6))
      : `${year ? `${year}: ` : ""}${request}`;
    let out = await write(client, first, usage);
    let problem = staticCheck(out.code);
    if (problem) { out = await write(client, repairPrompt(request, out.code, [problem]), usage); problem = staticCheck(out.code); }
    if (problem) return Response.json({ error: "Couldn't build a working simulation for that. Try rewording it.", details: [problem], usage }, { status: 422 });
    const cost = (usage.input * 0.1 + usage.cacheWrite * 0.125 + usage.cacheRead * 0.01 + usage.output * 0.5) / 1e6;
    console.log(`generate: ${Date.now() - started} ms, ${JSON.stringify(usage)}, ~$${cost.toFixed(4)}`);
    return Response.json({ ...out, model: MODEL, usage, cost });
  } catch (e) {
    if (e instanceof Error && e.message === "refused") return Response.json({ error: "That request can't be turned into a simulation." }, { status: 422 });
    console.error("generate failed", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return Response.json({ error: "The engine couldn't write that one. Try again in a moment." }, { status: 502 });
  }
}
