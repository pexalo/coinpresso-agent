import { parseLinkMap, linkTargetsBlock, relevantPosts } from "../src/lib/link-map.ts";
import { COINPRESSO_PAGES, isCompetitorUrl, COMPETITOR_DOMAINS, ledgerIsViable, MIN_CITABLE_SOURCES } from "../src/lib/blog.ts";
import { nameAnchors, enforceLinks, tidyPunctuation, enforceFaqLinks, enforceCloser, enforceNoBoltOnLinks, dedupeLinksAcrossFaqs, repairInternalLinks } from "../src/lib/agents/writer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};
const throws = (f) => { try { f(); return null; } catch (e) { return e.message; } };

console.log("parseLinkMap — whatever the sheet looks like:");
{
  const csv = `URL,Primary anchor,Secondary anchors
https://coinpresso.io/crypto-ppc-marketing,crypto PPC,PPC agency | paid crypto ads
/crypto-google-ads,crypto Google Ads,"Google Ads for crypto, certified"
https://example.com/not-ours,x,y
https://coinpresso.io/crypto-ppc-marketing/,PPC marketing,`;
  const { pages, skipped } = parseLinkMap(csv);
  ok("two coinpresso pages", pages.length === 2, pages.length);
  ok("the other domain is skipped and reported", skipped.length === 1 && /example\.com/.test(skipped[0]));
  const ppc = pages.find((p) => p.url.endsWith("crypto-ppc-marketing"));
  ok("root-relative URL is expanded", pages.some((p) => p.url === "https://coinpresso.io/crypto-google-ads"));
  ok("duplicate URL rows merge their anchors", ppc.anchors.length === 4, ppc.anchors.join("|"));
  ok("first anchor is the topic", ppc.topic === "crypto PPC");
  ok("pipe-separated cell split", ppc.anchors.includes("paid crypto ads"));
  ok("a quoted cell with a comma survives", pages.some((p) => p.anchors.includes("Google Ads for crypto, certified")));
  ok("trailing slash normalised away", !pages.some((p) => p.url.endsWith("/")));

  const tsv = "Page\tKeyword\nhttps://coinpresso.io/crypto-seo\tcrypto SEO";
  ok("tab-separated works", parseLinkMap(tsv).pages[0]?.anchors[0] === "crypto SEO");
  const headerless = "https://coinpresso.io/crypto-pr,crypto PR,PR agency";
  ok("no header: first column URL, rest anchors", parseLinkMap(headerless).pages[0]?.anchors.length === 2);
  ok("empty input is empty", parseLinkMap("").pages.length === 0);
}

console.log("the alternates reach the checks:");
{
  const known = new Map([["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC | PPC agency | paid crypto ads"]]);
  const P = "https://coinpresso.io/crypto-ppc-marketing";
  ok("an anchor using a mapped alternate passes the naming check",
     throws(() => enforceLinks(`Talk to a [PPC agency](${P}) first.`, 5, known, undefined, "hard")) === null);
  ok("…and is left alone by the fixer", nameAnchors(`Talk to a [PPC agency](${P}) first.`, known) === `Talk to a [PPC agency](${P}) first.`);
  const vague = `Talk to [our team](${P}) first.`;
  ok("a vague anchor gets the FIRST phrase, not the whole list",
     nameAnchors(vague, known) === `Talk to [crypto PPC our team](${P}) first.`, nameAnchors(vague, known));
  const err = throws(() => enforceLinks(vague, 5, known, undefined, "hard"));
  ok("the error names the page by its first phrase only", /the crypto PPC page/.test(err) && !/\|/.test(err), err);
  const block = linkTargetsBlock([{ url: P, topic: "crypto PPC | PPC agency | paid crypto ads" }], P);
  ok("prompt block shows the alternates", /crypto PPC \(also: PPC agency, paid crypto ads\)/.test(block), block);
  ok("…and flags the pillar", /PILLAR/.test(block));
}

