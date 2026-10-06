// ---------------------------------------------------------------------------
// Coinpresso's own findings: Liam's data the public web does not have.
//
// Liam, 5 Oct: "We always need to give an answer. The agent is avoiding
// giving answers (due to lack of data which is understandable) so we need to
// completely switch that up with figures, retainers, spends, exact case study
// data relevant to that topic." The writer may only use figures it has been
// given, so the figures have to come from somewhere. This is where: Liam (or
// Bernard) types a finding once, and every relevant post after that can
// answer with it.
//
// Two kinds:
//   finding — a figure, a range, a case-study result, a view from the work.
//             The writer may state it, attributed to Coinpresso.
//   link    — a post or page already written. A coinpresso.io URL becomes a
//             page the writer may link; anything else is background only.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";

export type InsightKind = "finding" | "link";

export interface Insight {
  id: string;
  kind: InsightKind;
  /** Short label: "Presale marketing budgets, 2025-26". */
  title: string;
  /** The finding itself, in Liam's words. For a link, what the page covers. */
  body: string;
  url?: string;
  /** Topics it applies to: "presale", "KOL", "PR". */
  tags: string[];
  /**
   * Attached to particular topics (seed topic ids) or posts (run ids).
   * Bernard, 5 Oct: "it needs to be attached to an upcoming topic or blog
   * post already written". An attached finding always reaches that post,
   * whatever words it shares with it.
   */
  topicIds?: string[];
  runIds?: string[];
  author?: string;
  createdAt: string;
  updatedAt: string;
}

const DIR = dataDir("insights");
const fileFor = (ref: string) => path.join(DIR, `${ref}.json`);

