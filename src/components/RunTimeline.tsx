"use client";

import { useState } from "react";
import type { StageRecord, StageStatus } from "@/lib/types";

const DOT: Record<StageStatus, string> = {
  pending: "bg-[#2A3A52]",
  running: "bg-[#4E78FF] running-dot",
  done: "bg-[#3DDC97]",
  failed: "bg-[#EF4444]",
  skipped: "bg-[#2A3A52]",
};

const TEXT: Record<StageStatus, string> = {
  pending: "text-[#5A6884]",
  running: "text-[#4E78FF]",
  done: "text-white",
  failed: "text-[#EF4444]",
  skipped: "text-[#5A6884]",
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
      <div className="px-5 py-4 border-b border-[#2A3A52]">
        <h2 className="font-bold text-sm">Agent workflow</h2>
        <p className="text-[11px] text-[#7F8CA8] mt-0.5">
          Click a stage to see exactly what it received and produced.
        </p>
      </div>

      <div className="divide-y divide-[#2A3A52]">
        {stages.map((s) => {
          const expanded = open === s.id;
          const hasDetail = s.output !== undefined || s.error;
          return (
            <div key={s.id}>
              <button
                onClick={() => hasDetail && setOpen(expanded ? null : s.id)}
                className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left ${
                  hasDetail ? "hover:bg-[#1C2F45] cursor-pointer" : "cursor-default"
                } transition-colors`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[s.status]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-[13px] font-semibold ${TEXT[s.status]}`}>
                      {s.label}
                    </span>
                    <span className="text-[10px] text-[#5A6884]">
                      {s.agent} · {s.model}
                    </span>
                    {s.attempt && s.attempt > 1 && (
                      <span className="text-[10px] text-[#F4B740]">
                        pass {s.attempt}
                      </span>
                    )}
                  </div>
                  {s.inputSummary && (
                    <div className="text-[11px] text-[#7F8CA8] mt-0.5 truncate">
                      {s.inputSummary}
                    </div>
                  )}
                  {s.error && (
                    <div className="text-[11px] text-[#EF4444] mt-1">{s.error}</div>
                  )}
                </div>
                <div className="text-right shrink-0 text-[10px] text-[#5A6884] leading-relaxed">
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
                <div className="px-5 pb-5 bg-[#0D1B2A]/60">
                  <p className="text-[11px] text-[#7F8CA8] leading-relaxed mb-3 max-w-2xl">
                    {PURPOSE[s.id]}
                  </p>
                  <pre className="text-[10.5px] leading-relaxed text-[#B8C2D6] bg-[#0D1B2A] border border-[#2A3A52] rounded-lg p-3.5 overflow-x-auto max-h-96">
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
