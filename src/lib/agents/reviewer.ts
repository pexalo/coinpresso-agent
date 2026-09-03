// ---------------------------------------------------------------------------
// Review agent. GPT, deliberately a different model family from the writer.
//
// A reviewer sharing the writer's lineage shares its blind spots and mostly
// agrees with itself. Cross-family review is what makes this stage worth its
// latency.
//
// The reviewer holds Liam's style profile and the sourcing standard, and it is
// told that rejecting is a normal outcome — a queue where nothing is ever sent
// back is not being reviewed.
// ---------------------------------------------------------------------------

import { callGpt } from "../providers/openai";
import { MODELS } from "../models";
import { PUBLICATIONS } from "../publications";
import { LIAM_STYLE_PROFILE } from "../style-profile";
import { recent } from "../archive";
import { BLOG_PLAYBOOK, BLOG_STYLE, CONTENT_TYPES } from "../blog";
import { feedbackBlock, readFeedback } from "../feedback";
import type { CallContext } from "../providers/routing";
import type {
  Brief,
  Draft,
  LinkCheckResult,
  ResearchBrief,
  ReviewResult,
} from "../types";

const SYSTEM = `You are the editorial reviewer for Coinpresso's Moonberg crypto PR
programme. You did not write this draft. Your job is to judge whether it matches
the client's established house style and meets the sourcing standard, and to
return specific, actionable fixes.

You are the last gate before a draft reaches a newswire. Be exacting.

Rejecting a draft is a normal outcome. A reviewer who passes everything is
decoration. Equally, do not manufacture findings to look diligent — if a section
is genuinely fine, leave it alone.

SEVERITY
- blocker: cannot publish. Fabricated or unsupported source, invented figure,
  a price target asserted as fact, a guaranteed-return claim, a missing
  disclaimer, an unverified presale figure stated as verified.
- major: would read as off-brand or as advertising. Missing cautious
  counter-forecast, Moonberg introduced too early, keyword absent from a required
  position, banned vocabulary, wrong link style for the wire.
- minor: polish. Rhythm, a heading that could carry the keyword, spelling variant.

Any blocker means verdict "revise". Three or more majors also means "revise".
Use "reject" only when the draft is unsalvageable and should be regenerated from
the brief rather than patched.

Return ONLY a JSON object.`;

export interface ReviewerInput {
  /** Threaded to the gateway so spend is attributed to a client and a run. */
  ctx?: CallContext;
  brief: Brief;
  research: ResearchBrief;
  draft: Draft;
  linkCheck: LinkCheckResult;
}

