// ---------------------------------------------------------------------------
// The published archive.
//
// Seeded from Liam's Moonberg content calendar. Its job is not to be a nice list
// — it is the memory the agents lack. Sixty near-identical releases in three
// weeks is the real risk in this programme, and a reviewer judging one article in
// isolation cannot see it. Feeding recent titles, keywords and structures into
// the writer and the reviewer is what turns "is this a good article?" into "is
// this a good article GIVEN the twenty before it?".
//
// It also answers the question nobody can currently answer: which keywords have
// we already hit, how often, and on which wire.
// ---------------------------------------------------------------------------

import type { PublicationId } from "./types";

export interface PublishedArticle {
  /** Our own work, or a competitor piece kept as market intelligence. */
  kind?: "own" | "competitor";
  /** For competitor rows: whose it is. */
  competitor?: string;
  publishedAt: string;
  publication: PublicationId | string;
  title: string;
  keywords: string[];
  url?: string;
  /** Which asset the piece was hung on — used to spot a narrative being reused. */
  angle: string;
}

/**
 * Aug 2026 Moonberg campaign. `angle` is derived from the headline: the featured
 * asset or the narrative the piece attaches Moonberg to.
 */
export const MOONBERG_ARCHIVE: PublishedArticle[] = [
  { publishedAt: "2026-08-10", publication: "openpr", title: "XRP Price Prediction Turns Bearish As Moonberg Prepares $MBX Crypto Presale Launch", keywords: ["xrp price prediction", "crypto presale"], angle: "XRP", url: "https://www.openpr.com/news/4599983/xrp-price-prediction-under-1-as-moonberg-prepares-mbx-crypto" },
  { publishedAt: "2026-08-10", publication: "coingabbar", title: "Moonberg Crypto Presale Launch Imminent: Is $MBX The Best Crypto To Buy Now?", keywords: ["best crypto to buy now", "crypto presale"], angle: "Presale launch" },
  { publishedAt: "2026-08-10", publication: "streetinsider", title: "Solana Price Prediction Faces Resistance as Moonberg Crypto Presale Announces Launch", keywords: ["solana price prediction", "crypto presale"], angle: "Solana" },
  { publishedAt: "2026-08-11", publication: "openpr", title: "Pi Network Price Prediction Eyes $0.10 While Moonberg Crypto Presale Goes Live", keywords: ["pi network price prediction", "crypto presale"], angle: "Pi Network" },
  { publishedAt: "2026-08-11", publication: "techbullion", title: "Dogecoin Price Prediction: $DOGE Struggles To Break $0.07 As Moonberg Crypto Presale Soars", keywords: ["dogecoin price prediction", "crypto presale"], angle: "Dogecoin" },
  { publishedAt: "2026-08-11", publication: "openpr", title: "Best Crypto to Buy Now: Moonberg Presale Surges as XRP and Ethereum Prices Slide", keywords: ["best crypto to buy now", "xrp price", "ethereum price"], angle: "Multi-asset" },
  { publishedAt: "2026-08-11", publication: "streetinsider", title: "XRP ETF News: $1 Price Target and Moonberg Crypto Presale Offers Cheapest Entry", keywords: ["xrp etf news", "crypto presale"], angle: "XRP ETF" },
  { publishedAt: "2026-08-11", publication: "ventureburn", title: "XRP Price Prediction: Can XRP Stop The Rot As Moonberg Crypto Presale Explodes?", keywords: ["xrp price prediction", "crypto presale"], angle: "XRP" },
  { publishedAt: "2026-08-12", publication: "openpr", title: "Crypto News Today: XRP ETF & Price, First Moonberg Crypto Presale Batch Sells Out", keywords: ["crypto news", "crypto presale", "xrp etf"], angle: "XRP ETF" },
  { publishedAt: "2026-08-12", publication: "coingabbar", title: "Cardano Price Prediction Targets $0.25 As Moonberg Crypto Presale Enters Stage 2", keywords: ["cardano price prediction", "crypto presale"], angle: "Cardano" },
  { publishedAt: "2026-08-12", publication: "globenewswire", title: "Crypto News: Moonberg Crypto Presale Sells Out Stage 1 As Bitcoin Price Prediction Faces $65,000 Test", keywords: ["crypto news today", "bitcoin price prediction", "crypto presale"], angle: "Bitcoin" },
  { publishedAt: "2026-08-12", publication: "openpr", title: "Moonberg Emerges As Top Crypto To Buy As New Presale Sells Out Stage 1 In Record Time", keywords: ["new crypto presale", "top crypto to buy"], angle: "Stage 1 sellout" },
  { publishedAt: "2026-08-12", publication: "coingabbar", title: "Next Crypto To Explode: $ETH, $SOL, $XRP Outshone By Moonberg Crypto Presale", keywords: ["next crypto to explode", "crypto presale"], angle: "Multi-asset" },
  { publishedAt: "2026-08-13", publication: "financefeeds", title: "Ethereum Price Prediction: $ETH Staking Hits Record 40 Million But Price Stalls While Moonberg Presale Emerges As 2026 Frontrunner", keywords: ["ethereum price prediction", "crypto presale"], angle: "Ethereum" },
  { publishedAt: "2026-08-13", publication: "openpr", title: "Crypto News: Chainlink Price Prediction to $10 as Moonberg Presale Threatens Pepeto & Alphapepe", keywords: ["crypto news", "chainlink price prediction", "pepeto", "alphapepe"], angle: "Chainlink + competitors" },
  { publishedAt: "2026-08-13", publication: "techbullion", title: "XRP Price Prediction: Will XRP Reach $100 & Why Are Whales Buying The Moonberg Crypto Presale?", keywords: ["xrp price prediction", "will xrp reach 100", "crypto presale"], angle: "XRP" },
  { publishedAt: "2026-08-13", publication: "captainaltcoin", title: "Solana Price Prediction 2026: Will Solana Hit $80 & Moonberg Crypto Presale Raises $375k in 24 Hours", keywords: ["solana price prediction", "crypto presale"], angle: "Solana" },
  { publishedAt: "2026-08-13", publication: "openpr", title: "Best Crypto To Buy Now: Moonberg Crypto Presale, AlphaPepe, Pepeto, Solana", keywords: ["best crypto to buy now", "alphapepe", "pepeto"], angle: "Competitor listicle" },
  { publishedAt: "2026-08-14", publication: "globenewswire", title: "Crypto News Today: Moonberg Crypto Presale Sells Out Stage 1 As Ethereum Price Prediction Targets $2,000", keywords: ["crypto news today", "ethereum price prediction", "crypto presale"], angle: "Ethereum" },
  { publishedAt: "2026-08-14", publication: "openpr", title: "XRP News: XRP Price At $1 As Bridge Exploit Drains 200k XRP, Moonberg Crypto Presale Sells Out Stage One", keywords: ["xrp news", "xrp price", "crypto presale"], angle: "XRP exploit" },
  { publishedAt: "2026-08-14", publication: "openpr", title: "Crypto News: XRP Price Prediction Hit By Exploit, Moonberg Presale Enters Stage 2", keywords: ["crypto news", "xrp price prediction", "crypto presale"], angle: "XRP exploit" },
  { publishedAt: "2026-08-14", publication: "ventureburn", title: "The Best Crypto To Buy Now: SOL, XRP, ETH Versus Moonberg Crypto Presale", keywords: ["best crypto to buy now", "solana price", "xrp price", "ethereum price"], angle: "Multi-asset" },
  { publishedAt: "2026-08-14", publication: "streetinsider", title: "Best Crypto To Buy Now: Stage 1 of Moonberg Crypto Presale Sells Out", keywords: ["best crypto to buy now", "next crypto to explode", "crypto presale"], angle: "Stage 1 sellout" },
  { publishedAt: "2026-08-15", publication: "coingabbar", title: "Best Crypto To Buy Now: Cardano Price Aims For $0.2 and Moonberg Crypto Presale Surges", keywords: ["best crypto to buy now", "cardano price", "crypto presale"], angle: "Cardano" },
  { publishedAt: "2026-08-15", publication: "openpr", title: "Crypto News: Goldman Makes Bitcoin ETF Move and Moonberg Crypto Presale Surges", keywords: ["crypto news", "bitcoin etf", "crypto presale"], angle: "Bitcoin ETF" },
  { publishedAt: "2026-08-15", publication: "streetinsider", title: "Bitcoin Price Prediction Aims For $70,000 As Moonberg Presale Gains Momentum", keywords: ["bitcoin price prediction", "btc price"], angle: "Bitcoin" },
  { publishedAt: "2026-08-15", publication: "openpr", title: "Crypto News: $100 Solana Price Prediction and Moonberg Crypto Presale Enters Stage 2", keywords: ["crypto news", "solana price prediction", "crypto presale"], angle: "Solana" },
  { publishedAt: "2026-08-16", publication: "captainaltcoin", title: "Best Crypto Presales 2026: Moonberg Vs Pepeto and Alphapepe", keywords: ["best crypto presales 2026", "pepeto", "alphapepe"], angle: "Competitor listicle" },
  { publishedAt: "2026-08-17", publication: "globenewswire", title: "Crypto News: Moonberg Sells Out Presale Stage 1 As XRP Price Prediction Targets $5", keywords: ["crypto news", "xrp price prediction", "crypto presale"], angle: "XRP" },
  { publishedAt: "2026-08-17", publication: "techbullion", title: "Best Crypto To Buy Now: Moonberg Crypto Presale Vs SOL and XRP", keywords: ["best crypto to buy now", "solana price", "xrp price"], angle: "Multi-asset" },
  { publishedAt: "2026-08-17", publication: "globenewswire", title: "Crypto News: Moonberg Launches Presale Stage 2 After Record Sellout As BNB Price Prediction Targets $1000", keywords: ["crypto news", "bnb price prediction"], angle: "BNB" },
  { publishedAt: "2026-08-17", publication: "financefeeds", title: "Which Crypto To Buy Now: Moonberg Presale Stage Sells Out As XRP, TRON & DOGE Stay Sideways", keywords: ["which crypto to buy now", "xrp price", "tron price", "doge price"], angle: "Multi-asset" },
  { publishedAt: "2026-08-18", publication: "globenewswire", title: "Crypto News: Bitcoin Price Prediction Drops To $60k as Moonberg Crypto Presale Surges", keywords: ["crypto news", "bitcoin price prediction", "crypto presale"], angle: "Bitcoin" },
  { publishedAt: "2026-08-18", publication: "coingabbar", title: "Solana Price Prediction: SOL Breaks $75 However Whales Keep Buying Moonberg New Crypto Presale", keywords: ["solana price prediction", "new crypto presale"], angle: "Solana" },
  { publishedAt: "2026-08-18", publication: "openpr", title: "Crypto News: New Meme Coin Pepeto Lags Behind Moonberg Presale Momentum", keywords: ["crypto news", "new meme coin", "crypto presale"], angle: "Competitor" },
  { publishedAt: "2026-08-19", publication: "blockchainreporter", title: "Best Crypto To Buy Now: Moonberg Presale Soars, Solana Price Breaks $75, XRP Price Stays At $1", keywords: ["best crypto to buy now", "solana price", "xrp price"], angle: "Multi-asset" },
  { publishedAt: "2026-08-19", publication: "streetinsider", title: "Best Crypto Presales 2026: Moonberg, Pepeto, AlphaPepe, Bullski", keywords: ["best crypto presales 2026", "pepeto", "alphapepe", "bullski"], angle: "Competitor listicle" },
  { publishedAt: "2026-08-19", publication: "globenewswire", title: "Crypto News: Bitcoin Price Prediction at $70k as Moonberg Crypto Presale Surges", keywords: ["crypto news", "bitcoin price prediction", "crypto presale"], angle: "Bitcoin" },
  { publishedAt: "2026-08-19", publication: "openpr", title: "Crypto News: Ethereum Price Prediction at $2,500 and Moonberg's Crypto Presale Hits Second Stage", keywords: ["crypto news", "ethereum price prediction", "crypto presale"], angle: "Ethereum" },
  { publishedAt: "2026-08-19", publication: "openpr", title: "Crypto News: Solana Price Prediction Aims for $100 as Moonberg Presale Smashes First Target", keywords: ["crypto news", "solana price prediction", "crypto presale"], angle: "Solana" },
  { publishedAt: "2026-08-19", publication: "techbullion", title: "PI Network Price Prediction Slumps to $0.09 as Moonberg's Crypto Presale Hits New Milestone", keywords: ["pi network price prediction", "crypto presale"], angle: "Pi Network" },
  { publishedAt: "2026-08-19", publication: "globenewswire", title: "DOGE Price Prediction Drops To $0.07 While Moonberg's Crypto Presale Aims For Stage 3", keywords: ["dogecoin price prediction", "crypto presale"], angle: "Dogecoin" },
  { publishedAt: "2026-08-19", publication: "coingabbar", title: "Moonberg, Solana, Chainlink, or Kaspa: Which Is The Best Crypto To Buy Now?", keywords: ["best crypto to buy now", "solana", "chainlink", "kaspa"], angle: "Multi-asset" },
  { publishedAt: "2026-08-19", publication: "streetinsider", title: "Moonberg Raises $290k In 48 Hours, Securing Place As Top Crypto To Buy in 2026", keywords: ["top crypto to buy"], angle: "Presale milestone" },
  { publishedAt: "2026-08-19", publication: "openpr", title: "Crypto News: Moonberg Crypto Presale Nears Stage 3 As Shiba Inu Price Prediction At 0.0001", keywords: ["crypto news", "shiba inu price prediction"], angle: "Shiba Inu" },
  { publishedAt: "2026-08-19", publication: "ventureburn", title: "Best Crypto To Buy Now For Potential 100x Gains: Moonberg, Shiba Inu, Chainlink, Dogecoin", keywords: ["best crypto to buy now", "shiba inu", "chainlink", "dogecoin"], angle: "Multi-asset" },
  { publishedAt: "2026-08-19", publication: "globenewswire", title: "Crypto News Today: New Crypto Presale Moonberg Nears Stage 3 As Ethereum Price Prediction Targets $5,000", keywords: ["crypto news today", "new crypto presale", "ethereum price prediction"], angle: "Ethereum" },
  { publishedAt: "2026-08-20", publication: "globenewswire", title: "Crypto News: Moonberg Crypto Presale Soars While Bitcoin Price Prediction Eyes $250,000", keywords: ["crypto news", "crypto presale", "bitcoin price prediction"], angle: "Bitcoin" },
  { publishedAt: "2026-08-20", publication: "openpr", title: "Crypto News: Bitcoin Price Prediction Hits $100k as Moonberg's New Crypto Presale Surges", keywords: ["crypto news", "new crypto presale", "bitcoin price prediction"], angle: "Bitcoin" },
  { publishedAt: "2026-08-20", publication: "openpr", title: "Crypto News: XRP Price Prediction Recovers From Slump as Moonberg's AI-Crypto Presale Surges", keywords: ["crypto news", "new crypto presale", "xrp price prediction"], angle: "XRP" },
  { publishedAt: "2026-08-20", publication: "techbullion", title: "Best Crypto Presales 2026: Pepeto, Alphapepe or Moonberg?", keywords: ["best crypto presales 2026", "pepeto", "alphapepe"], angle: "Competitor listicle" },
  { publishedAt: "2026-08-20", publication: "streetinsider", title: "Best Crypto Buy Now as Market Rallies: Pepeto, Alphapepe or Moonberg?", keywords: ["best crypto to buy now", "alphapepe", "pepeto"], angle: "Competitor listicle" },
  { publishedAt: "2026-08-20", publication: "openpr", title: "Crypto News Today: New Crypto Presale Moonberg Nears Stage 2 Sell Out As Solana Price Prediction Targets $1,000", keywords: ["crypto news", "new crypto presale", "solana price prediction"], angle: "Solana" },
  { publishedAt: "2026-08-20", publication: "openpr", title: "Crypto News: New Crypto Presale Moonberg Reaches $290,000 As Ethereum Price Prediction Hits $10,000", keywords: ["crypto news", "new crypto presale", "ethereum price prediction"], angle: "Ethereum" },
  { publishedAt: "2026-08-20", publication: "techbullion", title: "Best Crypto To Buy Now: New Crypto Presale Moonberg, Solana, Ethereum, Kaspa", keywords: ["best crypto to buy now", "new crypto presale", "solana", "ethereum"], angle: "Multi-asset" },
  { publishedAt: "2026-08-20", publication: "globenewswire", title: "Crypto News: New Presale Moonberg Hits $300k As Monero Price Prediction Targets $2,000", keywords: ["crypto news", "new crypto presale", "monero price prediction"], angle: "Monero" },
  { publishedAt: "2026-08-20", publication: "globenewswire", title: "Crypto News Today: New Crypto Presale Moonberg Nears Major Milestone As ZCash Price Prediction Eyes $3,000", keywords: ["crypto news", "new crypto presale", "zcash price prediction"], angle: "ZCash" },
  { publishedAt: "2026-08-21", publication: "streetinsider", title: "New Crypto Presale Moonberg Surpasses $300,000 as Shiba Inu Price Prediction Targets $0.0000054", keywords: ["shiba inu price prediction", "new crypto presale"], angle: "Shiba Inu" },
  { publishedAt: "2026-08-21", publication: "ventureburn", title: "Best Crypto To Buy Now: Ethereum at $2,300, XRP Rallies and The Moonberg Crypto Presale Explodes", keywords: ["best crypto to buy now", "new crypto presale", "ethereum", "xrp"], angle: "Multi-asset" },
  { publishedAt: "2026-08-21", publication: "coingabbar", title: "Top Crypto To Buy Now as Crypto Market Rallies: Pepeto, Alphapepe and Moonberg", keywords: ["top crypto to buy now", "pepeto", "alphapepe"], angle: "Competitor listicle" },
  { publishedAt: "2026-08-21", publication: "globenewswire", title: "New Crypto Presale Moonberg ($MBX) Reaches New Heights As XRP Price Prediction Turns Bullish With ETF News", keywords: ["xrp price prediction", "xrp etf news", "new crypto presale"], angle: "XRP ETF" },
  { publishedAt: "2026-08-21", publication: "globenewswire", title: "Crypto News: New Crypto Presale Moonberg Taps $300,000 As XRP Price Prediction Targets $10", keywords: ["crypto news", "new crypto presale", "xrp price prediction"], angle: "XRP" },
];

