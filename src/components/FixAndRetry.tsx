"use client";

// ---------------------------------------------------------------------------
// The box under a rejection.
//
// Two things were costing money here, and they compounded.
//
// The writer's checks used to throw one at a time, so a draft with five faults
// reported one. It fixed that, discovered the second, fixed that, discovered
// the third — three paid attempts for three single-fault corrections and no
// article. The checks now run to completion and the rejection names every
// fault, which is what this panel is built around.
//
// And the only thing to do with a rejection was press Retry, which sent the
// same prompt and bought the same answer. So: one row per fault, each with its
// own suggested instruction and its own scope, saved and retried in a single
// action. Fix everything the draft got wrong, once, and pay for one attempt.
//
// SCOPE is per fault, not per panel. "Link these three pages" belongs to this
// article; "never open with It's worth noting" belongs to every article, and
// forcing one answer for both would make the operator choose which half to get
// wrong.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { suggestFixes } from "@/lib/fix-suggestions";
import type { StageId } from "@/lib/types";

interface Row {
  id: string;
  cause: string;
  note: string;
  scope: "run" | "standing";
  why: string;
  include: boolean;
  suggested: string;
  wantsPages?: boolean;
  /** URLs the operator ticked, for a row that wants pages. */
  picked: string[];
}

export interface LinkablePage {
  url: string;
  topic: string;
}

/** The note for a pages row: the base instruction plus the ticked pages. */
function withPages(base: string, picked: string[], pages: LinkablePage[]): string {
  if (!picked.length) return base;
  const lines = picked
    .map((u) => pages.find((p) => p.url === u))
    .filter((p): p is LinkablePage => Boolean(p))
    .map((p) => `  - ${p.topic} — ${p.url}`);
  return `${base}\n${lines.join("\n")}`;
}

