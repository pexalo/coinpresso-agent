"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCampaign } from "@/components/CampaignContext";
import GateChip from "@/components/GateChip";
import type { GateState } from "@/lib/approval";
import { PUBLICATIONS } from "@/lib/publications";
import type { PublicationId, RunStatus, StageId, StageStatus } from "@/lib/types";

interface RunSummary {
  id: string;
  campaignId?: string;
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
  queued: "text-[var(--ink-3)] border-[var(--line)] bg-[var(--surface)]",
  running: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
  needs_review: "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
  approved: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
  failed: "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10",
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
      ? "bg-[var(--success)]"
      : s === "running"
        ? "bg-[var(--accent)] running-dot"
        : s === "failed"
          ? "bg-[var(--danger)]"
          : s === "skipped"
            ? "bg-[var(--line)]"
            : "bg-[var(--line)]";
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
  const { selected, campaigns } = useCampaign();
  const [allRuns, setAllRuns] = useState<RunSummary[] | null>(null);

  // Gate progress per run. A wire release goes to a third party and cannot be
  // recalled, so "who still has to sign this" belongs in the list rather than
  // only on the piece — it is what a Monday triage is actually deciding.
  const [gates, setGates] = useState<Record<string, GateState>>({});

  const loadGates = useCallback(async () => {
    const res = await fetch(`/api/clients/${ref}/approvals?track=wire`);
    if (!res.ok) return;
    const data = await res.json();
    setGates(data.gates ?? {});
  }, [ref]);

  useEffect(() => {
    loadGates();
  }, [loadGates]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/clients/${ref}/runs`)
        .then((r) => r.json())
        .then((d) => alive && setAllRuns(d))
        .catch(() => alive && setAllRuns([]));
    load();
    // Poll while anything is in flight so the queue advances without a refresh.
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ref]);

  // Filtered by the campaign picked in the bar above. "All campaigns" shows
  // everything, which is what a Monday morning triage view wants.
  const runs =
    allRuns === null
      ? null
      : selected
        ? allRuns.filter((r) => r.campaignId === selected.id)
        : allRuns;

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
          <p className="text-[var(--ink-3)] text-sm mt-1">
            {selected
              ? `${selected.name} ${selected.ticker} — every run, from brief to wire-ready draft.`
              : "Every campaign, every run, from brief to wire-ready draft."}
          </p>
        </div>
        <Link
          href={`${base}/new`}
          className="text-[13px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          New article
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "In progress", value: active, tone: "var(--accent)" },
          { label: "Ready for review", value: ready, tone: "var(--warning)" },
          { label: "Approved", value: approved, tone: "var(--success)" },
          {
            label: "Model spend",
            value: `$${spend.toFixed(2)}`,
            tone: "var(--ink-2)",
          },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
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
        <div className="card p-8 text-center text-[var(--ink-3)] text-sm">
          Loading…
        </div>
      )}

      {runs !== null && runs.length === 0 && (
        <div className="card p-10 text-center">
          <p className="font-semibold">Nothing in the queue yet.</p>
          <p className="text-[var(--ink-3)] text-sm mt-1.5 max-w-md mx-auto">
            Give the strategy agent a title, the target keywords and the wire it
            is going to. It researches the market, the writer drafts to house
            style, and the reviewer sends it back until it matches.
          </p>
          <Link
            href={`${base}/new`}
            className="inline-block mt-5 text-[13px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            Start the first one
          </Link>
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`${base}/runs/${r.id}`}
              className="flex items-center gap-4 p-4 hover:bg-[var(--surface-2)] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span className="text-[11px] text-[var(--ink-3)]">
                    {PUBLICATIONS[r.brief.publication]?.name ??
                      r.brief.publication}
                  </span>
                  <GateChip gate={gates[r.id]} />
                  {!selected && r.campaignId && (
                    <span className="text-[10px] text-[var(--ink-2)]">
                      {campaigns.find((c) => c.id === r.campaignId)?.name ??
                        r.campaignId}
                    </span>
                  )}
                  {r.mock && (
                    <span className="text-[10px] text-[var(--warning)]">mock</span>
                  )}
                </div>
                <div className="font-semibold text-sm mt-1.5 truncate">
                  {r.brief.title}
                </div>
                <div className="text-[11px] text-[var(--ink-3)] mt-1 truncate">
                  {r.brief.keywords.join(" · ")}
                </div>
              </div>

              <div className="hidden md:flex flex-col items-end gap-1.5 shrink-0">
                <StageDots stages={r.stages} />
                <div className="text-[11px] text-[var(--ink-3)] flex items-center gap-2">
                  {r.wordCount ? <span>{r.wordCount}w</span> : null}
                  {r.revisions > 0 && (
                    <span title="Reviewer sent it back">
                      {r.revisions} revision{r.revisions > 1 ? "s" : ""}
                    </span>
                  )}
                  {r.linkCheckPassed === false && (
                    <span className="text-[var(--danger)]">links flagged</span>
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
