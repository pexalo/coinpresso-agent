// ---------------------------------------------------------------------------
// Coinpresso's own blog.
//
// This is NOT the Moonberg programme with a different logo on it. The two have
// almost nothing in common beyond running through the same agents:
//
//   Moonberg wire PR          Coinpresso's own blog
//   -------------------       ----------------------------------
//   third-party newswires     coinpresso.io
//   sells a token             sells an agency retainer
//   reader = retail trader    reader = a founder choosing a vendor
//   parasitic newsjacking     topical authority and demonstrated expertise
//   presale figures, wires    no presale, no dateline, no disclaimer
//   one piece, one keyword    pillar-and-cluster, internally linked
//
// The commercial logic is inverted. A wire release borrows someone else's search
// demand and points it at a token. A blog post on your own domain has to EARN
// the demand and hold it, because the asset being built is the domain itself.
// That is why the strategy below is cluster-shaped rather than event-shaped, and
// why the quality bar is higher: this is the work the client is judging you by.
// ---------------------------------------------------------------------------

/**
 * Where the blog archive lives in the article store.
 *
 * The store is keyed by campaign because the wire programme is campaign-shaped.
 * The blog is not a campaign — it is the agency's own domain — so it gets its
 * own key rather than a fake campaign record, and the seeded Moonberg rows never
 * leak into it.
 */
export const BLOG_ARCHIVE_ID = "coinpresso-blog";

/** How posts on coinpresso.io are labelled in the archive's publication field. */
export const BLOG_PUBLICATION = "coinpresso.io";

/** A pillar is a service Coinpresso sells. Clusters hang off it. */
export interface Pillar {
  id: string;
  name: string;
  /** The money page the cluster links to. */
  hub: string;
  /** What a buyer of this service is actually worried about. */
  buyerQuestion: string;
  /** Seed sub-topics. The ideas agent extends these, it is not limited to them. */
  clusters: string[];
  /**
   * The real WordPress category this pillar publishes into.
   *
   * These ids came off coinpresso.io's live category list, and the mapping is
   * deliberately one-way: the six pillars are the planning unit because 34
   * categories cannot be spread across a day, but a draft has to land somewhere
   * a human would have filed it. An id that stops matching is visible on the
   * Integration page rather than silently dropping posts into Uncategorised.
   */
  wp?: { id: number; slug: string };
}

