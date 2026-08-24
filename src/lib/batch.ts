// ---------------------------------------------------------------------------
// Batch generation.
//
// Five, ten, fifteen or twenty briefs put through the pipeline in one go.
//
// Two things decide whether this is usable. Concurrency: running twenty at once
// would hit provider rate limits and produce a wall of failures, so a small
// number run at a time and the rest queue. And an honest ETA: the estimate is
// derived from the runs that have ALREADY completed in this batch rather than a
// guess, so it starts rough and converges — and it says so, because a confident
// wrong number is worse than a vague right one.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { executeRun, newRun } from "./pipeline";
import { newRunId, saveRun } from "./store";
import { mockMode } from "./models";
import type { Brief } from "./types";
import { CONCURRENCY, type Batch } from "./batch-types";

export { CONCURRENCY, progressOf, formatEta } from "./batch-types";
export type { Batch, BatchItem, BatchItemStatus, Progress } from "./batch-types";

const DIR = path.join(process.cwd(), ".data", "batches");

async function ensure(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
}

export function newBatchId(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `batch_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function saveBatch(b: Batch): Promise<void> {
  await ensure();
  b.updatedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(DIR, `${b.id}.json`),
    JSON.stringify(b, null, 2),
    "utf8"
  );
}

/** Pass clientRef to assert ownership — a batch id alone is not authorisation. */
export async function getBatch(
  id: string,
  clientRef?: string
): Promise<Batch | null> {
  try {
    const raw = await fs.readFile(path.join(DIR, `${id}.json`), "utf8");
    const b = JSON.parse(raw) as Batch;
    if (clientRef && b.clientRef !== clientRef) return null;
    return b;
  } catch {
    return null;
  }
}

export async function listBatches(clientRef: string): Promise<Batch[]> {
  await ensure();
  const files = await fs.readdir(DIR);
  const out: Batch[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const b = JSON.parse(
        await fs.readFile(path.join(DIR, f), "utf8")
      ) as Batch;
      if (b.clientRef === clientRef) out.push(b);
    } catch {
      // A partially written file should not take the list down.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function newBatch(
  id: string,
  clientRef: string,
  briefs: Brief[],
  campaignId?: string,
  track: "wire" | "blog" = "wire"
): Batch {
  const now = new Date().toISOString();
  return {
    id,
    clientRef,
    track,
    campaignId,
    createdAt: now,
    updatedAt: now,
    status: "running",
    mock: mockMode(),
    totalCostUsd: 0,
    items: briefs.map((b) => ({
      runId: null,
      title: b.title,
      // On the blog track there is no wire, so the slot carries the pillar —
      // which is what the progress panel needs to show anyway.
      publication: b.track === "blog" ? (b.pillar ?? "blog") : b.publication,
      keywords: b.keywords,
      status: "queued",
    })),
  };
}

/**
 * Run the batch with a bounded number in flight.
 *
 * A worker pool rather than chunking: chunking would idle every worker until the
 * slowest item in the chunk finished, and article runs vary a lot depending on
 * how many revision passes the reviewer demands.
 */
export async function executeBatch(batch: Batch, briefs: Brief[]): Promise<void> {
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= briefs.length) return;

      const item = batch.items[index];
      item.status = "running";
      item.startedAt = new Date().toISOString();
      await saveBatch(batch);

      try {
        const run = newRun(newRunId(), batch.clientRef, briefs[index], batch.campaignId);
        item.runId = run.id;
        await saveRun(run);
        await saveBatch(batch);

        const finished = await executeRun(run);

        item.status = finished.status === "failed" ? "failed" : "done";
        item.verdict = finished.review?.verdict;
        item.costUsd = finished.totalCostUsd;
        batch.totalCostUsd += finished.totalCostUsd;
        if (finished.status === "failed") {
          item.error =
            finished.stages.find((s) => s.status === "failed")?.error ??
            "The pipeline failed.";
        }
      } catch (e) {
        item.status = "failed";
        item.error = e instanceof Error ? e.message : String(e);
      }

      item.endedAt = new Date().toISOString();
      item.durationMs = item.startedAt
        ? Date.parse(item.endedAt) - Date.parse(item.startedAt)
        : undefined;
      await saveBatch(batch);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, briefs.length) }, () => worker())
  );

  batch.status = batch.items.every((i) => i.status === "failed")
    ? "failed"
    : "complete";
  await saveBatch(batch);
}
