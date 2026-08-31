// ---------------------------------------------------------------------------
// Portal login — a shared passcode, two roles.
//
// This exists because the app had NO authentication and was about to get a
// public URL. Its settings page holds a WordPress application password and a
// Telegram bot token; the costs page holds the whole programme's spend. Until
// Pexalo HQ fronts /client/coinpresso with its own portal login, this is what
// stands between those and anyone who guesses the hostname.
//
// TWO PASSCODES, TWO ROLES.
//
//   PORTAL_PASSCODE        → "client"  Coinpresso's team: Elena, Liam. Everything
//                                      they need to plan, approve and publish.
//   PORTAL_ADMIN_PASSCODE  → "admin"   Pexalo. Same dashboard, plus the things
//                                      a client should not see in their own
//                                      tool — the re-billing figure with
//                                      Pexalo's margin on it, above all.
//
// The role rides in a signed cookie. The signature is an HMAC over a constant,
// keyed by PORTAL_SECRET (or, failing that, by the passcodes themselves), so a
// cookie cannot be forged without knowing a passcode, and rotating a passcode
// invalidates every session issued under it. There is no user table and no
// session store: this is a pilot gate for one client, and it is meant to be
// replaced by HQ's session, not grown into an auth system.
//
// UNCONFIGURED: in development the gate is open and every visitor is "admin" —
// it is Bernard's laptop. In production, proxy.ts refuses to serve at all.
// An accidentally public deployment with no passcode set fails loudly rather
// than quietly exposing everything.
//
// This module is imported by proxy.ts, so it must stay free of anything that
// only works inside a rendered request (no next/headers). See portal-session.ts
// for the request-bound half.
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from "node:crypto";

export type PortalRole = "client" | "admin";

export const PORTAL_COOKIE = "pexalo_portal";

/** Thirty days. A pilot gate on a tool people open every working day. */
export const PORTAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function portalConfigured(): boolean {
  return Boolean(
    process.env.PORTAL_PASSCODE?.trim() || process.env.PORTAL_ADMIN_PASSCODE?.trim()
  );
}

function secret(): string {
  return (
    process.env.PORTAL_SECRET?.trim() ||
    `${process.env.PORTAL_PASSCODE ?? ""}|${process.env.PORTAL_ADMIN_PASSCODE ?? ""}`
  );
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function signature(role: PortalRole): string {
  return createHmac("sha256", secret()).update(`portal-v1:${role}`).digest("hex");
}

/** The cookie value for a role. */
export function tokenFor(role: PortalRole): string {
  return `${role}.${signature(role)}`;
}

/** The role a cookie value proves, or null if it proves nothing. */
export function roleFromToken(token: string | undefined | null): PortalRole | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const role = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (role !== "client" && role !== "admin") return null;
  return safeEqual(sig, signature(role)) ? role : null;
}

/**
 * Which role a submitted passcode earns. Admin is checked first so that if
 * someone sets both passcodes to the same string, the result is the more
 * capable role rather than a coin toss — and that misconfiguration is visible.
 */
export function roleForPasscode(passcode: string): PortalRole | null {
  const admin = process.env.PORTAL_ADMIN_PASSCODE?.trim();
  const client = process.env.PORTAL_PASSCODE?.trim();
  const given = passcode.trim();
  if (!given) return null;
  if (admin && safeEqual(given, admin)) return "admin";
  if (client && safeEqual(given, client)) return "client";
  return null;
}
