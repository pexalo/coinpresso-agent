import { diffEdits, similarity } from "../src/lib/doc-edits.ts";
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
  ok("a deleted paragraph is not reported as a pair", diffEdits(current, deleted).length === 0);

  // Sections are attributed.
  const sec = current.replace("A disapproval blocks one ad.", "A disapproval knocks out one ad.");
  const s2 = diffEdits(current, sec);
  ok("a change under a heading names the section", s2[0]?.section === "Disapproval versus suspension", JSON.stringify(s2));

  // Links in our markdown vs plain text in the Doc are the same paragraph.
  ok("link syntax does not make a paragraph look edited",
     diffEdits("See [crypto PPC](https://coinpresso.io/x) for more on this topic today.", "See crypto PPC for more on this topic today.").length === 0);
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


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
