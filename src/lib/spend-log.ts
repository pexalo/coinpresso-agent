// ---------------------------------------------------------------------------
// Spend that happens OUTSIDE a run.
//
// The pipeline records its own cost per stage, and for a while that was treated
// as the whole picture. It is not: the ideation scan and the blog day-planner
// are real model calls — the scan is the single most search-heavy call in the
// system, a dozen billable searches plus tokens, roughly an article's cost per
// click — and neither produces a run, so neither appeared anywhere. "Spent to
// date" was silently short by every scan ever made, which at daily use is not a
// rounding error; it is the third-largest line in the true bill.
//
// So: an append-only ledger, one file per client, written by the routes that
// make off-run calls. Append-only for the same reason the approval log is —
// a spend record that can be rewritten is a spend record, minus the record.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";
import { estimateCost } from "./models";
import { searchCost } from "./model-registry";

const DIR = dataDir("spend-log");

export type SpendKind = "ideas-scan" | "blog-plan" | "topic-suggest" | "doc-lessons" | "removed-posts";

export const SPEND_LABELS: Record<SpendKind, string> = {
  "ideas-scan": "Ideation scans — topics & titles",
  "blog-plan": "Blog day planning",
  "topic-suggest": "Topic suggestions for the blog queue",
  "doc-lessons": "Learning house rules from Liam's Doc edits",
  "removed-posts": "Posts deleted from the bin (their spend is kept)",
};

export interface SpendEntry {
  at: string;
  kind: SpendKind;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Input tokens written to the prompt cache — billed at a premium. */
  cacheWriteTokens?: number;
  /** Input tokens served from the prompt cache — billed at a discount. */
  cacheReadTokens?: number;
  searchRequests: number;
  tokenCostUsd: number;
  searchCostUsd: number;
  /** Only on a removed-post entry, which carries a deleted run's images. */
  imageCostUsd?: number;
  /** Only on a removed-post entry: which post it was. */
  note?: string;
  totalUsd: number;
}

/**
 * A post deleted for good takes its record with it — and the monthly
 * statement is built from the records, so its spend would vanish from the
 * invoice although the providers billed it. Before deletion, its charges are
 * written here, one line per month.
 */
export async function archiveRunSpend(
  clientRef: string,
  run: { id: string; brief: { title: string }; mock?: boolean },
  byMonth: Map<string, { tok: number; srch: number; img: number; at: string }>
): Promise<void> {
  if (run.mock) return;
  const lines: string[] = [];
  for (const c of byMonth.values()) {
    const total = c.tok + c.srch + c.img;
    if (total <= 0) continue;
    const entry: SpendEntry = {
      at: c.at,
      kind: "removed-posts",
      model: "various",
      tokensIn: 0,
      tokensOut: 0,
      searchRequests: 0,
      tokenCostUsd: c.tok,
      searchCostUsd: c.srch,
      imageCostUsd: c.img,
      note: `${run.brief.title} (${run.id})`,
      totalUsd: total,
    };
    lines.push(JSON.stringify(entry));
  }
  if (!lines.length) return;
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(fileFor(clientRef), lines.join("\n") + "\n", "utf8");
}

function fileFor(clientRef: string): string {
  return path.join(DIR, `${clientRef}.jsonl`);
}

/**
 * Costed HERE, at write time, with the price in force today — not recomputed at
 * read time. A ledger line is a statement of what something cost when it
 * happened; repricing history with today's table would rewrite August's spend
 * the moment September's prices land.
 */
export async function recordSpend(
  clientRef: string,
  e: {
    kind: SpendKind;
    model: string;
    tokensIn: number;
    tokensOut: number;
    /** Input tokens written to the prompt cache — billed at a premium. */
    cacheWriteTokens?: number;
    /** Input tokens served from the prompt cache — billed at a discount. */
    cacheReadTokens?: number;
    searchRequests?: number;
  }
): Promise<SpendEntry> {
  const tokenCostUsd = estimateCost(e.model, e.tokensIn, e.tokensOut, new Date(), {
    write: e.cacheWriteTokens,
    read: e.cacheReadTokens,
  });
  const searchCostUsd = searchCost(e.searchRequests ?? 0);
  const entry: SpendEntry = {
    at: new Date().toISOString(),
    kind: e.kind,
    model: e.model,
    tokensIn: e.tokensIn,
    tokensOut: e.tokensOut,
    cacheWriteTokens: e.cacheWriteTokens ?? 0,
    cacheReadTokens: e.cacheReadTokens ?? 0,
    searchRequests: e.searchRequests ?? 0,
    tokenCostUsd,
    searchCostUsd,
    totalUsd: tokenCostUsd + searchCostUsd,
  };
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(fileFor(clientRef), JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export async function listSpend(clientRef: string): Promise<SpendEntry[]> {
  try {
    const raw = await fs.readFile(fileFor(clientRef), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as SpendEntry);
  } catch {
    return [];
  }
}

export interface SpendSummary {
  totalUsd: number;
  tokenCostUsd: number;
  searchCostUsd: number;
  searchRequests: number;
  tokensIn: number;
  tokensOut: number;
  /** Input tokens written to the prompt cache — billed at a premium. */
  cacheWriteTokens?: number;
  /** Input tokens served from the prompt cache — billed at a discount. */
  cacheReadTokens?: number;
  count: number;
  byKind: Array<{
    kind: SpendKind;
    label: string;
    count: number;
    totalUsd: number;
    searchRequests: number;
  }>;
}

export function summarizeSpend(entries: SpendEntry[]): SpendSummary {
  const byKind = new Map<SpendKind, SpendSummary["byKind"][number]>();
  const sum: SpendSummary = {
    totalUsd: 0,
    tokenCostUsd: 0,
    searchCostUsd: 0,
    searchRequests: 0,
    tokensIn: 0,
    tokensOut: 0,
    count: entries.length,
    byKind: [],
  };
  for (const e of entries) {
    sum.totalUsd += e.totalUsd;
    sum.tokenCostUsd += e.tokenCostUsd;
    sum.searchCostUsd += e.searchCostUsd;
    sum.searchRequests += e.searchRequests;
    sum.tokensIn += e.tokensIn;
    sum.tokensOut += e.tokensOut;
    const row = byKind.get(e.kind) ?? {
      kind: e.kind,
      label: SPEND_LABELS[e.kind] ?? e.kind,
      count: 0,
      totalUsd: 0,
      searchRequests: 0,
    };
    row.count += 1;
    row.totalUsd += e.totalUsd;
    row.searchRequests += e.searchRequests;
    byKind.set(e.kind, row);
  }
  sum.byKind = [...byKind.values()].sort((a, b) => b.totalUsd - a.totalUsd);
  return sum;
}
