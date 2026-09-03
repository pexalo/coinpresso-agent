"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { FeedbackEntry, FeedbackLog as Log } from "@/lib/feedback";

/**
 * The client's corrections, as the two blog agents read them.
 *
 * Liam reviews a draft and writes up what is wrong. Paste each point here as
 * the rule it implies — with his before/after where he gave one — and the
 * next run's writer follows it and the reviewer checks for it. No deploy.
 */
export default function FeedbackLog({ initial }: { initial: Log }) {
  const { ref } = useParams<{ ref: string }>();
  const [log, setLog] = useState<Log>(initial);
  const [source, setSource] = useState("Liam");
  const [rule, setRule] = useState("");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const base = `/api/clients/${encodeURIComponent(ref)}/feedback`;

  async function call(init: RequestInit, url = base) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setLog(j);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!rule.trim()) return;
    const ok = await call({
      method: "POST",
      body: JSON.stringify({ source, rule, before, after }),
    });
    if (ok) {
      setRule("");
      setBefore("");
      setAfter("");
    }
  }

  const toggle = (e: FeedbackEntry) =>
    call({ method: "PATCH", body: JSON.stringify({ id: e.id, active: !e.active }) });
  const remove = (e: FeedbackEntry) =>
    call({ method: "DELETE" }, `${base}?id=${encodeURIComponent(e.id)}`);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <h2 className="font-bold text-sm">What Coinpresso has corrected</h2>
        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
          Every point below goes to the writer as a rule and to the reviewer as a
          check on every blog run. When Liam sends the next round, add each point
          here — his exact before/after lines teach the model more than the rule
          does.
        </p>
      </div>

      <ol className="divide-y divide-[var(--line)]">
        {log.entries.map((e, i) => (
          <li
            key={e.id}
            className={`px-5 py-3.5 text-[12px] ${e.active ? "" : "opacity-50"}`}
          >
            <div className="flex items-start gap-3">
              <span className="flex-none w-5 font-mono text-[10.5px] text-[var(--ink-4)] mt-0.5">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[var(--ink)] leading-relaxed">{e.rule}</p>
                {e.before && (
                  <p className="mt-1.5 text-[11.5px] text-[var(--ink-3)] leading-relaxed">
                    <span className="text-[var(--danger)] font-semibold">Not this: </span>
                    <span className="italic">“{e.before}”</span>
                  </p>
                )}
                {e.after && (
                  <p className="mt-0.5 text-[11.5px] text-[var(--ink-3)] leading-relaxed">
                    <span className="text-[var(--success)] font-semibold">This: </span>
                    <span className="italic">“{e.after}”</span>
                  </p>
                )}
                <div className="mt-1.5 text-[10.5px] text-[var(--ink-4)]">
                  {e.source} · {e.date}
                  {!e.active && " · retired"}
                </div>
              </div>
              <div className="flex-none flex items-center gap-2">
                <button
                  onClick={() => toggle(e)}
                  disabled={busy}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                >
                  {e.active ? "Retire" : "Restore"}
                </button>
                <button
                  onClick={() => remove(e)}
                  disabled={busy}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-[var(--line)] text-[var(--danger)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="px-5 py-4 border-t border-[var(--line)] space-y-2.5 bg-[var(--surface-2)]/40">
        <div className="text-[11px] font-semibold text-[var(--ink-2)]">Add a correction</div>
        <div className="grid gap-2.5 md:grid-cols-[160px_1fr]">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Who, and which piece"
            className="text-[12px] px-3 py-2 rounded-lg border border-[var(--line)] bg-transparent"
          />
          <textarea
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            rows={2}
            placeholder="The rule, as the writer should read it — e.g. “Open every section with the answer, not the context.”"
            className="text-[12px] px-3 py-2 rounded-lg border border-[var(--line)] bg-transparent"
          />
        </div>
        <div className="grid gap-2.5 md:grid-cols-2">
          <textarea
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            rows={2}
            placeholder="The line he marked (optional)"
            className="text-[12px] px-3 py-2 rounded-lg border border-[var(--line)] bg-transparent"
          />
          <textarea
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            rows={2}
            placeholder="The line he wanted instead (optional)"
            className="text-[12px] px-3 py-2 rounded-lg border border-[var(--line)] bg-transparent"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={add}
            disabled={busy || !rule.trim()}
            className="text-[12.5px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {busy ? "Saving…" : "Add to every future run"}
          </button>
          {err && <span className="text-[12px] text-[var(--danger)]">{err}</span>}
        </div>
      </div>
    </div>
  );
}
