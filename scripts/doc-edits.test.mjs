import { diffEdits, similarity, applyEdits, RULE_WORTHY_DISTANCE } from "../src/lib/doc-edits.ts";
import { docToMarkdown } from "../src/lib/google.ts";
import { dedupe, entryKey, feedbackBlock, DOC_EDITS_IN_PROMPT } from "../src/lib/feedback.ts";
import { COINPRESSO_PAGES, CLUSTER_NEIGHBOURS, clusterOf, clusterOfPillar } from "../src/lib/blog.ts";
import { enforceLinkCluster, nameAnchors, enforceNoExemplarPhrases } from "../src/lib/agents/writer.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, e); } };
const throws = (f) => { try { f(); return null; } catch (e) { return e.message; } };

console.log("reading Liam's edits back out of the Doc:");
{
  const exported = `# Google Ads Suspensions

A Circumventing Systems suspension is Google telling you it caught deliberate rule-breaking, not a mistake. That is a hard thing to accept when your account genuinely wasn't trying to break anything.

The policy doesn't weigh intent the way you might hope. It weighs patterns.

## Disapproval versus suspension

A disapproval blocks one ad. A suspension stops the account.`;

  const current = `# Google Ads Suspensions

A Circumventing Systems suspension is Google's way of saying it thinks you tried to trick it, not just broke a rule by accident. That's a serious accusation, and it comes with none of the usual "oops-a-daisy" courtesies.

The policy doesn't weigh intent the way you might hope. It weighs patterns.

## Disapproval versus suspension

A disapproval blocks one ad. A suspension stops the account.`;

  const edits = diffEdits(exported, current);
  ok("exactly one paragraph changed", edits.length === 1, JSON.stringify(edits.map((e) => e.after.slice(0, 40))));
  ok("it is the opening", edits[0]?.before.startsWith("A Circumventing Systems suspension is Google telling"));
  ok("with his text as the after", /oops-a-daisy/.test(edits[0]?.after ?? ""));
  ok("counted as a rewrite, not a typo", edits[0]?.distance >= 0.4, edits[0]?.distance);
  ok("no section for the intro", edits[0]?.section === undefined);
  ok("unchanged paragraphs are not reported", !edits.some((e) => /weighs patterns/.test(e.before)));
  ok("identical docs report nothing", diffEdits(exported, exported).length === 0);

  // A light edit still surfaces; a deleted paragraph does not pair.
  const light = current.replace("It weighs patterns.", "It weighs patterns, and crypto produces them.");
  const l = diffEdits(current, light);
  ok("a light edit is reported", l.length === 1 && l[0].distance < 0.4, JSON.stringify(l));
  const deleted = current.replace("The policy doesn't weigh intent the way you might hope. It weighs patterns.\n\n", "");
  const del = diffEdits(current, deleted);
  ok("a deleted paragraph is reported as a delete, not a rewrite", del.length === 1 && del[0].op === "delete" && /weighs patterns/.test(del[0].before), JSON.stringify(del));

  // Cuts and additions reach the app's draft, not only rewrites.
  {
    const draft = {
      body: "Intro paragraph that opens the whole post with some words.\n\n## Disapproval versus suspension\n\nA disapproval blocks one ad and leaves the account running.\n\nThat matters for what you do next, because a disapproval is a content problem.\n\n## What not to do\n\nDo not create a replacement account after a suspension.",
      faqs: [{ q: "Can a new account be created?", a: "No, Google treats it as circumvention of its systems." }],
    };
    const exp = "# T\n\n" + draft.body + "\n\n## FAQs\n\n**Can a new account be created?**\n\nNo, Google treats it as circumvention of its systems.";
    const doc = exp
      .replace("That matters for what you do next, because a disapproval is a content problem.\n\n", "")
      .replace("Do not create a replacement account after a suspension.", "Do not create a replacement account after a suspension.\n\nDo not rotate domains to dodge a flagged one, either, ever.");
    const ed = diffEdits(exp, doc);
    const r = applyEdits(draft, ed);
    ok("the cut paragraph is gone from the app's draft", !/That matters for what you do next/.test(r.draft.body), r.draft.body);
    ok("the added paragraph is in the app's draft", /rotate domains[\s\S]*$/.test(r.draft.body) && r.draft.body.indexOf("rotate") > r.draft.body.indexOf("replacement account"), r.draft.body);
    ok("nothing missed", r.missed.length === 0, JSON.stringify(r.missed));
    ok("no triple blank lines left behind", !/\n{3,}/.test(r.draft.body));
    const bad = applyEdits(draft, diffEdits(exp, "# T\n\nIntro paragraph that opens the whole post with some words."));
    ok("a Doc that reads back nearly empty deletes nothing", /A disapproval blocks one ad/.test(bad.draft.body) && /replacement account/.test(bad.draft.body));
  }

  // Sections are attributed.
  const sec = current.replace("A disapproval blocks one ad.", "A disapproval knocks out one ad.");
  const s2 = diffEdits(current, sec);
  ok("a change under a heading names the section", s2[0]?.section === "Disapproval versus suspension", JSON.stringify(s2));

  // Links in our markdown vs plain text in the Doc are the same paragraph.
  // The Doc now reads back with its links, so the same link is no edit…
  ok("the same link on both sides is not an edit",
     diffEdits("See [crypto PPC](https://coinpresso.io/x) for more on this topic today.", "See [crypto PPC](https://coinpresso.io/x) for more on this topic today.").length === 0);
  // …and a link he added or removed is one (Liam linked "crypto marketing" to the homepage).
  ok("a link added in the Doc is an edit",
     diffEdits("Here's the awkward bit for a lot of crypto marketing teams reading this.", "Here's the awkward bit for a lot of [crypto marketing](https://coinpresso.io/) teams reading this.").length === 1);
  ok("a one-word change is an edit (five areas → four areas)",
     diffEdits("Work through five areas before you touch the appeal form, in order.", "Work through four areas before you touch the appeal form, in order.").length === 1);
  ok("similarity is symmetric-ish and bounded", similarity("a b c", "a b c") === 1 && similarity("a", "z") === 0);
}

