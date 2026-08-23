import { NextResponse } from "next/server";
import { getRun, saveRun } from "@/lib/store";
import { exportRun } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const run = await getRun(id, ref);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (!run.draft) {
    return NextResponse.json(
      { error: "This run has no draft to approve" },
      { status: 409 }
    );
  }

  let approvedBy = "unknown";
  try {
    const body = (await req.json()) as { approvedBy?: string };
    if (body.approvedBy) approvedBy = body.approvedBy;
  } catch {
    // No body is fine.
  }

  // Approval records who took editorial responsibility. Same principle as the
  // byline requirement in the content guardrails — and it is what you produce if
  // anyone later disputes that a piece was signed off. Wire this to the session
  // user when HQ auth is in place.
  run.status = "approved";
  run.approvedAt = new Date().toISOString();
  run.approvedBy = approvedBy;

  let result;
  try {
    result = await exportRun(run);
    if (result.docUrl) run.docUrl = result.docUrl;
  } catch (e) {
    await saveRun(run);
    return NextResponse.json(
      {
        approved: true,
        docUrl: null,
        sheetUpdated: false,
        exportError: e instanceof Error ? e.message : String(e),
      },
      { status: 200 }
    );
  }

  await saveRun(run);
  return NextResponse.json({ approved: true, ...result });
}
