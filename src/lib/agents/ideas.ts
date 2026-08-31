// ---------------------------------------------------------------------------
// Ideation — the strategy agent, run in scan mode.
//
// The other agents answer "write this". This one answers "what should we write?"
// — the job Liam currently does in his head every morning.
//
// WHY THIS IS THE STRATEGY AGENT AND NOT A SEPARATE ONE.
//
// This used to propose titles with no web search at all. Its own prompt said so:
// "you do not have live market data — the research agent verifies later". That
// is backwards for parasitic newsjacking, where the entire product is attaching
// to something that is moving RIGHT NOW. Proposing blind produced titles like
// "Can ETH Reclaim $3,000?" with no idea whether ETH was near $3,000, and the
// research agent would then discover the premise was wrong — after the title was
// fixed and handed to a writer told to use it or a close variant. A title chosen
// blind constrains a piece researched afterwards.
//
// So ideation now runs the same model, with the same search tool, as the
// research stage. It scans the market first and proposes from what it actually
// found.
//
// TWO LAYERS, because they are different decisions.
//
//   A TOPIC is a real, dated thing that happened, with sources. "XRP ETF
//   decision window opens" is a topic. It either exists or it does not, and the
//   agent has to show the URL.
//
//   A TITLE is one angle on a topic, aimed at one keyword and one wire. Several
//   titles hang off one topic, which is exactly how this programme works — the
//   same catalyst gets run at four publications from four angles.
//
// Separating them makes the weak link visible. A thin topic with three clever
// titles on it is three bad articles, and a list of flat titles hides that;
// grouped under their hook, it is obvious at a glance.
// ---------------------------------------------------------------------------

import { billed, callClaude, extractJson } from "../providers/anthropic";
import { MODELS } from "../models";
import { PUBLICATION_LIST } from "../publications";
import { competitorWork, ownWork } from "../archive-store";
import type { PublicationId } from "../types";

export interface Idea {
  id: string;
  /** The topic this hangs off. */
  topicId?: string;
  title: string;
  keywords: string[];
  publication: PublicationId;
  angle: string;
  /** Why this, now — grounded in the topic's hook. */
  rationale: string;
  /** What makes it different from what we have already run. */
  differentiator: string;
  /** The agent's own read on how strong this is. */
  confidence: "high" | "medium" | "speculative";
}

export interface Topic {
  id: string;
  /** The narrative in a few words. */
  theme: string;
  /** The asset or sector it hangs on. */
  asset: string;
  /** What actually happened — the thing the agent found. */
  hook: string;
  /** When it happened. A hook with no date is not a hook. */
  hookDate: string;
  /** Why a reader cares this week. */
  whyNow: string;
  /** Real URLs the agent retrieved. Empty is a red flag, and shown as one. */
  sourceUrls: string[];
  /**
   * The agent's own read on the catalyst, not the titles. A strong topic with
   * weak titles is fixable; weak topic, strong titles is not.
   */
  strength: "strong" | "moderate" | "thin";
  ideas: Idea[];
}

const SYSTEM = `You are the strategy agent for a crypto PR programme, running in
IDEATION mode. You are not writing an article and you are not producing a full
research brief. You are deciding what is worth writing this week.

You have web search. USE IT. Every topic you propose must rest on something you
actually found, with the URL, not on what you remember about the market.

WORK IN TWO LAYERS.

1. TOPICS — real, dated catalysts. A price move with a figure, a listing, an ETF
   filing or decision, an exploit, an upgrade, a regulatory event, an unusual
   on-chain flow. For each one you must give the date and at least one URL you
   retrieved. If you cannot find the URL, the topic does not go in the list.

2. TITLES — angles on those topics. Several titles may hang off one topic; that
   is normal for this programme, where one catalyst is run at several
   publications from different angles. Each title targets one high-intent search
   phrase and one wire.

WHAT MAKES A GOOD TOPIC
- It happened in roughly the last seven days, or it is a dated event in the next
  fortnight that people are already searching for.
- It involves an asset with real search volume. Obscure tokens have no demand to
  borrow.
- It gives a genuine reason to mention an early-stage presale as a contrast, not
  a non sequitur.

WHAT MAKES A GOOD TITLE
- A phrase people actually type: an asset name plus "price prediction", "best
  crypto to buy now", "crypto news today", "next crypto to explode".
- A claim the research stage will be able to support. Do not put a number in a
  title unless you found that number.
- Structurally different from what the archive already contains.

HARD RULES
- Never invent a URL, a date or a figure. An unsourced topic is worse than a
  short list.
- Never propose a title whose construction already appears in the archive. If
  six recent titles open "Crypto News:", yours does not.
- Never propose the same featured asset twice unless the topics are genuinely
  different events.
- Spread the titles across wires; do not send eight to OpenPR.
- Be honest in \`strength\` and \`confidence\`. "thin" and "speculative" are useful
  answers. A confident list of weak ideas wastes a day of production.
- \`differentiator\` must name the specific thing in the archive it avoids.

Return ONLY a JSON object: { "topics": [ ... ] }`;

