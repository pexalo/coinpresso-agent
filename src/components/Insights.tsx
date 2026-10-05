"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Liam's findings and links — the data the writer uses to give a real answer.
// See src/lib/insights.ts. Two ways in: the panel on top of Agent workflow,
// and the "+ Insight" button that floats on every page.

export interface InsightRow {
  id: string;
  kind: "finding" | "link";
  title: string;
  body: string;
  url?: string;
  tags: string[];
  always?: boolean;
  author?: string;
  topicIds?: string[];
  runIds?: string[];
  updatedAt: string;
}

type Draft = { kind: "finding" | "link"; title: string; body: string; url: string; tags: string; always: boolean; author: string };
const EMPTY: Draft = { kind: "finding", title: "", body: "", url: "", tags: "", always: false, author: "Liam" };

const field = "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)]";
const label = "block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1";

export function InsightForm({ clientRef, initial, onSaved, onCancel, attach }: {
  clientRef: string;
  initial?: InsightRow;
  onSaved: (x: InsightRow) => void;
  onCancel?: () => void;
  /** Attach a new insight to this topic or post. */
  attach?: { topicIds?: string[]; runIds?: string[] };
}) {
  const [d, setD] = useState<Draft>(
    initial
      ? { kind: initial.kind, title: initial.title, body: initial.body, url: initial.url ?? "", tags: initial.tags.join(", "), always: Boolean(initial.always), author: initial.author ?? "" }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/insights${initial ? `?id=${initial.id}` : ""}`, {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...d, tags: d.tags.split(","), ...(initial ? {} : attach ?? {}) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Save failed (${res.status})`);
      onSaved(j.insight);
      if (!initial) setD({ ...EMPTY, author: d.author });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5" role="radiogroup" aria-label="Kind">
        {(["finding", "link"] as const).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={d.kind === k}
            onClick={() => set({ kind: k })}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold ${
              d.kind === k ? "bg-[var(--accent)] text-white" : "border border-[var(--line)] text-[var(--ink-3)]"
            }`}
          >
            {k === "finding" ? "Finding or figure" : "Blog or link"}
          </button>
        ))}
      </div>
      {d.kind === "link" && (
        <div>
          <label className={label} htmlFor="ins-url">Link</label>
          <input id="ins-url" className={field} placeholder="https://coinpresso.io/blog/…" value={d.url} onChange={(e) => set({ url: e.target.value })} />
        </div>
      )}
      <div>
        <label className={label} htmlFor="ins-title">Title</label>
        <input
          id="ins-title"
          className={field}
          placeholder={d.kind === "finding" ? "Presale marketing budgets, 2025–26" : "What the post is about"}
          value={d.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div>
        <label className={label} htmlFor="ins-body">{d.kind === "finding" ? "The finding — figures, retainers, spends, results" : "Notes (optional)"}</label>
        <textarea
          id="ins-body"
          className={`${field} min-h-[130px] leading-relaxed`}
          placeholder={
            d.kind === "finding"
              ? "e.g. Presale marketing retainers we see run $15k–$40k a month; most raises we've run spent 60% on KOLs and PR in the 6 weeks before launch. One 2025 client raised $4.2M in 5 weeks on a $90k budget."
              : "What this page covers, and when it should be linked."
          }
          value={d.body}
          onChange={(e) => set({ body: e.target.value })}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="ins-tags">Topics (comma separated)</label>
          <input id="ins-tags" className={field} placeholder="presale, KOL, budget" value={d.tags} onChange={(e) => set({ tags: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="ins-author">Added by</label>
          <input id="ins-author" className={field} value={d.author} onChange={(e) => set({ author: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
        <input type="checkbox" checked={d.always} onChange={(e) => set({ always: e.target.checked })} />
        Use in every post, whatever the topic
      </label>
      {err && <div className="text-[12px] text-red-500">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[12.5px] font-semibold disabled:opacity-60">
          {busy ? "Saving…" : initial ? "Save changes" : "Add"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="px-3 py-2 text-[12.5px] text-[var(--ink-3)]">Cancel</button>
        )}
      </div>
    </div>
  );
}

export function InsightsPanel({ clientRef }: { clientRef: string }) {
  const [items, setItems] = useState<InsightRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientRef}/insights`);
    if (r.ok) setItems((await r.json()).insights ?? []);
  }, [clientRef]);
  useEffect(() => {
    load();
    // The floating button adds from anywhere; refresh when it does.
    const on = () => load();
    window.addEventListener("insight-added", on);
    return () => window.removeEventListener("insight-added", on);
  }, [load]);

  async function remove(id: string) {
    const r = await fetch(`/api/clients/${clientRef}/insights?id=${id}`, { method: "DELETE" });
    if (r.ok) setItems((xs) => (xs ?? []).filter((x) => x.id !== id));
    setConfirmDel(null);
  }

  return (
    <div className="card p-5 space-y-4" id="insights">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-bold text-sm">Liam&apos;s insights &amp; data</h2>
          <p className="text-[12px] text-[var(--ink-3)] leading-relaxed mt-1">
            Figures, retainers, spends and case-study results that aren&apos;t public. The writer
            uses the ones that match a post&apos;s topic to give a direct answer, credited to
            Coinpresso. Blog links from coinpresso.io become pages the writer can link.
            Applies to posts written from now on.
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[12.5px] font-semibold">
            + Add insight
          </button>
        )}
      </div>
      {adding && (
        <div className="rounded-lg border border-[var(--line)] p-4">
          <InsightForm
            clientRef={clientRef}
            onSaved={(x) => { setItems((xs) => [x, ...(xs ?? [])]); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {items === null ? (
        <div className="text-[12px] text-[var(--ink-3)]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-[12px] text-[var(--ink-3)]">Nothing yet. Add the first figure the posts keep dodging.</div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {items.map((x) => (
            <li key={x.id} className="py-3">
              {editing === x.id ? (
                <InsightForm
                  clientRef={clientRef}
                  initial={x}
                  onSaved={(y) => { setItems((xs) => (xs ?? []).map((z) => (z.id === y.id ? y : z))); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 border border-[var(--line)] text-[var(--ink-3)]">
                        {x.kind === "finding" ? "Finding" : "Link"}
                      </span>
                      <span className="text-[13px] font-semibold">{x.title}</span>
                      {x.always && <span className="text-[10.5px] text-[var(--accent)]">every post</span>}
                    </div>
                    {x.url && <a href={x.url} target="_blank" rel="noreferrer" className="block text-[12px] text-[var(--accent)] break-all mt-0.5">{x.url}</a>}
                    {x.body && <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed mt-1 whitespace-pre-wrap">{x.body}</p>}
                    <div className="text-[11px] text-[var(--ink-4)] mt-1">
                      {(x.topicIds?.length || x.runIds?.length)
                        ? `attached to ${[x.topicIds?.length ? `${x.topicIds.length} topic${x.topicIds.length > 1 ? "s" : ""}` : "", x.runIds?.length ? `${x.runIds.length} post${x.runIds.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" & ")} · `
                        : ""}
                      {x.tags.length ? `${x.tags.join(", ")} · ` : ""}
                      {x.author ? `${x.author} · ` : ""}
                      {new Date(x.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <button onClick={() => setEditing(x.id)} className="px-2 py-1 rounded border border-[var(--line)]">Edit</button>
                    {confirmDel === x.id ? (
                      <>
                        <button onClick={() => remove(x.id)} className="px-2 py-1 rounded bg-red-600 text-white">Delete</button>
                        <button onClick={() => setConfirmDel(null)} className="text-[var(--ink-3)]">Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDel(x.id)} className="px-2 py-1 text-red-500">Delete</button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The pop-up: a floating button on every client page. */
export function InsightQuickAdd({ clientRef }: { clientRef: string }) {
  const pathname = usePathname();
  // On a post's page, the pop-up attaches to that post (and, server-side, its topic).
  const runId = pathname.match(/\/own-blog\/runs\/([^/]+)/)?.[1];
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button
        onClick={() => { setOpen(true); setDone(false); }}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-[var(--accent)] text-white px-4 py-2.5 text-[12.5px] font-semibold shadow-lg"
        title="Add a finding, figure or link for the writer"
      >
        + Insight
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add an insight">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-bold text-sm">Add an insight</h2>
                <p className="text-[11.5px] text-[var(--ink-3)] mt-0.5">
                  {runId
                    ? "Attached to this post and its topic. If the post is already written, use Rewrite from research to put it in."
                    : "Used by the writer in every post on this topic from now on. To attach it to one post, add it from that post's page or topic."}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-[var(--ink-3)] text-[13px]" aria-label="Close">✕</button>
            </div>
            {done && <div className="text-[12px] text-[var(--ink-2)] mb-3">Saved. Add another, or close.</div>}
            <InsightForm
              clientRef={clientRef}
              attach={runId ? { runIds: [runId] } : undefined}
              onSaved={() => { setDone(true); window.dispatchEvent(new Event("insight-added")); }}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The data for ONE post: on its page, and in its topic's drawer. Shows what
 * is attached to it, what the writer will also pick up from the library by
 * topic words, and lets you add new data or attach something already in the
 * library. Bernard, 5 Oct: "it needs to be attached to an upcoming topic or
 * blog post already written".
 */
export function PostInsights({ clientRef, runId, topicId, written }: {
  clientRef: string;
  runId?: string;
  topicId?: string;
  /** The post already has a draft: say how to get new data into it. */
  written?: boolean;
}) {
  const [all, setAll] = useState<InsightRow[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [used, setUsed] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [open, setOpen] = useState(true);

  const q = runId ? `runId=${runId}` : `topicId=${topicId}`;
  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientRef}/insights?${q}`);
    if (!r.ok) return;
    const j = await r.json();
    setAll(j.insights ?? []);
    setAttached(j.attached ?? []);
    setUsed(j.used ?? []);
  }, [clientRef, q]);
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("insight-added", on);
    return () => window.removeEventListener("insight-added", on);
  }, [load]);

  async function setAttach(x: InsightRow, on: boolean) {
    const runIds = new Set(x.runIds ?? []);
    const topicIds = new Set(x.topicIds ?? []);
    if (runId) (on ? runIds.add(runId) : runIds.delete(runId));
    if (topicId) (on ? topicIds.add(topicId) : topicIds.delete(topicId));
    await fetch(`/api/clients/${clientRef}/insights?id=${x.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runIds: [...runIds], topicIds: [...topicIds] }),
    });
    setPick("");
    load();
  }

  const mine = all.filter((x) => attached.includes(x.id));
  const alsoUsed = all.filter((x) => used.includes(x.id) && !attached.includes(x.id));
  const rest = all.filter((x) => !attached.includes(x.id));

  return (
    <div className="card p-4 space-y-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-[13px] font-bold">Data for this post{mine.length ? ` (${mine.length})` : ""}</span>
        <span className="text-[11px] text-[var(--ink-3)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <>
          <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed">
            Liam&apos;s figures for this {runId ? "post" : "topic"} — the writer uses them to give a direct answer.
            {written ? " This post is already written: after adding data, use Rewrite from research to put it in." : ""}
          </p>
          {mine.length === 0 && alsoUsed.length === 0 && (
            <div className="text-[12px] text-[var(--ink-3)]">Nothing yet.</div>
          )}
          {mine.map((x) => (
            <div key={x.id} className="rounded-lg border border-[var(--line)] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[12.5px] font-semibold">{x.title}</div>
                <button onClick={() => setAttach(x, false)} className="shrink-0 text-[11px] text-[var(--ink-3)] hover:text-red-500">Detach</button>
              </div>
              {x.url && <div className="text-[11.5px] text-[var(--accent)] break-all">{x.url}</div>}
              {x.body && <p className="text-[12px] text-[var(--ink-2)] leading-relaxed mt-0.5 whitespace-pre-wrap">{x.body}</p>}
            </div>
          ))}
          {alsoUsed.length > 0 && (
            <div className="text-[11.5px] text-[var(--ink-3)]">
              Also picked up from the library by topic: {alsoUsed.map((x) => x.title).join(" · ")}
            </div>
          )}
          {adding ? (
            <div className="rounded-lg border border-[var(--line)] p-3">
              <InsightForm
                clientRef={clientRef}
                attach={{ runIds: runId ? [runId] : [], topicIds: topicId ? [topicId] : [] }}
                onSaved={() => { setAdding(false); load(); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setAdding(true)} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[12px] font-semibold">
                + Add data
              </button>
              {rest.length > 0 && (
                <select
                  aria-label="Attach from library"
                  value={pick}
                  onChange={(e) => {
                    const x = rest.find((y) => y.id === e.target.value);
                    if (x) setAttach(x, true);
                  }}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[12px] max-w-[220px]"
                >
                  <option value="">Attach from library…</option>
                  {rest.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </select>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
