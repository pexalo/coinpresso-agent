// ---------------------------------------------------------------------------
// Strategy agent.
//
// Takes Liam's title, keywords and wire. Researches the market with live web
// search and returns a structured brief the writer can work from without ever
// needing to invent a fact. Every downstream guarantee about sourcing rests on
// this stage producing a real, verifiable ledger.
// ---------------------------------------------------------------------------

import { callClaude, extractJson } from "../providers/anthropic";
import { MODELS } from "../models";
import { PUBLICATIONS } from "../publications";
import type { Brief, ResearchBrief } from "../types";
import { CONTENT_TYPES, PILLARS } from "../blog";

const SYSTEM = `You are the strategy and research agent for Coinpresso's Moonberg
crypto PR programme. You do not write articles. You produce the research brief a
writer will work from.

Your output is the factual floor of the finished piece. The writer is instructed
never to introduce a source, figure or URL you did not supply, so anything missing
here simply cannot appear in the article. Completeness matters more than brevity.

RULES

1. Use web search. Do not answer from memory. Prices, forecasts and news move.
2. Every source you list must be a real page you actually retrieved, with the
   exact URL. Never construct, guess or pattern-match a URL. If you cannot
   retrieve a source, omit it rather than approximating it.
3. Find at least TWO independent third-party price predictions for the featured
   asset, from named publishers or named analysts. Prefer a spread: at least one
   bullish and one cautious. A brief carrying only bull cases produces an article
   that reads as advertising.
4. Find a real, dated news catalyst from within roughly the last seven days. This
   is what gives the article editorial justification. If nothing recent exists,
   say so in riskNotes rather than inventing an event.
5. Record the figures each source actually states, verbatim, in the figures array.
   The reviewer checks the writer's numbers against these.
6. For Moonberg's presale state, use only what the operator supplied or what you
   can verify on moonberg.com. If neither, set the fields to "unverified" and add
   a riskNote. Never carry a figure over from an older article.
7. Flag anything that would make a claim unsafe to publish in riskNotes.

Return ONLY a JSON object matching the schema given. No prose around it.`;

function schemaBlock(): string {
  return `{
  "featuredAsset": "e.g. Solana (SOL)",
  "primaryKeyword": "the single highest-intent keyword",
  "secondaryKeywords": ["..."],
  "newsCatalyst": {
    "headline": "...",
    "date": "YYYY-MM-DD",
    "summary": "2-3 sentences on what happened and why it matters",
    "sourceId": "s1 | null"
  },
  "marketContext": "current price, recent move, technical levels, sentiment — with figures",
  "predictions": [
    {
      "sourceId": "s1",
      "target": "$500",
      "horizon": "end of 2027",
      "stance": "bullish | cautious | bearish | neutral",
      "summary": "what the source actually argues"
    }
  ],
  "opportunityGap": "why a reader looking at this asset would also look earlier in the cycle",
  "moonbergAngle": "the specific bridge from this news to Moonberg — must be a real logical link, not a non sequitur",
  "presaleState": { "raised": "...", "stage": "...", "note": "verified | unverified and why" },
  "comparisonAssets": ["assets or competing presales worth contrasting"],
  "structureVariant": "single_asset | listicle",
  "suggestedHeadings": ["5-7 H2s following the framework"],
  "faqCandidates": ["question-shaped, search-friendly"],
  "riskNotes": ["anything unverifiable, contradictory or unsafe to state"],
  "sources": [
    {
      "id": "s1",
      "publisher": "CoinCodex",
      "title": "exact page title",
      "url": "https://exact.url/you/retrieved",
      "claim": "what this source supports in the article",
      "kind": "prediction | news | market_data | onchain | project",
      "figures": ["$500 by 2029", "$104.91 by September 19"]
    }
  ]
}`;
}

const BLOG_SYSTEM = `You are the research agent for Coinpresso's OWN blog. This
is not wire PR for a token — it is the agency's own domain, read by a founder
deciding whether to hire them.

Your output is the factual floor of the post. The writer may not introduce a
source, statistic or URL you did not supply.

RULES

1. Use web search. Do not answer from memory.
2. Every source must be a page you actually retrieved, with the exact URL. Never
   construct or guess one.
3. Find what is ALREADY ranking for this topic and say what it gets wrong or
   leaves out. That gap is the reason to publish.
4. Find the statistics, primary sources and named examples the post can cite.
   A post on this domain that asserts figures without attribution is worse than
   one that omits them.
5. Identify the real buyer question underneath the keyword — what a founder is
   actually worried about, not the search string.
6. Note honestly where Coinpresso would need its own campaign data to make the
   piece genuinely original, and what that data would need to show. Do NOT
   invent it.
7. There are no price predictions and no presale figures on this track. Leave
   those fields empty.

Return ONLY a JSON object matching the schema given.`;

