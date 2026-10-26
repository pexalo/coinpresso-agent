import { monthlyStatement, runChargesByMonth, recordImageSpend } from "../src/lib/costs.ts";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;
console.log("monthly statement dates each charge (26 Oct)");
// Written in September for $1.00 (legacy, no ledger), rewritten in October for $0.40.
const run = {
  id: "r1", clientRef: "c", createdAt: "2026-09-28T10:00:00Z", brief: { title: "Post" }, mock: false, stages: [
    { id: "strategy", startedAt: "2026-09-28T10:00:00Z", costUsd: 0.5, searchCostUsd: 0.1 },
    // begin() re-dated it to October and seeded the ledger with September's charge; finish() added October's.
    { id: "writer", startedAt: "2026-10-03T09:00:00Z", costUsd: 1.4,
      ledger: [{ at: "2026-09-28T10:05:00Z", usd: 1.0 }, { at: "2026-10-03T09:04:00Z", usd: 0.4 }] },
  ],
};
const sep = monthlyStatement([run], [], "2026-09");
const oct = monthlyStatement([run], [], "2026-10");
ok("September keeps research + first draft ($1.60)", near(sep.totalUsd, 1.6), sep.totalUsd);
ok("October bills only the rewrite ($0.40)", near(oct.totalUsd, 0.4), oct.totalUsd);
ok("nothing counted twice", near(sep.totalUsd + oct.totalUsd, 0.5 + 0.1 + 1.4));

const legacy = { id: "r2", createdAt: "2026-09-02T00:00:00Z", brief: { title: "Old" }, stages: [{ id: "writer", startedAt: "2026-09-02T00:00:00Z", costUsd: 2 }] };
ok("a stage from before the ledger still dates by its start", near(monthlyStatement([legacy], [], "2026-09").totalUsd, 2));

const img = { id: "r3", createdAt: "2026-09-30T00:00:00Z", totalCostUsd: 0, brief: { title: "Img" }, stages: [] };
recordImageSpend(img, 0.04);
const months = [...runChargesByMonth(img).values()].reduce((a, c) => a + c.img, 0);
ok("an image charge is dated when it is made", near(months, 0.04));

const offRun = [{ at: "2026-10-10T00:00:00Z", kind: "removed-posts", tokenCostUsd: 0.7, searchCostUsd: 0.1, imageCostUsd: 0.05, totalUsd: 0.85 }];
const o2 = monthlyStatement([], offRun, "2026-10", { "removed-posts": "Posts deleted from the bin" });
ok("a deleted post's spend stays on the statement", near(o2.totalUsd, 0.85) && near(o2.imageCostUsd, 0.05), JSON.stringify(o2));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
