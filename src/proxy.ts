import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";

/**
 * Pages open straight away. Only the endpoints that spend money on the model
 * need the access code; the prompt box asks for it the first time it's needed.
 */
export async function proxy(req: NextRequest) {
  if (await hasAccess(req.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.json({ error: "Enter the access code first.", needsCode: true }, { status: 401 });
}

export const config = {
  // Every API route except the one that checks the code.
  matcher: ["/api/((?!access).*)"],
};
