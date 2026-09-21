// What the reviewer changed in the Doc — see lib/doc-edits.ts for why.
import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { getRun, saveRun } from "@/lib/store";
import { readDocText } from "@/lib/google";
import { renderMarkdown } from "@/lib/render";
import { diffEdits } from "@/lib/doc-edits";
import { addFeedback } from "@/lib/feedback";

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
    applyToDraft?: Array<{ before: string; after: string }>;
    reviewer?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
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
    });
    saved++;
  }

  let applied = 0;
  if (body.applyToDraft?.length && run.draft) {
    let text = run.draft.body;
    for (const a of body.applyToDraft) {
      if (!a.before?.trim() || !a.after?.trim()) continue;
      // The draft holds markdown; the diff saw link text. Match on the
      // plain words so the swap lands even where the original had a link.
      const idx = text.indexOf(a.before);
      if (idx >= 0) {
        text = text.slice(0, idx) + a.after + text.slice(idx + a.before.length);
        applied++;
      }
    }
    if (applied) {
      run.draft = { ...run.draft, body: text };
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
