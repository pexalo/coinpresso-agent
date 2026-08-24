"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCampaign } from "@/components/CampaignContext";
import { PUBLICATIONS } from "@/lib/publications";
import BatchProgress, { type BatchWithProgress } from "@/components/BatchProgress";

interface Idea {
  id: string;
  title: string;
  keywords: string[];
  publication: string;
  angle: string;
  rationale: string;
  differentiator: string;
  confidence: "high" | "medium" | "speculative";
}

const BATCH_SIZES = [5, 10, 15, 20];

const CONF: Record<string, string> = {
  high: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
  medium: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
  speculative: "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
};

export default function IdeasPage() {
  const { ref } = useParams<{ ref: string }>();
  const { selected, campaigns } = useCampaign();
  const campaignId = selected?.id ?? campaigns[0]?.id ?? "";

  const [count, setCount] = useState(10);
  const [steer, setSteer] = useState("");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchWithProgress | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollBatch = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/clients/${ref}/batches/${id}`);
      if (!res.ok) return;
      const data: BatchWithProgress = await res.json();
      setBatch(data);
      if (data.status === "running") {
        timer.current = setTimeout(() => pollBatch(id), 2500);
      }
    },
    [ref]
  );

  useEffect(() => {
    if (batchId) pollBatch(batchId);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [batchId, pollBatch]);

  async function propose() {
    setThinking(true);
    setError(null);
    setIdeas(null);
    setChosen(new Set());
    try {
      const res = await fetch(`/api/clients/${ref}/ideas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count, steer, campaignId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The ideas agent failed.");
      setIdeas(data.ideas ?? []);
      setChosen(new Set((data.ideas ?? []).map((i: Idea) => i.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(false);
    }
  }

  async function generate() {
    if (!ideas) return;
    const items = ideas
      .filter((i) => chosen.has(i.id))
      .slice(0, 20)
      .map((i) => ({
        title: i.title,
        keywords: i.keywords,
        publication: i.publication,
        notes: `Angle: ${i.angle}. ${i.rationale}`,
      }));
    if (!items.length) return;

    setError(null);
    const res = await fetch(`/api/clients/${ref}/batches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId, items }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not start the batch.");
      return;
    }
    setBatchId(data.id);
  }

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Ideas</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          The agent reads everything already published, everything imported from
          competitors, and which keywords and angles are worn out — then proposes
          what to write next. Pick the ones worth running and generate them in
          one batch.
        </p>
      </div>

      {batch && (
        <BatchProgress
          batch={batch}
          runHref={(id) => `/client/${ref}/crypto-pr/runs/${id}`}
          slotLabel={(s) =>
            PUBLICATIONS[s as keyof typeof PUBLICATIONS]?.name ?? s
          }
          doneHref={`/client/${ref}/crypto-pr`}
          doneLabel="Review the queue"
        />
      )}

      {!batch && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-[160px_minmax(0,1fr)] gap-4 items-start">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
                How many
              </span>
              <div className="flex gap-1.5">
                {BATCH_SIZES.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`w-11 py-2 rounded-lg text-[12.5px] font-semibold transition-colors ${
                      count === n
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label
                className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5"
                htmlFor="steer"
              >
                Steer (optional)
              </label>
              <input
                id="steer"
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                placeholder="Lean into AI-crypto angles · avoid meme coins · push the Stage 3 milestone"
                className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
              />
            </div>
          </div>

          <button
            onClick={propose}
            disabled={thinking}
            className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {thinking ? "Reading the archive…" : `Propose ${count} articles`}
          </button>

          {error && (
            <div className="text-[12px] text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-lg px-3.5 py-2.5">
              {error}
            </div>
          )}
        </div>
      )}

      {ideas && !batch && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] text-[var(--ink-3)]">
              {chosen.size} of {ideas.length} selected
            </span>
            <button
              onClick={() => setChosen(new Set(ideas.map((i) => i.id)))}
              className="text-[11.5px] text-[var(--accent)] font-medium"
            >
              Select all
            </button>
            <button
              onClick={() => setChosen(new Set())}
              className="text-[11.5px] text-[var(--ink-3)] font-medium"
            >
              Clear
            </button>
            <button
              onClick={generate}
              disabled={chosen.size === 0}
              className="ml-auto text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--success)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Generate {chosen.size} article{chosen.size === 1 ? "" : "s"}
            </button>
          </div>

          <div className="space-y-2.5">
            {ideas.map((i) => {
              const on = chosen.has(i.id);
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  className={`card w-full text-left p-4 transition-colors ${
                    on
                      ? "border-[var(--accent)]/50"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 w-4 h-4 rounded shrink-0 border flex items-center justify-center ${
                        on
                          ? "bg-[var(--accent)] border-[var(--accent)]"
                          : "border-[var(--line)]"
                      }`}
                    >
                      {on && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2.5 6.5 5 9l4.5-5.5"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10.5px] text-[var(--ink-3)]">
                          {PUBLICATIONS[
                            i.publication as keyof typeof PUBLICATIONS
                          ]?.name ?? i.publication}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]">
                          {i.angle}
                        </span>
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border ${CONF[i.confidence]}`}
                        >
                          {i.confidence}
                        </span>
                      </div>
                      <div className="text-[13px] font-semibold leading-snug">
                        {i.title}
                      </div>
                      <div className="text-[11px] text-[var(--ink-3)] mt-1">
                        {i.keywords.join(" · ")}
                      </div>
                      <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed mt-2">
                        {i.rationale}
                      </p>
                      <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-1">
                        <span className="text-[var(--accent)] font-medium">
                          Avoids:{" "}
                        </span>
                        {i.differentiator}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">What it reads, and what it costs</h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          The proposals come from your own archive — angles worked, keywords used
          and when, wires under-used — plus any competitor pieces you have
          imported. The richer the archive, the better the gaps it finds; with
          nothing imported it can only reason about your own work.
        </p>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl mt-2.5">
          Generation runs three articles at a time. Twenty at once would trip
          provider rate limits and return a wall of failures. A batch of twenty
          therefore takes roughly twenty to twenty-five minutes and costs several
          dollars — the running total is on the panel, and every article still
          lands in the queue for review rather than going anywhere near a wire.
        </p>
      </div>
    </div>
  );
}
