// ---------------------------------------------------------------------------
// The workflow graph, as data.
//
// One flow per module the client holds — the same view Pexalo HQ shows for a
// client dashboard, picked from a dropdown rather than stacked on one page.
//
// It is deliberately DATA rather than a hand-drawn diagram. A diagram in a design
// file is wrong the week after it is drawn; this one names the actual models from
// the model registry and the actual bound on each loop, so when the tiering
// changes the picture changes with it.
//
// Nodes carry a `status`. The daily report's flow is mostly `planned`, and it is
// drawn that way: a diagram that renders an unbuilt stage identically to a
// working one is a sales asset, and the first person to click through stops
// trusting the whole page.
// ---------------------------------------------------------------------------

import { MODELS } from "./models";
import type { ModuleId } from "./clients";
import type { Track } from "./costs";

/** One flow per module the client actually bought. */
export type WorkflowId = "wire" | "blog" | "daily-report";

export type NodeKind =
  | "input"
  | "agent"
  | "check"
  | "gate"
  | "human"
  | "output";

export interface FlowNode {
  id: string;
  kind: NodeKind;
  title: string;
  /** Shown under the title — what this stage is for, in one line. */
  role: string;
  model?: string;
  tools?: string[];
  /** What it consumes. */
  reads: string[];
  /** What it produces for the next stage. */
  emits: string[];
  /** Why the stage exists — the failure mode it exists to prevent. */
  why?: string;
  /** Rough share of the run's model spend, for the cost overlay. */
  costShare?: number;
  /**
   * Whether this stage exists yet. Drawing a planned stage the same as a working
   * one turns the diagram into a sales asset, and the first person to click it
   * stops trusting the whole page.
   */
  status?: "live" | "planned";
}

export interface Workflow {
  id: WorkflowId;
  /** The module that owns it — this is how the picker knows what to offer. */
  moduleId: ModuleId;
  /** Set where a per-piece model cost is meaningful. The daily report has none. */
  track?: Track;
  name: string;
  subtitle: string;
  /** CSS colour token for the track's accent in the diagram. */
  tone: string;
  destination: string;
  nodes: FlowNode[];
  loop: { from: string; to: string; label: string; bound: string };
}

const LINK_CHECK: FlowNode = {
  id: "linkcheck",
  kind: "check",
  title: "Link check",
  role: "Verifies every citation in the draft",
  model: "deterministic — no model",
  tools: ["HTTP"],
  reads: ["Draft", "Source ledger"],
  emits: ["Unsourced URLs", "Dead URLs"],
  why: "A fabricated citation looks exactly like a real one until someone clicks it, and a model asked whether it invented a URL sometimes says no with confidence. String comparison and an HTTP request cannot be talked round.",
  costShare: 0,
};

