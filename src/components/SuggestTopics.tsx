"use client";

import { useState } from "react";
import { PILLARS } from "@/lib/blog";

export interface SuggestedTopic {
  id: string;
  topic: string;
  keywords: string[];
  pillar: string;
  buyerQuestion: string;
  rationale: string;
  notDuplicateOf: string;
  confidence: "high" | "medium" | "speculative";
}

const CONF: Record<string, string> = {
  high: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
  medium: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
  speculative:
    "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
};

/**
 * Proposing topics from the ones already in the queue.
 *
 * NOTHING IS SAVED UNTIL SOMETHING IS TICKED. The panel proposes, the operator
 * chooses, and only then does anything reach the queue. A generate button that
 * writes straight to the inbox turns one impatient click into forty topics
 * somebody now has to read and park individually, which is a worse position than
 * the empty queue it started from.
 *
 * Everything selected by default, because a set that came back and was reviewed
 * is usually mostly right and unticking two is less work than ticking six. The
 * per-topic reasoning is on screen rather than behind a disclosure for exactly
 * that reason: the default is "accept", so the case against each one has to be
 * readable without another click.
 */
/**
 * Open state is LIFTED. The trigger belongs in the toolbar and the panel does
 * not: rendered together, opening it stretched the toolbar to 900px and pushed
 * every control in it onto a new line. The page owns `open`, puts the button in
 * the bar and the panel underneath it.
 */
