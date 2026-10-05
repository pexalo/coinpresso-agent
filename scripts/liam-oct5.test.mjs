import { relevantInsights, houseDataBlock, insightPages, cleanInsight } from "../src/lib/insights.ts";
import { assignMoves, SPENT_OPENERS, INTRO_MOVES } from "../src/lib/blog.ts";
import { enforceFreshOpening, openingOf } from "../src/lib/agents/writer.ts";
import { SCENE_APPROACHES, CLICHE_PROPS } from "../src/lib/blog-image.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};
const throws = (f) => { try { f(); return ""; } catch (e) { return String(e); } };
const t = "2026-10-05T00:00:00Z";
const mk = (o) => ({ id: o.title, createdAt: t, updatedAt: t, tags: [], kind: "finding", ...o });

console.log("insights");
const all = [
  mk({ title: "Presale marketing budgets", body: "Retainers run $15k-$40k a month.", tags: ["presale", "budget"] }),
  mk({ title: "GEO results", body: "AI citations up 3x in 60 days for one client.", tags: ["geo"] }),
  mk({ title: "House rule", body: "We never guarantee listings.", always: true }),
  mk({ kind: "link", title: "Presale timeline post", body: "", url: "https://coinpresso.io/blog/presale-timeline", tags: ["presale"] }),
];
const got = relevantInsights(all, "How much does crypto presale marketing cost in 2026 presale budget");
ok("presale post gets the presale finding", got.some((x) => x.title === "Presale marketing budgets"));
ok("…and the always-on one", got.some((x) => x.title === "House rule"));
ok("…not the GEO one", !got.some((x) => x.title === "GEO results"));
ok("block says the figures are allowed", /ALLOWED/.test(houseDataBlock(got)) && /\$15k-\$40k/.test(houseDataBlock(got)));
ok("coinpresso.io link becomes linkable", insightPages(got).some((p) => p.url.endsWith("presale-timeline")));
ok("empty finding refused", /finding/.test(throws(() => cleanInsight({ kind: "finding", body: "x" }))));
ok("link without url refused", /link/.test(throws(() => cleanInsight({ kind: "link", body: "" }))));

const pinned = [...all, mk({ title: "Odd one", body: "Unrelated words entirely here.", topicIds: ["seed_42"] })];
ok("attached to the topic reaches the post whatever its words", relevantInsights(pinned, "presale budget", 10, { topicId: "seed_42" })[0].title === "Odd one");
ok("…and not other posts", !relevantInsights(pinned, "presale budget", 10, { topicId: "seed_7" }).some((x) => x.title === "Odd one"));
ok("run ids are kept clean", cleanInsight({ kind: "finding", body: "A long enough finding.", runIds: ["run_1", "../x", "run_1"] }).runIds.join() === "run_1,x");

console.log("openings");
const spent = (s) => SPENT_OPENERS.some((re) => re.test(s));
ok("Slack-channel belief is spent", spent("There's a belief going round a lot of founder Slack channels that presales sell themselves."));
ok("plain opening is not", !spent("Presale marketing for a $2M raise usually costs more than founders budget."));
ok("more moves to choose from", INTRO_MOVES.length >= 11);
const m = assignMoves([{ title: "A", contentType: "guide" }], [{ introMove: "answer" }, { introMove: "claim" }, { introMove: "scene" }]);
ok("history pushes a new post off recent moves", !["answer", "claim", "scene"].includes(m[0].introMove), m[0].introMove);
const body = "You've drafted the pitch email three times and deleted it three times, because the founder prefers not to share a name. Most go in the bin.\n\n## One\n";
ok("opening extracted", openingOf(body).startsWith("You've drafted"));
ok("same words as a recent opening flagged", /same words|reuses/.test(throws(() => enforceFreshOpening(body, ["You've drafted the launch thread four times and binned it."]))));
ok("different opening passes", throws(() => enforceFreshOpening(body, ["Presale budgets run higher than most teams plan for."])) === "");

console.log("images");
ok("magnifying glass is banned", CLICHE_PROPS.includes("magnifying glass"));
ok("several art directions", SCENE_APPROACHES.length >= 8);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
