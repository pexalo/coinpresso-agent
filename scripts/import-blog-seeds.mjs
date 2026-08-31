#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Load a topic list into a client's blog seed queue.
//
//   node scripts/import-blog-seeds.mjs coinpresso data/content-calendar.json
//
// Written as a script rather than done once by hand because the content
// calendar is a living document: Coinpresso add rows to it, and the useful
// operation is "load the ones that are not in the queue yet", repeatedly.
//
// It reproduces addTopics' rules exactly, and the reason it must is the whole
// point of running it twice:
//
//   - queued AND parked both count as already present. Parking is a decision
//     ("this row is not a blog post"); a re-import that re-queued it would
//     silently reverse that decision every time the calendar grew.
//   - `used` does NOT count, so deliberately re-running a written topic stays
//     possible.
//
// It never rewrites an existing entry. A topic already in the queue keeps the
// keywords, notes and status it has — including edits made in the UI, which are
// worth more than anything a re-import could restore.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";

const [, , ref, source] = process.argv;
if (!ref || !source) {
  console.error("usage: node scripts/import-blog-seeds.mjs <client-ref> <topics.json>");
  process.exit(1);
}

const root = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const file = path.join(root, "blog-seeds", `${ref}.json`);

const incoming = JSON.parse(await fs.readFile(source, "utf8"));
if (!Array.isArray(incoming)) {
  console.error(`${source} must be a JSON array of topics.`);
  process.exit(1);
}

let seeds = { topics: [], standingKeywords: [], updatedAt: "" };
try {
  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  seeds = {
    topics: parsed.topics ?? [],
    standingKeywords: parsed.standingKeywords ?? [],
    updatedAt: parsed.updatedAt ?? "",
  };
  console.log(`Existing queue: ${seeds.topics.length} topics.`);
} catch {
  console.log("No existing queue — creating one.");
}

const present = new Map(
  seeds.topics
    .filter((t) => t.status === "queued" || t.status === "parked")
    .map((t) => [t.topic.trim().toLowerCase(), t])
);

const now = new Date().toISOString();
const fresh = [];
let skipped = 0;
let refreshed = 0;

for (const src of incoming) {
  const topic = (src.topic ?? "").trim();
  if (!topic) continue;
  const key = topic.toLowerCase();
  const existing = present.get(key);
  if (existing) {
    // Already in the queue. Refresh it ONLY when this import put it there and
    // nobody has since edited it — the case being served is a second pass over
    // the same calendar that now carries the briefs the first pass could not
    // reach. Any topic a person has touched is left exactly as they left it;
    // an import that silently overwrites someone's edits is worse than one that
    // does nothing.
    const untouched = existing.addedBy === src.addedBy;
    if (untouched && (src.keywords?.length || src.notes || src.brief)) {
      if (src.keywords?.length) existing.keywords = src.keywords;
      if (src.notes) existing.notes = src.notes;
      if (src.brief) {
        existing.brief = src.brief;
        // MIGRATION. An earlier version of this import pasted the whole brief
        // into `notes` as one flat block. Now that the brief is structured, that
        // copy is not merely redundant — it is shown to the reader as "note from
        // Coinpresso" and sent to the writer a second time as operator prose,
        // where the quarantine around the brief's unverified figures does not
        // apply. Cleared only when it is recognisably that block; a note someone
        // actually typed is never touched.
        if (existing.notes?.includes("FROM COINPRESSO'S CONTENT BRIEF")) {
          delete existing.notes;
        }
      }
      if (src.referenceUrl) existing.referenceUrl = src.referenceUrl;
      if (src.linkTarget) existing.linkTarget = src.linkTarget;
      refreshed++;
    } else {
      skipped++;
    }
    continue;
  }
  present.set(key, null);
  fresh.push({
    id: `seed_${Date.now()}_${fresh.length}`,
    topic,
    keywords: (src.keywords ?? []).map((k) => String(k).trim()).filter(Boolean),
    notes: src.notes?.trim() || undefined,
    brief: src.brief,
    referenceUrl: src.referenceUrl?.trim() || undefined,
    linkTarget: src.linkTarget?.trim() || undefined,
    pillar: src.pillar || undefined,
    // Only these two. "used" means a batch wrote it, and an import claiming that
    // would put a post in the written list that nothing wrote.
    status: src.status === "parked" ? "parked" : "queued",
    addedAt: now,
    addedBy: src.addedBy?.trim() || "import",
  });
}

await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(
  file,
  JSON.stringify(
    { ...seeds, topics: [...fresh, ...seeds.topics], updatedAt: now },
    null,
    2
  ),
  "utf8"
);

const queued = fresh.filter((t) => t.status === "queued").length;
console.log(
  `Added ${fresh.length} (${queued} queued, ${fresh.length - queued} parked), ` +
    `refreshed ${refreshed} already present, left ${skipped} alone.`
);
console.log(`Queue is now ${seeds.topics.length + fresh.length} topics: ${file}`);