console.log("the sheet's pages, with clusters:");
{
  ok("about-us from the sheet, not /about", COINPRESSO_PAGES.some((p) => p.url.endsWith("/about-us")) && !COINPRESSO_PAGES.some((p) => p.url.endsWith("/about")));
  ok("programmatic-ads from the sheet", COINPRESSO_PAGES.some((p) => p.url.endsWith("/programmatic-ads")) && !COINPRESSO_PAGES.some((p) => p.url.endsWith("/crypto-programmatic-ads")));
  for (const u of ["/aso", "/facebook-crypto-advertising", "/ieo-marketing", "/crypto-exchange-marketing", "/crypto-edm", "/crypto-seo/link-building", "/crypto-content/for-reddit", "/crypto-content/web3-ghostwriting", "/airdrop-marketing"]) {
    ok(`${u} is on the list`, COINPRESSO_PAGES.some((p) => p.url.endsWith(u)));
  }
  ok("every page has a cluster", COINPRESSO_PAGES.every((p) => p.cluster));
  ok("no duplicate URLs", new Set(COINPRESSO_PAGES.map((p) => p.url.toLowerCase())).size === COINPRESSO_PAGES.length);
  ok("GEO is in the seo cluster", clusterOf("https://coinpresso.io/geo-llm-optimization-for-crypto-web3") === "seo");
  ok("PPC hub → paid", clusterOfPillar("https://coinpresso.io/crypto-ppc-marketing") === "paid");
  ok("every cluster neighbours itself and brand", Object.entries(CLUSTER_NEIGHBOURS).every(([c, n]) => n.includes(c) && n.includes("brand")));
  ok("Liam's example: seo does NOT neighbour paid", !CLUSTER_NEIGHBOURS.seo.includes("paid"));
  ok("…but does neighbour content", CLUSTER_NEIGHBOURS.seo.includes("content"));
  const home = COINPRESSO_PAGES.find((p) => p.url === "https://coinpresso.io/");
  ok("home carries branded anchors", /Coinpresso/.test(home.topic) && /crypto marketing agency/.test(home.topic));
}