export interface IdeaRequest {
  campaignId: string;
  campaignName: string;
  ticker: string;
  /** How many TITLES to aim for in total, across all topics. */
  count: number;
  /** Optional steer from the operator. */
  steer?: string;
}

export interface IdeaResult {
  topics: Topic[];
  /** Flattened, for the batch endpoint and anything that wants a plain list. */
  ideas: Idea[];
  searchUrls: string[];
  searchRequests: number;
  tokensIn: number;
  tokensOut: number;
}

export async function runIdeas(req: IdeaRequest): Promise<IdeaResult> {
  const own = await ownWork(req.campaignId);
  const rivals = await competitorWork(req.campaignId);

  const angleCount = new Map<string, number>();
  const keywordCount = new Map<string, { n: number; last: string }>();
  own.forEach((a) => {
    angleCount.set(a.angle, (angleCount.get(a.angle) ?? 0) + 1);
    a.keywords.forEach((k) => {
      const key = k.toLowerCase();
      const seen = keywordCount.get(key);
      if (seen) {
        seen.n++;
        if (a.publishedAt > seen.last) seen.last = a.publishedAt;
      } else keywordCount.set(key, { n: 1, last: a.publishedAt });
    });
  });

  const wireCount = new Map<string, number>();
  own.forEach((a) =>
    wireCount.set(String(a.publication), (wireCount.get(String(a.publication)) ?? 0) + 1)
  );

  const today = new Date().toISOString().slice(0, 10);
  // Roughly how many titles per topic, so the model spreads rather than putting
  // eight angles on one catalyst.
  const topicTarget = Math.max(2, Math.ceil(req.count / 2.5));

  const user = `Today is ${today}.

CAMPAIGN: ${req.campaignName} ${req.ticker}

Search the market, then propose about ${topicTarget} topics carrying ${req.count}
titles between them.
${req.steer ? `\nOPERATOR STEER — weight the scan toward this: ${req.steer}\n` : ""}
SEARCH FOR, AT MINIMUM
- What the major assets have done in the last seven days, with figures
- Any ETF, listing, regulatory or macro event dated in the last week or the next fortnight
- Anything unusual: an exploit, an upgrade, an outsized on-chain flow
- What the crypto press is leading on today

WIRES AVAILABLE (id — house shape):
${PUBLICATION_LIST.map((p) => `- ${p.id} — ${p.structure}, ${p.wordTarget[0]}-${p.wordTarget[1]} words. Used ${wireCount.get(p.id) ?? 0}× so far.`).join("\n")}

--- WHAT WE HAVE ALREADY PUBLISHED (${own.length} releases) ---

Angles, most-worked first:
${[...angleCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}×`).join("\n") || "- none"}

Keywords already used:
${[...keywordCount.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `- ${k}: ${v.n}×, last ${v.last}`).join("\n") || "- none"}

Recent titles (newest first):
${own.slice(0, 40).map((a) => `- ${a.publishedAt} · ${a.publication} · ${a.title}`).join("\n") || "- none"}

--- WHAT THE COMPETITION IS RUNNING (${rivals.length} pieces) ---
${
  rivals.length
    ? rivals
        .slice(0, 30)
        .map(
          (a) =>
            `- ${a.publishedAt} · ${a.competitor ?? "competitor"} · ${a.title}`
        )
        .join("\n")
    : "- nothing imported yet. Say so in the rationale where a competitor read would have changed the proposal."
}

---