export function archiveFor(campaignId: string): PublishedArticle[] {
  return campaignId === "moonberg"
    ? [...MOONBERG_ARCHIVE].sort((a, b) =>
        b.publishedAt.localeCompare(a.publishedAt)
      )
    : [];
}

/** The N most recent, newest first. What the agents are shown. */
export function recent(campaignId: string, n = 20): PublishedArticle[] {
  return archiveFor(campaignId).slice(0, n);
}

export interface Coverage {
  keyword: string;
  count: number;
  lastUsed: string;
  publications: string[];
}

/** Which keywords have been hit, how often, and where. */
export function keywordCoverage(campaignId: string): Coverage[] {
  const map = new Map<string, Coverage>();
  for (const a of archiveFor(campaignId)) {
    for (const k of a.keywords) {
      const key = k.toLowerCase();
      const seen = map.get(key);
      if (seen) {
        seen.count += 1;
        if (a.publishedAt > seen.lastUsed) seen.lastUsed = a.publishedAt;
        if (!seen.publications.includes(a.publication))
          seen.publications.push(a.publication);
      } else {
        map.set(key, {
          keyword: key,
          count: 1,
          lastUsed: a.publishedAt,
          publications: [a.publication],
        });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword)
  );
}

export function angleCoverage(campaignId: string): Coverage[] {
  const map = new Map<string, Coverage>();
  for (const a of archiveFor(campaignId)) {
    const seen = map.get(a.angle);
    if (seen) {
      seen.count += 1;
      if (a.publishedAt > seen.lastUsed) seen.lastUsed = a.publishedAt;
    } else {
      map.set(a.angle, {
        keyword: a.angle,
        count: 1,
        lastUsed: a.publishedAt,
        publications: [],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * The block injected into the writer and reviewer prompts. Deliberately compact:
 * titles and angles are what repetition shows up in, and a full corpus would
 * crowd out the research brief.
 */
export function priorWorkBlock(campaignId: string, n = 20): string {
  const items = recent(campaignId, n);
  if (!items.length) return "";
  const angles = angleCoverage(campaignId)
    .slice(0, 6)
    .map((a) => `${a.keyword} (${a.count}×)`)
    .join(", ");

  return `PUBLISHED IN THE LAST FEW WEEKS — do not repeat these.

The programme has already run ${archiveFor(campaignId).length} releases. The most
worked angles are: ${angles}. Sixty near-identical releases is a recognisable
pattern, and the defence is genuine variety across the set rather than polish on
any one piece.

Recent titles:
${items.map((a) => `- ${a.publishedAt} · ${a.publication} · ${a.title}`).join("\n")}

Requirements that follow from this:
- Do not reuse a headline construction that appears above. If three recent
  titles open "Crypto News: …", this one opens differently.
- Do not rebuild the same comparison set. If the last two pieces compared
  Moonberg with Pepeto and AlphaPepe, find another axis.
- Vary the structure. If recent pieces are single-asset attachments, consider the
  listicle, and the reverse.
- The featured asset may repeat — the market decides that — but the ANGLE on it
  must not.`;
}
