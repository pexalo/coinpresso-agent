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
  /** Optional overrides. Left blank, the strategy agent researches them. */
  presaleRaised?: string;
  presaleStage?: string;
  notes?: string;
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
  costUsd?: number;
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
  totalCostUsd: number;
}
