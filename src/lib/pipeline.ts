// ---------------------------------------------------------------------------
// Orchestration.
//
// strategy -> writer -> linkcheck -> reviewer -> (revision -> linkcheck ->
// reviewer) -> final
//
// The revision loop is bounded at MAX_REVISIONS. An unbounded loop between two
// models that disagree on taste will run until the budget is gone; when the
// bound is hit the run lands in needs_review with the outstanding findings
// attached, which is the honest outcome — a human decides.
//
// Every stage writes its record to the store as it completes, so the dashboard
// can show the pipeline advancing rather than a spinner.
// ---------------------------------------------------------------------------

import { MODELS, estimateCost, mockMode } from "./models";
import { runStrategy } from "./agents/strategy";
import { runWriter } from "./agents/writer";
import { runReviewer } from "./agents/reviewer";
import { runLinkCheck } from "./agents/linkcheck";
import { mockReviewer, mockStrategy, mockWriter } from "./agents/mock";
import { saveRun } from "./store";
import type { Brief, Run, StageId, StageRecord } from "./types";

const MAX_REVISIONS = 2;

export function initialStages(): StageRecord[] {
  return [
    {
      id: "strategy",
      label: "Research the market",
      agent: "Strategy",
      model: MODELS.strategy,
      status: "pending",
    },
    {
      id: "writer",
      label: "Draft the article",
      agent: "Writer",
      model: MODELS.writer,
      status: "pending",
    },
    {
      id: "linkcheck",
      label: "Verify every citation",
      agent: "Link check",
      model: "deterministic",
      status: "pending",
    },
    {
      id: "reviewer",
      label: "Review against house style",
      agent: "Reviewer",
      model: MODELS.reviewer,
      status: "pending",
    },
    {
      id: "revision",
      label: "Apply reviewer findings",
      agent: "Writer",
      model: MODELS.writer,
      status: "pending",
    },
    {
      id: "final",
      label: "Ready for Liam",
      agent: "Pipeline",
      model: "—",
      status: "pending",
    },
  ];
}

export function newRun(
  id: string,
  clientRef: string,
  brief: Brief,
  campaignId?: string
): Run {
  const now = new Date().toISOString();
  return {
    id,
    clientRef,
    campaignId,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    brief,
    stages: initialStages(),
    revisions: 0,
    mock: mockMode(),
    totalCostUsd: 0,
  };
}

function stage(run: Run, id: StageId): StageRecord {
  return run.stages.find((s) => s.id === id)!;
}

async function begin(run: Run, id: StageId, inputSummary: string): Promise<void> {
  const s = stage(run, id);
  s.status = "running";
  s.startedAt = new Date().toISOString();
  s.inputSummary = inputSummary;
  await saveRun(run);
}

async function finish(
  run: Run,
  id: StageId,
  output: unknown,
  usage?: { tokensIn: number; tokensOut: number; model: string }
): Promise<void> {
  const s = stage(run, id);
  s.status = "done";
  s.endedAt = new Date().toISOString();
  s.durationMs = s.startedAt
    ? Date.parse(s.endedAt) - Date.parse(s.startedAt)
    : undefined;
  s.output = output;
  if (usage) {
    s.tokensIn = (s.tokensIn ?? 0) + usage.tokensIn;
    s.tokensOut = (s.tokensOut ?? 0) + usage.tokensOut;
    const cost = estimateCost(usage.model, usage.tokensIn, usage.tokensOut);
    s.costUsd = (s.costUsd ?? 0) + cost;
    run.totalCostUsd += cost;
  }
  await saveRun(run);
}

async function fail(run: Run, id: StageId, err: unknown): Promise<void> {
  const s = stage(run, id);
  s.status = "failed";
  s.endedAt = new Date().toISOString();
  s.error = err instanceof Error ? err.message : String(err);
  run.status = "failed";
  await saveRun(run);
}

