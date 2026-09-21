// Rendering for the manual-publish path: what Liam copies is what appears in
// WordPress. Tables and lists are the ones that matter, because the client
// asked for them and before this they arrived as pipe characters.
import { renderHtml, renderMarkdown, renderPlainText, bodyOf } from "../src/lib/render.ts";
import { normaliseConclusionHeading } from "../src/lib/agents/writer.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, e); } };

const run = (body, faqs = []) => ({
  brief: { publication: "openpr", track: "blog", title: "T", keywords: [] },
  draft: { headline: "A Headline", dateline: null, body, faqs, tags: [], wordCount: 10 },
});

console.log("markdown tables survive into WordPress:");
{
  const html = renderHtml(run(`Intro line.

| Check | Passing looks like | Common failure |
| --- | --- | --- |
| Usage data | TVL in crawlable text | A Dune screenshot |
| Audit | HTML report | A linked PDF |

After the table.`));
  ok("a <table> is emitted", html.includes("<table>"));
  ok("headers become <th>", html.includes("<th>Check</th>") && html.includes("<th>Common failure</th>"));
  ok("rows become <td>", html.includes("<td>Usage data</td>") && html.includes("<td>A linked PDF</td>"));
  ok("the --- rule is not a data row", !html.includes("<td>---</td>"));
  ok("no raw pipes leak into the output", !/<p>[^<]*\|/.test(html), html.match(/<p>[^<]*\|[^<]*<\/p>/)?.[0]);
  ok("wrapped in the WordPress table block", html.includes('class="wp-block-table"'));
  ok("surrounding paragraphs still render", html.includes("<p>Intro line.</p>") && html.includes("<p>After the table.</p>"));
}

console.log("links and code inside table cells:");
{
  const html = renderHtml(run(`| Item | Where |
| --- | --- |
| APY | With \`validFrom\` set |
| Guide | [our GEO guide](https://coinpresso.io/geo) |`));
  ok("inline code becomes <code>", html.includes("<code>validFrom</code>"));
  ok("links inside cells stay links", html.includes('<a href="https://coinpresso.io/geo">our GEO guide</a>'));
}

console.log("lists:");
{
  const ul = renderHtml(run("Lead in.\n\n- First item\n- Second item\n- Third item"));
  ok("bullets become <ul>/<li>", ul.includes("<ul>") && ul.includes("<li>First item</li>"));
  ok("three items, three <li>", (ul.match(/<li>/g) || []).length === 3);
  const ol = renderHtml(run("Steps.\n\n1. Do this\n2. Then this"));
  ok("numbers become <ol>", ol.includes("<ol>") && ol.includes("<li>Do this</li>"));
  ok("a paragraph starting with a dash is not a list",
     renderHtml(run("- but this is the only line and it is a list")).includes("<ul>"));
  ok("a normal paragraph is still a paragraph",
     renderHtml(run("Just prose here.")).includes("<p>Just prose here.</p>"));
}

console.log("headings, FAQs and escaping:");
{
  const html = renderHtml(run("## A Section\n\nBody text.", [{ q: "Why?", a: "Because." }]));
  ok("## becomes h2", html.includes("<h2>A Section</h2>"));
  ok("FAQ questions become h3", html.includes("<h3>Why?</h3>"));
  ok("headline becomes h1", html.includes("<h1>A Headline</h1>"));
  ok("angle brackets are escaped", renderHtml(run("a < b & c")).includes("&lt;"));
}

console.log("the other two shapes still work:");
{
  ok("markdown keeps the table as markdown", renderMarkdown(run("| a | b |\n| --- | --- |")).includes("| a | b |"));
  ok("plain text strips heading marks", !renderPlainText(run("## Head\n\nBody")).includes("## "));
}


console.log("one Conclusion, then the FAQs — never 'Conclusion and FAQ' followed by 'FAQs':");
{
  const faqs = [{ q: "Q?", a: "A." }];
  const mk = (body) => run(body, faqs);
  const joined = "Intro.\n\n## Know what you are buying\n\nX.\n\n## Conclusion and FAQ\n\nThe end.";
  ok("writer normalises the joined heading", normaliseConclusionHeading(joined, true).includes("## Conclusion\n") && !normaliseConclusionHeading(joined, true).includes("and FAQ"));
  ok("…also 'Conclusion & FAQs'", normaliseConclusionHeading("## Conclusion & FAQs\n\nx", true) === "## Conclusion\n\nx");
  ok("…but leaves it when there are no FAQs to render", normaliseConclusionHeading(joined, false) === joined);
  ok("a plain 'Conclusion' is untouched", normaliseConclusionHeading("## Conclusion\n\nx", true) === "## Conclusion\n\nx");
  ok("'Conclusion' inside a longer heading is untouched", normaliseConclusionHeading("## Conclusion for founders\n\nx", true) === "## Conclusion for founders\n\nx");

  const html = renderHtml(mk(joined));
  ok("HTML from an old draft: exactly one FAQs heading", (html.match(/<h2>FAQs<\/h2>/g) || []).length === 1, html);
  ok("HTML from an old draft: the conclusion heading is just Conclusion", html.includes("<h2>Conclusion</h2>") && !html.includes("Conclusion and FAQ"));
  const md = renderMarkdown(mk(joined));
  ok("Markdown likewise", md.includes("## Conclusion\n") && (md.match(/## FAQs/g) || []).length === 1 && !md.includes("and FAQ"));
  ok("bodyOf leaves a draft with no FAQs alone (bar title case)", !/## Conclusion\n/.test(bodyOf({ body: joined, faqs: [] })) && /and FAQ/i.test(bodyOf({ body: joined, faqs: [] })));
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
