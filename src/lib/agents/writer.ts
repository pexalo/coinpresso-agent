// ---------------------------------------------------------------------------
// Writer agent. Mid-tier Claude.
//
// Given a complete research brief and Liam's style profile, the writing task is
// constrained enough that the frontier tier buys very little. The brief does the
// thinking; this stage does the prose.
// ---------------------------------------------------------------------------

import { billed, callClaude } from "../providers/anthropic";
import { MODELS } from "../models";
import { PUBLICATIONS, boilerplateFor } from "../publications";
import { LIAM_STYLE_PROFILE, PLAYBOOK } from "../style-profile";
import { briefToPrompt, type BriefFaq, type BriefSection } from "../content-brief";
import { allArticles, exemplarBlock, priorWorkFromStore, styleExemplars } from "../archive-store";
import { feedbackBlock, readFeedback } from "../feedback";
import { linkablePages, linkTargetsBlock, relevantPosts } from "../link-map";
import {
  CLOSE_MOVES,
  COINPRESSO_PAGES,
  CLUSTER_NEIGHBOURS,
  clusterOf,
  clusterOfPillar,
  isCompetitorUrl,
  INTRO_MOVES,
  SPENT_CLOSERS,
  SPENT_OPENERS,
  closeMoveFor,
  introMoveFor,
  moveById,
  BLOG_ARCHIVE_ID,
  BLOG_OFF_GENRE_TITLE,
  BLOG_VOICE_EXEMPLARS,
  BLOG_DEFAULT_STRUCTURE,
  BLOG_PLAYBOOK,
  BLOG_PUBLICATION,
  BLOG_STYLE,
  CONTENT_TYPES,
  PILLARS,
} from "../blog";
import type { CallContext } from "../providers/routing";
import type { Brief, Draft, GuidanceNote, ResearchBrief, ReviewFinding } from "../types";

function styleBlock(): string {
  const s = LIAM_STYLE_PROFILE;
  return `WRITING STYLE — match this closely.

${s.styleSummary}

Specifics:
- Voice: ${s.voice.formality}; ${s.voice.person}; tone ${s.voice.tone.join(", ")}
- Sentences: average ~${s.sentences.averageWords} words, ${s.sentences.variability}
- Paragraphs: ${s.structure.paragraphLength}
- Headings: ${s.structure.headingStyle}, ${s.conventions.headingCase}, about ${s.structure.typicalHeadings} of them
- Opens with: ${s.structure.opensWith}
- Spelling: ${s.vocabulary.spelling}
- Numbers: ${s.conventions.numbers}
- Contractions: ${s.punctuation.contractions ? "yes" : "no"}. Exclamation marks: ${s.punctuation.exclamation ? "yes" : "no"}.
- Bullet lists: ${s.structure.usesBulletLists ? "yes" : "no — write in prose"}
- CTA: ${s.conventions.ctaStyle}
- Never use these words: ${s.vocabulary.avoids.join(", ")}

HARD RULES:
${s.doNot.map((d) => `- ${d}`).join("\n")}

These are style constraints only. They never override the sourcing rules or the
factual constraints of the research brief.`;
}

const SYSTEM = `You are the blog writer for Coinpresso's Moonberg crypto PR
programme. You write wire-ready press releases that read as market analysis.

THE ONE RULE THAT OVERRIDES EVERYTHING: you may not introduce any external URL,
publisher, analyst, statistic or price figure that does not appear in the research
brief you are given. If the brief does not contain it, it does not go in the
article. Inventing a plausible-looking source URL is the single worst failure
available to you — it is worse than omitting the claim entirely, because a wire
will publish it and a reader will click it.

If the brief is thin on something the framework asks for, write around the gap.
Do not fill it.

${PLAYBOOK}`;

/**
 * Parse the writer's sectioned plain-text reply into a Draft.
 *
 * WHY THE WRITER DOES NOT RETURN JSON ANY MORE. A 1,500-word markdown article
 * inside a JSON string needs every quote and newline escaped, and articles on
 * this programme are DENSE with quotes — quoted AI prompts, quoted headlines,
 * quoted analyst lines. One unescaped quote or one raw newline and the entire
 * paid reply was unparseable; it failed twice in production in exactly this
 * way on the first live article. Sectioned plain text has no escaping at all,
 * so the failure class does not exist: the only way to break this format is to
 * omit a section header, which the diagnostics below name precisely.
 */
function parseDraftSections(
  text: string,
  ctx: { stage: string; stopReason?: string; maxTokens: number }
): Omit<Draft, "wordCount"> {
  const grab = (name: string): string => {
    const m = text.match(
      new RegExp(`===${name}===\\s*([\\s\\S]*?)(?=\\n===[A-Z]+===|$)`)
    );
    return m ? m[1].trim() : "";
  };

  const headline = grab("HEADLINE");
  const body = grab("BODY");
  if (!headline || !body) {
    if (ctx.stopReason === "max_tokens") {
      throw new Error(
        `The ${ctx.stage} reply was cut off at the ${ctx.maxTokens} token limit before it finished the article. Retry the stage; if it recurs, the format's word target and this ceiling disagree.`
      );
    }
    const missing = !headline ? "===HEADLINE===" : "===BODY===";
    throw new Error(
      `The ${ctx.stage} reply did not contain the ${missing} section. It began: ${JSON.stringify(text.slice(0, 160))}`
    );
  }

  const datelineRaw = grab("DATELINE");
  const dateline =
    !datelineRaw || /^none\.?$/i.test(datelineRaw) ? null : datelineRaw;

  const faqs: Array<{ q: string; a: string }> = [];
  for (const block of grab("FAQS").split(/\n(?=Q:)/)) {
    const m = block.match(/^Q:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*)$/);
    if (m) faqs.push({ q: m[1].trim(), a: m[2].trim() });
  }

  const tags = grab("TAGS")
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

  return { headline, dateline, body, faqs, tags };
}

/**
 * Make the draft's H2s the brief's headings — exactly.
 *
 * WHY THIS IS CODE AND NOT A PROMPT. The first live articles followed the
 * client's outline section for section and still came back wrong, because
 * every heading had been rephrased as a question. The client's brief is a
 * document a person wrote and signed off; its headings are not suggestions
 * for the model to improve on. So the prompt says "verbatim", and then this
 * function makes it true: when the draft has the same number of H2s in the
 * same order, each heading is REPLACED with the brief's. A model that keeps
 * the sequence but drifts on wording — the failure actually observed — is
 * corrected for free. A model that merged, split or dropped a section has not
 * followed the brief, and that is thrown as an error naming the gap, so the
 * stage fails loudly and the retry re-runs only the writer.
 */
