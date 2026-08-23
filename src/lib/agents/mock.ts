// ---------------------------------------------------------------------------
// Canned agent responses so the dashboard is fully explorable before any key is
// added. Every shape here matches what the real agents return, so switching
// between mock and live changes nothing downstream.
// ---------------------------------------------------------------------------

import type { Brief, Draft, ResearchBrief, ReviewResult } from "../types";
import { PUBLICATIONS, boilerplateFor } from "../publications";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const title = (s: string) =>
  s.replace(/\b\w/g, (c) => c.toUpperCase());

export async function mockStrategy(brief: Brief): Promise<ResearchBrief> {
  await sleep(1400);
  const asset = brief.keywords[0]?.replace(/price prediction/i, "").trim() || "Solana";
  return {
    featuredAsset: `${asset} (mock)`,
    primaryKeyword: brief.keywords[0] || "crypto news",
    secondaryKeywords: brief.keywords.slice(1),
    newsCatalyst: {
      headline: "Mock catalyst — live search disabled",
      date: new Date().toISOString().slice(0, 10),
      summary:
        "This run executed in mock mode. No web search was performed and no figure below is real. Add ANTHROPIC_API_KEY and OPENAI_API_KEY to .env.local for live research.",
      sourceId: "s1",
    },
    marketContext:
      "Mock market context. In a live run this carries the current price, the recent move, technical levels and sentiment, each with figures pulled from search.",
    predictions: [
      {
        sourceId: "s1",
        target: "$500",
        horizon: "end of 2027",
        stance: "bullish",
        summary: "Mock bullish forecast attributed to a named third party.",
      },
      {
        sourceId: "s2",
        target: "$180",
        horizon: "end of 2026",
        stance: "cautious",
        summary:
          "Mock cautious counter-forecast. The framework requires a spread — a brief carrying only bull cases produces an article that reads as advertising.",
      },
    ],
    opportunityGap:
      "Established assets have already repriced, so a reader looking at them also looks earlier in the cycle.",
    moonbergAngle:
      "Rising on-chain activity increases demand for tools that filter and interpret it — which is what the Moonberg terminal is built around.",
    presaleState: {
      raised: brief.presaleRaised || "unverified",
      stage: brief.presaleStage || "unverified",
      note: "Mock run — no verification performed.",
    },
    comparisonAssets: ["Ethereum", "XRP"],
    structureVariant: PUBLICATIONS[brief.publication].structure === "listicle"
      ? "listicle"
      : "single_asset",
    suggestedHeadings: [
      `${title(brief.keywords[0] || "Market")}: What The Latest Move Means`,
      "What Could Drive The Next Leg Higher",
      "New Crypto Presale Moonberg Reaches Its Next Milestone",
      "Why Moonberg Is Appearing Alongside An Established Asset",
      "Final Thoughts",
    ],
    faqCandidates: [
      `Can ${asset} reach the target discussed?`,
      "What is the new crypto presale Moonberg?",
      "What is $MBX used for?",
    ],
    riskNotes: [
      "MOCK RUN — nothing in this brief is verified. Do not publish output from a mock run.",
    ],
    sources: [
      {
        id: "s1",
        publisher: "Mock Publisher A",
        title: "Mock bullish forecast page",
        url: "https://moonberg.com/tokensale",
        claim: "Bullish price target",
        kind: "prediction",
        figures: ["$500 by end of 2027"],
      },
      {
        id: "s2",
        publisher: "Mock Publisher B",
        title: "Mock cautious forecast page",
        url: "https://moonberg.com",
        claim: "Cautious counter-forecast",
        kind: "prediction",
        figures: ["$180 by end of 2026"],
      },
    ],
  };
}

export async function mockWriter(
  brief: Brief,
  research: ResearchBrief,
  revision: boolean
): Promise<Draft> {
  await sleep(1800);
  const pub = PUBLICATIONS[brief.publication];
  const body = `${pub.dateline ? `${pub.dateline}, ${new Date().toDateString()} (GLOBE NEWSWIRE) -- ` : ""}This is a mock draft generated without any model call, so the dashboard, the review loop and the export path can all be exercised before a key is added.

The framework the live writer works to is intact in the prompt: the market event opens the piece, the featured asset is established across the next two paragraphs, and Moonberg arrives as the early-stage counterpoint rather than the premise.

Moonberg is approaching the same market from a different angle. Its presale is centred on an AI-native crypto trading terminal built to research markets, analyse on-chain activity and automate strategies.

https://moonberg.com/tokensale

## ${research.suggestedHeadings[0] || "Market Context"}

${research.marketContext}

## ${research.suggestedHeadings[1] || "What Could Drive The Next Move"}

${research.predictions.map((p) => `A ${p.stance} scenario places the asset at ${p.target} by ${p.horizon}. ${p.summary}`).join("\n\n")}

## ${research.suggestedHeadings[2] || "Moonberg Presale"}

${research.moonbergAngle}

Presale state as supplied: raised ${research.presaleState.raised}, stage ${research.presaleState.stage}.

## Final Thoughts

${research.opportunityGap}

${revision ? "\n_This draft is a revision pass — the reviewer's findings were applied._\n" : ""}
${boilerplateFor(pub)}`;

  return {
    headline: brief.title,
    dateline: pub.dateline ? `${pub.dateline}, ${new Date().toDateString()} (GLOBE NEWSWIRE) --` : null,
    body,
    faqs: research.faqCandidates.slice(0, pub.faqCount[0]).map((q) => ({
      q,
      a: "Mock answer. In a live run this restates the sourced position in a search-friendly form.",
    })),
    tags: [...brief.keywords, "Moonberg", "$MBX", "Crypto Presale"],
    wordCount: body.split(/\s+/).filter(Boolean).length,
  };
}

export async function mockReviewer(revision: boolean): Promise<ReviewResult> {
  await sleep(1200);
  if (revision) {
    return {
      verdict: "pass",
      scores: { styleMatch: 88, sourcing: 92, structure: 90, seo: 86, compliance: 95 },
      findings: [
        {
          severity: "minor",
          category: "style",
          detail: "Two consecutive paragraphs open with the same construction.",
          fix: "Vary the opening of the second.",
        },
      ],
      summary:
        "Mock review, revision pass. The earlier findings were applied and the draft now matches the house shape.",
    };
  }
  return {
    verdict: "revise",
    scores: { styleMatch: 71, sourcing: 80, structure: 68, seo: 74, compliance: 85 },
    findings: [
      {
        severity: "major",
        category: "structure",
        detail:
          "The prediction section arrives immediately after the opening paragraph.",
        fix:
          "Add a paragraph establishing why the featured asset matters right now, and a second positioning Moonberg as a different angle, before the prediction section.",
      },
      {
        severity: "major",
        category: "sourcing",
        detail: "Only the bullish forecast is presented.",
        fix: "Introduce the cautious counter-forecast from the second source and state the divergence explicitly.",
      },
    ],
    summary:
      "Mock review, first pass. Deliberately returns findings so the revision loop is visible in the dashboard.",
  };
}
