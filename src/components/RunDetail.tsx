"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RunTimeline from "@/components/RunTimeline";
import ReviewPanel from "@/components/ReviewPanel";
import ArticleView from "@/components/ArticleView";
import ApprovalGate from "@/components/ApprovalGate";
import SourceLedger from "@/components/SourceLedger";
import { PUBLICATIONS } from "@/lib/publications";
import { PILLARS, CONTENT_TYPES } from "@/lib/blog";
import type { Run } from "@/lib/types";
import type { GateState } from "@/lib/approval";
import { statusView, TONE_CLASS } from "@/lib/run-status";
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
  const [gate, setGate] = useState<GateState | null>(null);

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

  const onGate = useCallback((g: GateState) => setGate(g), []);

  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  // Fire the retry, then fall back into the normal polling loop: the run's
  // status leaves "failed", the settled check stops matching, and the page
  // updates itself exactly as it does on a first attempt.
  const retry = useCallback(async (from?: "writer") => {
    setRetrying(true);
    setRetryMsg(null);
    try {
      const res = await fetch(
        `/api/clients/${ref}/runs/${id}/retry${from ? `?from=${from}` : ""}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retry failed to start.");
      const tick = async () => {
        const d = await load();
        if (
          d &&
          d.status !== "needs_review" &&
          d.status !== "approved" &&
          d.status !== "failed"
        ) {
          setTimeout(tick, 2500);
        } else {
          setRetrying(false);
        }
      };
      setTimeout(tick, 1500);
    } catch (e) {
      setRetrying(false);
      setRetryMsg(e instanceof Error ? e.message : String(e));
    }
  }, [ref, id, load]);

  // Mirrored from the approval panel so the release button has one source of
  // truth. The server checks the same gate independently — this only decides
  // whether the button is offered, never whether the release is allowed.
  const gateOpen = gate?.canRelease ?? false;
  const releasedByName = gate?.valid.map((s) => s.name).join(", ") || "unknown";

  async function approve() {
    setApproving(true);
    setExportMsg(null);
    try {
      const res = await fetch(`/api/clients/${ref}/runs/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvedBy: releasedByName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExportMsg(data.error ?? "Release refused.");
        return;
      }
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
              disabled={approving || !gateOpen}
              title={
                gateOpen
                  ? "Everyone required has signed this draft."
                  : "Needs its approvals first — see the panel below."
              }
              className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--success)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              {approving ? "Releasing…" : "Release"}
            </button>
          )}
          {run.status === "approved" && (
            <span className="text-[11px] font-semibold px-3 py-2 rounded-lg text-[var(--success)] border border-[var(--success)]/30 bg-[var(--success)]/10">
              Released
            </span>
          )}
          {isBlog && run.draft && (
            <button
              onClick={sendToWordPress}
              disabled={pushing || !(gateOpen || run.status === "approved")}
              title={
                gateOpen || run.status === "approved"
                  ? "Creates a draft in WordPress. Never publishes."
                  : "Blocked until this has its approvals."
              }
              className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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

      {run.status === "failed" && (() => {
        // One banner for both kinds of failure, worded by whether a draft
        // exists, with the retry right here — it used to live only in the
        // empty-article placeholder, so a run that HAD an article showed the
        // article and no way to finish it.
        const v = statusView("failed", Boolean(run.draft));
        return (
          <div className={`rounded-lg border px-4 py-3.5 ${TONE_CLASS[v.tone]}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="text-[12.5px] leading-relaxed max-w-3xl">
                <strong className="font-semibold">{v.label}.</strong> {v.detail}
              </div>
              <div className="flex flex-col items-end gap-1 flex-none">
                <button
                  onClick={() => retry()}
                  disabled={retrying}
                  className="text-[12.5px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                >
                  {retrying ? "Retrying…" : "Retry from where it failed"}
                </button>
                {retryMsg && (
                  <span className="text-[11.5px] text-[var(--danger)]">{retryMsg}</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {run.draft && run.rendered ? (
            <>
              <ArticleView draft={run.draft} rendered={run.rendered} />
              {(run.status === "failed" || run.status === "needs_review") && (
                <div className="card px-5 py-4 flex flex-wrap items-center gap-4">
                  <div className="text-[12px] text-[var(--ink-3)] max-w-xl leading-relaxed">
                    Not right?{" "}
                    <strong className="text-[var(--ink)]">Rewrite from research</strong>{" "}
                    keeps the sources and the ledger and re-runs only the
                    writer — about a seventh of the cost of a fresh run. Any
                    signatures already given go stale, by design.
                  </div>
                  <div className="ml-auto flex flex-col items-end gap-1">
                    <button
                      onClick={() => retry("writer")}
                      disabled={retrying}
                      className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-40 transition-colors"
                    >
                      {retrying ? "Rewriting…" : "Rewrite from research"}
                    </button>
                    {retryMsg && run.status !== "failed" && (
                      <span className="text-[11.5px] text-[var(--danger)]">{retryMsg}</span>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card p-10 text-center text-[var(--ink-3)] text-sm">
              {run.status === "failed"
                ? "No article was produced. The stage that failed is in the timeline on the right."
                : "No draft yet."}
            </div>
          )}
          <ReviewPanel review={run.review} linkCheck={run.linkCheck} />
        </div>

        <div className="space-y-5 min-w-0">
          {/* Above the timeline on purpose. The timeline is what the machine
              did; this is what a person still has to do, and it is the reason
              the piece is sitting here. */}
          {run.draft && (
            <ApprovalGate clientRef={ref} runId={id} onGate={onGate} />
          )}
          <RunTimeline stages={run.stages} />
          {run.research && <SourceLedger research={run.research} />}
        </div>
      </div>
    </div>
  );
}