export const PILLARS: Pillar[] = [
  {
    id: "geo",
    wp: { id: 40, slug: "crypto-ai-seo" },
    name: "Generative Engine Optimisation",
    hub: "/services/geo",
    buyerQuestion:
      "ChatGPT does not mention my project when people ask about it. Can that be changed, and how would I know if it worked?",
    clusters: [
      "What GEO is and how it differs from SEO",
      "How AI models choose which projects to name",
      "Measuring citation share across ChatGPT, Claude, Gemini and Perplexity",
      "Structuring a token site so models can quote it",
      "Why a project with good SEO can still be invisible to AI",
    ],
  },
  {
    id: "presale-marketing",
    wp: { id: 38, slug: "crypto-presale-marketing" },
    name: "Presale marketing",
    hub: "/services/presale-marketing",
    buyerQuestion:
      "I have eight weeks and a fixed budget. What actually moves a presale, and what is theatre?",
    clusters: [
      "A presale launch timeline that survives contact with reality",
      "What a presale landing page has to prove in ten seconds",
      "Paid versus earned in the first two weeks",
      "Attribution for presales: what you can and cannot measure",
      "Why most presale PR reads as advertising, and what to do instead",
    ],
  },
  {
    id: "crypto-pr",
    wp: { id: 25, slug: "crypto-pr" },
    name: "Crypto PR",
    hub: "/services/crypto-pr",
    buyerQuestion:
      "Wire placements cost real money. Which ones are worth it and what should a release actually do?",
    clusters: [
      "What a crypto newswire placement does and does not buy you",
      "Writing a release that reads as market analysis",
      "Sourcing standards: attributing a price target without asserting it",
      "Wire comparison — reach, indexation, cost",
      "Measuring PR when the click path is broken",
    ],
  },
  {
    id: "clipping",
    wp: { id: 46, slug: "crypto-clipping" },
    name: "Crypto clipping",
    hub: "/services/crypto-clipping",
    buyerQuestion:
      "Everyone says short-form works. How do I run it without paying for views that never convert?",
    clusters: [
      "How clipping campaigns are actually priced",
      "Briefing clippers so the output is usable",
      "View quality: the metrics that predict nothing",
      "Rights and reuse in creator campaigns",
    ],
  },
  {
    id: "community",
    wp: { id: 33, slug: "crypto-social-media" },
    name: "Community management",
    hub: "/services/community-management",
    buyerQuestion:
      "My Telegram is either dead or full of bots. What does a real community operation look like?",
    clusters: [
      "Telegram and Discord moderation that scales past launch",
      "Detecting and removing engagement farming",
      "What a healthy community actually looks like in numbers",
      "Handling a price drop in the channel",
    ],
  },
  {
    id: "paid",
    wp: { id: 43, slug: "crypto-programmatic-ads" },
    name: "PPC and programmatic",
    hub: "/services/ppc",
    buyerQuestion:
      "Crypto ads get rejected everywhere. Where can I actually buy attention, and does it pay back?",
    clusters: [
      "Where crypto advertising is permitted, platform by platform",
      "Reading ROAS when the on-chain conversion is invisible",
      "Creative that clears policy review",
      "When paid is the wrong answer",
    ],
  },
];

export type ContentTypeId =
  | "guide"
  | "comparison"
  | "teardown"
  | "data"
  | "opinion"
  | "faq"
  | "case-note";

export interface ContentType {
  id: ContentTypeId;
  name: string;
  shape: string;
  words: [number, number];
  /** What this format is for, commercially. */
  job: string;
}

/**
 * Format variety is a quality control, not a stylistic preference. Publishing
 * five to eight pieces a day in one shape is the single most recognisable
 * signature of machine-produced content, and the defence is genuine structural
 * difference across the set.
 */
export const CONTENT_TYPES: Record<ContentTypeId, ContentType> = {
  guide: {
    id: "guide",
    name: "Guide",
    shape:
      "Question-shaped H1. Direct answer in the first two sentences. H2s phrased as the questions buyers actually ask, each answered before it is contextualised. FAQ block at the end.",
    words: [1200, 1800],
    job: "Owns an informational keyword and gets quoted by AI models.",
  },
  comparison: {
    id: "comparison",
    name: "Comparison",
    shape:
      "Two to four named options, a table of the axes that matter, then an honest recommendation that says who each option is wrong for.",
    words: [1000, 1600],
    job: "Captures high-intent 'X vs Y' and 'best X' searches near the decision.",
  },
  teardown: {
    id: "teardown",
    name: "Teardown",
    shape:
      "One real, named example examined in detail. What was done, what it produced, what would be done differently. Screenshots or figures where they exist.",
    words: [900, 1500],
    job: "Demonstrates expertise instead of claiming it. Hardest to fake, most persuasive.",
  },
  data: {
    id: "data",
    name: "Data study",
    shape:
      "State the question, the sample and the method up front. Findings with figures. Limitations stated plainly. The dataset or its shape shared.",
    words: [1000, 1800],
    job: "Earns links and citations. Cannot be replicated by a competitor.",
  },
  opinion: {
    id: "opinion",
    name: "Argued opinion",
    shape:
      "A position a competitor would not take, argued from evidence, with the strongest counter-argument addressed rather than ignored.",
    words: [700, 1200],
    job: "Differentiates the agency. Gets shared and quoted.",
  },
  faq: {
    id: "faq",
    name: "Question page",
    shape:
      "One narrow question answered completely and immediately, then the surrounding context. Schema-ready.",
    words: [500, 900],
    job: "Long-tail capture and direct AI answer extraction.",
  },
  "case-note": {
    id: "case-note",
    name: "Case note",
    shape:
      "A short, specific account of client work: the constraint, what was tried, the number that moved, and what did not work.",
    words: [600, 1000],
    job: "Proof. Converts a reader already considering a vendor.",
  },
};

