// ---------------------------------------------------------------------------
// Proposing new topics FOR THE QUEUE, from the ones already in it.
//
// Distinct from the day planner, and the difference matters. The planner turns
// a queue into a day of posts to write now — it is a scheduling decision with a
// cost attached. This is upstream of that: it fills the inbox. Nothing here is
// written, nothing is charged beyond one call, and every proposal lands as a
// queued topic that still has to be planned before it becomes a post.
//
// WHAT IT LEARNS FROM. Coinpresso's own briefs are the examples. Seventy-four
// of them state a primary keyword, a search intent, an angle and the gap they
// found in what already ranks — which is a far better specification of "a topic
// Coinpresso would commission" than any description of one could be. So the
// prompt carries real briefs rather than a description of their shape, for the
// same reason the writer gets published posts rather than a description of the
// house voice.
//
// WHAT IT MUST NOT DO. Propose something already in the queue, already written,
// or already live on the blog. All three lists go in, and the model is asked to
// name what each proposal is NOT a duplicate of — a check that costs nothing and
// catches the failure this feature would otherwise have: forty near-identical
// GEO topics, each individually plausible.
// ---------------------------------------------------------------------------

import { billed, callClaude, extractJson } from "../providers/anthropic";
import { MODELS } from "../models";
import { BLOG_ARCHIVE_ID, BLOG_PLAYBOOK, PILLARS } from "../blog";
import { allArticles } from "../archive-store";
import type { SeedTopic } from "../blog-seed";

export interface SuggestedTopic {
  id: string;
  topic: string;
  keywords: string[];
  pillar: string;
  /** The reader question underneath it, in their words. */
  buyerQuestion: string;
  /** Why this is worth commissioning rather than obvious. */
  rationale: string;
  /** Which existing topic it is deliberately not a re-run of. */
  notDuplicateOf: string;
  confidence: "high" | "medium" | "speculative";
}

const SYSTEM = `You propose new blog topics for Coinpresso, a crypto marketing
agency, to add to their content queue. You are not planning a publishing day and
you are not writing anything: you are extending a list of subjects worth
commissioning.

The reader is a founder or marketing lead at a token project who is deciding
whether to hire an agency and has been pitched by five others this month.

WHAT A GOOD PROPOSAL LOOKS LIKE

A specific buyer worry, a named mechanism rather than a category, and an angle a
competitor's generic post would not take. "Crypto SEO tips" is not a topic; "Why
your presale landing page fails Google's crawler checks" is.

You may be given real briefs Coinpresso commissioned. Where you are, they are the
standard — study what they have in common and match that specificity. Where you
are NOT, you are working from the pillars and the house framework alone: say so
plainly in the rationale rather than implying a house standard you have not
seen, and lean on the buyer questions, which are the most reliable thing you
have.

HARD RULES

1. Nothing you propose may duplicate a topic in the existing lists — queued,
   already written, or already live on the blog. All three are given to you.
   State in notDuplicateOf which existing topic each proposal is closest to and
   why it is a different piece. If the honest answer is "it is the same piece",
   do not propose it.
2. Spread across pillars. Do not return eight variations on the pillar that
   happens to have the most examples.
3. Keywords are what someone would actually type. Put the primary first. Do not
   pad the list — two or three real ones beat six invented ones.
4. Do NOT invent statistics, market sizes or client results. A topic is a
   subject, not a claim. If a topic would only work with a figure Coinpresso
   holds, say so in the rationale and mark it speculative.
5. Be honest in confidence. "speculative" is the right answer for a topic that
   depends on the reader caring about something you are guessing at, and it is
   more useful than an optimistic guess.

Return ONLY a JSON object: { "topics": [ ... ] }`;

export interface SuggestRequest {
  clientRef: string;
  count: number;
  /** Weight the set toward one pillar. The spread rule still applies. */
  pillar?: string;
  /** A steer in the operator's words. */
  steer?: string;
  existing: SeedTopic[];
}

/**
 * The example block.
 *
 * Briefs are shown in full-ish for a handful and as a title line for the rest.
 * A model given seventy-four complete briefs spends its attention on reading
 * rather than on proposing, and the marginal brief teaches nothing the first six
 * did not — but the full list of TITLES is not optional, because that is what
 * makes duplicate-avoidance possible.
 */