export function enforceOutline(body: string, outline: BriefSection[]): string {
  // Code is hidden first. A post about schema markup shows the reader what a
  // heading looks like, and a "## " line inside a fence was being counted as a
  // real section — which failed the outline check on a correct draft, and, when
  // the count happened to match, rewrote the heading inside the example.
  const { masked, restore } = maskCode(body);
  const lines = masked.split("\n");
  const h2 = lines
    .map((l, i) => ({ i, text: l.match(/^##\s+(.+?)\s*$/)?.[1] }))
    .filter((x): x is { i: number; text: string } => Boolean(x.text));

  if (h2.length !== outline.length) {
    const have = h2.map((h) => `"${h.text}"`).join(", ") || "none";
    throw new Error(
      `The writer produced ${h2.length} H2 sections but the client's brief specifies ${outline.length}. ` +
        `Brief: ${outline.map((o) => `"${o.title}"`).join(", ")}. ` +
        `Draft: ${have}. The outline is a contract — retry the writer.`
    );
  }
  h2.forEach((h, k) => {
    lines[h.i] = `## ${outline[k].title}`;
  });
  return restore(lines.join("\n"));
}

/**
 * There must be an introduction before the first section.
 *
 * Checked rather than merely asked for, like the outline: the first rewrite
 * came back structurally perfect and opened on "## Section 1" with nothing in
 * front of it, and the client noticed before the code did. Sixty words is a
 * floor, not a target — it separates "a real opening" from "one sentence and
 * a heading".
 */
/**
 * The introduction: long enough, and not one of the openings that is spent.
 *
 * The floor was 60 words against a house length of ~190; a 52-word opener
 * passed. It is 110 now — a third under Liam's own, which is as low as an
 * introduction can go and still set a scene. Then the first two sentences are
 * checked against the openers four of seven posts shared, because a writer
 * told not to use one does it slightly differently, and slightly differently
 * is still the same opening to a reader.
 */
export function enforceIntro(body: string): void {
  body = proseOf(body);
  const firstH2 = body.search(/^##\s+/m);
  const intro = firstH2 === -1 ? body : body.slice(0, firstH2);
  const words = wordCount(intro);
  if (words < 110) {
    throw new Error(
      `The introduction is ${words} words; the house runs about 190 and the floor is 110. ` +
        `Two paragraphs before the first H2 that talk to the reader and set the scene — retry the writer.`
    );
  }
  const opening = intro.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const spent = SPENT_OPENERS.find((re) => re.test(opening));
  if (spent) {
    throw new Error(
      `The piece opens "${opening.slice(0, 120)}…" — the "an AI engine will not mention you" opening ` +
        `that four of the first seven posts used. Open it the way the brief assigns, not this way. Retry the writer.`
    );
  }
}

/**
 * The closer: not the one that ended four of seven posts.
 *
 * "If you want a second opinion… that's a conversation worth having before
 * you spend" is the intro problem from the other end, and it reads even worse
 * there because it is the last thing a founder sees. Liam ends his own guide
 * on a direct, named offer. Checked on the last paragraph of prose.
 */
export function enforceCloser(body: string): void {
  const paras = proseOf(body)
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter((x) => x && !/^#{1,6}\s/.test(x));
  const last = paras[paras.length - 1] ?? "";
  const spent = SPENT_CLOSERS.find((re) => re.test(last));
  if (spent) {
    throw new Error(
      `The piece ends "${last.slice(0, 120)}…" — the "second opinion / conversation worth having" closer ` +
        `four of the first seven posts used. End it the way the brief assigns: a direct, named offer, a dare, a callback, or a priority list. Retry the writer.`
    );
  }
}

/** "Q2: How can…" → "How can…". The imported briefs carry these labels. */
/**
 * The sentence openers Liam named as the clearest AI tell — "Separately, a
 * related analysis found…" — plus their siblings. A person making a point
 * says what two facts mean together; a model announces that a second fact
 * exists. Prompt-only for one round would be optimism: every structural rule
 * on this track that was prompt-only got ignored at least once.
 */
const AI_OPENERS = /(^|[.!?]\s+|\n)(Separately|Furthermore|Additionally|Moreover|In conclusion|It is worth noting|It's worth noting)\b/g;

/**
 * Em dashes per thousand words, capped just above the house's own heaviest use.
 *
 * Measured over Coinpresso's 159 published posts: median 0, ninetieth
 * percentile 1.2, single heaviest piece 9.5. Liam's own GEO guide runs at 5,
 * so this is not a ban — it is his rate with headroom. The seven drafts in the
 * queue ran at 11.4 to 15.7, above every real post on the domain, which is
 * exactly the texture a reader clocks as machine-written without being able to
 * name why.
 */
const EM_DASH_PER_1000 = 6;
// Six, not zero. Liam's own guide runs about five per thousand and his
// suggested rewrite of a line in the E-E-A-T piece uses a dash correctly, so
// the target is his rate with a little headroom. The first version of this
// guidance said "the house sits near zero" — quoting the median across 159
// posts — and the writer duly produced a 2,100-word piece with none at all,
// having stripped the dash out of Liam's own sentence to get there. A budget
// is a ceiling, not a target.

/**
 * Fenced blocks and inline spans, hidden from everything that edits prose.
 *
 * Every check and every mechanical fix was reading the whole body, code
 * included, and three separate bugs fell out of that:
 *
 *   softenEmDashes rewrote a JSON string, turning
 *     "A self-custody wallet — non-custodial, open source"
 *   into "...wallet. Non-custodial..." inside a schema sample a reader is
 *   meant to copy and paste. Silent corruption of the deliverable.
 *
 *   trimLinks unlinked a markdown example inside a code fence, destroying the
 *   very thing the code block was demonstrating.
 *
 *   enforceProse counted dashes inside JSON. A schema post with five dashes in
 *   its example strings failed the prose check at 128 per thousand words, and
 *   no rewrite could have saved it: the writer cannot remove those dashes
 *   without changing the schema it is documenting. Three attempts, then a dead
 *   run, on a post that was correct.
 *
 * The schema markup post carries fourteen fences and sixteen inline spans, so
 * this is not hypothetical — it is the next post in the queue.
 *
 * Code is swapped for a private-use sentinel before anything looks at the
 * text, and put back afterwards. Transforms only ever delete or replace other
 * characters, never reorder, so restoring in order is sound.
 */
const CODE_SPAN = /```[\s\S]*?```|`[^`\n]+`/g;
const SENTINEL = "\uE000";

export function maskCode(body: string): {
  masked: string;
  restore: (s: string) => string;
} {
  const blocks: string[] = [];
  const masked = body
    .split(SENTINEL)
    .join("")
    .replace(CODE_SPAN, (m) => {
      blocks.push(m);
      return SENTINEL;
    });
  let i = 0;
  return { masked, restore: (s) => s.replace(/\uE000/g, () => blocks[i++] ?? "") };
}

/** The body as prose only — what a reader reads, minus the code. */
export function proseOf(body: string): string {
  return maskCode(body).masked.split(SENTINEL).join(" ");
}

/**
 * A dash between digits is a range, not a rhetorical dash. "2024-2026" and
 * "5-10%" must not count against a prose budget.
 */
const PROSE_DASH = /(?<![0-9]\s?)[—–](?!\s?[0-9])/g;

/**
 * Tails that continue the sentence rather than starting a new one. After one
 * of these a comma is right; after anything else a full stop is safe, and a
 * fragment is a shape this voice already uses.
 */
const CONTINUES = new Set([
  "and", "but", "or", "nor", "yet", "so", "because", "which", "who", "whom",
  "whose", "while", "though", "although", "unless", "until", "if", "when",
  "where", "than", "rather", "especially", "including", "such", "like",
  "plus", "not", "with", "without", "from", "for", "as",
]);

/**
 * Bring the em dash count down to the budget, deterministically.
 *
 * The model cannot do this. Asked to "cut to 11 or fewer" it produced 27, then
 * 27 again, then 27 again: counting its own punctuation across two thousand
 * words is not something it can hold, so three attempts bought three identical
 * drafts and the run failed on a formatting detail while the article underneath
 * was fine. Punctuation is mechanical, so a machine should do it.
 *
 * Measured on the real drafts, almost every dash is "clause — but/because/
 * which clause", so a comma is correct after a continuing word and a full stop
 * is correct otherwise. Dashes are converted from the end backwards until the
 * budget is met, which leaves the earliest — usually the strongest, and the
 * one in the opening — untouched.
 */
export function softenEmDashes(body: string, allowed: number): string {
  const { masked, restore } = maskCode(body);
  const hits = [...masked.matchAll(PROSE_DASH)].map((m) => m.index!);
  if (hits.length <= allowed) return body;

  let out = masked;
  for (const i of hits.slice(allowed).reverse()) {
    // The dash, and any spaces hugging it.
    let start = i;
    let end = i + 1;
    while (start > 0 && out[start - 1] === " ") start--;
    while (end < out.length && out[end] === " ") end++;

    const tail = out.slice(end);
    const firstWord = (tail.match(/^([A-Za-z']+)/)?.[1] ?? "").toLowerCase();

    if (CONTINUES.has(firstWord)) {
      out = `${out.slice(0, start)}, ${tail}`;
    } else {
      // Full stop, and the tail now opens a sentence.
      const capped = tail.charAt(0).toUpperCase() + tail.slice(1);
      out = `${out.slice(0, start)}. ${capped}`;
    }
  }
  return restore(out);
}

/**
 * Words, not tokens. " — " is its own token when a string is split on
 * whitespace, so counting naively meant softening the dashes SHRANK the word
 * count, which shrank the budget, which left the draft over the line it had
 * just been brought under. The preflight harness caught this on a 2,646-word
 * draft that came out at 16 dashes against a budget that had quietly dropped
 * from 16 to 15. A token with no letter or digit in it is punctuation.
 */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export function emDashBudget(words: number): number {
  return Math.max(3, Math.floor((EM_DASH_PER_1000 * words) / 1000));
}

/**
 * The budget for a specific body, and the ONLY way callers should compute it.
 *
 * The fixer and the checker have now disagreed twice about the denominator.
 * First over whether " — " is a word (it is a token, not a word). Then over
 * whether code counts (it does not, once the checks stopped reading it) — the
 * schema post lost a third of its length to fenced JSON, so a body-derived
 * budget softened it to 16 dashes against a prose-derived limit of 11 and the
 * draft failed after being fixed. Two functions computing the same number from
 * two different strings is the bug; there is one function now.
 */
export function emDashBudgetFor(body: string): number {
  return emDashBudget(wordCount(proseOf(body)));
}

/** Soften a body to its own budget. What production calls. */
export function softenToBudget(body: string): string {
  return softenEmDashes(body, emDashBudgetFor(body));
}

export function enforceProse(body: string): void {
  body = proseOf(body);
  const problems: string[] = [];

  const hits = [...body.matchAll(AI_OPENERS)].map((m) => m[2]);
  if (hits.length) {
    problems.push(
      `${hits.length} sentence${hits.length === 1 ? "" : "s"} opening with ${[...new Set(hits)]
        .map((h) => `"${h}"`)
        .join(", ")} — the connective tissue the client flagged as AI-derived`
    );
  }

  const dashes = (body.match(PROSE_DASH) ?? []).length;
  const words = wordCount(body);
  // A floor of three, so the rate cannot fire on a short piece where one dash
  // is a large share of very few words. At real article length (1,400-2,700
  // words here) the rate is what binds.
  // `body` is already prose here, so this is the same denominator softenToBudget used.
  const allowed = emDashBudget(words);
  if (dashes > allowed) {
    // Quoting the sentences gives the model something it can act on. "Cut to
    // 11" is a counting task it cannot do; "rewrite these six sentences" is a
    // writing task it can.
    const guilty = (body.match(/[^.!?\n]*[—–][^.!?\n]*[.!?]/g) ?? [])
      .map((x) => x.trim())
      .filter((x) => PROSE_DASH.test(x))
      .slice(0, 6)
      .map((x) => `      "${x.length > 150 ? `${x.slice(0, 150)}…` : x}"`)
      .join("\n");
    problems.push(
      `${dashes} em dashes in ${words} words (${((dashes / Math.max(words, 1)) * 1000).toFixed(1)} per thousand; the house runs about 5, so at most ${allowed} here). Keep the ones doing real work and rewrite the rest — a full stop, a colon or a comma does the job:\n${guilty}`
    );
  }

  if (problems.length) {
    throw new Error(`The draft reads as machine-written: ${problems.join("; ")}. Retry the writer.`);
  }
}

/**
 * Liam's blend per post: 3-5 internal links to real coinpresso.io pages,
 * spread through the body, and 3-5 external links each carrying one claim.
 * Counted here rather than trusted, because the previous drafts carried a
 * pillar link to a page that did not exist and nobody could tell.
 */
/**
 * Words too generic to prove an anchor points at the right page.
 *
 * "crypto SEO" and "crypto GEO" share "crypto" and mean different pages, which
 * is exactly the mistake Liam caught: an anchor reading "crypto SEO guide"
 * pointing at a years-old SEO post when the GEO guide was the relevant one.
 * Matching has to happen on the distinctive word, so the common ones are
 * dropped before comparing.
 */
const GENERIC_ANCHOR_WORDS = new Set([
  "crypto", "cryptocurrency", "web3", "coinpresso", "guide", "guides", "page",
  "pages", "blog", "blogs", "post", "posts", "article", "the", "a", "an", "our",
  "your", "for", "and", "of", "to", "in", "on", "with", "marketing", "agency",
  "agencies", "service", "services", "complete", "ultimate", "best", "top",
  "how", "what", "why", "we", "us", "read", "more", "here", "this", "that",
  "2024", "2025", "2026", "work", "team",
]);

/**
 * Does the anchor name the page it points at?
 *
 * Normally: one distinctive word in common. But a topic can be made entirely
 * of words the generic list strips — "Web3 marketing" is both — and then it
 * reduced to nothing, nothing matched nothing, and an anchor reading "Web3
 * marketing" was rejected for not naming the Web3 marketing page. When the
 * topic has no distinctive words, its own words are what count.
 */
function namesTopic(anchor: string, topic: string): boolean {
  // The client's link map supplies alternates joined with " | "; any of them
  // counts, so "PPC agency" names the crypto PPC page if the map says so.
  return topic.split(" | ").some((t) => namesOne(anchor, t.trim()));
}

function namesOne(anchor: string, topic: string): boolean {
  const want = anchorTokens(topic);
  if (want.size) return [...anchorTokens(anchor)].some((w) => want.has(w));
  const raw = new Set(topic.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return anchor
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w && raw.has(w));
}

function anchorTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    // en-GB and en-US spellings of the same term must match each other.
    .replace(/isation\b/g, "ization")
    .replace(/ise\b/g, "ize")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const out = new Set(
    words.filter((w) => w.length > 1 && !GENERIC_ANCHOR_WORDS.has(w))
  );

  // A page titled "Generative Engine Optimization…" is the page an anchor calls
  // "the GEO guide". Without this the correct anchor is rejected for using the
  // acronym the industry actually says, which would fail the draft and retry
  // it into the same wording.
  for (let i = 0; i < words.length; i++) {
    for (const n of [3, 4]) {
      if (i + n > words.length) continue;
      const initials = words.slice(i, i + n).map((w) => w[0]).join("");
      if (initials.length >= 3) out.add(initials);
    }
  }
  return out;
}

const normaliseUrl = (u: string) =>
  u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

/**
 * Put the pillar link on a phrase the draft already wrote.
 *
 * "The pillar page is not linked" killed three attempts in a row, and it is
 * the one rule in this suite the CLIENT never asked for — it comes from the
 * cluster strategy in the playbook, not from Liam. Failing an otherwise
 * publishable article over it is disproportionate.
 *
 * It is also unnecessary. Checked across all seven stored drafts, every single
 * one already says the pillar's topic somewhere in the prose — "generative
 * engine optimisation", or "GEO" — and simply does not link it. So the link is
 * not missing content, only missing markup, and markup is mechanical.
 *
 * This is Liam's own instruction carried out in code rather than requested in
 * a prompt: "crypto generative engine optimization with anchor text link to
 * GEO page". The first unlinked mention gets the link, longest phrase first so
 * the anchor is the specific one rather than the bare acronym. Nothing is
 * written, moved or invented — a phrase already on the page becomes clickable.
 * If the draft never mentions the topic at all there is nothing to link, and
 * the check still sends it back.
 */
export function ensurePillarLink(body: string, hub?: string, topic?: string): string {
  if (!hub) return body;
  const { masked, restore } = maskCode(body);
  const target = normaliseUrl(hub);

  const linkSpans = [...masked.matchAll(/\[[^\]]*\]\([^)\s]*\)/g)].map((m) => [
    m.index!,
    m.index! + m[0].length,
  ]);
  // Already linked somewhere? Then there is nothing to do.
  for (const m of masked.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (normaliseUrl(m[1]) === target) return body;
  }

  const bare = (topic ?? "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const acronym = (topic ?? "").match(/\(([A-Z]{2,})\)/)?.[1];
  const phrases = [
    bare,
    bare.split(/\s+for\s+/i)[0],
    ...(acronym ? [acronym] : []),
  ]
    .map((x) => x.trim())
    .filter((x) => x.length > 2)
    // en-GB and en-US spellings of the same word are the same phrase.
    .flatMap((x) => [x, x.replace(/ization\b/gi, "isation"), x.replace(/isation\b/gi, "ization")])
    .filter((x, i, a) => a.indexOf(x) === i)
    .sort((a, b) => b.length - a.length);

  for (const phrase of phrases) {
    // An acronym is matched case-sensitively so "GEO" does not hit "geography";
    // ordinary phrases are matched however the writer cased them.
    const isAcronym = /^[A-Z]{2,}$/.test(phrase);
    const re = new RegExp(
      `(?<![\\w-])(${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![\\w-])`,
      isAcronym ? "g" : "gi"
    );
    for (const m of masked.matchAll(re)) {
      const at = m.index!;
      if (linkSpans.some(([a, b]) => at >= a && at < b)) continue;
      const lineStart = masked.lastIndexOf("\n", at) + 1;
      if (/^\s*#{1,6}\s/.test(masked.slice(lineStart, at + 1))) continue;
      const out =
        masked.slice(0, at) + `[${m[1]}](${hub})` + masked.slice(at + m[1].length);
      return restore(out);
    }
  }
  return body;
}

/**
 * Take a surplus link off, keeping the words.
 *
 * The writer overshoots. Asked for 3-5 it produced 9 internal and 9 external,
 * three attempts running, exactly as it produced 27 em dashes three times:
 * holding a running total across two thousand words is not something it can
 * do, so every retry bought the same answer at full price.
 *
 * Nothing is lost by fixing this in code. Unlinking turns [words](url) back
 * into words — the sentence, the claim and the attribution by name all survive,
 * and only the hyperlink goes. That is precisely the remedy the client asked
 * for: fewer links, not less substance.
 *
 * ONLY EVER REMOVES. A missing link is a writing task and stays the writer's
 * job; a surplus one is arithmetic and is settled here. Order of sacrifice:
 * repeats of a URL already linked, then anything past the cap, then whatever
 * still crowds a paragraph. Document order decides what survives, which keeps
 * the body's links and sheds the conclusion's — the "stuffed on the end"
 * pattern goes first.
 */
/** Liam's floor: "3-5 INTERNAL links to coinpresso landing pages and blogs". */
const MIN_INTERNAL_LINKS = 3;
/** Liam, 19 Sep: keep readers in-house. External is for primary sources only. */
const MAX_EXTERNAL_LINKS = 3;

export function trimLinks(
  body: string,
  pillarHub?: string,
  maxInternal = 5,
  maxExternal = 5,
  maxPerParagraph = 2
): string {
  const { masked, restore } = maskCode(body);
  const links = [...masked.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)];
  if (!links.length) return body;

  const isInternal = (u: string) => /^https?:\/\/(www\.)?coinpresso\.io(\/|$)/i.test(u);
  const pillar = pillarHub ? normaliseUrl(pillarHub) : null;

  // Two internal links are not negotiable, and are claimed before any
  // counting starts.
  //
  // The pillar, because every post links its own pillar.
  //
  // And one post, because Liam asked for links to "coinpresso landing pages
  // AND blogs" and document order alone does not deliver that: service pages
  // come up early in a piece and posts get referenced late, so the cap was
  // being filled by five landing pages while three Coinpresso posts sat named
  // in the prose with no link on them — including the llms.txt guide, which is
  // exactly the newer-post case he raised.
  const protect: number[] = [];
  const claim = (i: number) => {
    if (i >= 0 && !protect.includes(i)) protect.push(i);
  };
  if (pillar) {
    claim(links.findIndex((m) => isInternal(m[2]) && normaliseUrl(m[2]) === pillar));
  }
  claim(links.findIndex((m) => isInternal(m[2]) && /\/blog\//i.test(m[2])));

  const drop = new Set<number>();
  const seen = new Set<string>();
  let internal = 0;
  let external = 0;

  const consider = (i: number) => {
    const m = links[i];
    const url = normaliseUrl(m[2]);
    if (seen.has(url)) {
      drop.add(i);
      return;
    }
    if (isInternal(m[2])) {
      if (internal >= maxInternal && !protect.includes(i)) {
        drop.add(i);
        return;
      }
      internal++;
    } else {
      if (external >= maxExternal) {
        drop.add(i);
        return;
      }
      external++;
    }
    seen.add(url);
  };

  for (const i of protect) consider(i);
  for (let i = 0; i < links.length; i++) {
    if (!protect.includes(i)) consider(i);
  }

  // Whatever survived may still cluster. Count per block and shed the
  // extras — but never below the internal minimum, and externals first.
  //
  // This used to shed the LATEST links in a crowded paragraph regardless of
  // kind, and it ran before the link check. So the writer would add the
  // third internal link the check demanded, it would land beside two
  // citations, this would strip it, and the check would fail the draft for
  // having two internal links. Told to add one, the writer added one, and it
  // was stripped again. One run bought that loop five times at $0.85.
  //
  // Blocks are list-aware too: a bullet with a link on it is its own block,
  // not a crowded paragraph with its neighbours.
  const kept = links
    .map((m, i) => ({ i, start: m.index! }))
    .filter(({ i }) => !drop.has(i));
  const blockOf = (pos: number) => {
    const blank = masked.lastIndexOf("\n\n", pos);
    // Inside a list, the nearest preceding line start that begins an item.
    const lineStart = masked.lastIndexOf("\n", pos - 1) + 1;
    const line = masked.slice(lineStart, pos);
    return /^\s*(?:[-*+]|\d+[.)])\s/.test(line) ? lineStart : blank;
  };
  const byBlock = new Map<number, number[]>();
  for (const { i, start } of kept) {
    const key = blockOf(start);
    byBlock.set(key, [...(byBlock.get(key) ?? []), i]);
  }
  let internalKept = kept.filter(({ i }) => isInternal(links[i][2])).length;
  for (const idxs of byBlock.values()) {
    let over = idxs.length - maxPerParagraph;
    if (over <= 0) continue;
    // Externals first, latest first.
    for (const i of [...idxs].reverse()) {
      if (over <= 0) break;
      if (protect.includes(i) || isInternal(links[i][2])) continue;
      drop.add(i);
      over--;
    }
    // Then internals, latest first, only while there are more than the
    // minimum the check will demand.
    for (const i of [...idxs].reverse()) {
      if (over <= 0) break;
      if (protect.includes(i) || !isInternal(links[i][2])) continue;
      if (internalKept <= MIN_INTERNAL_LINKS) break;
      drop.add(i);
      internalKept--;
      over--;
    }
  }

  if (!drop.size) return body;

  // Rebuild back to front so earlier offsets stay valid.
  let out = masked;
  for (const i of [...drop].sort((a, b) => b - a)) {
    const m = links[i];
    out = out.slice(0, m.index!) + m[1] + out.slice(m.index! + m[0].length);
  }
  return restore(out);
}

/**
 * Liam's blend per post, counted rather than trusted.
 *
 * "3-5 INTERNAL links to coinpresso landing pages and blogs, seamlessly
 * integrated in a natural way throughout the content, not stuffed on to
 * conclusions as an 'after the fact'. Crypto SEO should have an anchor text
 * link to crypto SEO page, crypto generative engine optimization with anchor
 * text link to GEO page etc." Every clause of that is checked here: the count,
 * both bounds, that the page exists, that the anchor names the destination,
 * and where in the piece the links fall.
 */
/**
 * Liam, September 2026: "we should also get some internal links in the FAQ as
 * well — looks like none is on the FAQ." He was right; the FAQ answers were
 * never asked to link and never checked. This asks for at least one across the
 * block. Soft, like the body counts: a person adds a link in ten seconds, and
 * the invented-URL fault is caught separately as a hard one.
 */
/**
 * A link bolted onto the end of a section to make the count.
 *
 * Liam, on the Circumventing Systems piece: the paragraph ended "…a
 * compliance surface, the same discipline we'd expect a project to bring to
 * crypto SEO or PR" — a clause about nothing, attached to a paragraph about
 * Google Ads, so the post could reach three internal links. His words:
 * "irrelevant and stuffing to get links on the end just to fit rules."
 *
 * The shape is recognisable: a section's LAST sentence carries an internal
 * link, introduced after a comma or dash, to a page whose topic words appear
 * nowhere else in that section. Soft, because a person can tell in a second
 * whether the link belongs and a counter can only guess — but it names the
 * clause, so the writer or the editor can cut it.
 */
/**
 * Phrases that were shown to the writer as an EXAMPLE and must not be copied.
 *
 * Liam's "oops-a-daisy" opening is in the intro instruction as the standard
 * for register. Bernard: "doesn't need the word oops-a-daisy in all blogs —
 * it's just to humanise it." A model shown an example reuses the example,
 * so the phrase itself is barred. Soft: a person can pass it if it truly
 * belongs, but the second post to say it is the one that gets noticed.
 */
const EXEMPLAR_PHRASES = [/\boops[- ]a[- ]daisy\b/i];

export function enforceNoExemplarPhrases(body: string): void {
  const hits = EXEMPLAR_PHRASES.filter((re) => re.test(proseOf(body)));
  if (!hits.length) return;
  throw new Error(
    `the draft reuses a phrase from the client's example opening ("oops-a-daisy"). The example shows the register, not the words — a phrase that landed once reads as a tic the second time. Find this post's own aside.`
  );
}

export function enforceNoBoltOnLinks(body: string, known: Map<string, string>): void {
  const isInternal = (u: string) => /^https?:\/\/(www\.)?coinpresso\.io(\/|$)/i.test(u);
  const sections = proseOf(body).split(/^##\s+/m).slice(1);
  const flagged: string[] = [];
  for (const section of sections) {
    const paras = section.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const last = paras[paras.length - 1] ?? "";
    // Table rows and list items are not sentences.
    if (!last || last.startsWith("|") || LIST_ITEM.test(last)) continue;
    const sentences = last.split(/(?<=[.!?])\s+/);
    const tail = sentences[sentences.length - 1] ?? "";
    const m = tail.match(/[,—–-]\s+([^,]*?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)[^.]*\.?)\s*$/);
    if (!m || !isInternal(m[3])) continue;
    const topic = known.get(normaliseUrl(m[3]));
    if (!topic) continue;
    // Does the section talk about that page's subject anywhere BEFORE the link?
    const before = section.slice(0, section.lastIndexOf(m[0]));
    const words = new Set(anchorTokens(topic.split(" | ")[0]));
    const mentioned = [...anchorTokens(before)].some((w) => words.has(w));
    if (!mentioned) flagged.push(m[1].trim());
  }
  if (!flagged.length) return;
  throw new Error(
    `${flagged.length} link${flagged.length === 1 ? "" : "s"} bolted onto the end of a section to make the count. The client's note: "irrelevant and stuffing to get links on the end just to fit rules". Cut the clause and leave the count short, or move the link to a sentence that is actually about that page:\n${flagged
      .map((f) => `      "…, ${f}"`)
      .join("\n")}`
  );
}

/**
 * A page is linked once per post. The second link comes off, in code.
 *
 * Liam, on the attribution piece: "has also duplicated use of crypto PPC
 * internal link, already been used in the composition." trimLinks already
 * dedupes within the body; the FAQs are stored apart and were never checked
 * against it, so a page linked in section three was linked again in answer
 * five. The body keeps its link and the FAQ keeps its words. If that leaves
 * the FAQ block with no internal link, enforceFaqLinks says so and the
 * writer picks a different page — which is the point.
 */
export function dedupeLinksAcrossFaqs(
  body: string,
  faqs: Array<{ q: string; a: string }>
): Array<{ q: string; a: string }> {
  const seen = new Set(
    [...proseOf(body).matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => normaliseUrl(m[1]))
  );
  return faqs.map((f) => ({
    ...f,
    a: f.a.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (whole, text: string, url: string) => {
      const key = normaliseUrl(url);
      if (seen.has(key)) return text;
      seen.add(key);
      return whole;
    }),
  }));
}

/**
 * Links stay in the post's neighbourhood.
 *
 * Liam's meta-mapping sheet: "the links within the content should be
 * focused around that cluster and closely-connected clusters rather than
 * spray-and-pray approach to our entire stack." His example: a GEO article
 * links content, SEO, contact, home and posts — not the PPC page.
 *
 * Soft, because the map of what neighbours what is a judgement he can
 * change, and a person reading the sentence can tell in a second whether
 * the link earned its place. Brand pages are reachable from everywhere.
 * Blog posts are not clustered and are not checked here; relevance for
 * those is the job of relevantPosts and the conclusion rule.
 */
export function enforceLinkCluster(
  body: string,
  faqs: Array<{ q: string; a: string }>,
  pillarHub: string | undefined,
  known: Map<string, string>
): void {
  const home = clusterOfPillar(pillarHub);
  if (!home) return;
  const allowed = new Set(CLUSTER_NEIGHBOURS[home]);
  const text = proseOf(body) + "\n" + faqs.map((f) => f.a).join("\n");
  const strays: string[] = [];
  for (const m of text.matchAll(/\[([^\]]+)\]\((https?:\/\/(?:www\.)?coinpresso\.io[^)\s]*)\)/gi)) {
    const url = normaliseUrl(m[2]);
    if (!known.has(url)) continue;
    const c = clusterOf(url);
    if (!c || allowed.has(c)) continue;
    strays.push(`"${m[1]}" → ${url.replace(/^https?:\/\/(www\.)?coinpresso\.io/, "")} (${c})`);
  }
  if (!strays.length) return;
  throw new Error(
    `${strays.length} internal link${strays.length === 1 ? " sits" : "s sit"} outside this post's cluster (${home} and its neighbours: ${[...allowed].join(", ")}). The client's note: "links within the content should be focused around that cluster and closely-connected clusters rather than spray-and-pray". Swap for a page in the cluster, or a relevant post, or drop it:\n${strays
      .map((x) => `      ${x}`)
      .join("\n")}`
  );
}

export function enforceFaqLinks(
  faqs: Array<{ q: string; a: string }>,
  known: Map<string, string>,
  scope: "hard" | "soft" | "all" = "all"
): void {
  if (!faqs.length) return;
  const isInternal = (u: string) => /^https?:\/\/(www\.)?coinpresso\.io(\/|$)/i.test(u);
  const hard: string[] = [];
  const soft: string[] = [];
  let internal = 0;
  for (const f of faqs) {
    for (const m of f.a.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
      if (!isInternal(m[2])) continue;
      internal++;
      const topic = known.get(normaliseUrl(m[2]));
      if (!topic) {
        hard.push(`"${m[2]}" in an FAQ answer is not a page on coinpresso.io — link only what you were given`);
      } else if (!namesTopic(m[1], topic)) {
        hard.push(`the FAQ anchor "${m[1]}" points at the ${topic.split(" | ")[0]} page — the anchor text has to name where it goes`);
      }
    }
  }
  const externals = faqs.flatMap((f) =>
    [...f.a.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !isInternal(u))
  );
  for (const u of externals) {
    if (isCompetitorUrl(u)) {
      hard.push(`"${u}" in an FAQ answer is a competitor agency or vendor — never link one`);
    }
  }
  // Liam, 19 Sep, on FAQs that cited three vendors and no Coinpresso page:
  // "agent is adding them, but adding external links, we want to keep users
  // within our website hierarchy as much as possible." So the FAQ block is
  // where the site's own pages go — a service page, an older post, contact,
  // the case studies. An external citation is allowed where a figure needs
  // its source, and no more than that.
  if (internal === 0) {
    soft.push(
      `no internal links in the ${faqs.length} FAQ answers. The client's note: "we want to keep users within our website hierarchy as much as possible". Where a Coinpresso page answers the question — a service page, a case study, an earlier post, or the contact page — link it inside the answer; one or two across the block.`
    );
  }
  if (externals.length > internal + 1) {
    soft.push(
      `the FAQ answers send readers off-site ${externals.length} time${externals.length === 1 ? "" : "s"} and back into coinpresso.io ${internal} — reverse that. Keep an external citation only where an answer states a figure that needs its source.`
    );
  }
  const chosen = scope === "hard" ? hard : scope === "soft" ? soft : [...hard, ...soft];
  if (chosen.length) throw new Error(`FAQ linking: ${chosen.join("; ")}. Retry the writer.`);
}

/**
 * `scope` splits Liam's link rules by what a failure costs.
 *
 *   hard  a URL that does not exist, a relative path nothing can check, the
 *         pillar missing, an anchor that does not name its page. Correctness;
 *         the writer can see and fix each one, so it is rejected.
 *   soft  the counts and the spread — two links where three were asked for,
 *         a crowded paragraph, everything stuffed into the conclusion. Taste
 *         and arithmetic; a person adds a link in ten seconds and a run that
 *         died over it cost $0.85 a time. These become style notes.
 *   all   everything, as before — for tests and the reviewer.
 */
export function enforceLinks(
  body: string,
  ledgerSize: number,
  known: Map<string, string>,
  pillarHub?: string,
  scope: "hard" | "soft" | "all" = "all"
): void {
  body = proseOf(body);
  const all = [...body.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({
    anchor: m[1],
    url: m[2],
  }));
  const isInternal = (u: string) => /^https?:\/\/(www\.)?coinpresso\.io(\/|$)/i.test(u);
  const internalLinks = all.filter((l) => isInternal(l.url));
  const internal = new Set(internalLinks.map((l) => normaliseUrl(l.url)));
  const external = new Set(all.filter((l) => !isInternal(l.url)).map((l) => normaliseUrl(l.url)));
  const hard: string[] = [];
  const soft: string[] = [];

  if (internal.size < MIN_INTERNAL_LINKS) {
    soft.push(`${internal.size} internal link${internal.size === 1 ? "" : "s"} to coinpresso.io (needs 3-5)`);
  } else if (internal.size > 5) {
    soft.push(`${internal.size} internal links (the client asked for 3-5 — more reads as stuffing)`);
  }

  // EXTERNAL LINKS ARE A CEILING NOW, NOT A FLOOR.
  //
  // This used to demand three to five from the ledger, and the writer met the
  // demand with whatever the ledger held — including vendor blogs. Liam, 19
  // Sep: "we want to keep users within our website hierarchy as much as
  // possible as opposed to sending them elsewhere." A claim that needs a
  // primary source still gets one; nothing else leaves the site. Where the
  // ledger is thin the count is simply low, and that is now fine.
  void ledgerSize;
  if (external.size > MAX_EXTERNAL_LINKS) {
    soft.push(`${external.size} external links — the client wants readers kept on coinpresso.io; keep only the primary-source citations a claim genuinely needs (at most ${MAX_EXTERNAL_LINKS})`);
  }

  // A coinpresso.io path the site does not have is a 404 on the agency's own
  // domain. The link checker would catch it a stage later by fetching it; catching
  // it here costs nothing and retries the writer instead of failing the run.
  // A rival's domain is a hard fault whatever the anchor says. Liam: "we
  // should not be linking competitor agency blogs under any circumstances."
  // Research drops these from the ledger, so a draft that carries one has
  // either invented it or been fed a stale ledger — both are the writer's
  // to fix.
  for (const l of all) {
    if (isCompetitorUrl(l.url)) {
      hard.push(`"${l.url}" is a competitor agency or vendor — never link, cite or name one; cut the claim if it has no other source`);
    }
  }

  for (const l of internalLinks) {
    const topic = known.get(normaliseUrl(l.url));
    if (!topic) {
      hard.push(`"${l.url}" is not a page on coinpresso.io — link only what you were given`);
      continue;
    }
    if (!namesTopic(l.anchor, topic)) {
      hard.push(
        `the anchor "${l.anchor}" points at the ${topic.split(" | ")[0]} page — the anchor text has to name where it goes`
      );
    }
  }

  // A root-relative link slips past every check above: the matcher only sees
  // absolute URLs, so "[the pillar page](/services/geo)" counts as no link at
  // all — not internal, not verified against the page list, and invisible to
  // the link checker, which is exactly how the old /services/ 404s reached
  // seven drafts. Two of the stored drafts still carry them.
  const relative = [...body.matchAll(/\[([^\]]+)\]\((\/[^)\s]*)\)/g)];
  if (relative.length) {
    hard.push(
      `${relative.length} relative link${relative.length === 1 ? "" : "s"} (${relative
        .slice(0, 3)
        .map((m) => `"${m[2]}"`)
        .join(", ")}) — link the full https://coinpresso.io/... URL from the list, or nothing checks it`
    );
  }

  if (pillarHub && !internal.has(normaliseUrl(pillarHub))) {
    hard.push(`the pillar page (${pillarHub}) is not linked — every post links its own pillar`);
  }

  const crowded = body
    .split(/\n\s*\n/)
    .filter((para) => (para.match(/\]\(https?:\/\//g) ?? []).length > 2).length;
  if (crowded) {
    soft.push(`${crowded} paragraph${crowded === 1 ? "" : "s"} with three or more links — the citation dump the client flagged`);
  }

  // Every internal link in the closing section and none before it is the
  // "stuffed on to the conclusion" pattern. Compare where they fall.
  const lastH2 = body.lastIndexOf("\n## ");
  if (lastH2 > 0 && internal.size >= 3) {
    const before = [...body.slice(0, lastH2).matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)].filter((m) => isInternal(m[1])).length;
    if (before < 2) {
      soft.push(
        `${before === 0 ? "every internal link sits" : "all but one internal link sit"} in the final section — the client read that as "stuffed on the end, after the fact"; at least two belong in the body`
      );
    }
  }

  // And the conclusion does not INTRODUCE a page the body never discussed.
  // Liam, on a conclusion that linked a memecoin-programmatic post and the
  // Web3 PR page from an attribution piece: "these aren't relevant links to
  // support the piece." A link in the last section to a page whose subject
  // appears nowhere earlier is a link placed to make the count.
  if (lastH2 > 0) {
    const bodyBefore = body.slice(0, lastH2);
    const closing = body.slice(lastH2);
    const seenWords = anchorTokens(unlink(bodyBefore));
    for (const m of closing.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
      if (!isInternal(m[2])) continue;
      const topic = known.get(normaliseUrl(m[2]));
      if (!topic) continue;
      // Utility pages — contact, about, the blog index — are meant for the
      // close and have no subject the body would have discussed.
      if (/\/(contact|about|blog)\/?$/.test(normaliseUrl(m[2]))) continue;
      const topicWords = [...anchorTokens(topic.split(" | ")[0])];
      if (topicWords.length && !topicWords.some((w) => seenWords.has(w))) {
        soft.push(
          `the conclusion links "${m[1]}" (${topic.split(" | ")[0]}) but the body never discusses that subject — the client's note: "these aren't relevant links to support the piece". Link it where the subject actually comes up, or not at all`
        );
      }
    }
  }

  const chosen =
    scope === "hard" ? hard : scope === "soft" ? soft : [...hard, ...soft];
  if (chosen.length) {
    throw new Error(`Linking: ${chosen.join("; ")}. Retry the writer.`);
  }
}

/**
 * The ledger's own index, printed in the article.
 *
 * The ledger reaches the writer as `[s1] Publisher — "title" / URL: ...` so it
 * can tell which URL backs which claim. Seven blog drafts copied that
 * labelling straight into the prose, and because a marker contains no URL the
 * link check had nothing to inspect and passed them clean. Published, they
 * would have read "...for its AI Overviews or AI Mode features [s13]." on
 * coinpresso.io — an internal key in the middle of a sentence, pointing at
 * nothing a reader can open. Both tracks are checked; both build the ledger
 * the same way.
 */
export function enforceNoLedgerMarkers(body: string, faqs: Array<{ q: string; a: string }>): void {
  const hay = [proseOf(body), ...faqs.map((f) => `${f.q} ${f.a}`)].join("\n");
  const found = hay.match(/\[s\d+\]/g) ?? [];
  if (found.length) {
    throw new Error(
      `The draft cites with ${found.length} ledger marker${found.length === 1 ? "" : "s"} (${[...new Set(found)].slice(0, 4).join(", ")}${found.length > 4 ? ", …" : ""}) instead of links. Those labels index the ledger FOR YOU — a reader cannot click "[s1]". Put a link on the words making each claim. Retry the writer.`
    );
  }
}

function stripFaqLabel(q: string): string {
  return q.replace(/^\s*(?:FAQ|Q)?\s*\d+\s*[:.)\-–]\s*/i, "").trim();
}

/**
 * The FAQ block uses the brief's questions, verbatim and in order. The model's
 * answers are kept where it answered the right question; where it invented a
 * different one, the brief's own answer text stands in — it was written by the
 * client and is at least accurate to what they wanted said.
 */
export function enforceFaqs(
  produced: Array<{ q: string; a: string }>,
  wanted: BriefFaq[]
): Array<{ q: string; a: string }> {
  const norm = (t: string) => stripFaqLabel(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return wanted.map((w, k) => {
    const exact = produced.find((p) => norm(p.q) === norm(w.q));
    const positional = produced[k];
    const a = exact?.a ?? positional?.a ?? w.a;
    // The label is the brief author's numbering, not part of the question. In
    // the first rewrite the block read "Does E-E-A-T…", "Q2: How can…",
    // "Q3: Do…" — one stripped, four not — because the import had kept them.
    return { q: stripFaqLabel(w.q), a };
  });
}

export interface WriterInput {
  /** Threaded to the gateway so spend is attributed to a client and a run. */
  ctx?: CallContext;
  brief: Brief;
  research: ResearchBrief;
  /** On a revision pass, what the reviewer asked for. */
  fixes?: ReviewFinding[];
  previous?: Draft;
  /** Notes an operator typed after a rejection on this run. */
  guidance?: GuidanceNote[];
}

const BLOG_SYSTEM = `You write for Coinpresso's own blog. Coinpresso is a crypto
marketing agency; this is their domain, and the reader is a founder deciding
whether to hire them.

THE ONE RULE THAT OVERRIDES EVERYTHING: you may not introduce any URL, publisher,
statistic or figure that does not appear in the research brief. Inventing a
plausible-looking source is worse than omitting the claim, because this is the
agency's own domain and a broken citation is a credibility failure they cannot
delete from someone's memory.

Second rule: if the brief gives you nothing genuinely original — no named
example, no figure Coinpresso holds, no honest limitation, no argued position —
then say so in the piece rather than padding it with generalities. A post that
only reassembles what already ranks is the exact thing that gets a domain
demoted at this publishing rate.

This is NOT a wire release. No dateline, no boilerplate, no investment
disclaimer, no presale figures, no price predictions.

${BLOG_PLAYBOOK}`;

async function writeBlog(input: WriterInput): Promise<{
  draft: Draft;
  tokensIn: number;
  tokensOut: number;
  /** Input tokens written to the prompt cache — billed at a premium. */
  cacheWriteTokens?: number;
  /** Input tokens served from the prompt cache — billed at a discount. */
  cacheReadTokens?: number;
}> {
  const { brief, research, fixes, previous } = input;
  const pillar = PILLARS.find((x) => x.id === brief.pillar);

  // Real posts from coinpresso.io, imported through the WordPress integration.
  // A description of a voice gets you a piece that obeys the description; two
  // real posts get you a piece that sounds like the site. Empty until someone
  // runs the import, and the prompt says so rather than pretending otherwise.
  const exemplars = await styleExemplars(BLOG_ARCHIVE_ID, {
    publication: BLOG_PUBLICATION,
    excludeAngle: brief.pillar,
    // The client's own benchmark first, then the best of the rest — with the
    // "Best X Agencies" listicles ranked out of the way.
    pinnedUrls: BLOG_VOICE_EXEMPLARS,
    avoidTitle: BLOG_OFF_GENRE_TITLE,
    // Three rather than two: on this track the exemplars are the whole point of
    // the archive, and a wider sample of the house voice is worth the tokens.
    limit: 3,
  });
  // The client's standing corrections — every point Liam has already made
  // once, as rules. Read per run so a note added on the Style page reaches
  // the next draft without a deploy.
  const feedback = input.ctx?.clientRef
    ? feedbackBlock(await readFeedback(input.ctx.clientRef), "writer")
    : "";
  // Notes an operator typed on THIS run after a rejection. They sit after the
  // standing rules and before everything else, and they are worded as
  // overriding, because that is what they are for: a person looked at why the
  // stage would not pass and said what to do about it.
  const guidance = guidanceBlock(input.guidance);
  const voiceBlock = exemplars.length
    ? `\n\n${exemplarBlock(exemplars)}\n`
    : `\n\nNo published examples have been imported from coinpresso.io yet, so you
are working from the style description alone. Stay closer to it than you
otherwise would, and do not invent house conventions it does not state.\n`;
  const type = brief.contentType
    ? CONTENT_TYPES[brief.contentType as keyof typeof CONTENT_TYPES]
    : undefined;

  // Recent posts the writer may link, newest first. Liam's correction on the
  // E-E-A-T piece: the draft linked "crypto SEO guide" to a years-old post
  // when the crypto GEO guide from a few weeks earlier was the relevant one.
  // The writer can only prefer the newer post if it can see the dates.
  //
  // And ranked by RELEVANCE, not recency alone — see relevantPosts. Liam:
  // "there are 100s of pages on Coinpresso.io and we don't need to always
  // look to fit the same 3-4 links into different articles."
  const recent = relevantPosts(
    (await allArticles(BLOG_ARCHIVE_ID)).filter((a) => a.kind !== "competitor"),
    [brief.title, research.primaryKeyword, ...(research.secondaryKeywords ?? [])].join(" "),
    15
  );
  const recentPosts = recent
    .map((a) => `- ${a.publishedAt.slice(0, 10)} · ${a.title} — ${a.url}`)
    .join("\n");

  // Every coinpresso.io page the writer is allowed to link, and what each one
  // is about — the same list it is shown, so the check and the instruction
  // cannot drift apart. A post's title is its topic for anchor matching.
  // The compiled page list overlaid by the client's own link map, so the
  // writer knows every page and the anchors the client wants — not the same
  // three forever. See link-map.ts.
  const sitePages = await linkablePages(input.ctx?.clientRef);
  const knownPages = new Map<string, string>();
  for (const pg of sitePages) {
    knownPages.set(pg.url.replace(/\/+$/, "").toLowerCase(), pg.topic);
  }
  for (const a of recent) {
    if (a.url) knownPages.set(a.url.replace(/\/+$/, "").toLowerCase(), a.title);
  }

  // THE LEDGER IS FILTERED HERE, not only where it was researched.
  //
  // The competitor rule went in at the research stage, so a ledger built
  // before that — or reused by "Rewrite from research", which keeps the
  // research and re-runs only the writer — still carried vendor sources. The
  // writer was handed Formo in its source list, told to cite from the list,
  // and then rejected three times for citing it. It could not win, and it
  // burned $1.70 finding that out.
  //
  // So the filter runs wherever the ledger is USED. An old run is cured by a
  // retry rather than by re-buying research.
  const blockedSources = research.sources.filter((x) => isCompetitorUrl(x.url));
  const citable = research.sources.filter((x) => !isCompetitorUrl(x.url));
  const sourceLedger = citable
    .map(
      (x) =>
        `[${x.id}] ${x.publisher} — "${x.title}"\n     URL: ${x.url}\n     Supports: ${x.claim}${
          x.figures?.length ? `\n     Figures: ${x.figures.join(" | ")}` : ""
        }`
    )
    .join("\n");

  // Named, so the writer cuts the claims that rested on them rather than
  // hunting for a source it can no longer see.
  const blockedBlock = blockedSources.length
    ? `\n\nSOURCES REMOVED — competitors. ${blockedSources
        .map((x) => `${x.publisher} (${x.url})`)
        .join("; ")}. These are rival agencies or vendors and the client's rule is absolute: never link, cite or name one. Anything they were the only support for does not go in the piece. Do not reach for them from memory either.`
    : "";

  const revisionBlock =
    fixes && previous
      ? `\n\nTHIS IS A REVISION. Fix every item below and change nothing else.\n\n${fixes
          .map(
            (f, i) =>
              `${i + 1}. [${f.severity}/${f.category}] ${f.detail}\n   FIX: ${f.fix}`
          )
          .join("\n")}\n\nYOUR PREVIOUS DRAFT:\n${previous.body}`
      : "";

  // The client's brief goes to the WRITER too, not only to research.
  //
  // It used to reach here second-hand, folded into suggestedHeadings and
  // faqCandidates by the strategy agent — which is a summary of a summary. The
  // brief is the thing the writer is meant to follow before it invents anything
  // of its own: the section order, the per-section word counts, the exact FAQ
  // questions, and the sentence saying what the piece must not claim. Those
  // survive being passed along only if they are passed along intact.
  const clientBrief = brief.contentBrief
    ? `\n---\n\n${briefToPrompt(brief.contentBrief)}\n\nWhere this brief and the research below disagree on a FACT, the research wins —
it was retrieved and the brief was not. Where they differ on SHAPE — the
sections, their order, the questions, the length — follow the brief.\n`
    : "";

  // WHICH STRUCTURE GOVERNS. Exactly one of these two blocks is sent.
  //
  // With an outline in the client's brief, the headings are a contract: sent
  // verbatim, numbered, with the instruction not to rephrase them — and then
  // CHECKED IN CODE after the reply (see enforceOutline below), so a heading
  // that drifts is caught here rather than by the client. Without an outline,
  // the house default applies. Sending both is what produced the "extended
  // FAQ": the model kept the client's sections and questionified every one.
  const outline = brief.contentBrief?.outline ?? [];
  const fixedStructure = outline.length > 0;
  // Every post opens with an introduction BEFORE the first H2 — one to two
  // paragraphs that set the scene for the whole piece and say what the reader
  // will get. Not a heading of its own. The client flagged this on the first
  // rewrite: the article "went straight in" to section one. It applies to both
  // paths below because it is how the house reads, whoever wrote the outline.
  // Both ends of the piece are ASSIGNED a move rather than left to habit. One
  // formula for the intro produced four posts out of seven opening on the same
  // premise; one habit for the closer ended four of seven on "a second
  // opinion". See INTRO_MOVES / CLOSE_MOVES in blog.ts.
  const intro =
    moveById(INTRO_MOVES, brief.introMove) ?? introMoveFor(brief.title, brief.contentType);
  const closer = moveById(CLOSE_MOVES, brief.closeMove) ?? closeMoveFor(brief.title);
  const introRule = `INTRODUCTION. Before the first H2, write two paragraphs, 150-220 words in
total, with NO heading. That is the house length: Liam's own guide runs 190.
Talk to the reader ("you", "your") and, where the brief names the method, name
it. The first H2 comes after; section 1 develops the opening rather than
repeating it.

IT HAS TO SOUND LIKE A PERSON. The client: "the humanization of the first
paragraphs is really important to create that distinction that these articles
are from real authors." He rewrote one opening himself, and the difference is
the whole brief. The draft said: "A Circumventing Systems suspension is Google
telling you it caught deliberate rule-breaking, not a mistake. That is a hard
thing to accept when your account genuinely wasn't trying to break anything."
He changed it to: "A Circumventing Systems suspension is Google's way of saying
it thinks you tried to trick it, not just broke a rule by accident. That's a
serious accusation, and it comes with none of the usual 'oops-a-daisy'
courtesies." Same facts. The second one has a person in it — a turn of phrase,
a dry aside, the register of someone explaining it across a desk. Write the
opening that way. Do not restate the title in a formal voice and call it an
introduction.

THE EXAMPLE IS THE REGISTER, NOT THE WORDS. Do not reuse "oops-a-daisy" or any
phrase from that example. A phrase that lands once reads as a tic the second
time, and the client will notice before the reader does. Find this post's own
aside.

OPEN IT THIS WAY — "${intro.id}":
${intro.how}

Do NOT open on the reader's situation and why it has changed — that was every
previous post. Do NOT open on "ask ChatGPT about X and you get Y", "ChatGPT
doesn't mention your project" or "you don't exist" — four of seven posts did,
and the client noticed.

CLOSING PARAGRAPH — "${closer.id}":
${closer.how}

Do NOT end on "if you want a second opinion / a second pair of eyes… that's a
conversation worth having before you spend". Four of seven posts did.`;

  const structureBlock = fixedStructure
    ? `${introRule}

STRUCTURE — FIXED BY THE CLIENT'S BRIEF. Use these H2 headings EXACTLY as
written, in this order, one section each. Do not rephrase them, do not turn
them into questions, do not merge or split sections, do not add sections.
${outline
  .map(
    (sct) =>
      `${sct.n}. ${sct.title}${sct.words ? ` (~${sct.words} words)` : ""}${
        sct.focus ? `\n   Focus: ${sct.focus}` : ""
      }`
  )
  .join("\n")}
${
  brief.contentBrief?.faqs?.length
    ? `\nThe FAQ block uses EXACTLY the ${brief.contentBrief.faqs.length} questions in the brief, in order, and no others.`
    : `\nNo FAQ block unless the outline above includes one.`
}
Target ${type ? `${type.words[0]}-${type.words[1]}` : "1200-1800"} words in total${
        outline.some((sct) => sct.words)
          ? ", allocated per section as marked"
          : ""
      }.`
    : `${introRule}

${BLOG_DEFAULT_STRUCTURE}
FORMAT: ${type ? `${type.name} — ${type.shape} Target ${type.words[0]}-${type.words[1]} words.` : "Guide, 1200-1800 words."}`;

  const user = `${BLOG_STYLE}
${feedback ? `\n${feedback}\n` : ""}${guidance ? `\n${guidance}\n` : ""}${voiceBlock}${clientBrief}
---

${structureBlock}
${pillar ? `PILLAR: ${pillar.name}. Link to the hub at ${pillar.hub} using descriptive anchor text.` : ""}

TITLE — fixed, use it exactly as the H1:
${brief.title}

PRIMARY KEYWORD: ${research.primaryKeyword}
SECONDARY: ${research.secondaryKeywords.join(", ")}

THE READER'S ACTUAL QUESTION:
${research.buyerQuestion ?? "not supplied"}

WHAT IS ALREADY RANKING, AND THE GAP:
${research.marketContext}
${(research.competingContent ?? []).map((c) => `- ${c}`).join("\n")}

WHY THIS POST EXISTS:
${research.opportunityGap}

COINPRESSO'S ANGLE:
${research.moonbergAngle}

WHAT WOULD MAKE IT ORIGINAL — use what is true, and where something is missing,
write around the gap honestly rather than inventing it:
${(research.proofPoints ?? []).map((p) => `- ${p}`).join("\n") || "- nothing supplied"}

LINKING, IN THE CLIENT'S OWN WORDS. "We want to keep users within our website
hierarchy as much as possible as opposed to sending them elsewhere." So:
internal links carry the piece; an external link exists only where a claim
needs its primary source — the platform, the regulator, the data publisher,
the trade press. NEVER link, cite or name a competing marketing, PR, SEO, PPC,
analytics or attribution agency or vendor: "gives them a free backlink, gives
them clout for the intent we are looking to capture." Each coinpresso.io page
is linked ONCE per post — a page linked in the body is not linked again in the
FAQs. And no link goes in the conclusion to a page the body never discussed.

INTERNAL LINKS — the ONLY coinpresso.io pages that exist. Link 3-5 of them
as markdown links, each where its topic comes up in the body, with anchor text
naming that topic (the words "crypto SEO" link to the crypto SEO page). Do not
invent any other coinpresso.io path; at least two of them sit in the body
before the final section.

AT LEAST ONE must be a post from the RECENT POSTS list below, not only service
pages — the client asked for landing pages AND blogs.

THE FAQ ANSWERS LINK INWARD. The client's note: "we want to keep users within
our website hierarchy as much as possible as opposed to sending them
elsewhere. We can be using contact us page, case studies page, about page,
main blog page." Where a service page, an earlier Coinpresso post, the case
studies, or the contact page genuinely answers the question, link it inside
the answer with anchor text naming that page. One or two across the FAQ
block, not one in every answer, and NEVER a page already linked in the body —
each page is linked once per post. An external citation only where an answer
states a figure that needs its source. And if you name a
Coinpresso post anywhere in the prose, link it there: a post referred to as
"our earlier guide" or "a recent guide on X" with no link on it is a miss, and
it sends the reader hunting for something you could have handed them.
${linkTargetsBlock(sitePages, pillar?.hub)}
${
  recentPosts
    ? `
RECENT COINPRESSO POSTS — also linkable, newest first. Where two posts cover
the same ground, link the newer one and name it for what it is (a post on GEO
is "the crypto GEO guide", not "the crypto SEO guide"):
${recentPosts}
`
    : ""
}
EXTERNAL LINKS — 3-5 markdown links to ledger URLs, each attached to the
sentence making the claim it supports. Never more than two links in one
paragraph.

${
  fixedStructure
    ? ""
    : `SUGGESTED H2s:
${research.suggestedHeadings.map((h) => `- ${h}`).join("\n")}

FAQ CANDIDATES:
${research.faqCandidates.map((f) => `- ${f}`).join("\n")}
`
}
RISK NOTES YOU MUST RESPECT:
${research.riskNotes.map((r) => `- ${r}`).join("\n") || "- none"}

---

SOURCE LEDGER — the ONLY URLs you may cite. The [s1] labels below are how the
ledger is indexed FOR YOU; they are not a citation format. Never write "[s1]"
in the article. A cited claim carries a markdown link on the words making the
claim — [what the source found](URL) — because a reader cannot click "[s1]".
${sourceLedger || "(empty — write without external citations and say so where a figure would have gone)"}${blockedBlock}
${revisionBlock}

---

Return your work in EXACTLY this sectioned plain-text format — NOT JSON. Write
markdown naturally: real line breaks, quotes as quotes, nothing escaped.

===HEADLINE===
the final H1
===DATELINE===
none
===BODY===
the full post in markdown with ## H2 sections. No boilerplate, no disclaimer.
Do NOT include the FAQs here.
===FAQS===
Q: first question
A: its answer
Q: second question
A: its answer

Start your reply with ===HEADLINE=== and end it after the last answer. No
tags, no keywords list — the post belongs to its category and that is all.`;

  // DERIVED FROM THE WORD TARGET THIS FORMAT ACTUALLY ASKS FOR.
  //
  // The article lives inside a JSON string with every quote and newline
  // escaped, so it needs real headroom — 8000 genuinely was not enough for the
  // long formats. But 16000 was not a considered figure either: it is four
  // times the longest brief on the books, and a flat ceiling that high means a
  // reply that runs away is billed for four articles' worth of tokens before
  // anything stops it. Two and a half tokens per target word covers markdown,
  // escaping and the FAQ block with room to spare; the 3000 floor covers the
  // wrapper and the short formats.
  const targetWords = type?.words?.[1] ?? 2200;
  const ceiling = Math.round(3000 + targetWords * 2.5);

  // BOUNDED RETRY, WITH THE REJECTION HANDED BACK.
  //
  // Ten checks now run on every draft — the introduction, the AI openers, the
  // em dash rate, the ledger markers, six separate linking clauses, the
  // outline and the FAQ list. Each one throws a message naming precisely what
  // to fix, and until now nothing read those messages: the stage failed, the
  // run stopped, and a person had to press retry to buy a fresh attempt that
  // knew nothing about why the last one was rejected. Every message ends
  // "Retry the writer", which was an instruction to a reader who did not
  // exist.
  //
  // Three attempts, because a model given the specific sentence it broke
  // almost always fixes it on the next pass, and a fourth attempt on the same
  // failure is paying twice for the same answer. Tokens from every attempt are
  // billed — they were genuinely spent.
  const MAX_WRITER_ATTEMPTS = 3;
  let tokensIn = 0;
  let tokensOut = 0;
  let rejection = "";
  let lastError: unknown;
  // The last attempt's text, kept so a failure can be read rather than
  // guessed at. Five retries on one run were diagnosed from the rejection
  // message alone because the draft it described had been thrown away.
  let lastBody: string | undefined;

  for (let attempt = 1; attempt <= MAX_WRITER_ATTEMPTS; attempt++) {
    const r = await callClaude({
      model: MODELS.writer,
      system: BLOG_SYSTEM,
      user: rejection
        ? `${user}\n\n---\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED BEFORE ANYONE READ IT. This is
everything wrong with it, not a sample — fix all of it in this attempt. A draft
that clears one of these and leaves another fails again:\n${rejection}\n\nWrite the piece again in full, fixing every point above. Everything else about the brief is unchanged.`
        : user,
      maxTokens: ceiling,
      temperature: 0.65,
      context: {
        ...input.ctx,
        stage: input.fixes ? "revision" : "writer",
      },
    });
    tokensIn += r.tokensIn;
    tokensOut += r.tokensOut;

    try {
      lastBody = r.text;
      const parsed = parseDraftSections(r.text, {
        stage: "writer",
        stopReason: r.stopReason,
        maxTokens: ceiling,
      });
      // The title is the client's, or the planner's approved one. The model was
      // told not to change it; this makes sure the instruction was not needed.
      parsed.headline = brief.title;

      // The pillar link goes on a phrase the draft already wrote, before the
      // trimmer counts anything, so it occupies a slot rather than competing
      // for one.
      parsed.body = ensurePillarLink(
        parsed.body,
        pillar?.hub,
        COINPRESSO_PAGES.find((pg) => pg.url === pillar?.hub)?.topic ?? pillar?.name
      );

      // Surplus links come off on every attempt. This only ever removes, so
      // there is nothing to be gained by spending a paid attempt discovering
      // the writer overshot a cap it cannot count to.
      parsed.body = trimLinks(parsed.body, pillar?.hub);

      // House spelling is American. Mechanical, so it is corrected on every
      // attempt rather than spending a paid one telling the writer that
      // "centralised" should have been "centralized".
      parsed.body = americanize(parsed.body);

      // Internal anchors are made to name their destination, then anchors
      // longer than the cap are cut at a natural boundary. Both mechanical —
      // see nameAnchors and shortenAnchors for the runs that proved the
      // writer cannot do either on request. Naming first, because shortening
      // trims from the end and the topic goes on the front.
      // An invented coinpresso.io slug is corrected to the real page or
      // unlinked, before the anchor work — see repairInternalLinks.
      parsed.body = repairInternalLinks(parsed.body, knownPages);
      parsed.body = nameAnchors(parsed.body, knownPages);
      parsed.body = shortenAnchors(parsed.body);

      // The connective openers Liam flagged as the AI tell come off. A
      // deletion, so it is not worth a paid attempt — see stripAiOpeners.
      parsed.body = stripAiOpeners(parsed.body);
      parsed.body = tidyPunctuation(parsed.body);

      // The FAQ answers are prose too, and they carry links now. Same
      // mechanical fixes, so an FAQ anchor is named and cut like any other.
      parsed.faqs = dedupeLinksAcrossFaqs(
        parsed.body,
        (parsed.faqs ?? []).map((f) => ({
          ...f,
          a: tidyPunctuation(
            stripAiOpeners(
              shortenAnchors(nameAnchors(repairInternalLinks(americanize(f.a), knownPages), knownPages))
            )
          ),
        }))
      );

      // Over-long paragraphs are split at the turn in the argument. Mechanical,
      // so it happens on every attempt rather than costing one.
      parsed.body = splitFatParagraphs(parsed.body);

      // LAST ATTEMPT: fix the punctuation rather than bin the article.
      //
      // Two attempts are spent asking the writer to do it, because a sentence
      // it rewrites itself reads better than one a regular expression edits.
      // But an article that is right about structure, links, sourcing and
      // voice should not be thrown away over dash count — the one rule in
      // this set a language model demonstrably cannot follow.
      if (attempt === MAX_WRITER_ATTEMPTS) {
        parsed.body = softenToBudget(parsed.body);
      }

      // TWO KINDS OF CHECK, and the difference is what a rejection costs.
      //
      // HARD checks are about correctness: a section the brief asked for is
      // missing, a URL was invented, a source marker was left in the text, a
      // promised table was never drawn. Every one of these is a fault the
      // writer can see and fix, so it is rejected and the reason fed back.
      //
      // SOFT checks are about taste: sentence rhythm, a repeated closer, two
      // links near each other. They were hard too, and one run spent $2.90
      // over three attempts on five short sentences that read perfectly well —
      // a counter cannot tell rhythm from word salad, and no instruction to
      // the writer reliably avoids a counter it cannot see. So they no longer
      // fail anything. They ride with the draft as notes: the revision pass
      // gets them as findings, and if it cannot clear them the reviewer sees
      // them beside an article instead of a failure beside nothing.
      const faults = collectRejections([
        () => enforceIntro(parsed.body),
        () => enforceProse(parsed.body),
        () => enforceNoLedgerMarkers(parsed.body, parsed.faqs ?? []),
        () => enforceLinks(parsed.body, research.sources.length, knownPages, pillar?.hub, "hard"),
        () => enforceFaqLinks(parsed.faqs ?? [], knownPages, "hard"),
        () => enforceAnchorLength(parsed.body),
        () => enforcePromisedStructures(parsed.body),
      ]);
      if (faults.length) throw new Error(joinFaults(faults));

      const styleNotes = collectRejections([
        () => enforceLinks(parsed.body, research.sources.length, knownPages, pillar?.hub, "soft"),
        () => enforceFaqLinks(parsed.faqs ?? [], knownPages, "soft"),
        () => enforceLinkCluster(parsed.body, parsed.faqs ?? [], pillar?.hub, knownPages),
        () => enforceNoBoltOnLinks(parsed.body, knownPages),
        () => enforceNoExemplarPhrases(parsed.body),
        () => enforceCloser(parsed.body),
        () => enforceLinkSpacing(parsed.body),
        () => enforceParagraphSize(parsed.body),
        () => enforceSentenceVariety(parsed.body),
      ]).map((f) => f.replace(/\s*Retry the writer\.\s*$/, "").trim());

      if (fixedStructure) {
        parsed.body = enforceOutline(parsed.body, outline);
        if (brief.contentBrief?.faqs?.length) {
          parsed.faqs = enforceFaqs(parsed.faqs, brief.contentBrief.faqs);
        }
      }
      // After the outline is enforced, because a brief can carry the joined
      // heading itself and it must still come out as two.
      parsed.body = normaliseConclusionHeading(parsed.body, (parsed.faqs ?? []).length > 0);

      const draft: Draft = {
        ...parsed,
        dateline: null,
        faqs: parsed.faqs || [],
        // Liam: "What is this tags piece? It is not a CMS feature nor a GEO/SEO
        // requirement." The post has its category; nothing else is published.
        tags: [],
        wordCount: (parsed.body || "").split(/\s+/).filter(Boolean).length,
        styleNotes: styleNotes.length ? styleNotes : undefined,
      };
      return { draft, tokensIn, tokensOut };
    } catch (e) {
      lastError = e;
      rejection = e instanceof Error ? e.message : String(e);
      // A reply that was cut off mid-article is not a rule the model broke;
      // asking it to "fix that" wastes an attempt. Fail now and say so.
      if (r.stopReason === "max_tokens") break;
    }
  }

  throw billed(
    new Error(
      // Everything still wrong with the FINAL attempt, not a union across all
      // of them: faults the writer fixed on the way are fixed, and listing
      // them would send the operator after work already done.
      `The writer could not produce a publishable draft in ${MAX_WRITER_ATTEMPTS} attempts. Still wrong after the last one: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    ),
    { tokensIn, tokensOut, searchRequests: 0 },
    lastBody
  );
}

export async function runWriter(input: WriterInput): Promise<{
  draft: Draft;
  tokensIn: number;
  tokensOut: number;
  /** Input tokens written to the prompt cache — billed at a premium. */
  cacheWriteTokens?: number;
  /** Input tokens served from the prompt cache — billed at a discount. */
  cacheReadTokens?: number;
}> {
  if (input.brief.track === "blog") return writeBlog(input);

  const { brief, research, fixes, previous } = input;
  const pub = PUBLICATIONS[brief.publication];

  const sourceLedger = research.sources
    .map(
      (s) =>
        `[${s.id}] ${s.publisher} — "${s.title}"\n     URL: ${s.url}\n     Supports: ${s.claim}${
          s.figures?.length ? `\n     Figures: ${s.figures.join(" | ")}` : ""
        }`
    )
    .join("\n");

  const linkInstruction =
    pub.linkStyle === "naked"
      ? `LINK STYLE — ${pub.name} uses NAKED URLS. After the paragraph that references a source, put the bare URL on its own line. Do not use markdown link syntax anywhere in the body.`
      : `LINK STYLE — ${pub.name} uses EMBEDDED ANCHOR TEXT. Weave links into the prose as markdown links, e.g. [CoinCodex's current forecast](https://...). The anchor text must describe what is being cited, never "click here" or a bare publisher name alone.`;

  const revisionBlock =
    fixes && previous
      ? `

THIS IS A REVISION. Your previous draft was reviewed and did not pass. Fix every
item below. Change only what the findings require — do not rewrite passing
sections, and do not introduce new sources while fixing.

REVIEWER FINDINGS:
${fixes.map((f, i) => `${i + 1}. [${f.severity}/${f.category}] ${f.detail}\n   FIX: ${f.fix}`).join("\n")}

YOUR PREVIOUS DRAFT:
${previous.body}`
      : "";

  const campaignBlock = brief.bannedClaims?.length
    ? `CAMPAIGN LIMITS — ${brief.campaignName ?? "this campaign"} ${brief.campaignTicker ?? ""}

These sit above the house style and above this brief. A breach is not a style
problem, it is a reason the piece cannot be published:
${brief.bannedClaims.map((c) => `- ${c}`).join("\n")}

---

`
    : "";

  // Prior work stops repetition. Exemplars teach voice — a rules list produces a
  // piece that obeys the rules; two real articles produce one that sounds like
  // the client.
  const priorWork = brief.campaignId
    ? await priorWorkFromStore(brief.campaignId, 20)
    : "";

  const exemplars = brief.campaignId
    ? await styleExemplars(brief.campaignId, {
        publication: brief.publication,
        excludeAngle: research.featuredAsset,
        limit: 2,
      })
    : [];
  const examples = exemplarBlock(exemplars);

  const user = `${campaignBlock}${examples ? examples + "\n\n---\n\n" : ""}${priorWork ? priorWork + "\n\n---\n\n" : ""}${styleBlock()}

---

PUBLICATION: ${pub.name}
- Structure: ${research.structureVariant === "listicle" ? "listicle / comparison" : "single-asset attachment"}
- Target length: ${pub.wordTarget[0]}-${pub.wordTarget[1]} words in the body
- FAQs: ${pub.faqCount[0]}-${pub.faqCount[1]}
- ${pub.notes}
${pub.dateline ? `- Dateline: open the first sentence with "${pub.dateline}, <Month> <D>, <YYYY> (GLOBE NEWSWIRE) -- "` : "- No dateline."}

${linkInstruction}

---

HEADLINE (use exactly, or a very close variant if the given one is ungrammatical):
${brief.title}

PRIMARY KEYWORD: ${research.primaryKeyword}
SECONDARY KEYWORDS: ${research.secondaryKeywords.join(", ")}

The primary keyword must appear verbatim in: the headline, the first paragraph,
at least one H2, the conclusion, and at least one FAQ.

---

RESEARCH BRIEF

Featured asset: ${research.featuredAsset}

News catalyst (${research.newsCatalyst.date}): ${research.newsCatalyst.headline}
${research.newsCatalyst.summary}

Market context: ${research.marketContext}

Price predictions to use:
${research.predictions
  .map(
    (p) =>
      `- [${p.sourceId}] ${p.target} (${p.horizon}) — ${p.stance}: ${p.summary}`
  )
  .join("\n")}

Opportunity gap: ${research.opportunityGap}

Moonberg angle: ${research.moonbergAngle}

Presale state — use these figures and no others:
- Raised: ${research.presaleState.raised}
- Stage: ${research.presaleState.stage}
- Note: ${research.presaleState.note}

Comparison assets: ${research.comparisonAssets.join(", ") || "none supplied"}

Suggested H2s (adapt as needed, keep the framework's shape):
${research.suggestedHeadings.map((h) => `- ${h}`).join("\n")}

FAQ candidates:
${research.faqCandidates.map((f) => `- ${f}`).join("\n")}

Risk notes you must respect:
${research.riskNotes.map((r) => `- ${r}`).join("\n") || "- none"}

---

SOURCE LEDGER — the ONLY URLs you may use. The [s1] labels are how this list
is indexed FOR YOU; they are not a citation format and must never appear in
the piece. Cite by the link style stated above.
${sourceLedger || "(empty — write the piece without external links and note the gap)"}

---

BOILERPLATE — reproduce this verbatim at the end, after the FAQs:

${boilerplateFor(pub)}
${revisionBlock}

---

Return your work in EXACTLY this sectioned plain-text format — NOT JSON. Write
markdown naturally: real line breaks, quotes as quotes, nothing escaped.

===HEADLINE===
the final H1
===DATELINE===
${pub.dateline ? "ZUG, Switzerland, Month D, YYYY (GLOBE NEWSWIRE) --" : "none"}
===BODY===
the full article in markdown: intro paragraphs, ## H2 sections, prose. Include
the boilerplate at the end. Do NOT include the FAQs here.
===FAQS===
Q: first question
A: its answer
Q: second question
A: its answer
===TAGS===
comma, separated, tags

Start your reply with ===HEADLINE=== and end it after the tags line.`;

  // Same derivation as the blog writer above, from the publication's own word
  // target rather than a flat figure.
  const ceiling = Math.round(3000 + (pub.wordTarget?.[1] ?? 2200) * 2.5);

  const r = await callClaude({
    model: MODELS.writer,
    system: SYSTEM,
    user,
    maxTokens: ceiling,
    temperature: 0.6,
    context: { ...input.ctx, stage: input.fixes ? "revision" : "writer" },
  });

  let parsed: Omit<Draft, "wordCount">;
  try {
    parsed = parseDraftSections(r.text, { stage: "writer", stopReason: r.stopReason, maxTokens: ceiling });
    enforceNoLedgerMarkers(parsed.body, parsed.faqs ?? []);
  } catch (e) {
    throw billed(e, { tokensIn: r.tokensIn, tokensOut: r.tokensOut, cacheWriteTokens: r.cacheWriteTokens, cacheReadTokens: r.cacheReadTokens, searchRequests: 0 });
  }
  const draft: Draft = {
    ...parsed,
    faqs: parsed.faqs || [],
    tags: parsed.tags || [],
    wordCount: (parsed.body || "").split(/\s+/).filter(Boolean).length,
  };

  return { draft, tokensIn: r.tokensIn, tokensOut: r.tokensOut, cacheWriteTokens: r.cacheWriteTokens, cacheReadTokens: r.cacheReadTokens };
}

// ---------------------------------------------------------------------------
// Round 5, from Liam's annotations on the September batch.
//
// Every threshold below is measured off the piece he called perfect ("Why
// ChatGPT and Perplexity Don't Cite Crypto Brands") or off the paragraph breaks
// he inserted by hand while editing the others — not off anyone's taste. Where
// a number is a judgement call the comment says which draft set it and why,
// so the next person can argue with the evidence rather than the opinion.
// ---------------------------------------------------------------------------

/** Anchors this long stop being anchors and become the sentence. */
const ANCHOR_MAX_WORDS = 12;
/** Two links closer than this read as stuffed rather than scattered. */
const LINK_MIN_GAP_WORDS = 15;
/** One close pair is a citation beside its source. Several is the fault. */
const TIGHT_PAIRS_ALLOWED = 1;
/** The exemplar's longest paragraph, rounded up. A backstop, not the target. */
const PARA_MAX_WORDS = 125;
/** A sentence under this is a short one for run-length purposes. */
const SHORT_SENTENCE_WORDS = 12;
/** The comparison draft he called word salad ran five short ones together. */
const MAX_SHORT_RUN = 4;

/** A line that begins a markdown list item: "- ", "* ", "1. ", "2) ". */
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/**
 * The blocks a reader sees, which is not the same as the blocks a blank line
 * makes.
 *
 * A markdown list is written with single newlines, so a five-item list was one
 * "paragraph" to every check here. That made a perfectly well-formatted list of
 * five short points fail the 125-word cap as "a big section of text" — the
 * precise opposite of what it is — and made two links in two different bullets
 * count as links stuffed together in one paragraph.
 *
 * It went unnoticed because none of the five posts this rule was derived from
 * contains a single bullet; they use tables. The first article to reach for a
 * list could not be published, and three paid attempts told it to break up a
 * list that was already broken up.
 *
 * So each list item is its own block. Table rows likewise: a table is not
 * prose and its rows are not sentences.
 */
function paragraphsOf(body: string): string[] {
  return proseOf(body)
    .split(/\n{2,}/)
    .flatMap((block) =>
      LIST_ITEM.test(block)
        ? block.split(/\n(?=\s*(?:[-*+]|\d+[.)])\s)/)
        : [block]
    )
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("#") && !p.startsWith("|"));
}

/** Anchor text with the link syntax removed, for counting real words. */
function unlink(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/**
 * Words an anchor can end before and still read as a phrase. The cut lands on
 * the LAST of these inside the limit, so "signing a deal to acquire up to 90
 * million MORPHO tokens | over four years" rather than "...MORPHO tokens over
 * four | years".
 */
const ANCHOR_BREAK_WORDS = new Set([
  "to", "over", "for", "and", "with", "of", "in", "on", "at", "by", "from",
  "that", "which", "as", "into", "after", "before", "under", "across",
  "through", "during", "while", "because", "but", "or", "than", "until",
]);
/** An anchor shorter than this is no longer the phrase a reader would click. */
const ANCHOR_MIN_WORDS = 3;

/**
 * Shorten every over-long anchor, keeping the rest of the claim as prose.
 *
 * This WAS a rejection fed back to the writer, on the theory that shortening
 * an anchor is a writing task. Then a run burned three attempts and $0.71 on
 * one thirteen-word link, rewriting the whole article each time and landing
 * on a thirteen-word link each time. The writer cannot count to twelve any
 * better than it can count dashes, and a link that is one word too long is a
 * surplus fault, not a missing one — so it is fixed here, on every attempt,
 * and the check below is left in as the invariant this must satisfy.
 *
 * The cut is at the last natural boundary inside the limit; failing that, at
 * the limit. Fenced code is left alone.
 */
/**
 * Make every internal anchor name the page it points at.
 *
 * The check below wants one real word in common between the anchor and the
 * destination's topic — "crypto PPC" needs "PPC" somewhere in the link text.
 * One run was told that three times and wrote "agency partner" three times,
 * at $0.75 an attempt. Same lesson as anchor length: naming the destination is
 * a rule the model demonstrably does not follow on request, and the remedy is
 * a word or two, so the code does it.
 *
 * Two ways, tried in order:
 *
 *   1. The topic is already in the sentence just before the link — "our crypto
 *      PPC [agency partner]" — so the anchor grows backwards to take it in:
 *      "our [crypto PPC agency partner]". Nothing is added; the link just
 *      covers the words that were already there.
 *   2. Otherwise the topic is prepended: "[crypto PPC agency partner]".
 *
 * Only links to pages on the approved list; an external link is never touched.
 * Runs BEFORE shortenAnchors, which trims from the end, so the topic at the
 * front survives.
 */
/**
 * Delete the sentence openers Liam named as the AI tell.
 *
 * "It's worth noting that the policy changed" is "The policy changed" with a
 * throat-clear in front of it. The check below rejects the throat-clear; the
 * writer was told three times on one run and wrote it three times. Same
 * lesson as the anchors: the remedy is a deletion, so the code makes it.
 *
 * Only the opener goes, plus the "that" or comma that hung off it, and the
 * next word is capitalised. What is left is the sentence the model meant.
 * Fenced code is untouched.
 */
/**
 * Punctuation that two edits left behind.
 *
 * "treated as a growth lever rather than a compliance surface., the same
 * discipline" reached a client-facing Doc. Somewhere between the model's
 * revision and the dash softener a full stop and a comma ended up side by
 * side, and nothing looked at the seam. This does: ".," becomes "," except
 * after an abbreviation, doubled commas collapse, and a space before a comma
 * or full stop goes. Fenced code untouched.
 */
/**
 * "Conclusion and FAQ" becomes "Conclusion" when the FAQs render separately.
 *
 * Coinpresso's own briefs title the last outline section "Conclusion and
 * FAQ" — one section holding both. The pipeline stores the FAQs apart from
 * the body and every renderer adds its own "FAQs" heading, so a post came out
 * with a "Conclusion and FAQ" section holding only the conclusion, followed by
 * a second heading, "FAQs". Bernard: "why is there a conclusion and faq and
 * then another faq?" The five posts Liam approved all end "Conclusion" then
 * "FAQs", so that is what this produces. The brief's wording is kept where
 * there are no FAQs to render, because then it is not wrong.
 */
export function normaliseConclusionHeading(body: string, hasFaqs: boolean): string {
  if (!hasFaqs) return body;
  return body.replace(/^(##\s+)Conclusion\s+(?:and|&|\+)\s+FAQs?[ \t]*$/im, "$1Conclusion");
}

export function tidyPunctuation(body: string): string {
  const fix = (prose: string) =>
    prose
      .replace(/\b(?!(?:etc|e\.g|i\.e|vs|inc|ltd|co|no|st|dr|mr|mrs|ms|jr|sr)\b)([a-z]{2,})\.,(\s)/gi, "$1,$2")
      .replace(/,\s*,+/g, ",")
      .replace(/ +([,.;:])(\s)/g, "$1$2");
  return body
    .split(/(```[\s\S]*?```)/)
    .map((seg, i) => (i % 2 ? seg : fix(seg)))
    .join("");
}

export function stripAiOpeners(body: string): string {
  const re = new RegExp(
    AI_OPENERS.source + String.raw`\s*[,:]?\s*(?:that\s+)?(?=\S)`,
    "g"
  );
  const fix = (prose: string) => {
    let out = "";
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(prose))) {
      const after = prose.slice(m.index + m[0].length);
      // Nothing usable after it, or a sentence end — leave it for the check.
      if (!after || /^[.!?]/.test(after)) continue;
      out += prose.slice(last, m.index) + m[1];
      last = m.index + m[0].length;
      // The next word starts the sentence now. The first letter within the
      // next few characters is capitalised, so "[the policy]" and "\"the"
      // are handled without touching anything further along.
      const head = prose.slice(last, last + 4);
      const li = head.search(/[a-z]/);
      if (li >= 0) {
        out += head.slice(0, li) + head[li].toUpperCase();
        last += li + 1;
      }
    }
    return out + prose.slice(last);
  };

  return body
    .split(/(```[\s\S]*?```)/)
    .map((seg, i) => (i % 2 ? seg : fix(seg)))
    .join("");
}

/**
 * An invented coinpresso.io URL is repaired or unlinked, never left to fail.
 *
 * The writer is told to link relevant Coinpresso posts, and when it wants one
 * it does not have the slug for, it writes a plausible slug:
 * "/blog/circumventing-systems-review" for a post actually published at
 * "/blog/google-ads-circumventing-systems-suspensions-...". The check rejects
 * it correctly, the writer guesses again, and three attempts go the same way.
 *
 * Guessing a slug is not a writing task. Either a real page matches what it
 * meant — in which case the URL is corrected and the anchor kept — or nothing
 * does, and the link comes off while the words stay. An unlinked sentence is
 * never worse than a 404 on the client's own domain, and the link-count check
 * will ask for a real page instead, which is the outcome Liam wants.
 *
 * Matching is on slug words, both ways: every word of the invented slug has
 * to appear in the real one, or enough of the real one's distinctive words in
 * the invention. Deliberately strict — a wrong link is worse than none.
 */
export function repairInternalLinks(
  body: string,
  known: Map<string, string>
): string {
  const slugWords = (u: string) =>
    new Set(
      u
        .replace(/^https?:\/\/[^/]+/, "")
        .split(/[^a-z0-9]+/i)
        .map((w) => w.toLowerCase())
        .filter((w) => w.length > 2 && !GENERIC_ANCHOR_WORDS.has(w))
    );

  const candidates = [...known.keys()].map((k) => ({ url: k, words: slugWords(k) }));

  const fix = (prose: string) =>
    prose.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (whole, text: string, url: string) => {
      if (!/^https?:\/\/(www\.)?coinpresso\.io(\/|$)/i.test(url)) return whole;
      if (known.has(normaliseUrl(url))) return whole;

      const want = slugWords(url);
      if (want.size) {
        let best: { url: string; score: number } | null = null;
        for (const c of candidates) {
          if (!c.words.size) continue;
          const shared = [...want].filter((w) => c.words.has(w)).length;
          // MOST OF THE INVENTION'S OWN WORDS must be in the real slug, or
          // most of the real slug's words in the invention. The first is the
          // case that matters: the model writes a SHORTER guess than the real
          // title — "circumventing-systems-review" for a post published at
          // "google-ads-circumventing-systems-suspensions-…" — so demanding
          // that the real page be mostly covered never matches the failure
          // this exists to fix. Two shared words minimum, so a lone "google"
          // cannot pull a link onto the wrong page.
          const covers =
            shared / want.size >= 0.6 || shared / c.words.size >= 0.6;
          if (covers && shared >= 2 && (!best || shared > best.score)) {
            best = { url: c.url, score: shared };
          }
        }
        if (best) return `[${text}](${best.url})`;
      }
      // Nothing matched: keep the sentence, drop the link.
      return text;
    });

  return body
    .split(/(```[\s\S]*?```)/)
    .map((seg, i) => (i % 2 ? seg : fix(seg)))
    .join("");
}

export function nameAnchors(body: string, known: Map<string, string>): string {
  const fix = (prose: string) =>
    prose.replace(
      /((?:\S+\s+){0,4})\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (whole, before: string, text: string, url: string) => {
        const topic = known.get(normaliseUrl(url));
        if (!topic) return whole;
        if (namesTopic(text, topic)) return whole;

        // 1. Grow backwards over the preceding words if the topic is already
        //    sitting there. Matched on the topic's OWN words, generic ones
        //    included, so "crypto PPC" is taken in whole rather than leaving
        //    "crypto" stranded outside the bracket. Never across punctuation:
        //    "crypto PPC. Our [partner]" is two sentences, not one phrase.
        const topicWords = new Set(topic.split(" | ")[0].toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
        const words = before.split(/\s+/).filter(Boolean);
        for (let i = 0; i < words.length; i++) {
          const bare = words[i].toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!topicWords.has(bare)) continue;
          const keepIdx = before.indexOf(words[i]);
          const pulled = before.slice(keepIdx).trim();
          if (/[.!?:;,()"\u2018\u201c\u2019\u201d]/.test(pulled)) break;
          return `${before.slice(0, keepIdx)}[${pulled} ${text}](${url})`;
        }

        // 2. Prepend the topic — the first phrase, when the map gives several.
        //    Unless that makes a mouthful: "crypto Google Ads crypto-related
        //    product certification categories" reached a client Doc. Past
        //    five words, the topic alone IS the anchor and the old text goes
        //    back to being prose after it.
        const first = topic.split(" | ")[0].trim();
        const joined = `${first} ${text}`;
        if (joined.split(/\s+/).length > 5) {
          return `${before}[${first}](${url}) ${text}`;
        }
        return `${before}[${joined}](${url})`;
      }
    );

  return body
    .split(/(```[\s\S]*?```)/)
    .map((seg, i) => (i % 2 ? seg : fix(seg)))
    .join("");
}

export function shortenAnchors(body: string): string {
  const fix = (prose: string) =>
    prose.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (whole, text: string, url: string) => {
      const words = text.trim().split(/\s+/);
      if (words.length <= ANCHOR_MAX_WORDS) return whole;
      let cut = ANCHOR_MAX_WORDS;
      for (let i = ANCHOR_MAX_WORDS; i >= ANCHOR_MIN_WORDS; i--) {
        if (ANCHOR_BREAK_WORDS.has(words[i].toLowerCase().replace(/[^a-z]/g, ""))) {
          cut = i;
          break;
        }
      }
      const anchor = words.slice(0, cut).join(" ").replace(/[,;:]+$/, "");
      const rest = words.slice(cut).join(" ");
      return `[${anchor}](${url}) ${rest}`;
    });

  // Only prose. Splitting on fences keeps the odd segments (code) untouched.
  return body
    .split(/(```[\s\S]*?```)/)
    .map((seg, i) => (i % 2 ? seg : fix(seg)))
    .join("");
}

export function enforceAnchorLength(body: string): void {
  const long = [...proseOf(body).matchAll(/\[([^\]]+)\]\([^)]*\)/g)]
    .map((m) => m[1])
    .filter((a) => wordCount(a) > ANCHOR_MAX_WORDS);
  if (!long.length) return;
  throw new Error(
    `${long.length} link${long.length === 1 ? " has" : "s have"} anchor text longer than ${ANCHOR_MAX_WORDS} words. The client's note: "a lot of really long external links taking up whole sentences". Shorten the anchor to the phrase a reader would click, and leave the rest of the claim as ordinary prose outside the link:\n${long
      .map((a) => `      "${a}"`)
      .join("\n")}`
  );
}

export function enforceLinkSpacing(body: string): void {
  const tight: string[] = [];
  for (const para of paragraphsOf(body)) {
    const links = [...para.matchAll(/\[([^\]]+)\]\([^)]*\)/g)];
    for (let i = 1; i < links.length; i++) {
      const prev = links[i - 1];
      const between = para.slice(
        (prev.index ?? 0) + prev[0].length,
        links[i].index
      );
      if (wordCount(between) < LINK_MIN_GAP_WORDS) {
        tight.push(`"${links[i - 1][1]}" → "${links[i][1]}"`);
      }
    }
  }
  // THE CLIENT'S WORD WAS "a lot".
  //
  // This fired on the first pair, so one primary source cited beside an
  // analysis of it — corroboration, and good practice — killed a run that was
  // otherwise publishable. Two links close together is a judgement; several is
  // the pattern he complained about.
  //
  // Unlike the 125-word cap, this number is NOT measured: all five reviewed
  // posts have zero tight pairs, so they say nothing about where the tolerance
  // belongs. It is a judgement call and is written down as one, so the next
  // person argues with the reasoning rather than guessing at it.
  if (tight.length <= TIGHT_PAIRS_ALLOWED) return;
  throw new Error(
    `${tight.length} pairs of links sit less than ${LINK_MIN_GAP_WORDS} words apart. The client's note: "a lot of links stuffed into a small body of text... Links need to be naturally placed throughout". Move one of each pair to a different part of the piece, or drop it:\n${tight
      .map((t) => `      ${t}`)
      .join("\n")}`
  );
}

/**
 * Split paragraphs that run past the cap, at the sentence boundary nearest the
 * middle.
 *
 * This was a rejection, and it should not have been. The house rule here is
 * that a check fails a run only when a person is the one who has to decide
 * something; where the remedy is mechanical, the code does it. Liam made that
 * call himself — the three over-long paragraphs in the approved batch were
 * ones he split BY HAND rather than sending back — and a split at the turn in
 * the argument is the same edit a regular expression can make.
 *
 * List items are left alone: a bullet cannot become two paragraphs without
 * breaking the list, so a genuinely over-long bullet is still a rejection and
 * a person decides what to do with it. Tables and fenced code likewise.
 */
export function splitFatParagraphs(body: string): string {
  const splitOne = (para: string): string => {
    if (wordCount(unlink(para)) <= PARA_MAX_WORDS) return para;

    // Sentence starts, as offsets into the paragraph.
    const bounds: number[] = [];
    const re = /(?<=[.!?])\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(para))) bounds.push(m.index + m[0].length);
    if (!bounds.length) return para; // One enormous sentence: a person's call.

    // The boundary closest to halfway through the words, so neither half is a
    // fragment. Splitting at the first full stop would just move the wall.
    const half = wordCount(unlink(para)) / 2;
    let best = bounds[0];
    let bestGap = Infinity;
    for (const b of bounds) {
      const gap = Math.abs(wordCount(unlink(para.slice(0, b))) - half);
      if (gap < bestGap) {
        bestGap = gap;
        best = b;
      }
    }
    const head = para.slice(0, best).trim();
    const tail = para.slice(best).trim();
    if (!head || !tail) return para;
    return `${splitOne(head)}\n\n${splitOne(tail)}`;
  };

  const fix = (prose: string) =>
    prose
      .split(/\n{2,}/)
      .map((block) => {
        const t = block.trim();
        if (!t || t.startsWith("#") || t.startsWith("|") || LIST_ITEM.test(t)) {
          return block;
        }
        return splitOne(t);
      })
      .join("\n\n");

  return body
    .split(/(```[\s\S]*?```)/)
    .map((seg, i) => (i % 2 ? seg : fix(seg)))
    .join("");
}

