// ---------------------------------------------------------------------------
// The front door. Every page and API route passes through here first.
//
// Unauthenticated pages redirect to /login; unauthenticated API calls get a
// 401 rather than a redirect, because a fetch() following a redirect to an
// HTML page is how the dashboard would show "Unexpected token <" instead of
// "sign in". Three things stay open on purpose:
//
//   /login and /api/auth   — or nobody could ever get in
//   /api/health            — Railway's healthcheck has no cookie, and the
//                            route exposes provenance (which env var a key
//                            came from), never a value
//   static assets          — anything with a file extension, plus /_next
//
// See src/lib/portal-auth.ts for the roles and the unconfigured behaviour.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { PORTAL_COOKIE, portalConfigured, roleFromToken } from "@/lib/portal-auth";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!portalConfigured()) {
    if (process.env.NODE_ENV === "production") {
      // Loud, not quiet. A public deployment with no passcode is the one state
      // this file exists to prevent, so it does not degrade into "open".
      return new NextResponse(
        "This dashboard has no login configured. Set PORTAL_PASSCODE (and PORTAL_ADMIN_PASSCODE) in the deployment and redeploy.",
        { status: 503, headers: { "content-type": "text/plain" } }
      );
    }
    return NextResponse.next();
  }

  const role = roleFromToken(req.cookies.get(PORTAL_COOKIE)?.value);
  if (role) {
    // Carried as a header so server components could read it without
    // re-verifying; currentRole() re-verifies anyway, this is a convenience.
    const res = NextResponse.next();
    res.headers.set("x-portal-role", role);
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except: the login page, the auth routes, the healthcheck,
  // Next's own assets, and any path that looks like a file (has an extension).
  matcher: ["/((?!login|api/auth|api/health|_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