function exampleBlock(existing: SeedTopic[]): string {
  const withBriefs = existing.filter((t) => t.brief?.angle).slice(0, 6);

  // THE COLD START IS A REAL CASE, not an edge case: a client with no queue is
  // exactly who needs this button most, and the first version silently produced
  // a prompt that said "the examples you are given are the standard" above no
  // examples at all. A model handed a dangling reference does not report it — it
  // invents a standard and proceeds confidently, which is the worst of the
  // available outcomes because the output looks the same either way.
  if (!withBriefs.length) {
    const titles = existing.slice(0, 40).map((t) => t.topic);
    return `--- NO BRIEFS TO LEARN FROM YET ---

Coinpresso have not supplied any content briefs, so you have no examples of what
they commission. Work from the pillars below and the house framework, and be
honest about it: where a proposal is a reasonable inference rather than
something you can see they would want, say so in the rationale and do not mark
it "high".

${
  titles.length
    ? `They have queued these topics without briefs, which tells you something about their interests:\n${titles
        .map((t) => `- ${t}`)
        .join("\n")}`
    : "The queue is empty. Everything you propose is an opening suggestion for them to accept or reject, so favour the obvious high-value subject over the clever one — a first list is judged on whether it is credible, not on whether it is surprising."
}

--- THE HOUSE FRAMEWORK ---

${BLOG_PLAYBOOK}`;
  }

  const examples = withBriefs
    .map(
      (t) => `TOPIC: ${t.topic}
  keywords: ${t.keywords.join(", ") || "(none)"}
  pillar: ${t.pillar ?? "(unassigned)"}
  the angle they wanted: ${t.brief?.angle}
  the gap they found: ${t.brief?.gap ?? "(not stated)"}`
    )
    .join("\n\n");

  return `--- EXAMPLES OF TOPICS COINPRESSO COMMISSIONED, WITH THEIR BRIEFS ---

These are the standard. Notice how specific each subject is, and that the angle
always names something a generic post would not say.

${examples}`;
}

/**
 * The user prompt, built separately from the call that sends it.
 *
 * Exported so both branches — with briefs and without — can be inspected without
 * spending a request. The cold-start bug this file's comment describes was
 * invisible precisely because the only way to see the prompt was to pay for one.
 */
export function buildSuggestPrompt(
  req: SuggestRequest,
  live: Array<{ title: string }>
): string {
  const queuedTitles = req.existing
    .filter((t) => t.status === "queued")
    .map((t) => t.topic);
  const writtenTitles = req.existing
    .filter((t) => t.status === "used")
    .map((t) => t.topic);

  const perPillar = new Map<string, number>();
  req.existing.forEach((t) => {
    if (t.pillar) perPillar.set(t.pillar, (perPillar.get(t.pillar) ?? 0) + 1);
  });

  return `Propose ${req.count} new blog topics for Coinpresso's queue.
${req.pillar ? `\nWeight them toward the "${req.pillar}" pillar — but still spread across at least three.\n` : ""}${req.steer ? `\nOPERATOR STEER: ${req.steer}\n` : ""}
${exampleBlock(req.existing)}

--- PILLARS — every topic belongs to exactly one, by id ---
${PILLARS.map(
  (p) =>
    `- ${p.id} — ${p.name}. ${perPillar.get(p.id) ?? 0} topics already.
  The buyer's real worry: ${p.buyerQuestion}
  Sub-topics already mapped (extend these, you are not limited to them):
${p.clusters.map((c) => `    · ${c}`).join("\n")}`
).join("\n\n")}

--- ALREADY IN THE QUEUE (${queuedTitles.length}) — do not propose these ---
${queuedTitles.map((t) => `- ${t}`).join("\n") || "- nothing queued"}

--- ALREADY WRITTEN (${writtenTitles.length}) — do not propose these ---
${writtenTitles.map((t) => `- ${t}`).join("\n") || "- nothing written yet"}

--- ALREADY LIVE ON coinpresso.io (${live.length}) ---
${
  live.length
    ? live
        .slice(0, 120)
        .map((a) => `- ${a.title}`)
        .join("\n")
    : "- the blog has not been imported, so you cannot see what is already published. Say so in the rationale of anything that looks like a common subject: it may already exist."
}

---

Return JSON:
{
  "topics": [
    {
      "topic": "the subject, as a person would describe it — not a headline",
      "keywords": ["primary first", "secondary"],
      "pillar": "one of the pillar ids above",
      "buyerQuestion": "what the reader is actually worried about, in their words",
      "rationale": "why this is worth commissioning, and what would make it original",
      "notDuplicateOf": "the closest existing topic, and why this is a different piece",
      "confidence": "high | medium | speculative"
    }
  ]
}`;
}

