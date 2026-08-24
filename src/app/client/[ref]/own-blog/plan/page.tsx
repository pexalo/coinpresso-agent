"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import BatchProgress, { type BatchWithProgress } from "@/components/BatchProgress";
import { CONTENT_TYPES, PILLARS } from "@/lib/blog";
import type { ContentTypeId } from "@/lib/blog";

interface BlogIdea {
  id: string;
  title: string;
  keywords: string[];
  pillar: string;
  contentType: ContentTypeId;
  buyerQuestion: string;
  originality: string;
  needsClientData: boolean;
  rationale: string;
  differentiator: string;
  confidence: "high" | "medium" | "speculative";
}

const DAY_SIZES = [5, 6, 7, 8];

const CONF: Record<string, string> = {
  high: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
  medium: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
  speculative:
    "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
};

export default function PlanDayPage() {
  const { ref } = useParams<{ ref: string }>();

  const [count, setCount] = useState(6);
  const [pillar, setPillar] = useState("");
  const [steer, setSteer] = useState("");
  const [ideas, setIdeas] = useState<BlogIdea[] | null>(null);
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
      const res = await fetch(`/api/clients/${ref}/blog-ideas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count, pillar, steer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The planner failed.");
      setIdeas(data.ideas ?? []);
      setChosen(new Set((data.ideas ?? []).map((i: BlogIdea) => i.id)));
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
      .map((i) => ({
        title: i.title,
        keywords: i.keywords,
        pillar: i.pillar,
        contentType: i.contentType,
        notes: `Buyer question: ${i.buyerQuestion}\nOriginality required: ${i.originality}${
          i.needsClientData
            ? "\nNOTE: this post's originality depends on Coinpresso's own campaign data, which was NOT supplied. Write around the gap honestly — do not invent a figure."
            : ""
        }\n${i.rationale}`,
      }));
    if (!items.length) return;

    setError(null);
    const res = await fetch(`/api/clients/${ref}/batches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ track: "blog", items }),
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

  const picked = (ideas ?? []).filter((i) => chosen.has(i.id));
  const pillarSpread = new Set(picked.map((i) => i.pillar));
  const formatSpread = new Set(picked.map((i) => i.contentType));
  const needingData = picked.filter((i) => i.needsClientData).length;

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Plan the day</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          The planner reads the service pillars and everything already on the
          blog, then proposes a day spread across at least three pillars and
          several formats. Each proposal has to name what makes it worth
          publishing — and say when that thing is a number only Coinpresso holds.
        </p>
      </div>

      {batch && (
        <BatchProgress
          batch={batch}
          unit="post"
          runHref={(id) => `/client/${ref}/own-blog/runs/${id}`}
          slotLabel={(s) => PILLARS.find((p) => p.id === s)?.name ?? s}
          doneHref={`/client/${ref}/own-blog`}
          doneLabel="Read the day"
        />
      )}

      {!batch && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-[140px_minmax(0,1fr)] gap-4 items-start">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
                Posts today
              </span>
              <div className="flex gap-1.5">
                {DAY_SIZES.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`w-10 py-2 rounded-lg text-[12.5px] font-semibold transition-colors ${
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
                placeholder="Push the GEO cluster · we have new clipping pricing data · answer the objection about attribution"
                className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <span className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
              Weight toward a pillar (optional)
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setPillar("")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  pillar === ""
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]"
                }`}
              >
                Even spread
              </button>
              {PILLARS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPillar(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    pillar === p.id
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={propose}
            disabled={thinking}
            className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {thinking ? "Planning the day…" : `Plan ${count} posts`}
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
          <div className="card px-5 py-3.5 flex items-center gap-4 flex-wrap">
            <div className="text-[12px] text-[var(--ink-2)]">
              <span className="font-semibold">{picked.length}</span> selected ·{" "}
              <span
                className={
                  pillarSpread.size >= 3
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]"
                }
              >
                {pillarSpread.size} pillar{pillarSpread.size === 1 ? "" : "s"}
              </span>{" "}
              · {formatSpread.size} format{formatSpread.size === 1 ? "" : "s"}
              {needingData > 0 && (
                <span className="text-[var(--warning)]">
                  {" "}
                  · {needingData} need your data
                </span>
              )}
            </div>
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
              disabled={picked.length === 0}
              className="ml-auto text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--success)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Write {picked.length} post{picked.length === 1 ? "" : "s"}
            </button>
          </div>

          {picked.length > 0 && pillarSpread.size < 3 && (
            <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
              This selection covers {pillarSpread.size} pillar
              {pillarSpread.size === 1 ? "" : "s"}. Publishing a day into one hub
              is fine occasionally and a bad habit weekly — the other clusters
              stop growing.
            </div>
          )}

          <div className="space-y-2.5">
            {ideas.map((i) => {
              const on = chosen.has(i.id);
              const p = PILLARS.find((x) => x.id === i.pillar);
              const t = CONTENT_TYPES[i.contentType];
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  className={`card w-full text-left p-4 transition-colors ${
                    on ? "border-[var(--accent)]/50" : "opacity-60 hover:opacity-100"
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
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]">
                          {p?.name ?? i.pillar}
                        </span>
                        <span className="text-[10.5px] text-[var(--ink-3)]">
                          {t?.name ?? i.contentType}
                          {t ? ` · ${t.words[0]}–${t.words[1]}w` : ""}
                        </span>
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border ${CONF[i.confidence]}`}
                        >
                          {i.confidence}
                        </span>
                        {i.needsClientData && (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10">
                            needs your data
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] font-semibold leading-snug">
                        {i.title}
                      </div>
                      <div className="text-[11px] text-[var(--ink-3)] mt-1">
                        {i.keywords.join(" · ")}
                      </div>
                      {i.buyerQuestion && (
                        <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed mt-2 italic">
                          &ldquo;{i.buyerQuestion}&rdquo;
                        </p>
                      )}
                      <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed mt-2">
                        <span className="text-[var(--success)] font-medium">
                          Original because:{" "}
                        </span>
                        {i.originality}
                      </p>
                      <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-1">
                        <span className="text-[var(--accent)] font-medium">
                          Not a duplicate of:{" "}
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
        <h2 className="font-bold text-sm mb-2">
          Why this is planned as a day, not an article
        </h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          Eight posts that are individually fine can still be a bad day&apos;s
          publishing: eight guides on one pillar reads as machine output whatever
          the prose is like, and that pattern is what gets a domain demoted. The
          spread across pillars and formats is only visible in the set, so the
          set is the thing being approved.
        </p>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl mt-2.5">
          Anything marked <em>needs your data</em> will be written around the gap
          honestly rather than filled with an invented figure. Supply the number
          and the same post becomes the strongest one in the set.
        </p>
      </div>
    </div>
  );
}
