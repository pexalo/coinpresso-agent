import { NextResponse } from "next/server";
import { executeRun, newRun } from "@/lib/pipeline";
import { listRuns, newRunId, saveRun } from "@/lib/store";
import { PUBLICATIONS } from "@/lib/publications";
import { getClient, hasModule } from "@/lib/clients";
import type { Brief, PublicationId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every request is gated twice: the client must exist, and it must have the
 * module enabled. A client without `crypto-pr` gets a 404 from this endpoint
 * even if they guess the URL — module entitlement is authorisation, not just a
 * navigation hint.
 */
function gate(ref: string) {
  const client = getClient(ref);
  if (!client) {
    return { error: NextResponse.json({ error: "Unknown client" }, { status: 404 }) };
  }
  if (!hasModule(client, "crypto-pr")) {
    return {
      error: NextResponse.json(
        { error: "This client does not have the Crypto PR module" },
        { status: 404 }
      ),
    };
  }
  return { client };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const g = gate(ref);
  if (g.error) return g.error;

  const runs = await listRuns(ref);
  return NextResponse.json(
    runs.map((r) => ({
      id: r.id,
      clientRef: r.clientRef,
      campaignId: r.campaignId,
      createdAt: r.createdAt,
      status: r.status,
      brief: r.brief,
      revisions: r.revisions,
      mock: r.mock,
      totalCostUsd: r.totalCostUsd,
      verdict: r.review?.verdict ?? null,
      linkCheckPassed: r.linkCheck?.passed ?? null,
      wordCount: r.draft?.wordCount ?? null,
      stages: r.stages.map((s) => ({ id: s.id, status: s.status })),
    }))
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const g = gate(ref);
  if (g.error) return g.error;
  const client = g.client!;

  let payload: Partial<Brief> & { campaignId?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = (payload.title || "").trim();
  const keywords = (payload.keywords || [])
    .map((k) => String(k).trim())
    .filter(Boolean);
  const publication = payload.publication as PublicationId;

  if (!title) {
    return NextResponse.json({ error: "A title is required" }, { status: 400 });
  }
  if (!keywords.length) {
    return NextResponse.json(
      { error: "At least one target keyword is required" },
      { status: 400 }
    );
  }
  if (!publication || !PUBLICATIONS[publication]) {
    return NextResponse.json(
      { error: "A known publication is required" },
      { status: 400 }
    );
  }

  const campaignId =
    payload.campaignId && client.campaigns?.some((c) => c.id === payload.campaignId)
      ? payload.campaignId
      : client.campaigns?.[0]?.id;

  const brief: Brief = {
    title,
    keywords,
    publication,
    presaleRaised: payload.presaleRaised?.trim() || undefined,
    presaleStage: payload.presaleStage?.trim() || undefined,
    notes: payload.notes?.trim() || undefined,
  };

  const run = newRun(newRunId(), ref, brief, campaignId);
  await saveRun(run);

  // Kick the pipeline off without holding the request open. The dashboard polls
  // the run, so the browser never waits on a multi-minute agent chain.
  void executeRun(run).catch(async (e) => {
    run.status = "failed";
    const s = run.stages.find((x) => x.status === "running");
    if (s) {
      s.status = "failed";
      s.error = e instanceof Error ? e.message : String(e);
    }
    await saveRun(run);
  });

  return NextResponse.json({ id: run.id }, { status: 201 });
}