export function enforceParagraphSize(body: string): void {
  const fat = paragraphsOf(body)
    .map((p) => ({ p, n: wordCount(unlink(p)) }))
    .filter((x) => x.n > PARA_MAX_WORDS);
  if (!fat.length) return;
  throw new Error(
    `${fat.length} paragraph${fat.length === 1 ? " is" : "s are"} over ${PARA_MAX_WORDS} words. The client's note: "There are lots of big sections of text here which need to be broken up better". Aim for two to four sentences a paragraph — split these at the natural turn in the argument:\n${fat
      .map((x) => `      ${x.n} words: "${x.p.slice(0, 90)}…"`)
      .join("\n")}`
  );
}

export function enforceSentenceVariety(body: string): void {
  const sentences = unlink(proseOf(body))
    .replace(/^#.*$/gm, "")
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1);

  let run: string[] = [];
  const worst: string[][] = [];
  for (const sentence of sentences) {
    if (wordCount(sentence) < SHORT_SENTENCE_WORDS) {
      run.push(sentence);
    } else {
      if (run.length > MAX_SHORT_RUN) worst.push(run);
      run = [];
    }
  }
  if (run.length > MAX_SHORT_RUN) worst.push(run);
  if (!worst.length) return;

  throw new Error(
    `${worst.length} stretch${worst.length === 1 ? "" : "es"} of more than ${MAX_SHORT_RUN} short sentences in a row. The client's note: "a lot of short, snappy, 1-liners in here... this can go too far and come off as word salad". He also warned against overcorrecting into encyclopedias, so join two or three of these into a longer sentence rather than padding each one:\n${worst
      .map((r) => `      "${r.join(" ")}"`)
      .join("\n")}`
  );
}

