import { buildDoc, parseTable, readTableShapes, fillTableRequests } from "../src/lib/google-doc.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};
// What the doc will actually show at a range — the whole point of the test.
const at = (b, r) => b.text.slice(r.startIndex - 1, r.endIndex - 1);
const kinds = (b, k) => b.requests.filter(r => k in r);
// Heading requests only — spacing requests are updateParagraphStyle too.
const heads = (b) => b.requests.filter(r => r.updateParagraphStyle?.fields === "namedStyleType");
const spacing = (b) => b.requests.filter(r => r.updateParagraphStyle?.fields?.includes("spaceBelow"));

console.log("headings:");
{
  const b = buildDoc("Title", "## First\n\nSome prose.\n\n## Second\n\nMore.");
  const h = heads(b);
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
  ok(`${f}: 11 headings (h1 + 9 sections + FAQs)`, heads(b).length === 11, heads(b).length);
}

console.log("paragraph spacing — the wall-of-text bug:");
{
  const b = buildDoc("Title", "## First\n\nOne.\n\nTwo.\n\n## Second\n\nThree.");
  const sp = spacing(b);
  ok("spacing is applied at all", sp.length >= 1, sp.length);

  const body = sp[0].updateParagraphStyle;
  ok("body spacing spans the whole document", body.range.startIndex === 1 && body.range.endIndex === b.text.length,
     JSON.stringify(body.range) + " of " + b.text.length);
  ok("paragraphs get space below", body.paragraphStyle.spaceBelow.magnitude === 10);
  ok("line spacing set", body.paragraphStyle.lineSpacing === 115);
  ok("spacing does not touch namedStyleType", !body.fields.includes("namedStyleType"), body.fields);

  // The ordering is the actual bug: namedStyleType resets the paragraph's own
  // metrics, so spacing set before the headings is thrown away.
  const firstHeading = b.requests.findIndex(r => r.updateParagraphStyle?.fields === "namedStyleType");
  const lastHeading = b.requests.map(r => r.updateParagraphStyle?.fields).lastIndexOf("namedStyleType");
  const firstSpacing = b.requests.indexOf(sp[0]);
  ok("every heading style is applied before any spacing", lastHeading < firstSpacing,
     `headings end ${lastHeading}, spacing starts ${firstSpacing}`);
  ok("headings still come first overall", firstHeading === 0);

  const above = sp.filter(r => r.updateParagraphStyle.paragraphStyle.spaceAbove?.magnitude === 18);
  ok("both h2s get room above them", above.length === 2, above.length);
  ok("the h1 does not", !above.some(r => r.updateParagraphStyle.range.startIndex === 1));
}

console.log("markdown tables become real Google Docs tables:");
{
  const b = buildDoc("T", "Intro.\n\n| Check | Passing |\n| --- | --- |\n| Audit | HTML report |\n| Code | Public GitHub |\n\nAfter.");
  ok("no pipe characters survive", !b.text.includes("|"), b.text);
  ok("the --- rule is gone", !b.text.includes("---"));
  ok("no cell text is left loose in the body", !b.text.includes("Audit") && !b.text.includes("Check"), JSON.stringify(b.text));
  ok("one table recorded", b.tables.length === 1, b.tables.length);
  ok("three rows including the header", b.tables[0].cells.length === 3, b.tables[0].cells.length);
  ok("two columns", b.tables[0].cells[0].length === 2);
  ok("header row first", b.tables[0].cells[0].join("|") === "Check|Passing", b.tables[0].cells[0].join("|"));
  ok("last row intact", b.tables[0].cells[2].join("|") === "Code|Public GitHub");
  ok("surrounding prose is untouched", b.text.includes("Intro.") && b.text.includes("After."));

  const ins = kinds(b, "insertTable");
  ok("one insertTable request", ins.length === 1, ins.length);
  ok("insertTable has the right shape", ins[0].insertTable.rows === 3 && ins[0].insertTable.columns === 2);
  ok("the table lands on its placeholder line", ins[0].insertTable.location.index === b.tables[0].offset + 1);
  ok("placeholder is a blank line, not lost text", b.text[b.tables[0].offset] === "\n");
  ok("the table goes in after every styling request",
     b.requests.findIndex(r => "insertTable" in r) === b.requests.length - 1);
}

console.log("several tables go in back-to-front, so no offset goes stale:");
{
  const md = "| A | B |\n| - | - |\n| 1 | 2 |\n\nMiddle.\n\n| C | D |\n| - | - |\n| 3 | 4 |";
  const b = buildDoc("T", md);
  ok("two tables", b.tables.length === 2);
  const ins = kinds(b, "insertTable").map(r => r.insertTable.location.index);
  ok("inserted highest index first", ins[0] > ins[1], ins.join(","));
  ok("indexes match the placeholders", ins[1] === b.tables[0].offset + 1 && ins[0] === b.tables[1].offset + 1);
}

