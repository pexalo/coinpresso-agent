import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { roundupLogos, safeDomain } from "@/lib/roundup-logos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET                → the roundup's companies and their guessed domains.
 * GET ?domain=x.com  → that company's logo, fetched from its own site and
 *                      served from here so the canvas can draw it (a
 *                      cross-origin image would taint the canvas and the
 *                      finished image could not be saved).
 */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string; id: string }> }) {
  const { ref, id } = await params;
  const run = await getRun(id, ref);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const domainParam = new URL(req.url).searchParams.get("domain");
  if (!domainParam) return NextResponse.json(roundupLogos(run));

  const domain = safeDomain(domainParam);
  if (!domain) return NextResponse.json({ error: "Not a domain" }, { status: 400 });

  // The site's own icon at the largest size Google's favicon service holds.
  // It is the mark the company publishes for itself; nothing is redrawn.
  const upstream = await fetch(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
    { signal: AbortSignal.timeout(10_000) }
  ).catch(() => null);
  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: `No logo found for ${domain}` }, { status: 404 });
  }
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  return new NextResponse(bytes, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/png",
      "cache-control": "private, max-age=86400",
    },
  });
}