/**
 * A piece that says "checklist" or "in a table" has to contain one.
 *
 * Liam raised this twice in one round, and it is not only a reading-comfort
 * point: these posts argue that engines lift structured facts and skip prose
 * claims, so a post that describes a table in a paragraph is failing its own
 * advice in public.
 */
export function enforcePromisedStructures(body: string): void {
  const prose = proseOf(body);
  const hasTable = /^\s*\|.+\|\s*$/m.test(prose);
  const hasList = /^\s*(?:[-*+]|\d+\.)\s+\S/m.test(prose);
  const missing: string[] = [];

  const promisesTable =
    /\b(?:in|as|a|the)\s+(?:dated\s+|comparison\s+|fee\s+)?table\b|\btable\s+(?:above|below)\b/i.test(
      prose
    );
  const promisesList =
    /\bchecklist\b|\bthe list (?:above|below)\b|\bshort, specific list\b/i.test(
      prose
    );

  // A checklist rendered as a table counts, and vice versa. The client offered
  // both — "A table? A checklist? Something that is easier for the reader and
  // AIs to digest" — so what matters is that some real structure exists, not
  // which of the two it is.
  if (promisesTable && !hasTable && !hasList) missing.push("a table");
  if (promisesList && !hasList && !hasTable) missing.push("a checklist or list");
  if (!missing.length) return;

  throw new Error(
    `The draft refers to ${missing.join(" and ")} but never renders one in markdown. The client's note: "We are referencing a table here but haven't formatted as a table?" and "Should also be in a checklist format of which can then be crawled/parsed by AIs". Render it properly — a markdown table with a header row, or a "- " list — rather than describing it in a sentence.`
  );
}

