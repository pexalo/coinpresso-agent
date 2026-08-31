import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { getRun, listRuns } from "@/lib/store";
import { getRecord, getRecords, saveRecord } from "@/lib/approval-store";
import { gateConfig, readSettings } from "@/lib/settings";
import { fingerprint, gateState, sign, type GateState } from "@/lib/approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gate state for many runs at once, and one person signing a set of them.
 *
 * The blog runs five to eight posts a day and each needs three signatures. Per
 * post that is twenty-four sign-offs a day, which does not stay careful — it
 * decays into clicking through. So a reviewer reads the day and signs the set in
 * one action, while the RECORD stays per post: each piece keeps its own
 * signatures against its own fingerprint, so revising one post tomorrow voids
 * only that post's approvals.
 *
 * Signing a set is not signing blind. The set is what was read; the per-post
 * record is what is provable. Both are true, and only the second one has to
 * survive being questioned a year later.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!getClient(ref)) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  const url = new URL(req.url);
  const track = url.searchParams.get("track");
  const idsParam = url.searchParams.get("ids");

  const runs = idsParam
    ? (
        await Promise.all(idsParam.split(",").map((id) => getRun(id.trim(), ref)))
      ).filter((r) => r !== null)
    : (await listRuns(ref)).filter((r) => !track || r.brief.track === track);

  const settings = await readSettings(ref);
  const { approvers, required } = gateConfig(settings);

  // listRuns returns summaries without the draft body, so the fingerprint has to
  // come from the full record. Only fetched for runs that have reached a draft.
  const gates: Record<string, GateState> = {};
  const records = await getRecords(
    ref,
    runs.map((r) => r.id)
  );
  for (const summary of runs) {
    const full = await getRun(summary.id, ref);
    if (!full) continue;
    gates[summary.id] = gateState(
      records[summary.id],
      approvers,
      required,
      fingerprint(full),
      Boolean(full.draft)
    );
  }

  return NextResponse.json({ approvers, required, gates });
}

interface BulkBody {
  runIds?: string[];
  approverId?: string;
  note?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!getClient(ref)) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: BulkBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const settings = await readSettings(ref);
  const { approvers, required } = gateConfig(settings);
  const approver = approvers.find((a) => a.id === body.approverId);
  if (!approver) {
    return NextResponse.json(
      { error: "Not one of this client's approvers." },
      { status: 400 }
    );
  }

  const ids = (body.runIds ?? []).slice(0, 50);
  const gates: Record<string, GateState> = {};
  const skipped: Array<{ id: string; why: string }> = [];

  // Bulk signing is NOT bulk releasing. Each piece still needs its full set of
  // signatures, and release stays a separate per-run action — so one person
  // cannot move a day from written to published in a single click.
  for (const id of ids) {
    const run = await getRun(id, ref);
    if (!run) {
      skipped.push({ id, why: "not found" });
      continue;
    }
    if (!run.draft) {
      skipped.push({ id, why: "no draft yet" });
      continue;
    }
    const record = await getRecord(ref, id);
    if (record.releasedAt) {
      skipped.push({ id, why: "already released" });
      continue;
    }
    const fp = fingerprint(run);
    const next = sign(record, approver, fp, body.note);
    await saveRecord(ref, next, {
      action: "sign",
      approverId: approver.id,
      name: approver.name,
      fingerprint: fp,
      bulk: true,
      note: body.note,
    });
    gates[id] = gateState(next, approvers, required, fp, true);
  }

  return NextResponse.json({
    signed: Object.keys(gates).length,
    skipped,
    gates,
  });
}