console.log("ragged and padded rows:");
{
  ok("a short row is padded, not shifted left",
     JSON.stringify(parseTable("| A | B | C |\n| - | - | - |\n| 1 |  | 3 |")) === '[["A","B","C"],["1","","3"]]',
     JSON.stringify(parseTable("| A | B | C |\n| - | - | - |\n| 1 |  | 3 |")));
  ok("not a table without a rule", parseTable("| A | B |\n| 1 | 2 |") === null);
  ok("not a table at all", parseTable("Just a sentence.") === null);
}

console.log("reading the shape back from a documents.get response:");
{
  const doc = { body: { content: [
    { paragraph: {} },
    { table: { tableRows: [
      { tableCells: [{ content: [{ startIndex: 10 }] }, { content: [{ startIndex: 20 }] }] },
      { tableCells: [{ content: [{ startIndex: 30 }] }, { content: [{ startIndex: 40 }] }] },
    ] } },
  ] } };
  const shapes = readTableShapes(doc);
  ok("one table found", shapes.length === 1);
  ok("cell starts row-major", JSON.stringify(shapes[0].cellStarts) === "[[10,20],[30,40]]", JSON.stringify(shapes[0].cellStarts));
  ok("a document with no tables yields none", readTableShapes({ body: { content: [{ paragraph: {} }] } }).length === 0);
  ok("a malformed response does not throw", readTableShapes(null).length === 0);
}

console.log("filling the cells — simulated against a document that shifts:");
{
  // The whole risk is that writing into one cell moves every cell after it.
  // So apply the requests to a string exactly as Docs would, in order, and
  // check the text lands in the right cells and the styling covers it.
  const tables = [{ offset: 0, cells: [["Check", "Passing"], ["Audit", "**HTML** report"], ["Code", "[GitHub](https://github.com/x)"]] }];
  const shapes = [{ cellStarts: [[10, 20], [30, 40], [50, 60]] }];
  const reqs = fillTableRequests(tables, shapes);

  let doc = "-".repeat(80);
  const styled = [];
  for (const r of reqs) {
    if (r.insertText) {
      const i = r.insertText.location.index;
      doc = doc.slice(0, i) + r.insertText.text + doc.slice(i);
    } else {
      const { startIndex, endIndex } = r.updateTextStyle.range;
      styled.push({ style: r.updateTextStyle.textStyle, text: doc.slice(startIndex, endIndex) });
    }
  }

  const order = ["Check", "Passing", "Audit", "HTML report", "Code", "GitHub"];
  const positions = order.map(t => doc.indexOf(t));
  ok("every cell made it in", positions.every(p => p >= 0), JSON.stringify(positions));
  ok("cells are in row-major order in the document",
     positions.every((p, i) => i === 0 || p > positions[i - 1]), JSON.stringify(positions));
  ok("markdown is gone from the cells", !doc.includes("**") && !doc.includes("]("), doc);

  const bold = styled.filter(s => s.style.bold);
  ok("header cells bold", bold.some(s => s.text === "Check") && bold.some(s => s.text === "Passing"),
     JSON.stringify(bold.map(s => s.text)));
  ok("inline bold inside a cell lands on the word", bold.some(s => s.text === "HTML"),
     JSON.stringify(bold.map(s => s.text)));
  ok("body cells are not bolded wholesale", !bold.some(s => s.text === "Audit"));
  const links = styled.filter(s => s.style.link);
  ok("one link, on the anchor text only", links.length === 1 && links[0].text === "GitHub",
     JSON.stringify(links));
  ok("link url kept", links[0] && links[0].style.link.url === "https://github.com/x");
}

console.log("fewer shapes than tables does not throw:");
{
  ok("mismatch is survivable",
     fillTableRequests([{ offset: 0, cells: [["A"]] }, { offset: 5, cells: [["B"]] }], [{ cellStarts: [[10]] }]).length === 2);
}

console.log("faqs supplied separately (how the pipeline stores them):");
{
  const b = buildDoc("T", "## Only section\n\nProse.", [
    { q: "First question?", a: "First answer." },
    { q: "Second question?", a: "Second answer." },
  ]);
  const h = heads(b);
  ok("FAQs heading added", at(b, h[2].updateParagraphStyle.range).trim() === "FAQs", at(b, h[2].updateParagraphStyle.range));
  const bold = kinds(b, "updateTextStyle").filter(r => r.updateTextStyle.textStyle.bold);
  ok("both questions bold", bold.length === 2, bold.length);
  ok("question text exact", at(b, bold[1].updateTextStyle.range) === "Second question?", at(b, bold[1].updateTextStyle.range));
  ok("answers present as prose", b.text.includes("Second answer."));
  ok("no stray asterisks", !b.text.includes("*"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
