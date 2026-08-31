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

import { billed, callClaude, extractJson } from "../providers/anthropic";
import { MODELS } from "../models";
import { BLOG_ARCHIVE_ID, CONTENT_TYPE_LIST, PILLARS } from "../blog";
import { allArticles } from "../archive-store";
import { listRuns } from "../store";
import type { ContentTypeId } from "../blog";
import type { SeedTopic } from "../blog-seed";

export interface BlogIdea {
  id: string;
  title: string;
  keywords: string[];
  /**
   * Set when this idea came from a topic Coinpresso supplied, rather than from
   * the planner's own reading of the pillars.
   *
   * Carried through to the plan screen so the operator can see which posts they
   * asked for, and back to the seed store so the topic is marked written once
   * the batch starts. Without it a supplied topic is indistinguishable from a
   * proposed one the moment the model returns.
   */
  seedTopicId?: string;
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
  /** Topics Coinpresso supplied that this day must cover. */
  seeds?: SeedTopic[];
  /** Terms to work in where they fit, across the programme. */
  standingKeywords?: string[];
}

/**
 * The block describing the topics Coinpresso supplied.
 *
 * Two rules do the work here. Each supplied topic becomes EXACTLY ONE post —
 * without that, a planner asked for six posts and given four topics returns
 * three angles on the most interesting one and drops the rest. And the hard
 * constraints still apply to them: a supplied topic that would be the fourth
 * post on one pillar, or the third guide in a row, is still wrong, and the
 * planner is told to solve that with format and angle rather than by quietly
 * dropping the topic.
 *
 * Standing keywords are stated as an opportunity, not a requirement, and the
 * prompt says why. A model handed a keyword list and a word count will meet the
 * list; the instruction has to be explicit that not using one is the correct
 * answer where it does not fit.
 */
