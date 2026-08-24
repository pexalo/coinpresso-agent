// ---------------------------------------------------------------------------
// Coinpresso's daily marketing report for a campaign.
//
// This is a different data domain from the PR pipeline — ad spend, sessions,
// revenue and attribution rather than drafts and wires — which is exactly why it
// is a separate module on the client record rather than another tab bolted onto
// Crypto PR.
//
// The seed below is the 20 Aug 2026 report, transcribed from the PDF Coinpresso
// already produces. Only figures the report actually states are present; nothing
// is interpolated. When this is wired to Looker Studio / GA4 / the Meta API, the
// shape stays and the seed goes.
// ---------------------------------------------------------------------------

export interface StatCard {
  label: string;
  sub?: string;
  value: string;
  /** Movement line under the value. */
  note?: string;
  tone?: "neutral" | "up" | "down" | "warn";
  accent?: string;
}

export interface AttributionRow {
  source: string;
  colour?: string;
  sessions: string;
  firstTouch: string;
  firstTouchValue: string;
  lastTouch: string;
  lastTouchValue: string;
  allTouchValue: string;
  spend: string;
  emphasis?: boolean;
}

export interface Anomaly {
  severity: "alert" | "down" | "flat" | "note";
  headline: string;
  detail: string;
}

export interface ExternalNote {
  tag: "MARKET" | "REGULATORY" | "CAMPAIGN";
  body: string;
}

export interface ActionItem {
  index: string;
  headline: string;
  detail: string;
  owner: string;
  due: string;
}

export interface DailyReport {
  campaignId: string;
  /** The day the numbers describe. */
  reportingDay: string;
  /** The day the report was issued. */
  issued: string;
  badge?: string;
  headline: string;
  headlineHighlight?: string;
  standfirst: string;
  keyNumbers: StatCard[];
  secondary: StatCard[];
  dailyRevenue: Array<{
    day: string;
    total: number;
    /** Portion of that day attributable to a single wallet, where stated. */
    singleWallet?: number;
    label?: string;
  }>;
  spendVsRevenue: {
    caption: string;
    period: string;
    series: Array<{ name: string; value: number; colour: string }>;
    note: string;
  };
  attribution: {
    period: string;
    rows: AttributionRow[];
    footnote: string;
  };
  anomalies: Anomaly[];
  market: StatCard[];
  externalNotes: ExternalNote[];
  actions: ActionItem[];
  sources: string[];
}

/** Chart series colours — validated for dark surfaces (see the dataviz check). */
export const SERIES = {
  spend: "#3AA894",
  revenue: "#967D28",
} as const;