console.log("tidyPunctuation — the seam nobody looked at:");
{
  ok(".,", tidyPunctuation("a compliance surface., the same discipline") === "a compliance surface, the same discipline");
  ok("etc., is left alone", tidyPunctuation("wallets, exchanges, etc., and more") === "wallets, exchanges, etc., and more");
  ok("e.g., is left alone", tidyPunctuation("some, e.g., this") === "some, e.g., this");
  ok("doubled comma", tidyPunctuation("one,, two") === "one, two");
  ok("space before comma", tidyPunctuation("one , two") === "one, two");
  ok("clean prose untouched", tidyPunctuation("One. Two, three.") === "One. Two, three.");
  ok("code untouched", tidyPunctuation("```\nx., y\n```") === "```\nx., y\n```");
}

console.log("FAQ links, internal AND external (Liam, 18 Sep):");
{
  const known = new Map([["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"]]);
  // Superseded 19 Sep: Liam's later word is "keep users within our website
  // hierarchy", so an uncited figure in an FAQ is no longer pushed outward.
  const figures = [{ q: "Q?", a: "Google removed 8.3 billion ads in 2025." }];
  const soft = throws(() => enforceFaqLinks(figures, known, "soft"));
  ok("an uncited figure is not pushed to an external link", !/cite nothing/.test(soft ?? ""));
  const cited = [{ q: "Q?", a: "Google removed [8.3 billion ads](https://blog.google/x) in 2025. See [crypto PPC](https://coinpresso.io/crypto-ppc-marketing)." }];
  ok("cited and linked passes", throws(() => enforceFaqLinks(cited, known)) === null);
}

console.log("'second set of eyes' is the spent closer:");
{
  ok("caught", throws(() => enforceCloser("## X\n\nBody.\n\nContact us for a second set of eyes on it.")) !== null);
  ok("'second look' too", throws(() => enforceCloser("## X\n\nBody.\n\nHappy to take a second look.")) !== null);
  ok("a dare still passes", throws(() => enforceCloser("## X\n\nBody.\n\nOpen your source tonight and count the names.")) === null);
}


console.log("a link bolted onto the end of a section (Liam, Telegram 18 Sep):");
{
  const known = new Map([
    ["https://coinpresso.io/crypto-seo", "crypto SEO"],
    ["https://coinpresso.io/crypto-google-ads", "crypto Google Ads"],
  ]);
  // The exact sentence from the Doc.
  const liam = `## Crypto-specific risk inventory

Accounts get flagged more often than most verticals.

What we can say with confidence is that the account was being treated as a growth lever rather than a compliance surface, the same discipline we'd expect a project to bring to [crypto SEO](https://coinpresso.io/crypto-seo) or PR.`;
  const err = throws(() => enforceNoBoltOnLinks(liam, known));
  ok("the SEO clause is flagged", err !== null && /bolted/.test(err), err);
  ok("…and quoted so it can be cut", err && err.includes("crypto SEO"));

  const belongs = `## Crypto-specific risk inventory

Google Ads accounts in crypto get flagged more than most, and the certification rules sit on top of the behaviours the policy already watches.

Before writing an appeal, run the account against the five risk areas [crypto Google Ads](https://coinpresso.io/crypto-google-ads) work always trips over.`;
  ok("a closing link to a page the section is about is fine", throws(() => enforceNoBoltOnLinks(belongs, known)) === null,
     throws(() => enforceNoBoltOnLinks(belongs, known)));
  ok("a link mid-section is never a bolt-on",
     throws(() => enforceNoBoltOnLinks("## X\n\nSee [crypto SEO](https://coinpresso.io/crypto-seo) here.\n\nMore prose after it.", known)) === null);
  ok("an external link at the end is not a bolt-on",
     throws(() => enforceNoBoltOnLinks("## X\n\nGoogle removed ads in 2025, per [the report](https://blog.google/x).", known)) === null);
  ok("a table at the end is skipped",
     throws(() => enforceNoBoltOnLinks("## X\n\nProse.\n\n| a | b |\n| - | - |\n| 1 | [crypto SEO](https://coinpresso.io/crypto-seo) |", known)) === null);
}



