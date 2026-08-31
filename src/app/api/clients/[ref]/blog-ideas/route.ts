import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { mockMode, MODELS } from "@/lib/models";
import { recordSpend } from "@/lib/spend-log";
import { usageOf } from "@/lib/providers/anthropic";
import { mockBlogIdeas, runBlogIdeas } from "@/lib/agents/blog-ideas";
import { listSeeds } from "@/lib/blog-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: {
    count?: number;
    pillar?: string;
    steer?: string;
    /** Which queued seed topics to include. Absent means all of them. */
    seedIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Eight is the top of the stated cadence and also the practical ceiling: a day
  // planned beyond it stops spreading across pillars and starts repeating.
  const count = Math.min(Math.max(body.count ?? 6, 1), 8);

  // Seeds are read from the store, NOT taken from the request body. The client
  // sends ids and nothing else, so a topic's text, keywords and notes are always
  // the ones actually saved — and a topic already marked written cannot be
  // replayed into a plan by a stale page.
  const stored = await listSeeds(ref);
  const queued = stored.topics.filter((t) => t.status === "queued");
  const wanted = body.seedIds
    ? queued.filter((t) => body.seedIds!.includes(t.id))
    : queued;

  // A day cannot be more seeds than posts. Taking the oldest first means a topic
  // that has been waiting longest gets written first rather than being pushed
  // back every day by whatever was added this morning.
  const seeds = [...wanted]
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .slice(0, count);

  const request = {
    clientRef: ref,
    count,
    pillar: body.pillar,
    steer: body.steer,
    seeds,
    standingKeywords: stored.standingKeywords,
  };

  try {
    if (mockMode()) {
      return NextResponse.json({
        ideas: await mockBlogIdeas(request),
        seedsUsed: seeds.length,
        seedsDeferred: wanted.length - seeds.length,
        missingSeedIds: [],
        mock: true,
      });
    }
    const r = await runBlogIdeas(request);

    // Off-run spend: the planner produces no run, so its cost has to be
    // recorded here or nowhere.
    await recordSpend(ref, {
      kind: "blog-plan",
      model: MODELS.strategy,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    });

    return NextResponse.json({
      ideas: r.ideas,
      seedsUsed: seeds.length,
      seedsDeferred: wanted.length - seeds.length,
      missingSeedIds: r.missingSeedIds,
      mock: false,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    });
  } catch (e) {
    // A reply that arrived and could not be parsed was still billed. Recording
    // it here is the difference between a ledger that says what the month cost
    // and one that only counts the calls that happened to work — which is how a
    // balance drains to zero while the dashboard reads $0.00.
    const u = usageOf(e);
    if (u) {
      await recordSpend(ref, {
        kind: "blog-plan",
        model: MODELS.strategy,
        tokensIn: u.tokensIn,
        tokensOut: u.tokensOut,
        searchRequests: u.searchRequests,
      });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
