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

/**
 * The posts the writer is always shown as the house voice.
 *
 * Liam names this piece as the benchmark — "when I think about mine or
 * Coinpresso blog posts, I think of bold, sometimes borderline hyperbolic
 * statements" — and it is his own. Recency scoring had it ranked sixth of
 * 159 and it was never selected; a benchmark that ages out is not one.
 */
export const BLOG_VOICE_EXEMPLARS = [
  "https://coinpresso.io/blog/generative-engine-optimization-for-crypto-projects-the-complete-2026-guide",
];

/**
 * Titles that are a different genre from an editorial post.
 *
 * The four most recent posts in the archive are all "Best X Agencies in 2026"
 * listicles — a commercial comparison format with its own shape and a flatter
 * register. They were the three exemplars every editorial post was learning
 * from, because they were the newest. Ranked last rather than removed: if the
 * archive ever holds nothing else, an example still beats no example.
 */
export const BLOG_OFF_GENRE_TITLE = /^best\b|\bagencies\b|\btop \d+\b/i;

/** A pillar is a service Coinpresso sells. Clusters hang off it. */
export interface Pillar {
  id: string;
  name: string;
  /**
   * The money page the cluster links to — the REAL, absolute URL on
   * coinpresso.io. These were "/services/geo"-style paths that do not exist on
   * the site (it has no /services/ prefix at all), and because the link check
   * only inspects absolute URLs, a relative 404 sailed through every draft.
   */
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
    hub: "https://coinpresso.io/geo-llm-optimization-for-crypto-web3",
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
    hub: "https://coinpresso.io/crypto-presale-marketing-services",
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
    hub: "https://coinpresso.io/crypto-pr",
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
    hub: "https://coinpresso.io/crypto-clipping-strategy-for-viral-growth",
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
    hub: "https://coinpresso.io/crypto-community-management",
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
    hub: "https://coinpresso.io/crypto-ppc-marketing",
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

/**
 * The landing pages a post may link to, with the words that link to them.
 *
 * Liam's rule: "crypto SEO should have an anchor text link to the crypto SEO
 * page, crypto generative engine optimisation with anchor text link to the
 * GEO page." That only works if the writer knows which pages exist. Until now
 * it did not — the research stage was asked to name "sibling posts worth
 * linking" and invented paths. These URLs are taken from coinpresso.io's own
 * navigation (checked 3 Sep 2026); add to the list when the site does.
 */
export interface SitePage {
  url: string;
  /**
   * What the page is about, so the writer links it where that topic arises.
   * Several anchor phrases joined with " | " — the writer is shown them all,
   * the naming check accepts any, the anchor fixer prepends the first.
   */
  topic: string;
  /**
   * The content cluster the page belongs to. Liam's meta-mapping sheet: "the
   * links within the content should be focused around that cluster and
   * closely-connected clusters rather than spray-and-pray approach to our
   * entire stack." A GEO article links SEO and content pages, not PPC.
   */
  cluster: Cluster;
}

export type Cluster =
  | "brand"    // home, about, contact, blog index, case studies
  | "seo"      // SEO, link building, GEO, LLM optimisation, parasite SEO
  | "pr"       // PR, Web3 PR, earned media
  | "paid"     // PPC, Google Ads, programmatic, Facebook, ASO
  | "social"   // SMM, Telegram, Discord, X, community, influencer
  | "content"  // content, copywriting, ghostwriting, Reddit, email
  | "launch"   // presale, ICO, IDO, IEO, airdrop, pump.fun, clipping
  | "vertical"; // DeFi, NFT, RWA, AI tokens, metaverse, exchanges

/**
 * Which clusters a post may link into, by the cluster of its pillar.
 *
 * Liam's example: "A GEO article can link to crypto content, crypto SEO,
 * contact us, homepage, blog articles etc — very seamlessly. On the flipside,
 * it would not be as relevant to link out to a crypto PPC page when writing
 * a Crypto GEO article." Brand pages are reachable from everywhere; the rest
 * is the neighbourhood.
 */
export const CLUSTER_NEIGHBOURS: Record<Cluster, Cluster[]> = {
  brand: ["brand", "seo", "pr", "paid", "social", "content", "launch", "vertical"],
  seo: ["seo", "content", "brand"],
  pr: ["pr", "content", "social", "brand"],
  paid: ["paid", "launch", "brand"],
  social: ["social", "pr", "content", "launch", "brand"],
  content: ["content", "seo", "pr", "social", "brand"],
  launch: ["launch", "paid", "pr", "social", "brand"],
  vertical: ["vertical", "launch", "pr", "seo", "brand"],
};

/**
 * Every page on coinpresso.io the writer may link, with the anchor phrases
 * the client wants used.
 *
 * REBUILT FROM LIAM'S META-MAPPING SHEET, 21 Sep 2026 — the client's own
 * silo-ing document, "specific content and keywords mapped to their
 * respective pages". Where the sheet and the earlier list here gave a
 * different path for the same page, the sheet wins: it is his site. The
 * link checker HEAD-checks every internal URL before a draft reaches review,
 * so a stale row fails loudly rather than publishing a 404. Pages the sheet
 * does not list but the earlier audit found are kept.
 *
 * His anchors, and his note on them: "If keyword suggestions are not
 * grammatically correct, use a like-for-like word." And: "We do not need to
 * only use organic keywords as anchor texts. We can use branded keywords (to
 * the homepage for example) too."
 */
export const COINPRESSO_PAGES: SitePage[] = [
  // --- brand ---
  { url: "https://coinpresso.io/", topic: "crypto marketing agency | crypto advertising agency | crypto marketing | crypto marketing services | cryptocurrency marketing agency | Coinpresso", cluster: "brand" },
  { url: "https://coinpresso.io/about-us", topic: "about Coinpresso | crypto marketing firms | who we are | our team", cluster: "brand" },
  { url: "https://coinpresso.io/contact", topic: "contact us | contact Coinpresso | free crypto marketing audit | crypto advertising company | get in touch", cluster: "brand" },
  { url: "https://coinpresso.io/blog", topic: "the Coinpresso blog | crypto blog | crypto blogs | more guides", cluster: "brand" },
  { url: "https://coinpresso.io/blog/category/case-studies", topic: "case studies | our case studies | client results", cluster: "brand" },

  // --- seo ---
  { url: "https://coinpresso.io/crypto-seo", topic: "crypto SEO | SEO for crypto | cryptocurrency SEO", cluster: "seo" },
  { url: "https://coinpresso.io/crypto-seo/for-web3", topic: "Web3 SEO", cluster: "seo" },
  { url: "https://coinpresso.io/crypto-seo/link-building", topic: "crypto link building | crypto link building services", cluster: "seo" },
  { url: "https://coinpresso.io/geo-llm-optimization-for-crypto-web3", topic: "generative engine optimization for Web3 | Web3 GEO agency | Web3 generative engine optimization | GEO for crypto", cluster: "seo" },
  { url: "https://coinpresso.io/llm-optimization-for-crypto-web3-websites", topic: "LLM optimization for crypto websites", cluster: "seo" },
  { url: "https://coinpresso.io/parasite-seo-services", topic: "parasite SEO", cluster: "seo" },

  // --- pr ---
  { url: "https://coinpresso.io/crypto-pr", topic: "crypto PR | crypto PR agency | crypto press release distribution | crypto press releases | PR for cryptocurrency", cluster: "pr" },
  { url: "https://coinpresso.io/crypto-pr/web3-pr", topic: "Web3 PR", cluster: "pr" },
  { url: "https://coinpresso.io/crypto-earned-media", topic: "crypto earned media | crypto earned media agency", cluster: "pr" },

  // --- paid ---
  { url: "https://coinpresso.io/crypto-ppc-marketing", topic: "crypto PPC | crypto PPC agency | crypto PPC marketing agency | crypto PPC marketing services", cluster: "paid" },
  { url: "https://coinpresso.io/crypto-google-ads", topic: "crypto Google Ads | crypto ads on Google | Google Ads for crypto", cluster: "paid" },
  { url: "https://coinpresso.io/programmatic-ads", topic: "programmatic advertising | programmatic ads | programmatic display ads | crypto programmatic advertising", cluster: "paid" },
  { url: "https://coinpresso.io/facebook-crypto-advertising", topic: "Facebook crypto advertising | crypto advertising on Facebook | advertise crypto on Facebook", cluster: "paid" },
  { url: "https://coinpresso.io/aso", topic: "app store optimisation | ASO services | crypto ASO agency | ASO marketing agency", cluster: "paid" },

  // --- social ---
  { url: "https://coinpresso.io/smm-for-crypto", topic: "crypto social media marketing | crypto social media management | crypto SMM | SMM for crypto", cluster: "social" },
  { url: "https://coinpresso.io/smm-for-crypto/telegram-marketing", topic: "crypto Telegram marketing | Telegram crypto marketing", cluster: "social" },
  { url: "https://coinpresso.io/smm-for-crypto/discord-marketing", topic: "crypto Discord marketing | Discord marketing for crypto projects", cluster: "social" },
  { url: "https://coinpresso.io/twitter-crypto-marketing", topic: "crypto X marketing | crypto Twitter marketing", cluster: "social" },
  { url: "https://coinpresso.io/crypto-community-management", topic: "crypto community management | crypto community management agency | crypto community management services", cluster: "social" },
  { url: "https://coinpresso.io/crypto-influencer-marketing", topic: "crypto influencer marketing | crypto influencer marketing agency", cluster: "social" },

  // --- content ---
  { url: "https://coinpresso.io/crypto-content", topic: "crypto content | crypto copywriting | crypto copywriter | crypto content writers", cluster: "content" },
  { url: "https://coinpresso.io/crypto-content/web3-ghostwriting", topic: "Web3 ghostwriting | Web3 ghostwriter", cluster: "content" },
  { url: "https://coinpresso.io/crypto-content/for-reddit", topic: "crypto content marketing for Reddit | Reddit crypto marketing", cluster: "content" },
  { url: "https://coinpresso.io/crypto-edm", topic: "crypto email marketing | EDM for crypto | blockchain email marketing", cluster: "content" },

  // --- launch ---
  { url: "https://coinpresso.io/crypto-presale-marketing-services", topic: "crypto presale marketing | presale marketing agency", cluster: "launch" },
  { url: "https://coinpresso.io/ico-marketing", topic: "ICO marketing | ICO marketing agency", cluster: "launch" },
  { url: "https://coinpresso.io/ido-marketing", topic: "IDO marketing | IDO marketing agency | IDO marketing services", cluster: "launch" },
  { url: "https://coinpresso.io/ieo-marketing", topic: "IEO marketing | IEO marketing agency | IEO marketing services", cluster: "launch" },
  { url: "https://coinpresso.io/airdrop-marketing", topic: "airdrop marketing | airdrop marketing campaign | crypto airdrop marketing", cluster: "launch" },
  { url: "https://coinpresso.io/pump-fun-launch-marketing", topic: "pump.fun launch marketing", cluster: "launch" },
  { url: "https://coinpresso.io/four-meme-marketing", topic: "four.meme marketing", cluster: "launch" },
  { url: "https://coinpresso.io/crypto-clipping-strategy-for-viral-growth", topic: "crypto clipping", cluster: "launch" },

  // --- vertical ---
  { url: "https://coinpresso.io/defi-marketing", topic: "DeFi marketing | DeFi marketing agency | DeFi marketing strategy", cluster: "vertical" },
  { url: "https://coinpresso.io/nft-marketing", topic: "NFT marketing", cluster: "vertical" },
  { url: "https://coinpresso.io/rwa-marketing", topic: "RWA marketing", cluster: "vertical" },
  { url: "https://coinpresso.io/crypto-ai-token-marketing", topic: "AI token marketing", cluster: "vertical" },
  { url: "https://coinpresso.io/metaverse-marketing", topic: "metaverse marketing | metaverse marketing agency", cluster: "vertical" },
  { url: "https://coinpresso.io/crypto-exchange-marketing", topic: "crypto exchange marketing | crypto exchange marketing services", cluster: "vertical" },
  { url: "https://coinpresso.io/web3-marketing-agency", topic: "Web3 marketing | Web3 marketing agency | Web3 digital marketing | Web3 marketing services", cluster: "vertical" },
];

/** The cluster of a page the writer may link, or undefined for a blog post. */
export function clusterOf(url: string): Cluster | undefined {
  const key = url.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  return COINPRESSO_PAGES.find((p) => p.url.replace(/\/+$/, "").toLowerCase() === key)?.cluster;
}

/** Pillar → the cluster its hub page belongs to. */
export function clusterOfPillar(hub?: string): Cluster | undefined {
  return hub ? clusterOf(hub) : undefined;
}

/** The prompt block listing where a post may link internally. */
export function internalLinkTargets(pillarHub?: string): string {
  return COINPRESSO_PAGES.map(
    (p) => `- ${p.url} — ${p.topic}${p.url === pillarHub ? " (THIS POST'S PILLAR — must be linked)" : ""}`
  ).join("\n");
}

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
      "Follows the post's outline — the client's, or one research wrote in the client's format. Declarative headings, scene-setting opener, a Conclusion, then the FAQs.",
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

## Structure
The structure of a post comes from the client's brief when there is one, and
from the house default when there is not. Which applies is stated explicitly in
each writing task — do not carry a structure from one post to the next.

## Retrieval habits that apply whatever the structure
- The direct answer in the first two sentences under each H2, before context

## Linking
- 3-5 internal links to Coinpresso's own landing pages and blog posts.
  Anchor text names the destination topic, not the post title — a mention of
  crypto SEO links out on the words "crypto SEO", a mention of generative
  engine optimisation links out on "generative engine optimisation". Spread
  these through the body as the topic comes up naturally; none of them belong
  bunched into the conclusion as an afterthought.
- 3-5 external links to sources that substantiate a specific claim — a
  figure, a study, a platform's own documentation. Attach each one to the
  sentence making that claim, not gathered into a reading list. A paragraph
  that cites three sources in three consecutive sentences reads as a
  citation dump even when every citation is accurate — spread them out, and
  let some paragraphs carry no citation at all because the claim is
  Coinpresso's own.

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

Every post belongs to a pillar and its internal links include that pillar
page. The cluster is the asset; a post with no home is a post that will not
rank.`;

/**
 * The house structure, used ONLY when a post has no client brief.
 *
 * This used to live inside BLOG_PLAYBOOK — in the writer's system prompt,
 * where it applied to every post unconditionally. Coinpresso's briefs specify
 * a section-by-section outline per topic, and the writer was receiving both:
 * "here are the nine sections" and "H2s are phrased as questions". It kept the
 * sections and questionified every heading, and the client read the result as
 * an extended FAQ. A default has to be a default: present when nothing better
 * exists, absent when the client has said what they want.
 */
export const BLOG_DEFAULT_STRUCTURE = `STRUCTURE — house pattern (this post arrived with no outline and research did not supply one)
Measured from 74 of Coinpresso's own briefs:
- 7 or 9 H2 sections, never another number
- Section 1 sets the scene — a statement about the reader's current reality
- Every heading is a statement or noun phrase; none is a question
- The last section is titled "Conclusion"; the FAQs come after it under their own "FAQs" heading, exactly 5 of them`;

/**
 * Ways in and ways out, assigned rather than chosen.
 *
 * The introduction instruction used to be one formula — "set the scene: the
 * reader's current reality and why it has changed, then say what the piece
 * covers" — and the writer followed it faithfully seven times. Four of seven
 * queued posts opened on the identical premise, "an AI engine will not mention
 * you", sometimes almost the same sentence, and the client read four in a row
 * and said so. The closer had the same problem from the other end: "If you
 * want a second opinion… that's a conversation worth having before you spend"
 * ended four of the seven. A template followed faithfully produces templated
 * writing; the fault was the template.
 *
 * So the move is ASSIGNED, deterministically, from the format and the title.
 * A model told to "vary your openings" has no idea what the other seven posts
 * did and drifts back to whichever shape it likes best. Two posts of the same
 * format on the same day still open and close differently by construction.
 */
export interface Move {
  id: string;
  how: string;
}

export const INTRO_MOVES: Move[] = [
  {
    id: "claim",
    how: `Open with a flat claim about the subject itself, then concede at once what
is awkward about it. Liam's own GEO guide does exactly this: "Generative Engine
Optimization is a necessity, not a luxury, for crypto projects. A bold
statement, however..." State the position in one line, admit the objection in
the next, then spend the paragraph earning it.`,
  },
  {
    id: "figure",
    how: `Open on one number from the research, front-loaded, in a complete sentence.
The number is the first thing on the page — no preamble, no "according to" —
but it arrives inside a full sentence with a subject and a verb, and the
sentences after it are full sentences too. A first attempt at this move read
"Not the domain. Not a content programme. One page, out-earning entire
portfolios." and the client called it word salad. Fragments stacked for effect
are not his voice. Use only a figure the research has verified; if the risk
notes flag it, it does not open the piece.`,
  },
  {
    id: "scoreboard",
    how: `Open with what the reader already knows — the league table, the consensus,
the line every agency deck repeats — then turn on it with the one question
nobody in that conversation has asked. The shape is: "everyone has seen this;
almost nobody has asked why."`,
  },
  {
    id: "verdict",
    how: `Open with a blunt two-sentence verdict addressed straight at the reader,
correcting what they believe is happening to them. Short sentences, no
preamble, no scene-setting. Then explain why the distinction changes what they
do next.`,
  },
  {
    id: "scene",
    how: `Open on one concrete thing teams actually do, described precisely enough
that the reader recognises themselves — the specific file, the specific click,
the specific line of config — and then name what it costs them.`,
  },
  {
    id: "belief",
    how: `Open by naming a belief this reader holds about the topic and killing it in
a single line, then spend the rest of the paragraph on what is true instead.`,
  },
];