console.log("Liam's mapped anchors are the compiled default (19 Sep):");
{
  const topicOf = (u) => COINPRESSO_PAGES.find((p) => p.url === u)?.topic;
  const cases = [
    ["https://coinpresso.io/", ["crypto marketing", "crypto marketing agency", "crypto advertising agency"]],
    ["https://coinpresso.io/web3-marketing-agency", ["Web3 marketing", "Web3 marketing agency"]],
    ["https://coinpresso.io/crypto-content", ["crypto content", "crypto copywriting", "crypto content writers"]],
    ["https://coinpresso.io/crypto-pr", ["crypto PR", "crypto press release distribution", "crypto press releases", "crypto PR agency"]],
    ["https://coinpresso.io/crypto-presale-marketing-services", ["crypto presale marketing", "presale marketing agency"]],
    ["https://coinpresso.io/crypto-ppc-marketing", ["crypto PPC", "crypto PPC agency", "crypto PPC marketing agency", "crypto PPC marketing services"]],
    ["https://coinpresso.io/smm-for-crypto", ["crypto social media management", "crypto SMM", "SMM for crypto"]],
  ];
  for (const [url, anchors] of cases) {
    const topic = topicOf(url);
    ok(`${url.replace("https://coinpresso.io", "") || "/"} is on the list`, Boolean(topic), url);
    ok(`  …carries all ${anchors.length} of his anchors`, anchors.every((a) => (topic ?? "").split(" | ").includes(a)), topic);
  }
  ok("the home page was added", topicOf("https://coinpresso.io/") !== undefined);
  ok("every page still has a non-empty topic", COINPRESSO_PAGES.every((p) => p.topic.trim().length > 0));
  ok("no duplicate URLs", new Set(COINPRESSO_PAGES.map((p) => p.url)).size === COINPRESSO_PAGES.length);
}

console.log("relevant posts, not just the most recent fifteen:");
{
  const posts = [
    { url: "https://coinpresso.io/blog/old-ppc-attribution", title: "Crypto PPC Attribution Explained", publishedAt: "2024-02-01" },
    { url: "https://coinpresso.io/blog/recent-nft", title: "NFT Launch Playbook", publishedAt: "2026-09-10" },
    { url: "https://coinpresso.io/blog/recent-defi", title: "DeFi Community Building", publishedAt: "2026-09-09" },
    { url: "https://coinpresso.io/blog/google-ads-policy", title: "Google Ads Policy for Exchanges", publishedAt: "2025-01-01" },
    { url: "https://coinpresso.io/blog/recent-email", title: "Email Flows for Token Launches", publishedAt: "2026-09-08" },
  ];
  const picked = relevantPosts(posts, "Google Ads suspensions and PPC attribution", 4, 1);
  ok("an old post on the topic beats recent ones off-topic",
     picked.slice(0, 2).some((p) => p.title.includes("PPC Attribution")) && picked.slice(0, 2).some((p) => p.title.includes("Google Ads Policy")),
     picked.map((p) => p.title).join(" | "));
  ok("recent work still gets a slot", picked.some((p) => p.publishedAt.startsWith("2026-09")));
  ok("nothing is duplicated", new Set(picked.map((p) => p.url)).size === picked.length);
  ok("the limit is honoured", picked.length === 4);
  ok("posts with no URL are dropped",
     relevantPosts([{ title: "No URL", publishedAt: "2026-01-01" }], "anything", 5).length === 0);
  ok("'crypto' and 'guide' do not count as overlap",
     relevantPosts([{ url: "https://coinpresso.io/blog/x", title: "The Complete Crypto Guide", publishedAt: "2020-01-01" },
                    { url: "https://coinpresso.io/blog/y", title: "NFT Royalties", publishedAt: "2026-01-01" }],
                   "The Complete Crypto Guide to NFT Royalties", 1, 0)[0].title === "NFT Royalties");
  ok("an empty archive is empty", relevantPosts([], "anything", 5).length === 0);
}



