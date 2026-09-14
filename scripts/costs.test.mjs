import { priceFor, imagePrice, PRICED_ON } from "../src/lib/model-registry.ts";
import { estimateCost } from "../src/lib/models.ts";
import {
  buildReport, recordImageSpend, modelledUnitCost, modelledImageCost, forecast,
} from "../src/lib/costs.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

console.log("the register, as checked on", PRICED_ON);
{
  const s5 = priceFor("claude-sonnet-5", new Date("2026-09-14"));
  ok("Sonnet 5 is $2/$10 in September — the step-up did not happen", s5.in === 2 && s5.out === 10, JSON.stringify(s5));
  ok("Sonnet 5 cache write is 1.25x ($2.50)", near(s5.cacheWrite, 2.5), s5.cacheWrite);
  ok("Sonnet 5 cache read is 0.1x ($0.20)", near(s5.cacheRead, 0.2), s5.cacheRead);
  const o5 = priceFor("claude-opus-5");
  ok("Opus 5 cache: $6.25 / $0.50", near(o5.cacheWrite, 6.25) && near(o5.cacheRead, 0.5));
  const g5 = priceFor("gpt-5");
  ok("gpt-5: no write premium, read at 0.1x ($0.125)", near(g5.cacheWrite, 1.25) && near(g5.cacheRead, 0.125), JSON.stringify(g5));
  const g41 = priceFor("gpt-4.1");
  ok("gpt-4.1: read at 0.25x ($0.50)", near(g41.cacheWrite, 2) && near(g41.cacheRead, 0.5), JSON.stringify(g41));
  ok("unknown model is undefined, not zero-priced", priceFor("gpt-99") === undefined);
}

console.log("cached input priced at its own rate:");
{
  // 100k in, 90k of it a cache read, 1k out, on Sonnet 5.
  const naive = estimateCost("claude-sonnet-5", 100_000, 1_000);
  const real = estimateCost("claude-sonnet-5", 100_000, 1_000, new Date(), { read: 90_000 });
  ok("naive prices all input at base: $0.21", near(naive, 0.2 + 0.01), naive);
  ok("with the split: 10k fresh + 90k read = $0.038 + $0.01", near(real, 0.02 + 0.018 + 0.01), real);
  ok("that is the 10x-on-reads error, corrected", real < naive / 4, `${real} vs ${naive}`);

  const w = estimateCost("claude-sonnet-5", 20_000, 0, new Date(), { write: 20_000 });
  ok("a pure cache write costs 1.25x base (20k @ $2 = $0.04, x1.25)", near(w, 0.04 * 1.25), w);

  ok("no cache argument = old behaviour", near(estimateCost("claude-sonnet-5", 1_000_000, 0), 2));
  ok("cache larger than tin does not go negative",
     estimateCost("claude-sonnet-5", 1000, 0, new Date(), { read: 5000 }) >= 0);
  ok("unpriced model still $0", estimateCost("gpt-99", 1e6, 1e6) === 0);
}

console.log("image fees:");
{
  ok("landscape medium $0.041", near(imagePrice("gpt-image-2", "1536x1024", "medium"), 0.041));
  ok("landscape low is $0.005, not the $0.011 the code carried", near(imagePrice("gpt-image-2", "1536x1024", "low"), 0.005));
  ok("landscape high $0.165", near(imagePrice("gpt-image-2", "1536x1024", "high"), 0.165));
  ok("square medium $0.053", near(imagePrice("gpt-image-2", "1024x1024", "medium"), 0.053));
  ok("unknown quality falls back to medium", near(imagePrice("gpt-image-2", "1536x1024", "ultra"), 0.041));
  ok("unknown model is 0", imagePrice("dall-e-9", "1536x1024", "medium") === 0);
}

const mkRun = (over = {}) => ({
  id: "r1", clientRef: "coinpresso", createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z",
  brief: { title: "T", track: "blog" }, status: "approved", revisions: 0, totalCostUsd: 0,
  stages: [
    { id: "strategy", label: "Strategy", agent: "s", model: "claude-sonnet-5", status: "done", tokensIn: 30000, tokensOut: 4000, costUsd: 0.1, searchRequests: 8, searchCostUsd: 0.08 },
    { id: "writer", label: "Writer", agent: "w", model: "claude-sonnet-5", status: "done", tokensIn: 7000, tokensOut: 2600, costUsd: 0.04 },
  ],
  ...over,
});

