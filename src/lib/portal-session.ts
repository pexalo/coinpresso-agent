// The request-bound half of the portal login: what role is THIS request?
// Split from portal-auth.ts because next/headers cannot be imported by proxy.ts.

import { cookies } from "next/headers";
import { PORTAL_COOKIE, portalConfigured, roleFromToken, type PortalRole } from "./portal-auth";

/**
 * The signed-in role, for server components and route handlers.
 *
 * Unconfigured in development means everyone is admin — it is the developer's
 * own machine. Unconfigured in production never reaches here, because proxy.ts
 * refuses the request first; the null is defensive.
 */
export async function currentRole(): Promise<PortalRole | null> {
  if (!portalConfigured()) {
    return process.env.NODE_ENV === "production" ? null : "admin";
  }
  const jar = await cookies();
  return roleFromToken(jar.get(PORTAL_COOKIE)?.value);
}

export async function isAdmin(): Promise<boolean> {
  return (await currentRole()) === "admin";
}