export const MOONBERG_20_AUG: DailyReport = {
  campaignId: "moonberg",
  reportingDay: "2026-08-20",
  issued: "2026-08-21",
  badge: "RECORD REVENUE DAY · $10.1K",
  headline: "Thursday booked",
  headlineHighlight: "$10,136",
  standfirst:
    "One wallet supplied $8,960 of it. Strip that single transaction out and Thursday is $1,176 — a good day, not a record. The rally, not the media plan, moved the number: Meta has spent $5,583 over nine days to return $1,286, and the three most recent reported days bought $1,389 of clicks and zero purchases.",
  keyNumbers: [
    {
      label: "Revenue",
      sub: "(20 Aug)",
      value: "$10,136",
      note: "▲ 49% of all-time · Wed was $0",
      tone: "up",
    },
    {
      label: "Cumulative",
      sub: "(since 1 Sep 25)",
      value: "$20,505",
      note: "Last 7 days: $12,066 · 59%",
      tone: "neutral",
    },
    {
      label: "Transactions",
      sub: "(20 Aug)",
      value: "5",
      note: "88% from one $8,960 wallet",
      tone: "warn",
    },
    {
      label: "Meta ROAS",
      sub: "(11–19 Aug)",
      value: "0.23×",
      note: "▼ $4,297 net · 9 days",
      tone: "down",
    },
  ],
  secondary: [
    { label: "Meta spend", value: "$5,583", note: "9 days" },
    { label: "Meta clicks", value: "7,436", note: "218,841 imps" },
    { label: "GA4 sessions from Meta", value: "178", note: "1–21 Aug" },
    {
      label: "Click → session",
      value: "2.4%",
      note: "97.6% lost",
      tone: "down",
    },
  ],
  dailyRevenue: [
    { day: "15", total: 1252, label: "$1,252" },
    { day: "16", total: 558, label: "$558" },
    { day: "17", total: 0 },
    { day: "18", total: 0 },
    { day: "19", total: 0 },
    { day: "20", total: 10136, singleWallet: 8960, label: "$10,136" },
    { day: "21", total: 98, label: "$98" },
  ],
  spendVsRevenue: {
    caption: "Meta: spend vs attributed revenue",
    period: "11–19 Aug",
    series: [
      { name: "Meta spend", value: 5583, colour: SERIES.spend },
      { name: "Attributed revenue", value: 1286, colour: SERIES.revenue },
    ],
    note: "Same axis, same currency — the gap is the finding. The per-day series sits in Looker Studio and is not restated here; the nine-day totals are what the report itself states.",
  },
  attribution: {
    period: "1–21 Aug",
    rows: [
      {
        source: "Meta (paid)",
        colour: SERIES.spend,
        sessions: "178",
        firstTouch: "5",
        firstTouchValue: "$1,175",
        lastTouch: "5",
        lastTouchValue: "$445",
        allTouchValue: "$1,175",
        spend: "$5,583",
      },
      {
        source: "PR (referral)",
        colour: SERIES.revenue,
        sessions: "49",
        firstTouch: "1",
        firstTouchValue: "$4",
        lastTouch: "6",
        lastTouchValue: "$756",
        allTouchValue: "$1,066",
        spend: "not in report",
      },
      {
        source: "Attributed total",
        sessions: "227",
        firstTouch: "6",
        firstTouchValue: "$1,180",
        lastTouch: "11",
        lastTouchValue: "$1,201",
        allTouchValue: "$2,241",
        spend: "$5,583",
        emphasis: true,
      },
    ],
    footnote:
      "Same 21 days, three answers. First-touch credits Meta 266× more than PR; last-touch credits PR 1.7× more than Meta. Until that is reconciled, no budget decision should be made on either number alone.",
  },
  anomalies: [
    {
      severity: "alert",
      headline: "One wallet = $8,960",
      detail:
        "88% of Thursday and 44% of everything booked since Sep 2025. Concentration flag tripped. This is not a repeatable marketing outcome and must not seed a forecast.",
    },
    {
      severity: "down",
      headline: "7,436 Meta clicks produced 178 GA4 sessions",
      detail:
        "2.4% arrive. Either the pixel/UTM chain is broken or the clicks are not real people. Both are urgent; they are not the same fix.",
    },
    {
      severity: "down",
      headline: "17–19 Aug: $1,389 spent, 0 purchases, $0 revenue",
      detail: "Three consecutive blank days at the end of the flight.",
    },
    {
      severity: "flat",
      headline: "Meta visitors see 2.09 pages in 38 seconds",
      detail:
        "Against a site average of 5.93 pages in 161s, and 59.9% leave from the landing page.",
    },
    {
      severity: "note",
      headline: "$741.14 is claimed twice",
      detail:
        "Meta books it as 14 Aug revenue; GA4 last-touch assigns the identical amount to ventureburn / referral.",
    },
  ],
  market: [
    { label: "BTC", value: "$71,971", note: "▲ 11.9% 24h", tone: "up" },
    { label: "ETH", value: "$2,287", note: "▲ 18% 24h", tone: "up" },
    { label: "vs ATH", value: "−43%", note: "Oct 25 peak", tone: "down" },
    { label: "Volume", value: "$47B", note: "high since Jun", tone: "neutral" },
  ],
  externalNotes: [
    {
      tag: "MARKET",
      body: "BTC took out $72k on its strongest single-day move of 2026, driven by a $1.44B short squeeze. Our record revenue day sits directly on top of it — read the $10,136 as market beta, not campaign performance.",
    },
    {
      tag: "REGULATORY",
      body: "The repricing followed Trump pushing the Clarity Act and the SEC's proposed rules on 19 Aug. Risk appetite, not our funnel, opened the wallet.",
    },
    {
      tag: "CAMPAIGN",
      body: "The 13 Aug GlobeNewswire release is the best PR asset so far: 4,893 views, 836 readers, 182 link clicks at 4.35% CTR — 3.3× the 12 Aug release's clicks on similar reach.",
    },
  ],
  actions: [
    {
      index: "01",
      headline: "Pause Meta at current settings",
      detail:
        "0.23× over nine days, with $1,389 and nothing to show for the last three, is not a bidding problem.",
      owner: "Coinpresso Paid",
      due: "today",
    },
    {
      index: "02",
      headline: "Diagnose the 7,436 → 178 gap before any further spend",
      detail: "Audit pixel and UTM chain first, then placement quality.",
      owner: "Coinpresso Analytics",
      due: "22 Aug",
    },
    {
      index: "03",
      headline: "Restate Thursday excluding the $8,960 wallet",
      detail:
        "And agree a concentration rule, so one deposit can't set the baseline.",
      owner: "Coinpresso Analytics + Moonberg",
      due: "today",
    },
  ],
  sources: [
    "Looker Studio “moonberg.com — Initial Marketing Contribution Report”, read 21 Aug 2026.",
    "Market data: Fortune & CoinDesk, 20 Aug 2026.",
    "Carried from source: the Meta table sums CTR and CPC instead of recomputing them (grand-total CTR reads 109.13 — true blended CTR is 3.40%, CPC $0.75); page_view is null across both PR touchpoint tables.",
  ],
};

export const REPORTS: DailyReport[] = [MOONBERG_20_AUG];

export function reportsFor(campaignId: string): DailyReport[] {
  return REPORTS.filter((r) => r.campaignId === campaignId).sort((a, b) =>
    b.reportingDay.localeCompare(a.reportingDay)
  );
}
