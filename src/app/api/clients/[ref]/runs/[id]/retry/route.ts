// ---------------------------------------------------------------------------
// Retry a failed run FROM WHERE IT FAILED.
//
// The alternative — write the same topic again from the plan screen — starts a
// fresh run and re-buys everything, including the research stage that is more
// than half a run's cost and usually the part that succeeded. executeRun skips
// stages that are already done with their output in hand, so a writer failure
// retries only the writer, on research that is already paid for.
//
// Only failed runs can be retried. Retrying a run that needs review would be a
// way to regenerate a draft after approvals started; the fingerprint would
// catch it, but the door stays shut here as well.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { getRun, saveRun } from "@/lib/store";
import { executeRun } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  if (!getClient(ref)) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  const run = await getRun(id, ref);
  if (!run) {
    return NextResponse.json({ error: "Unknown run" }, { status: 404 });
  }
  if (run.status !== "failed") {
    return NextResponse.json(
      { error: `Only failed runs can be retried — this one is "${run.status}".` },
      { status: 409 }
    );
  }

  // Same fire-and-forget shape as run creation: the dashboard polls, the
  // request returns immediately.
  void executeRun(run).catch(async (e) => {
    run.status = "failed";
    const s = run.stages.find((x) => x.status === "running");
    if (s) {
      s.status = "failed";
      s.error = e instanceof Error ? e.message : String(e);
    }
    await saveRun(run);
  });

  return NextResponse.json({ id: run.id, retrying: true });
}
