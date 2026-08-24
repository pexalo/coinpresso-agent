// ---------------------------------------------------------------------------
// Ideas agent.
//
// The other agents answer "write this". This one answers "what should we write?"
// — the job Liam currently does in his head every morning.
//
// It reads three things nobody else in the system reads together: what we have
// already published (so it does not propose the fifth Bitcoin piece this week),
// what the competition is hanging its releases on (so it can find the angle
// nobody has taken), and the live market (so the proposal has a real hook rather
// than an evergreen one).
//
// The output is a list of BRIEFS, not articles. Each one drops straight into the
// queue in the shape the writer already expects, which is what makes "generate
// twenty" a single click rather than twenty forms.
// ---------------------------------------------------------------------------

import { callClaude, extractJson } from "../providers/anthropic";
import { MODELS } from "../models";
import { PUBLICATION_LIST } from "../publications";
import { competitorWork, ownWork } from "../archive-store";
import type { PublicationId } from "../types";

export interface Idea {
  id: string;
  title: string;
  keywords: string[];
  publication: PublicationId;
  angle: string;
  /** Why this, now — the hook the strategy agent will go and verify. */
  rationale: string;
  /** What makes it different from what we have already run. */
  differentiator: string;
  /** The agent's own read on how strong this is. */
  confidence: "high" | "medium" | "speculative";
}

const SYSTEM = `You are the content strategist for a crypto PR programme. You do
not write articles. You decide what is worth writing.

You are given everything the programme has already published, everything the
competition has published, and the campaign's current state. Propose the next
batch of releases.

WHAT MAKES A GOOD PROPOSAL

1. A high-volume search phrase people are actually typing. "Ethereum Price
   Prediction", "Best Crypto To Buy Now", "Crypto News Today", "Next Crypto To
   Explode", an asset name plus "price prediction".
2. A hook that will still be true this week. You do not have live market data —
   the research agent verifies later — so propose hooks that are checkable, and
   say so in the rationale rather than asserting a price.
3. Something genuinely NOT already covered. This is the hard constraint. The
   programme has run the same handful of angles into the ground; your value is
   finding what has been missed.

WHERE THE GAPS USUALLY ARE
- Assets never featured, or not featured for weeks
- Keywords with high intent that the archive shows zero or one use of
- Narratives the competition is running that we have no answer to
- Structural variety: if everything recent is a single-asset attachment, propose
  comparisons and listicles, and the reverse
- Wires that have been under-used relative to the others

RULES
- Never propose a title that repeats a construction already in the archive. If
  six recent titles open "Crypto News:", yours does not.
- Never propose the same featured asset twice in one batch.
- Spread the batch across wires; do not send eight to OpenPR.
- Be honest in \`confidence\`. "speculative" is a legitimate answer for an idea
  that depends on a market move that may not happen.
- \`differentiator\` must name the specific thing in the archive this avoids.

Return ONLY a JSON object: { "ideas": [ ... ] }`;

export interface IdeaRequest {
  campaignId: string;
  campaignName: string;
  ticker: string;
  count: number;
  /** Optional steer from the operator. */
  steer?: string;
}

export async function runIdeas(req: IdeaRequest): Promise<{
  ideas: Idea[];
  tokensIn: number;
  tokensOut: number;
}> {
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

  const user = `Today is ${today}.

CAMPAIGN: ${req.campaignName} ${req.ticker}
Propose ${req.count} releases.
${req.steer ? `\nOPERATOR STEER — weight the batch toward this: ${req.steer}\n` : ""}

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
    : "- nothing imported yet. Say so in your rationale where a competitor read would have changed the proposal."
}

---

Return JSON:
{
  "ideas": [
    {
      "title": "the headline, written as it would publish",
      "keywords": ["primary first", "secondary"],
      "publication": "one of the wire ids above",
      "angle": "the asset or narrative this hangs on",
      "rationale": "why this, now — and what the research agent needs to verify",
      "differentiator": "the specific thing in the archive this avoids repeating",
      "confidence": "high | medium | speculative"
    }
  ]
}`;

  const r = await callClaude({
    model: MODELS.strategy,
    system: SYSTEM,
    user,
    maxTokens: 8000,
    temperature: 0.8,
  });

  const parsed = extractJson<{ ideas: Omit<Idea, "id">[] }>(r.text);
  const ideas: Idea[] = (parsed.ideas ?? []).map((i, n) => ({
    ...i,
    id: `idea_${Date.now()}_${n}`,
    keywords: i.keywords ?? [],
  }));

  return { ideas, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
}

/** Mock ideas so the page is explorable without keys. */
export async function mockIdeas(req: IdeaRequest): Promise<Idea[]> {
  await new Promise((r) => setTimeout(r, 1500));
  const gaps = [
    ["Ethereum Price Prediction: Can ETH Reclaim $3,000 Before The Next Halving Cycle?", "ethereum price prediction", "Ethereum", "streetinsider"],
    ["Best AI Crypto To Buy Now: Where Moonberg Sits Against The Established AI Tokens", "best ai crypto", "AI sector", "techbullion"],
    ["Litecoin Price Prediction: The Quietest Large-Cap Move Of The Quarter", "litecoin price prediction", "Litecoin", "openpr"],
    ["Crypto Presale Guide 2026: What Separates A Product From A Promise", "best crypto presale", "Educational", "ventureburn"],
    ["BNB Price Prediction As Exchange Tokens Diverge From The Majors", "bnb price prediction", "BNB", "globenewswire"],
    ["Avalanche Price Prediction: Subnet Growth Against A Flat Token", "avalanche price prediction", "Avalanche", "coingabbar"],
    ["Next Crypto To Explode: Four Assets Nobody Is Writing About", "next crypto to explode", "Multi-asset", "captainaltcoin"],
    ["Chainlink Price Prediction After The Oracle Volume Record", "chainlink price prediction", "Chainlink", "financefeeds"],
  ];
  return Array.from({ length: Math.min(req.count, gaps.length * 3) }, (_, n) => {
    const [title, kw, angle, pub] = gaps[n % gaps.length];
    return {
      id: `idea_mock_${n}`,
      title: n < gaps.length ? title : `${title} (variant ${Math.floor(n / gaps.length) + 1})`,
      keywords: [kw, "new crypto presale"],
      publication: pub as PublicationId,
      angle,
      rationale:
        "Mock idea — no archive analysis or market check was performed. Add model keys for real proposals.",
      differentiator: "Mock run.",
      confidence: "speculative" as const,
    };
  });
}