console.log("links stay in the cluster (Liam's GEO example):");
{
  const known = new Map(COINPRESSO_PAGES.map((p) => [p.url.replace(/\/+$/, "").toLowerCase(), p.topic]));
  const GEO = "https://coinpresso.io/geo-llm-optimization-for-crypto-web3";
  const good = `## X\n\nWrite [crypto content](https://coinpresso.io/crypto-content) that [crypto SEO](https://coinpresso.io/crypto-seo) rewards, then [contact us](https://coinpresso.io/contact).`;
  ok("content, SEO and contact from a GEO post pass", throws(() => enforceLinkCluster(good, [], GEO, known)) === null,
     throws(() => enforceLinkCluster(good, [], GEO, known)));
  const bad = `## X\n\nRun some [crypto PPC](https://coinpresso.io/crypto-ppc-marketing) alongside.`;
  const err = throws(() => enforceLinkCluster(bad, [], GEO, known));
  ok("PPC from a GEO post is flagged", err !== null && /outside this post's cluster/.test(err), err);
  ok("…naming the stray", /crypto PPC/.test(err ?? ""));
  ok("FAQ links are checked too", throws(() => enforceLinkCluster("## X\n\nProse.", [{ q: "Q", a: bad }], GEO, known)) !== null);
  ok("no pillar, no check", throws(() => enforceLinkCluster(bad, [], undefined, known)) === null);
  ok("a blog post link is not clustered", throws(() => enforceLinkCluster("## X\n\nSee [our guide](https://coinpresso.io/blog/some-post).", [], GEO, known)) === null);
}

console.log("the anchor fixer replaces rather than prepends when the result is a mouthful:");
{
  const known = new Map([["https://coinpresso.io/crypto-google-ads", "crypto Google Ads | crypto ads on Google"]]);
  const G = "https://coinpresso.io/crypto-google-ads";
  const long = `covered under Google's [crypto-related product certification categories](${G}), you've created`;
  const out = nameAnchors(long, known);
  ok("the topic alone becomes the anchor", out.includes(`[crypto Google Ads](${G}) crypto-related product certification categories`), out);
  ok("no 'crypto Google Ads crypto-related…' mouthful", !out.includes("[crypto Google Ads crypto-related"));
  const short = `see the [policy page](${G}).`;
  ok("a short anchor is still prepended", nameAnchors(short, known).includes(`[crypto Google Ads policy page](${G})`), nameAnchors(short, known));
}


console.log("the example's phrase is not for reuse:");
{
  ok("'oops-a-daisy' in a new draft is flagged", /example opening/.test(throws(() => enforceNoExemplarPhrases("It comes with none of the usual oops-a-daisy courtesies.")) ?? ""));
  ok("case and hyphens do not matter", throws(() => enforceNoExemplarPhrases("Oops a Daisy, said nobody.")) !== null);
  ok("an opening with its own aside passes", throws(() => enforceNoExemplarPhrases("Google does not send a warning, a grace period, or so much as a stern look.")) === null);
}



console.log("the Doc reads back as markdown — links, bold, bullets:");
{
  const doc = { body: { content: [
    { paragraph: { paragraphStyle: { namedStyleType: "HEADING_1" }, elements: [{ textRun: { content: "Title\n" } }] } },
    { paragraph: { elements: [
      { textRun: { content: "Run a " } },
      { textRun: { content: "crypto PPC", textStyle: { link: { url: "https://coinpresso.io/crypto-ppc-marketing" } } } },
      { textRun: { content: " audit first.\n" } },
    ] } },
    { paragraph: { bullet: {}, elements: [
      { textRun: { content: "Ownership. ", textStyle: { bold: true } } },
      { textRun: { content: "Does it match?\n" } },
    ] } },
    { paragraph: { elements: [
      { textRun: { content: "split ", textStyle: { link: { url: "https://a.com" } } } },
      { textRun: { content: "link", textStyle: { link: { url: "https://a.com" } } } },
      { textRun: { content: " here.\n" } },
    ] } },
    { table: {} },
  ] } };
  const md = docToMarkdown(doc);
  ok("H1 comes back as '# '", md.startsWith("# Title"));
  ok("a link comes back as a markdown link", md.includes("Run a [crypto PPC](https://coinpresso.io/crypto-ppc-marketing) audit first."), md);
  ok("bold hugs the words, not the trailing space", md.includes("- **Ownership.** Does it match?"), md);
  ok("a bulleted paragraph gets '- '", /\n- \*\*Ownership/.test(md));
  ok("a link Docs split in two is one link", md.includes("[split link](https://a.com) here."), md);
  ok("tables are marked, not dumped", md.includes("| table |"));
}

console.log("his text goes into the draft with its links:");
{
  const draft = {
    body: "Intro paragraph with [crypto PPC](https://coinpresso.io/crypto-ppc-marketing) in it and more words besides.\n\n## Risks\n\n- **Ownership.** Are all linked accounts disclosed and consistent across the board?\n- **Scope.** Does it advertise only what it is certified for?",
    faqs: [{ q: "Can a new account be created?", a: "No. Google treats it as circumvention by definition in every case." }],
  };
  const edit = (before, afterRaw, distance = 0.5) => ({ before, after: afterRaw.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, ""), afterRaw, distance });

  // The old bug: a paragraph with a link was never found.
  const e1 = edit("Intro paragraph with crypto PPC in it and more words besides.",
                  "Intro, rewritten by Liam, with [crypto PPC](https://coinpresso.io/crypto-ppc-marketing) kept in it.");
  const r1 = applyEdits(draft, [e1]);
  ok("a paragraph that held a link is found and replaced", r1.applied === 1, JSON.stringify(r1.missed));
  ok("his link survives the swap", r1.draft.body.startsWith("Intro, rewritten by Liam, with [crypto PPC](https://coinpresso.io/crypto-ppc-marketing)"), r1.draft.body.slice(0, 90));

  const e2 = edit("Ownership. Are all linked accounts disclosed and consistent across the board?",
                  "**Ownership.** Are the billing entity, domain and applicant the same legal person?");
  const r2 = applyEdits(draft, [e2]);
  ok("a list item is replaced in place, marker kept", r2.draft.body.includes("\n- **Ownership.** Are the billing entity"), r2.draft.body);
  ok("its neighbour is untouched", r2.draft.body.includes("- **Scope.** Does it advertise only"));

  const e3 = edit("No. Google treats it as circumvention by definition in every case.", "No — and it is the fastest way to make things worse.");
  const r3 = applyEdits(draft, [e3]);
  ok("an FAQ answer is replaced", r3.applied === 1 && r3.draft.faqs[0].a.startsWith("No — and it is"));
  ok("headings are never touched", applyEdits(draft, [edit("Risks", "Something else")]).applied === 0);
  const r4 = applyEdits(draft, [edit("A paragraph that does not exist anywhere in this draft at all.", "x")]);
  ok("an edit it cannot place is reported, not guessed", r4.applied === 0 && r4.missed.length === 1);
  ok("the original draft object is not mutated", draft.body.startsWith("Intro paragraph with"));
}

