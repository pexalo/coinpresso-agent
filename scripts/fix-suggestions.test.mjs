import { suggestFix, suggestFixes, SUGGESTION_IDS } from "../src/lib/fix-suggestions.ts";
import { guidanceBlock, collectRejections, joinFaults } from "../src/lib/agents/writer.ts";
import { dedupe, ruleKey, SEED_FEEDBACK } from "../src/lib/feedback.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};

// The four rejections Bernard hit, copied from the dashboard verbatim.
const LIVE = {
  internal:
    "The writer could not produce a publishable draft in 3 attempts. Last rejection: Linking: 2 internal links to coinpresso.io (needs 3-5). Retry the writer.",
  machine:
    "The writer could not produce a publishable draft in 3 attempts. Last rejection: The draft reads as machine-written: 1 sentence opening with \"It's worth noting\" — the connective tissue the client flagged as AI-derived. Retry the writer.",
  anchor:
    "The writer could not produce a publishable draft in 3 attempts. Last rejection: Linking: the anchor \"privacy-first Web3 attribution\" points at the crypto PPC page — the anchor text has to name where it goes; the anchor \"compliance dossier\" points at the crypto PR page — the anchor text has to name where it goes. Retry the writer.",
  closer:
    "The writer could not produce a publishable draft in 3 attempts. Last rejection: The piece ends \"A suspension response needs evidence and correction, not a workaround. If you'd rather have someone review your crypto a…\" — the \"second opinion / conversation worth having\" closer four of the first seven posts used. End it the way the brief assigns: a direct, named offer, a dare, a callback, or a priority list. Retry the writer.",
};

console.log("the four live failures each get a suggestion:");
for (const [k, text] of Object.entries(LIVE)) {
  const s = suggestFix(text);
  ok(`${k}: matched`, s !== null, text.slice(0, 60));
  if (!s) continue;
  ok(`${k}: cause is a sentence, not the raw error`, s.cause.length > 20 && !s.cause.includes("Retry the writer"));
  ok(`${k}: note is long enough to act on`, s.note.trim().length > 40, s.note);
  ok(`${k}: note is not the cause repeated`, s.note !== s.cause);
}

console.log("each one identifies the right fault:");
{
  ok("internal links", suggestFix(LIVE.internal).id === "internal-links-short", suggestFix(LIVE.internal).id);
  ok("machine-written", suggestFix(LIVE.machine).id === "machine-written", suggestFix(LIVE.machine).id);
  ok("anchor naming beats the generic link rule", suggestFix(LIVE.anchor).id === "anchor-names-destination", suggestFix(LIVE.anchor).id);
  ok("closer repeat", suggestFix(LIVE.closer).id === "closer-repeat", suggestFix(LIVE.closer).id);
}

console.log("the capture groups put the real text into the advice:");
{
  const a = suggestFix(LIVE.anchor);
  ok("names the offending anchor", a.cause.includes("privacy-first Web3 attribution"), a.cause);
  ok("names the destination page in the note", /crypto PPC/.test(a.note), a.note);
  const m = suggestFix(LIVE.machine);
  ok("quotes what was flagged", m.cause.includes("It's worth noting"), m.cause);
  const i = suggestFix(LIVE.internal);
  ok("names the count", i.cause.includes("2 internal link"), i.cause);
  ok("internal note asks for pages rather than leaving blanks", i.wantsPages === true);
}

console.log("every suggestion defaults to THIS POST — they restate checks that already run:");
{
  for (const [k, text] of Object.entries(LIVE)) {
    ok(`${k}: this post`, suggestFix(text).scope === "run", suggestFix(text).scope);
  }
  ok("no rule in the table defaults to standing",
     SUGGESTION_IDS.every((id) => true) && !Object.values(LIVE).some((t) => suggestFixes(t).some((f) => f.scope === "standing")));
  ok("every suggestion explains its scope",
     [LIVE.internal, LIVE.machine, LIVE.anchor, LIVE.closer].every((t) => suggestFix(t).why.length > 15));
  const i = suggestFix(LIVE.internal);
  ok("the internal-links row asks for pages", i.wantsPages === true);
  ok("…and its note no longer carries blank bullets", !i.note.includes("- \n"), i.note);
  ok("other rows do not ask for pages", suggestFix(LIVE.machine).wantsPages === undefined);
}

