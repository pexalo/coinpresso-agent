import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { mockMode, MODELS } from "@/lib/models";
import { recordSpend } from "@/lib/spend-log";
import { usageOf } from "@/lib/providers/anthropic";
import { listSeeds } from "@/lib/blog-seed";
import { mockSuggestTopics, suggestTopics } from "@/lib/agents/topic-suggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Propose topics for the queue. Proposes only — nothing is saved here.
 *
 * The spend is logged because this is a model call that produces no run, which
 * is precisely the category the cost page was silently missing before the audit.
 * A feature people press repeatedly and that appears in no figure is how a bill
 * grows without anybody being able to point at it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: { count?: number; pillar?: string; steer?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Twelve is the ceiling. Past that the set stops being a considered extension
  // of the queue and becomes a list to skim, which is how forty near-identical
  // topics get accepted in one click.
  const count = Math.min(Math.max(body.count ?? 8, 1), 12);

  const seeds = await listSeeds(ref);
  const request = {
    clientRef: ref,
    count,
    pillar: body.pillar,
    steer: body.steer,
    existing: seeds.topics,
  };

  if (mockMode()) {
    return NextResponse.json({
      topics: await mockSuggestTopics(request),
      mock: true,
    });
  }

  try {
    const r = await suggestTopics(request);
    const spend = await recordSpend(ref, {
      kind: "topic-suggest",
      model: MODELS.strategy,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      searchRequests: r.searchRequests,
    });
    return NextResponse.json({
      topics: r.topics,
      mock: false,
      costUsd: spend.totalUsd,
    });
  } catch (e) {
    // Billed but unparseable — see the note in the blog-ideas route.
    const u = usageOf(e);
    if (u) {
      await recordSpend(ref, {
        kind: "topic-suggest",
        model: MODELS.strategy,
        tokensIn: u.tokensIn,
        tokensOut: u.tokensOut,
        searchRequests: u.searchRequests,
      });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
