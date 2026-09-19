// ---------------------------------------------------------------------------
// The client's internal-link map.
//
// Liam, 18 Sep 2026: "is there a way I can feed our meta mapping file into
// the agent so it knows all our internal links, anchors, and desired pages?
// I think this will make it much easier for the agent to fulfil the rules of
// each blog with internal linking without always relying on the same few."
//
// He is right about the cause. The writer knew 36 pages, each with one topic
// phrase, so every post reached for crypto SEO, GEO and PR and the linking
// read as the same three anchors forever. This store holds the whole site as
// the client maps it — every page, with the anchor phrases they want used —
// and the writer reads it on every run. Pasted as CSV from the Settings page;
// the compiled list in blog.ts stays as the floor a fresh install starts with.
//
// The topic string the writer sees carries the alternates joined with " | ",
// so the naming check accepts any of them and the anchor fixer prepends the
// first. One encoding, no second map threaded through every check.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";
import { COINPRESSO_PAGES, type SitePage } from "./blog";

const DIR = dataDir("link-map");

export interface MappedPage {
  url: string;
  /** The page's subject — what the writer links it for. */
  topic: string;
  /** Anchor phrases the client wants used, first one preferred. */
  anchors: string[];
}

export interface LinkMap {
  pages: MappedPage[];
  updatedAt: string;
  /** Where it came from — "pasted by Liam, 18 Sep" or similar. */
  source?: string;
}

function fileFor(clientRef: string): string {
  return path.join(DIR, `${clientRef}.json`);
}

export async function readLinkMap(clientRef: string): Promise<LinkMap> {
  try {
    const raw = await fs.readFile(fileFor(clientRef), "utf8");
    const parsed = JSON.parse(raw) as Partial<LinkMap>;
    return {
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      updatedAt: parsed.updatedAt ?? "",
      source: parsed.source,
    };
  } catch {
    return { pages: [], updatedAt: "" };
  }
}

export async function saveLinkMap(
  clientRef: string,
  pages: MappedPage[],
  source?: string
): Promise<LinkMap> {
  await fs.mkdir(DIR, { recursive: true });
  const next: LinkMap = { pages, updatedAt: new Date().toISOString(), source };
  await fs.writeFile(fileFor(clientRef), JSON.stringify(next, null, 2));
  return next;
}

const norm = (u: string) => u.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

/**
 * Parse whatever the client's mapping export looks like.
 *
 * Flexible on purpose: a "meta mapping file" is an SEO working document, and
 * its columns are whatever the person who made it called them. The header row
 * decides: the first column mentioning url/link/page is the URL; every column
 * mentioning anchor/keyword/term/topic/title/h1 feeds the anchor list, in
 * that order of preference for the topic. Cells may hold several anchors
 * separated by | ; or newlines. Rows without a coinpresso.io URL are skipped
 * and reported, not silently dropped.
 */
