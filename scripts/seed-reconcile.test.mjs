import { coveredTopicIds, sameSubject } from "../src/lib/blog-seed.ts";
import { enforceIntro } from "../src/lib/agents/writer.ts";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x); } };
const err = (f) => { try { f(); return ""; } catch (e) { return String(e); } };
console.log("written topics leave the list (12 Oct)");
const topics = [
  { id: "a", topic: "Does AI Ever Recommend a Token to Buy? What LLMs Actually Say About Crypto Investing", status: "queued" },
  { id: "b", topic: "Crypto PPC Agency Red Flags: Questions to Ask Before You Hand Over Ad Account Access", status: "queued" },
  { id: "c", topic: "How Much Does It Cost to Market a Crypto Presale in 2026?", status: "queued" },
];
const runs = [
  { title: "Does AI Ever Recommend a Token to Buy? What LLMs Actually Say About Crypto Investing" },
  { title: "Something else entirely", seedTopicId: "c" },
];
ok("a post with the same title covers its topic", coveredTopicIds(topics, runs).includes("a"));
ok("a post carrying the topic id covers it", coveredTopicIds(topics, runs).includes("c"));
ok("an unwritten topic stays", !coveredTopicIds(topics, runs).includes("b"));
ok("near-identical titles match", sameSubject("Does AI ever recommend a token to buy?", "Does AI Ever Recommend a Token to Buy? What LLMs Say"));
ok("different subjects on the same theme do not", !sameSubject("How AI Engines Cite Crypto Exchanges", "Why AI Models Are Skeptical of Crypto Projects"));
console.log("intro floor");
const intro = (n) => Array.from({ length: n }, () => "word").join(" ") + ".\n\n## One\n";
ok("104 words fails a normal attempt", /floor is 110/.test(err(() => enforceIntro(intro(104)))));
ok("104 words passes the last attempt's floor", err(() => enforceIntro(intro(104), 70)) === "");
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
