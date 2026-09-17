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
    /** One note, or several — the fix box sends one per fault it found. */
    note?: string;
    notes?: Array<{ note?: string; scope?: "run" | "standing" }>;
    scope?: "run" | "standing";
    stage?: StageId;
    rejection?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  // A rejection now names every fault at once, so the box sends one note per
  // fault with its own scope. The single-note shape still works.
  const key = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const already = new Set((run.guidance ?? []).map((g) => key(g.note)));
  const seen = new Set<string>();
  const incoming = (
    body.notes?.length
      ? body.notes
      : [{ note: body.note, scope: body.scope }]
  )
    .map((n) => ({ note: (n.note ?? "").trim(), scope: n.scope }))
    .filter((n) => n.note)
    // Every retry re-sent the same suggestions, and one run reached nine
    // notes of which two were distinct. The writer reads all of them.
    .filter((n) => {
      const k = key(n.note);
      if (already.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  if (!incoming.length && (body.notes?.length || body.note)) {
    // Everything sent is already on the run. Not an error — the retry that
    // follows is still the right thing to do — but say so.
    return NextResponse.json({ ok: true, added: 0, standing: 0, guidance: run.guidance ?? [] });
  }

  if (!incoming.length) {
    return NextResponse.json(
      { error: "Write the note first — an empty one changes nothing." },
      { status: 400 }
    );
  }
  const tooLong = incoming.find((n) => n.note.length > MAX_NOTE);
  if (tooLong) {
    return NextResponse.json(
      { error: `A note is ${tooLong.note.length} characters; the limit is ${MAX_NOTE}.` },
      { status: 400 }
    );
  }

  // One timestamp per note, spaced by a millisecond, because `at` is the
  // handle DELETE uses and two notes saved together must not share one.
  const base = Date.now();
  const added: GuidanceNote[] = incoming.map((n, i) => ({
    at: new Date(base + i).toISOString(),
    stage: body.stage,
    rejection: body.rejection?.slice(0, 500) || undefined,
    note: n.note,
    alsoStanding: n.scope === "standing" || undefined,
  }));

  run.guidance = [...(run.guidance ?? []), ...added];
  run.updatedAt = new Date(base + added.length).toISOString();
  await saveRun(run);

  // Standing rules are written after the run is saved: a failure here leaves
  // the run correct and the house rule missing, which is recoverable. The
  // other order loses the note that just got the article moving.
  let standingCount = 0;
  for (const n of added) {
    if (!n.alsoStanding) continue;
    await addFeedback(ref, {
      source: `Editor, from a rejection on "${run.brief.title}"`,
      rule: n.note,
    });
    standingCount++;
  }

  return NextResponse.json({
    ok: true,
    added: added.length,
    standing: standingCount,
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