export function parseLinkMap(text: string): { pages: MappedPage[]; skipped: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { pages: [], skipped: [] };

  const delim = (lines[0].match(/\t/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? "\t" : ",";
  const split = (line: string): string[] => {
    if (delim === "\t") return line.split("\t").map((c) => c.trim());
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const urlCol = header.findIndex((h) => /\b(url|link|page|address|slug|path)\b/.test(h));
  const anchorCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /anchor|keyword|term|topic|title|h1|name|subject/.test(h))
    .map(({ i }) => i);

  // No header we recognise: treat column 0 as URL, the rest as anchors.
  const hasHeader = urlCol >= 0;
  const rows = hasHeader ? lines.slice(1) : lines;
  const uCol = hasHeader ? urlCol : 0;
  const aCols = hasHeader && anchorCols.length ? anchorCols : header.map((_, i) => i).filter((i) => i !== uCol);

  const byUrl = new Map<string, MappedPage>();
  const skipped: string[] = [];
  for (const line of rows) {
    const cells = split(line);
    const rawUrl = cells[uCol] ?? "";
    const url = rawUrl.startsWith("/") ? `https://coinpresso.io${rawUrl}` : rawUrl;
    if (!/^https?:\/\/(www\.)?coinpresso\.io(\/|$)/i.test(url)) {
      skipped.push(line.slice(0, 80));
      continue;
    }
    const anchors = aCols
      .flatMap((i) => (cells[i] ?? "").split(/\s*[|;\n]\s*/))
      .map((a) => a.trim())
      .filter((a) => a && a.length <= 80);
    const key = norm(url);
    const existing = byUrl.get(key);
    const merged = [...new Set([...(existing?.anchors ?? []), ...anchors])];
    byUrl.set(key, {
      url: url.trim().replace(/\/+$/, ""),
      topic: merged[0] ?? existing?.topic ?? key.split("/").pop()!.replace(/-/g, " "),
      anchors: merged,
    });
  }
  return { pages: [...byUrl.values()], skipped };
}

/**
 * The pages the writer may link: the compiled floor, overlaid by the client's
 * map. Where both know a URL the map wins, and its anchors are appended to
 * the compiled topic so nothing the code already relied on stops matching.
 */
export async function linkablePages(clientRef?: string): Promise<SitePage[]> {
  const map = clientRef ? await readLinkMap(clientRef) : { pages: [] as MappedPage[] };
  const out = new Map<string, SitePage>();
  for (const p of COINPRESSO_PAGES) out.set(norm(p.url), { ...p });
  for (const m of map.pages) {
    const key = norm(m.url);
    const base = out.get(key);
    const phrases = [...new Set([...(base ? [base.topic] : []), m.topic, ...m.anchors])].filter(Boolean);
    out.set(key, { url: m.url, topic: phrases.join(" | ") });
  }
  return [...out.values()];
}

/** The prompt block: every page, its anchors, the pillar flagged. */
export function linkTargetsBlock(pages: SitePage[], pillarHub?: string): string {
  const pillar = pillarHub ? norm(pillarHub) : null;
  return pages
    .map((p) => {
      const [first, ...rest] = p.topic.split(" | ");
      const alts = rest.length ? ` (also: ${rest.slice(0, 4).join(", ")})` : "";
      return `- ${p.url} — ${first}${alts}${pillar && norm(p.url) === pillar ? " (THIS POST'S PILLAR — must be linked)" : ""}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Which of the client's own posts to offer as link targets.
// ---------------------------------------------------------------------------

const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with", "how",
  "what", "why", "when", "your", "you", "is", "are", "it", "that", "this",
  "guide", "complete", "ultimate", "best", "top", "2024", "2025", "2026",
  "crypto", "cryptocurrency", "web3", "coinpresso", "blog",
]);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

export interface LinkablePost {
  url?: string;
  title: string;
  publishedAt: string;
}

/**
 * Posts worth offering this article, by relevance first and recency second.
 *
 * Liam: "There are 100s of pages on Coinpresso.io and we don't need to always
 * look to fit the same 3-4 links into different articles, we should link to
 * relevant pages in line with the article topic."
 *
 * The writer was shown the fifteen MOST RECENT posts and nothing else, so
 * every article in a week drew from the same fifteen regardless of subject,
 * and a two-year-old post on exactly this topic was invisible. Now the whole
 * archive is ranked on how many real words its title shares with this
 * article's title and keywords — "crypto" and "guide" excluded, since every
 * post has them — with recency as the tie-break and a few recent posts kept
 * on the end so new work still gets linked.
 */
export function relevantPosts<T extends LinkablePost>(
  posts: T[],
  about: string,
  limit = 15,
  keepRecent = 4
): T[] {
  const want = terms(about);
  const live = posts.filter((p) => p.url && p.publishedAt);
  const byDate = [...live].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const scored = byDate
    .map((p) => {
      const overlap = [...terms(p.title)].filter((w) => want.has(w)).length;
      return { p, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.p.publishedAt.localeCompare(a.p.publishedAt));

  const out: T[] = [];
  const seen = new Set<string>();
  const take = (p: T) => {
    const k = norm(p.url ?? "");
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };
  for (const { p } of scored) {
    if (out.length >= limit - keepRecent) break;
    take(p);
  }
  for (const p of byDate) {
    if (out.length >= limit) break;
    take(p);
  }
  return out;
}
