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

export async function runStrategy(brief: Brief): Promise<{
  research: ResearchBrief;
  tokensIn: number;
  tokensOut: number;
  searchUrls: string[];
}> {
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
