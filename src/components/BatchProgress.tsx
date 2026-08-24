"use client";

import Link from "next/link";
import { formatEta, type Batch, type Progress } from "@/lib/batch-types";

/**
 * The batch progress panel, shared by both tracks.
 *
 * The number that matters here is the ETA, and it is deliberately built from the
 * batch's OWN completed runs rather than a constant. It starts as a seed
 * estimate, converges as articles land, and the panel says which it is showing —
 * a confident wrong number is worse than an openly rough one.
 */
export type BatchWithProgress = Batch & { progress: Progress };

export default function BatchProgress({
  batch,
  runHref,
  slotLabel,
  doneHref,
  doneLabel,
  unit = "article",
}: {
  batch: BatchWithProgress;
  /** Where an individual run lives — differs per track. */
  runHref: (runId: string) => string;
  /** Renders the second line of a row: the wire, or the pillar. */
  slotLabel: (slot: string) => string;
  doneHref: string;
  doneLabel: string;
  unit?: string;
}) {
  const p = batch.progress;
  const running = batch.status === "running";

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-sm">
            {running ? "Generating" : "Batch complete"} · {p.total} {unit}
            {p.total === 1 ? "" : "s"}
          </h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            {p.done} done · {p.running} running · {p.queued} queued
            {p.failed > 0 && (
              <span className="text-[var(--danger)]"> · {p.failed} failed</span>
            )}
          </p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-lg font-extrabold tabular-nums">{p.percent}%</div>
          {running && (
            <div className="text-[11px] text-[var(--ink-3)]">
              {p.etaIsSeed ? "about " : ""}
              {formatEta(p.etaMs)} left
            </div>
          )}
        </div>
      </div>

      <div className="h-2 bg-[var(--bg)]">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-500"
          style={{ width: `${p.percent}%` }}
        />
      </div>

      {running && p.etaIsSeed && (
        <p className="px-5 pt-3 text-[11px] text-[var(--ink-4)]">
          The estimate is a starting guess until the first one finishes, then it
          uses this batch&apos;s own timings.
        </p>
      )}

      <div className="divide-y divide-[var(--line)] max-h-[420px] overflow-y-auto">
        {batch.items.map((i, n) => (
          <div key={n} className="px-5 py-3 flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                i.status === "done"
                  ? "bg-[var(--success)]"
                  : i.status === "running"
                    ? "bg-[var(--accent)] running-dot"
                    : i.status === "failed"
                      ? "bg-[var(--danger)]"
                      : "bg-[var(--line)]"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium truncate">
                {i.runId ? (
                  <Link
                    href={runHref(i.runId)}
                    className="hover:text-[var(--accent)] transition-colors"
                  >
                    {i.title}
                  </Link>
                ) : (
                  i.title
                )}
              </div>
              <div className="text-[11px] text-[var(--ink-3)] truncate">
                {slotLabel(i.publication)}
                {i.error && (
                  <span className="text-[var(--danger)]"> · {i.error}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 text-[10.5px] text-[var(--ink-4)]">
              {i.durationMs ? <div>{Math.round(i.durationMs / 1000)}s</div> : null}
              {i.verdict ? <div>{i.verdict}</div> : null}
            </div>
          </div>
        ))}
      </div>

      {!running && (
        <div className="px-5 py-3.5 border-t border-[var(--line)] flex items-center gap-3 flex-wrap">
          <Link
            href={doneHref}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
          >
            {doneLabel}
          </Link>
          {batch.totalCostUsd > 0 && (
            <span className="text-[11px] text-[var(--ink-3)]">
              ${batch.totalCostUsd.toFixed(2)} across the batch
            </span>
          )}
        </div>
      )}
    </div>
  );
}
