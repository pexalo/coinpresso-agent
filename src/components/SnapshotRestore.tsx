"use client";

import { useEffect, useState } from "react";

interface Inventory {
  root: string;
  runs: number;
  batches: number;
  archive: number;
  settings: number;
  blogSeeds: number;
  spendLog: number;
}

/**
 * Restore a data snapshot onto this installation. Renders nothing unless the
 * viewer is signed in with the Pexalo passcode — the inventory endpoint
 * returns 403 otherwise, and that is the whole visibility check.
 */
export default function SnapshotRestore() {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [visible, setVisible] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/snapshot");
    if (!res.ok) return setVisible(false);
    setInv(await res.json());
    setVisible(true);
  };

  useEffect(() => {
    load();
  }, []);

  if (!visible) return null;

  async function restore() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/snapshot${force ? "?force=1" : ""}`, {
        method: "POST",
        headers: { "content-type": "application/gzip" },
        body: await file.arrayBuffer(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed.");
      setMsg({
        ok: true,
        text: `Restored ${data.written} files from the snapshot taken ${new Date(data.exportedAt).toLocaleString()}${
          data.skipped?.length ? ` (${data.skipped.length} unsafe paths skipped)` : ""
        }. Reload any open pages.`,
      });
      setFile(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const empty = inv && inv.runs === 0 && inv.blogSeeds === 0 && inv.archive === 0;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <h2 className="font-bold text-sm">
          Data on this installation{" "}
          <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold ml-2">
            Pexalo only
          </span>
        </h2>
        <p className="text-[11.5px] text-[var(--ink-3)] mt-1 max-w-3xl">
          Move a working installation here — topics, imported archive, settings,
          finished posts. Make the file with{" "}
          <code className="text-[11px]">node scripts/export-data.mjs</code> on
          the machine that has the data. It contains credentials; delete it once
          restored.
        </p>
      </div>
      <div className="p-5 space-y-4">
        {inv && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {[
              ["Runs", inv.runs],
              ["Batches", inv.batches],
              ["Archive", inv.archive],
              ["Topics", inv.blogSeeds],
              ["Settings", inv.settings],
              ["Spend log", inv.spendLog],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg border border-[var(--line)] px-2 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">{k}</div>
                <div className="text-sm font-bold mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11.5px] text-[var(--ink-3)]">
          {empty
            ? "Empty — safe to restore."
            : "This installation already has data. Restoring overwrites files with the same names and leaves everything else."}
          {inv && (
            <span className="text-[var(--ink-4)]"> Stored at {inv.root}.</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".gz,application/gzip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[12px] text-[var(--ink-3)] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-[var(--line)] file:bg-transparent file:text-[var(--ink-2)] file:text-[12px]"
          />
          {!empty && (
            <label className="flex items-center gap-2 text-[12px] text-[var(--ink-3)]">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              Overwrite existing files
            </label>
          )}
          <button
            onClick={restore}
            disabled={!file || busy || (!empty && !force)}
            className="text-[12.5px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {busy ? "Restoring…" : "Restore snapshot"}
          </button>
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
      </div>
    </div>
  );
}