export const CLOSE_MOVES: Move[] = [
  {
    id: "offer",
    how: `End the way Liam ends his own guide: a direct, named offer in plain words.
"Contact Coinpresso for a free mini GEO audit" — say what the reader gets and
what it costs them (nothing, or an hour), not that "a conversation is worth
having".`,
  },
  {
    id: "dare",
    how: `End on a one-line dare: name the single thing the reader could check on
their own site tonight that would tell them whether this piece applies to them.
Then one sentence on what Coinpresso does when it does.`,
  },
  {
    id: "callback",
    how: `End by returning to the image or number the piece opened on, now that the
reader knows what it meant. One paragraph, and the offer sits inside it in half
a sentence, not bolted on after.`,
  },
  {
    id: "priority",
    how: `End by telling the reader what to fix FIRST and what to leave alone, in
that order, as a working instruction from someone who has done it. The offer is
the last clause: this is the list Coinpresso works through.`,
  },
];

/** Moves that suit each format. The title picks within the list. */
const INTRO_BY_TYPE: Record<string, string[]> = {
  data: ["figure", "scoreboard"],
  teardown: ["figure", "scene"],
  opinion: ["verdict", "belief"],
  guide: ["claim", "belief", "scene"],
  comparison: ["scoreboard", "figure"],
  "case-note": ["scene", "figure"],
  faq: ["belief", "verdict"],
};

function hashOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function introMoveFor(title: string, contentType?: string): Move {
  const ids = INTRO_BY_TYPE[contentType ?? ""] ?? INTRO_MOVES.map((m) => m.id);
  const id = ids[hashOf(title) % ids.length];
  return INTRO_MOVES.find((m) => m.id === id) ?? INTRO_MOVES[0];
}

/** A different hash seed from the intro, so intro and closer pair up unpredictably. */
export function closeMoveFor(title: string): Move {
  return CLOSE_MOVES[hashOf(`close:${title}`) % CLOSE_MOVES.length];
}

/**
 * Assign openings and closers across a whole batch, so no two posts written
 * on the same day share one.
 *
 * Hashing a title picks a move per post, but with two or three moves per
 * format and four posts in a day, two of them collide about half the time —
 * and two colliding is exactly what the client read as "they all sound the
 * same". A batch knows all its posts at once, so it can hand them out: each
 * post takes the least-used move that suits its format, ties broken by the
 * title hash so the choice is still stable across re-plans.
 */
export function assignMoves(
  posts: Array<{ title: string; contentType?: string; introMove?: string; closeMove?: string }>
): Array<{ introMove: string; closeMove: string }> {
  const introUse = new Map<string, number>();
  const closeUse = new Map<string, number>();
  // Posts that already carry a move keep it and count against the pool, so a
  // queue rewritten one post at a time still spreads out — each retry sees
  // what its siblings were given and takes something else.
  for (const p of posts) {
    if (p.introMove) introUse.set(p.introMove, (introUse.get(p.introMove) ?? 0) + 1);
    if (p.closeMove) closeUse.set(p.closeMove, (closeUse.get(p.closeMove) ?? 0) + 1);
  }
  const pick = (ids: string[], use: Map<string, number>, seed: string): string => {
    const start = hashOf(seed) % ids.length;
    // Rotate so the hash-preferred move is tried first, then take the least used.
    const order = [...ids.slice(start), ...ids.slice(0, start)];
    const best = order.reduce((a, b) => ((use.get(b) ?? 0) < (use.get(a) ?? 0) ? b : a));
    use.set(best, (use.get(best) ?? 0) + 1);
    return best;
  };
  return posts.map((p) => ({
    introMove:
      p.introMove ??
      pick(INTRO_BY_TYPE[p.contentType ?? ""] ?? INTRO_MOVES.map((m) => m.id), introUse, p.title),
    closeMove: p.closeMove ?? pick(CLOSE_MOVES.map((m) => m.id), closeUse, `close:${p.title}`),
  }));
}

