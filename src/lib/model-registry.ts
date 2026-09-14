// ---------------------------------------------------------------------------
// The LLM and model register.
//
// One place that answers: which model runs which stage, why that one, what it
// costs, what happens when it is retired, and what the alternatives are.
//
// This is DATA, and it is the source of truth. `models.ts` derives its tiering
// and its price table from here rather than keeping a second copy — a register
// that can disagree with the code is a document, and documents rot. The workflow
// diagram and the cost forecast both read through it too, so re-tiering a stage
// moves every one of those in the same commit.
//
// PRICES ARE A CLAIM ABOUT THE WORLD, so they carry a date and a source. The
// figures below were verified against the providers' published price lists on
// PRICED_ON. Two things that check found, both of which were wrong in the code
// before it:
//
//   - Claude Opus 4.5 was listed at $15/$75. It is $5/$25. The forecast was
//     overstating Opus by 3x, which is exactly the kind of error that makes
//     someone reject a viable tier.
//   - Claude Sonnet 5 exists at $2/$10 — newer AND cheaper than the Sonnet 4.5
//     this system is configured on at $3/$15.
//
// Nothing here switches a production model on its own. The register's job is to
// make the choice visible and dated; changing it is a person's decision.
// ---------------------------------------------------------------------------

export type Provider = "anthropic" | "openai";

/**
 * The lineage, not the vendor. This is the field the review stage depends on:
 * a reviewer from the writer's own family shares its blind spots and mostly
 * agrees with itself, so the pipeline asserts these differ.
 */
export type Family = "claude" | "gpt";

export type Tier = "frontier" | "mid" | "small";

export interface RegisteredModel {
  id: string;
  name: string;
  provider: Provider;
  family: Family;
  tier: Tier;
  /** USD per million tokens. */
  pricing: { in: number; out: number };
  /**
   * Prompt-cache rates as MULTIPLES of the base input price.
   *
   * Both providers bill cached input differently from fresh input, and the
   * costs page was pricing all of it at the full rate: every cache read charged
   * at ten times what it cost. Anthropic writes to the cache at 1.25× and reads
   * at 0.1×; OpenAI has no write premium and reads at 0.25× on the 4.1 family
   * or 0.1× on the 5 family. Omitted means the provider default below.
   */
  cache?: { write: number; read: number };
  /**
   * A price change the provider has already announced.
   *
   * Launch discounts are the case that forced this field: Sonnet 5 shipped at
   * $2/$10 "through 31 Aug", stepping to $3/$15 after. A register that carries
   * only today's number makes the September forecast wrong on 1 September at
   * midnight, silently — and a forecast is precisely a claim about later.
   * `priceFor()` below picks the right figure for a given date, and every cost
   * calculation goes through it rather than reading `pricing` directly.
   */
  priceChange?: { on: string; pricing: { in: number; out: number }; note?: string };
  contextWindow?: string;
  status: "current" | "superseded" | "retired";
  /** Where to go when this one is retired. */
  supersededBy?: string;
  /** Whether this system uses it with the provider's server-side web search. */
  webSearch: boolean;
  /**
   * Whether the model still accepts a `temperature` parameter.
   *
   * The newest Anthropic models reject it outright — `temperature is deprecated
   * for this model`, a 400, every call. Omitted means yes, because that is true
   * of everything shipped before the 5-series and of both OpenAI families.
   *
   * This flag is ADVISORY, not load-bearing: `anthropic.ts` also retries once
   * without the parameter when the API says it is unsupported. A register entry
   * that is wrong or missing therefore costs one retry, not a broken pipeline —
   * which is the right failure mode for a hand-maintained fact about a moving
   * target.
   */
  supportsTemperature?: boolean;
  notes?: string;
}

/** The date every price below was checked against the provider's own page. */
export const PRICED_ON = "2026-09-14";

export const PRICING_SOURCES = [
  {
    label: "Anthropic — Claude API pricing",
    url: "https://platform.claude.com/docs/en/about-claude/pricing",
  },
  {
    label: "OpenAI — API pricing",
    url: "https://developers.openai.com/api/docs/pricing",
  },
];

/**
 * Deliberately a curated list, not every model either provider sells.
 *
 * What earns a place: the models this system runs on, the credible alternatives
 * for each stage, and the retired entries whose old prices are still quoted in
 * places. A register nobody can read in one screen does not get read.
 */
