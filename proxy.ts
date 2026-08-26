import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/webhooks", "/api/cron", "/api/public"];

/**
 * Request guard: everything except the login page and the secret-protected
 * machine endpoints (webhooks, cron) requires a valid session cookie.
 */
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Preview deployments are protected by Vercel Authentication at the
  // project edge. Production never takes this branch and keeps app auth.
  if (process.env.VERCEL_ENV === "preview") {
    return NextResponse.next();
  }

  const token = req.cookies.get("ffrm_session")?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      return NextResponse.next();
    } catch {
      // fall through to redirect
    }
  }

  if (pathname.startsWith("/api/")) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Framework assets, RSC/HMR and WebSocket upgrade paths must bypass auth.
  // User/application routes and every /api/* route remain protected below.
  matcher: ["/((?!_next/|favicon.ico|icon.svg).*)"],
};
