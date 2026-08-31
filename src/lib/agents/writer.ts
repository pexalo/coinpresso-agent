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
import { briefToPrompt } from "../content-brief";
import { exemplarBlock, priorWorkFromStore, styleExemplars } from "../archive-store";
import {
  BLOG_ARCHIVE_ID,
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
    // Three rather than two: on this track the exemplars are the whole point of
    // the archive, and a wider sample of the house voice is worth the tokens.
    limit: 3,
  });
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

  const user = `${BLOG_STYLE}
${voiceBlock}${clientBrief}
---

FORMAT: ${type ? `${type.name} — ${type.shape} Target ${type.words[0]}-${type.words[1]} words.` : "Guide, 1200-1800 words."}
${pillar ? `PILLAR: ${pillar.name}. Link to the hub at ${pillar.hub} using descriptive anchor text.` : ""}

WORKING TITLE (improve it if it is clumsy, keep the keyword):
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

INTERNAL LINKS TO WORK IN:
${(research.internalLinks ?? []).map((l) => `- ${l}`).join("\n") || "- the pillar hub"}

SUGGESTED H2s:
${research.suggestedHeadings.map((h) => `- ${h}`).join("\n")}

FAQ CANDIDATES:
${research.faqCandidates.map((f) => `- ${f}`).join("\n")}

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
