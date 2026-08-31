import type { ContentBrief } from "./content-brief";

// ---------------------------------------------------------------------------
// Shared types for the Coinpresso agent pipeline.
// ---------------------------------------------------------------------------

export type PublicationId =
  | "openpr"
  | "globenewswire"
  | "streetinsider"
  | "techbullion"
  | "coingabbar"
  | "ventureburn"
  | "captainaltcoin"
  | "financefeeds"
  | "blockchainreporter";

export type StageId =
  | "strategy"
  | "writer"
  | "linkcheck"
  | "reviewer"
  | "revision"
  | "final";

export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type RunStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "approved"
  | "failed";

/** What Liam fills in. Deliberately three fields — title, keywords, wire. */
export interface Brief {
  title: string;
  keywords: string[];
  publication: PublicationId;
  /** Wire PR for a campaign, or a post on Coinpresso's own blog. The two share
   *  the pipeline and share almost nothing else. */
  track?: "wire" | "blog";
  /** Blog track only. */
  contentType?: string;
  pillar?: string;
  pillarHub?: string;
  /** Optional overrides. Left blank, the strategy agent researches them. */
  presaleRaised?: string;
  presaleStage?: string;
  notes?: string;
  /**
   * An INTERNAL editorial brief for this post — Coinpresso's own content
   * recommendation doc, held in their Drive.
   *
   * It is guidance the pipeline follows and it is NOT a source. It is not
   * published, not reachable by a reader, and citing it would put a Google Docs
   * link in a live article. It is therefore kept out of `Source` entirely and
   * carried here on its own, so that the one place it can appear — the strategy
   * prompt — can quarantine it explicitly rather than relying on a model
   * inferring that an internal URL is different in kind from a researched one.
   */
  referenceUrl?: string;
  /** The client's content brief, as structure. See `content-brief.ts`. */
  contentBrief?: ContentBrief;
  /**
   * A Coinpresso page this post exists to link to. Outreach rows in the content
   * calendar carry one; ordinary posts do not.
   */
  linkTarget?: string;
  /** Snapshot of the campaign at the moment the brief was submitted, so a run
   *  records what was true then rather than what the fact sheet says today. */
  campaignId?: string;
  campaignName?: string;
  campaignTicker?: string;
  tokenPrice?: string;
  bannedClaims?: string[];
}

/** One externally verifiable source the strategy agent found. */
export interface Source {
  id: string;
  publisher: string;
  title: string;
  url: string;
  /** What this source is being used to support. */
  claim: string;
  kind: "prediction" | "news" | "market_data" | "onchain" | "project";
  /** Figures quoted from it, so the reviewer can check the writer didn't drift. */
  figures?: string[];
  /** Filled by the link checker. */
  httpStatus?: number;
  reachable?: boolean;
}

/** The strategy agent's structured output. */
export interface ResearchBrief {
  featuredAsset: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  /** The dated, real event the article hangs on. */
  newsCatalyst: {
    headline: string;
    date: string;
    summary: string;
    sourceId: string | null;
  };
  marketContext: string;
  predictions: Array<{
    sourceId: string;
    target: string;
    horizon: string;
    stance: "bullish" | "cautious" | "bearish" | "neutral";
    summary: string;
  }>;
  opportunityGap: string;
  moonbergAngle: string;
  presaleState: { raised: string; stage: string; note: string };
  comparisonAssets: string[];
  structureVariant: "single_asset" | "listicle";
  suggestedHeadings: string[];
  faqCandidates: string[];
  riskNotes: string[];
  sources: Source[];
  /** Blog track only — the prediction fields above go unused there. */
  buyerQuestion?: string;
  competingContent?: string[];
  proofPoints?: string[];
  internalLinks?: string[];
}

/** The writer agent's structured output. */
export interface Draft {
  headline: string;
  dateline: string | null;
  body: string; // markdown
  faqs: Array<{ q: string; a: string }>;
  tags: string[];
  wordCount: number;
}

export interface ReviewFinding {
  severity: "blocker" | "major" | "minor";
  category:
    | "style"
    | "sourcing"
    | "structure"
    | "compliance"
    | "seo"
    | "accuracy";
  detail: string;
  fix: string;
}

export interface ReviewResult {
  verdict: "pass" | "revise" | "reject";
  scores: {
    styleMatch: number;
    sourcing: number;
    structure: number;
    seo: number;
    compliance: number;
  };
  findings: ReviewFinding[];
  summary: string;
}

export interface LinkCheckResult {
  /** URLs in the draft that were never in the strategy agent's ledger. */
  unsourced: string[];
  /** URLs that did not resolve. */
  unreachable: Array<{ url: string; status: number | null }>;
  checked: number;
  passed: boolean;
}

export interface StageRecord {
  id: StageId;
  label: string;
  agent: string;
  model: string;
  status: StageStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  inputSummary?: string;
  output?: unknown;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** Billable server-side web searches. Priced separately from tokens. */
  searchRequests?: number;
  /** Tokens only. */
  costUsd?: number;
  /** Search fees only. Kept apart so the split stays visible in the breakdown. */
  searchCostUsd?: number;
  attempt?: number;
}

export interface Run {
  id: string;
  /** Which Pexalo client this belongs to. Every query is scoped by it. */
  clientRef: string;
  /** Which campaign under that client — an agency client runs several. */
  campaignId?: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  brief: Brief;
  stages: StageRecord[];
  research?: ResearchBrief;
  draft?: Draft;
  review?: ReviewResult;
  linkCheck?: LinkCheckResult;
  revisions: number;
  /** Set once exported. */
  docUrl?: string;
  approvedAt?: string;
  approvedBy?: string;
  mock: boolean;
  /** Tokens plus search. The number to bill from. */
  totalCostUsd: number;
  /** Of which search fees. */
  totalSearchCostUsd?: number;
  totalSearchRequests?: number;
}
