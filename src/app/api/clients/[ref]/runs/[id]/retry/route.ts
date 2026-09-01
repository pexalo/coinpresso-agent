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
import { listSeeds } from "@/lib/blog-seed";
import { executeRun } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
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

  // REWRITE FROM RESEARCH — ?from=writer.
  //
  // Keeps the strategy stage (the research and the source ledger, more than
  // half the cost of a run) and discards everything after it, so the writer
  // runs again from the same facts. This exists because the first seven live
  // articles were structurally wrong through a prompt fault, not a research
  // fault: the sources were fine, the headings were not. Re-running the whole
  // pipeline would have paid for the research a second time to fix a mistake
  // the research did not make.
  //
  // Allowed on failed and needs-review runs. A rewrite changes the draft,
  // which changes its fingerprint, which stales every signature on it — so a
  // half-approved post cannot be quietly swapped out from under an approver.
  const from = new URL(req.url).searchParams.get("from");
  if (from === "writer") {
    if (run.status !== "failed" && run.status !== "needs_review") {
      return NextResponse.json(
        { error: `A run can be rewritten from research only while failed or awaiting review — this one is "${run.status}".` },
        { status: 409 }
      );
    }
    if (!run.research) {
      return NextResponse.json(
        { error: "This run has no research to rewrite from — retry it from the start instead." },
        { status: 409 }
      );
    }
    for (const s of run.stages) {
      if (s.id === "strategy") continue;
      s.status = "pending";
      s.error = undefined;
      s.output = undefined;
      s.startedAt = undefined;
      s.endedAt = undefined;
      s.durationMs = undefined;
    }
    run.draft = undefined;
    run.review = undefined;
    run.linkCheck = undefined;
    run.revisions = 0;

    // THE TITLE GOES BACK TO WHAT THE CLIENT WROTE. The first live plans
    // rewrote every supplied topic as a question, and that rewritten title was
    // stored on the run — so a rewrite that trusted the stored brief would
    // reproduce the fault it exists to fix. The queue topic is found by id
    // where the run recorded one, and by the brief document's id otherwise
    // (runs from before the id was carried).
    const seeds = await listSeeds(ref);
    const seed =
      seeds.topics.find((t) => t.id === run.brief.seedTopicId) ??
      (run.brief.contentBrief?.docId
        ? seeds.topics.find((t) => t.brief?.docId === run.brief.contentBrief?.docId)
        : undefined);
    if (seed) {
      run.brief.title = seed.topic;
      run.brief.seedTopicId = seed.id;
      if (seed.keywords.length) run.brief.keywords = seed.keywords;
      if (seed.brief) run.brief.contentBrief = seed.brief;
    }

    run.status = "failed"; // executeRun flips it to running and resumes after strategy
    await saveRun(run);
  } else if (run.status !== "failed") {
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
