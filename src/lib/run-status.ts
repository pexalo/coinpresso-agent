// ---------------------------------------------------------------------------
// What a run's status should SAY, as opposed to what it is called internally.
//
// "failed" covers two situations that are nothing alike, and showing the same
// red "Failed" for both cost a real afternoon: three articles were written,
// link-checked, and then stopped at a one-cent review call because an OpenAI
// balance had run out. They read on the queue exactly like runs that produced
// nothing, so they looked like three lost articles rather than three finished
// ones waiting on a top-up.
//
// The distinguishing fact is simply whether a draft exists. A run that has one
// has already spent the money that matters — research and writing are ~95% of
// the cost — and what remains is a cheap retry, not a rewrite. The label should
// say so, and it should not be red, because red means "this needs rescuing"
// and this needs a click.
// ---------------------------------------------------------------------------

import type { RunStatus } from "./types";

export type StatusTone = "neutral" | "accent" | "warning" | "success" | "danger";

export interface StatusView {
  label: string;
  tone: StatusTone;
  /** The fuller explanation, for a run's own page. */
  detail?: string;
}

export function statusView(status: RunStatus, hasDraft: boolean): StatusView {
  if (status === "failed") {
    return hasDraft
      ? {
          label: "Draft ready · unreviewed",
          tone: "warning",
          detail:
            "The article was written and its citations were checked. A later stage did not finish, so it has not been reviewed and cannot be approved yet. Retry from where it failed — the research and the writing are already paid for, and only the remaining stage is charged again.",
        }
      : {
          label: "Failed",
          tone: "danger",
          detail:
            "The run stopped before an article was produced. The stage that failed is in the timeline, with what it reported.",
        };
  }
  const map: Record<Exclude<RunStatus, "failed">, StatusView> = {
    queued: { label: "Queued", tone: "neutral" },
    running: { label: "Running", tone: "accent" },
    needs_review: { label: "Ready to read", tone: "warning" },
    approved: { label: "Approved", tone: "success" },
  };
  return map[status as Exclude<RunStatus, "failed">] ?? { label: status, tone: "neutral" };
}

/** Pill classes per tone, so the queue and the run page cannot drift apart. */
export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "text-[var(--ink-3)] border-[var(--line)] bg-[var(--surface)]",
  accent: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
  warning: "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
  success: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
  danger: "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10",
};
