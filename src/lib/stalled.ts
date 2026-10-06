// ---------------------------------------------------------------------------
// Runs that stopped running without saying so.
//
// A deploy, a container restart or a crash in the middle of the writer leaves
// a run with status "running" and no process behind it. The queue then shows
// "running" forever, the day never completes, and nobody can retry it because
// retry refuses while a run is running. This marks those runs failed so the
// operator can see what happened and retry from where it stopped.
// ---------------------------------------------------------------------------

import type { Run } from "./types";
import { saveRun } from "./store";

/** Nothing legitimately takes longer than this between stage updates. */
export const STALL_MINUTES = 45;

/**
 * Run ids this server process is executing right now. On globalThis so the
 * route handlers and the pipeline share one set even if the module is
 * bundled twice.
 */
export function liveRuns(): Set<string> {
  const g = globalThis as unknown as { __coinpressoLiveRuns?: Set<string> };
  return (g.__coinpressoLiveRuns ??= new Set<string>());
}

/** Grace for a run saved as running a moment before executeRun registers it. */
const ORPHAN_GRACE_MINUTES = 3;

export async function reapStalledRuns(runs: Run[], now = Date.now()): Promise<Run[]> {
  const out: Run[] = [];
  for (const run of runs) {
    out.push(run);
    if (run.status !== "running" && run.status !== "queued") continue;
    const last = Date.parse(run.updatedAt || run.createdAt);
    if (!Number.isFinite(last)) continue;
    // ORPHANED: nothing in this process is running it — a push restarted
    // the server (6 Oct: the presale budget post sat in "Apply reviewer
    // findings" for 25 minutes after a deploy). Freed in minutes, not 45.
    const orphaned = run.status === "running" && !liveRuns().has(run.id) && now - last >= ORPHAN_GRACE_MINUTES * 60_000;
    if (!orphaned && now - last < STALL_MINUTES * 60_000) continue;
    run.status = "failed";
    const stage = run.stages.find((s) => s.status === "running");
    if (stage) {
      stage.status = "failed";
      stage.endedAt = new Date(now).toISOString();
      stage.error = orphaned
        ? "The server restarted while this stage was running (a deploy — every push restarts it), so the stage was cut off. Nothing is lost: Retry from where it failed picks up here."
        : `The run stopped with no result for over ${STALL_MINUTES} minutes — the server restarted or the stage crashed. Retry it.`;
    }
    await saveRun(run);
  }
  return out;
}
