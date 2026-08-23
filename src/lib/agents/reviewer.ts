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
  const pub = PUBLICATIONS[brief.publication];
  const s = LIAM_STYLE_PROFILE;

  const allowedUrls = research.sources.map((x) => `${x.id}: ${x.url}`).join("\n");
  const allowedFigures = research.sources
    .flatMap((x) => (x.figures || []).map((f) => `${x.publisher}: ${f}`))
    .join("\n");

  const user = `HOUSE STYLE THIS MUST MATCH

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
  });

  const review = JSON.parse(r.text) as ReviewResult;
  review.findings = review.findings || [];

  return { review, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
}