console.log("competitor agencies are never linked (Liam, 19 Sep: 'under any circumstances'):");
{
  ok("the one he flagged", isCompetitorUrl("https://stubgroup.com/blog/crypto-google-ads-disapproval/"));
  ok("subdomains count", isCompetitorUrl("https://docs.formo.so/guides/onchain-attribution"));
  ok("www is stripped", isCompetitorUrl("https://www.coinbound.io/x"));
  ok("Google is not a competitor", !isCompetitorUrl("https://blog.google/products/ads-commerce/2025-ads-safety-report/"));
  ok("a regulator is not", !isCompetitorUrl("https://www.fintrac-canafe.gc.ca/x"));
  ok("trade press is not", !isCompetitorUrl("https://www.searchenginejournal.com/x"));
  ok("coinpresso is not", !isCompetitorUrl("https://coinpresso.io/blog/x"));
  ok("garbage is not", !isCompetitorUrl("not a url"));
  ok("every vendor the attribution draft cited is on the list",
     ["formo.so", "northbeam.io", "mintfunnel.com", "tryflint.com", "coincile.io", "stubgroup.com", "coinbound.io"].every((d) => COMPETITOR_DOMAINS.includes(d)));

  const known = new Map([["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"]]);
  const body = `Per [StubGroup's guide](https://stubgroup.com/blog/x), keep the page legible.`;
  const err = throws(() => enforceLinks(body, 5, known, undefined, "hard"));
  ok("a competitor link in the body is HARD", err !== null && /competitor/.test(err), err);
  const faq = [{ q: "Q?", a: "See [Formo's docs](https://docs.formo.so/x)." }];
  ok("…and in an FAQ", /competitor/.test(throws(() => enforceFaqLinks(faq, known, "hard")) ?? ""));
}

console.log("external links are a ceiling, not a floor (keep readers in-house):");
{
  const known = new Map([
    ["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"],
    ["https://coinpresso.io/crypto-google-ads", "crypto Google Ads"],
    ["https://coinpresso.io/contact", "contact Coinpresso"],
  ]);
  const P = "https://coinpresso.io/crypto-ppc-marketing", G = "https://coinpresso.io/crypto-google-ads", C = "https://coinpresso.io/contact";
  const noExternal = `## A\n\nUse [crypto PPC](${P}) well.\n\n## B\n\nAnd [crypto Google Ads](${G}) too.\n\n## Conclusion\n\n[Contact Coinpresso](${C}).`;
  ok("zero external links is no longer a fault", !/external/.test(throws(() => enforceLinks(noExternal, 10, known)) ?? ""),
     throws(() => enforceLinks(noExternal, 10, known)));
  const many = noExternal + " Per [a](https://blog.google/1), [b](https://blog.google/2), [c](https://blog.google/3), [d](https://blog.google/4).";
  ok("four external links is a soft note", /external links/.test(throws(() => enforceLinks(many, 10, known, undefined, "soft")) ?? ""));
}

console.log("the conclusion does not introduce a page the body never discussed:");
{
  const known = new Map([
    ["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"],
    ["https://coinpresso.io/crypto-pr/web3-pr", "Web3 PR"],
    ["https://coinpresso.io/contact", "contact Coinpresso"],
  ]);
  const P = "https://coinpresso.io/crypto-ppc-marketing", W = "https://coinpresso.io/crypto-pr/web3-pr", C = "https://coinpresso.io/contact";
  const liam = `## Why attribution is hard\n\nWallet connects are not conversions, and [crypto PPC](${P}) reporting collapses them.\n\n## Conclusion\n\nOur work on [Web3 PR](${W}) covers the policy side. [Contact Coinpresso](${C}).`;
  const err = throws(() => enforceLinks(liam, 5, known, undefined, "soft"));
  ok("Web3 PR in the conclusion of a PPC piece is flagged", /never discusses/.test(err ?? "") && /Web3 PR/.test(err ?? ""), err);
  ok("the contact page in the conclusion is fine", !/never discusses[^;]*contact/i.test(err ?? ""));
  const fine = `## Why PR matters\n\nGood [Web3 PR](${W}) sets the record.\n\n## Conclusion\n\nSee the [Web3 PR](${W}) page.`;
  ok("a page the body discussed may be linked in the close", !/never discusses/.test(throws(() => enforceLinks(fine, 5, known, undefined, "soft")) ?? ""));
}