/**
 * House spelling is American, per the client's inline edits (centralised →
 * centralized, recognise → recognize).
 *
 * Mechanical, so it is fixed in code rather than costing a retry. It only
 * rewrites whole words, and only ones with no ambiguous American reading, so
 * it will not touch a proper noun, a quoted source or a URL.
 */
/**
 * Every entry is a whole word with no ambiguous American reading. The
 * replacement is a function so the original capitalization survives — a
 * sentence starting "Behaviour" must not become "behavior".
 */
const SIMPLE_BRITISH: Array<[RegExp, string]> = [
  [/behaviour/gi, "behavior"],
  [/programme/gi, "program"],
  [/artefact/gi, "artifact"],
  [/afterwards/gi, "afterward"],
  [/organisation/gi, "organization"],
  [/licence/gi, "license"],
  [/defence/gi, "defense"],
  [/judgement/gi, "judgment"],
  [/catalogue/gi, "catalog"],
  [/favour/gi, "favor"],
  [/labour/gi, "labor"],
  [/colour/gi, "color"],
  [/fulfil\b/gi, "fulfill"],
  [/whilst/gi, "while"],
  [/modelling/gi, "modeling"],
  [/labelled/gi, "labeled"],
  [/labelling/gi, "labeling"],
  [/cancelled/gi, "canceled"],
  [/signalled/gi, "signaled"],
  [/fuelled/gi, "fueled"],
  [/maths\b/gi, "math"],
  [/travelling/gi, "traveling"],
  [/practise/gi, "practice"],
];