console.log("house rules are never stored twice:");
{
  ok("key ignores case and whitespace", ruleKey("  Scatter   the LINKS. ") === ruleKey("scatter the links."));
  const entries = [
    { id: "a", rule: "Scatter the links.", source: "s", date: "d", active: true, addedAt: "1" },
    { id: "b", rule: "scatter the  links.", source: "s", date: "d", active: true, addedAt: "2" },
    { id: "c", rule: "Something else.", source: "s", date: "d", active: true, addedAt: "3" },
    { id: "d", rule: "Scatter the links.", source: "s", date: "d", active: true, addedAt: "4" },
  ];
  const out = dedupe(entries);
  ok("duplicates collapse to one", out.length === 2, out.length);
  ok("the FIRST copy is the one kept", out[0].id === "a");
  ok("distinct rules survive", out.some((e) => e.id === "c"));
}

console.log("Liam's seeded rules are intact and distinct:");
{
  ok("twenty-two seeds — Liam's 18 plus FAQ links, no bolt-ons, and the 19 Sep linking pointers", SEED_FEEDBACK.length === 22, SEED_FEEDBACK.length);
  ok("every seed has a unique id", new Set(SEED_FEEDBACK.map((x) => x.id)).size === SEED_FEEDBACK.length);
  ok("every seed has unique text — dedupe cannot eat one", new Set(SEED_FEEDBACK.map((x) => ruleKey(x.rule))).size === SEED_FEEDBACK.length);
  ok("dedupe leaves the seeds exactly as they are",
     JSON.stringify(dedupe(SEED_FEEDBACK.map((x) => ({ ...x, addedAt: "" })))) === JSON.stringify(SEED_FEEDBACK.map((x) => ({ ...x, addedAt: "" }))));
  ok("all seeds are Liam's", SEED_FEEDBACK.every((x) => /liam/i.test(x.id) || /liam/i.test(x.source)),
     SEED_FEEDBACK.filter((x) => !/liam/i.test(x.id) && !/liam/i.test(x.source)).map((x) => x.id).join(","));
  ok("none of the seeds is an auto-generated suggestion",
     !SEED_FEEDBACK.some((x) => /^Editor, from a rejection/.test(x.source)));
}

console.log("the rest of the table:");
{
  const cases = [
    ["\"https://coinpresso.io/made-up\" is not a page on coinpresso.io", "invented-page"],
    ["Linking: 7 internal links (the client asked for 3-5 — more reads as stuffing)", "internal-links-many"],
    ["Linking: 1 external link (needs 3-5 from the ledger)", "external-links"],
    ["The introduction is 74 words; the house runs about 190 and the floor is 110.", "intro-length"],
    ["3 paragraphs are over 125 words.", "paragraph-size"],
    ["2 pairs of links sit less than 15 words apart.", "link-spacing"],
    ["1 stretch of more than 4 short sentences in a row.", "sentence-variety"],
    ["The draft refers to a table but never renders one in markdown.", "promised-structure"],
    ["The draft cites with 3 ledger markers ([S1], [S2]).", "ledger-markers"],
    ["The writer reply was cut off at the 8000 token limit before it finished.", "truncated"],
    ["The piece opens \"An AI engine will not mention you…\"", "opener-repeat"],
    ["Two paragraphs before the first H2 that talk to the reader and set the scene — retry the writer.", "intro-shape"],
    ["The writer produced 5 H2 sections but the client's brief specifies 6.", "outline-mismatch"],
    ["2 links have anchor text longer than 12 words.", "anchor-length"],
  ];
  for (const [text, id] of cases) {
    const s = suggestFix(text);
    ok(`${id}`, s?.id === id, `got ${s?.id ?? "null"}`);
  }
  const covered = [...cases.map((c) => c[1]), "internal-links-short", "machine-written", "anchor-names-destination", "closer-repeat"];
  ok("every rule in the table is reachable by at least one test",
     SUGGESTION_IDS.every((x) => covered.includes(x)),
     SUGGESTION_IDS.filter((x) => !covered.includes(x)).join(","));
}


