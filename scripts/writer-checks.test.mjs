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

console.log("\nblog link survives the cap (Liam: landing pages AND blogs):");
// The live E-E-A-T draft's shape: service pages early, posts named late. Six
// internal links against a cap of five, with the post last.
const svc = ["crypto-seo", "web3-ghostwriting", "crypto-link-building-services", "crypto-pr", "crypto-content"];
const late = `Intro paragraph long enough to open this piece for a reader.\n\n` +
  svc.map((sl, k) => `## S${k}\n\nProse about ${cp(sl, sl.replace(/-/g, " "))} here.`).join("\n\n") +
  `\n\n## Six\n\nWe covered this in [the llms.txt guide](https://coinpresso.io/blog/llms-txt-for-crypto-web3-sites-do-you-need-one-in-2026).` +
  `\n\n## Conclusion and FAQ\n\nSee ${cp("geo-llm-optimization-for-crypto-web3", "crypto GEO")}.`;
const trimmedLate = W.trimLinks(late, hub);
t("internal capped at 5", shape(trimmedLate)[0], 5);
t("the blog post link survives", /\/blog\/llms-txt/.test(trimmedLate), true);
t("the pillar link survives", /geo-llm-optimization/.test(trimmedLate), true);
// Three service pages survive (earliest in document order); two are dropped
// so the protected pillar and post can both fit inside the cap of five.
const svcKept = svc.filter((sl) => trimmedLate.includes(`](https://coinpresso.io/${sl})`)).length;
t("3 service pages kept, 2 unlinked to make room", svcKept, 3);
t("dropped service pages keep their words", trimmedLate.includes("crypto content") && trimmedLate.includes("crypto pr"), true);

console.log("\nem dash guidance is a ceiling, not a target:");
t("budget for a 2,100-word piece", W.emDashBudget(2100), 12);
t("Liam's own rate passes", (() => { try { W.enforceProse("word ".repeat(2000) + "a — b. ".repeat(10)); return "passes"; } catch { return "fails"; } })(), "passes");

console.log("\nensurePillarLink (Liam's anchor rule, done in code):");
const topic = "generative engine optimisation (GEO) for crypto and Web3";
const pl = (b) => W.ensurePillarLink(b, hub, topic);
const hasPillar = (b) => /\]\(https:\/\/coinpresso\.io\/geo-llm[^)]*\)/.test(pl(b));
t("links a spelled-out mention", hasPillar("Any generative engine optimisation strategy needs this."), true);
t("links the acronym when that is all there is", hasPillar("Your GEO strategy has to change."), true);
t("en-US spelling too", hasPillar("A generative engine optimization strategy."), true);
t("does not match inside a word", pl("The geography shifted.") , "The geography shifted.");
t("skips a mention already inside a link", pl("Read [our GEO guide](https://coinpresso.io/blog/x)."), "Read [our GEO guide](https://coinpresso.io/blog/x).");
t("skips headings, uses the body", /## Generative/.test(pl("## Generative engine optimisation\n\nThe GEO discipline.")), true);
t("no mention → unchanged", pl("Nothing relevant here."), "Nothing relevant here.");
t("code left alone", pl("Set `GEO` in config. Later GEO matters.").includes("`GEO`"), true);
t("already linked → untouched", pl(`See [crypto GEO](${hub}) work.`), `See [crypto GEO](${hub}) work.`);

console.log("\nrelative links can no longer slip through:");
const rel = `Intro paragraph long enough to open this piece for a reader.\n\n## A\n\nSee [the pillar page](/services/geo) here.\n\n## B\n\n${cp("crypto-seo","crypto SEO")}\n\n## C\n\n${cp("crypto-pr","crypto PR")}\n\n## D\n\n${cp("geo-llm-optimization-for-crypto-web3","crypto GEO")}`;
let relVerdict = "not flagged";
try { W.enforceLinks(rel, 0, new Map([["https://coinpresso.io/crypto-seo","crypto SEO"],["https://coinpresso.io/crypto-pr","crypto PR"],["https://coinpresso.io/geo-llm-optimization-for-crypto-web3", topic]]), hub); }
catch (e) { relVerdict = /relative link/.test(e.message) ? "flagged" : e.message.slice(0, 60); }
t("a relative link is caught", relVerdict, "flagged");

console.log("\nenforceOutline:");
const ol = [{ n: 1, title: "One" }, { n: 2, title: "Two" }];
const fenced = "Intro.\n\n## a\n\n```md\n## example\n```\n\n## b";
t("fenced heading not counted", W.enforceOutline(fenced, ol).includes("## example"), true);
t("real headings replaced", [...W.enforceOutline(fenced, ol).replace(/```[\s\S]*?```/g, "").matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]), ["One", "Two"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
