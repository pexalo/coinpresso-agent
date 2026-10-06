import { enforceDataAnswer } from "../src/lib/agents/writer.ts";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x); } };
const err = (f) => { try { f(); return ""; } catch (e) { return String(e); } };
const liam = ["If you don't have a minimum of $50,000 USD to begin in Month 1, you're not ready. We would spend $30k on PR and $20k on Meta Ads media spend alone. Some clients spend upwards of $500,000 a month. Spending $1k a day on PPC."];

console.log("Liam, 6 Oct: answer in its own structured section, not stuffed in the opening");
const stuffed = "Most budgets start at $50,000, with $30k on PR, $20k on Meta and $1k a day on PPC, up to $500,000 a month.\n\n## Why Budgets Vary\nText.\n\n## Channels\nText.\n";
ok("figures stuffed in the opening are flagged", /opening carries/.test(err(() => enforceDataAnswer(stuffed, liam))));
ok("no structured answer section is flagged", /no section gives/.test(err(() => enforceDataAnswer(stuffed, liam))));
const good = "A crypto presale needs at least $50,000 in month one to be worth running.\n\n## Crypto Presale Marketing Budget in 2026: The Numbers\nAcross the presale campaigns Coinpresso has run, month one needs at least $50,000.\n\n| Line item | Amount | What it buys |\n|---|---|---|\n| PR | $30k | coverage |\n| Meta Ads media | $20k | reach |\n| PPC | $1k a day | search demand |\n\n## Scaling\nUp to $500,000 a month once proven.\n";
ok("one-line answer up top + early table passes", err(() => enforceDataAnswer(good, liam)) === "", err(() => enforceDataAnswer(good, liam)));
const late = "Short answer: $50,000.\n\n## A\nx\n\n## B\nx\n\n## C\nx\n\n## Numbers\n- PR: $30k\n- Meta: $20k\n- PPC: $1k a day\n";
ok("answer section buried in section 4 is flagged", /move it to the first or second/.test(err(() => enforceDataAnswer(late, liam))));
ok("no data, no check", err(() => enforceDataAnswer(stuffed, [])) === "");
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