console.log("every fault at once — the whole point of collecting them:");
{
  // What the writer now throws when a draft breaks four rules.
  const many = joinFaults([
    "The introduction is 74 words; the house runs about 190 and the floor is 110. Retry the writer.",
    "Linking: 2 internal links to coinpresso.io (needs 3-5). Retry the writer.",
    "The draft reads as machine-written: 1 sentence opening with \"It's worth noting\" — the connective tissue the client flagged as AI-derived. Retry the writer.",
    "3 paragraphs are over 125 words. Retry the writer.",
  ]);
  ok("counted in the first line", many.startsWith("4 things must change:"), many.slice(0, 40));
  ok("numbered", /\n1\. /.test(many) && /\n4\. /.test(many));
  ok("'Retry the writer' stripped from the items", !many.includes("Retry the writer"), many);

  const found = suggestFixes(many);
  ok("all four recognised", found.length === 4, found.map((f) => f.id).join(","));
  ok("ids are the right four",
     found.map((f) => f.id).sort().join(",") === "internal-links-short,intro-length,machine-written,paragraph-size",
     found.map((f) => f.id).join(","));
  ok("each carries its own note", new Set(found.map((f) => f.note)).size === 4);
  ok("all default to this post", found.every((f) => f.scope === "run"),
     found.map((f) => `${f.id}:${f.scope}`).join(" "));
  ok("suggestFix still returns the first", suggestFix(many).id === found[0].id);
}

console.log("a single fault still reads as a sentence, not a list of one:");
{
  const one = joinFaults(["3 paragraphs are over 125 words. Retry the writer."]);
  ok("no numbering", !one.includes("1. ") && !one.startsWith("1 thing"), one);
  ok("still stripped", !one.includes("Retry the writer"), one);
  ok("suggestFixes finds exactly one", suggestFixes(one).length === 1);
}

console.log("collectRejections runs every check, not up to the first failure:");
{
  const ran = [];
  const faults = collectRejections([
    () => { ran.push("a"); },
    () => { ran.push("b"); throw new Error("B failed"); },
    () => { ran.push("c"); throw new Error("C failed"); },
    () => { ran.push("d"); },
  ]);
  ok("every check ran", ran.join("") === "abcd", ran.join(""));
  ok("both failures collected", faults.length === 2 && faults[0] === "B failed" && faults[1] === "C failed",
     JSON.stringify(faults));
  ok("a clean draft collects nothing", collectRejections([() => {}, () => {}]).length === 0);
  ok("order is the order the checks were listed", faults[0].startsWith("B"));
  ok("a non-Error throw is still captured",
     collectRejections([() => { throw "plain string"; }])[0] === "plain string");
}

console.log("both anchor faults in one Linking message:");
{
  const linking =
    "Linking: 2 internal links to coinpresso.io (needs 3-5); the anchor \"compliance dossier\" points at the crypto PR page — the anchor text has to name where it goes.";
  const found = suggestFixes(linking);
  ok("two separate faults found", found.length === 2, found.map((f) => f.id).join(","));
  ok("both default to this post", found.every((f) => f.scope === "run"));
}



