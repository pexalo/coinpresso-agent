"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCampaign } from "@/components/CampaignContext";
import { PUBLICATION_LIST, PUBLICATIONS } from "@/lib/publications";

interface Row {
  id: string;
  publishedAt: string;
  publication: string;
  title: string;
  keywords: string[];
  url?: string;
  angle: string;
  hasBody: boolean;
  excerpt?: string;
  wordCount?: number;
  source: string;
}

const field =
  "w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors";
const label =
  "block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5";

function BulkImport({
  clientRef,
  campaignId,
  onAdded,
}: {
  clientRef: string;
  campaignId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"own" | "competitor">("own");
  const [competitor, setCompetitor] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/clients/${clientRef}/archive?campaign=${campaignId}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bulkText: text, kind, competitor: competitor || undefined }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Import failed." });
        return;
      }
      setMsg({
        ok: true,
        text: `${data.added} added, ${data.skipped} already present.`,
      });
      setText("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 transition-colors whitespace-nowrap"
      >
        Bulk import
      </button>
    );
  }

  return (
    <div className="card p-5 space-y-4 w-full">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm">Bulk import titles and keywords</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          Close
        </button>
      </div>

      <div className="flex gap-1.5">
        {(["own", "competitor"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              kind === k
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]"
            }`}
          >
            {k === "own" ? "Our releases" : "Competitor"}
          </button>
        ))}
        {kind === "competitor" && (
          <input
            value={competitor}
            onChange={(e) => setCompetitor(e.target.value)}
            placeholder="Pepeto, AlphaPepe, Bullski…"
            className="flex-1 bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-1.5 text-[12px] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none"
          />
        )}
      </div>

      <div>
        <textarea
          rows={9}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"One per line, pipe or tab separated:\n\nTitle | keyword, keyword | wire | 2026-08-20 | angle | url\n\nOnly the title is required."}
          className={field}
        />
        <p className="text-[10.5px] text-[var(--ink-4)] mt-1.5 leading-relaxed">
          Paste straight from the content calendar. Duplicates are skipped by
          date and title, so re-importing the whole sheet is safe. Competitor
          rows feed the ideas agent as market intelligence and are never used as
          style examples — imitating a rival&apos;s voice is the opposite of the
          point.
        </p>
      </div>

      {msg && (
        <div
          className={`text-[12px] rounded-lg px-3.5 py-2.5 border ${
            msg.ok
              ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
              : "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10"
          }`}
        >
          {msg.text}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !text.trim()}
        className="text-[12px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
      >
        {busy ? "Importing…" : "Import"}
      </button>
    </div>
  );
}

function AddArticle({
  clientRef,
  campaignId,
  onAdded,
}: {
  clientRef: string;
  campaignId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [publishedAt, setPublishedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [publication, setPublication] = useState("openpr");
  const [keywords, setKeywords] = useState("");
  const [angle, setAngle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(fetchFromUrl: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/clients/${clientRef}/archive?campaign=${campaignId}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url,
            title,
            publishedAt,
            publication,
            angle,
            keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
            body: fetchFromUrl ? "" : body,
            fetchFromUrl,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Could not save." });
        return;
      }
      setMsg({
        ok: true,
        text: data.hasBody
          ? "Saved with full text — the writer can learn from it."
          : "Saved. Without the text it can only prevent repetition, not teach voice.",
      });
      setUrl("");
      setTitle("");
      setBody("");
      setKeywords("");
      setAngle("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap"
      >
        Add published article
      </button>
    );
  }

  return (
    <div className="card p-5 space-y-4 w-full">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm">Add a published article</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          Close
        </button>
      </div>

      <div>
        <label className={label} htmlFor="a-url">
          Published URL
        </label>
        <div className="flex gap-2">
          <input
            id="a-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.openpr.com/news/…"
            className={field}
          />
          <button
            onClick={() => submit(true)}
            disabled={busy || !url}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-40 whitespace-nowrap transition-colors"
          >
            {busy ? "Reading…" : "Fetch text"}
          </button>
        </div>
        <p className="text-[10.5px] text-[var(--ink-4)] mt-1.5">
          Fetch pulls the article text off the page. Some wires render with
          JavaScript or sit behind a wall — paste the text below when that
          happens.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="a-title">
            Title
          </label>
          <input
            id="a-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="a-date">
            Published
          </label>
          <input
            id="a-date"
            type="date"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="a-pub">
            Wire
          </label>
          <select
            id="a-pub"
            value={publication}
            onChange={(e) => setPublication(e.target.value)}
            className={field}
          >
            {PUBLICATION_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="a-kw">
            Keywords
          </label>
          <input
            id="a-kw"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="crypto news, xrp price prediction"
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="a-angle">
            Angle
          </label>
          <input
            id="a-angle"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="XRP · Bitcoin · Competitor listicle"
            className={field}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="a-body">
            Article text
          </label>
          <textarea
            id="a-body"
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Paste the full published article here…"
            className={field}
          />
          <p className="text-[10.5px] text-[var(--ink-4)] mt-1.5">
            This is the part that teaches voice. Without it the row still blocks
            repetition, but the writer has nothing to imitate.
          </p>
        </div>
      </div>

      {msg && (
        <div
          className={`text-[12px] rounded-lg px-3.5 py-2.5 border ${
            msg.ok
              ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
              : "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10"
          }`}
        >
          {msg.text}
        </div>
      )}

      <button
        onClick={() => submit(false)}
        disabled={busy || !title}
        className="text-[12px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
      >
        {busy ? "Saving…" : "Save to archive"}
      </button>
    </div>
  );
}

export default function ArchivePage() {
  const { ref } = useParams<{ ref: string }>();
  const { selected, campaigns } = useCampaign();
  const campaignId = selected?.id ?? campaigns[0]?.id ?? "";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!campaignId) return;
    const res = await fetch(
      `/api/clients/${ref}/archive?campaign=${campaignId}`
    );
    setRows(res.ok ? await res.json() : []);
  }, [ref, campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const all = rows ?? [];
  const withText = all.filter((a) => a.hasBody);

  const keywords = useMemo(() => {
    const map = new Map<string, { count: number; last: string }>();
    all.forEach((a) =>
      a.keywords.forEach((k) => {
        const key = k.toLowerCase();
        const seen = map.get(key);
        if (seen) {
          seen.count++;
          if (a.publishedAt > seen.last) seen.last = a.publishedAt;
        } else map.set(key, { count: 1, last: a.publishedAt });
      })
    );
    return [...map.entries()]
      .map(([keyword, v]) => ({ keyword, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [all]);

  const angles = useMemo(() => {
    const map = new Map<string, number>();
    all.forEach((a) => map.set(a.angle, (map.get(a.angle) ?? 0) + 1));
    return [...map.entries()]
      .map(([angle, count]) => ({ angle, count }))
      .sort((a, b) => b.count - a.count);
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (a) =>
        a.title.toLowerCase().includes(needle) ||
        a.keywords.some((k) => k.includes(needle)) ||
        a.angle.toLowerCase().includes(needle) ||
        String(a.publication).toLowerCase().includes(needle)
    );
  }, [all, q]);

  const maxKeyword = keywords[0]?.count ?? 1;

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Published archive
          </h1>
          <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
            Everything already on a wire. It does two jobs: stops the agents
            writing the same piece twice, and — where the full text is stored —
            teaches them how Coinpresso actually writes.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <BulkImport clientRef={ref} campaignId={campaignId} onAdded={load} />
          <AddArticle clientRef={ref} campaignId={campaignId} onAdded={load} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Published", value: String(all.length) },
          {
            label: "With full text",
            value: `${withText.length} of ${all.length}`,
            tone: withText.length === 0 ? "var(--warning)" : undefined,
          },
          { label: "Distinct keywords", value: String(keywords.length) },
          {
            label: "Most-worked angle",
            value: angles[0] ? `${angles[0].angle} ×${angles[0].count}` : "—",
          },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
              {k.label}
            </div>
            <div
              className="text-lg font-extrabold mt-1.5 truncate"
              style={k.tone ? { color: k.tone } : undefined}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {withText.length === 0 && all.length > 0 && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)] leading-relaxed">
          None of these rows carry the article text yet, so the writer can only
          be told <em>about</em> the house voice rather than shown it. Import two
          or three per wire — that is where the biggest quality gain sits.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <h2 className="font-bold text-sm">Keyword coverage</h2>
            <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
              What has been targeted, how often, and when last.
            </p>
          </div>
          <div className="max-h-[340px] overflow-y-auto divide-y divide-[var(--line)]">
            {keywords.slice(0, 24).map((k) => (
              <div key={k.keyword} className="px-5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] truncate">{k.keyword}</span>
                  <span className="text-[11px] text-[var(--ink-3)] shrink-0 tabular-nums">
                    {k.count}× · {k.last.slice(5)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-[var(--bg)] mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${(k.count / maxKeyword) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <h2 className="font-bold text-sm">Angles used</h2>
            <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
              What each piece hung on. A repeat here is what makes the set look
              machine-made; a repeated asset does not.
            </p>
          </div>
          <div className="p-5 flex flex-wrap gap-2">
            {angles.map((a) => (
              <span
                key={a.angle}
                className={`text-[11.5px] px-2.5 py-1 rounded-lg border ${
                  a.count >= 6
                    ? "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]"
                    : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-2)]"
                }`}
              >
                {a.angle} <span className="opacity-60">×{a.count}</span>
              </span>
            ))}
          </div>
          <p className="px-5 pb-5 text-[11px] text-[var(--ink-3)] leading-relaxed">
            Amber marks an angle used six times or more — rest those before
            running them again.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-3 flex-wrap">
          <h2 className="font-bold text-sm">
            {filtered.length === all.length
              ? `All ${all.length} releases`
              : `${filtered.length} of ${all.length}`}
          </h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, keywords, angles, wires…"
            className="ml-auto w-full sm:w-72 bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-1.5 text-[12px] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none"
          />
        </div>

        <div className="divide-y divide-[var(--line)] max-h-[560px] overflow-y-auto">
          {rows === null && (
            <div className="px-5 py-10 text-center text-[12px] text-[var(--ink-3)]">
              Loading…
            </div>
          )}
          {filtered.map((a) => (
            <div key={a.id} className="px-5 py-3.5">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10.5px] text-[var(--ink-4)] tabular-nums">
                  {a.publishedAt}
                </span>
                <span className="text-[10.5px] text-[var(--ink-3)]">
                  {PUBLICATIONS[a.publication as keyof typeof PUBLICATIONS]
                    ?.name ?? a.publication}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]">
                  {a.angle}
                </span>
                {a.hasBody ? (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--success)]"
                    title="Full text stored — usable as a style exemplar"
                  >
                    text {a.wordCount ? `· ${a.wordCount}w` : ""}
                  </span>
                ) : (
                  <span
                    className="text-[10px] text-[var(--ink-4)]"
                    title="Metadata only — blocks repetition but cannot teach voice"
                  >
                    metadata only
                  </span>
                )}
              </div>
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[12.5px] font-medium leading-snug hover:text-[var(--accent)] transition-colors"
                >
                  {a.title}
                </a>
              ) : (
                <span className="text-[12.5px] font-medium leading-snug">
                  {a.title}
                </span>
              )}
              <div className="text-[11px] text-[var(--ink-3)] mt-1">
                {a.keywords.join(" · ")}
              </div>
            </div>
          ))}
          {rows !== null && filtered.length === 0 && (
            <div className="px-5 py-10 text-center text-[12px] text-[var(--ink-3)]">
              Nothing matches “{q}”.
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">How the agents use this</h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          Before every draft the writer is shown the twenty most recent titles
          and told not to reuse a headline construction or comparison set, and
          the reviewer treats a repeat as a major finding. Separately, where the
          full text exists, the two closest published pieces — same wire first,
          then recency, deliberately a different angle from the one being
          written — are included verbatim as examples. A rules list produces a
          piece that obeys the rules; real articles produce one that sounds like
          the client.
        </p>
      </div>
    </div>
  );
}
