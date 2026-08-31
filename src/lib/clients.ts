// ---------------------------------------------------------------------------
// Client registry, campaign registry and module system.
//
// The platform rule: Pexalo HQ hosts many clients, and each one gets its own
// dashboard composed of the modules that client actually bought. Geo One and
// Coinpresso are both Pexalo clients — peers, not parent and child — and their
// dashboards share a shell, an auth model and a job queue while sharing almost
// no screens.
//
// A second rule sits under it: an AGENCY client runs work for several end
// clients of its own. Coinpresso does PR for Moonberg today and will do it for
// other token projects tomorrow. Those are campaigns, and everything the agents
// are allowed to say — the numbers, the product claims, the house voice — hangs
// off the campaign rather than off the agency.
//
// In HQ this becomes `clients`, `client_modules` and `campaigns` tables.
// ---------------------------------------------------------------------------

export type ModuleId =
  | "crypto-pr"
  | "own-blog"
  | "daily-report"
  | "visibility"
  | "content-feed"
  | "citations"
  | "authority";

export interface ModuleDef {
  id: ModuleId;
  name: string;
  /** Path segment under /client/[ref]/ */
  slug: string;
  summary: string;
  /** Whether this prototype actually implements it. */
  built: boolean;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  "crypto-pr": {
    id: "crypto-pr",
    name: "Crypto PR",
    slug: "crypto-pr",
    summary:
      "Research, draft and review wire releases to the campaign's house style, with every citation traced to a retrieved source and checked against everything already published.",
    built: true,
  },
  "own-blog": {
    id: "own-blog",
    name: "Coinpresso Blog",
    slug: "own-blog",
    summary:
      "The agency's own domain. Five to eight posts a day planned across service pillars, written to the house blog voice, each one required to carry something a competitor could not publish.",
    built: true,
  },
  "daily-report": {
    id: "daily-report",
    name: "Daily Report",
    slug: "daily-report",
    summary:
      "The daily marketing report for a campaign — revenue, spend, attribution, anomalies and the actions arising.",
    built: true,
  },
  visibility: {
    id: "visibility",
    name: "AI Visibility",
    slug: "visibility",
    summary:
      "Scores across ChatGPT, Claude, Gemini and Perplexity, tracked over time against competitors.",
    built: false,
  },
  "content-feed": {
    id: "content-feed",
    name: "Content Feed",
    slug: "content-feed",
    summary:
      "Blog and FAQ drafts, approval queue, and the pull feed the client's own site renders from.",
    built: false,
  },
  citations: {
    id: "citations",
    name: "Your Content in AI",
    slug: "citations",
    summary:
      "Which published URLs are being quoted back by AI platforms, matched against what we published.",
    built: false,
  },
  authority: {
    id: "authority",
    name: "Authority AI",
    slug: "authority",
    summary:
      "Third-party citation building — trade press, directories and industry bodies that matter for the sector.",
    built: false,
  },
};

/**
 * A campaign is the agency's end client. The `facts` block is the single source
 * of truth for the numbers an agent is permitted to state.
 *
 * This exists because the published Moonberg archive carries $200,000, $290,000,
 * $300,000 and $375,000 as the raised figure within one week. No agent can
 * resolve which is current, and guessing puts a wrong number on a newswire. One
 * person sets it here, everything downstream reads it, and `updatedAt` makes a
 * stale figure visible rather than silent.
 */
