import { notFound } from "next/navigation";
import CampaignBar from "@/components/CampaignBar";
import { CampaignProvider } from "@/components/CampaignContext";
import { getClient, hasModule } from "@/lib/clients";
import { resolveCampaigns } from "@/lib/campaign-store";

/**
 * Crypto PR is the module that has end clients, so this is where campaign
 * selection lives — not in the workspace header, where it sat above the blog
 * and the cost pages and meant nothing on either.
 *
 * The campaigns handed to the provider are RESOLVED, not the seed values from
 * the registry. Editing a fact sheet on the Campaigns page writes an override,
 * and reading the seed here would show a raised total that briefs no longer
 * carry — the bar would be confidently reporting a number the pipeline stopped
 * using. Resolving on the server means one read, above every page in the module.
 */
export default async function CryptoPrLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "crypto-pr")) notFound();

  const campaigns = await resolveCampaigns(ref);

  return (
    <CampaignProvider clientRef={ref} campaigns={campaigns}>
      <CampaignBar clientRef={ref} />
      {children}
    </CampaignProvider>
  );
}