export const MODEL_REGISTRY: Record<string, RegisteredModel> = {
  // --- Anthropic ---
  "claude-opus-5": {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    family: "claude",
    tier: "frontier",
    pricing: { in: 5, out: 25 },
    contextWindow: "1M",
    status: "current",
    webSearch: true,
    supportsTemperature: false,
    notes:
      "Frontier tier. Worth it where the reasoning is the product — not on a stage whose thinking already happened upstream.",
  },
  "claude-opus-4-5": {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    family: "claude",
    tier: "frontier",
    pricing: { in: 5, out: 25 },
    contextWindow: "1M",
    status: "current",
    supersededBy: "claude-opus-5",
    webSearch: true,
    notes:
      "Was recorded here at $15/$75 — three times the real price. Corrected on the date above.",
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    family: "claude",
    tier: "mid",
    pricing: { in: 2, out: 10 },
    contextWindow: "1M",
    status: "current",
    webSearch: true,
    supportsTemperature: false,
    notes:
      "What strategy, writer and revision run on. This register carried an announced step to $3/$15 on 1 Sep; Anthropic's price page on 14 Sep still lists $2/$10, so the step-up did not happen and the entry was overcharging every Sonnet call by half for two weeks. Removed — re-check on the next PRICED_ON pass.",
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    family: "claude",
    tier: "mid",
    pricing: { in: 3, out: 15 },
    status: "superseded",
    supersededBy: "claude-sonnet-5",
    webSearch: true,
  },
  "claude-sonnet-4-5": {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    family: "claude",
    tier: "mid",
    pricing: { in: 3, out: 15 },
    status: "superseded",
    supersededBy: "claude-sonnet-5",
    webSearch: true,
    notes:
      "What this system ran on until 24 Aug. Dearer than Sonnet 5 and no longer on Anthropic's current-models list.",
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    family: "claude",
    tier: "small",
    pricing: { in: 1, out: 5 },
    contextWindow: "1M",
    status: "current",
    webSearch: true,
    notes:
      "Cheap enough for high-volume mechanical work. Too small for research, where a missed source is a missing fact downstream.",
  },
  "claude-opus-4-1": {
    id: "claude-opus-4-1",
    name: "Claude Opus 4.1",
    provider: "anthropic",
    family: "claude",
    tier: "frontier",
    pricing: { in: 15, out: 75 },
    status: "retired",
    supersededBy: "claude-opus-5",
    webSearch: false,
    notes:
      "Bedrock and Google Cloud only. This is where the old $15/$75 figure came from.",
  },

  // --- OpenAI ---
  "gpt-5": {
    id: "gpt-5",
    name: "GPT-5",
    provider: "openai",
    family: "gpt",
    tier: "frontier",
    pricing: { in: 1.25, out: 10 },
    cache: { write: 1, read: 0.1 },
    status: "current",
    webSearch: false,
    notes:
      "What the reviewer runs on. Dearer per output token than GPT-4.1 but far cheaper per input token — and review is a long-input, short-output job, so in this shape it works out cheaper AND a tier higher.",
  },
  "gpt-5-mini": {
    id: "gpt-5-mini",
    name: "GPT-5 mini",
    provider: "openai",
    family: "gpt",
    tier: "mid",
    pricing: { in: 0.25, out: 2 },
    cache: { write: 1, read: 0.1 },
    status: "current",
    webSearch: false,
    notes:
      "An eighth of GPT-4.1's input price. The strongest cost lever on the review stage — but review quality is the one place to be slow about trading down.",
  },
  "gpt-4.1": {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    family: "gpt",
    tier: "mid",
    pricing: { in: 2, out: 8 },
    status: "current",
    supersededBy: "gpt-5",
    webSearch: false,
    notes:
      "What the reviewer ran on until 24 Aug. Replaced by GPT-5, which costs less for this stage's input-heavy shape.",
  },
  "gpt-4.1-mini": {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 mini",
    provider: "openai",
    family: "gpt",
    tier: "small",
    pricing: { in: 0.4, out: 1.6 },
    status: "current",
    supersededBy: "gpt-5-mini",
    webSearch: false,
  },
};

/**
 * Server-side web search, billed SEPARATELY from tokens.
 *
 * This was missing from the cost model entirely, and it is not a rounding
 * error: the research stage is allowed up to 12 searches, so a single research
 * call can add $0.12 — comparable to the whole token cost of an article. Any
 * figure used for billing has to include it or it under-states true cost by
 * roughly a quarter.
 *
 * Errors are not billed, and the API reports the real count in
 * usage.server_tool_use.web_search_requests — so this is measured, not modelled.
 */
export const SEARCH_PRICE_PER_1000 = 10;
export const SEARCH_PRICE_EACH = SEARCH_PRICE_PER_1000 / 1000;

