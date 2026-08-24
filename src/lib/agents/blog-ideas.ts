// ---------------------------------------------------------------------------
// Blog planner.
//
// The wire ideas agent proposes releases that borrow someone else's search
// demand. This one plans a DAY of posts on Coinpresso's own domain, which is a
// different problem with a different failure mode.
//
// Five to eight a day on one domain is a rate that only survives if the set has
// genuine variety and each piece carries something a competitor could not
// publish. So the planner is constrained on three axes at once:
//
//   pillars   — the day spreads across services, so the cluster grows evenly
//               rather than one hub getting forty posts and the rest none
//   formats   — no more than two of any content type in a day, because eight
//               guides in a row is the single most recognisable signature of
//               machine-written content
//   novelty   — every proposal names the specific already-planned post it is
//               not a rewrite of
//
// Each idea also declares what would make it original. Where that thing is
// Coinpresso's own data, the planner says so plainly instead of inventing it —
// a post that needs a figure nobody has is a post to shelve, not to fake.
// ---------------------------------------------------------------------------

import { callClaude, extractJson } from "../providers/anthropic";
import { MODELS } from "../models";
import { BLOG_ARCHIVE_ID, CONTENT_TYPE_LIST, PILLARS } from "../blog";
import { allArticles } from "../archive-store";
import { listRuns } from "../store";
import type { ContentTypeId } from "../blog";

export interface BlogIdea {
  id: string;
  title: string;
  keywords: string[];
  pillar: string;
  contentType: ContentTypeId;
  buyerQuestion: string;
  /** What makes this worth publishing rather than reassembling. */
  originality: string;
  /** True when the originality above depends on data only Coinpresso holds. */
  needsClientData: boolean;
  rationale: string;
  differentiator: string;
  confidence: "high" | "medium" | "speculative";
}

const SYSTEM = `You are the editorial planner for Coinpresso's own blog. Coinpresso
is a crypto marketing agency. This is their own domain — not a client's, not a
newswire. The reader is a founder or marketing lead at a token project who is
deciding whether to hire an agency, and who has been pitched by five others this
month.

You do not write posts. You plan the day.

WHAT YOU ARE OPTIMISING

A cluster, not a pile. Each post belongs to one service pillar, links to that
pillar's hub, and covers a sub-topic the hub does not. Over weeks this makes the
pillar the obvious answer to its question; a day of unrelated posts makes
nothing.

HARD CONSTRAINTS

1. Spread the day across at least three different pillars. Never more than three
   posts on one pillar in a single day.
2. Vary the format. No more than two posts of the same content type in a day. A
   day that is all guides is the exact pattern that reads as machine output.
3. Every post must have a stated source of originality — a named example, a
   figure, a limitation others will not admit, or a position a competitor would
   not take. If the only thing that would make it original is data Coinpresso
   holds and has not supplied, set needsClientData true and say exactly what
   figure would be needed. Do NOT invent the figure.
4. Never propose two posts that answer the same question. State in
   differentiator which other post in this batch, or which already-published
   post, each one is not a duplicate of.
5. No price predictions, no token promotion, no presale figures. That is the
   wire programme; this is not.

BE HONEST IN confidence. "speculative" is the right answer for a post that
depends on research that may not find anything, and it is more useful than an
optimistic guess.

Return ONLY a JSON object: { "ideas": [ ... ] }`;

export interface BlogIdeaRequest {
  clientRef: string;
  count: number;
  /** Optional pillar to weight the day toward. */
  pillar?: string;
  steer?: string;
}

/**
 * Everything already on the blog, from both directions: posts this system has
 * planned, and posts already live on coinpresso.io imported through the
 * WordPress integration.
 *
 * The second source is the one that matters. Without it the planner only knows
 * what it has proposed itself, and confidently suggests a guide to crypto PR
 * for a site that published one two years ago.
 */
async function priorBlogWork(clientRef: string): Promise<
  Array<{ title: string; pillar?: string; contentType?: string; at: string; live?: boolean }>
> {
  const runs = await listRuns(clientRef);
  const planned = runs
    .filter((r) => r.brief.track === "blog")
    .slice(0, 120)
    .map((r) => ({
      title: r.brief.title,
      pillar: r.brief.pillar,
      contentType: r.brief.contentType,
      at: r.createdAt.slice(0, 10),
    }));

  const live = (await allArticles(BLOG_ARCHIVE_ID)).slice(0, 250).map((a) => ({
    title: a.title,
    pillar: a.angle === "unmapped" ? undefined : a.angle,
    contentType: undefined,
    at: a.publishedAt,
    live: true,
  }));

  return [...planned, ...live];
}

