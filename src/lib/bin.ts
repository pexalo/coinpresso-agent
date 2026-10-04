// ---------------------------------------------------------------------------
// The bin. Bernard, 4 Oct: "can the remove go into the bin, for at least 1
// month, and permanently delete". A removed post is hidden from the queue,
// kept for BIN_DAYS so it can be restored, then deleted for good.
// ---------------------------------------------------------------------------

import type { Run } from "./types";
import { deleteRun } from "./store";

export const BIN_DAYS = 30;

export const inBin = (r: Run) => Boolean(r.removedAt);

export function binExpiresAt(r: Run): string | null {
  if (!r.removedAt) return null;
  return new Date(Date.parse(r.removedAt) + BIN_DAYS * 86_400_000).toISOString();
}

/** Delete for good anything that has been in the bin longer than BIN_DAYS. */
export async function emptyExpired(runs: Run[], clientRef: string, now = Date.now()): Promise<Run[]> {
  const keep: Run[] = [];
  for (const r of runs) {
    const exp = binExpiresAt(r);
    if (exp && Date.parse(exp) <= now) {
      await deleteRun(r.id, clientRef);
      continue;
    }
    keep.push(r);
  }
  return keep;
}
