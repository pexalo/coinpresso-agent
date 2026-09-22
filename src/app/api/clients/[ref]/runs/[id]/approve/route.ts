import { NextResponse } from "next/server";
import { getRun, saveRun } from "@/lib/store";
import { exportRun } from "@/lib/google";
import { getRecord, saveRecord } from "@/lib/approval-store";
import { gateConfig, readSettings } from "@/lib/settings";
import { fingerprint, gateState } from "@/lib/approval";
import { syncDocEdits } from "@/lib/doc-sync";
import { competitorProblems } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RELEASE. The terminal action — after this a wire release goes to a third
 * party and a blog post can be pushed to coinpresso.io.
 *
 * This used to be a single "approve" click by one unnamed person, which is what
 * it should never have been: the destination is a publisher, and a wire release
 * cannot be recalled. It is now the last step of a gate, and it refuses unless
 * the required number of named people have signed THIS draft. The check runs
 * server-side against the stored run, so a UI that offered the button by mistake
 * still cannot release anything.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const run = await getRun(id, ref);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (!run.draft) {
    return NextResponse.json(
      { error: "This run has no draft to release" },
      { status: 409 }
    );
  }

  // Take any Doc edits made since signing. If there are some, the signatures
  // were given on different text, and releasing would publish words nobody
  // signed — so stop and say exactly why. See lib/doc-sync.ts.
  const sync = await syncDocEdits(run, ref, { moment: "release" });
  if (sync.error) {
    return NextResponse.json(
      {
        error: `Couldn't read the Google Doc to check for last-minute edits, so nothing was released. ${sync.error} Try again in a minute — releasing without checking could publish over the reviewer's changes.`,
      },
      { status: 424 }
    );
  }

  // Competitors never leave the app, however they got into the draft.
  const rivals = competitorProblems(run.draft);
  if (rivals.length) {
    return NextResponse.json(
      { error: `Not released: the post mentions a competitor (${rivals.join("; ")}). Remove it in the Google Doc, click "Take all edits from the Doc", and try again.` },
      { status: 409 }
    );
  }

  const settings = await readSettings(ref);
  const { approvers, required } = gateConfig(settings);
  const record = await getRecord(ref, id);
  const fp = fingerprint(run);
  const gate = gateState(record, approvers, required, fp, true);

  if (sync.applied && !gate.canRelease && !record.releasedAt) {
    return NextResponse.json(
      {
        error: `The Doc was edited after it was signed — ${sync.applied} paragraph${sync.applied === 1 ? " was" : "s were"} changed. That text is now in the draft, so it needs signing again before release. Nothing was lost.`,
        gate,
        docEdits: sync.applied,
      },
      { status: 409 }
    );
  }

  if (!gate.canRelease) {
    return NextResponse.json({ error: gate.reason, gate }, { status: 409 });
  }

  let releasedBy = "unknown";
  try {
    const body = (await req.json()) as { approvedBy?: string };
    if (body.approvedBy) releasedBy = body.approvedBy;
  } catch {
    // No body is fine.
  }

  const releasedTo = run.brief.track === "blog" ? "wordpress" : "wire";
  await saveRecord(
    ref,
    { ...record, releasedAt: new Date().toISOString(), releasedBy, releasedTo },
    { action: "release", releasedBy, fingerprint: fp, releasedTo }
  );

  run.status = "approved";
  run.approvedAt = new Date().toISOString();
  // Who signed, not just who clicked last. This field is what gets read back if
  // a published claim is ever disputed, and one name would understate it.
  run.approvedBy = gate.valid.map((s) => s.name).join(", ");

  let result;
  try {
    result = await exportRun(run);
    if (result.docUrl) run.docUrl = result.docUrl;
  } catch (e) {
    await saveRun(run);
    return NextResponse.json(
      {
        approved: true,
        docUrl: null,
        sheetUpdated: false,
        exportError: e instanceof Error ? e.message : String(e),
      },
      { status: 200 }
    );
  }

  await saveRun(run);
  return NextResponse.json({ approved: true, ...result });
}