export async function suggestTopics(req: SuggestRequest): Promise<{
  topics: SuggestedTopic[];
  tokensIn: number;
  tokensOut: number;
  searchRequests: number;
}> {
  const live = (await allArticles(BLOG_ARCHIVE_ID)).slice(0, 200);
  const user = buildSuggestPrompt(req, live);

  const queuedTitles = req.existing
    .filter((t) => t.status === "queued")
    .map((t) => t.topic);
  const writtenTitles = req.existing
    .filter((t) => t.status === "used")
    .map((t) => t.topic);

  // Derived from the ask, for the reason set out at the same point in
  // blog-ideas.ts: a flat ceiling is not a budget, it is how long a runaway
  // reply gets to run before it is cut off and billed for nothing.
  const ceiling = 600 + 350 * req.count;

  const r = await callClaude({
    model: MODELS.strategy,
    system: SYSTEM,
    user,
    maxTokens: ceiling,
    // Was 0.9. Variety here should come from the pillars and from what is
    // already in the queue, not from the sampler — and 0.9 against a long list
    // of existing topics is the setting most likely to loop and hit the ceiling.
    temperature: 0.6,
  });

  let parsed;
  try {
    parsed = extractJson<{ topics: Omit<SuggestedTopic, "id">[] }>(r.text, { stage: "topic suggester", stopReason: r.stopReason, blockTypes: r.blockTypes,
    tokensOut: r.tokensOut, maxTokens: ceiling });
  } catch (e) {
    // The reply arrived and was billed; only the parse failed.
    throw billed(e, {
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      searchRequests: r.searchRequests ?? 0,
    });
  }

  // A proposal whose title already exists is dropped here rather than shown and
  // then silently skipped by the store's dedupe. The model is told not to
  // duplicate; this is the check that it did not, and dropping is honest —
  // showing a proposal that cannot be added is worse than showing one fewer.
  const taken = new Set(
    [...queuedTitles, ...writtenTitles, ...live.map((a) => a.title)].map((t) =>
      t.trim().toLowerCase()
    )
  );

  const topics: SuggestedTopic[] = (parsed.topics ?? [])
    .filter((t) => t.topic?.trim() && !taken.has(t.topic.trim().toLowerCase()))
    .map((t, n) => ({
      ...t,
      id: `sug_${Date.now()}_${n}`,
      keywords: (t.keywords ?? []).map((k) => k.trim()).filter(Boolean),
      pillar: PILLARS.some((p) => p.id === t.pillar) ? t.pillar : "",
    }));

  return {
    topics,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    searchRequests: r.searchRequests ?? 0,
  };
}

/**
 * Mock proposals. Every rationale says it is a mock, so nobody mistakes the
 * placeholder for a suggestion — the same rule the other agents' mocks follow.
 */
export async function mockSuggestTopics(
  req: SuggestRequest
): Promise<SuggestedTopic[]> {
  await new Promise((r) => setTimeout(r, 900));
  const seeds: Array<[string, string, string]> = [
    [
      "What a crypto project should publish before its first exchange listing",
      "geo",
      "crypto listing content checklist",
    ],
    [
      "Why your presale landing page fails a compliance review",
      "presale-marketing",
      "presale landing page compliance",
    ],
    [
      "The questions a journalist asks before covering a token launch",
      "crypto-pr",
      "crypto pr journalist pitch",
    ],
    [
      "How to tell a bought Telegram community from a real one",
      "community",
      "crypto community audit",
    ],
    [
      "What a clipping campaign costs when nobody goes viral",
      "clipping",
      "crypto clipping pricing",
    ],
    [
      "Where crypto ads still run after the 2026 policy changes",
      "paid",
      "crypto advertising platforms 2026",
    ],
  ];

  return seeds.slice(0, req.count).map(([topic, pillar, kw], n) => ({
    id: `sug_mock_${n}`,
    topic,
    keywords: [kw],
    pillar,
    buyerQuestion: "",
    rationale:
      "MOCK — no key is configured, so nothing here was reasoned from Coinpresso's briefs or checked against what is already published.",
    notDuplicateOf: "not checked — this is a mock",
    confidence: "speculative" as const,
  }));
}
