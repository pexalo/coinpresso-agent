import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { getRun } from "@/lib/store";
import { getRecord, history, saveRecord } from "@/lib/approval-store";
import { gateConfig, readSettings } from "@/lib/settings";
import { fingerprint, gateState, reject, sign, withdraw } from "@/lib/approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One signature, given or withdrawn.
 *
 * The fingerprint is computed HERE from the stored run, never accepted from the
 * request. A client that could name the version it was signing could sign a
 * draft it had not been shown — which is the one thing this gate exists to make
 * impossible.
 */
async function load(ref: string, id: string) {
  const client = getClient(ref);
  if (!client) return null;
  const run = await getRun(id, ref);
  if (!run) return null;
  const settings = await readSettings(ref);
  const { approvers, required } = gateConfig(settings);
  const record = await getRecord(ref, id);
  const fp = fingerprint(run);
  return { run, approvers, required, record, fp };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const ctx = await load(ref, id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    approvers: ctx.approvers,
    gate: gateState(
      ctx.record,
      ctx.approvers,
      ctx.required,
      ctx.fp,
      Boolean(ctx.run.draft)
    ),
    record: ctx.record,
    history: await history(ref, id),
  });
}

interface Body {
  approverId?: string;
  action?: "sign" | "reject" | "withdraw";
  note?: string;
  reason?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const ctx = await load(ref, id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const approver = ctx.approvers.find((a) => a.id === body.approverId);
  if (!approver) {
    return NextResponse.json(
      { error: "Not one of this client's approvers." },
      { status: 400 }
    );
  }

  if (!ctx.run.draft) {
    return NextResponse.json(
      { error: "There is no draft to approve yet." },
      { status: 409 }
    );
  }

  // Signing a released piece would produce a record implying it was approved
  // before it went out. It was not, and the log has to stay true.
  if (ctx.record.releasedAt) {
    return NextResponse.json(
      {
        error: `This was already released on ${ctx.record.releasedAt.slice(0, 10)}. Approvals cannot be changed after release.`,
      },
      { status: 409 }
    );
  }

  let next = ctx.record;
  if (body.action === "reject") {
    const reason = (body.reason ?? "").trim();
    if (!reason) {
      return NextResponse.json(
        { error: "Say what is wrong with it — a rejection with no reason cannot be acted on." },
        { status: 400 }
      );
    }
    next = reject(ctx.record, approver, ctx.fp, reason);
  } else if (body.action === "withdraw") {
    next = withdraw(ctx.record, approver.id, ctx.fp);
  } else {
    next = sign(ctx.record, approver, ctx.fp, body.note);
  }

  await saveRecord(ref, next, {
    action: body.action ?? "sign",
    approverId: approver.id,
    name: approver.name,
    fingerprint: ctx.fp,
    note: body.note,
    reason: body.reason,
  });

  return NextResponse.json({
    gate: gateState(next, ctx.approvers, ctx.required, ctx.fp, true),
    record: next,
  });
}
