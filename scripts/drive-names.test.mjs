// Filenames that land in the client's Drive. Worth pinning, because a name is
// what somebody scans a folder by, and a bad one is only noticed once there
// are forty files in there.
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, e); } };

// Mirrors clean() in the drive route.
function clean(text, max = 90) {
  const flat = text.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : max).trim();
}
const featureName = (t) => `Feature image - ${clean(t)}.png`;
const sectionName = (t, s) => `Section image - ${clean(t)} - ${clean(s, 50)}.png`;

console.log("the client's naming convention:");
{
  ok("feature image name",
     featureName("E-E-A-T for Crypto Websites in the Age of AI Search") ===
     "Feature image - E-E-A-T for Crypto Websites in the Age of AI Search.png");
  ok("section image name",
     sectionName("Why ChatGPT and Perplexity Don't Cite Crypto Brands", "The Silent Suppression") ===
     "Section image - Why ChatGPT and Perplexity Don't Cite Crypto Brands - The Silent Suppression.png");
}

console.log("characters Drive or a filesystem would choke on:");
{
  const n = featureName("How to Market a Crypto Exchange: The 2026 Growth Playbook");
  ok("colons become spaces", !n.includes(":"), n);
  ok("no double spaces left", !n.includes("  "), n);
  ok("slashes never survive", !featureName("A/B testing: what works").includes("/"));
  for (const ch of ['"', "<", ">", "|", "*", "?"]) {
    ok(`"${ch}" is stripped`, !featureName(`Title with ${ch} in it`).includes(ch));
  }
}

console.log("long titles stay readable:");
{
  const long = "The Ultimate Guide to Strategic Partnerships in Crypto: How to Build, Manage, and Scale Alliances in 2026";
  const n = featureName(long);
  ok("trimmed under the cap", n.length <= 90 + "Feature image - .png".length, `${n.length}`);
  ok("cut on a word, not mid-word", !/\s\S{0,3}\.png$/.test(n) && !n.includes(" .png"), n);
  ok("still starts with the convention", n.startsWith("Feature image - "));
}

console.log("two section images from one post do not collide:");
{
  const t = "Schema Markup Checklist for Crypto Exchanges";
  const a = sectionName(t, "Schema for Crypto Wallets");
  const b = sectionName(t, "Schema for DeFi Protocols");
  ok("different sections, different names", a !== b);
  ok("both name the post", a.includes(t) && b.includes(t));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
