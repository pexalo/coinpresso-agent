"use client";

// ---------------------------------------------------------------------------
// "What did Liam change in the Doc?"
//
// He rewrote an opening by hand and the rerun came back with the original,
// because nothing here ever read his edit. This panel reads the Doc, shows
// each paragraph he changed beside what the pipeline wrote, and lets a person
// do two things with each: keep it as a house rule (the writer imitates the
// rewrite from then on) and put his text into the draft (so the next export
// does not undo him). Both default on. Ticking nothing does nothing.
// ---------------------------------------------------------------------------

import { useState } from "react";

interface Edit {
  before: string;
  after: string;
  afterRaw: string;
  distance: number;
  section?: string;
  rule: boolean;
  apply: boolean;
}

export default function DocEdits({
  clientRef,
  runId,
  docUrl,
  onApplied,
}: {
  clientRef: string;
  runId: string;
  docUrl?: string;
  onApplied?: () => void | Promise<unknown>;
}) {
  const [edits, setEdits] = useState<Edit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!docUrl) return null;

  async function read() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/doc-edits`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Read failed (${res.status})`);
      setEdits((d.edits as Omit<Edit, "rule" | "apply">[]).map((e) => ({ ...e, rule: true, apply: true })));
      if (!d.edits.length) setMsg("No paragraph in the Doc differs from what was exported.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Read failed");
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    if (!edits) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/doc-edits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rules: edits.filter((e) => e.rule).map(({ before, after, section }) => ({ before, after, section })),
          applyToDraft: edits.filter((e) => e.apply).map(({ before, after, afterRaw }) => ({ before, after, afterRaw })),
          reviewer: "Liam",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Save failed (${res.status})`);
      setMsg(
        `Kept ${d.saved} as house rule${d.saved === 1 ? "" : "s"} and put ${d.applied} into the draft.` +
          (d.applied ? " The reviewer's text is now what exports." : "")
      );
      setEdits(null);
      if (d.applied) await onApplied?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function takeAll() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/doc-edits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ syncAll: true, reviewer: "Liam" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Sync failed (${res.status})`);
      const parts = [
        d.applied
          ? `Took ${d.applied} change${d.applied === 1 ? "" : "s"} from the Doc — the app now has his text.` +
              (d.missed?.length ? ` ${d.missed.length} could not be placed: ${d.missed.slice(0, 3).map((m: string) => `"${m.slice(0, 60)}…"`).join(", ")}` : "")
          : "The app already matches the Doc.",
        `Read ${d.comments ?? 0} comment${d.comments === 1 ? "" : "s"}.`,
        d.saved
          ? `Learned ${d.saved} new rule${d.saved === 1 ? "" : "s"} — see Blog style → Learnings.`
          : "No new rules: nothing here that the house rules don't already cover.",
      ];
      setMsg(parts.join(" "));
      setEdits(null);
      if (d.applied) await onApplied?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  const patch = (i: number, p: Partial<Edit>) =>
    setEdits((es) => (es ? es.map((e, j) => (j === i ? { ...e, ...p } : e)) : es));

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)] flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-sm">What Liam changed in the Doc</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5 max-w-xl leading-relaxed">
            This happens automatically when the piece is signed, released and
            published — his text goes into the draft and his rewrites become
            house rules. Use this to see them early.
          </p>
        </div>
        <div className="flex gap-2">
        <button
          onClick={takeAll}
          disabled={busy}
          className="text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white disabled:opacity-40"
        >
          {busy && !edits ? "Working…" : "Take all edits from the Doc"}
        </button>
        <button
          onClick={read}
          disabled={busy}
          className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-40"
        >
          {busy && !edits ? "Reading…" : "Review one by one"}
        </button>
        </div>
      </div>

      {(msg || err) && (
        <div className="px-5 py-3 text-[12px] border-b border-[var(--line)]">
          {msg && <span className="text-[var(--ink-2)]">{msg}</span>}
          {err && <span className="text-[var(--danger)]">{err}</span>}
        </div>
      )}

      {edits && edits.length > 0 && (
        <div className="p-5 space-y-4">
          {edits.map((e, i) => (
            <div key={i} className="rounded-lg border border-[var(--line)] p-3 space-y-2">
              {e.section && (
                <div className="text-[10.5px] uppercase tracking-wide text-[var(--ink-4)]">{e.section}</div>
              )}
              <div className="grid md:grid-cols-2 gap-3 text-[12px] leading-relaxed">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--ink-4)] mb-1">Pipeline wrote</div>
                  <div className="text-[var(--ink-3)]">{e.before}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--success)] mb-1">Liam changed to</div>
                  <div className="text-[var(--ink)]">{e.after}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-[11.5px] text-[var(--ink-2)]">
                  <input type="checkbox" checked={e.rule} onChange={(ev) => patch(i, { rule: ev.target.checked })} className="accent-[var(--accent)]" />
                  Keep as a house rule
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[11.5px] text-[var(--ink-2)]">
                  <input type="checkbox" checked={e.apply} onChange={(ev) => patch(i, { apply: ev.target.checked })} className="accent-[var(--accent)]" />
                  Put his text into the draft
                </label>
                <span className="text-[11px] text-[var(--ink-4)] ml-auto">
                  {e.distance >= 0.6 ? "rewrite" : e.distance >= 0.25 ? "reworded" : "light edit"}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button
              onClick={keep}
              disabled={busy || !edits.some((e) => e.rule || e.apply)}
              className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Saving…" : `Keep ${edits.filter((e) => e.rule || e.apply).length} of ${edits.length}`}
            </button>
            <button onClick={() => setEdits(null)} className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] text-[var(--ink-2)]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
