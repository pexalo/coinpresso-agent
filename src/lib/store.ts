// ---------------------------------------------------------------------------
// Run store. File-backed JSON under .data/ so a prototype survives a dev-server
// restart without needing a database.
//
// In Pexalo HQ this becomes a `runs` table. The interface is deliberately narrow
// — get, list, save — so swapping the backing store touches only this file.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import type { Run } from "./types";

const DIR = path.join(process.cwd(), ".data", "runs");

async function ensure(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
}

export function newRunId(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 7);
  return `run_${stamp}_${rand}`;
}

export async function saveRun(run: Run): Promise<void> {
  await ensure();
  run.updatedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(DIR, `${run.id}.json`),
    JSON.stringify(run, null, 2),
    "utf8"
  );
}

/**
 * Pass clientRef to assert ownership. A run id alone is not authorisation — if
 * the id belongs to another client this returns null rather than the run.
 */
export async function getRun(
  id: string,
  clientRef?: string
): Promise<Run | null> {
  try {
    const raw = await fs.readFile(path.join(DIR, `${id}.json`), "utf8");
    const run = JSON.parse(raw) as Run;
    if (clientRef && run.clientRef !== clientRef) return null;
    return run;
  } catch {
    return null;
  }
}

/**
 * Always scoped by client. In HQ this is a WHERE clause; here it is a filter.
 * Either way, nothing in the app should ever read runs across clients — a
 * cross-client leak in a multi-tenant dashboard is the one bug you cannot
 * apologise your way out of.
 */
export async function listRuns(clientRef: string): Promise<Run[]> {
  await ensure();
  const files = await fs.readdir(DIR);
  const runs: Run[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const run = JSON.parse(
        await fs.readFile(path.join(DIR, f), "utf8")
      ) as Run;
      if (run.clientRef === clientRef) runs.push(run);
    } catch {
      // A half-written file during a crash should not take the list down.
    }
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
