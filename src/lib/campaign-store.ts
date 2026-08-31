// ---------------------------------------------------------------------------
// Campaign fact sheet overrides.
//
// The seed values in clients.ts are a starting point; the live figure changes
// daily and is set by a person. Overrides live here so that updating "raised"
// does not mean editing source and redeploying.
//
// In HQ this is a `campaign_facts` table with an audit trail — who changed the
// number and when is the whole point, because a wrong presale figure on a
// newswire is traced back to a person, not to a model.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";
import {
  getClient,
  type Campaign,
  type CampaignFacts,
} from "./clients";

const DIR = dataDir("campaign-facts");

function keyFor(clientRef: string, campaignId: string): string {
  return path.join(DIR, `${clientRef}__${campaignId}.json`);
}

async function readOverride(
  clientRef: string,
  campaignId: string
): Promise<CampaignFacts | null> {
  try {
    const raw = await fs.readFile(keyFor(clientRef, campaignId), "utf8");
    return JSON.parse(raw) as CampaignFacts;
  } catch {
    return null;
  }
}

export async function writeFacts(
  clientRef: string,
  campaignId: string,
  facts: CampaignFacts
): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(
    keyFor(clientRef, campaignId),
    JSON.stringify(facts, null, 2),
    "utf8"
  );
}

/** Seed campaign merged with any stored fact-sheet override. */
export async function resolveCampaign(
  clientRef: string,
  campaignId: string
): Promise<Campaign | null> {
  const client = getClient(clientRef);
  if (!client) return null;
  const seed = client.campaigns.find((c) => c.id === campaignId);
  if (!seed) return null;
  const override = await readOverride(clientRef, campaignId);
  return override ? { ...seed, facts: override } : seed;
}

export async function resolveCampaigns(clientRef: string): Promise<Campaign[]> {
  const client = getClient(clientRef);
  if (!client) return [];
  return Promise.all(
    client.campaigns.map(
      async (c) => (await resolveCampaign(clientRef, c.id)) ?? c
    )
  );
}
