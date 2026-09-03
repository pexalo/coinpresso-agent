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
import { exemplarBlock, priorWorkFromStore, styleExemplars } from "../archive-store";
import { feedbackBlock, readFeedback } from "../feedback";
import {
  internalLinkTargets,
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
import type { Brief, Draft, ResearchBrief, ReviewFinding } from "../types";

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
function enforceOutline(body: string, outline: BriefSection[]): string {
  const lines = body.split("\n");
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
  return lines.join("\n");
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
function enforceIntro(body: string): void {
  const firstH2 = body.search(/^##\s+/m);
  const intro = firstH2 === -1 ? body : body.slice(0, firstH2);
  const words = intro.split(/\s+/).filter(Boolean).length;
  if (words < 60) {
    throw new Error(
      `The article opens on its first section with ${words} words of introduction before it. ` +
        `Every post needs one to two scene-setting paragraphs before the first H2 — retry the writer.`
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

function enforceProse(body: string): void {
  const hits = [...body.matchAll(AI_OPENERS)].map((m) => m[2]);
  if (hits.length) {
    throw new Error(
      `The draft opens ${hits.length} sentence${hits.length === 1 ? "" : "s"} with ${[...new Set(hits)]
        .map((h) => `"${h}"`)
        .join(", ")} — the connective tissue the client flagged as AI-derived. Retry the writer.`
    );
  }
}

/**
 * Liam's blend per post: 3-5 internal links to real coinpresso.io pages,
 * spread through the body, and 3-5 external links each carrying one claim.
 * Counted here rather than trusted, because the previous drafts carried a
 * pillar link to a page that did not exist and nobody could tell.
 */
function enforceLinks(body: string, ledgerSize: number): void {
  const links = [...body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  const isInternal = (u: string) => /^https?:\/\/(www\.)?coinpresso\.io(\/|$)/i.test(u);
  const internal = new Set(links.filter(isInternal));
  const external = new Set(links.filter((u) => !isInternal(u)));
  const problems: string[] = [];
  if (internal.size < 3) {
    problems.push(`${internal.size} internal link${internal.size === 1 ? "" : "s"} to coinpresso.io (needs 3-5)`);
  }
  const wantExternal = Math.min(3, ledgerSize);
  if (external.size < wantExternal) {
    problems.push(`${external.size} external link${external.size === 1 ? "" : "s"} (needs ${wantExternal}-5 from the ledger)`);
  }
  const crowded = body
    .split(/\n\s*\n/)
    .filter((para) => (para.match(/\]\(https?:\/\//g) ?? []).length > 2).length;
  if (crowded) {
    problems.push(`${crowded} paragraph${crowded === 1 ? "" : "s"} with three or more links — the citation dump the client flagged`);
  }
  // Every internal link in the closing section and none before it is the
  // "stuffed on to the conclusion" pattern. Compare where they fall.
  const lastH2 = body.lastIndexOf("\n## ");
  if (lastH2 > 0 && internal.size >= 3) {
    const before = [...body.slice(0, lastH2).matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].filter((m) => isInternal(m[1])).length;
    if (before === 0) problems.push("every internal link sits in the final section — spread them through the body");
  }
  if (problems.length) {
    throw new Error(`Linking: ${problems.join("; ")}. Retry the writer.`);
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
function enforceFaqs(
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
  const voiceBlock = exemplars.length
    ? `\n\n${exemplarBlock(exemplars)}\n`
    : `\n\nNo published examples have been imported from coinpresso.io yet, so you
are working from the style description alone. Stay closer to it than you
otherwise would, and do not invent house conventions it does not state.\n`;
  const type = brief.contentType
    ? CONTENT_TYPES[brief.contentType as keyof typeof CONTENT_TYPES]
    : undefined;

  const sourceLedger = research.sources
    .map(
      (x) =>
        `[${x.id}] ${x.publisher} — "${x.title}"\n     URL: ${x.url}\n     Supports: ${x.claim}${
          x.figures?.length ? `\n     Figures: ${x.figures.join(" | ")}` : ""
        }`
    )
    .join("\n");

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
  const introRule = `INTRODUCTION. Before the first H2, write one to two paragraphs (80-150
words) with NO heading: set the scene — the reader's current reality and why it
has changed — and say what this piece will take them through. The first H2
comes after it. Section 1 then develops the opening in depth; it does not repeat
the introduction.`;

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
${feedback ? `\n${feedback}\n` : ""}${voiceBlock}${clientBrief}
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

INTERNAL LINKS — the ONLY coinpresso.io pages that exist. Link 3-5 of them
as markdown links, each where its topic comes up in the body, with anchor text
naming that topic (the words "crypto SEO" link to the crypto SEO page). Do not
invent any other coinpresso.io path; do not put them all in the last section.
${internalLinkTargets(pillar?.hub)}

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

SOURCE LEDGER — the ONLY URLs you may cite:
${sourceLedger || "(empty — write without external citations and say so where a figure would have gone)"}
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
===TAGS===
comma, separated, tags

Start your reply with ===HEADLINE=== and end it after the tags line.`;

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

  const r = await callClaude({
    model: MODELS.writer,
    system: BLOG_SYSTEM,
    user,
    maxTokens: ceiling,
    temperature: 0.65,
    context: { ...input.ctx, stage: input.fixes ? "revision" : "writer" },
  });

  let parsed: Omit<Draft, "wordCount">;
  try {
    parsed = parseDraftSections(r.text, { stage: "writer", stopReason: r.stopReason, maxTokens: ceiling });
    // The title is the client's, or the planner's approved one. The model was
    // told not to change it; this makes sure the instruction was not needed.
    parsed.headline = brief.title;
    enforceIntro(parsed.body);
    enforceProse(parsed.body);
    enforceLinks(parsed.body, research.sources.length);
    if (fixedStructure) {
      parsed.body = enforceOutline(parsed.body, outline);
      if (brief.contentBrief?.faqs?.length) {
        parsed.faqs = enforceFaqs(parsed.faqs, brief.contentBrief.faqs);
      }
    }
  } catch (e) {
    throw billed(e, { tokensIn: r.tokensIn, tokensOut: r.tokensOut, searchRequests: 0 });
  }
  const draft: Draft = {
    ...parsed,
    dateline: null,
    faqs: parsed.faqs || [],
    tags: parsed.tags || [],
    wordCount: (parsed.body || "").split(/\s+/).filter(Boolean).length,
  };
  return { draft, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
}

export async function runWriter(input: WriterInput): Promise<{
  draft: Draft;
  tokensIn: number;
  tokensOut: number;
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

SOURCE LEDGER — the ONLY URLs you may use:
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
  } catch (e) {
    throw billed(e, { tokensIn: r.tokensIn, tokensOut: r.tokensOut, searchRequests: 0 });
  }
  const draft: Draft = {
    ...parsed,
    faqs: parsed.faqs || [],
    tags: parsed.tags || [],
    wordCount: (parsed.body || "").split(/\s+/).filter(Boolean).length,
  };

  return { draft, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
}
