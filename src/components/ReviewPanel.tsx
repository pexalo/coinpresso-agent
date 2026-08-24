"use client";

import type { LinkCheckResult, ReviewResult } from "@/lib/types";

const SEV: Record<string, { chip: string; label: string }> = {
  blocker: {
    chip: "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10",
    label: "Blocker",
  },
  major: {
    chip: "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
    label: "Major",
  },
  minor: {
    chip: "text-[var(--ink-3)] border-[var(--line)] bg-[var(--surface)]",
    label: "Minor",
  },
};

function Bar({ label, value }: { label: string; value: number }) {
  const tone = value >= 85 ? "var(--success)" : value >= 70 ? "var(--warning)" : "var(--danger)";
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-[var(--ink-3)]">{label}</span>
        <span style={{ color: tone }} className="font-semibold">
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--bg)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }}
        />
      </div>
    </div>
  );
}

export default function ReviewPanel({
  review,
  linkCheck,
}: {
  review?: ReviewResult;
  linkCheck?: LinkCheckResult;
}) {
  if (!review && !linkCheck) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-sm">Review</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            Cross-family check against the house style and the sourcing standard.
          </p>
        </div>
        {review && (
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              review.verdict === "pass"
                ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
                : review.verdict === "revise"
                  ? "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10"
                  : "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10"
            }`}
          >
            {review.verdict.toUpperCase()}
          </span>
        )}
      </div>

      {linkCheck && (
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`w-2 h-2 rounded-full ${linkCheck.passed ? "bg-[var(--success)]" : "bg-[var(--danger)]"}`}
            />
            <span className="text-[12px] font-semibold">
              Citation check — {linkCheck.checked} link
              {linkCheck.checked === 1 ? "" : "s"}{" "}
              {linkCheck.passed ? "all traced and reachable" : "flagged"}
            </span>
          </div>
          {linkCheck.unsourced.length > 0 && (
            <div className="text-[11px] text-[var(--danger)] mb-1.5">
              <span className="font-semibold">Not in the research ledger:</span>{" "}
              {linkCheck.unsourced.join(", ")}
            </div>
          )}
          {linkCheck.unreachable.length > 0 && (
            <div className="text-[11px] text-[var(--danger)]">
              <span className="font-semibold">Did not resolve:</span>{" "}
              {linkCheck.unreachable
                .map((u) => `${u.url} (${u.status ?? "no response"})`)
                .join(", ")}
            </div>
          )}
        </div>
      )}

      {review && (
        <>
          <div className="px-5 py-4 border-b border-[var(--line)] grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Bar label="Style" value={review.scores.styleMatch} />
            <Bar label="Sourcing" value={review.scores.sourcing} />
            <Bar label="Structure" value={review.scores.structure} />
            <Bar label="SEO" value={review.scores.seo} />
            <Bar label="Compliance" value={review.scores.compliance} />
          </div>

          <div className="px-5 py-4 border-b border-[var(--line)]">
            <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
              {review.summary}
            </p>
          </div>

          {review.findings.length > 0 ? (
            <div className="divide-y divide-[var(--line)]">
              {review.findings.map((f, i) => (
                <div key={i} className="px-5 py-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${SEV[f.severity]?.chip}`}
                    >
                      {SEV[f.severity]?.label ?? f.severity}
                    </span>
                    <span className="text-[10px] text-[var(--ink-4)] uppercase tracking-wide">
                      {f.category}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
                    {f.detail}
                  </p>
                  <p className="text-[12px] text-[var(--ink-3)] leading-relaxed mt-1">
                    <span className="text-[var(--accent)] font-semibold">Fix: </span>
                    {f.fix}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-4 text-[12px] text-[var(--ink-3)]">
              No findings raised.
            </div>
          )}
        </>
      )}
    </div>
  );
}
