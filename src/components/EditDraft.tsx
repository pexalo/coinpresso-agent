"use client";

// ---------------------------------------------------------------------------
// Edit the draft by typing.
//
// The client's reviewer asked for a place to fix things himself rather than
// leave a comment and wait for a rewrite. This is that place: the article as
// markdown, in a box, with one Save button. It goes through the same route as
// pasting a draft in, so the pipeline sees an edit exactly as it sees a paste —
// the stale review verdict is cleared, the piece goes back to "needs review",
// and the timeline records who typed.
//
// Deliberately plain. A rich editor would hide the links and headings that
// are the very things he tends to fix, and markdown is what the Doc and the
// HTML are both built from — editing anything else means a lossy round trip.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export default function EditDraft({
  clientRef,
  runId,
  markdown,
  hasDraft,
  onSaved,
}: {
  clientRef: string;
  runId: string;
  /** The draft as markdown — headline as H1, FAQs under "## FAQs". */
  markdown: string;
  hasDraft: boolean;
  onSaved: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(!hasDraft);
  const [text, setText] = useState(markdown);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // A rewrite or another editor's save replaces the draft underneath this
  // box. Follow it unless there are unsaved keystrokes here — those win.
  useEffect(() => {
    setText((t) => (t === markdown || !dirty(t, markdown) ? markdown : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown]);

  const changed = text.trim() !== markdown.trim();

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown: text, pastedBy: "the dashboard editor" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        wordCount?: number;
        faqs?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      setMsg(
        `Saved — ${data.wordCount} words, ${data.faqs} FAQ${data.faqs === 1 ? "" : "s"}. The piece is back in review.`
      );
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--surface-2)]/50 transition-colors"
      >
        <div>
          <h2 className="font-bold text-sm">
            {hasDraft ? "Fix it yourself" : "Paste or write the draft"}
          </h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            {hasDraft
              ? "Edit the article as text and save. No rewrite, no credits."
              : "There is no draft on this run. Paste one here and it joins the queue."}
          </p>
        </div>
        <span className="text-[11px] text-[var(--ink-4)] shrink-0">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--line)] p-5 space-y-3">
          <textarea
            id={`edit-draft-${runId}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={28}
            spellCheck
            placeholder={"# Headline\n\nFirst paragraph…\n\n## First section\n\n…\n\n## FAQs\n\n**Question?**\n\nAnswer."}
            className="w-full font-mono text-[12.5px] px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--line)] outline-none focus:border-[var(--accent)]/60 leading-relaxed resize-y"
          />
          <div className="text-[11px] text-[var(--ink-3)] leading-relaxed">
            The first <code>#</code> line is the headline, <code>##</code> starts a
            section, links are <code>[words](https://…)</code>, and everything
            under <code>## FAQs</code> becomes the FAQ block. Keep link text to a
            short phrase — the part a reader would click — with the rest of the
            sentence outside the brackets.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={busy || !text.trim() || (hasDraft && !changed)}
              className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Saving…" : hasDraft ? "Save changes" : "Add this draft"}
            </button>
            {hasDraft && changed && !busy && (
              <button
                onClick={() => setText(markdown)}
                className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]"
              >
                Discard
              </button>
            )}
            {msg && <span className="text-[11.5px] text-[var(--ink-2)]">{msg}</span>}
            {err && <span className="text-[11.5px] text-[var(--danger)]">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** True when the box holds edits the user has not saved. */
function dirty(current: string, saved: string): boolean {
  return current.trim() !== saved.trim() && current.trim() !== "";
}
