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
    // TENANT CONFINEMENT.
    //
    // This deployment belongs to one client. The client list at "/" and every
    // /client/<ref> route are Pexalo's HQ surface, and serving them to a
    // signed-in client shows them who else Pexalo works with and what those
    // firms bought. Deleting the other client's record would hide it only
    // until the next one is added, so the rule lives here instead: with
    // PORTAL_CLIENT_REF set, a client-role session can reach exactly one
    // workspace and nothing else.
    //
    // Enforced in the proxy rather than per page because it has to cover the
    // API too — a workspace whose pages are blocked but whose /api/clients/...
    // routes answer is not confined, it is merely inconvenient to browse.
    //
    // The env var is read directly rather than imported: proxy runs ahead of
    // the app and should not depend on its modules.
    const only = process.env.PORTAL_CLIENT_REF?.trim();
    if (only && role !== "admin") {
      const scoped =
        pathname.match(/^\/client\/([^/]+)/) ??
        pathname.match(/^\/api\/clients\/([^/]+)/);
      if (scoped && decodeURIComponent(scoped[1]) !== only) {
        // 404, not 403. "You may not see this" still confirms it exists.
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const home = req.nextUrl.clone();
        home.pathname = `/client/${only}`;
        home.search = "";
        return NextResponse.redirect(home);
      }
    }

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
