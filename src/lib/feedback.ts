// ---------------------------------------------------------------------------
// Editorial feedback from the client, as standing instructions.
//
// Liam reviews a draft, writes up what is wrong, and the next draft has to be
// different — without a code change each time. This store holds each point of
// feedback as a rule the writer follows and the reviewer checks, with the
// before/after example where he gave one, because a model imitates a
// demonstrated correction far better than it follows a described one.
//
// Both blog agents read it on every run. The first entries are his review of
// the E-E-A-T piece (2 Sep 2026); later rounds are added on the Style page.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";

const DIR = dataDir("feedback");

export interface FeedbackEntry {
  id: string;
  /** Who said it and about which piece — "Liam, E-E-A-T review". */
  source: string;
  date: string;
  /** The instruction, as the writer should read it. */
  rule: string;
  /** A line he marked and the line he wanted instead. */
  before?: string;
  after?: string;
  /** Rules can be retired without being lost. */
  active: boolean;
  addedAt: string;
}

export interface FeedbackLog {
  entries: FeedbackEntry[];
  updatedAt: string;
}

/**
 * Liam's review of "E-E-A-T for Crypto Websites in the Age of AI Search",
 * distilled. Seeded in code so a fresh install carries it; the stored file
 * wins once anything has been saved.
 */
export const SEED_FEEDBACK: Omit<FeedbackEntry, "addedAt">[] = [
  {
    id: "liam-eeat-voice",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "Write in the Coinpresso voice: bold, sometimes borderline hyperbolic statements that make the reader pay attention — Jeremy Clarkson's charisma transposed to crypto content. Where a safe line and a bold line say the same thing, take the bold one. Prose must read as native-English, expert-level and unmistakably human.",
    before: "E-E-A-T hasn't died, but its job has changed.",
    after: "E-E-A-T hasn't died, but it's undergone major surgery on most of its internal organs.",
    active: true,
  },
  {
    id: "liam-eeat-impact",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "When the underlying point is right but flat, add impact — a concrete image or a blunt qualifier — rather than another clause of qualification.",
    before: "Experience means the product has real on-chain usage.",
    after: "Experience, for a crypto product, means on-chain proof the thing is actually used — not a fugazzi whitepaper concept, actual use.",
    active: true,
  },
  {
    id: "liam-eeat-connectives",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "Connecting words are the clearest AI tell. Never open a sentence with \"Separately\", \"Furthermore\", \"Additionally\" or \"Moreover\". Join two facts the way a person making a point would: say what they mean together.",
    before: "Separately, a related analysis found that ranking first on Google only correlates with getting cited by an AI engine around 22% of the time.",
    after: "It doesn't stop there. A related analysis found that ranking first on Google only correlates with getting cited by an AI engine around 22% of the time. Read together, those two figures say something founders continue to be blind to: you can win the search results page and still be utterly invisible in the answer.",
    active: true,
  },
  {
    id: "liam-eeat-intro",
    source: "Liam, E-E-A-T review",
    date: "2026-09-01",
    rule:
      "Open with one to two paragraphs before the first H2 that set the scene: name a problem the reader recognises straight away, then say what the piece will give them. Do not go straight into section one.",
    active: true,
  },
  {
    id: "liam-eeat-links",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "Per post: 3-5 internal links to Coinpresso landing pages and posts, woven in where the topic arises with anchor text naming the topic (\"crypto SEO\" links to the crypto SEO page), never bunched into the conclusion. 3-5 external links that substantiate specific claims.",
    active: true,
  },
  {
    id: "liam-eeat-citations",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "The sourcing is strong — keep it — but spread citations through the piece. Several in consecutive sentences read as a citation dump.",
    active: true,
  },
];

function fileFor(clientRef: string): string {
  return path.join(DIR, `${clientRef}.json`);
}

function seeded(): FeedbackLog {
  const now = new Date().toISOString();
  return {
    entries: SEED_FEEDBACK.map((e) => ({ ...e, addedAt: now })),
    updatedAt: "",
  };
}

export async function readFeedback(clientRef: string): Promise<FeedbackLog> {
  try {
    const raw = await fs.readFile(fileFor(clientRef), "utf8");
    const parsed = JSON.parse(raw) as Partial<FeedbackLog>;
    return { entries: parsed.entries ?? [], updatedAt: parsed.updatedAt ?? "" };
  } catch {
    return seeded();
  }
}

async function write(clientRef: string, log: FeedbackLog): Promise<FeedbackLog> {
  await fs.mkdir(DIR, { recursive: true });
  const next = { ...log, updatedAt: new Date().toISOString() };
  await fs.writeFile(fileFor(clientRef), JSON.stringify(next, null, 2));
  return next;
}

export async function addFeedback(
  clientRef: string,
  entry: Pick<FeedbackEntry, "source" | "rule"> & Partial<Pick<FeedbackEntry, "date" | "before" | "after">>
): Promise<FeedbackLog> {
  const log = await readFeedback(clientRef);
  const now = new Date().toISOString();
  log.entries.push({
    id: `fb-${Date.now().toString(36)}`,
    source: entry.source.trim() || "Client",
    date: entry.date?.trim() || now.slice(0, 10),
    rule: entry.rule.trim(),
    before: entry.before?.trim() || undefined,
    after: entry.after?.trim() || undefined,
    active: true,
    addedAt: now,
  });
  return write(clientRef, log);
}

export async function setFeedbackActive(
  clientRef: string,
  id: string,
  active: boolean
): Promise<FeedbackLog> {
  const log = await readFeedback(clientRef);
  const e = log.entries.find((x) => x.id === id);
  if (e) e.active = active;
  return write(clientRef, log);
}

export async function removeFeedback(clientRef: string, id: string): Promise<FeedbackLog> {
  const log = await readFeedback(clientRef);
  log.entries = log.entries.filter((x) => x.id !== id);
  return write(clientRef, log);
}

/**
 * The prompt block. One shape for both agents: the writer reads it as
 * instructions, the reviewer as the checklist — and a point the client has
 * already made once is a MAJOR finding the second time.
 */
export function feedbackBlock(log: FeedbackLog, audience: "writer" | "reviewer"): string {
  const live = log.entries.filter((e) => e.active);
  if (!live.length) return "";
  const lines = live.map((e, i) => {
    const ex =
      e.before && e.after
        ? `\n   Not this: "${e.before}"\n   This: "${e.after}"`
        : e.after
          ? `\n   For example: "${e.after}"`
          : "";
    return `${i + 1}. ${e.rule} (${e.source}, ${e.date})${ex}`;
  });
  const head =
    audience === "writer"
      ? `WHAT THE CLIENT HAS ALREADY CORRECTED — each of these was flagged on a
previous draft. A draft that repeats one goes back for revision.`
      : `WHAT THE CLIENT HAS ALREADY CORRECTED — check the draft against every
point. Any repeat is a MAJOR finding, categorised "style", quoting the text.`;
  return `${head}\n\n${lines.join("\n")}`;
}
