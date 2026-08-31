"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import BatchProgress, { type BatchWithProgress } from "@/components/BatchProgress";
import { CONTENT_TYPES, PILLARS } from "@/lib/blog";
import type { ContentTypeId } from "@/lib/blog";
import type { BlogSeeds, SeedTopic } from "@/lib/blog-seed";

interface BlogIdea {
  id: string;
  title: string;
  keywords: string[];
  /** Present when this post came from a topic Coinpresso supplied. */
  seedTopicId?: string;
  pillar: string;
  contentType: ContentTypeId;
  buyerQuestion: string;
  originality: string;
  needsClientData: boolean;
  rationale: string;
  differentiator: string;
  confidence: "high" | "medium" | "speculative";
}

// 1 and 3 exist for the single-post and small-day paths. The cadence the
// programme is built around is still 5-8, but the first thing every new
// operator tries is one post, and a control whose minimum is five makes that
// look impossible rather than merely unusual.
const DAY_SIZES = [1, 3, 5, 6, 7, 8];

const CONF: Record<string, string> = {
  high: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
  medium: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
  speculative:
    "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
};

/** The stored topic behind an idea, when it came from one. */
function seedById(
  seeds: BlogSeeds | null,
  id: string | undefined
): SeedTopic | undefined {
  if (!seeds || !id) return undefined;
  return seeds.topics.find((t) => t.id === id);
}

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
  const [seeds, setSeeds] = useState<BlogSeeds | null>(null);
  const [useSeeds, setUseSeeds] = useState<Set<string>>(new Set());
  const [missing, setMissing] = useState<string[]>([]);
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

  // Queued topics, loaded once. Everything queued is included by default —
  // leaving a topic sitting in the inbox while a day is planned around it is the
  // failure this whole feature exists to stop.
  useEffect(() => {
    let alive = true;
    fetch(`/api/clients/${ref}/blog-seeds`)
      .then((r) => r.json())
      .then((d: BlogSeeds) => {
        if (!alive) return;
        setSeeds(d);
        setUseSeeds(
          new Set(
            d.topics.filter((t) => t.status === "queued").map((t) => t.id)
          )
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ref]);

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
        body: JSON.stringify({
          count,
          pillar,
          steer,
          seedIds: [...useSeeds],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The planner failed.");
      setIdeas(data.ideas ?? []);
      setMissing(data.missingSeedIds ?? []);
      setChosen(new Set((data.ideas ?? []).map((i: BlogIdea) => i.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(false);
    }
  }

  async function generate() {
    if (!ideas) return;
    const chosenIdeas = ideas.filter((i) => chosen.has(i.id));
    const items = chosenIdeas.map((i) => {
      // A supplied topic's note goes into the brief VERBATIM and first. It is
      // the one part of a brief that came from a person who knows something the
      // pipeline does not, and summarising it into the planner's rationale would
      // lose the figure or the example that makes the post worth publishing.
      const seed = seedById(seeds, i.seedTopicId);
      const fromCoinpresso =
        seed && seed.notes
          ? `FROM COINPRESSO — use this, it is the point of the post:\n${seed.notes}\n\n`
          : "";
      return {
        title: i.title,
        keywords: i.keywords,
        pillar: i.pillar,
        contentType: i.contentType,
        // Carried as their own fields, NOT folded into notes. Notes reach the
        // strategy agent as ordinary operator prose, where a URL sitting in it
        // reads as a source to go and cite. These two travel in a block that
        // says what they are and what may not be done with them.
        referenceUrl: seed?.referenceUrl,
        linkTarget: seed?.linkTarget,
        contentBrief: seed?.brief,
        notes: `${fromCoinpresso}Buyer question: ${i.buyerQuestion}\nOriginality required: ${i.originality}${
          i.needsClientData
            ? "\nNOTE: this post's originality depends on Coinpresso's own campaign data, which was NOT supplied. Write around the gap honestly — do not invent a figure."
            : ""
        }\n${i.rationale}`,
      };
    });
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

    // The topics that became posts are marked written now, at the moment the
    // batch starts — not when the planner proposed them. A proposal can be
    // discarded, and burning the topic then would lose it silently.
    const usedIds = chosenIdeas
      .map((i) => i.seedTopicId)
      .filter((id): id is string => Boolean(id));
    if (usedIds.length) {
      fetch(`/api/clients/${ref}/blog-seeds`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usedIds, batchId: data.id }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: BlogSeeds | null) => d && setSeeds(d))
        .catch(() => {
          // The posts are already being written; a failed bookkeeping call is
          // not worth failing the batch over. The topic stays queued and shows
          // up again tomorrow, which is the safe direction to be wrong in.
        });
    }
  }

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSeed = (id: string) =>
    setUseSeeds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const queuedSeeds = (seeds?.topics ?? []).filter((t) => t.status === "queued");
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

      {!batch && queuedSeeds.length > 0 && (
        <div className="card p-5 space-y-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="font-bold text-sm">
              Topics from Coinpresso{" "}
              <span className="text-[var(--ink-3)] font-normal">
                ({useSeeds.size} of {queuedSeeds.length} in this day)
              </span>
            </h2>
            <Link
              href={`/client/${ref}/own-blog/topics`}
              className="text-[11.5px] text-[var(--accent)] font-medium"
            >
              Manage topics →
            </Link>
            {/* Bulk selection. Deselecting 58 chips one at a time to write one
                post is the exact chore that makes someone stop using the tool.
                "Top topic only" also drops the day size to 1, because the only
                reason to click it is to plan exactly that post. */}
            <span className="flex gap-1.5 ml-auto">
              <button
                onClick={() => {
                  const first = queuedSeeds[0];
                  setUseSeeds(new Set(first ? [first.id] : []));
                  setCount(1);
                }}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors"
              >
                Top topic only
              </button>
              <button
                onClick={() =>
                  setUseSeeds(new Set(queuedSeeds.map((t) => t.id)))
                }
                className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                All
              </button>
              <button
                onClick={() => setUseSeeds(new Set())}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                None
              </button>
            </span>
          </div>
          <p className="text-[12px] text-[var(--ink-3)] max-w-3xl">
            Each of these becomes one post. The planner fills the rest of the day
            around them and still has to spread it across pillars and formats —
            so a day with more topics than slots defers the newest ones rather
            than shrinking the spread.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {queuedSeeds.map((t) => {
              const on = useSeeds.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleSeed(t.id)}
                  title={t.notes ?? undefined}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium text-left transition-colors ${
                    on
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]"
                  }`}
                >
                  {t.topic}
                  {t.keywords.length > 0 && (
                    <span className={on ? "opacity-70" : "text-[var(--ink-4)]"}>
                      {" "}
                      · {t.keywords[0]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {useSeeds.size > count && (
            <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
              {useSeeds.size} topics selected for a {count}-post day. The{" "}
              {useSeeds.size - count} most recently added will wait for tomorrow —
              the longest-waiting ones go first. Raise the day size to take them
              all.
            </div>
          )}
        </div>
      )}

      {!batch && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-[140px_minmax(0,1fr)] gap-4 items-start">
            <div>
              {/* "Posts today" read as "how many posts I am making", which is
                  not what this control does — it sets how many ideas come back
                  to choose from, and nothing is written until something is
                  ticked. Two people in a row read it the other way and could not
                  see how to write a single post. */}
              <span className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
                Ideas to propose
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
              <p className="text-[10.5px] text-[var(--ink-4)] leading-snug mt-1.5 max-w-[150px]">
                Proposing is a fraction of a cent. You pick which of them get
                written — one is fine.
              </p>
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
            {thinking
              ? count === 1
                ? "Planning the post…"
                : "Planning the day…"
              : `Plan ${count} post${count === 1 ? "" : "s"}`}
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
              <span className="font-normal opacity-70">
                {" "}
                · this is the step that costs
              </span>
            </button>
          </div>

          {missing.length > 0 && (
            <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
              The planner did not produce a post for{" "}
              {missing.length === 1 ? "one topic" : `${missing.length} topics`}{" "}
              you supplied:{" "}
              <strong>
                {missing
                  .map((id) => seedById(seeds, id)?.topic ?? id)
                  .join(" · ")}
              </strong>
              . They are still queued, so nothing is lost — but this usually
              means the day was too small for the number of topics, or the topic
              collided with the pillar spread. Re-run, or plan a bigger day.
            </div>
          )}

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
                        {i.seedTopicId && (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10">
                            your topic
                          </span>
                        )}
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
