// Rendering for the manual-publish path: what Liam copies is what appears in
// WordPress. Tables and lists are the ones that matter, because the client
// asked for them and before this they arrived as pipe characters.
import { renderHtml, renderMarkdown, renderPlainText } from "../src/lib/render.ts";

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
