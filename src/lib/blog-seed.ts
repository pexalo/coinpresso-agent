// ---------------------------------------------------------------------------
// Topics and keywords Coinpresso supplies themselves.
//
// The planner proposes a day from the pillars, the archive and what is already
// ranking. That is the right default and it is not the whole job: Coinpresso
// know things the planner cannot infer — a service they are pushing this
// quarter, an objection three sales calls raised last week, a term they want to
// rank for because a competitor just started bidding on it. Before this, the
// only way in was the one-line steer, which the planner could honour, dilute or
// quietly ignore.
//
// So this is an INBOX, not a settings page. Topics land here whenever someone
// thinks of one, and get consumed by a day's plan later. Two consequences
// follow, and both are the point:
//
//   STATE. A topic that has been written is marked used, with the batch that
//   used it. A seed list without state gets published twice — the second time by
//   a planner that had no way of knowing, and on a blog running eight posts a
//   day nobody notices until the duplicate is indexed.
//
//   SEPARATION. Per-topic keywords belong to that topic and travel with it into
//   the brief. Standing keywords are different in kind: terms to work in WHERE
//   THEY GENUINELY FIT, across the programme. Merging the two would turn a
//   standing list into a per-post checklist, which is keyword stuffing with
//   extra steps and the exact pattern that gets a domain demoted.
//
// In HQ this is a `blog_seed_topics` table plus a per-client keyword list.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";
import type { ContentBrief } from "./content-brief";

const DIR = dataDir("blog-seeds");

/**
 * `parked` is shown as "Hidden". The stored name is unchanged because renaming
 * it would need a migration of every seed file for no behavioural gain — but the
 * screen says what the state does rather than what it is called here.
 */
export type SeedStatus = "queued" | "used" | "parked";

export interface SeedTopic {
  id: string;
  /** What Coinpresso wants written about, in their words. */
  topic: string;
  /** Terms this particular post should target. */
  keywords: string[];
  /** Anything a PERSON needs the writer to know: a figure, a customer quote. */
  notes?: string;
  /**
   * Coinpresso's content brief for this post, parsed into its parts.
   *
   * Separate from `notes` on purpose. This is what the writer follows for
   * structure and voice before it writes anything of its own, and the outline,
   * the FAQ and the must-not-claim line only survive as instructions if they
   * survive as structure. Flattened into prose they become a paragraph the
   * model skims.
   */
  brief?: ContentBrief;
  /**
   * A link to Coinpresso's own content-recommendation doc for this topic —
   * primary keyword, SERP gap, the angle, the section structure they want.
   *
   * GUIDANCE, NEVER A SOURCE. It is an internal Drive doc: not published, not
   * reachable by a reader, and a citation to it in a live post is a broken link
   * on the agency's own domain. It travels to the strategy agent inside its own
   * quarantined block and is explicitly barred from the source ledger; it must
   * never be folded into `notes` as a bare URL, because notes reach the model as
   * ordinary operator text where a URL reads as fair game.
   */
  referenceUrl?: string;
  /**
   * The Coinpresso page this post is written to link to. Outreach rows in the
   * content calendar carry one — the post's job is the link.
   */
  linkTarget?: string;
  /** Optional pillar hint. The planner still assigns the final one. */
  pillar?: string;
  status: SeedStatus;
  addedAt: string;
  addedBy?: string;
  usedAt?: string;
  /** The batch that turned this into a post, so it can be traced. */
  usedBatchId?: string;
}

export interface BlogSeeds {
  topics: SeedTopic[];
  /**
   * Terms to work in across the programme where they genuinely fit — NOT a
   * per-post checklist. See the note at the top of this file.
   */
  standingKeywords: string[];
  updatedAt: string;
}

const EMPTY: BlogSeeds = { topics: [], standingKeywords: [], updatedAt: "" };

function fileFor(clientRef: string): string {
  return path.join(DIR, `${clientRef}.json`);
}

