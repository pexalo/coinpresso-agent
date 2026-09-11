import { buildDoc } from "../src/lib/google-doc.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};
// What the doc will actually show at a range — the whole point of the test.
const at = (b, r) => b.text.slice(r.startIndex - 1, r.endIndex - 1);
const kinds = (b, k) => b.requests.filter(r => k in r);

console.log("headings:");
{
  const b = buildDoc("Title", "## First\n\nSome prose.\n\n## Second\n\nMore.");
  const h = kinds(b, "updateParagraphStyle");
  ok("h1 + two h2s", h.length === 3, h.length);
  ok("h1 covers the headline", at(b, h[0].updateParagraphStyle.range).trim() === "Title");
  ok("h2 text has no ## left", at(b, h[1].updateParagraphStyle.range).trim() === "First");
  ok("second h2 lands on Second", at(b, h[2].updateParagraphStyle.range).trim() === "Second");
  ok("body carries no markdown hashes", !b.text.includes("## "));
}

console.log("links:");
{
  const b = buildDoc("T", "See [our GEO guide](https://coinpresso.io/geo) for more.");
  const l = kinds(b, "updateTextStyle").filter(r => r.updateTextStyle.textStyle.link);
  ok("one link", l.length === 1);
  ok("anchor text is styled, not the url", at(b, l[0].updateTextStyle.range) === "our GEO guide", JSON.stringify(at(b, l[0].updateTextStyle.range)));
  ok("url preserved", l[0].updateTextStyle.textStyle.link.url === "https://coinpresso.io/geo");
  ok("no markdown syntax in text", !b.text.includes("](") && !b.text.includes("https://"));
}

console.log("backticks do not shift later spans (the drift bug):");
{
  const b = buildDoc("T", "A `sameAs` array and [a link](https://x.com/y) after it.");
  const l = kinds(b, "updateTextStyle").filter(r => r.updateTextStyle.textStyle.link);
  ok("link still lands on its anchor", at(b, l[0].updateTextStyle.range) === "a link", JSON.stringify(at(b, l[0].updateTextStyle.range)));
  ok("backticks stripped", !b.text.includes("`"));
  ok("code word survives", b.text.includes("sameAs"));
}

console.log("bold FAQ questions:");
{
  const b = buildDoc("T", "**Why does this happen?**\n\nBecause of the thing.");
  const bold = kinds(b, "updateTextStyle").filter(r => r.updateTextStyle.textStyle.bold);
  ok("one bold span", bold.length === 1);
  ok("bold covers the question", at(b, bold[0].updateTextStyle.range) === "Why does this happen?", JSON.stringify(at(b, bold[0].updateTextStyle.range)));
  ok("asterisks gone", !b.text.includes("**"));
}

console.log("mixed bold and links in one paragraph:");
{
  const b = buildDoc("T", "**Bold** then [link](https://a.com/b) then **more bold**.");
  const st = kinds(b, "updateTextStyle");
  const bold = st.filter(r => r.updateTextStyle.textStyle.bold);
  const link = st.filter(r => r.updateTextStyle.textStyle.link);
  ok("first bold correct", at(b, bold[0].updateTextStyle.range) === "Bold");
  ok("second bold correct", at(b, bold[1].updateTextStyle.range) === "more bold", JSON.stringify(at(b, bold[1].updateTextStyle.range)));
  ok("link correct", at(b, link[0].updateTextStyle.range) === "link", JSON.stringify(at(b, link[0].updateTextStyle.range)));
}

console.log("against the four real drafts:");
for (const f of ["1-schema-markup-checklist","2-crypto-comparison-pages","3-how-ai-evaluates-defi-exchanges","4-why-ai-doesnt-cite-crypto-brands"]) {
  const md = readFileSync(`drafts/${f}.md`, "utf8").trim();
  const headline = md.match(/^#\s+(.+)$/m)[1];
  const body = md.slice(md.indexOf("\n")).trim();
  const b = buildDoc(headline, body);
  const st = kinds(b, "updateTextStyle");
  const bad = st.filter(r => {
    const s = r.updateTextStyle.range;
    return s.startIndex < 1 || s.endIndex - 1 > b.text.length || s.endIndex <= s.startIndex;
  });
  const links = st.filter(r => r.updateTextStyle.textStyle.link);
  const expected = (md.match(/\]\(https?:/g) || []).length;
  ok(`${f}: every range inside the text`, bad.length === 0, bad.length);
  ok(`${f}: all ${expected} links carried`, links.length === expected, links.length);
  ok(`${f}: no markdown left`, !/\*\*|`|\]\(|^## /m.test(b.text));
  ok(`${f}: 11 headings (h1 + 9 sections + FAQs)`, kinds(b, "updateParagraphStyle").length === 11, kinds(b,"updateParagraphStyle").length);
}

console.log("markdown tables become readable rows, not a line of pipes:");
{
  const b = buildDoc("T", "Intro.\n\n| Check | Passing |\n| --- | --- |\n| Audit | HTML report |\n| Code | Public GitHub |\n\nAfter.");
  ok("no pipe characters survive", !b.text.includes("|"), b.text);
  ok("the --- rule is gone", !b.text.includes("---"));
  ok("each row is its own line", b.text.includes("\nAudit  ·  HTML report\n"), JSON.stringify(b.text));
  ok("three rows, three lines", (b.text.match(/ · /g) || []).length === 3);
  const bold = kinds(b, "updateTextStyle").filter(r => r.updateTextStyle.textStyle.bold);
  ok("the header row is bold", bold.length === 1 && at(b, bold[0].updateTextStyle.range) === "Check  ·  Passing",
     bold[0] && at(b, bold[0].updateTextStyle.range));
  ok("surrounding prose is untouched", b.text.includes("Intro.") && b.text.includes("After."));
}

console.log("faqs supplied separately (how the pipeline stores them):");
{
  const b = buildDoc("T", "## Only section\n\nProse.", [
    { q: "First question?", a: "First answer." },
    { q: "Second question?", a: "Second answer." },
  ]);
  const h = kinds(b, "updateParagraphStyle");
  ok("FAQs heading added", at(b, h[2].updateParagraphStyle.range).trim() === "FAQs", at(b, h[2].updateParagraphStyle.range));
  const bold = kinds(b, "updateTextStyle").filter(r => r.updateTextStyle.textStyle.bold);
  ok("both questions bold", bold.length === 2, bold.length);
  ok("question text exact", at(b, bold[1].updateTextStyle.range) === "Second question?", at(b, bold[1].updateTextStyle.range));
  ok("answers present as prose", b.text.includes("Second answer."));
  ok("no stray asterisks", !b.text.includes("*"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