export const WORKFLOWS: Record<WorkflowId, Workflow> = {
  wire: {
    id: "wire",
    moduleId: "crypto-pr",
    track: "wire",
    name: "Crypto PR",
    subtitle:
      "A campaign's release, placed on a third-party newswire. Borrows the market's search demand and points it at the token.",
    tone: "var(--accent)",
    destination: "OpenPR · StreetInsider · GlobeNewswire · TechBullion · 5 more",
    nodes: [
      {
        id: "brief",
        kind: "input",
        title: "Brief",
        role: "Title, target keywords, wire — or a batch from the ideas agent",
        reads: ["Campaign fact sheet", "Banned claims"],
        emits: ["Brief stamped with the figures true at submission"],
        why: "The fact sheet is snapshotted onto the brief so a mid-batch change cannot make two articles disagree about the raise.",
      },
      {
        id: "strategy",
        kind: "agent",
        title: "Strategy",
        role: "Researches the market and builds the source ledger",
        model: MODELS.strategy,
        tools: ["web search"],
        reads: ["Brief", "Campaign limits"],
        emits: [
          "Dated news catalyst",
          "≥2 third-party forecasts, bullish and cautious",
          "Verbatim figures per source",
          "Source ledger",
        ],
        why: "The factual floor. The writer may not introduce a source the ledger does not carry, so anything missing here cannot appear downstream.",
        costShare: 0.55,
      },
      {
        id: "writer",
        kind: "agent",
        title: "Writer",
        role: "Drafts to house style and the wire's format",
        model: MODELS.writer,
        reads: [
          "Source ledger",
          "Liam's style profile",
          "Style exemplars from the archive",
          "The last 15 published titles",
        ],
        emits: ["Headline", "Body", "FAQs", "Tags"],
        why: "Mid-tier on purpose. With a complete brief and a tight framework the thinking has already happened upstream; a frontier model buys little here.",
        costShare: 0.2,
      },
      LINK_CHECK,
      {
        id: "reviewer",
        kind: "agent",
        title: "Reviewer",
        role: "Judges the draft against the house style and the sourcing standard",
        model: MODELS.reviewer,
        reads: ["Draft", "Ledger", "Campaign limits", "Published archive"],
        emits: ["Verdict", "Scored findings", "Concrete fixes"],
        why: "A different model family from the writer, deliberately. A reviewer sharing the writer's lineage shares its blind spots and mostly agrees with itself.",
        costShare: 0.12,
      },
      {
        id: "revision",
        kind: "agent",
        title: "Revision",
        role: "Writer applies the findings, changing only what they require",
        model: MODELS.writer,
        reads: ["Findings", "Previous draft"],
        emits: ["Revised draft"],
        costShare: 0.13,
      },
      {
        id: "review",
        kind: "human",
        title: "Liam reviews",
        role: "Nothing reaches a wire without a person approving it",
        reads: ["Draft", "Findings", "Source ledger"],
        emits: ["Approved", "Sent back"],
      },
      {
        id: "export",
        kind: "output",
        title: "Export",
        role: "Google Doc created, content calendar updated",
        reads: ["Approved draft"],
        emits: ["Doc URL", "Archive row"],
      },
    ],
    loop: {
      from: "reviewer",
      to: "revision",
      label: "blocker, or three majors",
      bound: "Bounded at 2 passes — then it lands in review with findings attached",
    },
  },

  blog: {
    id: "blog",
    moduleId: "own-blog",
    track: "blog",
    name: "Coinpresso Blog",
    subtitle:
      "The agency's own domain, 5–8 a day. Has to earn the demand rather than borrow it, because the asset being built is the domain itself.",
    tone: "var(--success)",
    destination: "coinpresso.io — pillar and cluster",
    nodes: [
      {
        id: "plan",
        kind: "input",
        title: "Day plan",
        role: "5–8 posts spread across pillars and formats",
        model: MODELS.strategy,
        reads: ["Pillars and clusters", "Everything already on the blog"],
        emits: [
          "One post per pillar slot",
          "A content type per post",
          "The originality each one needs",
        ],
        why: "Three constraints at once: at least three pillars a day, no more than two of any format, and every post naming the post it is not a rewrite of. Volume without that is the pattern search systems demote.",
        costShare: 0.05,
      },
      {
        id: "strategy",
        kind: "agent",
        title: "Strategy",
        role: "Finds what already ranks and where the gap is",
        model: MODELS.strategy,
        tools: ["web search"],
        reads: ["Working title", "Pillar", "Format"],
        emits: [
          "What is already ranking and what it misses",
          "The buyer question under the keyword",
          "Proof points the post can cite",
          "Internal links to the pillar and siblings",
        ],
        why: "No price predictions and no presale figures on this track. Where the post would need Coinpresso's own campaign data to be original, it says so rather than inventing it.",
        costShare: 0.52,
      },
      {
        id: "writer",
        kind: "agent",
        title: "Writer",
        role: "Drafts to the blog voice and the format asked for",
        model: MODELS.writer,
        reads: ["Research", "Blog playbook", "Blog style"],
        emits: ["H1", "Body", "FAQs", "Internal links"],
        why: "A practitioner writing to a peer. No dateline, no boilerplate, no disclaimer — if a draft starts reading like the Moonberg programme it has gone wrong.",
        costShare: 0.2,
      },
      LINK_CHECK,
      {
        id: "reviewer",
        kind: "agent",
        title: "Reviewer",
        role: "Judges it as the founder deciding whether to hire them would",
        model: MODELS.reviewer,
        reads: ["Draft", "Ledger", "Playbook", "Proof points"],
        emits: ["Verdict", "Findings", "Named originality, or none"],
        why: "The bar is HIGHER than the wire, not lower. A weak release is a wasted placement; a weak post on your own domain is evidence you cannot do the thing you sell. A post carrying nothing original is a blocker.",
        costShare: 0.11,
      },
      {
        id: "revision",
        kind: "agent",
        title: "Revision",
        role: "Writer applies the findings",
        model: MODELS.writer,
        reads: ["Findings", "Previous draft"],
        emits: ["Revised draft"],
        costShare: 0.12,
      },
      {
        id: "review",
        kind: "human",
        title: "Editor approves",
        role: "The day's set is read together, not one at a time",
        reads: ["The day's drafts", "Pillar spread"],
        emits: ["Approved", "Shelved"],
        why: "Eight posts each fine alone can still be a bad day's publishing. The spread across pillars and formats is only visible in the set.",
      },
      {
        id: "publish",
        kind: "output",
        title: "Publish",
        role: "Into the pillar cluster on coinpresso.io",
        reads: ["Approved draft"],
        emits: ["Post", "Internal links", "Archive row"],
      },
    ],
    loop: {
      from: "reviewer",
      to: "revision",
      label: "blocker, or three majors",
      bound: "Bounded at 2 passes — an unbounded loop between two models with taste disagreements runs until the budget is gone",
    },
  },

  "daily-report": {
    id: "daily-report",
    moduleId: "daily-report",
    track: undefined,
    name: "Daily Report",
    subtitle:
      "Yesterday's campaign numbers, the anomalies in them, and the actions arising — in Coinpresso's inbox before the standup.",
    tone: "var(--warning)",
    destination: "Dashboard · Telegram at the scheduled time",
    nodes: [
      {
        id: "sources",
        kind: "input",
        title: "Data sources",
        role: "GA4, the Meta ad account, Looker Studio, presale contract",
        reads: ["Settings → Integrations", "Campaign fact sheet"],
        emits: ["Sessions", "Ad spend", "Revenue", "Presale state"],
        why: "The IDs live in Settings rather than in code, because a second campaign means a second ad account and nothing else about the flow changes.",
        status: "planned",
      },
      {
        id: "ingest",
        kind: "check",
        title: "Ingest",
        role: "Pulls the reporting day's figures on a schedule",
        model: "deterministic — no model",
        reads: ["Source APIs"],
        emits: ["The day's raw numbers"],
        why: "Today this module renders a report transcribed from the PDF Coinpresso already produces. The shape is the live one; the pull is not built, and the page says so rather than implying a live feed.",
        status: "planned",
      },
      {
        id: "attribution",
        kind: "check",
        title: "Attribution",
        role: "First-touch, last-touch and all-touch value per source",
        model: "deterministic — no model",
        reads: ["Sessions", "Conversions", "Spend"],
        emits: ["Attribution table", "Spend against value per channel"],
        why: "Three models rather than one because they disagree, and which one you read decides which channel looks like it is working. Showing one number here would be the most expensive kind of tidy.",
        status: "planned",
      },
      {
        id: "anomalies",
        kind: "check",
        title: "Anomaly detection",
        role: "Flags what moved against its own trailing average",
        model: "deterministic — thresholds, not a model",
        reads: ["The day's numbers", "Trailing period"],
        emits: ["Alerts", "Drops", "Flat lines", "Notes"],
        why: "Deliberately thresholds rather than a model. A model asked what looks unusual will always find something, and a report that cries wolf daily gets filtered to a folder nobody opens.",
        status: "planned",
      },
      {
        id: "narrative",
        kind: "agent",
        title: "Read and actions",
        role: "Writes the interpretation and the actions arising",
        model: MODELS.writer,
        reads: ["Anomalies", "Attribution", "Yesterday's actions", "Market and regulatory notes"],
        emits: ["The headline read", "Action items with an owner and a due date"],
        why: "The one stage a model genuinely helps with. Numbers do not tell you what to do about them, and an action with no owner and no date is a note, not an action.",
        status: "planned",
      },
      {
        id: "human",
        kind: "human",
        title: "Coinpresso checks",
        role: "The report is read before it goes anywhere",
        reads: ["Draft report"],
        emits: ["Approved", "Corrected"],
        why: "This report goes to a client under Coinpresso's name. An automated send of a wrong number is worse than a late report.",
        status: "planned",
      },
      {
        id: "deliver",
        kind: "output",
        title: "Delivery",
        role: "Dashboard, then Telegram at the scheduled time",
        reads: ["Approved report", "Settings → Delivery and schedule"],
        emits: ["Dashboard view", "Telegram digest"],
        why: "The dashboard page and the Telegram send are both built and connected to Settings. Only the data behind them is still the transcribed seed.",
      },
    ],
    loop: {
      from: "narrative",
      to: "anomalies",
      label: "a flagged number that does not reconcile",
      bound: "Unreconciled figures are reported as unreconciled — never quietly dropped or averaged away",
    },
  },
};

export const WORKFLOW_LIST = Object.values(WORKFLOWS);

/** The flows a given client can actually see — one per module they hold. */
export function workflowsFor(modules: ModuleId[]): Workflow[] {
  return WORKFLOW_LIST.filter((w) => modules.includes(w.moduleId));
}
