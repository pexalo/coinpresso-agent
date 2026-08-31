import { NextResponse } from "next/server";
import {
  PORTAL_COOKIE,
  PORTAL_COOKIE_MAX_AGE,
  portalConfigured,
  roleForPasscode,
  tokenFor,
} from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!portalConfigured()) {
    return NextResponse.json(
      { error: "No passcode is configured on this deployment." },
      { status: 503 }
    );
  }
  let body: { passcode?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const role = roleForPasscode(body.passcode ?? "");
  if (!role) {
    // A short, fixed delay blunts brute force without needing a rate limiter
    // for a two-passcode pilot gate.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "That passcode is not right." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(PORTAL_COOKIE, tokenFor(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PORTAL_COOKIE_MAX_AGE,
  });
  return res;
}
