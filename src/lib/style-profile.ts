// ---------------------------------------------------------------------------
// Liam / Coinpresso writing style profile.
//
// Schema matches Pexalo HQ's FEATURE-SPEC-writing-style.md so this ports into
// the Client Profile → Writing Style tab without a translation layer. Extracted
// from the published Moonberg corpus (60+ wire releases, Aug 2026) and the
// StreetInsider/Pepeto framework analysis.
//
// Versioned. When a re-extraction happens, push a new object and keep the old
// one — "the new articles sound wrong" needs a rollback path.
// ---------------------------------------------------------------------------

export interface StyleProfile {
  version: number;
  clientId: string;
  sourceCount: number;
  extractedAt: string;
  voice: {
    formality: string;
    person: string;
    tone: string[];
    humour: string;
  };
  sentences: {
    averageWords: number;
    variability: string;
    opensWithSubject: boolean;
    usesFragments: boolean;
  };
  structure: {
    typicalHeadings: number;
    headingStyle: string;
    paragraphLength: string;
    usesBulletLists: boolean;
    usesTables: boolean;
    opensWith: string;
  };
  vocabulary: {
    prefers: string[];
    avoids: string[];
    jargonLevel: string;
    spelling: string;
  };
  punctuation: {
    emDash: boolean;
    exclamation: boolean;
    oxfordComma: boolean;
    contractions: boolean;
  };
  conventions: {
    headingCase: string;
    numbers: string;
    ctaStyle: string;
  };
  doNot: string[];
  styleSummary: string;
}

export const LIAM_STYLE_PROFILE: StyleProfile = {
  version: 1,
  clientId: "coinpresso-moonberg",
  sourceCount: 12,
  extractedAt: "2026-08-23T00:00:00+08:00",

  voice: {
    formality: "editorial-analytical, crypto-native trade press",
    person: "third-person, no first-person plural, no direct address",
    tone: ["measured", "explanatory", "commercially aware", "non-hyperbolic"],
    humour: "none",
  },

  sentences: {
    averageWords: 22,
    variability: "high — long analytical sentences broken by short one-line pivots",
    opensWithSubject: true,
    usesFragments: false,
  },

  structure: {
    typicalHeadings: 5,
    headingStyle:
      "keyword-carrying statement or question; never generic labels like 'About Moonberg'",
    paragraphLength: "1-3 sentences; single-sentence paragraphs used as pivots",
    usesBulletLists: false,
    usesTables: false,
    opensWith:
      "the market narrative and primary keyword, never the product",
  },

  vocabulary: {
    prefers: [
      "price prediction",
      "forecast",
      "scenario",
      "bullish scenario rather than a guaranteed outcome",
      "early-stage",
      "utility",
      "on-chain",
      "allocation",
      "presale stage",
      "traders",
      "market capitalisation",
    ],
    avoids: [
      "guaranteed",
      "will explode",
      "to the moon",
      "100x guaranteed",
      "don't miss out",
      "life-changing",
      "risk-free",
      "seamless",
      "unlock",
      "supercharge",
      "game-changer",
      "revolutionise",
    ],
    jargonLevel: "assumes crypto literacy; does not explain BTC, ETH, DeFi, presale",
    spelling: "en-GB (analyse, centred, favourable, capitalisation)",
  },

  punctuation: {
    emDash: true,
    exclamation: false,
    oxfordComma: false,
    contractions: false,
  },

  conventions: {
    headingCase: "Title Case For Headings",
    numbers: "numerals for all prices and figures; $ prefix; comma thousands",
    ctaStyle:
      "single soft line near the end plus one in FAQs; never imperative urgency",
  },

  doNot: [
    "Never state a price target as fact — always attribute to a named third party",
    "Never invent a source, a URL, a figure, an analyst or a quote",
    "Never claim an exchange listing, date or partnership that is not confirmed",
    "Never manufacture scarcity — no invented sellout deadlines or countdowns",
    "Never present the presale as low-risk or compare it favourably on safety",
    "Never omit the risk paragraph or the disclaimer",
    "Never use first person or address the reader as 'you'",
  ],

  styleSummary:
    "Measured British-English crypto trade-press prose that reads as market analysis rather than promotion. Every price target is attributed to a named third party and paired with a cautious counter-forecast, so the piece argues a scenario rather than asserting an outcome. Moonberg is never the subject of the opening — the market event is — and the presale arrives as the early-stage counterpoint the analysis produces, always with its greater risk stated plainly. Paragraphs are short, often a single sentence used as a pivot, and the target keyword recurs verbatim in the headline, opening, one H2, the conclusion and an FAQ.",
};

