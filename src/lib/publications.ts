// ---------------------------------------------------------------------------
// Per-wire format rules. Derived from the published corpus — each outlet in the
// content calendar has a distinct house shape, and getting these wrong is the
// most visible failure mode.
// ---------------------------------------------------------------------------

import type { PublicationId } from "./types";

export interface Publication {
  id: PublicationId;
  name: string;
  /** How external sources are attached to the prose. */
  linkStyle: "anchor" | "naked";
  dateline: string | null;
  faqCount: [number, number];
  wordTarget: [number, number];
  structure: "single_asset" | "listicle" | "either";
  boilerplate: "corporate" | "editorial";
  notes: string;
}

export const PUBLICATIONS: Record<PublicationId, Publication> = {
  openpr: {
    id: "openpr",
    name: "OpenPR",
    linkStyle: "naked",
    dateline: null,
    faqCount: [2, 3],
    wordTarget: [700, 950],
    structure: "single_asset",
    boilerplate: "corporate",
    notes:
      "Naked URLs on their own line immediately beneath the paragraph that references them. No dateline in the body. Short FAQ. Full contact block and About Moonberg at the end.",
  },
  globenewswire: {
    id: "globenewswire",
    name: "GlobeNewswire",
    linkStyle: "anchor",
    dateline: "ZUG, Switzerland",
    faqCount: [3, 5],
    wordTarget: [800, 1100],
    structure: "single_asset",
    boilerplate: "corporate",
    notes:
      "Opens with the dateline `ZUG, Switzerland, <Month> <D>, <YYYY> (GLOBE NEWSWIRE) --` inline with the first sentence. Embedded anchor-text links. Formal PR close with contact block, About Moonberg and a Tags line.",
  },
  streetinsider: {
    id: "streetinsider",
    name: "StreetInsider / MarketMediaWire",
    linkStyle: "anchor",
    dateline: null,
    faqCount: [4, 6],
    wordTarget: [900, 1300],
    structure: "either",
    boilerplate: "editorial",
    notes:
      "The most editorial of the wires. Reads as a market article. Embedded anchor links woven into prose. Longer FAQ. Competitor comparison section carries real weight here — compare against another presale, not only against the featured large-cap.",
  },
  techbullion: {
    id: "techbullion",
    name: "TechBullion",
    linkStyle: "anchor",
    dateline: null,
    faqCount: [5, 6],
    wordTarget: [700, 1000],
    structure: "listicle",
    boilerplate: "editorial",
    notes:
      "Compact. Numbered listicle with Moonberg at #1 followed by established assets, or short narrative H2s. Embedded anchor links. Five to six short search-friendly FAQs. Own disclaimer wording: 'informational and promotional purposes only'. No dateline, no contact block.",
  },
  coingabbar: {
    id: "coingabbar",
    name: "CoinGabbar",
    linkStyle: "anchor",
    dateline: null,
    faqCount: [3, 5],
    wordTarget: [700, 1000],
    structure: "either",
    boilerplate: "editorial",
    notes:
      "Crypto-native press-release section. Comparison framing performs well. Embedded anchor links.",
  },
  ventureburn: {
    id: "ventureburn",
    name: "VentureBurn",
    linkStyle: "anchor",
    dateline: null,
    faqCount: [3, 5],
    wordTarget: [800, 1100],
    structure: "listicle",
    boilerplate: "editorial",
    notes:
      "Multi-asset comparison pieces dominate this outlet in the corpus — 'Best Crypto To Buy Now: A, B, C and Moonberg'. Keep each asset section tight.",
  },
  captainaltcoin: {
    id: "captainaltcoin",
    name: "Captain Altcoin",
    linkStyle: "anchor",
    dateline: null,
    faqCount: [3, 5],
    wordTarget: [800, 1100],
    structure: "either",
    boilerplate: "editorial",
    notes:
      "Presale-versus-presale comparisons are the recurring format here (Moonberg vs Pepeto vs AlphaPepe). Fair treatment of competitors is what makes it credible.",
  },
  financefeeds: {
    id: "financefeeds",
    name: "Finance Feeds",
    linkStyle: "anchor",
    dateline: null,
    faqCount: [3, 4],
    wordTarget: [800, 1100],
    structure: "single_asset",
    boilerplate: "editorial",
    notes:
      "Finance-trade register. Leans harder on institutional and macro framing than the crypto-native outlets.",
  },
  blockchainreporter: {
    id: "blockchainreporter",
    name: "Blockchain Reporter",
    linkStyle: "anchor",
    dateline: null,
    faqCount: [3, 5],
    wordTarget: [700, 1000],
    structure: "either",
    boilerplate: "editorial",
    notes: "Standard crypto press-release shape. Embedded anchor links.",
  },
};

export const PUBLICATION_LIST = Object.values(PUBLICATIONS);

export const CORPORATE_BOILERPLATE = `Disclaimer:
The information contained in this press release is intended for informational purposes only and does not constitute investment or legal advice. Investing in cryptoassets involves substantial risk and the possibility of losing your entire initial investment. Price predictions are speculative and should not be considered guarantees of future performance. Always conduct independent research and seek professional advice before making investment decisions.

Contact: Barret Jacobs
Website: https://moonberg.com/
Email: pr@moonberg.com
Source: Moonberg
Address: MOONBERG AG, Dammstrasse 16, 6300 Zug, Switzerland

Moonberg is an intelligence layer for AI-native crypto markets, providing over 650,000 community members with one terminal that unifies on-chain data, computed signals, and execution across Solana and Ethereum. From a single interface, users can research tokens, read signals, and manage non-custodial portfolios while automating their trading edge.`;

export const EDITORIAL_BOILERPLATE = `Disclaimer
This article is for informational and promotional purposes only and does not constitute financial or investment advice. Cryptocurrency markets are highly volatile, and crypto presales carry additional risks, including liquidity, execution, regulatory and market-adoption risks. Price predictions referenced in this article represent third-party forecasts or scenarios and are not guarantees of future performance. Readers should conduct their own research and consider their financial circumstances and risk tolerance before purchasing any cryptocurrency.`;

export function boilerplateFor(p: Publication): string {
  return p.boilerplate === "corporate"
    ? CORPORATE_BOILERPLATE
    : EDITORIAL_BOILERPLATE;
}
