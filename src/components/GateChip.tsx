"use client";

import type { GateState } from "@/lib/approval";

/**
 * How far through the gate one piece is, small enough to sit in a queue row.
 *
 * Shown on every row that has a draft, including the ones with no signatures
 * yet. A chip that appeared only once someone had signed would make "nobody has
 * looked at this" and "this has no gate" look identical, and the first of those
 * is the one worth seeing in a list of twenty.
 */
export default function GateChip({ gate }: { gate?: GateState }) {
  if (!gate) return null;

  if (gate.released) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10">
        released
      </span>
    );
  }

  if (gate.blocking) {
    return (
      <span
        title={`${gate.blocking.name}: ${gate.blocking.reason}`}
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10"
      >
        sent back
      </span>
    );
  }

  const done = gate.valid.length;
  const ready = done >= gate.required;

  return (
    <span
      title={
        ready
          ? "Signed by everyone required. Ready to release."
          : `Waiting on ${gate.outstanding.map((a) => a.name).join(", ")}`
      }
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
        ready
          ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
          : "text-[var(--ink-3)] border-[var(--line)]"
      }`}
    >
      {done}/{gate.required} signed
    </span>
  );
}
