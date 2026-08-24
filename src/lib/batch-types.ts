// ---------------------------------------------------------------------------
// Batch types and the pure functions over them.
//
// Split from batch.ts because the progress panel is a client component and
// batch.ts reaches for node:fs. Types and arithmetic belong on both sides of
// that line; file access belongs on one.
// ---------------------------------------------------------------------------

export type BatchItemStatus = "queued" | "running" | "done" | "failed";

export interface BatchItem {
  runId: string | null;
  title: string;
  publication: string;
  keywords: string[];
  status: BatchItemStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  error?: string;
  verdict?: string;
  costUsd?: number;
}

export interface Batch {
  id: string;
  clientRef: string;
  /** Which pipeline this batch ran. Absent on batches created before the blog
   *  track existed, which are all wire. */
  track?: "wire" | "blog";
  campaignId?: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "complete" | "failed";
  mock: boolean;
  items: BatchItem[];
  totalCostUsd: number;
}

export interface Progress {
  done: number;
  running: number;
  queued: number;
  failed: number;
  total: number;
  percent: number;
  /** Milliseconds remaining, or null while there is nothing to estimate from. */
  etaMs: number | null;
  /** True while the estimate is still the seed rather than measured. */
  etaIsSeed: boolean;
  averageMs: number;
}

/** How many pipelines run at once. Each is 3–5 model calls plus web search. */
export const CONCURRENCY = 3;

/** Used only until the batch has completed runs of its own to average. */
export const SEED_ESTIMATE_MS = 210_000;
export const SEED_ESTIMATE_MOCK_MS = 9_000;

/**
 * Remaining time, from this batch's own completed runs.
 *
 * The arithmetic that matters: work left is the queued items plus the running
 * ones (counted as half done on average), divided by how many run at once.
 */
export function progressOf(b: Batch): Progress {
  const done = b.items.filter((i) => i.status === "done").length;
  const failed = b.items.filter((i) => i.status === "failed").length;
  const running = b.items.filter((i) => i.status === "running").length;
  const queued = b.items.filter((i) => i.status === "queued").length;
  const total = b.items.length;

  const measured = b.items
    .filter((i) => i.durationMs && i.status === "done")
    .map((i) => i.durationMs!);

  const seed = b.mock ? SEED_ESTIMATE_MOCK_MS : SEED_ESTIMATE_MS;
  const averageMs = measured.length
    ? measured.reduce((a, c) => a + c, 0) / measured.length
    : seed;

  const unitsLeft = queued + running * 0.5;
  const etaMs =
    unitsLeft <= 0
      ? 0
      : Math.round(
          (unitsLeft / Math.min(CONCURRENCY, Math.max(unitsLeft, 1))) * averageMs
        );

  return {
    done,
    running,
    queued,
    failed,
    total,
    percent: total ? Math.round(((done + failed) / total) * 100) : 0,
    etaMs: total ? etaMs : null,
    etaIsSeed: measured.length === 0,
    averageMs,
  };
}

export function formatEta(ms: number | null): string {
  if (ms === null) return "—";
  if (ms <= 0) return "done";
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  if (mins >= 1) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}
