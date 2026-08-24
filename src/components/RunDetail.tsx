"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RunTimeline from "@/components/RunTimeline";
import ReviewPanel from "@/components/ReviewPanel";
import ArticleView from "@/components/ArticleView";
import SourceLedger from "@/components/SourceLedger";
import { PUBLICATIONS } from "@/lib/publications";
import { PILLARS, CONTENT_TYPES } from "@/lib/blog";
import type { Run } from "@/lib/types";
import type { ContentTypeId } from "@/lib/blog";

interface RunResponse extends Run {
  rendered: { plain: string; markdown: string; html: string } | null;
}

/**
 * One run, whichever track produced it. The pipeline, the store and every panel
 * below are shared; only the breadcrumb and the line of metadata under the title
 * differ, because a wire release is described by its wire and a blog post by its
 * pillar.
 */
export default function RunDetail({
  clientRef: ref,
  id,
  base,
  backLabel,
}: {
  clientRef: string;
  id: string;
  base: string;
  backLabel: string;
}) {
  const [run, setRun] = useState<RunResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [approving, setApproving] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushOk, setPushOk] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${ref}/runs/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    const data = (await res.json()) as RunResponse;
    setRun(data);
    return data;
  }, [ref, id]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const data = await load();
      if (!alive) return;
      // Stop polling once the pipeline has settled.
      const settled =
        data &&
        (data.status === "needs_review" ||
          data.status === "approved" ||
          data.status === "failed");
      if (!settled) timer = setTimeout(tick, 2500);
    };
    tick();

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [load]);

  async function approve() {
    setApproving(true);
    setExportMsg(null);
    try {
      const res = await fetch(`/api/clients/${ref}/runs/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvedBy: "Liam" }),
      });
      const data = await res.json();
      if (data.docUrl) {
        setExportMsg(
          `Google Doc created${data.sheetUpdated ? " and the content calendar updated" : ""}.`
        );
      } else {
        setExportMsg(
          data.exportError ||
            data.skippedReason ||
            "Approved. Google export is not configured, so the draft stays here."
        );
      }
      await load();
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  }

  /** Create this post in WordPress as a draft. Blog track only. */
  async function sendToWordPress() {
    setPushing(true);
    setPushMsg(null);
    try {
      const res = await fetch(`/api/clients/${ref}/runs/${id}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      setPushOk(Boolean(data.ok));
      setPushMsg(
        [data.detail ?? data.error, ...(data.warnings ?? [])]
          .filter(Boolean)
          .join(" ")
      );
      await load();
    } catch (e) {
      setPushOk(false);
      setPushMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  }

  if (notFound) {
    return (
      <div className="card p-10 text-center mt-6">
        <p className="font-semibold">That run does not exist.</p>
        <Link href={base} className="text-[var(--accent)] text-sm mt-3 inline-block">
          {backLabel}
        </Link>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="card p-10 text-center mt-6 text-[var(--ink-3)] text-sm">
        Loading…
      </div>
    );
  }

  const isBlog = run.brief.track === "blog";
  const pillar = PILLARS.find((p) => p.id === run.brief.pillar);
  const type = CONTENT_TYPES[run.brief.contentType as ContentTypeId];
  const slot = isBlog
    ? [pillar?.name, type?.name].filter(Boolean).join(" · ") || "Coinpresso blog"
    : (PUBLICATIONS[run.brief.publication]?.name ?? run.brief.publication);
  const inFlight = run.status === "running" || run.status === "queued";

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link
            href={base}
            className="text-[11px] text-[var(--ink-3)] hover:text-[var(--accent)]"
          >
            ← {backLabel}
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight mt-1.5 leading-snug">
            {run.brief.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-3)] mt-2">
            <span>{slot}</span>
            <span>{run.brief.keywords.join(" · ")}</span>
            {run.revisions > 0 && (
              <span className="text-[var(--warning)]">
                {run.revisions} revision pass{run.revisions > 1 ? "es" : ""}
              </span>
            )}
            {run.totalCostUsd > 0 && (
              <span>${run.totalCostUsd.toFixed(3)}</span>
            )}
            {run.mock && <span className="text-[var(--warning)]">mock run</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {run.docUrl && (
            <a
              href={run.docUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50"
            >
              Open Doc
            </a>
          )}
          {run.draft && run.status !== "approved" && (
            <button
              onClick={approve}
              disabled={approving}
              className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--success)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {approving ? "Approving…" : "Approve & export"}
            </button>
          )}
          {run.status === "approved" && (
            <span className="text-[11px] font-semibold px-3 py-2 rounded-lg text-[var(--success)] border border-[var(--success)]/30 bg-[var(--success)]/10">
              Approved
            </span>
          )}
          {isBlog && run.draft && (
            <button
              onClick={sendToWordPress}
              disabled={pushing}
              title="Creates a draft in WordPress. Never publishes."
              className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-50 transition-colors"
            >
              {pushing ? "Sending…" : "Send to WordPress"}
            </button>
          )}
        </div>
      </div>

      {run.mock && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
          This run executed in mock mode — no search was performed and no figure
          in it is real. Add <code>ANTHROPIC_API_KEY</code> and{" "}
          <code>OPENAI_API_KEY</code> to <code>.env.local</code> for live runs.
        </div>
      )}

      {pushMsg && (
        <div
          className={`rounded-lg border px-4 py-3 text-[12px] ${
            pushOk
              ? "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]"
              : "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]"
          }`}
        >
          {pushMsg}
          {pushOk && run.docUrl && (
            <>
              {" "}
              <a
                href={run.docUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline font-semibold"
              >
                Open it in WordPress
              </a>
            </>
          )}
        </div>
      )}

      {exportMsg && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[12px] text-[var(--ink-2)]">
          {exportMsg}
        </div>
      )}

      {inFlight && (
        <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-3 text-[12px] text-[var(--accent)] flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] running-dot" />
          The agents are working. This page updates itself.
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {run.draft && run.rendered ? (
            <ArticleView draft={run.draft} rendered={run.rendered} />
          ) : (
            <div className="card p-10 text-center text-[var(--ink-3)] text-sm">
              {run.status === "failed"
                ? "The pipeline failed before a draft was produced. The stage that failed is on the right."
                : "No draft yet."}
            </div>
          )}
          <ReviewPanel review={run.review} linkCheck={run.linkCheck} />
        </div>

        <div className="space-y-5 min-w-0">
          <RunTimeline stages={run.stages} />
          {run.research && <SourceLedger research={run.research} />}
        </div>
      </div>
    </div>
  );
}
