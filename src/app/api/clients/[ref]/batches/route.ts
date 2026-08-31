import { NextResponse } from "next/server";
import { defaultCampaign, getClient, hasModule } from "@/lib/clients";
import { resolveCampaign } from "@/lib/campaign-store";
import { PUBLICATIONS } from "@/lib/publications";
import { CONTENT_TYPES, PILLARS } from "@/lib/blog";
import {
  executeBatch,
  listBatches,
  newBatch,
  newBatchId,
  progressOf,
  saveBatch,
} from "@/lib/batch";
import type { Brief, PublicationId } from "@/lib/types";
import type { ContentBrief } from "@/lib/content-brief";
import type { ContentTypeId } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The batch endpoint serves both tracks, so entitlement is checked against the
 * module that owns the track being asked for. A client with Crypto PR but not
 * the blog module gets a 404 on a blog batch even though the URL is the same.
 */
/**
 * Only http(s), and only if it parses.
 *
 * Both of these end up in a model prompt, and one of them is deliberately
 * described there as something the model must not cite. Letting an arbitrary
 * string through would put unparsed text in that position, which is the one
 * place a fabricated "URL" would be hardest to spot.
 */
function httpUrl(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function gate(ref: string, track: "wire" | "blog") {
  const client = getClient(ref);
  if (!client) return { error: "Unknown client" as const };
  const needed = track === "blog" ? "own-blog" : "crypto-pr";
  if (!hasModule(client, needed)) return { error: "Unknown client" as const };
  return { client };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const url = new URL(req.url);
  const track = url.searchParams.get("track") === "blog" ? "blog" : "wire";

  const g = gate(ref, track);
  if (g.error) return NextResponse.json({ error: g.error }, { status: 404 });

  const batches = await listBatches(ref);
  return NextResponse.json(
    batches
      .filter((b) => (b.track ?? "wire") === track)
      .map((b) => ({ ...b, progress: progressOf(b) }))
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;

  let body: {
    track?: "wire" | "blog";
    campaignId?: string;
    items?: Array<{
      title: string;
      keywords: string[];
      publication?: string;
      pillar?: string;
      contentType?: string;
      notes?: string;
      referenceUrl?: string;
      linkTarget?: string;
      contentBrief?: ContentBrief;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const track = body.track === "blog" ? "blog" : "wire";
  const g = gate(ref, track);
  if (g.error) return NextResponse.json({ error: g.error }, { status: 404 });
  const client = g.client!;

  const items = (body.items ?? []).filter((i) => i.title?.trim());
  if (!items.length) {
    return NextResponse.json({ error: "Nothing to generate" }, { status: 400 });
  }
  if (items.length > 20) {
    return NextResponse.json(
      { error: "Twenty per batch is the ceiling." },
      { status: 400 }
    );
  }

  let briefs: Brief[];
  let campaignId: string | undefined;

  if (track === "blog") {
    // No campaign, no fact sheet, no banned-claims block: this is Coinpresso's
    // own domain, and nothing on it is selling a token.
    briefs = items.map((i) => {
      const pillar = PILLARS.find((p) => p.id === i.pillar);
      const type = CONTENT_TYPES[i.contentType as ContentTypeId];
      return {
        title: i.title.trim(),
        keywords: i.keywords ?? [],
        publication: "openpr" as PublicationId, // unused on this track
        track: "blog" as const,
        pillar: pillar?.id,
        pillarHub: pillar?.hub,
        contentType: type?.id ?? "guide",
        notes: i.notes,
        referenceUrl: httpUrl(i.referenceUrl),
        linkTarget: httpUrl(i.linkTarget),
        contentBrief: i.contentBrief,
      };
    });
  } else {
    const wanted = body.campaignId ?? defaultCampaign(client)?.id;
    const campaign = wanted ? await resolveCampaign(ref, wanted) : null;
    campaignId = campaign?.id;

    // Every brief in the batch is stamped with the campaign facts as they stand
    // now, so a fact-sheet change mid-batch cannot make two articles disagree.
    briefs = items.map((i) => ({
      title: i.title.trim(),
      keywords: i.keywords ?? [],
      publication: (PUBLICATIONS[i.publication as PublicationId]
        ? i.publication
        : "openpr") as PublicationId,
      track: "wire" as const,
      notes: i.notes,
      presaleRaised: campaign?.facts.raised,
      presaleStage: campaign?.facts.stage,
      campaignId: campaign?.id,
      campaignName: campaign?.name,
      campaignTicker: campaign?.ticker,
      tokenPrice: campaign?.facts.tokenPrice,
      bannedClaims: campaign?.bannedClaims,
    }));
  }

  const batch = newBatch(newBatchId(), ref, briefs, campaignId, track);
  await saveBatch(batch);

  // Fire and forget — the page polls. A twenty-article batch runs for the better
  // part of half an hour and no browser should hold that request open.
  void executeBatch(batch, briefs).catch(async (e) => {
    batch.status = "failed";
    batch.items.forEach((i) => {
      if (i.status === "running" || i.status === "queued") {
        i.status = "failed";
        i.error = e instanceof Error ? e.message : String(e);
      }
    });
    await saveBatch(batch);
  });

  return NextResponse.json({ id: batch.id }, { status: 201 });
}