export async function executeRun(run: Run): Promise<Run> {
  const mock = run.mock;
  run.status = "running";
  await saveRun(run);

  // -- Strategy ------------------------------------------------------------
  try {
    await begin(
      run,
      "strategy",
      `${run.brief.title} — keywords: ${run.brief.keywords.join(", ")}`
    );
    if (mock) {
      run.research = await mockStrategy(run.brief);
      await finish(run, "strategy", run.research);
    } else {
      const r = await runStrategy(run.brief);
      run.research = r.research;
      await finish(run, "strategy", r.research, {
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        model: MODELS.strategy,
      });
    }
  } catch (e) {
    await fail(run, "strategy", e);
    return run;
  }

  // -- Write ---------------------------------------------------------------
  try {
    await begin(
      run,
      "writer",
      `${run.research!.sources.length} sources, ${run.research!.predictions.length} predictions`
    );
    if (mock) {
      run.draft = await mockWriter(run.brief, run.research!, false);
      await finish(run, "writer", run.draft);
    } else {
      const w = await runWriter({ brief: run.brief, research: run.research! });
      run.draft = w.draft;
      await finish(run, "writer", w.draft, {
        tokensIn: w.tokensIn,
        tokensOut: w.tokensOut,
        model: MODELS.writer,
      });
    }
  } catch (e) {
    await fail(run, "writer", e);
    return run;
  }

  // -- Verify, review, and revise while needed -----------------------------
  let attempt = 0;
  while (true) {
    try {
      await begin(run, "linkcheck", `${run.draft!.wordCount} words`);
      run.linkCheck = await runLinkCheck(run.draft!, run.research!, {
        verifyReachable: !mock,
        track: run.brief.track === "blog" ? "blog" : "wire",
      });
      const lc = stage(run, "linkcheck");
      lc.attempt = attempt + 1;
      await finish(run, "linkcheck", run.linkCheck);
    } catch (e) {
      await fail(run, "linkcheck", e);
      return run;
    }

    try {
      await begin(run, "reviewer", `attempt ${attempt + 1}`);
      if (mock) {
        run.review = await mockReviewer(attempt > 0);
        await finish(run, "reviewer", run.review);
      } else {
        const rv = await runReviewer({
          brief: run.brief,
          research: run.research!,
          draft: run.draft!,
          linkCheck: run.linkCheck!,
        });
        run.review = rv.review;
        await finish(run, "reviewer", rv.review, {
          tokensIn: rv.tokensIn,
          tokensOut: rv.tokensOut,
          model: MODELS.reviewer,
        });
      }
      stage(run, "reviewer").attempt = attempt + 1;
      await saveRun(run);
    } catch (e) {
      await fail(run, "reviewer", e);
      return run;
    }

    const needsWork =
      run.review!.verdict !== "pass" || !(run.linkCheck!.passed);

    if (!needsWork || attempt >= MAX_REVISIONS) {
      if (needsWork) {
        // Bound reached with findings outstanding. Say so plainly rather than
        // shipping it as passed.
        stage(run, "revision").status =
          attempt > 0 ? "done" : "skipped";
      } else {
        stage(run, "revision").status = attempt > 0 ? "done" : "skipped";
      }
      break;
    }

    attempt++;
    run.revisions = attempt;

    try {
      const findings = [
        ...run.review!.findings,
        ...run.linkCheck!.unsourced.map((u) => ({
          severity: "blocker" as const,
          category: "sourcing" as const,
          detail: `The URL ${u} is cited but was not in the research ledger.`,
          fix: `Remove it, or replace the claim with one supported by a ledger source.`,
        })),
        ...run.linkCheck!.unreachable.map((u) => ({
          severity: "blocker" as const,
          category: "sourcing" as const,
          detail: `The URL ${u.url} did not resolve (${u.status ?? "no response"}).`,
          fix: `Remove it, or cite a different ledger source for the same claim.`,
        })),
      ];

      await begin(run, "revision", `${findings.length} findings, pass ${attempt}`);
      if (mock) {
        run.draft = await mockWriter(run.brief, run.research!, true);
        await finish(run, "revision", run.draft);
      } else {
        const w = await runWriter({
          brief: run.brief,
          research: run.research!,
          fixes: findings,
          previous: run.draft!,
        });
        run.draft = w.draft;
        await finish(run, "revision", w.draft, {
          tokensIn: w.tokensIn,
          tokensOut: w.tokensOut,
          model: MODELS.writer,
        });
      }
      stage(run, "revision").attempt = attempt;
      // Reopen the downstream stages for the next pass.
      stage(run, "linkcheck").status = "pending";
      stage(run, "reviewer").status = "pending";
      await saveRun(run);
    } catch (e) {
      await fail(run, "revision", e);
      return run;
    }
  }

  await begin(run, "final", `${run.revisions} revision pass(es)`);
  await finish(run, "final", {
    verdict: run.review?.verdict,
    linkCheckPassed: run.linkCheck?.passed,
    revisions: run.revisions,
  });

  run.status = "needs_review";
  await saveRun(run);
  return run;
}
