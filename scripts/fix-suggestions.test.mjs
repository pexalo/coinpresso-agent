import { suggestFix, SUGGESTION_IDS } from "../src/lib/fix-suggestions.ts";
import { guidanceBlock } from "../src/lib/agents/writer.ts";

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
  ok("internal note leaves blank lines to fill in", i.note.includes("- "), i.note);
}

console.log("scope recommendations match the shape of the fault:");
{
  ok("a recurring style fault is standing", suggestFix(LIVE.machine).scope === "standing");
  ok("a repeated closer is standing", suggestFix(LIVE.closer).scope === "standing");
  ok("anchor naming is standing", suggestFix(LIVE.anchor).scope === "standing");
  ok("which pages to link is per-post", suggestFix(LIVE.internal).scope === "run");
  ok("an outline mismatch is per-post",
     suggestFix("The writer produced 5 H2 sections but the client's brief specifies 6.").scope === "run");
  ok("every suggestion explains its scope",
     SUGGESTION_IDS.length > 0 && [LIVE.internal, LIVE.machine, LIVE.anchor, LIVE.closer]
       .every((t) => suggestFix(t).why.length > 15));
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

console.log("no match is null, not a wrong guess:");
{
  ok("unknown rejection", suggestFix("Something nobody has seen before happened.") === null);
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
