"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Which report you are looking at, and where it goes.
 *
 * The two questions belong together, and before this they were answered in two
 * different places: the campaign was tabs on this page (shown only once a
 * second campaign had reports), and the recipient was a field buried in
 * Settings that the person sending the report had probably never opened. The
 * dangerous combination is a report on screen and no idea which chat the send
 * button feeds — so the bar states the destination next to the selector, in
 * words: "goes to the Moonberg chat" or "no chat configured — it will not be
 * sent anywhere".
 *
 * The send here is the same strict route as everywhere else: this campaign's
 * configured chat or nothing. The button never falls back, and when there is no
 * chat it does not disable silently — it says why and links to where the chat
 * is set, because a disabled button with no explanation is a support message to
 * Bernard.
 */
export default function ReportDeliveryBar({
  clientRef,
  campaigns,
  selectedId,
  hasReport,
}: {
  clientRef: string;
  campaigns: Array<{ id: string; name: string; ticker: string; hasReports: boolean }>;
  selectedId: string;
  hasReport: boolean;
}) {
  const router = useRouter();
  const [chats, setChats] = useState<Record<string, string> | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(
    null
  );

  useEffect(() => {
    let alive = true;
    fetch(`/api/clients/${clientRef}/settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setChats(d?.delivery?.telegram?.campaignChats ?? {});
      })
      .catch(() => alive && setChats({}));
    return () => {
      alive = false;
    };
  }, [clientRef]);

  const selected = campaigns.find((c) => c.id === selectedId);
  const chat = chats?.[selectedId]?.trim() ?? "";

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/settings/test-telegram`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId: selectedId }),
      });
      const data = await res.json();
      setResult({
        ok: Boolean(data.ok),
        detail: data.detail ?? data.error ?? "No response.",
      });
    } catch (e) {
      setResult({ ok: false, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
        <label className="flex items-center gap-2.5">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
            Report for
          </span>
          <select
            value={selectedId}
            onChange={(e) =>
              router.push(`/client/${clientRef}/daily-report?campaign=${e.target.value}`)
            }
            className="bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-[13px] font-semibold focus:border-[var(--accent)] outline-none"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.ticker}
                {c.hasReports ? "" : " — no reports yet"}
              </option>
            ))}
          </select>
        </label>

        {/* The destination, stated where the send happens. */}
        {chats === null ? (
          <span className="text-[11.5px] text-[var(--ink-4)]">
            Checking delivery…
          </span>
        ) : chat ? (
          <span className="text-[11.5px] text-[var(--ink-3)]">
            Goes to the{" "}
            <span className="font-semibold text-[var(--ink)]">
              {selected?.name}
            </span>{" "}
            Telegram chat{" "}
            <span className="text-[var(--ink-4)]">({chat})</span> — and only
            there.
          </span>
        ) : (
          <span className="text-[11.5px] text-[var(--warning)]">
            No Telegram chat configured for {selected?.name} — this report is
            not sent anywhere until one is.{" "}
            <Link
              href={`/client/${clientRef}/settings`}
              className="font-semibold underline underline-offset-2"
            >
              Set it in Settings
            </Link>
          </span>
        )}

        <button
          onClick={send}
          disabled={sending || !chat || !hasReport}
          title={
            !hasReport
              ? "No report for this campaign yet"
              : !chat
                ? "Configure this campaign's chat first — there is no fallback"
                : `Sends this report to the ${selected?.name} chat`
          }
          className="ml-auto text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? "Sending…" : `Send to ${selected?.name ?? "chat"}`}
        </button>
      </div>

      {result && (
        <p
          className={`text-[11.5px] ${result.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {result.ok ? "Delivered. " : ""}
          {result.detail}
        </p>
      )}
    </div>
  );
}
