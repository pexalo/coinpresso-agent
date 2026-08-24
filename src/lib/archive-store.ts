// ---------------------------------------------------------------------------
// Persistence for the published archive.
//
// The seed in archive.ts is a starting point compiled into the bundle. This is
// the living record: articles added after deploy, and — the part that matters —
// their FULL TEXT.
//
// Metadata alone answers "have we written this already?". It cannot answer "does
// this sound like us?", because there is no prose in it. Style is carried in the
// sentences, so the body has to be stored for the writer to learn from examples
// rather than from a list of rules about examples.
//
// In HQ: a `published_articles` table, with `body` in a text column and an
// embedding column once retrieval needs to be smarter than the heuristic below.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { MOONBERG_ARCHIVE, type PublishedArticle } from "./archive";

const DIR = path.join(process.cwd(), ".data", "archive");

/** A stored article — the seed shape plus the text and where it came from. */
export interface StoredArticle extends PublishedArticle {
  id: string;
  /** Full article text. Absent on seeded rows until someone imports it. */
  body?: string;
  wordCount?: number;
  source: "seed" | "paste" | "fetch" | "run";
  addedAt?: string;
}

function fileFor(campaignId: string): string {
  return path.join(DIR, `${campaignId}.json`);
}

export function idFor(a: { publishedAt: string; title: string }): string {
  const slug = a.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${a.publishedAt}_${slug}`;
}

async function readAdded(campaignId: string): Promise<StoredArticle[]> {
  try {
    const raw = await fs.readFile(fileFor(campaignId), "utf8");
    return JSON.parse(raw) as StoredArticle[];
  } catch {
    return [];
  }
}

async function writeAdded(
  campaignId: string,
  rows: StoredArticle[]
): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(fileFor(campaignId), JSON.stringify(rows, null, 2), "utf8");
}

/**
 * Seed rows merged with everything added since. A stored row wins over a seed
 * row with the same id, which is how a seeded title gains its body once someone
 * imports the text.
 */
export async function allArticles(
  campaignId: string
): Promise<StoredArticle[]> {
  const seed: StoredArticle[] =
    campaignId === "moonberg"
      ? MOONBERG_ARCHIVE.map((a) => ({ ...a, id: idFor(a), source: "seed" }))
      : [];

  const added = await readAdded(campaignId);
  const byId = new Map<string, StoredArticle>();
  seed.forEach((a) => byId.set(a.id, a));
  added.forEach((a) => byId.set(a.id, { ...byId.get(a.id), ...a }));

  return [...byId.values()].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );
}

export async function upsertArticle(
  campaignId: string,
  article: Omit<StoredArticle, "id"> & { id?: string }
): Promise<StoredArticle> {
  const rows = await readAdded(campaignId);
  const id = article.id ?? idFor(article);
  const body = article.body?.trim();

  const record: StoredArticle = {
    ...article,
    id,
    body: body || undefined,
    wordCount: body ? body.split(/\s+/).filter(Boolean).length : undefined,
    addedAt: new Date().toISOString(),
  };

  const at = rows.findIndex((r) => r.id === id);
  if (at >= 0) rows[at] = { ...rows[at], ...record };
  else rows.push(record);

  await writeAdded(campaignId, rows);
  return record;
}

export async function deleteArticle(
  campaignId: string,
  id: string
): Promise<void> {
  const rows = await readAdded(campaignId);
  await writeAdded(
    campaignId,
    rows.filter((r) => r.id !== id)
  );
}

// ---------------------------------------------------------------------------
// Style exemplars
// ---------------------------------------------------------------------------

/**
 * Pick the published pieces most worth showing the writer as examples.
 *
 * A rules list ("British English, no contractions, 22-word sentences") gets you
 * a piece that obeys the rules. Two real articles get you a piece that sounds
 * like the client — models imitate demonstrated prose far better than they
 * follow described prose.
 *
 * Selection is a heuristic on purpose: same wire first, because house shape
 * varies more by outlet than by asset; then recency, because the voice drifts;
 * then a different angle from the one being written, so the exemplar teaches
 * cadence without inviting the writer to reuse its argument.
 */
export async function styleExemplars(
  campaignId: string,
  opts: { publication: string; excludeAngle?: string; limit?: number }
): Promise<StoredArticle[]> {
  const withText = (await allArticles(campaignId)).filter(
    (a) => a.kind !== "competitor" && a.body && a.body.length > 400
  );
  if (!withText.length) return [];

  const scored = withText.map((a) => {
    let score = 0;
    if (a.publication === opts.publication) score += 10;
    if (opts.excludeAngle && a.angle === opts.excludeAngle) score -= 4;
    // Recency, in days, capped so an old-but-same-wire piece still wins.
    const age = Math.max(
      0,
      (Date.now() - Date.parse(a.publishedAt)) / 86_400_000
    );
    score += Math.max(0, 6 - age / 7);
    return { a, score };
  });

  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, opts.limit ?? 2)
    .map((x) => x.a);
}

/** The few-shot block injected into the writer prompt. */
export function exemplarBlock(items: StoredArticle[]): string {
  if (!items.length) return "";
  return `HOW THIS CLIENT ACTUALLY WRITES — study these, then write like them.

These are real published pieces. Match their rhythm, paragraph length, how they
open, how they attribute a forecast, how they move from the market into the
product, and how they close. Do NOT reuse their sentences, their argument or
their sources — only their voice.

${items
  .map(
    (a, i) =>
      `--- EXAMPLE ${i + 1} · ${a.publication} · ${a.publishedAt} ---
${a.title}

${a.body?.slice(0, 4500)}`
  )
  .join("\n\n")}

--- END OF EXAMPLES ---`;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Pull readable text out of a published page. Best-effort by design. */
export async function fetchArticleText(url: string): Promise<{
  ok: boolean;
  title?: string;
  body?: string;
  detail?: string;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; PexaloArchive/1.0; +https://pexalo.com)",
      },
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };

    const html = await res.text();
    const title =
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? undefined;

    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#8217;|&rsquo;/g, "’")
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (body.length < 500) {
      return {
        ok: false,
        title,
        detail:
          "The page returned very little text — it is probably rendered by JavaScript or behind a wall. Paste the article text instead.",
      };
    }
    return { ok: true, title, body };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Prior-work block built from the live store rather than the compiled seed. */
export async function priorWorkFromStore(
  campaignId: string,
  n = 20
): Promise<string> {
  const rows = await allArticles(campaignId);
  if (!rows.length) return "";
  const items = rows.slice(0, n);

  const angles = new Map<string, number>();
  rows.forEach((a) => angles.set(a.angle, (angles.get(a.angle) ?? 0) + 1));
  const worked = [...angles.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k} (${v}x)`)
    .join(", ");

  return `PUBLISHED ALREADY — do not repeat these.

The programme has run ${rows.length} releases. Most-worked angles: ${worked}.
Sixty near-identical releases is a recognisable pattern, and the defence is
variety across the set rather than polish on any one piece.

Recent titles:
${items.map((a) => `- ${a.publishedAt} · ${a.publication} · ${a.title}`).join("\n")}

Requirements that follow:
- Do not reuse a headline construction that appears above.
- Do not rebuild the same comparison set.
- Vary the structure against recent pieces.
- The featured asset may repeat — the market decides that. The ANGLE must not.`;
}

