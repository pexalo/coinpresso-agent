// ---------------------------------------------------------------------------
// API costing.
//
// Every stage already records the model it called and the tokens it burned. This
// file does the arithmetic on top: what has actually been spent, where it went,
// and — the question that decides whether any of this is viable — what a given
// publishing cadence costs per month.
//
// Two honesty rules are built in.
//
// Mock runs are excluded from every average. They cost nothing and take nine
// seconds, so leaving them in produces a per-article cost near zero and a
// forecast that is off by two orders of magnitude.
//
// The forecast is labelled by how many real runs it rests on. An average over
// three articles is a guess wearing a decimal point, and the page says so rather
// than presenting $412.66 as a number anyone should plan against.
// ---------------------------------------------------------------------------

import { estimateCost, MODELS, PRICING } from "./models";
import { SEARCH_MAX_PER_CALL, SEARCH_PRICE_EACH, searchCost } from "./model-registry";
import type { Run } from "./types";

// Deliberately free of any node:fs import. The forecast controls on the costs
// page are a client component, and they need this arithmetic — so the file that
// holds it must be importable from both sides of that line.

export type Track = "wire" | "blog";

export interface StageCost {
  id: string;
  label: string;
  model: string;
  runs: number;
  tokensIn: number;
  tokensOut: number;
  /** Tokens only. */
  costUsd: number;
  searchRequests: number;
  searchCostUsd: number;
}

export interface TrackCost {
  track: Track;
  runs: number;
  billableRuns: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  averageUsd: number | null;
  searchRequests: number;
  searchCostUsd: number;
  /** Revision passes across billable runs — the main driver of variance. */
  revisions: number;
}

export interface DaySpend {
  date: string;
  costUsd: number;
  runs: number;
}

/** One row per run — the line-item view, and what an invoice would itemise. */
export interface RunCost {
  id: string;
  createdAt: string;
  title: string;
  track: Track;
  campaignId?: string;
  status: string;
  tokensIn: number;
  tokensOut: number;
  tokenCostUsd: number;
  searchRequests: number;
  searchCostUsd: number;
  totalUsd: number;
  revisions: number;
}

export interface CostReport {
  /** Every billable run, newest first. */
  runsDetail: RunCost[];
  tokenCostUsd: number;
  searchCostUsd: number;
  searchRequests: number;
  totalUsd: number;
  runs: number;
  billableRuns: number;
  mockRuns: number;
  tokensIn: number;
  tokensOut: number;
  tracks: TrackCost[];
  stages: StageCost[];
  models: Array<{ model: string; costUsd: number; tokensIn: number; tokensOut: number }>;
  days: DaySpend[];
  /** Cheapest and dearest real run, so the spread is visible not just the mean. */
  cheapest: { id: string; title: string; costUsd: number } | null;
  dearest: { id: string; title: string; costUsd: number } | null;
  /**
   * Tokens burned on models the register cannot price. They are in the token
   * totals above but contribute $0 to every dollar figure — which means every
   * dollar figure is UNDERSTATED while this list is non-empty. Shown as a
   * warning rather than silently rolled up, because a too-cheap report reads
   * as good news right up until the invoice.
   */
  unpriced: Array<{ model: string; tokensIn: number; tokensOut: number }>;
}

const STAGE_LABELS: Record<string, string> = {
  strategy: "Strategy — research and source ledger",
  writer: "Writer — first draft",
  linkcheck: "Link check — HTTP, no model",
  reviewer: "Reviewer — cross-family review",
  revision: "Revision — writer applies findings",
  final: "Final",
};

function trackOf(run: Run): Track {
  return run.brief.track === "blog" ? "blog" : "wire";
}