export async function runReviewer(input: ReviewerInput): Promise<{
  review: ReviewResult;
  tokensIn: number;
  tokensOut: number;
}> {
  const { brief, research, draft, linkCheck } = input;

  if (brief.track === "blog") return reviewBlog(input);

  const pub = PUBLICATIONS[brief.publication];
  const s = LIAM_STYLE_PROFILE;

  const allowedUrls = research.sources.map((x) => `${x.id}: ${x.url}`).join("\n");
  const allowedFigures = research.sources
    .flatMap((x) => (x.figures || []).map((f) => `${x.publisher}: ${f}`))
    .join("\n");

  const campaignBlock = brief.bannedClaims?.length
    ? `CAMPAIGN LIMITS — ${brief.campaignName ?? "this campaign"} ${brief.campaignTicker ?? ""}

Check the draft against each of these first. A breach is always a blocker,
regardless of how well the piece reads:
${brief.bannedClaims.map((c) => `- ${c}`).join("\n")}

Approved figures for this campaign — any other number presented as the presale
total, stage or token price is a blocker:
- Raised: ${brief.presaleRaised ?? "not supplied — no figure may be stated"}
- Stage: ${brief.presaleStage ?? "not supplied — no stage may be stated"}
- Token price: ${brief.tokenPrice ?? "not supplied — no price may be stated"}

---

`
    : "";

  const prior = brief.campaignId ? recent(brief.campaignId, 15) : [];
  const repetitionBlock = prior.length
    ? `ALREADY PUBLISHED — check this draft against them for repetition.

${prior.map((a) => `- ${a.publishedAt} · ${a.title}`).join("\n")}

A headline construction, comparison set or structure that repeats one of the
above is a MAJOR finding, categorised "structure". The featured asset repeating
is fine — the market decides that. The angle on it repeating is not.

---

`
    : "";

  const user = `${campaignBlock}${repetitionBlock}HOUSE STYLE THIS MUST MATCH

${s.styleSummary}

- Voice: ${s.voice.formality}; ${s.voice.person}
- Paragraphs: ${s.structure.paragraphLength}
- Opens with: ${s.structure.opensWith}
- Spelling: ${s.vocabulary.spelling}
- Contractions: ${s.punctuation.contractions ? "allowed" : "not used"}
- Bullet lists in body: ${s.structure.usesBulletLists ? "allowed" : "not used — prose only"}
- Banned vocabulary: ${s.vocabulary.avoids.join(", ")}
- Hard rules:
${s.doNot.map((d) => `  - ${d}`).join("\n")}

PACING RULE (explicit client feedback, check this specifically):
The intro must run three to four paragraphs — news hook, then why the featured
asset matters now, then Moonberg positioned as a different angle, then the presale
link — BEFORE the price-prediction section begins. Reaching the prediction section
straight after paragraph one is a major finding.

STRUCTURE THE FRAMEWORK REQUIRES
market hook -> featured asset context -> soft-sell Moonberg -> sourced prediction
section carrying BOTH a bullish and a cautious forecast -> opportunity gap ->
Moonberg product -> $MBX utility -> presale evidence -> comparison -> conclusion
returning to the search intent -> FAQs -> disclaimer.

PUBLICATION: ${pub.name}
- Link style required: ${pub.linkStyle === "naked" ? "NAKED URLs on their own line, no markdown links" : "EMBEDDED markdown anchor text"}
- Length target: ${pub.wordTarget[0]}-${pub.wordTarget[1]} words (draft is ${draft.wordCount})
- FAQs expected: ${pub.faqCount[0]}-${pub.faqCount[1]} (draft has ${draft.faqs.length})
${pub.dateline ? `- Must open with the ${pub.dateline} GLOBE NEWSWIRE dateline` : "- No dateline expected"}

KEYWORDS
Primary: ${research.primaryKeyword}
Must appear verbatim in headline, first paragraph, at least one H2, the
conclusion, and at least one FAQ. Check each position and report any that are missing.

THE ONLY URLS THIS ARTICLE MAY CITE
${allowedUrls || "(none)"}

FIGURES THE SOURCES ACTUALLY STATE — any number in the draft attributed to a
source must match one of these:
${allowedFigures || "(none)"}

AUTOMATED LINK CHECK ALREADY RUN
- URLs checked: ${linkCheck.checked}
- Cited but not in the ledger: ${linkCheck.unsourced.join(", ") || "none"}
- Did not resolve: ${linkCheck.unreachable.map((u) => `${u.url} (${u.status ?? "no response"})`).join(", ") || "none"}
Treat anything listed there as a confirmed blocker and restate it as a finding.

RISK NOTES FROM RESEARCH
${research.riskNotes.map((r) => `- ${r}`).join("\n") || "- none"}

---

DRAFT UNDER REVIEW

HEADLINE: ${draft.headline}
${draft.dateline ? `DATELINE: ${draft.dateline}\n` : ""}
BODY:
${draft.body}

FAQS:
${draft.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}

TAGS: ${draft.tags.join(", ")}

---

Return JSON:
{
  "verdict": "pass | revise | reject",
  "scores": {
    "styleMatch": 0-100,
    "sourcing": 0-100,
    "structure": 0-100,
    "seo": 0-100,
    "compliance": 0-100
  },
  "findings": [
    {
      "severity": "blocker | major | minor",
      "category": "style | sourcing | structure | compliance | seo | accuracy",
      "detail": "what is wrong, quoting the specific text",
      "fix": "the concrete change the writer should make"
    }
  ],
  "summary": "two or three sentences a human editor could act on"
}`;

  const r = await callGpt({
    model: MODELS.reviewer,
    system: SYSTEM,
    user,
    maxTokens: 4000,
    json: true,
    context: { ...input.ctx, stage: "reviewer" },
  });

  const review = JSON.parse(r.text) as ReviewResult;
  review.findings = review.findings || [];

  return { review, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
}


const BLOG_SYSTEM = `You are the editor of Coinpresso's own blog. You did not
write this draft. Judge whether it is good enough to sit on the agency's own
domain, where the reader is a founder deciding whether to hire them.

The bar here is HIGHER than for wire PR, not lower. A weak wire release is a
wasted placement; a weak post on your own domain is evidence you cannot do the
thing you are selling — and at five to eight posts a day, a run of thin ones is
the exact pattern that gets a domain demoted.

SEVERITY
- blocker: a fabricated or unsourced citation, an invented statistic, a claimed
  client result that the brief does not support, a guaranteed outcome, or a post
  containing NOTHING original — no named example, no figure, no stated
  limitation, no argued position. That last one is a blocker, not a nitpick.
- major: reads as generic agency marketing; the direct answer is buried; no
  internal link to the pillar; banned vocabulary; the format asked for is not
  the format delivered; a claim that fails "compared to what, by how much,
  says who?"; reads as AI-derived — a sentence opening on "Separately",
  "Furthermore", "Additionally" or "Moreover", or a piece with no bold line
  and no metaphor anywhere in it where the house voice demands several; no
  scene-setting introduction before the first H2; fewer than 3 internal or 3
  external links, or every internal link bunched into the final section; three
  or more citations in one paragraph.
- minor: rhythm, a heading that could be sharper, a list that should be prose.

Any blocker means "revise". Three or more majors means "revise".

Return ONLY a JSON object.`;

async function reviewBlog(input: ReviewerInput): Promise<{
  review: ReviewResult;
  tokensIn: number;
  tokensOut: number;
}> {
  const { brief, research, draft, linkCheck } = input;
  const type = brief.contentType
    ? CONTENT_TYPES[brief.contentType as keyof typeof CONTENT_TYPES]
    : undefined;
  const feedback = input.ctx?.clientRef
    ? feedbackBlock(await readFeedback(input.ctx.clientRef), "reviewer")
    : "";

  const user = `${BLOG_STYLE}

---

${BLOG_PLAYBOOK}
${feedback ? `\n---\n\n${feedback}\n` : ""}
---

FORMAT ASKED FOR: ${type ? `${type.name} — ${type.shape} Target ${type.words[0]}-${type.words[1]} words (draft is ${draft.wordCount}).` : "Guide."}
PRIMARY KEYWORD: ${research.primaryKeyword} — must appear in the H1, the opening, at least one H2 and an FAQ.
THE READER'S QUESTION: ${research.buyerQuestion ?? "not supplied"}

ORIGINALITY — the draft must contain at least one of these, and you must name
which one it contains or report that it contains none:
${(research.proofPoints ?? []).map((p) => `- ${p}`).join("\n") || "- the brief supplied none, so the writer was told to write around the gap honestly. Check that it did rather than inventing."}

THE ONLY URLS THIS POST MAY CITE:
${research.sources.map((x) => `${x.id}: ${x.url}`).join("\n") || "(none)"}

AUTOMATED LINK CHECK ALREADY RUN
- checked: ${linkCheck.checked}
- cited but not in the ledger: ${linkCheck.unsourced.join(", ") || "none"}
- did not resolve: ${linkCheck.unreachable.map((u) => `${u.url} (${u.status ?? "no response"})`).join(", ") || "none"}
Anything listed there is a confirmed blocker — restate it as a finding.

RISK NOTES FROM RESEARCH
${research.riskNotes.map((r) => `- ${r}`).join("\n") || "- none"}

---

DRAFT UNDER REVIEW

H1: ${draft.headline}

${draft.body}

FAQS:
${draft.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}

---

Return JSON:
{
  "verdict": "pass | revise | reject",
  "scores": { "styleMatch": 0-100, "sourcing": 0-100, "structure": 0-100, "seo": 0-100, "compliance": 0-100 },
  "findings": [{ "severity": "blocker | major | minor", "category": "style | sourcing | structure | compliance | seo | accuracy", "detail": "quote the specific text", "fix": "the concrete change" }],
  "summary": "two or three sentences an editor could act on"
}`;

  const r = await callGpt({
    model: MODELS.reviewer,
    system: BLOG_SYSTEM,
    user,
    maxTokens: 4000,
    json: true,
    context: { ...input.ctx, stage: "reviewer" },
  });

  const review = JSON.parse(r.text) as ReviewResult;
  review.findings = review.findings || [];
  return { review, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
}
