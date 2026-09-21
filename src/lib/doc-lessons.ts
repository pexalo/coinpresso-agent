// ---------------------------------------------------------------------------
// Turning Liam's Doc edits and comments into rules the writer can follow.
//
// Bernard, 21 Sep: "when [it] took changes from the doc, does it learn from
// the changes? why was it changed etc … put into rules". Before this, a
// rewrite was saved as a before/after pair under one generic line — "write
// the way the second version reads" — and small edits (a link added, one
// word changed, "crypto" put into an anchor) were not saved at all. The
// writer saw WHAT changed and never WHY.
//
// So one call reads every edit and every comment together and writes the
// lesson behind each: what the rule is, stated generally, and why he made
// it. A fact correction specific to one post is not a lesson and is skipped;
// a lesson already in the house rules is skipped.
// ---------------------------------------------------------------------------

import { callClaude, extractJson } from "./providers/anthropic";
import { MODELS } from "./models";
import type { EditPair } from "./doc-edits";
import type { DocComment } from "./google";

export interface Lesson {
  rule: string;
  why: string;
  before?: string;
  after?: string;
}

export async function learnFromEdits(input: {
  title: string;
  reviewer: string;
  edits: EditPair[];
  comments: DocComment[];
  existing: string[];
}): Promise<{ lessons: Lesson[]; tokensIn: number; tokensOut: number; model: string }> {
  const edits = input.edits.slice(0, 40).map((e, i) => {
    const op = e.op ?? "edit";
    if (op === "delete") return `E${i} CUT${e.section ? ` [${e.section}]` : ""}: "${e.before}"`;
    if (op === "insert") return `E${i} ADDED${e.section ? ` [${e.section}]` : ""}: "${e.afterRaw}"`;
    return `E${i} CHANGED${e.section ? ` [${e.section}]` : ""}:\n  before: "${e.before}"\n  after:  "${e.afterRaw}"`;
  });
  const comments = input.comments.slice(0, 40).map(
    (c, i) =>
      `C${i} ${c.author || input.reviewer}${c.quote ? ` on "${c.quote.slice(0, 200)}"` : ""}: ${c.text}${
        c.replies.length ? ` (replies: ${c.replies.join(" / ")})` : ""
      }`
  );
  if (!edits.length && !comments.length) return { lessons: [], tokensIn: 0, tokensOut: 0, model: MODELS.reviewer };

  const r = await callClaude({
    model: MODELS.reviewer,
    system:
      "You maintain the house style rules for a crypto marketing agency's blog. The client's editor has edited and commented on a draft. " +
      "You turn his changes into general rules a writer can follow on the NEXT post. You answer in JSON only.",
    user: [
      `Post: ${input.title}`,
      "",
      "HIS EDITS (the draft text before, and his text after; markdown links shown as [text](url)):",
      edits.join("\n") || "(none)",
      "",
      "HIS COMMENTS:",
      comments.join("\n") || "(none)",
      "",
      "RULES ALREADY IN PLACE (do not repeat these, even in other words):",
      input.existing.map((x) => `- ${x.slice(0, 220)}`).join("\n") || "(none)",
      "",
      "For each distinct lesson in his edits and comments, write one rule:",
      '- "rule": the rule, stated so it applies to any future post (one or two sentences, imperative)',
      '- "why": why he made the change, in his words where a comment gives them, otherwise your best reading of the edit',
      '- "from": the ids it came from, e.g. ["E3","C1"]',
      "Skip: corrections of a fact specific to this post, typo fixes, links to a page that only suit this topic, image or file links, status comments (\"looks good\", \"mark as complete\"), and anything the existing rules already cover.",
      "Merge edits that teach the same lesson into one rule. Zero lessons is a valid answer.",
      "",
      'Answer: {"lessons":[{"rule":"...","why":"...","from":["E0"]}]}',
    ].join("\n"),
    maxTokens: 2000,
  });
  const parsed = extractJson<{ lessons?: Array<{ rule?: string; why?: string; from?: string[] }> }>(r.text, {
    stage: "doc-lessons",
  });
  const lessons: Lesson[] = [];
  for (const l of parsed.lessons ?? []) {
    if (!l.rule?.trim()) continue;
    const firstEdit = (l.from ?? []).map((f) => /^E(\d+)$/.exec(f)?.[1]).find(Boolean);
    const e = firstEdit !== undefined ? input.edits[Number(firstEdit)] : undefined;
    lessons.push({
      rule: l.rule.trim(),
      why: (l.why ?? "").trim(),
      before: e && (e.op ?? "edit") === "edit" ? e.before : undefined,
      after: e && (e.op ?? "edit") === "edit" ? e.after : undefined,
    });
  }
  return { lessons, tokensIn: r.tokensIn, tokensOut: r.tokensOut, model: MODELS.reviewer };
}