export function moveById(list: Move[], id?: string): Move | undefined {
  return id ? list.find((m) => m.id === id) : undefined;
}

/**
 * Openings and closers that are spent. Each was used on three or more of the
 * first seven posts. Matched against the first two sentences (openers) and the
 * last paragraph (closers), because a writer told "do not do X" does it
 * slightly differently and needs to be caught rather than trusted.
 */
export const SPENT_OPENERS: RegExp[] = [
  /\b(ask(ed)? (chatgpt|perplexity|claude|gemini|an ai engine)|(chatgpt|perplexity|ai engines?) (doesn't|does not|never|won't|will not) (mention|say|name|cite))/i,
  /\byou (don't|do not) exist\b/i,
  /\bgot a (hedge|shrug)\b/i,
];

/**
 * Domains the post must never link, cite or name as a source.
 *
 * Liam, 19 Sep, on a citation to a rival PPC agency's blog: "We should not be
 * linking competitor agency blogs under any circumstances. Gives them a free
 * backlink. Gives them clout for the intent we are looking to capture."
 *
 * A competitor is another agency or vendor selling crypto marketing, PR, SEO,
 * PPC, analytics or attribution to the same buyers. Platforms (Google, Meta,
 * X), regulators, standards bodies, exchanges, protocols, and the trade press
 * are not competitors and remain citable. This list is the floor; the
 * research stage also asks the model to classify each source, and a source it
 * marks as an agency is dropped before the writer sees it.
 *
 * Kept in code because a rival's domain is a fact, not a preference. Add one
 * here the first time it appears in a draft.
 */
export const COMPETITOR_DOMAINS: string[] = [
  // Crypto marketing / PR / SEO agencies
  "stubgroup.com",
  "coinbound.io",
  "wolf.financial",
  "wolffinancial.com",
  "ninjapromo.io",
  "blockwiz.com",
  "lunarstrategy.com",
  "crowdcreate.us",
  "crypto-pr.co",
  "cryptovirally.com",
  "icoda.io",
  "marketacross.com",
  "melrose-pr.com",
  "chainstory.co",
  "the-crypto-pr.com",
  "guerrillabuzz.com",
  "singlegrain.com",
  "omnius.so",
  "blockchainpr.io",
  "bitcoinmarketing.agency",
  "cryptomarketing.agency",
  // Web3 attribution / analytics vendors selling into the same buyer
  "formo.so",
  "mintfunnel.com",
  "spindl.xyz",
  "cookie3.com",
  "addressable.io",
  "safary.club",
  "northbeam.io",
  "tryflint.com",
  "coincile.io",
  // Google Ads / PPC agencies that surfaced on the Circumventing Systems piece
  "almcorp.com",
  "growthify.in",
  // Crypto PR agencies Liam flagged on the wire-distribution piece (21 Sep)
  "luvkaizen.com",
  "slicedbrand.com",
  "badenbower.com",
  "quorum-media.com",
];

/**
 * Competitors by NAME. The link barrier only ever looked at URLs, so a draft
 * could still write "As LuvKaizen puts it…" with no link and sail through —
 * Liam: "LuvKaizen are a competitor, big no no naughty agent". Naming a rival
 * gives them the same clout a link does. Matched as whole words, any case,
 * spaces optional ("Sliced Brand" / "SlicedBrand").
 */
export const COMPETITOR_NAMES: string[] = [
  "LuvKaizen", "SlicedBrand", "Baden Bower", "Quorum Media", "Chainstory",
  "Coinbound", "Wolf Financial", "NinjaPromo", "Lunar Strategy", "MarketAcross",
  "Melrose PR", "GuerrillaBuzz", "Single Grain", "Blockwiz", "Crowdcreate", "ICODA",
  "Omnius", "Formo", "Mintfunnel", "Spindl", "Cookie3", "Safary", "Northbeam",
  "Coincile", "Stub Group", "ALM Corp", "AlmCorp", "Growthify", "CryptoVirally",
];

export function competitorNamesIn(text: string, extra: string[] = []): string[] {
  const found = new Set<string>();
  for (const name of [...COMPETITOR_NAMES, ...extra]) {
    const words = name.trim().replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
    if (!words.length || name.trim().length < 4) continue;
    const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
    if (new RegExp(`(^|[^A-Za-z0-9])${pattern}(?![A-Za-z0-9])`, "i").test(text)) found.add(name);
  }
  return [...found];
}

/**
 * A static list cannot name every agency on the internet. Almcorp and
 * Growthify reached a client Doc because neither was on it. So a host that
 * reads as a marketing shop — "growth", "seo", "ppc", "agency" in the name —
 * is treated as one too, unless it is a platform, regulator or publisher we
 * know to be a primary source.
 */
const VENDOR_HOST_WORDS = /(agency|agencies|marketing|growth|seo|ppc|adsagency|digitalmedia|leadgen|funnel|clicks|webdesign)/;
const PRIMARY_HOSTS = [
  "google.com", "blog.google", "about.google", "youtube.com", "meta.com", "facebook.com",
  "x.com", "twitter.com", "linkedin.com", "microsoft.com", "apple.com", "tiktok.com",
  "sec.gov", "cftc.gov", "fca.org.uk", "esma.europa.eu", "europa.eu", "gov.uk",
  "coindesk.com", "theblock.co", "cointelegraph.com", "decrypt.co", "reuters.com",
  "bloomberg.com", "ft.com", "wsj.com", "searchengineland.com", "searchenginejournal.com",
  "marketingland.com", "shopify.com", "wikipedia.org", "github.com",
];
function isPrimaryHost(host: string): boolean {
  return PRIMARY_HOSTS.some((d) => host === d || host.endsWith("." + d)) || /\.gov(\.[a-z]{2})?$/.test(host);
}
export function looksLikeVendorHost(host: string): boolean {
  if (isPrimaryHost(host)) return false;
  const name = host.split(".").slice(0, -1).join(".");
  return VENDOR_HOST_WORDS.test(name);
}

/**
 * Is this ledger still worth writing from?
 *
 * The competitor rule can gut a ledger rather than trim it. The attribution
 * piece researched seven sources and five were vendors — Formo, Mintfunnel,
 * Northbeam, Coincile, Stub Group — because the vendors are who writes about
 * Web3 attribution. Strip them at use time and the writer is asked to support
 * a data-heavy article from two citations, which it cannot honestly do.
 *
 * At that point more writer attempts are the wrong spend. Research costs
 * about $0.35 and fixes the cause; three writer attempts on a hollow ledger
 * cost $1.70 and produce a thin article at the end of it. So a run whose
 * ledger falls below the floor — or loses most of what it had — re-researches
 * once, with the competitor rule in force from the start.
 */
export const MIN_CITABLE_SOURCES = 3;

export function ledgerIsViable(sources: Array<{ url: string; publisherType?: string }>): {
  viable: boolean;
  citable: number;
  blocked: number;
  reason?: string;
} {
  const blocked = sources.filter((x) => isCompetitorUrl(x.url) || x.publisherType === "vendor").length;
  const citable = sources.length - blocked;
  if (citable < MIN_CITABLE_SOURCES) {
    return {
      viable: false,
      citable,
      blocked,
      reason: `only ${citable} citable source${citable === 1 ? "" : "s"} left after ${blocked} competitor${blocked === 1 ? "" : "s"} were removed — the floor is ${MIN_CITABLE_SOURCES}`,
    };
  }
  // More than half the ledger gone means the research was built around the
  // vendors, and what is left is unlikely to cover the piece's claims.
  if (blocked > sources.length / 2) {
    return {
      viable: false,
      citable,
      blocked,
      reason: `${blocked} of ${sources.length} sources were competitors — the research was built around them`,
    };
  }
  return { viable: true, citable, blocked };
}

/** True when the URL points at a competitor. Subdomains count. */
export function isCompetitorUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return COMPETITOR_DOMAINS.some((d) => host === d || host.endsWith("." + d)) || looksLikeVendorHost(host);
  } catch {
    return false;
  }
}