export function buildReport(runs: Run[]): CostReport {
  const billable = runs.filter((r) => !r.mock);

  const stageMap = new Map<string, StageCost>();
  const modelMap = new Map<
    string,
    { model: string; costUsd: number; tokensIn: number; tokensOut: number }
  >();
  const dayMap = new Map<string, DaySpend>();
  const unpricedMap = new Map<
    string,
    { model: string; tokensIn: number; tokensOut: number }
  >();

  let tokensIn = 0;
  let tokensOut = 0;
  let totalUsd = 0;
  let tokenCostUsd = 0;
  let searchCostUsd = 0;
  let searchRequests = 0;
  const runsDetail: RunCost[] = [];

  for (const run of billable) {
    const day = run.createdAt.slice(0, 10);
    const d = dayMap.get(day) ?? { date: day, costUsd: 0, runs: 0 };
    d.costUsd += run.totalCostUsd || 0;
    d.runs += 1;
    dayMap.set(day, d);

    totalUsd += run.totalCostUsd || 0;

    let rTokIn = 0;
    let rTokOut = 0;
    let rTokCost = 0;

    for (const s of run.stages) {
      const ti = s.tokensIn ?? 0;
      const to = s.tokensOut ?? 0;
      const c = s.costUsd ?? 0;
      const sr = s.searchRequests ?? 0;
      const sc = s.searchCostUsd ?? 0;
      if (!ti && !to && !c && !sr) continue;

      tokensIn += ti;
      tokensOut += to;
      tokenCostUsd += c;
      searchRequests += sr;
      searchCostUsd += sc;
      rTokIn += ti;
      rTokOut += to;
      rTokCost += c;

      const key = `${s.id}:${s.model}`;
      const row =
        stageMap.get(key) ??
        {
          id: s.id,
          label: STAGE_LABELS[s.id] ?? s.label,
          model: s.model,
          runs: 0,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          searchRequests: 0,
          searchCostUsd: 0,
        };
      row.runs += 1;
      row.tokensIn += ti;
      row.tokensOut += to;
      row.costUsd += c;
      row.searchRequests += sr;
      row.searchCostUsd += sc;
      stageMap.set(key, row);

      if (!PRICING[s.model] && (ti || to)) {
        const u =
          unpricedMap.get(s.model) ??
          { model: s.model, tokensIn: 0, tokensOut: 0 };
        u.tokensIn += ti;
        u.tokensOut += to;
        unpricedMap.set(s.model, u);
      }

      if (PRICING[s.model]) {
        const m =
          modelMap.get(s.model) ??
          { model: s.model, costUsd: 0, tokensIn: 0, tokensOut: 0 };
        m.costUsd += c;
        m.tokensIn += ti;
        m.tokensOut += to;
        modelMap.set(s.model, m);
      }
    }

    runsDetail.push({
      id: run.id,
      createdAt: run.createdAt,
      title: run.brief.title,
      track: trackOf(run),
      campaignId: run.campaignId,
      status: run.status,
      tokensIn: rTokIn,
      tokensOut: rTokOut,
      tokenCostUsd: rTokCost,
      searchRequests: run.totalSearchRequests ?? 0,
      searchCostUsd: run.totalSearchCostUsd ?? 0,
      totalUsd: run.totalCostUsd || 0,
      revisions: run.revisions || 0,
    });
  }

  runsDetail.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const tracks: TrackCost[] = (["wire", "blog"] as Track[]).map((track) => {
    const all = runs.filter((r) => trackOf(r) === track);
    const real = all.filter((r) => !r.mock);
    const cost = real.reduce((a, r) => a + (r.totalCostUsd || 0), 0);
    const ti = real.reduce(
      (a, r) => a + r.stages.reduce((x, s) => x + (s.tokensIn ?? 0), 0),
      0
    );
    const to = real.reduce(
      (a, r) => a + r.stages.reduce((x, s) => x + (s.tokensOut ?? 0), 0),
      0
    );
    return {
      track,
      runs: all.length,
      billableRuns: real.length,
      costUsd: cost,
      tokensIn: ti,
      tokensOut: to,
      averageUsd: real.length ? cost / real.length : null,
      searchRequests: real.reduce((a, r) => a + (r.totalSearchRequests ?? 0), 0),
      searchCostUsd: real.reduce((a, r) => a + (r.totalSearchCostUsd ?? 0), 0),
      revisions: real.reduce((a, r) => a + (r.revisions || 0), 0),
    };
  });

  const priced = billable
    .filter((r) => (r.totalCostUsd || 0) > 0)
    .sort((a, b) => a.totalCostUsd - b.totalCostUsd);

  const asExtreme = (r: Run | undefined) =>
    r ? { id: r.id, title: r.brief.title, costUsd: r.totalCostUsd } : null;

  return {
    runsDetail,
    tokenCostUsd,
    searchCostUsd,
    searchRequests,
    totalUsd,
    runs: runs.length,
    billableRuns: billable.length,
    mockRuns: runs.length - billable.length,
    tokensIn,
    tokensOut,
    tracks,
    stages: [...stageMap.values()].sort((a, b) => b.costUsd - a.costUsd),
    models: [...modelMap.values()].sort((a, b) => b.costUsd - a.costUsd),
    days: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    cheapest: asExtreme(priced[0]),
    dearest: asExtreme(priced[priced.length - 1]),
    unpriced: [...unpricedMap.values()],
  };
}

// --- Forecasting -----------------------------------------------------------

/**
 * Token shapes per stage, used when there is no measured history to average.
 *
 * These are estimates from the prompt sizes in this repo — the strategy prompt
 * plus search results, the writer prompt plus the brief and exemplars, and a
 * reviewer prompt that carries the whole draft. They are the right order of
 * magnitude and no better than that, which is why the page labels a forecast
 * built on them as modelled rather than measured.
 */
export const STAGE_SHAPE: Record<
  Track,
  Array<{ stage: string; model: string; tokensIn: number; tokensOut: number }>
