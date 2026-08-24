"use client";

import { useState } from "react";
import type { StageRecord, StageStatus } from "@/lib/types";

const DOT: Record<StageStatus, string> = {
  pending: "bg-[var(--line)]",
  running: "bg-[var(--accent)] running-dot",
  done: "bg-[var(--success)]",
  failed: "bg-[var(--danger)]",
  skipped: "bg-[var(--line)]",
};

const TEXT: Record<StageStatus, string> = {
  pending: "text-[var(--ink-4)]",
  running: "text-[var(--accent)]",
  done: "text-[var(--ink)]",
  failed: "text-[var(--danger)]",
  skipped: "text-[var(--ink-4)]",
};

function duration(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** What each stage exists to do — shown so the workflow is legible to Liam,
 *  not only to whoever built it. */
const PURPOSE: Record<string, string> = {
  strategy:
    "Searches the live market for a dated news catalyst and at least two named third-party price forecasts, then returns a source ledger. Nothing downstream may cite a URL that is not in it.",
  writer:
    "Drafts to the house framework and the wire's format rules, working only from the ledger. Mid-tier model — the brief carries the thinking.",
  linkcheck:
    "Not a model. Compares every URL in the draft against the ledger and requests each one. Fabricated citations look exactly like real ones until clicked, so this check has to be deterministic.",
  reviewer:
    "A different model family from the writer, holding the house style profile. Scores the draft and returns specific fixes. Sending a draft back is a normal outcome.",
  revision:
    "The writer applies the reviewer's findings and only those. Bounded at two passes — after that a human decides.",
  final: "Assembles the wire-ready output and hands it to Liam.",
};

export default function RunTimeline({ stages }: { stages: StageRecord[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <h2 className="font-bold text-sm">Agent workflow</h2>
        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
          Click a stage to see exactly what it received and produced.
        </p>
      </div>

      <div className="divide-y divide-[var(--line)]">
        {stages.map((s) => {
          const expanded = open === s.id;
          const hasDetail = s.output !== undefined || s.error;
          return (
            <div key={s.id}>
              <button
                onClick={() => hasDetail && setOpen(expanded ? null : s.id)}
                className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left ${
                  hasDetail ? "hover:bg-[var(--surface-2)] cursor-pointer" : "cursor-default"
                } transition-colors`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[s.status]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-[13px] font-semibold ${TEXT[s.status]}`}>
                      {s.label}
                    </span>
                    <span className="text-[10px] text-[var(--ink-4)]">
                      {s.agent} · {s.model}
                    </span>
                    {s.attempt && s.attempt > 1 && (
                      <span className="text-[10px] text-[var(--warning)]">
                        pass {s.attempt}
                      </span>
                    )}
                  </div>
                  {s.inputSummary && (
                    <div className="text-[11px] text-[var(--ink-3)] mt-0.5 truncate">
                      {s.inputSummary}
                    </div>
                  )}
                  {s.error && (
                    <div className="text-[11px] text-[var(--danger)] mt-1">{s.error}</div>
                  )}
                </div>
                <div className="text-right shrink-0 text-[10px] text-[var(--ink-4)] leading-relaxed">
                  {s.durationMs ? <div>{duration(s.durationMs)}</div> : null}
                  {s.tokensOut ? (
                    <div>
                      {((s.tokensIn ?? 0) + s.tokensOut).toLocaleString()} tok
                    </div>
                  ) : null}
                  {s.costUsd ? <div>${s.costUsd.toFixed(3)}</div> : null}
                </div>
              </button>

              {expanded && (
                <div className="px-5 pb-5 bg-[var(--bg)]/60">
                  <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mb-3 max-w-2xl">
                    {PURPOSE[s.id]}
                  </p>
                  <pre className="text-[10.5px] leading-relaxed text-[var(--ink-2)] bg-[var(--bg)] border border-[var(--line)] rounded-lg p-3.5 overflow-x-auto max-h-96">
                    {s.error
                      ? s.error
                      : JSON.stringify(s.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
