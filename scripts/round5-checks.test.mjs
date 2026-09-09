// Round 5: Liam's September annotations, turned into checks.
// The point of this file is that every threshold is justified by a real draft:
// the piece he called perfect must pass, and the specific things he flagged
// must fail. If a future change breaks that relationship, these tests say so.
import {
  enforceAnchorLength, enforceLinkSpacing, enforceParagraphSize,
  enforceSentenceVariety, enforcePromisedStructures, americanize,
} from "../src/lib/agents/writer.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const draft = (n) => readFileSync(`drafts/${n}.md`, "utf8");
const EXEMPLAR = "4-why-ai-doesnt-cite-crypto-brands";

console.log("the exemplar passes everything it inspired:");
{
  const md = draft(EXEMPLAR);
  for (const [name, fn] of [
    ["anchor length", enforceAnchorLength],
    ["link spacing", enforceLinkSpacing],
    ["paragraph size", enforceParagraphSize],
    ["sentence variety", enforceSentenceVariety],
  ]) {
    const err = throws(() => fn(md));
    ok(`${name} clears the piece he called perfect`, err === null, err);
  }
}

console.log("anchor length (\"long links taking up whole sentences\"):");
{
  const bad = "Some prose here. [BrightEdge has tracked AI agent requests reaching 88% of human organic search volume as of April 2026](https://x.com/a) and more.";
  const err = throws(() => enforceAnchorLength(bad));
  ok("a 16-word anchor is rejected", err !== null);
  ok("the offending anchor is quoted back", err?.includes("BrightEdge has tracked"));
  ok("a normal anchor passes", throws(() => enforceAnchorLength("See [our crypto GEO guide](https://coinpresso.io/x) for more.")) === null);
  ok("code blocks are ignored", throws(() => enforceAnchorLength("```\n[a b c d e f g h i j k l m n](https://x.com)\n```")) === null);
}

console.log("link spacing (\"links stuffed into a small body of text\"):");
{
  const bad = "One analysis found [96% of citations came from strong signals](https://a.com/x), which sounds like validation until you read the companion finding: [ranking first only correlates 22% of the time](https://b.com/y).";
  const err = throws(() => enforceLinkSpacing(bad));
  ok("two links 14 words apart are rejected", err !== null);
  ok("both anchors are named", err?.includes("96%") && err?.includes("ranking first"));
  const good = "First [one link](https://a.com) here, and then a good deal of intervening prose that carries the argument forward for a while before we reach [the second](https://b.com).";
  ok("well-spaced links pass", throws(() => enforceLinkSpacing(good)) === null);
  ok("links in separate paragraphs never collide", throws(() => enforceLinkSpacing("A [one](https://a.com).\n\n[Two](https://b.com) B.")) === null);
}

console.log("paragraph size (\"big sections of text which need breaking up\"):");
{
  const fat = Array(130).fill("word").join(" ") + ".";
  const err = throws(() => enforceParagraphSize(fat));
  ok("a 130-word paragraph is rejected", err !== null);
  ok("the count is reported", err?.includes("130 words"));
  ok("a 90-word paragraph passes", throws(() => enforceParagraphSize(Array(90).fill("word").join(" ") + ".")) === null);
  ok("link syntax is not counted as words", throws(() => enforceParagraphSize(
    Array(100).fill("word").join(" ") + " [a](https://averylongurlthatgoesonandonandon.com/with/many/segments) done."
  )) === null);
}

console.log("sentence variety (\"short snappy 1-liners... word salad\"):");
{
  const salad = "Short one. Then two. And three. Also four. Plus five. Now a sentence long enough that it clearly is not a short one at all by any measure.";
  const err = throws(() => enforceSentenceVariety(salad));
  ok("five short sentences in a row are rejected", err !== null);
  ok("the run is quoted", err?.includes("Short one."));
  ok("the note against overcorrecting is carried", err?.includes("encyclopedias"));
  const fine = "Short one. Then two. And three. Now here is a sentence with enough length and clauses in it that it plainly counts as a long one for these purposes.";
  ok("three in a row is fine — the exemplar does that", throws(() => enforceSentenceVariety(fine)) === null);
}

console.log("promised structures (his note, twice, in one round):");
{
  const err = throws(() => enforcePromisedStructures("Publish the figures in a table with a date beside each one."));
  ok("promising a table without one is rejected", err !== null);
  ok("a real markdown table satisfies it", throws(() => enforcePromisedStructures(
    "Publish the figures in a table.\n\n| Metric | Value |\n| --- | --- |\n| TVL | $4m |"
  )) === null);
  const e2 = throws(() => enforcePromisedStructures("This is the checklist Coinpresso runs against client sites."));
  ok("promising a checklist without one is rejected", e2 !== null);
  ok("a real list satisfies it", throws(() => enforcePromisedStructures(
    "This is the checklist we run.\n\n- Is TVL in crawlable text?\n- Is the audit in HTML?"
  )) === null);
  ok("the AI-parseability reason is given", e2?.includes("crawled/parsed"));
}

console.log("american spelling (his inline edits):");
{
  ok("centralised → centralized", americanize("a centralised exchange") === "a centralized exchange");
  ok("recognise → recognize", americanize("engines recognise it") === "engines recognize it");
  ok("optimisation → optimization", americanize("generative engine optimisation") === "generative engine optimization");
  ok("analyse → analyze", americanize("we analyse the page") === "we analyze the page");
  ok("behaviour → behavior", americanize("citation behaviour") === "citation behavior");
  ok("capitalization survives", americanize("Behaviour matters") === "Behavior matters");
  ok("URLs are never rewritten", americanize("[x](https://coinpresso.io/geo-llm-optimisation)") === "[x](https://coinpresso.io/geo-llm-optimisation)");
  ok("code is never rewritten", americanize("`centralised`") === "`centralised`");
  ok("anchor text is still fixed", americanize("[a centralised exchange](https://a.com)") === "[a centralized exchange](https://a.com)");
  ok("already-American text is untouched", americanize("a centralized exchange") === "a centralized exchange");
}

console.log("the three cleared drafts, americanized, still pass every check:");
for (const f of ["1-schema-markup-checklist","2-crypto-comparison-pages","3-how-ai-evaluates-defi-exchanges"]) {
  const md = americanize(draft(f));
  const errs = [enforceAnchorLength, enforceLinkSpacing, enforceParagraphSize]
    .map((fn) => throws(() => fn(md))).filter(Boolean);
  ok(`${f}: anchors, spacing and paragraphs`, errs.length === 0, errs[0]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
