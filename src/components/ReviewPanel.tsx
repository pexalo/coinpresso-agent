"use client";

import type { LinkCheckResult, ReviewResult } from "@/lib/types";

const SEV: Record<string, { chip: string; label: string }> = {
  blocker: {
    chip: "text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10",
    label: "Blocker",
  },
  major: {
    chip: "text-[#F4B740] border-[#F4B740]/30 bg-[#F4B740]/10",
    label: "Major",
  },
  minor: {
    chip: "text-[#7F8CA8] border-[#2A3A52] bg-[#152538]",
    label: "Minor",
  },
};

function Bar({ label, value }: { label: string; value: number }) {
  const tone = value >= 85 ? "#3DDC97" : value >= 70 ? "#F4B740" : "#EF4444";
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-[#7F8CA8]">{label}</span>
        <span style={{ color: tone }} className="font-semibold">
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#0D1B2A] overflow-hidden">
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
      <div className="px-5 py-4 border-b border-[#2A3A52] flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-sm">Review</h2>
          <p className="text-[11px] text-[#7F8CA8] mt-0.5">
            Cross-family check against the house style and the sourcing standard.
          </p>
        </div>
        {review && (
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              review.verdict === "pass"
                ? "text-[#3DDC97] border-[#3DDC97]/30 bg-[#3DDC97]/10"
                : review.verdict === "revise"
                  ? "text-[#F4B740] border-[#F4B740]/30 bg-[#F4B740]/10"
                  : "text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10"
            }`}
          >
            {review.verdict.toUpperCase()}
          </span>
        )}
      </div>

      {linkCheck && (
        <div className="px-5 py-4 border-b border-[#2A3A52]">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`w-2 h-2 rounded-full ${linkCheck.passed ? "bg-[#3DDC97]" : "bg-[#EF4444]"}`}
            />
            <span className="text-[12px] font-semibold">
              Citation check — {linkCheck.checked} link
              {linkCheck.checked === 1 ? "" : "s"}{" "}
              {linkCheck.passed ? "all traced and reachable" : "flagged"}
            </span>
          </div>
          {linkCheck.unsourced.length > 0 && (
            <div className="text-[11px] text-[#EF4444] mb-1.5">
              <span className="font-semibold">Not in the research ledger:</span>{" "}
              {linkCheck.unsourced.join(", ")}
            </div>
          )}
          {linkCheck.unreachable.length > 0 && (
            <div className="text-[11px] text-[#EF4444]">
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
          <div className="px-5 py-4 border-b border-[#2A3A52] grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Bar label="Style" value={review.scores.styleMatch} />
            <Bar label="Sourcing" value={review.scores.sourcing} />
            <Bar label="Structure" value={review.scores.structure} />
            <Bar label="SEO" value={review.scores.seo} />
            <Bar label="Compliance" value={review.scores.compliance} />
          </div>

          <div className="px-5 py-4 border-b border-[#2A3A52]">
            <p className="text-[12px] text-[#B8C2D6] leading-relaxed">
              {review.summary}
            </p>
          </div>

          {review.findings.length > 0 ? (
            <div className="divide-y divide-[#2A3A52]">
              {review.findings.map((f, i) => (
                <div key={i} className="px-5 py-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${SEV[f.severity]?.chip}`}
                    >
                      {SEV[f.severity]?.label ?? f.severity}
                    </span>
                    <span className="text-[10px] text-[#5A6884] uppercase tracking-wide">
                      {f.category}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#B8C2D6] leading-relaxed">
                    {f.detail}
                  </p>
                  <p className="text-[12px] text-[#7F8CA8] leading-relaxed mt-1">
                    <span className="text-[#4E78FF] font-semibold">Fix: </span>
                    {f.fix}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-4 text-[12px] text-[#7F8CA8]">
              No findings raised.
            </div>
          )}
        </>
      )}
    </div>
  );
}