export async function listSeeds(clientRef: string): Promise<BlogSeeds> {
  try {
    const raw = await fs.readFile(fileFor(clientRef), "utf8");
    const parsed = JSON.parse(raw) as Partial<BlogSeeds>;
    return {
      topics: parsed.topics ?? [],
      standingKeywords: parsed.standingKeywords ?? [],
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return { ...EMPTY };
  }
}

async function write(clientRef: string, seeds: BlogSeeds): Promise<BlogSeeds> {
  await fs.mkdir(DIR, { recursive: true });
  const next = { ...seeds, updatedAt: new Date().toISOString() };
  await fs.writeFile(fileFor(clientRef), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export interface NewSeedTopic {
  topic: string;
  keywords?: string[];
  notes?: string;
  brief?: ContentBrief;
  referenceUrl?: string;
  linkTarget?: string;
  pillar?: string;
  status?: SeedStatus;
  addedBy?: string;
}

/**
 * Newest first, because this is an inbox and the thing just added is the thing
 * being looked for.
 */
export async function addTopics(
  clientRef: string,
  incoming: NewSeedTopic[]
): Promise<BlogSeeds> {
  const seeds = await listSeeds(clientRef);
  const now = new Date().toISOString();

  // A topic already in the inbox is not added again, and neither is a repeat
  // inside the incoming batch. Someone pasting a list they half-added yesterday
  // should get the ones that are missing, not a second copy of the ones that are
  // not.
  //
  // Queued AND parked both count as present. Parking is a decision — "this one
  // is not a blog post" — and re-adding it as a fresh queued topic silently
  // reverses that decision on the next paste. Only `used` is excluded, because
  // deliberately re-running a written topic is a real thing to want.
  const seen = new Set(
    seeds.topics
      .filter((t) => t.status === "queued" || t.status === "parked")
      .map((t) => t.topic.toLowerCase())
  );

  const fresh: SeedTopic[] = [];
  for (const src of incoming) {
    const topic = src.topic.trim();
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({
      id: `seed_${Date.now()}_${fresh.length}`,
      topic,
      keywords: (src.keywords ?? []).map((k) => k.trim()).filter(Boolean),
      notes: src.notes?.trim() || undefined,
      brief: src.brief,
      referenceUrl: src.referenceUrl?.trim() || undefined,
      linkTarget: src.linkTarget?.trim() || undefined,
      pillar: src.pillar || undefined,
      status: src.status ?? "queued",
      addedAt: now,
      addedBy: src.addedBy?.trim() || undefined,
    });
  }

  return write(clientRef, { ...seeds, topics: [...fresh, ...seeds.topics] });
}

export async function updateTopic(
  clientRef: string,
  id: string,
  patch: Partial<
    Pick<
      SeedTopic,
      "topic" | "keywords" | "notes" | "brief" | "referenceUrl" | "linkTarget" | "pillar" | "status"
    >
  >
): Promise<BlogSeeds> {
  const seeds = await listSeeds(clientRef);
  return write(clientRef, {
    ...seeds,
    topics: seeds.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });
}

export async function removeTopic(
  clientRef: string,
  id: string
): Promise<BlogSeeds> {
  const seeds = await listSeeds(clientRef);
  return write(clientRef, {
    ...seeds,
    topics: seeds.topics.filter((t) => t.id !== id),
  });
}

/**
 * Called when a plan built on these topics is actually sent to be written.
 *
 * Deliberately NOT called when the planner merely proposes them: a proposal can
 * be discarded, and burning the topic at that point loses it silently. The
 * moment a batch starts is the moment the post exists.
 */
export async function markUsed(
  clientRef: string,
  ids: string[],
  batchId: string
): Promise<BlogSeeds> {
  if (!ids.length) return listSeeds(clientRef);
  const seeds = await listSeeds(clientRef);
  const now = new Date().toISOString();
  const set = new Set(ids);
  return write(clientRef, {
    ...seeds,
    topics: seeds.topics.map((t) =>
      set.has(t.id) && t.status === "queued"
        ? { ...t, status: "used" as const, usedAt: now, usedBatchId: batchId }
        : t
    ),
  });
}

export async function setStandingKeywords(
  clientRef: string,
  keywords: string[]
): Promise<BlogSeeds> {
  const seeds = await listSeeds(clientRef);
  const cleaned = [
    ...new Set(keywords.map((k) => k.trim()).filter(Boolean)),
  ].slice(0, 40);
  return write(clientRef, { ...seeds, standingKeywords: cleaned });
}

export function queuedTopics(seeds: BlogSeeds): SeedTopic[] {
  return seeds.topics.filter((t) => t.status === "queued");
}