export interface CampaignFacts {
  raised: string;
  stage: string;
  tokenPrice: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Campaign {
  id: string;
  name: string;
  ticker: string;
  site: string;
  status: "active" | "paused";
  accent: string;
  facts: CampaignFacts;
  /** Claims the agents must never make for this campaign, whatever the brief. */
  bannedClaims: string[];
}

export interface Client {
  ref: string;
  name: string;
  /** What Pexalo does for them, in one line, for the HQ client list. */
  engagement: string;
  /** Per-client identity colour. Set this from the client's real brand. */
  accent: string;
  /** Path under /public. Falls back to a monogram when the file is absent. */
  logo?: string;
  /** True when the logo artwork already contains the company name, so the
   *  header does not print it twice. */
  logoIncludesName?: boolean;
  /** Brand gradient, sampled from the client's own logo. */
  gradient?: [string, string];
  modules: ModuleId[];
  campaigns: Campaign[];
}

export const CLIENTS: Record<string, Client> = {
  coinpresso: {
    ref: "coinpresso",
    name: "Coinpresso",
    engagement: "Crypto PR and campaign reporting for token projects",
    // Sampled from the ring in their own logo: teal through blue into violet.
    accent: "#895CFF",
    gradient: ["#7FF4E1", "#895CFF"],
    logo: "/brand/clients/coinpresso.png",
    logoIncludesName: true,
    modules: ["crypto-pr", "own-blog", "daily-report"],
    campaigns: [
      {
        id: "moonberg",
        name: "Moonberg",
        ticker: "$MBX",
        site: "https://moonberg.com",
        status: "active",
        accent: "#6C3AFF",
        facts: {
          raised: "$300,000",
          stage: "Stage 2",
          tokenPrice: "$0.26",
          updatedAt: "2026-08-21",
          updatedBy: "Liam",
        },
        bannedClaims: [
          "Any confirmed exchange listing, listing date or listing partner",
          "Any guaranteed return, multiple or price floor for $MBX",
          "Any comparison presenting the presale as lower-risk than an established asset",
        ],
      },
    ],
  },
  "geo-one": {
    ref: "geo-one",
    name: "Geo One",
    engagement: "AI visibility and content for Malaysian SMEs",
    accent: "#4E78FF",
    modules: ["visibility", "content-feed", "citations", "authority"],
    campaigns: [],
  },
};

export const CLIENT_LIST = Object.values(CLIENTS);

/**
 * The one client a client-role session is allowed to see, when the deployment
 * is dedicated to them.
 *
 * WHY THIS EXISTS. The client list at "/" is Pexalo's own HQ view — every
 * client, their engagement, and the modules they bought. Serving that to a
 * signed-in client tells them who else Pexalo works with and what those firms
 * are paying for. Liam opening his dashboard and reading Geo One's service
 * scope is not a cosmetic problem, and deleting Geo One's record would only
 * hide it until the next client is added.
 *
 * So: set PORTAL_CLIENT_REF on a single-tenant deployment. The client role is
 * then confined to that one workspace and the roster is never rendered for
 * them; the Pexalo role still sees everything, because for Pexalo the list is
 * the point. Unset — as on a laptop — nothing changes.
 */
export function tenantRef(): string | null {
  return process.env.PORTAL_CLIENT_REF?.trim() || null;
}

/** What a given role may see. Pexalo sees the roster; a client sees themselves. */
export function visibleClients(isAdmin: boolean): Client[] {
  const only = tenantRef();
  if (isAdmin || !only) return CLIENT_LIST;
  return CLIENT_LIST.filter((c) => c.ref === only);
}

export function getClient(ref: string): Client | null {
  return CLIENTS[ref] ?? null;
}

/**
 * Reachable by THIS session, as opposed to merely existing. Routes use this so
 * a client cannot open another client's workspace by typing the URL — the
 * answer is a 404, the same as a client that does not exist, because "you are
 * not allowed to see this" still confirms it is there.
 */
export function getVisibleClient(ref: string, isAdmin: boolean): Client | null {
  const only = tenantRef();
  if (!isAdmin && only && ref !== only) return null;
  return getClient(ref);
}

export function clientModules(client: Client): ModuleDef[] {
  return client.modules.map((m) => MODULES[m]).filter(Boolean);
}

/** Does this client have this module enabled? Used to gate routes and APIs. */
export function hasModule(client: Client, id: ModuleId): boolean {
  return client.modules.includes(id);
}

export function getCampaign(
  client: Client,
  id: string | undefined
): Campaign | null {
  if (!id) return null;
  return client.campaigns.find((c) => c.id === id) ?? null;
}

export function defaultCampaign(client: Client): Campaign | null {
  return (
    client.campaigns.find((c) => c.status === "active") ??
    client.campaigns[0] ??
    null
  );
}

/** How stale is a campaign's fact sheet, in days? */
export function factsAgeDays(facts: CampaignFacts, now = new Date()): number {
  const then = Date.parse(facts.updatedAt);
  if (Number.isNaN(then)) return Infinity;
  return Math.floor((now.getTime() - then) / 86_400_000);
}