export async function runStrategyBlog(brief: Brief): Promise<{
  research: ResearchBrief;
  tokensIn: number;
  tokensOut: number;
  searchUrls: string[];
}> {
  const today = new Date().toISOString().slice(0, 10);
  const pillar = PILLARS.find((x) => x.id === brief.pillar);
  const type = brief.contentType ? CONTENT_TYPES[brief.contentType as keyof typeof CONTENT_TYPES] : undefined;

  const user = `Today's date is ${today}.

WORKING TITLE: ${brief.title}
TARGET KEYWORDS: ${brief.keywords.join(", ")}
${pillar ? `PILLAR: ${pillar.name} — the post links to ${pillar.hub}\nWhat this buyer is worried about: ${pillar.buyerQuestion}` : ""}
${type ? `FORMAT: ${type.name} — ${type.shape} Target ${type.words[0]}-${type.words[1]} words.` : ""}
${brief.notes ? `\nOPERATOR NOTES: ${brief.notes}` : ""}

Research this and return JSON:
{
  "featuredAsset": "the topic in a few words",
  "primaryKeyword": "...",
  "secondaryKeywords": ["..."],
  "buyerQuestion": "what the reader is actually worried about, in their words",
  "newsCatalyst": { "headline": "why now, or 'evergreen'", "date": "YYYY-MM-DD", "summary": "...", "sourceId": "s1 or null" },
  "marketContext": "what is already ranking for this and what it gets wrong",
  "competingContent": ["url or publisher — and the specific gap it leaves"],
  "predictions": [],
  "opportunityGap": "the reason this post deserves to exist",
  "moonbergAngle": "Coinpresso's specific angle — the experience or position that makes this theirs",
  "proofPoints": ["what would make this genuinely original: a named example, a figure Coinpresso holds, a stated limitation"],
  "internalLinks": ["the pillar hub, plus sibling posts worth linking"],
  "presaleState": { "raised": "n/a", "stage": "n/a", "note": "blog track" },
  "comparisonAssets": ["named alternatives, tools or approaches worth contrasting"],
  "structureVariant": "single_asset",
  "suggestedHeadings": ["question-shaped H2s"],
  "faqCandidates": ["..."],
  "riskNotes": ["anything unverifiable, or where Coinpresso data is needed and absent"],
  "sources": [{ "id": "s1", "publisher": "...", "title": "...", "url": "https://...", "claim": "...", "kind": "news | market_data | project", "figures": ["..."] }]
}`;

  const r = await callClaude({
    model: MODELS.strategy,
    system: BLOG_SYSTEM,
    user,
    maxTokens: 12000,
    webSearch: true,
  });

  const research = extractJson<ResearchBrief>(r.text);
  research.sources = research.sources || [];
  research.predictions = research.predictions || [];
  research.riskNotes = research.riskNotes || [];
  research.suggestedHeadings = research.suggestedHeadings || [];
  research.faqCandidates = research.faqCandidates || [];
  research.comparisonAssets = research.comparisonAssets || [];
  research.secondaryKeywords = research.secondaryKeywords || [];
  research.presaleState = research.presaleState || { raised: "n/a", stage: "n/a", note: "blog track" };

  return { research, tokensIn: r.tokensIn, tokensOut: r.tokensOut, searchUrls: r.searchUrls };
}

export async function runStrategy(brief: Brief): Promise<{
  research: ResearchBrief;
  tokensIn: number;
  tokensOut: number;
  searchUrls: string[];
}> {
  if (brief.track === "blog") return runStrategyBlog(brief);

  const pub = PUBLICATIONS[brief.publication];
  const today = new Date().toISOString().slice(0, 10);

  const user = `Today's date is ${today}.

ARTICLE TITLE (fixed — the writer will use this or a close variant):
${brief.title}

TARGET KEYWORDS: ${brief.keywords.join(", ")}

PUBLICATION: ${pub.name}
Format: ${pub.structure} structure, ${pub.linkStyle} links, ${pub.wordTarget[0]}-${pub.wordTarget[1]} words.
${pub.notes}

MOONBERG PRESALE STATE SUPPLIED BY OPERATOR:
- Raised: ${brief.presaleRaised || "not supplied — verify or mark unverified"}
- Stage: ${brief.presaleStage || "not supplied — verify or mark unverified"}
${brief.notes ? `\nOPERATOR NOTES: ${brief.notes}` : ""}

Research this thoroughly, then return the brief as JSON matching exactly this shape:

${schemaBlock()}`;

  const r = await callClaude({
    model: MODELS.strategy,
    system: SYSTEM,
    user,
    maxTokens: 12000,
    webSearch: true,
  });

  const research = extractJson<ResearchBrief>(r.text);

  // Normalise so downstream code never has to defend against missing arrays.
  research.sources = research.sources || [];
  research.predictions = research.predictions || [];
  research.riskNotes = research.riskNotes || [];
  research.suggestedHeadings = research.suggestedHeadings || [];
  research.faqCandidates = research.faqCandidates || [];
  research.comparisonAssets = research.comparisonAssets || [];
  research.secondaryKeywords = research.secondaryKeywords || [];

  return {
    research,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    searchUrls: r.searchUrls,
  };
}
