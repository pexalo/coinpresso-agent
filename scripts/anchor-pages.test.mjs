import { nameAnchors, enforceFaqLinks } from "../src/lib/agents/writer.ts";
import { COINPRESSO_PAGES } from "../src/lib/blog.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};
const known = new Map(COINPRESSO_PAGES.map((p) => [p.url.replace(/\/+$/, "").toLowerCase(), p.topic]));

console.log("Liam, 4 Oct: FAQs confusing two anchor texts/pages");
const a = nameAnchors("Our [crypto PR team](https://coinpresso.io/contact) can help.", known);
ok("anchor naming another page is re-pointed, not glued", a === "Our [crypto PR team](https://coinpresso.io/crypto-pr) can help.", a);
const b = nameAnchors("See [crypto earned media](https://coinpresso.io/crypto-pr).", known);
ok("earned media goes to the earned media page", b.includes("(https://coinpresso.io/crypto-earned-media)"), b);
const c = nameAnchors("[Review your crisis management strategy](https://coinpresso.io/contact) now.", known);
ok("contact CTA reads as Contact Coinpresso to …", c.startsWith("[Contact Coinpresso](https://coinpresso.io/contact) to review your crisis"), c);
const d = nameAnchors("Talk to [our crypto PR team](https://coinpresso.io/crypto-pr).", known);
ok("a correct anchor is left alone", d === "Talk to [our crypto PR team](https://coinpresso.io/crypto-pr).", d);
const e = nameAnchors("[crisis management](https://coinpresso.io/contact)", known);
ok("one shared word is not a page (management ≠ community management)", !e.includes("community-management"), e);
let threw = "";
try { enforceFaqLinks([{ q: "q", a: "Start with [crypto SEO link audit](https://coinpresso.io/crypto-seo/link-building) first." }], known, "hard"); }
catch (err) { threw = String(err); }
ok("FAQ check rejects an anchor that names another page and only half-names its own", /mixes two pages/.test(threw), threw);

console.log("Share of Model Voice, 5 Oct");
{
  const k = new Map([...known, ["https://coinpresso.io/blog/best-web3-geo-agencies-in-2026-top-firms-for-ai-search-and-llm-visibility", "Best Web3 GEO Agencies in 2026: Top Firms for AI Search and LLM Visibility"]]);
  const out = nameAnchors("see our guide and our breakdown of [why ChatGPT and Perplexity don't cite crypto brands](https://coinpresso.io/blog/best-web3-geo-agencies-in-2026-top-firms-for-ai-search-and-llm-visibility).", k);
  ok("no '[and our breakdown]' anchor grown over a stopword", !/\[and our/.test(out), out);
  ok("a blog link whose words name nothing about the post is unlinked", !out.includes("](https://coinpresso.io/blog/best-web3"), out);
  const ok2 = nameAnchors("our ranking of [the top GEO agencies](https://coinpresso.io/blog/best-web3-geo-agencies-in-2026-top-firms-for-ai-search-and-llm-visibility).", k);
  ok("a blog link that does name the post stays", ok2.includes("[the top GEO agencies](https://coinpresso.io/blog/best-web3"), ok2);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
