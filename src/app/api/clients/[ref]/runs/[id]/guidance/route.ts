// ---------------------------------------------------------------------------
// An editor's note on a stuck run.
//
// A rejection tells an operator what is wrong; retrying without telling the
// writer anything new buys the same rejection at the same price. This takes
// the note and puts it where it will be read.
//
// TWO SCOPES, and the difference is real:
//
//   "run"      the note goes on this run only, and reaches the writer and the
//              reviewer on every subsequent attempt at it.
//   "standing" the note ALSO becomes a rule in the feedback store, which every
//              future run of this client reads. Same store the Style page
//              writes to, so it can be retired there later without a deploy.
//
// A standing note is still applied to this run — choosing "all future posts"
// and then finding the current one unchanged would be a trap.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { getRun, saveRun } from "@/lib/store";
import { addFeedback } from "@/lib/feedback";
import type { GuidanceNote, StageId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOTE = 4000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  if (!getClient(ref)) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  const run = await getRun(id, ref);
  if (!run) return NextResponse.json({ error: "Unknown run" }, { status: 404 });

  let body: {
    note?: string;
    scope?: "run" | "standing";
    stage?: StageId;
    rejection?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const note = (body.note ?? "").trim();
  if (!note) {
    return NextResponse.json(
      { error: "Write the note first — an empty one changes nothing." },
      { status: 400 }
    );
  }
  if (note.length > MAX_NOTE) {
    return NextResponse.json(
      { error: `That note is ${note.length} characters; the limit is ${MAX_NOTE}.` },
      { status: 400 }
    );
  }

  const standing = body.scope === "standing";
  const entry: GuidanceNote = {
    at: new Date().toISOString(),
    stage: body.stage,
    rejection: body.rejection?.slice(0, 500) || undefined,
    note,
    alsoStanding: standing || undefined,
  };
  run.guidance = [...(run.guidance ?? []), entry];
  run.updatedAt = entry.at;
  await saveRun(run);

  if (standing) {
    await addFeedback(ref, {
      source: `Editor, from a rejection on "${run.brief.title}"`,
      rule: note,
    });
  }

  return NextResponse.json({
    ok: true,
    standing,
    guidance: run.guidance,
  });
}

/** Take a note back off a run. The standing rule, if one was made, stays. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const run = await getRun(id, ref);
  if (!run) return NextResponse.json({ error: "Unknown run" }, { status: 404 });
  const at = new URL(req.url).searchParams.get("at");
  run.guidance = (run.guidance ?? []).filter((g) => g.at !== at);
  run.updatedAt = new Date().toISOString();
  await saveRun(run);
  return NextResponse.json({ ok: true, guidance: run.guidance });
}
