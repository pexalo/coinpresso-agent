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
import { searchCost } from "./model-registry";
import { usageOf } from "./providers/anthropic";
import { runStrategy } from "./agents/strategy";
import { runWriter } from "./agents/writer";
import { runReviewer } from "./agents/reviewer";
import { runLinkCheck } from "./agents/linkcheck";
import { mockReviewer, mockStrategy, mockWriter } from "./agents/mock";
import { saveRun } from "./store";
import type { Brief, Run, StageId, StageRecord } from "./types";

const MAX_REVISIONS = 2;

/**
 * Who a model call is for. Ignored in direct mode; in gateway mode this is how
 * Pexalo HQ attributes the spend to a client and traces a cost line back to the
 * article it paid for.
 */
function ident(run: Run) {
  return { clientRef: run.clientRef, runId: run.id };
}

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
  // A retried stage carries the old failure's message until it finishes or
  // fails again; clearing it here stops a run showing last time's error next
  // to this time's spinner.
  s.error = undefined;
  await saveRun(run);
}

async function finish(
  run: Run,
  id: StageId,
  output: unknown,
  usage?: {
    tokensIn: number;
    tokensOut: number;
    model: string;
    /** Billable web searches, when the stage used the search tool. */
    searchRequests?: number;
  }
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

    // Search is billed on top of tokens, and kept as its own line so the split
    // survives into the breakdown rather than disappearing into one figure.
    const searches = usage.searchRequests ?? 0;
    if (searches > 0) {
      const sc = searchCost(searches);
      s.searchRequests = (s.searchRequests ?? 0) + searches;
      s.searchCostUsd = (s.searchCostUsd ?? 0) + sc;
      run.totalSearchRequests = (run.totalSearchRequests ?? 0) + searches;
      run.totalSearchCostUsd = (run.totalSearchCostUsd ?? 0) + sc;
      run.totalCostUsd += sc;
    }
  }
  await saveRun(run);
}

async function fail(run: Run, id: StageId, err: unknown): Promise<void> {
  const s = stage(run, id);
  s.status = "failed";
  s.endedAt = new Date().toISOString();
  s.error = err instanceof Error ? err.message : String(err);

  // A stage that fails AFTER the model replied was still billed for the reply
  // — the agents attach the usage to the error precisely so it can be recorded
  // here. Without this, a failed run reports $0.00 for a stage that cost real
  // money, and the gap between the app's ledger and the provider's bill grows
  // every time something goes wrong — which is exactly when someone is staring
  // at the costs page trying to work out where the balance went.
  const u = usageOf(err);
  if (u) {
    const model = id === "writer" || id === "revision" ? MODELS.writer : MODELS.strategy;
    s.tokensIn = (s.tokensIn ?? 0) + u.tokensIn;
    s.tokensOut = (s.tokensOut ?? 0) + u.tokensOut;
    const cost = estimateCost(model, u.tokensIn, u.tokensOut);
    s.costUsd = (s.costUsd ?? 0) + cost;
    run.totalCostUsd += cost;
    if (u.searchRequests > 0) {
      const sc = searchCost(u.searchRequests);
      s.searchRequests = (s.searchRequests ?? 0) + u.searchRequests;
      s.searchCostUsd = (s.searchCostUsd ?? 0) + sc;
      run.totalSearchRequests = (run.totalSearchRequests ?? 0) + u.searchRequests;
      run.totalSearchCostUsd = (run.totalSearchCostUsd ?? 0) + sc;
      run.totalCostUsd += sc;
    }
  }

  run.status = "failed";
  await saveRun(run);
}

export async function executeRun(run: Run): Promise<Run> {
  const mock = run.mock;
  run.status = "running";
  await saveRun(run);

  // A RETRIED run re-enters here with some stages already done and their
  // outputs on the run. Those stages are skipped rather than re-bought: the
  // strategy stage is more than half the cost of a run, and a writer failure
  // does not invalidate research that succeeded. A fresh run has every stage
  // pending, so these guards change nothing on the normal path.
  const alreadyDone = (id: StageId) => stage(run, id).status === "done";

  // -- Strategy ------------------------------------------------------------
  if (!(alreadyDone("strategy") && run.research)) {
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
      const r = await runStrategy(run.brief, ident(run));
      run.research = r.research;

      // A topic that arrived without a brief now has one, written by research
      // in the client's format. Promoting it onto the run's Brief means the
      // writer, the enforcement, the brief drawer and any rewrite all see the
      // same thing — and nobody downstream has to ask "which kind of post is
      // this". Only done when the run genuinely had no outline; a client's
      // brief is never overwritten by a generated one.
      const proposed = r.research.proposedBrief;
      if (
        run.brief.track === "blog" &&
        !run.brief.contentBrief?.outline?.length &&
        proposed?.outline?.length
      ) {
        run.brief.contentBrief = {
          ...run.brief.contentBrief,
          angle: proposed.angle,
          gap: proposed.gap,
          outline: proposed.outline.map((sct, i) => ({ ...sct, n: i + 1 })),
          faqs: proposed.faqs ?? [],
          generated: true,
        };
      }

      await finish(run, "strategy", r.research, {
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        model: MODELS.strategy,
        searchRequests: r.searchRequests,
      });
    }
  } catch (e) {
    await fail(run, "strategy", e);
    return run;
  }
  }

  // -- Write ---------------------------------------------------------------
  if (!(alreadyDone("writer") && run.draft)) {
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
      const w = await runWriter({
        brief: run.brief,
        research: run.research!,
        ctx: ident(run),
      });
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
          ctx: ident(run),
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
          ctx: ident(run),
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
