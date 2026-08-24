"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CONTENT_TYPES, PILLARS } from "@/lib/blog";
import type { ContentTypeId } from "@/lib/blog";
import type { RunStatus, StageId, StageStatus } from "@/lib/types";

interface RunSummary {
  id: string;
  createdAt: string;
  status: RunStatus;
  track: "wire" | "blog";
  brief: {
    title: string;
    keywords: string[];
    pillar?: string;
    contentType?: string;
  };
  revisions: number;
  mock: boolean;
  totalCostUsd: number;
  verdict: string | null;
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
  needs_review: "Ready to read",
  approved: "Approved",
  failed: "Failed",
};

/** The cadence the module is built around. Below it the cluster stalls. */
const TARGET_MIN = 5;
const TARGET_MAX = 8;

export default function BlogQueuePage() {
  const { ref } = useParams<{ ref: string }>();
  const base = `/client/${ref}/own-blog`;
  const [runs, setRuns] = useState<RunSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/clients/${ref}/runs`)
        .then((r) => r.json())
        .then(
          (d: RunSummary[]) =>
            alive && setRuns(d.filter((r) => r.track === "blog"))
        )
        .catch(() => alive && setRuns([]));
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ref]);

  const today = new Date().toISOString().slice(0, 10);
  const todays = runs?.filter((r) => r.createdAt.slice(0, 10) === today) ?? [];

  // Grouped by day, because the unit of work here is a day's publishing rather
  // than an article. Eight posts that are each fine can still be a bad day.
  const byDay = new Map<string, RunSummary[]>();
  (runs ?? []).forEach((r) => {
    const d = r.createdAt.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  });

  const pillarsToday = new Set(todays.map((r) => r.brief.pillar).filter(Boolean));
  const ready = runs?.filter((r) => r.status === "needs_review").length ?? 0;
  const spend = runs?.reduce((a, r) => a + (r.totalCostUsd || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Coinpresso blog
          </h1>
          <p className="text-[var(--ink-3)] text-sm mt-1 max-w-2xl">
            The agency&apos;s own domain. Five to eight a day, spread across the
            service pillars — planned as a day, not as a pile of articles.
          </p>
        </div>
        <Link
          href={`${base}/plan`}
          className="text-[13px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          Plan today
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Today",
            value: `${todays.length}/${TARGET_MAX}`,
            tone:
              todays.length >= TARGET_MIN
                ? "var(--success)"
                : todays.length > 0
                  ? "var(--warning)"
                  : "var(--ink-3)",
          },
          {
            label: "Pillars today",
            value: `${pillarsToday.size}/${PILLARS.length}`,
            tone: pillarsToday.size >= 3 ? "var(--success)" : "var(--warning)",
          },
          { label: "Ready to read", value: ready, tone: "var(--warning)" },
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

      {todays.length > 0 && pillarsToday.size < 3 && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
          Today sits on {pillarsToday.size} pillar
          {pillarsToday.size === 1 ? "" : "s"}. A day concentrated on one hub
          grows that cluster and leaves the rest flat — the planner spreads
          across at least three when you let it.
        </div>
      )}

      {runs === null && (
        <div className="card p-8 text-center text-[var(--ink-3)] text-sm">
          Loading…
        </div>
      )}

      {runs !== null && runs.length === 0 && (
        <div className="card p-10 text-center">
          <p className="font-semibold">Nothing on the blog yet.</p>
          <p className="text-[var(--ink-3)] text-sm mt-1.5 max-w-md mx-auto">
            The planner reads the pillars and everything already published, then
            proposes a day&apos;s worth spread across services and formats. You
            pick which of them are worth running.
          </p>
          <Link
            href={`${base}/plan`}
            className="inline-block mt-5 text-[13px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            Plan the first day
          </Link>
        </div>
      )}

      {[...byDay.entries()].map(([day, items]) => (
        <div key={day} className="space-y-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[13px] font-bold">
              {day === today ? "Today" : day}
            </h2>
            <span className="text-[11px] text-[var(--ink-3)]">
              {items.length} post{items.length === 1 ? "" : "s"} ·{" "}
              {new Set(items.map((i) => i.brief.pillar).filter(Boolean)).size}{" "}
              pillars ·{" "}
              {new Set(items.map((i) => i.brief.contentType).filter(Boolean)).size}{" "}
              formats
            </span>
          </div>

          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {items.map((r) => {
              const pillar = PILLARS.find((p) => p.id === r.brief.pillar);
              const type = CONTENT_TYPES[r.brief.contentType as ContentTypeId];
              return (
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
                      {pillar && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]">
                          {pillar.name}
                        </span>
                      )}
                      {type && (
                        <span className="text-[11px] text-[var(--ink-3)]">
                          {type.name}
                        </span>
                      )}
                      {r.mock && (
                        <span className="text-[10px] text-[var(--warning)]">
                          mock
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm mt-1.5 truncate">
                      {r.brief.title}
                    </div>
                    <div className="text-[11px] text-[var(--ink-3)] mt-1 truncate">
                      {r.brief.keywords.join(" · ")}
                    </div>
                  </div>

                  <div className="hidden md:flex flex-col items-end gap-1 shrink-0 text-[11px] text-[var(--ink-3)]">
                    {r.wordCount ? <span>{r.wordCount}w</span> : null}
                    {r.revisions > 0 && (
                      <span title="Reviewer sent it back">
                        {r.revisions} revision{r.revisions > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