export const SPENT_CLOSERS: RegExp[] = [
  /\bsecond (opinion|pair of eyes|set of eyes|look)\b/i,
  /\ba conversation worth having\b/i,
  /\bbefore you spend (another|on)\b/i,
];

/**
 * Coinpresso's own voice — distinct from the Moonberg wire voice.
 *
 * Liam's review of the E-E-A-T piece (2 Sep 2026): the structure and sourcing
 * were right but the prose read as safe and AI-derived. His fix in his own
 * words — "think of the writing style and general charisma of Jeremy
 * Clarkson, but transposed to crypto content" — and two rewrites he gave as
 * the standard: "E-E-A-T hasn't died, but it's undergone major surgery on
 * most of its internal organs" (his replacement for the flatter "its job has
 * changed"), and "Experience, for a crypto product, means on-chain proof the
 * thing is actually used — not a fugazzi whitepaper concept, actual use."
 * Both examples commit to a bold, unhedged, image-driven line rather than a
 * safe abstraction — that commitment is the instruction, not the specific
 * words.
 */
export const BLOG_STYLE = `WRITING STYLE — Coinpresso house blog.

Direct, specific, unhurried British English. Written by a practitioner to a
peer, not by a marketer to a prospect.

## Voice
Bold, sometimes borderline hyperbolic statements that make the reader pay
attention — Coinpresso's own comparison is Jeremy Clarkson's charisma
transposed to crypto content. Confidence comes from detail AND from
committing to a strong, specific line instead of a safe one. Where a flatter
version and a bolder version say the same thing, take the bolder one:
- Flat: "E-E-A-T hasn't died, but its job has changed."
- Coinpresso: "E-E-A-T hasn't died, but it's undergone major surgery on most
  of its internal organs."
- Flat: "Experience means the product has real on-chain usage."
- Coinpresso: "Experience, for a crypto product, means on-chain proof the
  thing is actually used — not a fugazzi whitepaper concept, actual use."
A metaphor that breaks a point down in one line is worth more here than a
sentence of qualification. Every piece needs several moments like this, not
just the opening line — the whole draft is checked against this, not only
the intro.

The hyperbole lives in the framing, never in the facts. "Major surgery on its
internal organs" is a picture; "22% of the time" is a figure and stays exactly
what the source says. Bold about what it means, exact about what it is — the
honesty rules below are not loosened by any of this.

## Mechanics
- Second person for the reader ("your presale"), first person plural sparingly
  for Coinpresso ("we ran", "we found") — and only where it is literally true
- Sentences average around 18 words, with high variation
- Paragraphs of two to four sentences
- Heading case and phrasing follow the structure given for the post — the brief's headings are used as written
- Contractions are fine
- Bullet lists are allowed here, unlike the wire work, but never more than one
  list per two screens of prose
- Numerals for figures; en-GB spelling
- One call to action, at the end — direct and named, the way Liam's own
  guide does it ("contact Coinpresso for a free mini GEO audit"), never the
  soft "a conversation worth having"

## Register — measured off Liam's own writing, not described
Liam's GEO guide, the benchmark he named, runs about 190 words of introduction
with sentences averaging 21 words and one that runs to 52. He addresses the
reader directly ("your Web3 brand", "your project") four times before the first
heading, he names the Coinpresso method by its name ("the proprietary Crypto GEO
Trust Framework"), and he reaches for the idiom a founder would use over the
phrase a consultant would: "needs must", "nice to have", "buy-in", "cut through
the smoke". A first pass at matching his voice came out a third too short, in
dry editorial wit rather than swagger, and never once said "you" in two of four
pieces. So:
- Talk to the reader. "You" and "your" belong in every introduction and most
  sections.
- Name the thing. If the brief gives the method a name — the AI Citation
  Hierarchy, the objective-arbiter positioning, the invisible YMYL filter — use
  it, capitalised, as Liam would.
- Long sentences are welcome when they are real sentences. Liam's 52-word
  sentence is one clause joined to the next with conjunctions, and it parses.
  What is NOT his voice is a chain of fragments separated by commas ("Not the
  domain, not a content programme, one comparison page, out-earning entire
  portfolios") or a list of four noun phrases hung off a colon. He read one of
  those and called it word salad. One idea per sentence, a conjunction where
  two ideas join, a full stop where they do not. The schema-markup introduction
  he approved is the model: every sentence complete, one image, no stacking.
- One idiom per section is right. Three is a tic.
- Swagger in the framing, never in the figures.

## Structure — the shape of the page, measured off what the client approved

Paragraphs run two to four sentences. When the client reviewed the September
batch he went through the approved drafts and split the long paragraphs by hand;
every one he broke was over 125 words and nothing shorter was touched. Break at
the turn in the argument, never mid-thought. A wall of text is the fastest way
to have a piece sent back, and it was his single most repeated note.

Links are scattered through the piece, not clustered. Anchor text is the phrase
a reader would click — two to five words — and the rest of the claim
stays outside the link as ordinary prose. Two links a few words apart read as
stuffing even when both are good.

If you say "in a table" or call something a checklist, render one: a real
markdown table with a header row, or a "- " list. These posts argue that engines
lift structured facts and skip prose claims, so a post that describes a table in
a paragraph is failing its own advice where the reader can see it.

Spelling is American throughout: centralized, recognize, optimization, analyze,
behavior.

The structural model is "Why ChatGPT and Perplexity Don't Cite Crypto Brands",
which the client called perfect: readable, bite-sized paragraphs with naturally
scattered links. When a structural choice is uncertain, match that piece.

## Punctuation
Em dashes: sparing, not absent. The target is Liam's own rate — his GEO guide
runs about 5 per thousand words, so roughly one every other section. His
suggested rewrite of a line in this very piece uses one, correctly:
"...on-chain proof the thing is actually used — not a fugazzi whitepaper
concept, actual use." That dash is doing work a comma would not.

What went wrong before was volume, not the mark itself: drafts were running at
11-16 per thousand, above every one of Coinpresso's 159 published posts. The
fix is to stop hinging every other sentence on one, not to eliminate them.
Where a dash is the right mark, use it; where it is padding, a full stop, a
colon or a comma is better, and two short sentences usually beat one sentence
hinged on a dash. A piece with none at all has overcorrected.

## Connective tissue
Never open a sentence with "Separately," "Furthermore," "Additionally," or
"Moreover" — these are the clearest tells of AI-generated prose and read as
padding rather than logic. Connect two facts the way a person making a point
would: name what the combination means, don't just announce that a second
fact exists.
- AI-derived: "Separately, a related analysis found that ranking first on
  Google only correlates with getting cited by an AI engine around 22% of
  the time."
- Coinpresso: "It doesn't stop there. A related analysis found that ranking
  first on Google only correlates with getting cited by an AI engine around
  22% of the time. Read together, those two figures say something founders
  continue to be blind to: you can win the search results page and still be
  utterly invisible in the answer."

Never use: revolutionise, supercharge, unlock, seamless, game-changer, leverage
(as a verb), "in today's fast-paced world", "look no further", guaranteed
results, or any sentence that would survive being deleted.

Every claim should survive the question "compared to what, by how much, says
who?" — and every claim that survives it should still be said like someone
who means it, not like someone hedging it.`;

/**
 * Liam, 21 Sep 2026: "only link to blogs 2025 and onwards". Older posts are
 * out of date and he does not want readers sent to them. Posts published
 * before this date are never offered to the writer, so it cannot link them;
 * one it links anyway is repaired or unlinked like any page not on the list.
 */
export const OLDEST_LINKABLE_POST = "2025-01-01";

export function postIsLinkable(publishedAt?: string): boolean {
  return !!publishedAt && publishedAt.slice(0, 10) >= OLDEST_LINKABLE_POST;
}

/**
 * The last barrier before a post leaves the app: any competitor link or name
 * in the body or FAQs, whoever put it there — the writer, an old draft, or an
 * edit in the Doc. Release and publish refuse while this is non-empty.
 */
export function competitorProblems(draft?: { body: string; faqs?: Array<{ q: string; a: string }> }): string[] {
  if (!draft) return [];
  const text = [draft.body, ...(draft.faqs ?? []).flatMap((f) => [f.q, f.a])].join("\n");
  const out: string[] = [];
  for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (isCompetitorUrl(m[1])) out.push(`link to ${new URL(m[1]).hostname}`);
  }
  for (const n of competitorNamesIn(text)) out.push(`names ${n}`);
  return [...new Set(out)];
}