// ---------------------------------------------------------------------------
// Competitor intelligence
// ---------------------------------------------------------------------------

/**
 * Competitor rows are kept in the same store but never used as style exemplars —
 * imitating a rival's voice is the opposite of the point. They feed the IDEAS
 * agent, which reads what the competition is hanging its releases on and looks
 * for the angle nobody has taken.
 */
export async function ownWork(campaignId: string): Promise<StoredArticle[]> {
  return (await allArticles(campaignId)).filter((a) => a.kind !== "competitor");
}

export async function competitorWork(
  campaignId: string
): Promise<StoredArticle[]> {
  return (await allArticles(campaignId)).filter((a) => a.kind === "competitor");
}

/** Bulk import. One row per line: title | keywords | wire | date | angle | url */
export interface BulkRow {
  title: string;
  keywords: string[];
  publication?: string;
  publishedAt?: string;
  angle?: string;
  url?: string;
  competitor?: string;
}

export function parseBulk(text: string, kind: "own" | "competitor"): BulkRow[] {
  const rows: BulkRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    // Pipe, tab or comma-with-quotes all appear in real exports. Pipe and tab
    // are unambiguous; a bare comma line is treated as title-only, because
    // headlines are full of commas and guessing wrong corrupts the archive.
    const parts = line.includes("|")
      ? line.split("|")
      : line.includes("\t")
        ? line.split("\t")
        : [line];

    const [title, keywords, publication, publishedAt, angle, url] = parts.map(
      (p) => p.trim()
    );
    if (!title) continue;

    rows.push({
      title,
      keywords: (keywords ?? "")
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean),
      publication: publication || undefined,
      publishedAt: publishedAt || undefined,
      angle: angle || undefined,
      url: url || undefined,
      competitor: kind === "competitor" ? "unspecified" : undefined,
    });
  }
  return rows;
}

export async function bulkImport(
  campaignId: string,
  rows: BulkRow[],
  kind: "own" | "competitor"
): Promise<{ added: number; skipped: number }> {
  const existing = await readAdded(campaignId);
  const seen = new Set((await allArticles(campaignId)).map((a) => a.id));
  let added = 0;
  let skipped = 0;

  for (const r of rows) {
    const publishedAt = r.publishedAt || new Date().toISOString().slice(0, 10);
    const id = idFor({ publishedAt, title: r.title });
    if (seen.has(id)) {
      skipped++;
      continue;
    }
    existing.push({
      id,
      kind,
      competitor: r.competitor,
      publishedAt,
      publication: r.publication || "openpr",
      title: r.title,
      keywords: r.keywords,
      url: r.url,
      angle: r.angle || "Unclassified",
      source: "paste",
      addedAt: new Date().toISOString(),
    });
    seen.add(id);
    added++;
  }

  await writeAdded(campaignId, existing);
  return { added, skipped };
}
