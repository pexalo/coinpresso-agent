import { BIN_DAYS, inBin, binExpiresAt, emptyExpired } from "../src/lib/bin.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};

const run = (id, removedAt) => ({ id, removedAt, brief: { title: id } });
const now = Date.parse("2026-10-04T12:00:00Z");

console.log("the bin");
ok("kept 30 days", BIN_DAYS === 30);
ok("queue post is not in the bin", !inBin(run("a")));
ok("removed post is in the bin", inBin(run("b", "2026-10-01T00:00:00Z")));
ok("no expiry outside the bin", binExpiresAt(run("a")) === null);
ok("expires 30 days after removal", binExpiresAt(run("b", "2026-10-01T00:00:00Z")) === "2026-10-31T00:00:00.000Z");

const kept = await emptyExpired([
  run("queue"),
  run("fresh", "2026-10-03T00:00:00Z"),
  run("day29", "2026-09-05T13:00:00Z"),
  run("old", "2026-08-01T00:00:00Z"),
], "test-client-none", now);
const ids = kept.map((r) => r.id);
ok("queue post survives", ids.includes("queue"));
ok("recent bin post survives", ids.includes("fresh") && ids.includes("day29"));
ok("over 30 days is emptied", !ids.includes("old"), JSON.stringify(ids));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
