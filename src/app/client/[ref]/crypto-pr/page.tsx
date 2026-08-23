"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PUBLICATIONS } from "@/lib/publications";
import type { PublicationId, RunStatus, StageId, StageStatus } from "@/lib/types";

interface RunSummary {
  id: string;
  createdAt: string;
  status: RunStatus;
  brief: { title: string; keywords: string[]; publication: PublicationId };
  revisions: number;
  mock: boolean;
  totalCostUsd: number;
  verdict: string | null;
  linkCheckPassed: boolean | null;
  wordCount: number | null;
  stages: Array<{ id: StageId; status: StageStatus }>;
}

const STATUS_STYLE: Record<RunStatus, string> = {
  queued: "text-[#7F8CA8] border-[#2A3A52] bg-[#152538]",
  running: "text-[#4E78FF] border-[#4E78FF]/30 bg-[#4E78FF]/10",
  needs_review: "text-[#F4B740] border-[#F4B740]/30 bg-[#F4B740]/10",
  approved: "text-[#3DDC97] border-[#3DDC97]/30 bg-[#3DDC97]/10",
  failed: "text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  needs_review: "Ready for review",
  approved: "Approved",
  failed: "Failed",
};

function StageDots({ stages }: { stages: RunSummary["stages"] }) {
  const color = (s: StageStatus) =>
    s === "done"
      ? "bg-[#3DDC97]"
      : s === "running"
        ? "bg-[#4E78FF] running-dot"
        : s === "failed"
          ? "bg-[#EF4444]"
          : s === "skipped"
            ? "bg-[#2A3A52]"
            : "bg-[#2A3A52]";
  return (
    <div className="flex items-center gap-1">
      {stages.map((s) => (
        <span
          key={s.id}
          title={`${s.id}: ${s.status}`}
          className={`w-1.5 h-1.5 rounded-full ${color(s.status)}`}
        />
      ))}
    </div>
  );
}

export default function QueuePage() {
  const { ref } = useParams<{ ref: string }>();
  const base = `/client/${ref}/crypto-pr`;
  const [runs, setRuns] = useState<RunSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/clients/${ref}/runs`)
        .then((r) => r.json())
        .then((d) => alive && setRuns(d))
        .catch(() => alive && setRuns([]));
    load();
    // Poll while anything is in flight so the queue advances without a refresh.
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ref]);

  const active = runs?.filter((r) => r.status === "running").length ?? 0;
  const ready = runs?.filter((r) => r.status === "needs_review").length ?? 0;
  const approved = runs?.filter((r) => r.status === "approved").length ?? 0;
  const spend = runs?.reduce((a, r) => a + (r.totalCostUsd || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Article queue
          </h1>
          <p className="text-[#7F8CA8] text-sm mt-1">
            Every run, from brief to wire-ready draft.
          </p>
        </div>
        <Link
          href={`${base}/new`}
          className="text-[13px] font-semibold px-4 py-2.5 rounded-lg bg-[#4E78FF] hover:bg-[#3D63E6] transition-colors"
        >
          New article
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "In progress", value: active, tone: "#4E78FF" },
          { label: "Ready for review", value: ready, tone: "#F4B740" },
          { label: "Approved", value: approved, tone: "#3DDC97" },
          {
            label: "Model spend",
            value: `$${spend.toFixed(2)}`,
            tone: "#B8C2D6",
          },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#7F8CA8]">
              {k.label}
            </div>
            <div
              className="text-2xl font-extrabold mt-1.5"
              style={{ color: k.tone }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {runs === null && (
        <div className="card p-8 text-center text-[#7F8CA8] text-sm">
          Loading…
        </div>
      )}

      {runs !== null && runs.length === 0 && (
        <div className="card p-10 text-center">
          <p className="font-semibold">Nothing in the queue yet.</p>
          <p className="text-[#7F8CA8] text-sm mt-1.5 max-w-md mx-auto">
            Give the strategy agent a title, the target keywords and the wire it
            is going to. It researches the market, the writer drafts to house
            style, and the reviewer sends it back until it matches.
          </p>
          <Link
            href={`${base}/new`}
            className="inline-block mt-5 text-[13px] font-semibold px-4 py-2.5 rounded-lg bg-[#4E78FF] hover:bg-[#3D63E6]"
          >
            Start the first one
          </Link>
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="card divide-y divide-[#2A3A52] overflow-hidden">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`${base}/runs/${r.id}`}
              className="flex items-center gap-4 p-4 hover:bg-[#1C2F45] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span className="text-[11px] text-[#7F8CA8]">
                    {PUBLICATIONS[r.brief.publication]?.name ??
                      r.brief.publication}
                  </span>
                  {r.mock && (
                    <span className="text-[10px] text-[#F4B740]">mock</span>
                  )}
                </div>
                <div className="font-semibold text-sm mt-1.5 truncate">
                  {r.brief.title}
                </div>
                <div className="text-[11px] text-[#7F8CA8] mt-1 truncate">
                  {r.brief.keywords.join(" · ")}
                </div>
              </div>

              <div className="hidden md:flex flex-col items-end gap-1.5 shrink-0">
                <StageDots stages={r.stages} />
                <div className="text-[11px] text-[#7F8CA8] flex items-center gap-2">
                  {r.wordCount ? <span>{r.wordCount}w</span> : null}
                  {r.revisions > 0 && (
                    <span title="Reviewer sent it back">
                      {r.revisions} revision{r.revisions > 1 ? "s" : ""}
                    </span>
                  )}
                  {r.linkCheckPassed === false && (
                    <span className="text-[#EF4444]">links flagged</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
