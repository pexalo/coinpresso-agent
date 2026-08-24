import { NextResponse } from "next/server";
import { defaultCampaign, getClient, hasModule } from "@/lib/clients";
import { mockMode } from "@/lib/models";
import { mockIdeas, runIdeas } from "@/lib/agents/ideas";
import { resolveCampaign } from "@/lib/campaign-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      return NextResponse.json({ ideas: await mockIdeas(request), mock: true });
    }
    const r = await runIdeas(request);
    return NextResponse.json({
      ideas: r.ideas,
      mock: false,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