export default function SuggestTopics({
  clientRef,
  open,
  briefCount,
  topicCount,
  onClose,
  onAdded,
}: {
  clientRef: string;
  open: boolean;
  /** How many queued topics carry a parsed content brief. */
  briefCount: number;
  topicCount: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [count, setCount] = useState(8);
  const [pillar, setPillar] = useState("");
  const [steer, setSteer] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<SuggestedTopic[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [mock, setMock] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function propose() {
    setThinking(true);
    setError(null);
    setTopics(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/blog-seeds/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count, pillar, steer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The suggestion run failed.");
      setTopics(data.topics ?? []);
      setMock(Boolean(data.mock));
      setCost(typeof data.costUsd === "number" ? data.costUsd : null);
      setChosen(new Set((data.topics ?? []).map((t: SuggestedTopic) => t.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(false);
    }
  }

  async function add() {
    if (!topics) return;
    const picked = topics.filter((t) => chosen.has(t.id));
    if (!picked.length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/blog-seeds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topics: picked.map((t) => ({
            topic: t.topic,
            keywords: t.keywords,
            pillar: t.pillar || undefined,
            // The reasoning travels with the topic. Without it, a suggestion
            // read once and accepted becomes an anonymous line in the queue a
            // fortnight later, and the person planning the day has no idea what
            // it was for.
            notes: `Suggested from Coinpresso's own briefs.\n${t.rationale}${
              t.buyerQuestion ? `\nBuyer question: ${t.buyerQuestion}` : ""
            }`,
            addedBy: "Topic suggestions",
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Could not add them.");
      }
      setTopics(null);
      onClose();
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!open) return null;

  return (
    <div className="card p-4 space-y-3.5 w-full">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-[13px] font-bold">Suggest topics</h3>
        {/* WHAT IT IS WORKING FROM, stated before it runs. The same button does
            two quite different things depending on whether Coinpresso have
            supplied briefs, and the difference shows up in the quality of what
            comes back — so it is said here rather than left to be inferred from
            a set of suggestions that look equally confident either way. */}
        <p className="text-[11.5px] text-[var(--ink-3)] flex-1 min-w-[240px]">
          {briefCount > 0 ? (
            <>
              Learns from{" "}
              <span className="text-[var(--ink)] font-medium">
                {briefCount} of Coinpresso&rsquo;s own briefs
              </span>{" "}
              plus the pillars and what is live on coinpresso.io, then proposes
              subjects in the same shape. Nothing is added until you tick it.
            </>
          ) : (
            <>
              <span className="text-[var(--warning)]">
                No content briefs to learn from
              </span>{" "}
              — it will work from the six pillars and the house framework alone,
              which is a weaker basis and the suggestions will say so. Nothing is
              added until you tick it.
              {topicCount === 0 && " The queue is empty, so this is a cold start."}
            </>
          )}
        </p>
        <button
          onClick={() => {
            onClose();
            setTopics(null);
          }}
          className="text-[11.5px] text-[var(--ink-4)] hover:text-[var(--ink)] transition-colors"
        >
          Close
        </button>
      </div>

      <div className="flex items-end gap-2.5 flex-wrap">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
            How many
          </span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bg-[var(--bg)] border border-[var(--line)] rounded-lg px-2.5 py-2 text-[12.5px] focus:border-[var(--accent)] outline-none"
          >
            {[4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
            Weight toward
          </span>
          <select
            value={pillar}
            onChange={(e) => setPillar(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--line)] rounded-lg px-2.5 py-2 text-[12.5px] focus:border-[var(--accent)] outline-none"
          >
            <option value="">No pillar in particular</option>
            {PILLARS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
            Steer (optional)
          </span>
          <input
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            placeholder="e.g. things a founder asks in month one"
            className="bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-[12.5px] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none"
          />
        </label>

        <button
          onClick={propose}
          disabled={thinking}
          className="px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white text-[12.5px] font-semibold disabled:opacity-50 transition-opacity"
        >
          {thinking ? "Thinking…" : topics ? "Propose again" : "Propose"}
        </button>
      </div>

      {error && (
        <p className="text-[12px] text-[var(--danger)]">{error}</p>
      )}

      {mock && topics && (
        <p className="text-[11.5px] text-[var(--warning)]">
          Mock mode — no key is configured, so nothing below was reasoned from
          the briefs or checked against what is already published.
        </p>
      )}

      {topics && topics.length === 0 && (
        <p className="text-[12px] text-[var(--ink-3)]">
          Nothing came back that was not already in the queue or on the blog.
          That is a real answer at seventy-four topics — try a pillar or a steer.
        </p>
      )}

      {topics && topics.length > 0 && (
        <>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {topics.map((t) => {
              const p = PILLARS.find((x) => x.id === t.pillar);
              return (
                <label
                  key={t.id}
                  className={`flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    chosen.has(t.id)
                      ? "border-[var(--accent)]/40 bg-[var(--accent)]/[0.06]"
                      : "border-[var(--line)] hover:border-[var(--line)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="mt-0.5 w-3.5 h-3.5 shrink-0 accent-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-semibold leading-snug">
                        {t.topic}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${CONF[t.confidence]}`}
                      >
                        {t.confidence}
                      </span>
                      {p && (
                        <span className="text-[10px] text-[var(--ink-4)]">
                          {p.name}
                        </span>
                      )}
                    </div>
                    {t.keywords.length > 0 && (
                      <p className="text-[11px] text-[var(--accent)] mt-0.5">
                        {t.keywords.join(" · ")}
                      </p>
                    )}
                    <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1">
                      {t.rationale}
                    </p>
                    {t.notDuplicateOf && (
                      <p className="text-[11px] text-[var(--ink-4)] leading-relaxed mt-1">
                        Not a re-run of: {t.notDuplicateOf}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={add}
              disabled={saving || chosen.size === 0}
              className="px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white text-[12.5px] font-semibold disabled:opacity-40 transition-opacity"
            >
              {saving
                ? "Adding…"
                : `Add ${chosen.size} to the queue`}
            </button>
            <button
              onClick={() =>
                setChosen(
                  chosen.size === topics.length
                    ? new Set()
                    : new Set(topics.map((t) => t.id))
                )
              }
              className="text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
            >
              {chosen.size === topics.length ? "Select none" : "Select all"}
            </button>
            {cost !== null && (
              <span className="text-[11px] text-[var(--ink-4)] tabular-nums">
                This run cost ${cost.toFixed(3)} — on the API costs page.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
