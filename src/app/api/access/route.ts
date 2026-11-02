import { cookies } from "next/headers";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, accessCode, accessToken, hasAccess } from "@/lib/access";

/** Has this browser already entered the code? Lets the page ask for it up front. */
export async function GET() {
  return Response.json({ ok: await hasAccess((await cookies()).get(ACCESS_COOKIE)?.value) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (code !== accessCode()) {
    await new Promise(r => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "That code isn't right." }, { status: 401 });
  }
  const res = Response.json({ ok: true });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.headers.append("set-cookie", `${ACCESS_COOKIE}=${await accessToken()}; Path=/; Max-Age=${ACCESS_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`);
  return res;
}
