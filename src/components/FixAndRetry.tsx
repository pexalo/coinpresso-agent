"use client";

// ---------------------------------------------------------------------------
// The box under a rejection.
//
// Before this, the only thing to do with a rejected stage was press Retry,
// which sent the writer the same prompt and bought the same rejection. Four
// runs in a row failed this way at about $0.50 each. The missing piece was
// never a better model — it was a way for the person reading the rejection to
// say what to do about it.
//
// Three parts, in this order:
//
//   WHAT WENT WRONG, in one plain line derived from the rejection text.
//   A SUGGESTED NOTE, pre-filled and editable, because a blank box after a
//     four-line rejection is its own kind of dead end.
//   THIS POST / EVERY POST, because most of these faults recur. A note that
//     fixes one article and lets the next twenty repeat it is a chore, not a
//     fix — and the standing store already feeds every future run.
//
// Saving and retrying are one button on purpose. A note saved but not acted on
// looks identical to a note that did not work.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { suggestFix } from "@/lib/fix-suggestions";
import type { StageId } from "@/lib/types";

export default function FixAndRetry({
  clientRef,
  runId,
  rejection,
  stage,
  busy,
  onRetry,
  retryLabel = "Save note and retry",
}: {
  clientRef: string;
  runId: string;
  /** The rejection text, verbatim. */
  rejection: string;
  stage?: StageId;
  busy?: boolean;
  /** Runs after the note is saved. */
  onRetry: () => void | Promise<unknown>;
  retryLabel?: string;
}) {
  const suggestion = suggestFix(rejection);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(suggestion?.note ?? "");
  const [scope, setScope] = useState<"run" | "standing">(
    suggestion?.scope ?? "run"
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveAndRetry() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/guidance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note, scope, stage, rejection }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      await onRetry();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
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
          Tell the writer how to fix it
        </button>
        <span className="text-[11.5px] text-[var(--ink-3)]">
          {suggestion
            ? "A suggested fix is ready — retrying without one usually fails the same way."
            : "Retrying without a note usually fails the same way."}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]/40 p-4 space-y-3">
      {suggestion && (
        <div className="text-[12px] leading-relaxed">
          <span className="font-semibold text-[var(--ink)]">Why it failed. </span>
          <span className="text-[var(--ink-2)]">{suggestion.cause}</span>
        </div>
      )}

      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-1">
          What should the writer do instead
        </span>
        <textarea
          id={`fix-${runId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={7}
          placeholder="Write it as an instruction — the writer reads this verbatim on the next attempt."
          className="w-full text-[12.5px] px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] outline-none focus:border-[var(--accent)]/60 leading-relaxed resize-y"
        />
        {suggestion && note !== suggestion.note && (
          <button
            onClick={() => setNote(suggestion.note)}
            className="text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] mt-1"
          >
            Restore the suggestion
          </button>
        )}
      </label>

      <fieldset className="space-y-1.5">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-1">
          Apply this to
        </legend>
        {(
          [
            { v: "run", label: "This post only", hint: "Used on every retry of this article, then forgotten." },
            {
              v: "standing",
              label: "This post and every future post",
              hint: "Also saved as a house rule the writer and reviewer read on every run. Retire it later on the Style page.",
            },
          ] as const
        ).map((o) => (
          <label key={o.v} className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="radio"
              name={`scope-${runId}`}
              checked={scope === o.v}
              onChange={() => setScope(o.v)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span className="text-[12px] leading-relaxed">
              <span className="font-semibold text-[var(--ink)]">{o.label}</span>
              <span className="block text-[11px] text-[var(--ink-3)]">{o.hint}</span>
            </span>
          </label>
        ))}
        {suggestion && (
          <p className="text-[11px] text-[var(--ink-4)] leading-relaxed pl-6">
            Suggested: {suggestion.scope === "standing" ? "every future post" : "this post only"} — {suggestion.why}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          onClick={saveAndRetry}
          disabled={saving || busy || !note.trim()}
          className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving || busy ? "Working…" : retryLabel}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]"
        >
          Cancel
        </button>
        {err && <span className="text-[11.5px] text-[var(--danger)]">{err}</span>}
      </div>
    </div>
  );
}
