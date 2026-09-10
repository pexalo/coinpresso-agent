// The template's own logic. Geometry is measured elsewhere; what is testable
// here is the title split, which decides where the accent colour stops — the
// one thing that silently produces an ugly image rather than an error.
import { splitTitle, TEMPLATE, CANVAS, PALETTE, SCENE_RULES, CHART_REQUEST, SECTION_RULES } from "../src/lib/blog-image.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};

console.log("title split — their own lead-in pattern:");
{
  const a = splitTitle("The Ultimate Guide To Link Building for Crypto Projects");
  ok("lead-in takes the accent", a.accent === "The Ultimate Guide To", a.accent);
  ok("subject stays white", a.rest === "Link Building for Crypto Projects", a.rest);
}
{
  const b = splitTitle("How to Market a Crypto Exchange: The 2026 Growth Playbook");
  ok("colon title splits at the colon", b.accent.endsWith(":"), b.accent);
  ok("the payoff is the white half", b.rest === "The 2026 Growth Playbook", b.rest);
}

console.log("titles with no lead-in still split sensibly:");
for (const t of [
  "E-E-A-T for Crypto Websites in the Age of AI Search",
  "Why ChatGPT and Perplexity Don't Cite Crypto Brands (And How to Fix It)",
  "Schema Markup Checklist for Crypto Exchanges, Wallets, and DeFi Protocols",
]) {
  const s = splitTitle(t);
  ok(`"${t.slice(0, 34)}…" both halves non-empty`, s.accent.length > 0 && s.rest.length > 0);
  ok(`"${t.slice(0, 34)}…" nothing lost`, `${s.accent} ${s.rest}`.replace(/\s+/g," ") === t.replace(/\s+/g," "));
  ok(`"${t.slice(0, 34)}…" accent is not the whole title`, s.accent.length < t.length);
}

console.log("degenerate input does not throw:");
{
  ok("single word", splitTitle("Schema").accent.length > 0);
  ok("empty string", splitTitle("").accent === "" && splitTitle("").rest === "");
  ok("runaway whitespace is collapsed", splitTitle("  a   b  ").accent === "a");
  ok("a two-word title keeps a white half", splitTitle("Schema Markup").rest === "Markup");
  ok("no title is ever entirely accent-coloured",
     ["A B", "A B C", "One Two Three Four"].every(t => splitTitle(t).rest.length > 0));
}

console.log("the measured template is intact:");
{
  ok("canvas matches their published size", CANVAS.w === 1024 && CANVAS.h === 576);
  ok("logo x is the measured 157", TEMPLATE.logo.x === 157);
  ok("logo y is the measured 130", TEMPLATE.logo.y === 130);
  ok("title left is the measured 163", TEMPLATE.title.x === 163);
  ok("accent is the sampled violet", PALETTE.accent === "#825AF0");
  ok("title column fits left of centre", TEMPLATE.title.x + TEMPLATE.title.maxWidth < CANVAS.w * 0.62);
  ok("a six-line title still clears the canvas",
     TEMPLATE.title.centerY + (TEMPLATE.title.maxLines / 2) * TEMPLATE.title.lineHeight < CANVAS.h);
}

console.log("the prohibitions the client's brand depends on:");
{
  const joined = SCENE_RULES.join(" | ");
  ok("no text is forbidden", /NO text/i.test(joined));
  ok("no real logos is forbidden", /NO real company logos/i.test(joined));
  ok("no people is forbidden", /NO people/i.test(joined));
  ok("the left side is reserved for the title", /left 45%|LEFT/i.test(joined));
}

console.log("section images refuse to invent data:");
{
  // The whole pipeline rejects unverified figures in the prose. Drawing them
  // convincingly in a picture would be the same failure with better lighting.
  const refused = [
    "a bar chart of market size 2024 to 2034",
    "line graph showing citation share by engine",
    "pie chart of the percentage breakdown",
    "an isometric scene with an x-axis and y-axis",
    "infographic of survey results",
    "show the CAGR climbing",
  ];
  for (const b of refused) ok(`refused: "${b.slice(0, 38)}"`, CHART_REQUEST.test(b));

  const allowed = [
    "cards labelled GitBook and GitHub chained to a cracked ring, warning markers on the broken links",
    "a vault opening with documents floating out of it",
    "three glossy spheres orbiting a magnifying glass",
    "a bridge of coins between two wallets",
  ];
  for (const b of allowed) ok(`allowed: "${b.slice(0, 38)}"`, !CHART_REQUEST.test(b));
}

console.log("section rules keep the same prohibitions as the hero:");
{
  const joined = SECTION_RULES.join(" | ");
  ok("no invented numbers", /NO paragraphs of text, NO invented numbers/i.test(joined));
  ok("no real logos", /NO real company logos/i.test(joined));
  ok("no people", /NO people/i.test(joined));
  ok("short labels are permitted, unlike the hero", /Short labels/i.test(joined));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