console.log("a page is linked once per post (Liam: 'duplicated use of crypto PPC'):");
{
  const P = "https://coinpresso.io/crypto-ppc-marketing";
  const body = `Body links [crypto PPC](${P}) here.`;
  const faqs = [
    { q: "Q1?", a: `Ask a [crypto PPC](${P}) partner.` },
    { q: "Q2?", a: `See [crypto Google Ads](https://coinpresso.io/crypto-google-ads).` },
    { q: "Q3?", a: `Also [crypto Google Ads](https://coinpresso.io/crypto-google-ads) again.` },
  ];
  const out = dedupeLinksAcrossFaqs(body, faqs);
  ok("the FAQ copy of a body link is unlinked, words kept", out[0].a === "Ask a crypto PPC partner.", out[0].a);
  ok("a page new to the FAQs keeps its first link", out[1].a.includes(`](https://coinpresso.io/crypto-google-ads)`));
  ok("…and loses its second", !out[2].a.includes("]("), out[2].a);
  ok("external links are untouched", dedupeLinksAcrossFaqs("x", [{ q: "Q", a: "[a](https://blog.google/x)" }])[0].a === "[a](https://blog.google/x)");
  ok("idempotent", JSON.stringify(dedupeLinksAcrossFaqs(body, out)) === JSON.stringify(out));
}

console.log("FAQ links point inward:");
{
  const known = new Map([["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"]]);
  const vendors = [
    { q: "Q1?", a: "Per [Google](https://blog.google/a)." },
    { q: "Q2?", a: "Per [the EDPB](https://edpb.europa.eu/b)." },
    { q: "Q3?", a: "Per [SEJ](https://searchenginejournal.com/c)." },
  ];
  const err = throws(() => enforceFaqLinks(vendors, known, "soft"));
  ok("three external, zero internal is flagged twice over", /no internal links/.test(err ?? "") && /off-site/.test(err ?? ""), err);
  const balanced = [{ q: "Q?", a: "See [crypto PPC](https://coinpresso.io/crypto-ppc-marketing), per [Google](https://blog.google/a)." }];
  ok("one in, one out is fine", throws(() => enforceFaqLinks(balanced, known, "soft")) === null);
}

console.log("the utility pages Liam named are linkable:");
{
  for (const u of ["https://coinpresso.io/contact", "https://coinpresso.io/about-us", "https://coinpresso.io/blog/category/case-studies", "https://coinpresso.io/blog"]) {
    ok(u.replace("https://coinpresso.io", ""), COINPRESSO_PAGES.some((p) => p.url === u));
  }
}



console.log("an invented coinpresso.io slug is repaired or unlinked, never left to fail:");
{
  const known = new Map([
    ["https://coinpresso.io/blog/google-ads-circumventing-systems-suspensions-why-crypto-accounts-get-hit", "Google Ads Circumventing Systems Suspensions"],
    ["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"],
  ]);

  // The exact failure: a plausible slug for a post that exists elsewhere.
  const invented = `See our [earlier piece on suspensions](https://coinpresso.io/blog/circumventing-systems-review).`;
  const out = repairInternalLinks(invented, known);
  ok("corrected to the real post",
     out.includes("](https://coinpresso.io/blog/google-ads-circumventing-systems-suspensions-why-crypto-accounts-get-hit)"), out);
  ok("the anchor text is untouched", out.includes("[earlier piece on suspensions]"));

  // Nothing close: the link comes off, the words stay.
  const nonsense = `Read our [guide to llamas](https://coinpresso.io/blog/llama-husbandry-2026) for more.`;
  ok("unmatched invention is unlinked, sentence intact",
     repairInternalLinks(nonsense, known) === "Read our guide to llamas for more.", repairInternalLinks(nonsense, known));

  // A real page is never touched.
  const real = `Talk to a [crypto PPC](https://coinpresso.io/crypto-ppc-marketing) team.`;
  ok("a real page is left alone", repairInternalLinks(real, known) === real);
  const ext = `Per [Google](https://blog.google/x).`;
  ok("external links are left alone", repairInternalLinks(ext, known) === ext);
  ok("fenced code untouched", repairInternalLinks("```\n[x](https://coinpresso.io/nope)\n```", known) === "```\n[x](https://coinpresso.io/nope)\n```");
  ok("idempotent", repairInternalLinks(out, known) === out);

  // And the hard check now passes on the repaired text.
  ok("the repaired body clears the invented-URL check",
     !/not a page/.test(throws(() => enforceLinks(out, 5, known, undefined, "hard")) ?? ""),
     throws(() => enforceLinks(out, 5, known, undefined, "hard")));
  ok("…and so does the unlinked one",
     !/not a page/.test(throws(() => enforceLinks(repairInternalLinks(nonsense, known), 5, known, undefined, "hard")) ?? ""));

  // A near-miss must not be linked to the wrong page.
  const oneWord = `See [the guide](https://coinpresso.io/blog/google-something-entirely-different-here).`;
  const r = repairInternalLinks(oneWord, known);
  ok("a single shared word is not enough to link", !r.includes("circumventing"), r);
}



