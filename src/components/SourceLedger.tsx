"use client";

import type { ResearchBrief } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  prediction: "Forecast",
  news: "News",
  market_data: "Market data",
  onchain: "On-chain",
  project: "Project",
};

export default function SourceLedger({ research }: { research: ResearchBrief }) {
  const bullish = research.predictions.filter((p) => p.stance === "bullish").length;
  const cautious = research.predictions.length - bullish;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[#2A3A52]">
        <h2 className="font-bold text-sm">Source ledger</h2>
        <p className="text-[11px] text-[#7F8CA8] mt-0.5">
          The only URLs the writer was permitted to cite.
        </p>
      </div>

      <div className="px-5 py-3.5 border-b border-[#2A3A52] flex flex-wrap gap-x-6 gap-y-1.5 text-[11px]">
        <span className="text-[#7F8CA8]">
          Catalyst:{" "}
          <span className="text-[#B8C2D6]">{research.newsCatalyst.date}</span>
        </span>
        <span className="text-[#7F8CA8]">
          Forecasts:{" "}
          <span className={bullish > 0 ? "text-[#3DDC97]" : "text-[#EF4444]"}>
            {bullish} bullish
          </span>
          {" / "}
          <span className={cautious > 0 ? "text-[#3DDC97]" : "text-[#F4B740]"}>
            {cautious} cautious
          </span>
        </span>
        <span className="text-[#7F8CA8]">
          Presale:{" "}
          <span
            className={
              research.presaleState.raised === "unverified"
                ? "text-[#F4B740]"
                : "text-[#B8C2D6]"
            }
          >
            {research.presaleState.raised} · {research.presaleState.stage}
          </span>
        </span>
      </div>

      {cautious === 0 && research.predictions.length > 0 && (
        <div className="px-5 py-3 border-b border-[#2A3A52] text-[11px] text-[#F4B740] bg-[#F4B740]/5">
          Every forecast in this brief is bullish. The framework requires a
          cautious counter-forecast — without one the piece reads as advertising.
        </div>
      )}

      <div className="divide-y divide-[#2A3A52]">
        {research.sources.map((s) => (
          <div key={s.id} className="px-5 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[#0D1B2A] border border-[#2A3A52] text-[#7F8CA8]">
                {s.id}
              </span>
              <span className="text-[12px] font-semibold">{s.publisher}</span>
              <span className="text-[10px] text-[#5A6884]">
                {KIND_LABEL[s.kind] ?? s.kind}
              </span>
            </div>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] text-[#4E78FF] hover:underline break-all"
            >
              {s.url}
            </a>
            <p className="text-[11px] text-[#7F8CA8] mt-1">{s.claim}</p>
            {s.figures && s.figures.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {s.figures.map((f) => (
                  <span
                    key={f}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#0D1B2A] border border-[#2A3A52] text-[#B8C2D6]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {research.sources.length === 0 && (
          <div className="px-5 py-4 text-[12px] text-[#EF4444]">
            The strategy agent returned no sources. Nothing here is publishable —
            rerun the brief.
          </div>
        )}
      </div>

      {research.riskNotes.length > 0 && (
        <div className="px-5 py-4 border-t border-[#2A3A52] bg-[#F4B740]/5">
          <div className="text-[10px] uppercase tracking-wider text-[#F4B740] mb-2">
            Risk notes
          </div>
          <ul className="space-y-1">
            {research.riskNotes.map((r, i) => (
              <li key={i} className="text-[11px] text-[#B8C2D6] leading-relaxed">
                — {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
