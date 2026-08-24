// ---------------------------------------------------------------------------
// Importing coinpresso.io into the archive.
//
// WHAT THIS IS FOR: style. The posts already on coinpresso.io are here as
// examples of how Coinpresso writes, not as a canon of what may be written
// about. Until now the blog writer worked from a DESCRIPTION of the voice — a
// style block someone typed out — because there was nothing else to give it, and
// a description gets you a post that obeys the description. Models imitate
// demonstrated prose far better than they follow rules about prose, so two real
// posts are worth more than any amount of style guide.
//
// A secondary and much weaker use: the planner sees the titles, so it does not
// propose a straight re-run of something published last year. That is a nudge,
// not a veto — a better version of an old post is a legitimate thing to write,
// and the archive is not a list of banned topics.
//
// (The wire archive is the opposite case. Sixty Moonberg releases in three weeks
// makes repetition the live risk there, so that archive IS used as a hard
// don't-repeat check. Same store, two different jobs.)
//
// Two decisions worth keeping:
//
// Bodies are stored as TEXT, not HTML. What a model learns from a piece is its
// rhythm, its paragraph length and how a sentence turns — none of which lives in
// the markup, and all of which is harder to read through it.
//
// A re-import updates rather than duplicates. The store keys on date-plus-slug,
// so running the import twice is safe and running it weekly picks up whatever
// was published since.
// ---------------------------------------------------------------------------

import { BLOG_ARCHIVE_ID, BLOG_PUBLICATION, PILLARS } from "./blog";
import { allArticles, upsertArticle } from "./archive-store";
import { listPosts, textFromHtml, type WpConfig, type WpPost } from "./wordpress";

export interface ImportProgress {
  imported: number;
  updated: number;
  skipped: number;
  pagesRead: number;
  totalPages: number;
  totalPosts: number;
  errors: string[];
}

/** Posts shorter than this are almost always stubs, redirects or landing pages. */
const MIN_WORDS = 150;

/** Which pillar a WordPress category belongs to, if any. */
function pillarForCategories(ids: number[]): string | undefined {
  for (const p of PILLARS) {
    if (p.wp && ids.includes(p.wp.id)) return p.id;
  }
  return undefined;
}

/**
 * `angle` on a blog row carries the pillar where one is mapped, and the word
 * "unmapped" where none is. That makes the gap countable — the planner can only
 * grow clusters it can see, and a category with no pillar is work the planning
 * model does not know exists.
 */
function rowFor(post: WpPost, body: string) {
  const pillar = pillarForCategories(post.categories);
  return {
    kind: "own" as const,
    publishedAt: post.date.slice(0, 10),
    publication: BLOG_PUBLICATION,
    title: post.title,
    keywords: [],
    url: post.link,
    angle: pillar ?? "unmapped",
    body,
    source: "wordpress" as const,
  };
}

export interface ImportOptions {
  /** Stop after this many pages. Guards against a runaway on a huge archive. */
  maxPages?: number;
  perPage?: number;
  /** Only import posts published on or after this ISO date. */
  since?: string;
}

/**
 * Walk the blog newest-first and write every substantial post into the archive.
 *
 * Sequential rather than parallel on purpose. This runs against a client's
 * production WordPress, usually behind a cache plugin and sometimes a shared
 * host; ten concurrent requests to save forty seconds is a bad trade against
 * making their site slow for real visitors.
 */
export async function importBlog(
  cfg: WpConfig,
  opts: ImportOptions = {}
): Promise<ImportProgress> {
  const perPage = opts.perPage ?? 50;
  const maxPages = opts.maxPages ?? 30;

  const existing = new Map(
    (await allArticles(BLOG_ARCHIVE_ID)).map((a) => [a.id, a])
  );

  const progress: ImportProgress = {
    imported: 0,
    updated: 0,
    skipped: 0,
    pagesRead: 0,
    totalPages: 0,
    totalPosts: 0,
    errors: [],
  };

  for (let page = 1; page <= maxPages; page++) {
    let batch;
    try {
      batch = await listPosts(cfg, page, perPage);
    } catch (e) {
      progress.errors.push(
        `Page ${page}: ${e instanceof Error ? e.message : String(e)}`
      );
      break;
    }

    progress.pagesRead = page;
    progress.totalPages = batch.totalPages;
    progress.totalPosts = batch.total;

    for (const post of batch.posts) {
      if (post.status !== "publish") {
        progress.skipped++;
        continue;
      }
      if (opts.since && post.date.slice(0, 10) < opts.since) {
        progress.skipped++;
        continue;
      }

      const body = textFromHtml(post.html);
      const words = body.split(/\s+/).filter(Boolean).length;
      if (words < MIN_WORDS) {
        progress.skipped++;
        continue;
      }

      const row = rowFor(post, body);
      const id = `${row.publishedAt}_${post.slug}`.slice(0, 80);
      const had = existing.has(id);

      try {
        await upsertArticle(BLOG_ARCHIVE_ID, { ...row, id });
        if (had) progress.updated++;
        else progress.imported++;
      } catch (e) {
        progress.errors.push(
          `${post.title}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    if (page >= batch.totalPages) break;
  }

  return progress;
}

/** What the archive currently holds for the blog, for the integration page. */
export interface BlogArchiveStats {
  total: number;
  withBody: number;
  words: number;
  newest?: string;
  oldest?: string;
  byPillar: Array<{ pillar: string; count: number }>;
  unmapped: number;
}

export async function blogArchiveStats(): Promise<BlogArchiveStats> {
  const rows = await allArticles(BLOG_ARCHIVE_ID);
  const withBody = rows.filter((r) => r.body && r.body.length > 400);
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(r.angle, (counts.get(r.angle) ?? 0) + 1));

  const dates = rows.map((r) => r.publishedAt).sort();

  return {
    total: rows.length,
    withBody: withBody.length,
    words: withBody.reduce((a, r) => a + (r.wordCount ?? 0), 0),
    newest: dates[dates.length - 1],
    oldest: dates[0],
    byPillar: PILLARS.map((p) => ({
      pillar: p.id,
      count: counts.get(p.id) ?? 0,
    })),
    unmapped: counts.get("unmapped") ?? 0,
  };
}