export default function FixAndRetry({
  clientRef,
  runId,
  rejection,
  stage,
  busy,
  onRetry,
  retryLabel = "Save and retry",
  pages = [],
}: {
  clientRef: string;
  runId: string;
  /** The rejection text, verbatim — now usually a numbered list of faults. */
  rejection: string;
  stage?: StageId;
  busy?: boolean;
  onRetry: () => void | Promise<unknown>;
  retryLabel?: string;
  /** The coinpresso.io pages the writer is allowed to link. */
  pages?: LinkablePage[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    suggestFixes(rejection).map((s) => ({
      id: s.id,
      cause: s.cause,
      note: s.note,
      scope: s.scope,
      why: s.why,
      include: true,
      suggested: s.note,
      wantsPages: s.wantsPages,
      picked: [],
    }))
  );
  // Anything the table did not recognise. Empty by default and never
  // pre-filled: a made-up suggestion for an unknown rejection is worse than
  // no suggestion.
  const [extra, setExtra] = useState("");
  const [extraScope, setExtraScope] = useState<"run" | "standing">("run");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const finalNote = (r: Row) => (r.wantsPages ? withPages(r.note, r.picked, pages) : r.note);
  // A pages row with nothing ticked would send the writer an instruction
  // with no pages in it — the exact note that does not work.
  const chosen = rows.filter(
    (r) => r.include && r.note.trim() && (!r.wantsPages || r.picked.length > 0)
  );
  const needsPages = rows.some((r) => r.include && r.wantsPages && r.picked.length === 0);
  const total = chosen.length + (extra.trim() ? 1 : 0);

  async function saveAndRetry() {
    setSaving(true);
    setErr(null);
    try {
      const notes = [
        ...chosen.map((r) => ({ note: finalNote(r), scope: r.scope })),
        ...(extra.trim() ? [{ note: extra, scope: extraScope }] : []),
      ];
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/guidance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes, stage, rejection }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      await onRetry();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors"
        >
          {rows.length > 1
            ? `Fix all ${rows.length} and retry`
            : "Tell the writer how to fix it"}
        </button>
        <span className="text-[11.5px] text-[var(--ink-3)]">
          {rows.length
            ? `${rows.length} suggested ${rows.length === 1 ? "fix is" : "fixes are"} ready — retrying without them usually fails the same way.`
            : "Retrying without a note usually fails the same way."}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]/40 p-4 space-y-4">
      {rows.length > 1 && (
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
          <span className="font-semibold text-[var(--ink)]">
            {rows.length} things are wrong with this draft.
          </span>{" "}
          They are all listed because the writer checks everything on every
          attempt — fix them together and the next attempt is the only one you
          pay for.
        </p>
      )}

      {rows.map((r, i) => (
        <div
          key={r.id}
          className={`rounded-lg border p-3 space-y-2 ${
            r.include
              ? "border-[var(--line)]"
              : "border-[var(--line)]/40 opacity-50"
          }`}
        >
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={r.include}
              onChange={(e) => patch(i, { include: e.target.checked })}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span className="text-[12px] leading-relaxed text-[var(--ink-2)]">
              {rows.length > 1 && (
                <span className="font-semibold text-[var(--ink)]">{i + 1}. </span>
              )}
              {r.cause}
            </span>
          </label>

          {r.include && (
            <>
              <textarea
                id={`fix-${runId}-${r.id}`}
                value={r.note}
                onChange={(e) => patch(i, { note: e.target.value })}
                rows={r.note.split("\n").length > 4 ? 7 : 4}
                className="w-full text-[12.5px] px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] outline-none focus:border-[var(--accent)]/60 leading-relaxed resize-y"
              />
              {r.wantsPages && pages.length > 0 && (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-2">
                    Pages to link — tick at least {Math.max(1, 3 - r.picked.length)} more
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                    {pages.map((pg) => (
                      <label key={pg.url} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.picked.includes(pg.url)}
                          onChange={(e) =>
                            patch(i, {
                              picked: e.target.checked
                                ? [...r.picked, pg.url]
                                : r.picked.filter((u) => u !== pg.url),
                            })
                          }
                          className="mt-0.5 accent-[var(--accent)]"
                        />
                        <span className="text-[11.5px] leading-snug">
                          <span className="text-[var(--ink)]">{pg.topic}</span>
                          <span className="block text-[10.5px] text-[var(--ink-4)] truncate">
                            {pg.url.replace("https://coinpresso.io", "")}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {r.picked.length === 0 && (
                    <p className="text-[11px] text-[var(--warning)] mt-2">
                      Nothing ticked — this note will not be sent until it names a page.
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {(
                  [
                    { v: "run", label: "This post" },
                    { v: "standing", label: "Every post" },
                  ] as const
                ).map((o) => (
                  <label key={o.v} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`scope-${runId}-${r.id}`}
                      checked={r.scope === o.v}
                      onChange={() => patch(i, { scope: o.v })}
                      className="accent-[var(--accent)]"
                    />
                    <span className="text-[11.5px] text-[var(--ink-2)]">{o.label}</span>
                  </label>
                ))}
                <span className="text-[11px] text-[var(--ink-4)]">{r.why}</span>
                {r.note !== r.suggested && (
                  <button
                    onClick={() => patch(i, { note: r.suggested })}
                    className="text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] ml-auto"
                  >
                    Restore suggestion
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ))}

      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-1">
          {rows.length ? "Anything else" : "What should the writer do instead"}
        </span>
        <textarea
          id={`fix-${runId}-extra`}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={rows.length ? 3 : 7}
          placeholder="Write it as an instruction — the writer reads this verbatim on the next attempt."
          className="w-full text-[12.5px] px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] outline-none focus:border-[var(--accent)]/60 leading-relaxed resize-y"
        />
        {extra.trim() && (
          <div className="flex items-center gap-4 mt-1.5">
            {(
              [
                { v: "run", label: "This post" },
                { v: "standing", label: "Every post" },
              ] as const
            ).map((o) => (
              <label key={o.v} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`scope-${runId}-extra`}
                  checked={extraScope === o.v}
                  onChange={() => setExtraScope(o.v)}
                  className="accent-[var(--accent)]"
                />
                <span className="text-[11.5px] text-[var(--ink-2)]">{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={saveAndRetry}
          disabled={saving || busy || total === 0 || needsPages}
          className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving || busy
            ? "Working…"
            : total > 1
              ? `Save ${total} notes and retry`
              : retryLabel}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]"
        >
          Cancel
        </button>
        {chosen.some((r) => r.scope === "standing") && (
          <span className="text-[11.5px] text-[var(--ink-3)]">
            {chosen.filter((r) => r.scope === "standing").length} will become
            house rules, retirable on the Style page.
          </span>
        )}
        {err && <span className="text-[11.5px] text-[var(--danger)]">{err}</span>}
      </div>
    </div>
  );
}