function seedBlock(seeds: SeedTopic[], standing: string[]): string {
  const parts: string[] = [];

  if (seeds.length) {
    parts.push(
      `--- TOPICS COINPRESSO HAVE ASKED FOR (${seeds.length}) ---

These are REQUIRED. Coinpresso supplied them because they know something you
cannot infer from the pillars: what a sales call surfaced, what a competitor
started bidding on, what a client asked twice this week.

Rules for them:
- Produce EXACTLY ONE post per topic below. Not two angles on one, not a merge
  of two into one post. Set seedTopicId to the id given.
- Use the supplied keywords for that post. Add your own only if they are needed;
  the supplied ones are the target.
- The hard constraints still apply. If a required topic collides with the pillar
  or format spread, resolve it by changing the FORMAT or the ANGLE — never by
  dropping the topic or by writing the same post twice.
- Where a note supplies a figure or an example, that is what makes the post
  original: build the piece around it and set needsClientData false. Where the
  topic needs a figure that was NOT supplied, set needsClientData true and say
  which figure — do not invent it.
- If a topic is a straight re-run of something already published, still write it,
  and say in the rationale which post it replaces and what has changed.

${seeds
  .map(
    (s) =>
      `- id: ${s.id}
  topic: ${s.topic}
  keywords: ${s.keywords.length ? s.keywords.join(", ") : "(none supplied — choose them)"}
  pillar hint: ${s.pillar ?? "(none — you decide)"}
  ${s.notes ? `note from Coinpresso: ${s.notes}` : "no note supplied"}`
  )
  .join("\n\n")}

The remaining posts in the day are yours to propose as normal.`
    );
  }

  if (standing.length) {
    parts.push(
      `--- STANDING KEYWORDS ---

${standing.join(", ")}

Terms Coinpresso want to rank for across the programme. Use one ONLY where it is
the natural phrasing for that post's subject. These are not a checklist and not a
quota: a day of posts that each work in every term reads as stuffed, ranks worse
than one that does not, and is the specific pattern that gets a domain demoted.
Most posts should use none of them. Ignoring the list entirely for a given day is
a correct outcome.`
    );
  }

  return parts.join("\n\n");
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
  /** Supplied topics the planner did not produce a post for. */
  missingSeedIds: string[];
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
  const seeds = req.seeds ?? [];
  const supplied = seedBlock(seeds, req.standingKeywords ?? []);

  // A 1- or 2-post "day" cannot spread across three pillars, and a model held
  // to an unsatisfiable constraint either refuses or silently pads the list
  // back up to three. Waive the spread explicitly for small days; every other
  // rule still stands.
  const smallDay =
    req.count < 3
      ? `\nThis is a small day of ${req.count} post${req.count === 1 ? "" : "s"}, so the pillar-spread and format-spread constraints cannot apply and are waived. Do NOT add extra posts to satisfy them. Every other rule stands.\n`
      : "";

  const user = `Today is ${today}. Plan ${req.count} posts for Coinpresso's own blog.
${smallDay}
${seeds.length ? `\n${seeds.length} of those ${req.count} are topics Coinpresso have supplied and are listed below. Plan the other ${Math.max(req.count - seeds.length, 0)} yourself.\n` : ""}${req.pillar ? `\nThe operator wants the day weighted toward the "${req.pillar}" pillar — but still spread across at least three.\n` : ""}${req.steer ? `\nOPERATOR STEER: ${req.steer}\n` : ""}${supplied ? `\n${supplied}\n` : ""}
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

LENGTH. Every prose field below is ONE sentence, 25 words at the outside. This
is a plan, not the posts: the research and writing stages get the whole argument,
and a planner that writes paragraphs here is spending the budget twice. Emit the
JSON immediately, with no commentary before or after it, and stop the moment the
closing brace is written.

Return JSON:
{
  "ideas": [
    {
      "title": "the H1 as it would publish — question-shaped where natural, sentence case",
      "keywords": ["primary first", "secondary"],
      "seedTopicId": "the id from the supplied-topics block, or omit entirely for a post you proposed",
      "pillar": "one of the pillar ids above",
      "contentType": "one of the content type ids above",
      "buyerQuestion": "one sentence, in the reader's words",
      "originality": "one sentence — the specific thing that makes this worth publishing",
      "needsClientData": true or false,
      "rationale": "one sentence — why this post, and what research must verify",
      "differentiator": "one sentence — which other post this is not a duplicate of",
      "confidence": "high | medium | speculative"
    }
  ]
}`;

  // SIZED TO THE ASK, NOT SET TO A ROUND NUMBER.
  //
  // The ceiling was 8000, then 16000, on the reasoning that a truncated reply
  // parses as nothing and a bigger allowance makes truncation less likely. That
  // reasoning is backwards where the ceiling is being HIT: max_tokens is not a
  // budget the model spends only if it needs to, it is the length at which a
  // runaway reply is finally cut off — and every token before the cut is billed
  // for a reply that parses as nothing. Raising it made each failure cost twice
  // as much and did not make the underlying problem less likely.
  //
  // So: an allowance derived from what was actually asked for. One terse idea is
  // about 200 tokens; 450 each leaves better than double the room, and the fixed
  // 800 covers the wrapper. Eight ideas lands near 4400 rather than 16000, which
  // caps a failed plan at roughly four cents instead of sixteen.
  const ceiling = 800 + 450 * req.count;

  const r = await callClaude({
    model: MODELS.strategy,
    system: SYSTEM,
    user,
    maxTokens: ceiling,
    // Was 0.8. This stage emits a fixed JSON shape against a long, repetitive
    // context — a published-post list ninety lines deep — which is the exact
    // setup where high-temperature sampling drifts into repeating itself and
    // runs to the ceiling. The variety worth having here is in which topics get
    // chosen, and that comes from the pillars and the seeds, not from the
    // sampler.
    temperature: 0.4,
  });

  let parsed;
  try {
    parsed = extractJson<{ ideas: Omit<BlogIdea, "id">[] }>(r.text, {
      stage: "day planner",
      stopReason: r.stopReason,
      blockTypes: r.blockTypes,
      tokensOut: r.tokensOut,
      maxTokens: ceiling,
    });
  } catch (e) {
    // The reply arrived and was billed; only the parse failed.
    throw billed(e, {
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      searchRequests: r.searchRequests ?? 0,
    });
  }

  // A seedTopicId is only honoured if it names a topic actually supplied. A
  // model that invents one, or echoes an id from an earlier day, would otherwise
  // get a topic marked written that nobody wrote.
  const valid = new Set(seeds.map((s) => s.id));

  const ideas: BlogIdea[] = (parsed.ideas ?? []).map((i, n) => ({
    ...i,
    id: `blog_idea_${Date.now()}_${n}`,
    keywords: i.keywords ?? [],
    needsClientData: Boolean(i.needsClientData),
    seedTopicId:
      i.seedTopicId && valid.has(i.seedTopicId) ? i.seedTopicId : undefined,
  }));

  // Which supplied topics the planner did not produce a post for. Reported
  // rather than patched: silently appending a stub post for a dropped topic
  // would hide the fact that the planner had a reason, and the operator can
  // re-run or plan a bigger day knowing what is missing.
  const covered = new Set(ideas.map((i) => i.seedTopicId).filter(Boolean));
  const missingSeedIds = seeds.map((s) => s.id).filter((id) => !covered.has(id));

  return { ideas, missingSeedIds, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
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

  // Supplied topics come back as posts even in mock mode. Dropping them would
  // make the mock quietly wrong about the one thing this screen now promises:
  // that a topic left in the queue gets written.
  const fromSeeds: BlogIdea[] = (req.seeds ?? []).map((s, n) => ({
    id: `blog_idea_mock_seed_${n}`,
    seedTopicId: s.id,
    title: s.topic,
    keywords: s.keywords.length ? s.keywords : ["crypto marketing agency"],
    pillar: s.pillar ?? "crypto-pr",
    contentType: "guide" as ContentTypeId,
    buyerQuestion: PILLARS.find((p) => p.id === s.pillar)?.buyerQuestion ?? "",
    originality:
      "Mock plan — the topic is yours, but nothing here was researched or checked against what already ranks.",
    needsClientData: !s.notes,
    rationale:
      "Mock idea built straight from your supplied topic. Add model keys for a real plan.",
    differentiator: "Mock run.",
    confidence: "speculative" as const,
  }));

  const remaining = Math.max(req.count - fromSeeds.length, 0);

  const proposed = Array.from({ length: Math.min(remaining, seeds.length) }, (_, n) => {
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

  return [...fromSeeds, ...proposed];
}