console.log("recording the designer's spend on a run:");
{
  const run = mkRun({ totalCostUsd: 0.22 });
  const brief = { model: "claude-sonnet-5", tokensIn: 700, tokensOut: 60, cacheReadTokens: 0 };
  const s1 = recordImageSpend(run, 0.041, brief);
  ok("an image stage is appended", run.stages.some((s) => s.id === "image"));
  ok("one image, $0.041 fee", s1.images === 1 && near(s1.imageCostUsd, 0.041));
  const briefCost = 0.0007 * 2 + 0.00006 * 10;
  ok("brief tokens costed on the stage", near(s1.costUsd, briefCost), s1.costUsd);
  ok("run total went up by fee + brief", near(run.totalCostUsd, 0.22 + 0.041 + briefCost), run.totalCostUsd);
  ok("run carries totalImages / totalImageCostUsd", run.totalImages === 1 && near(run.totalImageCostUsd, 0.041));

  // A regenerate, then a section image (no brief call).
  recordImageSpend(run, 0.041, brief);
  const s3 = recordImageSpend(run, 0.041);
  ok("same stage reused, not three stages", run.stages.filter((s) => s.id === "image").length === 1);
  ok("three images accumulated", s3.images === 3 && near(s3.imageCostUsd, 0.123));
  ok("only two briefs' worth of tokens", s3.tokensIn === 1400 && near(s3.costUsd, briefCost * 2));
  ok("run total: fees x3 + briefs x2", near(run.totalCostUsd, 0.22 + 0.123 + briefCost * 2), run.totalCostUsd);
  ok("stage is labelled for the report", /Designer/.test(s3.label));
}

console.log("the report sees images:");
{
  const run = mkRun({ totalCostUsd: 0.22 });
  recordImageSpend(run, 0.041, { model: "claude-sonnet-5", tokensIn: 700, tokensOut: 60 });
  recordImageSpend(run, 0.041);
  const mock = mkRun({ id: "m", mock: true });
  recordImageSpend(mock, 0.041);
  const rep = buildReport([run, mock]);
  ok("two images on the report, mock excluded", rep.images === 2, rep.images);
  ok("image dollars separate from tokens", near(rep.imageCostUsd, 0.082) && !near(rep.tokenCostUsd, 0.082));
  ok("per-run line item carries images", rep.runsDetail[0].images === 2 && near(rep.runsDetail[0].imageCostUsd, 0.082));
  ok("blog track carries images", rep.tracks.find((t) => t.track === "blog").images === 2);
  const st = rep.stages.find((s) => s.id === "image");
  ok("image stage in the breakdown", !!st && st.images === 2, JSON.stringify(st));
  ok("image fee is NOT attributed to a text model", rep.models.every((m) => !near(m.costUsd, 0.082)));
  ok("brief tokens ARE attributed to the strategy model", rep.models.some((m) => m.model === "claude-sonnet-5"));
  ok("run total includes everything", near(rep.totalUsd, run.totalCostUsd));
}

console.log("the forecast models an image for the blog track:");
{
  ok("wire has no image cost", modelledImageCost("wire") === 0);
  ok("blog models one hero image plus brief", modelledImageCost("blog") > 0.041 && modelledImageCost("blog") < 0.05, modelledImageCost("blog"));
  ok("unit cost includes it", near(modelledUnitCost("blog") - modelledImageCost("blog"), modelledUnitCost("blog", 0.6) - modelledImageCost("blog")));
  const rep = buildReport([mkRun()]);
  const f = forecast(rep, { wirePerDay: 0, blogPerDay: 1 });
  const blog = f.find((x) => x.track === "blog");
  ok("one blog a day is modelled with one run of history", blog.basis === "modelled" && blog.sampleSize === 1);
  ok("per-month is 30 x per-article", near(blog.perMonthUsd, blog.perArticleUsd * 30));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
