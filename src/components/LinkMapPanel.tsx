"use client";

// ---------------------------------------------------------------------------
// Paste the client's internal-link map.
//
// Liam asked for a way to feed the agent "our meta mapping file so it knows
// all our internal links, anchors, and desired pages". This is that way: paste
// the sheet as CSV or tab-separated text, see what was understood, save.
// The writer reads it on the next run — no deploy.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

interface Page {
  url: string;
  topic: string;
  anchors: string[];
}

export default function LinkMapPanel({ clientRef }: { clientRef: string }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [source, setSource] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/clients/${clientRef}/link-map`)
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages ?? []);
        setUpdatedAt(d.updatedAt ?? "");
        setSource(d.source ?? "");
      })
      .catch(() => {});
  }, [clientRef]);

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    setSkipped([]);
    try {
      const res = await fetch(`/api/clients/${clientRef}/link-map`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, source: source || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error ?? `Import failed (${res.status})`);
        setSkipped(d.skipped ?? []);
        return;
      }
      setPages(d.pages);
      setUpdatedAt(d.updatedAt);
      setSkipped(d.skipped ?? []);
      setCsv("");
      const anchors = d.pages.reduce((n: number, p: Page) => n + p.anchors.length, 0);
      setMsg(`Saved ${d.pages.length} pages with ${anchors} anchor phrases. The writer uses them from the next run.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await fetch(`/api/clients/${clientRef}/link-map`, { method: "DELETE" });
      setPages([]);
      setUpdatedAt("");
      setMsg("Cleared. The writer is back on the built-in page list.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-[12px] text-[var(--ink-2)] leading-relaxed">
        {pages.length ? (
          <>
            <span className="font-semibold text-[var(--ink)]">{pages.length} pages</span> on file
            {source ? ` — ${source}` : ""}
            {updatedAt ? `, ${updatedAt.slice(0, 10)}` : ""}. The built-in list of 36 is
            still underneath; where both know a page, this wins.
          </>
        ) : (
          <>
            Nothing imported yet. The writer is working from the built-in list of
            36 pages with one phrase each — which is why every post reaches for
            the same few. Paste the meta mapping sheet below.
          </>
        )}
      </div>

      {pages.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-[var(--ink-3)] hover:text-[var(--ink)]">
            Show the pages
          </summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-[var(--line)] divide-y divide-[var(--line)]">
            {pages.map((p) => (
              <div key={p.url} className="px-3 py-2">
                <div className="font-mono text-[11px] text-[var(--ink-3)] truncate">
                  {p.url.replace("https://coinpresso.io", "")}
                </div>
                <div className="text-[12px] text-[var(--ink)]">
                  {p.anchors.length ? p.anchors.join(" · ") : p.topic}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-1">
          Paste the sheet — CSV or copied straight from Google Sheets
        </span>
        <textarea
          id="link-map-csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          placeholder={"URL,Primary anchor,Secondary anchors\nhttps://coinpresso.io/crypto-ppc-marketing,crypto PPC,PPC agency | paid crypto ads\n/crypto-google-ads,crypto Google Ads,Google Ads for crypto"}
          className="w-full font-mono text-[12px] px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] outline-none focus:border-[var(--accent)]/60 leading-relaxed resize-y"
        />
        <span className="block text-[11px] text-[var(--ink-3)] mt-1 leading-relaxed">
          Header row first. One column named url / page / link; any columns named
          anchor, keyword, topic, title or h1 become the phrases the writer may
          use for that page. Several phrases in one cell separated by <code>|</code>.
          Rows without a coinpresso.io URL are skipped and listed.
        </span>
      </label>

      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-1">
            Where it came from
          </span>
          <input
            id="link-map-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Liam's meta mapping sheet, Sep 2026"
            className="w-full text-[12.5px] px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] outline-none focus:border-[var(--accent)]/60"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={busy || !csv.trim()}
            className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Import"}
          </button>
          {pages.length > 0 && (
            <button
              onClick={clear}
              disabled={busy}
              className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--danger)]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {msg && <p className="text-[12px] text-[var(--ink-2)]">{msg}</p>}
      {err && <p className="text-[12px] text-[var(--danger)]">{err}</p>}
      {skipped.length > 0 && (
        <p className="text-[11px] text-[var(--warning)] leading-relaxed">
          {skipped.length} row{skipped.length === 1 ? "" : "s"} skipped (no coinpresso.io URL):{" "}
          {skipped.slice(0, 3).map((r) => `"${r}"`).join(", ")}
          {skipped.length > 3 ? "…" : ""}
        </p>
      )}
    </div>
  );
}
