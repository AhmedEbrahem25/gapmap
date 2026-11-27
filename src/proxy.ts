import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession, homeFor } from "@/lib/session";

const areas: Record<string, string[]> = {
  "/instructor": ["instructor", "ta", "admin"],
  "/student": ["student"],
  "/coordinator": ["coordinator", "admin"],
  "/company": ["company"],
};

/** Optimistic check only. Pages re-check the role with requireRole(). */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  // Clear a session whose user no longer exists, then continue on a clean /login.
  if (pathname === "/login" && request.nextUrl.searchParams.has("expired")) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }

  const area = Object.keys(areas).find((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!area) return NextResponse.next();
  if (!session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (!areas[area]!.includes(session.role)) {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/instructor/:path*", "/student/:path*", "/coordinator/:path*", "/company/:path*"],
};
