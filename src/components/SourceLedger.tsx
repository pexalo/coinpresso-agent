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
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <h2 className="font-bold text-sm">Source ledger</h2>
        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
          The only URLs the writer was permitted to cite.
        </p>
      </div>

      <div className="px-5 py-3.5 border-b border-[var(--line)] flex flex-wrap gap-x-6 gap-y-1.5 text-[11px]">
        <span className="text-[var(--ink-3)]">
          Catalyst:{" "}
          <span className="text-[var(--ink-2)]">{research.newsCatalyst.date}</span>
        </span>
        <span className="text-[var(--ink-3)]">
          Forecasts:{" "}
          <span className={bullish > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
            {bullish} bullish
          </span>
          {" / "}
          <span className={cautious > 0 ? "text-[var(--success)]" : "text-[var(--warning)]"}>
            {cautious} cautious
          </span>
        </span>
        <span className="text-[var(--ink-3)]">
          Presale:{" "}
          <span
            className={
              research.presaleState.raised === "unverified"
                ? "text-[var(--warning)]"
                : "text-[var(--ink-2)]"
            }
          >
            {research.presaleState.raised} · {research.presaleState.stage}
          </span>
        </span>
      </div>

      {cautious === 0 && research.predictions.length > 0 && (
        <div className="px-5 py-3 border-b border-[var(--line)] text-[11px] text-[var(--warning)] bg-[var(--warning)]/5">
          Every forecast in this brief is bullish. The framework requires a
          cautious counter-forecast — without one the piece reads as advertising.
        </div>
      )}

      <div className="divide-y divide-[var(--line)]">
        {research.sources.map((s) => (
          <div key={s.id} className="px-5 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-3)]">
                {s.id}
              </span>
              <span className="text-[12px] font-semibold">{s.publisher}</span>
              <span className="text-[10px] text-[var(--ink-4)]">
                {KIND_LABEL[s.kind] ?? s.kind}
              </span>
            </div>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] text-[var(--accent)] hover:underline break-all"
            >
              {s.url}
            </a>
            <p className="text-[11px] text-[var(--ink-3)] mt-1">{s.claim}</p>
            {s.figures && s.figures.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {s.figures.map((f) => (
                  <span
                    key={f}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {research.sources.length === 0 && (
          <div className="px-5 py-4 text-[12px] text-[var(--danger)]">
            The strategy agent returned no sources. Nothing here is publishable —
            rerun the brief.
          </div>
        )}
      </div>

      {research.riskNotes.length > 0 && (
        <div className="px-5 py-4 border-t border-[var(--line)] bg-[var(--warning)]/5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--warning)] mb-2">
            Risk notes
          </div>
          <ul className="space-y-1">
            {research.riskNotes.map((r, i) => (
              <li key={i} className="text-[11px] text-[var(--ink-2)] leading-relaxed">
                — {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