console.log("end to end — edit in the Doc, sync, and the next diff is empty:");
{
  const exported = "# T\n\nThe policy doesn't weigh intent the way you might hope, and [crypto PPC](https://coinpresso.io/crypto-ppc-marketing) teams learn it late.\n\n## A\n\nA disapproval blocks one ad and a suspension stops the account.";
  const docMd = "# T\n\nGoogle does not care what you meant. It cares what it saw, and [crypto PPC](https://coinpresso.io/crypto-ppc-marketing) teams learn it the hard way.\n\n## A\n\nA disapproval blocks one ad and a suspension stops the account.";
  const edits = diffEdits(exported, docMd);
  ok("one edit found", edits.length === 1, JSON.stringify(edits));
  ok("it carries the raw markdown", edits[0].afterRaw.includes("](https://coinpresso.io/crypto-ppc-marketing)"));
  const draft = { body: exported.replace(/^# T\n\n/, ""), faqs: [] };
  const { draft: synced, applied } = applyEdits(draft, edits);
  ok("applied", applied === 1);
  const again = diffEdits("# T\n\n" + synced.body, docMd);
  ok("the second sync finds nothing — idempotent", again.length === 0, JSON.stringify(again));
}

console.log("edits become rules without clobbering each other:");
{
  const base = { rule: "The reviewer rewrote this paragraph by hand. Write the way the second version reads, not the first.", source: "Liam", date: "d", active: true, addedAt: "1", id: "a" };
  const a = { ...base, before: "one", after: "uno" };
  const b = { ...base, id: "b", before: "two", after: "dos" };
  ok("same rule text, different example → both kept", dedupe([a, b]).length === 2);
  ok("an exact repeat is dropped", dedupe([a, { ...a, id: "c" }]).length === 1);
  ok("keys differ on the example", entryKey(a) !== entryKey(b));
  ok("a typo fix is below the rule threshold", 0.1 < RULE_WORTHY_DISTANCE);

  const many = Array.from({ length: 30 }, (_, i) => ({ ...base, id: `e${i}`, before: `b${i}`, after: `a${i}`, kind: "doc-edit", addedAt: String(1000 + i) }));
  const written = { ...base, id: "w", rule: "Liam wrote this one on purpose.", kind: undefined };
  const block = feedbackBlock({ entries: [written, ...many], updatedAt: "" }, "writer");
  ok("every written rule is in the prompt", block.includes("Liam wrote this one on purpose."));
  ok(`only the newest ${DOC_EDITS_IN_PROMPT} edits ride along`, (block.match(/Not this: "b\d+"/g) || []).length === DOC_EDITS_IN_PROMPT,
     (block.match(/Not this: "b\d+"/g) || []).length);
  ok("and they are the newest", block.includes('"b29"') && !block.includes('"b0"'));
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
