"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PILLARS } from "@/lib/blog";
import type { BlogSeeds, SeedTopic } from "@/lib/blog-seed";
import BriefDrawer from "@/components/BriefDrawer";
import SuggestTopics from "@/components/SuggestTopics";
import { parseSeedCsv, parseSeedText, type ParsedSeeds } from "@/lib/blog-seed-parse";

/**
 * Where Coinpresso put the topics and keywords they want covered.
 *
 * The planner is good at proposing a day from the pillars and the archive, and
 * it cannot know what a sales call surfaced yesterday or which term a competitor
 * started bidding on. Before this the only way in was a one-line steer that the
 * planner was free to dilute; a topic left here is a commitment the plan has to
 * carry.
 */

const SPLIT = /[,\n;]+/;

/**
 * Short labels for the list's pillar column.
 *
 * The full names are right on a settings page and useless in a column 110px
 * wide, where "Generative Engine Optimisation" and "Community management" both
 * render as "Generative Engine …" and "Community manage…" — a column of
 * ellipses that distinguishes nothing on the twenty rows where it matters most.
 * The full name is still in the drawer.
 */
const PILLAR_SHORT: Record<string, string> = {
  geo: "GEO",
  "presale-marketing": "Presale",
  "crypto-pr": "PR",
  clipping: "Clipping",
  community: "Community",
  paid: "Paid",
};

function parseKeywords(raw: string): string[] {
  return raw
    .split(SPLIT)
    .map((k) => k.trim())
    .filter(Boolean);
}

