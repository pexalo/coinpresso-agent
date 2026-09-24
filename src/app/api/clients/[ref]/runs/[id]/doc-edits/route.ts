// What the reviewer changed in the Doc — see lib/doc-edits.ts for why.
import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { getRun, saveRun } from "@/lib/store";
import { readDocText } from "@/lib/google";
import { renderMarkdown } from "@/lib/render";
import { diffEdits, applyEdits } from "@/lib/doc-edits";
import { addFeedback } from "@/lib/feedback";
import { syncDocEdits } from "@/lib/doc-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read the Doc and return the paragraphs the reviewer changed. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  if (!getClient(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  const run = await getRun(id, ref);
  if (!run) return NextResponse.json({ error: "Unknown run" }, { status: 404 });
  if (!run.docUrl) return NextResponse.json({ error: "This run has no Google Doc to read." }, { status: 409 });
  if (!run.draft) return NextResponse.json({ error: "This run has no draft to compare against." }, { status: 409 });
  try {
    const current = await readDocText(run.docUrl);
    const exported = renderMarkdown(run);
    const edits = diffEdits(exported, current);
    return NextResponse.json({ edits, docUrl: run.docUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Read failed" }, { status: 424 });
  }
}

/**
 * Keep what he changed: as house rules (before/after the writer imitates),
 * and optionally into the draft itself so the next export does not undo him.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  if (!getClient(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  const run = await getRun(id, ref);
  if (!run) return NextResponse.json({ error: "Unknown run" }, { status: 404 });
  let body: {
    rules?: Array<{ before: string; after: string; note?: string; section?: string }>;
    applyToDraft?: Array<{ before: string; after: string; afterRaw?: string }>;
    reviewer?: string;
    /** Take every change in the Doc now — the same sync that runs on sign. */
    syncAll?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (body.syncAll) {
    const r = await syncDocEdits(run, ref, { reviewer: body.reviewer, moment: "manual" });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 424 });
    return NextResponse.json({
      saved: r.rules,
      applied: r.applied,
      comments: r.comments ?? 0,
      missed: r.missed.map((m) => m.before || m.after),
    });
  }

  let saved = 0;
  for (const r of body.rules ?? []) {
    if (!r.before?.trim() || !r.after?.trim()) continue;
    await addFeedback(ref, {
      source: `${body.reviewer?.trim() || "Liam"}, edited in the Doc for "${run.brief.title}"${r.section ? ` (${r.section})` : ""}`,
      rule:
        r.note?.trim() ||
        "The reviewer rewrote this paragraph by hand. Write the way the second version reads, not the first.",
      before: r.before,
      after: r.after,
      kind: "doc-edit",
    });
    saved++;
  }

  let applied = 0;
  if (body.applyToDraft?.length && run.draft) {
    // Same path as the automatic sync — see applyEdits for why a plain text
    // search dropped every edit to a paragraph that held a link.
    const edits = body.applyToDraft
      .filter((a) => a.before?.trim() && (a.afterRaw ?? a.after)?.trim())
      .map((a) => ({ before: a.before, after: a.after, afterRaw: a.afterRaw ?? a.after, distance: 1 }));
    const out = applyEdits(run.draft, edits);
    applied = out.applied;
    if (applied) {
      run.draft = { ...run.draft, ...out.draft };
      run.review = undefined;
      run.updatedAt = new Date().toISOString();
      run.stages = [
        ...run.stages,
        {
          id: "writer",
          label: "Reviewer's edits taken from the Doc",
          agent: "human",
          model: "—",
          status: "done",
          startedAt: run.updatedAt,
          endedAt: run.updatedAt,
          durationMs: 0,
          inputSummary: `${applied} paragraph${applied === 1 ? "" : "s"} replaced with the reviewer's text`,
        },
      ];
      await saveRun(run);
    }
  }
  return NextResponse.json({ ok: true, saved, applied });
}