Return JSON:
{
  "topics": [
    {
      "theme": "the narrative in a few words",
      "asset": "the asset or sector this hangs on",
      "hook": "what actually happened, with the figure",
      "hookDate": "YYYY-MM-DD",
      "whyNow": "why a reader cares this week",
      "sourceUrls": ["https://exact.url/you/retrieved"],
      "strength": "strong | moderate | thin",
      "ideas": [
        {
          "title": "the headline, written as it would publish",
          "keywords": ["primary first", "secondary"],
          "publication": "one of the wire ids above",
          "angle": "the asset or narrative this hangs on",
          "rationale": "why this angle on this topic, and what research must still verify",
          "differentiator": "the specific thing in the archive this avoids repeating",
          "confidence": "high | medium | speculative"
        }
      ]
    }
  ]
}`;

  // Derived from the ask. A flat 12000 was the length a runaway reply got to
  // run before being cut off and billed, not a budget it spent only if needed.
  const ceiling = Math.min(1500 + 700 * req.count, 12000);

  const r = await callClaude({
    model: MODELS.strategy,
    system: SYSTEM,
    user,
    maxTokens: ceiling,
    webSearch: true,
    // Lower than the old blind version. When the model is working from real
    // search results, temperature buys variety in the angles rather than in the
    // facts — and variety in the facts is the failure mode here.
    temperature: 0.6,
  });

  let parsed: {
    topics: Array<Omit<Topic, "id" | "ideas"> & { ideas: Omit<Idea, "id">[] }>;
  };
  try {
    parsed = extractJson(r.text, {
      stage: "ideas scan",
      stopReason: r.stopReason,
      blockTypes: r.blockTypes,
      tokensOut: r.tokensOut,
      maxTokens: ceiling,
    });
  } catch (e) {
    // This is the most expensive call in the system — a dozen billable searches
    // on top of the tokens. Losing its cost because the JSON came back short is
    // how the ledger and the real bill part company.
    throw billed(e, {
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      searchRequests: r.searchRequests ?? 0,
    });
  }

  const stamp = Date.now();
  const topics: Topic[] = (parsed.topics ?? []).map((t, n) => {
    const id = `topic_${stamp}_${n}`;
    return {
      ...t,
      id,
      sourceUrls: t.sourceUrls ?? [],
      ideas: (t.ideas ?? []).map((i, m) => ({
        ...i,
        id: `idea_${stamp}_${n}_${m}`,
        topicId: id,
        keywords: i.keywords ?? [],
      })),
    };
  });

  return {
    topics,
    ideas: topics.flatMap((t) => t.ideas),
    searchUrls: r.searchUrls,
    searchRequests: r.searchRequests,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
  };
}

/**
 * Mock topics so the page is explorable without keys.
 *
 * Every hook here is explicitly fictional and every topic is marked thin. A mock
 * that looked like a real market scan would be the most misleading thing in the
 * app — someone would run a batch off it.
 */
export async function mockIdeas(req: IdeaRequest): Promise<IdeaResult> {
  await new Promise((r) => setTimeout(r, 1600));

  const seeds: Array<{
    theme: string;
    asset: string;
    titles: Array<[string, string, PublicationId]>;
  }> = [
    {
      theme: "Ethereum staking milestone",
      asset: "Ethereum",
      titles: [
        ["Ethereum Price Prediction: Can ETH Convert Record Staking Into A Move?", "ethereum price prediction", "streetinsider"],
        ["Best Crypto To Buy Now As Ethereum Staking Hits A Record", "best crypto to buy now", "techbullion"],
      ],
    },
    {
      theme: "XRP ETF decision window",
      asset: "XRP",
      titles: [
        ["XRP Price Prediction Ahead Of The ETF Decision Window", "xrp price prediction", "globenewswire"],
        ["XRP News: What The ETF Calendar Means For Holders", "xrp news", "openpr"],
      ],
    },
    {
      theme: "Solana network throughput record",
      asset: "Solana",
      titles: [
        ["Solana Price Prediction: Throughput Records Against A Flat Token", "solana price prediction", "coingabbar"],
        ["Next Crypto To Explode: Solana, And What Sits Earlier In The Cycle", "next crypto to explode", "ventureburn"],
      ],
    },
    {
      theme: "Presale sector rotation",
      asset: "Multi-asset",
      titles: [
        ["Best Crypto Presales 2026: What Separates A Product From A Promise", "best crypto presale", "captainaltcoin"],
        ["Crypto News Today: Where Capital Is Rotating In The Presale Market", "crypto news today", "financefeeds"],
      ],
    },
  ];

  const stamp = Date.now();
  const wanted = Math.max(1, req.count);
  const topics: Topic[] = [];
  let used = 0;

  for (let n = 0; n < seeds.length && used < wanted; n++) {
    const s = seeds[n];
    const id = `topic_mock_${stamp}_${n}`;
    const take = s.titles.slice(0, Math.max(1, Math.min(s.titles.length, wanted - used)));
    used += take.length;
    topics.push({
      id,
      theme: s.theme,
      asset: s.asset,
      hook: "MOCK — no search was performed and this event has not been verified to have happened.",
      hookDate: new Date().toISOString().slice(0, 10),
      whyNow: "Mock run. Add model keys for a real market scan.",
      sourceUrls: [],
      strength: "thin",
      ideas: take.map(([title, kw, pub], m) => ({
        id: `idea_mock_${stamp}_${n}_${m}`,
        topicId: id,
        title,
        keywords: [kw, "new crypto presale"],
        publication: pub,
        angle: s.asset,
        rationale:
          "Mock idea — no market scan and no archive check was performed.",
        differentiator: "Mock run.",
        confidence: "speculative" as const,
      })),
    });
  }

  return {
    topics,
    ideas: topics.flatMap((t) => t.ideas),
    searchUrls: [],
    searchRequests: 0,
    tokensIn: 0,
    tokensOut: 0,
  };
}
