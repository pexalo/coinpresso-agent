// Round 5: Liam's September annotations, turned into checks.
// The point of this file is that every threshold is justified by a real draft:
// the piece he called perfect must pass, and the specific things he flagged
// must fail. If a future change breaks that relationship, these tests say so.
import {
  shortenAnchors,
  nameAnchors,
  stripAiOpeners,
  enforceProse,
  trimLinks,
  enforceFaqLinks,
  enforceLinks,
  enforceAnchorLength,
  splitFatParagraphs, enforceLinkSpacing, enforceParagraphSize,
  enforceSentenceVariety, enforcePromisedStructures, americanize,
} from "../src/lib/agents/writer.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};

const wordsInAnchor = (s) => (s.match(/\[([^\]]+)\]/)?.[1] ?? "").trim().split(/\s+/).length;
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const draft = (n) => readFileSync(`drafts/${n}.md`, "utf8");
const EXEMPLAR = "4-why-ai-doesnt-cite-crypto-brands";

console.log("the exemplar passes everything it inspired:");
{
  const md = draft(EXEMPLAR);
  for (const [name, fn] of [
    ["anchor length (after the code shortens it)", (m) => enforceAnchorLength(shortenAnchors(m))],
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
  // ONE tight pair is now tolerated — a source cited beside an analysis of it
  // is corroboration, and failing a run over it cost four articles. Two or
  // more is the density the client actually complained about.
  const onePair = "One analysis found [96% of citations came from strong signals](https://a.com/x), which sounds like validation until you read the companion finding: [ranking first only correlates 22% of the time](https://b.com/y).";
  ok("a single tight pair is tolerated", throws(() => enforceLinkSpacing(onePair)) === null,
     throws(() => enforceLinkSpacing(onePair)));
  const bad = onePair + " Then [a third](https://c.com) and [a fourth](https://d.com) right after it.";
  const err = throws(() => enforceLinkSpacing(bad));
  ok("a second tight pair is rejected", err !== null);
  ok("the anchors are named", err?.includes("96%") && err?.includes("ranking first"));
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
  // Anchors are capped at 5 words since Liam's 21 Sep review; the code shortens them.
  const md = shortenAnchors(americanize(draft(f)));
  const errs = [enforceAnchorLength, enforceLinkSpacing, enforceParagraphSize]
    .map((fn) => throws(() => fn(md))).filter(Boolean);
  ok(`${f}: anchors, spacing and paragraphs`, errs.length === 0, errs[0]);
}


console.log("shortenAnchors — the fix that replaced three paid retries:");
{
  const url = "https://example.com/deal";
  const liam = `Coinbase announced it was [signing a deal to acquire up to 90 million MORPHO tokens over four years](${url}), which surprised nobody.`;
  const out = shortenAnchors(liam);
  ok("the offending anchor no longer fails the check", throws(() => enforceAnchorLength(out)) === null, out);
  ok("an external anchor with a figure keeps the figure and its noun",
     out.includes(`acquire up to [90 million MORPHO tokens](${url}) over four years, which`), out);
  ok("nothing else in the sentence changed", out.startsWith("Coinbase announced it was signing") && out.endsWith("surprised nobody."));
  const g = shortenAnchors(`Google [blocked or removed over 8.3 billion ads in 2025 alone](https://blog.google/x) last year.`);
  ok("Liam's example: '8.3 billion ads'", g.includes("[8.3 billion ads](https://blog.google/x) in 2025 alone"), g);
  const t = shortenAnchors(`One account, [posted in a Google Ads community thread](https://community.shopify.com/t/1), says so.`);
  ok("Liam's example: the noun at the end", t.includes("posted in a [Google Ads community thread](https://community.shopify.com/t/1), says"), t);
  const r = shortenAnchors(`A disapproval is [normally cleared by editing and resubmitting](https://support.google.com/x) the asset.`);
  ok("tail after a preposition", r.includes("normally cleared by [editing and resubmitting](https://support.google.com/x) the asset"), r);
  const inner = shortenAnchors(`See our [crypto Google Ads practice for regulated exchanges](https://coinpresso.io/crypto-google-ads).`);
  ok("internal anchors keep the topic at the front", inner.includes("[crypto Google Ads practice](https://coinpresso.io/crypto-google-ads) for regulated exchanges"), inner);

  const short = `See [our crypto GEO guide](${url}) for more.`;
  ok("a short anchor is untouched", shortenAnchors(short) === short);

  const noBoundary = `[alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi](${url}) end.`;
  const nb = shortenAnchors(noBoundary);
  ok("with no boundary word it cuts at the limit", nb.startsWith(`[alpha beta gamma delta epsilon](${url}) zeta`), nb);

  const comma = `[one two three four five six seven eight nine ten eleven, twelve thirteen fourteen](${url}).`;
  ok("trailing punctuation does not end up inside the link", !/,\]\(/.test(shortenAnchors(comma)), shortenAnchors(comma));

  const early = `[to be clear about this the deal was signed on Tuesday morning in Zurich](${url}) x.`;
  ok("never cuts to fewer than two words", wordsInAnchor(shortenAnchors(early)) >= 2, shortenAnchors(early));

  const code = "```\n[a b c d e f g h i j k l m n o](https://x.com)\n```\n\n" + liam;
  const c = shortenAnchors(code);
  ok("fenced code is left alone", c.includes("[a b c d e f g h i j k l m n o](https://x.com)"));
  ok("…while the prose after it is still fixed", throws(() => enforceAnchorLength(c)) === null);

  ok("idempotent", shortenAnchors(out) === out);
}


console.log("lists are not walls of text — the bug that killed the Google Ads run:");
{
  // Markdown lists use single newlines, so a four-item checklist was ONE
  // "paragraph" to every check here. None of the five posts the 125-word cap
  // was derived from contains a bullet, so nothing caught it until an article
  // reached for a list and could not be published.
  const checklist = `Google looks at four things when it decides two accounts are the same operator.

- **Ownership and verification** — does the registered business, the billing entity, and any related verification documents all point at the same legal person, because advertiser verification ties an account to a named entity and that entity is what gets matched against the suspended one.
- **Payment instruments** — the card, the bank account and the billing address, any one of which is enough on its own to join two accounts together inside the system without anybody reviewing it.
- **Device and network** — the browser fingerprint, the logged-in Google identity, and the IP range the account is habitually operated from over a period of weeks.
- **Landing page and domain** — the destination URL, its registrar record, and whether the site is a near copy of the one that was suspended in the first place.

That is the mechanism, and none of it is discretionary.`;

  ok("a four-item checklist is not one fat paragraph",
     throws(() => enforceParagraphSize(checklist)) === null,
     throws(() => enforceParagraphSize(checklist)));
  ok("the whole list really is over the cap when counted as one block",
     checklist.split(/\n{2,}/)[1].split(/\s+/).length > 125,
     checklist.split(/\n{2,}/)[1].split(/\s+/).length);

  // Numbered lists too.
  const numbered = `1. ${"word ".repeat(70)}\n2. ${"word ".repeat(70)}`;
  ok("numbered lists split the same way", throws(() => enforceParagraphSize(numbered)) === null);

  // A single genuinely enormous bullet is still a fault — it IS a wall of text.
  const fatBullet = `- ${"word ".repeat(140)}`;
  ok("one enormous bullet is still rejected", throws(() => enforceParagraphSize(fatBullet)) !== null);

  // Links in different bullets are not "stuffed together".
  const twoBullets = `- The first point cites [Google's 2024 Ads Safety Report](https://a.com) as its source.
- The second cites [Search Engine Land's analysis](https://b.com) of the very same report.`;
  ok("two links in two bullets are not a tight pair",
     throws(() => enforceLinkSpacing(twoBullets)) === null,
     throws(() => enforceLinkSpacing(twoBullets)));

  // Table rows are not prose either.
  const table = `| Check | What it means |\n| --- | --- |\n| ${"word ".repeat(70)} | ${"word ".repeat(70)} |`;
  ok("table rows are not paragraphs", throws(() => enforceParagraphSize(table)) === null);
}

console.log("one close pair is a citation beside its source, not stuffing:");
{
  const corroborating = `Google published the [2024 Ads Safety Report](https://a.com), and a [Search Engine Land analysis of the same report](https://b.com) put that number in context for advertisers suspended under the policy that year who wanted to know what their odds actually were.`;
  ok("one tight pair is tolerated", throws(() => enforceLinkSpacing(corroborating)) === null,
     throws(() => enforceLinkSpacing(corroborating)));

  const stuffed = `Read [one](https://a.com) and [two](https://b.com) and [three](https://c.com) and [four](https://d.com) before you do anything else today.`;
  const err = throws(() => enforceLinkSpacing(stuffed));
  ok("several tight pairs still fail", err !== null);
  ok("the count is reported", err && err.startsWith("3 pairs"), err && err.slice(0, 30));
  ok("every offending pair is named", err && (err.match(/→/g) || []).length === 3);
}

console.log("splitFatParagraphs — mechanical, like the split Liam did by hand:");
{
  const long =
    "The suspension notice arrives with a policy name attached to it and almost nothing else of any use. " +
    "That is deliberate on Google's part, because naming the exact signal that fired would tell the next operator precisely which signal to go and avoid, and the enforcement team has said as much in public more than once over the past several years. " +
    "So the advertiser is left to work out what actually happened from the shape of their own account history and whatever they can remember changing. " +
    "Most of them conclude that it must have been the landing page, because the landing page is the thing they changed most recently before the ban arrived in their inbox. " +
    "That conclusion is usually wrong, and believing it is what costs them the appeal they were entitled to win.";
  ok("the fixture really is over the cap", long.split(/\s+/).length > 125, long.split(/\s+/).length);
  ok("rejected before the fix", throws(() => enforceParagraphSize(long)) !== null);

  const fixed = splitFatParagraphs(long);
  ok("split into more than one paragraph", fixed.split(/\n{2,}/).length > 1, fixed.split(/\n{2,}/).length);
  ok("passes after the fix", throws(() => enforceParagraphSize(fixed)) === null, throws(() => enforceParagraphSize(fixed)));
  ok("no word is lost or invented",
     fixed.replace(/\s+/g, " ").trim() === long.replace(/\s+/g, " ").trim(),
     fixed.slice(0, 80));
  ok("splits at a sentence end, never mid-sentence",
     fixed.split(/\n{2,}/).slice(0, -1).every((p) => /[.!?]$/.test(p.trim())), fixed);
  ok("neither half is a fragment",
     fixed.split(/\n{2,}/).every((p) => p.split(/\s+/).length > 15),
     fixed.split(/\n{2,}/).map((p) => p.split(/\s+/).length).join(","));

  ok("a short paragraph is untouched", splitFatParagraphs("Two sentences. That is all.") === "Two sentences. That is all.");
  ok("lists are left alone", splitFatParagraphs(fatBullet0()) === fatBullet0());
  ok("one unbroken sentence is left for a person",
     splitFatParagraphs("word ".repeat(140).trim()) === "word ".repeat(140).trim());
  ok("fenced code is untouched",
     splitFatParagraphs("```\n" + "word ".repeat(140) + "\n```") === "```\n" + "word ".repeat(140) + "\n```");
  ok("idempotent", splitFatParagraphs(fixed) === fixed);
}
function fatBullet0() { return `- ${"word ".repeat(140).trim()}`; }



console.log("nameAnchors — the fix that replaced three $0.75 attempts:");
{
  const known = new Map([
    ["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"],
    ["https://coinpresso.io/crypto-google-ads", "crypto Google Ads"],
    ["https://coinpresso.io/crypto-pr", "crypto PR"],
  ]);
  const ppc = "https://coinpresso.io/crypto-ppc-marketing";
  const passes = (b) => throws(() => enforceLinks(b, 5, known)) === null ||
    !/anchor text has to name where it goes/.test(throws(() => enforceLinks(b, 5, known)));

  // The live failure, verbatim shape.
  const live = `Most operators bring in an [agency partner](${ppc}) at this point, and that is usually the right call.`;
  const out = nameAnchors(live, known);
  ok("the anchor now names the page", out.includes(`[crypto PPC agency partner](${ppc})`), out);
  ok("…and the naming check passes", passes(out), throws(() => enforceLinks(out, 5, known)));
  ok("nothing else in the sentence changed", out.startsWith("Most operators bring in an ") && out.endsWith("the right call."));

  // The topic is already just before the link: grow backwards, add nothing.
  const before = `Most operators bring in a crypto PPC [agency partner](${ppc}) at this point.`;
  const grown = nameAnchors(before, known);
  ok("grows backwards over the topic already in the sentence",
     grown === `Most operators bring in a [crypto PPC agency partner](${ppc}) at this point.`, grown);
  ok("no word was duplicated", !grown.includes("crypto PPC crypto PPC"));

  // Does not grow backwards across punctuation.
  const punct = `We handle crypto PPC. Our [agency partner](${ppc}) does the rest.`;
  const p2 = nameAnchors(punct, known);
  ok("will not pull words across a full stop", p2.includes(`Our [crypto PPC agency partner](${ppc})`), p2);

  // Already fine: untouched.
  const fine = `See [our crypto PPC service](${ppc}) for more.`;
  ok("an anchor that already names the page is untouched", nameAnchors(fine, known) === fine);

  // A single distinctive word is enough — "PPC" alone.
  const short = `See [PPC options](${ppc}) here.`;
  ok("one shared real word is enough", nameAnchors(short, known) === short);

  // External links are never touched.
  const ext = `Per [the report](https://example.com/report), numbers fell.`;
  ok("external links are left alone", nameAnchors(ext, known) === ext);

  // Unknown internal page: left for the invented-URL check.
  const unknown = `See [this](https://coinpresso.io/not-a-page).`;
  ok("an unlisted internal page is left alone", nameAnchors(unknown, known) === unknown);

  // Order with shortenAnchors: topic goes on the front, so trimming from the
  // end keeps it.
  const long = `Read the [long anchor of many words that goes on and on for a while more](${ppc}).`;
  const both = shortenAnchors(nameAnchors(long, known));
  // A long anchor now gets the topic ALONE as the link and the rest as
  // prose, which shortenAnchors then has nothing to cut.
  ok("a long anchor becomes the topic alone, rest as prose", /\[crypto PPC\]\(.*\) long anchor of many words/.test(both), both);
  ok("and is within the length cap afterwards", throws(() => enforceAnchorLength(both)) === null);

  ok("fenced code untouched", nameAnchors("```\n[x](" + ppc + ")\n```", known) === "```\n[x](" + ppc + ")\n```");
  ok("idempotent", nameAnchors(out, known) === out);

  // Two bad anchors in one paragraph, each to a different page.
  const two = `Use an [agency partner](${ppc}) and a [specialist](https://coinpresso.io/crypto-google-ads).`;
  const t2 = nameAnchors(two, known);
  ok("every bad anchor fixed, each with its own page's topic",
     t2.includes("[crypto PPC agency partner]") && t2.includes("[crypto Google Ads specialist]"), t2);
}



console.log("stripAiOpeners — the throat-clear comes off, the sentence stays:");
{
  const cases = [
    ["It's worth noting that the policy changed in March.", "The policy changed in March."],
    ["It's worth noting the policy changed in March.", "The policy changed in March."],
    ["It is worth noting that the policy changed.", "The policy changed."],
    ["Furthermore, the appeal window is short.", "The appeal window is short."],
    ["Separately, a related analysis found the same thing.", "A related analysis found the same thing."],
    ["Additionally, two accounts share a card.", "Two accounts share a card."],
    ["Moreover, the domain matched.", "The domain matched."],
    ["In conclusion, do not do this.", "Do not do this."],
    ["It's worth noting: the policy changed.", "The policy changed."],
  ];
  for (const [inp, want] of cases) {
    ok(`"${inp.slice(0, 28)}…"`, stripAiOpeners(inp) === want, JSON.stringify(stripAiOpeners(inp)));
  }

  // Mid-paragraph, after a full stop, with prose either side.
  const mid = "The ban is automatic. It's worth noting that the appeal is not. Read the notice twice.";
  ok("mid-paragraph opener removed, neighbours untouched",
     stripAiOpeners(mid) === "The ban is automatic. The appeal is not. Read the notice twice.", stripAiOpeners(mid));

  // After a newline.
  ok("after a newline", stripAiOpeners("Heading\nFurthermore, x happened.") === "Heading\nX happened.");

  // Starts a link.
  ok("a link right after the opener", stripAiOpeners("It's worth noting that [the policy](https://a.com) changed.") === "[The policy](https://a.com) changed.",
     stripAiOpeners("It's worth noting that [the policy](https://a.com) changed."));

  // Not a match inside a word or mid-sentence.
  ok("'additionally' mid-sentence is not an opener",
     stripAiOpeners("The fee is charged additionally to the deposit.") === "The fee is charged additionally to the deposit.");

  // Nothing after it: left alone for the check.
  ok("an opener with nothing after it is left", stripAiOpeners("It's worth noting.") === "It's worth noting.");

  // The check passes afterwards on the live failure shape.
  const live = "The ban is automatic. It's worth noting that the appeal is not.";
  const rejectedBefore = throws(() => enforceProse(live));
  ok("the live shape is rejected untreated", rejectedBefore !== null && /machine-written/.test(rejectedBefore));
  ok("…and passes after stripping", throws(() => enforceProse(stripAiOpeners(live))) === null,
     throws(() => enforceProse(stripAiOpeners(live))));

  ok("fenced code untouched", stripAiOpeners("```\nFurthermore, x\n```") === "```\nFurthermore, x\n```");
  ok("idempotent", stripAiOpeners(stripAiOpeners(mid)) === stripAiOpeners(mid));
  ok("clean prose untouched", stripAiOpeners("The policy changed. So did the fee.") === "The policy changed. So did the fee.");
}



console.log("taste checks cannot fail a run — a guard on the writer's own source:");
{
  // Read the pipeline block rather than call it: writeBlog needs a model.
  // The guard is against someone moving a taste check back into the hard
  // list, which is a one-line edit that costs $0.85 a bounce.
  const src = readFileSync(new URL("../src/lib/agents/writer.ts", import.meta.url), "utf8");
  const hardStart = src.indexOf("const faults = collectRejections([");
  const hardEnd = src.indexOf("if (faults.length) throw", hardStart);
  const softStart = src.indexOf("const styleNotes = collectRejections([");
  const softEnd = src.indexOf(".map((f) =>", softStart);
  ok("both blocks exist", hardStart > 0 && softStart > hardStart);
  const hard = src.slice(hardStart, hardEnd);
  const soft = src.slice(softStart, softEnd);

  for (const taste of ["enforceCloser", "enforceLinkSpacing", "enforceParagraphSize", "enforceSentenceVariety"]) {
    ok(`${taste} is a style note, not a rejection`, soft.includes(taste) && !hard.includes(taste));
  }
  for (const must of ["enforceIntro", "enforceNoLedgerMarkers", "enforcePromisedStructures"]) {
    ok(`${must} still rejects`, hard.includes(must) && !soft.includes(must));
  }
  ok("enforceLinks is hard for targets and soft for counts",
     hard.includes('"hard")') && soft.includes('"soft")'));
  ok("the hard block throws; the soft block does not",
     src.slice(hardEnd, hardEnd + 80).includes("throw new Error(joinFaults(faults))") &&
     !src.slice(softStart, softEnd + 120).includes("throw"));
  ok("style notes land on the draft", src.includes("styleNotes: styleNotes.length ? styleNotes : undefined"));

  // The passage that cost $2.90 — five short sentences of good prose — is
  // exactly what the soft check flags and what must no longer fail a run.
  const liamWouldApprove = "Knowing the detection mechanics doesn't get you reinstated. Knowing your own cause does. Build a factual record, not a defense. The difference matters more than it sounds like it should. A defense argues you didn't do anything wrong.";
  ok("the $2.90 passage still trips the counter", throws(() => enforceSentenceVariety(liamWouldApprove)) !== null);
  ok("…which is why the counter is now a note", true);
}



console.log("an anchor made of generic words can still name its page:");
{
  const known = new Map([["https://coinpresso.io/web3-marketing-agency", "Web3 marketing"]]);
  const url = "https://coinpresso.io/web3-marketing-agency";
  const exact = `See our [Web3 marketing](${url}) work.`;
  const err = throws(() => enforceLinks(exact, 5, known, undefined, "hard"));
  ok("'Web3 marketing' → the Web3 marketing page is NOT a fault", err === null, err);
  ok("nameAnchors leaves it alone", nameAnchors(exact, known) === exact);
  const vague = `See our [services](${url}) here.`;
  ok("a vague anchor to that page still gets the topic prepended",
     nameAnchors(vague, known).includes(`[Web3 marketing services](${url})`), nameAnchors(vague, known));
}

console.log("link counts are soft, invented URLs are hard:");
{
  const known = new Map([
    ["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"],
    ["https://coinpresso.io/crypto-google-ads", "crypto Google Ads"],
  ]);
  const two = `Use [crypto PPC](https://coinpresso.io/crypto-ppc-marketing) and [crypto Google Ads](https://coinpresso.io/crypto-google-ads). Per [a report](https://a.com), [another](https://b.com), and [a third](https://c.com), it works.`;
  ok("two internal links is not a HARD fault", throws(() => enforceLinks(two, 5, known, undefined, "hard")) === null,
     throws(() => enforceLinks(two, 5, known, undefined, "hard")));
  const softErr = throws(() => enforceLinks(two, 5, known, undefined, "soft"));
  ok("…but it is a SOFT note", softErr !== null && /2 related internal links/.test(softErr), softErr);
  const invented = `See [crypto PPC](https://coinpresso.io/made-up-page).`;
  ok("an invented URL is HARD", /not a page/.test(throws(() => enforceLinks(invented, 5, known, undefined, "hard")) ?? ""));
  ok("'all' still reports everything", /2 related internal/.test(throws(() => enforceLinks(two, 5, known)) ?? ""));
}

console.log("trimLinks no longer strips the links the check demands:");
{
  const P = "https://coinpresso.io/crypto-ppc-marketing";
  const G = "https://coinpresso.io/crypto-google-ads";
  const R = "https://coinpresso.io/crypto-programmatic-ads";
  // Third internal link sits in a paragraph that already has two citations.
  const body = `Intro with [crypto PPC](${P}) link.\n\nAnother section with [crypto Google Ads](${G}).\n\nPer [one](https://a.com) and [two](https://b.com), the [crypto programmatic](${R}) page shows it.`;
  const out = trimLinks(body);
  const internal = (out.match(/\]\(https:\/\/coinpresso\.io/g) || []).length;
  ok("all three internal links survive", internal === 3, out);
  ok("an external was shed instead", (out.match(/\]\(https:\/\/[ab]\.com/g) || []).length === 1, out);

  // A list with a link per bullet is not a crowded paragraph.
  const list = `- [crypto PPC](${P}) point.\n- [crypto Google Ads](${G}) point.\n- [crypto programmatic](${R}) point.`;
  ok("one link per bullet, nothing shed", trimLinks(list) === list, trimLinks(list));

  // Over the cap in ordinary prose is still trimmed.
  const stuffed = `A [crypto PPC](${P}), [crypto Google Ads](${G}), [crypto programmatic](${R}), and [x](https://x.com) all here.`;
  ok("a genuinely crowded paragraph is still trimmed", (trimLinks(stuffed).match(/\]\(/g) || []).length <= 3);
  ok("…and it sheds the external before an internal",
     !trimLinks(stuffed).includes("](https://x.com)") && trimLinks(stuffed).includes(`](${P})`));
}



console.log("FAQ answers carry internal links (Liam, 18 Sep):");
{
  const known = new Map([["https://coinpresso.io/crypto-ppc-marketing", "crypto PPC"]]);
  const P = "https://coinpresso.io/crypto-ppc-marketing";
  const none = [{ q: "Q1?", a: "An answer with no link." }, { q: "Q2?", a: "Another." }];
  const soft = throws(() => enforceFaqLinks(none, known, "soft"));
  ok("no links across the block is a SOFT note", soft !== null && /no internal links/.test(soft), soft);
  ok("…and not a hard fault", throws(() => enforceFaqLinks(none, known, "hard")) === null);
  ok("the note quotes Liam", /Liam|client's note/.test(soft));

  const one = [{ q: "Q1?", a: `Use [crypto PPC](${P}) for that.` }, { q: "Q2?", a: "Another." }];
  ok("one link across the block satisfies it", throws(() => enforceFaqLinks(one, known)) === null);

  const invented = [{ q: "Q1?", a: "See [crypto PPC](https://coinpresso.io/nope)." }];
  ok("an invented URL in an FAQ is HARD", /not a page/.test(throws(() => enforceFaqLinks(invented, known, "hard")) ?? ""));

  const vague = [{ q: "Q1?", a: `See [our team](${P}).` }];
  ok("an FAQ anchor that does not name its page is HARD", /has to name/.test(throws(() => enforceFaqLinks(vague, known, "hard")) ?? ""));
  ok("no FAQs at all is fine", throws(() => enforceFaqLinks([], known)) === null);
  ok("external links in FAQs do not count and do not fail",
     /no internal links/.test(throws(() => enforceFaqLinks([{ q: "Q?", a: "Per [x](https://x.com)." }], known, "soft")) ?? ""));
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
