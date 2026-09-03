#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Run every writer check against the drafts already on disk. No API calls.
//
// WHY THIS EXISTS. Five rewrites were driven live, all five failed on the same
// check, and each one had burned three writer calls before failing — fifteen
// paid calls to discover that "cut to 11 em dashes or fewer" is a counting
// task a language model cannot perform. Every one of those drafts was already
// sitting on disk. The check could have been run against them for nothing.
//
// So: before shipping a change to the enforcement suite, run this. It reports
// what each stored draft would fail on, and exits non-zero if anything does.
// A check that fails every stored draft is a check that will fail every live
// run, and it costs nothing to find that out here.
//
//   node scripts/preflight-checks.mjs            # against .data
//   DATA_DIR=/path/to/data node scripts/preflight-checks.mjs
//
// A draft failing here is not automatically a bug — these seven predate the
// rules. What matters is WHICH check fails and whether the writer could
// plausibly satisfy it. If a check can only be satisfied by counting, or by
// holding a whole-document property in mind, fix it in code instead.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

// Run under tsx so this imports the REAL TypeScript modules and can never
// drift from what actually runs in production:  npx tsx scripts/preflight-checks.mjs
const W = await import("../src/lib/agents/writer.ts");
const { COINPRESSO_PAGES, PILLARS } = await import("../src/lib/blog.ts");

const root = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const runsDir = path.join(root, "runs");
if (!fs.existsSync(runsDir)) {
  console.error(`No runs at ${runsDir}. Point DATA_DIR at a data directory.`);
  process.exit(2);
}

const known = new Map();
for (const p of COINPRESSO_PAGES) {
  known.set(p.url.replace(/\/+$/, "").toLowerCase(), p.topic);
}
// Published posts are linkable too. Use the archive if this install has one.
const archive = path.join(root, "archive", "coinpresso-blog.json");
if (fs.existsSync(archive)) {
  for (const a of JSON.parse(fs.readFileSync(archive, "utf8"))) {
    if (a.url) known.set(a.url.replace(/\/+$/, "").toLowerCase(), a.title);
  }
}

const CHECKS = [
  ["intro", (d) => W.enforceIntro(d.body)],
  ["prose", (d) => W.enforceProse(d.body)],
  ["markers", (d) => W.enforceNoLedgerMarkers(d.body, d.faqs ?? [])],
  ["links", (d, r) =>
    W.enforceLinks(
      d.body,
      r.research?.sources?.length ?? 0,
      known,
      PILLARS.find((p) => p.id === r.brief?.pillar)?.hub
    )],
  ["outline", (d, r) => {
    const o = r.brief?.contentBrief?.outline ?? [];
    if (o.length) W.enforceOutline(d.body, o);
  }],
];

let failures = 0;
let drafts = 0;
const tally = new Map();

for (const file of fs.readdirSync(runsDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const run = JSON.parse(fs.readFileSync(path.join(runsDir, file), "utf8"));
  if (run.brief?.track !== "blog" || !run.draft) continue;
  drafts++;

  // Mirror the last-attempt behaviour: mechanical fixes are applied before the
  // draft is judged, so this reports what a real final attempt would see.
  const draft = { ...run.draft };
  draft.body = W.softenEmDashes(draft.body, W.emDashBudget(W.wordCount(draft.body)));

  const problems = [];
  for (const [name, fn] of CHECKS) {
    try {
      fn(draft, run);
    } catch (e) {
      problems.push([name, e.message.replace(/\s*Retry the writer\.$/, "")]);
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
  }

  const title = (run.brief.title ?? "untitled").slice(0, 58);
  if (!problems.length) {
    console.log(`\n  PASS  ${title}`);
  } else {
    failures++;
    console.log(`\n  FAIL  ${title}`);
    for (const [name, msg] of problems) {
      console.log(`        [${name}] ${msg.split("\n")[0].slice(0, 150)}`);
    }
  }
}

console.log(`\n${"─".repeat(72)}`);
console.log(`${drafts} drafts · ${drafts - failures} pass · ${failures} fail`);
if (tally.size) {
  console.log("\nBy check:");
  for (const [name, n] of [...tally].sort((a, b) => b[1] - a[1])) {
    const flag = n === drafts ? "  ← fails EVERY draft; suspect the check, not the writer" : "";
    console.log(`  ${String(n).padStart(2)}/${drafts}  ${name}${flag}`);
  }
}
process.exit(failures ? 1 : 0);
