// ---------------------------------------------------------------------------
// Take the reviewer's Doc edits automatically.
//
// Bernard: "we want to do this automatically, it will do when posting." The
// panel that read Liam's edits back needed someone to press a button, and a
// step someone has to remember is a step that gets missed on the post that
// mattered.
//
// So this runs at the moments the draft stops being a draft:
//
//   SIGN      pull his edits in FIRST, so the signature is on the text he is
//             actually looking at in the Doc, not on an older draft.
//   RELEASE   pull again. Nothing new → release. New edits since signing →
//             refuse and say so: the signatures were on different text, and
//             the approval gate exists precisely to make that impossible.
//   PUBLISH   the same check, so a stale draft can never overwrite his Doc
//             on coinpresso.io.
//
// Idempotent by construction: once his text is in the draft, the next export
// matches the Doc and the diff comes back empty.
//
// A Doc that cannot be read BLOCKS the step rather than skipping it. The
// failure this replaces is exactly "published over his edits without anyone
// noticing", and failing open would reintroduce it on the day Google is slow.
// ---------------------------------------------------------------------------

import type { Run } from "./types";
import { readDocText, readDocComments } from "./google";
import { learnFromEdits } from "./doc-lessons";
import { renderMarkdown } from "./render";
import { diffEdits, applyEdits, RULE_WORTHY_DISTANCE, type EditPair } from "./doc-edits";
import { addFeedback, readFeedback } from "./feedback";
import { saveRun } from "./store";

export interface SyncResult {
  /** False when there is no Doc to read — nothing to do, not a failure. */
  read: boolean;
  applied: number;
  rules: number;
  /** Edits found but not placed — a paragraph he rewrote beyond recognition. */
  missed: EditPair[];
  /** Comments read from the Doc — so the operator can see it looked. */
  comments?: number;
  error?: string;
}

export async function syncDocEdits(
  run: Run,
  clientRef: string,
  opts: { reviewer?: string; moment: "sign" | "release" | "publish" | "manual" }
): Promise<SyncResult> {
  if (!run.docUrl || !run.draft) return { read: false, applied: 0, rules: 0, missed: [] };

  let current: string;
  try {
    current = await readDocText(run.docUrl);
  } catch (err) {
    return {
      read: false,
      applied: 0,
      rules: 0,
      missed: [],
      error: err instanceof Error ? err.message : "The Doc could not be read.",
    };
  }

  const edits = diffEdits(renderMarkdown(run), current);
  if (!edits.length) {
    // No text changed, but his comments may still hold a rule.
    let rules = 0;
    let commentCount = 0;
    try {
      const comments = await readDocComments(run.docUrl).catch(() => []);
      commentCount = comments.length;
      if (comments.length) {
        const log = await readFeedback(clientRef);
        const out = await learnFromEdits({
          title: run.brief.title,
          reviewer: opts.reviewer?.trim() || "Liam",
          edits: [],
          comments,
          existing: log.entries.filter((e) => e.active).map((e) => e.rule),
        });
        for (const l of out.lessons) {
          await addFeedback(clientRef, {
            source: `${opts.reviewer?.trim() || "Liam"}, comments in the Doc for "${run.brief.title}"`,
            rule: l.why ? `${l.rule} Why: ${l.why}` : l.rule,
          });
          rules++;
        }
      }
    } catch (err) {
      console.error("[doc-lessons]", err instanceof Error ? err.message : err);
    }
    return { read: true, applied: 0, rules, missed: [], comments: commentCount };
  }

  const { draft, applied, missed } = applyEdits(run.draft, edits);

  // Rewrites and rewordings become house rules; a typo fix does not. Saved
  // before the run, so a failed save leaves the draft untouched rather than
  // half-updated.
  let rules = 0;
  const reviewer = opts.reviewer?.trim() || "Liam";
  const source = `${reviewer}, edits and comments in the Doc for "${run.brief.title}"`;

  // Learn the WHY, not only the what: one call reads his edits and his
  // comments together and writes the general rule behind each. See
  // doc-lessons.ts. If it fails, the old behaviour — keep the rewrites as
  // before/after examples — still runs, so nothing he did is lost.
  let learned = false;
  let commentsRead = 0;
  try {
    const log = await readFeedback(clientRef);
    const comments = await readDocComments(run.docUrl).catch(() => []);
    commentsRead = comments.length;
    const out = await learnFromEdits({
      title: run.brief.title,
      reviewer,
      edits,
      comments,
      existing: log.entries.filter((e) => e.active).map((e) => e.rule),
    });
    for (const l of out.lessons) {
      await addFeedback(clientRef, {
        source,
        rule: l.why ? `${l.rule} Why: ${l.why}` : l.rule,
        before: l.before,
        after: l.after,
        // A lesson with its reason is a written rule, not a raw edit: it goes
        // to the writer every time rather than competing for the 12 slots
        // kept for recent before/after examples.
      });
      rules++;
    }
    learned = true;
  } catch (err) {
    console.error("[doc-lessons]", err instanceof Error ? err.message : err);
  }

  if (!learned) {
    for (const e of edits) {
      if (e.distance < RULE_WORTHY_DISTANCE) continue;
      if (e.op === "delete" || e.op === "insert") continue;
      await addFeedback(clientRef, {
        source: `${reviewer}, edited in the Doc for "${run.brief.title}"${e.section ? ` (${e.section})` : ""}`,
        rule: "The reviewer rewrote this paragraph by hand. Write the way the second version reads, not the first.",
        before: e.before,
        after: e.after,
        kind: "doc-edit",
      });
      rules++;
    }
  }

  if (applied) {
    const now = new Date().toISOString();
    run.draft = { ...run.draft, ...draft };
    run.updatedAt = now;
    run.stages = [
      ...run.stages,
      {
        id: "writer",
        label: `${reviewer}'s Doc edits taken (${opts.moment})`,
        agent: "human",
        model: "—",
        status: "done",
        startedAt: now,
        endedAt: now,
        durationMs: 0,
        inputSummary: `${applied} paragraph${applied === 1 ? "" : "s"} replaced with ${reviewer}'s text from the Doc${
          rules ? `; ${rules} kept as house rule${rules === 1 ? "" : "s"}` : ""
        }${missed.length ? `; ${missed.length} could not be placed` : ""}`,
      },
    ];
    await saveRun(run);
  }
  return { read: true, applied, rules, missed, comments: commentsRead };
}
