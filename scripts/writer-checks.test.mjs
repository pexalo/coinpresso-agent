#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Unit tests for the writer's mechanical fixes and checks. No API calls.
//
//   npx tsx scripts/writer-checks.test.mjs
//
// Every case here is a bug that reached production or was one deploy away
// from it. Four of them came out of a single audit: the em dash softener and
// the link trimmer were both editing inside fenced code blocks, the prose
// check was counting dashes inside JSON, and the outline check was counting a
// "## " line inside a markdown example as a real section. That last pair are
// the dangerous kind — a schema-markup post cannot be rewritten to satisfy
// them, so the run would fail three attempts and die on a correct draft.
// ---------------------------------------------------------------------------

const W = await import("../src/lib/agents/writer.ts");
const { COINPRESSO_PAGES, PILLARS } = await import("../src/lib/blog.ts");
const hub = "https://coinpresso.io/geo-llm-optimization-for-crypto-web3";
const cp = (slug, n) => `[${n}](https://coinpresso.io/${slug})`;
let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n         got ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`}`);
};
const shape = (b) => {
  const p = W.proseOf(b);
  const all = [...p.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  const i = all.filter((u) => /coinpresso\.io/.test(u)).length;
  return [i, all.length - i];
};

console.log("trimLinks:");
const many = `Intro long enough to open the piece for a reader of this post.\n\n` +
  Array.from({ length: 8 }, (_, k) => `## S${k}\n\nText ${cp(`p-${k}`, `topic ${k}`)} and [study](https://e${k}.com/a).`).join("\n\n") +
  `\n\n## Conclusion and FAQ\n\nSee ${cp("geo-llm-optimization-for-crypto-web3", "crypto GEO")}.`;
t("8+1 internal / 8 external → caps", shape(W.trimLinks(many, hub)), [5, 5]);
t("pillar kept", W.trimLinks(many, hub).includes("geo-llm-optimization"), true);
t("word count unchanged", W.wordCount(W.trimLinks(many, hub)) === W.wordCount(many), true);
const compliant = `Intro long enough to open the piece for a reader of this post.\n\n## A\n\n${cp("crypto-seo","crypto SEO")}\n\n[s](https://e.com/1)\n\n## B\n\n${cp("crypto-pr","crypto PR")}\n\n[s](https://e.com/2)\n\n## C\n\n${cp("geo-llm-optimization-for-crypto-web3","crypto GEO")}\n\n[s](https://e.com/3)`;
t("compliant draft untouched", W.trimLinks(compliant, hub) === compliant, true);

console.log("\nsoftenEmDashes:");
t("reduces to budget", (W.softenEmDashes("a — b — c — d — e — f.", 2).match(/[—–]/g) ?? []).length <= 2, true);
t("numeric range preserved", W.softenEmDashes("From 2024—2026 and 5—10%.", 0), "From 2024—2026 and 5—10%.");
t("continuing word → comma", W.softenEmDashes("It works — but only sometimes.", 0), "It works, but only sometimes.");
t("otherwise → full stop", W.softenEmDashes("It works — none of it is magic.", 0), "It works. None of it is magic.");
t("under budget is a no-op", W.softenEmDashes("One — dash.", 5), "One — dash.");

console.log("\ncode safety:");
const withCode = "Prose — here.\n\n```json\n{\"a\":\"x — y\",\"b\":\"see [d](https://coinpresso.io/crypto-seo)\"}\n```\n\nMore — prose.";
t("code block byte-identical after soften", W.softenEmDashes(withCode, 0).split("```")[1], withCode.split("```")[1]);
t("code block byte-identical after trim", W.trimLinks(withCode, hub, 0, 0).split("```")[1], withCode.split("```")[1]);
t("inline code preserved", W.softenEmDashes("Set `a — b` — now.", 0).includes("`a — b`"), true);
t("proseOf excludes code", /x — y/.test(W.proseOf(withCode)), false);
t("maskCode round-trips", W.maskCode(withCode).restore(W.maskCode(withCode).masked), withCode);

console.log("\nfixer and checker agree (the denominator bug, twice over):");
// A body that is a third code. A body-derived budget softens to a number the
// prose-derived check then rejects, so the draft is fixed and fails anyway.
const heavy = `Intro paragraph long enough to open this piece for a reader.\n\n## A\n\n` +
  Array.from({ length: 12 }, (_, k) => `Prose line ${k} — with a dash in it.`).join("\n\n") +
  `\n\n\`\`\`json\n${JSON.stringify({ pad: "x ".repeat(300) })}\n\`\`\``;
const softened = W.softenToBudget(heavy);
let proseVerdict = "passes";
try { W.enforceProse(softened); } catch (e) { proseVerdict = e.message.slice(0, 90); }
t("softenToBudget output survives enforceProse", proseVerdict, "passes");
t("budget is prose-derived, not body-derived",
  W.emDashBudgetFor(heavy) === W.emDashBudget(W.wordCount(W.proseOf(heavy))), true);
t("code untouched by softenToBudget", softened.split("```")[1], heavy.split("```")[1]);

console.log("\nenforceOutline:");
const ol = [{ n: 1, title: "One" }, { n: 2, title: "Two" }];
const fenced = "Intro.\n\n## a\n\n```md\n## example\n```\n\n## b";
t("fenced heading not counted", W.enforceOutline(fenced, ol).includes("## example"), true);
t("real headings replaced", [...W.enforceOutline(fenced, ol).replace(/```[\s\S]*?```/g, "").matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]), ["One", "Two"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