/** Keep the original word's capitalization when swapping it. */
function matchCase(original: string, replacement: string): string {
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * The operator's notes for this run, as instructions.
 *
 * Deliberately last-word: these are written by a person looking at a stage
 * that has already failed two or three times, and the only reason to type one
 * is that the general rules were not enough. A note that the model treats as
 * one more suggestion among twenty is a note that changes nothing.
 */
/**
 * Run every check and collect what fails, instead of stopping at the first.
 *
 * The checks used to be ten statements in a row, each throwing. So a draft with
 * five faults reported one, the writer fixed that one, the next attempt
 * reported the second, and three paid attempts bought three single-fault
 * corrections and no publishable article. The model was not failing to follow
 * instructions; it was never given them all at once.
 *
 * Collecting them costs nothing — the checks are pure functions over a string
 * already in memory — and changes the arithmetic completely: one attempt now
 * learns everything wrong with the draft, and the operator reading the failure
 * sees the whole list rather than whichever fault happened to be checked first.
 */
export function collectRejections(checks: Array<() => void>): string[] {
  const faults: string[] = [];
  for (const check of checks) {
    try {
      check();
    } catch (e) {
      faults.push(e instanceof Error ? e.message : String(e));
    }
  }
  return faults;
}

/**
 * The faults as one message.
 *
 * "Retry the writer." is stripped from each: it is advice to the operator that
 * made sense on a single-fault message and reads as noise repeated five times
 * down a numbered list.
 */
export function joinFaults(faults: string[]): string {
  const clean = faults.map((f) => f.replace(/\s*Retry the writer\.\s*$/, "").trim());
  if (clean.length === 1) return clean[0];
  return `${clean.length} things must change:\n${clean
    .map((f, i) => `${i + 1}. ${f}`)
    .join("\n")}`;
}

export function guidanceBlock(guidance?: GuidanceNote[]): string {
  const notes = (guidance ?? []).filter((g) => g.note.trim());
  if (!notes.length) return "";
  const lines = notes.map(
    (g, i) =>
      `${i + 1}. ${g.note.trim()}${
        g.rejection ? `\n   (written after: ${g.rejection.slice(0, 160)})` : ""
      }`
  );
  return `INSTRUCTIONS FROM THE EDITOR FOR THIS POST — these were written after
this stage was rejected, by someone who read the rejection. They override the
general guidance above where the two disagree. Follow them exactly.

${lines.join("\n")}`;
}

export function americanize(body: string): string {
  const { masked, restore } = maskCode(body);
  // Split on the URL half of a markdown link and never touch those segments: a
  // coinpresso.io slug containing "optimisation" is an address, not prose, and
  // rewriting it turns a working link into a 404.
  const parts = masked.split(/(\]\([^)]*\))/g);
  const fixed = parts.map((part, i) => {
    if (i % 2 === 1) return part;
    let out = part;
    out = out.replace(/(\w*?)isation\b/gi, (m, stem: string) =>
      matchCase(m, `${stem}ization`)
    );
    out = out.replace(
      /\b(centrali|decentrali|recogni|optimi|organi|summari|categori|prioriti|standardi|visuali|maximi|minimi|utili|emphasi|apologi|reali|speciali|monetari|penali|critici|memori|normali|synthesi|scrutini)s(e|es|ed|ing)\b/gi,
      (m, stem: string, tail: string) => matchCase(m, `${stem}z${tail}`)
    );
    out = out.replace(/\banalys(e|es|ed|ing)\b/gi, (m, tail: string) =>
      matchCase(m, `analyz${tail}`)
    );
    for (const [re, to] of SIMPLE_BRITISH) {
      out = out.replace(re, (m) => matchCase(m, to));
    }
    return out;
  });
  return restore(fixed.join(""));
}
