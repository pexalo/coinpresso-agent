// ---------------------------------------------------------------------------
// Writer agent. Mid-tier Claude.
//
// Given a complete research brief and Liam's style profile, the writing task is
// constrained enough that the frontier tier buys very little. The brief does the
// thinking; this stage does the prose.
// ---------------------------------------------------------------------------

import { callClaude, extractJson } from "../providers/anthropic";
import { MODELS } from "../models";
import { PUBLICATIONS, boilerplateFor } from "../publications";
import { LIAM_STYLE_PROFILE, PLAYBOOK } from "../style-profile";
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

export interface WriterInput {
  brief: Brief;
  research: ResearchBrief;
  /** On a revision pass, what the reviewer asked for. */
  fixes?: ReviewFinding[];
  previous?: Draft;
}

export async function runWriter(input: WriterInput): Promise<{
  draft: Draft;
  tokensIn: number;
  tokensOut: number;
}> {
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

  const user = `${styleBlock()}

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

Return ONLY a JSON object:
{
  "headline": "...",
  "dateline": ${pub.dateline ? '"ZUG, Switzerland, Month D, YYYY (GLOBE NEWSWIRE) --"' : "null"},
  "body": "the full article in markdown: intro paragraphs, ## H2 sections, prose. Include the boilerplate at the end. Do NOT include the FAQs here — they go in the faqs field.",
  "faqs": [{ "q": "...", "a": "..." }],
  "tags": ["..."]
}`;

  const r = await callClaude({
    model: MODELS.writer,
    system: SYSTEM,
    user,
    maxTokens: 8000,
    temperature: 0.6,
  });

  const parsed = extractJson<Omit<Draft, "wordCount">>(r.text);
  const draft: Draft = {
    ...parsed,
    faqs: parsed.faqs || [],
    tags: parsed.tags || [],
    wordCount: (parsed.body || "").split(/\s+/).filter(Boolean).length,
  };

  return { draft, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
}
