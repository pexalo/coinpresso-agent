"use client";

import { useCallback, useEffect, useState } from "react";
import type { Approver, GateState, Signature } from "@/lib/approval";

/**
 * The three signatures a piece needs before it can leave.
 *
 * Two things this panel has to communicate that a progress bar would not:
 *
 *   WHOSE approval is missing, by name. "2 of 3" tells you nothing about who to
 *   go and ask.
 *
 *   That a signature can go STALE. When a draft is revised after someone signs,
 *   their approval stops counting — and if that were shown as simply "not
 *   signed" it would look like they never looked at it, and they would be chased
 *   for something they already did. Stale signatures are shown, struck through,
 *   with the date, so the state reads as "Kat approved the previous version"
 *   rather than "Kat has not approved".
 *
 * Identity is picked from a dropdown here because there is no auth yet. That is
 * a real weakness and the panel says so rather than implying the record is
 * stronger than it is — in HQ this comes from the session and the picker goes.
 */
export default function ApprovalGate({
  clientRef,
  runId,
  onGate,
}: {
  clientRef: string;
  runId: string;
  /** Lets the page enable or disable its own release button from one source. */
  onGate?: (gate: GateState) => void;
}) {
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [gate, setGate] = useState<GateState | null>(null);
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/approval`);
    if (!res.ok) return;
    const data = await res.json();
    setApprovers(data.approvers ?? []);
    setGate(data.gate ?? null);
    if (data.gate) onGate?.(data.gate);
    setWho((w) => w || data.approvers?.[0]?.id || "");
  }, [clientRef, runId, onGate]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: "sign" | "reject" | "withdraw") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clients/${clientRef}/runs/${runId}/approval`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ approverId: who, action, note, reason }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That did not go through.");
      setGate(data.gate);
      onGate?.(data.gate);
      setNote("");
      setReason("");
      setRejecting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!gate) return null;

  const signedIds = new Set(gate.valid.map((s) => s.approverId));
  const staleFor = (id: string): Signature | undefined =>
    gate.stale
      .filter((s) => s.approverId === id)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
  const mine = signedIds.has(who);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-bold text-sm">Approval</h2>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            gate.released
              ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
              : gate.blocking
                ? "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10"
                : gate.canRelease
                  ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
                  : "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10"
          }`}
        >
          {gate.released
            ? "Released"
            : `${gate.valid.length} of ${gate.required} signed`}
        </span>
        <span className="text-[11px] text-[var(--ink-4)]">
          draft {gate.fingerprint}
        </span>
      </div>

      <p
        className={`text-[12px] leading-relaxed ${
          gate.blocking ? "text-[var(--danger)]" : "text-[var(--ink-3)]"
        }`}
      >
        {gate.reason}
      </p>

      <div className="space-y-1.5">
        {approvers.map((a) => {
          const sig = gate.valid.find((s) => s.approverId === a.id);
          const old = staleFor(a.id);
          return (
            <div
              key={a.id}
              className="flex items-start gap-2.5 py-2 border-b border-[var(--line)] last:border-0"
            >
              <span
                className={`w-4 h-4 mt-0.5 shrink-0 rounded-full border flex items-center justify-center ${
                  sig
                    ? "bg-[var(--success)] border-[var(--success)]"
                    : "border-[var(--line)]"
                }`}
              >
                {sig && (
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

              {/* NAME AND STATUS SHARE A LINE; THE ROLE SITS UNDER THEM.
                  They used to be three columns with the status set shrink-0
                  and the role flex-1, which is fine while the status reads
                  "waiting" and breaks the moment it reads "signed 2026-08-29 —
                  draft changed": the role is squeezed to a few characters wide,
                  wraps one word per line and collides with the date. That state
                  is exactly the one worth reading carefully, so it is the one
                  that has to survive a narrow panel. */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                  <span className="text-[12.5px] font-semibold">{a.name}</span>

                  {sig ? (
                    <span className="text-[11px] text-[var(--success)]">
                      signed {sig.at.slice(0, 10)}
                    </span>
                  ) : old ? (
                    <span
                      className="text-[11px] text-[var(--warning)]"
                      title="Signed an earlier version. The draft has changed since, so this no longer counts."
                    >
                      <s className="text-[var(--ink-4)]">
                        signed {old.at.slice(0, 10)}
                      </s>{" "}
                      — draft changed since
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--ink-4)]">
                      waiting
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-[var(--ink-3)] leading-snug mt-0.5">
                  {a.role}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {gate.valid.some((s) => s.note) && (
        <div className="space-y-1">
          {gate.valid
            .filter((s) => s.note)
            .map((s) => (
              <p key={s.approverId} className="text-[11.5px] text-[var(--ink-2)]">
                <span className="font-semibold">{s.name}:</span> {s.note}
              </p>
            ))}
        </div>
      )}

      {!gate.released && (
        <div className="pt-1 space-y-2.5 border-t border-[var(--line)]">
          <div className="flex items-center gap-2 flex-wrap pt-3">
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-[12.5px] focus:border-[var(--accent)] outline-none"
            >
              {approvers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            {mine ? (
              <button
                onClick={() => act("withdraw")}
                disabled={busy}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--danger)]/50 disabled:opacity-40 transition-colors"
              >
                Withdraw my approval
              </button>
            ) : (
              <>
                <button
                  onClick={() => act("sign")}
                  disabled={busy}
                  className="text-[12.5px] font-semibold px-4 py-2 rounded-lg bg-[var(--success)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  Approve as {approvers.find((a) => a.id === who)?.name}
                </button>
                <button
                  onClick={() => setRejecting((r) => !r)}
                  disabled={busy}
                  className="text-[12.5px] font-semibold px-4 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--danger)]/50 disabled:opacity-40 transition-colors"
                >
                  Send back
                </button>
              </>
            )}
          </div>

          {!mine && !rejecting && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note with your approval (optional)"
              className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-[12.5px] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
            />
          )}

          {rejecting && (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="What is wrong with it? The writer works from this."
                className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-[12.5px] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors resize-y"
              />
              <button
                onClick={() => act("reject")}
                disabled={busy || !reason.trim()}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-lg bg-[var(--danger)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Send it back
              </button>
              <p className="text-[11px] text-[var(--ink-4)]">
                This blocks release outright — the other two approving does not
                overrule it. It clears when the draft changes, and everyone signs
                again on the new version.
              </p>
            </div>
          )}

          {error && (
            <p className="text-[12px] text-[var(--danger)]">{error}</p>
          )}

          <p className="text-[11px] text-[var(--ink-4)] leading-relaxed">
            Names are picked from a list because this prototype has no login, so
            a signature proves someone chose a name — not that they were that
            person. Wired to the session user, the same record becomes evidence.
          </p>
        </div>
      )}
    </div>
  );
}
