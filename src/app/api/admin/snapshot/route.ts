// ---------------------------------------------------------------------------
// Restore a data snapshot made by scripts/export-data.mjs.
//
// Why this exists: the working installation on Bernard's laptop holds 80
// imported topics, the coinpresso.io archive, the client's settings and the
// first finished posts. A fresh Railway volume holds nothing. This is how one
// becomes the other without re-running every import by hand.
//
// GUARDS, in order, because each one has a story:
//   - admin only. The proxy already requires a login; this additionally
//     requires the Pexalo role. A client passcode must not be able to
//     overwrite the whole data directory.
//   - paths are confined to the data root. A snapshot is a file someone
//     uploaded; "../.env.local" in it must land nowhere.
//   - refuses when the target already holds runs, unless ?force=1. The
//     default protects a live installation from a stale snapshot; force is
//     for the deliberate case.
//
// GET reports what the target currently holds, so the Settings page can say
// "empty — safe to restore" or "already has 12 runs" before anyone clicks.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { dataRoot } from "@/lib/data-dir";
import { isAdmin } from "@/lib/portal-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Snapshot {
  version: number;
  exportedAt: string;
  files: Array<{ path: string; b64: string }>;
}

async function countIn(dir: string): Promise<number> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(".json") || f.endsWith(".jsonl")).length;
  } catch {
    return 0;
  }
}

async function inventory() {
  const root = dataRoot();
  return {
    root,
    runs: await countIn(path.join(root, "runs")),
    batches: await countIn(path.join(root, "batches")),
    archive: await countIn(path.join(root, "archive")),
    settings: await countIn(path.join(root, "settings")),
    blogSeeds: await countIn(path.join(root, "blog-seeds")),
    spendLog: await countIn(path.join(root, "spend-log")),
  };
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Pexalo sign-in required." }, { status: 403 });
  }
  return NextResponse.json(await inventory());
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Pexalo sign-in required." }, { status: 403 });
  }
  const force = new URL(req.url).searchParams.get("force") === "1";
  const before = await inventory();
  if (before.runs > 0 && !force) {
    return NextResponse.json(
      {
        error: `This installation already holds ${before.runs} run${before.runs === 1 ? "" : "s"}. Restoring would overwrite files with the same names. Tick "overwrite" to do it anyway.`,
      },
      { status: 409 }
    );
  }

  let snap: Snapshot;
  try {
    const raw = Buffer.from(await req.arrayBuffer());
    const json = zlib.gunzipSync(raw).toString("utf8");
    snap = JSON.parse(json) as Snapshot;
    if (snap.version !== 1 || !Array.isArray(snap.files)) throw new Error("wrong shape");
  } catch {
    return NextResponse.json(
      { error: "That is not a snapshot made by scripts/export-data.mjs." },
      { status: 400 }
    );
  }

  const root = path.resolve(dataRoot());
  let written = 0;
  const skipped: string[] = [];
  for (const f of snap.files) {
    const target = path.resolve(root, f.path);
    // Confinement: the resolved path must sit strictly inside the data root.
    if (!target.startsWith(root + path.sep)) {
      skipped.push(f.path);
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(f.b64, "base64"));
    written++;
  }

  return NextResponse.json({
    ok: true,
    written,
    skipped,
    exportedAt: snap.exportedAt,
    after: await inventory(),
  });
}
