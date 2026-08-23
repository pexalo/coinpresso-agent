import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { renderHtml, renderMarkdown, renderPlainText } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  // Ownership is asserted in the lookup — a run id from another client reads as
  // not found rather than leaking across tenants.
  const run = await getRun(id, ref);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({
    ...run,
    rendered: run.draft
      ? {
          plain: renderPlainText(run),
          markdown: renderMarkdown(run),
          html: renderHtml(run),
        }
      : null,
  });
}
