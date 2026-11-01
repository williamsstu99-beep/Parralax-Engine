import { ACCESS_COOKIE, ACCESS_MAX_AGE, accessCode, accessToken } from "@/lib/access";

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
