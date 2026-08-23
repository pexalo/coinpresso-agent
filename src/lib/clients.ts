// ---------------------------------------------------------------------------
// Client registry and module system.
//
// The platform rule: Pexalo HQ hosts many clients, and each one gets its own
// dashboard composed of the modules that client actually bought. Geo One and
// Coinpresso are both Pexalo clients — peers, not parent and child — and their
// dashboards share a shell, an auth model and a job queue while sharing almost
// no screens.
//
// Getting this wrong in the obvious way — one dashboard, same tabs, different
// data — is what forces every future client to be shaped like the first one.
// Coinpresso is the proof it does not work: no site to publish to, no visibility
// score, no citations. It needs a production queue, and Geo One does not.
//
// In HQ this table is rows in a `clients` table plus a join to `client_modules`.
// Here it is a constant so the pattern is legible without a database.
// ---------------------------------------------------------------------------

export type ModuleId =
  | "crypto-pr"
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
      "Research, draft and review wire releases to the client's house style, with every citation traced to a retrieved source.",
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

export interface Client {
  ref: string;
  name: string;
  /** What Pexalo does for them, in one line, for the HQ client list. */
  engagement: string;
  /** Per-client identity colour. Set this from the client's real brand. */
  accent: string;
  modules: ModuleId[];
  /** Campaigns nested under the client — an agency client runs several. */
  campaigns?: Array<{ id: string; name: string }>;
}

export const CLIENTS: Record<string, Client> = {
  coinpresso: {
    ref: "coinpresso",
    name: "Coinpresso",
    engagement: "Crypto PR production for agency campaigns",
    accent: "#F4B740",
    modules: ["crypto-pr"],
    // Coinpresso is an agency. Moonberg is one campaign; a second token project
    // should nest here rather than becoming a second Coinpresso account.
    campaigns: [{ id: "moonberg", name: "Moonberg ($MBX)" }],
  },
  "geo-one": {
    ref: "geo-one",
    name: "Geo One",
    engagement: "AI visibility and content for Malaysian SMEs",
    accent: "#4E78FF",
    modules: ["visibility", "content-feed", "citations", "authority"],
  },
};

export const CLIENT_LIST = Object.values(CLIENTS);

export function getClient(ref: string): Client | null {
  return CLIENTS[ref] ?? null;
}

export function clientModules(client: Client): ModuleDef[] {
  return client.modules.map((m) => MODULES[m]).filter(Boolean);
}

/** Does this client have this module enabled? Used to gate routes and APIs. */
export function hasModule(client: Client, id: ModuleId): boolean {
  return client.modules.includes(id);
}