export async function runBlogIdeas(req: BlogIdeaRequest): Promise<{
  ideas: BlogIdea[];
  tokensIn: number;
  tokensOut: number;
}> {
  const prior = await priorBlogWork(req.clientRef);

  const pillarCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  prior.forEach((p) => {
    if (p.pillar) pillarCount.set(p.pillar, (pillarCount.get(p.pillar) ?? 0) + 1);
    if (p.contentType)
      typeCount.set(p.contentType, (typeCount.get(p.contentType) ?? 0) + 1);
  });

  const today = new Date().toISOString().slice(0, 10);

  const user = `Today is ${today}. Plan ${req.count} posts for Coinpresso's own blog.
${req.pillar ? `\nThe operator wants the day weighted toward the "${req.pillar}" pillar — but still spread across at least three.\n` : ""}${req.steer ? `\nOPERATOR STEER: ${req.steer}\n` : ""}
PILLARS — every post belongs to exactly one, by id:
${PILLARS.map(
  (p) =>
    `- ${p.id} — ${p.name}. Hub: ${p.hub}. Planned so far: ${pillarCount.get(p.id) ?? 0}.
  The buyer's real worry: ${p.buyerQuestion}
  Seed sub-topics (extend these, you are not limited to them):
${p.clusters.map((c) => `    · ${c}`).join("\n")}`
).join("\n\n")}

CONTENT TYPES — pick one per post, by id:
${CONTENT_TYPE_LIST.map(
  (t) =>
    `- ${t.id} — ${t.name}. ${t.shape} ${t.words[0]}-${t.words[1]} words. Job: ${t.job} Used ${typeCount.get(t.id) ?? 0}× so far.`
).join("\n")}

--- ALREADY ON THIS BLOG (${prior.length}: ${prior.filter((p) => p.live).length} live on coinpresso.io, ${prior.filter((p) => !p.live).length} planned here) ---

This list is context, not a list of banned topics. The published posts are on the
site mainly as evidence of how Coinpresso writes; the writer studies them for
voice. Use them here only to avoid proposing a straight re-run of something that
already exists — and if the right move IS a new version of an old post, propose
it and say in the rationale which post it replaces and what has changed.

${
  prior.length
    ? prior
        .slice(0, 90)
        .map((p) => `- ${p.at} · ${p.live ? "LIVE" : "planned"} · ${p.pillar ?? "?"} · ${p.title}`)
        .join("\n")
    : "- nothing yet, and nothing imported from coinpresso.io. Say so in your rationale: without the live archive you cannot tell whether these already exist. Lead with the pillars that carry the most commercial weight: GEO, presale marketing and crypto PR."
}

---

Return JSON:
{
  "ideas": [
    {
      "title": "the H1 as it would publish — question-shaped where natural, sentence case",
      "keywords": ["primary first", "secondary"],
      "pillar": "one of the pillar ids above",
      "contentType": "one of the content type ids above",
      "buyerQuestion": "what the reader is actually worried about, in their words",
      "originality": "the specific thing that makes this worth publishing",
      "needsClientData": true or false,
      "rationale": "why this post, and what the research agent must verify",
      "differentiator": "which other post — in this batch or already published — this is not a duplicate of, and why",
      "confidence": "high | medium | speculative"
    }
  ]
}`;

  const r = await callClaude({
    model: MODELS.strategy,
    system: SYSTEM,
    user,
    maxTokens: 8000,
    temperature: 0.8,
  });

  const parsed = extractJson<{ ideas: Omit<BlogIdea, "id">[] }>(r.text);
  const ideas: BlogIdea[] = (parsed.ideas ?? []).map((i, n) => ({
    ...i,
    id: `blog_idea_${Date.now()}_${n}`,
    keywords: i.keywords ?? [],
    needsClientData: Boolean(i.needsClientData),
  }));

  return { ideas, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
}

/**
 * Mock plan. Deliberately spread across pillars and formats so the shape of a
 * real day is visible without keys — but every rationale says it is a mock, so
 * nobody mistakes the placeholder for a plan.
 */
export async function mockBlogIdeas(req: BlogIdeaRequest): Promise<BlogIdea[]> {
  await new Promise((r) => setTimeout(r, 1200));

  const seeds: Array<[string, string, ContentTypeId, string]> = [
    [
      "Why does ChatGPT never mention your token project?",
      "geo",
      "guide",
      "generative engine optimisation crypto",
    ],
    [
      "GEO vs SEO for crypto projects: what actually differs",
      "geo",
      "comparison",
      "geo vs seo",
    ],
    [
      "What a crypto newswire placement does and does not buy you",
      "crypto-pr",
      "opinion",
      "crypto pr agency",
    ],
    [
      "A presale launch timeline that survives contact with reality",
      "presale-marketing",
      "guide",
      "crypto presale marketing",
    ],
    [
      "How crypto clipping campaigns are actually priced",
      "clipping",
      "data",
      "crypto clipping",
    ],
    [
      "Your Telegram is full of bots. Here is how to tell how many.",
      "community",
      "teardown",
      "crypto community management",
    ],
    [
      "Where can crypto projects still buy ads in 2026?",
      "paid",
      "faq",
      "crypto advertising platforms",
    ],
    [
      "What we changed after a presale campaign underperformed",
      "presale-marketing",
      "case-note",
      "presale marketing case study",
    ],
  ];

  return Array.from({ length: Math.min(req.count, seeds.length) }, (_, n) => {
    const [title, pillar, contentType, kw] = seeds[n];
    return {
      id: `blog_idea_mock_${n}`,
      title,
      keywords: [kw, "crypto marketing agency"],
      pillar,
      contentType,
      buyerQuestion: PILLARS.find((p) => p.id === pillar)?.buyerQuestion ?? "",
      originality:
        "Mock plan — no research was performed and nothing here has been checked against what already ranks.",
      needsClientData: contentType === "data" || contentType === "case-note",
      rationale:
        "Mock idea. Add model keys for a real plan built from what is already on the blog and what is already ranking.",
      differentiator: "Mock run.",
      confidence: "speculative" as const,
    };
  });
}
