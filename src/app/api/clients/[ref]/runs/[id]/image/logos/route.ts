import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { roundupLogos, safeDomain, domainCandidates } from "@/lib/roundup-logos";
import { platformLogos } from "@/lib/platform-logos";

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
  if (!domainParam) {
    // Fill in the domains the research did not give us by trying the obvious
    // ones — "Victoria Olsina" → victoriaolsina.com, .io, .co — and keeping
    // the first that answers. Only four of the seven GEO-roundup entries had
    // a domain the first time, so only one logo reached the image.
    const out = roundupLogos(run);
    // Not a roundup: the platforms the post is about (ChatGPT, Gemini…),
    // composited the same way. Bernard, 6 Oct.
    if (!out.roundup) {
      return NextResponse.json({ ...out, platforms: platformLogos(run.draft?.headline ?? run.brief.title) });
    }
    await Promise.all(
      out.entries.map(async (e) => {
        if (e.ours || e.domain) return;
        e.domain = (await findDomain(e.name)) ?? "";
      })
    );
    return NextResponse.json(out);
  }

  const domain = safeDomain(domainParam);
  if (!domain) return NextResponse.json({ error: "Not a domain" }, { status: 400 });

  // The company's own published mark, sharpest first: the 180px icon a site
  // publishes for phones, then the largest size Google's favicon service
  // holds. Nothing is redrawn.
  const isImage = (r: Response | null) =>
    Boolean(r && r.ok && /^image\//.test(r.headers.get("content-type") ?? ""));
  let upstream: Response | null = null;
  for (const src of [
    `https://${domain}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
  ]) {
    const r = await fetch(src, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (isImage(r)) {
      upstream = r;
      break;
    }
  }
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

/** The first candidate domain that serves a web page, or null. */
async function findDomain(name: string): Promise<string | null> {
  for (const d of domainCandidates(name)) {
    const ok = await fetch(`https://${d}`, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5000) })
      .then((r) => r.ok || (r.status >= 300 && r.status < 400))
      .catch(() => false);
    if (ok) return d;
  }
  return null;
}