console.log("a gutted ledger triggers fresh research instead of more writer attempts:");
{
  const vendor = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://formo.so/blog/${i}` }));
  const real = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://blog.google/${i}` }));

  // The attribution run: five vendors, two usable.
  const attribution = ledgerIsViable([...vendor(5), ...real(2)]);
  ok("five of seven vendors is not viable", !attribution.viable, JSON.stringify(attribution));
  ok("it counts what survived", attribution.citable === 2 && attribution.blocked === 5);
  ok("and says why in plain words", /only 2 citable sources/.test(attribution.reason ?? ""), attribution.reason);

  // A clean ledger writes as normal — no re-research, no extra spend.
  ok("a clean ledger is viable", ledgerIsViable(real(6)).viable);
  ok("one vendor out of eight is still viable", ledgerIsViable([...vendor(1), ...real(7)]).viable);

  // Just above the floor survives; just below does not.
  ok(`${MIN_CITABLE_SOURCES} citable is the floor and passes`, ledgerIsViable(real(MIN_CITABLE_SOURCES)).viable);
  ok("one below the floor fails", !ledgerIsViable(real(MIN_CITABLE_SOURCES - 1)).viable);

  // Majority-vendor fails even when the survivors clear the floor.
  const majority = ledgerIsViable([...vendor(6), ...real(4)]);
  ok("six of ten vendors fails despite four survivors", !majority.viable, JSON.stringify(majority));
  ok("…and says the research was built around them", /built around them/.test(majority.reason ?? ""));
  ok("an even split is not a majority", ledgerIsViable([...vendor(4), ...real(4)]).viable);
  ok("an empty ledger is not viable", !ledgerIsViable([]).viable);
}



{
  const { postIsLinkable } = await import("../src/lib/blog.ts");
  console.log("only posts from 2025 onwards are linkable (Liam, 21 Sep):");
  ok("2024 post is not linkable", postIsLinkable("2024-12-31") === false);
  ok("1 Jan 2025 is linkable", postIsLinkable("2025-01-01") === true);
  ok("2026 timestamp is linkable", postIsLinkable("2026-09-01T10:00:00Z") === true);
  ok("undated post is not linkable", postIsLinkable(undefined) === false);
}

{
  const { competitorProblems, competitorNamesIn } = await import("../src/lib/blog.ts");
  console.log("competitors by NAME, not only by link (Liam, 21 Sep: 'LuvKaizen are a competitor'):");
  const liam = "As LuvKaizen puts it, guaranteed is paid. SlicedBrand, a PR agency itself. Baden Bower's own agency ranking.";
  const p = competitorProblems({ body: liam });
  ok("LuvKaizen named without a link is caught", p.includes("names LuvKaizen"), p);
  ok("SlicedBrand and Baden Bower are caught", p.includes("names SlicedBrand") && p.includes("names Baden Bower"), p);
  ok("a quorum-media.com link is caught", competitorProblems({ body: "[x](https://quorum-media.com/blog/y)" }).length === 1);
  ok("Coinpresso's own 'crypto PR' is not a competitor", competitorNamesIn("Our crypto PR team runs the crypto PR playbook.").length === 0);
  ok("FAQ answers are checked too", competitorProblems({ body: "", faqs: [{ q: "Q?", a: "Per Sliced Brand, no." }] }).length === 1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
