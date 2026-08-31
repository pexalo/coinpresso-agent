// ---------------------------------------------------------------------------
// Where the file-backed stores live.
//
// THIS MATTERS ON RAILWAY, and it is the single easiest way to lose everything
// this app has produced.
//
// A Railway container's filesystem is EPHEMERAL. It is rebuilt on every deploy
// and can be replaced at any time. Runs, batches, the published archive, the
// campaign fact sheets and the settings — including the Telegram token and the
// WordPress application password — all live under `.data/`, so on a default
// Railway deployment every one of them is wiped by the next `git push`.
//
// The failure is quiet, which is what makes it dangerous: the app comes back
// up, the dashboard renders, and the queue is simply empty. Nobody gets an
// error to search for.
//
// So the path is configurable, and the deployment mounts a persistent volume at
// it. `DATA_DIR=/data` plus a Railway volume on /data is the whole fix. Locally
// the default keeps the existing behaviour, so nothing changes on a Mac.
//
// The real answer is Postgres — the store interfaces are deliberately narrow
// (get, list, save) so swapping the backing store touches five files. A volume
// is the correct step until then, not a substitute for it.
// ---------------------------------------------------------------------------

import path from "node:path";

/** Root for every file-backed store. Override with DATA_DIR in deployment. */
export function dataRoot(): string {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), ".data");
}

export function dataDir(...segments: string[]): string {
  return path.join(dataRoot(), ...segments);
}

/**
 * True when the app is storing state somewhere a redeploy will destroy.
 *
 * Reported by /api/health rather than only documented, because a warning in a
 * README is read once and an endpoint can be checked after every deploy.
 */
export function storageIsEphemeral(): boolean {
  // Railway sets RAILWAY_ENVIRONMENT on every service it runs.
  const onRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
  );
  return onRailway && !process.env.DATA_DIR?.trim();
}
