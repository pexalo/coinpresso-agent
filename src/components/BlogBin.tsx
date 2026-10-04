"use client";

import { useCallback, useEffect, useState } from "react";

interface BinItem {
  id: string;
  createdAt: string;
  removedAt?: string;
  binExpiresAt: string | null;
  brief: { title: string; pillar?: string };
}

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

const daysLeft = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)) : null;

/**
 * The bin. Removed posts sit here for 30 days — restorable — then are deleted
 * for good. "Delete forever" skips the wait; it is a two-click action.
 * `refreshKey` changes whenever the queue removes something, so a post that
 * was just removed appears here without a reload.
 */
export default function BlogBin({ clientRef, refreshKey, onRestored }: {
  clientRef: string;
  refreshKey: number;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<BinItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientRef}/runs?bin=1`);
    if (!res.ok) return;
    const d: Array<BinItem & { track?: string }> = await res.json();
    setItems(d.filter((r) => r.track === "blog").sort((a, b) => (b.removedAt ?? "").localeCompare(a.removedAt ?? "")));
  }, [clientRef]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function restore(id: string) {
    setBusy(id); setMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${id}?action=restore`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Restore failed (${res.status})`);
      setItems((xs) => xs.filter((x) => x.id !== id));
      setMsg(`Restored "${d.title}" to the queue.`);
      onRestored();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Restore failed");
    } finally { setBusy(null); }
  }

  async function deleteForever(id: string) {
    setBusy(id); setMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${id}?permanent=1`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Delete failed (${res.status})`);
      setItems((xs) => xs.filter((x) => x.id !== id));
      setMsg(`Deleted "${d.title ?? "the post"}" for good.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    } finally { setBusy(null); setConfirmDelete(null); }
  }

  return (
    <div className="card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[13px] font-bold">Bin ({items.length})</span>
        <span className="text-[12px] text-[var(--ink-3)]">
          Removed posts are kept 30 days, then deleted for good · {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--line)]">
          {msg && <div className="px-4 py-2 text-[12px] text-[var(--ink-2)]">{msg}</div>}
          {items.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-[var(--ink-3)]">The bin is empty.</div>
          )}
          {items.map((r) => {
            const left = daysLeft(r.binExpiresAt);
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 first:border-t-0">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{r.brief.title}</div>
                  <div className="text-[11px] text-[var(--ink-3)]">
                    Removed {day(r.removedAt)} · deleted for good on {day(r.binExpiresAt)}
                    {left !== null && ` (${left} day${left === 1 ? "" : "s"} left)`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => restore(r.id)}
                    disabled={busy === r.id}
                    className="rounded border border-[var(--line)] px-2 py-1 text-[11px] font-semibold"
                  >
                    {busy === r.id && confirmDelete !== r.id ? "Restoring…" : "Restore"}
                  </button>
                  {confirmDelete === r.id ? (
                    <>
                      <button
                        onClick={() => deleteForever(r.id)}
                        disabled={busy === r.id}
                        className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        {busy === r.id ? "Deleting…" : "Delete forever"}
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-[11px] text-[var(--ink-3)]">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(r.id)}
                      className="px-2 py-1 text-[11px] text-red-600"
                    >
                      Delete forever
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