/** Ceiling per research call, from the max_uses set on the tool. */
export const SEARCH_MAX_PER_CALL = 12;

export function searchCost(requests: number): number {
  return requests * SEARCH_PRICE_EACH;
}

/**
 * Image generation, billed PER IMAGE, not per token.
 *
 * Checked against OpenAI's price list on PRICED_ON. Landscape 1536×1024 is
 * what the designer asks for, and — counter-intuitively — it is cheaper than
 * square at every quality. The "low" figure was carried in code as $0.011; the
 * list says $0.005.
 */
export const IMAGE_PRICES: Record<
  string,
  Record<"square" | "landscape", Record<"low" | "medium" | "high", number>>
> = {
  "gpt-image-2": {
    square: { low: 0.006, medium: 0.053, high: 0.211 },
    landscape: { low: 0.005, medium: 0.041, high: 0.165 },
  },
};

/** Per-image fee, or 0 for a model/shape the register cannot price. */
export function imagePrice(model: string, size: string, quality: string): number {
  const shape = size === "1024x1024" ? "square" : "landscape";
  const q = (quality === "low" || quality === "high" ? quality : "medium") as
    | "low"
    | "medium"
    | "high";
  return IMAGE_PRICES[model]?.[shape]?.[q] ?? 0;
}

export const MODEL_LIST = Object.values(MODEL_REGISTRY);

export function registered(id: string): RegisteredModel | undefined {
  return MODEL_REGISTRY[id];
}

/**
 * Whether it is safe to send `temperature` to this model.
 *
 * Unknown ids answer YES on purpose. An override pointing at a model the
 * register has never heard of should behave like the majority of models rather
 * than lose sampling control silently; if that guess is wrong the client's
 * retry corrects it on the first call and every call after is shaped right.
 */
export function acceptsTemperature(id: string): boolean {
  return registered(id)?.supportsTemperature ?? true;
}

// ---------------------------------------------------------------------------
// Stage assignments
// ---------------------------------------------------------------------------

export interface StageAssignment {
  stage: string;
  label: string;
  /** Environment variable that overrides it. */
  envVar: string;
  modelId: string;
  /** Why this model, at this tier, for this job. */
  why: string;
  /** Capabilities the stage genuinely needs. */
  requires: string[];
  /** Where to go if the assigned model is unavailable. */
  fallbackId: string;
  /** Set where the choice is constrained by another stage's family. */
  constraint?: string;
}

export const STAGE_MODELS: StageAssignment[] = [
  {
    stage: "strategy",
    label: "Strategy — research and the source ledger",
    envVar: "STRATEGY_MODEL",
    modelId: "claude-sonnet-5",
    why: "Everything downstream rests on this stage, because the writer may not introduce a source it did not supply. It also carries the most tokens — search results land in its context — so it is both the most important and the most expensive stage, at roughly 55% of a run.",
    requires: ["Server-side web search", "Long context", "Reliable JSON"],
    fallbackId: "claude-sonnet-4-5",
  },
  {
    stage: "writer",
    label: "Writer — the draft",
    envVar: "WRITER_MODEL",
    modelId: "claude-sonnet-5",
    why: "Mid-tier on purpose, and specified that way. Given a complete brief and a tight framework the thinking has already happened upstream; a frontier model buys very little and costs five times as much.",
    requires: ["Long context for exemplars", "Instruction following"],
    fallbackId: "claude-sonnet-4-5",
  },
  {
    stage: "reviewer",
    label: "Reviewer — the gate",
    envVar: "REVIEWER_MODEL",
    modelId: "gpt-5",
    why: "A different model family from the writer, deliberately. A reviewer sharing the writer's lineage shares its blind spots and largely agrees with itself, which makes the stage decoration.",
    requires: ["JSON mode", "Long context for the whole draft"],
    fallbackId: "gpt-4.1",
    constraint:
      "Must NOT be a Claude model while the writer is one. Cross-family review is the entire point of this stage — matching the families to save a vendor relationship would quietly remove the gate.",
  },
  {
    stage: "revision",
    label: "Revision — applying findings",
    envVar: "WRITER_MODEL",
    modelId: "claude-sonnet-5",
    why: "The same model as the writer, so the revision reads as the same hand. A second voice patching a first one produces a draft with a seam down the middle.",
    requires: ["Instruction following"],
    fallbackId: "claude-sonnet-4-5",
  },
  {
    stage: "ideas",
    label: "Ideation — the market scan",
    envVar: "STRATEGY_MODEL",
    modelId: "claude-sonnet-5",
    why: "The same model and the same search tool as the research stage, because ideation is research. It scans the live market for dated catalysts, reads the whole archive to see which angles are worn out, and proposes topics with their sources plus the titles worth running on each. It used to run without search and propose from memory — which produced titles whose premise the research stage then disproved.",
    requires: ["Server-side web search", "Long context", "Reliable JSON"],
    fallbackId: "claude-sonnet-4-5",
  },
  {
    stage: "linkcheck",
    label: "Link verification",
    envVar: "—",
    modelId: "—",
    why: "No model. Every URL is compared against the research ledger by string match and then requested over HTTP. A model asked whether it fabricated a citation sometimes says no with confidence; a 404 cannot be talked round.",
    requires: ["HTTP"],
    fallbackId: "—",
  },
];