export const CONTENT_TYPE_LIST = Object.values(CONTENT_TYPES);

/** The WordPress category a pillar's drafts go into, if one is mapped. */
export function wpCategoryFor(pillarId: string | undefined): number | undefined {
  return PILLARS.find((p) => p.id === pillarId)?.wp?.id;
}

/**
 * The rule that keeps this from becoming a content farm.
 *
 * Five to eight a day is a high rate for one domain. It is defensible only if
 * each piece contains something unavailable elsewhere — Coinpresso's own
 * campaign data, a named example, a real limitation, a position with reasoning.
 * Volume without that is the exact pattern search and AI systems demote.
 */
export const BLOG_PLAYBOOK = `# Coinpresso house blog — the framework

## Who is reading
A founder or marketing lead at a token project, deciding whether to hire an
agency. They are technical enough to spot vagueness and have been pitched by
five other agencies this month. They are not a retail trader, and nothing here
is written to sell a token.

## What every post must do
Answer a real question a buyer asks, in the words they ask it, and demonstrate
that Coinpresso knows the answer from doing the work rather than from reading
about it.

## The non-negotiable
Every piece contains at least one thing unavailable elsewhere:
- a figure from Coinpresso's own campaigns
- a named, specific example
- a limitation or trade-off stated honestly
- a position a competitor would not take, with reasoning

A post that only reassembles what already ranks adds nothing, and at five to
eight a day that is precisely the pattern that gets a domain demoted. If a draft
has none of the four, it is not publishable — say so rather than padding it.

## Structure for AI retrieval
- One clear, question-shaped H1
- H2s phrased as the questions people actually ask
- The direct answer in the first two sentences under each H2, before context
- An FAQ block
- Internal links to the pillar page and to two or three sibling posts, using
  descriptive anchor text

## Honesty rules
- Never guarantee rankings, citations, listings or returns
- Name the limits of the approach — AI platforms disproportionately quote
  sources that acknowledge trade-offs
- Attribute every external claim; never assert a statistic without a source
- Do not invent client names, results or quotes. Where a case is anonymised,
  say it is anonymised

## What this is NOT
Not a wire release. No dateline, no boilerplate, no investment disclaimer, no
presale figures, no price predictions attached to a product pitch. If a draft
starts reading like the Moonberg programme, it has gone wrong.

## Internal linking
Every post belongs to a pillar and links to it. The cluster is the asset; a
post with no home is a post that will not rank.`;

/** Coinpresso's own voice — distinct from the Moonberg wire voice. */
export const BLOG_STYLE = `WRITING STYLE — Coinpresso house blog.

Direct, specific, unhurried British English. Written by a practitioner to a
peer, not by a marketer to a prospect. Confidence comes from detail, not from
adjectives.

- Second person for the reader ("your presale"), first person plural sparingly
  for Coinpresso ("we ran", "we found") — and only where it is literally true
- Sentences average around 18 words, with high variation
- Paragraphs of two to four sentences
- Headings in sentence case, phrased as questions where natural
- Contractions are fine
- Bullet lists are allowed here, unlike the wire work, but never more than one
  list per two screens of prose
- Numerals for figures; en-GB spelling
- One call to action, at the end, low-pressure

Never use: revolutionise, supercharge, unlock, seamless, game-changer, leverage
(as a verb), "in today's fast-paced world", "look no further", guaranteed
results, or any sentence that would survive being deleted.

Every claim should survive the question "compared to what, by how much, says
who?".`;