// ---------------------------------------------------------------------------
// The framework the writer works to. This is the analytical core — it is what
// makes output read like the published corpus rather than generic presale PR.
// ---------------------------------------------------------------------------

export const PLAYBOOK = `# The Coinpresso / Moonberg parasitic-SEO framework

## Core principle
Do not make Moonberg the news. Make the market event the news, and make Moonberg
the opportunity revealed by the news. The reader arrives from a high-volume search
query; the established asset supplies credibility and search demand; Moonberg is the
conclusion the market analysis produces, never the premise.

## Narrative flow
market/price hook -> why the featured asset matters now -> soft-sell Moonberg
positioning -> sourced price prediction section (bull case AND cautious case) ->
opportunity gap -> Moonberg product -> $MBX utility -> presale evidence ->
comparison -> conclusion returning to the search intent -> FAQs -> disclaimer.

## Pacing rule (explicit client feedback)
Do NOT reach the price-prediction section immediately after paragraph one. The
intro runs three to four paragraphs: news hook, then why the asset matters right
now, then Moonberg positioned as a different angle (not a competitor to the L1),
then the presale link. Only then the prediction section.

## Sourcing standard (non-negotiable)
- Every price prediction is attributed to a named third party AND linked.
- Minimum two independent prediction sources per article.
- Always show divergence: pair the bullish scenario with a cautious one. A piece
  that only carries the bull case reads as advertising.
- Named-analyst theses are attributed to person and outlet.
- On-chain claims point at a block explorer, not at "whales are buying".
- Regulatory or macro events cite an established outlet.
- Never cite a URL that was not supplied in the research brief's source ledger.

## Tone calibration
Weak:     "Moonberg's presale is gaining momentum."
Stronger: "Moonberg's current presale stage offers access before the next
           scheduled price increase."
Strongest (only when the research brief supports it): "Moonberg's current stage is
           approaching its allocation limit, with the next price level taking
           effect once it sells out."
Keep the urgency mechanism — catalyst, scarcity, social proof — without inventing
scarcity or timelines. Always retain the risk paragraph.

## Heading architecture
Every H2 carries a keyword, introduces a news narrative, answers a question or
transitions toward the product. Proven patterns:
- "[Asset] Price Prediction: Could [X] Really Reach $[Y]?"
- "What Could Drive [Asset] Toward $[Y]?"
- "Why Moonberg Is Appearing Alongside [Asset]"
- "[Asset] vs Moonberg: Two Very Different Crypto Bets"
- "New Crypto Presale Moonberg Reaches $[X]"
- "The Early-Entry Narrative"
- "Which Is The Best Crypto To Buy Now?"
- "Final Thoughts"

Repeat the exact primary keyword in: headline, first paragraph, at least one H2,
one or two body references, the conclusion, and at least one FAQ.

## Structural variants
A. Single-asset attachment — one featured asset plus prediction, Moonberg as the
   early-stage counterpoint. Used for OpenPR, GlobeNewswire, StreetInsider.
B. Listicle / comparison — numbered sections, Moonberg at #1, then two to three
   established assets as benchmarks, each closing with a one-line pivot back to
   Moonberg's earlier position on the risk curve. Ends with a "which is best"
   section that frames the choice as risk profile rather than picking a winner.
   Used for TechBullion, VentureBurn, CoinGabbar comparison pieces.

## Moonberg facts available for use
- AI-native crypto trading terminal: market intelligence, on-chain analysis,
  computed signals and execution in one interface
- 76 million+ tokens tracked; 53.4 billion data points; 40+ chains;
  130 proprietary metrics
- Wallet X-Ray, Sentinel, Moonscope
- AI agents: natural-language strategy creation, backtesting, deployment with
  defined limits
- 650,000+ community members; Solana and Ethereum execution; non-custodial
- $MBX utility: premium intelligence access, AI computing resources, reduced
  terminal fees, priority access, ecosystem rewards, governance
- Presale: staged, price rises each stage. Use ONLY the raised figure and stage
  supplied in the research brief. Do not invent or carry over a figure.

## Boilerplate
Presale link: https://moonberg.com/tokensale
Site: https://moonberg.com
`;
