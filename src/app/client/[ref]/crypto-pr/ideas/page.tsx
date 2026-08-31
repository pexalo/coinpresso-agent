"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCampaign } from "@/components/CampaignContext";
import { PUBLICATIONS } from "@/lib/publications";
import BatchProgress, { type BatchWithProgress } from "@/components/BatchProgress";

interface Idea {
  id: string;
  topicId?: string;
  title: string;
  keywords: string[];
  publication: string;
  angle: string;
  rationale: string;
  differentiator: string;
  confidence: "high" | "medium" | "speculative";
}

interface Topic {
  id: string;
  theme: string;
  asset: string;
  hook: string;
  hookDate: string;
  whyNow: string;
  sourceUrls: string[];
  strength: "strong" | "moderate" | "thin";
  ideas: Idea[];
}

const BATCH_SIZES = [5, 10, 15, 20];

const CONF: Record<string, string> = {
  high: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
  medium: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
  speculative: "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
};

const STRENGTH: Record<string, { chip: string; bar: string }> = {
  strong: {
    chip: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
    bar: "var(--success)",
  },
  moderate: {
    chip: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
    bar: "var(--accent)",
  },
  thin: {
    chip: "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
    bar: "var(--warning)",
  },
};

function host(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export default function IdeasPage() {
  const { ref } = useParams<{ ref: string }>();
  const { selected, campaigns } = useCampaign();
  const campaignId = selected?.id ?? campaigns[0]?.id ?? "";

  const [count, setCount] = useState(10);
  const [steer, setSteer] = useState("");
  const [topics, setTopics] = useState<Topic[] | null>(null);
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
    setTopics(null);
    setChosen(new Set());
    try {
      const res = await fetch(`/api/clients/${ref}/ideas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count, steer, campaignId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The strategy agent failed.");
      const t: Topic[] = data.topics ?? [];
      setTopics(t);
      setChosen(new Set(t.flatMap((x) => x.ideas.map((i) => i.id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(false);
    }
  }

  async function generate() {
    if (!topics) return;
    const items = topics
      .flatMap((t) => t.ideas.map((i) => ({ topic: t, idea: i })))
      .filter(({ idea }) => chosen.has(idea.id))
      .slice(0, 20)
      .map(({ topic, idea }) => ({
        title: idea.title,
        keywords: idea.keywords,
        publication: idea.publication,
        // The topic travels with the brief. Research still verifies everything
        // from scratch — but handing it the catalyst and the URLs the scan
        // already found means it starts from the same hook the title was chosen
        // for, rather than searching its way to a different one.
        notes: [
          `Angle: ${idea.angle}.`,
          `Catalyst found by the ideation scan on ${topic.hookDate} — VERIFY IT: ${topic.hook}`,
          topic.sourceUrls.length
            ? `Sources the scan retrieved: ${topic.sourceUrls.join(" ")}`
            : "The scan found no source URL for this catalyst. Treat it as unverified, and say so in riskNotes if you cannot confirm it.",
          idea.rationale,
        ].join("\n"),
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

  const toggleTopic = (t: Topic) =>
    setChosen((prev) => {
      const next = new Set(prev);
      const all = t.ideas.every((i) => next.has(i.id));
      t.ideas.forEach((i) => (all ? next.delete(i.id) : next.add(i.id)));
      return next;
    });

  const allIdeas = topics?.flatMap((t) => t.ideas) ?? [];
  const picked = allIdeas.filter((i) => chosen.has(i.id));
  const unsourced = topics?.filter((t) => t.sourceUrls.length === 0).length ?? 0;

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Ideas</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          The strategy agent scans the live market, then proposes topics — real,
          dated catalysts with the sources it found — and the titles worth
          running on each. It reads the archive at the same time, so it proposes
          into the gaps rather than over what has already gone out.
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
                How many titles
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
                Steer the scan (optional)
              </label>
              <input
                id="steer"
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                placeholder="Lean into AI-crypto · avoid meme coins · anything with an ETF angle"
                className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
              />
            </div>
          </div>

          <button
            onClick={propose}
            disabled={thinking}
            className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {thinking ? "Scanning the market…" : `Find topics and ${count} titles`}
          </button>

          {thinking && (
            <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed">
              This runs a dozen or so searches before it proposes anything, so it
              takes a minute or two — longer than the old version, which guessed.
            </p>
          )}

          {error && (
            <div className="text-[12px] text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-lg px-3.5 py-2.5">
              {error}
            </div>
          )}
        </div>
      )}

      {topics && !batch && (
        <>
          <div className="card px-5 py-3.5 flex items-center gap-4 flex-wrap">
            <div className="text-[12px] text-[var(--ink-2)]">
              <span className="font-semibold">{topics.length}</span> topic
              {topics.length === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold">{picked.length}</span> of{" "}
              {allIdeas.length} titles selected
            </div>
            <button
              onClick={() => setChosen(new Set(allIdeas.map((i) => i.id)))}
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
              Generate {picked.length} article{picked.length === 1 ? "" : "s"}
            </button>
          </div>

          {unsourced > 0 && (
            <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
              {unsourced} topic{unsourced === 1 ? " has" : "s have"} no source
              URL. The scan is meant to show where it found each catalyst — a
              hook with nothing behind it is the one thing here worth treating as
              invented until the research stage confirms it.
            </div>
          )}

          <div className="space-y-4">
            {topics.map((t) => {
              const allOn = t.ideas.every((i) => chosen.has(i.id));
              const s = STRENGTH[t.strength] ?? STRENGTH.moderate;
              return (
                <div key={t.id} className="card overflow-hidden">
                  <div
                    className="px-5 py-4 border-b border-[var(--line)]"
                    style={{ borderLeft: `3px solid ${s.bar}` }}
                  >
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-bold text-[13.5px]">{t.theme}</h2>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]">
                            {t.asset}
                          </span>
                          <span
                            className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${s.chip}`}
                          >
                            {t.strength}
                          </span>
                          <span className="text-[10.5px] text-[var(--ink-4)]">
                            {t.hookDate}
                          </span>
                        </div>
                        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed mt-2">
                          {t.hook}
                        </p>
                        <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1.5">
                          {t.whyNow}
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
                          {t.sourceUrls.length ? (
                            t.sourceUrls.slice(0, 5).map((u) => (
                              <a
                                key={u}
                                href={u}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-[10.5px] text-[var(--accent)] hover:underline"
                              >
                                {host(u)} ↗
                              </a>
                            ))
                          ) : (
                            <span className="text-[10.5px] text-[var(--warning)]">
                              no source found
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleTopic(t)}
                        className="text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)] shrink-0"
                      >
                        {allOn ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-[var(--line)]">
                    {t.ideas.map((i) => {
                      const on = chosen.has(i.id);
                      return (
                        <button
                          key={i.id}
                          onClick={() => toggle(i.id)}
                          className={`w-full text-left px-5 py-3.5 transition-colors ${
                            on
                              ? "hover:bg-[var(--surface-2)]"
                              : "opacity-55 hover:opacity-100"
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
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">Why there is a topic layer</h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          This used to propose titles with no web search at all — from memory and
          the archive. That is backwards for a programme whose whole product is
          attaching to something moving right now: it produced titles with
          invented premises, and the research stage would then discover the
          premise was wrong, after the title was already fixed and handed to a
          writer told to use it.
        </p>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl mt-2.5">
          Now the same model and the same search tool as the research stage scan
          the market first. Topics are what it actually found, with dates and
          URLs; titles are angles on them. Grouping the two makes the weak link
          visible — a thin catalyst carrying three clever titles is three bad
          articles, and a flat list hides that.
        </p>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl mt-2.5">
          The scan costs more than the old guess did: a dozen searches and a
          large context, roughly the price of one article. Everything it proposes
          is still verified from scratch by the research stage, which is handed
          the catalyst and its sources so it starts from the hook the title was
          chosen for.
        </p>
      </div>
    </div>
  );
}
