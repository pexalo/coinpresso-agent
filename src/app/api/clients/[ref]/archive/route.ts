import { NextResponse } from "next/server";
import { defaultCampaign, getClient, hasModule } from "@/lib/clients";
import {
  allArticles,
  bulkImport,
  deleteArticle,
  fetchArticleText,
  parseBulk,
  upsertArticle,
  type StoredArticle,
} from "@/lib/archive-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate(ref: string, campaignParam: string | null) {
  const client = getClient(ref);
  if (!client || !hasModule(client, "crypto-pr")) return null;
  const campaignId =
    (campaignParam &&
      client.campaigns.find((c) => c.id === campaignParam)?.id) ||
    defaultCampaign(client)?.id;
  return campaignId ?? null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const url = new URL(req.url);
  const campaignId = await gate(ref, url.searchParams.get("campaign"));
  if (!campaignId) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  const rows = await allArticles(campaignId);
  // The list view does not need every body; send a flag and a short excerpt.
  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      hasBody: Boolean(r.body),
      excerpt: r.body ? r.body.slice(0, 220) : undefined,
      body: undefined,
    }))
  );
}

/** Add or update an article. Either paste `body`, or give `url` to fetch it. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const url = new URL(req.url);
  const campaignId = await gate(ref, url.searchParams.get("campaign"));
  if (!campaignId) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let payload: Partial<StoredArticle> & {
    fetchFromUrl?: boolean;
    bulkText?: string;
    kind?: "own" | "competitor";
    competitor?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Bulk paste: titles and keywords for the whole back catalogue in one go.
  if (payload.bulkText) {
    const kind = payload.kind === "competitor" ? "competitor" : "own";
    const rows = parseBulk(payload.bulkText, kind);
    if (!rows.length) {
      return NextResponse.json(
        { error: "No rows parsed. One article per line: title | keywords | wire | date | angle | url" },
        { status: 400 }
      );
    }
    if (payload.competitor) {
      rows.forEach((r) => (r.competitor = payload.competitor));
    }
    const result = await bulkImport(campaignId, rows, kind);
    return NextResponse.json({ bulk: true, ...result, parsed: rows.length });
  }

  let body = payload.body?.trim() ?? "";
  let title = payload.title?.trim() ?? "";
  let source: StoredArticle["source"] = body ? "paste" : "fetch";

  if (!body && payload.fetchFromUrl && payload.url) {
    const fetched = await fetchArticleText(payload.url);
    if (!fetched.ok) {
      return NextResponse.json(
        { error: fetched.detail ?? "Could not read that page." },
        { status: 422 }
      );
    }
    body = fetched.body ?? "";
    if (!title && fetched.title) title = fetched.title;
    source = "fetch";
  }

  if (!title) {
    return NextResponse.json({ error: "A title is required" }, { status: 400 });
  }

  const record = await upsertArticle(campaignId, {
    kind: payload.kind === "competitor" ? "competitor" : "own",
    competitor: payload.competitor,
    publishedAt:
      payload.publishedAt?.trim() || new Date().toISOString().slice(0, 10),
    publication: payload.publication ?? "openpr",
    title,
    keywords: (payload.keywords ?? []).map((k) => String(k).trim()).filter(Boolean),
    url: payload.url?.trim() || undefined,
    angle: payload.angle?.trim() || "Unclassified",
    body: body || undefined,
    source,
    id: payload.id,
  });

  return NextResponse.json({
    ...record,
    hasBody: Boolean(record.body),
    body: undefined,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const url = new URL(req.url);
  const campaignId = await gate(ref, url.searchParams.get("campaign"));
  const id = url.searchParams.get("id");
  if (!campaignId || !id) {
    return NextResponse.json({ error: "Missing campaign or id" }, { status: 400 });
  }
  await deleteArticle(campaignId, id);
  return NextResponse.json({ ok: true });
}
