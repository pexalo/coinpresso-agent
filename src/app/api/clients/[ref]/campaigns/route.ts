import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { resolveCampaigns, resolveCampaign, writeFacts } from "@/lib/campaign-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "crypto-pr")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  return NextResponse.json(await resolveCampaigns(ref));
}

/** Update one campaign's fact sheet. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "crypto-pr")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: {
    campaignId?: string;
    raised?: string;
    stage?: string;
    tokenPrice?: string;
    updatedBy?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const campaign = body.campaignId
    ? await resolveCampaign(ref, body.campaignId)
    : null;
  if (!campaign) {
    return NextResponse.json({ error: "Unknown campaign" }, { status: 404 });
  }

  const facts = {
    raised: (body.raised ?? campaign.facts.raised).trim(),
    stage: (body.stage ?? campaign.facts.stage).trim(),
    tokenPrice: (body.tokenPrice ?? campaign.facts.tokenPrice).trim(),
    updatedAt: new Date().toISOString().slice(0, 10),
    // Who set the number is the point of the record. Wire this to the session
    // user when HQ auth is in place.
    updatedBy: (body.updatedBy || "unknown").trim(),
  };

  await writeFacts(ref, campaign.id, facts);
  return NextResponse.json({ ...campaign, facts });
}