> = {
  wire: [
    { stage: "strategy", model: MODELS.strategy, tokensIn: 42000, tokensOut: 4500 },
    { stage: "writer", model: MODELS.writer, tokensIn: 9000, tokensOut: 3200 },
    { stage: "reviewer", model: MODELS.reviewer, tokensIn: 8000, tokensOut: 1600 },
    { stage: "revision", model: MODELS.writer, tokensIn: 11000, tokensOut: 3200 },
  ],
  blog: [
    { stage: "strategy", model: MODELS.strategy, tokensIn: 30000, tokensOut: 4000 },
    { stage: "writer", model: MODELS.writer, tokensIn: 7000, tokensOut: 2600 },
    { stage: "reviewer", model: MODELS.reviewer, tokensIn: 6500, tokensOut: 1400 },
    { stage: "revision", model: MODELS.writer, tokensIn: 8500, tokensOut: 2600 },
  ],
};

/**
 * Searches a research call typically makes. The tool ceiling is
 * SEARCH_MAX_PER_CALL; assuming the ceiling every time overstates, assuming
 * none understates by about a quarter. Two thirds is the honest middle, and it
 * is labelled modelled wherever it appears.
 */
export const MODELLED_SEARCHES_PER_RUN = Math.round(SEARCH_MAX_PER_CALL * 0.66);

/** Modelled search fee for one article. */
export function modelledSearchCost(): number {
  return searchCost(MODELLED_SEARCHES_PER_RUN);
}

/** Modelled cost of one article, before any measured history. Tokens only. */
/**
 * Priced a MONTH AHEAD, not today.
 *
 * The forecast is a claim about the coming month, and the register can carry an
 * announced price change inside that window — Sonnet 5 steps from $2/$10 to
 * $3/$15 on 1 Sep. Pricing the forecast at today's rate five days before a 50%
 * step-up produces exactly the number someone budgets against and then misses.
 * Thirty days out lands on the price most of the forecast month is billed at.
 */
export function modelledTokenCost(track: Track, revisionRate = 0.6): number {
  const monthOut = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  return STAGE_SHAPE[track].reduce((sum, s) => {
    const c = estimateCost(s.model, s.tokensIn, s.tokensOut, monthOut);
    return sum + (s.stage === "revision" ? c * revisionRate : c);
  }, 0);
}

/**
 * Tokens PLUS the search fee.
 *
 * Search was missing from this entirely, which understated true cost by roughly
 * a quarter — fine for a rough sense of scale, and not fine at all as the basis
 * for an invoice.
 */
export function modelledUnitCost(track: Track, revisionRate = 0.6): number {
  return modelledTokenCost(track, revisionRate) + modelledSearchCost();
}

export interface Forecast {
  track: Track;
  perArticleUsd: number;
  /** "measured" once there are enough real runs to average. */
  basis: "measured" | "modelled";
  sampleSize: number;
  perDayUsd: number;
  perMonthUsd: number;
}

/** Below this many real runs, an average is noise and the modelled figure wins. */
export const MIN_SAMPLE = 5;

export function forecast(
  report: CostReport,
  cadence: { wirePerDay: number; blogPerDay: number },
  daysPerMonth = 30
): Forecast[] {
  return (["wire", "blog"] as Track[]).map((track) => {
    const t = report.tracks.find((x) => x.track === track)!;
    const measured = t.billableRuns >= MIN_SAMPLE && t.averageUsd !== null;
    const unit = measured ? t.averageUsd! : modelledUnitCost(track);
    const perDay =
      unit * (track === "wire" ? cadence.wirePerDay : cadence.blogPerDay);
    return {
      track,
      perArticleUsd: unit,
      basis: measured ? "measured" : "modelled",
      sampleSize: t.billableRuns,
      perDayUsd: perDay,
      perMonthUsd: perDay * daysPerMonth,
    };
  });
}

export function usd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString("en-GB")}`;
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Billing lives in Pexalo HQ, not here
//
// This file used to carry BillingTerms, buildBill() and billableMonths(), and
// the API costs page rendered an invoice from them. That was the wrong place for
// it: this dashboard is COINPRESSO'S, used every day by their own people, and
// the markup is Pexalo's margin on Coinpresso. The page was showing a client the
// agency's margin on themselves and letting them edit the rate.
//
// What this app owns is the COST BASE — what the providers actually charged,
// measured from their own usage blocks rather than estimated. buildReport()
// above produces it, split into tokens and search, per run and per stage. That
// is the honest division: this app knows what the work cost because it made the
// calls; HQ knows what the client pays because it holds the contract.
//
// The formulas, and the two things about them that are easy to get wrong, are
// written up in PEXALO-HQ-BILLING.md so the reasoning survives the deletion.
// ---------------------------------------------------------------------------
