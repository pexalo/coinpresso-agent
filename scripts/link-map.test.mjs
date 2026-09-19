import { parseLinkMap, linkTargetsBlock } from "../src/lib/link-map.ts";
import { nameAnchors, enforceLinks, tidyPunctuation, enforceFaqLinks, enforceCloser, enforceNoBoltOnLinks } from "../src/lib/agents/writer.ts";

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
  const figures = [{ q: "Q?", a: "Google removed 8.3 billion ads in 2025." }];
  const soft = throws(() => enforceFaqLinks(figures, known, "soft"));
  ok("figures with no citation is a note", /cite nothing/.test(soft ?? ""), soft);
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


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
