import { NextResponse } from "next/server";
import { getRun, saveRun } from "@/lib/store";
import { exportBlogRun } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload a queued blog draft to Drive as a Google Doc.
 *
 * Pressable at any point after the draft exists — before review, during, after.
 * It creates a new Doc every time rather than overwriting the last one, because
 * a client who has started commenting on a Doc should not have it rewritten
 * underneath them. The run remembers the most recent link.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const run = await getRun(id, ref);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (!run.draft) {
    return NextResponse.json(
      { error: "This run has no draft to upload yet." },
      { status: 409 }
    );
  }

  try {
    const result = await exportBlogRun(run);
    if (result.docUrl) {
      run.docUrl = result.docUrl;
      run.updatedAt = new Date().toISOString();
      await saveRun(run);
    }
    return NextResponse.json(result, { status: result.docUrl ? 200 : 409 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[export-doc]", message);
    // Deliberately NOT a 5xx. Railway's edge replaces any 5xx body with its own
    // "Bad gateway" page, which swallows the Google error text and leaves the
    // operator staring at a generic proxy error. 424 travels intact.
    return NextResponse.json({ error: message }, { status: 424 });
  }
}