export async function listInsights(ref: string): Promise<Insight[]> {
  try {
    const xs = JSON.parse(await fs.readFile(fileFor(ref), "utf8")) as Insight[];
    return xs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

async function writeAll(ref: string, xs: Insight[]): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${fileFor(ref)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(xs, null, 2), "utf8");
  await fs.rename(tmp, fileFor(ref));
}

export function cleanInsight(input: Partial<Insight>): Omit<Insight, "id" | "createdAt" | "updatedAt"> {
  const kind: InsightKind = input.kind === "link" ? "link" : "finding";
  const url = input.url?.trim() || undefined;
  if (url && !/^https?:\/\/\S+$/i.test(url)) throw new Error("The link has to be a full web address, starting https://");
  if (kind === "link" && !url) throw new Error("Add the link.");
  const body = (input.body ?? "").trim();
  if (kind === "finding" && body.length < 10) throw new Error("Write the finding — a sentence or two at least.");
  const title = (input.title ?? "").trim() || body.split(/[.\n]/)[0].slice(0, 80) || url || "Untitled";
  const tags = [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  const ids = (xs?: string[]) => [...new Set((xs ?? []).map((x) => String(x).replace(/[^A-Za-z0-9_-]/g, "")).filter(Boolean))];
  return {
    kind, title, body, url, tags,
    author: input.author?.trim() || undefined,
    topicIds: ids(input.topicIds),
    runIds: ids(input.runIds),
  };
}

export async function addInsight(ref: string, input: Partial<Insight>): Promise<Insight> {
  const now = new Date().toISOString();
  const x: Insight = { id: `ins_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...cleanInsight(input), createdAt: now, updatedAt: now };
  const all = await listInsights(ref);
  await writeAll(ref, [x, ...all]);
  return x;
}

export async function updateInsight(ref: string, id: string, input: Partial<Insight>): Promise<Insight | null> {
  const all = await listInsights(ref);
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const merged = { ...all[i], ...input };
  all[i] = { ...all[i], ...cleanInsight(merged), updatedAt: new Date().toISOString() };
  await writeAll(ref, all);
  return all[i];
}

export async function deleteInsight(ref: string, id: string): Promise<boolean> {
  const all = await listInsights(ref);
  const left = all.filter((x) => x.id !== id);
  if (left.length === all.length) return false;
  await writeAll(ref, left);
  return true;
}

// --- Choosing what a post gets ---------------------------------------------

const STOP = new Set(
  "the a an and or of to in on for with by from at is are be it its this that your you our we how what why when which best guide crypto web3 marketing agency agencies 2024 2025 2026 vs top".split(" ")
);
const words = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9.\s-]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/s$/, ""));

/**
 * The findings that bear on a post: the ones attached to it, then the rest ranked
 * by how many of the post's distinctive words they share. A tag match counts
 * double — Liam tagged it for that topic on purpose.
 */
export function isAttached(x: Insight, to: { topicId?: string; runId?: string }): boolean {
  return Boolean(
    (to.topicId && x.topicIds?.includes(to.topicId)) || (to.runId && x.runIds?.includes(to.runId))
  );
}

export function relevantInsights(
  all: Insight[],
  subject: string,
  limit = 10,
  to: { topicId?: string; runId?: string } = {}
): Insight[] {
  const want = new Set(words(subject));
  const scored = all
    .map((x) => {
      const tagHits = x.tags.filter((t) => words(t).some((w) => want.has(w))).length;
      const textHits = new Set(words(`${x.title} ${x.body}`).filter((w) => want.has(w))).size;
      // Attached to this post or its topic: first, always.
      return { x, score: isAttached(x, to) ? 2000 : tagHits * 2 + textHits };
    })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.x);
}

/** The prompt block. Empty string when there is nothing relevant. */
export function houseDataBlock(xs: Insight[]): string {
  const findings = xs.filter((x) => x.kind === "finding");
  const links = xs.filter((x) => x.kind === "link");
  if (!xs.length) return "";
  const out: string[] = [
    `COINPRESSO'S OWN DATA — from Liam, from Coinpresso's client work. Not public, and
not in the research ledger, but TRUE and ALLOWED: you may state these figures.
Attribute them to Coinpresso in plain words ("across the presale campaigns
Coinpresso has run"), never to a URL, and never stretch them: a range stays a
range, a single case stays a single case. Do not name a client unless the
finding names it. These are Liam's NOTES TO YOU, not copy: lines addressed to
the writer ("make sure we…", "we need to answer…") are instructions to follow,
never sentences to paraphrase into the post.

HOW TO USE THEM — Liam, 6 Oct: "it's sort of stuffed what I said in the first
paragraph as opposed to providing a proper answer… This won't get lifted by AIs,
needs to be its own heading and structured content."
1. THE OPENING gives the headline answer in ONE plain sentence (the floor, the
   range, the verdict) — not a summary of every figure below. One or two
   numbers at most.
2. THE ANSWER SECTION. Give the figures their own H2, early (the first or
   second section), headed with the reader's question in Title Case as a noun
   phrase: "Crypto Presale Marketing Budget in 2026: The Numbers", "What a
   Month-One Presale Budget Covers". Under it:
   - first, a 40-60 word answer paragraph that stands on its own if quoted
     alone: the number, what it covers, the condition;
   - then the breakdown as STRUCTURE — a table (line item | amount | what it
     buys) or a short list, one figure per row, with labels a reader can scan;
   - then how it scales: where to start, what to add as results come in.
   With a fixed outline from the brief, put this block at the top of the
   outline section that covers cost or the question, rather than adding a
   heading.
TWO REGISTERS. Liam, 6 Oct: "my writing style should be used for intros and
to string the article together, but when we need to provide a proper answer"
it is plain and structured. The house voice — asides, turns of phrase,
analogies — belongs to the opening and the connective sections. The answer
section has none of it: no metaphor, no wind-up, no aside. The answer, the
table, the condition, in short declarative sentences.
3. ELSEWHERE, use a figure only where that section's point needs it, in a
   sentence that explains it — never re-list the breakdown, never repeat a
   figure the answer section already gave.`,
  ];
  for (const f of findings) out.push(`- ${f.title}: ${f.body.replace(/\s+/g, " ").slice(0, 900)}`);
  if (links.length) {
    out.push("\nPOSTS AND PAGES LIAM POINTED TO (coinpresso.io ones may be linked; others are background only, never cited):");
    for (const l of links) out.push(`- ${l.url} — ${l.title}${l.body ? `: ${l.body.slice(0, 200)}` : ""}`);
  }
  return out.join("\n");
}

/** coinpresso.io links Liam added, as linkable pages for the writer. */
export function insightPages(xs: Insight[]): Array<{ url: string; topic: string }> {
  return xs
    .filter((x) => x.kind === "link" && x.url && /^https?:\/\/(www\.)?coinpresso\.io\//i.test(x.url))
    .map((x) => ({ url: x.url!, topic: x.title }));
}