/** The two families in play, and which stages sit in each. */
export function familySplit(): Record<Family, string[]> {
  const out: Record<Family, string[]> = { claude: [], gpt: [] };
  STAGE_MODELS.forEach((s) => {
    const m = registered(s.modelId);
    if (m) out[m.family].push(s.label);
  });
  return out;
}

const TIER_RANK: Record<Tier, number> = { small: 0, mid: 1, frontier: 2 };

export interface Alternative {
  model: RegisteredModel;
  /**
   * Whether taking this saving also drops a tier. Both kinds are worth showing
   * — hiding the cheap small model is paternalistic — but they are not the same
   * decision, and a panel that lists them together invites someone to move the
   * research stage onto a model that will miss sources.
   */
  tierChange: "same-or-better" | "lower";
  /** Cheaper on input, on output, or on both. */
  cheaperOn: "both" | "input" | "output";
}

/**
 * Current models in the same family that cost less on at least one axis, with
 * the tier change stated. Surfaced by the register, never acted on by it.
 */
export function cheaperThan(id: string): Alternative[] {
  const m = registered(id);
  if (!m) return [];
  return MODEL_LIST.filter(
    (x) =>
      x.status === "current" &&
      x.id !== m.id &&
      x.family === m.family &&
      (x.pricing.in < m.pricing.in || x.pricing.out < m.pricing.out) &&
      // Dearer on both axes is not an alternative, it is an upgrade.
      !(x.pricing.in > m.pricing.in && x.pricing.out > m.pricing.out)
  )
    .map((x) => ({
      model: x,
      tierChange:
        TIER_RANK[x.tier] >= TIER_RANK[m.tier]
          ? ("same-or-better" as const)
          : ("lower" as const),
      cheaperOn:
        x.pricing.in < m.pricing.in && x.pricing.out < m.pricing.out
          ? ("both" as const)
          : x.pricing.in < m.pricing.in
            ? ("input" as const)
            : ("output" as const),
    }))
    .sort(
      (a, b) =>
        TIER_RANK[b.model.tier] - TIER_RANK[a.model.tier] ||
        a.model.pricing.out - b.model.pricing.out
    );
}

/** Price table in the shape the cost code wants. Derived, never hand-kept. */
/**
 * The price in force on a given date.
 *
 * Every cost calculation goes through here, with the date of the call — not
 * through `.pricing`, which is only the price as of PRICED_ON. The difference
 * is the announced step-up: a token burned on 31 Aug and one burned on 1 Sep
 * cost different money, and a report that prices both at whichever figure the
 * code shipped with is wrong for one of them.
 */
export interface Price {
  in: number;
  out: number;
  /** USD per million cached-input tokens written. */
  cacheWrite: number;
  /** USD per million cached-input tokens read. */
  cacheRead: number;
}

/** Provider defaults for cache multipliers, when a model does not say. */
const CACHE_DEFAULT: Record<Provider, { write: number; read: number }> = {
  anthropic: { write: 1.25, read: 0.1 },
  openai: { write: 1, read: 0.25 },
};

export function priceFor(id: string, at: Date = new Date()): Price | undefined {
  const m = MODEL_REGISTRY[id];
  if (!m) return undefined;
  const base =
    m.priceChange && at.toISOString().slice(0, 10) >= m.priceChange.on
      ? m.priceChange.pricing
      : m.pricing;
  const mult = m.cache ?? CACHE_DEFAULT[m.provider];
  return {
    in: base.in,
    out: base.out,
    cacheWrite: base.in * mult.write,
    cacheRead: base.in * mult.read,
  };
}

export function pricingTable(at: Date = new Date()): Record<string, Price> {
  return Object.fromEntries(MODEL_LIST.map((m) => [m.id, priceFor(m.id, at)!]));
}
