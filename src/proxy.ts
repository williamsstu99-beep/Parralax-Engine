import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";

/** Everything except the code page itself needs the access cookie. */
export async function proxy(req: NextRequest) {
  if (await hasAccess(req.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Enter the access code first." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/enter-code";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip the code page, the endpoint that checks the code, Next's own assets and public files.
  matcher: ["/((?!enter-code|api/access|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