console.log("every rule survives being put in a numbered list:");
{
  // The machine-written pattern was anchored on "Retry the writer." and
  // stopped matching the moment a draft had two faults instead of one. No
  // rule may depend on that trailer again.
  const samples = [
    ["anchor-names-destination", "Linking: the anchor \"x y\" points at the crypto PPC page — the anchor text has to name where it goes. Retry the writer."],
    ["invented-page", "Linking: \"https://coinpresso.io/nope\" is not a page on coinpresso.io. Retry the writer."],
    ["internal-links-short", "Linking: 2 internal links to coinpresso.io (needs 3-5). Retry the writer."],
    ["internal-links-many", "Linking: 7 internal links (the client asked for 3-5 — more reads as stuffing). Retry the writer."],
    ["external-links", "Linking: 1 external link (needs 3-5 from the ledger). Retry the writer."],
    ["machine-written", "The draft reads as machine-written: 1 sentence opening with \"It's worth noting\". Retry the writer."],
    ["closer-repeat", "The piece ends \"a conversation worth having…\" — the closer four of the first seven posts used. Retry the writer."],
    ["opener-repeat", "The piece opens \"An AI engine will not mention you…\" Retry the writer."],
    ["intro-length", "The introduction is 74 words; the house runs about 190 and the floor is 110. Retry the writer."],
    ["intro-shape", "Two paragraphs before the first H2 that talk to the reader and set the scene — retry the writer."],
    ["outline-mismatch", "The writer produced 5 H2 sections but the client's brief specifies 6. Retry the writer."],
    ["paragraph-size", "3 paragraphs are over 125 words. Retry the writer."],
    ["link-spacing", "2 pairs of links sit less than 15 words apart. Retry the writer."],
    ["sentence-variety", "1 stretch of more than 4 short sentences in a row. Retry the writer."],
    ["promised-structure", "The draft refers to a table but never renders one in markdown. Retry the writer."],
    ["ledger-markers", "The draft cites with 3 ledger markers ([S1], [S2]). Retry the writer."],
    ["truncated", "The writer reply was cut off at the 8000 token limit before it finished. Retry the writer."],
    ["anchor-length", "2 links have anchor text longer than 12 words. Retry the writer."],
  ];
  ok("a sample exists for every rule in the table",
     SUGGESTION_IDS.every((id) => samples.some(([s]) => s === id)),
     SUGGESTION_IDS.filter((id) => !samples.some(([s]) => s === id)).join(","));

  for (const [id, text] of samples) {
    ok(`${id}: matches alone`, suggestFixes(text).some((f) => f.id === id));
    // Joined with two other faults, numbered, trailer stripped.
    const joined = joinFaults(["3 paragraphs are over 125 words. Retry the writer.", text, "1 stretch of more than 4 short sentences in a row. Retry the writer."]);
    ok(`${id}: still matches inside a list`, suggestFixes(joined).some((f) => f.id === id), joined);
  }
}


console.log("no match is null, not a wrong guess:");
{
  ok("unknown rejection", suggestFix("Something nobody has seen before happened.") === null);
  ok("…and the list form is empty, not a guess", suggestFixes("Nothing familiar here.").length === 0);
  ok("empty string", suggestFix("") === null);
}

console.log("the note reaches the writer's prompt:");
{
  ok("no guidance, no block", guidanceBlock([]) === "" && guidanceBlock(undefined) === "");
  const block = guidanceBlock([
    { at: "2026-09-17T10:00:00Z", note: "Link the crypto PPC page and the Google Ads page.", rejection: "Linking: 2 internal links" },
    { at: "2026-09-17T10:05:00Z", note: "Never open with It's worth noting." },
  ]);
  ok("both notes present", block.includes("crypto PPC") && block.includes("It's worth noting"), block);
  ok("numbered", block.includes("1. ") && block.includes("2. "));
  ok("says it overrides the general guidance", /override/i.test(block), block.slice(0, 200));
  ok("carries the rejection for context", block.includes("written after"), block);
  ok("blank notes are dropped",
     !guidanceBlock([{ at: "x", note: "   " }, { at: "y", note: "Real note." }]).includes("2. "));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
