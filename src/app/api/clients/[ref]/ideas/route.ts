import { NextResponse } from "next/server";
import { defaultCampaign, getClient, hasModule } from "@/lib/clients";
import { mockMode, MODELS } from "@/lib/models";
import { recordSpend } from "@/lib/spend-log";
import { usageOf } from "@/lib/providers/anthropic";
import { mockIdeas, runIdeas } from "@/lib/agents/ideas";
import { resolveCampaign } from "@/lib/campaign-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A market scan runs a dozen searches before it proposes anything. */
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "crypto-pr")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: { count?: number; steer?: string; campaignId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const campaignId = body.campaignId ?? defaultCampaign(client)?.id;
  const campaign = campaignId ? await resolveCampaign(ref, campaignId) : null;
  if (!campaign) {
    return NextResponse.json({ error: "No campaign" }, { status: 400 });
  }

  // Capped: past about thirty the proposals start repeating each other, and the
  // operator cannot meaningfully review a longer list in one sitting.
  const count = Math.min(Math.max(body.count ?? 10, 1), 30);

  const request = {
    campaignId: campaign.id,
    campaignName: campaign.name,
    ticker: campaign.ticker,
    count,
    steer: body.steer,
  };

  try {
    if (mockMode()) {
      const m = await mockIdeas(request);
      return NextResponse.json({ ...m, mock: true });
    }
    const r = await runIdeas(request);

    // The scan is the most search-heavy call in the system and produces no run,
    // so without this line it costs real money that appears nowhere. Recorded
    // before the response so a closed tab cannot lose the spend.
    await recordSpend(ref, {
      kind: "ideas-scan",
      model: MODELS.strategy,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      searchRequests: r.searchRequests,
    });

    return NextResponse.json({
      topics: r.topics,
      ideas: r.ideas,
      searchUrls: r.searchUrls,
      mock: false,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    });
  } catch (e) {
    // Billed but unparseable — searches included. See the blog-ideas route.
    const u = usageOf(e);
    if (u) {
      await recordSpend(ref, {
        kind: "ideas-scan",
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