export default function TopicsPage() {
  const { ref } = useParams<{ ref: string }>();
  const [seeds, setSeeds] = useState<BlogSeeds | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [notes, setNotes] = useState("");
  const [pillar, setPillar] = useState("");
  const [addedBy, setAddedBy] = useState("");

  const [mode, setMode] = useState<"one" | "many">("one");
  const [bulk, setBulk] = useState("");
  const [bulkName, setBulkName] = useState("");
  const [bulkIsCsv, setBulkIsCsv] = useState(false);

  const [standing, setStanding] = useState("");
  const [standingDirty, setStandingDirty] = useState(false);

  // Which brief is open, and how the eighty rows are narrowed. With a queue this
  // long, "find the one I mean" is the actual task most of the time — scrolling
  // is not a filter.
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pillarFilter, setPillarFilter] = useState("");
  const [briefFilter, setBriefFilter] = useState<"" | "with" | "without">("");
  const [suggesting, setSuggesting] = useState(false);

  // Multi-select. Triage on a list this long is "these eleven are not blog
  // posts" — one at a time is eleven round trips and eleven chances to lose your
  // place in a list that reorders under you as each one leaves.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${ref}/blog-seeds`);
    if (!res.ok) return;
    const data: BlogSeeds = await res.json();
    setSeeds(data);
    if (!standingDirty) setStanding(data.standingKeywords.join(", "));
  }, [ref, standingDirty]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTopic() {
    const t = topic.trim();
    if (!t) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${ref}/blog-seeds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topics: [
            {
              topic: t,
              keywords: parseKeywords(keywords),
              notes: notes.trim() || undefined,
              pillar: pillar || undefined,
              addedBy: addedBy.trim() || undefined,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the topic.");
      setSeeds(data);
      setTopic("");
      setKeywords("");
      setNotes("");
      setPillar("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function addMany(rows: ParsedSeeds["rows"]) {
    if (!rows.length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${ref}/blog-seeds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topics: rows.map((r) => ({
            ...r,
            addedBy: bulkName.trim() || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the topics.");
      setSeeds(data);
      setBulk("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  /**
   * A .csv goes through the CSV reader; anything else is read as pasted text.
   * The file's own content decides, not its name — a .txt export of a
   * spreadsheet is still tab-separated and parses correctly either way.
   */
  async function readFile(file: File) {
    const text = await file.text();
    setBulk(text);
    setMode("many");
    if (/\.csv$/i.test(file.name)) setBulkIsCsv(true);
    else setBulkIsCsv(false);
  }

  async function saveStanding() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${ref}/blog-seeds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ standingKeywords: parseKeywords(standing) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setSeeds(data);
      setStandingDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: SeedTopic["status"]) {
    const res = await fetch(`/api/clients/${ref}/blog-seeds`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) setSeeds(await res.json());
  }

  /**
   * Move everything selected at once.
   *
   * Sequential rather than parallel: the store is one JSON file per client and
   * concurrent writes would race, with the last write silently dropping the
   * others. Eleven quick requests are fine; eleven simultaneous ones lose data.
   */
  async function moveSelected(status: SeedTopic["status"]) {
    const ids = [...selected];
    setSelected(new Set());
    for (const id of ids) {
      const res = await fetch(`/api/clients/${ref}/blog-seeds`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) setSeeds(await res.json());
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/clients/${ref}/blog-seeds?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) setSeeds(await res.json());
  }

  const topics = seeds?.topics ?? [];

  // The filter searches the brief as well as the topic and keywords. Someone
  // looking for "the one about proof-of-reserves" is remembering a phrase from
  // the angle, not the headline.
  const needle = q.trim().toLowerCase();
  const matches = (t: SeedTopic) => {
    if (pillarFilter && t.pillar !== pillarFilter) return false;
    if (briefFilter === "with" && !t.brief) return false;
    if (briefFilter === "without" && t.brief) return false;
    if (!needle) return true;
    const hay = [
      t.topic,
      t.keywords.join(" "),
      t.notes ?? "",
      t.brief?.angle ?? "",
      t.brief?.gap ?? "",
      ...(t.brief?.outline ?? []).map((o) => `${o.title} ${o.focus ?? ""}`),
      ...(t.brief?.faqs ?? []).map((f) => f.q),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  };

  const shown = topics.filter(matches);
  const queued = shown.filter((t) => t.status === "queued");
  const parked = shown.filter((t) => t.status === "parked");
  const used = shown.filter((t) => t.status === "used");
  const filtering = Boolean(needle || pillarFilter || briefFilter);
  const openTopic = topics.find((t) => t.id === openId) ?? null;

  return (
    <div className="space-y-3">

      {error && (
        <div className="text-[12px] text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-lg px-3.5 py-2.5">
          {error}
        </div>
      )}

      {/* --- One toolbar: what is here, how to narrow it, what to do next ---
          The heading, the "plan a day" link and the filter card used to be three
          stacked blocks costing about 150px before a single topic appeared. They
          are one sticky bar now — the count is the heading, and the action sits
          at the end of it where the eye already is. Sticky because with
          seventy-four rows the controls are otherwise only reachable by
          scrolling back to the top. */}
      <div className="sticky top-[89px] z-20 -mx-1 px-1 py-2 bg-[var(--bg)]/92 backdrop-blur-sm">
        <div className="card px-3 py-2 flex items-center gap-2 flex-wrap">
          {selected.size > 0 ? (
            <>
              <span className="text-[12.5px] font-bold tabular-nums pl-1">
                {selected.size} selected
              </span>
              <button
                onClick={() => moveSelected("parked")}
                className="text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                Hide
              </button>
              <button
                onClick={() => moveSelected("queued")}
                className="text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                Re-queue
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[11.5px] text-[var(--ink-4)] hover:text-[var(--ink)] transition-colors"
              >
                Clear
              </button>
              <Link
                href={`/client/${ref}/own-blog/plan`}
                className="ml-auto text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white"
              >
                Plan a day →
              </Link>
            </>
          ) : (
            <>
              <span className="text-[12.5px] font-bold tabular-nums pl-1 whitespace-nowrap">
                {queued.length}
                <span className="font-normal text-[var(--ink-3)]"> waiting</span>
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search titles, keywords, and inside the briefs…"
                className="flex-1 min-w-[180px] bg-[var(--bg)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-[12px] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
              />
              <select
                value={pillarFilter}
                onChange={(e) => setPillarFilter(e.target.value)}
                className="bg-[var(--bg)] border border-[var(--line)] rounded-lg px-2 py-1.5 text-[11.5px] focus:border-[var(--accent)] outline-none"
              >
                <option value="">All pillars</option>
                {PILLARS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <select
                value={briefFilter}
                onChange={(e) =>
                  setBriefFilter(e.target.value as "" | "with" | "without")
                }
                className="bg-[var(--bg)] border border-[var(--line)] rounded-lg px-2 py-1.5 text-[11.5px] focus:border-[var(--accent)] outline-none"
              >
                <option value="">Brief: any</option>
                <option value="with">Has a brief</option>
                <option value="without">No brief</option>
              </select>
              {filtering && (
                <button
                  onClick={() => {
                    setQ("");
                    setPillarFilter("");
                    setBriefFilter("");
                  }}
                  className="text-[11.5px] text-[var(--ink-4)] hover:text-[var(--ink)] transition-colors"
                >
                  Clear ({shown.length})
                </button>
              )}
              <button
                onClick={() => setSuggesting((v) => !v)}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                  suggesting
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--line)] hover:border-[var(--accent)]/50"
                }`}
                title="Propose new topics from the briefs already in the queue"
              >
                Suggest topics
              </button>
              {queued.length > 0 && (
                <Link
                  href={`/client/${ref}/own-blog/plan`}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 transition-colors whitespace-nowrap"
                >
                  Plan a day →
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <SuggestTopics
        clientRef={ref}
        open={suggesting}
        briefCount={topics.filter((t) => t.brief?.angle).length}
        topicCount={topics.length}
        onClose={() => setSuggesting(false)}
        onAdded={load}
      />

      {/* --- The queue, as a list rather than a stack of cards ---------------
          Seventy-four cards is six thousand pixels of scrolling to see a set
          you are choosing between. One line each, and the keywords move to the
          drawer: they were the tallest thing on the row and the least useful
          while scanning. */}
      {seeds === null ? (
        <div className="card p-5 text-[12px] text-[var(--ink-3)]">Loading…</div>
      ) : queued.length === 0 && filtering ? (
        <div className="card p-5 text-[12.5px] text-[var(--ink-3)]">
          Nothing queued matches that. Hidden and written are filtered too.
        </div>
      ) : queued.length === 0 ? (
        <div className="card p-5 text-[12.5px] text-[var(--ink-3)] leading-relaxed">
          Nothing queued. Days planned now come entirely from the pillars, the
          archive and whatever the planner finds — which is a working default,
          not a worse one. Add a topic when you know something it cannot.
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          <div className="flex items-center gap-2.5 px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-4)] bg-[var(--bg)]/50">
            <span className="w-3.5 shrink-0" />
            <span className="flex-1">Topic</span>
            <span className="w-[76px] text-right">Pillar</span>
            <span className="w-[54px] text-right">Brief</span>
            <span className="w-[104px]" />
          </div>
          {queued.map((t) => (
            <TopicRow
              key={t.id}
              t={t}
              checked={selected.has(t.id)}
              onCheck={() => toggleSelected(t.id)}
              onOpen={() => setOpenId(t.id)}
              onPark={() => setStatus(t.id, "parked")}
              onRemove={() => remove(t.id)}
            />
          ))}
        </div>
      )}

      {/* Parked and written are archives. Collapsed by default: they are
          consulted, not scanned, and open they doubled the page. */}
      {parked.length > 0 && (
        <details className="card group overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center gap-2 text-[12.5px] font-bold select-none text-[var(--ink-2)]">
            <span className="text-[var(--ink-4)] group-open:rotate-90 transition-transform">
              ›
            </span>
            Hidden
            <span className="font-normal text-[var(--ink-4)] tabular-nums">
              {parked.length}
            </span>
            <span className="font-normal text-[11px] text-[var(--ink-4)]">
              — out of the queue, and the planner never sees them
            </span>
          </summary>
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {parked.map((t) => (
              <TopicRow
                key={t.id}
                t={t}
                dim
                checked={selected.has(t.id)}
                onCheck={() => toggleSelected(t.id)}
                onOpen={() => setOpenId(t.id)}
                onRequeue={() => setStatus(t.id, "queued")}
                onRemove={() => remove(t.id)}
              />
            ))}
          </div>
        </details>
      )}

      {used.length > 0 && (
        <details className="card group overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center gap-2 text-[12.5px] font-bold select-none text-[var(--ink-2)]">
            <span className="text-[var(--ink-4)] group-open:rotate-90 transition-transform">
              ›
            </span>
            Written
            <span className="font-normal text-[var(--ink-4)] tabular-nums">
              {used.length}
            </span>
            <span className="font-normal text-[11px] text-[var(--ink-4)]">
              — kept so the same topic does not return as a fresh idea
            </span>
          </summary>
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {used.slice(0, 40).map((t) => (
              <TopicRow
                key={t.id}
                t={t}
                dim
                checked={selected.has(t.id)}
                onCheck={() => toggleSelected(t.id)}
                onOpen={() => setOpenId(t.id)}
                onRequeue={() => setStatus(t.id, "queued")}
                onRemove={() => remove(t.id)}
              />
            ))}
          </div>
        </details>
      )}

      {/* --- Add topics (secondary once the queue is full) ----------------- */}
      <details className="card group" open={topics.length === 0}>
        <summary className="cursor-pointer list-none px-5 py-3.5 flex items-center gap-2 text-[13px] font-bold select-none">
          <span className="text-[var(--ink-3)] group-open:rotate-90 transition-transform">›</span>
          Add topics
          <span className="font-normal text-[11.5px] text-[var(--ink-4)]">
            one at a time, or paste a list
          </span>
        </summary>
        <div className="px-5 pb-5">
        <div className="card p-5 space-y-3.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode("one")}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors ${
                mode === "one"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
            >
              Add one
            </button>
            <button
              onClick={() => setMode("many")}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors ${
                mode === "many"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
            >
              Paste a list
            </button>
          </div>
  
          {mode === "many" ? (
            <BulkPanel
              value={bulk}
              onChange={(v) => setBulk(v)}
              isCsv={bulkIsCsv}
              name={bulkName}
              onName={setBulkName}
              onFile={readFile}
              saving={saving}
              onAdd={addMany}
            />
          ) : (
          <>
          <div>
            <label
              className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5"
              htmlFor="topic"
            >
              Topic
            </label>
            <input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTopic()}
              placeholder="How we price a clipping campaign, and why it is not per-view"
              className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
            />
            <p className="text-[11px] text-[var(--ink-4)] mt-1.5">
              A subject, not a headline. The planner writes the title, picks the
              format and checks it is not a re-run of something already published.
            </p>
          </div>
  
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div>
              <label
                className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5"
                htmlFor="keywords"
              >
                Keywords for this post
              </label>
              <input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="crypto clipping pricing, clipping campaign cost"
                className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
              />
              <p className="text-[11px] text-[var(--ink-4)] mt-1.5">
                Comma separated. The first one is treated as primary.
              </p>
            </div>
  
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
                Pillar hint (optional)
              </span>
              <select
                value={pillar}
                onChange={(e) => setPillar(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] outline-none transition-colors"
              >
                <option value="">Let the planner decide</option>
                {PILLARS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
  
          <div>
            <label
              className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5"
              htmlFor="notes"
            >
              Anything the writer needs (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Three prospects asked this in the last fortnight. We charge on retained creators, not views — the comparison table in the deck has the real numbers."
              className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors resize-y"
            />
            <p className="text-[11px] text-[var(--ink-4)] mt-1.5">
              A figure here is the difference between a post anyone could write and
              one only Coinpresso can. Without it the writer works around the gap
              rather than inventing a number.
            </p>
          </div>
  
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={addedBy}
              onChange={(e) => setAddedBy(e.target.value)}
              placeholder="Your name"
              className="w-36 bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-[12.5px] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
            />
            <button
              onClick={addTopic}
              disabled={saving || !topic.trim()}
              className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
            >
              Add to the queue
            </button>
          </div>
          </>
          )}
        </div>
  
        </div>
      </details>

      {/* --- Standing keywords --------------------------------------------- */}
      <details className="card group">
        <summary className="cursor-pointer list-none px-5 py-3.5 flex items-center gap-2 text-[13px] font-bold select-none">
          <span className="text-[var(--ink-3)] group-open:rotate-90 transition-transform">›</span>
          Standing keywords
          <span className="font-normal text-[11.5px] text-[var(--ink-4)]">
            {seeds?.standingKeywords.length ?? 0} terms, worked in where they fit
          </span>
        </summary>
        <div className="px-5 pb-5">
        <div className="card p-5 space-y-3">
          <div>
            <h2 className="font-bold text-sm">Standing keywords</h2>
            <p className="text-[12px] text-[var(--ink-3)] mt-1 max-w-3xl">
              Terms to work in across the programme{" "}
              <strong>where they genuinely fit</strong> — not a checklist for every
              post. Forcing all of these into all of them is keyword stuffing, and
              it is the pattern that gets a domain demoted rather than ranked.
            </p>
          </div>
          <textarea
            value={standing}
            onChange={(e) => {
              setStanding(e.target.value);
              setStandingDirty(true);
            }}
            rows={2}
            placeholder="crypto marketing agency, crypto pr agency, generative engine optimisation"
            className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors resize-y"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={saveStanding}
              disabled={saving || !standingDirty}
              className="text-[12.5px] font-semibold px-4 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-40 transition-colors"
            >
              {standingDirty ? "Save keywords" : "Saved"}
            </button>
            <span className="text-[11px] text-[var(--ink-4)]">
              {parseKeywords(standing).length} term
              {parseKeywords(standing).length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
  
        </div>
      </details>

      <BriefDrawer
        topic={openTopic}
        onClose={() => setOpenId(null)}
        onPark={(id) => {
          setStatus(id, "parked");
          setOpenId(null);
        }}
        onRequeue={(id) => {
          setStatus(id, "queued");
          setOpenId(null);
        }}
      />
    </div>
  );
}

/**
 * One topic, one line.
 *
 * The card version carried a pillar chip, an import date, three keywords, a
 * brief chip and two buttons across three lines — about 90px, which is 6,600px
 * of scrolling for seventy-four of them, and the queue is a thing you choose
 * FROM. Everything that does not change a decision while scanning moved into the
 * drawer: keywords, notes, provenance.
 *
 * What is left is what a decision needs. The title, because that is what anyone
 * scans for. The pillar, because the day has to spread across at least three.
 * And whether there is a brief and how much article it specifies, because a
 * topic with a nine-section brief and one with a bare title are not the same
 * amount of work.
 *
 * Hide and Remove appear on hover — a destructive control sitting permanently
 * beside every row is noise, and the bulk bar covers the case where you want to
 * move several. Remove still asks nothing, so it is placed away from the row's
 * click target and stops the click from opening the drawer.
 *
 * "Hide" rather than "Park": the stored status is still `parked`, but nobody
 * outside this codebase knows what parking a topic means, and the thing the
 * button actually does is take it out of the queue and out of the planner's
 * sight. One state, named for its effect.
 */
function TopicRow({
  t,
  dim,
  checked,
  onCheck,
  onOpen,
  onPark,
  onRequeue,
  onRemove,
}: {
  t: SeedTopic;
  dim?: boolean;
  checked: boolean;
  onCheck: () => void;
  onOpen: () => void;
  onPark?: () => void;
  onRequeue?: () => void;
  onRemove: () => void;
}) {
  const p = PILLARS.find((x) => x.id === t.pillar);
  const b = t.brief;

  return (
    <div
      onClick={onOpen}
      className={`group flex items-center gap-2.5 px-3 py-[7px] cursor-pointer transition-colors hover:bg-[var(--bg)] ${
        dim ? "opacity-55 hover:opacity-100" : ""
      } ${checked ? "bg-[var(--accent)]/[0.07]" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onCheck}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${t.topic}`}
        className="shrink-0 w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
      />

      <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug truncate">
        {t.topic}
      </span>

      {t.status === "used" && (
        <span className="shrink-0 text-[9.5px] font-bold text-[var(--success)]">
          written
        </span>
      )}

      <span
        className="shrink-0 w-[76px] text-right text-[10.5px] text-[var(--ink-4)] truncate"
        title={p?.name}
      >
        {p ? PILLAR_SHORT[p.id] ?? p.name : ""}
      </span>

      {/* The brief, as a number. "9" is enough — the drawer has the rest, and a
          topic with no brief shows an em dash rather than nothing, so the column
          stays a column and the gap is legible as a gap. */}
      <span
        className="shrink-0 w-[54px] text-right"
        title={
          b
            ? `Content brief: ${b.outline?.length ?? 0} sections, ${b.faqs?.length ?? 0} FAQs${b.rationale ? ", carries must-not-claim constraints" : ""}`
            : "No content brief"
        }
      >
        {b ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--accent)] tabular-nums">
            {b.rationale && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]"
                title="Carries must-not-claim constraints"
              />
            )}
            {b.outline?.length ?? "·"}
            <span className="font-normal opacity-60">§</span>
          </span>
        ) : (
          <span className="text-[10.5px] text-[var(--ink-4)]" title="No brief">
            —
          </span>
        )}
      </span>

      <span
        className="shrink-0 w-[104px] flex items-center justify-end gap-2.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {onPark && (
          <button
            onClick={onPark}
            className="text-[10.5px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
          >
            Hide
          </button>
        )}
        {onRequeue && (
          <button
            onClick={onRequeue}
            className="text-[10.5px] font-medium text-[var(--accent)]"
          >
            Re-queue
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-[10.5px] text-[var(--ink-4)] hover:text-[var(--danger)] transition-colors"
        >
          Remove
        </button>
      </span>
    </div>
  );
}

/**
 * Fifty topics at once.
 *
 * The preview is the important half. A pasted block can be misread in exactly
 * one way that matters — the wrong field separator, which turns keywords into
 * part of the topic or the topic into three topics — and that is obvious on
 * screen and invisible once it is in the queue. So nothing is sent until the
 * parsed rows have been shown, counted, and the skipped lines listed with why.
 */
function BulkPanel({
  value,
  onChange,
  isCsv,
  name,
  onName,
  onFile,
  saving,
  onAdd,
}: {
  value: string;
  onChange: (v: string) => void;
  isCsv: boolean;
  name: string;
  onName: (v: string) => void;
  onFile: (f: File) => void;
  saving: boolean;
  onAdd: (rows: ParsedSeeds["rows"]) => void;
}) {
  const parsed: ParsedSeeds = value.trim()
    ? isCsv
      ? parseSeedCsv(value)
      : parseSeedText(value)
    : { rows: [], skipped: [] };

  return (
    <div className="space-y-3.5">
      <div>
        <label
          className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5"
          htmlFor="bulk"
        >
          One topic per line
        </label>
        <textarea
          id="bulk"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
          placeholder={
            "How we price a clipping campaign\tcrypto clipping pricing, clipping cost\tWe charge on retained creators, not views\n" +
            "Why ChatGPT never mentions your token | geo crypto, generative engine optimisation\n" +
            "Share of Model Voice: the new KPI\thttps://docs.google.com/document/d/…\n" +
            "A bare line is just a topic, with no keywords"
          }
          className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2.5 text-[12.5px] font-mono placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors resize-y"
        />
        <p className="text-[11px] text-[var(--ink-4)] mt-1.5 leading-relaxed">
          Columns are{" "}
          <strong>
            topic · keywords · notes · pillar · content brief · link target
          </strong>
          , separated by a tab or a <code>|</code>. Paste cells straight from a
          spreadsheet and you get tabs for free. A line with neither is taken as
          a topic on its own. Commas are never treated as column separators —
          they separate keywords, and guessing between the two silently splits
          rows the wrong way. A second column that is <em>just</em> a link is
          read as the content brief, because a content calendar is usually two
          columns and a URL is never a keyword.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 cursor-pointer transition-colors">
          Choose a file
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-[11px] text-[var(--ink-4)]">
          .csv, .tsv or .txt — a .csv is read with quoting, so a keyword list
          inside one cell survives
        </span>
      </div>

      {value.trim() && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3.5 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] font-semibold">
              {parsed.rows.length} topic{parsed.rows.length === 1 ? "" : "s"}{" "}
              ready
            </span>
            {isCsv && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--line)] text-[var(--ink-3)]">
                read as CSV
              </span>
            )}
            {parsed.skipped.length > 0 && (
              <span className="text-[11.5px] text-[var(--warning)]">
                {parsed.skipped.length} line
                {parsed.skipped.length === 1 ? "" : "s"} skipped
              </span>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1">
            {parsed.rows.slice(0, 60).map((r, i) => (
              <div key={i} className="text-[11.5px] flex gap-2">
                <span className="text-[var(--ink-4)] w-6 shrink-0 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{r.topic}</span>
                  {r.keywords && r.keywords.length > 0 && (
                    <span className="text-[var(--accent)]">
                      {" "}
                      · {r.keywords.join(" · ")}
                    </span>
                  )}
                  {r.notes && (
                    <span className="text-[var(--ink-4)]"> · {r.notes}</span>
                  )}
                  {r.referenceUrl && (
                    <span className="text-[var(--ink-3)]"> · brief ↗</span>
                  )}
                  {r.linkTarget && (
                    <span className="text-[var(--ink-3)]">
                      {" "}
                      · links to {r.linkTarget.replace(/^https?:\/\//, "")}
                    </span>
                  )}
                </span>
              </div>
            ))}
            {parsed.rows.length > 60 && (
              <div className="text-[11px] text-[var(--ink-4)] pl-8">
                …and {parsed.rows.length - 60} more
              </div>
            )}
          </div>

          {parsed.skipped.length > 0 && (
            <div className="pt-2 border-t border-[var(--line)] space-y-0.5">
              {parsed.skipped.map((sk) => (
                <div
                  key={sk.line}
                  className="text-[11px] text-[var(--ink-4)] truncate"
                >
                  line {sk.line} — {sk.why}:{" "}
                  <span className="opacity-70">{sk.text.slice(0, 70)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Your name"
          className="w-36 bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-[12.5px] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
        />
        <button
          onClick={() => onAdd(parsed.rows)}
          disabled={saving || parsed.rows.length === 0}
          className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
        >
          {saving
            ? "Adding…"
            : `Add ${parsed.rows.length} to the queue`}
        </button>
        <span className="text-[11px] text-[var(--ink-4)]">
          Topics already queued are skipped, so re-pasting a list you part-added
          adds only what is missing.
        </span>
      </div>
    </div>
  );
}
